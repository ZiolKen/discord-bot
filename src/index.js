const {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  ActivityType
} = require('discord.js');
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const pkg = require('../package.json');
const { all: commands, buildSlashJSON, findCommand } = require('./commands/_registry');
const { getGuildSettings } = require('./services/guildSettings');
const { handleAutoMod } = require('./services/automod');
const { addXp } = require('./services/leveling');
const { popDueReminders } = require('./services/reminders');
const { listIncidents, createIncident: createIncidentDb, resolveIncident: resolveIncidentDb } = require('./services/incidents');
const { handleButton } = require('./services/gameSessions');
const { renderLandingPage } = require('./web/landing');

if (!process.env.TOKEN || !process.env.CLIENT_ID) {
  console.error('Missing TOKEN or CLIENT_ID in environment variables.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const botStartTime = Date.now();
const lastBoot = new Date().toISOString();
const HOST_PROVIDER = process.env.HOST_PROVIDER || 'Render.com';

function uptime() {
  const ms = Date.now() - botStartTime;
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}h ${m}m ${s}s`;
}

function isoNow() {
  return new Date().toISOString();
}

const services = { api: 'online', gateway: 'offline', commands: 'online' };

async function createIncident(service, title) {
  await createIncidentDb(service, title).catch(() => {});
}

async function resolveIncident(service) {
  await resolveIncidentDb(service).catch(() => {});
}

process.on('unhandledRejection', err => console.error('UNHANDLED REJECTION:', err));
process.on('uncaughtException', err => console.error('UNCAUGHT EXCEPTION:', err));

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

const snipeCache = new Map();
const afkMap = new Map();

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setActivity({ name: '/help | botstatus.vercel.app', type: ActivityType.Playing });

  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: buildSlashJSON() });
    console.log('Slash commands registered.');
  } catch (err) {
    console.error('Failed to register slash commands:', err);
    services.commands = 'offline';
    await createIncident('commands', 'Slash registration failed');
  }

  services.gateway = 'online';
  await resolveIncident('gateway');

  setInterval(() => {
    if (!client.ws) return;
    console.log(`Ping: ${client.ws.ping.toFixed(2)}ms`);
  }, 90_000);

  setInterval(async () => {
    try {
      const due = await popDueReminders(20);
      for (const r of due) {
        const ch = await client.channels.fetch(r.channel_id).catch(() => null);
        if (!ch) continue;
        ch.send({ content: `⏰ <@${r.user_id}> Reminder: **${r.text}**` }).catch(() => {});
      }
    } catch (e) {
      console.warn('Reminder scheduler error:', e);
    }
  }, 30_000);
});

client.on(Events.GuildCreate, guild => {
  console.log(`Joined server: ${guild.name} (${guild.id})`);
});

client.on(Events.ShardDisconnect, async () => {
  services.gateway = 'offline';
  await createIncident('gateway', 'Discord gateway disconnected');
});
client.on(Events.ShardResume, async () => {
  services.gateway = 'online';
  await resolveIncident('gateway');
});

client.on(Events.MessageDelete, (message) => {
  try {
    if (!message.guild) return;
    if (!message.content) return;
    if (message.author?.bot) return;
    snipeCache.set(message.channelId, {
      authorTag: message.author.tag,
      content: message.content,
      createdAt: Date.now()
    });
  } catch {}
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    const handled = await handleButton(interaction);
    if (handled) return;
  } catch {}

  if (!interaction.isChatInputCommand()) return;

  const cmd = findCommand(interaction.commandName);
  if (!cmd?.slash?.run) return;

  try {
    services.commands = 'online';
    await resolveIncident('commands');
    await cmd.slash.run(interaction, { client, commands, uptime, snipeCache, afkMap });
  } catch (err) {
    console.error('Slash command error:', err);
    services.commands = 'offline';
    await createIncident('commands', 'Command execution failed');
    if (!interaction.replied) {
      interaction.reply({ content: '⚠️ Command error.', ephemeral: true }).catch(() => {});
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (!message.guild || message.author.bot) return;

  try {
    await handleAutoMod(message);
  } catch (e) {
    console.warn('AutoMod error:', e);
  }

  let settings;
  try {
    settings = await getGuildSettings(message.guild.id);
  } catch {
    settings = { prefix: process.env.DEFAULT_PREFIX || '!', level_enabled: false };
  }

  try {
    if (settings.level_enabled) {
      const result = await addXp(message.guild.id, message.author.id, 15);
      if (result?.leveledUp) {
        message.channel.send(`🎉 <@${message.author.id}> leveled up to **${result.level}**!`).catch(() => {});
      }
    }
  } catch {}

  try {
    for (const [id] of message.mentions.users) {
      const key = `${message.guild.id}:${id}`;
      const afk = afkMap.get(key);
      if (afk) {
        message.reply(`💤 <@${id}> is AFK: **${afk.reason || 'AFK'}**`).catch(() => {});
      }
    }
    const selfKey = `${message.guild.id}:${message.author.id}`;
    if (afkMap.has(selfKey)) {
      afkMap.delete(selfKey);
      message.reply('✅ Welcome back! Your AFK status has been removed.').catch(() => {});
    }
  } catch {}

  const prefix = settings.prefix || process.env.DEFAULT_PREFIX || '!';
  if (!message.content.startsWith(prefix)) return;

  const [rawName, ...args] = message.content.slice(prefix.length).trim().split(/\s+/);
  const name = String(rawName || '').toLowerCase();
  if (!name) return;

  const cmd = findCommand(name);
  if (!cmd?.prefix?.run) return;

  try {
    await cmd.prefix.run(message, args, { client, commands, uptime, prefix, snipeCache, afkMap });
  } catch (err) {
    console.error('Prefix command error:', err);
    message.reply('⚠️ Command error.').catch(() => {});
  }
});

function computeUsers() {
  try {
    let sum = 0;
    for (const g of client.guilds.cache.values()) sum += Number(g.memberCount || 0);
    return sum;
  } catch {
    return 0;
  }
}

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
  );
  next();
}

function createRateLimiter({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const cur = hits.get(ip);
    if (!cur || now > cur.resetAt) {
      hits.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }
    cur.count += 1;
    if (cur.count > max) {
      res.status(429).json({ error: 'rate_limited' });
      return;
    }
    next();
  };
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cors({ origin: '*', methods: ['GET'], maxAge: 600 }));
app.use(securityHeaders);
app.use(createRateLimiter({ windowMs: 60_000, max: 120 }));
app.use('/assets', express.static(path.join(__dirname, '..', 'assets'), { maxAge: '7d' }));
app.use('/src/web', express.static(path.join(__dirname, '..', 'src/web'), {maxAge: '7d' }));

app.get('/', (req, res) => {
  const html = renderLandingPage({
    title: client.user?.username || 'Discord Bot',
    clientId: process.env.CLIENT_ID,
    permissions: process.env.INVITE_PERMISSIONS || '8',
    statusUrl: process.env.STATUS_URL || ''
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
});

app.get('/invite', (req, res) => {
  const perms = process.env.INVITE_PERMISSIONS || '8';
  const url = `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(process.env.CLIENT_ID)}&scope=bot%20applications.commands&permissions=${encodeURIComponent(perms)}`;
  res.redirect(302, url);
});

app.get('/health', (req, res) => {
  res.json({ ok: true, status: client.isReady() ? 'online' : 'starting', updated: isoNow() });
});

app.get('/status', async (req, res) => {
  if (!client.isReady()) {
    services.api = 'offline';
    await createIncident('api', 'API unreachable');
    return res.status(503).json({ status: 'offline' });
  }

  services.api = 'online';
  await resolveIncident('api');

  res.json({
    status: 'online',
    version: pkg.version,
    ping: client.ws.ping,
    uptime: uptime(),
    lastBoot,
    updated: isoNow(),
    host: HOST_PROVIDER,
    guilds: client.guilds.cache.size,
    users: computeUsers(),
    services
  });
});

app.get('/incidents', async (req, res) => {
  const rows = await listIncidents(30).catch(() => []);
  const out = rows.map(r => ({
    id: r.id,
    service: r.service,
    title: r.title,
    status: r.status,
    startedAt: r.started_at,
    resolvedAt: r.resolved_at
  }));
  res.json(out);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
  console.log('Logging into Discord...');
  client.login(process.env.TOKEN)
    .then(() => console.log('Login request sent to Discord'))
    .catch(async err => {
      console.error('Discord login failed');
      console.error(err);
      services.gateway = 'offline';
      await createIncident('gateway', 'Discord login failed');
    });
});