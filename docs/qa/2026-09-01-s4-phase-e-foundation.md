# S4 Phase E — Operations Route Foundation QA Evidence

**Date:** 2026-09-01
**Branch:** `feat/s4-e-operations-route-polish`
**Phase base branch:** `feat/s4-d-member-public-route-polish`
**Verified Phase D PR #502 head / Phase E base:** `7547fbf8ee6ed8b441d173135550081a487b1f72`
**Acceptance trace:** `docs/specs/s4-phase-e-acceptance-trace.md`
**Grouped PR title:** `feat(s4-e): operations route polish`
**Tickets:** #491 (scanner, Events, and attendance operations), #492 (remaining management operations), #493 (Identity and Permission management)
**Handoff source:** `local://s4-phase-e-qa-evidence.md`

## Scope and boundary

- Scope is the Phase E operations wave from parent #475: #491 scanner/Events/attendance, #492 Management Hub/settings/Home Content/directory and approval callers, and #493 identity/permission management.
- Out of scope: Phase F, production D1, Apps Script, Google Sheets, remote Worker or deployment/promotion, merge, force-push, screenshots/image snapshots/pixel diffs, formal WCAG certification, and unclaimed human evidence.
- No production promotion, remote Cloudflare mutation, Apps Script mutation, or Google Sheets write was attempted. No screenshot assertion was used; geometry evidence is numeric CSS-pixel DOM measurement from pinned local Chromium with screenshots disabled.

## Local runtime and fixtures

- Target: local `wrangler dev` at `http://127.0.0.1:8787` — loopback only. Every browser/API row targets the loopback Worker; no remote Worker, production database, Apps Script, or Google Sheets write is evidence.
- Fixtures: disposable `E2E_`/`E2E_DEMO_` data only. The worktree used `E2E_DISPOSABLE_MEMBER`, Guest, scoped `E2E_DISPOSABLE_` Admin/Staff/Department Manager/Program Leader/Member/Custom Identity, `E2E_DEMO_` Programs/Events, and disposable local D1 per the acceptance trace. `tests/e2e/seed-dev-accounts.ts`, `seed-demo.ts`, or `seed-disposable-identity.ts` were used only when an acceptance row lacked an existing persona/state; no non-disposable data was reset.
- The checked-in reset/seed sequence was run against the loopback Worker before the browser suites: `pnpm dev:local` under the process supervisor (or the equivalent direct Wrangler launch on `127.0.0.1:8787`), then `pnpm db:seed:local` and `DEMO_TARGET_URL=http://127.0.0.1:8787 pnpm db:seed:demo` where prescribed by the plan.

## Exact verification commands and results

All commands were run from `.worktrees/s4-phase-e` against the loopback Worker. The handoff records the following local results; they are reproduced here verbatim as the automated evidence for the fifteen trace rows (E-491-01..05, E-492-01..05, E-493-01..05). `W7 = 320, 390, 600, 799, 800, 1024, 1440 CSS px`; both 799 and 800 are mandatory for shell-sensitive states; management and identity suites additionally retain **900 CSS px** for the 800–1023 interior reflow band. Geometry evidence is numeric DOM measurement, never a screenshot assertion.

