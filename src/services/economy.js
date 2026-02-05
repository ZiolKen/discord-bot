const db = require('../db');

const CLAIM_FIELDS = new Set(['daily_at', 'weekly_at', 'fish_at']);

async function getOrCreate(guildId, userId) {
  const { rows } = await db.query(
    `INSERT INTO user_stats (guild_id, user_id)
     VALUES ($1,$2)
     ON CONFLICT (guild_id,user_id) DO UPDATE SET user_id=EXCLUDED.user_id
     RETURNING *`,
    [guildId, userId]
  );
  return rows[0];
}

async function addCoins(guildId, userId, amount) {
  const { rows } = await db.query(
    `INSERT INTO user_stats (guild_id, user_id, coins)
     VALUES ($1,$2,$3)
     ON CONFLICT (guild_id,user_id) DO UPDATE
       SET coins = user_stats.coins + EXCLUDED.coins
     RETURNING coins`,
    [guildId, userId, amount]
  );
  return rows[0].coins;
}

async function trySpendCoins(guildId, userId, amount) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Invalid spend amount');

  const { rows } = await db.query(
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

async function setClaim(guildId, userId, field) {
  if (!CLAIM_FIELDS.has(field)) throw new Error('Invalid claim field');

  await db.query(
    `UPDATE user_stats SET ${field} = now() WHERE guild_id=$1 AND user_id=$2`,
    [guildId, userId]
  );
}

function cooldownReady(lastDate, cooldownMs) {
  if (!lastDate) return true;
  const last = new Date(lastDate).getTime();
  return Date.now() - last >= cooldownMs;
}

module.exports = { getOrCreate, addCoins, trySpendCoins, setClaim, cooldownReady };
