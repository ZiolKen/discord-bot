const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActivityType, EmbedBuilder, Collection, Events } = require('discord.js');
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const winston = require('winston');
require('dotenv').config();

const CONFIG = {
  PORT: process.env.PORT || 3000,
  HOST_PROVIDER: process.env.HOST_PROVIDER || 'Render.com',
  STATUS_PAGE_URL: process.env.STATUS_PAGE_URL || 'https://botstatus.vercel.app/',
  BOT_INVITE_URL: process.env.BOT_INVITE_URL || 'https://discord.com/oauth2/authorize?client_id=1398238289500307578&scope=bot&permissions=8',
  DEVELOPER_WEBSITE: process.env.DEVELOPER_WEBSITE || 'https://ziolken.vercel.app',
  ADMIN_USER_ID: process.env.ADMIN_USER_ID || '951037699320602674',
  COMMAND_COOLDOWN: 3000,
  PING_INTERVAL: 30000,
  MAX_INCIDENTS: 50,
  MAX_SERVER_LIST_LENGTH: 1900
};

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  presence: {
    activities: [{ name: CONFIG.STATUS_PAGE_URL, type: ActivityType.Watching }]
  }
});

class BotState {
  constructor() {
    this.startTime = Date.now();
    this.lastBoot = new Date().toISOString();
    this.services = { api: 'online', gateway: 'offline', commands: 'online' };
    this.incidents = [];
    this.commandCooldowns = new Collection();
  }

  get uptime() {
    return Date.now() - this.startTime;
  }

  formatUptime() {
    const totalSeconds = Math.floor(this.uptime / 1000);
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  getHostServiceStatus() {
    return (this.services.api === 'online' && this.services.gateway === 'online') ? 'operational' : 'down';
  }

  createIncident(service, title) {
    const activeIncident = this.incidents.find(i => i.service === service && !i.resolvedAt);
    if (activeIncident) return null;

    const incident = {
      id: crypto.randomUUID(),
      service,
      title,
      status: 'investigating',
      startedAt: new Date().toISOString(),
      resolvedAt: null
    };

    this.incidents.push(incident);

    if (this.incidents.length > CONFIG.MAX_INCIDENTS) {
      this.incidents = this.incidents.slice(-CONFIG.MAX_INCIDENTS);
    }

    logger.warn(`Incident created: ${service} - ${title}`);
    return incident;
  }

  resolveIncident(service) {
    const incident = this.incidents.slice().reverse().find(i => i.service === service && !i.resolvedAt);
    if (!incident) return null;

    incident.status = 'resolved';
    incident.resolvedAt = new Date().toISOString();
    logger.info(`Incident resolved: ${service}`);
    return incident;
  }

  checkCooldown(userId) {
    if (!this.commandCooldowns.has(userId)) return false;
    const expirationTime = this.commandCooldowns.get(userId) + CONFIG.COMMAND_COOLDOWN;
    if (Date.now() < expirationTime) {
      return expirationTime - Date.now();
    }
    this.commandCooldowns.delete(userId);
    return false;
  }

  setCooldown(userId) {
    this.commandCooldowns.set(userId, Date.now());
  }
}

const botState = new BotState();

class CommandHandler {
  constructor(client, state) {
    this.client = client;
    this.state = state;
  }

