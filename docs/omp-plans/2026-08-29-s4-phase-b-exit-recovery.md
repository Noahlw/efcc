# S4 Phase B Exit Recovery Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. <!-- Note: subagent-driven-development and executing-plans skills are not available -->

**Goal:** Resolve the remaining deterministic Programs D1 failures and local Worker instability, produce green Phase B evidence, open the grouped #479–#484 PR, and stop before Phase C.

**Architecture:** Preserve the reviewed Phase B seams and fix each failure at its current owner. Use the existing local shadcn/Radix primitives and CVA variants where they already express the needed semantics; use Tailwind utilities for the two workspace-row controls instead of adding another CSS override. Do not convert unrelated modules or begin the repository-wide CSS-to-Tailwind/CVA cutover during Phase B.

**Tech Stack:** React 19, Next.js 16, TypeScript, local shadcn/Radix primitives, Tailwind CSS 4, CVA 0.7, Vitest, Playwright 1.62, Wrangler 4/local Miniflare, disposable local D1, Node 22, pnpm 11.7.

## Global Constraints

- Scope is #479, #480, #481, #482, #483, and #484 only.
- Phase B source/review lanes are complete; this plan is a recovery and evidence plan, not a redesign.
- Do not start Phase C #485–#487 or Phase D–F work.
- Do not merge, deploy, force-push, reset the worktree, or touch production/remote D1, Apps Script, or Google Sheets.
- Use only `http://127.0.0.1:8787` and checked-in disposable `E2E_`/`E2E_DEMO_` fixtures.
- Use Node 22. Confirm `node --version` begins with `v22.` before pnpm/Wrangler commands.
- Keep `tests/e2e/programs-d1.config.ts` on Playwright's built-in `line` reporter, one worker, and one retry. Do not restore a custom reporter or live JSON writer.
- Preserve `ProgramWorkspaceProps`, `ProgramsIntent`, existing route/task values, identity authority, registration authority, permission authority, and all reviewed #479–#484 module interfaces.
- Never weaken an assertion to make a gate green. A test expectation may change only when an existing domain contract proves the expectation wrong, as in Hong Kong midnight `00:xx` formatting.
- Every bug task follows: reproduce once on a healthy Worker → capture HTTP/DOM/computed evidence → state one hypothesis → add the smallest regression check → make one owner-local change → rerun the focused check.
- W7 remains `320, 390, 600, 799, 800, 1024, 1440` CSS px. Numeric DOM/CSS geometry is evidence; screenshots are diagnostic artifacts only.
- Human keyboard/AT, reduced-motion, forced-colors, zoom/text-spacing, and real-device checks remain manual and must not be claimed as automated WCAG certification.

## Architecture Decision: shadcn/CVA/Tailwind

### Options considered

1. **Wholesale Phase B conversion — rejected**
   - Effort: XL. Risk: High.
   - Would rewrite reviewed #479–#484 surfaces plus later route waves while behavior is still moving.
   - Would multiply E2E changes and merge conflicts without fixing the Wrangler/Miniflare process death.
   - CVA is a semantic variant tool, not a replacement for domain modules or every CSS rule.

2. **Targeted Phase B stabilization — selected**
   - Effort: M. Risk: Low/Medium.
   - Reuses the installed `Button`, Radix primitives, Tailwind, CVA factories, reviewed modules, and existing tests.
   - Fixes only the five deterministic contracts and the local Worker gate.
   - Adds no new CSS rule for the workspace-row issue; uses caller-local Tailwind utilities through the existing shadcn `Button` interface.

3. **Harness-only exception — rejected**
   - Effort: S. Risk: High.
   - Splitting/retrying the suite could hide MUI-01, PUI-03, EVT-01, HUB-01, or PERM-01 regressions.
   - Infrastructure classification is allowed only after every deterministic failure passes independently.

### Deferred repository-wide cutover

After Phase F is complete and its route behavior is frozen, create a separate migration program that:

