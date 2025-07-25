const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
require('dotenv').config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
let botStartTime = Date.now();

// ========== Slash Command Setup ==========
const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check the bot latency')
    .toJSON()
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('Slash command registered!');
  } catch (error) {
    console.error(error);
  }
});

// ========== Slash Command Handler ==========
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.deferReply();
    await interaction.editReply({ embeds: [embed] });
    
    const ping = client.ws.ping;
    const clusterId = Math.floor(Math.random() * 1000);
    const shardId = Math.floor(Math.random() * 10000);
    const nodeName = `Node${Math.floor(Math.random() * 5) + 1}.ziol-prod.local`;

    // Tính uptime
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

    await interaction.reply({ embeds: [embed] });
  }
});

client.login(process.env.TOKEN);