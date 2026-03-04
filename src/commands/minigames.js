const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getOrCreate, claimDaily, claimWeekly, DAILY_COOLDOWN_MS, WEEKLY_COOLDOWN_MS } = require('../services/economy');
const { createSession, endSession } = require('../services/gameSessions');
const db = require('../db');
const { toDiscordTs } = require('../utils/time');
const { randInt } = require('../services/casino');
const gathering = require('../services/gathering');

const TTT_LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];

function disableRows(rows) {
  return (rows || []).map(r => {
    const comps = (r.components || []).map(b => ButtonBuilder.from(b).setDisabled(true));
    return new ActionRowBuilder().addComponents(...comps);
  });
}

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
  if (corners.length) return corners[randInt(0, corners.length - 1)];
  return empties.length ? empties[randInt(0, empties.length - 1)] : -1;
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

module.exports = [
  {
    name: 'coinflip',
    aliases: ['cf'],
    category: 'minigames',
    description: 'Flip a coin',
    slash: {
      data: new SlashCommandBuilder().setName('coinflip').setDescription('Flip a coin'),
      async run(interaction) {
        return interaction.reply(`🪙 ${randInt(0, 1) === 0 ? 'Heads' : 'Tails'}`);
      }
    },
    prefix: { async run(message) { return message.reply(`🪙 ${randInt(0, 1) === 0 ? 'Heads' : 'Tails'}`); } }
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
        if (!Number.isInteger(sides) || sides < 2 || sides > 1000) return interaction.reply({ content: 'Sides must be 2-1000.', ephemeral: true });
        return interaction.reply(`🎲 You rolled **${randInt(1, sides)}** (d${sides})`);
      }
    },
    prefix: { async run(message, args) {
      const sides = parseInt(args[0], 10) || 6;
      if (!Number.isInteger(sides) || sides < 2 || sides > 1000) return message.reply('Sides must be 2-1000.');
      return message.reply(`🎲 You rolled **${randInt(1, sides)}** (d${sides})`);
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
        const bot = ['rock','paper','scissors'][randInt(0, 2)];
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
      const bot = ['rock','paper','scissors'][randInt(0, 2)];
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
        const out = await claimDaily(interaction.guildId, interaction.user.id);
        if (!out.ok) return interaction.reply({ content: `⏳ Already claimed. Try again ${toDiscordTs(out.nextAt, 'R')}.`, ephemeral: true });
        const streak = Number(out.streak) || 0;
        const bonus = streak > 1 ? ` (streak **${streak}**)` : '';
        return interaction.reply(`🎁 Daily claimed: +**${out.gain}** coins${bonus}. Total: **${out.coins}**\nNext: ${toDiscordTs(out.nextAt || new Date(Date.now() + DAILY_COOLDOWN_MS), 'R')}`);
      }
    },
    prefix: { async run(message) {
      const out = await claimDaily(message.guild.id, message.author.id);
      if (!out.ok) return message.reply(`⏳ Already claimed. Try again ${toDiscordTs(out.nextAt, 'R')}.`);
      const streak = Number(out.streak) || 0;
      const bonus = streak > 1 ? ` (streak **${streak}**)` : '';
      return message.reply(`🎁 Daily claimed: +**${out.gain}** coins${bonus}. Total: **${out.coins}**\nNext: ${toDiscordTs(out.nextAt || new Date(Date.now() + DAILY_COOLDOWN_MS), 'R')}`);
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
        const out = await claimWeekly(interaction.guildId, interaction.user.id);
        if (!out.ok) return interaction.reply({ content: `⏳ Already claimed. Try again ${toDiscordTs(out.nextAt, 'R')}.`, ephemeral: true });
        const streak = Number(out.streak) || 0;
        const bonus = streak > 1 ? ` (streak **${streak}**)` : '';
        return interaction.reply(`🎁 Weekly claimed: +**${out.gain}** coins${bonus}. Total: **${out.coins}**\nNext: ${toDiscordTs(out.nextAt || new Date(Date.now() + WEEKLY_COOLDOWN_MS), 'R')}`);
      }
    },
    prefix: { async run(message) {
      const out = await claimWeekly(message.guild.id, message.author.id);
      if (!out.ok) return message.reply(`⏳ Already claimed. Try again ${toDiscordTs(out.nextAt, 'R')}.`);
      const streak = Number(out.streak) || 0;
      const bonus = streak > 1 ? ` (streak **${streak}**)` : '';
      return message.reply(`🎁 Weekly claimed: +**${out.gain}** coins${bonus}. Total: **${out.coins}**\nNext: ${toDiscordTs(out.nextAt || new Date(Date.now() + WEEKLY_COOLDOWN_MS), 'R')}`);
    } }
  },

  {
    name: 'leaderboard',
    aliases: ['lb','top'],
    category: 'minigames',
    description: 'Top coin holders',
    slash: {
      data: new SlashCommandBuilder().setName('leaderboard').setDescription('Show coin leaderboard'),
      async run(interaction) {
        const { rows } = await db.queryGuild(
          interaction.guildId,
          `SELECT user_id, coins FROM user_stats WHERE guild_id=$1 ORDER BY coins DESC NULLS LAST LIMIT 10`,
          [interaction.guildId]
        );
        if (!rows.length) return interaction.reply('No leaderboard data yet.');
        const lines = rows.map((r, i) => `${i+1}. <@${r.user_id}> — **${r.coins}**`);
        return interaction.reply(`🏆 Coin leaderboard\n${lines.join('\n')}`);
      }
    },
    prefix: { async run(message) {
      const { rows } = await db.queryGuild(
        message.guild.id,
        `SELECT user_id, coins FROM user_stats WHERE guild_id=$1 ORDER BY coins DESC NULLS LAST LIMIT 10`,
        [message.guild.id]
      );
      if (!rows.length) return message.reply('No leaderboard data yet.');
      const lines = rows.map((r, i) => `${i+1}. <@${r.user_id}> — **${r.coins}**`);
      return message.reply(`🏆 Coin leaderboard\n${lines.join('\n')}`);
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
        const out = await gathering.fish(interaction.guildId, interaction.user.id);
        if (!out.ok) {
          const extra = out.boostsLeft ? ` Boost charges: **${out.boostsLeft}**.` : '';
          return interaction.reply({ content: `🎣 You are tired. Try again ${toDiscordTs(out.nextAt, 'R')}.${extra}`, ephemeral: true });
        }

        const boostText = out.boostUsed ? ` (boost used, ${out.boostsLeft} left)` : out.boostsLeft ? ` (boosts left: ${out.boostsLeft})` : '';
        if (out.nothing) return interaction.reply(`🎣 Nothing bit... 🌊${boostText}`);

        return interaction.reply(`🎣 You caught ${out.item.emoji ? `${out.item.emoji} ` : ''}**${out.item.name}** × **${out.qty}**${boostText}\nUse \`/sell ${out.item.id} ${out.qty}\` or \`/market list\` to trade with others.`);
      }
    },
    prefix: { async run(message) {
      const out = await gathering.fish(message.guild.id, message.author.id);
      if (!out.ok) {
        const extra = out.boostsLeft ? ` Boost charges: ${out.boostsLeft}.` : '';
        return message.reply(`🎣 You are tired. Try again ${toDiscordTs(out.nextAt, 'R')}.${extra}`);
      }

      const boostText = out.boostUsed ? ` (boost used, ${out.boostsLeft} left)` : out.boostsLeft ? ` (boosts left: ${out.boostsLeft})` : '';
      if (out.nothing) return message.reply(`🎣 Nothing bit... 🌊${boostText}`);

      return message.reply(`🎣 You caught ${out.item.emoji ? `${out.item.emoji} ` : ''}**${out.item.name}** × **${out.qty}**${boostText}\nUse \`!sell ${out.item.id} ${out.qty}\` or \`!market list\` to trade.`);
    } }
  },

  {
    name: 'hunt',
    aliases: ['hunting'],
    category: 'minigames',
    description: 'Go hunting (cooldown)',
    slash: {
      data: new SlashCommandBuilder().setName('hunt').setDescription('Go hunting (cooldown ~30m)'),
      async run(interaction) {
        const out = await gathering.hunt(interaction.guildId, interaction.user.id);
        if (!out.ok) {
          const extra = out.boostsLeft ? ` Boost charges: **${out.boostsLeft}**.` : '';
          return interaction.reply({ content: `🏹 You need to rest. Try again ${toDiscordTs(out.nextAt, 'R')}.${extra}`, ephemeral: true });
        }

        const boostText = out.boostUsed ? ` (boost used, ${out.boostsLeft} left)` : out.boostsLeft ? ` (boosts left: ${out.boostsLeft})` : '';
        if (out.nothing) return interaction.reply(`🏹 You found nothing... 🍃${boostText}`);

        return interaction.reply(`🏹 You got ${out.item.emoji ? `${out.item.emoji} ` : ''}**${out.item.name}** × **${out.qty}**${boostText}\nUse \`/sell ${out.item.id} ${out.qty}\` or \`/market list\` to trade with others.`);
      }
    },
    prefix: { async run(message) {
      const out = await gathering.hunt(message.guild.id, message.author.id);
      if (!out.ok) {
        const extra = out.boostsLeft ? ` Boost charges: ${out.boostsLeft}.` : '';
        return message.reply(`🏹 You need to rest. Try again ${toDiscordTs(out.nextAt, 'R')}.${extra}`);
      }

      const boostText = out.boostUsed ? ` (boost used, ${out.boostsLeft} left)` : out.boostsLeft ? ` (boosts left: ${out.boostsLeft})` : '';
      if (out.nothing) return message.reply(`🏹 You found nothing... 🍃${boostText}`);

      return message.reply(`🏹 You got ${out.item.emoji ? `${out.item.emoji} ` : ''}**${out.item.name}** × **${out.qty}**${boostText}\nUse \`!sell ${out.item.id} ${out.qty}\` or \`!market list\` to trade.`);
    } }
  },

