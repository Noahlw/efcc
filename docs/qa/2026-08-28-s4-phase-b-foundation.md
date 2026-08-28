# S4 Phase B — Shared Modules and Identity Definitions Evidence

**Status: READY FOR PUBLICATION — not yet published.** The Phase B implementation, deterministic recovery work, and local authenticated gates are green. The next permitted action is one grouped PR for #479–#484; no merge, deploy, production write, or Phase C work is included.

## Scope and references

- Scope: #479, #480, #481, #482, #483, #484 only.
- Final recovery head before this evidence update: `c4737690`.
- Plan: `docs/omp-plans/2026-08-28-s4-phase-b-shared-modules.md`.
- Recovery plan: `docs/omp-plans/2026-08-29-s4-phase-b-exit-recovery.md`.
- Trace: `docs/specs/s4-phase-b-acceptance-trace.md` (61 strict six-column rows, `B-479-01` through `B-484-08`).
- Local-only target: `http://127.0.0.1:8787`, disposable local D1 `efcc-identity`; no production, Apps Script, Sheets, or Cloudflare writes.

## Delegated implementation and review

- #479 identity creation/order/rescope: `1e5a3d40`, `f3209708`, `849be7e4`; identity reviewer READY.
- #480 settings/lifecycle/header: `7ddf32d2`; inline review READY.
- #481 approval Action Surface/primitives: `d021676a`, `e267c189`; approval reviewer READY.
- #482 Directory Frame: worker `6c3b5455`, integrated as `e2e8f8a3`; reviewer READY.
- #483 Feed Presentation: worker `4e9c0851`, integrated as `d30b1cb1`; reviewer READY.
- #484 Programs Workspace split: worker `f4913b32`, integrated as `60a265d6`; reviewer READY.
- Integration correction head before recovery: `28e80113`.
- Deterministic recovery: `c27b8f3b`, `b56590ff`, `526ca76f`, `2566aaf3`, `351aca43`, `6284bbea`, `090ddda3`, and `c4737690`.
- `2566aaf3` pins local Wrangler to `4.127.1`; the resolved runtime uses Miniflare `5.20260828.0-alpha` and Node `v22.18.0`.
- The recovery fixed workspace controls/settings reflow, Hong Kong midnight formatting, approval confirmation/route waits, role-first permissions E2E expectations, Home history measurement, feed visual-overflow measurement, and live-ui route/copy contracts.
- Shared boundaries remain narrow: queries, rows, filters, validation, URLs, permissions, and mutations stay in route/domain adapters. No generic Form/DataTable/Task/authorization framework or repository-wide styling rewrite was added.

## Live E2E progress configuration

`tests/e2e/programs-d1.config.ts` now uses the built-in Playwright `line` reporter. It does not add a custom reporter or a live JSON writer. Running with `PW_TEST_DEBUG_REPORTERS=1` emits one progress line per test to the process output, including project and test title. Context7 CLI research selected `/microsoft/playwright.dev`; the installed Playwright reporter implementation confirms the standard `line` reporter and `PW_TEST_DEBUG_REPORTERS` behavior.

Verification: one local smoke test passed with `LIVE_LINE_REPORTER_SMOKE=0` and output `[1/1] [phone-320] ...` followed by `1 passed`.

## Seeds and focused checks

| Check | Result |
|---|---:|
| `node --version` / `pnpm --version` | `v22.18.0` / `11.7.0` |
| `pnpm db:seed:local` | 0 |
| `pnpm db:seed:demo` | 0; disposable `E2E_` and `E2E_DEMO_` fixtures seeded |
| PUI-03 participant detail, `phone-320` | 1 passed |
| EVT-01 event detail, `phone-320` | 1 passed; recurrence regression 1 passed; EventDetail component 21 passed |
| HUB-01 approval detail, `phone-320` | 1 passed after confirming AlertDialog actions |
| PERM-01 role-first permissions projection, `phone-320` | 2 independent passes after replacing the stale initial-matrix expectation |
| MUI-01 workspace geometry, `phone-320` | 1 passed; internal overview/events/participants/settings W7 loop green |
| PUI-05 Home history/feed geometry, `phone-320` + `phone-390` | 2 passed at each phone width |
| `Settings hub trace` in `live-ui.config.ts`, `phone-375x667` | 1 passed |
| Full `live-ui.config.ts` against local Worker | 28 passed |
| Full `programs-d1.config.ts` against local Worker/D1 | 207 passed; no connection cascade |

