# S4 Phase A — Foundation acceptance trace

**Phase:** Stack PR A — first child stacked directly on PR #473
**Stack origin:** PR #473 (`feat/s4-12-shadcn-migration`) at `85817f56`
**Tickets:** #476 (S5-A01 disposable D1 identity foundation), #477 (S5-A02 Tailwind/shadcn foundation + Authenticated Shell migration), #478 (S5-A03 normalized read-only 身份組 hierarchy + one rename mutation)
**Parent authority:** issue #475, Spec 091, Spec 092, ADR-0042, ADR-0043
**Grouped PR title:** `feat(s4-a): identity and UI foundations`
**Phase base:** `85817f563a801e891bfbf758e3174ea0bdea9544` (PR #473 head)
**Status:** Planning-only acceptance trace; no production code, schema, migration, fixture, deployment, or data change is authorized by this document

> This acceptance trace records the observable contract that Phase A (#476, #477, #478) must satisfy. It maps every ticket acceptance criterion to a verifiable outcome, persona/fixture, surface, test seam, and evidence owner. It does not modify production code, schema, fixtures, or CSS. Subsequent phases (B–F) are explicitly excluded and out of scope for this trace.

## Phase A scope boundary

**In scope (this trace only):**
- #476 — disposable pre-production D1 identity foundation: Role Categories, the protected Admin and 會友基礎 system-identity anchors, the assignable Staff system identity (Global, below Admin, governed by capability and hierarchy rules), normalized Role Definitions, Role Assignments, grants, revisions, idempotency, immutable audit, local/CI seeds, and the safe pre-production reset.
- #477 — Civic Minimal Tailwind token contract, named 800px shell breakpoint, local shadcn/Radix primitive additions required by shipped callers, Authenticated Shell/chrome migration without changing session or navigation outcomes.
- #478 — read-only 身份組 hierarchy projection plus one complete rename mutation: shared actor, hierarchy, scope, revision, idempotency, transaction, audit, error, URL, and feedback seams.

**Out of scope (excluded from this trace; not in Phase A):**
- Phase B — shared UI modules and role definitions (#479–#484).
- Phase C — stackable identity integration (#485–#487).
- Phase D — member/public route wave (#488–#490).
- Phase E — operations route wave (#491–#493).
- Phase F — contract and release evidence (#494–#495).
- Multi-account bulk 身份組 assignment.
- Explicit deny grants.
- Production physical deletion of identities, assignments, grants, or audit history.
- `/prototype`, historical evidence pages, and unimplemented surfaces.
- Generic schema-driven Form or DataTable engines, compatibility wrappers, second component libraries.
- Discord colors, assets, gaming vocabulary, or server/channel concepts.
- Screenshot capture, screenshot assertion, image snapshot, or pixel-diff regression.

---

## Ticket #476 — S5-A01 Disposable D1 identity foundation

**Backend authority:** Spec 091 §§ 1–6, ADR-0042 (clean pre-production cutover, development schema reset, role deletion semantics)
**Stack position:** First child stacked on PR #473; no upstream blocker

### Contract under test

The disposable pre-production D1 schema replaces the obsolete fixed-role permission tables with fixed Role Categories, the protected Admin and 會友基礎 system-identity anchors, the assignable Staff system identity (Global, below Admin, governed by capability and hierarchy rules), normalized Role Definitions, Role Assignments, grants, revisions, idempotency records, and an immutable audit log. A stale pre-091 schema fails with explicit reset instructions and never auto-drops an unknown database. Seeds create the protected anchors, fixed Department/Program categories, scoped Role Definitions with explicit scope, and representative Active Accounts. D1 constraints enforce one explicit scope for scoped identities, one active Account/Role Definition assignment pair, closed capability sets, write-guarded protected-anchor rows, and immutable audit/idempotency rows. Staff is not write-guarded at the schema layer; its label/position are mutated through the Worker role-rename authority seam under the documented capability and hierarchy rules. The focused dis…

### Acceptance trace

| ID | Given | When | Observable result |
| --- | --- | --- | --- |
| D1-01 | A disposable local/CI D1 contains a pre-091 schema (legacy fixed-role tables present) | Run the preflight/migration seam | Migration fails with explicit reset instructions (e.g. `wrangler d1 execute ... --command "DROP TABLE IF EXISTS legacy_*"` shown in operator output); no row is dropped automatically and the database name is not matched against any non-disposable identifier. |
| D1-02 | The preflight detects an unknown or non-disposable database name | Run the preflight | Preflight refuses to proceed, surfaces the database name and the reset command the operator must run by hand, and exits non-zero without issuing any `DROP`. |
| D1-03 | A fresh disposable D1 is provided | Run seeds | Protected `Admin` and 會友基礎 Role Definitions exist with their locked highest/lowest positions; the assignable `Staff` system identity (Global, below Admin) is seeded with its documented position and capability grants; fixed `Department` and `Program` Role Categories are seeded as non-assignable; scoped Role Definitions (`成人部門管理者`, `青少年查經帶領`, and one per Program) exist with exactly one explicit scope; representative Active Accounts exist with the documented baseline 會友基礎 assignment. |
| D1-04 | A scoped Role Definition is inserted without an explicit scope | Submit a D1 write that omits scope | D1 constraint rejects the write; the row does not exist; no audit row is produced for a non-existent mutation. |
| D1-05 | An attempt is made to create a second active `RoleAssignment` row for the same (Account, Role Definition) pair while an active row exists | Submit the duplicate assignment write | D1 constraint rejects the duplicate; the existing active assignment is unchanged; a rejected-attempt audit row is written only if the originating call reached a Worker transaction (not for raw D1 attempts). |
| D1-06 | A Role Definition row is created with a grant set that includes an unknown capability key | Submit the write | D1 constraint rejects the write because the capability set must be closed against the canonical capability catalog; no Role Definition row or grant row is written. |
| D1-07 | A write attempts to mutate or delete a protected system identity (Admin or 會友基礎 — Staff is assignable, not write-guarded at the schema layer) | Submit the mutation | D1 constraint and the Worker transaction both reject the write; the protected row is unchanged; a DENIED audit row is recorded when the attempt reached the Worker. A write that targets the assignable Staff identity is rejected by the Worker role-management authority seam (capability and hierarchy rules) rather than by the protected-row D1 guard. |
| D1-08 | An audit row is written, then an attempt is made to UPDATE or DELETE that row | Submit the mutation | The row is unchanged; immutable audit is enforced at the D1 layer. |
| D1-09 | A successful privileged mutation is committed | Inspect the audit/idempotency tables | One SUCCESS audit row exists with actor, base revision, new revision, change summary, and idempotency key; the idempotency record is terminal and references the same revision. |
| D1-10 | The same idempotency key is replayed with an equivalent change set | Replay the mutation | The mutation is idempotent: the same revision is returned, no duplicate Role Definition/grant/assignment rows exist, and a DUPLICATE audit row may be emitted but is identifiable as the replay. |
| D1-11 | An idempotency key previously used for a different change set is reused | Submit the new body with the old key | The mutation is rejected with a 409 conflict; no row is written and no revision advances. |
| D1-12 | An assignment referencing a Role Definition is attempted after the Role Definition is archived | Submit the assignment | The new assignment is rejected because the role is archived; existing assignments are revoked atomically as part of archive; the archive audit row records the revoked accounts. |
| D1-13 | The preflight runs against the documented disposable fixture | Run the focused disposable-D1 contract | Clean creation, duplicate rejection, archive-safe history, and reset safety are all green; the runner prints per-test pass/fail with the disposable database name. |

### Test seams and gates

- **Worker/D1 seam:** `web/lib/identity/d1-schema.test.ts` and `web/lib/identity/seeds.test.ts` exercise preflight reset messaging, seed creation, scope enforcement, duplicate assignment rejection, closed-capability writes, protected-anchor immutability (Admin and 會友基礎), Staff assignability under the role-management authority seam, immutable audit, idempotency terminal state, archive-safe revocation, and replay under disposable D1.
- **Constraint seam:** D1 CHECK and UNIQUE constraints are exercised at the SQL boundary (not via Worker) to prove that no application path can circumvent them.
- **Required gates for #476:** root and `web/` typecheck, focused disposable-D1 test suite, `git diff --check`, no production D1/Apps Script/Sheets/Cloudflare mutation.

### Ticket acceptance criteria mapping

| Ticket criterion | Trace rows |
| --- | --- |
| Stale pre-091 local/CI schema fails with explicit reset instructions and never auto-drops an unknown database. | D1-01, D1-02 |
| Seeds create the protected Admin and 會友基礎 anchors, the assignable Staff system identity, fixed Department/Program categories, scoped Role Definitions, grants, and representative Accounts. | D1-03 |
| D1 constraints enforce one explicit scope for scoped identities, one active Account/Role Definition pair, closed capabilities, write-guarded protected-anchor rows (Admin and 會友基礎), and immutable audit/idempotency records; Staff mutation is governed by the Worker role-management authority seam (capability and hierarchy rules). | D1-04, D1-05, D1-06, D1-07, D1-08, D1-09 |
| The focused disposable-D1 contract proves clean creation, duplicate rejection, archive-safe history, and reset safety. | D1-10, D1-11, D1-12, D1-13 |

---

## Ticket #477 — S5-A02 Civic Minimal token + shadcn/Radix foundation + Authenticated Shell

**Design authority:** Spec 092, ADR-0043, `DESIGN.md`, the approved Civic Minimal contract, `.impeccable/design.json` (derived)
**Stack position:** First child stacked on PR #473; no upstream blocker; may run in parallel with #476 when file ownership is disjoint

### Contract under test

A complete Civic Minimal Tailwind token contract covers color, spacing, typography, target/control size, radius, borders, elevation, widths, layering, motion, and the named 800px shell breakpoint. Only the primitives needed by shipped callers are added; role/state, keyboard, focus, disabled/error/busy, and overlay behavior are observable contracts. The Authenticated Shell/chrome (phone dock, desktop rail, shell outlet/scroll, safe-area reserve, skip link, offline/recovery states, one Live Region) migrates to local shadcn/Radix without changing session restore, server-projected navigation, focus order, or any navigation outcome. Global authored CSS is limited to the approved token/document/shell/platform ownership boundary; route styling remains temporarily intact for later family cutovers.

### Acceptance trace

| ID | Given | When | Observable result |
| --- | --- | --- | --- |
| TK-01 | The token contract is published | Read the token files (`web/app/globals.css` token section, `tailwind.config` token list) and the named 800px shell breakpoint declaration | Color, spacing, typography, target/control size, radius, borders, elevation, widths, layering, motion, and the named 800px shell breakpoint are all declared; every token is sourced from Civic Minimal and has a documented role. |
| TK-02 | An implementer wants to add a primitive not currently vendored | Inspect the primitive inventory and the shipped caller list | Only primitives needed by at least one shipped caller in Phase A are vendored; an entry for each exists in `web/COMPONENT_INVENTORY.md` with the owning caller and the variant in use. |
| TK-03 | A vendored primitive claims to replace a raw control | Inspect the primitive's accessibility contract | Role/state, keyboard behavior, focus visibility, disabled/error/busy, and overlay behavior are all observable in the primitive test seam; behavior tests pass; equivalent raw control is removed from the Authenticated Shell callers. |
| TK-04 | The Authenticated Shell renders the phone dock on a phone viewport | Render at 320/375/390/414 CSS px and inspect the dock | Dock is in document flow, clears the safe-area reserve, focus order is `skip link → primary nav → main → dock`, and the last content anchor is reachable above the dock. |
| TK-05 | The Authenticated Shell renders the desktop rail on a desktop viewport | Render at 1024/1440/1920 CSS px and inspect the rail | Rail is visible, persistent, has visible focus, primary nav and account affordances are reachable, and content does not horizontally overflow. |
| TK-06 | A user crosses the 800px shell breakpoint | Render at 799 and 800 CSS px and inspect the transition | 799px shows the phone shell; 800px shows the desktop shell; both states pass focus order, no horizontal overflow, and no overlap with the safe-area reserve. |
| TK-07 | A user triggers an offline/recovery state on an authenticated route | Disable network and trigger the deep-link recovery path | The recovery affordance is owned by the shell, focus is moved to the recovery heading, the live region announces once, and session state is not silently lost. |
| TK-08 | A route's main region updates (e.g. nav, async retry) | Observe the live region during the transition | The visible status and the global live region do not announce the same event twice; one owner per transition. |
| TK-09 | The shell is measured at the required evidence widths | Run the pinned Chromium geometry suite at 320, 390, 600, 799, 800, 1024, 1440 CSS px | Each width reports shell critical anchors (outlet/chrome, skip link, primary nav, dock or rail, main, live region) with no overflow and no obstruction; tolerances match the documented small values. |
| TK-10 | A maintainer audits the global CSS surface | Read `web/app/globals.css` after the migration | Global authored CSS is limited to tokens, document/base, shell, and platform/safe-area selectors; route CSS Modules are unchanged for the later family cutover and contain no rule duplicated by the new token layer. |
| TK-11 | A native control remains in the shell | Inspect the native-exception registry | Every retained native control has a documented semantic, platform, or domain reason in `web/COMPONENT_INVENTORY.md`; the registry entries are reviewable and not auto-generated. |
| TK-12 | A screenshot test is proposed for the shell | Inspect the test suite | No screenshot capture, screenshot assertion, image snapshot, or pixel-diff test exists in the shell test seam; geometry is numeric CSS-pixel evidence from pinned Chromium. |

### Test seams and gates

- **Token seam:** `web/app/globals.css`, `tailwind.config.*`, and a focused token-read test assert the declared token set and the named 800px shell breakpoint exist; no off-token literal is added in shell modules.
- **Primitive seam:** each new primitive ships with a `*.test.tsx` that asserts role/state, keyboard, focus, disabled/error/busy, and overlay behavior, plus a documented variant against the Civic Minimal tokens.
- **Shell seam:** `web/lib/shell/authenticated-shell.test.tsx` exercises phone dock, desktop rail, skip link, 799/800 transition, safe-area reserve, offline/recovery, and one-announcement-owner discipline without coupling to source class strings.
- **Geometry seam:** pinned Chromium Playwright suite at 320, 390, 600, 799, 800, 1024, 1440 CSS px asserts shell critical anchors; both 799 and 800 are exercised.
- **Required gates for #477:** root and `web/` typecheck, focused token/primitive/shell tests, pinned geometry suite, production build, `git diff --check`.

### Ticket acceptance criteria mapping

| Ticket criterion | Trace rows |
| --- | --- |
| Tokens cover color, spacing, typography, target/control size, radius, borders, elevation, widths, layering, motion, and the 800px shell transition. | TK-01, TK-06 |
| Only primitives needed by shipped callers are added; role/state, keyboard, focus, disabled/error/busy, and overlay behavior are observable contracts. | TK-02, TK-03 |
| Phone dock, desktop rail, shell outlet/scroll, safe-area reserve, skip link, offline/recovery states, and one Live Region preserve behavior. | TK-04, TK-05, TK-07, TK-08 |
| Pinned Chromium proves shell critical anchors at 320, 390, 600, 799, 800, 1024, and 1440 CSS px with no overflow or obstruction. | TK-09 |
| Global CSS is limited to the approved token/document/shell/platform ownership boundary; route styling remains temporarily intact for later family cutovers. | TK-10, TK-11, TK-12 |

---

## Ticket #478 — S5-A03 Normalized read-only 身份組 hierarchy + one rename mutation

**Domain authority:** Spec 091, ADR-0042, the approved Civic Minimal contract
**Stack position:** Stacked on Phase A; blocked by #476 (D1 foundation) and #477 (token/shell foundation)

### Contract under test

The read-only 身份組 hierarchy projection serves fixed Role Categories as non-assignable headings, ordered Role Definition summaries, the protected Admin and 會友基礎 anchors, scope labels, child counts, protected states, and server-projected actions. Identity detail exposes one complete rename mutation that succeeds only for an eligible lower target and preserves the stable Role Definition ID, all assignments, the order position, the scope, and every grant. Self/highest/Admin/baseline/scope/name/idempotency failures return the specified Problem Details and commit no unauthorized mutation. A successful rename commits domain state, immutable audit, the terminal idempotency result, and the authoritative response atomically; a replay returns the original result. Safe URL state, Back behavior, focus, Cantonese feedback, and route geometry are covered at their highest observable seams.

### Acceptance trace

| ID | Given | When | Observable result |
| --- | --- | --- | --- |
| H-01 | An authorized operator opens the 身份組 list | Render the route | Fixed Role Categories appear as non-assignable headings; each Category shows a child count and is collapsed by default with the selected identity's permissions remaining visible; Admin is pinned highest, 會友基礎 pinned lowest, and both are visibly protected. |
| H-02 | An operator expands a fixed Category | Activate the expand affordance | The category's child Role Definitions expand; expansion state is local to the current screen and does not affect another session. |
| H-03 | An authorized operator inspects a Role Definition summary | Render the detail | Server-projected actions are visible per the operator's capabilities; scope label, position, grant count, assignment count, and protected state are all present; technical capability keys never appear as the primary label. |
| H-04 | An operator opens the rename affordance on an eligible lower Role Definition | Activate rename | A focused rename input opens, current name is preloaded, the role's highest-actor lock is not in effect, and the rename button is enabled. |
| H-05 | The operator submits a valid rename with a unique name and the correct base revision | Submit the rename | `200` returns the renamed Role Definition with the new name, the same stable ID, identical assignment rows, identical order position, identical scope, identical grant rows, and revision + 1; one SUCCESS audit row records actor, base revision, new revision, old name, new name, and idempotency key. |
| H-06 | The same idempotency key is replayed with the same rename | Replay the rename | `200` is returned idempotently with the original result; no duplicate audit row is committed; a DUPLICATE replay audit row may be emitted but is identifiable. |
| H-07 | The operator renames a Role Definition whose name collides with an existing Role Definition name | Submit the rename | `409` Problem Details with `code=NAME_CONFLICT`; no row is written; no revision advances; a REJECTED audit row is recorded. |
| H-08 | The operator attempts to rename Admin or 會友基礎 | Submit the rename | `403 FORBIDDEN` Problem Details; the protected row is unchanged; a DENIED audit row is recorded. |
| H-09 | The operator attempts to rename a Role Definition at or above their highest position | Submit the rename | `403 FORBIDDEN` Problem Details; no mutation; a DENIED audit row is recorded. |
| H-10 | The operator attempts to rename a Role Definition outside their scope | Submit the rename | `403 FORBIDDEN` Problem Details; no mutation; a DENIED audit row is recorded. |
| H-11 | The operator renames with an empty name or one that exceeds the documented length | Submit the rename | `400` Problem Details with `code=INVALID_NAME`; no mutation; no revision advances. |
| H-12 | The operator renames with a stale base revision | Submit the rename | `409` Problem Details identifying the current authoritative revision; no mutation; revision does not advance; a CONFLICT audit row is recorded. |
| H-13 | The operator renames with an idempotency key already used for a different change | Submit the rename | `409` Problem Details with `code=IDEMPOTENCY_KEY_REUSED`; no mutation; a REJECTED audit row is recorded. |
| H-14 | The operator renames their own highest assignment | Submit the rename | `403 FORBIDDEN` Problem Details; no mutation; a DENIED audit row is recorded. |
| H-15 | The rename succeeds | Inspect response, D1, audit, and idempotency tables | Domain state, audit, idempotency terminal row, and the authoritative response are committed atomically; the response body contains the post-commit revision, the new name, the stable ID, and the request `X-Request-Id`. |
| H-16 | A direct Worker call attempts to bypass scope by tampering with the request | Submit the tampered request | Worker recomputes authority and returns `403 FORBIDDEN`; the response and D1 reflect no mutation; the UI projection was not the authority. |
| H-17 | The route is loaded with `?role=<id>&view=<view>` | Render the route | Selected identity and view are encoded safely; refresh, Back, and shared links preserve context; unknown values fall back to a safe default without exposing or mutating other data. |
| H-18 | The route is loaded with a malformed role or view parameter | Render the route | The route falls back to a safe default; no cross-tenant data is exposed; no mutation is triggered. |
| H-19 | The rename input receives focus, then submission completes | Observe focus and feedback during the flow | Focus moves predictably through the rename affordance; success feedback is announced once in Cantonese by the route's announcement owner; visible status and global live region do not announce the same event twice. |
| H-20 | The hierarchy and rename affordance are rendered at the required evidence widths | Run the pinned Chromium geometry suite at 320, 390, 600, 799, 800, 1024, 1440 CSS px | Phone uses grouped category/role cards, the rename affordance does not cover the dock or safe-area reserve, desktop uses dense hierarchy with persistent action, no horizontal overflow, focus is visible, and both 799 and 800 pass for shell-sensitive states. |

### Test seams and gates

- **Worker/D1 seam:** `web/lib/identity/role-hierarchy.test.ts` exercises authorized read, scope-aware action projection, rename success, replay, name conflict, protected identity lock, highest-actor lock, scope lock, self-rename lock, name validation, stale revision, idempotency key reuse, and atomic commit of domain/audit/idempotency.
- **Audit/idempotency seam:** every trace row that mutates asserts the audit table contains exactly the documented SUCCESS/DUPLICATE/REJECTED/DENIED/CONFLICT row and the idempotency table contains exactly one terminal row per key.
- **Component seam:** `web/lib/identity/role-hierarchy-panel.test.tsx` and `web/lib/identity/role-rename-sheet.test.tsx` exercise read projection, focus order, Back behavior, safe URL state, single announcement owner, and the rename finite states (idle/dirty/submitting/success/conflict/forbidden) without coupling to source class strings.
- **Geometry seam:** pinned Chromium Playwright at 320, 390, 600, 799, 800, 1024, 1440 CSS px asserts hierarchy and rename critical anchors; both 799 and 800 are exercised for shell-sensitive states.
- **Required gates for #478:** root and `web/` typecheck, focused Worker/component tests, pinned geometry suite, production build, `git diff --check`, no production D1/Apps Script/Sheets/Cloudflare mutation.

### Ticket acceptance criteria mapping

| Ticket criterion | Trace rows |
| --- | --- |
| Authorized operators see fixed Role Categories, ordered Role Definition summaries, Admin and 會友基礎 anchors, scope, counts, protected states, and server-projected actions. | H-01, H-02, H-03 |
| Identity detail rename succeeds only for an eligible lower target and preserves stable ID, assignments, order, scope, and grants. | H-04, H-05 |
| Self/highest/Admin/baseline/scope/name/idempotency failures return the specified Problem Details and commit no unauthorized mutation. | H-07, H-08, H-09, H-10, H-11, H-12, H-13, H-14, H-16 |
| A successful rename commits domain state, immutable audit, terminal idempotency result, and authoritative response atomically; replay returns the original result. | H-05, H-06, H-15 |
| Safe URL state, Back behavior, focus, Cantonese feedback, and route geometry are covered at their highest observable seams. | H-17, H-18, H-19, H-20 |

---

## Phase A provenance

- **Base SHA:** `85817f563a801e891bfbf758e3174ea0bdea9544` (PR #473 `feat/s4-12-shadcn-migration` head, verified against `gh pr view 473 --json headRefOid`).
- **Base ref:** `origin/feat/s4-12-shadcn-migration` at `85817f56`.
- **Isolated worktree:** `.worktrees/phase-a-trace-restart` on branch `phase-a-trace-restart`.
- **Trace path:** `docs/specs/s4-phase-a-acceptance-trace.md`.
- **Parent authority:** `docs/specs/091-stackable-identity-backend.md`, `docs/specs/092-discord-identity-design-system-adoption.md`, `docs/adr/0042-discord-like-stackable-role-model.md`, `docs/adr/0043-owned-civic-design-system-governance.md`, issue #475.
- **Tickets covered:** #476, #477, #478.
- **Tickets explicitly excluded (not Phase A):** #479–#495 (Phases B–F).
- **Convention:** modeled on `docs/specs/453-s4-04-permission-policy-read-acceptance-plan.md` and `docs/specs/454-s4-05-permission-policy-write-acceptance-plan.md`; planning-only, no production code, schema, migration, fixture, deployment, or data change authorized.

## Phase A no-Phase-B clause

This trace records the Phase A acceptance contract only. It does not authorize, scope, schedule, or describe Phase B (shared modules and role definitions, #479–#484), Phase C (identity integration, #485–#487), Phase D (member/public route wave, #488–#490), Phase E (operations route wave, #491–#493), or Phase F (contract and evidence, #494–#495). Those phases require their own acceptance traces, their own review gates, and their own grouped PRs. The previous Phase A worktree at `.worktrees/s4-management-implementation` (branch `feat/s4-12-shadcn-migration`, head `f1b77c0e`) is not the base of this trace; the base is the verified PR #473 head `85817f56`.
