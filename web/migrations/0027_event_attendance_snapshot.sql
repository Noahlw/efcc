-- Migration number: 0027  2026-09-15T00:00:00.000Z
-- #619 — durable Expected Attendance Snapshot and Excused disposition.
--
-- Snapshot rows are Event history, not Event-specific Enrollments. The
-- marker lets an empty snapshot remain durable so a later read cannot
-- silently reinterpret the Event's denominator.

CREATE TABLE event_attendance_snapshots (
  snapshot_id         TEXT PRIMARY KEY,
  event_id            TEXT NOT NULL UNIQUE,
  materialized_at     TEXT NOT NULL,
  last_materialized_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE event_expected_attendance (
  expected_attendance_id TEXT PRIMARY KEY,
  event_id               TEXT NOT NULL,
  snapshot_id            TEXT NOT NULL,
  enrollment_id          TEXT NOT NULL,
  member_user_id         TEXT NOT NULL,
  source                 TEXT NOT NULL CHECK (
    source IN ('event_start', 'early_attendance', 'late_approval')
  ),
  captured_at            TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE RESTRICT,
  FOREIGN KEY (snapshot_id) REFERENCES event_attendance_snapshots(snapshot_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (enrollment_id) REFERENCES enrollments(enrollment_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (member_user_id) REFERENCES accounts(user_id) ON DELETE RESTRICT,
  UNIQUE (event_id, enrollment_id),
  UNIQUE (event_id, member_user_id)
) STRICT;

CREATE INDEX event_expected_attendance_event_idx
  ON event_expected_attendance(event_id, member_user_id);

CREATE TABLE event_attendance_dispositions (
  disposition_id TEXT PRIMARY KEY,
  event_id       TEXT NOT NULL,
  enrollment_id  TEXT NOT NULL,
  member_user_id TEXT NOT NULL,
  disposition    TEXT NOT NULL CHECK (disposition IN ('Excused')),
  reason         TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  recorded_by    TEXT NOT NULL,
  recorded_at    TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE RESTRICT,
  FOREIGN KEY (enrollment_id) REFERENCES enrollments(enrollment_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (member_user_id) REFERENCES accounts(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (recorded_by) REFERENCES accounts(user_id) ON DELETE RESTRICT,
  UNIQUE (event_id, enrollment_id)
) STRICT;

CREATE INDEX event_attendance_dispositions_event_idx
  ON event_attendance_dispositions(event_id, member_user_id);

-- An expected row is a historical fact. Corrections happen to Attendance or
-- the audited disposition; neither operation removes a snapshot row.
CREATE TRIGGER event_expected_attendance_no_update
BEFORE UPDATE ON event_expected_attendance
BEGIN
  SELECT RAISE(ABORT, 'event_expected_attendance is immutable');
END;

CREATE TRIGGER event_expected_attendance_no_delete
BEFORE DELETE ON event_expected_attendance
BEGIN
  SELECT RAISE(ABORT, 'event_expected_attendance is immutable');
END;

CREATE TRIGGER event_attendance_snapshots_no_delete
BEFORE DELETE ON event_attendance_snapshots
BEGIN
  SELECT RAISE(ABORT, 'event_attendance_snapshots is immutable');
END;
