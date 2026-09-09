-- Migration number: 0026  2026-09-01T00:00:00.000Z
-- #494 — remove fixed Account role column and write-guard triggers.
--
-- Both accounts.role and registration_requests.role are retired as part of the
-- normalized identity cutover. The role write-guard triggers from 0002/0003 are
-- removed with the column. Tables are rebuilt via RENAME → CREATE → INSERT → DROP
-- so the change works on local D1 (SQLite) while preserving every non-role
-- column, constraint, index, trigger, and audit field. The rebuild keeps
-- STRICT mode, all CHECKs except the retired role CHECK, the normalized-unique
-- username index, and the user_id immutability trigger.

PRAGMA foreign_keys=OFF;

-- ---------------------------------------------------------------------------
-- Drop the retired write-guard triggers before the rebuild. IF EXISTS keeps
-- the migration idempotent on a database that has already been contracted.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS accounts_role_write_guard_insert;
DROP TRIGGER IF EXISTS accounts_role_write_guard_update;
DROP TABLE IF EXISTS accounts_old;
DROP TABLE IF EXISTS accounts_new;
DROP TABLE IF EXISTS registration_requests_old;
DROP TABLE IF EXISTS registration_requests_new;

-- ---------------------------------------------------------------------------
-- accounts — rebuild without role
-- ---------------------------------------------------------------------------
CREATE TABLE accounts_new (
  user_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL,
  username_normalized TEXT NOT NULL,
  credential_hash TEXT,
  credential_kind TEXT NOT NULL CHECK (credential_kind IN ('legacy_pin','password','pin')),
  credential_version INTEGER NOT NULL DEFAULT 1,
  account_status TEXT NOT NULL CHECK (account_status IN ('Pending','Active','Suspended','Deactivated')),
  phone TEXT,
  qr_code_string TEXT,
  legacy_pin_hash TEXT,
  requires_upgrade INTEGER NOT NULL DEFAULT 0,
  lock_level INTEGER NOT NULL DEFAULT 0,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  lock_since INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

INSERT INTO accounts_new (
  user_id, name, username, username_normalized,
  credential_hash, credential_kind, credential_version,
  account_status, phone, qr_code_string, legacy_pin_hash,
  requires_upgrade, lock_level, failed_attempts, locked_until, lock_since,
  created_at, updated_at
)
SELECT
  user_id, name, username, username_normalized,
  credential_hash, credential_kind, credential_version,
  account_status, phone, qr_code_string, legacy_pin_hash,
  requires_upgrade, lock_level, failed_attempts, locked_until, lock_since,
  created_at, updated_at
FROM accounts;

DROP TABLE accounts;

ALTER TABLE accounts_new RENAME TO accounts;

CREATE UNIQUE INDEX accounts_username_normalized_idx
  ON accounts(username_normalized);

CREATE TRIGGER accounts_user_id_immutable
BEFORE UPDATE OF user_id ON accounts
BEGIN
  SELECT RAISE(ABORT, 'user_id is immutable');
END;

-- ---------------------------------------------------------------------------
-- registration_requests — rebuild without role
-- ---------------------------------------------------------------------------
CREATE TABLE registration_requests_new (
  request_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  username_normalized TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  credential_hash TEXT NOT NULL,
  credential_kind TEXT NOT NULL,
  account_status TEXT NOT NULL DEFAULT 'Pending' CHECK (account_status IN ('Pending','Active','Rejected')),
  submitted_at INTEGER NOT NULL,
  reviewed_by TEXT,
  reviewed_at INTEGER,
  review_decision TEXT CHECK (review_decision IS NULL OR review_decision IN ('Approved','Rejected')),
  rejection_note TEXT
) STRICT;

INSERT INTO registration_requests_new (
  request_id, user_id, username, username_normalized, name, phone,
  credential_hash, credential_kind, account_status, submitted_at,
  reviewed_by, reviewed_at, review_decision, rejection_note
)
SELECT
  request_id, user_id, username, username_normalized, name, phone,
  credential_hash, credential_kind, account_status, submitted_at,
  reviewed_by, reviewed_at, review_decision, rejection_note
FROM registration_requests;

DROP TABLE registration_requests;

ALTER TABLE registration_requests_new RENAME TO registration_requests;

PRAGMA foreign_keys=ON;

-- Migration ends here
