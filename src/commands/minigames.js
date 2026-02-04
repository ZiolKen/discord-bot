const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');
const crypto = require('crypto');
const db = require('../db');
const { getOrCreate, addCoins, trySpendCoins, setClaim, cooldownReady } = require('../services/economy');
const { toDiscordTs } = require('../utils/time');

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function sessionId() { return crypto.randomBytes(6).toString('hex'); }

async function ensureRow(guildId, userId) {
  return getOrCreate(guildId, userId);
}

async function canClaim(field, row, ms) {
  return cooldownReady(row[field], ms);
}

function clampBet(n) {
  const bet = Number(n);
  if (!Number.isFinite(bet)) return null;
  const b = Math.floor(bet);
  if (b < 1 || b > 100000) return null;
  return b;
}

function cardDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck = [];
  for (const s of suits) {
    for (const r of ranks) {
      const v = r === 'A' ? 11 : ['J', 'Q', 'K'].includes(r) ? 10 : Number(r);
      deck.push({ r, s, v });
    }
  }
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function handValue(hand) {
  let sum = hand.reduce((a, c) => a + c.v, 0);
  let aces = hand.filter(c => c.r === 'A').length;
  while (sum > 21 && aces > 0) {
    sum -= 10;
    aces -= 1;
  }
  return sum;
}

function handText(hand) {
  return hand.map(c => `${c.r}${c.s}`).join(' ');
}

function dealerShouldHit(hand) {
  const v = handValue(hand);
  if (v < 17) return true;
  if (v > 17) return false;
  const raw = hand.reduce((a, c) => a + c.v, 0);
  const hasAce = hand.some(c => c.r === 'A');
  const soft17 = hasAce && raw === 27;
  return soft17;
}

function disableRows(rows) {
  return rows.map(r => {
    const nr = ActionRowBuilder.from(r);
    nr.components = nr.components.map(b => ButtonBuilder.from(b).setDisabled(true));
    return nr;
  });
}

