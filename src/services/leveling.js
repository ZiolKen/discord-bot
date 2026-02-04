const db = require('../db');

const cooldown = new Map();
const COOLDOWN_MS = 45_000;

function cleanupCooldown(maxAgeMs = 6 * 60 * 60_000) {
  const now = Date.now();
  for (const [k, t] of cooldown.entries()) {
    if (now - t > maxAgeMs) cooldown.delete(k);
  }
}

function xpForNext(level) {
  return 5 * (level * level) + 50 * level + 100;
}

async function addXp(guildId, userId, amount) {
  const key = `${guildId}:${userId}`;
  const last = cooldown.get(key) || 0;
  if (Date.now() - last < COOLDOWN_MS) return null;
  cooldown.set(key, Date.now());

  const { rows } = await db.query(
    `INSERT INTO user_stats (guild_id, user_id, xp, level)
     VALUES ($1,$2,$3,0)
     ON CONFLICT (guild_id,user_id) DO UPDATE SET xp = user_stats.xp + $3
     RETURNING xp, level`,
    [guildId, userId, amount]
  );

  let { xp, level } = rows[0];
  let leveledUp = false;

  while (xp >= xpForNext(level)) {
    xp -= xpForNext(level);
    level += 1;
    leveledUp = true;
  }

  if (leveledUp) {
    await db.query(
      `UPDATE user_stats SET xp=$3, level=$4 WHERE guild_id=$1 AND user_id=$2`,
      [guildId, userId, xp, level]
    );
  }

  return { xp, level, leveledUp };
}

async function getRank(guildId, userId) {
  const { rows } = await db.query(
    `SELECT user_id, xp, level, rank FROM (
       SELECT user_id, xp, level,
              RANK() OVER (ORDER BY level DESC, xp DESC) AS rank
       FROM user_stats
       WHERE guild_id=$1
     ) t
     WHERE user_id=$2
     LIMIT 1`,
    [guildId, userId]
  );
  return rows[0] || null;
}

async function getLeaderboard(guildId, limit = 10) {
  const { rows } = await db.query(
    `SELECT user_id, xp, level
     FROM user_stats
     WHERE guild_id=$1
     ORDER BY level DESC, xp DESC
     LIMIT $2`,
    [guildId, limit]
  );
  return rows;
}

module.exports = { addXp, xpForNext, getRank, getLeaderboard, cleanupCooldown };
