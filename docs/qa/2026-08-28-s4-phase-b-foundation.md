# S4 Phase B — Shared Modules and Identity Definitions Evidence

**Status: CONDITIONAL — not published.** The Phase B implementation and aggregate local checks are recorded below. The authenticated local-D1 gate is blocked by a reproducible Wrangler/Miniflare process failure, and one Programs workspace geometry contract still fails on a 44px control assertion. This report makes no production-readiness claim.

## Scope and references

- Scope: #479, #480, #481, #482, #483, #484 only.
- Stack base: `remediate-478` / Phase A PR #496 head `3cc674f4e2240abaebb47bb75c6614a8c3d7c624`.
- Pre-correction implementation head: `28e801134939dc471be938c97ce552fb90bf1973`.
- Branch: `feat/s4-b-shared-modules-role-definitions`.
- Plan: `docs/omp-plans/2026-08-28-s4-phase-b-shared-modules.md`.
- Trace: `docs/specs/s4-phase-b-acceptance-trace.md` (61 strict six-column rows, `B-479-01` through `B-484-08`).
- Local-only target: `http://127.0.0.1:8787`, disposable local D1 `efcc-identity`; no production, Apps Script, Sheets, or Cloudflare writes.

## Delegated implementation and review

- #479 identity creation/order/rescope: `1e5a3d40`, `f3209708`, `849be7e4`; identity reviewer READY.
- #480 settings/lifecycle/header: `7ddf32d2`; inline review READY.
- #481 approval Action Surface/primitives: `d021676a`, `e267c189`; approval reviewer READY.
- #482 Directory Frame: worker `6c3b5455`, integrated as `e2e8f8a3`; reviewer READY.
- #483 Feed Presentation: worker `4e9c0851`, integrated as `d30b1cb1`; reviewer READY.
- #484 Programs Workspace split: worker `f4913b32`, integrated as `60a265d6`; reviewer READY.
- Integration correction head before this evidence pass: `28e80113`.
- Final correction commit: `8bf830e3` (`fix(s4-b): finalize shared module corrections`).
- The normal Husky hook failed on the documented Ultracite findings; the staged correction commit was then created with `HUSKY=0`. This is an explicit hook bypass, not a green hook result.
- Shared boundaries remain narrow: queries, rows, filters, validation, URLs, permissions, and mutations stay in route/domain adapters. No generic Form/DataTable/Task/authorization framework was added.

## Live E2E progress configuration

`tests/e2e/programs-d1.config.ts` now uses the built-in Playwright `line` reporter. It does not add a custom reporter or a live JSON writer. Running with `PW_TEST_DEBUG_REPORTERS=1` emits one progress line per test to the process output, including project and test title. Context7 CLI research selected `/microsoft/playwright.dev`; the installed Playwright reporter implementation confirms the standard `line` reporter and `PW_TEST_DEBUG_REPORTERS` behavior.

Verification: one local smoke test passed with `LIVE_LINE_REPORTER_SMOKE=0` and output `[1/1] [phone-320] ...` followed by `1 passed`.

## Seeds and focused checks

| Check | Result |
|---|---:|
| `pnpm db:seed:local` | 0 |
| `pnpm db:seed:demo` | 0; `E2E_DEMO_示範事工` and four `E2E_DEMO_*` programs seeded |
| `pnpm verify:identity` | 4 files, 83 passed |
| approval/directory/feed/workspace focused component shards | 179 passed |
| `pnpm test:shell-geometry` | 28 passed; `SHELL_GEOMETRY=0` |
| `pnpm test:role-hierarchy-geometry` | 21 passed; `ROLE_GEOMETRY=0` |
| PUI-02 long catalog overflow, phone-320 | 1 passed after card `width/min-width/white-space` correction |
| NTC-01 Notices group, phone-320 | 5 passed after restoring the named list semantics |
| MUI-01 workspace geometry, phone-320 | **failed** at `programs-d1.test.ts:2924`; horizontal overflow was reduced but one workspace control remains below the asserted 44px target |

The MUI-01 failure reproduced twice on a live Worker with the same assertion and retry failure. It is not classified as a socket flake.

## Aggregate checks

| Check | Result |
|---|---:|
| `pnpm --dir web test` | 36 files, 567 passed |
| `pnpm --dir web test:components` | 58 files, 679 passed |
| `pnpm typecheck` | 0; root and E2E TypeScript |
| `pnpm --dir web typecheck` | 0; web and Worker TypeScript |
| `pnpm --dir web build` | 0; 18 static routes generated |
| `git diff --check` | 0 after removing one trailing-space defect |
| `pnpm check` | **1**; full Ultracite baseline plus remaining changed-file findings |

The normal Husky commit hook was attempted. `ultracite fix` failed and Husky rolled back its temporary formatting changes; representative findings include `react-hooks/exhaustive-deps`, `react(function-component-definition)`, `vitest(max-expects)`, `vitest(require-top-level-describe)`, and `eslint(no-empty-function)`. No assertions were weakened and no lint suppression was added.

## Local D1 E2E gate classification

The post-revert full run used the cleaned `line` reporter and one worker:

- 207 tests scheduled.
- `60 passed`, `145 failed`, `2 did not run`, exit `1`, approximately 6 minutes.
- The latest Worker log records `2026-08-28T15:59:08.352Z` `Error in ProxyController: Error inside ProxyWorker`, cause `Network connection lost.`, through Miniflare `#handleLoopbackCustomFetchService` / `#handleLoopback`.
- The browser failures after that timestamp are `ERR_CONNECTION_REFUSED` and are classified as infrastructure cascade, not product assertions.

An isolated phone-320 run reached `58 passed` and 11 failed before the same Worker failure. Its non-network observations were separated from the cascade:

- Notices initially remained in the loading presentation while the DOM list existed; restoring `aria-label="通知清單"` to the actual `<ul>` made the five-test Notices group pass.
- PUI-02 long-copy geometry initially measured `bodyScrollWidth=452` at 320px; making the participant card a constrained, wrapping full-width grid made the focused test pass.
- Workspace geometry initially measured `workspaceScrollWidth=321` (then 288 after header wrapping); the remaining failure is the independent all-controls `>=44px` assertion at line 2924.
- Event detail had a wall-clock expectation mismatch (`24:25` expected by the test versus `00:25` rendered); this run is not used as green evidence.
- Later `ERR_CONNECTION_REFUSED` failures are infrastructure cascade after the Worker exit.

The D1 run is therefore **not green** and is not a readiness gate. The Worker issue is local-only and reproducible with Wrangler 4.118.0 / Miniflare `5.20260730.0-alpha`; no remote target was touched.

## Obsolete-path and manual-gate notes

- `/profile/settings` has one canonical richer `AccountSettings` implementation; the duplicate settings page/CSS was removed.
- `LegacyApprovalDetail`, duplicate directory CSS, Home/Notices obsolete CSS, and unreachable Programs Attention code were removed only after caller checks.
- Global Notifications remains outside the program workspace; the existing valid shipped caller is preserved.
- Human keyboard/AT, reduced-motion, forced-colors, zoom/text-spacing, real-device, and remote-CI checks remain manual. Automated geometry is numeric W7 evidence, not WCAG certification.
- Root `pnpm build` remains the known stub script and is not the production build gate; `pnpm --dir web build` is the real gate and passed.

## Publication boundary

No grouped Phase B PR was opened from this conditional state. No merge, deploy, force-push, production D1 write, or Phase C source work was started. Publication remains blocked until the local-D1 Worker failure is isolated or an explicitly accepted local harness exception is recorded, and the remaining MUI-01 44px control assertion is resolved and rerun.
