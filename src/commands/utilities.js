const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { getGuildSettings, setGuildSetting } = require('../services/guildSettings');
const { parseDuration, toDiscordTs } = require('../utils/time');
const { createReminder, listReminders } = require('../services/reminders');
const { createSession, endSession } = require('../services/gameSessions');

function hasDisallowedMentions(text) {
  const s = String(text || '');
  return /@everyone|@here|<@!?\d+>|<@&\d+>|<#\d+>/.test(s);
}

const LINGVA_INSTANCES = [
  'https://lingva.lunar.icu',
  'https://lingva.dialectapp.org',
  'https://lingva.ml',
  'https://lingva.vercel.app',
  'https://translate.plausibility.cloud',
  'https://lingva.garudalinux.org',
];

const TRANSLATE_LANGS = [
  { alias: 'auto', code: 'auto', name: 'Auto Detect' },

  { alias: 'vi', code: 'vi', name: 'Vietnamese' },
  { alias: 'us', code: 'en', name: 'United States' },
  { alias: 'uk', code: 'en', name: 'United Kingdom' },
  { alias: 'cn', code: 'zh', name: 'Chinese' },
  { alias: 'jp', code: 'ja', name: 'Japanese' },
  { alias: 'kr', code: 'ko', name: 'Korean' },
  { alias: 'fr', code: 'fr', name: 'French' },
  { alias: 'de', code: 'de', name: 'German' },
  { alias: 'es', code: 'es', name: 'Spanish' },
  { alias: 'it', code: 'it', name: 'Italian' },
  { alias: 'ru', code: 'ru', name: 'Russian' },
  { alias: 'pt', code: 'pt', name: 'Portuguese' },
  { alias: 'tr', code: 'tr', name: 'Turkish' },
  { alias: 'id', code: 'id', name: 'Indonesian' },
  { alias: 'th', code: 'th', name: 'Thai' },
  { alias: 'ar', code: 'ar', name: 'Arabic' },
  { alias: 'hi', code: 'hi', name: 'Hindi' },
  { alias: 'pl', code: 'pl', name: 'Polish' },
  { alias: 'nl', code: 'nl', name: 'Dutch' },
  { alias: 'sv', code: 'sv', name: 'Swedish' },
  { alias: 'fi', code: 'fi', name: 'Finnish' },
  { alias: 'da', code: 'da', name: 'Danish' },
  { alias: 'no', code: 'no', name: 'Norwegian' },
  { alias: 'cs', code: 'cs', name: 'Czech' },
  { alias: 'el', code: 'el', name: 'Greek' },
  { alias: 'ro', code: 'ro', name: 'Romanian' },
  { alias: 'hu', code: 'hu', name: 'Hungarian' },
  { alias: 'he', code: 'he', name: 'Hebrew' },
  { alias: 'bn', code: 'bn', name: 'Bengali' },
  { alias: 'fa', code: 'fa', name: 'Persian' },
  { alias: 'tl', code: 'tl', name: 'Filipino' },
  { alias: 'ms', code: 'ms', name: 'Malay' },
  { alias: 'ur', code: 'ur', name: 'Urdu' },
  { alias: 'ta', code: 'ta', name: 'Tamil' },
  { alias: 'te', code: 'te', name: 'Telugu' },
  { alias: 'ukr', code: 'uk', name: 'Ukrainian' },
];

const LANG_ALIAS_MAP = new Map(
  TRANSLATE_LANGS.map(item => [item.alias.toLowerCase(), item])
);

function resolveTranslateLang(alias) {
  return LANG_ALIAS_MAP.get(String(alias || '').toLowerCase()) || null;
}

function formatLangList() {
  return TRANSLATE_LANGS
    .map(lang => `\`${lang.alias}-${lang.name}\``)
    .join(' • ');
}

function chunkText(text, max = 900) {
  const out = [];
  let s = String(text || '').trim();
  while (s.length > max) {
    out.push(s.slice(0, max));
    s = s.slice(max);
  }
  if (s) out.push(s);
  return out;
}