async function runBlackjack(interaction) {
  const bet = clampBet(interaction.options.getInteger('bet'));
  if (!bet) return interaction.reply({ content: 'Bet must be 1-100000.', ephemeral: true });

  const spend = await trySpendCoins(interaction.guildId, interaction.user.id, bet);
  if (!spend.ok) return interaction.reply({ content: `Not enough coins. You have **${spend.coins}**.`, ephemeral: true });

  const sid = sessionId();
  const deck = cardDeck();
  const player = [deck.pop(), deck.pop()];
  const dealer = [deck.pop(), deck.pop()];
  let doubled = false;
  let ended = false;
  let result = null;
  let payout = 0;

  function stake() {
    return bet * (doubled ? 2 : 1);
  }

  function settle(final) {
    ended = true;
    result = final;
    const s = stake();

    if (final === 'push') payout = s;
    else if (final === 'win') payout = s * 2;
    else if (final === 'blackjack') payout = Math.floor(s * 2.5);
    else payout = 0;
  }

  function statusEmbed(revealDealer) {
    const ps = handValue(player);
    const ds = handValue(dealer);
    const dealerDisplay = revealDealer ? `${handText(dealer)} (**${ds}**)` : `${dealer[0].r}${dealer[0].s} ??`;

    const embed = new EmbedBuilder()
      .setTitle('🃏 Blackjack')
      .setDescription(`Bet: **${bet}** | Stake: **${stake()}**`)
      .addFields(
        { name: 'Your hand', value: `${handText(player)} (**${ps}**)`, inline: false },
        { name: 'Dealer', value: dealerDisplay, inline: false }
      );

    if (ended) {
      const label = result === 'blackjack' ? `✅ Blackjack (+${payout - stake()})`
        : result === 'win' ? `✅ Win (+${payout - stake()})`
        : result === 'push' ? '🤝 Push'
        : '❌ Lose';
      embed.addFields({ name: 'Result', value: label, inline: false });
    }
    return embed;
  }

  const ps = handValue(player);
  const ds = handValue(dealer);
  const playerBJ = ps === 21 && player.length === 2;
  const dealerBJ = ds === 21 && dealer.length === 2;
  if (playerBJ && dealerBJ) settle('push');
  else if (playerBJ) settle('blackjack');

  const canDouble = () => !ended && !doubled && player.length === 2;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bj:${sid}:hit`).setLabel('Hit').setEmoji('🃏').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bj:${sid}:stand`).setLabel('Stand').setEmoji('🛑').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bj:${sid}:double`).setLabel('Double').setEmoji('💸').setStyle(ButtonStyle.Success)
  );

  const msg = await interaction.reply({
    embeds: [statusEmbed(false)],
    components: ended ? disableRows([row]) : [row],
    fetchReply: true
  });

  if (ended) {
    await addCoins(interaction.guildId, interaction.user.id, payout);
    return;
  }

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 90_000
  });

  async function finalize(auto) {
    if (ended) return;

    if (auto === 'timeout') {
      while (dealerShouldHit(dealer)) dealer.push(deck.pop());
      const ps2 = handValue(player);
      const ds2 = handValue(dealer);
      if (ps2 > 21) settle('lose');
      else if (ds2 > 21) settle('win');
      else if (ps2 > ds2) settle('win');
      else if (ps2 < ds2) settle('lose');
      else settle('push');
    }

    if (payout > 0) await addCoins(interaction.guildId, interaction.user.id, payout);

    await msg.edit({ embeds: [statusEmbed(true)], components: disableRows([row]) }).catch(() => {});
    collector.stop('done');
  }

  collector.on('collect', async (i) => {
    if (i.user.id !== interaction.user.id) {
      return i.reply({ content: 'This game is not yours.', ephemeral: true });
    }

    const parts = String(i.customId || '').split(':');
    if (parts[0] !== 'bj' || parts[1] !== sid) return i.reply({ content: 'Invalid session.', ephemeral: true });

    const action = parts[2];
    await i.deferUpdate().catch(() => {});
    if (ended) return;

    if (action === 'double') {
      if (!canDouble()) return;
      const extra = await trySpendCoins(interaction.guildId, interaction.user.id, bet);
      if (!extra.ok) {
        return i.followUp({ content: `Not enough coins to double. You have **${extra.coins}**.`, ephemeral: true }).catch(() => {});
      }
      doubled = true;
      player.push(deck.pop());
      if (handValue(player) > 21) settle('lose');
      else {
        while (dealerShouldHit(dealer)) dealer.push(deck.pop());
        const ps2 = handValue(player);
        const ds2 = handValue(dealer);
        if (ds2 > 21) settle('win');
        else if (ps2 > ds2) settle('win');
        else if (ps2 < ds2) settle('lose');
        else settle('push');
      }
      await finalize();
      return;
    }

    if (action === 'hit') {
      player.push(deck.pop());
      if (handValue(player) > 21) {
        settle('lose');
        await finalize();
        return;
      }
      row.components[2].setDisabled(!canDouble());
      await msg.edit({ embeds: [statusEmbed(false)], components: [row] }).catch(() => {});
      return;
    }

    if (action === 'stand') {
      while (dealerShouldHit(dealer)) dealer.push(deck.pop());
      const ps2 = handValue(player);
      const ds2 = handValue(dealer);
      if (ds2 > 21) settle('win');
      else if (ps2 > ds2) settle('win');
      else if (ps2 < ds2) settle('lose');
      else settle('push');
      await finalize();
    }
  });

  collector.on('end', async (_c, reason) => {
    if (reason === 'done') return;
    await finalize('timeout');
  });
}

function hiloCard() {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const r = ranks[rand(0, ranks.length - 1)];
  const s = suits[rand(0, suits.length - 1)];
  const v = r === 'A' ? 14 : r === 'K' ? 13 : r === 'Q' ? 12 : r === 'J' ? 11 : Number(r);
  return { r, s, v };
}

async function runHilo(interaction) {
  const bet = clampBet(interaction.options.getInteger('bet'));
  if (!bet) return interaction.reply({ content: 'Bet must be 1-100000.', ephemeral: true });

  const spend = await trySpendCoins(interaction.guildId, interaction.user.id, bet);
  if (!spend.ok) return interaction.reply({ content: `Not enough coins. You have **${spend.coins}**.`, ephemeral: true });

  const sid = sessionId();
  let current = hiloCard();
  let rounds = 0;
  let mult = 1.0;
  let ended = false;

  function payout() {
    return Math.floor(bet * mult);
  }

  function embed(msg) {
    const e = new EmbedBuilder()
      .setTitle('🎴 HiLo')
      .setDescription(`Bet: **${bet}** | Multiplier: **${mult.toFixed(2)}x** | Potential: **${payout()}**`)
      .addFields({ name: 'Card', value: `**${current.r}${current.s}**`, inline: true });
    if (msg) e.addFields({ name: 'Status', value: msg, inline: false });
    return e;
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`hilo:${sid}:high`).setLabel('Higher').setEmoji('⬆️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`hilo:${sid}:low`).setLabel('Lower').setEmoji('⬇️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`hilo:${sid}:cash`).setLabel('Cash out').setEmoji('💰').setStyle(ButtonStyle.Success)
  );

  const msg = await interaction.reply({ embeds: [embed('Pick higher or lower.')], components: [row], fetchReply: true });

  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 90_000 });

  async function cashout(reason) {
    if (ended) return;
    ended = true;
    const pay = payout();
    if (pay > 0) await addCoins(interaction.guildId, interaction.user.id, pay);
    await msg.edit({ embeds: [embed(`✅ Cashed out (${reason}). Payout: **${pay}**`)], components: disableRows([row]) }).catch(() => {});
    collector.stop('done');
  }

  async function bust(nextCard) {
    if (ended) return;
    ended = true;
    current = nextCard;
    await msg.edit({ embeds: [embed('💥 Wrong guess. You lost your bet.')], components: disableRows([row]) }).catch(() => {});
    collector.stop('done');
  }

  collector.on('collect', async (i) => {
    if (i.user.id !== interaction.user.id) return i.reply({ content: 'This game is not yours.', ephemeral: true });
    const parts = String(i.customId || '').split(':');
    if (parts[0] !== 'hilo' || parts[1] !== sid) return i.reply({ content: 'Invalid session.', ephemeral: true });
    const action = parts[2];
    await i.deferUpdate().catch(() => {});
    if (ended) return;

    if (action === 'cash') return cashout('manual');

    const next = hiloCard();
    if (next.v === current.v) {
      current = next;
      await msg.edit({ embeds: [embed('🤝 Tie. No change, pick again.')], components: [row] }).catch(() => {});
      return;
    }

    const correct = action === 'high' ? next.v > current.v : next.v < current.v;
    current = next;
    rounds += 1;

    if (!correct) return bust(next);

    mult = Math.min(5, mult + 0.25);
    if (rounds >= 10) return cashout('max rounds');
    await msg.edit({ embeds: [embed('✅ Correct. Continue or cash out.')], components: [row] }).catch(() => {});
  });

  collector.on('end', async (_c, reason) => {
    if (reason === 'done') return;
    await cashout('timeout');
  });
}

function buildMinesGrid(sid, revealed, ended) {
  const rows = [];
  for (let r = 0; r < 4; r += 1) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 4; c += 1) {
      const idx = r * 4 + c;
      const state = revealed.get(idx);
      const b = new ButtonBuilder().setCustomId(`mines:${sid}:${idx}`).setStyle(ButtonStyle.Secondary);
      if (state === 'safe') b.setEmoji('✅').setDisabled(true);
      else if (state === 'mine') b.setEmoji('💣').setDisabled(true);
      else b.setLabel(' ').setDisabled(Boolean(ended));
      row.addComponents(b);
    }
    rows.push(row);
  }
  const control = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mines:${sid}:cash`).setLabel('Cash out').setEmoji('💰').setStyle(ButtonStyle.Success).setDisabled(Boolean(ended)),
    new ButtonBuilder().setCustomId(`mines:${sid}:stop`).setLabel('Forfeit').setEmoji('🏳️').setStyle(ButtonStyle.Danger).setDisabled(Boolean(ended))
  );
  rows.push(control);
  return rows;
}

