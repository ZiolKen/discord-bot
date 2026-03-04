const db = require('../db');
const { getItem } = require('../data/items');
const { validateUserPrice } = require('./items');

function intEnv(key, def, { min = -2147483648, max = 2147483647 } = {}) {
  const raw = process.env[key];
  if (raw == null || raw === '') return def;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

const MARKET_FEE_PCT = intEnv('MARKET_FEE_PCT', 3, { min: 0, max: 20 });
const MARKET_FEE_MIN_TOTAL = intEnv('MARKET_FEE_MIN_TOTAL', 100, { min: 1, max: 2_000_000_000 });
const MARKET_FEE_MIN = intEnv('MARKET_FEE_MIN', 1, { min: 0, max: 2_000_000_000 });

function calcMarketFee(total) {
  if (!(total > 0) || MARKET_FEE_PCT <= 0) return 0;
  const raw = Math.floor((total * MARKET_FEE_PCT) / 100);
  if (total >= MARKET_FEE_MIN_TOTAL && raw < MARKET_FEE_MIN) return Math.min(total, MARKET_FEE_MIN);
  return Math.min(total, raw);
}

function assertQty(qty) {
  if (!Number.isInteger(qty) || qty <= 0) throw new Error('Invalid quantity');
  if (qty > 1_000_000) throw new Error('Quantity too large');
}

async function createListing(guildId, sellerId, itemId, qty, priceEach, ttlHours = 72) {
  assertQty(qty);
  const item = getItem(itemId);
  if (!item) throw new Error('Unknown item');
  validateUserPrice(item, priceEach);

  const expiresAt = new Date(Date.now() + Math.max(1, Math.min(168, ttlHours)) * 3600_000);

  return db.txGuild(guildId, async (client) => {
    const removed = await client.query(
      `UPDATE inventory
       SET qty = qty - $4,
           updated_at = now()
       WHERE guild_id=$1 AND user_id=$2 AND item_id=$3 AND qty >= $4
       RETURNING qty`,
      [guildId, sellerId, item.id, qty]
    );

    if (!removed.rows.length) return null;

    if (removed.rows[0].qty === 0) {
      await client.query(
        `DELETE FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_id=$3 AND qty=0`,
        [guildId, sellerId, item.id]
      );
    }

    const ins = await client.query(
      `INSERT INTO market_listings (guild_id, seller_id, item_id, qty, price_each, status, expires_at)
       VALUES ($1,$2,$3,$4,$5,'active',$6)
       RETURNING id`,
      [guildId, sellerId, item.id, qty, priceEach, expiresAt]
    );

    return { id: ins.rows[0].id, item, qty, priceEach, expiresAt };
  });
}

async function listListings(guildId, { itemId, sellerId, page = 1, pageSize = 10 } = {}) {
  const p = Math.max(1, Math.min(1000, Number(page) || 1));
  const size = Math.max(1, Math.min(25, Number(pageSize) || 10));
  const offset = (p - 1) * size;

  const clauses = ['guild_id=$1', "status='active'", '(expires_at IS NULL OR expires_at > now())'];
  const params = [guildId];
  let idx = 2;

  if (itemId) {
    const item = getItem(itemId);
    if (!item) throw new Error('Unknown item');
    clauses.push(`item_id=$${idx++}`);
    params.push(item.id);
  }

  if (sellerId) {
    clauses.push(`seller_id=$${idx++}`);
    params.push(String(sellerId));
  }

  params.push(size);
  params.push(offset);

  const sql = `SELECT id, seller_id, item_id, qty, price_each, created_at, expires_at
               FROM market_listings
               WHERE ${clauses.join(' AND ')}
               ORDER BY price_each ASC, created_at DESC
               LIMIT $${idx++} OFFSET $${idx++}`;

  const { rows } = await db.queryGuild(guildId, sql, params);
  return rows;
}

async function cancelListing(guildId, sellerId, listingId) {
  const id = Number(listingId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid listing id');

  return db.txGuild(guildId, async (client) => {
    const { rows } = await client.query(
      `SELECT id, seller_id, item_id, qty, status
       FROM market_listings
       WHERE guild_id=$1 AND id=$2
       FOR UPDATE`,
      [guildId, id]
    );

    if (!rows.length) return null;

    const row = rows[0];
    if (row.status !== 'active') return null;
    if (String(row.seller_id) !== String(sellerId)) return { forbidden: true };

    await client.query(
      `UPDATE market_listings
       SET status='cancelled', updated_at=now()
       WHERE guild_id=$1 AND id=$2`,
      [guildId, id]
    );

    await client.query(
      `INSERT INTO inventory (guild_id, user_id, item_id, qty)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (guild_id,user_id,item_id) DO UPDATE
         SET qty = LEAST(2147483647, inventory.qty + EXCLUDED.qty),
             updated_at = now()`,
      [guildId, sellerId, row.item_id, row.qty]
    );

    return { id: row.id, itemId: row.item_id, qty: row.qty };
  });
}

async function buyListing(guildId, buyerId, listingId, qty) {
  const id = Number(listingId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid listing id');
  const q = qty == null ? null : Number(qty);
  if (q != null && (!Number.isInteger(q) || q <= 0)) throw new Error('Invalid quantity');

  return db.txGuild(guildId, async (client) => {
    const { rows } = await client.query(
      `SELECT id, seller_id, item_id, qty, price_each, status, expires_at
       FROM market_listings
       WHERE guild_id=$1 AND id=$2
       FOR UPDATE`,
      [guildId, id]
    );

    if (!rows.length) return null;

    const row = rows[0];
    if (row.status !== 'active') return null;
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
      await client.query(
        `UPDATE market_listings
         SET status='expired', updated_at=now()
         WHERE guild_id=$1 AND id=$2`,
        [guildId, id]
      );

      await client.query(
        `INSERT INTO inventory (guild_id, user_id, item_id, qty)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (guild_id,user_id,item_id) DO UPDATE
           SET qty = LEAST(2147483647, inventory.qty + EXCLUDED.qty),
               updated_at = now()`,
        [guildId, row.seller_id, row.item_id, row.qty]
      );

      return { expired: true };
    }
    if (String(row.seller_id) === String(buyerId)) return { self: true };

    const buyQty = q ?? row.qty;
    if (buyQty > row.qty) return { insufficientListingQty: true, available: row.qty };

    const total = row.price_each * buyQty;
    if (!Number.isSafeInteger(total) || total <= 0) throw new Error('Total overflow');

    const fee = calcMarketFee(total);
    const sellerPayout = total - fee;

    await client.query(
      `INSERT INTO user_stats (guild_id, user_id)
       VALUES ($1,$2),($1,$3)
       ON CONFLICT (guild_id,user_id) DO NOTHING`,
      [guildId, buyerId, row.seller_id]
    );

    const spent = await client.query(
      `UPDATE user_stats
       SET coins = coins - $3
       WHERE guild_id=$1 AND user_id=$2 AND coins >= $3
       RETURNING coins`,
      [guildId, buyerId, total]
    );

    if (!spent.rows.length) return { insufficientCoins: true };

    await client.query(
      `UPDATE user_stats
       SET coins = LEAST(2147483647, coins + $3)
       WHERE guild_id=$1 AND user_id=$2`,
      [guildId, row.seller_id, sellerPayout]
    );

    await client.query(
      `INSERT INTO inventory (guild_id, user_id, item_id, qty)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (guild_id,user_id,item_id) DO UPDATE
         SET qty = LEAST(2147483647, inventory.qty + EXCLUDED.qty),
             updated_at = now()`,
      [guildId, buyerId, row.item_id, buyQty]
    );

    const left = row.qty - buyQty;
    if (left === 0) {
      await client.query(
        `UPDATE market_listings
         SET qty=0, status='sold', updated_at=now()
         WHERE guild_id=$1 AND id=$2`,
        [guildId, id]
      );
    } else {
      await client.query(
        `UPDATE market_listings
         SET qty=$3, updated_at=now()
         WHERE guild_id=$1 AND id=$2`,
        [guildId, id, left]
      );
    }

    return {
      id: row.id,
      itemId: row.item_id,
      qty: buyQty,
      priceEach: row.price_each,
      total,
      fee,
      sellerPayout,
      buyerCoins: spent.rows[0].coins,
      sellerId: row.seller_id
    };
  });
}

module.exports = {
  createListing,
  listListings,
  cancelListing,
  buyListing
};