- inventories CSS Modules, global selectors, inline styles, and raw controls by route family;
- defines the final shared primitive interfaces and semantic CVA variant vocabulary before caller migration;
- migrates one route family at a time with behavior and W7 geometry unchanged;
- removes each CSS file only after its last caller is migrated;
- forbids compatibility aliases or parallel legacy/new styling paths;
- ends with a source audit proving obsolete CSS and raw-equivalent primitives are gone.

Until then, preserve existing styling ownership. Do not opportunistically convert unrelated files while fixing Phase B.

## File Structure & Changes

- Modify `tests/e2e/programs-d1.test.ts`: remove temporary MUI logging; retain only regression assertions that describe observable contracts; remove the duplicate event formatter if the production helper can be imported safely.
- Modify `web/lib/programs/workspace-task.tsx`: own the two workspace overview row buttons and their explicit Tailwind size/wrapping contract.
- Reconcile `web/app/programs/programs.module.css`: remove the unproven exploratory `button.workspaceTaskRow` candidate block; do not add a replacement Phase B rule.
- Modify `web/lib/programs/participant-program-detail.tsx` and its existing focused test only if PUI-03 proves the advisory projection is missing from the ready state.
- Modify `web/lib/programs/recurrence.ts`, its focused unit test, and `web/lib/programs/event-detail.tsx` only if the production formatter/helper does not already encode Hong Kong midnight correctly.
- Modify `web/lib/approval-detail.tsx` and `web/lib/approval-detail.test.tsx` if HUB-01 proves the successful mutation fails to replace loading/pending state with the terminal detail.
- Modify `tests/e2e/programs-d1.test.ts` session helpers first for PERM-01; touch `web/lib/session.ts` or `web/lib/app-shell.tsx` only if a focused product-level reproduction proves the shell is wrong outside the E2E helper.
- Modify `tests/e2e/programs-d1.config.ts`, `web/package.json`, or `pnpm-lock.yaml` only if the Worker crash investigation proves a harness/toolchain root cause. Do not change retry counts or timeouts as a substitute for a fix.
- Modify `docs/qa/2026-08-28-s4-phase-b-foundation.md` with final evidence and publication state.
- Do not modify the accepted Phase B authority plan or acceptance trace unless a real contradiction is found. Record implementation evidence against the existing 61 rows.

## What Already Exists

- Reviewed #479–#484 implementations and frozen seams.
- Local shadcn/Radix primitives, including `web/components/ui/button.tsx` and its CVA variants.
- Tailwind 4 and `tailwind-merge` through `cn()`.
- 46 modules already consuming the shared `Button` and 13 semantic CVA factories; no new styling framework is needed.
- `hkWallDateTimeLabel` and `HK_DATE_TIME_FORMATTER` in `web/lib/programs/recurrence.ts`.
- `ParticipantProgramDetail`, `WorkspaceOverview`, `ApprovalDetail`, and the canonical session/AppShell flows.
- Playwright `programs-d1.config.ts` with `phone-320`, `phone-390`, and `desktop` projects, one worker, one retry, and line reporter.
- Local seed commands and disposable D1 fixtures.
- Conditional evidence at `docs/qa/2026-08-28-s4-phase-b-foundation.md`.

## Not In Scope

- Repository-wide shadcn conversion.
- Repository-wide CSS Module or global CSS deletion.
- New generic Form, DataTable, Task, authorization, layout, or styling frameworks.
- A new CVA variant used by only one caller; caller-local Tailwind is smaller until a second semantic caller exists.
- Phase C permission/account-access work or later route waves.
- Remote acceptance hosts, deployment, production promotion, or migration of real data.
- Fixing the repository-wide pre-existing Ultracite baseline as part of Phase B. Full lint output remains evidence and must not be hidden.

## ASCII Diagrams

