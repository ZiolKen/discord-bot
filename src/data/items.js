const ITEMS = new Map([
  ['minnow', { id: 'minnow', name: 'Minnow', emoji: '🐟', category: 'fish', rarity: 'common', sellPrice: 3, tradeValue: 5 }],
  ['sardine', { id: 'sardine', name: 'Sardine', emoji: '🐟', category: 'fish', rarity: 'common', sellPrice: 4, tradeValue: 7 }],
  ['salmon', { id: 'salmon', name: 'Salmon', emoji: '🐟', category: 'fish', rarity: 'uncommon', sellPrice: 8, tradeValue: 12 }],
  ['tuna', { id: 'tuna', name: 'Tuna', emoji: '🐟', category: 'fish', rarity: 'uncommon', sellPrice: 10, tradeValue: 16 }],
  ['pufferfish', { id: 'pufferfish', name: 'Pufferfish', emoji: '🐡', category: 'fish', rarity: 'rare', sellPrice: 22, tradeValue: 32 }],
  ['koi', { id: 'koi', name: 'Koi', emoji: '🐠', category: 'fish', rarity: 'rare', sellPrice: 28, tradeValue: 40 }],
  ['golden_koi', { id: 'golden_koi', name: 'Golden Koi', emoji: '✨🐠', category: 'fish', rarity: 'legendary', sellPrice: 120, tradeValue: 160 }],

  ['bunny', { id: 'bunny', name: 'Bunny', emoji: '🐇', category: 'hunt', rarity: 'common', sellPrice: 6, tradeValue: 10 }],
  ['duck', { id: 'duck', name: 'Duck', emoji: '🦆', category: 'hunt', rarity: 'common', sellPrice: 6, tradeValue: 10 }],
  ['fox_tail', { id: 'fox_tail', name: 'Fox Tail', emoji: '🦊', category: 'hunt', rarity: 'uncommon', sellPrice: 14, tradeValue: 22 }],
  ['deer_antler', { id: 'deer_antler', name: 'Deer Antler', emoji: '🦌', category: 'hunt', rarity: 'uncommon', sellPrice: 16, tradeValue: 25 }],
  ['wolf_pelt', { id: 'wolf_pelt', name: 'Wolf Pelt', emoji: '🐺', category: 'hunt', rarity: 'rare', sellPrice: 34, tradeValue: 48 }],
  ['bear_claw', { id: 'bear_claw', name: 'Bear Claw', emoji: '🐻', category: 'hunt', rarity: 'rare', sellPrice: 40, tradeValue: 56 }],
  ['phoenix_feather', { id: 'phoenix_feather', name: 'Phoenix Feather', emoji: '🔥🪶', category: 'hunt', rarity: 'legendary', sellPrice: 180, tradeValue: 240 }],

  ['wooden_crate', { id: 'wooden_crate', name: 'Wooden Crate', emoji: '📦', category: 'crate', rarity: 'common', buyPrice: 120, sellPrice: 45, tradeValue: 100 }],
  ['iron_crate', { id: 'iron_crate', name: 'Iron Crate', emoji: '🧰', category: 'crate', rarity: 'uncommon', buyPrice: 350, sellPrice: 120, tradeValue: 300 }],
  ['mystic_crate', { id: 'mystic_crate', name: 'Mystic Crate', emoji: '🪄📦', category: 'crate', rarity: 'rare', buyPrice: 1200, sellPrice: 420, tradeValue: 1000 }],

  ['bait', { id: 'bait', name: 'Fishing Bait', emoji: '🪱', category: 'utility', rarity: 'common', buyPrice: 60, tradeValue: 50 }],
  ['trap', { id: 'trap', name: 'Hunter Trap', emoji: '🪤', category: 'utility', rarity: 'common', buyPrice: 90, tradeValue: 80 }],

  ['lucky_charm', { id: 'lucky_charm', name: 'Lucky Charm', emoji: '🍀', category: 'utility', rarity: 'uncommon', buyPrice: 500, sellPrice: 180, tradeValue: 420 }],
  ['rename_ticket', { id: 'rename_ticket', name: 'Rename Ticket', emoji: '🪪', category: 'utility', rarity: 'rare', buyPrice: 2000, sellPrice: 700, tradeValue: 1600 }],
  ['color_spray', { id: 'color_spray', name: 'Color Spray', emoji: '🎨', category: 'cosmetic', rarity: 'common', buyPrice: 180, sellPrice: 60, tradeValue: 150 }],
  ['sticker_pack', { id: 'sticker_pack', name: 'Sticker Pack', emoji: '🧷', category: 'cosmetic', rarity: 'uncommon', buyPrice: 650, sellPrice: 220, tradeValue: 520 }],
  ['profile_badge', { id: 'profile_badge', name: 'Profile Badge', emoji: '🏷️', category: 'cosmetic', rarity: 'rare', buyPrice: 2500, sellPrice: 850, tradeValue: 2000 }],

  ['game_ticket', { id: 'game_ticket', name: 'Game Ticket', emoji: '🎟️', category: 'utility', rarity: 'common', buyPrice: 80, sellPrice: 25, tradeValue: 60 }],
  ['dice_set', { id: 'dice_set', name: 'Dice Set', emoji: '🎲', category: 'utility', rarity: 'uncommon', buyPrice: 300, sellPrice: 100, tradeValue: 260 }],
  ['card_deck', { id: 'card_deck', name: 'Card Deck', emoji: '🃏', category: 'utility', rarity: 'uncommon', buyPrice: 320, sellPrice: 110, tradeValue: 270 }],

  ['meme_scroll', { id: 'meme_scroll', name: 'Meme Scroll', emoji: '📜', category: 'fun', rarity: 'common', buyPrice: 150, sellPrice: 55, tradeValue: 120 }],
  ['pixel_brush', { id: 'pixel_brush', name: 'Pixel Brush', emoji: '🧱', category: 'fun', rarity: 'uncommon', buyPrice: 700, sellPrice: 240, tradeValue: 580 }],
  ['star_fragment', { id: 'star_fragment', name: 'Star Fragment', emoji: '🌟', category: 'rare', rarity: 'rare', sellPrice: 90, tradeValue: 120 }],
  ['ancient_coin', { id: 'ancient_coin', name: 'Ancient Coin', emoji: '🪙', category: 'rare', rarity: 'legendary', sellPrice: 300, tradeValue: 420 }]
]);

