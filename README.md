<br>
<p align="center">
<a href="https://discord-bot-us.onrender.com" target="_blank">
<img src="./assets/logo.png" alt="Logo" height="250" width="250" style="border-radius: 16px;" />
</a>
</p>

# <p align="center">Discord Bot</p>
<p align="center">(Utilities • Moderation • Security • Economy • Casino • Minigames)</p>

<div>
  <img style="100%" src="https://capsule-render.vercel.app/api?type=waving&height=100&section=header&reversal=false&fontSize=70&fontColor=FFFFFF&fontAlign=50&fontAlignY=50&stroke=-&descSize=20&descAlign=50&descAlignY=50&theme=cobalt"  />
</div>

<p align="center">
  <a href="https://github.com/ZiolKen/discord-bot/stargazers"><img src="https://img.shields.io/github/stars/ZiolKen/discord-bot?style=flat"></a>
  <a href="https://github.com/ZiolKen/discord-bot/blob/main/LICENSE"><img src="https://img.shields.io/github/license/ZiolKen/discord-bot?style=flat"></a>
  <a href="https://github.com/ZiolKen/discord-bot/forks"><img src="https://img.shields.io/github/forks/ZiolKen/discord-bot?style=flat"></a>
</p>

### <p align="center">A production-ready Discord bot with a modular command system, modern Postgres persistence, and a scalable multi-PostgreSQL shard router.</p>

---

## Highlights

### Utilities
- AFK, snipe, poll, reminders, server/user info, avatar, timestamp, and more

### Moderation & Security
- Warn system, timeout, kick/ban, purge
- Anti-link / anti-spam / anti-mention / caps checks
- Logging + audit-style incident tracking

### Economy
- **Coins only come from:** casino bets, daily, weekly, and **selling items**
- Shop + inventory
- Bot buyback (fixed prices)
- Player market (custom prices with bounds)
- Daily/weekly **streaks** with capped bonuses (grace window to keep streak)
- Boost items (bait/trap/lucky charm) to increase loot odds (still no direct coin drops)
- Item-only trading between players (**no coins**) with **max 30% value gap** for balance
- Crates (items-only loot, no direct coin drops)

### Casino
- Real RNG using cryptographic randomness
- Multiple games (slots, roulette, wheel, blackjack, etc.)

### Minigames (no direct coin rewards)
- Fishing & hunting (loot items you can sell/trade)
- Guess, tic-tac-toe, and more fun commands (/8ball, /choose, /art, /hangman)

---

## Requirements
- Node.js 20+
- PostgreSQL (1 or many)

---

## Project Structure

```
/
├─ package.json
├─ assets/
├─ src/
|    ├─ utils/
|    ├─ commands/
|    ├─ services/
|    ├─ web/
|    ├─ data/
|    ├─ schema.sql
|    ├─ index.js
|    ├─ db.js
├─ scripts/
     ├─ migrate.js
```

---

## Setup

1) Install dependencies
```bash
npm install
```

2) Configure environment variables

### Bot
- `TOKEN` — Discord bot token
- `CLIENT_ID` — Application client id

### Database (single shard)
You can keep the old single-DB style:
- `DATABASE_URL`
- `PG_CA_PATH` or `PG_CA`

### Database (multiple PostgreSQL shards)
To enable multiple shards, use:
- `DATABASE_URL-1`, `DATABASE_URL-2`, ...
- `PG_CA_PATH-1` / `PG_CA-1`, `PG_CA_PATH-2` / `PG_CA-2`, ...

The index **must match** (URL + CA):
- `DATABASE_URL-1` → `PG_CA_PATH-1` or `PG_CA-1`

If your hosting provider doesn't allow `-` in env names, you can also use underscore variants:
- `DATABASE_URL_1`, `PG_CA_PATH_1`, `PG_CA_1`, etc.

### SSL options
- `PG_SSL_MODE` (default: `verify-ca`)
  - `verify-ca` (recommended)
  - `require` (no CA verification)
  - `disable` (no SSL)
  - `auto` (disable SSL for localhost, otherwise verify-ca)
- `PG_SSL_DISABLE=1` (forces SSL off)
- `PG_POOL_MAX` (default: 5)

3) Run migrations (applies schema to **all** configured shards)
```bash
npm run migrate
```

4) Start the bot
```bash
npm start
```

---

## Economy commands
- `/shop` — browse items
- `/buy <item> [qty]` — buy from bot shop
- `/sell <item> [qty]` — sell to bot (fixed price)
- `/inventory [user]` — view inventory
- `/use <item> [arg]` — use items
  - crates: `/use wooden_crate`
  - boosts: `/use bait`, `/use trap`, `/use lucky_charm`
  - profile cosmetics: `/use rename_ticket <title>`, `/use color_spray #ff00ff`
- `/profile [user]` — coins, streaks, boosts, next claim timers
- `/market list|browse|buy|cancel` — player marketplace (custom prices with bounds)
  - market purchases apply a small fee (burned) to reduce inflation
- `/trade request|accept|add|remove|confirm|cancel` — item-only trade (max 30% value gap)

---

## Shard routing design
- The bot connects to **multiple PostgreSQL databases** (shards).
- Guild-scoped data is routed by `guild_id`.
- A guild is anchored by a row in `guild_settings`; once a guild exists on a shard, it stays on that shard.
- New guilds are allocated deterministically, with failover to the next writable shard if a shard becomes write-disabled.

---

## Notes
- This repo is built for long-term stability: transaction-safe economy operations, bounded pricing, and escrow-based listings/trades.
- Minigames do not directly mint coins. Items are the bridge to coins via `/sell` and the player market.

---

## Economy tuning (optional env)
- `DAILY_BASE`, `WEEKLY_BASE`
- `DAILY_COOLDOWN_HOURS`, `DAILY_STREAK_GRACE_HOURS`
- `WEEKLY_COOLDOWN_DAYS`, `WEEKLY_STREAK_GRACE_DAYS`
- `FISH_COOLDOWN_MIN`, `HUNT_COOLDOWN_MIN`
- `MARKET_FEE_PCT`, `MARKET_FEE_MIN_TOTAL`, `MARKET_FEE_MIN`

---

## Basic Configuration

Once the bot is running and added to your server, here are some initial configuration steps:

*   **Auto-Moderation**: Automod is disabled by default. To enable it, use the `/automod toggle enabled` command. You can further configure its modules and policies with subcommands.
*   **Moderation Logs**: To receive logs for moderation actions, set up a log channel using `/setlog #channel-name`.
*   **Leveling**: The leveling system is also opt-in. Enable it for your server using `/level mode:on`.
*   **Prefix**: The default command prefix is `!`. You can change this with the `/prefix <new_prefix>` command.

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for more details.

---

## ❤️ Credits

Created and maintained by **[ZiolKen](https://github.com/ZiolKen)**.

---

## ☕ Support

If this project helps you:

[![BuyMeACoffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/_zkn) [![PayPal](https://img.shields.io/badge/PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white)](https://paypal.me/zkn0461) [![Patreon](https://img.shields.io/badge/Patreon-F96854?style=for-the-badge&logo=patreon&logoColor=white)](https://patreon.com/ZiolKen) 

---

<div>
  <img style="100%" src="https://capsule-render.vercel.app/api?type=waving&height=100&section=footer&reversal=false&fontSize=70&fontColor=FFFFFF&fontAlign=50&fontAlignY=50&stroke=-&descSize=20&descAlign=50&descAlignY=50&theme=cobalt"  />
</div>