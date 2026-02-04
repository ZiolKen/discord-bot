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
const crypto = require('crypto');
require('dotenv').config();

const { all: commands, buildSlashJSON, findCommand } = require('./commands/_registry');
const { getGuildSettings } = require('./services/guildSettings');
const { handleAutoMod } = require('./services/automod');
const { addXp } = require('./services/leveling');
const { lockDueReminders, completeReminder, failReminder } = require('./services/reminders');
const { touchUser, startUsageLoops, getCachedUserCounts, refreshUserCounts } = require('./services/usage');

if (!process.env.TOKEN || !process.env.CLIENT_ID) {
  console.error('❌ Missing TOKEN or CLIENT_ID in environment variables.');
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

const STATUS_URL = process.env.STATUS_URL || '';
const INVITE_PERMISSIONS = String(process.env.INVITE_PERMISSIONS || '0');
const REGISTER_COMMANDS = String(process.env.REGISTER_COMMANDS || '').toLowerCase() === 'true';
const STATUS_API_KEY = process.env.STATUS_API_KEY || '';
const ENABLE_CORS = String(process.env.ENABLE_CORS || '').toLowerCase() === 'true';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '';
const LOG_PING = String(process.env.LOG_PING || '').toLowerCase() === 'true';

function uptime() {
  const ms = Date.now() - botStartTime;
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}h ${m}m ${s}s`;
}
 
const services = { api: 'online', gateway: 'offline', commands: 'online' };
const incidents = [];
function now() { return new Date().toISOString(); }
function createIncident(service, title) {
  const active = incidents.find(i => i.service === service && !i.resolvedAt);
  if (active) return;
  incidents.push({
    id: crypto.randomUUID(),
    service,
    title,
    status: 'investigating',
    startedAt: now(),
    resolvedAt: null
  });
}
function resolveIncident(service) {
  const incident = incidents.slice().reverse().find(i => i.service === service && !i.resolvedAt);
  if (!incident) return;
  incident.status = 'resolved';
  incident.resolvedAt = now();
}

process.on('unhandledRejection', err => console.error('UNHANDLED REJECTION:', err));
process.on('uncaughtException', err => console.error('UNCAUGHT EXCEPTION:', err));

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

const snipeCache = new Map();
const afkMap = new Map();

function inviteUrl() {
  const id = encodeURIComponent(process.env.CLIENT_ID);
  const perms = encodeURIComponent(INVITE_PERMISSIONS);
  return `https://discord.com/oauth2/authorize?client_id=${id}&scope=bot%20applications.commands&permissions=${perms}`;
}

