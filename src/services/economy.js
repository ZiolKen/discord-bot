const db = require('../db');
const { capInt32 } = require('./casino');

const CLAIM_FIELDS = new Set(['daily_at', 'weekly_at', 'fish_at', 'hunt_at']);

function intEnv(key, def, { min = -2147483648, max = 2147483647 } = {}) {
  const raw = process.env[key];
  if (raw == null || raw === '') return def;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

const DAILY_COOLDOWN_MS = intEnv('DAILY_COOLDOWN_HOURS', 24, { min: 20, max: 48 }) * 3600_000;
const DAILY_STREAK_GRACE_MS = intEnv('DAILY_STREAK_GRACE_HOURS', 48, { min: 24, max: 120 }) * 3600_000;
const DAILY_BASE = intEnv('DAILY_BASE', 30, { min: 1, max: 1_000_000 });

const WEEKLY_COOLDOWN_MS = intEnv('WEEKLY_COOLDOWN_DAYS', 7, { min: 5, max: 14 }) * 24 * 3600_000;
const WEEKLY_STREAK_GRACE_MS = intEnv('WEEKLY_STREAK_GRACE_DAYS', 14, { min: 7, max: 28 }) * 24 * 3600_000;
const WEEKLY_BASE = intEnv('WEEKLY_BASE', 150, { min: 1, max: 10_000_000 });

function dailyBonus(streak) {
  const s = Math.max(1, Number(streak) || 1);
  const a = Math.min(6, s - 1);
  const b = Math.max(0, s - 7);
  return (a * 3) + Math.min(23, b);
}

function weeklyBonus(streak) {
  const s = Math.max(1, Number(streak) || 1);
  const a = Math.min(3, s - 1);
  const b = Math.max(0, s - 4);
  return (a * 25) + (Math.min(8, b) * 10);
}

function calcDailyGain(streak) {
  return capInt32(DAILY_BASE + dailyBonus(streak));
}

function calcWeeklyGain(streak) {
  return capInt32(WEEKLY_BASE + weeklyBonus(streak));
}

async function getOrCreate(guildId, userId) {
  const uid = String(userId);
  const { rows } = await db.queryGuild(
    guildId,
    `WITH ins AS (
       INSERT INTO user_stats (guild_id, user_id)
       VALUES ($1,$2)
       ON CONFLICT (guild_id,user_id) DO NOTHING
       RETURNING *
     )
     SELECT * FROM ins
     UNION ALL
     SELECT * FROM user_stats WHERE guild_id=$1 AND user_id=$2
     LIMIT 1`,
    [guildId, uid]
  );
  return rows[0];
}

async function addCoins(guildId, userId, amount) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Invalid add amount');

  const add = capInt32(amount);
  const { rows } = await db.queryGuild(
    guildId,
    `INSERT INTO user_stats (guild_id, user_id, coins)
     VALUES ($1,$2,$3)
     ON CONFLICT (guild_id,user_id) DO UPDATE
       SET coins = LEAST(2147483647, GREATEST(0, user_stats.coins + EXCLUDED.coins))
     RETURNING coins`,
    [guildId, userId, add]
  );
  return rows[0].coins;
}

async function claimDaily(guildId, userId) {
  return db.txGuild(guildId, async (client) => {
    await client.query(
      `INSERT INTO user_stats (guild_id, user_id)
       VALUES ($1,$2)
       ON CONFLICT (guild_id,user_id) DO NOTHING`,
      [guildId, userId]
    );

    const { rows } = await client.query(
      `SELECT coins, daily_at, daily_streak, daily_best
       FROM user_stats
       WHERE guild_id=$1 AND user_id=$2
       FOR UPDATE`,
      [guildId, userId]
    );

    const row = rows[0];
    const nowMs = Date.now();
    const lastMs = row.daily_at ? new Date(row.daily_at).getTime() : null;
    if (lastMs != null && nowMs - lastMs < DAILY_COOLDOWN_MS) {
      return {
        ok: false,
        nextAt: new Date(lastMs + DAILY_COOLDOWN_MS),
        coins: row.coins,
        streak: Number(row.daily_streak) || 0,
        best: Number(row.daily_best) || 0
      };
    }

    const prevStreak = Number(row.daily_streak) || 0;
    const streak = lastMs == null ? 1 : (nowMs - lastMs <= DAILY_STREAK_GRACE_MS ? Math.max(1, prevStreak + 1) : 1);
    const gain = calcDailyGain(streak);
    const best = Math.max(Number(row.daily_best) || 0, streak);

    const upd = await client.query(
      `UPDATE user_stats
       SET coins = LEAST(2147483647, coins + $3),
           daily_at = now(),
           daily_streak = $4,
           daily_best = $5
       WHERE guild_id=$1 AND user_id=$2
       RETURNING coins, daily_at, daily_streak, daily_best`,
      [guildId, userId, gain, streak, best]
    );

    return {
      ok: true,
      gain,
      coins: upd.rows[0].coins,
      streak: upd.rows[0].daily_streak,
      best: upd.rows[0].daily_best,
      nextAt: new Date(Date.now() + DAILY_COOLDOWN_MS)
    };
  });
}

