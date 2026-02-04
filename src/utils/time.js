function parseDuration(input) {
  if (!input) return null;
  const m = String(input).trim().match(/^([0-9]{1,8})(s|m|h|d|w)$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[unit];
  if (!mult) return null;
  return n * mult;
}

function toDiscordTs(date, style = 'R') {
  const sec = Math.floor(date.getTime() / 1000);
  return `<t:${sec}:${style}>`;
}

module.exports = { parseDuration, toDiscordTs };
