# <p align="center">Discord Bot</p>

<div>
  <img style="100%" src="https://capsule-render.vercel.app/api?type=waving&height=100&section=header&reversal=false&fontSize=70&fontColor=FFFFFF&fontAlign=50&fontAlignY=50&stroke=-&descSize=20&descAlign=50&descAlignY=50&theme=cobalt"  />
</div>

<p align="center">
  <a href="https://github.com/ZiolKen/discord-bot/stargazers"><img src="https://img.shields.io/github/stars/ZiolKen/discord-bot?style=flat"></a>
  <a href="https://github.com/ZiolKen/discord-bot/blob/main/LICENSE"><img src="https://img.shields.io/github/license/ZiolKen/discord-bot?style=flat"></a>
  <a href="https://github.com/ZiolKen/discord-bot/forks"><img src="https://img.shields.io/github/forks/ZiolKen/discord-bot?style=flat"></a>
</p>

### <p align="center">A versatile, utilities-focused Discord bot built with Node.js, discord.js, and PostgreSQL. It features a comprehensive suite of tools for server management, user engagement, and entertainment, supporting both slash (`/`) and legacy prefix commands (default `!`). The bot also includes an Express-powered web server for a real-time status page and landing page.</p>

---

## Features

*   **🛡️ Moderation & Security**
    *   Full suite of moderation commands: `ban`, `unban`, `kick`, `timeout`, `untimeout`, `purge`, `lock`, `unlock`, and `slowmode`.
    *   A robust warning system with `warn`, `warnings`, and `clearwarns` commands.
    *   Configurable moderation log channel (`setlog`).
    *   Advanced Auto-Moderation (off by default) with configurable modules:
        *   `antilink`, `antispam`, `antimention`, `caps`, `badwords`, and `raid` protection.
        *   Configurable actions, such as 'delete' or 'timeout'.

*   **🎲 Minigames & Economy**
    *   Server-based economy system with `balance`, `daily`, and `weekly` coin claims.
    *   Track top users with a server `leaderboard`.
    *   A variety of engaging games: `blackjack`, `slots`, `tictactoe`, `coinflip`, `rps`, `roll`, `guess`, and `fishing`.
    *   Gamble your coins with the `gamble` and `slots` commands.

*   **⚙️ Utilities**
    *   Comprehensive information commands: `serverinfo`, `userinfo`, `channelinfo`, and `roleinfo`.
    *   User-centric tools: `avatar`, `banner`, `snipe` (shows the last deleted message), and `afk`.
    *   Server utilities: `poll`, `reminders`, `timestamp` generator, and `say`.
    *   Customizable server prefix using the `prefix` command.

*   **⭐ Leveling System**
    *   Users gain XP and level up by being active in chat.
    *   This feature is opt-in and can be enabled or disabled per-server with the `level` command.

*   **🌐 Web & Status**
    *   An Express-powered API provides a real-time status page.
    *   The API includes endpoints for health checks, detailed bot status (`/status`), and recent service incidents (`/incidents`).

---

## 📁 Project Structure

```
/
├─ package.json
├─ src/
|    ├─ utils/
|    ├─ commands/
|    ├─ services/
|    ├─ web/
|    ├─ schema.sql
|    ├─ index.js
|    ├─ db.js
├─ scripts/
     ├─ migrate.js
```

---

## Setup

Follow these steps to set up and run your own instance of the bot.

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/ziolken/discord-bot.git
    cd discord-bot
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Set Up the Database**
    This project requires a PostgreSQL database. Once you have a database instance, run the migration script to create the necessary tables from `src/schema.sql`.
    ```bash
    npm run migrate
    ```

4.  **Configure Environment Variables**
    Create a `.env` file in the root directory and add the following variables:
    *   `TOKEN`: Your Discord bot's token.
    *   `CLIENT_ID`: Your Discord application's client ID.
    *   `DATABASE_URL`: Your PostgreSQL connection string (e.g., `postgres://user:password@host:port/database`).
    *   `PG_CA_PATH` (Recommended): File path to your database's CA certificate for a secure SSL connection.
    *   or `/etc/secrets/ca.pem`: for CA certificate.

5.  **Start the Bot**
    ```bash
    npm start
    ```

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