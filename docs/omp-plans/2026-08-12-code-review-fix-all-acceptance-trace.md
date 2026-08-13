# Acceptance trace — code-review "fix all" behavior changes

**Status: process deviation on Section A — see Sign-off.**

## Section A — Post-hoc addendum (already implemented; NOT written before code)

The two behavior changes below were implemented directly from code-review
findings, then verified retroactively (component + worker + Playwright suites,
all green). **No acceptance trace existed before this code was written.**
This section documents the observable contract after the fact, as an explicit
process-deviation record, not a claim that the Headless-Gate sequence was
followed for these two changes.

Commits: `bb4677bf` (behavior), `5cd8c014` (pure refactors, no behavior
change).

### A1 — Program Settings Attendance group is module-gated (#254 AC1, AC4)

- GIVEN a Program's department has the `attendance` module **disabled**,
  WHEN an authorized operator opens that Program's Settings task,
  THEN the Attendance group renders `COPY.programs.settingsAttendanceUnavailable`
  text and no editable form (no `settingsAttendanceOpens` /
  `settingsAttendanceCloses` spinbuttons).
- GIVEN the `attendance` module is **enabled**, THEN the Attendance group
  renders the editable spinbutton form as before.
- Verified by: `CFG-01 Program Settings > renders all scope-owned groups...`
  (`tests/e2e/programs-d1.test.ts:954`, Playwright, phone+desktop) against
  `E2E_DEMO_成人查經` with the demo department's `attendance` module enabled
  (fixture gap found and fixed in the same pass — see Section A3).
- Not separately unit/component-tested for the *disabled* branch beyond the
  E2E path implied by the module toggle; acceptable because
  `program-settings.test.tsx` already exercises the identical `eventsEnabled`
  gate pattern this mirrors, and the two branches share one conditional shape.

### A2 — Event deactivation counts an open check-in window as an affected operation (#251 AC4)

- GIVEN an event has `checked_in = 0` attendances, AND its check-in window
  is currently open (`now` between `check_in_window_opens_at` and
  `check_in_window_closes_at`), WHEN an operator PATCHes
  `availability: "Inactive"` without `confirm`, THEN the server responds
  `409 CONFIRMATION_REQUIRED` with `open_operations >= 1` (same contract
  shape as the existing `checked_in > 0` case), and audits `DENIED`.
- GIVEN `checked_in = 0` AND the window is **not** currently open (before
  it opens, or after it closes, including "no window configured"), THEN
  deactivation succeeds immediately with no confirmation gate.
- Verified indirectly by: worker suite (`programs.test.ts` archive/
  deactivation tests, 331/331 pass) and Playwright `EVT-01 ... safe
  deactivation is immediate` / `... enrollment alone does not gate
  deactivation` (both pass) — but **neither of those existing tests
  exercises the new branch**: the E2E fixture events are always dated
  +120 days (window never open at test time), and the existing worker
  confirmation test uses `checked_in = 1`, not an open window with zero
  check-ins. **This is a real coverage gap**, closed in Section B below
  before adding the closing test.

### A3 — Fixture fixes (mechanical; exempt from the trace requirement)

- `tests/e2e/seed-demo.ts`: added `attendance` to `REQUIRED_MODULES` — the
  demo department never had it enabled, which is why A1's *enabled* branch
  passed only after this fix (before A1, the ungated code masked the gap).
- `tests/e2e/seed-dev-accounts.ts`: added the missing
  `DELETE FROM department_managers ...` before the `departments` DELETE in
  the reset SQL, fixing an `ON DELETE RESTRICT` FK failure surfaced by a
  soft-revoked grant from prior manual testing.

## Section B — Pre-implementation trace for the coverage-closing test (written BEFORE the test code)

**This section is written before touching `programs.test.ts`.** It pins the
observable contract for the branch identified as untested in A2, so the test
that follows is verified against a spec fixed in advance, not shaped to
match whatever gets written.

### Acceptance criteria — "deactivation with an open check-in window and zero check-ins"

1. Create an event with `checked_in = 0` and a check-in window where
   `check_in_window_opens_at <= now <= check_in_window_closes_at` (construct
   both bounds relative to `Date.now()` at test run time, since this is the
   one case in this file where the window must be open *now*, not on a
   fixed future date like every other fixture in this suite).
2. `PATCH .../events/:id { availability: "Inactive" }` (no `confirm`) MUST
   return `409` with `code === "CONFIRMATION_REQUIRED"` and
   `open_operations === 1`.
3. The most recent `EVENT_AVAILABILITY` audit row for that event MUST have
   `outcome === "DENIED"`.
4. `PATCH .../events/:id { availability: "Inactive", confirm: true }` MUST
   return `200` with `data.event.availability === "Inactive"`.
5. The most recent `EVENT_AVAILABILITY` audit row MUST then have
   `outcome === "SUCCESS"`.
6. This must NOT regress the existing sibling test at
   `programs.test.ts:2885` (`checked_in > 0` case) or any archive/
   deactivation test in the same file — full `programs.test.ts` run
   required, not just the new test in isolation.

Test to be added as a sibling of the existing test at
`web/lib/programs/programs.test.ts:2885`, following its exact structural
pattern (`createEventFor`, `problemOf`, `testDb()` audit assertions).

## Sign-off

- Section A: implemented-then-verified, retroactive trace. **Requires
  project-owner (user) acceptance of this deviation** — not self-certified
  as ADR-0029/Headless-Gate compliant.
- Section B: trace written before the test; the test that follows is
  scoped exactly to what this section specifies, no more, no less.

## Closing verification (Section B test added)

Test added: `web/lib/programs/programs.test.ts` — "availability: an open
check-in window with zero check-ins still requires confirmation", inserted
as a sibling of the existing `checked_in > 0` test. Written to the exact
six acceptance criteria in Section B, no more.

- `tsc --noEmit`: clean.
- Full worker suite (`vitest.config.ts`): 332/332 passed (331 -> 332;
  the new test passed on first run against the already-shipped Section A2
  code, closing the coverage gap without requiring any production-code
  change).
- Full Playwright `programs-d1` suite (phone + desktop, local `wrangler
  dev` + local D1): 54/54 passed, including the pre-existing sibling EVT-01
  tests this change was required not to regress.

Section A2's coverage gap is now closed. Section A's core deviation
(implement-then-trace for the original two behavior changes) stands as
recorded above and still requires project-owner acceptance.
