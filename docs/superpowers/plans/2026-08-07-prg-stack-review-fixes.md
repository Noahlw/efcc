# PRG Stack Review Fixes Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the substantive Standards/Spec findings from the two-axis review of the PRG-01..05 stack (#207-#211): strict department create validation, program-scoped member search, DUPLICATE audits for repeat mutations, audit rows inside the approval transaction, the program-create strictness ruling, and code hygiene (dead code, renames, idempotency correlation).

**Architecture:** All fixes land on `prg-05-201` (top of the stack) as one commit per task. Behavioral fixes are server-side only: `web/lib/programs/program-handlers.ts` (HTTP boundary), `web/lib/programs/department-workspace.ts` (domain workflow + audit orchestration), `web/lib/programs/d1-workspace-store.ts` + `web/lib/programs/workspace-store.ts` (D1 persistence, interface + impl in lockstep). Every task is TDD: failing test first, then implementation, then gate.

**Tech Stack:** TypeScript, Cloudflare Workers (workerd) via vitest pool-workers, D1 (SQLite) via `@cloudflare/vitest-pool-workers`, vitest.

## Global Constraints

- Branch: `prg-05-201` only. Do NOT touch `main`, `ui-*` branches, or `feat/nav-ui-foundation`. Do NOT push without an explicit ask.
- Commit protocol: one commit per task, `--no-verify` (pre-existing ultracite debt outside scope), message style `fix(programs): ...` matching repo log.
- Gates (run after every task, full sweep at the end):
  - `pnpm typecheck` (root incl. e2e tsconfig) — expected: "TypeScript: No errors found"
  - `pnpm test` — expected: 278 passed
  - `pnpm --dir web typecheck` — expected: clean
  - `pnpm --dir web test` — expected: all pass (count grows with new tests)
  - `pnpm --dir web test:components` — expected: all pass (unchanged by these tasks)
  - `pnpm test:shell-responsive` — expected: 38 passed, 1 skipped
- Sheet-Immutable (AGENTS.md): no Google Sheet writes anywhere. The D1 `accounts` table is read-only in tests via the seeded fixtures; never modify fixture rows.
- ADR vocabulary is binding (ADR-0023 §3, ADR-0027): `SUCCESS` / `DUPLICATE` (same-actor repeat reaching terminal state, quiet no-op, audit row written) / `CONFLICT` (different actor first) / `DENIED` (never-true precondition) / `FAILED` (system failure).
- The fix-plan grilling rulings stand: `LeaderAccountInactiveError` keeps outcome `FAILED` and 422 (fix-plan §8 Q2); do not re-litigate.

## File Structure & Changes

| File | Responsibility in this plan |
|---|---|
| `web/lib/programs/program-handlers.ts` | HTTP boundary: strict department create (Task 1), program-scoped member-options call (Task 2), create-field defaults (Task 5), `requestId2` rename (Task 6), Idempotency-Key correlation (Task 7) |
| `web/lib/programs/department-workspace.ts` | Domain workflow: repeat-mutation DUPLICATE paths (Task 3), audit placement + race audit (Task 4), dead command params (Task 6) |
| `web/lib/programs/d1-workspace-store.ts` | D1 impl: `cancelEvent` Active guard (Task 3), audit-in-batch + `findActiveEnrollment` (Task 4), program-scoped search (Task 2) |
| `web/lib/programs/workspace-store.ts` | Store interface: signatures changed in Tasks 2, 3, 4, 6 — always in lockstep with the D1 impl |
| `web/lib/programs/capabilities.ts` | Delete `DEFAULT_ROLE_POLICIES` (Task 6) |
| `web/lib/programs/programs.test.ts` | All new/updated worker-suite tests |

## What Already Exists

- **DUPLICATE audit precedent**: `DLG-4b revoke-on-revoked is a quiet 200 with a DUPLICATE audit row` (programs.test.ts ~2720) — the exact pattern Tasks 3/4 extend to decide/withdraw/cancel. Model new tests on it (SQL query against `audit_events` via the same test DB helpers).
- **Audit plumbing**: `DepartmentWorkspace.audit()` (department-workspace.ts ~255) builds and writes an audit row; store method `audit(input: AuditInput)` (d1-workspace-store.ts ~939) inserts into `audit_events`. `AuditInput` is the existing row type.
- **Atomic approve**: `approveEnrollmentRequest` (d1-workspace-store.ts ~704) already runs `db.batch` with SELECT-guarded enrollment INSERT + status-flip UPDATE.
- **Strict create infra**: `parseProgramFields(body, required)` + `PROGRAM_FIELD_PARSERS` + `isDepartmentLifecycle` (program-handlers.ts).
- **member-options endpoint**: `handleSearchMemberOptions` + test at programs.test.ts ~639 (currently calls `new D1WorkspaceStore(env.DB).searchActiveMembers(query, 20)` directly — bypassing the workspace facade).
- **Correlation helper**: `assertCorrelated(res)` in programs.test.ts asserts the response `requestId` matches the audit `correlation_id` (used by every existing test — Tasks 4/7 must keep it green for headerless requests).

