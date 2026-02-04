const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getGuildSettings, setGuildSetting } = require('../services/guildSettings');
const { getRank, getLeaderboard, xpForNext } = require('../services/leveling');

function isEnabled(settings) {
  return Boolean(settings?.leveling_enabled);
}

module.exports = [
  {
    name: 'leveling',
    category: 'utilities',
    description: 'Enable/disable leveling system',
    slash: {
      data: new SlashCommandBuilder()
        .setName('leveling')
        .setDescription('Configure leveling system')
        .addSubcommand(s => s.setName('status').setDescription('Show current status'))
        .addSubcommand(s => s.setName('enable').setDescription('Enable leveling').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild))
        .addSubcommand(s => s.setName('disable').setDescription('Disable leveling').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)),
      async run(interaction) {
        const sub = interaction.options.getSubcommand();
        const settings = await getGuildSettings(interaction.guildId);

        if (sub === 'status') {
          return interaction.reply({
            content: `📈 Leveling is **${isEnabled(settings) ? 'enabled' : 'disabled'}** in this server.`,
            ephemeral: true
          });
        }

        const enabled = sub === 'enable';
        await setGuildSetting(interaction.guildId, { leveling_enabled: enabled });
        return interaction.reply({
          content: `✅ Leveling has been **${enabled ? 'enabled' : 'disabled'}**.`,
          ephemeral: true
        });
      }
    }
    ,
    prefix: {
      async run(message, args) {
        const sub = String(args[0] || 'status').toLowerCase();
        const settings = await getGuildSettings(message.guild.id);

        if (sub === 'status') {
          return message.reply(`📈 Leveling is **${isEnabled(settings) ? 'enabled' : 'disabled'}** in this server.`);
        }

        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          return message.reply('🚫 You need **Manage Server** to change leveling settings.');
        }

        if (sub !== 'enable' && sub !== 'disable') {
          return message.reply('Usage: `!leveling status|enable|disable`');
        }

        const enabled = sub === 'enable';
        await setGuildSetting(message.guild.id, { leveling_enabled: enabled });
        return message.reply(`✅ Leveling has been **${enabled ? 'enabled' : 'disabled'}**.`);
      }
    }
  },
  {
    name: 'rank',
    category: 'utilities',
    description: 'Show your rank',
    slash: {
      data: new SlashCommandBuilder().setName('rank').setDescription('Show your rank'),
      async run(interaction) {
        const settings = await getGuildSettings(interaction.guildId);
        if (!isEnabled(settings)) return interaction.reply({ content: '📉 Leveling is disabled in this server.', ephemeral: true });

        const r = await getRank(interaction.guildId, interaction.user.id);
        if (!r) return interaction.reply({ content: 'No leveling data yet.', ephemeral: true });

        const need = xpForNext(r.level);
        const embed = new EmbedBuilder()
          .setTitle('📈 Rank')
          .addFields(
            { name: 'Level', value: String(r.level), inline: true },
            { name: 'XP', value: `${r.xp}/${need}`, inline: true },
            { name: 'Rank', value: `#${r.rank}`, inline: true }
          );
        return interaction.reply({ embeds: [embed] });
      }
    },
    prefix: {
      async run(message) {
        const settings = await getGuildSettings(message.guild.id);
        if (!isEnabled(settings)) return message.reply('📉 Leveling is disabled in this server.');

        const r = await getRank(message.guild.id, message.author.id);
        if (!r) return message.reply('No leveling data yet.');

        const need = xpForNext(r.level);
        return message.reply(`📈 Level **${r.level}** • XP ${r.xp}/${need} • Rank #${r.rank}`);
      }
    }
  },
  {
    name: 'levels',
    category: 'utilities',
    description: 'Level leaderboard',
    slash: {
      data: new SlashCommandBuilder().setName('levels').setDescription('Show level leaderboard'),
      async run(interaction) {
        const settings = await getGuildSettings(interaction.guildId);
        if (!isEnabled(settings)) return interaction.reply({ content: '📉 Leveling is disabled in this server.', ephemeral: true });

        const rows = await getLeaderboard(interaction.guildId, 10);
        if (!rows.length) return interaction.reply('No leaderboard data yet.');
        const lines = rows.map((r, i) => `${i + 1}. <@${r.user_id}> — Level **${r.level}** (${r.xp} xp)`);
        return interaction.reply(`🏆 Level leaderboard\n${lines.join('\n')}`);
      }
    },
    prefix: {
      async run(message) {
        const settings = await getGuildSettings(message.guild.id);
        if (!isEnabled(settings)) return message.reply('📉 Leveling is disabled in this server.');
        const rows = await getLeaderboard(message.guild.id, 10);
        if (!rows.length) return message.reply('No leaderboard data yet.');
        const lines = rows.map((r, i) => `${i + 1}. <@${r.user_id}> — Level **${r.level}** (${r.xp} xp)`);
        return message.reply(`🏆 Level leaderboard\n${lines.join('\n')}`);
      }
    }
  }
];
