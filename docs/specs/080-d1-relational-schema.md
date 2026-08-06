# 080 — D1 Relational Schema and Record Lifecycle

**Status:** Approved (Spec #190 grilling, 2026-08-06)
**Parent:** [Spec #190](https://github.com/Noahlw/efcc/issues/190) · [Master Spec #187](https://github.com/Noahlw/efcc/issues/187) · [Decision #184](https://github.com/Noahlw/efcc/issues/184)
**Authority:** This document is the authoritative D1 relational schema. It supersedes the identity-tables portion of `web/migrations/0000_init.sql` going forward and is the source PRG-01 (#197) turns into the next D1 migration (`web/migrations/0001_*.sql`).
**Related:** [ADR-0020](docs/adr/0020-cloudflare-d1-identity-session-and-auth-boundary.md) (identity authority) · [ADR-0023](docs/adr/0023-single-lock-mutation-and-audit-contract.md) (audit vocabulary, superseded in shape here) · [ADR-0024](docs/adr/0024-d1-platform-restart-relationship-to-apps-script.md) (D1 restart) · Research #188 (forms) · Research #189 (history) · Deferred #206 (history/archive layer)

---

## 1. Scope

Every known and planned D1 record, its relationships, lifecycle, ownership, and deletion policy. The new Programs/Enrollment domain starts from an **empty baseline**: no legacy Sheet import, no dual-write path, no Sheet adapter. The Google Sheet remains historical reference only.

### Records covered

- Identity (existing): `accounts`, `registration_requests`, `sessions`
- Authorization (new): `role_capabilities`
- Department domain (new): `departments`, `department_modules`, `programs`
- Scheduling (new): `program_schedule_rules`, `program_schedule_exceptions`
- Events (new): `events`
- Enrollment (new): `enrollment_requests`, `enrollments`
- Leadership (new): `program_leaders`
- Attendance (new): `attendances`
- Audit (new): `audit_events`

### Explicitly excluded (owned elsewhere)

- Custom Application Forms — Research #188, roadmap only; schema deferred.
- Time-bounded Program Offering/Cycle — deferred to #206 (opened 2026-08-06, `type:optional`). Enrollment FK targets `program_id` now; #206 may retarget it.

---

## 2. Cross-cutting conventions

### 2.1 Primary keys

All new tables use **TEXT primary keys** holding UUIDs, consistent with the existing `accounts`/`sessions`/`registration_requests` tables. Opaque IDs never leak into URLs or QR codes.

### 2.2 Timestamps

- All **new** domain tables use **ISO-8601 UTC TEXT** (`YYYY-MM-DDTHH:MM:SSZ`).
- The existing identity tables (`0000_init.sql`) still use epoch-millis INTEGER. Converting them is a **separate table-rebuild migration** (see §10). Until then a **dual-format transitional state exists** — code must not assume a single format.
- Display converts to `Asia/Hong_Kong` at the presentation boundary only (see CONTEXT.md "Church Time"). Storage is always UTC.

### 2.3 Foreign keys

- `ON DELETE RESTRICT` on every FK.
- **D1 enforces foreign keys by default**, equivalent to `PRAGMA foreign_keys = on` per transaction — no per-connection pragma is required (verified against Cloudflare D1 docs, 2026-08-06). Local SQLite/workerd test harnesses must set `PRAGMA foreign_keys = on` explicitly to mirror D1.
- Nothing is hard-deleted (all soft via status), so RESTRICT never needs a cascade path; it is the honest guarantee that accidental deletes are blocked.

### 2.4 CHECK constraints

Every closed vocabulary is `CHECK`-constrained. This includes the existing identity tables: `account_status`, `role` (after the `Teacher→Staff` migration), `credential_kind`.

### 2.5 Audit

One immutable, append-only stream: `audit_events`. No per-entity columns. Keeps ADR-0023's vocabulary (`outcome`, `correlation_id`) but is rebuilt generically (Spec #190 Q6/Q9/Q22).

### 2.6 General conventions

- `user_id` always references `accounts(user_id)` (the immutable User_ID).
- `actor_*`/`created_by`/`updated_by` columns reference `accounts(user_id)`.
- Soft-delete is expressed as lifecycle `status`; no row is ever `DELETE`d.

---

## 3. Identity tables (existing, unchanged functionally)

These exist in `0000_init.sql`. The schema conversions (§10) add CHECK constraints and re-timestamp them; the record shapes are unchanged.

- `accounts` — `user_id` TEXT PK (immutable via trigger), `username`/`username_normalized` (normalized-unique), `credential_hash` (PBKDF2), `credential_kind`, `account_status`, `role`, legacy-PIN lockout fields.
- `registration_requests` — pending self-service registrations (normalized-unique username reservation).
- `sessions` — refresh-session rows, FK to `accounts(user_id)`.

### §3.1 Role values

Canonical `role` values: `Admin`, `Staff`, `Member`. The legacy `Teacher` spelling is migrated to `Staff` **in the current PR stack** (not this spec's migration) — see §10.1.

---

## 4. Authorization (new)

### 4.1 `role_capabilities`

Maps a global Role to the capabilities it grants. Hierarchical policy editing (Admin edits Admin/Staff/Member; Staff edits Member; Member edits none) is enforced in the Worker, not the schema.

```sql
CREATE TABLE role_capabilities (
  role          TEXT NOT NULL,          -- Admin | Staff | Member
  capability    TEXT NOT NULL,          -- e.g. program.manage, enrollment.approve
  granted_by    TEXT,                   -- accounts.user_id; NULL = seeded default
  granted_at    TEXT NOT NULL,          -- ISO-8601 UTC
  PRIMARY KEY (role, capability),
  FOREIGN KEY (granted_by) REFERENCES accounts(user_id) ON DELETE RESTRICT
) STRICT;
```

Policy changes are audited. Program-scoped grants live in `program_leaders` (§8), never here.

---

## 5. Department domain (new)

### 5.1 `departments`

```sql
CREATE TABLE departments (
  department_id TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,   -- stable short code, e.g. '青區'
  name          TEXT NOT NULL,
  description   TEXT,
  lifecycle     TEXT NOT NULL           -- Draft | PendingDevelopment | Active | Archived
                CHECK (lifecycle IN ('Draft','PendingDevelopment','Active','Archived')),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_by    TEXT,
  created_at    TEXT NOT NULL,          -- ISO-8601 UTC
  updated_by    TEXT,
  updated_at    TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES accounts(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES accounts(user_id) ON DELETE RESTRICT
) STRICT;
```

Publishing to `Active` is a separate capability-gated action (§9 audit). Initial records: 青區 `Active`, 成區/兒區 `PendingDevelopment`.

### 5.2 `department_modules` (normalized junction)

Product-owned modules enabled per Department. No JSON column; no executable modules.

```sql
CREATE TABLE department_modules (
  department_id TEXT NOT NULL,
  module_key    TEXT NOT NULL,          -- program_catalog | enrollment | events | attendance | custom_forms
  enabled       INTEGER NOT NULL DEFAULT 1,
  enabled_by    TEXT,
  enabled_at    TEXT NOT NULL,
  PRIMARY KEY (department_id, module_key),
  FOREIGN KEY (department_id) REFERENCES departments(department_id) ON DELETE RESTRICT,
  FOREIGN KEY (enabled_by)   REFERENCES accounts(user_id)      ON DELETE RESTRICT
) STRICT;
```

Module enable/disable is capability-gated and audited; it must never alter existing domain records.

### 5.3 `programs`

```sql
CREATE TABLE programs (
  program_id      TEXT PRIMARY KEY,
  department_id   TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  category        TEXT,                 -- descriptive only; no behavior (Activity Category)
  behavior_type   TEXT NOT NULL         -- Recurring | OneOff
                  CHECK (behavior_type IN ('Recurring','OneOff')),
  lifecycle       TEXT NOT NULL         -- Draft | Active | Archived
                  CHECK (lifecycle IN ('Draft','Active','Archived')),
  discoverability TEXT NOT NULL         -- Listed | Unlisted
                  CHECK (discoverability IN ('Listed','Unlisted')),
  enrollment_mode TEXT NOT NULL         -- MemberRequest | ManagerOnly
                  CHECK (enrollment_mode IN ('MemberRequest','ManagerOnly')),
  display_order   INTEGER NOT NULL DEFAULT 0,
  created_by      TEXT,
  created_at      TEXT NOT NULL,
  updated_by      TEXT,
  updated_at      TEXT NOT NULL,
  FOREIGN KEY (department_id) REFERENCES departments(department_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by)    REFERENCES accounts(user_id)        ON DELETE RESTRICT,
  FOREIGN KEY (updated_by)    REFERENCES accounts(user_id)        ON DELETE RESTRICT
) STRICT;

CREATE INDEX programs_department_idx ON programs(department_id);
```

`Listed/Unlisted` controls catalogue visibility only — never substitutes for server authorization.

---

## 6. Scheduling (new)

### 6.1 `program_schedule_rules`

Editable recurrence rules for `Recurring` programs. Normalized, not a JSON column.

```sql
CREATE TABLE program_schedule_rules (
  rule_id       TEXT PRIMARY KEY,
  program_id    TEXT NOT NULL,
  recurrence    TEXT NOT NULL           -- WEEKLY | MONTHLY
                CHECK (recurrence IN ('WEEKLY','MONTHLY')),
  day_of_week   INTEGER,                -- 0-6 (WEEKLY)
  month_day     INTEGER,                -- 1-31 (MONTHLY)
  start_time    TEXT NOT NULL,          -- HH:MM, Asia/Hong_Kong display
  end_time      TEXT NOT NULL,
  created_by    TEXT,
  created_at    TEXT NOT NULL,
  updated_by    TEXT,
  updated_at    TEXT NOT NULL,
  FOREIGN KEY (program_id) REFERENCES programs(program_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES accounts(user_id)   ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES accounts(user_id)   ON DELETE RESTRICT
) STRICT;

CREATE INDEX schedule_rules_program_idx ON program_schedule_rules(program_id);
```

### 6.2 `program_schedule_exceptions`

Per-occurrence overrides. Editing a rule never mutates unrelated occurrences.

```sql
CREATE TABLE program_schedule_exceptions (
  exception_id  TEXT PRIMARY KEY,
  rule_id       TEXT NOT NULL,
  override_date TEXT NOT NULL,          -- YYYY-MM-DD
  action        TEXT NOT NULL           -- CANCEL | RESCHEDULE
                CHECK (action IN ('CANCEL','RESCHEDULE')),
  new_start_time TEXT,
  new_end_time   TEXT,
  created_by     TEXT,
  created_at     TEXT NOT NULL,
  FOREIGN KEY (rule_id)    REFERENCES program_schedule_rules(rule_id)    ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES accounts(user_id)                  ON DELETE RESTRICT
) STRICT;

CREATE INDEX schedule_exceptions_rule_idx ON program_schedule_exceptions(rule_id);
```

---

## 7. Events (new)

### 7.1 `events`

One table for both `Recurring` (generated from rules) and `OneOff` (manual) programs.

```sql
CREATE TABLE events (
  event_id    TEXT PRIMARY KEY,
  program_id  TEXT NOT NULL,
  starts_at   TEXT NOT NULL,            -- ISO-8601 UTC, converted to Asia/Hong_Kong for display
  ends_at     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'Active'
              CHECK (status IN ('Active','Cancelled')),
  source      TEXT NOT NULL             -- SCHEDULE | MANUAL
              CHECK (source IN ('SCHEDULE','MANUAL')),
  cancel_reason  TEXT,
  created_by  TEXT,
  created_at  TEXT NOT NULL,
  updated_by  TEXT,
  updated_at  TEXT NOT NULL,
  FOREIGN KEY (program_id) REFERENCES programs(program_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES accounts(user_id)   ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES accounts(user_id)   ON DELETE RESTRICT
) STRICT;

-- Idempotency authority: a program cannot own two events at the same start time.
CREATE UNIQUE INDEX events_program_start_idx ON events(program_id, starts_at);
```

- Event generation is idempotent via the natural unique index `(program_id, starts_at)` — no separate generation key.
- Cancellation is soft (`status = 'Cancelled'`), audited, and never deletes Attendance history. Cancellation is rejected once active Attendance exists.

---

## 8. Enrollment, Leadership, Attendance (new)

### 8.1 `enrollment_requests`

Separate historical record from `enrollments`. Sequential re-requests after a rejected/withdrawn request are allowed (one request per row, no unique-active-request constraint).

```sql
CREATE TABLE enrollment_requests (
  request_id    TEXT PRIMARY KEY,
  program_id    TEXT NOT NULL,
  member_user_id TEXT NOT NULL,
  status        TEXT NOT NULL           -- Pending | Approved | Rejected | Withdrawn
                CHECK (status IN ('Pending','Approved','Rejected','Withdrawn')),
  submitted_at  TEXT NOT NULL,
  decided_by    TEXT,
  decided_at    TEXT,
  decision_note TEXT,
  request_version INTEGER NOT NULL DEFAULT 1,  -- re-request sequence
  FOREIGN KEY (program_id)     REFERENCES programs(program_id) ON DELETE RESTRICT,
  FOREIGN KEY (member_user_id) REFERENCES accounts(user_id)   ON DELETE RESTRICT,
  FOREIGN KEY (decided_by)     REFERENCES accounts(user_id)   ON DELETE RESTRICT
) STRICT;

CREATE INDEX enrollment_requests_program_status_idx ON enrollment_requests(program_id, status);
CREATE INDEX enrollment_requests_member_idx ON enrollment_requests(member_user_id);
```

### 8.2 `enrollments`

The Member–Program relationship created by approval or by authorized direct (ManagerOnly) enrollment.

```sql
CREATE TABLE enrollments (
  enrollment_id TEXT PRIMARY KEY,
  program_id    TEXT NOT NULL,
  member_user_id TEXT NOT NULL,
  request_id    TEXT,                   -- FK to enrollment_requests; NULL for ManagerOnly direct-active
  status        TEXT NOT NULL           -- Active | Cancelled
                CHECK (status IN ('Active','Cancelled')),
  enrolled_at   TEXT NOT NULL,
  cancelled_at  TEXT,
  cancelled_by  TEXT,
  created_by    TEXT,                   -- actor who created (approver or enrolling manager)
  created_at    TEXT NOT NULL,
  FOREIGN KEY (program_id)     REFERENCES programs(program_id)     ON DELETE RESTRICT,
  FOREIGN KEY (member_user_id) REFERENCES accounts(user_id)       ON DELETE RESTRICT,
  FOREIGN KEY (request_id)     REFERENCES enrollment_requests(request_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by)     REFERENCES accounts(user_id)       ON DELETE RESTRICT,
  FOREIGN KEY (cancelled_by)   REFERENCES accounts(user_id)       ON DELETE RESTRICT
) STRICT;

-- At-most-one Active Member-Program (schema-level, the DB is the final authority).
CREATE UNIQUE INDEX enrollments_active_member_program_idx
  ON enrollments(program_id, member_user_id) WHERE status = 'Active';

CREATE INDEX enrollments_member_idx ON enrollments(member_user_id);
```

- Approval of an `enrollment_requests` row creates an `enrollments` row carrying that `request_id`.
- ManagerOnly direct-active enrollment creates an `enrollments` row with `request_id = NULL` — no fake request.
- Cancellation is soft (`status = 'Cancelled'`), never reopens a record; re-enrollment creates a new row.
- Concurrent duplicate protection: the partial unique index above, PLUS the guarded batch mutation (matching the username-uniqueness pattern already in #205).

### 8.3 `program_leaders`

Scoped Program relationship — never a global Role.

```sql
CREATE TABLE program_leaders (
  program_id  TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  granted_by  TEXT NOT NULL,
  granted_at  TEXT NOT NULL,
  revoked_by  TEXT,
  revoked_at  TEXT,
  PRIMARY KEY (program_id, user_id),
  FOREIGN KEY (program_id) REFERENCES programs(program_id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id)     REFERENCES accounts(user_id)   ON DELETE RESTRICT,
  FOREIGN KEY (granted_by)  REFERENCES accounts(user_id)   ON DELETE RESTRICT,
  FOREIGN KEY (revoked_by)  REFERENCES accounts(user_id)   ON DELETE RESTRICT
) STRICT;

-- At most one active grant per pair.
CREATE UNIQUE INDEX program_leaders_active_idx
  ON program_leaders(program_id, user_id) WHERE revoked_at IS NULL;
```

Grant/revoke **history** lives in `audit_events` (the assignment table holds only current state). No credential material ever enters audit.

### 8.4 `attendances`

```sql
CREATE TABLE attendances (
  attendance_id  TEXT PRIMARY KEY,
  event_id       TEXT NOT NULL,
  member_user_id TEXT NOT NULL,
  status         TEXT NOT NULL          -- Active | Voided
                 CHECK (status IN ('Active','Voided')),
  checked_in_at  TEXT NOT NULL,
  checked_in_by  TEXT,
  voided_by      TEXT,
  voided_at      TEXT,
  void_reason    TEXT,                  -- required when voided
  FOREIGN KEY (event_id)       REFERENCES events(event_id)       ON DELETE RESTRICT,
  FOREIGN KEY (member_user_id) REFERENCES accounts(user_id)      ON DELETE RESTRICT,
  FOREIGN KEY (checked_in_by)  REFERENCES accounts(user_id)      ON DELETE RESTRICT,
  FOREIGN KEY (voided_by)      REFERENCES accounts(user_id)      ON DELETE RESTRICT
) STRICT;

-- One active check-in per member per event; a voided row releases the slot.
CREATE UNIQUE INDEX attendances_active_event_member_idx
  ON attendances(event_id, member_user_id) WHERE status = 'Active';

CREATE INDEX attendances_event_idx ON attendances(event_id);
```

- Attendance FK is to `events` only. Whether the member is enrolled in the program is a **server-side scope check at scan time** — no FK to enrollments (so cancelling an enrollment never orphans attendance history).

---

## 9. Audit (new, rebuilt)

One immutable append-only stream. Generic entity addressing keeps ADR-0023's non-repudiation intent without per-entity column growth. **This is the deliberate exception** to the "avoid polymorphic FKs" constraint: audit must reference any entity type, so `entity_id` is not FK-enforced.

```sql
CREATE TABLE audit_events (
  audit_id       TEXT PRIMARY KEY,
  inserted_at    TEXT NOT NULL,         -- ISO-8601 UTC
  actor_user_id  TEXT,                  -- NULL for system-initiated; accounts.user_id when authenticated
  action         TEXT NOT NULL,         -- domain verb: PROGRAM_CREATE, PROGRAM_UPDATE, DEPARTMENT_CREATE,
                                        --   MODULE_ENABLE, MODULE_DISABLE, EVENT_CREATE, EVENT_CANCEL,
                                        --   ENROLLMENT_REQUEST, ENROLLMENT_APPROVE, ENROLLMENT_REJECT,
                                        --   ENROLLMENT_ASSISTED_ADD, ENROLLMENT_CANCEL,
                                        --   LEADER_GRANT, LEADER_REVOKE, ATTENDANCE_CHECKIN,
                                        --   ATTENDANCE_VOID, ROLE_POLICY_CHANGE, ...
  entity_type    TEXT NOT NULL,         -- department | program | event | enrollment_request | enrollment |
                                        --   program_leader | attendance | role_capability | ...
  entity_id      TEXT NOT NULL,         -- the target row's PK (not FK-enforced — polymorphic by design)
  old_value_json TEXT,                  -- snapshot of prior state (nullable on create)
  new_value_json TEXT,                  -- snapshot of resulting state
  reason         TEXT,
  outcome        TEXT NOT NULL           -- SUCCESS | DUPLICATE | CONFLICT | DENIED | FAILED
                 CHECK (outcome IN ('SUCCESS','DUPLICATE','CONFLICT','DENIED','FAILED')),
  correlation_id TEXT                   -- the requestId, joining audit to RPC diagnostics
) STRICT;

CREATE INDEX audit_events_entity_idx  ON audit_events(entity_type, entity_id);
CREATE INDEX audit_events_actor_idx   ON audit_events(actor_user_id);
CREATE INDEX audit_events_corr_idx    ON audit_events(correlation_id);

-- Audit rows are immutable.
CREATE TRIGGER audit_events_no_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events is immutable');
END;

CREATE TRIGGER audit_events_no_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events is immutable');
END;
```

`outcome` vocabulary (§2.5): `SUCCESS` (write happened), `DUPLICATE` (same actor's no-op repeat), `CONFLICT` (different actor got there first), `DENIED` (authorized-session caller failed a business-scope check), `FAILED` (system failure). `correlation_id` = the requestId for a free join to diagnostics. No password, hash, token, or credential material ever enters `old_value_json`/`new_value_json`.

---

## 10. Migrations

### 10.1 `Teacher→Staff` role migration

Handled in the **current PR stack** (not this spec's migration). Before applying `0001_*.sql`, rebase onto the last PR (`ui-04-196`) so the `role` CHECK constraint emits against `Staff`-normalized values.

### 10.2 `0001_*.sql` (PRG-01)

Contains the new tables from §4–§9 plus backfilled CHECK constraints on the existing identity tables (`account_status`, `role`, `credential_kind`). The `audit_events` immutability triggers ship here.

### 10.3 Identity-table timestamp conversion (separate)

Converting `0000_init.sql` epoch-millis columns to ISO-8601 UTC TEXT is its own table-rebuild migration (SQLite `ALTER TABLE` cannot retype a column in place). It is **not** part of PRG-01. Until it lands, code must handle both formats.

### 10.4 Development database

Same D1 database for development as for production unless a concrete split need appears. The new domain starts fresh from the latest `main` branch database — no xlsx import, no legacy Sheet adapter, no dual-write path.

---

## 11. Index & query requirements (hot paths only)

| View | Index |
|---|---|
| Approval queue (a Department/Program's pending requests) | `enrollment_requests(program_id, status)` |
| Program catalogue under a Department | `programs(department_id)` |
| A member's enrollments | `enrollments(member_user_id)` |
| Attendance check-in by event | `attendances(event_id)` + partial-active |
| Event generation idempotency | `events(program_id, starts_at)` unique |
| Leader grants for a program | `program_leaders(program_id, user_id)` |
| Audit lookup by entity or actor | `audit_events(entity_type, entity_id)`, `audit_events(actor_user_id)` |

Cold-history queries are deferred to #206; do not pre-optimize them.

---

## 12. Rejected shortcuts (documented)

- **JSON column for module config** — rejected for a normalized junction table (§5.2); #190 forbids unbounded JSON for authoritative relationships.
- **JSON column for schedule rules** — rejected for normalized rules + exceptions (§6).
- **Per-entity audit columns** (`Target_Program_ID`, `Target_Event_ID`, …) — rejected for the generic `audit_events` (§9); column growth forks the table.
- **Separate archive tables** — deferred to #206; soft-delete lifecycle is the baseline (§2.3).
- **Separate `delegation_grants` table** — rejected; grant/revoke history lives in `audit_events`, the assignment table holds current state (§8.3).
- **FK from attendance to enrollment** — rejected; attendance is an event-level fact with a server-side scope check (§8.4).
- **Integer autoincrement PKs** — rejected for TEXT UUID PKs, consistent with live identity tables (§2.1).
- **Unique-active-request constraint** — rejected; sequential re-requests after denial are legitimate (§8.1).

---

## 13. Lifecycle / ownership / deletion policy summary

| Table | Lifecycle | Ownership | Deletion |
|---|---|---|---|
| `departments` | `Draft`→`PendingDevelopment`→`Active`→`Archived` | Department manager within scope | Soft (Archived) |
| `programs` | `Draft`→`Active`→`Archived` | Department/Program manager | Soft (Archived) |
| `events` | `Active`→`Cancelled` | Program Leader | Soft (Cancelled) |
| `enrollment_requests` | `Pending`→`Approved/Rejected/Withdrawn` | Member submits; manager/approver decides | Never (history) |
| `enrollments` | `Active`→`Cancelled` | Member / authorized manager | Soft (Cancelled); never delete |
| `program_leaders` | active `(revoked_at IS NULL)` | capability-gated grant | Soft (revoke) |
| `attendances` | `Active`→`Voided` | scanner / authorized correction | Never (history) |
| `audit_events` | append-only | system | Never (immutable trigger) |