| # | Exact command | Result |
| --- | --- | --- |
| 1 | `pnpm --dir web exec vitest run --config vitest.components.config.ts lib/scanner-boundary.test.tsx lib/self-check-in-panel.test.tsx lib/attendance-panel.test.tsx lib/assisted-scanner-panel.test.tsx lib/attendance-operator-panel.test.tsx lib/attendance-roster.test.tsx lib/use-qr-camera.test.tsx lib/programs/event-detail.test.tsx` | **PASS** — 8 files, 103 passed. Covers E-491-01..04 component seams (camera-first, fallback, chooser, roster, device callbacks, event detail). |
| 2 | `pnpm --dir web exec vitest run --config vitest.config.ts lib/attendance-worker.test.ts lib/attendance.test.ts lib/attendance-entry.test.ts` | **PASS** — 3 files, 59 passed. Worker/domain contract for enrollment, window, duplicate, void, correction. |
| 3 | `PROGRAMS_TARGET_URL=http://127.0.0.1:8787 pnpm exec playwright test --config=tests/e2e/attendance-d1.config.ts` | **PASS** — 52 passed (phone-375×667 and desktop-1280×720 projects, disposable local D1/loopback). Authenticated/public attendance journeys. |
| 4 | `PHASE_E_TARGET_URL=http://127.0.0.1:8787 pnpm exec playwright test --config=tests/e2e/phase-e-attendance-geometry.config.ts` | **PASS** — 25 passed, 7 intentional skips (print-only test skipped on non-print projects; print-media executed), numeric DOM, screenshots off. W7 plus 320×568/390×667 short-height, 799/800 shell transition, safe-area/dock, ≥44×44 targets, final-anchor, long CJK/unbroken containment, roster print-media visibility. |
| 5 | `pnpm --dir web exec vitest run --config vitest.components.config.ts lib/management-hub.test.tsx lib/settings-hub.test.tsx app/management/home-cms-editor.test.tsx lib/account-directory-panel.test.tsx lib/member-directory-panel.test.tsx lib/approval-queue.test.tsx lib/approval-detail.test.tsx lib/directory-frame.test.tsx lib/management-action-framework.test.tsx` | **PASS** — 9 files, 121 passed. Hub/settings, Home Content, directories, approvals, directory/action seams. |
| 6 | `pnpm --dir web exec vitest run --config vitest.components.config.ts lib/identity/role-hierarchy-panel.test.tsx lib/permission-editor-panel.test.tsx lib/account-access-panel.test.tsx` | **PASS** — 3 files, 78 passed. Identity Tree, Permission Editor, Account Access component/domain. |
| 7 | `pnpm verify:identity` | **PASS** — 4 files, 98 passed. Identity domain handlers. |
| 8 | `pnpm test:workerd` | **PASS** — 37 files, 569 passed. Enabled Worker/domain gate; the four Phase D excluded files remain excluded by the checked-in script (see below). |
| 9 | `PROGRAMS_TARGET_URL=http://127.0.0.1:8787 pnpm exec playwright test --config=tests/e2e/s4-management-hardening.config.ts` | **PASS** — 136 tests, 62 passed, 74 intentional skips from project/fixture gating, 0 failed. Includes W7 plus 900, persona/identity paths, 600 Sheet, 800 filter, 1024 sticky, Hub/settings/Home/directories/approvals/Identity Tree→Detail→Permission Editor→Account Access, canonical `/permissions` redirect, malformed URL fallback, persona-projected affordances. |
| 10 | `pnpm test:role-hierarchy-geometry` | **PASS** — 49 passed. Supplemental numeric identity geometry; not authenticated READY evidence, recorded as supplemental. |
| 11 | `pnpm typecheck && pnpm --dir web typecheck && pnpm --dir web build && pnpm verify:precommit && pnpm verify && git diff --check` | **PASS**. `pnpm verify:precommit` included 38 prototype, 98 identity, 569 enabled Worker (37 files), and 787 component tests; `pnpm verify` additionally passed 93 responsive, 28 shell geometry, and 49 identity geometry tests; `git diff --check` passed. |
| 12 | Final smoke after last commit: `PROGRAMS_TARGET_URL=http://127.0.0.1:8787 pnpm exec playwright test --config=tests/e2e/attendance-d1.config.ts && PROGRAMS_TARGET_URL=http://127.0.0.1:8787 pnpm exec playwright test --config=tests/e2e/s4-management-hardening.config.ts` | **PASS** — Attendance 52 passed; Management 136 tests, 62 passed, 74 intentional skips, 0 failed. |

## Disposable-fixture boundary

- All D1 assertions and browser/API evidence use disposable local data only (`E2E_`/`E2E_DEMO_` prefixes). The worktree never wrote a production database, Apps Script, or Google Sheet.
- `pnpm db:seed:local` and `DEMO_TARGET_URL=http://127.0.0.1:8787 pnpm db:seed:demo` provide the disposable baseline; `E2E_DEMO_` Programs/Events and `E2E_DISPOSABLE_` identities are the only records exercised.
- The `PROGRAMS_TARGET_URL`/`PHASE_E_TARGET_URL` Playwright configs target `http://127.0.0.1:8787` exclusively; no remote host, Cloudflare account, or deployment step is evidence.

## Intentional skips

- `phase-e-attendance-geometry.config.ts`: 7 intentional skips. The print-only test is skipped on non-print projects; the print-media DOM assertion is executed on the print-media project. These are expected skips, not failures.
- `s4-management-hardening.config.ts`: 74 intentional skips from project/fixture gating across 136 scheduled tests. The suite is project-gated (W7 plus 900, persona/identity, management interior) and intentionally skips unaffiliated projects/fixtures per run. 0 failures in the final runs.
- No failure was hidden as a skip; failed assertions would block the phase.

## Known Phase D exclusions

