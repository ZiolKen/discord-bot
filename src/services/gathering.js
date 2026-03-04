const db = require('../db');
const { getItem } = require('../data/items');
const { randInt, weightedPick, capInt32 } = require('./casino');

function intEnv(key, def, { min = -2147483648, max = 2147483647 } = {}) {
  const raw = process.env[key];
  if (raw == null || raw === '') return def;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

const FISH_COOLDOWN_MS = intEnv('FISH_COOLDOWN_MIN', 10, { min: 1, max: 120 }) * 60_000;
const HUNT_COOLDOWN_MS = intEnv('HUNT_COOLDOWN_MIN', 30, { min: 1, max: 240 }) * 60_000;

function fishLoot(boosted) {
  if (!boosted) {
    return [
      { id: null, w: 22, min: 0, max: 0 },
      { id: 'minnow', w: 38, min: 1, max: 3 },
      { id: 'sardine', w: 22, min: 1, max: 2 },
      { id: 'salmon', w: 12, min: 1, max: 1 },
      { id: 'tuna', w: 10, min: 1, max: 1 },
      { id: 'pufferfish', w: 5, min: 1, max: 1 },
      { id: 'koi', w: 4, min: 1, max: 1 },
      { id: 'wooden_crate', w: 2, min: 1, max: 1 },
      { id: 'golden_koi', w: 1, min: 1, max: 1 }
    ];
  }
  return [
    { id: null, w: 8, min: 0, max: 0 },
    { id: 'minnow', w: 40, min: 1, max: 3 },
    { id: 'sardine', w: 25, min: 1, max: 2 },
    { id: 'salmon', w: 15, min: 1, max: 2 },
    { id: 'tuna', w: 12, min: 1, max: 2 },
    { id: 'pufferfish', w: 7, min: 1, max: 2 },
    { id: 'koi', w: 6, min: 1, max: 2 },
    { id: 'wooden_crate', w: 4, min: 1, max: 1 },
    { id: 'iron_crate', w: 1, min: 1, max: 1 },
    { id: 'golden_koi', w: 2, min: 1, max: 1 }
  ];
}

function huntLoot(boosted) {
  if (!boosted) {
    return [
      { id: null, w: 18, min: 0, max: 0 },
      { id: 'bunny', w: 28, min: 1, max: 2 },
      { id: 'duck', w: 26, min: 1, max: 2 },
      { id: 'fox_tail', w: 12, min: 1, max: 1 },
      { id: 'deer_antler', w: 8, min: 1, max: 1 },
      { id: 'wolf_pelt', w: 4, min: 1, max: 1 },
      { id: 'bear_claw', w: 3, min: 1, max: 1 },
      { id: 'star_fragment', w: 2, min: 1, max: 1 },
      { id: 'ancient_coin', w: 1, min: 1, max: 1 },
      { id: 'phoenix_feather', w: 1, min: 1, max: 1 }
    ];
  }
  return [
    { id: null, w: 8, min: 0, max: 0 },
    { id: 'bunny', w: 30, min: 1, max: 3 },
    { id: 'duck', w: 28, min: 1, max: 3 },
    { id: 'fox_tail', w: 15, min: 1, max: 2 },
    { id: 'deer_antler', w: 10, min: 1, max: 2 },
    { id: 'wolf_pelt', w: 6, min: 1, max: 1 },
    { id: 'bear_claw', w: 4, min: 1, max: 1 },
    { id: 'star_fragment', w: 3, min: 1, max: 2 },
    { id: 'ancient_coin', w: 2, min: 1, max: 1 },
    { id: 'phoenix_feather', w: 2, min: 1, max: 1 }
  ];
}

async function addInventoryTx(client, guildId, userId, itemId, qty) {
  const q = capInt32(qty);
  await client.query(
    `INSERT INTO inventory (guild_id, user_id, item_id, qty)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (guild_id,user_id,item_id) DO UPDATE
       SET qty = LEAST(2147483647, inventory.qty + EXCLUDED.qty),
           updated_at = now()`,
    [guildId, userId, itemId, q]
  );
}

async function fish(guildId, userId) {
  return db.txGuild(guildId, async (client) => {
    await client.query(
      `INSERT INTO user_stats (guild_id, user_id)
       VALUES ($1,$2)
       ON CONFLICT (guild_id,user_id) DO NOTHING`,
      [guildId, userId]
    );

    const stRes = await client.query(
      `SELECT fish_at, fish_boost
       FROM user_stats
       WHERE guild_id=$1 AND user_id=$2
       FOR UPDATE`,
      [guildId, userId]
    );

    const st = stRes.rows[0];
    const nowMs = Date.now();
    const lastMs = st.fish_at ? new Date(st.fish_at).getTime() : null;
    if (lastMs != null && nowMs - lastMs < FISH_COOLDOWN_MS) {
      return { ok: false, nextAt: new Date(lastMs + FISH_COOLDOWN_MS), boostsLeft: Number(st.fish_boost) || 0 };
    }

    const boosts = Number(st.fish_boost) || 0;
    const boostUsed = boosts > 0;
    const nextBoosts = boostUsed ? boosts - 1 : boosts;

    await client.query(
      `UPDATE user_stats
       SET fish_at = now(),
           fish_boost = $3
       WHERE guild_id=$1 AND user_id=$2`,
      [guildId, userId, nextBoosts]
    );

    const loot = fishLoot(boostUsed);
    const pick = weightedPick(loot.map(x => ({ id: x.id, w: x.w })));
    if (!pick.id) return { ok: true, nothing: true, boostUsed, boostsLeft: nextBoosts };

    const def = loot.find(x => x.id === pick.id);
    const qty = randInt(def.min, def.max);
    const it = getItem(def.id);
    await addInventoryTx(client, guildId, userId, it.id, qty);

    return { ok: true, item: it, qty, boostUsed, boostsLeft: nextBoosts };
  });
}

async function hunt(guildId, userId) {
  return db.txGuild(guildId, async (client) => {
    await client.query(
      `INSERT INTO user_stats (guild_id, user_id)
       VALUES ($1,$2)
       ON CONFLICT (guild_id,user_id) DO NOTHING`,
      [guildId, userId]
    );

    const stRes = await client.query(
      `SELECT hunt_at, hunt_boost
       FROM user_stats
       WHERE guild_id=$1 AND user_id=$2
       FOR UPDATE`,
      [guildId, userId]
    );

    const st = stRes.rows[0];
    const nowMs = Date.now();
    const lastMs = st.hunt_at ? new Date(st.hunt_at).getTime() : null;
    if (lastMs != null && nowMs - lastMs < HUNT_COOLDOWN_MS) {
      return { ok: false, nextAt: new Date(lastMs + HUNT_COOLDOWN_MS), boostsLeft: Number(st.hunt_boost) || 0 };
    }

    const boosts = Number(st.hunt_boost) || 0;
    const boostUsed = boosts > 0;
    const nextBoosts = boostUsed ? boosts - 1 : boosts;

    await client.query(
      `UPDATE user_stats
       SET hunt_at = now(),
           hunt_boost = $3
       WHERE guild_id=$1 AND user_id=$2`,
      [guildId, userId, nextBoosts]
    );

    const loot = huntLoot(boostUsed);
    const pick = weightedPick(loot.map(x => ({ id: x.id, w: x.w })));
    if (!pick.id) return { ok: true, nothing: true, boostUsed, boostsLeft: nextBoosts };

    const def = loot.find(x => x.id === pick.id);
    const qty = randInt(def.min, def.max);
    const it = getItem(def.id);
    await addInventoryTx(client, guildId, userId, it.id, qty);

    return { ok: true, item: it, qty, boostUsed, boostsLeft: nextBoosts };
  });
}

module.exports = { fish, hunt, FISH_COOLDOWN_MS, HUNT_COOLDOWN_MS };
