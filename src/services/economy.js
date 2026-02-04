const db = require('../db');

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
    `UPDATE user_stats SET coins = coins + $3
     WHERE guild_id=$1 AND user_id=$2
     RETURNING coins`,
    [guildId, userId, amount]
  );
  if (rows.length) return rows[0].coins;
  const r = await getOrCreate(guildId, userId);
  return r.coins;
}

async function setClaim(guildId, userId, field) {
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

module.exports = { getOrCreate, addCoins, setClaim, cooldownReady };