const ALIASES = new Map([
  ['min', 'minnow'],
  ['sard', 'sardine'],
  ['sal', 'salmon'],
  ['pf', 'pufferfish'],
  ['gkoi', 'golden_koi'],
  ['wc', 'wooden_crate'],
  ['ic', 'iron_crate'],
  ['mc', 'mystic_crate'],
  ['ticket', 'game_ticket']
]);

function normalizeItemId(input) {
  const raw = String(input || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!raw) return null;
  if (ITEMS.has(raw)) return raw;
  const a = ALIASES.get(raw);
  return a || null;
}

function getItem(id) {
  const key = normalizeItemId(id);
  if (!key) return null;
  return ITEMS.get(key) || null;
}

function listItems() {
  return [...ITEMS.values()];
}

function listShopItems(category) {
  const cat = category ? String(category).toLowerCase().trim() : null;
  return listItems()
    .filter(i => Number.isInteger(i.buyPrice) && i.buyPrice > 0)
    .filter(i => (cat ? String(i.category) === cat : true))
    .sort((a, b) => (a.buyPrice - b.buyPrice) || a.name.localeCompare(b.name));
}

function userPriceBounds(item) {
  const base = Number.isInteger(item.tradeValue) ? item.tradeValue : (Number.isInteger(item.buyPrice) ? item.buyPrice : item.sellPrice || 1);
  const min = Math.max(1, Math.floor(base * 0.5));
  const max = Math.max(min, Math.floor(base * 3));
  return { min, max };
}

module.exports = {
  ITEMS,
  normalizeItemId,
  getItem,
  listItems,
  listShopItems,
  userPriceBounds
};
