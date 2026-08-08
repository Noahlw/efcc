# PRG-01..05 Audit and Specification Fix Plan

## Goal

Close the correctness and specification findings from the stacked PRs #207-#211, then raise the Programs UI from the Impeccable baseline of audit 10/20 and critique 19/40 to at least audit 16/20 and critique 28/40. The deployed PRG-05 gate remains the final readiness authority.

## Domain decisions

- `Program Leader` is a scoped Program manager with `program.manage` and `program.publish` for its own Programs only.
- Program Leaders may manage Program content, schedules, events, enrollment decisions, and publishing. They may not create Departments, configure Department modules, or assign/revoke leaders.
- Every Department has every approved module as explicit state, initially disabled. Disabling preserves records/history and blocks or hides new module operations.
- Program lifecycle is `Draft -> Active -> Archived`; `Archived` is terminal. Invalid values and blank names return `422`.
- Enrollment-mode changes affect future submissions only; request and enrollment history remains unchanged.
- Member search is scoped to a Program, active accounts only, and displays Chinese full name plus username while submitting immutable `user_id`.
- E2E acceptance uses dual proof: DOM assertions for UI state and same-origin request assertions for server authority.
- Program Leader assignment accepts Active Accounts only; `Pending`/`Suspended` targets return `422`.
- Enrollment approval is atomic: request decision and enrollment creation commit in one transaction; the Enrollment row is the terminal evidence of approval. An Approved request without an Enrollment cannot exist.
- The D1 programs domain adopts the ADR-0023 Audit Outcome vocabulary: `DUPLICATE` for same-actor repeats reaching a terminal state (quiet no-op), `CONFLICT` for different-actor; every terminal outcome writes one audit row (revoke-revoked included).
- `generateEvents` with zero schedule rules returns `422`; accepted generation runs always emit one `EVENT_GENERATE` audit row (duplicate runs audit `skipped > 0`).
- Create requires `name` + `lifecycle` for Department and Program and `behavior_type` for Program; invalid enum values → `422`; `description`/`category` optional; `discoverability`/`enrollment_mode`/`display_order` may default.
- Existing Departments receive module rows (disabled) via migration backfill; role policies seed in SQL; the lazy per-read seeding fan-out is removed.

## Implementation sequence

### 1. Repair domain and HTTP contracts

- Make Department module creation seed all approved modules disabled; backfill disabled module rows for the three migrated Departments and seed role policies in SQL (drop the lazy per-read seeding fan-out).
- Return full module state objects consistently from the store, workspace, handler, client type, and tests.
- Add server-computed effective capabilities to Program list/detail responses.
- Make Program listing include a leader's own Unlisted Programs without exposing unrelated Unlisted Programs.
- Add a Program-scoped active-member search endpoint returning only `user_id`, full name, and username.
- Add `Idempotency-Key` to mutating Programs client requests and preserve correlation IDs.
- Make `decideEnrollmentRequest` atomic: request decision + enrollment creation in one D1 transaction; audit `DECIDE` only on commit; a (member, program) duplicate resolves as `DUPLICATE`.
- Filter leader assignment by `account_status = 'Active'`; `Pending`/`Suspended` → `422 VALIDATION`.
- Re-map same-actor repeat mutations to `DUPLICATE` and emit an audit row for every terminal outcome, including revoke-on-revoked.
- Return `422 VALIDATION` from `generateEvents` when the Program has no schedule rules; always audit accepted generation runs (idempotent duplicate runs audit `skipped > 0`).

### 2. Harden Program validation and lifecycle

- Validate required create fields and all enum/type values; reject invalid values instead of defaulting them.
- Enforce required `name` + `lifecycle` on Department and Program create and `behavior_type` on Program create; invalid enums → `422` instead of silent defaults.
- Add strict partial PATCH validation, blank-name rejection, nullable description/category clearing, and duplicate-name checks.
- Enforce `Draft -> Active -> Archived`, with publish capability required for `Active` and no reopening after archive.
- Add contract tests for mode changes with pending requests and active enrollments; preserve all historical rows.

### 3. Complete the Programs UI

- Replace global-role `canManage` with server-projected per-Program capabilities.
- Add Program edit controls for lifecycle, category, description, discoverability, enrollment mode, display order, and name.
- Add one Program Detail disclosure; lazy-load Events, Enrollment, and Leaders only when opened.
- Fix the non-functional collapse action, mobile stacking, undefined CSS tokens, 44px controls, focus rings, loading/status announcements, and destructive-action confirmation.
- Replace raw leader/enrollment IDs with the scoped active-member picker showing full name and username.
- Keep Department create/publish/module controls restricted to Department capabilities.

### 4. Complete acceptance evidence

- Add E2E-12 reload recovery and explicit empty-state assertions.
- Run duplicate event generation and assert the skipped/idempotent result in the DOM.
- Assert both hidden/visible controls and direct server responses for forbidden and cross-scope paths.
- Add contract tests for: atomic approval (no orphan Approved request on race), `DUPLICATE` vs `CONFLICT` audit outcomes, revoke-revoked audit row, zero-rule generate `422`, and Pending/Suspended leader-assignment `422`.
- Make `.github/workflows/e2e.yml` append timestamped results and deployment identity to the governing trace, then upload the artifact.
- Require a fresh deployed 100% run before changing PRG-05 from in-progress/Proposed to READY.

### 5. Working-tree hygiene

- Remove the hardcoded demo-login credentials from `web/lib/session.ts` entirely; local development uses the real registration → approval → login flow.
- Leave out-of-scope UI changes (profile, approval-queue, app-shell, registrations, prototype, globals) untouched and out of this plan's verification gates.

## Verification gates

- Contract tests cover module shape, strict validation, lifecycle, effective capabilities, member search, and idempotency.
- Component tests cover leader/member capability variants, edit flows, module states, picker ambiguity, loading/error/empty states, and responsive controls.
- Run `pnpm --dir web typecheck`, `pnpm --dir web test`, `pnpm --dir web test:components`, root `pnpm typecheck`, root `pnpm test`, `pnpm --dir web build`, and `npx ultracite check`.
- Run Impeccable detector and critique again; target audit `16+/20` and critique `28+/40`.
- Dispatch the deployed Programs workflow against a fresh isolated Worker/D1 target and retain the Playwright artifact.

## Not in scope

- Google Sheet reads/writes or dual-write behavior.
- Global role-policy editing.
- Attendance implementation beyond preserving existing event/enrollment boundaries.
- A new generic authorization abstraction outside the existing capability seam.
- The out-of-scope working-tree UI pass (profile, approval-queue, app-shell, registrations, prototype, globals); it belongs to other UI branches and is excluded from this plan's gates.

## Grilling record (2026-08-07)

All recommendations accepted; decisions captured in [Domain decisions](#domain-decisions) and Implementation sequence above. Notable rulings: atomic approval with the Enrollment row as terminal evidence; Active-only leader assignment; full ADR-0023 Audit Outcome adoption for the D1 programs domain; zero-rule generation is `422`; migration backfill (no lazy module seeding); strict required create fields; demo credentials removed; out-of-scope UI excluded. Domain terms `Active Account`, `Enrollment Approval`, `Audit Outcome`, and `Schedule Rule` added to CONTEXT.md.
