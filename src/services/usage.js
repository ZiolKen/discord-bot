const db = require('../db');

const flushIntervalMs = Number(process.env.USAGE_FLUSH_MS || 60_000);

const users = new Map();
const pairs = new Map();
let flushing = false;

let cachedCounts = { total: null, active24h: null, updatedAt: 0 };

function touchUser(userId, guildId) {
  if (!userId) return;
  users.set(userId, true);
  if (guildId) pairs.set(`${guildId}:${userId}`, { guildId, userId });
}

async function flushUsage() {
  if (flushing) return;
  flushing = true;
  try {
    const userIds = Array.from(users.keys());
    const items = Array.from(pairs.values());
    users.clear();
    pairs.clear();
    if (userIds.length) {
      await db.query(
        `INSERT INTO bot_users (user_id, first_seen, last_seen)
         SELECT u, now(), now() FROM UNNEST($1::text[]) AS u
         ON CONFLICT (user_id) DO UPDATE SET last_seen = EXCLUDED.last_seen`,
        [userIds]
      );
    }
    if (items.length) {
      const guildIds = items.map(i => i.guildId);
      const uids = items.map(i => i.userId);
      await db.query(
        `INSERT INTO bot_user_guilds (guild_id, user_id, first_seen, last_seen)
         SELECT g, u, now(), now() FROM UNNEST($1::text[], $2::text[]) AS t(g,u)
         ON CONFLICT (guild_id, user_id) DO UPDATE SET last_seen = EXCLUDED.last_seen`,
        [guildIds, uids]
      );
    }
  } finally {
    flushing = false;
  }
}

async function refreshUserCounts() {
  const [{ rows: totalRows }, { rows: activeRows }] = await Promise.all([
    db.query(`SELECT COUNT(*)::int AS c FROM bot_users`),
    db.query(`SELECT COUNT(*)::int AS c FROM bot_users WHERE last_seen >= now() - interval '24 hours'`)
  ]);

  cachedCounts = {
    total: totalRows[0]?.c ?? 0,
    active24h: activeRows[0]?.c ?? 0,
    updatedAt: Date.now()
  };

  return cachedCounts;
}

function getCachedUserCounts() {
  return cachedCounts;
}

function startUsageLoops() {
  setInterval(() => flushUsage().catch(() => {}), flushIntervalMs).unref();
  setInterval(() => refreshUserCounts().catch(() => {}), flushIntervalMs).unref();
}

module.exports = {
  touchUser,
  flushUsage,
  refreshUserCounts,
  getCachedUserCounts,
  startUsageLoops
};
