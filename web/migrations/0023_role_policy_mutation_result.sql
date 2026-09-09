-- Migration number: 0023  2026-08-29T00:00:00.000Z
-- #485 — preserve the authoritative terminal Permission Editor response.
--
-- A nullable JSON projection keeps the normalized idempotency ledger small
-- while allowing response-loss replays to return the original role detail.

ALTER TABLE role_policy_mutations ADD COLUMN result_json TEXT;
