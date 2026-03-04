const db = require('../db');
const { getItem, userPriceBounds } = require('../data/items');
const { randInt, weightedPick, capInt32 } = require('./casino');

function assertQty(qty) {
  if (!Number.isInteger(qty) || qty <= 0) throw new Error('Invalid quantity');
  if (qty > 1_000_000) throw new Error('Quantity too large');
}

function assertIntPrice(p) {
  if (!Number.isInteger(p) || p <= 0) throw new Error('Invalid price');
  if (p > 2_000_000_000) throw new Error('Price too large');
}

async function getInventory(guildId, userId, limit = 50) {
  const { rows } = await db.queryGuild(
    guildId,
    `SELECT item_id, qty
     FROM inventory
     WHERE guild_id=$1 AND user_id=$2
     ORDER BY qty DESC, item_id ASC
     LIMIT $3`,
    [guildId, userId, Math.max(1, Math.min(200, limit))]
  );
  return rows;
}

async function addItem(guildId, userId, itemId, qty) {
  assertQty(qty);
  const item = getItem(itemId);
  if (!item) throw new Error('Unknown item');

  const add = capInt32(qty);
  const { rows } = await db.queryGuild(
    guildId,
    `INSERT INTO inventory (guild_id, user_id, item_id, qty)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (guild_id,user_id,item_id) DO UPDATE
       SET qty = LEAST(2147483647, inventory.qty + EXCLUDED.qty),
           updated_at = now()
     RETURNING qty`,
    [guildId, userId, item.id, add]
  );

  return { item, qty: rows[0].qty };
}

async function tryRemoveItemTx(client, guildId, userId, itemId, qty) {
  assertQty(qty);
  const item = getItem(itemId);
  if (!item) throw new Error('Unknown item');

  const { rows } = await client.query(
    `UPDATE inventory
     SET qty = qty - $4,
         updated_at = now()
     WHERE guild_id=$1 AND user_id=$2 AND item_id=$3 AND qty >= $4
     RETURNING qty`,
    [guildId, userId, item.id, qty]
  );

  if (!rows.length) return null;

  const left = rows[0].qty;
  if (left === 0) {
    await client.query(
      `DELETE FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_id=$3 AND qty=0`,
      [guildId, userId, item.id]
    );
  }

  return { item, left };
}

async function tryRemoveItem(guildId, userId, itemId, qty) {
  return db.txGuild(guildId, async (client) => {
    return tryRemoveItemTx(client, guildId, userId, itemId, qty);
  });
}

async function buyFromBot(guildId, userId, itemId, qty) {
  assertQty(qty);
  const item = getItem(itemId);
  if (!item || !Number.isInteger(item.buyPrice) || item.buyPrice <= 0) throw new Error('Item is not purchasable');

  const total = item.buyPrice * qty;
  if (!Number.isSafeInteger(total) || total <= 0) throw new Error('Total overflow');

  return db.txGuild(guildId, async (client) => {
    await client.query(
      `INSERT INTO user_stats (guild_id, user_id)
       VALUES ($1,$2)
       ON CONFLICT (guild_id,user_id) DO NOTHING`,
      [guildId, userId]
    );

    const spent = await client.query(
      `UPDATE user_stats
       SET coins = coins - $3
       WHERE guild_id=$1 AND user_id=$2 AND coins >= $3
       RETURNING coins`,
      [guildId, userId, total]
    );

    if (!spent.rows.length) return null;

    await client.query(
      `INSERT INTO inventory (guild_id, user_id, item_id, qty)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (guild_id,user_id,item_id) DO UPDATE
         SET qty = LEAST(2147483647, inventory.qty + EXCLUDED.qty),
             updated_at = now()`,
      [guildId, userId, item.id, qty]
    );

    return { coins: spent.rows[0].coins, item, qty, total };
  });
}

async function sellToBot(guildId, userId, itemId, qty) {
  assertQty(qty);
  const item = getItem(itemId);
  if (!item || !Number.isInteger(item.sellPrice) || item.sellPrice <= 0) throw new Error('Item cannot be sold');

  const total = item.sellPrice * qty;
  if (!Number.isSafeInteger(total) || total <= 0) throw new Error('Total overflow');

  return db.txGuild(guildId, async (client) => {
    const removed = await tryRemoveItemTx(client, guildId, userId, item.id, qty);
    if (!removed) return null;

    const gained = await client.query(
      `INSERT INTO user_stats (guild_id, user_id, coins)
       VALUES ($1,$2,$3)
       ON CONFLICT (guild_id,user_id) DO UPDATE
         SET coins = LEAST(2147483647, user_stats.coins + EXCLUDED.coins)
       RETURNING coins`,
      [guildId, userId, total]
    );

    return { coins: gained.rows[0].coins, item, qty, total };
  });
}

