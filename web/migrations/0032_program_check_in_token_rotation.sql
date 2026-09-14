-- Programs production continuation (#621): audited, retry-safe emergency
-- rotation for the permanent Program QR credential. The resulting token is
-- server-side idempotency state; it is never copied into audit JSON.

CREATE TABLE program_check_in_token_rotations (
  idempotency_key   TEXT PRIMARY KEY,
  request_fingerprint TEXT NOT NULL,
  actor_user_id     TEXT NOT NULL,
  program_id        TEXT NOT NULL,
  resulting_token   TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  FOREIGN KEY (actor_user_id) REFERENCES accounts(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (program_id) REFERENCES programs(program_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX program_qr_rotations_program_idx
  ON program_check_in_token_rotations(program_id);

CREATE INDEX program_qr_rotations_actor_idx
  ON program_check_in_token_rotations(actor_user_id);

CREATE TRIGGER program_qr_rotations_no_update
BEFORE UPDATE ON program_check_in_token_rotations
BEGIN
  SELECT RAISE(ABORT, 'program_check_in_token_rotations is immutable');
END;

CREATE TRIGGER program_qr_rotations_no_delete
BEFORE DELETE ON program_check_in_token_rotations
BEGIN
  SELECT RAISE(ABORT, 'program_check_in_token_rotations is immutable');
END;
