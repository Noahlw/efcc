-- Migration number: 0004  2026-08-07T00:00:00.000Z
-- Attendance check-in capability (ATT-01 #213 / Spec #212 / Spec 081).
--
-- Builds on the D1 program domain (0003): adds the permanent Program
-- check-in token + window configuration, the never-reused Event manual code
-- + derived check-in window, and evolves the member-only `attendances` table
-- to the guest-capable shape (nullable member identity, guest fields, method
-- vocabulary, one active row per member or normalized guest phone).

ALTER TABLE programs ADD COLUMN check_in_token TEXT;
ALTER TABLE programs ADD COLUMN check_in_opens_at_minutes_before_start INTEGER NOT NULL DEFAULT 15;
ALTER TABLE programs ADD COLUMN check_in_closes_at_minutes_after_end INTEGER NOT NULL DEFAULT 0;

-- Existing domain rows must remain check-in-capable after the migration.
UPDATE programs
   SET check_in_token = lower(hex(randomblob(16)))
 WHERE check_in_token IS NULL;

CREATE UNIQUE INDEX programs_check_in_token_idx
  ON programs(check_in_token);

ALTER TABLE events ADD COLUMN manual_check_in_code TEXT;
ALTER TABLE events ADD COLUMN check_in_window_opens_at TEXT;
ALTER TABLE events ADD COLUMN check_in_window_closes_at TEXT;

UPDATE events
   SET manual_check_in_code = upper(substr(hex(randomblob(4)), 1, 8))
 WHERE manual_check_in_code IS NULL;

UPDATE events
   SET check_in_window_opens_at = strftime(
         '%Y-%m-%dT%H:%M:%SZ',
         starts_at,
         printf('-%d minutes', (
           SELECT check_in_opens_at_minutes_before_start
             FROM programs
            WHERE programs.program_id = events.program_id
         ))
       ),
       check_in_window_closes_at = strftime(
         '%Y-%m-%dT%H:%M:%SZ',
         ends_at,
         printf('+%d minutes', (
           SELECT check_in_closes_at_minutes_after_end
             FROM programs
            WHERE programs.program_id = events.program_id
         ))
       )
 WHERE check_in_window_opens_at IS NULL
    OR check_in_window_closes_at IS NULL;

CREATE UNIQUE INDEX events_manual_check_in_code_idx
  ON events(manual_check_in_code);

-- Evolve the member-only attendances table (from 0003) to the guest-capable
-- shape: nullable member identity, guest fields, method vocabulary, and one
-- active row per member or normalized guest phone per Event.
DROP INDEX attendances_active_event_member_idx;
DROP INDEX attendances_event_idx;
ALTER TABLE attendances RENAME TO attendances_member_only;

CREATE TABLE attendances (
  attendance_id          TEXT PRIMARY KEY,
  event_id               TEXT NOT NULL,
  member_user_id         TEXT,
  guest_name             TEXT,
  guest_phone            TEXT,
  guest_phone_normalized TEXT,
  method                 TEXT NOT NULL DEFAULT 'self_qr_scan'
                         CHECK (method IN (
                           'self_qr_scan',
                           'self_manual_code',
                           'leader_qr_scan',
                           'leader_manual_search',
                           'guest_qr_scan',
                           'guest_manual_code'
                         )),
  status                 TEXT NOT NULL CHECK (status IN ('Active','Voided')),
  checked_in_at          TEXT NOT NULL,
  checked_in_by          TEXT,
  voided_by              TEXT,
  voided_at              TEXT,
  void_reason            TEXT,
  FOREIGN KEY (event_id)       REFERENCES events(event_id)       ON DELETE RESTRICT,
  FOREIGN KEY (member_user_id) REFERENCES accounts(user_id)      ON DELETE RESTRICT,
  FOREIGN KEY (checked_in_by)  REFERENCES accounts(user_id)      ON DELETE RESTRICT,
  FOREIGN KEY (voided_by)      REFERENCES accounts(user_id)      ON DELETE RESTRICT
) STRICT;

INSERT INTO attendances (
  attendance_id,
  event_id,
  member_user_id,
  method,
  status,
  checked_in_at,
  checked_in_by,
  voided_by,
  voided_at,
  void_reason
)
SELECT
  attendance_id,
  event_id,
  member_user_id,
  'self_qr_scan',
  status,
  checked_in_at,
  checked_in_by,
  voided_by,
  voided_at,
  void_reason
FROM attendances_member_only;

DROP TABLE attendances_member_only;

CREATE UNIQUE INDEX attendances_active_event_member_idx
  ON attendances(event_id, member_user_id)
  WHERE status = 'Active' AND member_user_id IS NOT NULL;

CREATE UNIQUE INDEX attendances_active_event_guest_phone_idx
  ON attendances(event_id, guest_phone_normalized)
  WHERE status = 'Active'
    AND member_user_id IS NULL
    AND guest_phone_normalized IS NOT NULL;

CREATE INDEX attendances_event_idx ON attendances(event_id);