async function runMines(interaction) {
  const bet = clampBet(interaction.options.getInteger('bet'));
  if (!bet) return interaction.reply({ content: 'Bet must be 1-100000.', ephemeral: true });

  const spend = await trySpendCoins(interaction.guildId, interaction.user.id, bet);
  if (!spend.ok) return interaction.reply({ content: `Not enough coins. You have **${spend.coins}**.`, ephemeral: true });

  const sid = sessionId();
  const mines = new Set();
  while (mines.size < 3) mines.add(rand(0, 15));

  const revealed = new Map();
  let safe = 0;
  let ended = false;

  function mult() {
    return 1 + safe * 0.35;
  }

  function payout() {
    return Math.floor(bet * mult());
  }

  function embed(msg) {
    const e = new EmbedBuilder()
      .setTitle('💣 Mines')
      .setDescription(`Bet: **${bet}** | Safe tiles: **${safe}** | Multiplier: **${mult().toFixed(2)}x** | Potential: **${payout()}**`);
    if (msg) e.addFields({ name: 'Status', value: msg, inline: false });
    return e;
  }

  const msg = await interaction.reply({ embeds: [embed('Pick a tile. Cash out any time.')], components: buildMinesGrid(sid, revealed, false), fetchReply: true });
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120_000 });

  async function showEnd(text, pay) {
    ended = true;
    for (const i of mines) {
      if (!revealed.has(i)) revealed.set(i, 'mine');
    }
    if (pay > 0) await addCoins(interaction.guildId, interaction.user.id, pay);
    await msg.edit({ embeds: [embed(text)], components: buildMinesGrid(sid, revealed, true) }).catch(() => {});
    collector.stop('done');
  }

  collector.on('collect', async (i) => {
    if (i.user.id !== interaction.user.id) return i.reply({ content: 'This game is not yours.', ephemeral: true });
    const parts = String(i.customId || '').split(':');
    if (parts[0] !== 'mines' || parts[1] !== sid) return i.reply({ content: 'Invalid session.', ephemeral: true });
    await i.deferUpdate().catch(() => {});
    if (ended) return;

    const action = parts[2];
    if (action === 'cash') return showEnd(`✅ Cashed out. Payout: **${payout()}**`, payout());
    if (action === 'stop') return showEnd('❌ Forfeited.', 0);

    const idx = Number(action);
    if (!Number.isFinite(idx) || idx < 0 || idx > 15) return;
    if (revealed.has(idx)) return;

    if (mines.has(idx)) {
      revealed.set(idx, 'mine');
      return showEnd('💥 Boom. You hit a mine and lost your bet.', 0);
    }

    revealed.set(idx, 'safe');
    safe += 1;
    if (safe >= 13) return showEnd(`🏁 Cleared all safe tiles. Payout: **${payout()}**`, payout());
    await msg.edit({ embeds: [embed('✅ Safe. Continue or cash out.')], components: buildMinesGrid(sid, revealed, false) }).catch(() => {});
  });

  collector.on('end', async (_c, reason) => {
    if (reason === 'done') return;
    await showEnd(`✅ Timeout cash out. Payout: **${payout()}**`, payout());
  });
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
    prefix: {
      async run(message, args) {
        const sides = parseInt(args[0], 10) || 6;
        if (sides < 2 || sides > 1000) return message.reply('Sides must be 2-1000.');
        return message.reply(`🎲 You rolled **${rand(1, sides)}** (d${sides})`);
      }
    }
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
        const bot = ['rock', 'paper', 'scissors'][rand(0, 2)];
        const win =
          (pick === 'rock' && bot === 'scissors') ||
          (pick === 'paper' && bot === 'rock') ||
          (pick === 'scissors' && bot === 'paper');
        const draw = pick === bot;
        return interaction.reply(`🪨📄✂️ You: **${pick}** | Bot: **${bot}** → ${draw ? '🤝 Draw' : win ? '✅ Win' : '❌ Lose'}`);
      }
    },
    prefix: {
      async run(message, args) {
        const pick = (args[0] || '').toLowerCase();
        if (!['rock', 'paper', 'scissors'].includes(pick)) return message.reply('Usage: `!rps rock|paper|scissors`');
        const bot = ['rock', 'paper', 'scissors'][rand(0, 2)];
        const win =
          (pick === 'rock' && bot === 'scissors') ||
          (pick === 'paper' && bot === 'rock') ||
          (pick === 'scissors' && bot === 'paper');
        const draw = pick === bot;
        return message.reply(`🪨📄✂️ You: **${pick}** | Bot: **${bot}** → ${draw ? '🤝 Draw' : win ? '✅ Win' : '❌ Lose'}`);
      }
    }
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
    prefix: {
      async run(message) {
        const row = await ensureRow(message.guild.id, message.author.id);
        return message.reply(`💰 Your coins: **${row.coins}**`);
      }
    }
  },

  {
    name: 'daily',
    category: 'minigames',
    description: 'Claim daily coins',
    slash: {
      data: new SlashCommandBuilder().setName('daily').setDescription('Claim daily coins'),
      async run(interaction) {
        const row = await ensureRow(interaction.guildId, interaction.user.id);
        const ok = await canClaim('daily_at', row, 24 * 3600 * 1000);
        if (!ok) {
          const next = new Date(new Date(row.daily_at).getTime() + 24 * 3600 * 1000);
          return interaction.reply({ content: `⏳ Already claimed. Try again ${toDiscordTs(next, 'R')}.`, ephemeral: true });
        }
        const gain = 150;
        await addCoins(interaction.guildId, interaction.user.id, gain);
        await setClaim(interaction.guildId, interaction.user.id, 'daily_at');
        const updated = await ensureRow(interaction.guildId, interaction.user.id);
        return interaction.reply(`🎁 Daily claimed: +**${gain}** coins. Total: **${updated.coins}**`);
      }
    },
    prefix: {
      async run(message) {
        const row = await ensureRow(message.guild.id, message.author.id);
        const ok = await canClaim('daily_at', row, 24 * 3600 * 1000);
        if (!ok) {
          const next = new Date(new Date(row.daily_at).getTime() + 24 * 3600 * 1000);
          return message.reply(`⏳ Already claimed. Try again ${toDiscordTs(next, 'R')}.`);
        }
        const gain = 150;
        await addCoins(message.guild.id, message.author.id, gain);
        await setClaim(message.guild.id, message.author.id, 'daily_at');
        const updated = await ensureRow(message.guild.id, message.author.id);
        return message.reply(`🎁 Daily claimed: +${gain} coins. Total: **${updated.coins}**`);
      }
    }
  },

  {
    name: 'weekly',
    category: 'minigames',
    description: 'Claim weekly coins',
    slash: {
      data: new SlashCommandBuilder().setName('weekly').setDescription('Claim weekly coins'),
      async run(interaction) {
        const row = await ensureRow(interaction.guildId, interaction.user.id);
        const ok = await canClaim('weekly_at', row, 7 * 24 * 3600 * 1000);
        if (!ok) {
          const next = new Date(new Date(row.weekly_at).getTime() + 7 * 24 * 3600 * 1000);
          return interaction.reply({ content: `⏳ Already claimed. Try again ${toDiscordTs(next, 'R')}.`, ephemeral: true });
        }
        const gain = 800;
        await addCoins(interaction.guildId, interaction.user.id, gain);
        await setClaim(interaction.guildId, interaction.user.id, 'weekly_at');
        const updated = await ensureRow(interaction.guildId, interaction.user.id);
        return interaction.reply(`🎁 Weekly claimed: +**${gain}** coins. Total: **${updated.coins}**`);
      }
    },
    prefix: {
      async run(message) {
        const row = await ensureRow(message.guild.id, message.author.id);
        const ok = await canClaim('weekly_at', row, 7 * 24 * 3600 * 1000);
        if (!ok) {
          const next = new Date(new Date(row.weekly_at).getTime() + 7 * 24 * 3600 * 1000);
          return message.reply(`⏳ Already claimed. Try again ${toDiscordTs(next, 'R')}.`);
        }
        const gain = 800;
        await addCoins(message.guild.id, message.author.id, gain);
        await setClaim(message.guild.id, message.author.id, 'weekly_at');
        const updated = await ensureRow(message.guild.id, message.author.id);
        return message.reply(`🎁 Weekly claimed: +${gain} coins. Total: **${updated.coins}**`);
      }
    }
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
        const lines = rows.map((r, i) => `${i + 1}. <@${r.user_id}> — **${r.coins}**`);
        return interaction.reply(`🏆 Coin leaderboard\n${lines.join('\n')}`);
      }
    },
    prefix: {
      async run(message) {
        const { rows } = await db.query(
          `SELECT user_id, coins FROM user_stats WHERE guild_id=$1 ORDER BY coins DESC NULLS LAST LIMIT 10`,
          [message.guild.id]
        );
        if (!rows.length) return message.reply('No leaderboard data yet.');
        const lines = rows.map((r, i) => `${i + 1}. <@${r.user_id}> — **${r.coins}**`);
        return message.reply(`🏆 Coin leaderboard\n${lines.join('\n')}`);
      }
    }
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
        const amount = clampBet(interaction.options.getInteger('amount'));
        if (!amount) return interaction.reply({ content: 'Amount must be 1-100000.', ephemeral: true });

        const spend = await trySpendCoins(interaction.guildId, interaction.user.id, amount);
        if (!spend.ok) return interaction.reply({ content: `Not enough coins. You have **${spend.coins}**.`, ephemeral: true });

        const win = Math.random() < 0.5;
        if (win) await addCoins(interaction.guildId, interaction.user.id, amount * 2);
        const row = await ensureRow(interaction.guildId, interaction.user.id);
        return interaction.reply(`${win ? '✅ You won' : '❌ You lost'} **${amount}** coins. Total: **${row.coins}**`);
      }
    },
    prefix: {
      async run(message, args) {
        const amount = clampBet(parseInt(args[0], 10));
        if (!amount) return message.reply('Usage: `!gamble <amount>`');
        const spend = await trySpendCoins(message.guild.id, message.author.id, amount);
        if (!spend.ok) return message.reply(`Not enough coins. You have **${spend.coins}**.`);
        const win = Math.random() < 0.5;
        if (win) await addCoins(message.guild.id, message.author.id, amount * 2);
        const row = await ensureRow(message.guild.id, message.author.id);
        return message.reply(`${win ? '✅ You won' : '❌ You lost'} ${amount} coins. Total: **${row.coins}**`);
      }
    }
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
        const bet = clampBet(interaction.options.getInteger('bet'));
        if (!bet) return interaction.reply({ content: 'Bet must be 1-100000.', ephemeral: true });
        const spend = await trySpendCoins(interaction.guildId, interaction.user.id, bet);
        if (!spend.ok) return interaction.reply({ content: `Not enough coins. You have **${spend.coins}**.`, ephemeral: true });

        const symbols = ['🍒', '🍋', '🍉', '⭐', '💎'];
        const a = symbols[rand(0, 4)], b = symbols[rand(0, 4)], c = symbols[rand(0, 4)];
        let mult = 0;
        if (a === b && b === c) mult = a === '💎' ? 5 : 3;
        else if (a === b || b === c || a === c) mult = 1;

        if (mult > 0) await addCoins(interaction.guildId, interaction.user.id, bet * (mult + 1));
        const row = await ensureRow(interaction.guildId, interaction.user.id);
        return interaction.reply(`🎰 ${a} ${b} ${c}\n${mult === 0 ? '❌ Lose' : `✅ Win x${mult}`}\nTotal: **${row.coins}**`);
      }
    },
    prefix: {
      async run(message, args) {
        const bet = clampBet(parseInt(args[0], 10));
        if (!bet) return message.reply('Usage: `!slots <bet>`');
        const spend = await trySpendCoins(message.guild.id, message.author.id, bet);
        if (!spend.ok) return message.reply(`Not enough coins. You have **${spend.coins}**.`);
        const symbols = ['🍒', '🍋', '🍉', '⭐', '💎'];
        const a = symbols[rand(0, 4)], b = symbols[rand(0, 4)], c = symbols[rand(0, 4)];
        let mult = 0;
        if (a === b && b === c) mult = a === '💎' ? 5 : 3;
        else if (a === b || b === c || a === c) mult = 1;
        if (mult > 0) await addCoins(message.guild.id, message.author.id, bet * (mult + 1));
        const row = await ensureRow(message.guild.id, message.author.id);
        return message.reply(`🎰 ${a} ${b} ${c}\n${mult === 0 ? '❌ Lose' : `✅ Win x${mult}`}\nTotal: **${row.coins}**`);
      }
    }
  },

  {
    name: 'blackjack',
    aliases: ['bj'],
    category: 'minigames',
    description: 'Blackjack vs dealer (interactive)',
    slash: {
      data: new SlashCommandBuilder()
        .setName('blackjack')
        .setDescription('Play blackjack (interactive)')
        .addIntegerOption(o => o.setName('bet').setDescription('Bet amount').setRequired(true)),
      async run(interaction) {
        return runBlackjack(interaction);
      }
    }
  },

  {
    name: 'hilo',
    category: 'minigames',
    description: 'Higher or lower (interactive)',
    slash: {
      data: new SlashCommandBuilder()
        .setName('hilo')
        .setDescription('Play HiLo (interactive)')
        .addIntegerOption(o => o.setName('bet').setDescription('Bet amount').setRequired(true)),
      async run(interaction) {
        return runHilo(interaction);
      }
    }
  },

  {
    name: 'mines',
    category: 'minigames',
    description: 'Mines (interactive)',
    slash: {
      data: new SlashCommandBuilder()
        .setName('mines')
        .setDescription('Play Mines (interactive)')
        .addIntegerOption(o => o.setName('bet').setDescription('Bet amount').setRequired(true)),
      async run(interaction) {
        return runMines(interaction);
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
        const ok = await canClaim('fish_at', row, 10 * 60 * 1000);
        if (!ok) {
          const next = new Date(new Date(row.fish_at).getTime() + 10 * 60 * 1000);
          return interaction.reply({ content: `🎣 You are tired. Try again ${toDiscordTs(next, 'R')}.`, ephemeral: true });
        }
        const outcomes = [
          { msg: 'You caught a small fish 🐟', coins: 20 },
          { msg: 'You caught a big fish 🐠', coins: 60 },
          { msg: 'You caught trash 🥫', coins: 0 },
          { msg: 'You found a pearl 🦪', coins: 120 },
          { msg: 'Nothing bit... 🌊', coins: 0 }
        ];
        const pick = outcomes[rand(0, outcomes.length - 1)];
        if (pick.coins > 0) await addCoins(interaction.guildId, interaction.user.id, pick.coins);
        await setClaim(interaction.guildId, interaction.user.id, 'fish_at');
        const updated = await ensureRow(interaction.guildId, interaction.user.id);
        return interaction.reply(`🎣 ${pick.msg} ${pick.coins ? `(+${pick.coins} coins)` : ''}\nTotal: **${updated.coins}**`);
      }
    },
    prefix: {
      async run(message) {
        const row = await ensureRow(message.guild.id, message.author.id);
        const ok = await canClaim('fish_at', row, 10 * 60 * 1000);
        if (!ok) {
          const next = new Date(new Date(row.fish_at).getTime() + 10 * 60 * 1000);
          return message.reply(`🎣 You are tired. Try again ${toDiscordTs(next, 'R')}.`);
        }
        const outcomes = [
          { msg: 'You caught a small fish 🐟', coins: 20 },
          { msg: 'You caught a big fish 🐠', coins: 60 },
          { msg: 'You caught trash 🥫', coins: 0 },
          { msg: 'You found a pearl 🦪', coins: 120 },
          { msg: 'Nothing bit... 🌊', coins: 0 }
        ];
        const pick = outcomes[rand(0, outcomes.length - 1)];
        if (pick.coins > 0) await addCoins(message.guild.id, message.author.id, pick.coins);
        await setClaim(message.guild.id, message.author.id, 'fish_at');
        const updated = await ensureRow(message.guild.id, message.author.id);
        return message.reply(`🎣 ${pick.msg} ${pick.coins ? `(+${pick.coins} coins)` : ''}\nTotal: **${updated.coins}**`);
      }
    }
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
            await interaction.followUp({ content: `⏱️ Game over! The number was **${target}**.`, ephemeral: true }).catch(() => {});
          }
        });
      }
    },
    prefix: {
      async run(message) {
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
          if (reason !== 'win') await message.reply(`⏱️ Game over! The number was **${target}**.`);
        });
      }
    }
  }
];