## Not In Scope

- `horizon_days` generate knob — benign, tested, shipped API surface; review called it scope creep but removing churns handler+client+test for no gain.
- `WorkspaceStore` 40-method one-implementation interface consolidation — judgement-call smell; a large refactor with no behavior change.
- Pass-through read seams (`getScheduleRule`/`getEvent`/`getEnrollment*` ignoring `_ctx`) — handlers gate at the boundary; inert, no leak.
- Repeated `instanceof ...Error → 403` catch ladders — existing handler convention.
- `LeaderAccountInactiveError` outcome FAILED vs DENIED — deliberate grilling Q2 ruling (fix-plan §8), flagged by review as judgement call only.
- `assistedEnroll` duplicate audits `CONFLICT` — ADR-0023's different-actor reading applies (manager enrolling an already-enrolled member); not flagged by review.
- Prototype demo gallery (`noah/6883` in `web/app/prototype/page.tsx`) — dev-only, fix-plan out-of-scope list.
- Any UI/components changes — these tasks are server-side only.

## ASCII Diagrams

Repeat-mutation state flow (Tasks 3/4):

```
decideEnrollmentRequest(Approved)
  └─ store.approveEnrollmentRequest  ──► batch commits [INSERT enrollment, UPDATE request, INSERT auditCreate, INSERT auditDecide]
  │     │ row == null (request not Pending) ──► audit DECIDE DUPLICATE → return current row (200)
  │     └─ unique-index race (rollback, member has Active enrollment)
  │           └─ findActiveEnrollment → audit DECIDE CONFLICT|DUPLICATE (by created_by) → throw 409
  └─ store.decideRequest(Rejected)  ──► batch [UPDATE request, INSERT DECIDE audit]
        │ row == null ──► audit DECIDE DUPLICATE → return current row (200)

withdrawEnrollmentRequest / cancelEvent / cancelEnrollment
  └─ store returns null ──► audit WITHDRAW|EVENT_CANCEL|ENROLLMENT_CANCEL DUPLICATE → return current row (200)
```

Test-data flow (Task 4 race test): seed Active enrollment (created_by = other) + Pending request for same (member, program) → approve → batch INSERT violates unique index → rollback → catch → CONFLICT audit row → 409 response.

## Failure Modes & Gaps

- **Race audit actor classification** uses the existing enrollment's `created_by` vs the acting user (ADR-0023's actor-comparison mechanism). If the enrollment was created by the member themselves via a prior request approval, a later same-admin approve reads `created_by` = other → CONFLICT. Acceptable: the request is genuinely undecidable by anyone but that actor; CONFLICT is the honest story.
- **Repeat-decide returns the current request row** (HTTP 200, body = row). The client treats a 200 + row as success — quiet no-op per ADR-0027. Verify the panels don't mis-render a 200-on-repeat (they only re-fetch state; no change needed).
- **Member-options scoping** excludes active accounts with NO relationship (enrollment/request/leadership) to the program from the picker pool. Intentional per "Program-scoped"; if a future picker needs department-wide candidates, revisit with an account→department model.
- **Task 5 rulings a spec-vs-spec conflict**: the fix plan (§Domain) says `discoverability`/`enrollment_mode`/`display_order` may default; the tickets (P2) listed them required. This plan follows the fix plan (later, grilling-accepted). If the operator rules the other way, revert only Task 5.
- **`assertCorrelated` interaction (Task 7)**: tests without the Idempotency-Key header must keep `correlation_id == response requestId` (fallback keeps this). Only the new header test asserts the header value.

## Parallelization / Worktree Strategy

Strictly sequential, one worktree, one commit per task — the repo runs one engineer at a time (fix-plan Q4). Tasks 1→2→3→4→5→6→7 have no parallelizable dependencies; each leaves the suite green.

---

### Task 1: Department create — strict lifecycle and display_order validation

**Files:**
- Modify: `web/lib/programs/program-handlers.ts` — `handleCreateDepartment`, the `lifecycle`/`display_order` construction ~line 300
- Test: `web/lib/programs/programs.test.ts`

**Interfaces:**
- Consumes: `isDepartmentLifecycle(value)` (exists, same file); `problem(422, "VALIDATION", "Validation failed", detail, requestId)` helper (exists)
- Produces: unchanged signatures; new 422 behavior only

