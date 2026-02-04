const db = require('../db');

const MAX_ATTEMPTS = Number(process.env.REMINDER_MAX_ATTEMPTS || 10);
const LOCK_TIMEOUT_MS = Number(process.env.REMINDER_LOCK_TIMEOUT_MS || 2 * 60_000);

async function createReminder({ userId, channelId, guildId, remindAt, text }) {
  const { rows } = await db.query(
    `INSERT INTO reminders (user_id, channel_id, guild_id, remind_at, text)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id`,
    [userId, channelId, guildId || null, remindAt, text]
  );
  return rows[0].id;
}

async function listReminders(userId, limit = 10) {
  const { rows } = await db.query(
    `SELECT id, channel_id, guild_id, remind_at, text
     FROM reminders
     WHERE user_id=$1 AND status='pending'
     ORDER BY remind_at ASC
     LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

async function cancelReminder(userId, id) {
  const rid = Number(id);
  if (!Number.isFinite(rid)) return false;
  const { rows } = await db.query(
    `DELETE FROM reminders WHERE id=$1 AND user_id=$2 RETURNING id`,
    [rid, userId]
  );
  return rows.length > 0;
}

async function lockDueReminders(limit, workerId) {
  const lockBefore = new Date(Date.now() - LOCK_TIMEOUT_MS);
  const { rows } = await db.query(
    `WITH due AS (
       SELECT id
       FROM reminders
       WHERE status='pending'
         AND attempts < $3
         AND remind_at <= now()
         AND (locked_at IS NULL OR locked_at <= $2)
       ORDER BY remind_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE reminders r
     SET locked_at=now(),
         locked_by=$4,
         attempts=r.attempts+1,
         last_error=NULL
     WHERE r.id IN (SELECT id FROM due)
     RETURNING id, user_id, channel_id, guild_id, remind_at, text, attempts`,
    [limit, lockBefore, MAX_ATTEMPTS, workerId]
  );
  return rows;
}

async function completeReminder(id) {
  await db.query(`DELETE FROM reminders WHERE id=$1`, [id]);
}

async function failReminder(id, err) {
  const msg = String(err?.message || err || '').slice(0, 500);
  await db.query(
    `UPDATE reminders
     SET last_error=$2,
         locked_at=NULL,
         locked_by=NULL,
         status=CASE WHEN attempts >= $3 THEN 'dead' ELSE 'pending' END
     WHERE id=$1`,
    [id, msg, MAX_ATTEMPTS]
  );
}

module.exports = {
  createReminder,
  listReminders,
  cancelReminder,
  lockDueReminders,
  completeReminder,
  failReminder
};
