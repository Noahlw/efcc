# Implement PRG-01..05 Stack Fixes (D1 Programs)

Source spec: `docs/omp-plans/2026-08-07-prg-stack-audit-fix-plan.md` (grilling-locked decisions) + `docs/adr/0027-d1-programs-audit-outcomes-and-atomic-approval.md` (proposed). This plan only implements the locked scope; it does not re-negotiate it.

## 1. Ground state (verify before anything else)

Branch `prg-05-201`, HEAD `63f9ca4`. The working tree is dirty with already-done, uncommitted work that is part of the acceptance baseline — do not redo it, commit it first (Step 0):

- UI polish pass (`web/app/programs/**`, `web/lib/programs/member-picker.tsx`, `globals.css`, `programs.module.css`, `DESIGN.md`) — out of plan scope, must land as its own commit.
- `web/lib/programs/program-handlers.ts` — `PROGRAM_FIELD_PARSERS` + `parseProgramFields` strict create validation, `DuplicateProgramNameError`→409, `InvalidProgramLifecycleError`→422, `handleSearchMemberOptions` (`GET /programs/:id/member-options?q=`) — verify it typechecks, then commit.
- `tests/e2e/programs-d1.test.ts` — E2E-12 + duplicate-generate assertion; `.github/workflows/e2e.yml` — trace-appender step. Commit.
- `web/lib/programs/programs-events-panel.test.tsx` U4 still asserts `` `${COPY.programs.ruleWeekly} 3` `` but the panel now renders `每週 星期三` — update the expectation to `星期三`; this must be in the tree or the component gate fails.

Known gate facts:
- `pnpm --dir web typecheck` / `pnpm --dir web test` (223 pass) / `pnpm --dir web test:components` (133/134 — U4 red) / `pnpm test` (278 pass) are green modulo U4.
- Full-repo `ultracite check` fails on pre-existing violations outside scope (`web/lib/auth/accounts.test.ts`, `web/app/prototype/page.tsx`, `web/lib/registration-form.tsx`, ...). Convention: pre-commit hooks fail; commits use `--no-verify`; run ultracite only on changed files.
- Deployed `programs-d1` E2E needs operator provisioning (fresh target, `PROGRAMS_*` secrets) — pipeline team prepares it; final acceptance run is a follow-up, not a gate for this plan.

## 2. Teams and execution order

**Execution shape (grilled 2026-08-07): strictly serial, one engineer.** The "teams" below are logical commit slices, not concurrency units — the repo's one-worker-at-a-time convention and the shared review stack make parallelism a hazard with no gain. Lead executes slice by slice in order, committing after each.

```text
Step 0 (serial, lead): commit existing working-tree work (UI polish; strictness+member-options; E2E+appender; U4 fix)
        │
        ├── Slice 1 (lead): Domain + data plane   [blocked on Step 0]
        ├── Slice 2 (lead): input strictness tests + demo-creds removal
        ├── Slice 3 (lead): E2E + pipeline polish
        └── Final gate (lead): typecheck + all suites + ultracite on changed files
```

Slices 2 and 3 own disjoint files from Slice 1 and each other. Slice 1 is the only slice touching the WorkspaceStore seam, the domain, and the migration — do not split it.

## 3. Team 1 — Domain + data plane (serial, lead executes)

### 3.1 Atomic enrollment approval (approve-race, finding #199)

Current flow (`web/lib/programs/department-workspace.ts:1131-1210`): `store.decideRequest(...)` commits the decision, THEN `store.createEnrollment(...)`; on unique-constraint violation the request stays decided-Approved with no enrollment. Fix = one transaction.

1. `web/lib/programs/workspace-store.ts`: add to `WorkspaceStore`:
   ```ts
   approveEnrollmentRequest: (input: {
     request_id: string;
     program_id: string;
     member_user_id: string;
     enrollment_id: string;
     decided_by: string;
     decided_at: string;
     note: string | null;
   }) => Promise<EnrollmentRequestRow | null>;
   ```
   Contract: performs the decision-update AND the enrollment insert atomically; returns the decided request row; returns `null` when the request is not `Pending` (no partial work); rethrows on constraint violation.
2. `web/lib/programs/d1-workspace-store.ts`: implement with `db.batch([...])` — `UPDATE enrollment_requests SET status='Approved', decided_by=?, decided_at=?, decision_note=? WHERE request_id=? AND status='Pending'` + `INSERT INTO enrollments (...) VALUES (...)`. Keep the existing `decideRequest` for the Rejected path. On batch failure, do not swallow; the domain layer maps it (see 3.3).
3. `web/lib/programs/department-workspace.ts` `decideEnrollmentRequest`: Approved → `approveEnrollmentRequest` (wrap in the existing try/catch that maps constraint failures via `hasActiveEnrollment` → `DuplicateEnrollmentError`); Rejected → `decideRequest`. `ENROLLMENT_CREATE` + `ENROLLMENT_REQUEST_DECIDE` audits fire only after the store call returns (already the case — keep). No audit on the null/non-Pending path.
4. Tests (`web/lib/programs/programs.test.ts`, in-memory store): update the in-memory `WorkspaceStore` to implement `approveEnrollmentRequest` (decideRequest + createEnrollment). Add: approve of a member who already has an active enrollment → throws `DuplicateEnrollmentError` AND the request remains `Pending`; approve of a non-Pending request → `RequestNotDecidableError`; existing approve/reject tests keep passing.

