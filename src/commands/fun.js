const { SlashCommandBuilder } = require('discord.js');
const { randInt } = require('../services/casino');

const EIGHT_BALL = [
  'Yes.',
  'No.',
  'Maybe.',
  'Absolutely.',
  'Definitely not.',
  'Ask again later.',
  'It is certain.',
  'Very doubtful.',
  'Outlook good.',
  'Outlook not so good.',
  'Without a doubt.',
  'Better not tell you now.'
];

function asciiSym(width, height) {
  const w = Math.max(8, Math.min(40, width));
  const h = Math.max(6, Math.min(20, height));
  const chars = [' ', ' ', '.', ':', '*', '#', '@'];
  const half = Math.ceil(w / 2);

  const lines = [];
  for (let y = 0; y < h; y++) {
    const left = [];
    for (let x = 0; x < half; x++) {
      left.push(chars[randInt(0, chars.length - 1)]);
    }
    const right = [...left].slice(0, w - half).reverse();
    lines.push(left.join('') + right.join(''));
  }
  return lines.join('\n');
}

function asciiWaves(width, height) {
  const w = Math.max(10, Math.min(60, width));
  const h = Math.max(6, Math.min(18, height));
  const chars = ['~', '≈', '-', ' '];

  const lines = [];
  let phase = randInt(0, 1000) / 1000;
  for (let y = 0; y < h; y++) {
    let line = '';
    phase += 0.35;
    for (let x = 0; x < w; x++) {
      const t = (x / w) * Math.PI * 4 + phase;
      const v = Math.sin(t) * 0.6 + Math.sin(t * 0.5) * 0.4;
      const idx = v > 0.5 ? 0 : v > 0.1 ? 1 : v > -0.3 ? 2 : 3;
      line += chars[idx];
    }
    lines.push(line);
  }
  return lines.join('\n');
}

function generateArt(style, width, height) {
  const s = String(style || 'sym').toLowerCase();
  if (s === 'waves') return asciiWaves(width, height);
  return asciiSym(width, height);
}

function parseOptions(raw) {
  const text = String(raw || '').trim();
  if (!text) return [];
  if (text.includes('|')) return text.split('|').map(s => s.trim()).filter(Boolean);
  return text.split(/\s+/g).map(s => s.trim()).filter(Boolean);
}

