const { Pool } = require('pg');
const fs = require('fs');

function isTruthy(v) {
  return ['1', 'true', 'yes', 'on'].includes(String(v || '').toLowerCase());
}

function readCaFromEnv() {
  const inline = process.env.PG_CA_CERT;
  if (inline) {
    const trimmed = inline.trim();
    const decoded = trimmed.startsWith('LS0tLS') ? Buffer.from(trimmed, 'base64').toString('utf8') : trimmed;
    if (decoded.includes('BEGIN CERTIFICATE')) return decoded;
  }

  const caPath = process.env.PG_CA_PATH || '/etc/secrets/ca.pem';
  if (fs.existsSync(caPath)) {
    const ca = fs.readFileSync(caPath, 'utf8');
    if (ca.includes('BEGIN CERTIFICATE')) return ca;
  }

  return null;
}

function buildSsl() {
  const mode = String(process.env.PG_SSL || '').toLowerCase();
  if (!mode || ['0', 'false', 'off', 'disabled', 'disable'].includes(mode)) return undefined;

  const ca = readCaFromEnv();
  const verify = ['verify', 'verify-ca', 'verify-full', 'full'].includes(mode);
  if (verify && !ca) {
    throw new Error('PG_SSL verification requested but no CA certificate was provided (PG_CA_CERT/PG_CA_PATH).');
  }

  if (!verify) return { rejectUnauthorized: false };
  return { ca, rejectUnauthorized: true };
}

if (!process.env.DATABASE_URL) {
  throw new Error('Missing DATABASE_URL in environment variables.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: buildSsl(),
  max: Number(process.env.PG_POOL_MAX || 5),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30_000),
  connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT_MS || 10_000)
});

async function query(text, params) {
  return pool.query(text, params);
}

async function withClient(fn) {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withClient, isTruthy };
