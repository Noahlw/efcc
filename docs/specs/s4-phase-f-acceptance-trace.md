# S4 Phase F — Contraction and Release Acceptance Trace

**Status:** BLOCKED — fixed-role/CSS contraction evidence is complete, but the full Programs D1 browser matrix repeatedly loses the local arm64 Worker; human-only rows remain explicitly `UNCLAIMED`. Automated evidence is local-only and disposable; no production Worker, D1, Apps Script, Google Sheet, or non-disposable account is in scope.

## Scope and provenance

- **Parent:** #475
- **Contraction:** #494
- **Release gate:** #495
- **Base:** `c06f9fc0921830a237a7334f1009a7867663a784` (`feat/s4-e-operations-route-polish`)
- **Execution branch:** `feat/s4-f-contraction-release-gate`
- **Runtime:** Node `22.18.0`, pnpm `11.7.0`, pinned Playwright Chromium, local Worker `http://127.0.0.1:8787`
- **Fixtures:** only `E2E_`, `E2E_DEMO_`, and `E2E_DISPOSABLE_` local D1 fixtures

## Evidence rules

- `READY` means every named automated command passes and its output artifact is present and internally consistent.
- `CONDITIONAL` means all applicable automation is `READY`, but one or more required human gates are explicitly `UNCLAIMED`; the release verdict is `AUTOMATION READY — RELEASE CONDITIONAL`.
- `BLOCKED` means any required assertion fails, a forbidden compatibility/styling/schema surface remains, a manual gate is `FAIL`, evidence provenance is mixed, or an expected artifact is missing.
- Numeric geometry is measured from the DOM in pinned local Chromium. It does not claim camera quality, native print preview, keyboard-only behavior, assistive-technology behavior, reduced motion, forced colors, zoom, reflow, or text-spacing behavior.
- Automated checks must never turn a failure into a skip. Every intentional skip records its fixture/project reason.

## Required viewport and state coverage

`W7 = 320, 390, 600, 799, 800, 1024, 1440 CSS px`. Management and identity retain 900px. Attendance retains 320×568 and 390×667 short-height cases plus print-media projects. The canonical ready-route set is `/`, `/register`, `/registrations`, `/scanner`, `/messages`, `/notices`, `/permissions` redirect, `/profile/settings`, `/programs`, implemented program detail/tasks, `/management`, implemented management hub/settings/Home Content/directory/approval/identity tasks, `/guest-check-in`, `/home`, and `/events`. Material loading, empty, error, forbidden, auth-expired, dirty, saving, conflict, Sheet/Dialog/AlertDialog, long CJK/unbroken copy, scale, camera fallback, and print states run at their composition-changing widths.

## Acceptance trace rows

