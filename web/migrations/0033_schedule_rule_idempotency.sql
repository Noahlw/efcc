-- Programs production continuation: durable retry identity for Schedule Rule
-- creation. The rule row is inserted in the same D1 batch as its reservation,
-- so a response loss can be retried without creating a second rule.

CREATE TABLE program_schedule_rule_idempotency (
  idempotency_key     TEXT PRIMARY KEY,
  request_fingerprint TEXT NOT NULL,
  actor_user_id       TEXT NOT NULL,
  program_id          TEXT NOT NULL,
  rule_id             TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  FOREIGN KEY (actor_user_id) REFERENCES accounts(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (program_id) REFERENCES programs(program_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX schedule_rule_idempotency_program_idx
  ON program_schedule_rule_idempotency(program_id);

CREATE INDEX schedule_rule_idempotency_actor_idx
  ON program_schedule_rule_idempotency(actor_user_id);

CREATE TRIGGER schedule_rule_idempotency_no_update
BEFORE UPDATE ON program_schedule_rule_idempotency
BEGIN
  SELECT RAISE(ABORT, 'program_schedule_rule_idempotency is immutable');
END;

CREATE TRIGGER schedule_rule_idempotency_no_delete
BEFORE DELETE ON program_schedule_rule_idempotency
BEGIN
  SELECT RAISE(ABORT, 'program_schedule_rule_idempotency is immutable');
END;
