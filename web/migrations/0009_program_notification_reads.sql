-- Migration number: 0009  2026-08-14T00:00:00.000Z
-- Prompt 3: per-user read-state overlay for current management notification
-- sources. Notifications themselves remain projections of live Program,
-- Event, and Enrollment state; this table intentionally stores no history,
-- delivery record, or resolved notification row.

CREATE TABLE program_notification_reads (
  user_id        TEXT NOT NULL,
  source_key     TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  read_at        TEXT NOT NULL,
  PRIMARY KEY (user_id, source_key, source_revision),
  FOREIGN KEY (user_id) REFERENCES accounts(user_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX program_notification_reads_user_source_idx
  ON program_notification_reads(user_id, source_key);

CREATE INDEX program_notification_reads_source_revision_idx
  ON program_notification_reads(source_key, source_revision);
