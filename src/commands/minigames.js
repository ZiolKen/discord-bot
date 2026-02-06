const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getOrCreate, addCoins, trySpendCoins, setClaim, cooldownReady } = require('../services/economy');
const { createSession, endSession } = require('../services/gameSessions');
const db = require('../db');
const { toDiscordTs } = require('../utils/time');

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function buildDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const deck = [];
  for (const s of suits) {
    for (const r of ranks) {
      const v = r === 'A' ? 11 : ['J','Q','K'].includes(r) ? 10 : parseInt(r, 10);
      deck.push({ r, s, v });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rand(0, i);
    const t = deck[i];
    deck[i] = deck[j];
    deck[j] = t;
  }
  return deck;
}

function handScore(hand) {
  let s = hand.reduce((a, c) => a + c.v, 0);
  let aces = hand.filter(c => c.r === 'A').length;
  while (s > 21 && aces > 0) {
    s -= 10;
    aces -= 1;
  }
  return s;
}

function fmtHand(hand) {
  return hand.map(c => `${c.r}${c.s}`).join(' ');
}

function disableRows(rows) {
  return (rows || []).map(r => {
    const comps = (r.components || []).map(b => ButtonBuilder.from(b).setDisabled(true));
    return new ActionRowBuilder().addComponents(...comps);
  });
}

function blackjackControls(sessionId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`g:${sessionId}:hit`).setLabel('Hit').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`g:${sessionId}:stand`).setLabel('Stand').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`g:${sessionId}:quit`).setLabel('Quit').setStyle(ButtonStyle.Danger)
    )
  ];
}

function blackjackEmbed(state, revealDealer, resultText) {
  const ps = handScore(state.player);
  const ds = revealDealer ? handScore(state.dealer) : null;

  const embed = new EmbedBuilder()
    .setTitle('🃏 Blackjack')
    .setColor(0xFF00FF)
    .addFields(
      { name: 'Your hand', value: `${fmtHand(state.player)} (score **${ps}**)`, inline: false },
      revealDealer
        ? { name: 'Dealer hand', value: `${fmtHand(state.dealer)} (score **${ds}**)`, inline: false }
        : { name: 'Dealer shows', value: `${state.dealer[0].r}${state.dealer[0].s} ??`, inline: false }
    )
    .setTimestamp();

  if (typeof resultText === 'string' && resultText.length) {
    embed.addFields({ name: 'Result', value: resultText, inline: false });
  }

  return embed;
}

function blackjackDealerPlay(state) {
  while (handScore(state.dealer) < 17) state.dealer.push(state.deck.pop());
}

function blackjackResult(state) {
  const ps = handScore(state.player);
  blackjackDealerPlay(state);
  const ds = handScore(state.dealer);

  if (ps > 21) return { outcome: 'lose', ps, ds };
  if (ds > 21) return { outcome: 'win', ps, ds };
  if (ps > ds) return { outcome: 'win', ps, ds };
  if (ps < ds) return { outcome: 'lose', ps, ds };
  return { outcome: 'push', ps, ds };
}

const TTT_LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];

function tttWinner(board) {
  for (const [a,b,c] of TTT_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

function tttFull(board) {
  return board.every(Boolean);
}

function tttBestMove(board) {
  const empties = [];
  for (let i = 0; i < 9; i++) if (!board[i]) empties.push(i);

  for (const i of empties) {
    board[i] = 'O';
    if (tttWinner(board) === 'O') { board[i] = null; return i; }
    board[i] = null;
  }
  for (const i of empties) {
    board[i] = 'X';
    if (tttWinner(board) === 'X') { board[i] = null; return i; }
    board[i] = null;
  }

  if (!board[4]) return 4;
  const corners = [0,2,6,8].filter(i => !board[i]);
  if (corners.length) return corners[rand(0, corners.length - 1)];
  return empties.length ? empties[rand(0, empties.length - 1)] : -1;
}

function tttComponents(sessionId, board, done) {
  const label = v => (v === 'X' ? 'X' : v === 'O' ? 'O' : '·');
  const style = v => (v === 'X' ? ButtonStyle.Danger : v === 'O' ? ButtonStyle.Success : ButtonStyle.Secondary);

  const rows = [];
  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 3; c++) {
      const i = r * 3 + c;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`g:${sessionId}:m${i}`)
          .setLabel(label(board[i]))
          .setStyle(style(board[i]))
          .setDisabled(done || Boolean(board[i]))
      );
    }
    rows.push(row);
  }
  return rows;
}

