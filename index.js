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
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const botStartTime = Date.now();

function formatUptime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}h ${m}m ${s}s`;
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
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

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

  setInterval(() => {
    console.log(`✅ Ping: ${client.ws.ping.toFixed(2)}ms`);
  }, 30000);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  try {
    if (commandName === 'ping') {
      const ping = client.ws.ping;
      const uptime = formatUptime(Date.now() - botStartTime);

      const embed = new EmbedBuilder()
        .setTitle('〽️ Pong!')
        .setColor(0x00AEFF)
        .setDescription(`**Ping:** ${ping.toFixed(2)}ms\n**Uptime:** ${uptime}\n**Status:** [Bot Status](https://botstatus.vercel.app/)`)
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
        .setColor(0x00AEFF)
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
        .setColor(0x00AEFF)
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
        .setColor(member.displayHexColor || 0x00AEFF)
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
        .setColor(0x00AEFF)
        .setDescription(
          `Created by **@ZiolKen**\n[🌐 Website](https://ziolken.vercel.app)\n[🤖 Invite Bot](https://discord.com/oauth2/authorize?client_id=1398238289500307578&scope=bot&permissions=8)\n[〽️ Bot Status](https://botstatus.vercel.app/)`
        )
        .setThumbnail(client.user.displayAvatarURL())
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }

  } catch (err) {
    console.error('❌ Interaction error:', err);
    await interaction.reply({ content: '⚠️ Something went wrong.', ephemeral: true });
  }
});

// ==== EXPRESS API ====
const app = express();
app.use(cors());

app.get('/', (req, res) => {
  res.send('🤖 Bot is running!');
});

app.get('/status', (req, res) => {
  if (!client || !client.isReady()) {
    return res.status(503).json({ status: 'offline' });
  }

  res.json({
    status: 'online',
    ping: client.ws.ping,
    uptime: formatUptime(Date.now() - botStartTime),
    guilds: client.guilds.cache.size,
    users: client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0),
    updated: new Date().toISOString()
  });
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