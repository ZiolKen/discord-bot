const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getOrCreate, addCoins, trySpendCoins } = require('../services/economy');
const { createSession, endSession } = require('../services/gameSessions');
const { randInt, randFloat, normalizeBet, applyHouseFeeToProfit, payoutFromBetAndProfit, weightedPick } = require('../services/casino');

async function ensureRow(guildId, userId) {
  return getOrCreate(guildId, userId);
}

function fmtDelta(n) {
  if (n > 0) return `+${n}`;
  if (n < 0) return `${n}`;
  return '0';
}


function lastIntArg(args) {
  for (let i = args.length - 1; i >= 0; i--) {
    const s = String(args[i] || '');
    if (/^\d+$/.test(s)) return parseInt(s, 10);
  }
  return null;
}

function safeReply(target, payload) {
  if (target?.reply) return target.reply(payload);
  return target.channel.send(payload);
}

function safeError(target, msg) {
  const payload = target?.reply ? { content: msg, ephemeral: true } : msg;
  return safeReply(target, payload);
}

function rollSymbols() {
  const symbols = ['🍒','🍋','🍉','⭐','💎'];
  return [symbols[randInt(0, 4)], symbols[randInt(0, 4)], symbols[randInt(0, 4)]];
}

function rouletteColor(n) {
  if (n === 0) return 'green';
  const reds = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  return reds.has(n) ? 'red' : 'black';
}

function kenoParsePick(s) {
  const raw = String(s || '').trim();
  if (!raw) return { ok: false, error: 'Provide numbers like `1, 2, 3` (1-40), up to 10 picks.' };
  const parts = raw.split(/[\s,]+/).filter(Boolean);
  if (parts.length < 1 || parts.length > 10) return { ok: false, error: 'Pick 1-10 numbers (1-40).' };
  const nums = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return { ok: false, error: 'Only numbers are allowed.' };
    const n = parseInt(p, 10);
    if (n < 1 || n > 40) return { ok: false, error: 'Numbers must be 1-40.' };
    if (nums.includes(n)) return { ok: false, error: 'No duplicates.' };
    nums.push(n);
  }
  return { ok: true, nums };
}

function kenoDraw() {
  const set = new Set();
  while (set.size < 10) set.add(randInt(1, 40));
  return [...set].sort((a, b) => a - b);
}

const KENO_PAYOUT = {
  1: { 1: 3 },
  2: { 2: 9, 1: 1 },
  3: { 3: 16, 2: 2 },
  4: { 4: 50, 3: 5, 2: 1 },
  5: { 5: 150, 4: 15, 3: 2 },
  6: { 6: 400, 5: 60, 4: 5, 3: 1 },
  7: { 7: 800, 6: 200, 5: 20, 4: 2 },
  8: { 8: 2000, 7: 500, 6: 70, 5: 10, 4: 2 },
  9: { 9: 5000, 8: 1000, 7: 200, 6: 20, 5: 5 },
  10: { 10: 10000, 9: 2000, 8: 500, 7: 50, 6: 10, 5: 2 }
};

function diceHand(d) {
  const c = new Map();
  for (const x of d) c.set(x, (c.get(x) || 0) + 1);
  const counts = [...c.values()].sort((a, b) => b - a);
  const uniq = [...c.keys()].sort((a, b) => a - b);

  const isStraight = uniq.length === 5 && (uniq[4] - uniq[0] === 4);
  if (counts[0] === 5) return { name: 'Five of a kind', mult: 50 };
  if (counts[0] === 4) return { name: 'Four of a kind', mult: 15 };
  if (counts[0] === 3 && counts[1] === 2) return { name: 'Full house', mult: 8 };
  if (isStraight) return { name: 'Straight', mult: 6 };
  if (counts[0] === 3) return { name: 'Three of a kind', mult: 4 };
  if (counts[0] === 2 && counts[1] === 2) return { name: 'Two pair', mult: 3 };
  if (counts[0] === 2) return { name: 'One pair', mult: 2 };
  return { name: 'Bust', mult: 0 };
}

function cardDraw() {
  return randInt(2, 14);
}

function cardName(v) {
  if (v === 11) return 'J';
  if (v === 12) return 'Q';
  if (v === 13) return 'K';
  if (v === 14) return 'A';
  return String(v);
}

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
    const j = randInt(0, i);
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

function minesMakeGrid(sessionId, st) {
  const rows = [];
  const labelFor = (i) => {
    if (!st.revealed[i]) return '·';
    if (st.mines.has(i)) return '💣';
    return '✅';
  };
  for (let r = 0; r < 5; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 5; c++) {
      const i = r * 5 + c;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`g:${sessionId}:t${i}`)
          .setLabel(labelFor(i))
          .setStyle(st.revealed[i] ? (st.mines.has(i) ? ButtonStyle.Danger : ButtonStyle.Success) : ButtonStyle.Secondary)
          .setDisabled(st.done || st.revealed[i])
      );
    }
    rows.push(row);
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`g:${sessionId}:cashout`).setLabel('Cashout').setStyle(ButtonStyle.Primary).setDisabled(st.done || st.safeRevealed === 0),
    new ButtonBuilder().setCustomId(`g:${sessionId}:quit`).setLabel('Quit').setStyle(ButtonStyle.Danger).setDisabled(st.done)
  ));
  return rows;
}

function minesChance(n, safe, k) {
  let p = 1;
  for (let i = 0; i < k; i++) p *= (safe - i) / (n - i);
  return p;
}

function minesMultiplier(n, safe, k) {
  const p = minesChance(n, safe, k);
  if (!(p > 0)) return 1;
  const m = 1 / p;
  return Math.min(100, Math.max(1, m));
}

function minesEmbed(st, status) {
  const n = 25;
  const safe = n - st.minesCount;
  const mult = minesMultiplier(n, safe, st.safeRevealed);
  const grossProfit = Math.floor(st.bet * (mult - 1));
  const netProfit = applyHouseFeeToProfit(grossProfit, 5);
  const cashout = st.safeRevealed === 0 ? st.bet : (st.bet + netProfit);

  const embed = new EmbedBuilder()
    .setTitle('💣 Mines')
    .setColor(0xFF00FF)
    .addFields(
      { name: 'Bet', value: String(st.bet), inline: true },
      { name: 'Mines', value: String(st.minesCount), inline: true },
      { name: 'Safe picks', value: String(st.safeRevealed), inline: true },
      { name: 'Cashout', value: String(cashout), inline: true }
    )
    .setTimestamp();

  if (status) embed.addFields({ name: 'Status', value: status, inline: false });
  return embed;
}

