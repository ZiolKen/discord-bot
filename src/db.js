import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    ca: process.env.AIVEN_CA_CERT?.replace(/\\n/g, "\n"),
    rejectUnauthorized: true,
  },
});