| ID | Criterion | Observable HTTP / D1 / DOM result | Exact command | Output artifact | Status rule |
| --- | --- | --- | --- | --- | --- |
| F-494-01 | Legacy Account and registration role contraction | `accounts` and `registration_requests` have no `role` column or write-guard trigger; approval creates one Active role-free account with automatic `會友基礎`; capability-bearing scoped/custom identity succeeds while a labelled identity without the capability receives the existing `FORBIDDEN` Problem Details response. | `pnpm verify:identity && pnpm --dir web exec vitest run --config vitest.config.ts lib/identity/d1-schema.test.ts lib/identity/seeds.test.ts lib/identity/role-hierarchy.test.ts lib/identity/role-handlers.test.ts lib/auth/accounts.test.ts lib/auth/registrations.test.ts lib/auth/registration-authority.test.ts lib/auth/registration-batch.test.ts` | `docs/qa/2026-09-01-s4-phase-f-release-gate.md` plus focused test output captured in the final evidence record | `READY` only when all schema, approval, capability, and status-transition assertions pass. |
| F-494-02 | Compatibility route, DTO, and helper contraction | Auth/bootstrap/me/upgrade JSON contains normalized `identities` and `capabilities` without `role` or `systemRole`; unknown routes, including `/api/v1/programs/account-permissions`, return the standard 404 Problem Details response; no fixed-role DTO/helper path remains. | `pnpm verify:contraction && pnpm --dir web exec vitest run --config vitest.config.ts worker.auth.test.ts lib/auth/registrations.test.ts lib/auth/registration-authority.test.ts && pnpm typecheck && pnpm --dir web typecheck` | `docs/qa/2026-09-01-s4-phase-f-release-gate.md` and contraction command output | `READY` only with zero forbidden shipped occurrences and the generic unknown-route assertion passing. |
| F-494-03 | Shipped CSS and dead implementation contraction | No shipped `.module.css` import or forbidden fixed-role/compatibility implementation under the scanned web surfaces; shell, Guest, section loading/error/empty/ready, skip-link, offline, forbidden recovery, dock/rail, focus, target, overflow, and long-copy behavior remains observable. | `pnpm verify:contraction && pnpm --dir web exec vitest run --config vitest.components.config.ts lib/app.test.tsx lib/section-view.test.tsx && AUTH_UI_TARGET_URL=http://127.0.0.1:8787 pnpm exec playwright test --config=tests/e2e/phase-d-public-geometry.config.ts && pnpm test:shell-responsive && pnpm test:shell-geometry` | Per-suite Playwright JSON under `tests/e2e/test-results/phase-f/` and rendered `docs/qa/2026-09-01-s4-phase-f-release-evidence.{json,html}` | `READY` only when the scanner is clean and all focused component/geometry assertions pass without a visual redesign. |
| F-494-04 | Explicit stale-schema and reset proof | A legacy pre-019 table coexisting with normalized tables causes `preflightDisposableSchema()` to report stale schema and an explicit reset command; no stale table is dropped automatically; post-migration SQLite has the seven normalized identity tables, no pre-019 tables, and no Account/registration `role` column. | `pnpm --dir web exec vitest run --config vitest.config.ts lib/identity/d1-schema.test.ts && pnpm db:seed:local && pnpm db:seed:disposable && pnpm exec tsx tests/e2e/inspect-local-identity-schema.ts` | Schema assertions and SQLite inspection in `docs/qa/2026-09-01-s4-phase-f-release-gate.md` | `READY` only when refusal is read-only and the explicit reset path is proven separately from migration/startup. |
| F-495-01 | Canonical route and persona journeys | Each canonical ready route reaches its expected DOM state for the required persona/fixture; auth expiry, forbidden, dirty/saving/conflict, redirects, dialogs, and mutation outcomes preserve URL and visible identity/access summaries. | `AUTH_UI_TARGET_URL=http://127.0.0.1:8787 pnpm exec playwright test --config=tests/e2e/phase-d-public-geometry.config.ts && PROGRAMS_TARGET_URL=http://127.0.0.1:8787 pnpm exec playwright test --config=tests/e2e/phase-d-programs-geometry.config.ts && PROGRAMS_TARGET_URL=http://127.0.0.1:8787 pnpm exec playwright test --config=tests/e2e/s4-management-hardening.config.ts && PROGRAMS_TARGET_URL=http://127.0.0.1:8787 pnpm exec playwright test --config=tests/e2e/attendance-d1.config.ts && PROGRAMS_TARGET_URL=http://127.0.0.1:8787 pnpm exec playwright test --config=tests/e2e/programs-d1.config.ts && AUTH_TARGET_URL=http://127.0.0.1:8787 pnpm exec playwright test --config=tests/e2e/auth-d1.config.ts && AUTH_UI_TARGET_URL=http://127.0.0.1:8787 pnpm exec playwright test --config=tests/e2e/live-ui.config.ts` | Geometry reports: `tests/e2e/test-results/phase-f/<suite>/results.json`; route-only reports: `tests/e2e/test-results/attendance-d1-results.json`, `auth-d1-results.json`, and `live-ui-results.json` when produced; a failed Programs D1 run is represented by its Playwright failure log and has no report | `READY` only when every required journey has no failed assertion and every skip has a recorded reason; an absent report from a failed suite remains `BLOCKED`. |
| F-495-02 | W7 and material-state numeric geometry | Every existing geometry object is attached as UTF-8 JSON before its assertion; results preserve viewport, rectangles, tokens/breakpoints, gaps, overflow, target sizes, overlap, dock/rail, and final-anchor clearance. | `pnpm test:shell-responsive && pnpm test:shell-geometry && pnpm test:role-hierarchy-geometry && AUTH_UI_TARGET_URL=http://127.0.0.1:8787 pnpm exec playwright test --config=tests/e2e/phase-d-public-geometry.config.ts && PROGRAMS_TARGET_URL=http://127.0.0.1:8787 pnpm exec playwright test --config=tests/e2e/phase-d-programs-geometry.config.ts && PHASE_E_TARGET_URL=http://127.0.0.1:8787 pnpm exec playwright test --config=tests/e2e/phase-e-attendance-geometry.config.ts && PROGRAMS_TARGET_URL=http://127.0.0.1:8787 pnpm exec playwright test --config=tests/e2e/s4-management-hardening.config.ts` | Numeric attachments in each suite report plus `docs/qa/2026-09-01-s4-phase-f-release-evidence.{json,html}` | `READY` only when all applicable widths/states pass horizontal overflow ≤1 CSS px, targets ≥44×44 CSS px, and anchor/focus clearance rules. |
| F-495-03 | Worker and D1 reliability | Local Worker starts on loopback; identity, Worker, component, prototype, and full local test contracts pass against disposable data; no remote or production system is touched. | `pnpm verify:identity && pnpm test:workerd && pnpm --dir web test:components && pnpm test` after `pnpm dev:local`, `pnpm db:seed:local`, `pnpm db:seed:disposable`, and `DEMO_TARGET_URL=http://127.0.0.1:8787 pnpm db:seed:demo` | Local process logs, suite reports, and final evidence record | `READY` only when all enabled suites pass and the four explicitly excluded Phase C Worker tests remain recorded as excluded #498 debt. |
| F-495-04 | Human accessibility and device evidence | Reviewer records exact OS/browser/device/assistive technology, viewport/text setting, route/state/action, and observed result for camera/touch/safe-area, print, keyboard/AT, reduced motion, forced colors, zoom/reflow, text spacing, and real hardware. | Manual execution documented in `docs/qa/2026-09-01-s4-phase-f-release-gate.md` | `docs/qa/2026-09-01-s4-phase-f-release-gate.md` | `READY` only with explicit human `PASS` for every applicable gate; unavailable gates remain `UNCLAIMED` and force overall `CONDITIONAL`; any `FAIL` is `BLOCKED`. |
| F-495-05 | Authority and audit reconciliation | Glossary, ADRs, specs, design/inventory, audit dispositions, and test README describe normalized Role Category/Definition/Assignment, capability-owned authorization, Civic Minimal tokens, numeric evidence, and the remaining conditional manual gates without stale implementation claims. | `pnpm verify:contraction && git diff --check` plus review of all listed authority files after rendered evidence exists | `docs/qa/2026-09-01-s4-phase-f-audit-dispositions.md`, updated authority documents, and final evidence JSON/HTML | `READY` only when every active shipped P0/P1 is `Fixed` or explicitly `Blocked`, provenance is linked, and no stale authority claim remains. |

