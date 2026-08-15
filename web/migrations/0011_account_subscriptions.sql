-- Migration number: 0011 	 2026-08-16T00:00:00.000Z
-- EFCC Attention Center: editorial subscriptions, task priorities, and notices.

CREATE TABLE account_subscriptions (
  user_id       TEXT NOT NULL,
  topic_key     TEXT NOT NULL,
  is_subscribed INTEGER NOT NULL DEFAULT 1 CHECK (is_subscribed IN (0, 1)),
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (user_id, topic_key),
  FOREIGN KEY (user_id) REFERENCES accounts(user_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX account_subscriptions_user_idx ON account_subscriptions(user_id);

CREATE TABLE task_priorities (
  task_id    TEXT PRIMARY KEY,
  priority   TEXT NOT NULL CHECK (priority IN ('high', 'normal', 'low')),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (updated_by) REFERENCES accounts(user_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX task_priorities_updated_by_idx ON task_priorities(updated_by);

CREATE TABLE attention_notifications (
  notification_id TEXT PRIMARY KEY,
  topic_key       TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  href            TEXT,
  created_at      TEXT NOT NULL,
  expires_at      TEXT NOT NULL
) STRICT;

CREATE INDEX attention_notifications_window_idx
  ON attention_notifications(topic_key, created_at, expires_at);

CREATE TABLE attention_notification_reads (
  notification_id TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  read_at         TEXT NOT NULL,
  PRIMARY KEY (notification_id, user_id),
  FOREIGN KEY (notification_id) REFERENCES attention_notifications(notification_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES accounts(user_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX attention_notification_reads_user_idx
  ON attention_notification_reads(user_id, read_at);