  async handlePing(interaction) {
    const ping = this.client.ws.ping;
    const uptime = this.state.formatUptime();

    const embed = new EmbedBuilder()
      .setTitle('〽️ Pong!')
      .setColor(0xFF00FF)
      .setDescription([
        `**Ping:** ${ping.toFixed(2)}ms`,
        `**Uptime:** ${uptime}`,
        `**Status:** [Bot Status](${CONFIG.STATUS_PAGE_URL})`
      ].join('\n'))
      .setThumbnail('https://raw.githubusercontent.com/ZiolKen/discord-bot-status/main/assets/ico.png')
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  async handleInfo(interaction) {
    const botUser = this.client.user;
    const uptime = this.state.formatUptime();
    const servers = this.client.guilds.cache.size;

    const embed = new EmbedBuilder()
      .setTitle('🤖 Bot Info')
      .setColor(0xFF00FF)
      .addFields(
        { name: 'Username', value: botUser.tag, inline: true },
        { name: 'ID', value: botUser.id, inline: true },
        { name: 'Servers', value: `${servers}`, inline: true },
        { name: 'Uptime', value: uptime, inline: true }
      )
      .setDescription(`**Status:** [Bot Status](${CONFIG.STATUS_PAGE_URL})`)
      .setThumbnail(botUser.displayAvatarURL())
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  async handleServerInfo(interaction) {
    const guild = interaction.guild;
    const owner = await guild.fetchOwner();

    const embed = new EmbedBuilder()
      .setTitle('🏠 Server Info')
      .setColor(0xFF00FF)
      .addFields(
        { name: 'Name', value: guild.name, inline: true },
        { name: 'ID', value: guild.id, inline: true },
        { name: 'Owner', value: `<@${owner.id}>`, inline: true },
        { name: 'Members', value: `${guild.memberCount}`, inline: true }
      )
      .setThumbnail(guild.iconURL({ dynamic: true }))
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  async handleUserInfo(interaction) {
    const member = interaction.options.getMember('target') || interaction.member;
    const user = member.user;
    const joined = member.joinedAt ? member.joinedAt.toISOString() : 'N/A';

    const embed = new EmbedBuilder()
      .setTitle(`ℹ️ User Info: ${user.tag}`)
      .setColor(0xFF00FF)
      .addFields(
        { name: 'Username', value: user.username, inline: true },
        { name: 'ID', value: user.id, inline: true },
        { name: 'Joined', value: joined, inline: true }
      )
      .setThumbnail(user.displayAvatarURL({ size: 1024 }))
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  async handleCredit(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('👨‍💻 Bot Developer')
      .setColor(0xFF00FF)
      .setDescription([
        `Created by **@ZiolKen**`,
        `[🌐 Website](${CONFIG.DEVELOPER_WEBSITE})`,
        `[🤖 Invite Bot](${CONFIG.BOT_INVITE_URL})`,
        `[〽️ Bot Status](${CONFIG.STATUS_PAGE_URL})`
      ].join('\n'))
      .setThumbnail(this.client.user.displayAvatarURL())
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  async handleServerList(interaction) {
    if (interaction.user.id !== CONFIG.ADMIN_USER_ID) {
      return interaction.reply({ content: '🚫 You do not have permission to use this command.', ephemeral: true });
    }

    const guilds = this.client.guilds.cache.map(
      (guild, index) => `${index + 1}. ${guild.name} (ID: ${guild.id})`
    );

    const serverListStr = guilds.join('\n');

    if (serverListStr.length > CONFIG.MAX_SERVER_LIST_LENGTH) {
      const filename = `serverlist_${Date.now()}.txt`;
      const filePath = path.join(__dirname, 'temp', filename);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, serverListStr, 'utf8');
      await interaction.reply({ content: '📄 Server list is too long:', files: [filePath] });
      setTimeout(() => fs.unlink(filePath).catch(() => {}), 5000);
    } else {
      await interaction.reply(`🤖 The bot is currently in these servers:\n${serverListStr}`);
    }
  }

  async handleCommand(interaction) {
    const cooldown = this.state.checkCooldown(interaction.user.id);
    if (cooldown) {
      return interaction.reply({
        content: `⏳ Please wait ${Math.ceil(cooldown / 1000)} seconds before using another command.`,
        ephemeral: true
      });
    }

    this.state.setCooldown(interaction.user.id);
    this.state.services.commands = 'online';
    this.state.resolveIncident('commands');

    const commandMap = {
      ping: this.handlePing.bind(this),
      info: this.handleInfo.bind(this),
      serverinfo: this.handleServerInfo.bind(this),
      userinfo: this.handleUserInfo.bind(this),
      credit: this.handleCredit.bind(this),
      serverlist: this.handleServerList.bind(this)
    };

    const handler = commandMap[interaction.commandName];
    if (handler) await handler(interaction);
  }
}

const commandHandler = new CommandHandler(client, botState);
const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency'),
  new SlashCommandBuilder()
    .setName('info')
    .setDescription('Get bot info'),
  new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Get current server info'),
  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Get info about a user')
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('User to lookup')
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('credit')
    .setDescription('Show bot creator info'),
  new SlashCommandBuilder()
    .setName('serverlist')
    .setDescription('Show all servers the bot is in')
].map(cmd => cmd.toJSON());

client.once(Events.ClientReady, async () => {
  logger.info(`Logged in as ${client.user.tag}`);
  botState.services.gateway = 'online';
  botState.resolveIncident('gateway');

  try {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    logger.info('Slash commands registered successfully');
  } catch (error) {
    logger.error('Failed to register commands:', error);
  }

  setInterval(() => {
    logger.debug(`Ping: ${client.ws.ping.toFixed(2)}ms`);
  }, CONFIG.PING_INTERVAL);
});

client.on(Events.GuildCreate, guild => {
  logger.info(`Joined new server: ${guild.name} (ID: ${guild.id})`);
});

client.on(Events.ShardDisconnect, () => {
  botState.services.gateway = 'offline';
  botState.createIncident('gateway', 'Discord Gateway disconnected');
});

client.on(Events.ShardResume, () => {
  botState.services.gateway = 'online';
  botState.resolveIncident('gateway');
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    await commandHandler.handleCommand(interaction);
  } catch (error) {
    logger.error('Command execution error:', error);
    botState.services.commands = 'offline';
    botState.createIncident('commands', 'Command execution failed');

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '⚠️ An error occurred while executing this command.',
        ephemeral: true
      });
    } else if (interaction.deferred) {
      await interaction.followUp({
        content: '⚠️ An error occurred while executing this command.',
        ephemeral: true
      });
    }
  }
});

