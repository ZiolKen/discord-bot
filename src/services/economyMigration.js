const db = require('../db');
const { listItems } = require('../data/items');
const { ECONOMY_GLOBAL_GUILD_ID } = require('./economyScope');

const MIGRATION_KEY = 'economy_global_migration_v1';
const USER_COLUMNS = [
  'xp',
  'level',
  'coins',
  'daily_at',
  'weekly_at',
  'fish_at',
  'hunt_at',
  'daily_streak',
  'weekly_streak',
  'daily_best',
  'weekly_best',
  'fish_boost',
  'hunt_boost',
  'crate_boost',
  'profile_title',
  'profile_color'
];

function itemValueCaseSql() {
  const parts = ['CASE item_id'];
  for (const item of listItems()) {
    const value = Number.isInteger(item.tradeValue)
      ? item.tradeValue
      : Number.isInteger(item.sellPrice)
        ? item.sellPrice
        : Number.isInteger(item.buyPrice)
          ? item.buyPrice
          : 0;
    parts.push(`WHEN '${String(item.id).replace(/'/g, "''")}' THEN ${value}`);
  }
  parts.push('ELSE 0 END');
  return parts.join(' ');
}

function scoreOf(row) {
  const coins = BigInt(Math.max(0, Number(row.coins || 0)));
  const value = BigInt(String(row.inventory_value || 0));
  return coins + value;
}

function inventoryQtyOf(row) {
  return BigInt(String(row.inventory_qty || 0));
}

function isBetterCandidate(a, b) {
  if (!b) return true;
  const as = scoreOf(a);
  const bs = scoreOf(b);
  if (as !== bs) return as > bs;

  const aq = inventoryQtyOf(a);
  const bq = inventoryQtyOf(b);
  if (aq !== bq) return aq > bq;

  const ac = Number(a.coins || 0);
  const bc = Number(b.coins || 0);
  if (ac !== bc) return ac > bc;

  const ag = String(a.guild_id || '');
  const bg = String(b.guild_id || '');
  if (ag === ECONOMY_GLOBAL_GUILD_ID && bg !== ECONOMY_GLOBAL_GUILD_ID) return true;
  if (bg === ECONOMY_GLOBAL_GUILD_ID && ag !== ECONOMY_GLOBAL_GUILD_ID) return false;

  return ag.localeCompare(bg) < 0;
}

async function ensureMetaTable(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS bot_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
}

async function hasRun(pool) {
  await ensureMetaTable(pool);
  const { rows } = await pool.query('SELECT value FROM bot_meta WHERE key=$1 LIMIT 1', [MIGRATION_KEY]);
  return Boolean(rows.length);
}