```text
Phase B accepted implementation
          |
          v
Reconcile exploratory diff
          |
          v
MUI-01 -> PUI-03 -> EVT-01 -> HUB-01 -> PERM-01
(each: reproduce -> regression -> owner-local fix -> focused pass)
          |
          v
Fresh local build/migrate/seed/Worker
          |
          v
Project shards -> complete 207-test invocation
          |
          v
Aggregate checks -> evidence -> grouped PR -> STOP
```

```text
Visual ownership after Phase F

Domain module props/state
          |
          v
Shared shadcn/Radix primitive interface
          |
          +--> CVA: semantic variant/size/state combinations
          |
          +--> Tailwind: layout and visual utilities

No parallel CSS compatibility layer after each route-family cutover.
```

## Failure Modes & Gaps

- The current worktree contains temporary MUI diagnostic logging and an unverified CSS candidate. Neither is production-ready evidence.
- The 207-test run's `145 failed` count is contaminated by a Worker process death. Only failures before `Network connection lost` are deterministic candidates.
- PUI-03 may be either a missing ready-state projection or stale test copy. The HTTP payload and rendered state decide; copy matching alone does not.
- EVT-01 currently duplicates the production date formatter in E2E. `Intl.DateTimeFormat` may emit `24:xx` under an h24 cycle; the domain contract is Hong Kong next-day `00:xx`.
- HUB-01 may be a mutation-state bug or a test racing a reload. The mutation response and detail load state decide.
- PERM-01 may be an E2E persona-switch helper bug. Product session code must not change unless reproduced without the helper.
- Wrangler/Miniflare may fail only after cumulative loopback load. Retries and longer timeouts cannot repair a dead process.
- `pnpm check` has a known repository baseline. Final evidence must distinguish unchanged baseline findings from new findings in touched files.

## Parallelization / Worktree Strategy

- Execute Tasks 1–6 sequentially in the existing Phase B worktree because they share the Worker, disposable D1, and `programs-d1.test.ts`.
- Do not run multiple Programs D1 Playwright jobs against the same local D1 concurrently.
- Task 7 aggregate unit/type/build commands may run only after the E2E source and fixtures are stable; keep CPU-heavy commands serial.
- One worker owns the recovery diff and final integration. Reviewers inspect committed task ranges; they do not edit shared files concurrently.

---

### Task 1: Reconcile the exploratory MUI-01 diff

**Files:**
- Modify: `tests/e2e/programs-d1.test.ts:2861-2932`
- Modify: `web/lib/programs/workspace-task.tsx` inside `WorkspaceOverview`
- Modify: `web/app/programs/programs.module.css:1971-1991`
- Read: `web/components/ui/button.tsx`

**Interfaces:**
- Consumes: existing `Button` `className`, `variant`, and `size` interface; existing `styles.workspaceTaskRow` composition.
- Produces: the same two workspace actions, each constrained to its workspace width, wrapping long Chinese copy, and measuring at least `44×44` CSS px.

- [ ] **Step 1: Record and clean the current exploratory state**

Run `git diff -- tests/e2e/programs-d1.test.ts web/app/programs/programs.module.css web/lib/programs/workspace-task.tsx`. Preserve the already captured evidence in the task notes: both failing buttons measured `395.281×32` at a 320px viewport and carried shadcn base classes `h-8`, `whitespace-nowrap`, and `shrink-0`. Remove `MUI01_GEOMETRY` logging and diagnostic-only fields from the committed test shape.

- [ ] **Step 2: Remove the unproven CSS candidate**

Delete the exploratory `button.workspaceTaskRow` and child-div override block from `programs.module.css`. Do not keep duplicate local rules that fight CVA output by stylesheet order.

- [ ] **Step 3: Apply the owner-local control contract**

In the two `WorkspaceOverview` buttons, use caller-local Tailwind utilities through `Button.className` to override the default fixed height/nowrap behavior: full available width, zero minimum width, at least 44px height, normal white-space, left-aligned content, and breakable inner copy. Keep the existing visual variant and click behavior. Do not add a global CVA size for these two callers.

- [ ] **Step 4: Build and start a fresh local target**