function crateLoot(crateId) {
  const id = String(crateId);
  if (id === 'wooden_crate') {
    return [
      { id: 'minnow', w: 55, min: 1, max: 3 },
      { id: 'sardine', w: 25, min: 1, max: 2 },
      { id: 'salmon', w: 14, min: 1, max: 1 },
      { id: 'star_fragment', w: 6, min: 1, max: 1 }
    ];
  }
  if (id === 'iron_crate') {
    return [
      { id: 'salmon', w: 35, min: 1, max: 2 },
      { id: 'tuna', w: 30, min: 1, max: 2 },
      { id: 'fox_tail', w: 18, min: 1, max: 1 },
      { id: 'wolf_pelt', w: 12, min: 1, max: 1 },
      { id: 'ancient_coin', w: 5, min: 1, max: 1 }
    ];
  }
  if (id === 'mystic_crate') {
    return [
      { id: 'pufferfish', w: 28, min: 1, max: 2 },
      { id: 'koi', w: 25, min: 1, max: 2 },
      { id: 'bear_claw', w: 18, min: 1, max: 1 },
      { id: 'star_fragment', w: 15, min: 1, max: 2 },
      { id: 'golden_koi', w: 9, min: 1, max: 1 },
      { id: 'phoenix_feather', w: 5, min: 1, max: 1 }
    ];
  }
  return null;
}

async function openCrate(guildId, userId, crateId) {
  const crate = getItem(crateId);
  if (!crate || crate.category !== 'crate') throw new Error('Not a crate');

  const lootTable = crateLoot(crate.id);
  if (!lootTable) throw new Error('Crate is not configured');

  return db.txGuild(guildId, async (client) => {
    await client.query(
      `INSERT INTO user_stats (guild_id, user_id)
       VALUES ($1,$2)
       ON CONFLICT (guild_id,user_id) DO NOTHING`,
      [guildId, userId]
    );

    const removed = await tryRemoveItemTx(client, guildId, userId, crate.id, 1);
    if (!removed) return null;

    const stRes = await client.query(
      `SELECT crate_boost
       FROM user_stats
       WHERE guild_id=$1 AND user_id=$2
       FOR UPDATE`,
      [guildId, userId]
    );

    const crateBoost = Number(stRes.rows?.[0]?.crate_boost) || 0;
    const boostUsed = crateBoost > 0;
    const nextBoost = boostUsed ? crateBoost - 1 : crateBoost;
    if (boostUsed) {
      await client.query(
        `UPDATE user_stats
         SET crate_boost=$3
         WHERE guild_id=$1 AND user_id=$2`,
        [guildId, userId, nextBoost]
      );
    }

    const drops = [];
    const basePicks = crate.id === 'mystic_crate' ? 3 : 2;
    const picks = basePicks + (boostUsed ? 1 : 0);

    for (let i = 0; i < picks; i++) {
      const pick = weightedPick(lootTable.map(x => ({ id: x.id, w: x.w })));
      const def = lootTable.find(x => x.id === pick.id);
      const amount = randInt(def.min, def.max);
      const it = getItem(def.id);
      drops.push({ item: it, qty: amount });

      await client.query(
        `INSERT INTO inventory (guild_id, user_id, item_id, qty)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (guild_id,user_id,item_id) DO UPDATE
           SET qty = LEAST(2147483647, inventory.qty + EXCLUDED.qty),
               updated_at = now()`,
        [guildId, userId, it.id, amount]
      );
    }

    return { crate, drops, boostUsed, crateBoostLeft: nextBoost };
  });
}

