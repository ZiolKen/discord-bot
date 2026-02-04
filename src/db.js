const { Pool } = require("pg");

function buildSsl() {
  const caRaw = process.env.PG_CA_CERT || process.env.AIVEN_CA_CERT;

  if (!caRaw || !caRaw.trim()) {
    throw new Error("Missing PG_CA_CERT (Aiven CA certificate).");
  }

  return {
    ca: caRaw.replace(/\\n/g, "\n"),
    rejectUnauthorized: true,
  };
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: buildSsl(),
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