### 3.2 Zero-rule generate → 422 + audit (finding G7)

`web/lib/programs/department-workspace.ts:827-830`: zero rules currently returns `{created:0, skipped:0, rule_count:0}` with no audit.

1. New domain error `NoScheduleRulesError(programId)` in the error block (near `ScheduleRuleNotApplicableError`, ~line 172).
2. In `generateEvents`, replace the early return: `await this.audit(ctx, "EVENT_GENERATE", "event", programId, "FAILED", null, { rule_count: 0 }, correlationId); throw new NoScheduleRulesError(programId);`
3. `web/lib/programs/program-handlers.ts` `handleGenerateEvents` (~line 1148): map `NoScheduleRulesError` → 422 (add to the existing `instanceof` chain).
4. Tests: zero-rule generate now rejects with `NoScheduleRulesError`; audit row written with outcome `FAILED`. (Keep the accepted-run behavior: one SUCCESS audit, `skipped>0` on idempotent duplicates — already implemented via `insertGeneratedEvent`.)

### 3.3 Leader assignment: active-only + revoke-revoked audit (findings #200, #198)

1. `web/lib/programs/workspace-store.ts`: add `isAccountActive: (userId: string) => Promise<boolean>;`
2. `web/lib/programs/d1-workspace-store.ts`: implement mirroring the status filter already used in `searchActiveMembers` (line ~256) against the `accounts` table (read the column name from migration 0003 `CREATE TABLE accounts`).
3. `web/lib/programs/department-workspace.ts` `assignProgramLeader` (1401-1447): before the duplicate check, `if (!(await this.store.isAccountActive(userId)))` → audit `PROGRAM_LEADER_GRANT` outcome `FAILED` with the reason, then throw new `LeaderAccountInactiveError(userId)`. New error class in the error block. Non-active = Pending/Suspended/whatever the accounts status column holds besides Active.
4. `revokeProgramLeader` (1464-1466): the already-revoked branch currently returns `existing` silently — add `await this.audit(ctx, "PROGRAM_LEADER_REVOKE", "program_leader", programId, "DUPLICATE", existing, existing, correlationId)` before returning.
5. `web/lib/programs/program-handlers.ts`: map `LeaderAccountInactiveError` → 422 in the leader-assign handler.
6. Tests: assign to inactive member → `LeaderAccountInactiveError`; revoke an already-revoked leader → returns row and writes a `DUPLICATE` audit row; existing leader tests keep passing (they use active members).

### 3.4 DUPLICATE remap for repeat enrollment requests (Q1 — grilled 2026-08-07)

ADR-0027 names repeat enrollment request as a same-actor DUPLICATE case. `submitEnrollmentRequest` (department-workspace.ts:1044-1071) has two repeat paths that currently audit `CONFLICT`:
- active-enrollment-exists (`reason: "active_enrollment_exists"`)
- pending-request-exists (`reason: "pending_request_exists"`)

Both are self-actor by construction (the actor is the member) → change outcome from `CONFLICT` to `DUPLICATE`. Leave `createEvent`'s `CONFLICT` (cross-actor by nature). **No full audit-on-throw sweep** — the 422-pair plus the ADR-named repeats is the locked scope. Update the corresponding assertions in `programs.test.ts`.

### 3.5 Migration: backfill + SQL-seeded policies (drop runtime seeding)

`web/migrations/0003_d1_program_domain.sql` is uncommitted and never deployed — amend it (do NOT create 0004).

1. Read `CREATE TABLE role_capabilities` (line ~119) and `CREATE TABLE department_modules` (line ~147) — note `enabled_at` is `NOT NULL` with no default.
2. Append seed statements:
   - `role_capabilities`: one INSERT per role×capability in `DEFAULT_ROLE_POLICIES` (`web/lib/programs/capabilities.ts:52-114` — read the whole constant first; Admin/Staff/Member, timestamp `2026-08-06T00:00:00Z`), as `INSERT INTO role_capabilities (...) SELECT ... WHERE NOT EXISTS (...)` for idempotency.
   - `department_modules`: backfill `INSERT INTO department_modules (department_id, module_key, enabled, enabled_by, enabled_at) SELECT d.department_id, m.module_key, 0, NULL, '...' FROM departments d CROSS JOIN (VALUES 'program_catalog','enrollment','events','attendance','custom_forms') AS m(module_key) WHERE NOT EXISTS (...)` — mirror `MODULE_KEYS` in `capabilities.ts:46`.
