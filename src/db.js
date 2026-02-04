const { Pool } = require('pg');

function buildSsl() {
  const ca = process.env.PG_CA_CERT;
  if (ca && ca.trim().length > 0) {
    return { ca, rejectUnauthorized: true };
  }
  return { rejectUnauthorized: false };
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: buildSsl(),
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
