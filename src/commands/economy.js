const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { listShopItems, getItem, normalizeItemId, userPriceBounds } = require('../data/items');
const { getInventory, buyFromBot, sellToBot, useItem, validateUserPrice } = require('../services/items');
const { getOrCreate, DAILY_COOLDOWN_MS, WEEKLY_COOLDOWN_MS } = require('../services/economy');
const { toDiscordTs } = require('../utils/time');
const market = require('../services/market');
const trades = require('../services/trades');

function formatCoins(n) {
  return `${Number(n || 0).toLocaleString('en-US')}`;
}

function fmtItem(item) {
  const e = item.emoji ? `${item.emoji} ` : '';
  return `${e}${item.name} \`${item.id}\``;
}

function parseQty(v) {
  if (v == null) return 1;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) return null;
  return Math.min(1_000_000, n);
}

function parseId(v) {
  const id = normalizeItemId(v);
  return id || null;
}

function invEmbed(user, rows) {
  const lines = [];
  for (const r of rows) {
    const item = getItem(r.item_id);
    if (!item) continue;
    lines.push(`${fmtItem(item)} × **${formatCoins(r.qty)}**`);
  }
  const desc = lines.length ? lines.join('\n') : '*Empty*';
  return new EmbedBuilder()
    .setTitle(`Inventory — ${user.username}`)
    .setDescription(desc)
    .setColor(0x2b2d31);
}

function shopEmbed(category, page, pageSize) {
  const list = listShopItems(category);
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const p = Math.max(1, Math.min(totalPages, page));
  const start = (p - 1) * pageSize;
  const slice = list.slice(start, start + pageSize);

  const lines = slice.map(i => {
    const sell = Number.isInteger(i.sellPrice) ? ` • Sell: **${formatCoins(i.sellPrice)}**` : '';
    return `${fmtItem(i)} • Buy: **${formatCoins(i.buyPrice)}**${sell}`;
  });

  const title = category ? `Shop — ${category}` : 'Shop';
  const footer = `Page ${p}/${totalPages} • /buy <item> <qty>`;

  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(lines.length ? lines.join('\n') : '*No items*')
    .setFooter({ text: footer })
    .setColor(0x2b2d31);
}

function marketListingLine(r) {
  const item = getItem(r.item_id);
  const name = item ? fmtItem(item) : `\`${r.item_id}\``;
  const expires = r.expires_at ? `<t:${Math.floor(new Date(r.expires_at).getTime() / 1000)}:R>` : '—';
  return `#**${r.id}** • ${name} × **${formatCoins(r.qty)}** • **${formatCoins(r.price_each)}**/ea • expires ${expires} • seller <@${r.seller_id}>`;
}

function nextClaimText(lastDate, cooldownMs) {
  if (!lastDate) return 'Ready';
  const t = new Date(new Date(lastDate).getTime() + cooldownMs);
  if (Date.now() >= t.getTime()) return 'Ready';
  return toDiscordTs(t, 'R');
}