async function markRun(pool, summary) {
  await ensureMetaTable(pool);
  await pool.query(
    `INSERT INTO bot_meta (key, value, updated_at)
     VALUES ($1,$2,now())
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
    [MIGRATION_KEY, JSON.stringify(summary)]
  );
}

async function readCandidates(shard) {
  const valueCase = itemValueCaseSql();
  const sql = `
    WITH inv AS (
      SELECT guild_id, user_id,
             COALESCE(SUM(qty::BIGINT * (${valueCase})::BIGINT), 0)::BIGINT AS inventory_value,
             COALESCE(SUM(qty::BIGINT), 0)::BIGINT AS inventory_qty
      FROM inventory
      GROUP BY guild_id, user_id
    )
    SELECT COALESCE(u.guild_id, inv.guild_id) AS guild_id,
           COALESCE(u.user_id, inv.user_id) AS user_id,
           COALESCE(u.xp, 0) AS xp,
           COALESCE(u.level, 0) AS level,
           COALESCE(u.coins, 0) AS coins,
           u.daily_at,
           u.weekly_at,
           u.fish_at,
           u.hunt_at,
           COALESCE(u.daily_streak, 0) AS daily_streak,
           COALESCE(u.weekly_streak, 0) AS weekly_streak,
           COALESCE(u.daily_best, 0) AS daily_best,
           COALESCE(u.weekly_best, 0) AS weekly_best,
           COALESCE(u.fish_boost, 0) AS fish_boost,
           COALESCE(u.hunt_boost, 0) AS hunt_boost,
           COALESCE(u.crate_boost, 0) AS crate_boost,
           u.profile_title,
           u.profile_color,
           COALESCE(inv.inventory_value, 0)::BIGINT AS inventory_value,
           COALESCE(inv.inventory_qty, 0)::BIGINT AS inventory_qty
    FROM user_stats u
    FULL OUTER JOIN inv ON inv.guild_id=u.guild_id AND inv.user_id=u.user_id  `;
  const { rows } = await shard.pool.query(sql);
  return rows.map(row => ({ ...row, shardIndex: shard.index, pool: shard.pool }));
}

async function readInventory(pool, guildId, userId) {
  const { rows } = await pool.query(
    `SELECT item_id, qty FROM inventory WHERE guild_id=$1 AND user_id=$2 AND qty > 0 ORDER BY item_id ASC`,
    [guildId, userId]
  );
  return rows;
}

async function upsertWinner(targetPool, winner, inventoryRows) {
  const client = await targetPool.connect();
  try {
    await client.query('BEGIN');

    const values = [ECONOMY_GLOBAL_GUILD_ID, winner.user_id, ...USER_COLUMNS.map(c => winner[c])];
    const placeholders = values.map((_, i) => `$${i + 1}`).join(',');
    const updates = USER_COLUMNS.map(c => `${c}=EXCLUDED.${c}`).join(', ');

    await client.query(
      `INSERT INTO user_stats (guild_id, user_id, ${USER_COLUMNS.join(', ')})
       VALUES (${placeholders})
       ON CONFLICT (guild_id,user_id) DO UPDATE SET ${updates}`,
      values
    );

    await client.query(
      `DELETE FROM inventory WHERE guild_id=$1 AND user_id=$2`,
      [ECONOMY_GLOBAL_GUILD_ID, winner.user_id]
    );

    for (const row of inventoryRows) {
      await client.query(
        `INSERT INTO inventory (guild_id, user_id, item_id, qty)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (guild_id,user_id,item_id) DO UPDATE
           SET qty=EXCLUDED.qty,
               updated_at=now()`,
        [ECONOMY_GLOBAL_GUILD_ID, winner.user_id, row.item_id, row.qty]
      );
    }

    await client.query('COMMIT');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

async function migrateLegacyEconomyToGlobal({ force = false, logger = console } = {}) {
  const targetShard = await db.resolveGuildShard(ECONOMY_GLOBAL_GUILD_ID);
  const targetPool = targetShard.pool;

  if (!force && await hasRun(targetPool)) {
    return { skipped: true, reason: 'already_migrated' };
  }

  const winners = new Map();
  for (const shard of db.shards) {
    let rows = [];
    try {
      rows = await readCandidates(shard);
    } catch (e) {
      logger.warn?.(`[Economy migration] Skipped shard ${shard.index}: ${e.message}`);
      continue;
    }

    for (const row of rows) {
      const prev = winners.get(String(row.user_id));
      if (isBetterCandidate(row, prev)) winners.set(String(row.user_id), row);
    }
  }

  let migratedUsers = 0;
  for (const winner of winners.values()) {
    const inventoryRows = await readInventory(winner.pool, winner.guild_id, winner.user_id);
    await upsertWinner(targetPool, winner, inventoryRows);
    migratedUsers += 1;
  }

  const summary = {
    users: migratedUsers,
    scope: ECONOMY_GLOBAL_GUILD_ID,
    migratedAt: new Date().toISOString()
  };
  await markRun(targetPool, summary);
  logger.log?.(`[Economy migration] Global economy ready. Users migrated: ${migratedUsers}. Scope: ${ECONOMY_GLOBAL_GUILD_ID}`);
  return summary;
}

module.exports = {
  migrateLegacyEconomyToGlobal,
  MIGRATION_KEY
};
