CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id        TEXT PRIMARY KEY,
  prefix          TEXT NOT NULL DEFAULT '!',
  log_channel_id  TEXT,

  welcome_channel_id TEXT,
  welcome_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  autorole_id     TEXT,

  am_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  am_antilink     BOOLEAN NOT NULL DEFAULT FALSE,
  am_antispam     BOOLEAN NOT NULL DEFAULT FALSE,
  am_antimention  BOOLEAN NOT NULL DEFAULT FALSE,
  am_caps         BOOLEAN NOT NULL DEFAULT FALSE,
  am_badwords     BOOLEAN NOT NULL DEFAULT FALSE,
  am_raid         BOOLEAN NOT NULL DEFAULT FALSE,

  am_action       TEXT NOT NULL DEFAULT 'delete',
  am_timeout_sec  INT  NOT NULL DEFAULT 300,
  am_max_mentions INT  NOT NULL DEFAULT 6,
  am_caps_ratio   INT  NOT NULL DEFAULT 70,
  am_min_acc_age_days INT NOT NULL DEFAULT 3,

  level_enabled   BOOLEAN NOT NULL DEFAULT FALSE
);

ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS level_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS warns (
  id         BIGSERIAL PRIMARY KEY,
  guild_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  mod_id     TEXT NOT NULL,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_warns_guild_user ON warns(guild_id, user_id);

CREATE TABLE IF NOT EXISTS user_stats (
  guild_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  xp         INT  NOT NULL DEFAULT 0,
  level      INT  NOT NULL DEFAULT 0,
  coins      INT  NOT NULL DEFAULT 0,
  daily_at   TIMESTAMPTZ,
  weekly_at  TIMESTAMPTZ,
  fish_at    TIMESTAMPTZ,
  hunt_at    TIMESTAMPTZ,
  daily_streak  INT NOT NULL DEFAULT 0,
  weekly_streak INT NOT NULL DEFAULT 0,
  daily_best    INT NOT NULL DEFAULT 0,
  weekly_best   INT NOT NULL DEFAULT 0,
  fish_boost    INT NOT NULL DEFAULT 0,
  hunt_boost    INT NOT NULL DEFAULT 0,
  crate_boost   INT NOT NULL DEFAULT 0,
  profile_title TEXT,
  profile_color INT,
  PRIMARY KEY (guild_id, user_id)
);

ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS hunt_at TIMESTAMPTZ;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS daily_streak  INT NOT NULL DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS weekly_streak INT NOT NULL DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS daily_best    INT NOT NULL DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS weekly_best   INT NOT NULL DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS fish_boost    INT NOT NULL DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS hunt_boost    INT NOT NULL DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS crate_boost   INT NOT NULL DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS profile_title TEXT;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS profile_color INT;
CREATE INDEX IF NOT EXISTS idx_user_stats_guild_coins ON user_stats(guild_id, coins DESC);
CREATE TABLE IF NOT EXISTS reminders (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  guild_id   TEXT,
  remind_at  TIMESTAMPTZ NOT NULL,
  text       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reminders_time ON reminders(remind_at);

CREATE TABLE IF NOT EXISTS incidents (
  id          UUID PRIMARY KEY,
  service     TEXT NOT NULL,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incidents_started_at ON incidents(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_service ON incidents(service);
CREATE UNIQUE INDEX IF NOT EXISTS uq_incidents_active_service ON incidents(service) WHERE resolved_at IS NULL;


CREATE TABLE IF NOT EXISTS inventory (
  guild_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  item_id    TEXT NOT NULL,
  qty        INT  NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, user_id, item_id),
  CHECK (qty >= 0)
);
CREATE INDEX IF NOT EXISTS idx_inventory_guild_user ON inventory(guild_id, user_id);

CREATE TABLE IF NOT EXISTS market_listings (
  id         BIGSERIAL PRIMARY KEY,
  guild_id   TEXT NOT NULL,
  seller_id  TEXT NOT NULL,
  item_id    TEXT NOT NULL,
  qty        INT  NOT NULL,
  price_each INT  NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  CHECK (qty > 0),
  CHECK (price_each > 0)
);
CREATE INDEX IF NOT EXISTS idx_market_listings_guild_status ON market_listings(guild_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_listings_item_status ON market_listings(guild_id, item_id, status, price_each);

CREATE TABLE IF NOT EXISTS trades (
  id          UUID PRIMARY KEY,
  guild_id    TEXT NOT NULL,
  user_a      TEXT NOT NULL,
  user_b      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  confirmed_a BOOLEAN NOT NULL DEFAULT FALSE,
  confirmed_b BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);
ALTER TABLE trades ADD COLUMN IF NOT EXISTS confirmed_a BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS confirmed_b BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_trades_guild_user_a ON trades(guild_id, user_a, status);
CREATE INDEX IF NOT EXISTS idx_trades_guild_user_b ON trades(guild_id, user_b, status);
CREATE INDEX IF NOT EXISTS idx_trades_expires_at ON trades(expires_at);

CREATE TABLE IF NOT EXISTS trade_items (
  trade_id UUID NOT NULL,
  user_id  TEXT NOT NULL,
  item_id  TEXT NOT NULL,
  qty      INT  NOT NULL,
  PRIMARY KEY (trade_id, user_id, item_id),
  CHECK (qty > 0),
  FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE
);
