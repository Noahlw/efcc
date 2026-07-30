# EFCC E2E Pipeline & Acceptance Repair Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a trustworthy deployed-E2E acceptance pipeline for tickets #69, #70, and #71 by fixing the deployment-provenance gap, spreadsheet configuration, form-protection defects, server-side FORBIDDEN recovery, hostile-content fixtures, accessibility, and evidence routing - all verified against a fresh versioned `/exec`.

**Architecture:** Staged recovery in eight TDD-ordered vertical slices. Phase 1 builds a clasp-based CI deployment seam so every test run proves the exact commit. Phase 2 fixes spreadsheet configuration via Script Properties. Phases 3-4 repair application behavior (FAILED-form data loss, native `<dialog>`, idempotency, server FORBIDDEN RPC). Phase 5 establishes dedicated E2E fixture seeding through the Google Sheets API. Phase 6 adds axe-core + Playwright accessibility checks for #71. Phase 7 fixes evidence routing via Playwright tags/annotations. Phase 8 runs the final role x viewport acceptance matrix.

**Tech Stack:** Google Apps Script (V8, HtmlService IFRAME sandbox), Google Sheets API v4, clasp CLI, Playwright 1.62+, axe-core, GitHub Actions (Environments, concurrency, GITHUB_TOKEN), Vitest, TypeScript, pnpm.

## Design Philosophy (Deep Modules)

This plan follows the deep-module design vocabulary. Every new module is designed as **a lot of behaviour behind a small interface at a clean seam**:

- **Depth** - each module hides complex implementation behind a minimal interface. Callers learn few functions; the module handles the rest.
- **Seam** - the interface lives at a clean seam where tests and callers cross the same boundary. No test reaches past the interface into private internals.
- **Leverage** - one implementation pays back across N call sites and M tests.
- **Locality** - change, bugs, and verification concentrate in one module, not spread across callers.
- **Accept dependencies, don't create them** - modules receive their dependencies as parameters; they never instantiate collaborators internally. This makes every module testable in isolation.
- **Return results, don't produce side effects** - pure functions where possible; side-effecting functions are clearly named and accept their target (e.g., `upsertPlanDoc(path, content)` not `updatePlan()`).
- **The deletion test** - if deleting a module makes complexity vanish, it was a pass-through. If complexity reappears across N callers, it was earning its keep.

Each task below names its **Interface** (what callers/test must know), **Seam** (where the interface lives), and **Depth** (what complexity is hidden).

## Global Constraints

- **AGENTS.md docs-backed method rule:** Every Apps Script API call, manifest field, clasp command, and deployment directive must be backed by official Google Apps Script documentation (Context7 `/websites/developers_google_apps-script` or developers.google.com). Community sources are supplementary only.
- **AGENTS.md headless browser gate:** Every implementation touching the Apps Script web app MUST include an acceptance plan executed against a fresh `/exec` deployment. Unit tests alone cannot prove `google.script.run`, login, navigation, role-gating, and error recovery work together.
- **AGENTS.md no-automatic-Sheet-mutation:** The backend Google Sheet MUST NEVER be modified automatically - EXCEPT for the narrow E2E fixture exception authorized in this plan (Decision 6A/8A/10): CI may seed/reset rows carrying an `E2E_` identifier on the DEV Sheet only, through the Google Sheets API, never through Apps Script.
- **Traditional Chinese:** All user-facing copy must be Traditional Chinese, sourced from a consistent copy source.
- **Test framework:** Vitest for unit tests (`tests/gas/`), Playwright for E2E (`tests/e2e/`), TypeScript strict mode throughout.
- **Package manager:** pnpm 11.7+.
- **Node:** 22+.
- **Deployment model:** `webapp.access: ANYONE_ANONYMOUS`, `webapp.executeAs: USER_DEPLOYING`. Official docs (Context7 `/websites/developers_google_apps-script`): `ANYONE_ANONYMOUS` = "Any user, even if not logged in"; `USER_DEPLOYING` = "the script always executes as you, the owner of the script, no matter who accesses the web app." Anonymous browsers CAN complete `google.script.run` RPCs - ADR-0012's "Google sign-in wall" claim was a misdiagnosis (the real failure was spreadsheet access, not Google auth). E2E uses anonymous browser contexts with EFCC PIN auth only (D5).

## Decision Evidence Register

Every decision below was verified against official documentation via Context7 or direct fetch. No decision relies on assumption or community sources alone.

| # | Decision | Doc source | Key evidence |
|---|----------|-----------|--------------|
| D1 | Staged recovery: deploy/login first, then acceptance gaps | Engineering judgment from code review (A7) | CI cannot distinguish app defects from deployment drift |
| D2 | Script Property `EFCC_SPREADSHEET_ID` via `PropertiesService.getScriptProperties()` | Context7 `/websites/developers_google_apps-script`: "Set Properties with PropertiesService" - `scriptProperties.setProperty('SERVER_URL', ...)` | Script Properties are app-wide config scoped to one Apps Script project |
| D3 | Eligible owner-domain CI identity deploys the tested commit | Context7 `/websites/developers_google_apps-script` (clasp guide): "Setup CLASP Credentials in GitHub Actions" - store `.clasprc.json` and `.clasp.json` as secrets | Official clasp CI/CD pattern |
| D4 | One isolated acceptance deployment, new immutable version per run | Context7 clasp guide: `clasp version [description]` creates immutable version; `clasp redeploy <deploymentId> <version> <description>` moves existing deployment | Versioned deployments cannot be deleted, only archived |
| D5 | Remove Google storage-state secrets; anonymous browser + EFCC PIN only | Context7 `/websites/developers_google_apps-script`: `ANYONE_ANONYMOUS` = "Any user, even if not logged in"; `USER_DEPLOYING` = "the script always executes as you, the owner, no matter who accesses the web app." Web Apps guide (developers.google.com/apps-script/guides/web): no documented Google session cookie requirement for `google.script.run` under this config. Code review proved RPCs complete (returns AUTH_REQUIRED/UNAVAILABLE, not transport failures). | ADR-0012's "sign-in wall" was a misdiagnosis; real failure was spreadsheet access. Anonymous browser + EFCC PIN is sufficient. |
| D6 | Dedicated acceptance Sheet seeded externally by CI through Google Sheets API | Context7 `/websites/developers_google_workspace_sheets_api_reference_rest_v4`: `values.batchUpdate` with `valueInputOption: "RAW"`, `values.batchGet`, `values.batchClear` | Exercises real Sheet -> Apps Script -> RPC -> DOM boundary |
| D6A | E2E mutation exception: DEV Sheet only, `E2E_`-prefixed rows | User authorization (grilling U11) + AGENTS.md policy update | CI may seed/reset `E2E_` rows; production/operational Sheets remain read-only |
| D7 | One worker + setup/teardown Playwright projects + independent tests | Context7 `/microsoft/playwright`: setup project with `teardown` property, `dependencies: ['setup']`, `workers: 1` | Official Playwright project dependency pattern |
| D8 | Same Apps Script project (shared Script Properties) | User choice (grilling U17=2) + Context7: "Script Properties are shared across one Apps Script project; cannot vary by deployment" | One project = one set of Script Properties |
| D8A | Same DEV Sheet with bounded `E2E_` rows, snapshot/restore | Context7 Sheets API: `values.batchGet` snapshots, `values.batchUpdate` with `RAW` restores | Fail-closed: CI mutates only `E2E_`-matched rows |
| D9 | ID search only: locate `E2E_` IDs via `values.batchGet`, update matched rows | User choice (grilling U19=3) + Context7: `values.batchGet` reads ranges, `values.batchUpdate` updates discovered rows | Avoids Developer Metadata setup overhead |
| D10 | Fail closed if expected `E2E_` ID missing or duplicated | Context7: `values.append` finds next row dynamically (can create duplicates on retry) | CI must mutate only rows whose IDs exist exactly once |
| D11 | Playwright tags + annotations drive plan-doc updates | Context7 `/microsoft/playwright`: `test('title', { tag: ['@issue-69'] }, ...)`; tags + annotations in JSON reporter | One appender reads JSON report, updates matching plans |
| D12 | One retry + `failOnFlakyTests: true` in CI | Context7 `/microsoft/playwright` (retries page): "passed"/"flaky"/"failed" categorization; `failOnFlakyTests` config option | Reject flaky acceptance runs while retaining retry diagnostics |
| D13 | Add server-authorized Section-entry RPC returning FORBIDDEN | Context7 `/websites/developers_google_apps-script`: `google.script.run.withFailureHandler().withSuccessHandler().functionName()` | Current RPCs return AUTH_REQUIRED for deactivated accounts, never FORBIDDEN |
| D14 | axe-core + explicit Playwright behavior checks | Context7 `/dequelabs/axe-core`: `AxeBuilder({ page }).include(selector)` for scoped scans; axe-core cannot prove keyboard/focus/geometry | axe target-size rule disabled by default, checks 24px not 44px |
| D15 | Native `<dialog>` + `showModal()` for discard confirmation | MDN `<dialog>` element: `showModal()` sets focus on first focusable, `autofocus` for initial focus, Esc closes modal, content outside is inert | Browser provides modal semantics directly |
| D16 | Script Properties + LockService for demo idempotency | Context7 `/websites/developers_google_apps-script`: `LockService.getScriptLock().waitLock(30000)` + `PropertiesService.getScriptProperties().setProperty()` | CacheService not guaranteed to retain data until expiration |
| D17 | Official clasp CLI workflow for CI deployment | Context7 clasp guide: `clasp push --force`, `clasp version`, `clasp redeploy` | Google documents complete GitHub Actions pattern |
| D18 | Protected PR acceptance job with GitHub Environment + concurrency | GitHub Actions docs: Environments with required reviewers; `concurrency: { group: ..., cancel-in-progress: false }` | One shared acceptance deployment, no concurrent runs |
| D19 | Bot-commit plan updates + raw artifacts via GITHUB_TOKEN | GitHub Actions docs: `permissions: { contents: write }` on evidence job; GITHUB_TOKEN commits don't trigger new workflow runs | Isolated write permission to approved evidence job only |
| D20 | Latest detailed results + immutable run history in plan docs | Context7 `/microsoft/playwright`: JSON report contains start time, duration, outcome, flaky status, retry attempts, errors, attachments | Artifacts expire (90-day default); repo retains durable summary |
| D21 | Reauthorize CI clasp identity with `--extra-scopes` for Sheets API | Context7 `/google/clasp`: default scopes do NOT include `spreadsheets`; `clasp login --extra-scopes https://www.googleapis.com/auth/spreadsheets` | One credential for deployment + bounded fixture edits |

## File Structure & Changes

### Files Created

| File | Responsibility |
|------|---------------|
| `tests/e2e/lib/e2e-helpers.ts` | Shared helpers: `resolveAppFrame()`, `readAppState()`, `login()`, `clickSectionNav()`, viewports, credentials, `APP_READY_TIMEOUT_MS` (eliminates duplication across 3 test files) |
| `tests/e2e/lib/fixture-manager.ts` | **Deep module.** Interface: `setupFixtures(opts) -> Snapshot`, `teardownFixtures(snapshot)`, `resetFixtures(opts)`, `validateFixtureIds(opts)`. Seam: the Sheets API boundary. Hides: `values.batchGet`/`batchUpdate`/`batchClear` with `RAW`, spreadsheet-ID allowlist enforcement, `E2E_`-prefix row location, fail-closed validation. Seeds `E2E_`-prefixed rows in Programs and Program_Leaders tabs (hostile content, test assignments). Users tab is never mutated. |
| `tests/e2e/lib/fixture-reset.ts` | Standalone baseline reset script: writes known-good `E2E_` fixture values directly via Sheets API, regardless of snapshot state. Runnable manually or as CI step with `if: always()`. Used by smart teardown when snapshot is absent (crash recovery). |
| `tests/e2e/lib/deploy-acceptance.ts` | clasp deployment CLI: `clasp push --force`, `clasp version` with commit SHA, `clasp redeploy`, construct `/exec` URL, record version/deployment/commit metadata |
| `tests/e2e/lib/plan-appender-v2.ts` | Tag-driven evidence appender: reads Playwright JSON report, routes results to #69/#70/#71 plan docs by `@issue-*` tags, writes current results table + immutable run history |
| `tests/e2e/setup.ts` | Playwright setup project: (1) invokes `fixture-manager.ts` to validate, snapshot, and seed `E2E_` fixture rows; (2) runs deployment smoke test (assert `/exec` returns `data-app-state="SIGNED_OUT"`). If smoke test fails, all acceptance tests are skipped via Playwright dependency check. |
| `tests/e2e/teardown.ts` | Playwright teardown project: **smart teardown** - checks if `test-results/fixture-snapshot.json` exists. If yes, restores from snapshot. If absent (setup failed), runs `fixture-reset.ts` to write known-good baseline. Runs even when setup fails (Playwright docs confirm teardown is not a dependent project). |
| `tests/e2e/forbidden-recovery.test.ts` | E2E tests for #69 AC #7: real server FORBIDDEN response refreshes authorization, moves to nearest permitted Section |
| `tests/e2e/form-protection-deployed.test.ts` | E2E tests for #70: deployed form-protection scenarios (submit, duplicate, server failure, validation, hostile content, multiline, safe/unsafe links) |
| `tests/e2e/accessibility.test.ts` | E2E tests for #71: axe-core scans, keyboard traversal, focus management, 44x44 geometry, live-region announcements, zoom/overflow/safe-area |
| `tests/e2e/deployment-provenance.test.ts` | E2E test: asserts the deployed `/exec` version matches the tested commit SHA (reads deployment metadata) |
| `tests/gas/forbidden-rpc.test.ts` | Unit test for server-authorized Section-entry RPC returning FORBIDDEN |
| `tests/gas/spreadsheet-config.test.ts` | Unit test for Script Property spreadsheet configuration with fail-fast diagnostics |
| `tests/gas/form-guard-failed-dirty.test.ts` | Unit test: FAILED state must be considered dirty for navigation guards |
| `tests/gas/demo-idempotency-lock.test.ts` | Unit test: LockService + Script Properties idempotency store |
| `tests/gas/deploy-script.test.ts` | Unit test for `deploy-acceptance.ts` clasp command construction |
| `tests/gas/fixture-manager.test.ts` | Unit test for `fixture-manager.ts` snapshot/seed/restore logic |
| `tests/gas/plan-appender-v2.test.ts` | Unit test for tag-driven plan appender routing |
| `docs/specs/071-accessibility-acceptance-plan.md` | Proper #71 accessibility acceptance plan (the existing `071-database-schema.md` is misnamed) |

