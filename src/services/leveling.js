const db = require('../db');

const cooldown = new Map();
const COOLDOWN_MS = 45_000;

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

module.exports = { addXp, xpForNext };