3. Strip runtime seeding so the migration is the single source:
   - Grep all callers of `seedRolePolicies` (store method at `d1-workspace-store.ts:67`; interface at `workspace-store.ts:314`). If the worker bootstrap calls it, remove the call; remove the method from `WorkspaceStore` and the D1 impl if now callerless.
   - `listDepartmentModules` (`d1-workspace-store.ts:355-366`): if it lazy-inserts missing module rows on read, strip that branch (migration now guarantees rows).
   - The in-memory test store seeds whatever its own setup needs — unchanged.

## 4. Slice 2 — Strictness tests + demo creds

### 4.1 parseProgramFields test coverage
The strict create/update validation already exists in the working tree (`program-handlers.ts`, around lines 439-540). Add missing unit coverage in `web/lib/programs/program-handlers.test.ts` (create the file if absent; follow `programs.test.ts` conventions):
- create with empty body → 422
- create missing `name` / `behavior_type` / `lifecycle` → 422 (per locked decision)
- create with an invalid enum value (e.g. `lifecycle: "Gone"`) → 422
- `display_order` non-safe-integer / negative → 422
- valid create still passes; PATCH with empty body → 422

### 4.2 Remove demo creds from `web/lib/session.ts`
1. Grep `noah` / `6883` / demo in `web/lib/session.ts` and across `web/` + `tests/`. Remove the hardcoded demo bypass branch entirely (locked decision).
2. Update every caller/test that relies on the demo identity (grep will surface them — e.g. prototype page or auth tests). Prefer switching tests to real flows used by the E2E pipeline; do not re-add any credential fallback.
3. Confirm `pnpm --dir web test` still passes (this suite owns session/auth tests).

## 5. Slice 3 — E2E + pipeline

1. `.github/workflows/e2e.yml` trace-appender step + artifact upload (already in working tree): verify the step is `if: always()`, appends to `docs/omp-plans/2026-08-07-prg-stack-audit-fix-plan.md`, and the artifact list includes the trace doc. Fix anything off.
2. `tests/e2e/programs-d1.test.ts`: E2E-12 reload-recovery empty-state checks and the duplicate-generate idempotency assertion (`已產生 0 場聚會，跳過 [1-9]`) — already in the tree; run `pnpm test:e2e -- --config tests/e2e/programs-d1.config.ts` against an operator-provisioned target if one exists, otherwise dry-run compile with `tsx tests/e2e/programs-d1.test.ts --help`-style checks; report target status.
3. `web/lib/programs/programs-events-panel.test.tsx` U4: update the assertion to `星期三` (ground-state item; land in Step 0 or here, but it must be in the final tree).
4. If the deploy target exists, add one acceptance assertion for the approved-enrollment atomicity (approve → exactly one `Active` enrollment; re-approve attempt is idempotent/no dupes) — only if the operator target is already up; otherwise note as pending operator.

## 6. Verification (final, lead runs)

```bash
pnpm typecheck                # root (incl. tests/e2e tsconfig)
pnpm --dir web typecheck
pnpm --dir web test            # 223+ incl. new programs.test.ts cases
pnpm --dir web test:components # 134/134 (U4 fixed)
pnpm --dir web build
pnpm test                      # root 278/278
npx ultracite check <changed files only>   # pre-existing violations outside scope stay untouched
pnpm test:shell-responsive     # unauth E2E if runner available
```

Acceptance per ADR-0027 vocabulary:
- [ ] approve = one transaction; request Pending → Approved AND enrollment created atomically; failure leaves request Pending
- [ ] zero-rule generate → 422 + FAILED audit row; accepted runs audit once with `skipped>0`
- [ ] leader assign to non-Active account → 422 + FAILED audit; revoke-revoked → DUPLICATE audit row
- [ ] migration 0003 idempotent seeds: `role_capabilities` = DEFAULT_ROLE_POLICIES, `department_modules` = 5 keys × every existing department, all disabled; runtime seeding removed
- [ ] no demo credentials anywhere in `web/`
- [ ] member-options + parseProgramFields committed and tested

## 7. Commit protocol

- One commit per slice on `prg-05-201` (existing convention; `--no-verify` for pre-existing lint debt; message style matches repo log).
- Do NOT merge, do NOT push without an explicit ask. When the branch is green, report the commit list and the remaining operator-blocked E2E acceptance.

## 8. Grilling record (round 2, 2026-08-07) — all recommendations accepted

- **Q1 DUPLICATE remap scope**: remap both repeat paths in `submitEnrollmentRequest` (`CONFLICT` → `DUPLICATE`); leave `createEvent` `CONFLICT`; no full audit-on-throw sweep (§3.4).
- **Q2 Audit outcome for the two 422 rejections** (zero-rule generate, inactive-leader assign): `FAILED`, not `DENIED` — the actor passed the authorizer, the operation failed validation; `DENIED` stays reserved for capability denials (§3.2, §3.3).
- **Q3 Out-of-scope UI pass**: commit it in Step 0 as its own commit(s), excluded from fix gates and review scope; "untouched" means don't modify further, not "leave uncommitted".
- **Q4 Execution shape**: strictly serial, one engineer; the three teams are logical commit slices, not concurrency units (repo one-worker-at-a-time convention).