{
    name: 'guess',
    category: 'minigames',
    description: 'Guess the number (session)',
    slash: {
      data: new SlashCommandBuilder().setName('guess').setDescription('Guess the number (1-100)'),
      async run(interaction) {
        const target = randInt(1, 100);
        await interaction.reply('🔢 I picked a number **1-100**. Reply with your guesses (you have **7 tries**).');

        const filter = m => m.author.id === interaction.user.id && /^\d+$/.test(m.content.trim());
        const collector = interaction.channel.createMessageCollector({ filter, time: 60_000, max: 7 });

        let tries = 0;
        collector.on('collect', async (m) => {
          tries += 1;
          const g = parseInt(m.content.trim(), 10);
          if (g === target) {
            collector.stop('win');
            await m.reply(`✅ Correct! The number was **${target}**. Tries: **${tries}**/7.`);
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
      const target = randInt(1, 100);
      await message.reply('🔢 I picked a number **1-100**. Reply with your guesses (you have **7 tries**).');

      const filter = m => m.author.id === message.author.id && /^\d+$/.test(m.content.trim());
      const collector = message.channel.createMessageCollector({ filter, time: 60_000, max: 7 });

      let tries = 0;
      collector.on('collect', async (m) => {
        tries += 1;
        const g = parseInt(m.content.trim(), 10);
        if (g === target) {
          collector.stop('win');
          await m.reply(`✅ Correct! The number was **${target}**. Tries: **${tries}**/7.`);
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
      data: new SlashCommandBuilder().setName('tictactoe').setDescription('Play Tic-Tac-Toe vs bot'),
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
            if (w1 === 'X') return end('✅ You win!');
            if (tttFull(st.board)) return end('🤝 Draw');

            const botMove = tttBestMove(st.board);
            if (botMove >= 0) st.board[botMove] = 'O';

            const w2 = tttWinner(st.board);
            if (w2 === 'O') return end('❌ You lose');
            if (tttFull(st.board)) return end('🤝 Draw');

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
            if (w1 === 'X') return end('✅ You win!');
            if (tttFull(st.board)) return end('🤝 Draw');

            const botMove = tttBestMove(st.board);
            if (botMove >= 0) st.board[botMove] = 'O';

            const w2 = tttWinner(st.board);
            if (w2 === 'O') return end('❌ You lose');
            if (tttFull(st.board)) return end('🤝 Draw');

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