- [x] **Step 1: Write the failing tests**

Test intent: department create must reject invalid/missing `lifecycle` and non-numeric `display_order` with 422 instead of silently defaulting.
Framework: vitest, worker suite. File: `web/lib/programs/programs.test.ts`, inside the PRG-01 department describe block (next to the existing department create tests — find `createDepartment` tests, e.g. the one at ~line 300 using `accessCookieFor("alice", "alice-secret")` + `createDepartment`).
Add one test `test("department create rejects invalid or missing lifecycle and bad display_order", ...)` with three `worker.fetch` POSTs to `/api/v1/programs/departments` (same shape as the existing department-create request, `adminAccess` cookie):
1. body `{ code: "STRICT-DEPT-1", name: "Strict Dept", lifecycle: "Published" }` → expect `res.status === 422`
2. body `{ code: "STRICT-DEPT-2", name: "Strict Dept", lifecycle: undefined }` (omit lifecycle entirely) → expect `res.status === 422`
3. body `{ code: "STRICT-DEPT-3", name: "Strict Dept", lifecycle: "Active", display_order: "1" }` → expect `res.status === 422`
Also assert a valid create (lifecycle `"Active"`, display_order `3`) still returns 201 in the same test.

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --dir web test` (optionally `-t "department create rejects invalid"`).
Expected: the new test FAILS — the first two requests return 201 today (silent default), case 3 returns 201 too.

- [x] **Step 3: Implement the strict validation**

Location: `web/lib/programs/program-handlers.ts`, inside `handleCreateDepartment` (after the existing `code`/`name` required check, before `workspace.createDepartment`):
- If `body.lifecycle === undefined` OR `typeof body.lifecycle !== "string"` OR `!isDepartmentLifecycle(body.lifecycle)` → return `problem(422, "VALIDATION", "Validation failed", "lifecycle must be Draft, PendingDevelopment, Active, or Archived.", requestId)`.
- If `body.display_order !== undefined && typeof body.display_order !== "number"` → return `problem(422, "VALIDATION", "Validation failed", "display_order must be a number.", requestId)`.
- Then build the command with `lifecycle: body.lifecycle` (typed `as DepartmentLifecycle` — match how `createProgram` casts; check the existing `isDepartmentLifecycle` import/usage) and keep `display_order` as-is (number).
Do NOT change `code`/`name` handling or any other field.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --dir web test`.
Expected: new test PASSES; all other tests still pass (no behavior change for valid inputs).

- [x] **Step 5: Gate + commit**

Run: `pnpm --dir web typecheck` — expected clean. Stage: `web/lib/programs/program-handlers.ts` and `web/lib/programs/programs.test.ts`.
Commit message: `fix(programs): department create rejects invalid lifecycle/display_order (422)`.

### Task 2: Program-scoped member search

**Files:**
- Modify: `web/lib/programs/workspace-store.ts` (interface), `web/lib/programs/d1-workspace-store.ts` (impl), `web/lib/programs/department-workspace.ts` (pass-through), `web/lib/programs/program-handlers.ts` (handler), `web/lib/programs/programs.test.ts`
- Test: `web/lib/programs/programs.test.ts`

**Interfaces:**
- Consumes: `MemberOptionRow` (`{ user_id: string; name: string; username: string }`, exists)
- Produces: `WorkspaceStore.searchActiveMembers(programId: string, query: string, limit: number): Promise<MemberOptionRow[]>` — scoped to accounts with any row in `enrollments`, `enrollment_requests`, or `program_leaders` for that program, `account_status = 'Active'` only

- [x] **Step 1: Check the interface, then write the failing test**

