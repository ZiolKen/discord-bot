const crypto = require('crypto');
const db = require('../db');
const { getItem } = require('../data/items');

function assertQty(qty) {
  if (!Number.isInteger(qty) || qty <= 0) throw new Error('Invalid quantity');
  if (qty > 1_000_000) throw new Error('Quantity too large');
}

function calcOfferValue(rows) {
  let total = 0;
  for (const r of rows) {
    const item = getItem(r.item_id);
    const v = Number.isInteger(item?.tradeValue) ? item.tradeValue : Number.isInteger(item?.sellPrice) ? item.sellPrice : 0;
    total += v * Number(r.qty || 0);
  }
  return total;
}

async function expireTradeTx(client, guildId, tradeId) {
  const items = await client.query(
    `SELECT user_id, item_id, qty
     FROM trade_items
     WHERE trade_id=$1`,
    [tradeId]
  );

  for (const it of items.rows) {
    await client.query(
      `INSERT INTO inventory (guild_id, user_id, item_id, qty)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (guild_id,user_id,item_id) DO UPDATE
         SET qty = LEAST(2147483647, inventory.qty + EXCLUDED.qty),
             updated_at = now()`,
      [guildId, it.user_id, it.item_id, it.qty]
    );
  }

  await client.query(`DELETE FROM trades WHERE guild_id=$1 AND id=$2`, [guildId, tradeId]);
  return { expired: true, returned: items.rows.length };
}

async function createTrade(guildId, userA, userB, ttlMinutes = 10) {
  const a = String(userA);
  const b = String(userB);
  if (!a || !b || a === b) throw new Error('Invalid users');

  const ttl = Math.max(2, Math.min(60, Number(ttlMinutes) || 10));
  const expiresAt = new Date(Date.now() + ttl * 60_000);
  const id = crypto.randomUUID();

  await db.queryGuild(
    guildId,
    `INSERT INTO trades (id, guild_id, user_a, user_b, status, expires_at)
     VALUES ($1,$2,$3,$4,'pending',$5)`,
    [id, guildId, a, b, expiresAt]
  );

  return { id, expiresAt };
}

async function getTrade(guildId, tradeId) {
  const id = String(tradeId);
  const { rows } = await db.queryGuild(
    guildId,
    `SELECT id, guild_id, user_a, user_b, status, created_at, updated_at, expires_at, confirmed_a, confirmed_b
     FROM trades
     WHERE guild_id=$1 AND id=$2`,
    [guildId, id]
  );
  return rows[0] || null;
}

async function listTradeItemsTx(client, guildId, tradeId) {
  const { rows } = await client.query(
    `SELECT user_id, item_id, qty
     FROM trade_items
     WHERE trade_id=$1`,
    [tradeId]
  );
  return rows;
}

async function acceptTrade(guildId, tradeId, userId) {
  const id = String(tradeId);
  const uid = String(userId);

  return db.txGuild(guildId, async (client) => {
    const { rows } = await client.query(
      `SELECT id, user_a, user_b, status, expires_at
       FROM trades
       WHERE guild_id=$1 AND id=$2
       FOR UPDATE`,
      [guildId, id]
    );
    if (!rows.length) return null;

    const t = rows[0];
    if (new Date(t.expires_at).getTime() < Date.now()) return expireTradeTx(client, guildId, id);
    if (t.status !== 'pending') return { status: t.status };
    if (String(t.user_b) !== uid) return { forbidden: true };

    await client.query(
      `UPDATE trades SET status='active', updated_at=now() WHERE guild_id=$1 AND id=$2`,
      [guildId, id]
    );

    return { id };
  });
}

async function cancelTrade(guildId, tradeId, userId) {
  const id = String(tradeId);
  const uid = String(userId);

  return db.txGuild(guildId, async (client) => {
    const tRes = await client.query(
      `SELECT id, user_a, user_b, status
       FROM trades
       WHERE guild_id=$1 AND id=$2
       FOR UPDATE`,
      [guildId, id]
    );
    if (!tRes.rows.length) return null;
    const t = tRes.rows[0];

    if (![t.user_a, t.user_b].map(String).includes(uid)) return { forbidden: true };

    const items = await listTradeItemsTx(client, guildId, id);
    for (const it of items) {
      await client.query(
        `INSERT INTO inventory (guild_id, user_id, item_id, qty)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (guild_id,user_id,item_id) DO UPDATE
           SET qty = LEAST(2147483647, inventory.qty + EXCLUDED.qty),
               updated_at = now()`,
        [guildId, it.user_id, it.item_id, it.qty]
      );
    }

    await client.query(`DELETE FROM trades WHERE guild_id=$1 AND id=$2`, [guildId, id]);
    return { id, returned: items.length };
  });
}

async function addTradeItem(guildId, tradeId, userId, itemId, qty) {
  assertQty(qty);
  const id = String(tradeId);
  const uid = String(userId);
  const item = getItem(itemId);
  if (!item) throw new Error('Unknown item');

  return db.txGuild(guildId, async (client) => {
    const tRes = await client.query(
      `SELECT id, user_a, user_b, status, expires_at
       FROM trades
       WHERE guild_id=$1 AND id=$2
       FOR UPDATE`,
      [guildId, id]
    );
    if (!tRes.rows.length) return null;
    const t = tRes.rows[0];

    if (new Date(t.expires_at).getTime() < Date.now()) return expireTradeTx(client, guildId, id);
    if (t.status !== 'active') return { status: t.status };
    if (![t.user_a, t.user_b].map(String).includes(uid)) return { forbidden: true };

    const inv = await client.query(
      `UPDATE inventory
       SET qty = qty - $4,
           updated_at = now()
       WHERE guild_id=$1 AND user_id=$2 AND item_id=$3 AND qty >= $4
       RETURNING qty`,
      [guildId, uid, item.id, qty]
    );
    if (!inv.rows.length) return { insufficientItems: true };

    if (inv.rows[0].qty === 0) {
      await client.query(
        `DELETE FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_id=$3 AND qty=0`,
        [guildId, uid, item.id]
      );
    }

    await client.query(
      `INSERT INTO trade_items (trade_id, user_id, item_id, qty)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (trade_id,user_id,item_id) DO UPDATE
         SET qty = trade_items.qty + EXCLUDED.qty`,
      [id, uid, item.id, qty]
    );

    await client.query(
      `UPDATE trades
       SET confirmed_a=false, confirmed_b=false, updated_at=now()
       WHERE guild_id=$1 AND id=$2`,
      [guildId, id]
    );

    return { id, item, qty };
  });
}

