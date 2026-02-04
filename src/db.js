const { Pool } = require("pg");
const fs = require("fs");

function buildSsl() {
  const caPath = "/etc/secrets/ca.pem";

  if (!fs.existsSync(caPath)) {
    throw new Error(`Missing CA file at ${caPath}`);
  }

  const ca = fs.readFileSync(caPath, "utf8");

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
