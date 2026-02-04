const { Pool } = require("pg");
const fs = require("fs");

function buildSsl() {
  const caPath = process.env.PG_CA_PATH || "/etc/secrets/ca.pem";

  if (!fs.existsSync(caPath)) {
    throw new Error(`Missing CA file at ${caPath}`);
  }

  const ca = fs.readFileSync(caPath, "utf8");

  if (!ca.includes("BEGIN CERTIFICATE") || ca.trim().length < 200) {
    throw new Error(`CA file looks invalid (path=${caPath}, len=${ca.length})`);
  }

  console.log(`[DB] Loaded CA file: ${caPath} (len=${ca.length})`);

  return {
    ca,
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