### Files Modified

| File | Changes |
|------|---------|
| `src/gas/spreadsheet-access.gs` | Replace hard-coded ID with `PropertiesService.getScriptProperties().getProperty('EFCC_SPREADSHEET_ID')` + fail-fast error (D2) |
| `src/gas/Code.gs` | Add `api_authorizedNavigate(userId, sessionId, sessionToken, sectionKey)` RPC returning FORBIDDEN for unauthorized sections (D13); update `api_submitDemoTaskForm` idempotency to use LockService + Script Properties (D16) |
| `src/gas/rpc-envelope.gs` | No structural change; FORBIDDEN code already defined |
| `src/gas/form-guard.js.html` | Fix `isDirty()` to return true for FAILED state (Issue #70 AC #6); replace custom `<div role="dialog">` with native `<dialog>` + `showModal()` (D15) |
| `src/gas/shell-session.js.html` | Call `api_authorizedNavigate` RPC before section render (D13); update dirty-check predicate to use new `isDirty()` (FAILED now dirty); update dialog interaction for native `<dialog>` |
| `src/gas/program-leaders-repository.gs` | Fix null caching bug: cache empty result with a "loaded" flag instead of null (Standards finding #7) |
| `src/gas/styles.html` | Add `min-height: 44px` to `.btn-back`, `.btn-refresh`, `.more-menu-item` (Issue #71 AC #2); add safe-area-inset padding to phone nav (AC #3) |
| `src/gas/appsscript.json` | Add `https://www.googleapis.com/auth/script.scriptapp` scope if needed for LockService (verify via Context7) |
| `tests/e2e/playwright.config.ts` | Remove hard-coded deployment ID allowlist; add setup/teardown projects with dependencies; add `failOnFlakyTests: true`; remove storageState from projects (D5, D7, D12) |
| `tests/e2e/form-protection.test.ts` | Refactor to use shared `e2e-helpers.ts`; add hostile-content assertions with real seeded data |
| `tests/e2e/nested-task-navigation.test.ts` | Refactor to use shared `e2e-helpers.ts`; fix tautological assertions |
| `tests/e2e/role-matrix.test.ts` | Refactor to use shared `e2e-helpers.ts` |
| `tests/e2e/plan-doc-appender.ts` | Replace with `plan-appender-v2.ts` (tag-driven routing); keep old file as deprecated or delete |
| `.github/workflows/e2e.yml` | Restructure: PR checks (no secrets) + acceptance job (GitHub Environment, concurrency, deploy, fixture seed, test, restore, evidence commit) (D3, D4, D17, D18, D19) |
| `package.json` | Add `@axe-core/playwright` devDependency; add deployment/fixture scripts |
| `AGENTS.md` | Update no-Sheet-mutation rule with narrow E2E fixture exception (D6A) |

## What Already Exists

- **Vitest unit tests:** 151 passing in `tests/gas/` covering role navigation, auth/session, RPC envelope, form-guard state machine, programs repository, program-leaders repository.
- **Playwright E2E tests:** 3 spec files (`role-matrix`, `nested-task-navigation`, `form-protection`) with 54 discovered tests, but none executed against a fresh `/exec` with login-gated coverage.
- **`auth.ts`:** Interactive Google sign-in capture script producing `.auth/*.storage.json` - to be replaced by anonymous browser model (D5).
- **`plan-doc-appender.ts`:** Reads Playwright JSON, writes to plan docs - defaults to #67, needs tag-driven routing (D11).
- **Form-guard module:** 5-state machine, `renderMultilineText`, `buildSafeLink`, `confirmDiscard` - needs FAILED-dirty fix and native `<dialog>` migration.
- **Server RPCs:** `api_loginUser`, `api_restoreApp`, `api_logoutUser`, `api_getPrograms`, `api_submitDemoTaskForm` - all session-verified, none emit FORBIDDEN envelope.
- **ADR-0012:** Playwright pipeline strategy with storage-state pattern - to be updated for anonymous auth model.
- **ADR-0013:** Canonical sheet structure (10 tabs, 14 Users columns) - reference for fixture seeding.
- **clasp config:** `.clasp.json` with `scriptId` and `rootDir: "src/gas"`.

## Not In Scope

- Real domain write RPCs (enrollment, attendance) - deferred to #53 and later tickets.
- Server-side CSP or HTTP header control - Apps Script `/exec` is single-origin with no header control.
- Persistent audit log for demo form - 60s ephemeral idempotency only.
- Production deployment - this plan targets the DEV/acceptance deployment only.
- Domain-owned rebuild (`docs/specs/domain-owned-rebuild-acceptance-plan.md`) - separate operational plan, Proposed state.
- Multi-browser E2E - Chromium only (per ADR-0012).
- English language support - Traditional Chinese only.

## ASCII Diagrams

### E2E Pipeline Flow (Target State)

```
PR Push
  |
  v
[PR Checks Job] -- no secrets, lint/typecheck/unit tests
  |
  v (reviewer approves "acceptance" Environment)
[Acceptance Job] -- concurrency-locked, secrets available
  |
  +-- 1. clasp push --force (source -> Apps Script project)
  +-- 2. clasp version <commit-sha> (immutable version)
  +-- 3. clasp redeploy <acceptance-deployment-id> <version> <desc>
  +-- 4. Construct /exec URL from deployment ID
  +-- 5. Fixture setup: Sheets API batchGet (snapshot E2E_ rows)
  +-- 6. Fixture seed: Sheets API batchUpdate (RAW, hostile strings)
  +-- 7. Playwright: setup project -> browser tests -> teardown project
  |      |-- Anonymous browser context (no Google storage state)
  |      |-- EFCC PIN login per role (alice/bob/noah)
  |      |-- Tags: @issue-69, @issue-70, @issue-71
  |      |-- failOnFlakyTests: true, retries: 1
  |      +-- JSON reporter -> test-results/e2e-results.json
  +-- 8. Fixture restore: Sheets API batchUpdate (restore snapshot)
  +-- 9. Evidence: plan-appender-v2 reads JSON, updates #69/#70/#71 plans
  +-- 10. Bot-commit plan docs to PR branch (GITHUB_TOKEN, contents: write)
  +-- 11. Upload raw artifacts (JSON, traces, screenshots) if: always()
```

### Form State Machine (Target - with FAILED-dirty fix)

```
PRISTINE --markDirty()--> DIRTY
SUCCEEDED --markDirty()--> DIRTY
FAILED    --markDirty()--> DIRTY
DIRTY     --beginSubmit()--> SUBMITTING   (returns true)
FAILED    --beginSubmit()--> SUBMITTING   (returns true; RETRY, reuses requestKey)
SUBMITTING --succeeded()--> SUCCEEDED
SUBMITTING --failed()--> FAILED
any       --markPristine()--> PRISTINE

isDirty() returns true for: DIRTY, FAILED  <-- FIX (was: DIRTY only)
isPending() returns true for: SUBMITTING   (unchanged)
Navigation guard blocks when: isDirty() || isPending()  (unchanged predicate, new isDirty)
```

### Server FORBIDDEN Flow (Target)

```
Client: navigateTo_(sectionKey)
  |
  +-- google.script.run
  |     .withSuccessHandler(handleAuthorizedNavigate_)
  |     .withFailureHandler(handleRpcFailure_)
  |     .api_authorizedNavigate(userId, sessionId, sessionToken, sectionKey)
  |
  v
Server: api_authorizedNavigate(...)
  +-- sessionVerify_(sessionId, sessionToken)
  |     +-- ok=false, reason=AUTH_REQUIRED -> rpcFailure_(AUTH_REQUIRED)
  |     +-- ok=false, reason=FORBIDDEN     -> rpcFailure_(FORBIDDEN)
  |     +-- ok=true                        -> continue
  +-- bootstrapSectionsForRole_(role, userId)
  +-- sectionKey in authorized sections?
  |     +-- NO  -> rpcFailure_(FORBIDDEN, "你沒有權限使用此功能")
  |     +-- YES -> rpcSuccess_(requestId, { authorized: true })
  |
  v
Client: handleAuthorizedNavigate_(envelope)
  +-- success=true  -> proceed to renderSection_
  +-- FORBIDDEN     -> refreshAuthorization_() -> re-bootstrap -> nearest permitted
  +-- AUTH_REQUIRED -> clearAuthenticatedClientState_() -> Login
```

## Failure Modes & Gaps

- **clasp credential expiry:** The CI clasp refresh token (`.clasprc.json` stored as secret) may expire. Mitigation: document rotation procedure; fail loudly with diagnostic.
- **Fixture row drift:** If someone manually edits `E2E_` rows in the DEV Sheet between runs, the snapshot/restore may write stale data. Mitigation: fail-closed if ID count != expected.
- **`<dialog>` in Apps Script IFRAME:** Native `<dialog>` is standard HTML but has not been verified inside the Apps Script IFRAME sandbox. Remains Proposed until fresh `/exec` smoke test passes (per AGENTS.md evidence gate).
- **LockService quota:** `waitLock(30000)` may time out under concurrent requests. Mitigation: demo form only; real domain writes deferred.
- **GitHub Environment availability:** Environments with required reviewers require GitHub Pro/Team/Enterprise for private repos. If the repo is public, this is free.
- **Sheets API rate limits:** Fixture setup/teardown makes ~3 API calls per run; well within quotas.
- **#71 is CLOSED on GitHub:** Issue #71 shows as CLOSED. The plan must reconcile with whatever closed-state resolution was recorded. Verify before implementing.

## Parallelization / Worktree Strategy

**Sequential by phase.** Each phase depends on the prior phase's deliverable:

- Phase 1 (deployment) must complete before any `/exec` testing.
- Phase 2 (spreadsheet config) must complete before login works on fresh `/exec`.
- Phases 3-4 (app fixes) can be developed in parallel worktrees but must merge sequentially for testing.
- Phase 5 (fixtures) depends on Phase 1 (deployment) and Phase 2 (spreadsheet config).
- Phase 6 (accessibility) depends on Phases 3-4 (form/dialog fixes).
- Phase 7 (evidence) depends on the test structure from Phases 3-6.
- Phase 8 (final run) depends on everything.

**Within each phase**, tasks are sequential TDD cycles (red -> green -> commit).

---

## Phase 0: Policy Update & Spec Fix

### Task 0.1: Update AGENTS.md with E2E fixture mutation exception

**Files:**
- Modify: `AGENTS.md` (section: "Google Sheet database - no automatic mutation")

**Interfaces:**
- Consumes: Decision D6A/D8A/D10 (bounded `E2E_` fixture exception)
- Produces: Updated policy permitting CI to seed/reset `E2E_`-prefixed rows on the DEV Sheet via Google Sheets API only

**Doc evidence:** User authorization (grilling U11 "For E2e the edit is allowed"); Context7 Sheets API (`values.batchUpdate` with `RAW`); AGENTS.md existing no-mutation rule.

- [ ] **Step 1: Read the current AGENTS.md no-mutation section**
  Run: `cat AGENTS.md` and locate the "Google Sheet database - no automatic mutation" section.

- [ ] **Step 2: Draft the exception amendment**
  Add a subsection after the existing rule:
  - The DEV spreadsheet (`EFCC_SPREADSHEET_ID`) may be seeded/reset by CI for E2E acceptance, BUT ONLY:
    - Through the Google Sheets API (never through Apps Script or Sheets UI automation).
    - For rows whose first-column value starts with `E2E_`.
    - After snapshotting those rows via `values.batchGet` and before restoring them via `values.batchUpdate` with `RAW`.
    - If the expected `E2E_` fixture IDs are missing or duplicated, the run MUST fail closed.
  - Production and operational DEV Sheets (non-`E2E_` rows) remain strictly read-only.

- [ ] **Step 3: Verify the amendment does not contradict ADR-0013**
  Check that ADR-0013's sheet structure is compatible with `E2E_`-prefixed fixture rows in the Users, Programs, and Program_Leaders tabs.

- [ ] **Step 4: Commit**
  Commit message: `docs: amend AGENTS.md no-mutation rule with narrow E2E fixture exception`
  Stage: `AGENTS.md`

### Task 0.2: Create proper #71 accessibility acceptance plan

**Files:**
- Create: `docs/specs/071-accessibility-acceptance-plan.md`
- Modify: `docs/specs/071-database-schema.md` (rename or mark as superseded by ADR-0013)

**Interfaces:**
- Consumes: GitHub issue #71's 13 acceptance criteria
- Produces: Proper acceptance plan doc for #71 with role matrix and viewport requirements

- [ ] **Step 1: Fetch issue #71 from GitHub to confirm current state**
  Run: `gh issue view 71 --json state,title,body`
  Note: #71 is CLOSED on GitHub. Verify what resolution was recorded before creating the plan.

- [ ] **Step 2: Write the acceptance plan**
  Create `docs/specs/071-accessibility-acceptance-plan.md` with:
  - All 13 acceptance criteria from issue #71 (see Decision Evidence Register and subagent research).
  - Role matrix: MEMBER (alice/1234), Program Leader, STAFF (bob/5678), ADMIN (noah/6883) at phone 375x812 and desktop 1280x800.
  - Acceptance trace mapped 1:1 to each AC.
  - Forbidden paths: none specific to #71, but a11y layer overlays #69's recovery behavior.
  - Recovery paths: focus management after error recovery, login transition, discard confirmation.
  - Empty "## Executed results" section (pipeline writes this, not hand-transcribed).

- [ ] **Step 3: Rename or mark 071-database-schema.md**
  Either rename to `docs/specs/database-schema-reference.md` (parented to #70) or add a header noting it is superseded by ADR-0013. Do NOT delete without confirming with the user.

- [ ] **Step 4: Commit**
  Commit message: `docs: create #71 accessibility acceptance plan; rename misnamed 071-database-schema.md`

---

## Phase 1: Deployment CLI Seam (D1, D3, D4, D17, D18)

**Goal:** CI deploys the checked-out commit to an isolated acceptance deployment and proves the tested version matches the commit SHA.

**Public seam:** Deployment CLI - commit SHA in; Apps Script version, deployment ID, `/exec` URL, and verification metadata out.

### Task 1.1: Write failing unit test for deployment script

**Files:**
- Create: `tests/gas/deploy-script.test.ts`
- Test target: `tests/e2e/lib/deploy-acceptance.ts` (not yet created)

**Interfaces:**
- Consumes: clasp CLI command structure (D17)
- Produces: Test proving `buildClaspCommands(commitSha, deploymentId)` returns correct `push`, `version`, `redeploy` command strings

**Doc evidence:** Context7 clasp guide: `clasp push --force`, `clasp version [description]`, `clasp redeploy <deploymentId> <version> <description>`.

- [ ] **Step 1: Write the failing test**
  Test intent: `buildDeployPlan({ commitSha: "abc1234", deploymentId: "AK_foo", scriptId: "1Bar" })` returns an object with:
  - `pushCmd`: `["clasp", "push", "--force"]`
  - `versionCmd`: `["clasp", "version", "abc1234"]`
  - `redeployCmd`: `["clasp", "redeploy", "AK_foo", "<version-number>", "acceptance abc1234"]` (version number captured from versionCmd output at runtime)
  - `execUrl`: `https://script.google.com/macros/s/AK_foo/exec`
  Test framework: Vitest. File: `tests/gas/deploy-script.test.ts`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm vitest run tests/gas/deploy-script.test.ts`
  Expected: FAIL with "Cannot find module" or "buildDeployPlan is not defined"

- [ ] **Step 3: Implement `deploy-acceptance.ts`**
  Create `tests/e2e/lib/deploy-acceptance.ts` with:
  - `buildDeployPlan(opts: { commitSha: string; deploymentId: string; scriptId: string }): DeployPlan` - pure function returning command arrays + URL.
  - `runDeploy(plan: DeployPlan): Promise<DeployResult>` - executes clasp commands via `child_process.execFile`, captures version number from `clasp version` stdout, substitutes into redeploy command, returns `{ execUrl, version, deploymentId, commitSha, timestamp }`.
  - `verifyDeploymentProvenance(result: DeployResult): boolean` - asserts the deployed version's description contains the commit SHA.
  Do NOT include actual clasp credentials in this file; accept them as parameters.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm vitest run tests/gas/deploy-script.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  Commit message: `feat: add clasp deployment CLI seam with provenance verification`
  Stage: `tests/e2e/lib/deploy-acceptance.ts`, `tests/gas/deploy-script.test.ts`

### Task 1.2: Write failing test for exec URL construction and validation

**Files:**
- Modify: `tests/gas/deploy-script.test.ts`
- Modify: `tests/e2e/lib/deploy-acceptance.ts`

**Interfaces:**
- Consumes: `DeployResult` from Task 1.1
- Produces: URL validation replacing the hard-coded `approvedDevDeploymentId` in `playwright.config.ts`

- [ ] **Step 1: Write the failing test**
  Test intent: `buildExecUrl(deploymentId)` returns a valid `/exec` URL matching the regex `^https:\/\/script\.google\.com\/macros\/s\/AK[a-zA-Z0-9_-]+\/exec$`. And `validateExecUrl(url, expectedDeploymentId)` throws if the deployment ID does not match.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm vitest run tests/gas/deploy-script.test.ts`
  Expected: FAIL

- [ ] **Step 3: Implement URL helpers**
  Add `buildExecUrl(deploymentId: string): string` and `validateExecUrl(url: string, expectedDeploymentId: string): void` to `deploy-acceptance.ts`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm vitest run tests/gas/deploy-script.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  Commit message: `feat: add exec URL construction and validation helpers`

### Task 1.3: Restructure GitHub Actions workflow for acceptance deployment

**Files:**
- Modify: `.github/workflows/e2e.yml`

**Interfaces:**
- Consumes: `deploy-acceptance.ts` (Task 1.1); GitHub Environment + concurrency (D18)
- Produces: Two-job workflow: PR checks (no secrets) + acceptance job (secrets, Environment, concurrency-locked)

**Doc evidence:** GitHub Actions docs: Environments with required reviewers (fetched); `concurrency: { group: ..., cancel-in-progress: false }` (fetched); `permissions: { contents: write }` for evidence commit (fetched). Context7 clasp guide: store `.clasprc.json` and `.clasp.json` as GitHub secrets (D3/D17).

- [ ] **Step 1: Draft the new workflow structure**
  The workflow has two jobs:
  1. **`pr-checks`** (runs on every push/PR, no secrets): checkout, pnpm install, typecheck, `pnpm test:gas`, lint. No deployment.
  2. **`acceptance`** (runs after `pr-checks` passes, requires `acceptance` Environment approval, concurrency-locked):
     - `environment: acceptance` (required reviewers configured in repo settings)
     - `concurrency: { group: e2e-acceptance, cancel-in-progress: false }` (D18: no cancellation after fixture setup begins)
     - Steps: decode clasp secrets, `clasp push --force`, `clasp version <sha>`, `clasp redeploy`, set `E2E_TARGET_URL` env, run fixture setup, run Playwright, run fixture teardown, run plan appender, bot-commit evidence, upload artifacts.

- [ ] **Step 2: Add clasp credential steps**
  Store `CLASPRC_JSON` and `CLASP_JSON` as repository secrets (D3). In the workflow:
  ```yaml
  - name: Configure clasp credentials
    env:
      CLASPRC_JSON: ${{ secrets.CLASPRC_JSON }}
      CLASP_JSON: ${{ secrets.CLASP_JSON }}
    run: |
      echo "$CLASPRC_JSON" > ~/.clasprc.json
      echo "$CLASP_JSON" > .clasp.json
  ```
  Doc evidence: Context7 clasp guide "Setup CLASP Credentials in GitHub Actions."

- [ ] **Step 3: Add deployment steps**
  ```yaml
  - name: Deploy to acceptance
    run: pnpm exec tsx tests/e2e/lib/deploy-acceptance.ts --commit-sha ${{ github.sha }} --deployment-id ${{ vars.ACCEPTANCE_DEPLOYMENT_ID }}
  ```
  The script outputs `E2E_TARGET_URL` and deployment metadata to `test-results/deployment-metadata.json`.

- [ ] **Step 4: Add evidence commit step**
  ```yaml
  - name: Commit acceptance evidence
    if: always()
    permissions:
      contents: write
    run: |
      git config user.name "github-actions[bot]"
      git config user.email "github-actions[bot]@users.noreply.github.com"
      git add docs/specs/069-async-recovery-acceptance-plan.md docs/specs/070-form-protection-acceptance-plan.md docs/specs/071-accessibility-acceptance-plan.md
      git commit -m "test: append E2E acceptance results [skip ci]" || true
      git push
  ```
  Doc evidence: GitHub Actions docs - `permissions: { contents: write }`; GITHUB_TOKEN commits don't trigger new workflow runs (D19).

- [ ] **Step 5: Add artifact upload**
  ```yaml
  - name: Upload evidence artifacts
    if: always()
    uses: actions/upload-artifact@v4
    with:
      name: e2e-acceptance-${{ github.sha }}
      path: |
        test-results/
        docs/specs/069-async-recovery-acceptance-plan.md
        docs/specs/070-form-protection-acceptance-plan.md
        docs/specs/071-accessibility-acceptance-plan.md
      retention-days: 90
  ```

- [ ] **Step 6: Commit**
  Commit message: `ci: restructure e2e workflow with acceptance Environment, deployment, and evidence commit`

### Task 1.4: Remove hard-coded deployment ID from playwright.config.ts

**Files:**
- Modify: `tests/e2e/playwright.config.ts`

**Interfaces:**
- Consumes: `E2E_TARGET_URL` env var set by deployment step (Task 1.3)
- Produces: Config that accepts any `/exec` URL from the deployment step, no hard-coded ID

- [ ] **Step 1: Remove `approvedDevDeploymentId` constant and the ID-matching check**
  Keep the regex validation that the URL is a valid `/exec` URL. Remove the exact-string equality check against the hard-coded deployment ID. The deployment provenance is now verified by the deployment script (Task 1.1) and the `deployment-provenance.test.ts` (Phase 1 smoke test).

- [ ] **Step 2: Verify config still rejects non-/exec URLs**
  Run: `E2E_TARGET_URL=https://example.com pnpm exec playwright test --config=tests/e2e/playwright.config.ts --list 2>&1 | head -5`
  Expected: Error "E2E_TARGET_URL must be a Google Apps Script /exec URL"

- [ ] **Step 3: Commit**
  Commit message: `refactor: remove hard-coded deployment ID from playwright config`

---

## Phase 2: Spreadsheet Configuration & Login (D2)

**Goal:** Spreadsheet ID is read from a Script Property with fail-fast diagnostics; login works on a fresh `/exec`.

**Public seam:** Server RPC - `efccSpreadsheet_()` returns a Spreadsheet or throws a diagnostic error.

### Task 2.1: Write failing unit test for Script Property spreadsheet config

**Files:**
- Create: `tests/gas/spreadsheet-config.test.ts`
- Test target: `src/gas/spreadsheet-access.gs`

**Interfaces:**
- Consumes: `PropertiesService.getScriptProperties()` (D2)
- Produces: Test proving `efccSpreadsheet_()` reads `EFCC_SPREADSHEET_ID` from Script Properties and throws a clear error if absent

**Doc evidence:** Context7 `/websites/developers_google_apps-script`: "Set Properties with PropertiesService" - `scriptProperties.setProperty('SERVER_URL', ...)`; `scriptProperties.getProperty(key)`.

- [ ] **Step 1: Write the failing test**
  Test intent:
  - When `PropertiesService.getScriptProperties().getProperty('EFCC_SPREADSHEET_ID')` returns a valid ID, `efccSpreadsheet_()` calls `SpreadsheetApp.openById(id)` and returns the spreadsheet.
  - When the property is absent (null), `efccSpreadsheet_()` throws an Error with message containing "EFCC_SPREADSHEET_ID" and a setup instruction.
  Test framework: Vitest with Apps Script mock environment (same pattern as existing `tests/gas/` tests).

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm vitest run tests/gas/spreadsheet-config.test.ts`
  Expected: FAIL (current code has hard-coded ID, not Script Property)

- [ ] **Step 3: Implement Script Property config in `spreadsheet-access.gs`**
  Replace the hard-coded `EFCC_SPREADSHEET_ID` constant (line 12) with:
  - A function `efccSpreadsheetId_()` that reads `PropertiesService.getScriptProperties().getProperty('EFCC_SPREADSHEET_ID')`.
  - If null/empty, throw `new Error("EFCC_SPREADSHEET_ID Script Property is not set. Open Project Settings > Script Properties and set EFCC_SPREADSHEET_ID to the spreadsheet ID.")`.
  - `efccSpreadsheet_()` calls `efccSpreadsheetId_()` then `SpreadsheetApp.openById(id)`.
  Doc evidence: Context7 confirms `PropertiesService.getScriptProperties().getProperty(key)` is the documented API.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm vitest run tests/gas/spreadsheet-config.test.ts`
  Expected: PASS

- [ ] **Step 5: Update existing tests that depend on hard-coded ID**
  Search for references to the old hard-coded ID `"1bkRPQTCrNKu4MNDTRn-vkTTRMKgV6MEBNfierKDng3o"` in `tests/gas/` and update mocks to set the Script Property instead.

- [ ] **Step 6: Run full unit test suite**
  Run: `pnpm test:gas`
  Expected: All tests pass (may need to update mock setup in shared test helpers).

- [ ] **Step 7: Commit**
  Commit message: `feat: read spreadsheet ID from Script Property with fail-fast diagnostics`

### Task 2.2: Manual setup - set EFCC_SPREADSHEET_ID Script Property

**Files:**
- None (manual operation)

**Interfaces:**
- Consumes: Task 2.1 implementation
- Produces: Script Property set on the Apps Script project

> **Per AGENTS.md:** This is a manual step. State exactly what needs to change and ask the user to perform it.

- [ ] **Step 1: Ask the user to set the Script Property**
  In the Apps Script editor for project `1NvyYCSXEl3dBZzmEPOQNfwJbHm49WFxFFb3OHzENBP45H-myiU0FQppX`:
  - Open Project Settings > Script Properties.
  - Add property `EFCC_SPREADSHEET_ID` with value `1bkRPQTCrNKu4MNDTRn-vkTTRMKgV6MEBNfierKDng3o` (the current DEV spreadsheet ID).
  - Save.

- [ ] **Step 2: Verify login works on fresh `/exec`**
  After the user confirms, push code via clasp and run a cold-start smoke test:
  - Navigate to the `/exec` URL.
  - Assert `data-app-state="SIGNED_OUT"`.
  - Enter alice/1234, submit.
  - Assert `data-app-state="READY"`.
  This is the headless browser gate for Phase 2.

---

## Phase 3: Form Protection Fixes (D15, D16, Issue #70 AC #6)

**Goal:** Failed forms retain data and block navigation; discard confirmation uses native `<dialog>`; demo idempotency uses LockService + Script Properties.

### Task 3.1: Write failing unit test for FAILED-state dirty check

**Files:**
- Create: `tests/gas/form-guard-failed-dirty.test.ts`
- Modify: `src/gas/form-guard.js.html`

**Interfaces:**
- Consumes: `window.EfccFormGuard.create()` state machine
- Produces: Test proving `isDirty()` returns true when state is FAILED

**Doc evidence:** Issue #70 AC #6: "Failed validation, transport, or server responses retain entered values and expose a visible retry or correction path." Code review finding: `isDirty()` returns `state === STATE.DIRTY` only (form-guard.js.html line 59), so FAILED does not block navigation.

- [ ] **Step 1: Write the failing test**
  Test intent: Create a form guard, call `markDirty()` (state -> DIRTY), `beginSubmit()` (state -> SUBMITTING), `failed()` (state -> FAILED). Assert `isDirty()` returns `true` (currently returns `false` - this is the bug). Also assert `getState()` returns `"FAILED"`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm vitest run tests/gas/form-guard-failed-dirty.test.ts`
  Expected: FAIL - `isDirty()` returns false for FAILED state

- [ ] **Step 3: Fix `isDirty()` in `form-guard.js.html`**
  Change `isDirty()` (line 59) from:
  `return state === STATE.DIRTY;`
  to:
  `return state === STATE.DIRTY || state === STATE.FAILED;`
  This means a FAILED form blocks navigation with a discard confirmation, satisfying #70 AC #2 ("Navigating away... from a dirty form requires an explicit discard confirmation") and AC #6 (retain entered values).

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm vitest run tests/gas/form-guard-failed-dirty.test.ts`
  Expected: PASS

- [ ] **Step 5: Run full unit test suite to check for regressions**
  Run: `pnpm test:gas`
  Expected: All pass. If any test asserts `isDirty() === false` for FAILED, update it to reflect the new (correct) behavior.

- [ ] **Step 6: Commit**
  Commit message: `fix: FAILED form state must be dirty to prevent silent data loss (#70 AC #6)`

### Task 3.2: Replace custom discard dialog with native `<dialog>` + `showModal()` (behavior-tested with fallback)

**Files:**
- Modify: `src/gas/form-guard.js.html` (lines 154-258: `confirmDiscard` function)
- Modify: `src/gas/styles.html` (add `dialog::backdrop` and `dialog` styling)
- Create: `tests/gas/form-guard-dialog.test.ts`

**Interface (deep module):**
- `confirmDiscard({ message, onConfirm, restoreFocusTo })` -> returns the dialog element
- Seam: the `window.EfccFormGuard.confirmDiscard` public API. Callers and tests cross the same seam - neither knows whether the implementation is `<dialog>` or `<div>`.
- Depth: dialog creation, focus management, Escape handling, inert background, ARIA labeling all hidden behind one function call.

**Consumes:** HTML `<dialog>` element + `showModal()` API (D15)
**Produces:** Discard confirmation with modal semantics (inert background, focus trap, Escape close). Tests assert **behavior** (focus starts on cancel, Escape closes without confirming, background is inert), not **implementation** (`<dialog>` vs `<div>`).

**Doc evidence:** MDN `<dialog>` element (fetched): `showModal()` sets focus on first nested focusable element; `autofocus` sets initial focus; Esc closes modal by default; content outside becomes inert; `aria-labelledby` for accessible naming. MDN: "Baseline Widely available" since March 2022. Apps Script IFRAME sandbox docs do NOT document restrictions on `<dialog>`.

**Fallback design:** If the fresh `/exec` smoke test (Phase 1) shows `showModal()` doesn't work correctly in the Apps Script IFRAME sandbox, fall back to the existing custom `<div role="dialog">` with manually-implemented: focus trap (tab cycle within dialog), inert background (`aria-hidden` on siblings), Escape key handler, and `aria-labelledby`. The behavior tests pass with either implementation.

- [ ] **Step 1: Write failing behavior tests (not implementation tests)**
  Test intent - assert BEHAVIOR, not DOM structure:
  - `confirmDiscard({ message, onConfirm, restoreFocusTo })` creates a visible modal element.
  - The cancel/safer button receives initial focus (via `autofocus` or manual focus).
  - Pressing Escape closes the modal without calling `onConfirm`.
  - Clicking the confirm button calls `onConfirm()` and closes the modal.
  - Clicking the cancel button closes the modal and restores focus to `restoreFocusTo`.
  - The modal has an accessible name (via `aria-labelledby` or `aria-label`).
  - The modal is announced as a dialog (via `role="dialog"` or native `<dialog>`).
  Do NOT assert `tagName === 'DIALOG'` or `showModal` was called - assert the observable behavior.
  Test framework: Vitest. File: `tests/gas/form-guard-dialog.test.ts`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm vitest run tests/gas/form-guard-dialog.test.ts`
  Expected: FAIL (current implementation lacks `autofocus` on cancel, no `aria-labelledby`)

- [ ] **Step 3: Rewrite `confirmDiscard` to use native `<dialog>`**
  Replace the custom overlay div (lines 154-258) with:
  - Create a `<dialog>` element.
  - Set `aria-labelledby` pointing to the heading element's ID.
  - Add heading "確認離開" (`<h2 id="discard-title">`).
  - Add message text (default: "系統將捨棄尚未儲存的變更，確定要離開嗎？").
  - Add "捨棄變更" button (`.btn btn-danger`) -> calls `onConfirm()`, then `dialog.close()`.
  - Add "繼續編輯" button (`.btn btn-secondary`) with `autofocus` attribute -> calls `dialog.close()`, restores focus to `restoreFocusTo`.
  - Call `dialog.showModal()` (this makes background inert, sets up Escape-to-close, and focuses the autofocus element).
  - Listen for `dialog`'s `close` event: if closed via Escape (not confirm), restore focus to `restoreFocusTo`.
  - Append the dialog to `document.body`.
  - Return the dialog element (for test cleanup).
  Add CSS to `styles.html`: `dialog::backdrop { background: rgba(0,0,0,0.4); }` and `dialog { border-radius: var(--radius-md); padding: var(--space-4); }`.
  Doc evidence: MDN confirms `showModal()` provides inert background, implicit `aria-modal`, Escape-to-close, and focus management.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm vitest run tests/gas/form-guard-dialog.test.ts`
  Expected: PASS

- [ ] **Step 5: Verify in deployed IFRAME (Phase 1 smoke test gate)**
  After fresh `/exec` deployment, verify `showModal()` works in the Apps Script IFRAME:
  - Open `/exec`, login, open a form, make it dirty, attempt navigation.
  - Assert the dialog appears, background is inert, Escape closes it, focus is on cancel.
  - If `showModal()` fails: fall back to enhanced custom `<div role="dialog">` with manual focus trap, inert background, Escape handler. The behavior tests still pass.

- [ ] **Step 6: Update `shell-session.js.html` if it references the old dialog structure**
  Search for `.discard-overlay` selector references in `shell-session.js.html` and update to use `dialog` element selectors if needed.

- [ ] **Step 7: Run full unit test suite**
  Run: `pnpm test:gas`
  Expected: All pass

- [ ] **Step 8: Commit**
  Commit message: `feat: replace custom discard dialog with native <dialog> + showModal() (#71 AC #7, #12)`

### Task 3.3: Upgrade demo idempotency to LockService + Script Properties

**Files:**
- Create: `tests/gas/demo-idempotency-lock.test.ts`
- Modify: `src/gas/Code.gs` (lines 504-601: `api_submitDemoTaskForm`)

**Interface (deep module):**
- `api_submitDemoTaskForm(userId, sessionId, sessionToken, requestKey, fieldValue)` -> `RpcSuccess<{echoedValue, submittedAt, idempotent}> | RpcFailure`
- Seam: the `google.script.run` RPC boundary. Tests cross the same seam as `google.script.run` callers.
- Depth: session verification, userId match, field validation, LockService acquisition, Script Property read/write, CacheService fast-path, TTL cleanup, and response construction all hidden behind one RPC call.

**Consumes:** `LockService.getScriptLock()`, `PropertiesService.getScriptProperties()` (D16)
**Produces:** Idempotency store that survives CacheService eviction, with automatic cleanup of expired entries.

**Doc evidence:** Context7 `/websites/developers_google_apps-script`: `LockService.getScriptLock().waitLock(30000)` acquires a script lock; `PropertiesService.getScriptProperties().setProperty(key, value)` persists key-value; `deleteProperty(key)` removes entries; CacheService "cached data is not guaranteed to remain until its expiration time."

- [ ] **Step 1: Write the failing test**
  Test intent: When `api_submitDemoTaskForm` is called with the same `requestKey` twice:
  - First call acquires the script lock, checks Script Property `demoform_<requestKey>`, finds it absent, processes the form, stores the result in Script Property (with timestamp), releases the lock, returns `{ idempotent: false }`.
  - Second call acquires the lock, finds the Script Property (within TTL), returns the stored result with `{ idempotent: true }`.
  - If the lock cannot be acquired within 30 seconds, returns `UNAVAILABLE`.
  - **Cleanup test:** after processing, the function scans all `demoform_*` keys and deletes entries older than 60 seconds via `deleteProperty()`. Test that old entries are removed and recent entries are retained.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm vitest run tests/gas/demo-idempotency-lock.test.ts`
  Expected: FAIL (current implementation uses CacheService only, no cleanup)

- [ ] **Step 3: Implement LockService + Script Properties idempotency with cleanup**
  In `api_submitDemoTaskForm` (Code.gs lines 504-601):
  - Replace the CacheService-only idempotency (lines 562-590) with:
    1. `var lock = LockService.getScriptLock();`
    2. `lock.waitLock(30000);` (30-second timeout, per Context7 example)
    3. `var scriptProperties = PropertiesService.getScriptProperties();`
    4. `var existing = scriptProperties.getProperty('demoform_' + requestKey);`
    5. If existing and within TTL (60s): parse JSON, `lock.releaseLock()`, return with `idempotent: true`.
    6. If absent or expired: process the form, store result as JSON (with timestamp) in Script Property, `lock.releaseLock()`, return with `idempotent: false`.
    7. **Cleanup (under same lock):** scan all Script Property keys via `getKeys()`, filter for `demoform_*` prefix, parse timestamps, `deleteProperty(key)` for entries older than 60 seconds. This prevents unbounded accumulation (CEO review Issue 8.1).
  - Keep CacheService as a fast-path optimization (check cache first, skip lock if found), but Script Property is the authoritative store.
  Doc evidence: Context7 confirms `PropertiesService.getScriptProperties().deleteProperty(key)` is the documented removal API; `getKeys()` returns all property keys.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm vitest run tests/gas/demo-idempotency-lock.test.ts`
  Expected: PASS

- [ ] **Step 5: Run full unit test suite**
  Run: `pnpm test:gas`
  Expected: All pass

- [ ] **Step 6: Commit**
  Commit message: `feat: upgrade demo idempotency to LockService + Script Properties with TTL cleanup (#70 AC #4)`

### Task 3.4: Fix program-leaders null caching bug

**Files:**
- Modify: `src/gas/program-leaders-repository.gs` (lines 76-102)
- Modify: existing `tests/gas/` tests that cover `programLeadersReadAll_`

**Interfaces:**
- Consumes: Existing repository pattern
- Produces: Cache that works correctly when the Program_Leaders sheet is absent

**Doc evidence:** Code review finding #7 (Standards): `PROGRAM_LEADERS_CACHE_` stays null on the missing-sheet path (line 95), causing every subsequent call to reopen the spreadsheet. ADR-0013 documents this as a known issue.

- [ ] **Step 1: Write the failing test**
  Test intent: When the `Program_Leaders` sheet does not exist, calling `programLeadersReadAll_()` twice should open the spreadsheet only once (cache hit on second call). Currently it opens twice because the cache stays null.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm vitest run tests/gas/`
  Expected: FAIL (spreadsheet opened twice)

- [ ] **Step 3: Fix the caching**
  In `programLeadersReadAll_()` (lines 76-102):
  - Add a module-level `PROGRAM_LEADERS_LOADED_ = false` flag.
  - Change the cache guard (line 77) to: `if (PROGRAM_LEADERS_LOADED_) return PROGRAM_LEADERS_CACHE_;`
  - On the missing-sheet path (line 95-96): set `PROGRAM_LEADERS_CACHE_ = [];` and `PROGRAM_LEADERS_LOADED_ = true;` before `return [];`.
  - On the sheet-exists path (line 100): set `PROGRAM_LEADERS_LOADED_ = true;` alongside `PROGRAM_LEADERS_CACHE_ = rows;`.
  - Add a `programLeadersResetCache_()` test helper that resets both `PROGRAM_LEADERS_CACHE_` and `PROGRAM_LEADERS_LOADED_`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm vitest run tests/gas/`
  Expected: PASS

- [ ] **Step 5: Commit**
  Commit message: `fix: program-leaders cache stays null on missing-sheet path (Standards #7)`

---

## Phase 4: Server FORBIDDEN RPC Seam (D13, Issue #69 AC #7)

**Goal:** A server-authorized Section-entry RPC returns FORBIDDEN for unauthorized **security-guarded** sections, enabling real deployed forbidden-recovery testing.

**Tiered authorization model (CEO review Issue 1.5):**
- **Member-accessible sections** (profile, programs, events): client-side check only. Every authenticated user can access these. No server RPC needed.
- **Security-guarded sections** (scanner, care, permissions): server-side `api_authorizedNavigate` RPC required before render. The client WAITS for the response (no fast path, no race condition).
- The bootstrap DTO (`AuthenticatedBootstrap.sections[]`) includes a `requiresServerAuth: boolean` flag per section. The server is authoritative about which sections need server-side verification.

**Public seam:** Server RPC - `api_authorizedNavigate(userId, sessionId, sessionToken, sectionKey)` returns `RpcSuccess<{authorized: true}>` or `RpcFailure` with code `FORBIDDEN`. Only called for sections where `requiresServerAuth === true`.

### Task 4.1: Write failing unit test for `api_authorizedNavigate` + add `requiresServerAuth` to bootstrap

**Files:**
- Create: `tests/gas/forbidden-rpc.test.ts`
- Modify: `src/gas/Code.gs` (add `api_authorizedNavigate`, update `bootstrapSectionsForRole_` and `AuthenticatedBootstrap` typedef)

**Interface (deep module):**
- `api_authorizedNavigate(userId, sessionId, sessionToken, sectionKey)` -> `RpcSuccess<{authorized: true}> | RpcFailure`
- Seam: the `google.script.run` RPC boundary.
- Depth: session verification, userId match, user lookup, role-based section authorization, FORBIDDEN response, and `rpcLog_` structured logging all hidden behind one RPC call.

**Consumes:** `sessionVerify_()`, `bootstrapSectionsForRole_()`, `rpcSuccess_()`, `rpcFailure_()`, `rpcLog_()`, `rpcRequestId_()` (all existing)
**Produces:** Test proving FORBIDDEN is returned for unauthorized section access; `requiresServerAuth` flag in bootstrap DTO.

**Doc evidence:** Context7 `/websites/developers_google_apps-script`: `google.script.run.withFailureHandler().withSuccessHandler().functionName()` - the client-side RPC boundary. Issue #69 AC #7: "A forbidden response refreshes authorization and moves to the nearest permitted Section." Code review: current RPCs return AUTH_REQUIRED for deactivated accounts, never FORBIDDEN for unauthorized sections.

- [ ] **Step 1: Add `requiresServerAuth` to `bootstrapSectionsForRole_` and `AuthenticatedBootstrap`**
  In `Code.gs`:
  - Update the `AuthenticatedBootstrap` typedef (lines 45-63): add `requiresServerAuth: boolean` to each section in `sections[]`.
  - Update `bootstrapSectionsForRole_` (lines 98-151): set `requiresServerAuth: true` for scanner, care, permissions; `requiresServerAuth: false` for profile, programs, events.
  This is the server telling the client which sections need server-side verification (CEO review Issue 1.5).

- [ ] **Step 2: Write the failing test**
  Test intent (multiple cases):
  - Valid session + authorized guarded section (e.g., STAFF requesting "care") -> `rpcSuccess_(requestId, { authorized: true })`.
  - Valid session + unauthorized guarded section (e.g., MEMBER requesting "care") -> `rpcFailure_(requestId, "FORBIDDEN", "你沒有權限使用此功能")`.
  - Valid session + member-accessible section (e.g., MEMBER requesting "profile") -> `rpcSuccess_(requestId, { authorized: true })` (the RPC still works for any section, but the client only calls it for guarded sections).
  - Invalid session -> `rpcFailure_(requestId, "AUTH_REQUIRED", ...)`.
  - Deactivated account (sessionVerify_ returns reason FORBIDDEN) -> `rpcFailure_(requestId, "FORBIDDEN", ...)`.
  - userId mismatch -> `rpcFailure_(requestId, "AUTH_REQUIRED", ...)` (matching existing mismatch pattern without revoke).
  - Exception during execution -> `rpcFailure_(requestId, "INTERNAL_ERROR", ...)`.
  - `rpcLog_` is called with operation `'authorizedNavigate'`, the requestId, outcome, and duration.

- [ ] **Step 3: Run test to verify it fails**
  Run: `pnpm vitest run tests/gas/forbidden-rpc.test.ts`
  Expected: FAIL - `api_authorizedNavigate` does not exist

- [ ] **Step 4: Implement `api_authorizedNavigate` in `Code.gs`**
  Add function after `api_getPrograms` (around line 480):
  ```
  function api_authorizedNavigate(userId, sessionId, sessionToken, sectionKey) {
    var requestId = rpcRequestId_();
    var start = Date.now();
    try {
      var verified = sessionVerify_(sessionId, sessionToken);
      if (!verified.ok) {
        rpcLog_('authorizedNavigate', requestId, verified.reason, Date.now() - start);
        return rpcFailure_(requestId, verified.reason, ...);
      }
      if (verified.userId !== userId) {
        rpcLog_('authorizedNavigate', requestId, 'AUTH_REQUIRED', Date.now() - start);
        return rpcFailure_(requestId, RPC_CODES.AUTH_REQUIRED, ...);
      }
      var user = usersFindById_(userId);
      if (!user) {
        rpcLog_('authorizedNavigate', requestId, 'NOT_FOUND', Date.now() - start);
        return rpcFailure_(requestId, RPC_CODES.NOT_FOUND, ...);
      }
      var sections = bootstrapSectionsForRole_(user.role, userId);
      var authorized = false;
      for (var i = 0; i < sections.length; i++) {
        if (sections[i].key === sectionKey) { authorized = true; break; }
      }
      if (!authorized) {
        rpcLog_('authorizedNavigate', requestId, 'FORBIDDEN', Date.now() - start);
        return rpcFailure_(requestId, RPC_CODES.FORBIDDEN, "你沒有權限使用此功能（" + sectionKey + "）");
      }
      rpcLog_('authorizedNavigate', requestId, 'OK', Date.now() - start);
      return rpcSuccess_(requestId, { authorized: true });
    } catch (e) {
      rpcLog_('authorizedNavigate', requestId, 'INTERNAL_ERROR', Date.now() - start);
      return rpcFailure_(requestId, RPC_CODES.INTERNAL_ERROR, ...);
    }
  }
  ```
  Follow the same patterns as `api_getPrograms` for error handling. Use `rpcLog_` for structured logging (CEO review Section 7).

- [ ] **Step 5: Run test to verify it passes**
  Run: `pnpm vitest run tests/gas/forbidden-rpc.test.ts`
  Expected: PASS

- [ ] **Step 6: Run full unit test suite**
  Run: `pnpm test:gas`
  Expected: All pass (update existing tests that depend on `AuthenticatedBootstrap` shape to include `requiresServerAuth`)

- [ ] **Step 7: Commit**
  Commit message: `feat: add server-authorized navigate RPC with requiresServerAuth flag (#69 AC #7)`

### Task 4.2: Wire client to call `api_authorizedNavigate` for guarded sections only

**Files:**
- Modify: `src/gas/shell-session.js.html` (lines 531-560: `navigateToImpl_`)

**Interface:**
- Consumes: `api_authorizedNavigate` RPC (Task 4.1); `requiresServerAuth` flag from bootstrap sections (Task 4.1); `google.script.run` (Context7 confirmed)
- Produces: Client that calls the server ONLY for guarded sections and WAITS for response before rendering

**Doc evidence:** Context7 `/websites/developers_google_apps-script`: `google.script.run` is asynchronous with success/failure handlers. MDN: no documented requirement for synchronous authorization, but the tiered model ensures guarded sections are server-verified before render.

- [ ] **Step 1: Update `navigateToImpl_` with tiered authorization**
  The client checks the `requiresServerAuth` flag on the section being navigated to:
  - **If `requiresServerAuth === false`** (profile, programs, events): proceed with existing client-side check (loop through `sections_`). No server RPC. Fast path.
  - **If `requiresServerAuth === true`** (scanner, care, permissions): call `api_authorizedNavigate` and WAIT for response before rendering. No fast path, no race condition (CEO review Issue 1.5).
  ```
  var section = findSection_(sectionKey);  // from sections_ list
  if (section && section.requiresServerAuth) {
    // Guarded section: server must verify before render
    setAppState('LOADING_SECTION');
    google.script.run
      .withSuccessHandler(function(envelope) { handleAuthorizedNavigate_(envelope, sectionKey); })
      .withFailureHandler(function(err) { handleRpcFailure_(err, sectionKey); })
      .api_authorizedNavigate(userId, sessionId, sessionToken, sectionKey);
    return;  // do NOT render yet - wait for server response
  }
  // Member-accessible section: client-side check is sufficient
  // ... existing navigateToImpl_ logic continues ...
  ```
  In `handleAuthorizedNavigate_`:
  - If `envelope.success` -> proceed to existing render logic.
  - If `envelope.error.code === "FORBIDDEN"` -> call `refreshAuthorization_()` (existing function, lines 1620-1624).
  - If `envelope.error.code === "AUTH_REQUIRED"` -> call `clearAuthenticatedClientState_()`.

- [ ] **Step 2: Keep the client-side check as fallback for guarded sections**
  If the server RPC fails with a transport error (not an envelope), the client falls back to the existing client-side check. This ensures a transport failure doesn't block navigation entirely - it just skips the server verification (with a logged warning).

- [ ] **Step 3: Update existing unit tests**
  Tests that call `navigateToImpl_` need to mock `google.script.run.api_authorizedNavigate` for guarded sections. For member-accessible sections, no mock is needed (client-side check only). Update the test harness accordingly.

- [ ] **Step 4: Run full unit test suite**
  Run: `pnpm test:gas`
  Expected: All pass

- [ ] **Step 5: Commit**
  Commit message: `feat: wire client to call server-authorized navigate RPC for guarded sections only`

---

## Phase 5: E2E Test Data, Fixtures & Auth Model (D5, D6, D8, D9, D10, D21, D7)

**Goal:** CI seeds/restores `E2E_` fixture rows on the DEV Sheet via Google Sheets API; Playwright uses anonymous browser contexts with EFCC PIN auth; setup/teardown projects handle fixture lifecycle.

### Task 5.1: Write failing unit test for fixture manager

**Files:**
- Create: `tests/gas/fixture-manager.test.ts`
- Test target: `tests/e2e/lib/fixture-manager.ts`

**Interface (deep module):**
- `setupFixtures(opts: { spreadsheetId, credentials }) -> Snapshot` - validates, snapshots, and seeds E2E_ rows.
- `teardownFixtures(snapshot: Snapshot) -> void` - restores from snapshot.
- `resetFixtures(opts: { spreadsheetId, credentials }) -> void` - writes known-good baseline (crash recovery).
- `validateFixtureIds(opts: { spreadsheetId, credentials, expectedIds }) -> void` - fail-closed check.
- Seam: the Google Sheets API boundary. Tests mock the Sheets API calls; the fixture logic is tested through the public interface.
- Depth: `values.batchGet`/`batchUpdate`/`batchClear` with `RAW`, spreadsheet-ID allowlist enforcement, `E2E_`-prefix row location, fail-closed validation, hostile content handling, and snapshot/restore lifecycle all hidden behind 4 functions.

**Consumes:** Google Sheets API `values.batchGet`, `values.batchUpdate`, `values.batchClear` (D6, D9, D10)
**Produces:** Test proving snapshot/seed/restore/reset logic with fail-closed validation.

**Fixture data target (CEO review Issue 1.4):** Seeds `E2E_`-prefixed rows in the **Programs** and **Program_Leaders** tabs only. The **Users tab is never mutated** - tests log in as real users (alice/bob/noah). The fixture programs contain hostile content that alice/bob/noah will see when browsing Programs.

**Doc evidence:** Context7 `/websites/developers_google_workspace_sheets_api_reference_rest_v4`:
- `values.batchGet`: GET, returns `valueRanges[]` for specified ranges.
- `values.batchUpdate`: POST, sets values with `valueInputOption: "RAW"` (stores hostile strings as literal values, not formulas).
- `values.batchClear`: POST, clears specified ranges.
- `values.append`: POST, finds table dynamically (can create duplicates on retry - this is why we fail-closed, D10).

- [ ] **Step 1: Write the failing test**
  Test intent (multiple cases):
  - `validateFixtureIds({ spreadsheetId, expectedIds })` reads the **Programs** tab, finds rows where the `Program_ID` column starts with `E2E_`. If any expected ID is missing or appears more than once, throws an error (fail-closed, D10).
  - `setupFixtures({ spreadsheetId, credentials })` calls `validateFixtureIds`, then `snapshotFixtures` (via `values.batchGet` on Programs and Program_Leaders ranges), then `seedFixtures` (via `values.batchUpdate` with `valueInputOption: "RAW"`). Asserts the spreadsheet ID is in the allowlist before writing. Returns the snapshot.
  - `teardownFixtures(snapshot)` calls `values.batchUpdate` with the snapshot values to restore original state.
  - `resetFixtures({ spreadsheetId, credentials })` writes known-good baseline `E2E_` fixture values directly (crash recovery, CEO review Issue 1.2). Does NOT require a snapshot.
  - Hostile content is included in seed data: `<script>alert(1)</script>`, `javascript:alert(1)`, `<img onerror=alert(1)>`, multiline text with `\n`, safe HTTPS link, unsafe `javascript:` link.
  - The allowlist contains ONLY the DEV Sheet ID. Any other spreadsheet ID causes an error.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm vitest run tests/gas/fixture-manager.test.ts`
  Expected: FAIL - module not found

- [ ] **Step 3: Implement `fixture-manager.ts`**
  Create `tests/e2e/lib/fixture-manager.ts` with:
  - Uses `googleapis` npm package (or direct REST calls with `fetch`) to call the Sheets API.
  - Authenticates using the clasp OAuth refresh token (reauthorized with `--extra-scopes https://www.googleapis.com/auth/spreadsheets`, D21) or a separate service account.
  - **Accepts dependencies as parameters** (deep-module principle): the Sheets API client, the spreadsheet ID, and credentials are passed in, not created internally.
  - Functions: `setupFixtures()`, `teardownFixtures()`, `resetFixtures()`, `validateFixtureIds()`.
  - All writes use `valueInputOption: "RAW"` (Context7 confirmed: stores hostile strings as literal values).
  - Asserts `spreadsheetId` is in a hardcoded allowlist containing only the DEV Sheet ID before any write.
  - Fixture data targets the **Programs** tab: `E2E_HOSTILE_PROGRAM` (with `<script>alert(1)</script>` as name, multiline description, safe/unsafe links), `E2E_MULTILINE_PROGRAM` (with `\n` in description), `E2E_NORMAL_PROGRAM` (benign data for baseline assertions).
  - Fixture data targets the **Program_Leaders** tab: `E2E_LEADER_ASSIGNMENT` linking real alice/bob/noah to E2E_ programs (so they see hostile content when browsing Programs).
  - `resetFixtures()` writes the known-good baseline values for all E2E_-prefixed rows. This is the crash-recovery fallback (CEO review Issue 1.2).

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm vitest run tests/gas/fixture-manager.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  Commit message: `feat: add Sheets API fixture manager with snapshot/seed/restore/reset and fail-closed validation`

### Task 5.2: Add `@axe-core/playwright` dependency and clasp scopes

**Files:**
- Modify: `package.json`
- Manual: Reauthorize clasp CI credential with `--extra-scopes`

**Doc evidence:** Context7 `/dequelabs/axe-core`: `AxeBuilder({ page }).include(selector)` for scoped scans. Context7 `/google/clasp`: `clasp login --extra-scopes https://www.googleapis.com/auth/spreadsheets` (default scopes do NOT include `spreadsheets`, D21).

- [ ] **Step 1: Install `@axe-core/playwright`**
  Run: `pnpm add -D @axe-core/playwright`

- [ ] **Step 2: Document the clasp reauthorization procedure**
  The CI clasp credential must be reauthorized with:
  ```
  clasp login --extra-scopes https://www.googleapis.com/auth/spreadsheets
  ```
  Store the resulting `.clasprc.json` as the `CLASPRC_JSON` secret. This grants both deployment (clasp default scopes) and Sheets API (extra scope) access with one credential (D21).
  This is a manual step - ask the user to perform it and update the CI secret.

- [ ] **Step 3: Commit**
  Commit message: `deps: add @axe-core/playwright; document clasp --extra-scopes reauthorization`

### Task 5.3: Create shared E2E helpers module

**Files:**
- Create: `tests/e2e/lib/e2e-helpers.ts`
- Modify: `tests/e2e/form-protection.test.ts`, `tests/e2e/nested-task-navigation.test.ts`, `tests/e2e/role-matrix.test.ts`

**Interfaces:**
- Consumes: Existing duplicated helpers from 3 test files
- Produces: Single shared module eliminating ~150 lines of duplication

- [ ] **Step 1: Extract shared helpers**
  Create `tests/e2e/lib/e2e-helpers.ts` with:
  - `CREDENTIALS_BY_PROJECT`: `{ alice: { username, pin }, bob: ..., noah: ... }` (currently duplicated in 3 files).
  - `PHONE_VIEWPORT = { width: 375, height: 812 }`, `DESKTOP_VIEWPORT = { width: 1280, height: 800 }`.
  - `APP_READY_TIMEOUT_MS = 30_000`.
  - `readAppState(frame: Frame): Promise<string>`.
  - `resolveAppFrame(page: Page): Promise<Frame>`.
  - `login(frame: Frame, role: Role): Promise<void>` - enters username/PIN, clicks submit, waits for READY.
  - `clickSectionNav(frame: Frame, sectionKey: string): Promise<void>`.

- [ ] **Step 2: Update the 3 test files to import from shared module**
  Replace local definitions with imports from `./lib/e2e-helpers`.

- [ ] **Step 3: Run typecheck**
  Run: `pnpm typecheck`
  Expected: PASS

- [ ] **Step 4: Commit**
  Commit message: `refactor: extract shared E2E helpers to eliminate duplication across 3 test files`

### Task 5.4: Restructure playwright.config.ts with setup/teardown projects

**Files:**
- Modify: `tests/e2e/playwright.config.ts`
- Create: `tests/e2e/setup.ts`, `tests/e2e/teardown.ts`

**Interfaces:**
- Consumes: `fixture-manager.ts` (Task 5.1); Playwright project dependencies (D7)
- Produces: Config with setup -> browser tests -> teardown lifecycle, anonymous browser (no storageState), `failOnFlakyTests: true`

**Doc evidence:** Context7 `/microsoft/playwright`: setup project with `teardown: 'teardown'` property; browser test project with `dependencies: ['setup']`; `workers: 1` for shared resources. Playwright retries page (fetched): `retries: 1` + `failOnFlakyTests: true` rejects flaky tests in CI (D12).

- [ ] **Step 1: Write `setup.ts`**
  A Playwright setup project that runs before all tests:
  - Calls `validateFixtureIds()` to assert all expected `E2E_` IDs exist exactly once.
  - Calls `snapshotFixtures()` to save current state.
  - Calls `seedFixtures()` to write hostile/multiline/safe/unsafe test data.
  - Saves the snapshot to `test-results/fixture-snapshot.json` for teardown.

- [ ] **Step 2: Write `teardown.ts`**
  A Playwright teardown project that runs after all tests (even on failure):
  - Reads `test-results/fixture-snapshot.json`.
  - Calls `restoreFixtures()` to write back the original values.

- [ ] **Step 3: Restructure `playwright.config.ts`**
  Replace the 3 role-based projects (alice/bob/noah with storageState) with:
  ```typescript
  export default defineConfig({
    workers: 1,
    fullyParallel: false,
    retries: 1,
    failOnFlakyTests: true,  // D12: reject flaky acceptance runs
    reporter: [["list"], ["json", { outputFile: "test-results/e2e-results.json" }]],
    use: {
      baseURL: targetUrl,
      trace: "retain-on-failure",
      // No storageState - anonymous browser (D5)
    },
    projects: [
      {
        name: "setup",
        testMatch: /setup\.ts/,
        teardown: "teardown",  // teardown runs even if setup fails (Playwright docs)
      },
      {
        name: "teardown",
        testMatch: /teardown\.ts/,
        // NOT a dependent of setup - runs regardless (smart teardown, CEO review Issue 2.1)
      },
      {
        name: "acceptance",
        testMatch: /.*\.test\.ts/,
        dependencies: ["setup"],  // skipped if setup fails (Playwright docs)
        use: { ...devices["Desktop Chrome"] },
      },
    ],
  });
  ```
  Remove the `approvedDevDeploymentId` hard-coded constant (done in Task 1.4). Remove all `storageState` references (D5: anonymous browser + EFCC PIN auth only).
  Doc evidence: Context7 `/microsoft/playwright`: "When a project has a dependency that fails, dependent projects are automatically skipped." Teardown is NOT a dependent (configured via `teardown` property, not `dependencies`), so it runs even when setup fails.

- [ ] **Step 4: Write `setup.ts` with fixture seed + deployment smoke test**
  The setup project does TWO things (CEO review Issue 2.2):
  1. **Fixture setup:** calls `setupFixtures()` from `fixture-manager.ts` to validate, snapshot, and seed E2E_ rows.
  2. **Deployment smoke test:** opens the deployed `/exec` URL in an anonymous browser context and asserts `data-app-state="SIGNED_OUT"`. If this fails, the setup project fails, and ALL acceptance tests are skipped via the dependency check. This gives one clear "deployment is broken" message instead of 50 cryptic timeouts.
  If fixture setup fails before the smoke test, write a `test-results/setup-failed.json` marker so teardown knows to run `resetFixtures()` instead of snapshot restore.

- [ ] **Step 5: Write `teardown.ts` with smart fallback**
  The teardown project checks for `test-results/fixture-snapshot.json` (CEO review Issue 2.1):
  - **If snapshot exists:** call `teardownFixtures(snapshot)` to restore original values.
  - **If snapshot absent** (setup failed before snapshot): call `resetFixtures()` to write known-good baseline.
  - **If `test-results/setup-failed.json` exists** (setup failed mid-seed): call `resetFixtures()` unconditionally to ensure clean Sheet.
  This ensures the DEV Sheet is always clean after a CI run, regardless of where it failed.

- [ ] **Step 6: Verify config loads**
  Run: `E2E_TARGET_URL=https://script.google.com/macros/s/AKtest/exec pnpm exec playwright test --config=tests/e2e/playwright.config.ts --list 2>&1 | head -20`
  Expected: Lists tests from setup, teardown, and acceptance projects.

- [ ] **Step 7: Commit**
  Commit message: `feat: restructure playwright config with smart setup/teardown, anonymous auth, failOnFlakyTests, deployment smoke test`

### Task 5.5: Write deployment-provenance E2E test

**Files:**
- Create: `tests/e2e/deployment-provenance.test.ts`

**Interface:**
- Consumes: `test-results/deployment-metadata.json` (from deploy step)
- Produces: E2E test asserting the deployed version matches the tested commit

**Note:** The deployment smoke test (assert `/exec` returns `SIGNED_OUT`) has been moved to the **setup project** (Task 5.4 Step 4) so a broken deployment skips all tests with one clear message. This test verifies the **provenance metadata** (commit SHA, version, deployment ID) rather than the smoke-test assertion.

- [ ] **Step 1: Write the test**
  Test intent: Read `test-results/deployment-metadata.json` (written by `deploy-acceptance.ts` in CI). Assert `metadata.commitSha` matches `process.env.GITHUB_SHA` (or a local test SHA). Assert `metadata.execUrl` is a valid `/exec` URL. Assert `metadata.version` is a positive integer. Tag: `@issue-69` (provenance is a #69 AC #12 requirement).

- [ ] **Step 2: Commit**
  Commit message: `test: add deployment-provenance E2E test (#69 AC #12)`

---

## Phase 6: Accessibility (#71, D14)

**Goal:** axe-core scans + explicit Playwright behavior checks cover all 13 #71 acceptance criteria.

**Public seam:** Accessibility seam - semantic DOM, keyboard behavior, focus, announcements, target dimensions, axe results.

### Task 6.1: Write accessibility E2E tests - structural semantics

**Files:**
- Create: `tests/e2e/accessibility.test.ts`

**Interfaces:**
- Consumes: `@axe-core/playwright` (Task 5.2), `e2e-helpers.ts` (Task 5.3), deployed `/exec` (Phase 1)
- Produces: Tests for #71 AC #1, #2, #3, #4, #5, #9, #10

**Doc evidence:** Context7 `/dequelabs/axe-core`: `AxeBuilder({ page }).include(selector)` for scoped scans; axe-core target-size rule disabled by default, checks 24px not 44px - EFCC needs its own geometry assertions (D14). Issue #71 ACs.

- [ ] **Step 1: Write tests for AC #1 (768px breakpoint)**
  Test intent: At 375px width, phone bottom nav is visible and desktop side nav is hidden. At 768px width, desktop side nav is visible and phone bottom nav is hidden. Authorization model unchanged (same sections visible at both widths).

- [ ] **Step 2: Write tests for AC #2 (44x44 target sizes)**
  Test intent: Use Playwright's `boundingBox()` to assert minimum 44x44 CSS-pixel area for:
  - `.btn-back` (currently ~32px tall - needs CSS fix from Phase 3)
  - `.btn-refresh` (currently ~22px tall - needs CSS fix)
  - `.more-menu-item` (currently ~32px tall - needs CSS fix)
  - `.nav-item-phone` (already 48px - should pass)
  Tag: `@issue-71`.

- [ ] **Step 3: Write tests for AC #3 (safe-area insets)**
  Test intent: Assert phone nav has `padding-bottom` or `env(safe-area-inset-bottom)` applied. Assert no focused control is covered by the fixed nav (scroll into view if needed).

- [ ] **Step 4: Write tests for AC #4 (no horizontal overflow)**
  Test intent: At 375px width and at 200% browser zoom, assert `document.documentElement.scrollWidth <= document.documentElement.clientWidth` (no horizontal scrollbar for core content).

- [ ] **Step 5: Write tests for AC #5 (semantic nav markup)**
  Test intent: Assert root navigation uses `<nav>` element with `aria-label`. Assert current section has `aria-current="page"`. Assert nav items have accessible names (text content or `aria-label`).

- [ ] **Step 6: Write tests for AC #9 (non-color state cues)**
  Test intent: Assert active nav item has both a color change AND a text/icon/aria attribute (e.g., `aria-current="page"`). Assert error states have text, not just red color. Assert disabled buttons have `disabled` attribute or `aria-disabled`.

- [ ] **Step 7: Write tests for AC #10 (badge accessible labels)**
  Test intent: Assert count badges have `aria-label` (e.g., `aria-label="3 則訊息"`). Assert the badge is not the nav item's only `accessible name` (the nav item should have its own text label).

- [ ] **Step 8: Run tests to verify they fail**
  Run: `pnpm exec playwright test --config=tests/e2e/playwright.config.ts tests/e2e/accessibility.test.ts --grep "@issue-71"`
  Expected: FAIL (CSS fixes not yet applied, axe violations present)

- [ ] **Step 9: Commit**
  Commit message: `test: add accessibility structural semantics tests (#71 AC #1-5, #9-10)`

### Task 6.2: Write accessibility E2E tests - keyboard & focus

**Files:**
- Modify: `tests/e2e/accessibility.test.ts`

**Interfaces:**
- Consumes: Playwright keyboard API, `e2e-helpers.ts`
- Produces: Tests for #71 AC #6, #7, #8, #12

- [ ] **Step 1: Write tests for AC #6 (keyboard traversal)**
  Test intent: Tab through all nav items, More menu items, Back button, Refresh button, retry button, and form controls in DOM order. Assert each is focusable (`isFocused()`) and activatable via Enter/Space.

- [ ] **Step 2: Write tests for AC #7 (focus management)**
  Test intent:
  - After root navigation: focus moves to the new section's heading or first control.
  - After nested task entry: focus moves into the task view.
  - After nested task exit (Back): focus returns to the originating nav item.
  - After error recovery (retry): focus moves to the retry button or section content.
  - After Login transition: focus moves to the first nav item or Profile heading.
  - After discard confirmation (cancel): focus returns to the form field.
  - After discard confirmation (confirm): focus moves to the new section.

- [ ] **Step 3: Write tests for AC #8 (live-region announcements)**
  Test intent: Assert a live region (`[aria-live]` or `[role="status"]`) exists and receives text for: loading, success, validation, error, forbidden, session-expired states. Assert the region does not repeat the same message (no noise).

- [ ] **Step 4: Write tests for AC #12 (axe-core scans)**
  Test intent: Run `AxeBuilder({ page }).include('#app')` on:
  - Login view (SIGNED_OUT state).
  - Root navigation (READY state, each section).
  - Nested task view.
  - Retry/error view.
  - Discard confirmation dialog (native `<dialog>` from Phase 3).
  Assert zero violations (or document known incomplete items).
  Tag: `@issue-71`.

- [ ] **Step 5: Commit**
  Commit message: `test: add keyboard, focus, live-region, and axe-core accessibility tests (#71 AC #6-8, #12)`

### Task 6.3: Apply CSS fixes for 44x44 target sizes and safe-area insets

**Files:**
- Modify: `src/gas/styles.html`

**Interfaces:**
- Consumes: #71 AC #2, #3 requirements
- Produces: CSS meeting 44x44 minimum and safe-area insets

- [ ] **Step 1: Add `min-height: 44px` to undersized interactive elements**
  - `.btn-back` (lines 431-447): add `min-height: 44px;`.
  - `.btn-refresh` (lines 500-516): add `min-height: 44px;` and increase `padding` to `var(--space-2) var(--space-3)` (8px 12px).
  - `.more-menu-item` (lines 382-399): add `min-height: 44px;`.

- [ ] **Step 2: Add safe-area-inset padding to phone nav**
  On the phone bottom nav container, add:
  ```css
  padding-bottom: env(safe-area-inset-bottom, 0px);
  ```

- [ ] **Step 3: Run accessibility tests to verify geometry passes**
  Run: `pnpm exec playwright test --config=tests/e2e/playwright.config.ts tests/e2e/accessibility.test.ts --grep "44"`
  Expected: PASS (after fresh deploy)

- [ ] **Step 4: Commit**
  Commit message: `fix: add 44x44 min target sizes and safe-area insets (#71 AC #2, #3)`

---

## Phase 7: Evidence Routing (D11, D12, D19, D20)

**Goal:** Playwright tags drive plan-doc updates; evidence is bot-committed with run history.

### Task 7.1: Write failing unit test for tag-driven plan appender

**Files:**
- Create: `tests/gas/plan-appender-v2.test.ts`
- Test target: `tests/e2e/lib/plan-appender-v2.ts`

**Interfaces:**
- Consumes: Playwright JSON report with `@issue-*` tags (D11); plan docs for #69/#70/#71
- Produces: Test proving results are routed to the correct plan doc by tag

**Doc evidence:** Context7 `/microsoft/playwright`: `test('title', { tag: ['@issue-69'] }, ...)` - tags in JSON reporter output. JSON report contains: suites, specs, tests, results, status, retry count, errors, attachments (D20).

- [ ] **Step 1: Write the failing test**
  Test intent:
  - Given a Playwright JSON report with tests tagged `@issue-69`, `@issue-70`, and `@issue-71`:
  - `routeResultsByTag(jsonReport)` returns `{ "069": [...rows], "070": [...rows], "071": [...rows] }`.
  - Each row contains: test title, status (passed/failed/flaky), retry count, error message, tags.
  - Tests with multiple tags (e.g., `[@issue-69, @issue-71]`) appear in both plan docs.
  - `renderPlanSection(rows, runMetadata)` produces a markdown table with: criterion, assertion, pass/fail, detail, and a run history line (SHA, version, deployment ID, timestamp, outcome, run URL).
  - `upsertPlanDoc(planDocPath, sectionContent)` replaces the existing `## Executed results` section or appends if absent, and appends a compact entry to a `## Run history` section.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm vitest run tests/gas/plan-appender-v2.test.ts`
  Expected: FAIL - module not found

- [ ] **Step 3: Implement `plan-appender-v2.ts`**
  Create `tests/e2e/lib/plan-appender-v2.ts` with:
  - `routeResultsByTag(jsonReport: JSONReport): Record<string, ResultRow[]>` - extracts `@issue-NNN` tags from each test, groups results by issue number.
  - `renderPlanSection(rows: ResultRow[], metadata: RunMetadata): string` - renders markdown table + run history entry.
  - `RunMetadata`: `{ commitSha, appsScriptVersion, deploymentId, timestamp, outcome, runUrl }`.
  - `upsertPlanDoc(planDocPath: string, sectionContent: string, historyEntry: string): void` - reads plan doc, replaces `## Executed results` section, appends to `## Run history` section.
  - Plan doc mapping: `@issue-69` -> `docs/specs/069-async-recovery-acceptance-plan.md`, `@issue-70` -> `docs/specs/070-form-protection-acceptance-plan.md`, `@issue-71` -> `docs/specs/071-accessibility-acceptance-plan.md`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm vitest run tests/gas/plan-appender-v2.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  Commit message: `feat: add tag-driven plan appender with run history (#69/#70/#71 routing)`

### Task 7.2: Tag all E2E tests with issue annotations

**Files:**
- Modify: `tests/e2e/form-protection.test.ts`, `tests/e2e/nested-task-navigation.test.ts`, `tests/e2e/role-matrix.test.ts`, `tests/e2e/accessibility.test.ts`, `tests/e2e/forbidden-recovery.test.ts`, `tests/e2e/form-protection-deployed.test.ts`, `tests/e2e/deployment-provenance.test.ts`

**Interfaces:**
- Consumes: Playwright tag syntax (D11)
- Produces: All tests tagged with `@issue-69`, `@issue-70`, or `@issue-71`

**Doc evidence:** Context7 `/microsoft/playwright`: `test('title', { tag: ['@issue-69'] }, async ({ page }) => { ... })` - new object syntax for tags.

- [ ] **Step 1: Add tags to existing tests**
  - `role-matrix.test.ts`: tag `@issue-67` (existing, for #67 plan doc).
  - `nested-task-navigation.test.ts`: tag `@issue-68`.
  - `form-protection.test.ts`: tag `@issue-70`.
  - `forbidden-recovery.test.ts`: tag `@issue-69`.
  - `accessibility.test.ts`: tag `@issue-71`.
  - `deployment-provenance.test.ts`: tag `@issue-69`.
  - `form-protection-deployed.test.ts`: tag `@issue-70`.
  - Tests covering multiple issues get multiple tags.

- [ ] **Step 2: Verify tags appear in JSON report**
  Run: `pnpm exec playwright test --config=tests/e2e/playwright.config.ts --list 2>&1 | grep "@issue"`
  Expected: All tests show their tags.

- [ ] **Step 3: Commit**
  Commit message: `test: tag all E2E tests with @issue-* annotations for evidence routing`

### Task 7.3: Write forbidden-recovery and form-protection-deployed E2E tests

**Files:**
- Create: `tests/e2e/forbidden-recovery.test.ts`
- Create: `tests/e2e/form-protection-deployed.test.ts`

**Interfaces:**
- Consumes: `api_authorizedNavigate` (Phase 4), `e2e-helpers.ts` (Task 5.3), fixture data (Task 5.1)
- Produces: E2E tests for #69 AC #7 and #70 AC #2-#12

- [ ] **Step 1: Write `forbidden-recovery.test.ts`**
  Tests for #69 AC #7:
  - Login as MEMBER (alice), navigate to an authorized section (Profile).
  - Attempt to navigate to an unauthorized section (Care/Permissions) via the server RPC.
  - Assert the server returns FORBIDDEN.
  - Assert `refreshAuthorization_()` is called, re-bootstrap occurs.
  - Assert user is moved to the nearest permitted Section (Profile or Programs).
  - Assert the forbidden view ("無法存取") is shown briefly before recovery.
  Tag: `@issue-69`.

- [ ] **Step 2: Write `form-protection-deployed.test.ts`**
  Tests for #70 AC #2-#12 (the scenarios missing from current `form-protection.test.ts`):
  - Dirty-form navigation triggers discard confirmation (phone + desktop).
  - Cancel discard retains values, validation messages, focus context.
  - Successful submission via `google.script.run` (real RPC, not mock).
  - Duplicate submit while pending is suppressed (button disabled, no duplicate write).
  - Server failure retains entered values, exposes retry.
  - Transport failure retains entered values, exposes retry.
  - Validation failure retains entered values, shows validation message.
  - Hostile Sheet content (seeded via fixture) renders safely: `<script>` tags don't execute, `javascript:` links are neutralized, event-handler text is inert, multiline text preserves line breaks.
  - Session expiry during form: clears state, returns to Login.
  - Logout from dirty form: triggers discard confirmation.
  Tag: `@issue-70`.

- [ ] **Step 3: Commit**
  Commit message: `test: add forbidden-recovery and form-protection-deployed E2E tests (#69 AC #7, #70 AC #2-12)`

### Task 7.4: Replace plan-doc-appender with v2 in workflow

**Files:**
- Modify: `.github/workflows/e2e.yml`
- Modify: `package.json` (update `posttest:e2e` script)
- Deprecate: `tests/e2e/plan-doc-appender.ts` (keep for backward compat or delete)

- [ ] **Step 1: Update `package.json` script**
  Change `"posttest:e2e"` from `tsx tests/e2e/plan-doc-appender.ts` to `tsx tests/e2e/lib/plan-appender-v2.ts`.

- [ ] **Step 2: Update workflow to run appender after tests**
  In the acceptance job, after Playwright runs:
  ```yaml
  - name: Route acceptance evidence to plan docs
    if: always() && hashFiles('test-results/e2e-results.json') != ''
    run: pnpm exec tsx tests/e2e/lib/plan-appender-v2.ts --results test-results/e2e-results.json --metadata test-results/deployment-metadata.json
  ```

- [ ] **Step 3: Commit**
  Commit message: `ci: replace plan-doc-appender with tag-driven v2 in workflow and package.json`

---

## Phase 8: Final Acceptance Run

**Goal:** Full role x viewport acceptance run against a fresh versioned `/exec`, with all evidence routed to #69/#70/#71 plan docs.

### Task 8.1: Run full acceptance suite locally

**Files:**
- None (verification only)

- [ ] **Step 1: Deploy to acceptance**
  Run: `pnpm exec tsx tests/e2e/lib/deploy-acceptance.ts --commit-sha $(git rev-parse --short HEAD) --deployment-id $ACCEPTANCE_DEPLOYMENT_ID`

- [ ] **Step 2: Run fixture setup + Playwright + teardown**
  Run: `E2E_TARGET_URL=<deployed-url> pnpm test:e2e`
  This runs: setup project (fixture seed) -> all acceptance tests -> teardown project (fixture restore).

- [ ] **Step 3: Run plan appender**
  Run: `pnpm exec tsx tests/e2e/lib/plan-appender-v2.ts --results test-results/e2e-results.json --metadata test-results/deployment-metadata.json`

- [ ] **Step 4: Verify evidence in plan docs**
  Check that `docs/specs/069-async-recovery-acceptance-plan.md`, `docs/specs/070-form-protection-acceptance-plan.md`, and `docs/specs/071-accessibility-acceptance-plan.md` each have a populated `## Executed results` section and a `## Run history` entry.

- [ ] **Step 5: Verify all acceptance criteria have corresponding test results**
  Cross-reference each AC from #69 (12), #70 (13), and #71 (13) against the executed results. Any AC without a test result is a gap that must be addressed.

### Task 8.2: Run acceptance in CI

**Files:**
- None (CI verification)

- [ ] **Step 1: Push all changes to a PR branch**
  Create PR with all commits from Phases 0-7.

- [ ] **Step 2: Verify PR checks pass**
  The `pr-checks` job should pass (typecheck, unit tests, lint).

- [ ] **Step 3: Approve the `acceptance` Environment**
  A reviewer approves the `acceptance` GitHub Environment. The acceptance job runs: deploy, fixture setup, Playwright, fixture teardown, evidence commit.

- [ ] **Step 4: Verify evidence is bot-committed**
  Check that the bot commit appears on the PR branch with updated plan docs.

- [ ] **Step 5: Verify all AC pass**
  Review the bot-committed plan docs. Every AC in #69, #70, #71 must have a PASS result. Any FAIL blocks merge.

### Task 8.3: Update ADR-0012 with anonymous auth model (corrected with doc evidence)

**Files:**
- Modify: `docs/adr/0012-e2e-testing-strategy.md`

**Doc evidence (CEO review Issue 1.1 - D5 vs ADR-0012 contradiction resolved):**
- Context7 `/websites/developers_google_apps-script` manifest docs: `ANYONE_ANONYMOUS` = "Any user, even if not logged in." `USER_DEPLOYING` = "The web app runs as the user who deployed it."
- Web Apps guide (developers.google.com/apps-script/guides/web, fetched): "Execute the app as me" = "the script always executes as you, the owner of the script, no matter who accesses the web app." No documented Google session cookie requirement for `google.script.run`.
- Code review (glitched session A5): "Anonymous `/exec` loading and `google.script.run` transport work. Empty usernames return normal `AUTH_REQUIRED`. Any nonempty username reaches spreadsheet access and returns `UNAVAILABLE`." - RPCs complete; earlier TRANSPORT failures were a misdiagnosis (real cause: spreadsheet access, not Google auth).
- ADR-0012's original claim (line 13): "deployment access controls who can load the page, not who can call the server functions" is **not supported by official documentation**. The `access` field controls who can "run" the app (which includes calling server functions).

- [ ] **Step 1: Correct ADR-0012's auth model claim**
  Mark ADR-0012's "Google sign-in wall" claim (lines 11-13) as **superseded** with a correction note:
  - ADR-0012's TRANSPORT failures were caused by spreadsheet access issues (hard-coded ID / `getActiveSpreadsheet` returning null), NOT by a Google session cookie requirement.
  - Official docs confirm `ANYONE_ANONYMOUS` + `USER_DEPLOYING` allows anonymous browsers to complete `google.script.run` RPCs.
  - The storage-state pattern is no longer needed. Anonymous browser + EFCC PIN auth is sufficient (D5).
  - Cite: Context7 manifest docs, Web Apps guide, code review evidence.

- [ ] **Step 2: Document the anonymous browser + EFCC PIN auth model**
  Replace the storage-state pattern with:
  - Anonymous browser context (no Google storage state, no `.auth/*.storage.json` files).
  - EFCC application-layer PIN auth only (username + PIN via `google.script.run.api_loginUser`).
  - Rationale: `ANYONE_ANONYMOUS` + `USER_DEPLOYING` allows anonymous browsers to invoke `google.script.run` (official docs confirmed). Google storage states are unnecessary and expire unpredictably.

- [ ] **Step 3: Update the ADR with the fixture seeding pattern**
  Document the `E2E_`-prefixed fixture rows in Programs and Program_Leaders tabs, Sheets API seeding with `RAW`, fail-closed validation, smart teardown with `resetFixtures()` fallback, and standalone `fixture-reset.ts` for crash recovery.

- [ ] **Step 4: Update the ADR with the tag-driven evidence routing**
  Document the `@issue-*` tag pattern, `plan-appender-v2.ts`, and the `failOnFlakyTests: true` config.

- [ ] **Step 5: Update the ADR with the tiered authorization model**
  Document the `requiresServerAuth` flag in bootstrap DTO, server-side `api_authorizedNavigate` for guarded sections only, and the client-side fast path for member-accessible sections.

- [ ] **Step 6: Commit**
  Commit message: `docs: correct ADR-0012 auth model (D5 validated), add fixture/a11y/evidence/tiered-auth patterns`

---

## Self-Review

### 1. Spec coverage

| Issue | AC # | Covered by |
|-------|------|------------|
| #69 | #1-#6 | Existing client-side state machine (proven locally) |
| #69 | #7 | Task 4.1 (server FORBIDDEN RPC) + Task 7.3 (forbidden-recovery.test.ts) |
| #69 | #8 | Existing AUTH_REQUIRED handling (proven locally) + E2E in form-protection-deployed.test.ts |
| #69 | #9 | Existing render error boundary (proven locally) |
| #69 | #10 | Existing unit tests + new E2E tests |
| #69 | #11 | Existing stress tests (proven locally) |
| #69 | #12 | Task 1.1 (deployment provenance) + Task 5.5 (provenance test) |
| #70 | #1 | Existing form-guard state machine + Task 3.1 (FAILED-dirty fix) |
| #70 | #2 | Task 3.1 (FAILED-dirty) + Task 3.2 (native dialog) + Task 7.3 (deployed tests) |
| #70 | #3 | Task 3.2 (dialog cancel restores focus) + Task 7.3 |
| #70 | #4 | Task 3.3 (LockService idempotency) + Task 7.3 (duplicate submit test) |
| #70 | #5 | Existing navigation guard + Task 7.3 (successful submit test) |
| #70 | #6 | Task 3.1 (FAILED retains values) + Task 7.3 (server/transport failure tests) |
| #70 | #7 | Existing `renderMultilineText` + Task 7.3 (hostile content test with seeded data) |
| #70 | #8 | Existing `renderMultilineText` + Task 7.3 |
| #70 | #9 | Existing `buildSafeLink` + Task 7.3 (safe/unsafe link tests) |
| #70 | #10 | Task 7.3 (hostile content from seeded Sheet data) |
| #70 | #11 | Existing static templates (no change needed) |
| #70 | #12 | Task 7.3 (deployed form-protection tests) |
| #70 | #13 | Task 7.3 (phone + desktop widths) |
| #71 | #1 | Task 6.1 (breakpoint test) |
| #71 | #2 | Task 6.1 (44x44 geometry) + Task 6.3 (CSS fix) |
| #71 | #3 | Task 6.1 (safe-area insets) + Task 6.3 (CSS fix) |
| #71 | #4 | Task 6.1 (no horizontal overflow) |
| #71 | #5 | Task 6.1 (semantic nav markup) |
| #71 | #6 | Task 6.2 (keyboard traversal) |
| #71 | #7 | Task 6.2 (focus management) |
| #71 | #8 | Task 6.2 (live-region announcements) |
| #71 | #9 | Task 6.1 (non-color state cues) |
| #71 | #10 | Task 6.1 (badge accessible labels) |
| #71 | #11 | Existing Traditional Chinese copy (verify consistency) |
| #71 | #12 | Task 6.2 (axe-core scans + manual keyboard) |
| #71 | #13 | Task 8.1 (final acceptance run at phone + desktop) |

### 2. Instruction clarity scan
All tasks specify exact file paths, function names, parameter types, and expected behavior. No "TBD" or "add appropriate error handling" placeholders.

### 3. Type consistency
- `DeployPlan`, `DeployResult`, `RunMetadata`, `ResultRow` type names are consistent across tasks.
- `api_authorizedNavigate(userId, sessionId, sessionToken, sectionKey)` signature is consistent between Task 4.1 (server) and Task 4.2 (client).

### 4. Boring by default
Uses proven technologies (clasp, Playwright, axe-core, Sheets API, GitHub Actions) with no novel mechanisms.

### 5. Systems over heroes
Each task is self-contained with enough detail for a tired developer to execute.

### 6. Reversibility
- Phase 2 (Script Property): revert by re-adding the hard-coded ID.
- Phase 3 (form-guard fixes): revert by restoring old `isDirty()` and dialog.
- Phase 4 (FORBIDDEN RPC): revert by removing `api_authorizedNavigate` and restoring client-only check.
- Phase 5 (fixtures): revert by removing setup/teardown projects and restoring storageState.
- CI workflow: revert to previous `.github/workflows/e2e.yml`.

### 7. Essential vs accidental complexity
- The fixture seeding adds complexity but is essential: without real hostile Sheet data, safe-rendering tests are insensitive (Code review finding #4).
- The deployment provenance adds complexity but is essential: without it, CI tests stale code (Code review finding #1).
- The tag-driven evidence routing adds complexity but is essential: without it, results go to the wrong plan (Code review finding #2).