function tttEmbed(board, statusText) {
  const toCell = v => (v === 'X' ? '❌' : v === 'O' ? '⭕' : '⬛');
  const grid =
    `${toCell(board[0])}${toCell(board[1])}${toCell(board[2])}\n` +
    `${toCell(board[3])}${toCell(board[4])}${toCell(board[5])}\n` +
    `${toCell(board[6])}${toCell(board[7])}${toCell(board[8])}`;

  const embed = new EmbedBuilder()
    .setTitle('🎮 Tic-Tac-Toe')
    .setColor(0xFF00FF)
    .setDescription(grid)
    .setTimestamp();

  if (statusText) embed.addFields({ name: 'Status', value: statusText, inline: false });
  return embed;
}

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
    aliases: ['cf'],
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
    aliases: ['bal','cash','coin','coins','money'],
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
    aliases: ['dl'],
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
    aliases: ['wl'],
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
    aliases: ['gb'],
    category: 'minigames',
    description: 'Gamble coins (50/50)',
    slash: {
      data: new SlashCommandBuilder()
        .setName('gamble')
        .setDescription('Gamble coins (50/50)')
        .addIntegerOption(o => o.setName('amount').setDescription('Bet amount').setRequired(true)),
      async run(interaction) {
        const amount = interaction.options.getInteger('amount');
        if (!Number.isInteger(amount) || amount < 1 || amount > 100000) {
          return interaction.reply({ content: 'Amount must be 1-100000.', ephemeral: true });
        }

        const left = await trySpendCoins(interaction.guildId, interaction.user.id, amount);
        if (left === null) return interaction.reply({ content: 'Not enough coins.', ephemeral: true });

        const win = Math.random() < 0.5;
        if (win) await addCoins(interaction.guildId, interaction.user.id, amount * 2);

        const updated = await ensureRow(interaction.guildId, interaction.user.id);
        return interaction.reply(`${win ? '✅ You won' : '❌ You lost'} **${amount}** coins. Total: **${updated.coins}**`);
      }
    },
    prefix: {
      async run(message, args) {
        const amount = parseInt(args[0], 10);
        if (!Number.isInteger(amount)) return message.reply('Usage: `!gamble <amount>`');
        if (amount < 1 || amount > 100000) return message.reply('Amount must be 1-100000.');

        const left = await trySpendCoins(message.guild.id, message.author.id, amount);
        if (left === null) return message.reply('Not enough coins.');

        const win = Math.random() < 0.5;
        if (win) await addCoins(message.guild.id, message.author.id, amount * 2);

        const updated = await ensureRow(message.guild.id, message.author.id);
        return message.reply(`${win ? '✅ You won' : '❌ You lost'} ${amount} coins. Total: **${updated.coins}**`);
      }
    }
  },

  {
    name: 'slots',
    aliases: ['sl'],
    category: 'minigames',
    description: 'Slot machine',
    slash: {
      data: new SlashCommandBuilder()
        .setName('slots')
        .setDescription('Play slots')
        .addIntegerOption(o => o.setName('bet').setDescription('Bet amount').setRequired(true)),
      async run(interaction) {
        const bet = interaction.options.getInteger('bet');
        if (!Number.isInteger(bet) || bet < 1 || bet > 100000) {
          return interaction.reply({ content: 'Bet must be 1-100000.', ephemeral: true });
        }

        const left = await trySpendCoins(interaction.guildId, interaction.user.id, bet);
        if (left === null) return interaction.reply({ content: 'Not enough coins.', ephemeral: true });

        const symbols = ['🍒','🍋','🍉','⭐','💎'];
        const a = symbols[rand(0, 4)];
        const b = symbols[rand(0, 4)];
        const c = symbols[rand(0, 4)];

        let mult = 0;
        if (a === b && b === c) mult = a === '💎' ? 5 : 3;
        else if (a === b || b === c || a === c) mult = 1;

        const payout = mult > 0 ? bet * (mult + 1) : 0;
        if (payout) await addCoins(interaction.guildId, interaction.user.id, payout);

        const updated = await ensureRow(interaction.guildId, interaction.user.id);
        const delta = mult === 0 ? -bet : bet * mult;

        return interaction.reply(`🎰 ${a} ${b} ${c}\n${mult === 0 ? '❌ Lose' : `✅ Win x${mult}`} (**${delta}** coins)\nTotal: **${updated.coins}**`);
      }
    },
    prefix: {
      async run(message, args) {
        const bet = parseInt(args[0], 10);
        if (!Number.isInteger(bet)) return message.reply('Usage: `!slots <bet>`');
        if (bet < 1 || bet > 100000) return message.reply('Bet must be 1-100000.');

        const left = await trySpendCoins(message.guild.id, message.author.id, bet);
        if (left === null) return message.reply('Not enough coins.');

        const symbols = ['🍒','🍋','🍉','⭐','💎'];
        const a = symbols[rand(0, 4)];
        const b = symbols[rand(0, 4)];
        const c = symbols[rand(0, 4)];

        let mult = 0;
        if (a === b && b === c) mult = a === '💎' ? 5 : 3;
        else if (a === b || b === c || a === c) mult = 1;

        const payout = mult > 0 ? bet * (mult + 1) : 0;
        if (payout) await addCoins(message.guild.id, message.author.id, payout);

        const updated = await ensureRow(message.guild.id, message.author.id);
        const delta = mult === 0 ? -bet : bet * mult;

        return message.reply(`🎰 ${a} ${b} ${c}\n${mult === 0 ? '❌ Lose' : `✅ Win x${mult}`} (${delta} coins)\nTotal: **${updated.coins}**`);
      }
    }
  },

  {
    name: 'blackjack',
    aliases: ['bj'],
    category: 'minigames',
    description: 'Blackjack vs dealer',
    slash: {
      data: new SlashCommandBuilder()
        .setName('blackjack')
        .setDescription('Play blackjack (interactive)')
        .addIntegerOption(o => o.setName('bet').setDescription('Bet amount').setRequired(true)),
      async run(interaction) {
        const bet = interaction.options.getInteger('bet');
        if (!Number.isInteger(bet) || bet < 1 || bet > 100000) {
          return interaction.reply({ content: 'Bet must be 1-100000.', ephemeral: true });
        }

        const left = await trySpendCoins(interaction.guildId, interaction.user.id, bet);
        if (left === null) return interaction.reply({ content: 'Not enough coins.', ephemeral: true });

        const state = {
          bet,
          deck: buildDeck(),
          player: [],
          dealer: []
        };
        state.player.push(state.deck.pop(), state.deck.pop());
        state.dealer.push(state.deck.pop(), state.deck.pop());

        const ps0 = handScore(state.player);
        const ds0 = handScore(state.dealer);

        const playerBJ = ps0 === 21 && state.player.length === 2;
        const dealerBJ = ds0 === 21 && state.dealer.length === 2;

        const settleImmediate = async () => {
          let resultText = '🤝 Push (refund)';
          let payout = bet;
          if (playerBJ && !dealerBJ) {
            payout = Math.floor(bet * 2.5);
            resultText = `🟣 Blackjack! (+${payout - bet})`;
          } else if (!playerBJ && dealerBJ) {
            payout = 0;
            resultText = `❌ Dealer blackjack (-${bet})`;
          }
          if (payout) await addCoins(interaction.guildId, interaction.user.id, payout);
          const updated = await ensureRow(interaction.guildId, interaction.user.id);
          const embed = blackjackEmbed(state, true, resultText).addFields({ name: 'Total coins', value: String(updated.coins), inline: true });
          return interaction.reply({ embeds: [embed] });
        };

        if (playerBJ || dealerBJ) return settleImmediate();

        const sessionId = createSession({
          type: 'blackjack',
          ownerId: interaction.user.id,
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          state,
          async onAction(btn, action, s) {
            const st = s.state;

            const finish = async (outcome) => {
              let resultText = '🤝 Push (refund)';
              let payout = st.bet;

              if (outcome === 'win') { resultText = `✅ Win (+${st.bet})`; payout = st.bet * 2; }
              if (outcome === 'lose') { resultText = `❌ Lose (-${st.bet})`; payout = 0; }

              if (payout) await addCoins(btn.guildId, s.ownerId, payout);
              const updated = await ensureRow(btn.guildId, s.ownerId);

              const embed = blackjackEmbed(st, true, resultText)
                .addFields({ name: 'Total coins', value: String(updated.coins), inline: true });

              endSession(s.id);
              return btn.update({ embeds: [embed], components: disableRows(btn.message.components) }).catch(() => {});
            };

            const refresh = async () => {
              const embed = blackjackEmbed(st, false, `Bet: **${st.bet}** coins`);
              return btn.update({ embeds: [embed], components: blackjackControls(s.id) }).catch(() => {});
            };

            if (action === 'hit') {
              st.player.push(st.deck.pop());
              if (handScore(st.player) > 21) return finish('lose');
              return refresh();
            }

            if (action === 'stand') {
              const { outcome } = blackjackResult(st);
              return finish(outcome);
            }

            if (action === 'quit') return finish('lose');

            return btn.deferUpdate().catch(() => {});
          }
        });

        const embed = blackjackEmbed(state, false, `Bet: **${bet}** coins`);
        return interaction.reply({ embeds: [embed], components: blackjackControls(sessionId) });
      }
    },
    prefix: {
      async run(message, args) {
        const bet = parseInt(args[0], 10);
        if (!Number.isInteger(bet)) return message.reply('Usage: `!blackjack <bet>`');
        if (bet < 1 || bet > 100000) return message.reply('Bet must be 1-100000.');

        const left = await trySpendCoins(message.guild.id, message.author.id, bet);
        if (left === null) return message.reply('Not enough coins.');

        const state = {
          bet,
          deck: buildDeck(),
          player: [],
          dealer: []
        };
        state.player.push(state.deck.pop(), state.deck.pop());
        state.dealer.push(state.deck.pop(), state.deck.pop());

        const ps0 = handScore(state.player);
        const ds0 = handScore(state.dealer);

        const playerBJ = ps0 === 21 && state.player.length === 2;
        const dealerBJ = ds0 === 21 && state.dealer.length === 2;

        const settleImmediate = async () => {
          let resultText = '🤝 Push (refund)';
          let payout = bet;
          if (playerBJ && !dealerBJ) {
            payout = Math.floor(bet * 2.5);
            resultText = `🟣 Blackjack! (+${payout - bet})`;
          } else if (!playerBJ && dealerBJ) {
            payout = 0;
            resultText = `❌ Dealer blackjack (-${bet})`;
          }
          if (payout) await addCoins(message.guild.id, message.author.id, payout);
          const updated = await ensureRow(message.guild.id, message.author.id);
          const embed = blackjackEmbed(state, true, resultText).addFields({ name: 'Total coins', value: String(updated.coins), inline: true });
          return message.reply({ embeds: [embed] });
        };

        if (playerBJ || dealerBJ) return settleImmediate();

        const sessionId = createSession({
          type: 'blackjack',
          ownerId: message.author.id,
          guildId: message.guild.id,
          channelId: message.channelId,
          state,
          async onAction(btn, action, s) {
            const st = s.state;

            const finish = async (outcome) => {
              let resultText = '🤝 Push (refund)';
              let payout = st.bet;

              if (outcome === 'win') { resultText = `✅ Win (+${st.bet})`; payout = st.bet * 2; }
              if (outcome === 'lose') { resultText = `❌ Lose (-${st.bet})`; payout = 0; }

              if (payout) await addCoins(btn.guildId, s.ownerId, payout);
              const updated = await ensureRow(btn.guildId, s.ownerId);

              const embed = blackjackEmbed(st, true, resultText)
                .addFields({ name: 'Total coins', value: String(updated.coins), inline: true });

              endSession(s.id);
              return btn.update({ embeds: [embed], components: disableRows(btn.message.components) }).catch(() => {});
            };

            const refresh = async () => {
              const embed = blackjackEmbed(st, false, `Bet: **${st.bet}** coins`);
              return btn.update({ embeds: [embed], components: blackjackControls(s.id) }).catch(() => {});
            };

            if (action === 'hit') {
              st.player.push(st.deck.pop());
              if (handScore(st.player) > 21) return finish('lose');
              return refresh();
            }

            if (action === 'stand') {
              const { outcome } = blackjackResult(st);
              return finish(outcome);
            }

            if (action === 'quit') return finish('lose');

            return btn.deferUpdate().catch(() => {});
          }
        });

        const embed = blackjackEmbed(state, false, `Bet: **${bet}** coins`);
        return message.reply({ embeds: [embed], components: blackjackControls(sessionId) });
      }
    }
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
        await setClaim(interaction.guildId, interaction.user.id, 'fish_at');
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
      await setClaim(message.guild.id, message.author.id, 'fish_at');
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
    name: 'tictactoe',
    aliases: ['ttt'],
    category: 'minigames',
    description: 'Tic-Tac-Toe vs bot',
    slash: {
      data: new SlashCommandBuilder().setName('tictactoe').setDescription('Play Tic-Tac-Toe vs bot (buttons)'),
      async run(interaction) {
        const board = Array(9).fill(null);

        const sessionId = createSession({
          type: 'tictactoe',
          ownerId: interaction.user.id,
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          state: { board, done: false },
          async onAction(btn, action, s) {
            const st = s.state;

            const end = async (statusText) => {
              st.done = true;
              if (statusText.includes('(+80 coins)')) await addCoins(btn.guildId, s.ownerId, 80);
              if (statusText.includes('(+30 coins)')) await addCoins(btn.guildId, s.ownerId, 30);
              const embed = tttEmbed(st.board, statusText);
              endSession(s.id);
              return btn.update({ embeds: [embed], components: disableRows(btn.message.components) }).catch(() => {});
            };

            if (st.done) return btn.deferUpdate().catch(() => {});
            if (!action.startsWith('m')) return btn.deferUpdate().catch(() => {});
            const idx = parseInt(action.slice(1), 10);
            if (!Number.isInteger(idx) || idx < 0 || idx > 8) return btn.deferUpdate().catch(() => {});
            if (st.board[idx]) return btn.reply({ content: 'That spot is taken.', ephemeral: true }).catch(() => {});

            st.board[idx] = 'X';
            const w1 = tttWinner(st.board);
            if (w1 === 'X') return end('✅ You win! (+80 coins)');
            if (tttFull(st.board)) return end('🤝 Draw (+30 coins)');

            const botMove = tttBestMove(st.board);
            if (botMove >= 0) st.board[botMove] = 'O';

            const w2 = tttWinner(st.board);
            if (w2 === 'O') return end('❌ You lose');
            if (tttFull(st.board)) return end('🤝 Draw (+30 coins)');

            const embed = tttEmbed(st.board, 'Your turn');
            return btn.update({ embeds: [embed], components: tttComponents(s.id, st.board, false) }).catch(() => {});
          }
        });

        const embed = tttEmbed(board, 'Your turn');
        return interaction.reply({ embeds: [embed], components: tttComponents(sessionId, board, false) });
      }
    },
    prefix: {
      async run(message) {
        const board = Array(9).fill(null);

        const sessionId = createSession({
          type: 'tictactoe',
          ownerId: message.author.id,
          guildId: message.guild.id,
          channelId: message.channelId,
          state: { board, done: false },
          async onAction(btn, action, s) {
            const st = s.state;

            const end = async (statusText) => {
              st.done = true;
              if (statusText.includes('(+80 coins)')) await addCoins(btn.guildId, s.ownerId, 80);
              if (statusText.includes('(+30 coins)')) await addCoins(btn.guildId, s.ownerId, 30);
              const embed = tttEmbed(st.board, statusText);
              endSession(s.id);
              return btn.update({ embeds: [embed], components: disableRows(btn.message.components) }).catch(() => {});
            };

            if (st.done) return btn.deferUpdate().catch(() => {});
            if (!action.startsWith('m')) return btn.deferUpdate().catch(() => {});
            const idx = parseInt(action.slice(1), 10);
            if (!Number.isInteger(idx) || idx < 0 || idx > 8) return btn.deferUpdate().catch(() => {});
            if (st.board[idx]) return btn.reply({ content: 'That spot is taken.', ephemeral: true }).catch(() => {});

            st.board[idx] = 'X';
            const w1 = tttWinner(st.board);
            if (w1 === 'X') return end('✅ You win! (+80 coins)');
            if (tttFull(st.board)) return end('🤝 Draw (+30 coins)');

            const botMove = tttBestMove(st.board);
            if (botMove >= 0) st.board[botMove] = 'O';

            const w2 = tttWinner(st.board);
            if (w2 === 'O') return end('❌ You lose');
            if (tttFull(st.board)) return end('🤝 Draw (+30 coins)');

            const embed = tttEmbed(st.board, 'Your turn');
            return btn.update({ embeds: [embed], components: tttComponents(s.id, st.board, false) }).catch(() => {});
          }
        });

        const embed = tttEmbed(board, 'Your turn');
        return message.reply({ embeds: [embed], components: tttComponents(sessionId, board, false) });
      }
    }
  }

];
