const db = require('../db');

const cache = new Map();
const meta = new Map();
const TTL = 60_000;

async function getGuildSettings(guildId) {
  const hit = cache.get(guildId);
  const t = meta.get(guildId) || 0;
  if (hit && Date.now() - t < TTL) return hit;

  const { rows } = await db.query(
    `INSERT INTO guild_settings (guild_id)
     VALUES ($1)
     ON CONFLICT (guild_id) DO UPDATE SET guild_id = EXCLUDED.guild_id
     RETURNING *`,
    [guildId]
  );
  const s = rows[0];
  cache.set(guildId, s);
  meta.set(guildId, Date.now());
  return s;
}

async function setGuildSetting(guildId, patch) {
  const keys = Object.keys(patch || {});
  if (keys.length === 0) return getGuildSettings(guildId);

  const sets = keys.map((k, i) => `${k}=$${i + 2}`).join(', ');
  const values = keys.map(k => patch[k]);

  const { rows } = await db.query(
    `UPDATE guild_settings SET ${sets} WHERE guild_id=$1 RETURNING *`,
    [guildId, ...values]
  );
  cache.set(guildId, rows[0]);
  meta.set(guildId, Date.now());
  return rows[0];
}

module.exports = { getGuildSettings, setGuildSetting };