Run `pnpm --dir web build`, `pnpm --dir web db:migrate:local`, `pnpm db:seed:local`, and `pnpm db:seed:demo`. Start `wrangler dev` through Node 22 and wait until `http://127.0.0.1:8787` responds before Playwright.

- [ ] **Step 5: Prove the exact failure is fixed**

Run:

`PROGRAMS_TARGET_URL=http://127.0.0.1:8787 pnpm exec playwright test tests/e2e/programs-d1.test.ts --config=tests/e2e/programs-d1.config.ts --project=phone-320 --grep="workspace overview and focused tasks satisfy numeric W7 geometry"`

Expected: one test passes, including its internal W7 loop; `workspaceScrollWidth <= workspaceClientWidth + 1`; every visible control is at least `44×44`.

- [ ] **Step 6: Commit the MUI correction**

Commit only the workspace source/CSS reconciliation and cleaned regression test. Suggested message: `fix(s4-b): constrain workspace overview actions`.

**Acceptance:** No diagnostic output remains; no new CSS workaround or global CVA variant exists; MUI-01 passes at all W7 widths.

### Task 2: Resolve PUI-03 participant detail projection

**Files:**
- Modify if product-owned: `web/lib/programs/participant-program-detail.tsx`
- Test: existing focused participant detail test file beside the module
- Test: `tests/e2e/programs-d1.test.ts:1296-1359`

**Interfaces:**
- Consumes: participant program-detail response, enrollment status, schedule rules, concrete event projection.
- Produces: an unenrolled requestable member sees the schedule and exact advisory `加入後可查看聚會詳情`, but no dead Event Detail button.

- [ ] **Step 1: Reproduce on a freshly seeded Worker**

Run only `direct detail survives refresh and returns to the directory` under `phone-320`. Capture the program-detail HTTP status/payload, the visible detail state, the schedule list, and whether the advisory is absent or merely split/duplicated.

- [ ] **Step 2: Decide ownership from evidence**

If the payload projects an unenrolled/requestable state and the advisory is absent, fix `ParticipantProgramDetail` ready-state rendering. If the advisory is present with different copy, reconcile it to the canonical `COPY.enrollmentEventDetailAdvisory`. If the fixture is Active rather than unenrolled, repair fixture isolation or test precondition; do not hide the CTA.

- [ ] **Step 3: Add the smallest component regression**

Cover one unenrolled requestable member: schedule rules and concrete events render, advisory appears once, and the Event Detail action count is zero. The regression must fail before the source fix.

- [ ] **Step 4: Implement and verify**

Make one owner-local change, run the component test, then rerun the exact PUI-03 E2E test. Confirm refresh and Back still preserve `/programs#overview`.

- [ ] **Step 5: Commit**

Suggested message: `fix(s4-b): restore participant event advisory`.

**Acceptance:** PUI-03 passes without weakening its exact copy, privacy, refresh, schedule-count, or Back assertions.

### Task 3: Normalize EVT-01 Hong Kong midnight formatting

**Files:**
- Modify: `web/lib/programs/recurrence.ts`
- Test: existing recurrence unit test file
- Modify only if needed: `web/lib/programs/event-detail.tsx`
- Modify: `tests/e2e/programs-d1.test.ts:3779-3791` and the exact EVT-01 assertion

**Interfaces:**
- Consumes: a wall-clock timestamp interpreted in `Asia/Hong_Kong`.
- Produces: deterministic `zh-Hant` date/time text using a 00–23 hour cycle; next-day midnight is `00:xx`, never `24:xx` attached to the previous/next date ambiguously.

- [ ] **Step 1: Reproduce the mismatch with fixed input**

Use the existing failing start/end fixture and record production text and E2E-derived expectation. Confirm the observed mismatch is only `24:25` versus `00:25`, not a timezone/day conversion error.

- [ ] **Step 2: Add a pure unit regression**

