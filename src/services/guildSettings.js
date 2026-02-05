const db = require('../db');

const cache = new Map();
const meta = new Map();
const TTL = 60_000;

const ALLOWED_KEYS = new Set([
  'prefix',
  'log_channel_id',
  'welcome_channel_id',
  'welcome_enabled',
  'autorole_id',
  'am_enabled',
  'am_antilink',
  'am_antispam',
  'am_antimention',
  'am_caps',
  'am_badwords',
  'am_raid',
  'am_action',
  'am_timeout_sec',
  'am_max_mentions',
  'am_caps_ratio',
  'am_min_acc_age_days',
  'level_enabled'
]);

function filterPatch(patch) {
  const out = {};
  for (const [k, v] of Object.entries(patch || {})) {
    if (ALLOWED_KEYS.has(k)) out[k] = v;
  }
  return out;
}

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
  const p = filterPatch(patch);
  const keys = Object.keys(p);
  if (keys.length === 0) return getGuildSettings(guildId);

  const sets = keys.map((k, i) => `${k}=$${i + 2}`).join(', ');
  const values = keys.map(k => p[k]);

  const { rows } = await db.query(
    `UPDATE guild_settings SET ${sets} WHERE guild_id=$1 RETURNING *`,
    [guildId, ...values]
  );

  cache.set(guildId, rows[0]);
  meta.set(guildId, Date.now());
  return rows[0];
}

module.exports = { getGuildSettings, setGuildSetting };
