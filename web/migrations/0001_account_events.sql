-- Migration number: 0001 	 2026-08-06T00:00:00.000Z
-- EFCC D1 identity — account self-service event audit (UI-04 #196 / Spec #191).
--
-- Append-only audit of username and password changes (ADR-0020 §1: no
-- cleartext PIN, password, access token, or raw session value is ever stored
-- in D1, logged, or returned across an RPC boundary). Rows are written inside
-- the same atomic `env.DB.batch` transaction as the mutation they record, so
-- no change ever lands without its audit row and no audit row exists without
-- the change.
--
-- Conventions:
--   * action is one of: username_changed | password_changed.
--   * username_changed rows carry old/new normalized (trim + lowercase)
--     usernames; password_changed rows carry NULL username columns (the login
--     identifier is unchanged).
--   * correlation_id is the request's requestId (echoed in X-Request-Id).
--   * No credential hash, token, session id, or raw credential is ever stored.
--   * Append-only: this ticket defines no UPDATE/DELETE path.

CREATE TABLE account_events (
  event_id                  TEXT PRIMARY KEY,
  actor_user_id             TEXT NOT NULL,
  action                    TEXT NOT NULL CHECK (action IN ('username_changed', 'password_changed')),
  old_username_normalized   TEXT,
  new_username_normalized   TEXT,
  correlation_id            TEXT NOT NULL,
  created_at                INTEGER NOT NULL
);

-- Lookups by actor and by action are the only two read patterns this ticket
-- defines; index both so audits stay cheap as the table grows.
CREATE INDEX account_events_actor_idx ON account_events(actor_user_id);
CREATE INDEX account_events_action_idx ON account_events(action);
-- Migration ends here