Add a fixed midnight boundary case to the recurrence tests. Assert that an end instant at Hong Kong next-day 00:25 includes the next calendar date and `00:25`.

- [ ] **Step 3: Make the production helper explicit**

Ensure `HK_DATE_TIME_FORMATTER`/`hkWallDateTimeLabel` requests a 00–23 hour cycle. Keep all EventDetail callers on this helper; do not add a second formatter.

- [ ] **Step 4: Remove E2E formatter duplication**

Replace the local `HK_WALL_FORMATTER`/`hkWallLabel` mirror with a fixed contract expectation or a safe import of the pure production helper. The E2E must not independently choose a different hour cycle.

- [ ] **Step 5: Verify and commit**

Run recurrence tests, EventDetail focused tests, and the EVT-01 Playwright describe block. Suggested message: `fix(s4-b): normalize Hong Kong midnight labels`.

**Acceptance:** Unit and E2E agree on next-day `00:25`; no duplicate formatter remains; non-midnight labels remain unchanged.

### Task 4: Resolve HUB-01 approval terminal state

**Files:**
- Modify: `web/lib/approval-detail.tsx`
- Test: `web/lib/approval-detail.test.tsx`
- Test: `tests/e2e/programs-d1.test.ts:5269-5429`

**Interfaces:**
- Consumes: approve/reject mutation result and the request-detail reload lifecycle.
- Produces: after a successful decision, the same URL renders a read-only Approved/Rejected detail, decision copy/note, and no decision buttons.

- [ ] **Step 1: Reproduce and capture the state transition**

Run the exact HUB-01 approval test on fresh fixtures. Record the decision request status/body, any follow-up detail request, `aria-busy`, heading, and terminal status text. Do not infer from a screenshot stuck on loading.

- [ ] **Step 2: Add a component regression**

For approve success, assert Pending → busy → Approved read-only. For reject success with a note, assert Pending → busy → Rejected read-only with the note. Assert decision controls disappear only after success; a conflict returns to actionable Pending.

- [ ] **Step 3: Fix the single state owner**

If mutation succeeds but local state remains loading/pending, replace/reload the detail through `ApprovalDetail`'s existing lifecycle owner. Do not add an independent boolean or timer. If the follow-up GET omits decided rows, fix the existing detail endpoint projection rather than fabricating terminal UI state.

- [ ] **Step 4: Verify and commit**

Run `approval-detail.test.tsx`, approval queue tests, and the exact HUB-01 E2E test. Suggested message: `fix(s4-b): settle approval detail after decisions`.

**Acceptance:** Approve and reject remain atomic, URL-addressable, reloadable, and read-only; conflict/retry behavior remains intact.

### Task 5: Resolve PERM-01 persona switching

**Files:**
- Modify first: `tests/e2e/programs-d1.test.ts:425-467`
- Modify only with product reproduction: `web/lib/session.ts`, `web/lib/app-shell.tsx`, and their focused tests
- Test: `tests/e2e/programs-d1.test.ts:5510-5684`

**Interfaces:**
- Consumes: browser cookies, `efcc_auth_active`, local/session storage, canonical login redirect.
- Produces: deterministic Admin → Member → Admin persona transitions with no stale shell restore and failure-safe grant cleanup.

- [ ] **Step 1: Reproduce the exact timeout**

Run only the PERM-01 test after reseeding. Capture the URL immediately before and after `clearSession`, login response status, destination URL, and shell auth state. Identify whether timeout occurs at `page.goto('/')`, login click, `waitForURL`, or `/programs` heading.

- [ ] **Step 2: Separate helper from product behavior**

Repeat the persona switch using direct browser actions without the shared helper. If product login succeeds, fix the helper's ordering/wait condition. If product login fails, add a focused AppShell/session regression before touching product code.

- [ ] **Step 3: Make one deterministic transition**

The helper must navigate to a same-origin page before storage access, clear cookies and both storage scopes, wait for the login surface, submit once, and wait for the documented post-login destination. Do not wait on the vague predicate `pathname !== '/'` if the canonical flow can transiently remain or return there.

