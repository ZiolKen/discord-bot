const { Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs');

const DEFAULT_POOL_MAX = 5;
const GUILD_CACHE_TTL_MS = 10 * 60_000;

function env(key) {
  return process.env[key];
}

function parseBool(v) {
  const s = String(v ?? '').toLowerCase().trim();
  if (!s) return null;
  if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
  return null;
}

function isProbablyLocal(conn) {
  const s = String(conn || '');
  return /localhost|127\.0\.0\.1|\[::1\]/i.test(s);
}

function normalizeKey(base, index) {
  return [
    `${base}-${index}`,
    `${base}_${index}`,
    index === 1 ? base : null
  ].filter(Boolean);
}

function readCa(index) {
  const inlineKeys = normalizeKey('PG_CA', index).concat(normalizeKey('PG_CA_CERT', index));
  for (const k of inlineKeys) {
    const val = env(k);
    if (val) return val;
  }

  const pathKeys = normalizeKey('PG_CA_PATH', index);
  for (const k of pathKeys) {
    const p = env(k);
    if (p && fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  }

  const fallbackPath = env('PG_CA_PATH') || '/etc/secrets/ca.pem';
  if (fallbackPath && fs.existsSync(fallbackPath)) return fs.readFileSync(fallbackPath, 'utf8');

  return null;
}

function buildSsl(index, conn) {
  const modeRaw = env(`PG_SSL_MODE-${index}`) || env(`PG_SSL_MODE_${index}`) || env('PG_SSL_MODE') || 'verify-ca';
  const mode = String(modeRaw).toLowerCase().trim();
  const disable = parseBool(env(`PG_SSL_DISABLE-${index}`) || env(`PG_SSL_DISABLE_${index}`) || env('PG_SSL_DISABLE'));
  if (disable === true || mode === 'disable') return false;

  if (mode === 'auto' && isProbablyLocal(conn)) return false;

  const ca = readCa(index);
  if (!ca) {
    if (mode === 'require') return { rejectUnauthorized: false };
    const detail = isProbablyLocal(conn) ? 'For local dev you can set PG_SSL_MODE=auto or PG_SSL_DISABLE=1.' : 'Set PG_CA_PATH-N or PG_CA-N.';
    throw new Error(`[DB] Missing CA certificate for shard ${index}. ${detail}`);
  }

  const trimmed = String(ca).trim();
  if (!trimmed.includes('BEGIN CERTIFICATE') || trimmed.length < 200) {
    throw new Error(`[DB] CA certificate looks invalid for shard ${index} (len=${trimmed.length}).`);
  }

  return { ca: trimmed, rejectUnauthorized: true };
}

function discoverShardIndices() {
  const idx = new Set();

  for (const k of Object.keys(process.env)) {
    const m = k.match(/^DATABASE_URL[-_](\d+)$/);
    if (m) idx.add(parseInt(m[1], 10));
  }

  if (env('DATABASE_URL') && !idx.has(1)) idx.add(1);

  if (idx.size) return [...idx].sort((a, b) => a - b);

  return [];
}

function buildPool(index) {
  const connKeys = normalizeKey('DATABASE_URL', index);
  let conn = null;
  for (const k of connKeys) {
    const v = env(k);
    if (v) {
      conn = v;
      break;
    }
  }
  if (!conn) return null;

  const maxRaw = env(`PG_POOL_MAX-${index}`) || env(`PG_POOL_MAX_${index}`) || env('PG_POOL_MAX');
  const max = Math.max(1, Math.min(50, parseInt(maxRaw || DEFAULT_POOL_MAX, 10) || DEFAULT_POOL_MAX));

  const ssl = buildSsl(index, conn);

  const pool = new Pool({
    connectionString: conn,
    ssl,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });

  pool.on('error', (e) => {
    console.error(`[DB] Pool error (shard=${index}):`, e);
  });

  return pool;
}

const shardIndices = discoverShardIndices();
if (!shardIndices.length) {
  console.error('[DB] No database shards configured. Provide DATABASE_URL or DATABASE_URL-1 (and optional DATABASE_URL-2...).');
  process.exit(1);
}

const shards = shardIndices.map((i) => {
  const pool = buildPool(i);
  if (!pool) {
    console.error(`[DB] Missing DATABASE_URL for shard ${i}.`);
    process.exit(1);
  }
  return { index: i, pool, writeDisabled: false };
});

function classifyWriteFailure(err) {
  const code = String(err?.code || '');
  if (code === '53100') return true;
  if (code === '53200') return true;
  const msg = String(err?.message || '');
  if (/no space|disk full/i.test(msg)) return true;
  return false;
}

const guildShardCache = new Map();
const guildShardCacheTs = new Map();
const guildShardInFlight = new Map();

function guildHashIndex(guildId) {
  const h = crypto.createHash('sha256').update(String(guildId)).digest();
  const n = h.readUInt32BE(0);
  return n % shards.length;
}

async function findExistingGuildShard(guildId) {
  const start = guildHashIndex(guildId);
  for (let k = 0; k < shards.length; k++) {
    const s = shards[(start + k) % shards.length];
    try {
      const { rows } = await s.pool.query('SELECT 1 FROM guild_settings WHERE guild_id=$1 LIMIT 1', [guildId]);
      if (rows.length) return s;
    } catch {
      continue;
    }
  }
  return null;
}

async function allocateGuildShard(guildId) {
  const start = guildHashIndex(guildId);

  for (let k = 0; k < shards.length; k++) {
    const s = shards[(start + k) % shards.length];
    if (s.writeDisabled) continue;

    try {
      await s.pool.query(
        `INSERT INTO guild_settings (guild_id)
         VALUES ($1)
         ON CONFLICT (guild_id) DO NOTHING`,
        [guildId]
      );
      return s;
    } catch (e) {
      if (classifyWriteFailure(e)) {
        s.writeDisabled = true;
        continue;
      }
      throw e;
    }
  }

  throw new Error('[DB] No writable shard available for new guild.');
}

async function resolveGuildShard(guildId) {
  const gid = String(guildId || '');
  if (!gid) throw new Error('Missing guildId');

  const cached = guildShardCache.get(gid);
  const ts = guildShardCacheTs.get(gid) || 0;
  if (cached && Date.now() - ts < GUILD_CACHE_TTL_MS) return cached;

  const inflight = guildShardInFlight.get(gid);
  if (inflight) return inflight;

  const p = (async () => {
    const existing = await findExistingGuildShard(gid);
    const chosen = existing || (await allocateGuildShard(gid));
    guildShardCache.set(gid, chosen);
    guildShardCacheTs.set(gid, Date.now());
    return chosen;
  })().finally(() => {
    guildShardInFlight.delete(gid);
  });

  guildShardInFlight.set(gid, p);
  return p;
}

async function queryGuild(guildId, text, params) {
  const s = await resolveGuildShard(guildId);
  return s.pool.query(text, params);
}

async function queryGlobal(text, params) {
  return shards[0].pool.query(text, params);
}

async function txOnPool(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

async function txGuild(guildId, fn) {
  const s = await resolveGuildShard(guildId);
  return txOnPool(s.pool, fn);
}

async function txGlobal(fn) {
  return txOnPool(shards[0].pool, fn);
}

async function closeAll() {
  await Promise.allSettled(shards.map(s => s.pool.end()));
}

module.exports = {
  shards,
  queryGuild,
  queryGlobal,
  txGuild,
  txGlobal,
  resolveGuildShard,
  closeAll
};
