# Issue #69 — Async Recovery Acceptance Plan

**Status:** Implemented locally / **Blocked on fresh `/exec` deployment**
**Branch:** `feat/issue-69-async-recovery`
**Parent:** #64. Blocked-by: #67 (merged), #68 (merged, PR #74).
**Spec:** `docs/specs/009-phone-first-shell-navigation.md` §"Client responsibilities" + issue #69 AC list.
**Date:** 2026-07-29

## Scope, as grilled and confirmed

No ticket under #64 (#65–#72, verified by reading every child issue and
cross-checking `src/gas/` on `origin/main`) owns building a Programs
domain RPC. Issue #53 is the authoritative Programs/Enrollment spec —
open, unimplemented, and much larger than what #69 needs (self-enrollment,
assisted enrollment, Program-Leader-scoped locks, audit log, candidate
search). Issue #43 is explicitly superseded by #53 ("replaces conflicting
assumptions in #11, #32, and #43") and is out of scope going forward.

**Decision:** #69 builds a minimal READ-ONLY Programs list as an explicit
prerequisite slice of #53's domain — not a duplicate of #53's write/lock/
audit scope, and not the old Draft-status `getAvailablePrograms(userId)`
bare-array contract from spec 004 (which predates #53 and conflicts with
its authorization model).

## What was implemented

### Server (`src/gas/`)

1. **`programs-repository.gs`** (new) — header-name column resolution
   (Program_ID / Program_Name / Type / Description, order independent
   per spec 004 §5), `CacheService.getScriptCache()` read-through with
   key `programs_catalog_v1` and 300s TTL, missing-sheet and
   no-data-row handling (both return `[]`), corrupt-cache fallback to
   a fresh Sheet read, and a `programsResetForTesting_()` hook.
2. **`api_getPrograms(userId, sessionId, sessionToken)`** in `Code.gs`
   — new public RPC. Session-verifies via `sessionVerify_`, checks
   `userId` match WITHOUT revoking the session on mismatch (see the
   SECURITY NOTE in the source — a deliberate divergence from
   `api_restoreApp`'s revoke-on-mismatch pattern, which is flagged as
   a follow-up hardening candidate rather than fixed retroactively),
   checks active status, then returns the Programs list wrapped in
   `rpcSuccess_`/`rpcFailure_` per ADR-0003's accepted-in-principle
   amendment. Unexpected exceptions return `RPC_CODES.INTERNAL_ERROR`
   (a deliberate choice, diverging from the other three RPCs'
   `UNAVAILABLE` convention, made explicitly during grilling).

### Client (`src/gas/shell-session.js.html`)

1. **`navGeneration_`** — a monotonic counter bumped on every render
   intent (`renderSection_`, plus `openTask_` since it renders without
   going through `renderSection_`). A Programs load captures the
   generation at start; its callback drops silently if the generation
   has since advanced — this is what makes a late response from an
   abandoned Section unable to overwrite the user's newer location
   (AC #3), distinct from `callServer_`'s per-tag dedup (which only
   guards two calls racing under the SAME tag).
2. **`SECTION_STATE`** (IDLE/LOADING/READY/EMPTY/ERROR) and
   `sectionStates_` — per-Section async state, used only by Programs
   in this branch.
3. **`errorCopyFor_(code)`** — distinct Traditional Chinese heading +
   detail for TRANSPORT / INTERNAL_ERROR / FORBIDDEN / SESSION_EXPIRED
   (AUTH_REQUIRED) / RENDER_ERROR. (A `TIMEOUT` case was removed during
   review — nothing in this branch produces that code; add it back
   when a real timeout signal exists.)
4. **`loadProgramsSection_`** — the one real Section RPC in this
   branch. Calls `callServer_("section:programs", ...)` →
   `google.script.run.api_getPrograms(...)`.
