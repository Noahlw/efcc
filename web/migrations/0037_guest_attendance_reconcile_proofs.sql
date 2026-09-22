-- Programs production readiness #625: durable proof for an ambiguous public
-- guest Attendance acknowledgement. Raw credentials, names, phone numbers,
-- and Idempotency-Key values never cross this storage boundary.

CREATE TABLE attendance_guest_reconcile_proofs (
  proof_hash          TEXT PRIMARY KEY,
  request_fingerprint TEXT NOT NULL,
  program_id          TEXT NOT NULL,
  event_id            TEXT NOT NULL,
  attendance_id       TEXT NOT NULL,
  request_id          TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  FOREIGN KEY (program_id) REFERENCES programs(program_id) ON DELETE RESTRICT,
  FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE RESTRICT,
  FOREIGN KEY (attendance_id) REFERENCES attendances(attendance_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX attendance_guest_reconcile_proofs_event_idx
  ON attendance_guest_reconcile_proofs(program_id, event_id);

CREATE TRIGGER attendance_guest_reconcile_proofs_bind_guest_attendance
BEFORE INSERT ON attendance_guest_reconcile_proofs
WHEN NOT EXISTS (
  SELECT 1
    FROM attendances attendance
    JOIN events event ON event.event_id = attendance.event_id
   WHERE attendance.attendance_id = NEW.attendance_id
     AND attendance.event_id = NEW.event_id
     AND event.program_id = NEW.program_id
     AND attendance.member_user_id IS NULL
     AND attendance.guest_phone_normalized IS NOT NULL
     AND attendance.status = 'Active'
)
BEGIN
  SELECT RAISE(ABORT, 'guest reconciliation proof target mismatch');
END;

CREATE TRIGGER attendance_guest_reconcile_proofs_no_update
BEFORE UPDATE ON attendance_guest_reconcile_proofs
BEGIN
  SELECT RAISE(ABORT, 'guest reconciliation proofs are immutable');
END;

CREATE TRIGGER attendance_guest_reconcile_proofs_no_delete
BEFORE DELETE ON attendance_guest_reconcile_proofs
BEGIN
  SELECT RAISE(ABORT, 'guest reconciliation proofs are immutable');
END;
