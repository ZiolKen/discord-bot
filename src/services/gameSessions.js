const crypto = require('crypto');

const sessions = new Map();
const MAX_SESSIONS = 500;
const DEFAULT_TTL_MS = 3 * 60_000;

function randomId() {
  return crypto.randomBytes(8).toString('hex');
}

function createSession(data) {
  if (sessions.size >= MAX_SESSIONS) {
    let oldestId = null;
    let oldestExp = Infinity;
    for (const [id, s] of sessions) {
      if (s.expiresAt < oldestExp) {
        oldestExp = s.expiresAt;
        oldestId = id;
      }
    }
    if (oldestId) sessions.delete(oldestId);
  }

  const id = randomId();
  sessions.set(id, {
    id,
    type: data.type,
    ownerId: data.ownerId,
    allowUsers: data.allowUsers || null,
    allowAll: Boolean(data.allowAll),
    guildId: data.guildId,
    channelId: data.channelId,
    messageId: data.messageId || null,
    state: data.state,
    onAction: data.onAction,
    expiresAt: Date.now() + (data.ttlMs || DEFAULT_TTL_MS)
  });
  return id;
}

function endSession(sessionId) {
  sessions.delete(sessionId);
}

function isAllowed(session, userId) {
  if (session.allowAll) return true;
  if (userId === session.ownerId) return true;
  if (session.allowUsers && session.allowUsers.has(userId)) return true;
  return false;
}

async function handleButton(interaction) {
  if (!interaction.isButton()) return false;
  const raw = String(interaction.customId || '');
  if (!raw.startsWith('g:')) return false;

  const parts = raw.split(':');
  const sessionId = parts[1];
  const action = parts[2] || '';
  const s = sessions.get(sessionId);

  if (!s) {
    await interaction.reply({ content: 'This interaction has expired.', ephemeral: true }).catch(() => {});
    return true;
  }

  if (Date.now() > s.expiresAt) {
    sessions.delete(sessionId);
    await interaction.reply({ content: 'This interaction has expired.', ephemeral: true }).catch(() => {});
    return true;
  }

  if (!isAllowed(s, interaction.user.id)) {
    await interaction.reply({ content: 'You are not allowed to use this.', ephemeral: true }).catch(() => {});
    return true;
  }

  try {
    s.expiresAt = Date.now() + DEFAULT_TTL_MS;
    await s.onAction(interaction, action, s);
  } catch {
    await interaction.reply({ content: 'Interaction error.', ephemeral: true }).catch(() => {});
  }

  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now > s.expiresAt) sessions.delete(id);
  }
}, 30_000).unref();

module.exports = { createSession, endSession, handleButton };
