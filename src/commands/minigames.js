const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');
const { getOrCreate, addCoins, setClaim, cooldownReady } = require('../services/economy');
const { toDiscordTs } = require('../utils/time');

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

async function ensureRow(guildId, userId) {
  return getOrCreate(guildId, userId);
}

async function canClaim(field, row, ms) {
  const last = row[field];
  return cooldownReady(last, ms);
}

module.exports = [
  {
    name: 'coinflip',
    category: 'minigames',
    description: 'Flip a coin',
    slash: {
      data: new SlashCommandBuilder().setName('coinflip').setDescription('Flip a coin'),
      async run(interaction) {
        return interaction.reply(`🪙 ${Math.random() < 0.5 ? 'Heads' : 'Tails'}`);
      }
    },
    prefix: { async run(message) { return message.reply(`🪙 ${Math.random() < 0.5 ? 'Heads' : 'Tails'}`); } }
  },
  {
    name: 'roll',
    category: 'minigames',
    description: 'Roll a dice',
    slash: {
      data: new SlashCommandBuilder()
        .setName('roll')
        .setDescription('Roll dice')
        .addIntegerOption(o => o.setName('sides').setDescription('Dice sides (default 6)').setRequired(false)),
      async run(interaction) {
        const sides = interaction.options.getInteger('sides') || 6;
        if (sides < 2 || sides > 1000) return interaction.reply({ content: 'Sides must be 2-1000.', ephemeral: true });
        return interaction.reply(`🎲 You rolled **${rand(1, sides)}** (d${sides})`);
      }
    },
    prefix: { async run(message, args) {
      const sides = parseInt(args[0], 10) || 6;
      if (sides < 2 || sides > 1000) return message.reply('Sides must be 2-1000.');
      return message.reply(`🎲 You rolled **${rand(1, sides)}** (d${sides})`);
    } }
  },
  {
    name: 'rps',
    category: 'minigames',
    description: 'Rock Paper Scissors',
    slash: {
      data: new SlashCommandBuilder()
        .setName('rps')
        .setDescription('Rock Paper Scissors')
        .addStringOption(o => o.setName('pick').setDescription('Your pick').setRequired(true).addChoices(
          { name: 'rock', value: 'rock' },
          { name: 'paper', value: 'paper' },
          { name: 'scissors', value: 'scissors' }
        )),
      async run(interaction) {
        const pick = interaction.options.getString('pick');
        const bot = ['rock','paper','scissors'][rand(0,2)];
        const win =
          (pick==='rock' && bot==='scissors') ||
          (pick==='paper' && bot==='rock') ||
          (pick==='scissors' && bot==='paper');
        const draw = pick === bot;
        return interaction.reply(`🪨📄✂️ You: **${pick}** | Bot: **${bot}** → ${draw ? '🤝 Draw' : win ? '✅ Win' : '❌ Lose'}`);
      }
    },
    prefix: { async run(message, args) {
      const pick = (args[0] || '').toLowerCase();
      if (!['rock','paper','scissors'].includes(pick)) return message.reply('Usage: `!rps rock|paper|scissors`');
      const bot = ['rock','paper','scissors'][rand(0,2)];
      const win =
        (pick==='rock' && bot==='scissors') ||
        (pick==='paper' && bot==='rock') ||
        (pick==='scissors' && bot==='paper');
      const draw = pick === bot;
      return message.reply(`🪨📄✂️ You: **${pick}** | Bot: **${bot}** → ${draw ? '🤝 Draw' : win ? '✅ Win' : '❌ Lose'}`);
    } }
  },

  {
    name: 'balance',
    aliases: ['bal'],
    category: 'minigames',
    description: 'Show your coin balance',
    slash: {
      data: new SlashCommandBuilder().setName('balance').setDescription('Show your coin balance'),
      async run(interaction) {
        const row = await ensureRow(interaction.guildId, interaction.user.id);
        return interaction.reply(`💰 Your coins: **${row.coins}**`);
      }
    },
    prefix: { async run(message) {
      const row = await ensureRow(message.guild.id, message.author.id);
      return message.reply(`💰 Your coins: **${row.coins}**`);
    } }
  },

  {
    name: 'daily',
    category: 'minigames',
    description: 'Claim daily coins',
    slash: {
      data: new SlashCommandBuilder().setName('daily').setDescription('Claim daily coins'),
      async run(interaction) {
        const row = await ensureRow(interaction.guildId, interaction.user.id);
        const ok = await canClaim('daily_at', row, 24*3600*1000);
        if (!ok) {
          const next = new Date(new Date(row.daily_at).getTime() + 24*3600*1000);
          return interaction.reply({ content: `⏳ Already claimed. Try again ${toDiscordTs(next,'R')}.`, ephemeral: true });
        }
        const gain = 150;
        await addCoins(interaction.guildId, interaction.user.id, gain);
        await setClaim(interaction.guildId, interaction.user.id, 'daily_at');
        const updated = await ensureRow(interaction.guildId, interaction.user.id);
        return interaction.reply(`🎁 Daily claimed: +**${gain}** coins. Total: **${updated.coins}**`);
      }
    },
    prefix: { async run(message) {
      const row = await ensureRow(message.guild.id, message.author.id);
      const ok = await canClaim('daily_at', row, 24*3600*1000);
      if (!ok) {
        const next = new Date(new Date(row.daily_at).getTime() + 24*3600*1000);
        return message.reply(`⏳ Already claimed. Try again ${toDiscordTs(next,'R')}.`);
      }
      const gain = 150;
      await addCoins(message.guild.id, message.author.id, gain);
      await setClaim(message.guild.id, message.author.id, 'daily_at');
      const updated = await ensureRow(message.guild.id, message.author.id);
      return message.reply(`🎁 Daily claimed: +${gain} coins. Total: **${updated.coins}**`);
    } }
  },

  {
    name: 'weekly',
    category: 'minigames',
    description: 'Claim weekly coins',
    slash: {
      data: new SlashCommandBuilder().setName('weekly').setDescription('Claim weekly coins'),
      async run(interaction) {
        const row = await ensureRow(interaction.guildId, interaction.user.id);
        const ok = await canClaim('weekly_at', row, 7*24*3600*1000);
        if (!ok) {
          const next = new Date(new Date(row.weekly_at).getTime() + 7*24*3600*1000);
          return interaction.reply({ content: `⏳ Already claimed. Try again ${toDiscordTs(next,'R')}.`, ephemeral: true });
        }
        const gain = 800;
        await addCoins(interaction.guildId, interaction.user.id, gain);
        await setClaim(interaction.guildId, interaction.user.id, 'weekly_at');
        const updated = await ensureRow(interaction.guildId, interaction.user.id);
        return interaction.reply(`🎁 Weekly claimed: +**${gain}** coins. Total: **${updated.coins}**`);
      }
    },
    prefix: { async run(message) {
      const row = await ensureRow(message.guild.id, message.author.id);
      const ok = await canClaim('weekly_at', row, 7*24*3600*1000);
      if (!ok) {
        const next = new Date(new Date(row.weekly_at).getTime() + 7*24*3600*1000);
        return message.reply(`⏳ Already claimed. Try again ${toDiscordTs(next,'R')}.`);
      }
      const gain = 800;
      await addCoins(message.guild.id, message.author.id, gain);
      await setClaim(message.guild.id, message.author.id, 'weekly_at');
      const updated = await ensureRow(message.guild.id, message.author.id);
      return message.reply(`🎁 Weekly claimed: +${gain} coins. Total: **${updated.coins}**`);
    } }
  },

  {
    name: 'leaderboard',
    aliases: ['lb'],
    category: 'minigames',
    description: 'Top coins leaderboard',
    slash: {
      data: new SlashCommandBuilder().setName('leaderboard').setDescription('Top coins leaderboard'),
      async run(interaction) {
        const { rows } = await db.query(
          `SELECT user_id, coins FROM user_stats WHERE guild_id=$1 ORDER BY coins DESC NULLS LAST LIMIT 10`,
          [interaction.guildId]
        );
        if (!rows.length) return interaction.reply('No leaderboard data yet.');
        const lines = rows.map((r, i) => `${i+1}. <@${r.user_id}> — **${r.coins}**`);
        return interaction.reply(`🏆 Coin leaderboard\n${lines.join('\n')}`);
      }
    },
    prefix: { async run(message) {
      const { rows } = await db.query(
        `SELECT user_id, coins FROM user_stats WHERE guild_id=$1 ORDER BY coins DESC NULLS LAST LIMIT 10`,
        [message.guild.id]
      );
      if (!rows.length) return message.reply('No leaderboard data yet.');
      const lines = rows.map((r, i) => `${i+1}. <@${r.user_id}> — **${r.coins}**`);
      return message.reply(`🏆 Coin leaderboard\n${lines.join('\n')}`);
    } }
  },

  {
    name: 'gamble',
    category: 'minigames',
    description: 'Gamble coins (50/50)',
    slash: {
      data: new SlashCommandBuilder()
        .setName('gamble')
        .setDescription('Gamble coins (50/50)')
        .addIntegerOption(o => o.setName('amount').setDescription('Bet amount').setRequired(true)),
      async run(interaction) {
        const amount = interaction.options.getInteger('amount');
        if (amount < 1 || amount > 100000) return interaction.reply({ content: 'Amount must be 1-100000.', ephemeral: true });
        const row = await ensureRow(interaction.guildId, interaction.user.id);
        if (row.coins < amount) return interaction.reply({ content: 'Not enough coins.', ephemeral: true });

        const win = Math.random() < 0.5;
        const delta = win ? amount : -amount;
        await addCoins(interaction.guildId, interaction.user.id, delta);
        const updated = await ensureRow(interaction.guildId, interaction.user.id);
        return interaction.reply(`${win ? '✅ You won' : '❌ You lost'} **${Math.abs(delta)}** coins. Total: **${updated.coins}**`);
      }
    },
    prefix: { async run(message, args) {
      const amount = parseInt(args[0], 10);
      if (!amount) return message.reply('Usage: `!gamble <amount>`');
      if (amount < 1 || amount > 100000) return message.reply('Amount must be 1-100000.');
      const row = await ensureRow(message.guild.id, message.author.id);
      if (row.coins < amount) return message.reply('Not enough coins.');
      const win = Math.random() < 0.5;
      const delta = win ? amount : -amount;
      await addCoins(message.guild.id, message.author.id, delta);
      const updated = await ensureRow(message.guild.id, message.author.id);
      return message.reply(`${win ? '✅ You won' : '❌ You lost'} ${Math.abs(delta)} coins. Total: **${updated.coins}**`);
    } }
  },

  {
    name: 'slots',
    category: 'minigames',
    description: 'Slot machine',
    slash: {
      data: new SlashCommandBuilder()
        .setName('slots')
        .setDescription('Play slots')
        .addIntegerOption(o => o.setName('bet').setDescription('Bet amount').setRequired(true)),
      async run(interaction) {
        const bet = interaction.options.getInteger('bet');
        if (bet < 1 || bet > 100000) return interaction.reply({ content: 'Bet must be 1-100000.', ephemeral: true });
        const row = await ensureRow(interaction.guildId, interaction.user.id);
        if (row.coins < bet) return interaction.reply({ content: 'Not enough coins.', ephemeral: true });

        const symbols = ['🍒','🍋','🍉','⭐','💎'];
        const a = symbols[rand(0,4)], b = symbols[rand(0,4)], c = symbols[rand(0,4)];
        let mult = 0;
        if (a === b && b === c) mult = a === '💎' ? 5 : 3;
        else if (a === b || b === c || a === c) mult = 1;

        const delta = mult === 0 ? -bet : bet * mult;
        await addCoins(interaction.guildId, interaction.user.id, delta);
        const updated = await ensureRow(interaction.guildId, interaction.user.id);

        return interaction.reply(`🎰 ${a} ${b} ${c}\n${mult === 0 ? '❌ Lose' : `✅ Win x${mult}`} (**${delta}** coins)\nTotal: **${updated.coins}**`);
      }
    },
    prefix: { async run(message, args) {
      const bet = parseInt(args[0], 10);
      if (!bet) return message.reply('Usage: `!slots <bet>`');
      if (bet < 1 || bet > 100000) return message.reply('Bet must be 1-100000.');
      const row = await ensureRow(message.guild.id, message.author.id);
      if (row.coins < bet) return message.reply('Not enough coins.');
      const symbols = ['🍒','🍋','🍉','⭐','💎'];
      const a = symbols[rand(0,4)], b = symbols[rand(0,4)], c = symbols[rand(0,4)];
      let mult = 0;
      if (a === b && b === c) mult = a === '💎' ? 5 : 3;
      else if (a === b || b === c || a === c) mult = 1;

      const delta = mult === 0 ? -bet : bet * mult;
      await addCoins(message.guild.id, message.author.id, delta);
      const updated = await ensureRow(message.guild.id, message.author.id);

      return message.reply(`🎰 ${a} ${b} ${c}\n${mult === 0 ? '❌ Lose' : `✅ Win x${mult}`} (${delta} coins)\nTotal: **${updated.coins}**`);
    } }
  },

  {
    name: 'blackjack',
    aliases: ['bj'],
    category: 'minigames',
    description: 'Blackjack vs dealer (single-player)',
    slash: {
      data: new SlashCommandBuilder()
        .setName('blackjack')
        .setDescription('Play blackjack (single-player)')
        .addIntegerOption(o => o.setName('bet').setDescription('Bet amount').setRequired(true)),
      async run(interaction) {
        const bet = interaction.options.getInteger('bet');
        if (bet < 1 || bet > 100000) return interaction.reply({ content: 'Bet must be 1-100000.', ephemeral: true });
        const row = await ensureRow(interaction.guildId, interaction.user.id);
        if (row.coins < bet) return interaction.reply({ content: 'Not enough coins.', ephemeral: true });

        function draw() {
          const cards = [2,3,4,5,6,7,8,9,10,10,10,10,11];
          return cards[rand(0, cards.length-1)];
        }
        function score(hand) {
          let s = hand.reduce((a,b)=>a+b,0);
          let aces = hand.filter(x=>x===11).length;
          while (s > 21 && aces > 0) { s -= 10; aces--; }
          return s;
        }

        const player = [draw(), draw()];
        const dealer = [draw(), draw()];

        while (score(player) < 16) player.push(draw());
        while (score(dealer) < 17) dealer.push(draw());

        const ps = score(player);
        const ds = score(dealer);

        let result = 'draw';
        if (ps > 21 && ds > 21) result = 'draw';
        else if (ps > 21) result = 'lose';
        else if (ds > 21) result = 'win';
        else if (ps > ds) result = 'win';
        else if (ps < ds) result = 'lose';

        let delta = 0;
        if (result === 'win') delta = bet;
        else if (result === 'lose') delta = -bet;

        await addCoins(interaction.guildId, interaction.user.id, delta);
        const updated = await ensureRow(interaction.guildId, interaction.user.id);

        const embed = new EmbedBuilder()
          .setTitle('🃏 Blackjack')
          .setColor(0xFF00FF)
          .addFields(
            { name: 'Your hand', value: `${player.join(', ')} (score **${ps}**)`, inline: false },
            { name: 'Dealer hand', value: `${dealer.join(', ')} (score **${ds}**)`, inline: false },
            { name: 'Result', value: result === 'win' ? `✅ Win (+${bet})` : result === 'lose' ? `❌ Lose (-${bet})` : '🤝 Draw', inline: false },
            { name: 'Total coins', value: String(updated.coins), inline: true }
          )
          .setTimestamp();

        return interaction.reply({ embeds: [embed] });
      }
    },
    prefix: { async run(message, args) {
      const bet = parseInt(args[0], 10);
      if (!bet) return message.reply('Usage: `!blackjack <bet>`');
      if (bet < 1 || bet > 100000) return message.reply('Bet must be 1-100000.');
      const row = await ensureRow(message.guild.id, message.author.id);
      if (row.coins < bet) return message.reply('Not enough coins.');

      function draw() {
        const cards = [2,3,4,5,6,7,8,9,10,10,10,10,11];
        return cards[rand(0, cards.length-1)];
      }
      function score(hand) {
        let s = hand.reduce((a,b)=>a+b,0);
        let aces = hand.filter(x=>x===11).length;
        while (s > 21 && aces > 0) { s -= 10; aces--; }
        return s;
      }

      const player = [draw(), draw()];
      const dealer = [draw(), draw()];
      while (score(player) < 16) player.push(draw());
      while (score(dealer) < 17) dealer.push(draw());

      const ps = score(player);
      const ds = score(dealer);

      let result = 'draw';
      if (ps > 21 && ds > 21) result = 'draw';
      else if (ps > 21) result = 'lose';
      else if (ds > 21) result = 'win';
      else if (ps > ds) result = 'win';
      else if (ps < ds) result = 'lose';

      let delta = 0;
      if (result === 'win') delta = bet;
      else if (result === 'lose') delta = -bet;

      await addCoins(message.guild.id, message.author.id, delta);
      const updated = await ensureRow(message.guild.id, message.author.id);

      return message.reply(
        `🃏 Blackjack\n` +
        `You: ${player.join(', ')} (score ${ps})\n` +
        `Dealer: ${dealer.join(', ')} (score ${ds})\n` +
        `${result === 'win' ? `✅ Win (+${bet})` : result === 'lose' ? `❌ Lose (-${bet})` : '🤝 Draw'}\n` +
        `Total: **${updated.coins}** coins`
      );
    } }
  },

  {
    name: 'fish',
    aliases: ['fishing'],
    category: 'minigames',
    description: 'Go fishing (cooldown)',
    slash: {
      data: new SlashCommandBuilder().setName('fish').setDescription('Go fishing (cooldown ~10m)'),
      async run(interaction) {
        const row = await ensureRow(interaction.guildId, interaction.user.id);
        const ok = await canClaim('fish_at', row, 10*60*1000);
        if (!ok) {
          const next = new Date(new Date(row.fish_at).getTime() + 10*60*1000);
          return interaction.reply({ content: `🎣 You are tired. Try again ${toDiscordTs(next,'R')}.`, ephemeral: true });
        }

        const outcomes = [
          { msg: 'You caught a small fish 🐟', coins: 20 },
          { msg: 'You caught a big fish 🐠', coins: 60 },
          { msg: 'You caught trash 🥫', coins: 0 },
          { msg: 'You found a pearl 🦪', coins: 120 },
          { msg: 'Nothing bit... 🌊', coins: 0 }
        ];
        const pick = outcomes[rand(0, outcomes.length-1)];
        if (pick.coins > 0) await addCoins(interaction.guildId, interaction.user.id, pick.coins);
        await db.query(`UPDATE user_stats SET fish_at=now() WHERE guild_id=$1 AND user_id=$2`, [interaction.guildId, interaction.user.id]);
        const updated = await ensureRow(interaction.guildId, interaction.user.id);
        return interaction.reply(`🎣 ${pick.msg} ${pick.coins ? `(+${pick.coins} coins)` : ''}\nTotal: **${updated.coins}**`);
      }
    },
    prefix: { async run(message) {
      const row = await ensureRow(message.guild.id, message.author.id);
      const ok = await canClaim('fish_at', row, 10*60*1000);
      if (!ok) {
        const next = new Date(new Date(row.fish_at).getTime() + 10*60*1000);
        return message.reply(`🎣 You are tired. Try again ${toDiscordTs(next,'R')}.`);
      }
      const outcomes = [
        { msg: 'You caught a small fish 🐟', coins: 20 },
        { msg: 'You caught a big fish 🐠', coins: 60 },
        { msg: 'You caught trash 🥫', coins: 0 },
        { msg: 'You found a pearl 🦪', coins: 120 },
        { msg: 'Nothing bit... 🌊', coins: 0 }
      ];
      const pick = outcomes[rand(0, outcomes.length-1)];
      if (pick.coins > 0) await addCoins(message.guild.id, message.author.id, pick.coins);
      await db.query(`UPDATE user_stats SET fish_at=now() WHERE guild_id=$1 AND user_id=$2`, [message.guild.id, message.author.id]);
      const updated = await ensureRow(message.guild.id, message.author.id);
      return message.reply(`🎣 ${pick.msg} ${pick.coins ? `(+${pick.coins} coins)` : ''}\nTotal: **${updated.coins}**`);
    } }
  },

  {
    name: 'guess',
    category: 'minigames',
    description: 'Guess the number (session)',
    slash: {
      data: new SlashCommandBuilder().setName('guess').setDescription('Guess the number (1-100)'),
      async run(interaction) {
        const target = rand(1, 100);
        await interaction.reply('🔢 I picked a number **1-100**. Reply with your guesses (you have **7 tries**).');

        const filter = m => m.author.id === interaction.user.id && /^\d+$/.test(m.content.trim());
        const collector = interaction.channel.createMessageCollector({ filter, time: 60_000, max: 7 });

        let tries = 0;
        collector.on('collect', async (m) => {
          tries += 1;
          const g = parseInt(m.content.trim(), 10);
          if (g === target) {
            collector.stop('win');
            const reward = 150 + (7 - tries) * 20;
            await addCoins(interaction.guildId, interaction.user.id, reward);
            await m.reply(`✅ Correct! The number was **${target}**. You earned **${reward}** coins.`);
          } else {
            await m.reply(g < target ? '⬆️ Higher' : '⬇️ Lower');
          }
        });

        collector.on('end', async (_c, reason) => {
          if (reason !== 'win') {
            await interaction.followUp({ content: `⏱️ Game over! The number was **${target}**.`, ephemeral: true }).catch(()=>{});
          }
        });
      }
    },
    prefix: { async run(message) {
      const target = rand(1, 100);
      await message.reply('🔢 I picked a number **1-100**. Reply with your guesses (you have **7 tries**).');

      const filter = m => m.author.id === message.author.id && /^\d+$/.test(m.content.trim());
      const collector = message.channel.createMessageCollector({ filter, time: 60_000, max: 7 });

      let tries = 0;
      collector.on('collect', async (m) => {
        tries += 1;
        const g = parseInt(m.content.trim(), 10);
        if (g === target) {
          collector.stop('win');
          const reward = 150 + (7 - tries) * 20;
          await addCoins(message.guild.id, message.author.id, reward);
          await m.reply(`✅ Correct! The number was **${target}**. You earned **${reward}** coins.`);
        } else {
          await m.reply(g < target ? '⬆️ Higher' : '⬇️ Lower');
        }
      });

      collector.on('end', async (_c, reason) => {
        if (reason !== 'win') {
          await message.reply(`⏱️ Game over! The number was **${target}**.`);
        }
      });
    } }
  },

  {
    name: 'trivia',
    category: 'minigames',
    description: 'Trivia question (quick)',
    slash: {
      data: new SlashCommandBuilder().setName('trivia').setDescription('Trivia question (answer within 20s)'),
      async run(interaction) {
        const bank = [
          { q: 'What is the capital of Japan?', a: 'tokyo' },
          { q: 'How many continents are there?', a: '7' },
          { q: 'What planet is known as the Red Planet?', a: 'mars' },
          { q: 'In computing, what does CPU stand for?', a: 'central processing unit' },
          { q: 'What is 9 * 7?', a: '63' }
        ];
        const pick = bank[rand(0, bank.length-1)];
        await interaction.reply(`🧠 Trivia: **${pick.q}**\nReply in chat within **20 seconds**!`);

        const filter = m => m.author.id === interaction.user.id;
        const col = interaction.channel.createMessageCollector({ filter, time: 20_000, max: 1 });
        col.on('collect', async (m) => {
          const ans = m.content.trim().toLowerCase();
          if (ans === pick.a) {
            const reward = 120;
            await addCoins(interaction.guildId, interaction.user.id, reward);
            await m.reply(`✅ Correct! +**${reward}** coins.`);
          } else {
            await m.reply(`❌ Nope. Correct answer: **${pick.a}**`);
          }
        });
        col.on('end', async (c) => {
          if (c.size === 0) await interaction.followUp({ content: `⏱️ Time's up. Answer was: **${pick.a}**`, ephemeral: true }).catch(()=>{});
        });
      }
    },
    prefix: { async run(message) {
      const bank = [
        { q: 'What is the capital of Japan?', a: 'tokyo' },
        { q: 'How many continents are there?', a: '7' },
        { q: 'What planet is known as the Red Planet?', a: 'mars' },
        { q: 'In computing, what does CPU stand for?', a: 'central processing unit' },
        { q: 'What is 9 * 7?', a: '63' }
      ];
      const pick = bank[rand(0, bank.length-1)];
      await message.reply(`🧠 Trivia: **${pick.q}**\nReply within **20 seconds**!`);

      const filter = m => m.author.id === message.author.id;
      const col = message.channel.createMessageCollector({ filter, time: 20_000, max: 1 });
      col.on('collect', async (m) => {
        const ans = m.content.trim().toLowerCase();
        if (ans === pick.a) {
          const reward = 120;
          await addCoins(message.guild.id, message.author.id, reward);
          await m.reply(`✅ Correct! +${reward} coins.`);
        } else {
          await m.reply(`❌ Nope. Correct answer: **${pick.a}**`);
        }
      });
      col.on('end', async (c) => {
        if (c.size === 0) await message.reply(`⏱️ Time's up. Answer was: **${pick.a}**`);
      });
    } }
  }
];
