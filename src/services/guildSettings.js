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
  const incoming = Object.keys(patch || {});
  if (incoming.length === 0) return getGuildSettings(guildId);

  const allowed = new Set([
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
    'leveling_enabled'
  ]);

  const keys = incoming.filter(k => allowed.has(k));
  if (keys.length !== incoming.length) {
    const bad = incoming.filter(k => !allowed.has(k));
    throw new Error(`Invalid guild setting keys: ${bad.join(', ')}`);
  }

  const cols = ['guild_id', ...keys];
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const updates = keys.map(k => `${k}=EXCLUDED.${k}`).join(', ');
  const values = [guildId, ...keys.map(k => patch[k])];

  const { rows } = await db.query(
    `INSERT INTO guild_settings (${cols.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT (guild_id) DO UPDATE SET ${updates}
     RETURNING *`,
    values
  );

  const s = rows[0];
  cache.set(guildId, s);
  meta.set(guildId, Date.now());
  return s;
}

module.exports = { getGuildSettings, setGuildSetting };