async function claimWeekly(guildId, userId) {
  return db.txGuild(guildId, async (client) => {
    await client.query(
      `INSERT INTO user_stats (guild_id, user_id)
       VALUES ($1,$2)
       ON CONFLICT (guild_id,user_id) DO NOTHING`,
      [guildId, userId]
    );

    const { rows } = await client.query(
      `SELECT coins, weekly_at, weekly_streak, weekly_best
       FROM user_stats
       WHERE guild_id=$1 AND user_id=$2
       FOR UPDATE`,
      [guildId, userId]
    );

    const row = rows[0];
    const nowMs = Date.now();
    const lastMs = row.weekly_at ? new Date(row.weekly_at).getTime() : null;
    if (lastMs != null && nowMs - lastMs < WEEKLY_COOLDOWN_MS) {
      return {
        ok: false,
        nextAt: new Date(lastMs + WEEKLY_COOLDOWN_MS),
        coins: row.coins,
        streak: Number(row.weekly_streak) || 0,
        best: Number(row.weekly_best) || 0
      };
    }

    const prevStreak = Number(row.weekly_streak) || 0;
    const streak = lastMs == null ? 1 : (nowMs - lastMs <= WEEKLY_STREAK_GRACE_MS ? Math.max(1, prevStreak + 1) : 1);
    const gain = calcWeeklyGain(streak);
    const best = Math.max(Number(row.weekly_best) || 0, streak);

    const upd = await client.query(
      `UPDATE user_stats
       SET coins = LEAST(2147483647, coins + $3),
           weekly_at = now(),
           weekly_streak = $4,
           weekly_best = $5
       WHERE guild_id=$1 AND user_id=$2
       RETURNING coins, weekly_at, weekly_streak, weekly_best`,
      [guildId, userId, gain, streak, best]
    );

    return {
      ok: true,
      gain,
      coins: upd.rows[0].coins,
      streak: upd.rows[0].weekly_streak,
      best: upd.rows[0].weekly_best,
      nextAt: new Date(Date.now() + WEEKLY_COOLDOWN_MS)
    };
  });
}

async function trySpendCoins(guildId, userId, amount) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Invalid spend amount');

  const { rows } = await db.queryGuild(
    guildId,
    `WITH ins AS (
       INSERT INTO user_stats (guild_id, user_id)
       VALUES ($1,$2)
       ON CONFLICT (guild_id,user_id) DO NOTHING
     )
     UPDATE user_stats
     SET coins = coins - $3
     WHERE guild_id=$1 AND user_id=$2 AND coins >= $3
     RETURNING coins`,
    [guildId, userId, amount]
  );

  return rows.length ? rows[0].coins : null;
}

async function transferCoins(guildId, fromUserId, toUserId, amount) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Invalid transfer amount');
  if (String(fromUserId) === String(toUserId)) throw new Error('Invalid transfer target');

  return db.txGuild(guildId, async (client) => {
    await client.query(
      `INSERT INTO user_stats (guild_id, user_id)
       VALUES ($1,$2),($1,$3)
       ON CONFLICT (guild_id,user_id) DO NOTHING`,
      [guildId, fromUserId, toUserId]
    );

    const spent = await client.query(
      `UPDATE user_stats
       SET coins = coins - $3
       WHERE guild_id=$1 AND user_id=$2 AND coins >= $3
       RETURNING coins`,
      [guildId, fromUserId, amount]
    );

    if (!spent.rows.length) return null;

    const gained = await client.query(
      `UPDATE user_stats
       SET coins = LEAST(2147483647, coins + $3)
       WHERE guild_id=$1 AND user_id=$2
       RETURNING coins`,
      [guildId, toUserId, amount]
    );

    return { from: spent.rows[0].coins, to: gained.rows[0].coins };
  });
}

async function setClaim(guildId, userId, field) {
  if (!CLAIM_FIELDS.has(field)) throw new Error('Invalid claim field');

  await db.queryGuild(
    guildId,
    `UPDATE user_stats SET ${field} = now() WHERE guild_id=$1 AND user_id=$2`,
    [guildId, userId]
  );
}

function cooldownReady(lastDate, cooldownMs) {
  if (!lastDate) return true;
  const last = new Date(lastDate).getTime();
  return Date.now() - last >= cooldownMs;
}

module.exports = {
  getOrCreate,
  addCoins,
  trySpendCoins,
  transferCoins,
  setClaim,
  cooldownReady,
  claimDaily,
  claimWeekly,
  DAILY_COOLDOWN_MS,
  WEEKLY_COOLDOWN_MS
};
