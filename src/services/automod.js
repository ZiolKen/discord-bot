const { getGuildSettings } = require('./guildSettings');

const spamMap = new Map();

function isUrl(s) {
  return /(https?:\/\/|discord\.gg\/|www\.)/i.test(s);
}

function capsRatio(text) {
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 8) return 0;
  const caps = letters.replace(/[^A-Z]/g, '').length;
  return Math.floor((caps / letters.length) * 100);
}

function addSpam(userId) {
  const now = Date.now();
  const arr = spamMap.get(userId) || [];
  arr.push(now);
  const filtered = arr.filter(t => now - t < 7000);
  spamMap.set(userId, filtered);
  return filtered.length;
}

async function handleAutoMod(message) {
  if (!message.guild || message.author.bot) return;

  const s = await getGuildSettings(message.guild.id);
  if (!s.am_enabled) return;

  const member = message.member;
  if (member?.permissions?.has('Administrator')) return;

  const content = message.content || '';
  let triggered = false;
  let reason = '';

  if (!triggered && s.am_antilink && isUrl(content)) {
    triggered = true; reason = 'AntiLink';
  }

  if (!triggered && s.am_caps) {
    const ratio = capsRatio(content);
    if (ratio >= s.am_caps_ratio) {
      triggered = true; reason = `Caps (${ratio}%)`;
    }
  }

  if (!triggered && s.am_antimention) {
    const mentions = message.mentions.users.size + message.mentions.roles.size;
    if (mentions >= s.am_max_mentions) {
      triggered = true; reason = `Mass mentions (${mentions})`;
    }
  }

  if (!triggered && s.am_antispam) {
    const c = addSpam(message.author.id);
    if (c >= 6) {
      triggered = true; reason = `Spam (${c}/7s)`;
    }
  }

  if (!triggered && s.am_badwords) {
    const bad = ['free nitro', 'steam gift', 'dm me', 'scam'];
    const lower = content.toLowerCase();
    if (bad.some(w => lower.includes(w))) {
      triggered = true; reason = 'Bad words';
    }
  }

  if (!triggered) return;

  try { await message.delete().catch(() => {}); } catch {}

  if (s.am_action === 'timeout' && member?.moderatable) {
    const ms = (s.am_timeout_sec || 300) * 1000;
    await member.timeout(ms, `AutoMod: ${reason}`).catch(() => {});
  }

  await message.channel.send({
    content: `🛡️ AutoMod triggered: **${reason}** — <@${message.author.id}>`,
    allowedMentions: { users: [message.author.id] }
  }).catch(() => {});
}

module.exports = { handleAutoMod };