First check whether `WorkspaceStore` already declares `searchActiveMembers` (grep `workspace-store.ts`). If it does, skip the interface change in Step 3.
Test intent: member search returns only active accounts with a relationship to the program.
Framework: vitest, worker suite. In `programs.test.ts`, extend the existing `member-options` test (~line 630). Current test: creates program (ManagerOnly), searches `q=Alice`, asserts only `{user_id: "U001", name: "Alice Chan", username: "alice"}`.
Change the test to first give Alice a relationship to the program: call `workspace`-level leader grant — use the API: `POST /api/v1/programs/:id/leaders` with `{ user_id: "U001" }` (find the leader-grant request shape in an existing DLG test, e.g. the grant call in the DLG-4 area, with `adminAccess`). Then:
1. `q=Alice` → 200, members deep-equals `[{ user_id: "U001", name: "Alice Chan", username: "alice" }]` (unchanged assertion — proves she still appears).
2. `q=Bob` → 200, members deep-equals `[]` (Bob U002 has no relationship to this program — proves program scoping).

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --dir web test -t "member-options"`.
Expected: assertion 2 FAILS — today Bob appears (unscoped search).

- [x] **Step 3: Implement the scoping**

- `d1-workspace-store.ts`: change `searchActiveMembers(query, limit)` → `searchActiveMembers(programId: string, query: string, limit: number)` and add to the SQL `WHERE` clause, after `account_status = 'Active'`:
  `AND (EXISTS (SELECT 1 FROM enrollments e WHERE e.program_id = ? AND e.member_user_id = accounts.user_id) OR EXISTS (SELECT 1 FROM enrollment_requests r WHERE r.program_id = ? AND r.member_user_id = accounts.user_id) OR EXISTS (SELECT 1 FROM program_leaders pl WHERE pl.program_id = ? AND pl.user_id = accounts.user_id))`
  Bind order: `pattern, pattern, programId, programId, programId, limit`.
- `workspace-store.ts`: add `searchActiveMembers(programId: string, query: string, limit: number): Promise<MemberOptionRow[]>;` to the interface (if absent).
- `department-workspace.ts`: add the pass-through delegating to `this.store.searchActiveMembers(programId, query, limit)`.
- `program-handlers.ts` `handleSearchMemberOptions`: replace `new D1WorkspaceStore(env.DB).searchActiveMembers(query, 20)` with `workspace.searchActiveMembers(programId, query, 20)` (remove the now-unused `D1WorkspaceStore` import if nothing else uses it — check).

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --dir web test -t "member-options"` then full `pnpm --dir web test`.
Expected: both assertions PASS; full suite green.

- [x] **Step 5: Gate + commit**

Run: `pnpm --dir web typecheck` — expected clean. Stage the four source files + test.
Commit message: `fix(programs): scope active-member search to the program (ADR-0027)`.

### Task 3: Repeat mutations audit DUPLICATE — decide, withdraw, cancel event, cancel enrollment

**Files:**
- Modify: `web/lib/programs/department-workspace.ts`, `web/lib/programs/d1-workspace-store.ts`, `web/lib/programs/programs.test.ts`
- Test: `web/lib/programs/programs.test.ts`

**Interfaces:**
- Consumes: `RequestNotDecidableError` (exists, department-workspace.ts ~205); `audit(ctx, action, entityType, entityId, outcome, oldValue, newValue, correlationId)` (exists)
- Produces: repeat `decideEnrollmentRequest` / `withdrawEnrollmentRequest` / `cancelEvent` / `cancelEnrollment` calls return the current row (HTTP 200) and write a `DUPLICATE` audit row

- [x] **Step 1: Write the failing tests**

Model on `DLG-4b` (programs.test.ts ~2720) — same audit-row SQL assertion pattern (`SELECT ... FROM audit_events WHERE action = ... AND outcome = 'DUPLICATE'`).
Add four tests (place near the existing enrollment/event tests; use existing helpers `accessCookieFor`, `createDepartment`, `createProgram`; copy the request shapes from the nearest existing REQ/EVT tests — the endpoints are `POST /api/v1/programs/:id/requests` (member submit), `POST /api/v1/programs/:id/requests/:requestId/decide` (admin approve/reject), `POST /api/v1/programs/:id/requests/:requestId/withdraw` (member), `POST /api/v1/programs/:id/events` (create event), `POST /api/v1/programs/:id/events/:eventId/cancel` (cancel event), `POST /api/v1/programs/:id/enrollments/:enrollmentId/cancel` (cancel enrollment); confirm exact paths from the nearest existing test):
1. `test("REQ-x decide-on-decided is a quiet 200 with a DUPLICATE audit row", ...)`: admin creates dept+program (MemberRequest), member submits request, admin approves (200), then admin approves the SAME request again → expect second response `status === 200` AND an `audit_events` row with `action = 'ENROLLMENT_REQUEST_DECIDE' AND outcome = 'DUPLICATE'` exists.
2. `test("REQ-x withdraw-on-withdrawn is a quiet 200 with a DUPLICATE audit row", ...)`: same setup; member withdraws (200), withdraws again → 200 + `ENROLLMENT_REQUEST_WITHDRAW`/`DUPLICATE` row exists.
3. `test("EVT-x cancel-on-cancelled is a quiet 200 with a DUPLICATE audit row", ...)`: admin creates dept+program, staff creates an event (must be `Active`), cancels with a reason (200), cancels again → 200 + `EVENT_CANCEL`/`DUPLICATE` row exists AND the event's stored `status` is still `'Cancelled'` and `cancel_reason` unchanged (assert via the GET program events response).
4. `test("REQ-x cancel-on-cancelled enrollment is a quiet 200 with a DUPLICATE audit row", ...)`: member requests, admin approves (enrollment Active), member (or admin) cancels the enrollment (200), cancels the same enrollment again → 200 + `ENROLLMENT_CANCEL`/`DUPLICATE` row exists AND the enrollment's `status` is still `'Cancelled'`.