const app = express();

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  logger.http(`${req.method} ${req.url}`);
  next();
});

app.get('/', (req, res) => {
  res.json({
    message: '🤖 Bot is running!',
    status: 'online',
    documentation: `${req.protocol}://${req.get('host')}/status`
  });
});

app.get('/status', (req, res) => {
  if (!client.isReady()) {
    botState.services.api = 'offline';
    botState.createIncident('api', 'API unreachable');
    return res.status(503).json({
      status: 'offline',
      message: 'Bot is not connected to Discord'
    });
  }

  botState.services.api = 'online';
  botState.resolveIncident('api');

  const totalUsers = client.guilds.cache.reduce(
    (acc, guild) => acc + (guild.memberCount || 0),
    0
  );

  res.json({
    status: 'online',
    ping: client.ws.ping,
    uptime: botState.formatUptime(),
    lastBoot: botState.lastBoot,
    updated: new Date().toISOString(),
    host: CONFIG.HOST_PROVIDER,
    hostService: botState.getHostServiceStatus(),
    guilds: client.guilds.cache.size,
    users: totalUsers,
    services: botState.services,
    memory: {
      rss: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)} MB`,
      heapUsed: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`
    }
  });
});

app.get('/incidents', (req, res) => {
  const limit = parseInt(req.query.limit) || CONFIG.MAX_INCIDENTS;
  const recentIncidents = botState.incidents.slice(-limit).reverse();
  res.json({
    count: recentIncidents.length,
    incidents: recentIncidents
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

app.listen(CONFIG.PORT, () => {
  logger.info(`API server running on port ${CONFIG.PORT}`);
});

client.login(process.env.TOKEN);