## Final verdict

The final verdict is `AUTOMATION READY — RELEASE CONDITIONAL` when F-494-01..04, F-495-01..03, and F-495-05 are `READY`, F-495-04 has only `UNCLAIMED` rows, and no row is `BLOCKED`. A manual `FAIL`, unresolved shipped P0/P1, obsolete compatibility path, shipped CSS Module, stale authority document, mixed evidence provenance, or failed automated row makes the verdict `BLOCKED`.

## Programs D1 full-journey disposition

The required single-process
`PROGRAMS_TARGET_URL=http://127.0.0.1:8787 pnpm exec playwright test --config=tests/e2e/programs-d1.config.ts`
run was retried after reseeding disposable local fixtures and after the
navigation/readiness fixes recorded on this branch. Earlier attempts reproduced
the local arm64 `workerd` failure (`kj::async-io-unix.c++:186 disconnected`,
`Broken pipe`, followed by Playwright `Network connection lost` or
`ERR_CONNECTION_REFUSED`) after roughly 30–53 tests. The latest final-gate
attempt lost the Worker after the first four tests and then failed at
`page.goto("/")` with `ERR_CONNECTION_REFUSED`. The first failing journey is
therefore an infrastructure-backed `BLOCKED` result, not a converted skip.

The participant Programs geometry report records 24/24 passing assertions
from eight isolated project runs at the required widths after the same
readiness fixes. That report proves the numeric geometry seam only; it does
not promote the failed single-process Programs D1 journey to `READY`.
F-495-01 and F-495-03 remain `BLOCKED` by this result. F-495-04 remains
`UNCLAIMED` where human evidence is unavailable. The authoritative aggregate
verdict is recorded in
`docs/qa/2026-09-01-s4-phase-f-release-gate.md`.