async function lingvaTranslate(text, targetAlias, sourceAlias = 'auto') {
  const source = resolveTranslateLang(sourceAlias) || resolveTranslateLang('auto');
  const target = resolveTranslateLang(targetAlias);

  if (!target) {
    const supported = TRANSLATE_LANGS
      .filter(x => x.alias !== 'auto')
      .map(x => x.alias)
      .join(', ');
    throw new Error(`Unsupported target language. Use \`/langs\` or \`!langs\`.\nSupported: ${supported}`);
  }

  const encodedText = encodeURIComponent(String(text || '').trim());
  if (!encodedText) throw new Error('Missing text to translate.');

  let lastError = null;

  for (const base of LINGVA_INSTANCES) {
    try {
      const url = `${base}/api/v1/${source.code}/${target.code}/${encodedText}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ZiolKen-Bot/1.4.3'
        }
      });

      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status} from ${base}`);
        continue;
      }

      const data = await res.json();

      const translated =
        data?.translation ||
        data?.target?.text ||
        data?.translatedText ||
        data?.text;

      if (!translated) {
        lastError = new Error(`Invalid response from ${base}`);
        continue;
      }

      return {
        translated,
        source,
        target,
        instance: base,
        raw: data
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('All Lingva instances failed.');
}

async function sendTranslateResult(target, authorTag, originalText, result) {
  const embed = new EmbedBuilder()
    .setColor(0xFF00FF)
    .setTitle('Translation')
    .setDescription('Quick translation result')
    .addFields(
      {
        name: 'From',
        value: `\`${result.source.alias}-${result.source.name}\``,
        inline: true
      },
      {
        name: 'To',
        value: `\`${result.target.alias}-${result.target.name}\``,
        inline: true
      },
      {
        name: 'Engine',
        value: '`Lingva`',
        inline: true
      },
      {
        name: 'Original',
        value: String(originalText).slice(0, 1024),
        inline: false
      }
    )
    .setFooter({ text: `Requested by ${authorTag}` })
    .setTimestamp();

  const translatedChunks = chunkText(result.translated, 1000);
  embed.addFields({
    name: 'Translated',
    value: translatedChunks[0] || 'No result.',
    inline: false
  });

  if (translatedChunks[1]) {
    embed.addFields({
      name: 'Translated (cont.)',
      value: translatedChunks[1],
      inline: false
    });
  }

  if (typeof target.editReply === 'function' && (target.deferred || target.replied)) {
    return target.editReply({ embeds: [embed] });
  }

  return target.reply({ embeds: [embed] });
}

async function sendLangsMessage(target, authorTag) {
  const lines = [];
  let current = '';

  for (const item of TRANSLATE_LANGS) {
    const piece = `\`${item.alias}-${item.name}\``;
    if ((current + ' ' + piece).length > 950) {
      lines.push(current.trim());
      current = piece;
    } else {
      current += ` ${piece}`;
    }
  }
  if (current.trim()) lines.push(current.trim());

  const embed = new EmbedBuilder()
    .setColor(0xFF00FF)
    .setTitle('Supported Translate Langs')
    .setDescription('Use with `/translate text:<text> targetlang:<alias>` or `!translate <text> -<alias>`')
    .setFooter({ text: `Requested by ${authorTag}` })
    .setTimestamp();

  lines.forEach((line, index) => {
    embed.addFields({
      name: index === 0 ? 'Aliases' : `Aliases (${index + 1})`,
      value: line,
      inline: false
    });
  });

  if (typeof target.editReply === 'function' && (target.deferred || target.replied)) {
    return target.editReply({ embeds: [embed] });
  }

  return target.reply({ embeds: [embed] });
}

async function sendLangsMessage(target, authorTag) {
  const lines = [];
  let current = '';

  for (const item of TRANSLATE_LANGS) {
    const piece = `\`${item.alias}-${item.name}\``;
    if ((current + ' ' + piece).length > 950) {
      lines.push(current.trim());
      current = piece;
    } else {
      current += ` ${piece}`;
    }
  }
  if (current.trim()) lines.push(current.trim());

  const embed = new EmbedBuilder()
    .setColor(0xFF00FF)
    .setTitle('Supported Translate Langs')
    .setDescription('Use with `/translate text:<text> targetlang:<alias>` or `!translate <text> -<alias>`')
    .setFooter({ text: `Requested by ${authorTag}` })
    .setTimestamp();

  lines.forEach((line, index) => {
    embed.addFields({
      name: index === 0 ? 'Aliases' : `Aliases (${index + 1})`,
      value: line,
      inline: false
    });
  });

  return target.reply({ embeds: [embed] });
}

module.exports = [
  {
    name: 'help',
    aliases: ['h','commands','cmds','c'],
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
    aliases: ['p'],
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
    aliases: ['ut'],
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
    aliases: ['pf'],
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
    aliases: ['inv','ivt'],
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
    aliases: ['si'],
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
    aliases: ['ui'],
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
    aliases: ['avt'],
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
    aliases: ['bn'],
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
    aliases: ['sico','sic','sicon'],
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
    aliases: ['ci'],
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
    aliases: ['ri'],
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
    aliases: ['tt'],
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
    aliases: ['reminder','rm','rmd'],
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
    aliases: ['rmds'],
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
        const text = interaction.options.getString('text', true);
  
        if (hasDisallowedMentions(text)) {
          return interaction.reply({ content: '🚫 Mentions are not allowed in /say.', ephemeral: true });
        }
  
        await interaction.deferReply({ ephemeral: true });
  
        const sessionId = createSession({
          type: 'say',
          ownerId: interaction.user.id,
          allowAll: true,
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          ttlMs: 24 * 60 * 60_000,
          state: { tag: interaction.user.tag, id: interaction.user.id },
          onAction: async (btn, action, s) => {
            if (action !== 'who') return btn.deferUpdate().catch(() => {});
            return btn.reply({
              content: `Sent by: ${s.state.tag} (${s.state.id})`,
              ephemeral: true,
              allowedMentions: { parse: [] }
            }).catch(() => {});
          }
        });
  
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`g:${sessionId}:who`)
            .setLabel('Sent by')
            .setStyle(ButtonStyle.Secondary)
        );
  
        try {
          await interaction.channel.send({
            content: text,
            components: [row],
            allowedMentions: { parse: [] }
          });
          return interaction.editReply({ content: '✅ Sent.' });
        } catch (e) {
          endSession(sessionId);
          return interaction.editReply({ content: '⚠️ I cannot send messages in this channel.' });
        }
      }
    },
    prefix: {
      async run(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
          return message.reply('🚫 You need **Manage Messages**.');
        }
  
        const text = args.join(' ');
        if (!text) return message.reply('Usage: `!say <text>`');
  
        if (hasDisallowedMentions(text)) {
          return message.reply('🚫 Mentions are not allowed in `say`.');
        }
  
        const sessionId = createSession({
          type: 'say',
          ownerId: message.author.id,
          allowAll: true,
          guildId: message.guild?.id,
          channelId: message.channel?.id,
          ttlMs: 24 * 60 * 60_000,
          state: { tag: message.author.tag, id: message.author.id },
          onAction: async (btn, action, s) => {
            if (action !== 'who') return btn.deferUpdate().catch(() => {});
            return btn.reply({
              content: `Sent by: ${s.state.tag} (${s.state.id})`,
              ephemeral: true,
              allowedMentions: { parse: [] }
            }).catch(() => {});
          }
        });
  
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`g:${sessionId}:who`)
            .setLabel('Sent by')
            .setStyle(ButtonStyle.Secondary)
        );
  
        try {
          return await message.channel.send({
            content: text,
            components: [row],
            allowedMentions: { parse: [] }
          });
        } catch (e) {
          endSession(sessionId);
          return message.reply('⚠️ I cannot send messages in this channel.');
        }
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
    aliases: ['snp'],
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
    aliases: ['lv'],
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
    aliases: ['svs'],
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
  },
  
  {
    name: 'support',
    aliases: ['supporter','donate','donor','patreon','patron','buymeacoffee','bmac','bmc'],
    category: 'utilities',
    description: 'Sponsor this bot',
    slash: {
      data: new SlashCommandBuilder()
        .setName('support')
        .setDescription('Sponsor this bot'),
      async run(interaction) {
        const embed = new EmbedBuilder()
          .setTitle('Support')
          .setDescription('Sponsor this project.')
          .setColor(0xFF00FF)
          .addFields(
            {
              name: 'Donate to ZiolKen Bot.',
              value: 'Join by clicking one of the following choices below!',
              inline: false
            }
          )
          .setFooter({ text: `Requested by ${interaction.user.tag}` })
          .setTimestamp();
  
        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('Patreon')
            .setStyle(ButtonStyle.Link)
            .setURL('https://patreon.com/ZiolKen'),
  
          new ButtonBuilder()
            .setLabel('Buy Me a Coffee')
            .setStyle(ButtonStyle.Link)
            .setURL('https://buymeacoffee.com/_zkn'),
        );
  
        return interaction.reply({
          embeds: [embed],
          components: [row1]
        });
      }
    },
    prefix: {
      async run(message) {
        const embed = new EmbedBuilder()
          .setTitle('Support')
          .setDescription('Sponsor this project.')
          .setColor(0xFF00FF)
          .addFields(
            {
              name: 'Donate to ZiolKen Bot.',
              value: 'Join by clicking one of the following choices below!',
              inline: false
            }
          )
          .setFooter({ text: `Requested by ${interaction.user.tag}` })
          .setTimestamp();
  
        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('Patreon')
            .setStyle(ButtonStyle.Link)
            .setURL('https://patreon.com/ZiolKen'),
  
          new ButtonBuilder()
            .setLabel('Buy Me a Coffee')
            .setStyle(ButtonStyle.Link)
            .setURL('https://buymeacoffee.com/_zkn'),
        );
  
        return message.reply({
          embeds: [embed],
          components: [row1]
        });
      }
    }
  },
  
  {
    name: 'credit',
    aliases: ['owner','founder','developer','coder','programmer','creator'],
    category: 'utilities',
    description: 'ZiolKen Bot credit',
    slash: {
      data: new SlashCommandBuilder()
        .setName('credit')
        .setDescription('ZiolKen Bot credit'),
      async run(interaction) {
        const embed = new EmbedBuilder()
          .setTitle('ZiolKen Bot credit')
          .setDescription('By @ziolken.')
          .setColor(0xFF00FF)
          .addFields(
            {
              name: 'Support by using',
              value: '`/support` or `!support` depends prefix.',
              inline: false
            }
          )
          .setFooter({ text: `Requested by ${interaction.user.tag}` })
          .setTimestamp();
  
        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('Portfolio')
            .setStyle(ButtonStyle.Link)
            .setURL('https://ziolken.pages.dev'),
  
          new ButtonBuilder()
            .setLabel('VN Translator')
            .setStyle(ButtonStyle.Link)
            .setURL('https://vntranslator.pages.dev'),
        );
  
        return interaction.reply({
          embeds: [embed],
          components: [row1]
        });
      }
    },
    prefix: {
      async run(message) {
        const embed = new EmbedBuilder()
          .setTitle('ZiolKen Bot credit')
          .setDescription('By @ziolken.')
          .setColor(0xFF00FF)
          .addFields(
            {
              name: 'Support by using',
              value: '`/support` or `!support` depends prefix.',
              inline: false
            }
          )
          .setFooter({ text: `Requested by ${interaction.user.tag}` })
          .setTimestamp();
  
        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('Portfolio')
            .setStyle(ButtonStyle.Link)
            .setURL('https://ziolken.pages.dev'),
  
          new ButtonBuilder()
            .setLabel('VN Translator')
            .setStyle(ButtonStyle.Link)
            .setURL('https://vntranslator.pages.dev'),
        );
  
        return message.reply({
          embeds: [embed],
          components: [row1]
        });
      }
    }
  },

  {
    name: 'translate',
    aliases: ['tr','tl','trans'],
    category: 'utilities',
    description: 'Translate text using Lingva',
    slash: {
      data: new SlashCommandBuilder()
        .setName('translate')
        .setDescription('Translate text using Lingva')
        .addStringOption(o =>
          o.setName('text')
            .setDescription('Text to translate')
            .setRequired(true)
        )
        .addStringOption(o =>
          o.setName('targetlang')
            .setDescription('Target language alias, example: vi, us, uk, cn, jp')
            .setRequired(true)
        ),
      async run(interaction) {
        const text = interaction.options.getString('text', true).trim();
        const targetlang = interaction.options.getString('targetlang', true).trim().toLowerCase();
  
        if (!text) {
          return interaction.reply({
            content: '❌ Please provide text to translate.',
            ephemeral: true
          });
        }
  
        await interaction.deferReply();
  
        try {
          const result = await lingvaTranslate(text, targetlang, 'auto');
          return sendTranslateResult(interaction, interaction.user.tag, text, result);
        } catch (err) {
          return interaction.editReply({
            content:
              `❌ Could not translate that text.\n` +
              `Reason: ${err.message || 'Unknown error'}\n` +
              `Use \`/langs\` to view supported aliases.`
          });
        }
      }
    },
    prefix: {
      async run(message, args) {
        if (!args.length) {
          return message.reply(
            `Usage: \`!translate <text> -<lang>\`\nExample: \`!translate hello world -vi\``
          );
        }
  
        let targetlang = null;
        const textParts = [];
  
        for (const arg of args) {
          if (!targetlang && /^-[a-z0-9_-]+$/i.test(arg)) {
            targetlang = arg.slice(1).toLowerCase();
          } else {
            textParts.push(arg);
          }
        }
  
        const text = textParts.join(' ').trim();
  
        if (!text || !targetlang) {
          return message.reply(
            `Usage: \`!translate <text> -<lang>\`\nExample: \`!translate I love coding -vi\`\nUse \`!langs\` to see aliases.`
          );
        }
  
        try {
          const result = await lingvaTranslate(text, targetlang, 'auto');
          return sendTranslateResult(message, message.author.tag, text, result);
        } catch (err) {
          return message.reply(
            `❌ Could not translate that text.\n` +
            `Reason: ${err.message || 'Unknown error'}\n` +
            `Use \`!langs\` to view supported aliases.`
          );
        }
      }
    }
  },
  {
    name: 'langs',
    aliases: ['lang','languages','translatelangs','listlang','targetlangs'],
    category: 'utilities',
    description: 'Show supported translation languages',
    slash: {
      data: new SlashCommandBuilder()
        .setName('langs')
        .setDescription('Show supported translation languages'),
      async run(interaction) {
        return sendLangsMessage(interaction, interaction.user.tag);
      }
    },
    prefix: {
      async run(message) {
        return sendLangsMessage(message, message.author.tag);
      }
    }
  }
];
