-- Migration number: 0017  2026-08-26T00:00:00.000Z
-- S4-05 — atomic, versioned Permission Policy change-set idempotency ledger.
--
-- A policy write is an arbitrary complete Role/Capability payload, so the
-- natural role/capability key is not sufficient to distinguish a replay from
-- a competing request. This small immutable-by-contract ledger lets the D1
-- batch gate all role/revision/audit statements on one request key.
CREATE TABLE IF NOT EXISTS permission_policy_mutations (
  idempotency_key TEXT PRIMARY KEY,
  request_fingerprint TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  base_revision INTEGER NOT NULL CHECK (base_revision >= 1),
  outcome TEXT NOT NULL CHECK (outcome IN ('PENDING','SUCCESS','CONFLICT')),
  resulting_revision INTEGER,
  applied INTEGER NOT NULL DEFAULT 0 CHECK (applied IN (0, 1)),
  audit_written INTEGER NOT NULL DEFAULT 0 CHECK (audit_written IN (0, 1)),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (actor_user_id) REFERENCES accounts(user_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX IF NOT EXISTS permission_policy_mutations_actor_idx
  ON permission_policy_mutations(actor_user_id, created_at);
