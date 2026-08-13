-- Migration number: 0007  2026-08-13T00:00:00.000Z
-- EVT-02 (#252): server-owned recurring Preview Plan and auditable,
-- resumable Generation Run.
--
-- Adds the durable state for the reachable Program Workspace flow:
--   1. Rules carry an optional default location so previews and generated
--      events can materialize a real venue.
--   2. program_preview_plans + program_preview_occurrences freeze the exact
--      future occurrence set (HK wall dates/times, locations, CANCEL /
--      RESCHEDULE exception state) under a deterministic plan identity.
--      Preview writes no events and no generation records.
--   3. program_generation_runs + program_generation_run_items record every
--      attempt durably, one row per (run, occurrence), so retries resume
--      from durable state and never duplicate an already-created event.
--
-- Conventions match migration 0003: TEXT UUID primary keys, STRICT mode,
-- ISO-8601 UTC TEXT instants, CHECK-constrained vocabularies, FKs with
-- ON DELETE RESTRICT, immutable audit_events untouched.

-- ---------------------------------------------------------------------------
-- 1. Rule default location (optional; existing rules keep NULL).
-- ---------------------------------------------------------------------------

ALTER TABLE program_schedule_rules ADD COLUMN location TEXT;

-- ---------------------------------------------------------------------------
-- 2. Preview plans.
-- ---------------------------------------------------------------------------

-- A plan is server-owned and deterministic: the same (program, rules,
-- exceptions, horizon, from-date) always resolves to the same plan_hash and
-- therefore the same plan row. Changing any input produces a new plan and
-- supersedes the previous one; generation rejects plans that are no longer
-- current.
CREATE TABLE program_preview_plans (
  plan_id      TEXT PRIMARY KEY,
  program_id   TEXT NOT NULL,
  plan_hash    TEXT NOT NULL,
  horizon_days INTEGER NOT NULL CHECK (horizon_days >= 1 AND horizon_days <= 365),
  from_date    TEXT NOT NULL,
  rule_count   INTEGER NOT NULL CHECK (rule_count >= 0),
  created_by   TEXT,
  created_at   TEXT NOT NULL,
  FOREIGN KEY (program_id) REFERENCES programs(program_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES accounts(user_id)   ON DELETE RESTRICT
) STRICT;

CREATE UNIQUE INDEX preview_plans_program_hash_idx
  ON program_preview_plans(program_id, plan_hash);
CREATE INDEX preview_plans_program_created_idx
  ON program_preview_plans(program_id, created_at DESC);

-- Exact occurrence rows. occurrence_id is deterministic (rule_id + HK wall
-- date), so re-previewing identical inputs yields identical row identities
-- and the ordering is stable. skip_reason marks occurrences suppressed by a
-- CANCEL exception; exception_id records the RESCHEDULE/CANCEL override.
CREATE TABLE program_preview_occurrences (
  occurrence_id TEXT PRIMARY KEY,
  plan_id       TEXT NOT NULL,
  rule_id       TEXT NOT NULL,
  occurs_on     TEXT NOT NULL,
  starts_at     TEXT NOT NULL,
  ends_at       TEXT NOT NULL,
  location      TEXT,
  skip_reason   TEXT CHECK (skip_reason IS NULL OR skip_reason IN ('CANCEL')),
  exception_id  TEXT,
  FOREIGN KEY (plan_id)      REFERENCES program_preview_plans(plan_id)      ON DELETE CASCADE,
  FOREIGN KEY (rule_id)      REFERENCES program_schedule_rules(rule_id)     ON DELETE RESTRICT,
  -- Snapshot attribution: removing an exception (settings restore) must not
  -- be blocked by stale preview rows; the reference is cleared instead.
  -- Any plan still pointing at it is stale by hash and rejected before
  -- generation, so the cleared marker never reaches a generated event.
  FOREIGN KEY (exception_id) REFERENCES program_schedule_exceptions(exception_id) ON DELETE SET NULL
) STRICT;

CREATE INDEX preview_occurrences_plan_idx
  ON program_preview_occurrences(plan_id, occurs_on, starts_at);

-- ---------------------------------------------------------------------------
-- 3. Generation runs.
-- ---------------------------------------------------------------------------

-- At most one run per plan: repeat and concurrent generation requests all
-- converge on the same durable run, which is the retry/resume record.
-- status is terminal once finished: 'completed' (zero failures), 'partial'
-- (some created/skipped and some failed), 'failed' (nothing processed).
CREATE TABLE program_generation_runs (
  run_id         TEXT PRIMARY KEY,
  program_id     TEXT NOT NULL,
  plan_id        TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('completed','partial','failed')),
  created        INTEGER NOT NULL DEFAULT 0,
  skipped        INTEGER NOT NULL DEFAULT 0,
  failed         INTEGER NOT NULL DEFAULT 0,
  started_at     TEXT NOT NULL,
  finished_at    TEXT,
  created_by     TEXT,
  correlation_id TEXT,
  FOREIGN KEY (program_id) REFERENCES programs(program_id) ON DELETE RESTRICT,
  FOREIGN KEY (plan_id)    REFERENCES program_preview_plans(plan_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES accounts(user_id)             ON DELETE RESTRICT
) STRICT;

CREATE UNIQUE INDEX generation_runs_plan_idx ON program_generation_runs(plan_id);
CREATE INDEX generation_runs_program_idx ON program_generation_runs(program_id, started_at DESC);

-- One durable attempt row per (run, occurrence). outcome is the attempt's
-- terminal result; event_id links created events (partial unique index so a
-- created event is attributed to exactly one attempt row).
CREATE TABLE program_generation_run_items (
  item_id       TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL,
  occurrence_id TEXT NOT NULL,
  starts_at     TEXT NOT NULL,
  outcome       TEXT NOT NULL CHECK (outcome IN ('created','skipped','failed')),
  event_id      TEXT,
  detail        TEXT,
  FOREIGN KEY (run_id)        REFERENCES program_generation_runs(run_id)   ON DELETE CASCADE,
  FOREIGN KEY (occurrence_id) REFERENCES program_preview_occurrences(occurrence_id) ON DELETE RESTRICT,
  FOREIGN KEY (event_id)      REFERENCES events(event_id)                  ON DELETE RESTRICT
) STRICT;

CREATE UNIQUE INDEX generation_run_items_run_occurrence_idx
  ON program_generation_run_items(run_id, occurrence_id);
CREATE UNIQUE INDEX generation_run_items_event_idx
  ON program_generation_run_items(event_id) WHERE event_id IS NOT NULL;