module.exports = [
  {
    name: 'inventory',
    aliases: ['inv', 'bag'],
    category: 'economy',
    description: 'View your inventory',
    slash: {
      data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('View your inventory')
        .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(false)),
      async run(interaction) {
        const user = interaction.options.getUser('user') || interaction.user;
        const rows = await getInventory(interaction.guildId, user.id, 80);
        return interaction.reply({ embeds: [invEmbed(user, rows)] });
      }
    },
    prefix: {
      async run(message) {
        const user = message.mentions.users.first() || message.author;
        const rows = await getInventory(message.guild.id, user.id, 80);
        return message.reply({ embeds: [invEmbed(user, rows)] });
      }
    }
  },

  {
    name: 'shop',
    category: 'economy',
    description: 'Browse the item shop',
    slash: {
      data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Browse the item shop')
        .addStringOption(o => o.setName('category').setDescription('Category (fish, hunt, crate, utility, cosmetic, fun)').setRequired(false))
        .addIntegerOption(o => o.setName('page').setDescription('Page').setRequired(false)),
      async run(interaction) {
        const category = interaction.options.getString('category') || null;
        const page = interaction.options.getInteger('page') || 1;
        return interaction.reply({ embeds: [shopEmbed(category, page, 10)] });
      }
    },
    prefix: {
      async run(message, args) {
        const category = args[0] || null;
        const page = Number(args[1] || 1) || 1;
        return message.reply({ embeds: [shopEmbed(category, page, 10)] });
      }
    }
  },

  {
    name: 'buy',
    category: 'economy',
    description: 'Buy an item from the bot shop',
    slash: {
      data: new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Buy an item from the bot shop')
        .addStringOption(o => o.setName('item').setDescription('Item id').setRequired(true))
        .addIntegerOption(o => o.setName('qty').setDescription('Quantity').setRequired(false)),
      async run(interaction) {
        const itemId = parseId(interaction.options.getString('item'));
        const qty = parseQty(interaction.options.getInteger('qty'));
        if (!itemId || !qty) return interaction.reply('Invalid item or quantity.');

        const out = await buyFromBot(interaction.guildId, interaction.user.id, itemId, qty).catch((e) => ({ error: e }));
        if (out?.error) return interaction.reply(`❌ ${out.error.message}`);
        if (!out) return interaction.reply('❌ Not enough coins.');

        const embed = new EmbedBuilder()
          .setTitle('Purchase complete')
          .setDescription(`${fmtItem(out.item)} × **${formatCoins(out.qty)}**\nCost: **${formatCoins(out.total)}**\nBalance: **${formatCoins(out.coins)}**`)
          .setColor(0x2b2d31);

        return interaction.reply({ embeds: [embed] });
      }
    },
    prefix: {
      async run(message, args) {
        const itemId = parseId(args[0]);
        const qty = parseQty(args[1] ? Number(args[1]) : 1);
        if (!itemId || !qty) return message.reply('Usage: `!buy <item> [qty]`');

        const out = await buyFromBot(message.guild.id, message.author.id, itemId, qty).catch((e) => ({ error: e }));
        if (out?.error) return message.reply(`❌ ${out.error.message}`);
        if (!out) return message.reply('❌ Not enough coins.');

        return message.reply(`✅ Bought ${fmtItem(out.item)} × ${formatCoins(out.qty)} for ${formatCoins(out.total)}. Balance: ${formatCoins(out.coins)}.`);
      }
    }
  },

  {
    name: 'sell',
    category: 'economy',
    description: 'Sell items to the bot for coins',
    slash: {
      data: new SlashCommandBuilder()
        .setName('sell')
        .setDescription('Sell items to the bot')
        .addStringOption(o => o.setName('item').setDescription('Item id').setRequired(true))
        .addIntegerOption(o => o.setName('qty').setDescription('Quantity').setRequired(false)),
      async run(interaction) {
        const itemId = parseId(interaction.options.getString('item'));
        const qty = parseQty(interaction.options.getInteger('qty'));
        if (!itemId || !qty) return interaction.reply('Invalid item or quantity.');

        const out = await sellToBot(interaction.guildId, interaction.user.id, itemId, qty).catch((e) => ({ error: e }));
        if (out?.error) return interaction.reply(`❌ ${out.error.message}`);
        if (!out) return interaction.reply('❌ You do not have enough of that item.');

        const embed = new EmbedBuilder()
          .setTitle('Sold to bot')
          .setDescription(`${fmtItem(out.item)} × **${formatCoins(out.qty)}**\nGained: **${formatCoins(out.total)}**\nBalance: **${formatCoins(out.coins)}**`)
          .setColor(0x2b2d31);

        return interaction.reply({ embeds: [embed] });
      }
    },
    prefix: {
      async run(message, args) {
        const itemId = parseId(args[0]);
        const qty = parseQty(args[1] ? Number(args[1]) : 1);
        if (!itemId || !qty) return message.reply('Usage: `!sell <item> [qty]`');

        const out = await sellToBot(message.guild.id, message.author.id, itemId, qty).catch((e) => ({ error: e }));
        if (out?.error) return message.reply(`❌ ${out.error.message}`);
        if (!out) return message.reply('❌ You do not have enough of that item.');

        return message.reply(`✅ Sold ${fmtItem(out.item)} × ${formatCoins(out.qty)} for ${formatCoins(out.total)}. Balance: ${formatCoins(out.coins)}.`);
      }
    }
  },

  {
    name: 'use',
    category: 'economy',
    description: 'Use an item (open crates, etc.)',
    slash: {
      data: new SlashCommandBuilder()
        .setName('use')
        .setDescription('Use an item')
        .addStringOption(o => o.setName('item').setDescription('Item id').setRequired(true))
        .addStringOption(o => o.setName('arg').setDescription('Optional argument').setRequired(false)),
      async run(interaction) {
        const itemId = parseId(interaction.options.getString('item'));
        if (!itemId) return interaction.reply({ content: 'Invalid item.', ephemeral: true });

        const arg = interaction.options.getString('arg') || null;
        const out = await useItem(interaction.guildId, interaction.user.id, itemId, arg).catch((e) => ({ error: e }));
        if (out?.error) return interaction.reply({ content: `❌ ${out.error.message}`, ephemeral: true });
        if (!out) return interaction.reply({ content: '❌ You do not have that item.', ephemeral: true });

        if (out.kind === 'crate') {
          const lines = out.drops.map(d => `${fmtItem(d.item)} × **${formatCoins(d.qty)}**`);
          const embed = new EmbedBuilder()
            .setTitle('Crate opened')
            .setDescription(`Used ${fmtItem(out.crate)}\n\n**Loot**\n${lines.join('\n')}`)
            .setColor(0x2b2d31);
          if (out.boostUsed) embed.setFooter({ text: '🍀 Lucky Charm: +1 extra drop used' });
          return interaction.reply({ embeds: [embed] });
        }

        if (out.kind === 'buff') {
          if (out.buff === 'fish') return interaction.reply({ content: `🪱 Fishing Boost activated: +${out.added} charges. Total: **${formatCoins(out.boosts)}**`, allowedMentions: { parse: [] } });
          if (out.buff === 'hunt') return interaction.reply({ content: `🪤 Hunting Boost activated: +${out.added} charges. Total: **${formatCoins(out.boosts)}**`, allowedMentions: { parse: [] } });
          if (out.buff === 'crate') return interaction.reply({ content: `🍀 Crate Boost activated: next crates get **+1** extra drop. Boosts: **${formatCoins(out.boosts)}**`, allowedMentions: { parse: [] } });
          return interaction.reply({ content: '✅ Activated.', allowedMentions: { parse: [] } });
        }

        if (out.kind === 'profile') {
          if (typeof out.title === 'string') return interaction.reply({ content: `🪪 Profile title set to: **${out.title}**`, allowedMentions: { parse: [] } });
          if (Number.isInteger(out.color)) return interaction.reply({ content: `🎨 Profile color set to: **#${out.color.toString(16).padStart(6, '0')}**`, allowedMentions: { parse: [] } });
          return interaction.reply({ content: '✅ Updated.', allowedMentions: { parse: [] } });
        }

        return interaction.reply({ content: '✅ Done.', allowedMentions: { parse: [] } });
      }
    },
    prefix: {
      async run(message, args) {
        const itemId = parseId(args[0]);
        if (!itemId) return message.reply('Usage: `!use <item>`');

        const arg = args.slice(1).join(' ') || null;
        const out = await useItem(message.guild.id, message.author.id, itemId, arg).catch((e) => ({ error: e }));
        if (out?.error) return message.reply(`❌ ${out.error.message}`);
        if (!out) return message.reply('❌ You do not have that item.');

        if (out.kind === 'crate') {
          const lines = out.drops.map(d => `${fmtItem(d.item)} × ${formatCoins(d.qty)}`);
          const extra = out.boostUsed ? '\n🍀 Lucky Charm: +1 extra drop used' : '';
          return message.reply(`📦 Opened ${fmtItem(out.crate)}\n${lines.join('\n')}${extra}`);
        }

        if (out.kind === 'buff') {
          if (out.buff === 'fish') return message.reply(`🪱 Fishing Boost: +${out.added} charges. Total: ${formatCoins(out.boosts)}`);
          if (out.buff === 'hunt') return message.reply(`🪤 Hunting Boost: +${out.added} charges. Total: ${formatCoins(out.boosts)}`);
          if (out.buff === 'crate') return message.reply(`🍀 Crate Boost: next crates +1 drop. Boosts: ${formatCoins(out.boosts)}`);
          return message.reply('✅ Activated.');
        }

        if (out.kind === 'profile') {
          if (typeof out.title === 'string') return message.reply(`🪪 Profile title set to: ${out.title}`);
          if (Number.isInteger(out.color)) return message.reply(`🎨 Profile color set to: #${out.color.toString(16).padStart(6, '0')}`);
          return message.reply('✅ Updated.');
        }

        return message.reply('✅ Done.');
      }
    }
  },

  {
    name: 'profile',
    category: 'economy',
    description: 'View your economy profile (streaks, boosts, etc.)',
    slash: {
      data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('View your economy profile')
        .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(false)),
      async run(interaction) {
        const user = interaction.options.getUser('user') || interaction.user;
        const row = await getOrCreate(interaction.guildId, user.id);
        const color = Number.isInteger(row.profile_color) ? row.profile_color : 0x2b2d31;
        const title = row.profile_title ? String(row.profile_title) : null;

        const embed = new EmbedBuilder()
          .setTitle(`Profile — ${user.username}`)
          .setColor(color)
          .addFields(
            { name: 'Coins', value: `**${formatCoins(row.coins)}**`, inline: true },
            { name: 'Daily streak', value: `**${formatCoins(row.daily_streak || 0)}** (best ${formatCoins(row.daily_best || 0)})`, inline: true },
            { name: 'Weekly streak', value: `**${formatCoins(row.weekly_streak || 0)}** (best ${formatCoins(row.weekly_best || 0)})`, inline: true },
            { name: 'Daily', value: nextClaimText(row.daily_at, DAILY_COOLDOWN_MS), inline: true },
            { name: 'Weekly', value: nextClaimText(row.weekly_at, WEEKLY_COOLDOWN_MS), inline: true },
            { name: 'Boosts', value: `🎣 ${formatCoins(row.fish_boost || 0)} • 🏹 ${formatCoins(row.hunt_boost || 0)} • 🍀 ${formatCoins(row.crate_boost || 0)}`, inline: false }
          )
          .setThumbnail(user.displayAvatarURL());

        if (title) embed.setDescription(`**Title:** ${title}`);

        return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
      }
    },
    prefix: {
      async run(message) {
        const user = message.mentions.users.first() || message.author;
        const row = await getOrCreate(message.guild.id, user.id);
        const title = row.profile_title ? String(row.profile_title) : null;
        const dailyNext = nextClaimText(row.daily_at, DAILY_COOLDOWN_MS);
        const weeklyNext = nextClaimText(row.weekly_at, WEEKLY_COOLDOWN_MS);
        const boosts = `🎣 ${formatCoins(row.fish_boost || 0)} • 🏹 ${formatCoins(row.hunt_boost || 0)} • 🍀 ${formatCoins(row.crate_boost || 0)}`;
        const lines = [
          `💰 Coins: **${formatCoins(row.coins)}**`,
          `📅 Daily streak: **${formatCoins(row.daily_streak || 0)}** (best ${formatCoins(row.daily_best || 0)}) • next: ${dailyNext}`,
          `🗓️ Weekly streak: **${formatCoins(row.weekly_streak || 0)}** (best ${formatCoins(row.weekly_best || 0)}) • next: ${weeklyNext}`,
          `✨ Boosts: ${boosts}`
        ];
        if (title) lines.unshift(`🪪 Title: **${title}**`);
        return message.reply({ content: lines.join('\n'), allowedMentions: { parse: [] } });
      }
    }
  },

  {
    name: 'market',
    category: 'economy',
    description: 'Player marketplace',
    slash: {
      data: new SlashCommandBuilder()
        .setName('market')
        .setDescription('Player marketplace')
        .addSubcommand(sc =>
          sc.setName('list')
            .setDescription('Create a listing (items are escrowed)')
            .addStringOption(o => o.setName('item').setDescription('Item id').setRequired(true))
            .addIntegerOption(o => o.setName('qty').setDescription('Quantity').setRequired(true))
            .addIntegerOption(o => o.setName('price').setDescription('Price each').setRequired(true))
        )
        .addSubcommand(sc =>
          sc.setName('browse')
            .setDescription('Browse listings')
            .addStringOption(o => o.setName('item').setDescription('Filter by item id').setRequired(false))
            .addIntegerOption(o => o.setName('page').setDescription('Page').setRequired(false))
        )
        .addSubcommand(sc =>
          sc.setName('buy')
            .setDescription('Buy from a listing')
            .addIntegerOption(o => o.setName('id').setDescription('Listing id').setRequired(true))
            .addIntegerOption(o => o.setName('qty').setDescription('Quantity (default: all)').setRequired(false))
        )
        .addSubcommand(sc =>
          sc.setName('cancel')
            .setDescription('Cancel your listing')
            .addIntegerOption(o => o.setName('id').setDescription('Listing id').setRequired(true))
        ),
      async run(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'list') {
          const itemId = parseId(interaction.options.getString('item'));
          const qty = parseQty(interaction.options.getInteger('qty'));
          const price = interaction.options.getInteger('price');
          if (!itemId || !qty) return interaction.reply('Invalid item or quantity.');

          const item = getItem(itemId);
          if (!item) return interaction.reply('Invalid item.');

          try {
            validateUserPrice(item, price);
          } catch (e) {
            const b = e?.bounds || userPriceBounds(item);
            return interaction.reply(`❌ Price out of bounds. Allowed: **${formatCoins(b.min)}**–**${formatCoins(b.max)}** each.`);
          }

          const out = await market.createListing(interaction.guildId, interaction.user.id, itemId, qty, price);
          if (!out) return interaction.reply('❌ You do not have enough of that item.');

          return interaction.reply(`✅ Listed ${fmtItem(out.item)} × **${formatCoins(out.qty)}** for **${formatCoins(out.priceEach)}** each. Listing ID: **${out.id}**`);
        }

        if (sub === 'browse') {
          const itemId = interaction.options.getString('item');
          const page = interaction.options.getInteger('page') || 1;
          const rows = await market.listListings(interaction.guildId, { itemId, page, pageSize: 10 });
          if (!rows.length) return interaction.reply('No active listings.');

          const embed = new EmbedBuilder()
            .setTitle('Market')
            .setDescription(rows.map(marketListingLine).join('\n'))
            .setFooter({ text: `Page ${page}` })
            .setColor(0x2b2d31);

          return interaction.reply({ embeds: [embed] });
        }

        if (sub === 'buy') {
          const id = interaction.options.getInteger('id');
          const qty = interaction.options.getInteger('qty');
          const out = await market.buyListing(interaction.guildId, interaction.user.id, id, qty);
          if (!out) return interaction.reply('❌ Listing not found or not active.');
          if (out.expired) return interaction.reply('❌ Listing expired.');
          if (out.self) return interaction.reply('❌ You cannot buy your own listing.');
          if (out.insufficientCoins) return interaction.reply('❌ Not enough coins.');
          if (out.insufficientListingQty) return interaction.reply(`❌ Not enough stock. Available: **${formatCoins(out.available)}**`);
          if (out.error) return interaction.reply(`❌ ${out.error.message}`);

          const item = getItem(out.itemId);
          const feeLine = out.fee ? `\nFee: **${formatCoins(out.fee)}** (burned)` : '';
          const sellerLine = out.fee ? `\nSeller gets: **${formatCoins(out.sellerPayout)}**` : '';
          const embed = new EmbedBuilder()
            .setTitle('Market purchase')
            .setDescription(`Bought ${fmtItem(item)} × **${formatCoins(out.qty)}**\nTotal: **${formatCoins(out.total)}**${feeLine}${sellerLine}\nBalance: **${formatCoins(out.buyerCoins)}**`)
            .setColor(0x2b2d31);

          return interaction.reply({ embeds: [embed] });
        }

        if (sub === 'cancel') {
          const id = interaction.options.getInteger('id');
          const out = await market.cancelListing(interaction.guildId, interaction.user.id, id);
          if (!out) return interaction.reply('❌ Listing not found or not active.');
          if (out.forbidden) return interaction.reply('❌ This listing is not yours.');

          const item = getItem(out.itemId);
          return interaction.reply(`✅ Cancelled listing **#${out.id}** and returned ${fmtItem(item)} × **${formatCoins(out.qty)}** to your inventory.`);
        }

        return interaction.reply('Invalid subcommand.');
      }
    },
    prefix: {
      async run(message, args) {
        const sub = String(args[0] || '').toLowerCase();
        if (!sub) return message.reply('Usage: `!market list|browse|buy|cancel ...`');

        if (sub === 'browse') {
          const itemId = args[1] || null;
          const page = Number(args[2] || 1) || 1;
          const rows = await market.listListings(message.guild.id, { itemId, page, pageSize: 10 });
          if (!rows.length) return message.reply('No active listings.');
          return message.reply(rows.map(marketListingLine).join('\n'));
        }

        if (sub === 'list') {
          const itemId = parseId(args[1]);
          const qty = parseQty(Number(args[2]));
          const price = Number(args[3]);
          if (!itemId || !qty || !Number.isInteger(price) || price <= 0) return message.reply('Usage: `!market list <item> <qty> <priceEach>`');

          const item = getItem(itemId);
          try {
            validateUserPrice(item, price);
          } catch (e) {
            const b = e?.bounds || userPriceBounds(item);
            return message.reply(`❌ Price out of bounds. Allowed: ${formatCoins(b.min)}–${formatCoins(b.max)} each.`);
          }

          const out = await market.createListing(message.guild.id, message.author.id, itemId, qty, price);
          if (!out) return message.reply('❌ You do not have enough of that item.');
          return message.reply(`✅ Listed ${fmtItem(out.item)} × ${formatCoins(out.qty)} for ${formatCoins(out.priceEach)}/ea. ID: ${out.id}`);
        }

        if (sub === 'buy') {
          const id = Number(args[1]);
          const qty = args[2] ? Number(args[2]) : null;
          if (!Number.isInteger(id) || id <= 0) return message.reply('Usage: `!market buy <id> [qty]`');

          const out = await market.buyListing(message.guild.id, message.author.id, id, qty);
          if (!out) return message.reply('❌ Listing not found or not active.');
          if (out.expired) return message.reply('❌ Listing expired.');
          if (out.self) return message.reply('❌ You cannot buy your own listing.');
          if (out.insufficientCoins) return message.reply('❌ Not enough coins.');
          if (out.insufficientListingQty) return message.reply(`❌ Not enough stock. Available: ${formatCoins(out.available)}`);

          const item = getItem(out.itemId);
          const feeLine = out.fee ? ` (fee ${formatCoins(out.fee)} burned, seller gets ${formatCoins(out.sellerPayout)})` : '';
          return message.reply(`✅ Bought ${fmtItem(item)} × ${formatCoins(out.qty)} for ${formatCoins(out.total)}. Balance: ${formatCoins(out.buyerCoins)}.${feeLine}`);
        }

        if (sub === 'cancel') {
          const id = Number(args[1]);
          if (!Number.isInteger(id) || id <= 0) return message.reply('Usage: `!market cancel <id>`');
          const out = await market.cancelListing(message.guild.id, message.author.id, id);
          if (!out) return message.reply('❌ Listing not found or not active.');
          if (out.forbidden) return message.reply('❌ This listing is not yours.');
          const item = getItem(out.itemId);
          return message.reply(`✅ Cancelled #${out.id} and returned ${fmtItem(item)} × ${formatCoins(out.qty)}.`);
        }

        return message.reply('Usage: `!market list|browse|buy|cancel ...`');
      }
    }
  },

  {
    name: 'trade',
    category: 'economy',
    description: 'Trade items with another user (no coins, max 30% value gap)',
    slash: {
      data: new SlashCommandBuilder()
        .setName('trade')
        .setDescription('Trade items with another user (items only)')
        .addSubcommand(sc =>
          sc.setName('request')
            .setDescription('Request a trade with a user')
            .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
        )
        .addSubcommand(sc =>
          sc.setName('accept')
            .setDescription('Accept a trade request')
            .addStringOption(o => o.setName('id').setDescription('Trade id').setRequired(true))
        )
        .addSubcommand(sc =>
          sc.setName('add')
            .setDescription('Add item to your offer (escrowed)')
            .addStringOption(o => o.setName('id').setDescription('Trade id').setRequired(true))
            .addStringOption(o => o.setName('item').setDescription('Item id').setRequired(true))
            .addIntegerOption(o => o.setName('qty').setDescription('Quantity').setRequired(true))
        )
        .addSubcommand(sc =>
          sc.setName('remove')
            .setDescription('Remove item from your offer (returned)')
            .addStringOption(o => o.setName('id').setDescription('Trade id').setRequired(true))
            .addStringOption(o => o.setName('item').setDescription('Item id').setRequired(true))
            .addIntegerOption(o => o.setName('qty').setDescription('Quantity').setRequired(true))
        )
        .addSubcommand(sc =>
          sc.setName('confirm')
            .setDescription('Confirm and finalize if both confirmed')
            .addStringOption(o => o.setName('id').setDescription('Trade id').setRequired(true))
        )
        .addSubcommand(sc =>
          sc.setName('cancel')
            .setDescription('Cancel trade (returns escrow)')
            .addStringOption(o => o.setName('id').setDescription('Trade id').setRequired(true))
        ),
      async run(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'request') {
          const user = interaction.options.getUser('user');
          if (!user || user.bot) return interaction.reply('Invalid target.');
          const out = await trades.createTrade(interaction.guildId, interaction.user.id, user.id);
          return interaction.reply(`🔁 Trade request sent to <@${user.id}>. Trade ID: \`${out.id}\` (expires <t:${Math.floor(out.expiresAt.getTime()/1000)}:R>)\nThey must run: \`/trade accept id:${out.id}\``);
        }

        if (sub === 'accept') {
          const id = interaction.options.getString('id');
          const out = await trades.acceptTrade(interaction.guildId, id, interaction.user.id);
          if (!out) return interaction.reply('❌ Trade not found.');
          if (out.expired) return interaction.reply('❌ Trade expired.');
          if (out.forbidden) return interaction.reply('❌ Only the invited user can accept.');
          return interaction.reply(`✅ Trade accepted. Use \`/trade add\` to offer items, then both \`/trade confirm\`.`);
        }

        if (sub === 'add') {
          const id = interaction.options.getString('id');
          const itemId = parseId(interaction.options.getString('item'));
          const qty = parseQty(interaction.options.getInteger('qty'));
          if (!itemId || !qty) return interaction.reply('Invalid item or quantity.');
          const out = await trades.addTradeItem(interaction.guildId, id, interaction.user.id, itemId, qty);
          if (!out) return interaction.reply('❌ Trade not found.');
          if (out.expired) return interaction.reply('❌ Trade expired.');
          if (out.forbidden) return interaction.reply('❌ You are not part of this trade.');
          if (out.status && out.status !== 'active') return interaction.reply(`❌ Trade is not active (${out.status}).`);
          if (out.insufficientItems) return interaction.reply('❌ Not enough items in inventory.');
          return interaction.reply(`✅ Added ${fmtItem(out.item)} × **${formatCoins(out.qty)}** to your offer.`);
        }

        if (sub === 'remove') {
          const id = interaction.options.getString('id');
          const itemId = parseId(interaction.options.getString('item'));
          const qty = parseQty(interaction.options.getInteger('qty'));
          if (!itemId || !qty) return interaction.reply('Invalid item or quantity.');
          const out = await trades.removeTradeItem(interaction.guildId, id, interaction.user.id, itemId, qty);
          if (!out) return interaction.reply('❌ Trade not found.');
          if (out.expired) return interaction.reply('❌ Trade expired.');
          if (out.forbidden) return interaction.reply('❌ You are not part of this trade.');
          if (out.status && out.status !== 'active') return interaction.reply(`❌ Trade is not active (${out.status}).`);
          if (out.insufficientOfferQty) return interaction.reply('❌ Not enough of that item in your offer.');
          return interaction.reply(`✅ Removed ${fmtItem(out.item)} × **${formatCoins(out.qty)}** from your offer.`);
        }

        if (sub === 'confirm') {
          const id = interaction.options.getString('id');
          const out = await trades.confirmTrade(interaction.guildId, id, interaction.user.id);
          if (!out) return interaction.reply('❌ Trade not found.');
          if (out.expired) return interaction.reply('❌ Trade expired.');
          if (out.forbidden) return interaction.reply('❌ You are not part of this trade.');
          if (out.status && out.status !== 'active') return interaction.reply(`❌ Trade is not active (${out.status}).`);
          if (out.empty) return interaction.reply('❌ Both sides must offer at least 1 item.');
          if (out.unbalanced) return interaction.reply(`❌ Trade value gap too high (max 30%). A: **${formatCoins(out.aValue)}**, B: **${formatCoins(out.bValue)}**`);
          if (out.completed) return interaction.reply(`✅ Trade completed. Value A: **${formatCoins(out.aValue)}**, Value B: **${formatCoins(out.bValue)}**`);
          return interaction.reply(`✅ Confirmed. Waiting for the other user to confirm.`);
        }

        if (sub === 'cancel') {
          const id = interaction.options.getString('id');
          const out = await trades.cancelTrade(interaction.guildId, id, interaction.user.id);
          if (!out) return interaction.reply('❌ Trade not found.');
          if (out.forbidden) return interaction.reply('❌ You are not part of this trade.');
          return interaction.reply(`✅ Trade cancelled. Returned escrowed items: **${formatCoins(out.returned)}** stacks.`);
        }

        return interaction.reply('Invalid subcommand.');
      }
    }
  }
];
