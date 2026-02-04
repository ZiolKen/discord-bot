import pg from "pg";
const { Pool } = pg;

function buildSSL() {
  const caRaw = process.env.AIVEN_CA_CERT;

  if (!caRaw) {
    return { rejectUnauthorized: true };
  }

  return {
    ca: caRaw.replace(/\\n/g, "\n"),
    rejectUnauthorized: true,
  };
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: buildSSL(),

  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export async function query(text, params) {
  return pool.query(text, params);
}

export async function closeDb() {
  await pool.end();
}
