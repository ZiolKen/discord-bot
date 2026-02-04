# Discord Bot

A real utilities-style Discord bot with:
- Slash commands **/** + Prefix commands (default **!**)
- Moderation tools (ban/kick/timeout/purge/lock/slowmode/warns)
- Utilities (help, info, avatar/banner, server/user/channel/role info, snipe, polls, reminders, timestamps, etc.)
- Minigames + economy (daily/weekly, balance, leaderboard, blackjack, slots, fishing, trivia, guess)
- PostgreSQL storage – saves only the necessary stuff.

## Setup

1) Install deps:
```bash
npm install
```

2) Create DB schema:
- Open SQL editor and run `src/schema.sql`

3) Environment variables:
- `TOKEN`
- `CLIENT_ID`
- `DATABASE_URL`
- `PG_CA_CERT` (recommended): paste CA certificate to enforce verify-full

4) Start:
```bash
npm start
```

## Notes
- Automod is **OFF by default**. Enable via `/automod toggle enabled` or `!automod toggle enabled`.
