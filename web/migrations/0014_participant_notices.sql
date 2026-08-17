-- Migration number: 0014  2026-08-17T00:00:00.000Z
-- 085-07 #324 — Participant Notices screen backend.
--
-- Durably stored, member-scoped notices (event / program / account kinds).
-- Unlike the management notifications overlay (migration 0009), these rows
-- ARE the message: an admin creates one via POST /api/v1/programs/notices
-- and it is delivered to exactly one member. read_at/created_at are epoch
-- milliseconds. Reads apply a 90-day retention window at query time.
CREATE TABLE participant_notices (
  notice_id      TEXT PRIMARY KEY,
  member_user_id TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('event','program','account')),
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  program_id     TEXT,
  event_id       TEXT,
  read_at        INTEGER,
  created_at     INTEGER NOT NULL
);

CREATE INDEX idx_participant_notices_member_created
  ON participant_notices(member_user_id, created_at DESC);
