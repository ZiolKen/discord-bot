const db = require('../db');

async function getOrCreate(guildId, userId) {
  const { rows } = await db.query(
    `INSERT INTO user_stats (guild_id, user_id)
     VALUES ($1,$2)
     ON CONFLICT (guild_id,user_id) DO UPDATE SET user_id=EXCLUDED.user_id
     RETURNING *`,
    [guildId, userId]
  );
  return rows[0];
}

async function addCoins(guildId, userId, amount) {
  const amt = Number(amount || 0);
  const { rows } = await db.query(
    `INSERT INTO user_stats (guild_id, user_id, coins)
     VALUES ($1,$2,$3)
     ON CONFLICT (guild_id,user_id) DO UPDATE
       SET coins = GREATEST(user_stats.coins + EXCLUDED.coins, 0)
     RETURNING coins`,
    [guildId, userId, amt]
  );
  return rows[0].coins;
}

async function trySpendCoins(guildId, userId, amount) {
  const amt = Math.max(0, Number(amount || 0));
  if (amt === 0) return { ok: true, coins: (await getOrCreate(guildId, userId)).coins };

  return db.withClient(async (client) => {
    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO user_stats (guild_id, user_id)
         VALUES ($1,$2)
         ON CONFLICT (guild_id,user_id) DO NOTHING`,
        [guildId, userId]
      );

      const { rows } = await client.query(
        `UPDATE user_stats
         SET coins = coins - $3
         WHERE guild_id=$1 AND user_id=$2 AND coins >= $3
         RETURNING coins`,
        [guildId, userId, amt]
      );

      if (!rows.length) {
        const { rows: cur } = await client.query(
          `SELECT coins FROM user_stats WHERE guild_id=$1 AND user_id=$2`,
          [guildId, userId]
        );
        await client.query('ROLLBACK');
        return { ok: false, coins: cur[0]?.coins ?? 0 };
      }

      await client.query('COMMIT');
      return { ok: true, coins: rows[0].coins };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  });
}

async function setClaim(guildId, userId, field) {
  const allowed = new Set(['daily_at', 'weekly_at', 'fish_at']);
  if (!allowed.has(field)) throw new Error('Invalid claim field');
  await db.query(
    `UPDATE user_stats SET ${field} = now() WHERE guild_id=$1 AND user_id=$2`,
    [guildId, userId]
  );
}

function cooldownReady(lastDate, cooldownMs) {
  if (!lastDate) return true;
  const last = new Date(lastDate).getTime();
  return Date.now() - last >= cooldownMs;
}

module.exports = { getOrCreate, addCoins, trySpendCoins, setClaim, cooldownReady };