module.exports = [
  {
    name: '8ball',
    aliases: ['eightball','8b'],
    category: 'minigames',
    description: 'Ask the magic 8-ball',
    slash: {
      data: new SlashCommandBuilder()
        .setName('8ball')
        .setDescription('Ask the magic 8-ball')
        .addStringOption(o => o.setName('question').setDescription('Your question').setRequired(true)),
      async run(interaction) {
        const q = interaction.options.getString('question');
        const a = EIGHT_BALL[randInt(0, EIGHT_BALL.length - 1)];
        return interaction.reply(`🎱 **Q:** ${q}\n**A:** ${a}`);
      }
    },
    prefix: {
      async run(message, args) {
        const q = args.join(' ').trim();
        if (!q) return message.reply('Usage: `!8ball <question>`');
        const a = EIGHT_BALL[randInt(0, EIGHT_BALL.length - 1)];
        return message.reply(`🎱 **Q:** ${q}\n**A:** ${a}`);
      }
    }
  },

  {
    name: 'choose',
    aliases: ['pick'],
    category: 'minigames',
    description: 'Randomly choose from options',
    slash: {
      data: new SlashCommandBuilder()
        .setName('choose')
        .setDescription('Randomly choose from options')
        .addStringOption(o => o.setName('options').setDescription('Separate by | or spaces').setRequired(true)),
      async run(interaction) {
        const raw = interaction.options.getString('options');
        const opts = parseOptions(raw);
        if (opts.length < 2) return interaction.reply('Provide at least 2 options.');
        const pick = opts[randInt(0, opts.length - 1)];
        return interaction.reply(`🎯 I choose: **${pick}**`);
      }
    },
    prefix: {
      async run(message, args) {
        const raw = args.join(' ');
        const opts = parseOptions(raw);
        if (opts.length < 2) return message.reply('Usage: `!choose a | b | c`');
        const pick = opts[randInt(0, opts.length - 1)];
        return message.reply(`🎯 I choose: **${pick}**`);
      }
    }
  },

  {
    name: 'art',
    category: 'minigames',
    description: 'Generate simple ASCII art',
    slash: {
      data: new SlashCommandBuilder()
        .setName('art')
        .setDescription('Generate simple ASCII art')
        .addStringOption(o => o.setName('style').setDescription('sym | waves').setRequired(false))
        .addIntegerOption(o => o.setName('width').setDescription('Width (8-60)').setRequired(false))
        .addIntegerOption(o => o.setName('height').setDescription('Height (6-20)').setRequired(false)),
      async run(interaction) {
        const style = interaction.options.getString('style') || 'sym';
        const width = interaction.options.getInteger('width') || 28;
        const height = interaction.options.getInteger('height') || 12;
        const art = generateArt(style, width, height);
        return interaction.reply('```' + art + '```');
      }
    },
    prefix: {
      async run(message, args) {
        const style = args[0] || 'sym';
        const width = Number(args[1] || 28) || 28;
        const height = Number(args[2] || 12) || 12;
        const art = generateArt(style, width, height);
        return message.reply('```' + art + '```');
      }
    }
  },

  {
    name: 'hangman',
    category: 'minigames',
    description: 'Play a simple hangman game',
    slash: {
      data: new SlashCommandBuilder()
        .setName('hangman')
        .setDescription('Play hangman'),
      async run(interaction) {
        const WORDS = ['discord', 'javascript', 'postgres', 'sharding', 'economy', 'roulette', 'minigame', 'inventory', 'marketplace', 'stability'];
        const word = WORDS[randInt(0, WORDS.length - 1)].toLowerCase();
        const guessed = new Set();
        let lives = 7;

        const render = () => {
          const masked = word.split('').map(c => (guessed.has(c) ? c : '•')).join(' ');
          const used = [...guessed].sort().join(' ');
          return `🪓 **Hangman**\nWord: ${masked}\nLives: **${lives}**\nUsed: ${used || '—'}\n\nType a letter in chat.`;
        };

        await interaction.reply(render());
        const channel = interaction.channel;

        const collector = channel.createMessageCollector({
          filter: m => m.author.id === interaction.user.id,
          time: 120_000
        });

        collector.on('collect', async (m) => {
          const t = String(m.content || '').trim().toLowerCase();
          const c = t.length === 1 ? t : null;
          if (!c || !/^[a-z]$/.test(c)) return;

          if (guessed.has(c)) return;
          guessed.add(c);

          if (!word.includes(c)) lives -= 1;

          const done = word.split('').every(ch => guessed.has(ch));
          if (done) {
            collector.stop('win');
            return m.reply(`✅ You win! Word: **${word}**`);
          }
          if (lives <= 0) {
            collector.stop('lose');
            return m.reply(`❌ You lose! Word: **${word}**`);
          }

          return m.reply(render());
        });

        collector.on('end', (collected, reason) => {
          if (reason === 'time') {
            interaction.followUp?.(`⌛ Time's up! Word was **${word}**`).catch(() => {});
          }
        });
      }
    },
    prefix: {
      async run(message) {
        const WORDS = ['discord', 'javascript', 'postgres', 'sharding', 'economy', 'roulette', 'minigame', 'inventory', 'marketplace', 'stability'];
        const word = WORDS[randInt(0, WORDS.length - 1)].toLowerCase();
        const guessed = new Set();
        let lives = 7;

        const render = () => {
          const masked = word.split('').map(c => (guessed.has(c) ? c : '•')).join(' ');
          const used = [...guessed].sort().join(' ');
          return `🪓 **Hangman**\nWord: ${masked}\nLives: **${lives}**\nUsed: ${used || '—'}\n\nType a letter in chat.`;
        };

        await message.reply(render());
        const collector = message.channel.createMessageCollector({
          filter: m => m.author.id === message.author.id,
          time: 120_000
        });

        collector.on('collect', async (m) => {
          const t = String(m.content || '').trim().toLowerCase();
          const c = t.length === 1 ? t : null;
          if (!c || !/^[a-z]$/.test(c)) return;

          if (guessed.has(c)) return;
          guessed.add(c);

          if (!word.includes(c)) lives -= 1;

          const done = word.split('').every(ch => guessed.has(ch));
          if (done) {
            collector.stop('win');
            return m.reply(`✅ You win! Word: **${word}**`);
          }
          if (lives <= 0) {
            collector.stop('lose');
            return m.reply(`❌ You lose! Word: **${word}**`);
          }

          return m.reply(render());
        });

        collector.on('end', (collected, reason) => {
          if (reason === 'time') {
            message.reply(`⌛ Time's up! Word was **${word}**`).catch(() => {});
          }
        });
      }
    }
  }
];