## Final gate re-verification — 2026-09-02

The required final local matrix was rerun against the already-seeded disposable
D1 database and loopback Worker. The Programs geometry and full Programs D1
commands both failed after the local arm64 Worker terminated; management also
failed after the same Worker death. The first live UI run had 30 expected and
2 unexpected assertion failures for the approval-empty state; after resetting
and reseeding disposable fixtures, the same live UI command passed 32/32.

F-495-02 is `BLOCKED` for the current gate because the latest required
Programs geometry rerun failed when the local Worker died. The committed
deterministic report (367 total, 282 passed, 85 intentional skips, 0 failed)
and its prior 24/24 isolated-project Programs geometry input remain historical
numeric evidence only. The failed reruns are recorded in the release-gate
record and are not converted to skips or passes. The aggregate verdict
therefore remains `BLOCKED`; human-only rows remain `UNCLAIMED`.

The final post-matrix reliability rerun also exposed one workerd-suite
failure: `pnpm test:workerd` exited 1 with 39 files, 573 passed, and the
existing `lib/programs/programs.test.ts` PUI-02 test timing out at its default
30-second budget (`programs.test.ts:7454`). `pnpm verify:identity` passed
98/98 before that command; separate reruns of components and prototype passed
786/786 and 38/38. The earlier workerd pass remains historical, so F-495-03
is blocked by this fresh timeout as well as the full Programs D1 failure.



## Executed results

- Generated: 2026-09-02T03:58:52.764Z
- Target: http://127.0.0.1:8787/
- Total assertions: 24 | Passed: 24 | Failed: 0

| Role | Assertion | Result | Detail |
|------|-----------|--------|--------|
| w-320 | participant material states remain contained | PASS |  |
| w-320 | participant Event Detail and recovery states remain contained | PASS |  |
| w-320 | management directory and workspace remain contained | PASS |  |
| w-390 | participant material states remain contained | PASS |  |
| w-390 | participant Event Detail and recovery states remain contained | PASS |  |
| w-390 | management directory and workspace remain contained | PASS |  |
| w-600 | participant material states remain contained | PASS |  |
| w-600 | participant Event Detail and recovery states remain contained | PASS |  |
| w-600 | management directory and workspace remain contained | PASS |  |
| w-799 | participant material states remain contained | PASS |  |
| w-799 | participant Event Detail and recovery states remain contained | PASS |  |
| w-799 | management directory and workspace remain contained | PASS |  |
| w-800 | participant material states remain contained | PASS |  |
| w-800 | participant Event Detail and recovery states remain contained | PASS |  |
| w-800 | management directory and workspace remain contained | PASS |  |
| w-900 | participant material states remain contained | PASS |  |
| w-900 | participant Event Detail and recovery states remain contained | PASS |  |
| w-900 | management directory and workspace remain contained | PASS |  |
| w-1024 | participant material states remain contained | PASS |  |
| w-1024 | participant Event Detail and recovery states remain contained | PASS |  |
| w-1024 | management directory and workspace remain contained | PASS |  |
| w-1440 | participant material states remain contained | PASS |  |
| w-1440 | participant Event Detail and recovery states remain contained | PASS |  |
| w-1440 | management directory and workspace remain contained | PASS |  |