- [ ] **Step 4: Verify cleanup invariants**

Rerun PERM-01 twice from a fresh seed. Confirm the `finally` block re-authenticates Admin, revokes both grants, and clears the final session even after an injected assertion failure in a local diagnostic run.

- [ ] **Step 5: Commit**

Suggested message: `test(s4-b): make persona switching deterministic` if helper-only; use `fix(s4-b): restore session handoff` only if product code changes.

**Acceptance:** PERM-01 passes twice; server-side Member denial remains 403; disposable grants return to baseline.

### Task 6: Isolate and close the Wrangler/Miniflare failure

**Files:**
- Read: `tests/e2e/programs-d1.config.ts`
- Modify only if proven: `tests/e2e/programs-d1.config.ts`, `web/package.json`, `pnpm-lock.yaml`
- Evidence: `docs/qa/2026-08-28-s4-phase-b-foundation.md`

**Interfaces:**
- Consumes: one built Worker, local D1, one sequential Playwright worker, three browser projects.
- Produces: a repeatable local gate in which every test reaches an assertion and the Worker remains responsive.

- [ ] **Step 1: Establish the healthy baseline**

Build, migrate, seed local and demo fixtures, start a fresh Worker, and verify `/` plus one authenticated `/api/v1/auth/me` request before Playwright. Record Worker PID/start time without logging secrets.

- [ ] **Step 2: Run each project with a fresh Worker process**

Run `phone-320`, `phone-390`, and `desktop` separately, preserving the same local D1 between project runs but restarting only Wrangler between runs. Record last completed test, Worker exit status, and complete ProxyController error context.

- [ ] **Step 3: Classify by reproducibility**

If one project/test kills a fresh Worker, rerun that describe/test alone and trace its final request to the owning Worker handler. Fix the application exception there with a focused Worker test. If every project passes alone but cumulative execution kills Wrangler with only `ProxyController`/`Network connection lost`, classify it as process/toolchain lifecycle, not a product assertion.

- [ ] **Step 4: Apply only an evidence-backed harness/toolchain correction**

For an application exception, change only the owning handler. For a confirmed cumulative Wrangler defect, first use the exact locked versions and official Wrangler/Miniflare release evidence to select a version containing the fix; pin the exact version in `web/package.json` and update only the lockfile. If no documented fixed version exists, retain the current dependencies and make the three fresh-Worker project invocations the explicit local gate; do not raise retries/timeouts or suppress connection failures.

- [ ] **Step 5: Re-run the complete matrix**

After all project shards pass, start one fresh Worker and run the unfiltered `programs-d1.config.ts` suite. Expected: all 207 scheduled tests pass and no `Network connection lost`/`ERR_CONNECTION_REFUSED` cascade occurs. If the combined process still dies but all three project gates pass, the evidence report must state the exact isolated toolchain limitation and use the three-project results; publication requires an explicit reviewer READY on that gate substitution.

- [ ] **Step 6: Commit only if files changed**

Suggested message: `fix(test): stabilize local Programs D1 gate`. Do not commit logs, traces, screenshots, local secrets, or D1 files.

**Acceptance:** Every Programs D1 test passes through either the complete invocation or the reviewed three-project local gate; the Worker remains healthy for each required invocation; no connection refusal is counted as a product pass.

### Task 7: Run aggregate Phase B verification

**Files:**
- Execute repository scripts only
- Read touched diffs and accepted Phase B trace

**Interfaces:**
- Consumes: committed Tasks 1–6.
- Produces: exact, reproducible Phase B verification results with no hidden baseline failures.

- [ ] **Step 1: Run focused identity and geometry gates**

Run `pnpm verify:identity`, `pnpm test:shell-responsive`, `pnpm test:shell-geometry`, and `pnpm test:role-hierarchy-geometry`.

- [ ] **Step 2: Run unit/component/type/build gates**