The failed-run history remains useful evidence: the original `395.281×32` workspace-row buttons were caused by shadcn base `h-8`/`whitespace-nowrap`/`shrink-0` classes; the `26px` settings controls were caused by the 799px `.settingsForm` row layout; the feed assertion counted intentional clipped accessibility text; and the permissions/live-ui assertions were stale relative to the shipped role-first and single-navigation contracts.

## Aggregate checks

| Check | Result |
|---|---:|
| `pnpm verify:identity` | 4 files, 83 passed |
| `pnpm --dir web test` | 37 files, 568 passed |
| `pnpm --dir web test:components` | 58 files, 679 passed |
| `pnpm typecheck` | 0; root and E2E TypeScript |
| `pnpm --dir web typecheck` | 0; web and Worker TypeScript |
| `pnpm test:shell-responsive` | 92 passed, 1 skipped, exit 0 |
| `pnpm test:shell-geometry` | 28 passed |
| `pnpm test:role-hierarchy-geometry` | 21 passed |
| `pnpm --dir web install --frozen-lockfile` | 0; exact Wrangler `4.127.1` lock verified |
| `pnpm --dir web build` | 0; 18 static routes generated |
| `git diff --check` | 0 |
| `pnpm check` | exit 0; reports the existing 116-file format baseline and one pre-existing touched-file finding at `tests/e2e/pui-05-home-origin.test.ts:705`; no new recovery-file finding |

The repaired normal Husky path was used for every recovery commit. It runs `oxfmt` on staged files and the repository TypeScript checks. The repository-wide Ultracite report still contains pre-existing findings in unrelated files; no suppression or weakened assertion was added.

## Local D1 E2E gate classification

The historical failure used Node 22 with Wrangler `4.118.0` and Miniflare `5.20260730.0-alpha`:

- 207 tests were scheduled.
- The Worker exited during the long desktop run with `Error in ProxyController: Error inside ProxyWorker`, cause `Network connection lost.` through Miniflare loopback handling.
- Subsequent `ERR_CONNECTION_REFUSED` records were infrastructure cascades, not independent product assertions.

The evidence-backed correction pins Wrangler `4.127.1`, whose resolved local runtime uses Miniflare `5.20260828.0-alpha` and workerd `1.20260828.1`. After a fresh build, local migration, disposable seed, and Worker restart, the unfiltered `programs-d1.config.ts` invocation completed with `207 passed (6.8m)`. Worker logs contained no `ProxyController`, `Network connection lost`, or `ERR_CONNECTION_REFUSED` records. The full `live-ui.config.ts` invocation then completed with `28 passed (13.2s)`.

All authenticated browser evidence used `http://127.0.0.1:8787` and disposable local D1 only. No remote host or production database was touched.

## Obsolete-path and manual-gate notes

- `/profile/settings` has one canonical richer `AccountSettings` implementation; the duplicate settings page/CSS was removed.
- `LegacyApprovalDetail`, duplicate directory CSS, Home/Notices obsolete CSS, and unreachable Programs Attention code were removed only after caller checks.
- Global Notifications remains outside the program workspace; the existing valid shipped caller is preserved.
- Full CSS-to-Tailwind/CVA migration is intentionally deferred until after Phase F route behavior is frozen. Phase B uses existing shadcn/Radix/CVA/Tailwind seams only where they already own the caller contract.
- Human keyboard/AT, reduced-motion, forced-colors, zoom/text-spacing, real-device, and remote-CI checks remain manual. Automated geometry is numeric W7 evidence, not WCAG certification.
- Root `pnpm build` remains the known stub script and is not the production build gate; `pnpm --dir web build` is the real gate and passed.

## Publication boundary

The branch is ready for publication. The next step is to verify the GitHub account, push without force, open one grouped PR against the actual Phase A PR #496 dependency, and verify its base/head/state. Do not merge, deploy, force-push, touch remote data, or start Phase C.
