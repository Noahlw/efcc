-- Migration number: 0000 	 2026-08-05T04:00:00.000Z
-- EFCC Cloudflare D1 Identity Foundation (AUTH-01 #159 / AUTH-02 #160).
--
-- D1 becomes the sole system of record for identity, credentials, global
-- Role, Account Status, sessions, and registration (ADR-0020). Church/domain
-- records (Programs, Enrollments, Events, Attendances, Program_Leaders,
-- Audit_Log) stay in Google Sheets.
--
-- Conventions:
--   * account_status is one of: Pending | Active | Suspended | Deactivated.
--   * role is one of:         Admin | Teacher | Member.
--   * requires_upgrade = 1 marks a legacy_imported account that must complete
--     the forced credential upgrade before any session is issued.
--   * User_ID is immutable at the schema level (trigger below).
--   * username uniqueness / case-normalization is enforced transactionally by
--     the unique index on the normalized form.
--   * No cleartext PIN, password, or session value is ever stored.

CREATE TABLE accounts (
  user_id TEXT PRIMARY KEY,          -- immutable User_ID from the legacy Users sheet
  name TEXT NOT NULL,
  username TEXT NOT NULL,            -- display username (untrusted casing)
  username_normalized TEXT NOT NULL, -- trimmed + lowercased, the unique lookup key
  credential_hash TEXT,              -- pbkdf2:salt:hash of the current credential (NULL until upgraded)
  credential_kind TEXT NOT NULL,     -- 'legacy_pin' | 'password' | 'pin'
  credential_version INTEGER NOT NULL DEFAULT 1,
  account_status TEXT NOT NULL,      -- Pending | Active | Suspended | Deactivated
  role TEXT NOT NULL,                -- Admin | Teacher | Member
  phone TEXT,
  qr_code_string TEXT,
  legacy_pin_hash TEXT,              -- one-time salted PBKDF2 hash of the legacy PIN (cleared on upgrade)
  requires_upgrade INTEGER NOT NULL DEFAULT 0, -- legacy_pin marker: forces credential upgrade gate
  -- Legacy-PIN brute-force lockout state (ADR-0020 §4 / AUTH-01 #159). The hash
  -- is a THROWAWAY identity gate during forced upgrade, not a standalone security
  -- boundary: only non-secret counters and timestamps are persisted here, never
  -- the PIN or any credential.
  lock_level INTEGER NOT NULL DEFAULT 0,      -- 0 none | 1 5-min | 2 15-min | 3 admin-unlock
  failed_attempts INTEGER NOT NULL DEFAULT 0, -- failed legacy-PIN verifications since last reset
  locked_until INTEGER,                       -- epoch-ms when a 5/15-min time-lock expires (NULL when none)
  lock_since INTEGER,                         -- epoch-ms when lock_level was entered
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Normalized-unique username enforced transactionally (ADR-0020 §1).
CREATE UNIQUE INDEX accounts_username_normalized_idx
  ON accounts(username_normalized);

-- User_ID immutability is load-bearing (ADR-0020 §1): the legacy Users sheet
-- keeps its own identity and D1 must never silently re-key an account. SQLite
-- has no column-level immutability, so a trigger enforces it at the schema.
CREATE TRIGGER accounts_user_id_immutable
BEFORE UPDATE OF user_id ON accounts
BEGIN
  SELECT RAISE(ABORT, 'user_id is immutable');
END;

-- Pending self-service registrations awaiting Teacher/Admin approval
-- (ADR-0020 §3; the approval workflow itself is AUTH-05).
CREATE TABLE registration_requests (
  request_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  username_normalized TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  credential_hash TEXT NOT NULL,
  credential_kind TEXT NOT NULL,
  account_status TEXT NOT NULL DEFAULT 'Pending',
  role TEXT NOT NULL DEFAULT 'Member',
  submitted_at INTEGER NOT NULL,
  reviewed_by TEXT,
  reviewed_at INTEGER,
  review_decision TEXT -- Approved | Rejected
);

-- Refresh-session rows (ADR-0020 §2). Read only on token refresh or explicit
-- revocation; ordinary protected requests verify the short-lived access token
-- statelessly with zero D1 reads. Idle expiry is enforced by expires_at =
-- last_seen_at + REFRESH_IDLE_TTL (touched on each successful refresh).
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER, -- NULL until revoked (logout / credential change / admin suspend)
  device_fingerprint TEXT, -- opaque device/UA fingerprint, never parsed as identity
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES accounts(user_id)
);
CREATE INDEX sessions_user_id_idx ON sessions(user_id);
-- Migration ends here