const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  PermissionFlagsBits
} = require('discord.js');
const { getGuildSettings, setGuildSetting } = require('../services/guildSettings');
const { parseDuration, toDiscordTs } = require('../utils/time');
const { createReminder, listReminders } = require('../services/reminders');

module.exports = [
  {
    name: 'help',
    category: 'utilities',
    description: 'Show command list',
    slash: {
      data: new SlashCommandBuilder().setName('help').setDescription('Show command list'),
      async run(interaction, ctx) {
        const s = await getGuildSettings(interaction.guildId);
        const prefix = s.prefix || '!';
        const groups = ctx.commands.reduce((acc, c) => {
          const cat = c.category || 'other';
          acc[cat] = acc[cat] || [];
          acc[cat].push(c.name);
          return acc;
        }, {});
        const embed = new EmbedBuilder()
          .setTitle('📚 Help')
          .setColor(0xFF00FF)
          .setDescription(`Prefix: \`${prefix}\` (you can use both **/** and **${prefix}**)`)
          .addFields(
            ...Object.entries(groups).sort().map(([k, v]) => ({
              name: k.toUpperCase(),
              value: v.sort().map(x => `\`${x}\``).join(' '),
              inline: false
            }))
          );
        return interaction.reply({ embeds: [embed] });
      }
    },
    prefix: {
      async run(message, args, ctx) {
        const s = await getGuildSettings(message.guild.id);
        const prefix = s.prefix || '!';
        const groups = ctx.commands.reduce((acc, c) => {
          const cat = c.category || 'other';
          acc[cat] = acc[cat] || [];
          acc[cat].push(c.name);
          return acc;
        }, {});
        const lines = Object.entries(groups).sort().map(([k, v]) => `**${k.toUpperCase()}**: ${v.sort().map(x => `\`${x}\``).join(' ')}`);
        return message.reply(`📚 **Help**\nPrefix: \`${prefix}\`\n\n${lines.join('\n')}`);
      }
    }
  },

  {
    name: 'ping',
    category: 'utilities',
    description: 'Check bot latency',
    slash: {
      data: new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'),
      async run(interaction, ctx) {
        const ping = ctx.client.ws.ping;
        return interaction.reply(`🏓 Pong! **${ping.toFixed(2)}ms** | Uptime: **${ctx.uptime()}**`);
      }
    },
    prefix: {
      async run(message, args, ctx) {
        const ping = ctx.client.ws.ping;
        return message.reply(`🏓 Pong! **${ping.toFixed(2)}ms** | Uptime: **${ctx.uptime()}**`);
      }
    }
  },

  {
    name: 'info',
    category: 'utilities',
    description: 'Bot info',
    slash: {
      data: new SlashCommandBuilder().setName('info').setDescription('Bot info'),
      async run(interaction, ctx) {
        const bot = ctx.client.user;
        const embed = new EmbedBuilder()
          .setTitle('🤖 Bot Info')
          .setColor(0xFF00FF)
          .addFields(
            { name: 'Username', value: bot.tag, inline: true },
            { name: 'ID', value: bot.id, inline: true },
            { name: 'Servers', value: String(ctx.client.guilds.cache.size), inline: true },
            { name: 'Uptime', value: ctx.uptime(), inline: true }
          )
          .setThumbnail(bot.displayAvatarURL())
          .setTimestamp();
        return interaction.reply({ embeds: [embed] });
      }
    },
    prefix: {
      async run(message, args, ctx) {
        return message.reply(`🤖 **${ctx.client.user.tag}** | Servers: **${ctx.client.guilds.cache.size}** | Uptime: **${ctx.uptime()}**`);
      }
    }
  },

  {
    name: 'uptime',
    category: 'utilities',
    description: 'Show uptime',
    slash: {
      data: new SlashCommandBuilder().setName('uptime').setDescription('Show uptime'),
      async run(interaction, ctx) {
        return interaction.reply(`⏱️ Uptime: **${ctx.uptime()}**`);
      }
    },
    prefix: {
      async run(message, args, ctx) {
        return message.reply(`⏱️ Uptime: **${ctx.uptime()}**`);
      }
    }
  },

  {
    name: 'prefix',
    category: 'utilities',
    description: 'View or set prefix',
    slash: {
      data: new SlashCommandBuilder()
        .setName('prefix')
        .setDescription('View or set prefix')
        .addStringOption(o => o.setName('value').setDescription('New prefix (max 3 chars)').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
      async run(interaction) {
        const value = interaction.options.getString('value');
        const s = await getGuildSettings(interaction.guildId);
        if (!value) return interaction.reply(`Current prefix: \`${s.prefix || '!'}\``);
        if (value.length > 3) return interaction.reply({ content: 'Prefix max length is 3.', ephemeral: true });
        const ns = await setGuildSetting(interaction.guildId, { prefix: value });
        return interaction.reply(`✅ Prefix updated: \`${ns.prefix}\``);
      }
    },
    prefix: {
      async run(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return message.reply('🚫 You need **Manage Server**.');
        const value = args[0];
        const s = await getGuildSettings(message.guild.id);
        if (!value) return message.reply(`Current prefix: \`${s.prefix || '!'}\``);
        if (value.length > 3) return message.reply('Prefix max length is 3.');
        const ns = await setGuildSetting(message.guild.id, { prefix: value });
        return message.reply(`✅ Prefix updated: \`${ns.prefix}\``);
      }
    }
  },

  {
    name: 'invite',
    category: 'utilities',
    description: 'Get bot invite link',
    slash: {
      data: new SlashCommandBuilder().setName('invite').setDescription('Get bot invite link'),
      async run(interaction) {
        const id = interaction.client.user.id;
        const url = `https://discord.com/oauth2/authorize?client_id=${id}&scope=bot%20applications.commands&permissions=8`;
        return interaction.reply(`🔗 Invite me: ${url}`);
      }
    },
    prefix: {
      async run(message) {
        const id = message.client.user.id;
        const url = `https://discord.com/oauth2/authorize?client_id=${id}&scope=bot%20applications.commands&permissions=8`;
        return message.reply(`🔗 Invite me: ${url}`);
      }
    }
  },

  {
    name: 'serverinfo',
    category: 'utilities',
    description: 'Server info',
    slash: {
      data: new SlashCommandBuilder().setName('serverinfo').setDescription('Server info'),
      async run(interaction) {
        const g = interaction.guild;
        const owner = await g.fetchOwner();
        const embed = new EmbedBuilder()
          .setTitle('🏠 Server Info')
          .setColor(0xFF00FF)
          .addFields(
            { name: 'Name', value: g.name, inline: true },
            { name: 'ID', value: g.id, inline: true },
            { name: 'Owner', value: `<@${owner.id}>`, inline: true },
            { name: 'Members', value: String(g.memberCount), inline: true },
            { name: 'Created', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:D>`, inline: true }
          )
          .setThumbnail(g.iconURL({ dynamic: true }) || null)
          .setTimestamp();
        return interaction.reply({ embeds: [embed] });
      }
    },
    prefix: {
      async run(message) {
        const g = message.guild;
        const owner = await g.fetchOwner();
        return message.reply(`🏠 **${g.name}** | Owner: <@${owner.id}> | Members: **${g.memberCount}**`);
      }
    }
  },

  {
    name: 'userinfo',
    category: 'utilities',
    description: 'User info',
    slash: {
      data: new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('User info')
        .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(false)),
      async run(interaction) {
        const member = interaction.options.getMember('user') || interaction.member;
        const user = member.user;
        const embed = new EmbedBuilder()
          .setTitle(`ℹ️ User Info: ${user.tag}`)
          .setColor(0xFF00FF)
          .addFields(
            { name: 'ID', value: user.id, inline: true },
            { name: 'Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:D>`, inline: true },
            { name: 'Joined', value: member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime()/1000)}:D>` : 'N/A', inline: true }
          )
          .setThumbnail(user.displayAvatarURL({ size: 1024 }))
          .setTimestamp();
        return interaction.reply({ embeds: [embed] });
      }
    },
    prefix: {
      async run(message) {
        const member = message.mentions.members.first() || message.member;
        const user = member.user;
        return message.reply(`ℹ️ **${user.tag}** | ID: \`${user.id}\` | Created: <t:${Math.floor(user.createdTimestamp/1000)}:D>`);
      }
    }
  },

  {
    name: 'avatar',
    category: 'utilities',
    description: 'Get user avatar',
    slash: {
      data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Get user avatar')
        .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(false)),
      async run(interaction) {
        const user = interaction.options.getUser('user') || interaction.user;
        return interaction.reply(user.displayAvatarURL({ size: 1024 }));
      }
    },
    prefix: {
      async run(message) {
        const user = message.mentions.users.first() || message.author;
        return message.reply(user.displayAvatarURL({ size: 1024 }));
      }
    }
  },

  {
    name: 'banner',
    category: 'utilities',
    description: 'Get user banner',
    slash: {
      data: new SlashCommandBuilder()
        .setName('banner')
        .setDescription('Get user banner')
        .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(false)),
      async run(interaction) {
        const u = interaction.options.getUser('user') || interaction.user;
        const user = await interaction.client.users.fetch(u.id, { force: true });
        const url = user.bannerURL({ size: 2048 });
        return interaction.reply(url ? url : 'This user has no banner.');
      }
    },
    prefix: {
      async run(message) {
        const u = message.mentions.users.first() || message.author;
        const user = await message.client.users.fetch(u.id, { force: true });
        const url = user.bannerURL({ size: 2048 });
        return message.reply(url ? url : 'This user has no banner.');
      }
    }
  },

  {
    name: 'servericon',
    category: 'utilities',
    description: 'Get server icon',
    slash: {
      data: new SlashCommandBuilder().setName('servericon').setDescription('Get server icon'),
      async run(interaction) {
        const url = interaction.guild.iconURL({ size: 2048, dynamic: true });
        return interaction.reply(url || 'This server has no icon.');
      }
    },
    prefix: {
      async run(message) {
        const url = message.guild.iconURL({ size: 2048, dynamic: true });
        return message.reply(url || 'This server has no icon.');
      }
    }
  },

  {
    name: 'channelinfo',
    category: 'utilities',
    description: 'Channel info',
    slash: {
      data: new SlashCommandBuilder()
        .setName('channelinfo')
        .setDescription('Channel info')
        .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(false)),
      async run(interaction) {
        const ch = interaction.options.getChannel('channel') || interaction.channel;
        const embed = new EmbedBuilder()
          .setTitle('📺 Channel Info')
          .setColor(0xFF00FF)
          .addFields(
            { name: 'Name', value: ch.name || 'N/A', inline: true },
            { name: 'ID', value: ch.id, inline: true },
            { name: 'Type', value: String(ch.type), inline: true },
            { name: 'Created', value: `<t:${Math.floor(ch.createdTimestamp/1000)}:D>`, inline: true }
          )
          .setTimestamp();
        return interaction.reply({ embeds: [embed] });
      }
    },
    prefix: {
      async run(message) {
        const ch = message.mentions.channels.first() || message.channel;
        return message.reply(`📺 **#${ch.name}** | ID: \`${ch.id}\` | Created: <t:${Math.floor(ch.createdTimestamp/1000)}:D>`);
      }
    }
  },

  {
    name: 'roleinfo',
    category: 'utilities',
    description: 'Role info',
    slash: {
      data: new SlashCommandBuilder()
        .setName('roleinfo')
        .setDescription('Role info')
        .addRoleOption(o => o.setName('role').setDescription('Target role').setRequired(true)),
      async run(interaction) {
        const role = interaction.options.getRole('role');
        const embed = new EmbedBuilder()
          .setTitle('🎭 Role Info')
          .setColor(role.color || 0xFF00FF)
          .addFields(
            { name: 'Name', value: role.name, inline: true },
            { name: 'ID', value: role.id, inline: true },
            { name: 'Members', value: String(role.members.size), inline: true },
            { name: 'Mentionable', value: String(role.mentionable), inline: true },
            { name: 'Created', value: `<t:${Math.floor(role.createdTimestamp/1000)}:D>`, inline: true }
          )
          .setTimestamp();
        return interaction.reply({ embeds: [embed] });
      }
    },
    prefix: {
      async run(message, args) {
        const role = message.mentions.roles.first() || message.guild.roles.cache.find(r => r.name.toLowerCase() === args.join(' ').toLowerCase());
        if (!role) return message.reply('Usage: `!roleinfo @role` (or role name)');
        return message.reply(`🎭 **${role.name}** | ID: \`${role.id}\` | Members: **${role.members.size}**`);
      }
    }
  },

  {
    name: 'timestamp',
    category: 'utilities',
    description: 'Make a Discord timestamp from UNIX seconds',
    slash: {
      data: new SlashCommandBuilder()
        .setName('timestamp')
        .setDescription('Make a Discord timestamp from UNIX seconds')
        .addIntegerOption(o => o.setName('unix').setDescription('UNIX seconds').setRequired(true)),
      async run(interaction) {
        const unix = interaction.options.getInteger('unix');
        const d = new Date(unix * 1000);
        if (Number.isNaN(d.getTime())) return interaction.reply({ content: 'Invalid unix time.', ephemeral: true });
        return interaction.reply(`Absolute: <t:${unix}:F>\nRelative: <t:${unix}:R>`);
      }
    },
    prefix: {
      async run(message, args) {
        const unix = parseInt(args[0], 10);
        if (!unix) return message.reply('Usage: `!timestamp <unixSeconds>`');
        return message.reply(`Absolute: <t:${unix}:F>\nRelative: <t:${unix}:R>`);
      }
    }
  },

  {
    name: 'poll',
    category: 'utilities',
    description: 'Create a simple poll',
    slash: {
      data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Create a simple poll')
        .addStringOption(o => o.setName('question').setDescription('Poll question').setRequired(true)),
      async run(interaction) {
        const q = interaction.options.getString('question');
        const embed = new EmbedBuilder()
          .setTitle('📊 Poll')
          .setDescription(q)
          .setColor(0xFF00FF)
          .setFooter({ text: `Started by ${interaction.user.tag}` })
          .setTimestamp();
        const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
        await msg.react('👍').catch(()=>{});
        await msg.react('👎').catch(()=>{});
      }
    },
    prefix: {
      async run(message, args) {
        const q = args.join(' ');
        if (!q) return message.reply('Usage: `!poll <question>`');
        const embed = new EmbedBuilder()
          .setTitle('📊 Poll')
          .setDescription(q)
          .setColor(0xFF00FF)
          .setFooter({ text: `Started by ${message.author.tag}` })
          .setTimestamp();
        const msg = await message.channel.send({ embeds: [embed] });
        await msg.react('👍').catch(()=>{});
        await msg.react('👎').catch(()=>{});
      }
    }
  },

  {
    name: 'remind',
    aliases: ['reminder'],
    category: 'utilities',
    description: 'Set a reminder',
    slash: {
      data: new SlashCommandBuilder()
        .setName('remind')
        .setDescription('Set a reminder')
        .addStringOption(o => o.setName('in').setDescription('Duration like 10m, 2h, 1d').setRequired(true))
        .addStringOption(o => o.setName('text').setDescription('Reminder text').setRequired(true)),
      async run(interaction) {
        const dur = interaction.options.getString('in');
        const text = interaction.options.getString('text');
        const ms = parseDuration(dur);
        if (!ms || ms < 5_000 || ms > 90 * 86_400_000) {
          return interaction.reply({ content: 'Invalid duration. Use like 10m, 2h, 1d (min 5s, max 90d).', ephemeral: true });
        }
        const remindAt = new Date(Date.now() + ms);
        const id = await createReminder({
          userId: interaction.user.id,
          channelId: interaction.channelId,
          guildId: interaction.guildId,
          remindAt,
          text
        });
        return interaction.reply(`⏰ Reminder #${id} set for ${toDiscordTs(remindAt, 'R')} (${toDiscordTs(remindAt, 'F')}).`);
      }
    },
    prefix: {
      async run(message, args) {
        const dur = args[0];
        const text = args.slice(1).join(' ');
        if (!dur || !text) return message.reply('Usage: `!remind <10m|2h|1d> <text>`');
        const ms = parseDuration(dur);
        if (!ms || ms < 5_000 || ms > 90 * 86_400_000) return message.reply('Invalid duration. Use like 10m, 2h, 1d (min 5s, max 90d).');
        const remindAt = new Date(Date.now() + ms);
        const id = await createReminder({
          userId: message.author.id,
          channelId: message.channel.id,
          guildId: message.guild.id,
          remindAt,
          text
        });
        return message.reply(`⏰ Reminder #${id} set for ${toDiscordTs(remindAt, 'R')} (${toDiscordTs(remindAt, 'F')}).`);
      }
    }
  },

  {
    name: 'reminders',
    category: 'utilities',
    description: 'List your reminders',
    slash: {
      data: new SlashCommandBuilder().setName('reminders').setDescription('List your reminders'),
      async run(interaction) {
        const rows = await listReminders(interaction.user.id, 10);
        if (!rows.length) return interaction.reply('You have no reminders.');
        const lines = rows.map(r => `#${r.id} • ${toDiscordTs(new Date(r.remind_at),'R')} • ${r.text}`);
        return interaction.reply(`⏰ Your reminders:\n${lines.join('\n')}`);
      }
    },
    prefix: {
      async run(message) {
        const rows = await listReminders(message.author.id, 10);
        if (!rows.length) return message.reply('You have no reminders.');
        const lines = rows.map(r => `#${r.id} • ${toDiscordTs(new Date(r.remind_at),'R')} • ${r.text}`);
        return message.reply(`⏰ Your reminders:\n${lines.join('\n')}`);
      }
    }
  },

  {
    name: 'say',
    category: 'utilities',
    description: 'Make the bot say something',
    slash: {
      data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Make the bot say something')
        .addStringOption(o => o.setName('text').setDescription('Text').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      async run(interaction) {
        const text = interaction.options.getString('text');
        await interaction.reply({ content: '✅ Sent.', ephemeral: true });
        return interaction.channel.send({ content: text });
      }
    },
    prefix: {
      async run(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return message.reply('🚫 You need **Manage Messages**.');
        const text = args.join(' ');
        if (!text) return message.reply('Usage: `!say <text>`');
        return message.channel.send({ content: text });
      }
    }
  },
  
  {
    name: 'afk',
    category: 'utilities',
    description: 'Set your AFK status',
    slash: {
      data: new SlashCommandBuilder()
        .setName('afk')
        .setDescription('Set your AFK status')
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)),
      async run(interaction, ctx) {
        const reason = interaction.options.getString('reason') || 'AFK';
        ctx.afkMap.set(`${interaction.guildId}:${interaction.user.id}`, { reason, since: Date.now() });
        return interaction.reply({ content: `💤 You are now AFK: **${reason}**`, ephemeral: true });
      }
    },
    prefix: {
      async run(message, args, ctx) {
        const reason = args.join(' ') || 'AFK';
        ctx.afkMap.set(`${message.guild.id}:${message.author.id}`, { reason, since: Date.now() });
        return message.reply(`💤 You are now AFK: **${reason}**`);
      }
    }
  },

  {
    name: 'snipe',
    category: 'utilities',
    description: 'Show last deleted message in this channel',
    slash: {
      data: new SlashCommandBuilder().setName('snipe').setDescription('Show last deleted message in this channel'),
      async run(interaction, ctx) {
        const sn = ctx.snipeCache.get(interaction.channelId);
        if (!sn) return interaction.reply({ content: 'Nothing to snipe.', ephemeral: true });
        return interaction.reply(`🕵️ Last deleted message by **${sn.authorTag}**: ${sn.content}`);
      }
    },
    prefix: {
      async run(message, _args, ctx) {
        const sn = ctx.snipeCache.get(message.channelId);
        if (!sn) return message.reply('Nothing to snipe.');
        return message.reply(`🕵️ Last deleted message by **${sn.authorTag}**: ${sn.content}`);
      }
    }
  },

  {
    name: 'level',
    category: 'utilities',
    description: 'Toggle leveling system',
    slash: {
      data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('Toggle leveling system')
        .addStringOption(o =>
          o.setName('mode')
            .setDescription('on/off/status')
            .setRequired(true)
            .addChoices(
              { name: 'on', value: 'on' },
              { name: 'off', value: 'off' },
              { name: 'status', value: 'status' }
            )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
      async run(interaction) {
        const { getGuildSettings, setGuildSetting } = require('../services/guildSettings');
        const mode = interaction.options.getString('mode');
        if (mode === 'status') {
          const s = await getGuildSettings(interaction.guildId);
          return interaction.reply({ content: `Leveling is **${s.level_enabled ? 'ON' : 'OFF'}**.`, ephemeral: true });
        }
        const enabled = mode === 'on';
        await setGuildSetting(interaction.guildId, { level_enabled: enabled });
        return interaction.reply({ content: `✅ Leveling is now **${enabled ? 'ON' : 'OFF'}**.`, ephemeral: true });
      }
    },
    prefix: {
      async run(message, args) {
        const { getGuildSettings, setGuildSetting } = require('../services/guildSettings');
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return message.reply('🚫 You need **Manage Server**.');
        const mode = String(args[0] || '').toLowerCase();
        if (!mode || !['on','off','status'].includes(mode)) return message.reply('Usage: `!level on|off|status`');
        if (mode === 'status') {
          const s = await getGuildSettings(message.guild.id);
          return message.reply(`Leveling is **${s.level_enabled ? 'ON' : 'OFF'}**.`);
        }
        const enabled = mode === 'on';
        await setGuildSetting(message.guild.id, { level_enabled: enabled });
        return message.reply(`✅ Leveling is now **${enabled ? 'ON' : 'OFF'}**.`);
      }
    }
  },

  {
    name: 'servers',
    category: 'utilities',
    description: 'List servers the bot is in (owner only)',
    slash: {
      data: new SlashCommandBuilder().setName('servers').setDescription('List servers the bot is in (owner only)'),
      async run(interaction, ctx) {
        const ownerId = process.env.OWNER_ID;
        if (!ownerId || interaction.user.id !== ownerId) {
          return interaction.reply({ content: '🚫 Owner only.', ephemeral: true });
        }

        const guilds = [...ctx.client.guilds.cache.values()]
          .map(g => ({ name: g.name, id: g.id, members: g.memberCount || 0 }))
          .sort((a, b) => b.members - a.members);

        const lines = guilds.map((g, i) => `${i + 1}. ${g.name} (${g.id}) members:${g.members}`);
        const body = lines.join('\n');

        if (body.length <= 1800) {
          return interaction.reply({ content: `**Servers (${guilds.length})**\n${body}`, ephemeral: true });
        }

        const buf = Buffer.from(body, 'utf8');
        const file = new AttachmentBuilder(buf, { name: 'servers.txt' });
        return interaction.reply({ content: `**Servers (${guilds.length})**`, files: [file], ephemeral: true });
      }
    },
    prefix: {
      async run(message, _args, ctx) {
        const ownerId = process.env.OWNER_ID;
        if (!ownerId || message.author.id !== ownerId) return message.reply('🚫 Owner only.');

        const guilds = [...ctx.client.guilds.cache.values()]
          .map(g => ({ name: g.name, id: g.id, members: g.memberCount || 0 }))
          .sort((a, b) => b.members - a.members);

        const lines = guilds.map((g, i) => `${i + 1}. ${g.name} (${g.id}) members:${g.members}`);
        const body = lines.join('\n');

        if (body.length <= 1900) return message.reply(`**Servers (${guilds.length})**\n${body}`);

        const buf = Buffer.from(body, 'utf8');
        const file = new AttachmentBuilder(buf, { name: 'servers.txt' });
        return message.reply({ content: `**Servers (${guilds.length})**`, files: [file] });
      }
    }
  }
];
