const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActivityType,
  EmbedBuilder
} = require('discord.js');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const botStartTime = Date.now();

const lastBoot = new Date().toISOString();
const HOST_PROVIDER = 'Render.com';

function formatUptime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}h ${m}m ${s}s`;
}

function getHostServiceStatus() {
  if (services.api === 'online' && services.gateway === 'online') {
    return 'operational';
  }
  return 'down';
}

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'),
  new SlashCommandBuilder().setName('info').setDescription('Get bot info'),
  new SlashCommandBuilder().setName('serverinfo').setDescription('Get current server info'),
  new SlashCommandBuilder().setName('userinfo')
    .setDescription('Get info about a user')
    .addUserOption(option =>
      option.setName('target').setDescription('User to lookup').setRequired(false)),
  new SlashCommandBuilder().setName('credit').setDescription('Show bot creator info'),
  new SlashCommandBuilder()
    .setName('serverlist')
    .setDescription('Show all servers the bot is in'),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

const services = {
  api: 'online',
  gateway: 'offline',
  commands: 'online'
};

const incidents = [];

function now() {
  return new Date().toISOString();
}

function createIncident(service, title) {
  const active = incidents.find(
    i => i.service === service && !i.resolvedAt
  );
  if (active) return;

  incidents.push({
    id: crypto.randomUUID(),
    service,
    title,
    status: 'investigating',
    startedAt: now(),
    resolvedAt: null
  });

  console.log(`🚨 Incident created: ${service}`);
}

function resolveIncident(service) {
  const incident = incidents
    .slice()
    .reverse()
    .find(i => i.service === service && !i.resolvedAt);

  if (!incident) return;

  incident.status = 'resolved';
  incident.resolvedAt = now();

  console.log(`✅ Incident resolved: ${service}`);
}

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.user.setActivity({
    name: 'https://botstatus.vercel.app/',
    type: ActivityType.Watching
  });

  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
      body: commands
    });
    console.log('✅ Slash commands registered.');
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }
  
  services.gateway = 'online';
  resolveIncident('gateway');

  setInterval(() => {
    console.log(`✅ Ping: ${client.ws.ping.toFixed(2)}ms`);
  }, 30000);
});

client.on('guildCreate', guild => {
  console.log(`✅ Joined new server: ${guild.name} (ID: ${guild.id})`);
});

client.on('shardDisconnect', () => {
  services.gateway = 'offline';
  createIncident('gateway', 'Discord Gateway disconnected');
});

client.on('shardResume', () => {
  services.gateway = 'online';
  resolveIncident('gateway');
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  services.commands = 'online';
  resolveIncident('commands');
  try {
  const { commandName } = interaction;
    if (commandName === 'ping') {
      const ping = client.ws.ping;
      const uptime = formatUptime(Date.now() - botStartTime);

      const embed = new EmbedBuilder()
        .setTitle('〽️ Pong!')
        .setColor(0xFF00FF)
        .setDescription(`**Ping:** ${ping.toFixed(2)}ms\n**Uptime:** ${uptime}\n**Status:** [Bot Status](https://botstatus.vercel.app/)`)
        .setThumbnail('https://raw.githubusercontent.com/ZiolKen/discord-bot-status/main/assets/ico.png')
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'info') {
      const botUser = client.user;
      const uptime = formatUptime(Date.now() - botStartTime);
      const createdAt = `<t:${Math.floor(botUser.createdTimestamp / 1000)}:D>`;
      const servers = client.guilds.cache.size;

      const embed = new EmbedBuilder()
        .setTitle('🤖 Bot Info')
        .setColor(0xFF00FF)
        .addFields(
          { name: 'Username', value: botUser.tag, inline: true },
          { name: 'ID', value: botUser.id, inline: true },
          { name: 'Created', value: createdAt, inline: true },
          { name: 'Servers', value: `${servers}`, inline: true },
          { name: 'Uptime', value: uptime, inline: true }
        )
        .setDescription(`**Status:** [Bot Status](https://botstatus.vercel.app/)`)
        .setThumbnail(botUser.displayAvatarURL())
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'serverinfo') {
      const guild = interaction.guild;
      const owner = await guild.fetchOwner();
      const embed = new EmbedBuilder()
        .setTitle('🏠 Server Info')
        .setColor(0xFF00FF)
        .addFields(
          { name: 'Name', value: guild.name, inline: true },
          { name: 'ID', value: guild.id, inline: true },
          { name: 'Owner', value: `<@${owner.id}>`, inline: true },
          { name: 'Members', value: `${guild.memberCount}`, inline: true },
          { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true }
        )
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'userinfo') {
      const member = interaction.options.getMember('target') || interaction.member;
      const user = member.user;
      const joined = member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:D>` : 'N/A';

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

      await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'credit') {
      const embed = new EmbedBuilder()
        .setTitle('👨‍💻 Bot Developer')
        .setColor(0xFF00FF)
        .setDescription(
          `Created by **@ZiolKen**\n[🌐 Website](https://ziolken.vercel.app)\n[🤖 Invite Bot](https://discord.com/oauth2/authorize?client_id=1398238289500307578&scope=bot&permissions=8)\n[〽️ Bot Status](https://botstatus.vercel.app/)`
        )
        .setThumbnail(client.user.displayAvatarURL())
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
    
    else if (commandName === 'serverlist') {
      const userId = interaction.user.id;
      const username = interaction.user.username;
      const timestamp = new Date().toISOString();

      console.log(`[${timestamp}] ${username} (ID: ${userId}) used /serverlist`);

      if (userId !== '951037699320602674') {
        await interaction.reply({ content: '🚫 You do not have permission to use this command.', ephemeral: true });
        return;
      }

      const guilds = client.guilds.cache.map((g, i) => `${i + 1}. ${g.name} (ID: ${g.id})`);
      const serverListStr = guilds.join('\n');

      if (serverListStr.length > 1900) {
        const filename = 'serverlist.txt';
        fs.writeFileSync(filename, serverListStr, { encoding: 'utf8' });
        await interaction.reply({ content: '📄 Server list is too long, see the attached file:', files: [filename] });
        fs.unlinkSync(filename);
      } else {
        await interaction.reply(`🤖 The bot is currently in these servers:\n${serverListStr}`);
      }
    }
  } catch (err) {
    console.error('❌ Command error:', err);
    services.commands = 'offline';
    createIncident('commands', 'Command execution failed');

    if (!interaction.replied) {
      await interaction.reply({
        content: '⚠️ Command error.',
        ephemeral: true
      });
    }
  }
});

// ==== EXPRESS API ====
const app = express();
app.use(cors());

app.get('/', (req, res) => {
  res.send('🤖 Bot is running!');
});

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
  uptime: formatUptime(Date.now() - botStartTime),
  lastBoot,
  updated: now(),
  host: HOST_PROVIDER,
  hostService: getHostServiceStatus(),
  guilds: client.guilds.cache.size,
  users: client.guilds.cache.reduce(
    (a, g) => a + (g.memberCount || 0),
    0
  ),
  services
});
});

app.get('/incidents', (req, res) => {
  res.json(
    incidents
      .slice(-50)
      .reverse()
  );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Express server running at http://localhost:${PORT}`);
});

// ==== START BOT ====
if (!process.env.TOKEN || !process.env.CLIENT_ID) {
  console.error('❌ Missing TOKEN or CLIENT_ID in .env');
  process.exit(1);
}

setTimeout(() => {
  console.log('🔑 Logging into Discord...');
  client.login(process.env.TOKEN);
}, 1000);