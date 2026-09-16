-- Programs production remediation: durable selected Enrollment approval Runs.
-- One Run owns one Program and preserves the original request/version selection,
-- stable per-request retry identities, and independent recovery outcomes.

CREATE TABLE enrollment_approval_runs (
  run_id         TEXT PRIMARY KEY,
  program_id     TEXT NOT NULL,
  actor_user_id  TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at     TEXT NOT NULL,
  finished_at    TEXT,
  cancelled_at   TEXT,
  correlation_id TEXT,
  FOREIGN KEY (program_id) REFERENCES programs(program_id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id) REFERENCES accounts(user_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX enrollment_approval_runs_program_idx
  ON enrollment_approval_runs(program_id, created_at DESC);
CREATE INDEX enrollment_approval_runs_actor_idx
  ON enrollment_approval_runs(actor_user_id, program_id, status, created_at DESC);
CREATE UNIQUE INDEX enrollment_approval_runs_active_actor_program_idx
  ON enrollment_approval_runs(actor_user_id, program_id) WHERE status = 'active';

CREATE TABLE enrollment_approval_run_items (
  item_id          TEXT PRIMARY KEY,
  run_id           TEXT NOT NULL,
  sequence         INTEGER NOT NULL CHECK (sequence >= 0),
  request_id       TEXT NOT NULL,
  program_id       TEXT NOT NULL,
  member_user_id   TEXT NOT NULL,
  member_name      TEXT,
  member_username  TEXT,
  request_version  INTEGER NOT NULL CHECK (request_version >= 1),
  idempotency_key  TEXT NOT NULL UNIQUE,
  status           TEXT NOT NULL CHECK (
    status IN ('not_started', 'in_flight', 'completed', 'failed', 'outcome_unknown')
  ),
  retryable        INTEGER NOT NULL CHECK (retryable IN (0, 1)),
  enrollment_id    TEXT,
  error_code       TEXT,
  detail           TEXT CHECK (detail IS NULL OR length(detail) <= 1000),
  started_at       TEXT,
  settled_at       TEXT,
  FOREIGN KEY (run_id) REFERENCES enrollment_approval_runs(run_id) ON DELETE RESTRICT,
  FOREIGN KEY (request_id) REFERENCES enrollment_requests(request_id) ON DELETE RESTRICT,
  FOREIGN KEY (program_id) REFERENCES programs(program_id) ON DELETE RESTRICT,
  FOREIGN KEY (member_user_id) REFERENCES accounts(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (enrollment_id) REFERENCES enrollments(enrollment_id) ON DELETE RESTRICT
) STRICT;

CREATE UNIQUE INDEX enrollment_approval_run_items_run_request_idx
  ON enrollment_approval_run_items(run_id, request_id);
CREATE UNIQUE INDEX enrollment_approval_run_items_run_sequence_idx
  ON enrollment_approval_run_items(run_id, sequence);
CREATE INDEX enrollment_approval_run_items_run_status_idx
  ON enrollment_approval_run_items(run_id, status, sequence);

CREATE TRIGGER enrollment_approval_runs_no_delete
BEFORE DELETE ON enrollment_approval_runs
BEGIN
  SELECT RAISE(ABORT, 'enrollment approval runs are immutable history');
END;
CREATE TRIGGER enrollment_approval_run_items_no_delete
BEFORE DELETE ON enrollment_approval_run_items
BEGIN
  SELECT RAISE(ABORT, 'enrollment approval run items are immutable history');
END;

CREATE TRIGGER enrollment_approval_run_items_identity_immutable
BEFORE UPDATE OF item_id, run_id, sequence, request_id, program_id,
  member_user_id, request_version, idempotency_key
ON enrollment_approval_run_items
BEGIN
  SELECT RAISE(ABORT, 'enrollment approval run item identity is immutable');
END;
