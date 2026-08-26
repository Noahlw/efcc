-- S4H-04 (#464): durable registration batch idempotency.
-- Stores only a canonical request hash and safe response summary; no
-- credential, session, or immutable account identity material is persisted.

CREATE TABLE registration_batch_idempotency (
  actor_user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL CHECK (endpoint = 'registration.approve-batch'),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL CHECK (length(response_json) <= 20000),
  request_count INTEGER NOT NULL CHECK (request_count > 0 AND request_count <= 100),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (actor_user_id, endpoint, idempotency_key)
) STRICT;

CREATE INDEX registration_batch_idempotency_actor_idx
  ON registration_batch_idempotency(actor_user_id, created_at);

CREATE TRIGGER registration_batch_idempotency_immutable_update
BEFORE UPDATE ON registration_batch_idempotency
BEGIN
  SELECT RAISE(ABORT, 'registration batch idempotency is immutable');
END;

CREATE TRIGGER registration_batch_idempotency_immutable_delete
BEFORE DELETE ON registration_batch_idempotency
BEGIN
  SELECT RAISE(ABORT, 'registration batch idempotency is immutable');
END;
