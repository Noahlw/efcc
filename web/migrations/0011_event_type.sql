-- Migration number: 0011  2026-08-17T00:00:00.000Z
-- Event Types (Ticket 086-03 #315): nullable event_type text column for manual and scheduled events.

ALTER TABLE events ADD COLUMN event_type TEXT
  CHECK (event_type IS NULL OR event_type IN ('崇拜', '訓練', '小組', '排練', '外展', '其他'));