- [x] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir web test -t "DUPLICATE"` (plus the four new names).
Expected: all four FAIL — today the repeat calls return 409 (decide/withdraw/cancel-enrollment) or re-write + 200 with SUCCESS audit (cancel-event).

- [x] **Step 3: Implement the DUPLICATE paths**

`d1-workspace-store.ts` `cancelEvent`: add `AND status = 'Active'` to the UPDATE's WHERE clause (bind order unchanged: `reason, updatedBy, updatedAt, id`). `cancelEnrollment` already has its `AND status = 'Active'` guard — no store change needed there.
`department-workspace.ts`:
- `decideEnrollmentRequest` (~1216): when `decided === null` — instead of throwing `RequestNotDecidableError` — call `this.audit(ctx, "ENROLLMENT_REQUEST_DECIDE", "enrollment_request", requestId, "DUPLICATE", null, { ...request, reason: "already_decided" }, correlationId)` and `return request;` (the row fetched at line 1173).
- `withdrawEnrollmentRequest` (~1266): when `withdrawn === null` — audit `"ENROLLMENT_REQUEST_WITHDRAW"` with outcome `"DUPLICATE"`, newValue `{ ...request, reason: "already_withdrawn" }`, and `return request;` (the row fetched at line 1259).
- `cancelEvent` (~1022): when `updated === null` — audit `"EVENT_CANCEL"` outcome `"DUPLICATE"`, newValue `{ ...event, reason: "already_cancelled" }`, and `return event;` (the row fetched at line 1006). Keep the `findEventById` null → `AuthorizationDeniedError` path unchanged (only the store-null case becomes DUPLICATE).
- `cancelEnrollment` (~1417): when `cancelled === null` — audit `"ENROLLMENT_CANCEL"` outcome `"DUPLICATE"`, newValue `{ ...enrollment, reason: "already_cancelled" }`, and `return enrollment;` (the row fetched at line ~1400). Keep the not-found/`AuthorizationDeniedError` paths unchanged.
After all four changes, if `RequestNotDecidableError` has no remaining throw sites, delete the class and its import; otherwise leave it (grep to confirm).

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir web test`.
Expected: the three new tests PASS; the full suite stays green (no existing test asserted the 409s — verify by the run).

- [x] **Step 5: Gate + commit**

Run: `pnpm --dir web typecheck` — clean. Stage changed files.
Commit message: `fix(programs): repeat decide/withdraw/cancel audit DUPLICATE (ADR-0027)`.

### Task 4: Approval audits inside the transaction + race audits

**Files:**
- Modify: `web/lib/programs/workspace-store.ts`, `web/lib/programs/d1-workspace-store.ts`, `web/lib/programs/department-workspace.ts`, `web/lib/programs/programs.test.ts`
- Test: `web/lib/programs/programs.test.ts`

**Interfaces:**
- Consumes: `AuditInput` (store row type, exists); `DuplicateEnrollmentError` (exists); `approveEnrollmentRequest(input)` (exists, input currently `{ request_id, program_id, member_user_id, enrollment_id, decided_by, decided_at, note }`)
- Produces:
  - `approveEnrollmentRequest` input gains `auditCreate: AuditInput` and `auditDecide: AuditInput` — the batch becomes `[enrollment INSERT..SELECT, status UPDATE, INSERT auditCreate, INSERT auditDecide]`
  - `decideRequest(id, decision, decidedBy, decidedAt, note)` gains a 6th param `audit: AuditInput` — D1 impl batches `[UPDATE, INSERT audit]`
  - `findActiveEnrollment(programId: string, memberUserId: string): Promise<EnrollmentRow | null>` (new store method)

- [x] **Step 1: Write the failing tests**

