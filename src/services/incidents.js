const crypto = require('crypto');
const db = require('../db');

async function createIncident(service, title) {
  const id = crypto.randomUUID();
  await db.query('BEGIN');
  try {
    await db.query(
      `INSERT INTO incidents (id, service, title, status, started_at)
       VALUES ($1,$2,$3,'investigating',now())
       ON CONFLICT DO NOTHING`,
      [id, service, title]
    );

    await db.query(
      `DELETE FROM incidents
       WHERE id IN (
         SELECT id FROM incidents
         ORDER BY started_at DESC
         OFFSET 30
       )`
    );

    await db.query('COMMIT');
    return id;
  } catch (e) {
    await db.query('ROLLBACK');
    if (e?.code === '23505') return null;
    throw e;
  }
}

async function resolveIncident(service) {
  await db.query(
    `UPDATE incidents
     SET status='resolved', resolved_at=now()
     WHERE id = (
       SELECT id FROM incidents
       WHERE service=$1 AND resolved_at IS NULL
       ORDER BY started_at DESC
       LIMIT 1
     )`,
    [service]
  );
}

async function listIncidents(limit = 30) {
  const { rows } = await db.query(
    `SELECT id, service, title, status, started_at, resolved_at
     FROM incidents
     ORDER BY started_at DESC
     LIMIT $1`,
    [Math.max(1, Math.min(50, limit))]
  );
  return rows;
}

module.exports = { createIncident, resolveIncident, listIncidents };
