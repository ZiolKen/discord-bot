const crypto = require('crypto');
const { SlashCommandBuilder } = require('discord.js');
const { randInt } = require('../services/casino');

function snowflakeInfo(id) {
  const n = BigInt(id);
  const timestamp = Number((n >> 22n) + 1420070400000n);
  const workerId = Number((n & 0x3E0000n) >> 17n);
  const processId = Number((n & 0x1F000n) >> 12n);
  const increment = Number(n & 0xFFFn);
  return { timestamp, workerId, processId, increment };
}

module.exports = [
  {
    name: 'uuid',
    aliases: ['uid'],
    category: 'utilities',
    description: 'Generate a UUID',
    slash: {
      data: new SlashCommandBuilder().setName('uuid').setDescription('Generate a UUID'),
      async run(interaction) {
        return interaction.reply(crypto.randomUUID());
      }
    },
    prefix: {
      async run(message) {
        return message.reply(crypto.randomUUID());
      }
    }
  },

  {
    name: 'hash',
    aliases: ['hs'],
    category: 'utilities',
    description: 'Hash a string (sha256)',
    slash: {
      data: new SlashCommandBuilder()
        .setName('hash')
        .setDescription('Hash a string (sha256)')
        .addStringOption(o => o.setName('text').setDescription('Text').setRequired(true)),
      async run(interaction) {
        const text = interaction.options.getString('text');
        const hash = crypto.createHash('sha256').update(text, 'utf8').digest('hex');
        return interaction.reply('`' + hash + '`');
      }
    },
    prefix: {
      async run(message, args) {
        const text = args.join(' ');
        if (!text) return message.reply('Usage: `!hash <text>`');
        const hash = crypto.createHash('sha256').update(text, 'utf8').digest('hex');
        return message.reply('`' + hash + '`');
      }
    }
  },

  {
    name: 'snowflake',
    aliases: ['sf'],
    category: 'utilities',
    description: 'Decode a Discord snowflake id',
    slash: {
      data: new SlashCommandBuilder()
        .setName('snowflake')
        .setDescription('Decode a Discord snowflake id')
        .addStringOption(o => o.setName('id').setDescription('Snowflake').setRequired(true)),
      async run(interaction) {
        const id = interaction.options.getString('id');
        if (!/^\d{6,30}$/.test(id)) return interaction.reply('Invalid id.');
        const info = snowflakeInfo(id);
        const date = new Date(info.timestamp);
        return interaction.reply(`🧊 **Snowflake**\nID: \`${id}\`\nTime: <t:${Math.floor(info.timestamp/1000)}:F> (${date.toISOString()})\nWorker: **${info.workerId}** • Process: **${info.processId}** • Inc: **${info.increment}**`);
      }
    },
    prefix: {
      async run(message, args) {
        const id = String(args[0] || '');
        if (!/^\d{6,30}$/.test(id)) return message.reply('Usage: `!snowflake <id>`');
        const info = snowflakeInfo(id);
        const date = new Date(info.timestamp);
        return message.reply(`🧊 **Snowflake**\nID: \`${id}\`\nTime: <t:${Math.floor(info.timestamp/1000)}:F> (${date.toISOString()})\nWorker: ${info.workerId} • Process: ${info.processId} • Inc: ${info.increment}`);
      }
    }
  },

  {
    name: 'base64',
    aliases: ['b64'],
    category: 'utilities',
    description: 'Base64 encode/decode',
    slash: {
      data: new SlashCommandBuilder()
        .setName('base64')
        .setDescription('Base64 encode/decode')
        .addStringOption(o => o.setName('mode').setDescription('encode | decode').setRequired(true))
        .addStringOption(o => o.setName('text').setDescription('Text').setRequired(true)),
      async run(interaction) {
        const mode = (interaction.options.getString('mode') || '').toLowerCase();
        const text = interaction.options.getString('text') || '';
        if (mode === 'encode') {
          const out = Buffer.from(text, 'utf8').toString('base64');
          return interaction.reply('`' + out + '`');
        }
        if (mode === 'decode') {
          try {
            const out = Buffer.from(text, 'base64').toString('utf8');
            return interaction.reply('`' + out + '`');
          } catch {
            return interaction.reply('Invalid base64.');
          }
        }
        return interaction.reply('Mode must be encode or decode.');
      }
    },
    prefix: {
      async run(message, args) {
        const mode = String(args[0] || '').toLowerCase();
        const text = args.slice(1).join(' ');
        if (!mode || !text) return message.reply('Usage: `!base64 encode|decode <text>`');
        if (mode === 'encode') return message.reply('`' + Buffer.from(text, 'utf8').toString('base64') + '`');
        if (mode === 'decode') {
          try { return message.reply('`' + Buffer.from(text, 'base64').toString('utf8') + '`'); } catch { return message.reply('Invalid base64.'); }
        }
        return message.reply('Mode must be encode or decode.');
      }
    }
  },

  {
    name: 'rand',
    aliases: ['random'],
    category: 'utilities',
    description: 'Cryptographic random integer',
    slash: {
      data: new SlashCommandBuilder()
        .setName('rand')
        .setDescription('Cryptographic random integer')
        .addIntegerOption(o => o.setName('min').setDescription('Min').setRequired(true))
        .addIntegerOption(o => o.setName('max').setDescription('Max').setRequired(true)),
      async run(interaction) {
        const min = interaction.options.getInteger('min');
        const max = interaction.options.getInteger('max');
        if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) return interaction.reply('Invalid range.');
        if (max - min > 1_000_000_000) return interaction.reply('Range too large.');
        const n = randInt(min, max);
        return interaction.reply(`🎲 ${n}`);
      }
    },
    prefix: {
      async run(message, args) {
        const min = Number(args[0]);
        const max = Number(args[1]);
        if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) return message.reply('Usage: `!rand <min> <max>`');
        if (max - min > 1_000_000_000) return message.reply('Range too large.');
        const n = randInt(min, max);
        return message.reply(`🎲 ${n}`);
      }
    }
  }
];