async function removeTradeItem(guildId, tradeId, userId, itemId, qty) {
  assertQty(qty);
  const id = String(tradeId);
  const uid = String(userId);
  const item = getItem(itemId);
  if (!item) throw new Error('Unknown item');

  return db.txGuild(guildId, async (client) => {
    const tRes = await client.query(
      `SELECT id, user_a, user_b, status, expires_at
       FROM trades
       WHERE guild_id=$1 AND id=$2
       FOR UPDATE`,
      [guildId, id]
    );
    if (!tRes.rows.length) return null;
    const t = tRes.rows[0];

    if (new Date(t.expires_at).getTime() < Date.now()) return expireTradeTx(client, guildId, id);
    if (t.status !== 'active') return { status: t.status };
    if (![t.user_a, t.user_b].map(String).includes(uid)) return { forbidden: true };

    const upd = await client.query(
      `UPDATE trade_items
       SET qty = qty - $4
       WHERE trade_id=$1 AND user_id=$2 AND item_id=$3 AND qty >= $4
       RETURNING qty`,
      [id, uid, item.id, qty]
    );
    if (!upd.rows.length) return { insufficientOfferQty: true };

    if (upd.rows[0].qty === 0) {
      await client.query(
        `DELETE FROM trade_items WHERE trade_id=$1 AND user_id=$2 AND item_id=$3 AND qty=0`,
        [id, uid, item.id]
      );
    }

    await client.query(
      `INSERT INTO inventory (guild_id, user_id, item_id, qty)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (guild_id,user_id,item_id) DO UPDATE
         SET qty = LEAST(2147483647, inventory.qty + EXCLUDED.qty),
             updated_at = now()`,
      [guildId, uid, item.id, qty]
    );

    await client.query(
      `UPDATE trades
       SET confirmed_a=false, confirmed_b=false, updated_at=now()
       WHERE guild_id=$1 AND id=$2`,
      [guildId, id]
    );

    return { id, item, qty };
  });
}

async function confirmTrade(guildId, tradeId, userId) {
  const id = String(tradeId);
  const uid = String(userId);

  return db.txGuild(guildId, async (client) => {
    const tRes = await client.query(
      `SELECT id, user_a, user_b, status, expires_at, confirmed_a, confirmed_b
       FROM trades
       WHERE guild_id=$1 AND id=$2
       FOR UPDATE`,
      [guildId, id]
    );
    if (!tRes.rows.length) return null;
    const t = tRes.rows[0];

    if (new Date(t.expires_at).getTime() < Date.now()) return expireTradeTx(client, guildId, id);
    if (t.status !== 'active') return { status: t.status };
    if (![t.user_a, t.user_b].map(String).includes(uid)) return { forbidden: true };

    const isA = String(t.user_a) === uid;
    const nextA = isA ? true : t.confirmed_a;
    const nextB = !isA ? true : t.confirmed_b;

    await client.query(
      `UPDATE trades
       SET confirmed_a=$3, confirmed_b=$4, updated_at=now()
       WHERE guild_id=$1 AND id=$2`,
      [guildId, id, nextA, nextB]
    );

    if (!(nextA && nextB)) return { id, confirmed: isA ? 'a' : 'b' };

    const items = await listTradeItemsTx(client, guildId, id);
    const aItems = items.filter(x => String(x.user_id) === String(t.user_a));
    const bItems = items.filter(x => String(x.user_id) === String(t.user_b));

    const aValue = calcOfferValue(aItems);
    const bValue = calcOfferValue(bItems);
    const max = Math.max(aValue, bValue);
    const min = Math.min(aValue, bValue);

    if (min <= 0) return { empty: true };
    if (max / min > 1.3) return { unbalanced: true, aValue, bValue };

    for (const it of aItems) {
      await client.query(
        `INSERT INTO inventory (guild_id, user_id, item_id, qty)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (guild_id,user_id,item_id) DO UPDATE
           SET qty = LEAST(2147483647, inventory.qty + EXCLUDED.qty),
               updated_at = now()`,
        [guildId, t.user_b, it.item_id, it.qty]
      );
    }

    for (const it of bItems) {
      await client.query(
        `INSERT INTO inventory (guild_id, user_id, item_id, qty)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (guild_id,user_id,item_id) DO UPDATE
           SET qty = LEAST(2147483647, inventory.qty + EXCLUDED.qty),
               updated_at = now()`,
        [guildId, t.user_a, it.item_id, it.qty]
      );
    }

    await client.query(`DELETE FROM trades WHERE guild_id=$1 AND id=$2`, [guildId, id]);

    return { id, completed: true, aValue, bValue };
  });
}

module.exports = {
  createTrade,
  getTrade,
  acceptTrade,
  cancelTrade,
  addTradeItem,
  removeTradeItem,
  confirmTrade
};