Two tests (place near REQ-3/REQ-7 which cover approval atomicity — find the request/approve API shapes there):
1. `test("REQ-x approval race loser audits CONFLICT with the existing enrollment", ...)`: deterministic race — seed an Active enrollment for `(program, U001)` created by a DIFFERENT user, plus a Pending request for the same pair, then approve: 
   - Setup via API where possible: have member U001 request enrollment in program P (MemberRequest mode) → admin approves → an Active enrollment + Approved request exist. Then have the SAME member submit a second request? Blocked by `findPendingRequestByMember`… Instead: seed via a second program path — simplest is direct SQL through the test DB helpers used by other tests (find how existing tests write raw rows, e.g. the `audit` assertions use `testDb()`; use `testDb().prepare("INSERT INTO enrollments ...")` to seed an enrollment for `(programB, U001)` with `created_by = 'U002'`, then use the API to create a Pending request for `(programB, U001)` — the request-submit API only blocks when an ACTIVE enrollment exists for that member+program, so seed the enrollment AFTER the request is created, or seed with the request via direct SQL. Concretely: (a) member submits request via API (no enrollment yet); (b) direct SQL insert the Active enrollment with `created_by = 'U002'`, `status = 'Active'`; (c) admin approves the request → expect HTTP 409 `DuplicateEnrollmentError`; (d) assert an `audit_events` row `action = 'ENROLLMENT_REQUEST_DECIDE' AND outcome = 'CONFLICT'` exists.
2. `test("REQ-x approval success writes DECIDE+CREATE audits in the commit", ...)`: member submits, admin approves → 200; assert BOTH `ENROLLMENT_CREATE`/`SUCCESS` and `ENROLLMENT_REQUEST_DECIDE`/`SUCCESS` rows exist (this likely duplicates existing REQ-7 assertions — check first; if REQ-7 already asserts both rows, this test's value is the race case only and it may be skipped).

- [x] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir web test -t "approval race"`.
Expected: test 1 FAILS — today the race catch throws 409 with NO audit row.

- [x] **Step 3: Implement transaction placement + race audit**

`d1-workspace-store.ts`:
- Extract a private helper `auditInsertStatement(input: AuditInput)` returning `this.db.prepare(<the existing audit_events INSERT SQL with input binds>)` — refactor `audit()` to use it.
- `approveEnrollmentRequest`: extend the input type (interface in `workspace-store.ts`) with `auditCreate: AuditInput` and `auditDecide: AuditInput`; append `this.auditInsertStatement(input.auditCreate)` and `this.auditInsertStatement(input.auditDecide)` to the `db.batch` array (order: enrollment INSERT, status UPDATE, auditCreate, auditDecide).
- `decideRequest`: add 6th param `audit: AuditInput`; change the impl to `db.batch([UPDATE ... WHERE status='Pending', this.auditInsertStatement(audit)])` returning the updated row or null (keep the existing WHERE-guard semantics).
- Add `findActiveEnrollment(programId, memberUserId)` returning the full row via `SELECT * FROM enrollments WHERE program_id = ? AND member_user_id = ? AND status = 'Active'` (mirror `hasActiveEnrollment`'s query).
`workspace-store.ts`: update the interface — `approveEnrollmentRequest` input type, `decideRequest` signature, add `findActiveEnrollment`.
`department-workspace.ts`:
- Extract the row-building from `audit()` into `private buildAuditRow(ctx, action, entityType, entityId, outcome, oldValue, newValue, correlationId): AuditInput`; `audit()` becomes `this.store.audit(this.buildAuditRow(...))`.
- Approve path: the workspace already knows every value the audit rows need BEFORE the store call — `request` (fetched at 1173), `now`, `ctx.actorUserId`, `cmd.note`, and `enrollment_id` (it generates `crypto.randomUUID()` in the input). Build both `AuditInput` rows before the call and pass them in the `approveEnrollmentRequest` input:
  - `auditCreate` = buildAuditRow(ctx, "ENROLLMENT_CREATE", "enrollment", enrollmentId, "SUCCESS", null, `{ enrollment_id, program_id: request.program_id, member_user_id: request.member_user_id, request_id: requestId, status: "Active" }`, correlationId)
  - `auditDecide` = buildAuditRow(ctx, "ENROLLMENT_REQUEST_DECIDE", "enrollment_request", requestId, "SUCCESS", `{ status: "Pending" }`, `{ ...request, status: "Approved", decided_by: ctx.actorUserId, decided_at: now, note: cmd.note, enrollment_id: enrollmentId }`, correlationId)
  Then DELETE the two post-batch `this.audit(...)` blocks (the ENROLLMENT_CREATE and ENROLLMENT_REQUEST_DECIDE calls after the store call).
- Reject path: build `auditDecide` = buildAuditRow(ctx, "ENROLLMENT_REQUEST_DECIDE", "enrollment_request", requestId, "SUCCESS", `{ status: "Pending" }`, `{ ...request, status: "Rejected", decided_by: ctx.actorUserId, decided_at: now, note: cmd.note }`, correlationId) and pass it as the new 6th argument to `decideRequest`. After both paths carry their audits in-batch, DELETE the shared post-if/else DECIDE audit block (lines ~1235-1240). The DUPLICATE-on-null returns from Task 3 exit before that block and keep their own plain `audit()` calls (no-op paths write no mutation, so no transaction is needed).
- Race catch: replace the `hasActiveEnrollment` boolean check with: `const existing = await this.store.findActiveEnrollment(programId, request.member_user_id); if (existing) { const outcome = existing.created_by === ctx.actorUserId ? "DUPLICATE" : "CONFLICT"; await this.audit(ctx, "ENROLLMENT_REQUEST_DECIDE", "enrollment_request", requestId, outcome, null, { status: "Pending", enrollment_id: existing.enrollment_id, reason: "active_enrollment_exists" }, correlationId); throw new DuplicateEnrollmentError(programId, request.member_user_id); } throw error;`

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir web test`.
Expected: race test PASSES (409 + CONFLICT audit row); all existing approval tests (REQ-3/REQ-7 etc.) still PASS — if REQ-3/REQ-7 assert exactly-one-DECIDE-audit or no-orphan, they must remain green; fix the new AuditInput construction until they are.

- [x] **Step 5: Gate + commit**

Run: `pnpm --dir web typecheck` — clean. Stage the four files + tests.
Commit message: `fix(programs): approval audits commit in-transaction; race loser audits CONFLICT`.

### Task 5: Program create — default discoverability/enrollment_mode/display_order (fix-plan ruling)

**Files:**
- Modify: `web/lib/programs/program-handlers.ts` (create call site ~470), `web/lib/programs/programs.test.ts`
- Test: `web/lib/programs/programs.test.ts`

**Interfaces:**
- Consumes: `parseProgramFields(body, required)` (exists); `PROGRAM_FIELD_PARSERS` (exists)
- Produces: `handleCreateProgram` accepts create bodies missing `discoverability`/`enrollment_mode`/`display_order`, defaulting to `"Listed"`/`"MemberRequest"`/`0`; present-but-invalid values still 422

- [x] **Step 1: Verify no existing test asserts 422 for omitted optionals, then write the failing test**

Grep `programs.test.ts` for create bodies missing `discoverability` or `enrollment_mode` — confirm every 422-create test omits at least one REQUIRED field (name/behavior_type/lifecycle). If any asserts 422 for missing-only-optional, that test must be updated in Step 4.
Test intent: create with only the three required fields succeeds with documented defaults.
Add `test("program create defaults discoverability/enrollment_mode/display_order", ...)`: admin creates dept; POST `/api/v1/programs/departments/:id/programs` with body `{ name: "Defaulted Program", behavior_type: "Recurring", lifecycle: "Draft" }` → expect 201, and the response `program.discoverability === "Listed"`, `program.enrollment_mode === "MemberRequest"`, `program.display_order === 0`. Also keep one invalid-enum check in the same test: body with `discoverability: "Public"` → 422.

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --dir web test -t "defaults discoverability"`.
Expected: FAILS with 422 (today the three fields are required).

- [x] **Step 3: Implement the defaults**

`program-handlers.ts` `handleCreateProgram`:
- Change the `parseProgramFields(body, [...])` required list from `["name", "behavior_type", "lifecycle", "discoverability", "enrollment_mode"]` to `["name", "behavior_type", "lifecycle"]`.
- After the parse, when building the `createProgram` input, replace `fields.discoverability as ...` with `(fields.discoverability ?? "Listed") as "Listed" | "Unlisted"`, `fields.enrollment_mode ?? "MemberRequest"` cast similarly, `fields.display_order` stays `typeof fields.display_order === "number" ? fields.display_order : 0`.
- Leave `handleUpdateProgram` (required list `[]`) untouched.

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir web test`.
Expected: new test PASSES; all existing strict-create 422 tests still PASS (they omit required fields); update any test found in Step 1 if it asserted 422 for omitted-only-optional (change it to expect 201 with defaults).

- [x] **Step 5: Gate + commit**

Run: `pnpm --dir web typecheck` — clean. Stage changed files.
Commit message: `fix(programs): program create defaults optional settings per fix-plan ruling`.

### Task 6: Cleanup — dead code, requestId2 rename, dead command params

**Files:**
- Modify: `web/lib/programs/capabilities.ts`, `web/lib/programs/program-handlers.ts`, `web/lib/programs/department-workspace.ts`, `web/lib/programs/workspace-store.ts`, possibly `web/lib/programs/programs.test.ts`
- Test: existing suite (regression only)

**Interfaces:**
- Produces: `DepartmentWorkspace.submitEnrollmentRequest(ctx, programId, correlationId)` (no command param); `AssistedEnrollCommand` = `{ memberUserId: string }` only; no `DEFAULT_ROLE_POLICIES` export; no `requestId2` identifiers

- [x] **Step 1: Confirm removals are safe (grep), then implement**

For each of the four removals, first grep for every reference outside the definition:
1. `DEFAULT_ROLE_POLICIES` — grep `web/` (exclude node_modules). If only the definition in `capabilities.ts` matches, delete the constant (its ~60-line block). If a test references it, remove the test reference too.
2. `requestId2` — `program-handlers.ts` (19 occurrences, all inside `handleSubmitEnrollmentRequest` ~line 1379). Rename every `requestId2` in that function to `correlationId` (the URL-param `requestId` stays).
3. `SubmitEnrollmentRequestCommand` — remove the interface from `department-workspace.ts`; remove the `_cmd: SubmitEnrollmentRequestCommand` parameter from `submitEnrollmentRequest` (both the `WorkspaceStore` interface in `workspace-store.ts` and the `DepartmentWorkspace` impl); update the handler call site (`workspace.submitEnrollmentRequest(ctxFrom(...), programId, cmd, requestId)` → drop `cmd`); check `programs.test.ts` for direct calls and update.
4. `AssistedEnrollCommand.programId` — remove the field from the interface; update the handler construction `{ programId, memberUserId }` → `{ memberUserId }` (~line 1501); grep tests for `{ programId, memberUserId }` constructions and update.
No behavior changes — these are mechanical removals.

- [x] **Step 2: Run the suite (regression gate)**

Run: `pnpm --dir web typecheck` then `pnpm --dir web test`.
Expected: clean typecheck; all tests pass (any test updated in Step 1 must still pass).

- [x] **Step 3: Commit**

Stage all changed files.
Commit message: `refactor(programs): drop dead role policies, dead command params, requestId2 rename`.

### Task 7: Idempotency-Key becomes the server correlation id

**Files:**
- Modify: `web/lib/programs/program-handlers.ts`, `web/lib/programs/programs.test.ts`
- Test: `web/lib/programs/programs.test.ts`

**Interfaces:**
- Consumes: the `Idempotency-Key` header the client already sends (`program-api.ts` `idempotencyHeaders`)
- Produces: every mutating handler derives `const correlationId = request.headers.get("Idempotency-Key") ?? requestId;` and passes `correlationId` (not `requestId`) as the correlationId argument into workspace calls

- [x] **Step 1: Enumerate the call sites, then write the failing test**

Grep `program-handlers.ts` for every handler that calls a mutating workspace method with `requestId` as the last argument (create/update department, create/update program, create/update/delete schedule rule, generateEvents, create/update/cancel event, submit/decide/withdraw enrollment request, assistedEnroll, grant/revoke leader, module enable/disable). List them in a comment in the test? No — list them in the plan as the change set.
Test intent: a mutating request carrying `Idempotency-Key` records that value as the audit `correlation_id`.
Add `test("mutations correlate audits to the client Idempotency-Key", ...)`: admin creates dept+program via the API with an extra header `"Idempotency-Key": "client-key-abc"` on the create-program request → 201; then assert via `testDb()` SQL: an `audit_events` row exists with `correlation_id = 'client-key-abc'` (use the `PROGRAM_CREATE` action — find the audit action name by checking what the create-program audit writes, e.g. grep `"PROGRAM_CREATE"` in department-workspace.ts).

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --dir web test -t "Idempotency-Key"`.
Expected: FAILS — today the correlation_id is the server-random requestId.

- [x] **Step 3: Implement the derivation**

In each mutating handler enumerated in Step 1, immediately after `const requestId = crypto.randomUUID();` add `const correlationId = request.headers.get("Idempotency-Key") ?? requestId;` and change the workspace call's final argument from `requestId` to `correlationId`. Leave all `problem(...)`/`jsonResponse(...)` calls using `requestId` unchanged (the response requestId stays server-generated; existing `assertCorrelated` tests send no header, so `correlationId === requestId` and stay green).
Read-only handlers (`handleList*`, `handleGet*`, `handleSearchMemberOptions`) are unchanged — they take no correlationId.

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir web test`.
Expected: new test PASSES; full suite green (headerless tests unaffected).

- [x] **Step 5: Gate + commit**

Run: `pnpm --dir web typecheck` — clean.
Commit message: `fix(programs): honor client Idempotency-Key as audit correlation id`.

---

## Final Gate

After Task 7, run the full sweep:
`pnpm typecheck && pnpm test && pnpm --dir web typecheck && pnpm --dir web test && pnpm --dir web test:components && pnpm test:shell-responsive`
All must pass 100%. Then report the commit list; do NOT push (no explicit ask).