function cleanTitle(input) {
  const s = String(input || '').replace(/\s+/g, ' ').replace(/[\r\n\t]/g, ' ').trim();
  if (!s) return null;
  const clipped = s.slice(0, 32);
  return clipped.replace(/@/g, '＠').replace(/`/g, '');
}

function parseHexColor(input) {
  const raw = String(input || '').trim().toLowerCase().replace(/^#/, '');
  if (!raw) return null;
  if (!/^[0-9a-f]{6}$/.test(raw)) return null;
  const n = Number.parseInt(raw, 16);
  if (!Number.isFinite(n) || n < 0 || n > 0xffffff) return null;
  return n;
}

async function useItem(guildId, userId, itemId, arg) {
  const item = getItem(itemId);
  if (!item) throw new Error('Unknown item');

  if (item.category === 'crate') {
    const out = await openCrate(guildId, userId, item.id);
    if (!out) return null;
    return { kind: 'crate', ...out };
  }

  if (item.id === 'bait') {
    return db.txGuild(guildId, async (client) => {
      await client.query(
        `INSERT INTO user_stats (guild_id, user_id)
         VALUES ($1,$2)
         ON CONFLICT (guild_id,user_id) DO NOTHING`,
        [guildId, userId]
      );

      const removed = await tryRemoveItemTx(client, guildId, userId, item.id, 1);
      if (!removed) return null;

      const st = await client.query(
        `UPDATE user_stats
         SET fish_boost = LEAST(100, fish_boost + 5)
         WHERE guild_id=$1 AND user_id=$2
         RETURNING fish_boost`,
        [guildId, userId]
      );

      return { kind: 'buff', item, buff: 'fish', added: 5, boosts: st.rows[0].fish_boost };
    });
  }

  if (item.id === 'trap') {
    return db.txGuild(guildId, async (client) => {
      await client.query(
        `INSERT INTO user_stats (guild_id, user_id)
         VALUES ($1,$2)
         ON CONFLICT (guild_id,user_id) DO NOTHING`,
        [guildId, userId]
      );

      const removed = await tryRemoveItemTx(client, guildId, userId, item.id, 1);
      if (!removed) return null;

      const st = await client.query(
        `UPDATE user_stats
         SET hunt_boost = LEAST(100, hunt_boost + 5)
         WHERE guild_id=$1 AND user_id=$2
         RETURNING hunt_boost`,
        [guildId, userId]
      );

      return { kind: 'buff', item, buff: 'hunt', added: 5, boosts: st.rows[0].hunt_boost };
    });
  }

  if (item.id === 'lucky_charm') {
    return db.txGuild(guildId, async (client) => {
      await client.query(
        `INSERT INTO user_stats (guild_id, user_id)
         VALUES ($1,$2)
         ON CONFLICT (guild_id,user_id) DO NOTHING`,
        [guildId, userId]
      );

      const removed = await tryRemoveItemTx(client, guildId, userId, item.id, 1);
      if (!removed) return null;

      const st = await client.query(
        `UPDATE user_stats
         SET crate_boost = LEAST(25, crate_boost + 1)
         WHERE guild_id=$1 AND user_id=$2
         RETURNING crate_boost`,
        [guildId, userId]
      );

      return { kind: 'buff', item, buff: 'crate', added: 1, boosts: st.rows[0].crate_boost };
    });
  }

  if (item.id === 'rename_ticket') {
    const title = cleanTitle(arg);
    if (!title) {
      const e = new Error('Provide a title (1-32 chars).');
      e.code = 'BAD_ARG';
      throw e;
    }

    return db.txGuild(guildId, async (client) => {
      await client.query(
        `INSERT INTO user_stats (guild_id, user_id)
         VALUES ($1,$2)
         ON CONFLICT (guild_id,user_id) DO NOTHING`,
        [guildId, userId]
      );

      const removed = await tryRemoveItemTx(client, guildId, userId, item.id, 1);
      if (!removed) return null;

      await client.query(
        `UPDATE user_stats
         SET profile_title=$3
         WHERE guild_id=$1 AND user_id=$2`,
        [guildId, userId, title]
      );

      return { kind: 'profile', item, title };
    });
  }

  if (item.id === 'color_spray') {
    const color = parseHexColor(arg);
    if (color == null) {
      const e = new Error('Provide a hex color like #ff00ff.');
      e.code = 'BAD_ARG';
      throw e;
    }

    return db.txGuild(guildId, async (client) => {
      await client.query(
        `INSERT INTO user_stats (guild_id, user_id)
         VALUES ($1,$2)
         ON CONFLICT (guild_id,user_id) DO NOTHING`,
        [guildId, userId]
      );

      const removed = await tryRemoveItemTx(client, guildId, userId, item.id, 1);
      if (!removed) return null;

      await client.query(
        `UPDATE user_stats
         SET profile_color=$3
         WHERE guild_id=$1 AND user_id=$2`,
        [guildId, userId, color]
      );

      return { kind: 'profile', item, color };
    });
  }

  throw new Error('That item cannot be used right now.');
}

function validateUserPrice(item, priceEach) {
  assertIntPrice(priceEach);
  const bounds = userPriceBounds(item);
  if (priceEach < bounds.min || priceEach > bounds.max) {
    const err = new Error('Price out of bounds');
    err.bounds = bounds;
    throw err;
  }
  return bounds;
}

module.exports = {
  getInventory,
  addItem,
  tryRemoveItem,
  buyFromBot,
  sellToBot,
  openCrate,
  validateUserPrice,
  useItem
};