The following four files remain excluded by the checked-in `pnpm test:workerd` / `pnpm --dir web test` script and are not claimed as passing in this phase. Their exclusion is the documented Phase C/Phase D infrastructure baseline (`EvalError: Code generation from strings disallowed for this context` in the Cloudflare/Vite pool), not a product assertion failure:

- `web/lib/auth/normalized-authority-c487.test.ts`
- `web/lib/identity/permission-editor.test.ts`
- `web/lib/identity/permission-editor-handlers.test.ts`
- `web/lib/identity/normalized-authority.test.ts`

The integrated gate ran `pnpm test:workerd` with 37 files/569 tests passing while those four remain excluded by the script. `pnpm verify:precommit` (38 prototype, 98 identity, 569 enabled Worker, 787 component) and `pnpm verify` (plus 93 responsive, 28 shell geometry, 49 identity geometry) passed with that exclusion preserved. No new exclusion was introduced, and no excluded file is re-labeled as passing.

## Manual gates — unclaimed

The following six rows remain explicitly **MANUAL — unclaimed**. No headless, screenshot, numeric DOM, or loopback evidence is claimed for them:

| ID | Required human evidence |
| --- | --- |
| E-491-M1 | Real iOS/Android camera/video review for phone Self camera-first startup, permission denied/unsupported/unavailable wording, stop/retry/track-ended cleanup, decoder quality, Guest no-camera behavior, safe-area/dock clearance, and touch reachability. |
| E-491-M2 | Native print inspection of the Event roster/check-in sheet in the system print flow and on paper/PDF output, including print-only visibility, clipping, page breaks, and device/browser parity. |
| E-492-M1 | Keyboard-only and VoiceOver/NVDA review of Hub/settings, Home Content, Account/Member directories, and Approvals: logical order, visible focus, Sheet/dialog focus return, live errors, target size, Back/return, and selected-row restoration. |
| E-492-M2 | Reduced-motion, forced-colors, zoom/reflow, text-spacing, real touch hardware, safe-area/dock, and related assistive-device review across the W7/900/1024 management states. |
| E-493-M1 | Keyboard-only and VoiceOver/NVDA review of Identity Tree, detail, reorder controls, Permission Editor Switch/review surfaces, Account Access impact/lifecycle dialogs, protected-target messaging, and focus restoration. |
| E-493-M2 | Reduced-motion, forced-colors, zoom/reflow, text-spacing, real touch hardware, safe-area/dock, and related assistive-device review for identity list/detail/editor/access states at W7 and the 900px management band. |

Automated rows (E-491-01..05, E-492-01..05, E-493-01..05) are `READY — automated` with the commands/results above. Their `Manual owner / status` columns remain `Human reviewer / MANUAL — unclaimed` with the parenthetical scope; no manual hardware, print, or assistive-technology pass is inferred from headless runs. The `MANUAL — unclaimed` distinction and the W7 definition (`W7 = 320, 390, 600, 799, 800, 1024, 1440 CSS px`, with 900 retained for the 800–1023 management interior) are preserved exactly as defined in the acceptance trace.

## Cross-row invariants verified

- Server projections and Worker/domain outcomes remain authoritative; UI code renders projected actions, lock reasons, statuses, and explanations without branching on a fixed role, `accounts.role`, hidden navigation, or browser-derived capability.
- Safe return/deep-link handling is same-origin validated; malformed, duplicate, stale, forbidden, or unrecognized targets fail closed to the canonical safe destination.
- Cookie/session auth, `{ requestId, data }` envelopes, `X-Request-Id`, Problem Details failures, actor-bound idempotency, revision/conflict outcomes, audit history, and D1 atomicity remain unchanged at every exercised seam.
- Geometry rows use numeric DOM measurements with screenshots disabled; print-media DOM visibility is automated evidence; native print preview/paper, real camera/video/device behavior, and keyboard/assistive/motion/color/reflow/text-spacing remain human evidence only.
- No second scanner, lifecycle, directory, action, form, authorization, or compatibility layer was introduced; existing public modules remain the seams (`useAttendanceFlow`, `useQrCamera`, `ManagementHubView`/`getManagementHub`, `HomeContentEditor`/`home-cms-api`, `DirectoryFrame`/`ManagementPageHeader`/`ActionSurface`/`ManagementFilterSheet`, identity hierarchy/permission/account-access APIs).

## Verdict

Local automated evidence for S4 Phase E is **READY** on the fifteen trace rows at the commands/results above, on disposable local D1 and loopback `http://127.0.0.1:8787`, with intentional skips documented and Phase D exclusions preserved. The six manual gates above remain **MANUAL — unclaimed** and must be performed on real devices/assistive technology before release. No production-readiness claim beyond loopback is made.
