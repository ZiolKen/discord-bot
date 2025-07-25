const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');
require('dotenv').config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
let botStartTime = Date.now();

function formatUptime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}h ${m}m ${s}s`;
}

// ==== SLASH COMMANDS ====
const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check the bot latency'),
  new SlashCommandBuilder()
    .setName('info')
    .setDescription('Get information about the bot'),
  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Get information about a user')
    .addUserOption(option =>
      option.setName('target')
        .setDescription('User to get info about')
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('credit')
    .setDescription('Show bot creator and website info'),
  new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Get information about the current server')
].map(cmd => cmd.toJSON());

// ==== REGISTER COMMANDS ====
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
const isDev = process.env.NODE_ENV !== 'production';

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  try {
    const globalRoute = Routes.applicationCommands(process.env.CLIENT_ID);

    await rest.put(globalRoute, { body: commands });
    console.log('✅ Slash commands registered (GLOBAL only)');
  } catch (err) {
    console.error('❌ Error registering global commands:', err);
  }
});

// ==== INTERACTION HANDLER ====
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    const cmd = interaction.commandName;

    // === /ping ===
    if (cmd === 'ping') {
      await interaction.deferReply();

      const ping = client.ws.ping;
      const shardId = client.shard?.ids[0] ?? 0;
      const uptime = formatUptime(Date.now() - botStartTime);

      const embed = new EmbedBuilder()
        .setTitle('🏓 Pong!')
        .setColor(0x00AEFF)
        .setDescription(
          `**Latency:** ${ping.toFixed(2)}ms\n` +
          `**Shard ID:** ${shardId}\n` +
          `**Uptime:** ${uptime}`
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }

    // === /info ===
    else if (cmd === 'info') {
      await interaction.deferReply();

      const botUser = client.user;
      const uptime = formatUptime(Date.now() - botStartTime);
      const createdAt = `<t:${Math.floor(botUser.createdTimestamp / 1000)}:D>`;
      const serverCount = client.guilds.cache.size;

      const embed = new EmbedBuilder()
        .setTitle('🤖 Bot Info')
        .setColor(0x00AEFF)
        .setThumbnail(botUser.displayAvatarURL())
        .addFields(
          { name: 'Name', value: `${botUser.tag}`, inline: true },
          { name: 'ID', value: `${botUser.id}`, inline: true },
          { name: 'Created', value: `${createdAt}`, inline: true },
          { name: 'Servers', value: `${serverCount}`, inline: true },
          { name: 'Uptime', value: `${uptime}`, inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }

    // === /userinfo ===
    else if (cmd === 'userinfo') {
      await interaction.deferReply();

      const member = interaction.options.getMember('target') || interaction.member;
        if (!member) {
          return interaction.editReply({ content: '⚠️ User not found in this server.' });
        }
      const user = member.user;

      const createdAt = `<t:${Math.floor(user.createdTimestamp / 1000)}:D>`;
      const joinedAt = member.joinedAt
        ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:D>`
        : 'N/A';

      const roles = member.roles.cache
        .filter(r => r.id !== interaction.guild.id)
        .map(r => r.toString())
        .join(', ') || 'None';

      const embed = new EmbedBuilder()
        .setTitle(`ℹ️ User Info: ${user.tag}`)
        .setThumbnail(user.displayAvatarURL({ size: 1024 }))
        .setColor(member.displayHexColor || 0x00AEFF)
        .addFields(
          { name: 'Username', value: `${user.username}`, inline: true },
          { name: 'User ID', value: `${user.id}`, inline: true },
          { name: 'Account Created', value: `${createdAt}`, inline: true },
          { name: 'Joined Server', value: `${joinedAt}`, inline: true },
          { name: 'Roles', value: `${roles}`, inline: false }
        )
        .setFooter({ text: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }

    // === /credit ===
    else if (cmd === 'credit') {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('👨‍💻 Bot Developer')
            .setDescription(
              `Created by **ZiolKen**\n` +
              `[🌐 Website](https://ziolken.vercel.app)\n` +
              `[🤖 Invite Bot](https://discord.com/oauth2/authorize?client_id=${client.user.id}&scope=bot&permissions=8)`
            )
            .setColor(0x00AEFF)
            .setThumbnail(client.user.displayAvatarURL())
            .setFooter({ text: 'Thanks for using the bot!' })
            .setTimestamp()
        ]
      });
    }

    // === /serverinfo ===
    else if (cmd === 'serverinfo') {
      await interaction.deferReply();

      const guild = interaction.guild;
      const owner = await guild.fetchOwner();
      const rolesCount = guild.roles.cache.size;
      const channelsCount = guild.channels.cache.size;
      const memberCount = guild.memberCount;
      const createdAt = `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`;

      const embed = new EmbedBuilder()
        .setTitle('🏠 Server Info')
        .setColor(0x00AEFF)
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .addFields(
          { name: 'Server Name', value: `${guild.name}`, inline: true },
          { name: 'Server ID', value: `${guild.id}`, inline: true },
          { name: 'Owner', value: `<@${owner.id}>`, inline: true },
          { name: 'Members', value: `${memberCount}`, inline: true },
          { name: 'Roles', value: `${rolesCount}`, inline: true },
          { name: 'Channels', value: `${channelsCount}`, inline: true },
          { name: 'Created', value: `${createdAt}`, inline: false }
        )
        .setFooter({ text: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }

  } catch (err) {
    console.error('❌ Interaction error:', err);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: '⚠️ Something went wrong.' });
    } else {
      await interaction.reply({ content: '⚠️ Something went wrong.', ephemeral: true });
    }
  }
});

client.login(process.env.TOKEN);



const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(process.env.PORT || 3000);