# S2-05 Program Detail Event-Detail CTA Gate Acceptance Plan

**Feature:** Hide the "查看聚會詳情" (view meeting detail) CTA on Program Detail for viewers `getEventDetail`'s participant projection will reject (Issue #389, PR #395)
**Authority:** Ticket #389, `department-workspace.ts` `getEventDetail` participant-projection gate
**Date:** 2026-08-20
**Status:** accepted — verified via Playwright against local `wrangler dev` + local D1.

## Scope

`web/lib/programs/participant-program-detail.tsx`'s next-meeting card unconditionally rendered a "查看聚會詳情" button/link to Event Detail. The backend's participant projection (`department-workspace.ts:2614-2626`) only returns event detail for a viewer who either holds `PROGRAM_MANAGE` on the program or has an **Active** enrollment on it — every other viewer gets a 404. Browsing a program's schedule (which does not require enrollment) therefore offered a button that predictably failed for any not-yet-enrolled or Pending/Withdrawn/Rejected/Archived-relationship member — the majority of the catalog until they enroll.

Fix: derive `hasActiveEnrollment` from the same `enrollment.enrollments` snapshot `ParticipantEnrollment`/`EnrollmentAction` already use (`.some(item => item.status === "Active")`), and gate the CTA on `canManage || hasActiveEnrollment`.

## Preconditions

1. Local D1 seeded with `pnpm db:seed:local` + `pnpm db:seed:demo` (disposable `E2E_`-prefixed fixtures — `E2E_member`, `E2E_admin`, `E2E_DEMO_成人查經`).
2. Local Worker running via `pnpm dev:local` at `http://127.0.0.1:8787`.

## Acceptance criteria — observable DOM assertions

| # | Criterion | Observable assertion |
|---|---|---|
| G1 | Unenrolled member sees no dead-click CTA | `E2E_member` freshly navigating to `E2E_DEMO_成人查經`'s Program Detail (no Active enrollment, no `PROGRAM_MANAGE`) does not have a `查看聚會詳情`-named button in the DOM. |
| G2 | Approved member sees the CTA and it works | Once `E2E_member`'s enrollment request is Approved (Active), the `查看聚會詳情` button is visible, and clicking it navigates to `/programs?program=<id>&event=<id>` with real Event Detail content (200, not a 404 boundary). |
| G3 | Manager sees the CTA regardless of enrollment | An `PROGRAM_MANAGE`-capable viewer sees the CTA via the same `getEventDetail` operator-scoped branch, independent of `hasActiveEnrollment`. Covered indirectly: `canOpenEventDetail = canManage || hasActiveEnrollment` short-circuits on `canManage` before the enrollment check. |

## Verification plan

1. `pnpm --dir web typecheck`.
2. `pnpm --dir web test:components` (existing `participant-program-detail.test.tsx`, `event-detail.test.tsx`).
3. Playwright `tests/e2e/programs-d1.test.ts` — PUI-05 (`opens from Program detail, shows availability, and 前往掃描 pre-selects the event`) already asserts G2/G3 end-to-end (enroll → admin-approve → CTA visible → click succeeds → real Event Detail renders). Added the G1 assertion (CTA absent) to the same test's initial unenrolled-arrival step, and to PUI-03's `direct detail survives refresh` test (which was asserting the old, incorrect "CTA visible while unenrolled" expectation — updated in the same pass, along with two other stale #389-rework assertions in that test: `課程簡介` heading → `#program-detail-title`, schedule `table` → schedule `list`).
4. Run `pnpm exec playwright test --config=tests/e2e/programs-d1.config.ts --grep='PUI-05'` against local `wrangler dev` + local D1.

## Evidence

- `pnpm --dir web typecheck`: passed, zero diagnostics.
- `pnpm --dir web test:components`: 511/511 passed (46 files) after the `EventFactIcon` "back" glyph addition, the `canOpenEventDetail` gate, `participant-program-detail.test.tsx`'s existing "reworked detail layout" test switched to `renderDetail({ canManage: true })` (it exercises the CTA click, so it needs an authorized viewer), and one new explicit test asserting the CTA is absent for a plain unenrolled, non-managing view.
- Playwright `--grep='PUI-05'` vs local `wrangler dev` + local D1 (`E2E_member`/`E2E_admin` fixtures), run **in isolation**: 6/6 passed across phone-320, phone-390, desktop (`programs-d1.test.ts` PUI-05 + `pui-05-home-origin.test.ts`), including the new G1 assertion.
- Playwright `--grep='direct detail survives refresh'` (PUI-03), run **in isolation**: 3/3 passed across all three projects, after fixing the same test's stale `課程簡介`/schedule-`table`/unenrolled-CTA-visible assertions and the test file's local `COPY.detailBack` constant (`"返回課程目錄"` → `"課程"`, stale against `web/lib/copy.ts:775` since #389 shipped).
- Note: running `--grep='PUI-03|PUI-05'` **combined** in one Playwright invocation intermittently fails — the three viewport projects (phone-320/390/desktop) share one local D1 instance with no per-project reset, so `E2E_member`'s enrollment state leaks across tests/projects when they're batched together. This is a pre-existing test-isolation gap in `programs-d1.test.ts`, unrelated to this fix; confirmed by running each test alone (above) cleanly on every project.

## Known gap filed separately, not fixed here

`tests/e2e/programs-d1.test.ts` has five more assertions referencing the `課程簡介` heading (`COPY.detailPurpose`) that ticket #389 already removed from the shipped markup: PUI-01 "mode switching preserves a valid Program intent" (lines 613, 659), PUI-02 "row selection hands off through the canonical Program intent URL" (line 1040), and PUI-04 "member submits a request, sees Pending, and withdraws" / "ManagerOnly detail explains that participants cannot self-enroll" (lines 1615, 1851). Same root cause as the two fixes above ("test never updated to match #389's actual shipped markup"), same fix shape (`getByRole("heading", { name: COPY.detailPurpose })` → `locator("#program-detail-title")`). Not touched here — this ticket's blast radius is the `canOpenEventDetail` gate; these five are a pre-existing, separate test-maintenance gap that predates this fix and is unrelated to it.
