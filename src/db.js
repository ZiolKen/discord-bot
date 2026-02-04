const { Pool } = require("pg");

function buildSSL() {
  const caRaw = process.env.AIVEN_CA_CERT;
  if (!caRaw) return { rejectUnauthorized: true };
  return { ca: caRaw.replace(/\\n/g, "\n"), rejectUnauthorized: true };
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: buildSSL(),
});

module.exports = { pool };
