const crypto = require('crypto');

const INT32_MAX = 2147483647;
const DEFAULT_BET = 1;
const MAX_BET = 100000;

function randInt(min, max) {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) throw new Error('Invalid range');
  if (min === max) return min;
  return crypto.randomInt(min, max + 1);
}

function randFloat() {
  const b = crypto.randomBytes(6);
  const n = b.readUIntBE(0, 6);
  return n / 281474976710656;
}

function normalizeBet(raw, { min = 1, max = MAX_BET, defaultBet = DEFAULT_BET } = {}) {
  if (raw === undefined || raw === null) return { ok: true, bet: defaultBet };
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { ok: false, error: 'Bet must be an integer.' };
  if (n < min || n > max) return { ok: false, error: `Bet must be ${min}-${max}.` };
  return { ok: true, bet: n };
}

function applyHouseFeeToProfit(profit, feePct = 5) {
  if (!Number.isFinite(profit) || profit <= 0) return 0;
  const keep = 1 - (feePct / 100);
  return Math.floor(profit * keep);
}

function payoutFromBetAndProfit(bet, profit, feePct = 5) {
  const p = applyHouseFeeToProfit(profit, feePct);
  const payout = bet + p;
  if (payout < 0) return 0;
  return payout;
}

function capInt32(n) {
  if (!Number.isFinite(n)) return 0;
  if (n > INT32_MAX) return INT32_MAX;
  if (n < 0) return 0;
  return Math.floor(n);
}

function weightedPick(items) {
  const total = items.reduce((a, it) => a + (Number(it.w) || 0), 0);
  if (!(total > 0)) throw new Error('Invalid weights');
  let r = randFloat() * total;
  for (const it of items) {
    const w = Number(it.w) || 0;
    if (w <= 0) continue;
    if (r < w) return it;
    r -= w;
  }
  return items[items.length - 1];
}

module.exports = {
  randInt,
  randFloat,
  normalizeBet,
  applyHouseFeeToProfit,
  payoutFromBetAndProfit,
  capInt32,
  weightedPick,
  DEFAULT_BET,
  MAX_BET
};
