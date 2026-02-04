const db = require('../db');

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
     WHERE user_id=$1
     ORDER BY remind_at ASC
     LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

async function popDueReminders(limit = 20) {
  const { rows } = await db.query(
    `DELETE FROM reminders
     WHERE id IN (
       SELECT id FROM reminders
       WHERE remind_at <= now()
       ORDER BY remind_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, user_id, channel_id, guild_id, remind_at, text`,
    [limit]
  );
  return rows;
}

module.exports = { createReminder, listReminders, popDueReminders };