Run `pnpm typecheck`, `pnpm --dir web typecheck`, `pnpm --dir web test`, `pnpm --dir web test:components`, and `pnpm --dir web build`. Expected build output remains 18 static routes unless a deliberate route change is documented; this plan introduces none.

- [ ] **Step 3: Run formatting/lint evidence**

Run `pnpm check` and classify findings. Any new finding in a touched file must be fixed. Existing unrelated Ultracite baseline findings remain named evidence; do not suppress them. Run the normal Husky pre-commit path for every recovery commit.

- [ ] **Step 4: Audit the clean cutover**

Run `git diff --check`. Confirm no `MUI01_GEOMETRY`, custom Playwright reporter, live JSON writer, diagnostic-only code, obsolete candidate CSS, test artifacts, local D1 data, or secrets are tracked.

- [ ] **Step 5: Review against all Phase B rows**

Map final checks back to `B-479-01` through `B-484-08`. Reconfirm all accepted #479–#484 reviewers remain READY or request a focused re-review only for the recovery-owned files.

**Acceptance:** All applicable automated gates pass; known unrelated lint/manual conditions are explicit; every recovery change has focused proof.

### Task 8: Publish Phase B evidence and stop

**Files:**
- Modify: `docs/qa/2026-08-28-s4-phase-b-foundation.md`
- Read: `docs/specs/s4-phase-b-acceptance-trace.md`
- Read: `docs/omp-plans/2026-08-28-s4-phase-b-shared-modules.md`

**Interfaces:**
- Consumes: exact commit hashes and Task 7 outputs.
- Produces: final evidence, one grouped PR for #479–#484, and an explicit Phase C stop.

- [ ] **Step 1: Replace conditional evidence with exact final state**

Record each focused fix, test title, project/viewport, pass count, Worker lifecycle result, aggregate command result, reviewer result, and remaining manual gate. Remove obsolete failure counts only by superseding them with dated final evidence; preserve the historical classification of the failed run.

- [ ] **Step 2: Verify publication identity and branch**

Confirm `gh api user --jq .login` returns `Noahlw`. Confirm the branch is `feat/s4-b-shared-modules-role-definitions`, the stack origin is PR #473, and the immediate base remains the actual Phase A PR #496 branch/head. Do not push if those facts differ; reconcile the plan/evidence first.

- [ ] **Step 3: Push without force and open one grouped PR**

Use title `feat(s4-b): shared UI modules and role definitions`. The body links the acceptance trace and final evidence, names #479–#484 only, records exact verification and manual gates, identifies PR #473/Phase A dependency, and states no merge/deploy/Phase C work. Follow the repository PR-description template so related issues close only on merge.

- [ ] **Step 4: Verify and stop**

Verify PR base/head/state/URL after creation. Confirm the worktree is clean and current, no Phase C files changed, no merge/deploy occurred, and no repository-wide CSS/Tailwind/CVA migration began.

**Acceptance:** Phase B has green local evidence and one open grouped PR; Phase C and the post-Phase-F CSS-to-Tailwind/CVA migration remain unstarted.

## Self-Review Results

- **Spec coverage:** Recovery maps directly to the open MUI-01/PUI-03/EVT-01/HUB-01/PERM-01 observations, the local D1 gate, aggregate checks, evidence, PR, and Phase C stop.
- **Reuse:** The plan reuses existing shadcn/Radix primitives, CVA, Tailwind, lifecycle owners, domain modules, fixtures, and Playwright configuration. It creates no production module.
- **Type consistency:** Existing interfaces remain unchanged. No new shared interface or one-caller CVA variant is introduced.
- **Boring default:** Each deterministic issue has one owner and one focused regression. Infrastructure is classified separately.
- **Reversibility:** Tasks are independently committed. The only optional dependency change requires release evidence and can be reverted as one commit.
- **Essential complexity:** The repository-wide styling migration is explicitly deferred until Phase F; Phase B contains only work required to reach its accepted exit gate.
