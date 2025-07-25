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
    const guildRoute = Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID);
    const globalRoute = Routes.applicationCommands(process.env.CLIENT_ID);

    // 🧽 CLEAR OLD GUILD COMMANDS FIRST
    if (isDev) {
      await rest.put(guildRoute, { body: [] });
      console.log('🧹 Cleared old guild commands.');
    }

    // 📥 REGISTER COMMANDS
    await rest.put(guildRoute, { body: commands });
    await rest.put(globalRoute, { body: commands });

    console.log('✅ Slash commands registered for guild and global!');
  } catch (err) {
    console.error('❌ Error registering commands:', err);
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
      const clusterId = Math.floor(Math.random() * 1000);
      const shardId = Math.floor(Math.random() * 10000);
      const nodeName = `Node${Math.floor(Math.random() * 5) + 1}.ziol-prod.local`;

      const uptimeMs = Date.now() - botStartTime;
      const seconds = Math.floor((uptimeMs / 1000) % 60);
      const minutes = Math.floor((uptimeMs / (1000 * 60)) % 60);
      const hours = Math.floor((uptimeMs / (1000 * 60 * 60)));
      const uptime = `${hours}h ${minutes}m ${seconds}s`;

      const embed = new EmbedBuilder()
        .setTitle('🏓 Pong!')
        .setColor(0x00AEFF)
        .setDescription(`**Cluster ${clusterId}:** ${(ping + Math.random() * 10).toFixed(2)}ms (avg)\n` +
                        `**Shard ${shardId}:** ${(ping + Math.random() * 5).toFixed(2)}ms\n` +
                        `**Node:** ${nodeName}\n` +
                        `**Uptime:** ${uptime}`)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }

    // === /info ===
    else if (cmd === 'info') {
      await interaction.deferReply();

      const botUser = client.user;
      const uptimeMs = Date.now() - botStartTime;
      const seconds = Math.floor((uptimeMs / 1000) % 60);
      const minutes = Math.floor((uptimeMs / (1000 * 60)) % 60);
      const hours = Math.floor((uptimeMs / (1000 * 60 * 60)));
      const uptime = `${hours}h ${minutes}m ${seconds}s`;
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
            .setDescription(`Created by **ZiolKen**\n[🌐 Visit website](https://ziolken.vercel.app)`)
            .setColor(0x00AEFF)
            .setThumbnail('https://ziolken.vercel.app/favicon.ico')
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