const {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  ActivityType,
  EmbedBuilder
} = require('discord.js');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const { all: commands, buildSlashJSON, findCommand } = require('./commands/_registry');
const { getGuildSettings } = require('./services/guildSettings');
const { handleAutoMod } = require('./services/automod');
const { addXp } = require('./services/leveling');
const { popDueReminders } = require('./services/reminders');

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
const HOST_PROVIDER = 'Render.com';

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

client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.user.setActivity({ name: 'Utilities + Minigames', type: ActivityType.Playing });

  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: buildSlashJSON() });
    console.log('✅ Slash commands registered.');
  } catch (err) {
    console.error('❌ Failed to register slash commands:', err);
    services.commands = 'offline';
    createIncident('commands', 'Slash registration failed');
  }

  services.gateway = 'online';
  resolveIncident('gateway');

  setInterval(() => {
    console.log(`✅ Ping: ${client.ws.ping.toFixed(2)}ms`);
  }, 30000);

  setInterval(async () => {
    try {
      const due = await popDueReminders(20);
      for (const r of due) {
        const ch = await client.channels.fetch(r.channel_id).catch(() => null);
        if (!ch) continue;
        ch.send({
          content: `⏰ <@${r.user_id}> Reminder: **${r.text}**`
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('Reminder scheduler error:', e);
    }
  }, 30_000);
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

  try { await handleAutoMod(message); } catch (e) { console.warn('AutoMod error:', e); }

  try {
    const result = await addXp(message.guild.id, message.author.id, 15);
    if (result?.leveledUp) {
      message.channel.send(`🎉 <@${message.author.id}> leveled up to **${result.level}**!`).catch(()=>{});
    }
  } catch {}

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

  const s = await getGuildSettings(message.guild.id);
  const prefix = s.prefix || process.env.DEFAULT_PREFIX || '!';
  if (!message.content.startsWith(prefix)) return;

  const [rawName, ...args] = message.content.slice(prefix.length).trim().split(/\s+/);
  const name = (rawName || '').toLowerCase();
  if (!name) return;

  if (name === 'snipe') {
    const sn = snipeCache.get(message.channelId);
    if (!sn) return message.reply('Nothing to snipe.');
    return message.reply(`🕵️ Last deleted message by **${sn.authorTag}**: ${sn.content}`);
  }
  if (name === 'afk') {
    const reason = args.join(' ') || 'AFK';
    afkMap.set(`${message.guild.id}:${message.author.id}`, { reason, since: Date.now() });
    return message.reply(`💤 You are now AFK: **${reason}**`);
  }

  const cmd = findCommand(name);
  if (!cmd?.prefix?.run) return;

  try {
    await cmd.prefix.run(message, args, { client, commands, uptime, prefix, snipeCache, afkMap });
  } catch (err) {
    console.error('❌ Prefix command error:', err);
    message.reply('⚠️ Command error.').catch(() => {});
  }
});

// ==== EXPRESS API ====
const app = express();
app.use(cors());

app.get('/', (req, res) => res.send('🤖 Bot is running!'));

app.get('/status', (req, res) => {
  if (!client.isReady()) {
    services.api = 'offline';
    createIncident('api', 'API unreachable');
    return res.status(503).json({ status: 'offline' });
  }
  services.api = 'online';
  resolveIncident('api');

  res.json({
    status: 'online',
    ping: client.ws.ping,
    uptime: uptime(),
    lastBoot,
    updated: now(),
    host: HOST_PROVIDER,
    guilds: client.guilds.cache.size,
    services
  });
});

app.get('/incidents', (req, res) => res.json(incidents.slice(-50).reverse()));

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
