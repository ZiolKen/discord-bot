const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildSettings, setGuildSetting } = require('../services/guildSettings');

module.exports = [
  {
    name: 'automod',
    category: 'security',
    description: 'Configure automod',
    slash: {
      data: new SlashCommandBuilder()
        .setName('automod')
        .setDescription('Configure automod (OFF by default)')
        .addSubcommand(s => s.setName('status').setDescription('Show automod status'))
        .addSubcommand(s => s
          .setName('toggle')
          .setDescription('Toggle automod module')
          .addStringOption(o => o.setName('module').setDescription('Module').setRequired(true).addChoices(
            { name: 'enabled', value: 'am_enabled' },
            { name: 'antilink', value: 'am_antilink' },
            { name: 'antispam', value: 'am_antispam' },
            { name: 'antimention', value: 'am_antimention' },
            { name: 'caps', value: 'am_caps' },
            { name: 'badwords', value: 'am_badwords' },
            { name: 'raid', value: 'am_raid' }
          )))
        .addSubcommand(s => s
          .setName('policy')
          .setDescription('Set automod policy')
          .addStringOption(o => o.setName('action').setDescription('Action').setRequired(true).addChoices(
            { name: 'delete', value: 'delete' },
            { name: 'timeout', value: 'timeout' }
          ))
          .addIntegerOption(o => o.setName('timeout_sec').setDescription('Timeout seconds (if action=timeout)').setRequired(false))
          .addIntegerOption(o => o.setName('max_mentions').setDescription('Max mentions').setRequired(false))
          .addIntegerOption(o => o.setName('caps_ratio').setDescription('Caps ratio %').setRequired(false))
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
      async run(interaction) {
        const sub = interaction.options.getSubcommand();
        if (sub === 'status') {
          const s = await getGuildSettings(interaction.guildId);
          return interaction.reply(
            `🛡️ AutoMod status\n` +
            `enabled: **${s.am_enabled}** | action: **${s.am_action}** (timeout ${s.am_timeout_sec}s)\n` +
            `antilink: **${s.am_antilink}** | antispam: **${s.am_antispam}** | antimention: **${s.am_antimention}** (max ${s.am_max_mentions})\n` +
            `caps: **${s.am_caps}** (ratio ${s.am_caps_ratio}%) | badwords: **${s.am_badwords}** | raid: **${s.am_raid}**`
          );
        }
        if (sub === 'toggle') {
          const key = interaction.options.getString('module');
          const s = await getGuildSettings(interaction.guildId);
          const next = !s[key];
          await setGuildSetting(interaction.guildId, { [key]: next });
          return interaction.reply(`✅ ${key} is now **${next}**`);
        }
        if (sub === 'policy') {
          const action = interaction.options.getString('action');
          const timeoutSec = interaction.options.getInteger('timeout_sec');
          const maxMentions = interaction.options.getInteger('max_mentions');
          const capsRatio = interaction.options.getInteger('caps_ratio');
          const patch = { am_action: action };
          if (timeoutSec != null) patch.am_timeout_sec = timeoutSec;
          if (maxMentions != null) patch.am_max_mentions = maxMentions;
          if (capsRatio != null) patch.am_caps_ratio = capsRatio;
          await setGuildSetting(interaction.guildId, patch);
          return interaction.reply(`✅ AutoMod policy updated.`);
        }
      }
    },
    prefix: {
      async run(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return message.reply('🚫 You need **Manage Server**.');
        const sub = (args[0] || '').toLowerCase();

        if (sub === 'status') {
          const s = await getGuildSettings(message.guild.id);
          return message.reply(
            `🛡️ AutoMod status\n` +
            `enabled: ${s.am_enabled} | action: ${s.am_action} (timeout ${s.am_timeout_sec}s)\n` +
            `antilink: ${s.am_antilink} | antispam: ${s.am_antispam} | antimention: ${s.am_antimention} (max ${s.am_max_mentions})\n` +
            `caps: ${s.am_caps} (ratio ${s.am_caps_ratio}%) | badwords: ${s.am_badwords} | raid: ${s.am_raid}`
          );
        }

        if (sub === 'toggle') {
          const map = {
            enabled: 'am_enabled',
            antilink: 'am_antilink',
            antispam: 'am_antispam',
            antimention: 'am_antimention',
            caps: 'am_caps',
            badwords: 'am_badwords',
            raid: 'am_raid'
          };
          const m = (args[1] || '').toLowerCase();
          const key = map[m];
          if (!key) return message.reply('Usage: `!automod toggle <enabled|antilink|antispam|antimention|caps|badwords|raid>`');
          const s = await getGuildSettings(message.guild.id);
          const next = !s[key];
          await setGuildSetting(message.guild.id, { [key]: next });
          return message.reply(`✅ ${key} is now **${next}**`);
        }

        if (sub === 'policy') {
          const action = (args[1] || '').toLowerCase();
          if (!['delete','timeout'].includes(action)) return message.reply('Usage: `!automod policy <delete|timeout> [timeoutSec]`');
          const timeoutSec = parseInt(args[2], 10);
          const patch = { am_action: action };
          if (!Number.isNaN(timeoutSec)) patch.am_timeout_sec = timeoutSec;
          await setGuildSetting(message.guild.id, patch);
          return message.reply('✅ AutoMod policy updated.');
        }

        return message.reply('Usage: `!automod status` | `!automod toggle ...` | `!automod policy ...`');
      }
    }
  }
];
