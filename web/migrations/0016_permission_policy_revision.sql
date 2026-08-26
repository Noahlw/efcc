-- Migration number: 0016  2026-08-26T00:00:00.000Z
-- S4-04 — authoritative Permission Policy read revision.
--
-- #454 will advance this singleton atomically with a complete policy change
-- set. Keeping the revision in D1 makes the read projection truthful even
-- before mutation is enabled; it is not derived from browser state or seed
-- timestamps.
CREATE TABLE IF NOT EXISTS permission_policy_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at TEXT NOT NULL
) STRICT;

INSERT OR IGNORE INTO permission_policy_state (id, revision, updated_at)
VALUES (1, 1, '2026-08-26T00:00:00.000Z');
