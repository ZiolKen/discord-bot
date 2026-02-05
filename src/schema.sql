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
