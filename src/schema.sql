CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id        TEXT PRIMARY KEY,
  prefix          TEXT NOT NULL DEFAULT '!',
  log_channel_id  TEXT,

  -- Welcome placeholder
  welcome_channel_id TEXT,
  welcome_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  autorole_id     TEXT,

  -- Automod
  am_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  am_antilink     BOOLEAN NOT NULL DEFAULT FALSE,
  am_antispam     BOOLEAN NOT NULL DEFAULT FALSE,
  am_antimention  BOOLEAN NOT NULL DEFAULT FALSE,
  am_caps         BOOLEAN NOT NULL DEFAULT FALSE,
  am_badwords     BOOLEAN NOT NULL DEFAULT FALSE,
  am_raid         BOOLEAN NOT NULL DEFAULT FALSE,

  -- Automod policy
  am_action       TEXT NOT NULL DEFAULT 'delete', -- delete | timeout
  am_timeout_sec  INT  NOT NULL DEFAULT 300,
  am_max_mentions INT  NOT NULL DEFAULT 6,
  am_caps_ratio   INT  NOT NULL DEFAULT 70,
  am_min_acc_age_days INT NOT NULL DEFAULT 3
);

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
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS reminders (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  guild_id   TEXT,
  remind_at  TIMESTAMPTZ NOT NULL,
  text       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reminders_time ON reminders(remind_at);
