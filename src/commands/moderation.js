const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');
const db = require('../db');
const { getGuildSettings } = require('../services/guildSettings');

async function sendModLog(guild, embed) {
  const s = await getGuildSettings(guild.id);
  if (!s.log_channel_id) return;
  const ch = guild.channels.cache.get(s.log_channel_id);
  if (!ch) return;
  ch.send({ embeds: [embed] }).catch(() => {});
}

module.exports = [
  {
    name: 'setlog',
    category: 'moderation',
    description: 'Set moderation log channel',
    slash: {
      data: new SlashCommandBuilder()
        .setName('setlog')
        .setDescription('Set moderation log channel')
        .addChannelOption(o => o.setName('channel').setDescription('Log channel').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
      async run(interaction) {
        const ch = interaction.options.getChannel('channel');
        const { setGuildSetting } = require('../services/guildSettings');
        await setGuildSetting(interaction.guildId, { log_channel_id: ch.id });
        return interaction.reply(`✅ Mod log channel set to ${ch}`);
      }
    },
    prefix: {
      async run(message) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return message.reply('🚫 You need **Manage Server**.');
        const ch = message.mentions.channels.first();
        if (!ch) return message.reply('Usage: `!setlog #channel`');
        const { setGuildSetting } = require('../services/guildSettings');
        await setGuildSetting(message.guild.id, { log_channel_id: ch.id });
        return message.reply(`✅ Mod log channel set to ${ch}`);
      }
    }
  },

  {
    name: 'ban',
    category: 'moderation',
    description: 'Ban a user',
    slash: {
      data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a user')
        .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
      async run(interaction) {
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        await interaction.guild.members.ban(user.id, { reason }).catch(() => null);

        const embed = new EmbedBuilder()
          .setTitle('🔨 Ban')
          .setColor(0xFF0000)
          .addFields(
            { name: 'User', value: `<@${user.id}> (${user.id})`, inline: false },
            { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: false },
            { name: 'Reason', value: reason, inline: false }
          )
          .setTimestamp();
        await sendModLog(interaction.guild, embed);
        return interaction.reply(`✅ Banned <@${user.id}>.`);
      }
    },
    prefix: {
      async run(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply('🚫 You need **Ban Members**.');
        const user = message.mentions.users.first();
        if (!user) return message.reply('Usage: `!ban @user [reason]`');
        const reason = args.slice(1).join(' ') || 'No reason provided';
        await message.guild.members.ban(user.id, { reason }).catch(() => null);
        return message.reply(`✅ Banned <@${user.id}>.`);
      }
    }
  },

  {
    name: 'unban',
    category: 'moderation',
    description: 'Unban a user by ID',
    slash: {
      data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unban a user by ID')
        .addStringOption(o => o.setName('user_id').setDescription('User ID').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
      async run(interaction) {
        const id = interaction.options.getString('user_id');
        await interaction.guild.members.unban(id).catch(() => null);
        return interaction.reply(`✅ Unbanned \`${id}\`.`);
      }
    },
    prefix: {
      async run(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return message.reply('🚫 You need **Ban Members**.');
        const id = args[0];
        if (!id) return message.reply('Usage: `!unban <userId>`');
        await message.guild.members.unban(id).catch(() => null);
        return message.reply(`✅ Unbanned \`${id}\`.`);
      }
    }
  },

  {
    name: 'kick',
    category: 'moderation',
    description: 'Kick a member',
    slash: {
      data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a member')
        .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
      async run(interaction) {
        const member = await interaction.guild.members.fetch(interaction.options.getUser('user').id);
        const reason = interaction.options.getString('reason') || 'No reason provided';
        await member.kick(reason).catch(() => null);
        return interaction.reply(`✅ Kicked <@${member.id}>.`);
      }
    },
    prefix: {
      async run(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) return message.reply('🚫 You need **Kick Members**.');
        const member = message.mentions.members.first();
        if (!member) return message.reply('Usage: `!kick @user [reason]`');
        const reason = args.slice(1).join(' ') || 'No reason provided';
        await member.kick(reason).catch(() => null);
        return message.reply(`✅ Kicked <@${member.id}>.`);
      }
    }
  },

  {
    name: 'timeout',
    category: 'moderation',
    description: 'Timeout a member',
    slash: {
      data: new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Timeout a member')
        .addUserOption(o => o.setName('user').setDescription('Target member').setRequired(true))
        .addIntegerOption(o => o.setName('seconds').setDescription('Seconds').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
      async run(interaction) {
        const member = await interaction.guild.members.fetch(interaction.options.getUser('user').id);
        const sec = interaction.options.getInteger('seconds');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        await member.timeout(sec * 1000, reason).catch(() => null);
        return interaction.reply(`✅ Timed out <@${member.id}> for **${sec}s**.`);
      }
    },
    prefix: {
      async run(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('🚫 You need **Moderate Members**.');
        const member = message.mentions.members.first();
        const sec = parseInt(args[1], 10);
        if (!member || !sec) return message.reply('Usage: `!timeout @user <seconds> [reason]`');
        const reason = args.slice(2).join(' ') || 'No reason provided';
        await member.timeout(sec * 1000, reason).catch(() => null);
        return message.reply(`✅ Timed out <@${member.id}> for **${sec}s**.`);
      }
    }
  },

  {
    name: 'untimeout',
    category: 'moderation',
    description: 'Remove a timeout',
    slash: {
      data: new SlashCommandBuilder()
        .setName('untimeout')
        .setDescription('Remove a timeout')
        .addUserOption(o => o.setName('user').setDescription('Target member').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
      async run(interaction) {
        const member = await interaction.guild.members.fetch(interaction.options.getUser('user').id);
        await member.timeout(null).catch(() => null);
        return interaction.reply(`✅ Timeout cleared for <@${member.id}>.`);
      }
    },
    prefix: {
      async run(message) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('🚫 You need **Moderate Members**.');
        const member = message.mentions.members.first();
        if (!member) return message.reply('Usage: `!untimeout @user`');
        await member.timeout(null).catch(() => null);
        return message.reply(`✅ Timeout cleared for <@${member.id}>.`);
      }
    }
  },

  {
    name: 'purge',
    aliases: ['clear'],
    category: 'moderation',
    description: 'Delete messages',
    slash: {
      data: new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Delete messages (1-100)')
        .addIntegerOption(o => o.setName('amount').setDescription('1-100').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      async run(interaction) {
        const amount = interaction.options.getInteger('amount');
        if (amount < 1 || amount > 100) return interaction.reply({ content: 'Amount must be 1-100.', ephemeral: true });
        await interaction.channel.bulkDelete(amount, true).catch(() => null);
        return interaction.reply({ content: `🧹 Deleted ${amount} messages.`, ephemeral: true });
      }
    },
    prefix: {
      async run(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return message.reply('🚫 You need **Manage Messages**.');
        const amount = parseInt(args[0], 10);
        if (!amount || amount < 1 || amount > 100) return message.reply('Usage: `!purge 1-100`');
        await message.channel.bulkDelete(amount, true).catch(() => null);
        return message.reply(`🧹 Deleted ${amount} messages.`);
      }
    }
  },

  {
    name: 'slowmode',
    category: 'moderation',
    description: 'Set slowmode in seconds',
    slash: {
      data: new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('Set channel slowmode (seconds)')
        .addIntegerOption(o => o.setName('seconds').setDescription('0-21600').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
      async run(interaction) {
        const sec = interaction.options.getInteger('seconds');
        if (sec < 0 || sec > 21600) return interaction.reply({ content: 'Seconds must be 0-21600.', ephemeral: true });
        await interaction.channel.setRateLimitPerUser(sec).catch(()=>null);
        return interaction.reply(`✅ Slowmode set to **${sec}s**.`);
      }
    },
    prefix: {
      async run(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply('🚫 You need **Manage Channels**.');
        const sec = parseInt(args[0], 10);
        if (Number.isNaN(sec) || sec < 0 || sec > 21600) return message.reply('Usage: `!slowmode <0-21600>`');
        await message.channel.setRateLimitPerUser(sec).catch(()=>null);
        return message.reply(`✅ Slowmode set to **${sec}s**.`);
      }
    }
  },

  {
    name: 'lock',
    category: 'moderation',
    description: 'Lock the current channel',
    slash: {
      data: new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Lock the current channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
      async run(interaction) {
        const ch = interaction.channel;
        await ch.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false }).catch(()=>null);
        return interaction.reply('🔒 Channel locked.');
      }
    },
    prefix: {
      async run(message) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply('🚫 You need **Manage Channels**.');
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false }).catch(()=>null);
        return message.reply('🔒 Channel locked.');
      }
    }
  },

  {
    name: 'unlock',
    category: 'moderation',
    description: 'Unlock the current channel',
    slash: {
      data: new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Unlock the current channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
      async run(interaction) {
        const ch = interaction.channel;
        await ch.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null }).catch(()=>null);
        return interaction.reply('🔓 Channel unlocked.');
      }
    },
    prefix: {
      async run(message) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply('🚫 You need **Manage Channels**.');
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null }).catch(()=>null);
        return message.reply('🔓 Channel unlocked.');
      }
    }
  },

  {
    name: 'warn',
    category: 'moderation',
    description: 'Warn a user',
    slash: {
      data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a user')
        .addUserOption(o => o.setName('user').setDescription('Target').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
      async run(interaction) {
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || null;
        await db.query(
          `INSERT INTO warns (guild_id, user_id, mod_id, reason) VALUES ($1,$2,$3,$4)`,
          [interaction.guildId, user.id, interaction.user.id, reason]
        );
        return interaction.reply(`⚠️ Warned <@${user.id}>${reason ? ` — ${reason}` : ''}`);
      }
    },
    prefix: {
      async run(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('🚫 You need **Moderate Members**.');
        const user = message.mentions.users.first();
        if (!user) return message.reply('Usage: `!warn @user [reason]`');
        const reason = args.slice(1).join(' ') || null;
        await db.query(
          `INSERT INTO warns (guild_id, user_id, mod_id, reason) VALUES ($1,$2,$3,$4)`,
          [message.guild.id, user.id, message.author.id, reason]
        );
        return message.reply(`⚠️ Warned <@${user.id}>${reason ? ` — ${reason}` : ''}`);
      }
    }
  },

  {
    name: 'warnings',
    aliases: ['warns'],
    category: 'moderation',
    description: 'List user warnings',
    slash: {
      data: new SlashCommandBuilder()
        .setName('warnings')
        .setDescription('List warnings for a user')
        .addUserOption(o => o.setName('user').setDescription('Target').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
      async run(interaction) {
        const user = interaction.options.getUser('user');
        const { rows } = await db.query(
          `SELECT id, reason, created_at FROM warns WHERE guild_id=$1 AND user_id=$2 ORDER BY id DESC LIMIT 10`,
          [interaction.guildId, user.id]
        );
        if (!rows.length) return interaction.reply(`✅ <@${user.id}> has no warnings.`);
        const lines = rows.map(r => `#${r.id} • ${r.reason || 'No reason'} • <t:${Math.floor(new Date(r.created_at).getTime()/1000)}:R>`);
        return interaction.reply(`⚠️ Warnings for <@${user.id}>:\n${lines.join('\n')}`);
      }
    },
    prefix: {
      async run(message) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('🚫 You need **Moderate Members**.');
        const user = message.mentions.users.first();
        if (!user) return message.reply('Usage: `!warnings @user`');
        const { rows } = await db.query(
          `SELECT id, reason, created_at FROM warns WHERE guild_id=$1 AND user_id=$2 ORDER BY id DESC LIMIT 10`,
          [message.guild.id, user.id]
        );
        if (!rows.length) return message.reply(`✅ <@${user.id}> has no warnings.`);
        const lines = rows.map(r => `#${r.id} • ${r.reason || 'No reason'} • ${new Date(r.created_at).toLocaleString()}`);
        return message.reply(`⚠️ Warnings for <@${user.id}>:\n${lines.join('\n')}`);
      }
    }
  },

  {
    name: 'clearwarns',
    category: 'moderation',
    description: 'Clear warnings for a user',
    slash: {
      data: new SlashCommandBuilder()
        .setName('clearwarns')
        .setDescription('Clear warnings for a user')
        .addUserOption(o => o.setName('user').setDescription('Target').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
      async run(interaction) {
        const user = interaction.options.getUser('user');
        await db.query(`DELETE FROM warns WHERE guild_id=$1 AND user_id=$2`, [interaction.guildId, user.id]);
        return interaction.reply(`✅ Cleared warnings for <@${user.id}>.`);
      }
    },
    prefix: {
      async run(message) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('🚫 You need **Moderate Members**.');
        const user = message.mentions.users.first();
        if (!user) return message.reply('Usage: `!clearwarns @user`');
        await db.query(`DELETE FROM warns WHERE guild_id=$1 AND user_id=$2`, [message.guild.id, user.id]);
        return message.reply(`✅ Cleared warnings for <@${user.id}>.`);
      }
    }
  }
];