5. **`applyProgramsData_(data)`** — shared READY/EMPTY dispatcher with
   its own try/catch (issue #69 AC #9), used both by the initial RPC
   success path and by the render-only retry path, so a retry after a
   render-only failure re-attempts the SAME view kind (EMPTY vs
   READY) rather than regressing to the wrong one.
6. **`renderSection_`'s error boundary** — wraps `renderSectionImpl_`
   in try/catch, preserving any already-loaded data so a caught
   generic render exception can also be retried render-only.
7. **`handleSectionRetry_`** — for Programs, retries render-only when
   validated data is already present (repeats ONLY the failed
   operation per AC #6, issuing zero new RPCs); otherwise falls back
   to a full re-fetch via `loadProgramsSection_`.
8. **`isValidProgramItem_`** — validates every item in a successful
   response BEFORE transitioning to READY, so a malformed item mid-array
   cannot reach the renderer and crash uncaught (the async RPC
   callback path is NOT covered by any synchronous boundary until
   this validation + the `applyProgramsData_` try/catch were added).
9. **`refreshSection_`** — guards against a stale/mismatched
   `sectionKey` (only refreshes the currently active Section), and
   for Programs resets state to IDLE to force a real re-fetch instead
   of re-rendering cached data.

### Tests

- `tests/gas/programs-repository.test.js` — 8 tests (column resolution,
  missing sheet, empty sheet, cache read-through with TTL assertion,
  corrupt-cache fallback, exception propagation).
- `tests/gas/api-get-programs.test.js` — 9 tests (success, all three
  roles, empty response, AUTH_REQUIRED for bogus/mismatched/deactivated
  sessions — including a regression proving a mismatched-userId call
  does NOT revoke the legitimate session — INTERNAL_ERROR on exception,
  no Enrollments/isEnrolled leakage).
- `tests/gas/programs-section-recovery.test.js` — 17 tests covering
  loading→ready, EMPTY, TRANSPORT/FORBIDDEN/SESSION_EXPIRED distinct
  copy, three stale-response scenarios (Programs→Events, Programs→
  Profile with a late failure, Programs→open-task), malformed
  non-array data, revisit-after-abandonment restart, render-only retry
  with no new RPC (including a repeat-failure case and an EMPTY-view
  dispatch regression test), duplicate-navigation coalescing, explicit
  Refresh forcing a re-fetch, and a repeat-navigation stress test.
- Existing `tests/gas/nested-task-navigation.test.js` updated with a
  default `api_getPrograms` handler and `flushMicrotasks()` calls
  where Programs navigation now resolves asynchronously; all 9
  original tests still pass unmodified in intent.

**Total: 108/108 tests pass. `pnpm check` (lint + format) clean.
`pnpm typecheck` clean.**

## Official documentation evidence (AGENTS.md gate)

- `google.script.run` / `withSuccessHandler` / `withFailureHandler`:
  https://developers.google.com/apps-script/guides/html/reference/run
- `CacheService` / `getScriptCache()`:
  https://developers.google.com/apps-script/reference/cache/cache-service
- `Sheet.getDataRange().getValues()`: already cited in
  `program-leaders-repository.gs`, reused unchanged.

Context7 (`/websites/developers_google_apps-script`) was unavailable
(invalid API key) at the time of this check; official
`developers.google.com` pages were fetched directly per the AGENTS.md
fallback order.

## AC disposition

| AC | Status | Evidence |
|---|---|---|
| #1 shell mounted during loading/success/failure/retry | **proven locally** | `programs-section-recovery.test.js` |
| #2 client request ID per async view request | **proven locally** | `callServer_` tag `"section:programs"` |
| #3 late response from a previously visited Section ignored | **proven locally** | 3 dedicated stale-response tests |
| #4 repeated taps suppressed/coalesced | **proven locally** | dedicated test, zero duplicate RPCs |
| #5 distinct Traditional Chinese feedback per state | **proven locally** | per-code assertions |
| #6 recoverable retry repeats only the failed operation | **proven locally** | render-only-retry tests (zero new RPCs) |
| #7 FORBIDDEN refreshes authorization | **proven locally** | dedicated test |
| #8 SESSION_EXPIRED clears state, returns to Login | **proven locally** | dedicated test |
| #9 rendering exception caught at Section boundary | **proven locally** | dedicated test + malformed-item validation |
| #10 automated tests for the recovery paths | **done** | this branch's three new test files |
| #11 repeat-navigation stress test | **proven locally** | dedicated test |
| #12 `/exec` records browser-console + Apps Script execution evidence | **BLOCKED** | requires a fresh versioned `/exec` deployment |

## Remaining blocker: AC #12 / the fresh `/exec` gate

Per AGENTS.md, this issue is not ready until a fresh, isolated versioned
`/exec` deployment demonstrates the same recovery paths live, with
browser-console and Apps Script execution evidence recorded. **This
requires a deployment action (`clasp push` / `clasp deploy`) that only
the user can authorize and execute** — it is not something this session
can perform. Until that run happens and its results are appended below,
AC #12 remains unmet and the issue is not `READY`.

### What the `/exec` run must cover

- **Target deployment:** a fresh versioned `/exec` URL created after
  this branch is pushed (NOT the production deployment).
- **Role × viewport matrix:** MEMBER (alice/1234), STAFF (bob/5678),
  ADMIN (noah/6883) — each at phone 375×812 and desktop 1280×800.
- **Trace:** log in → navigate to 課程 (Programs) → observe loading →
  observe real Sheet-backed content or the EMPTY state → force a
  transport/forbidden/session-expired scenario (e.g. via DevTools
  network throttling/blocking, or a deliberately invalid session
  token) → verify the matching distinct Traditional Chinese recovery
  UI → click 重試 → verify recovery.
- **Forbidden path:** direct `__e2eNavigate("permissions")` on a
  MEMBER session recovers visibly without exposing protected data.
- **Evidence:** record the deployment version ID, execution IDs
  correlated via request IDs, and the exact `/exec` URL + Hong Kong
  timestamp tested, per spec 009's testing decisions.

## Non-goals for this branch

- No `isEnrolled`, no Enrollments sheet read, no enrollment write/lock/
  audit — explicitly #53's scope.
- No Events/Scanner/Care/Permissions Section wiring — Programs only.

## Executed results

_(Historical record. The retired Apps Script `/exec` Playwright runner and its `pnpm test:e2e` appender are no longer part of this repository. Current acceptance evidence uses the local Worker/D1 suites documented in `tests/e2e/README.md`.)_

## Rollback

No production Sheet, Apps Script project, or deployment is touched by
this branch. If the `/exec` run fails acceptance, the branch is not
merged; no rollback procedure is needed since nothing is deployed yet.