function crashPoint() {
  const u = randFloat();
  const raw = 1 / (1 - u);
  const v = Math.min(50, Math.max(1, Math.floor(raw * 100) / 100));
  return v;
}

module.exports = [
  {
    name: 'gamble',
    aliases: ['gb'],
    category: 'casino',
    description: '50/50 coin gamble (house fee 5%)',
    slash: {
      data: new SlashCommandBuilder()
        .setName('gamble')
        .setDescription('50/50 coin gamble (house fee 5%)')
        .addIntegerOption(o => o.setName('amount').setDescription('Bet amount (default 1)').setRequired(false)),
      async run(interaction) {
        const nb = normalizeBet(interaction.options.getInteger('amount'), {});
        if (!nb.ok) return safeError(interaction, nb.error);
        const bet = nb.bet;

        const left = await trySpendCoins(interaction.guildId, interaction.user.id, bet);
        if (left === null) return safeError(interaction, 'Not enough coins.');

        const win = randInt(0, 1) === 1;
        let payout = 0;
        let delta = -bet;

        if (win) {
          payout = payoutFromBetAndProfit(bet, bet, 5);
          await addCoins(interaction.guildId, interaction.user.id, payout);
          delta = applyHouseFeeToProfit(bet, 5);
        }

        const updated = await ensureRow(interaction.guildId, interaction.user.id);
        return interaction.reply(`${win ? '✅ Win' : '❌ Lose'} | Bet: **${bet}** | Δ **${fmtDelta(delta)}** | Total: **${updated.coins}**`);
      }
    },
    prefix: {
      async run(message, args) {
        const raw = args[0] === undefined ? null : parseInt(args[0], 10);
        const nb = normalizeBet(raw, {});
        if (!nb.ok) return safeError(message, nb.error);
        const bet = nb.bet;

        const left = await trySpendCoins(message.guild.id, message.author.id, bet);
        if (left === null) return safeError(message, 'Not enough coins.');

        const win = randInt(0, 1) === 1;
        let payout = 0;
        let delta = -bet;

        if (win) {
          payout = payoutFromBetAndProfit(bet, bet, 5);
          await addCoins(message.guild.id, message.author.id, payout);
          delta = applyHouseFeeToProfit(bet, 5);
        }

        const updated = await ensureRow(message.guild.id, message.author.id);
        return message.reply(`${win ? '✅ Win' : '❌ Lose'} | Bet: **${bet}** | Δ **${fmtDelta(delta)}** | Total: **${updated.coins}**`);
      }
    }
  },

  {
    name: 'slots',
    aliases: ['sl'],
    category: 'casino',
    description: 'Slot machine (house fee 5%)',
    slash: {
      data: new SlashCommandBuilder()
        .setName('slots')
        .setDescription('Play slots (house fee 5%)')
        .addIntegerOption(o => o.setName('bet').setDescription('Bet amount (default 1)').setRequired(false)),
      async run(interaction) {
        const nb = normalizeBet(interaction.options.getInteger('bet'), {});
        if (!nb.ok) return safeError(interaction, nb.error);
        const bet = nb.bet;

        const left = await trySpendCoins(interaction.guildId, interaction.user.id, bet);
        if (left === null) return safeError(interaction, 'Not enough coins.');

        const [a, b, c] = rollSymbols();

        let mult = 0;
        if (a === b && b === c) mult = a === '💎' ? 5 : 3;
        else if (a === b || b === c || a === c) mult = 1;

        let delta = -bet;
        if (mult > 0) {
          const profit = bet * mult;
          const payout = payoutFromBetAndProfit(bet, profit, 5);
          await addCoins(interaction.guildId, interaction.user.id, payout);
          delta = applyHouseFeeToProfit(profit, 5);
        }

        const updated = await ensureRow(interaction.guildId, interaction.user.id);
        return interaction.reply(`🎰 ${a} ${b} ${c} | Bet: **${bet}** | Δ **${fmtDelta(delta)}** | Total: **${updated.coins}**`);
      }
    },
    prefix: {
      async run(message, args) {
        const raw = args[0] === undefined ? null : parseInt(args[0], 10);
        const nb = normalizeBet(raw, {});
        if (!nb.ok) return safeError(message, nb.error);
        const bet = nb.bet;

        const left = await trySpendCoins(message.guild.id, message.author.id, bet);
        if (left === null) return safeError(message, 'Not enough coins.');

        const [a, b, c] = rollSymbols();

        let mult = 0;
        if (a === b && b === c) mult = a === '💎' ? 5 : 3;
        else if (a === b || b === c || a === c) mult = 1;

        let delta = -bet;
        if (mult > 0) {
          const profit = bet * mult;
          const payout = payoutFromBetAndProfit(bet, profit, 5);
          await addCoins(message.guild.id, message.author.id, payout);
          delta = applyHouseFeeToProfit(profit, 5);
        }

        const updated = await ensureRow(message.guild.id, message.author.id);
        return message.reply(`🎰 ${a} ${b} ${c} | Bet: **${bet}** | Δ **${fmtDelta(delta)}** | Total: **${updated.coins}**`);
      }
    }
  },

  {
    name: 'roulette',
    aliases: ['roul','rl','rlt'],
    category: 'casino',
    description: 'Roulette (red/black/even/odd/low/high/green/number)',
    slash: {
      data: new SlashCommandBuilder()
        .setName('roulette')
        .setDescription('Play roulette (house fee 5%)')
        .addStringOption(o => o.setName('type').setDescription('Bet type').setRequired(true).addChoices(
          { name: 'red', value: 'red' },
          { name: 'black', value: 'black' },
          { name: 'even', value: 'even' },
          { name: 'odd', value: 'odd' },
          { name: 'low (1-18)', value: 'low' },
          { name: 'high (19-36)', value: 'high' },
          { name: 'green (0)', value: 'green' },
          { name: 'number', value: 'number' }
        ))
        .addIntegerOption(o => o.setName('number').setDescription('Pick 0-36 (only for type=number)').setRequired(false))
        .addIntegerOption(o => o.setName('bet').setDescription('Bet amount (default 1)').setRequired(false)),
      async run(interaction) {
        const type = interaction.options.getString('type');
        const pickNumber = interaction.options.getInteger('number');

        const nb = normalizeBet(interaction.options.getInteger('bet'), {});
        if (!nb.ok) return safeError(interaction, nb.error);
        const bet = nb.bet;

        if (type === 'number' && (!Number.isInteger(pickNumber) || pickNumber < 0 || pickNumber > 36)) {
          return safeError(interaction, 'Provide `number` 0-36 when type is `number`.');
        }

        const left = await trySpendCoins(interaction.guildId, interaction.user.id, bet);
        if (left === null) return safeError(interaction, 'Not enough coins.');

        const spin = randInt(0, 36);
        const color = rouletteColor(spin);

        let win = false;
        let profit = 0;

        if (type === 'red' || type === 'black') { win = color === type; profit = bet; }
        else if (type === 'green') { win = spin === 0; profit = bet * 13; }
        else if (type === 'even') { win = spin !== 0 && spin % 2 === 0; profit = bet; }
        else if (type === 'odd') { win = spin % 2 === 1; profit = bet; }
        else if (type === 'low') { win = spin >= 1 && spin <= 18; profit = bet; }
        else if (type === 'high') { win = spin >= 19 && spin <= 36; profit = bet; }
        else if (type === 'number') { win = spin === pickNumber; profit = bet * 35; }

        let delta = -bet;
        if (win) {
          const payout = payoutFromBetAndProfit(bet, profit, 5);
          await addCoins(interaction.guildId, interaction.user.id, payout);
          delta = applyHouseFeeToProfit(profit, 5);
        }

        const updated = await ensureRow(interaction.guildId, interaction.user.id);
        const betDesc = type === 'number' ? `number ${pickNumber}` : type;
        return interaction.reply(`🎡 Spin: **${spin}** (${color}) | Bet: **${betDesc}** x **${bet}** | Δ **${fmtDelta(delta)}** | Total: **${updated.coins}**`);
      }
    },
    prefix: {
      async run(message, args) {
        const type = String(args[0] || '').toLowerCase();
        const rawBet = args[args.length - 1];
        const betMaybe = /^\d+$/.test(String(rawBet || '')) ? parseInt(rawBet, 10) : null;
        const nb = normalizeBet(betMaybe, {});
        if (!nb.ok) return safeError(message, nb.error);
        const bet = nb.bet;

        let pickNumber = null;
        if (type === 'number') {
          pickNumber = parseInt(args[1], 10);
          if (!Number.isInteger(pickNumber) || pickNumber < 0 || pickNumber > 36) return safeError(message, 'Usage: `!roulette number <0-36> [bet]`');
        } else if (!['red','black','even','odd','low','high','green'].includes(type)) {
          return safeError(message, 'Usage: `!roulette red|black|even|odd|low|high|green|number ...`');
        }

        const left = await trySpendCoins(message.guild.id, message.author.id, bet);
        if (left === null) return safeError(message, 'Not enough coins.');

        const spin = randInt(0, 36);
        const color = rouletteColor(spin);

        let win = false;
        let profit = 0;

        if (type === 'red' || type === 'black') { win = color === type; profit = bet; }
        else if (type === 'green') { win = spin === 0; profit = bet * 13; }
        else if (type === 'even') { win = spin !== 0 && spin % 2 === 0; profit = bet; }
        else if (type === 'odd') { win = spin % 2 === 1; profit = bet; }
        else if (type === 'low') { win = spin >= 1 && spin <= 18; profit = bet; }
        else if (type === 'high') { win = spin >= 19 && spin <= 36; profit = bet; }
        else if (type === 'number') { win = spin === pickNumber; profit = bet * 35; }

        let delta = -bet;
        if (win) {
          const payout = payoutFromBetAndProfit(bet, profit, 5);
          await addCoins(message.guild.id, message.author.id, payout);
          delta = applyHouseFeeToProfit(profit, 5);
        }

        const updated = await ensureRow(message.guild.id, message.author.id);
        const betDesc = type === 'number' ? `number ${pickNumber}` : type;
        return message.reply(`🎡 Spin: **${spin}** (${color}) | Bet: **${betDesc}** x **${bet}** | Δ **${fmtDelta(delta)}** | Total: **${updated.coins}**`);
      }
    }
  },

  {
    name: 'wheel',
    aliases: ['spin','sp','wh'],
    category: 'casino',
    description: 'Spin the wheel (weighted RNG)',
    slash: {
      data: new SlashCommandBuilder()
        .setName('wheel')
        .setDescription('Spin the wheel (house fee 5%)')
        .addIntegerOption(o => o.setName('bet').setDescription('Bet amount (default 1)').setRequired(false)),
      async run(interaction) {
        const nb = normalizeBet(interaction.options.getInteger('bet'), {});
        if (!nb.ok) return safeError(interaction, nb.error);
        const bet = nb.bet;

        const left = await trySpendCoins(interaction.guildId, interaction.user.id, bet);
        if (left === null) return safeError(interaction, 'Not enough coins.');

        const spin = weightedPick([
          { m: 0, w: 45 },
          { m: 2, w: 35 },
          { m: 3, w: 12 },
          { m: 5, w: 6 },
          { m: 10, w: 2 }
        ]);

        let delta = -bet;
        if (spin.m > 0) {
          const profit = bet * (spin.m - 1);
          const payout = payoutFromBetAndProfit(bet, profit, 5);
          await addCoins(interaction.guildId, interaction.user.id, payout);
          delta = applyHouseFeeToProfit(profit, 5);
        }

        const updated = await ensureRow(interaction.guildId, interaction.user.id);
        return interaction.reply(`🎡 Wheel: **x${spin.m}** | Bet: **${bet}** | Δ **${fmtDelta(delta)}** | Total: **${updated.coins}**`);
      }
    },
    prefix: {
      async run(message, args) {
        const raw = args[0] === undefined ? null : parseInt(args[0], 10);
        const nb = normalizeBet(raw, {});
        if (!nb.ok) return safeError(message, nb.error);
        const bet = nb.bet;

        const left = await trySpendCoins(message.guild.id, message.author.id, bet);
        if (left === null) return safeError(message, 'Not enough coins.');

        const spin = weightedPick([
          { m: 0, w: 45 },
          { m: 2, w: 35 },
          { m: 3, w: 12 },
          { m: 5, w: 6 },
          { m: 10, w: 2 }
        ]);

        let delta = -bet;
        if (spin.m > 0) {
          const profit = bet * (spin.m - 1);
          const payout = payoutFromBetAndProfit(bet, profit, 5);
          await addCoins(message.guild.id, message.author.id, payout);
          delta = applyHouseFeeToProfit(profit, 5);
        }

        const updated = await ensureRow(message.guild.id, message.author.id);
        return message.reply(`🎡 Wheel: **x${spin.m}** | Bet: **${bet}** | Δ **${fmtDelta(delta)}** | Total: **${updated.coins}**`);
      }
    }
  },

  {
    name: 'plinko',
    aliases: ['pl'],
    category: 'casino',
    description: 'Plinko (RNG path)',
    slash: {
      data: new SlashCommandBuilder()
        .setName('plinko')
        .setDescription('Play plinko (house fee 5%)')
        .addStringOption(o => o.setName('risk').setDescription('Risk').setRequired(false).addChoices(
          { name: 'low', value: 'low' },
          { name: 'mid', value: 'mid' },
          { name: 'high', value: 'high' }
        ))
        .addIntegerOption(o => o.setName('bet').setDescription('Bet amount (default 1)').setRequired(false)),
      async run(interaction) {
        const risk = interaction.options.getString('risk') || 'mid';
        const nb = normalizeBet(interaction.options.getInteger('bet'), {});
        if (!nb.ok) return safeError(interaction, nb.error);
        const bet = nb.bet;

        const left = await trySpendCoins(interaction.guildId, interaction.user.id, bet);
        if (left === null) return safeError(interaction, 'Not enough coins.');

        const tables = {
          low:  [0,0,1,1,2,1,1,0,0],
          mid:  [0,0,1,2,4,2,1,0,0],
          high: [0,0,0,2,8,2,0,0,0]
        };
        const table = tables[risk] || tables.mid;

        let pos = 4;
        const path = [];
        for (let i = 0; i < 8; i++) {
          const dir = randInt(0, 1) === 0 ? -1 : 1;
          pos = Math.max(0, Math.min(8, pos + dir));
          path.push(dir === -1 ? 'L' : 'R');
        }

        const mult = table[pos];
        let delta = -bet;

        if (mult > 0) {
          const profit = bet * (mult - 1);
          const payout = payoutFromBetAndProfit(bet, profit, 5);
          await addCoins(interaction.guildId, interaction.user.id, payout);
          delta = applyHouseFeeToProfit(profit, 5);
        }

        const updated = await ensureRow(interaction.guildId, interaction.user.id);
        return interaction.reply(`🧿 Plinko (${risk}) | Path: \`${path.join('')}\` | Bin: **${pos + 1}** | x${mult} | Bet: **${bet}** | Δ **${fmtDelta(delta)}** | Total: **${updated.coins}**`);
      }
    },
    prefix: {
      async run(message, args) {
        const risk = ['low','mid','high'].includes(String(args[0] || '').toLowerCase()) ? String(args[0]).toLowerCase() : 'mid';
        const raw = lastIntArg(args);
        const nb = normalizeBet(raw, {});
        if (!nb.ok) return safeError(message, nb.error);
        const bet = nb.bet;

        const left = await trySpendCoins(message.guild.id, message.author.id, bet);
        if (left === null) return safeError(message, 'Not enough coins.');

        const tables = {
          low:  [0,0,1,1,2,1,1,0,0],
          mid:  [0,0,1,2,4,2,1,0,0],
          high: [0,0,0,2,8,2,0,0,0]
        };
        const table = tables[risk] || tables.mid;

        let pos = 4;
        const path = [];
        for (let i = 0; i < 8; i++) {
          const dir = randInt(0, 1) === 0 ? -1 : 1;
          pos = Math.max(0, Math.min(8, pos + dir));
          path.push(dir === -1 ? 'L' : 'R');
        }

        const mult = table[pos];
        let delta = -bet;

        if (mult > 0) {
          const profit = bet * (mult - 1);
          const payout = payoutFromBetAndProfit(bet, profit, 5);
          await addCoins(message.guild.id, message.author.id, payout);
          delta = applyHouseFeeToProfit(profit, 5);
        }

        const updated = await ensureRow(message.guild.id, message.author.id);
        return message.reply(`🧿 Plinko (${risk}) | Path: \`${path.join('')}\` | Bin: **${pos + 1}** | x${mult} | Bet: **${bet}** | Δ **${fmtDelta(delta)}** | Total: **${updated.coins}**`);
      }
    }
  },

  {
    name: 'keno',
    aliases: ['kn'],
    category: 'casino',
    description: 'Keno (pick 1-10 numbers, draw 10)',
    slash: {
      data: new SlashCommandBuilder()
        .setName('keno')
        .setDescription('Play keno (house fee 5%)')
        .addStringOption(o => o.setName('picks').setDescription('Numbers 1-40, e.g. "1,2,3"').setRequired(true))
        .addIntegerOption(o => o.setName('bet').setDescription('Bet amount (default 1)').setRequired(false)),
      async run(interaction) {
        const pickStr = interaction.options.getString('picks');
        const parsed = kenoParsePick(pickStr);
        if (!parsed.ok) return safeError(interaction, parsed.error);
        const picks = parsed.nums;

        const nb = normalizeBet(interaction.options.getInteger('bet'), {});
        if (!nb.ok) return safeError(interaction, nb.error);
        const bet = nb.bet;

        const left = await trySpendCoins(interaction.guildId, interaction.user.id, bet);
        if (left === null) return safeError(interaction, 'Not enough coins.');

        const draw = kenoDraw();
        const hit = picks.filter(n => draw.includes(n));
        const hits = hit.length;
        const mult = (KENO_PAYOUT[picks.length] || {})[hits] || 0;

        let delta = -bet;
        if (mult > 0) {
          const payout = bet * mult;
          const profit = payout - bet;
          const finalPayout = payoutFromBetAndProfit(bet, profit, 5);
          await addCoins(interaction.guildId, interaction.user.id, finalPayout);
          delta = applyHouseFeeToProfit(profit, 5);
        }

        const updated = await ensureRow(interaction.guildId, interaction.user.id);
        return interaction.reply(`🔟 Keno | Picks: \`${picks.join(',')}\` | Draw: \`${draw.join(',')}\` | Hits: **${hits}** | x${mult} | Bet: **${bet}** | Δ **${fmtDelta(delta)}** | Total: **${updated.coins}**`);
      }
    },
    prefix: {
      async run(message, args) {
        const pickStr = args[0];
        if (!pickStr) return safeError(message, 'Usage: `!keno "1,2,3" [bet]`');
        const parsed = kenoParsePick(pickStr);
        if (!parsed.ok) return safeError(message, parsed.error);
        const picks = parsed.nums;

        const raw = args[1] === undefined ? null : parseInt(args[1], 10);
        const nb = normalizeBet(raw, {});
        if (!nb.ok) return safeError(message, nb.error);
        const bet = nb.bet;

        const left = await trySpendCoins(message.guild.id, message.author.id, bet);
        if (left === null) return safeError(message, 'Not enough coins.');

        const draw = kenoDraw();
        const hit = picks.filter(n => draw.includes(n));
        const hits = hit.length;
        const mult = (KENO_PAYOUT[picks.length] || {})[hits] || 0;

        let delta = -bet;
        if (mult > 0) {
          const payout = bet * mult;
          const profit = payout - bet;
          const finalPayout = payoutFromBetAndProfit(bet, profit, 5);
          await addCoins(message.guild.id, message.author.id, finalPayout);
          delta = applyHouseFeeToProfit(profit, 5);
        }

        const updated = await ensureRow(message.guild.id, message.author.id);
        return message.reply(`🔟 Keno | Picks: \`${picks.join(',')}\` | Draw: \`${draw.join(',')}\` | Hits: **${hits}** | x${mult} | Bet: **${bet}** | Δ **${fmtDelta(delta)}** | Total: **${updated.coins}**`);
      }
    }
  },

  {
    name: 'scratch',
    aliases: ['sc'],
    category: 'casino',
    description: 'Scratch card (weighted RNG)',
    slash: {
      data: new SlashCommandBuilder()
        .setName('scratch')
        .setDescription('Scratch card (house fee 5%)')
        .addIntegerOption(o => o.setName('bet').setDescription('Bet amount (default 1)').setRequired(false)),
      async run(interaction) {
        const nb = normalizeBet(interaction.options.getInteger('bet'), {});
        if (!nb.ok) return safeError(interaction, nb.error);
        const bet = nb.bet;

        const left = await trySpendCoins(interaction.guildId, interaction.user.id, bet);
        if (left === null) return safeError(interaction, 'Not enough coins.');

        const tier = weightedPick([
          { name: 'No win', mult: 0, w: 65 },
          { name: 'Small', mult: 2, w: 25 },
          { name: 'Medium', mult: 5, w: 7.5 },
          { name: 'Big', mult: 10, w: 2.2 },
          { name: 'Jackpot', mult: 25, w: 0.3 }
        ]);

        let delta = -bet;
        if (tier.mult > 0) {
          const profit = bet * (tier.mult - 1);
          const payout = payoutFromBetAndProfit(bet, profit, 5);
          await addCoins(interaction.guildId, interaction.user.id, payout);
          delta = applyHouseFeeToProfit(profit, 5);
        }

        const updated = await ensureRow(interaction.guildId, interaction.user.id);
        return interaction.reply(`🧾 Scratch: **${tier.name}** (x${tier.mult}) | Bet: **${bet}** | Δ **${fmtDelta(delta)}** | Total: **${updated.coins}**`);
      }
    },
    prefix: {
      async run(message, args) {
        const raw = args[0] === undefined ? null : parseInt(args[0], 10);
        const nb = normalizeBet(raw, {});
        if (!nb.ok) return safeError(message, nb.error);
        const bet = nb.bet;

        const left = await trySpendCoins(message.guild.id, message.author.id, bet);
        if (left === null) return safeError(message, 'Not enough coins.');

        const tier = weightedPick([
          { name: 'No win', mult: 0, w: 65 },
          { name: 'Small', mult: 2, w: 25 },
          { name: 'Medium', mult: 5, w: 7.5 },
          { name: 'Big', mult: 10, w: 2.2 },
          { name: 'Jackpot', mult: 25, w: 0.3 }
        ]);

        let delta = -bet;
        if (tier.mult > 0) {
          const profit = bet * (tier.mult - 1);
          const payout = payoutFromBetAndProfit(bet, profit, 5);
          await addCoins(message.guild.id, message.author.id, payout);
          delta = applyHouseFeeToProfit(profit, 5);
        }

        const updated = await ensureRow(message.guild.id, message.author.id);
        return message.reply(`🧾 Scratch: **${tier.name}** (x${tier.mult}) | Bet: **${bet}** | Δ **${fmtDelta(delta)}** | Total: **${updated.coins}**`);
      }
    }
  },

  {
    name: 'lottery',
    aliases: ['loto','lt','lot'],
    category: 'casino',
    description: '2-digit lottery (00-99)',
    slash: {
      data: new SlashCommandBuilder()
        .setName('lottery')
        .setDescription('2-digit lottery (house fee 5%)')
        .addIntegerOption(o => o.setName('pick').setDescription('Pick 0-99').setRequired(false))
        .addIntegerOption(o => o.setName('bet').setDescription('Bet amount (default 1)').setRequired(false)),
      async run(interaction) {
        const pick = interaction.options.getInteger('pick');
        const chosen = (pick === null || pick === undefined) ? randInt(0, 99) : pick;
        if (!Number.isInteger(chosen) || chosen < 0 || chosen > 99) return safeError(interaction, 'Pick must be 0-99.');

        const nb = normalizeBet(interaction.options.getInteger('bet'), {});
        if (!nb.ok) return safeError(interaction, nb.error);
        const bet = nb.bet;

        const left = await trySpendCoins(interaction.guildId, interaction.user.id, bet);
        if (left === null) return safeError(interaction, 'Not enough coins.');

        const draw = randInt(0, 99);

        let mult = 0;
        if (draw === chosen) mult = 80;
        else if (Math.abs(draw - chosen) <= 2) mult = 5;
        else if ((draw % 10) === (chosen % 10)) mult = 3;

        let delta = -bet;
        if (mult > 0) {
          const profit = bet * (mult - 1);
          const payout = payoutFromBetAndProfit(bet, profit, 5);
          await addCoins(interaction.guildId, interaction.user.id, payout);
          delta = applyHouseFeeToProfit(profit, 5);
        }

        const updated = await ensureRow(interaction.guildId, interaction.user.id);
        const fmt = (n) => String(n).padStart(2, '0');
        return interaction.reply(`🎟️ Lottery | Pick: **${fmt(chosen)}** | Draw: **${fmt(draw)}** | x${mult} | Bet: **${bet}** | Δ **${fmtDelta(delta)}** | Total: **${updated.coins}**`);
      }
    },
    prefix: {
      async run(message, args) {
        const pickRaw = args[0];
        const betRaw = args[1];

        const chosen = pickRaw === undefined ? randInt(0, 99) : parseInt(pickRaw, 10);
        if (!Number.isInteger(chosen) || chosen < 0 || chosen > 99) return safeError(message, 'Usage: `!lottery [pick 0-99] [bet]`');

        const nb = normalizeBet(betRaw === undefined ? null : parseInt(betRaw, 10), {});
        if (!nb.ok) return safeError(message, nb.error);
        const bet = nb.bet;

        const left = await trySpendCoins(message.guild.id, message.author.id, bet);
        if (left === null) return safeError(message, 'Not enough coins.');

        const draw = randInt(0, 99);

        let mult = 0;
        if (draw === chosen) mult = 80;
        else if (Math.abs(draw - chosen) <= 2) mult = 5;
        else if ((draw % 10) === (chosen % 10)) mult = 3;

        let delta = -bet;
        if (mult > 0) {
          const profit = bet * (mult - 1);
          const payout = payoutFromBetAndProfit(bet, profit, 5);
          await addCoins(message.guild.id, message.author.id, payout);
          delta = applyHouseFeeToProfit(profit, 5);
        }

        const updated = await ensureRow(message.guild.id, message.author.id);
        const fmt = (n) => String(n).padStart(2, '0');
        return message.reply(`🎟️ Lottery | Pick: **${fmt(chosen)}** | Draw: **${fmt(draw)}** | x${mult} | Bet: **${bet}** | Δ **${fmtDelta(delta)}** | Total: **${updated.coins}**`);
      }
    }
  },

  {
    name: 'highlow',
    aliases: ['hl'],
    category: 'casino',
    description: 'Higher/Lower (RNG)',
    slash: {
      data: new SlashCommandBuilder()
        .setName('highlow')
        .setDescription('Higher / Lower (house fee 5%)')
        .addStringOption(o => o.setName('pick').setDescription('Your pick').setRequired(true).addChoices(
          { name: 'higher', value: 'higher' },
          { name: 'lower', value: 'lower' }
        ))
        .addIntegerOption(o => o.setName('bet').setDescription('Bet amount (default 1)').setRequired(false)),
      async run(interaction) {
        const pick = interaction.options.getString('pick');

        const nb = normalizeBet(interaction.options.getInteger('bet'), {});
        if (!nb.ok) return safeError(interaction, nb.error);
        const bet = nb.bet;

        const left = await trySpendCoins(interaction.guildId, interaction.user.id, bet);
        if (left === null) return safeError(interaction, 'Not enough coins.');

        const a = cardDraw();
        const b = cardDraw();

        let outcome = 'push';
        if (b > a && pick === 'higher') outcome = 'win';
        else if (b < a && pick === 'lower') outcome = 'win';
        else if (b === a) outcome = 'push';
        else outcome = 'lose';

        let delta = -bet;
        if (outcome === 'win') {
          const profit = bet;
          const payout = payoutFromBetAndProfit(bet, profit, 5);
          await addCoins(interaction.guildId, interaction.user.id, payout);
          delta = applyHouseFeeToProfit(profit, 5);
        } else if (outcome === 'push') {
          await addCoins(interaction.guildId, interaction.user.id, bet);
          delta = 0;
        }

        const updated = await ensureRow(interaction.guildId, interaction.user.id);
        return interaction.reply(`🃏 High/Low | You: **${pick}** | Card: **${cardName(a)}** → **${cardName(b)}** | ${outcome.toUpperCase()} | Bet: **${bet}** | Δ **${fmtDelta(delta)}** | Total: **${updated.coins}**`);
      }
    },
    prefix: {
      async run(message, args) {
        const pick = String(args[0] || '').toLowerCase();
        if (!['higher','lower'].includes(pick)) return safeError(message, 'Usage: `!highlow higher|lower [bet]`');

        const nb = normalizeBet(args[1] === undefined ? null : parseInt(args[1], 10), {});
        if (!nb.ok) return safeError(message, nb.error);
        const bet = nb.bet;

        const left = await trySpendCoins(message.guild.id, message.author.id, bet);
        if (left === null) return safeError(message, 'Not enough coins.');

        const a = cardDraw();
        const b = cardDraw();

        let outcome = 'push';
        if (b > a && pick === 'higher') outcome = 'win';
        else if (b < a && pick === 'lower') outcome = 'win';
        else if (b === a) outcome = 'push';
        else outcome = 'lose';

        let delta = -bet;
        if (outcome === 'win') {
          const profit = bet;
          const payout = payoutFromBetAndProfit(bet, profit, 5);
          await addCoins(message.guild.id, message.author.id, payout);
          delta = applyHouseFeeToProfit(profit, 5);
        } else if (outcome === 'push') {
          await addCoins(message.guild.id, message.author.id, bet);
          delta = 0;
        }

        const updated = await ensureRow(message.guild.id, message.author.id);
        return message.reply(`🃏 High/Low | You: **${pick}** | Card: **${cardName(a)}** → **${cardName(b)}** | ${outcome.toUpperCase()} | Bet: **${bet}** | Δ **${fmtDelta(delta)}** | Total: **${updated.coins}**`);
      }
    }
  },

  {
    name: 'dicepoker',
    aliases: ['dp'],
    category: 'casino',
    description: 'Roll 5 dice and get a poker hand',
    slash: {
      data: new SlashCommandBuilder()
        .setName('dicepoker')
        .setDescription('Dice poker (house fee 5%)')
        .addIntegerOption(o => o.setName('bet').setDescription('Bet amount (default 1)').setRequired(false)),
      async run(interaction) {
        const nb = normalizeBet(interaction.options.getInteger('bet'), {});
        if (!nb.ok) return safeError(interaction, nb.error);
        const bet = nb.bet;

        const left = await trySpendCoins(interaction.guildId, interaction.user.id, bet);
        if (left === null) return safeError(interaction, 'Not enough coins.');

        const dice = Array.from({ length: 5 }, () => randInt(1, 6)).sort((a, b) => a - b);
        const hand = diceHand(dice);

        let delta = -bet;
        if (hand.mult > 0) {
          const profit = bet * (hand.mult - 1);
          const payout = payoutFromBetAndProfit(bet, profit, 5);
          await addCoins(interaction.guildId, interaction.user.id, payout);
          delta = applyHouseFeeToProfit(profit, 5);
        }

        const updated = await ensureRow(interaction.guildId, interaction.user.id);
        return interaction.reply(`🎲 Dice Poker | \`${dice.join(' ')}\` | **${hand.name}** (x${hand.mult}) | Bet: **${bet}** | Δ **${fmtDelta(delta)}** | Total: **${updated.coins}**`);
      }
    },
    prefix: {
      async run(message, args) {
        const nb = normalizeBet(args[0] === undefined ? null : parseInt(args[0], 10), {});
        if (!nb.ok) return safeError(message, nb.error);
        const bet = nb.bet;

        const left = await trySpendCoins(message.guild.id, message.author.id, bet);
        if (left === null) return safeError(message, 'Not enough coins.');

        const dice = Array.from({ length: 5 }, () => randInt(1, 6)).sort((a, b) => a - b);
        const hand = diceHand(dice);

        let delta = -bet;
        if (hand.mult > 0) {
          const profit = bet * (hand.mult - 1);
          const payout = payoutFromBetAndProfit(bet, profit, 5);
          await addCoins(message.guild.id, message.author.id, payout);
          delta = applyHouseFeeToProfit(profit, 5);
        }

        const updated = await ensureRow(message.guild.id, message.author.id);
        return message.reply(`🎲 Dice Poker | \`${dice.join(' ')}\` | **${hand.name}** (x${hand.mult}) | Bet: **${bet}** | Δ **${fmtDelta(delta)}** | Total: **${updated.coins}**`);
      }
    }
  },

  {
    name: 'crash',
    category: 'casino',
    description: 'Crash (choose cashout)',
    slash: {
      data: new SlashCommandBuilder()
        .setName('crash')
        .setDescription('Crash game (house fee 5%)')
        .addNumberOption(o => o.setName('cashout').setDescription('Cashout multiplier (default 2.0)').setRequired(false))
        .addIntegerOption(o => o.setName('bet').setDescription('Bet amount (default 1)').setRequired(false)),
      async run(interaction) {
        const cashoutRaw = interaction.options.getNumber('cashout');
        const cashout = cashoutRaw === null || cashoutRaw === undefined ? 2 : Number(cashoutRaw);
        if (!Number.isFinite(cashout) || cashout < 1.01 || cashout > 50) return safeError(interaction, 'Cashout must be between 1.01 and 50.');

        const nb = normalizeBet(interaction.options.getInteger('bet'), {});
        if (!nb.ok) return safeError(interaction, nb.error);
        const bet = nb.bet;

        const left = await trySpendCoins(interaction.guildId, interaction.user.id, bet);
        if (left === null) return safeError(interaction, 'Not enough coins.');

        const point = crashPoint();
        const win = cashout <= point;

        let delta = -bet;
        if (win) {
          const grossPayout = Math.floor(bet * cashout);
          const profit = Math.max(0, grossPayout - bet);
          const payout = payoutFromBetAndProfit(bet, profit, 5);
          await addCoins(interaction.guildId, interaction.user.id, payout);
          delta = applyHouseFeeToProfit(profit, 5);
        }

        const updated = await ensureRow(interaction.guildId, interaction.user.id);
        return interaction.reply(`📈 Crash | Cashout: **x${cashout.toFixed(2)}** | Crash: **x${point.toFixed(2)}** | ${win ? '✅ WIN' : '❌ LOSE'} | Bet: **${bet}** | Δ **${fmtDelta(delta)}** | Total: **${updated.coins}**`);
      }
    },
    prefix: {
      async run(message, args) {
        const cashout = args[0] === undefined ? 2 : Number(args[0]);
        if (!Number.isFinite(cashout) || cashout < 1.01 || cashout > 50) return safeError(message, 'Usage: `!crash [cashout 1.01-50] [bet]`');

        const nb = normalizeBet(args[1] === undefined ? null : parseInt(args[1], 10), {});
        if (!nb.ok) return safeError(message, nb.error);
        const bet = nb.bet;

        const left = await trySpendCoins(message.guild.id, message.author.id, bet);
        if (left === null) return safeError(message, 'Not enough coins.');

        const point = crashPoint();
        const win = cashout <= point;

        let delta = -bet;
        if (win) {
          const grossPayout = Math.floor(bet * cashout);
          const profit = Math.max(0, grossPayout - bet);
          const payout = payoutFromBetAndProfit(bet, profit, 5);
          await addCoins(message.guild.id, message.author.id, payout);
          delta = applyHouseFeeToProfit(profit, 5);
        }

        const updated = await ensureRow(message.guild.id, message.author.id);
        return message.reply(`📈 Crash | Cashout: **x${cashout.toFixed(2)}** | Crash: **x${point.toFixed(2)}** | ${win ? '✅ WIN' : '❌ LOSE'} | Bet: **${bet}** | Δ **${fmtDelta(delta)}** | Total: **${updated.coins}**`);
      }
    }
  },

  {
    name: 'mines',
    aliases: ['mn'],
    category: 'casino',
    description: 'Mines',
    slash: {
      data: new SlashCommandBuilder()
        .setName('mines')
        .setDescription('Play mines (house fee 5%)')
        .addIntegerOption(o => o.setName('mines').setDescription('Mines count 1-12 (default 3)').setRequired(false))
        .addIntegerOption(o => o.setName('bet').setDescription('Bet amount (default 1)').setRequired(false)),
      async run(interaction) {
        const minesCount = interaction.options.getInteger('mines') ?? 3;
        if (!Number.isInteger(minesCount) || minesCount < 1 || minesCount > 12) return safeError(interaction, 'Mines must be 1-12.');

        const nb = normalizeBet(interaction.options.getInteger('bet'), {});
        if (!nb.ok) return safeError(interaction, nb.error);
        const bet = nb.bet;

        const left = await trySpendCoins(interaction.guildId, interaction.user.id, bet);
        if (left === null) return safeError(interaction, 'Not enough coins.');

        const mines = new Set();
        while (mines.size < minesCount) mines.add(randInt(0, 24));

        const st = {
          bet,
          minesCount,
          mines,
          revealed: Array(25).fill(false),
          safeRevealed: 0,
          done: false
        };

        const sessionId = createSession({
          type: 'mines',
          ownerId: interaction.user.id,
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          state: st,
          async onAction(btn, action, s) {
            const state = s.state;

            const finish = async (status, payout) => {
              state.done = true;
              if (payout > 0) await addCoins(btn.guildId, s.ownerId, payout);
              const updated = await ensureRow(btn.guildId, s.ownerId);
              const embed = minesEmbed(state, `${status}\nTotal: **${updated.coins}**`);
              endSession(s.id);
              return btn.update({ embeds: [embed], components: disableRows(btn.message.components) }).catch(() => {});
            };

            if (state.done) return btn.deferUpdate().catch(() => {});

            if (action === 'quit') return finish('❌ Quit', 0);

            if (action === 'cashout') {
              const n = 25;
              const safe = n - state.minesCount;
              const mult = minesMultiplier(n, safe, state.safeRevealed);
              const grossProfit = Math.floor(state.bet * (mult - 1));
              const netProfit = applyHouseFeeToProfit(grossProfit, 5);
              const payout = state.bet + netProfit;
              return finish(`✅ Cashout x${mult.toFixed(2)} | Δ +${netProfit}`, payout);
            }

            if (!action.startsWith('t')) return btn.deferUpdate().catch(() => {});
            const idx = parseInt(action.slice(1), 10);
            if (!Number.isInteger(idx) || idx < 0 || idx > 24) return btn.deferUpdate().catch(() => {});
            if (state.revealed[idx]) return btn.deferUpdate().catch(() => {});

            state.revealed[idx] = true;

            if (state.mines.has(idx)) {
              for (let i = 0; i < 25; i++) state.revealed[i] = true;
              return finish(`💥 Boom! You hit a mine. Δ -${state.bet}`, 0);
            }

            state.safeRevealed += 1;

            const embed = minesEmbed(state, 'Pick a tile or cashout');
            return btn.update({ embeds: [embed], components: minesMakeGrid(s.id, state) }).catch(() => {});
          }
        });

        const embed = minesEmbed(st, 'Pick a tile');
        return interaction.reply({ embeds: [embed], components: minesMakeGrid(sessionId, st) });
      }
    },
    prefix: {
      async run(message, args) {
        const minesCount = args[0] === undefined ? 3 : parseInt(args[0], 10);
        if (!Number.isInteger(minesCount) || minesCount < 1 || minesCount > 12) return safeError(message, 'Usage: `!mines [mines 1-12] [bet]`');

        const nb = normalizeBet(args[1] === undefined ? null : parseInt(args[1], 10), {});
        if (!nb.ok) return safeError(message, nb.error);
        const bet = nb.bet;

        const left = await trySpendCoins(message.guild.id, message.author.id, bet);
        if (left === null) return safeError(message, 'Not enough coins.');

        const mines = new Set();
        while (mines.size < minesCount) mines.add(randInt(0, 24));

        const st = {
          bet,
          minesCount,
          mines,
          revealed: Array(25).fill(false),
          safeRevealed: 0,
          done: false
        };

        const sessionId = createSession({
          type: 'mines',
          ownerId: message.author.id,
          guildId: message.guild.id,
          channelId: message.channelId,
          state: st,
          async onAction(btn, action, s) {
            const state = s.state;

            const finish = async (status, payout) => {
              state.done = true;
              if (payout > 0) await addCoins(btn.guildId, s.ownerId, payout);
              const updated = await ensureRow(btn.guildId, s.ownerId);
              const embed = minesEmbed(state, `${status}\nTotal: **${updated.coins}**`);
              endSession(s.id);
              return btn.update({ embeds: [embed], components: disableRows(btn.message.components) }).catch(() => {});
            };

            if (state.done) return btn.deferUpdate().catch(() => {});

            if (action === 'quit') return finish('❌ Quit', 0);

            if (action === 'cashout') {
              const n = 25;
              const safe = n - state.minesCount;
              const mult = minesMultiplier(n, safe, state.safeRevealed);
              const grossProfit = Math.floor(state.bet * (mult - 1));
              const netProfit = applyHouseFeeToProfit(grossProfit, 5);
              const payout = state.bet + netProfit;
              return finish(`✅ Cashout x${mult.toFixed(2)} | Δ +${netProfit}`, payout);
            }

            if (!action.startsWith('t')) return btn.deferUpdate().catch(() => {});
            const idx = parseInt(action.slice(1), 10);
            if (!Number.isInteger(idx) || idx < 0 || idx > 24) return btn.deferUpdate().catch(() => {});
            if (state.revealed[idx]) return btn.deferUpdate().catch(() => {});

            state.revealed[idx] = true;

            if (state.mines.has(idx)) {
              for (let i = 0; i < 25; i++) state.revealed[i] = true;
              return finish(`💥 Boom! You hit a mine. Δ -${state.bet}`, 0);
            }

            state.safeRevealed += 1;

            const embed = minesEmbed(state, 'Pick a tile or cashout');
            return btn.update({ embeds: [embed], components: minesMakeGrid(s.id, state) }).catch(() => {});
          }
        });

        const embed = minesEmbed(st, 'Pick a tile');
        return message.reply({ embeds: [embed], components: minesMakeGrid(sessionId, st) });
      }
    }
  },

  {
    name: 'blackjack',
    aliases: ['bj'],
    category: 'casino',
    description: 'Blackjack (interactive)',
    slash: {
      data: new SlashCommandBuilder()
        .setName('blackjack')
        .setDescription('Play blackjack (house fee 5%)')
        .addIntegerOption(o => o.setName('bet').setDescription('Bet amount (default 1)').setRequired(false)),
      async run(interaction) {
        const nb = normalizeBet(interaction.options.getInteger('bet'), {});
        if (!nb.ok) return safeError(interaction, nb.error);
        const bet = nb.bet;

        const left = await trySpendCoins(interaction.guildId, interaction.user.id, bet);
        if (left === null) return safeError(interaction, 'Not enough coins.');

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
            const profit = Math.floor(bet * 1.5);
            const netProfit = applyHouseFeeToProfit(profit, 5);
            payout = bet + netProfit;
            resultText = `🟣 Blackjack! (Δ +${netProfit})`;
          } else if (!playerBJ && dealerBJ) {
            payout = 0;
            resultText = `❌ Dealer blackjack (Δ -${bet})`;
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

              if (outcome === 'win') {
                const netProfit = applyHouseFeeToProfit(st.bet, 5);
                payout = st.bet + netProfit;
                resultText = `✅ Win (Δ +${netProfit})`;
              }
              if (outcome === 'lose') {
                payout = 0;
                resultText = `❌ Lose (Δ -${st.bet})`;
              }

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
        const nb = normalizeBet(args[0] === undefined ? null : parseInt(args[0], 10), {});
        if (!nb.ok) return safeError(message, nb.error);
        const bet = nb.bet;

        const left = await trySpendCoins(message.guild.id, message.author.id, bet);
        if (left === null) return safeError(message, 'Not enough coins.');

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
            const profit = Math.floor(bet * 1.5);
            const netProfit = applyHouseFeeToProfit(profit, 5);
            payout = bet + netProfit;
            resultText = `🟣 Blackjack! (Δ +${netProfit})`;
          } else if (!playerBJ && dealerBJ) {
            payout = 0;
            resultText = `❌ Dealer blackjack (Δ -${bet})`;
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

              if (outcome === 'win') {
                const netProfit = applyHouseFeeToProfit(st.bet, 5);
                payout = st.bet + netProfit;
                resultText = `✅ Win (Δ +${netProfit})`;
              }
              if (outcome === 'lose') {
                payout = 0;
                resultText = `❌ Lose (Δ -${st.bet})`;
              }

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
  }
];