function landingPage() {
  const statusLink = STATUS_URL ? `<a class="pill" href="${STATUS_URL}" target="_blank" rel="noreferrer">Full status</a>` : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#0b1220" />
  <title>Discord Bot</title>
  <style>
    :root{--bg:#070a12;--card:#0b1220;--muted:#9aa4b2;--text:#e6edf7;--accent:#7c5cff;--ok:#22c55e;--bad:#ef4444;--warn:#f59e0b;--border:rgba(255,255,255,.08)}
    *{box-sizing:border-box}
    body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,"Apple Color Emoji","Segoe UI Emoji";background:radial-gradient(1000px 600px at 20% 10%,rgba(124,92,255,.25),transparent 60%),radial-gradient(900px 700px at 90% 30%,rgba(34,197,94,.18),transparent 55%),var(--bg);color:var(--text)}
    a{color:inherit;text-decoration:none}
    .wrap{max-width:1100px;margin:0 auto;padding:28px 20px 60px}
    .top{display:flex;align-items:center;justify-content:space-between;gap:12px}
    .brand{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:.2px}
    .dot{width:10px;height:10px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 6px rgba(124,92,255,.15)}
    .nav{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}
    .pill{padding:10px 12px;border:1px solid var(--border);border-radius:999px;background:rgba(255,255,255,.02)}
    .pill:hover{border-color:rgba(124,92,255,.6)}
    .hero{margin-top:34px;display:grid;grid-template-columns:1.25fr .75fr;gap:18px}
    .card{background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.015));border:1px solid var(--border);border-radius:18px;padding:18px}
    h1{font-size:42px;line-height:1.1;margin:0 0 10px}
    p{margin:0;color:var(--muted);line-height:1.6}
    .cta{margin-top:18px;display:flex;gap:10px;flex-wrap:wrap}
    .btn{display:inline-flex;align-items:center;gap:10px;padding:12px 14px;border-radius:12px;border:1px solid var(--border);background:rgba(255,255,255,.03);font-weight:600}
    .btn.primary{background:rgba(124,92,255,.18);border-color:rgba(124,92,255,.45)}
    .btn.primary:hover{background:rgba(124,92,255,.25)}
    .btn:hover{border-color:rgba(255,255,255,.18)}
    .grid{margin-top:18px;display:grid;grid-template-columns:repeat(12,1fr);gap:12px}
    .feat{grid-column:span 4}
    .feat h3{margin:0 0 6px;font-size:15px}
    .feat p{font-size:13px}
    .status{display:flex;flex-direction:column;gap:10px}
    .kv{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-radius:12px;border:1px solid var(--border);background:rgba(0,0,0,.15)}
    .k{color:var(--muted);font-size:12px}
    .v{font-weight:700}
    .badge{display:inline-flex;align-items:center;gap:8px;padding:10px 12px;border-radius:14px;border:1px solid var(--border);background:rgba(0,0,0,.18)}
    .bDot{width:10px;height:10px;border-radius:50%}
    .foot{margin-top:24px;color:var(--muted);font-size:12px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
    @media (max-width:900px){.hero{grid-template-columns:1fr}.feat{grid-column:span 6}}
    @media (max-width:640px){h1{font-size:34px}.feat{grid-column:span 12}}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div class="brand"><span class="dot"></span><span>Discord Bot</span></div>
      <div class="nav">
        <a class="pill" href="/status" target="_blank" rel="noreferrer">Status JSON</a>
        <a class="pill" href="/incidents" target="_blank" rel="noreferrer">Incidents</a>
        ${statusLink}
      </div>
    </div>

    <div class="hero">
      <div class="card">
        <h1>Utilities, moderation, minigames.</h1>
        <p>Fast, stable, production-ready. Interactive games with buttons, reminders, economy, and optional leveling per server.</p>
        <div class="cta">
          <a class="btn primary" href="${inviteUrl()}" target="_blank" rel="noreferrer">🚀 Invite to Discord</a>
          <a class="btn" href="https://discord.com/developers/applications" target="_blank" rel="noreferrer">🛠️ Manage App</a>
        </div>

        <div class="grid">
          <div class="card feat">
            <h3>Utilities</h3>
            <p>Ping, uptime, info, server/user tools, polls, timestamps, base64, calculator.</p>
          </div>
          <div class="card feat">
            <h3>Moderation</h3>
            <p>Warnings, mutes/timeouts, purge, logs, and clean permission checks.</p>
          </div>
          <div class="card feat">
            <h3>Minigames</h3>
            <p>Blackjack, HiLo, Mines, slots, fishing, guessing, daily/weekly rewards.</p>
          </div>
          <div class="card feat">
            <h3>Reminders</h3>
            <p>Reliable delivery with locking, retry, and cancellation support.</p>
          </div>
          <div class="card feat">
            <h3>Security</h3>
            <p>Mention-safety, sane defaults, and optional API key protection.</p>
          </div>
          <div class="card feat">
            <h3>Leveling</h3>
            <p>Off by default. Enable per server with <code>/leveling enable</code>.</p>
          </div>
        </div>
      </div>

      <div class="card status">
        <div class="badge"><span class="bDot" id="sdot" style="background:var(--warn)"></span><span id="sline">Loading status…</span></div>
        <div class="kv"><span class="k">Guilds</span><span class="v" id="sguilds">—</span></div>
        <div class="kv"><span class="k">Users</span><span class="v" id="susers">—</span></div>
        <div class="kv"><span class="k">Active (24h)</span><span class="v" id="sactive">—</span></div>
        <div class="kv"><span class="k">Ping</span><span class="v" id="sping">—</span></div>
        <div class="kv"><span class="k">Uptime</span><span class="v" id="suptime">—</span></div>
        <div class="kv"><span class="k">Updated</span><span class="v" id="supdated">—</span></div>
      </div>
    </div>

    <div class="foot">
      <span>Made to run long-term.</span>
      <span id="build">Boot: ${lastBoot}</span>
    </div>
  </div>

  <script>
    async function load() {
      try {
        const r = await fetch('/status', { cache: 'no-store' });
        const d = await r.json();
        const ok = d && d.status === 'online';
        document.getElementById('sdot').style.background = ok ? 'var(--ok)' : 'var(--bad)';
        document.getElementById('sline').textContent = ok ? 'Operational' : 'Offline';
        document.getElementById('sguilds').textContent = d.guilds ?? '—';
        document.getElementById('sping').textContent = d.ping != null ? Math.round(d.ping) + 'ms' : '—';
        document.getElementById('suptime').textContent = d.uptime ?? '—';
        document.getElementById('supdated').textContent = d.updated ? new Date(d.updated).toLocaleString() : '—';
        const u = d.users || {};
        document.getElementById('susers').textContent = u.total ?? '—';
        document.getElementById('sactive').textContent = u.active24h ?? '—';
      } catch (e) {
        document.getElementById('sdot').style.background = 'var(--bad)';
        document.getElementById('sline').textContent = 'Offline';
      }
    }
    load();
    setInterval(load, 15000);
  </script>
</body>
</html>`;
}

function hasApiKey(req) {
  if (!STATUS_API_KEY) return true;
  const key = String(req.headers['x-api-key'] || req.query.key || '');
  return key && key === STATUS_API_KEY;
}

client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.user.setActivity({ name: '/help | botstatus.vercel.app', type: ActivityType.Playing });

  if (REGISTER_COMMANDS) {
    try {
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: buildSlashJSON() });
      console.log('✅ Slash commands registered.');
    } catch (err) {
      console.error('❌ Failed to register slash commands:', err);
      services.commands = 'offline';
      createIncident('commands', 'Slash registration failed');
    }
  } else {
    console.log('ℹ️ REGISTER_COMMANDS is false, skipping slash registration.');
  }

  services.gateway = 'online';
  resolveIncident('gateway');

  startUsageLoops();
  refreshUserCounts().catch(() => {});

  if (LOG_PING) {
    setInterval(() => {
      console.log(`✅ Ping: ${client.ws.ping.toFixed(2)}ms`);
    }, 30_000).unref();
  }

  const workerId = `${HOST_PROVIDER}:${process.pid}:${crypto.randomBytes(4).toString('hex')}`;
  setInterval(async () => {
    try {
      const due = await lockDueReminders(25, workerId);
      for (const r of due) {
        try {
          const ch = await client.channels.fetch(r.channel_id).catch(() => null);
          if (!ch || !('send' in ch)) throw new Error('Channel not found');
          await ch.send({
            content: `⏰ <@${r.user_id}> Reminder: **${String(r.text).slice(0, 1500)}**`,
            allowedMentions: { users: [r.user_id], parse: [] }
          });
          await completeReminder(r.id);
        } catch (err) {
          await failReminder(r.id, err);
        }
      }
    } catch (e) {
      console.warn('Reminder scheduler error:', e);
    }
  }, 20_000).unref();
});

client.on(Events.GuildCreate, guild => {
  console.log(`✅ Joined server: ${guild.name} (${guild.id})`);
});

client.on(Events.ShardDisconnect, () => {
  services.gateway = 'offline';
  createIncident('gateway', 'Discord gateway disconnected');
});
client.on(Events.ShardResume, () => {
  services.gateway = 'online';
  resolveIncident('gateway');
});

client.on(Events.MessageDelete, (message) => {
  try {
    if (!message.guild || !message.content) return;
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
    if (interaction.user && !interaction.user.bot) touchUser(interaction.user.id, interaction.guildId || null);
  } catch {}

  if (!interaction.isChatInputCommand()) return;

  const cmd = findCommand(interaction.commandName);
  if (!cmd?.slash?.run) return;

  try {
    services.commands = 'online';
    resolveIncident('commands');
    await cmd.slash.run(interaction, { client, commands, uptime, snipeCache, afkMap });
  } catch (err) {
    console.error('❌ Slash command error:', err);
    services.commands = 'offline';
    createIncident('commands', 'Command execution failed');
    if (!interaction.replied) {
      interaction.reply({ content: '⚠️ Command error.', ephemeral: true }).catch(() => {});
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (!message.guild || message.author.bot) return;

  try { touchUser(message.author.id, message.guild.id); } catch {}

  const s = await getGuildSettings(message.guild.id).catch(() => ({ prefix: '!', leveling_enabled: false }));

  try { await handleAutoMod(message); } catch (e) { console.warn('AutoMod error:', e); }

  if (s.leveling_enabled) {
    try {
      const result = await addXp(message.guild.id, message.author.id, 15);
      if (result?.leveledUp) {
        message.channel.send(`🎉 <@${message.author.id}> leveled up to **${result.level}**!`).catch(() => {});
      }
    } catch {}
  }

  try {
    for (const [id] of message.mentions.users) {
      const key = `${message.guild.id}:${id}`;
      const afk = afkMap.get(key);
      if (afk) {
        message.reply(`💤 <@${id}> is AFK: **${afk.reason || 'AFK'}**`).catch(()=>{});
      }
    }
    const selfKey = `${message.guild.id}:${message.author.id}`;
    if (afkMap.has(selfKey)) {
      afkMap.delete(selfKey);
      message.reply('✅ Welcome back! Your AFK status has been removed.').catch(()=>{});
    }
  } catch {}

  const prefix = s.prefix || process.env.DEFAULT_PREFIX || '!';
  if (!message.content.startsWith(prefix)) return;

  const [rawName, ...args] = message.content.slice(prefix.length).trim().split(/\s+/);
  const name = (rawName || '').toLowerCase();
  if (!name) return;

  const cmd = findCommand(name);
  if (!cmd?.prefix?.run) return;

  try {
    await cmd.prefix.run(message, args, { client, commands, uptime, prefix, snipeCache, afkMap });
  } catch (err) {
    console.error('❌ Prefix command error:', err);
    message.reply('⚠️ Command error.').catch(() => {});
  }
});

const app = express();
app.disable('x-powered-by');

if (ENABLE_CORS) {
  const allow = CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean);
  app.use(cors({ origin: allow.length ? allow : true }));
}

app.get('/', (req, res) => res.status(200).type('html').send(landingPage()));

app.get('/status', async (req, res) => {
  if (!client.isReady()) {
    services.api = 'offline';
    createIncident('api', 'API unreachable');
    return res.status(503).json({ status: 'offline' });
  }
  services.api = 'online';
  resolveIncident('api');

  let users = getCachedUserCounts();
  if (users.total === null || Date.now() - users.updatedAt > 120_000) {
    await refreshUserCounts().catch(() => {});
    users = getCachedUserCounts();
  }

  res.json({
    status: 'online',
    ping: client.ws.ping,
    uptime: uptime(),
    lastBoot,
    updated: now(),
    host: HOST_PROVIDER,
    guilds: client.guilds.cache.size,
    users,
    services
  });
});

app.get('/incidents', (req, res) => {
  if (STATUS_API_KEY) {
    const key = String(req.get('x-api-key') || req.query.key || '');
    if (key !== STATUS_API_KEY) return res.status(401).json({ error: 'unauthorized' });
  }
  return res.json(incidents.slice(-50).reverse());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Express server running at http://localhost:${PORT}`);
  console.log('🔑 Logging into Discord...');
  client.login(process.env.TOKEN)
    .then(() => console.log('🔐 Login request sent to Discord'))
    .catch(err => {
      console.error('❌ Discord login failed');
      console.error(err);
    });
});
