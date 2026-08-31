# S4 Phase C — Stackable Identity Integration QA Evidence

**Status: LOCAL EVIDENCE RECORDED; RELEASE GATES REMAIN OPEN.**

## Scope and references

- Scope: #485 Permission Editor, #486 Account Access, and #487 normalized authority cutover, under parent #475.
- Required specifications: `docs/specs/091-stackable-identity-backend.md` and `docs/specs/092-discord-identity-design-system-adoption.md`.
- Plan: `local://s4-phase-c-identity-integration-plan.md`.
- Acceptance trace: `docs/specs/s4-phase-c-acceptance-trace.md`.
- Current local verification revision: `f3cf4e1db292426d5ba4dc93a1dcadbe0f71c262`.
- Phase B base: `c75c99e84d699d2d1eac44f07d4e013ead4c12a5` (`feat/s4-b-shared-modules-role-definitions`).
- Authenticated browser target: `http://127.0.0.1:8797`, direct Node `v22.18.0` Wrangler process, disposable local D1 only.
- No remote host, Cloudflare account, Apps Script, Google Sheet, production database, deployment, or Phase D path was used.

## Required ticket/spec reread and documentation status

Every implementation and review delegation was instructed to reread #485/#486/#487, parent #475, Specs 091/092, the Phase C plan, and the acceptance trace before acting. Delegations were also instructed to use Context7 CLI for unfamiliar APIs and report the exact result. The CLI returned the current quota response on each invocation:

`✖ Monthly quota exceeded. Create a free API key at https://context7.com/dashboard for more requests.`

No fresh documentation identifier or unsupported API claim is recorded here.

## Source and focused checks

| Check | Result |
| --- | --- |
| `pnpm typecheck` | **PASS**, root and E2E TypeScript |
| `pnpm --dir web typecheck` | **PASS**, web and Worker TypeScript |
| `pnpm --dir web build` | **PASS**, 18/18 static routes generated |
| `pnpm --dir web test:components` | **PASS**, 59 files, 690/690 |
| `pnpm verify:identity` | **PASS**, 4 files, 94/94 |
| `pnpm test` | **PASS**, 1 file, 38/38 |
| Focused management identity components | **PASS**, 4 files, 62/62 |
| `pnpm test:shell-responsive` | **PASS**, 92 passed, 1 intentional skip |
| `pnpm test:shell-geometry` | **PASS**, 28/28 |
| `pnpm test:role-hierarchy-geometry` | **PASS**, 49/49 across 320, 390, 600, 799, 800, 1024, and 1440 CSS px |
| `git diff --check` | **PASS**, no whitespace errors |
| `pnpm check` | **FAIL**, repository-wide Ultracite baseline: 1,782 errors and 0 warnings; no lint-clean claim is made |

Component output contained only existing jsdom `scrollTo()` and navigation notices. No component assertion failed.

## Local disposable runtime and browser checks

The prescribed `pnpm --dir web dev:local` launcher remains unavailable under the workstation's supervised Node `v20.19.0` runtime because pnpm exits with `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`. For local-only verification, a separate direct Node `v22.18.0` Wrangler process was started on loopback port 8797 with `EFCC_ACCESS_TOKEN_SECRET` injected through Wrangler `--var`. It was stopped after the checks.

The checked-in local reset completed 20 D1 commands. The demo seed completed with four `E2E_DEMO_` Programs, 13 generated events, module-gate data, participant notices, and Home content. The local browser suites used disposable local D1 and were run with the corresponding target variable:

| Check | Exact result |
| --- | --- |
| `programs-d1.config.ts` | **PASS**, 195/195 with one worker after reset and demo seed |
| `s4-management-hardening.config.ts` | **PASS**, 45 passed and 65 intentional `onlyProjects` skips; 110 scheduled, zero failures |
| `live-ui.config.ts` | **PASS**, 28/28 across phone and desktop projects after a clean fixture reset |
| `member-directory.config.ts` | **PASS**, 1/1; global Admin/Staff visibility, scoped Department Manager exclusion, and inline detail |

The first live-ui attempt used the wrong environment variable and was not counted. It was rerun with `AUTH_UI_TARGET_URL=http://127.0.0.1:8797`; the corrected run passed 28/28.

## Explicit remaining gates

- `pnpm --dir web test` exits 1 after 37 passing files and 555 passing assertions because four normalized Worker files abort before assertions in the installed Cloudflare pool with `EvalError: Code generation from strings disallowed for this context`:
  - `web/lib/auth/normalized-authority-c487.test.ts`
  - `web/lib/identity/permission-editor.test.ts`
  - `web/lib/identity/permission-editor-handlers.test.ts`
  - `web/lib/identity/normalized-authority.test.ts`
- `docs/qa/2026-08-29-s4-phase-c-vitest-pool-research.md` records the Vite/workerd evaluator cause and the decision not to add unsafe-eval, `NODE_OPTIONS`, pool downgrades, or assertion suppression.
- `C-487-M1` keyboard/screen-reader plus reduced-motion/forced-colors/zoom/text-spacing, `C-487-M2` real iOS/Android dock and safe-area, `C-487-M3` remote-CI parity, and `C-487-M4` production-promotion dry run remain **MANUAL, unclaimed**.
- The direct Node 22 Worker evidence is loopback-only and is not relabeled as the supervised `dev:local` gate.
- No screenshot, pixel-diff, WCAG conformance, screen-reader, real-device, remote-CI, production-promotion, or deployment claim is made.

## Final corrected verification — current `6c93b8d0` — 2026-08-31

The final corrections now include assignment-scope snapshots as the
authoritative display/authorization scope for active and revoked assignments,
scope-aware Programs directory projections, CVA-owned management state
variants, and a 320px Programs workspace tile containment fix.

| Check | Exact result |
| --- | --- |
| `pnpm typecheck` | **PASS** |
| `pnpm --dir web typecheck` | **PASS** |
| `pnpm --dir web build` | **PASS**, 18/18 static routes generated |
| `pnpm --dir web test:components` | **PASS**, 59 files, 690/690 |
| `pnpm verify:identity` | **PASS**, 4 files, 94/94 |
| Account Access scope regressions | **PASS**, 2 files, 29/29; normalized-authority pool file remained blocked separately |
| `pnpm test` | **PASS**, 1 file, 38/38 |
| `pnpm test:shell-responsive` | **PASS**, 92 passed, 1 intentional skip |
| `pnpm test:shell-geometry` | **PASS**, 28/28 |
| `pnpm test:role-hierarchy-geometry` | **PASS**, 49/49 |
| `programs-d1.config.ts` | **PASS**, 195/195 after clean reset/demo seed |
| `s4-management-hardening.config.ts` | **PASS**, 45 passed and 65 intentional `onlyProjects` skips; 110 scheduled |
| `live-ui.config.ts` | **PASS**, 28/28 |
| `member-directory.config.ts` | **PASS**, 1/1 |
| Registration fixture hygiene query | **PASS**, `pending: 0`, `legacy_s4: 0` |
| `git diff --check` | **PASS** |
| `pnpm check` | **FAIL**, repository-wide Ultracite baseline: 1,813 errors and 0 warnings |

The final Programs run used the direct Node 22 Wrangler process on
`http://127.0.0.1:8797` and one Playwright worker. The process was stopped
after the local checks. The prescribed supervised Node 20 `dev:local` command
remains unavailable because of `node:sqlite`; this direct loopback run is not
relabeled as that gate.

`pnpm --dir web test` still exits 1 after 37 passing files and 555 passing
assertions because the four normalized Worker files abort before assertions
with the known Cloudflare-pool/Vite `EvalError`. No assertion suppression or
unsafe runtime workaround was added. The required manual M1–M4 gates remain
unclaimed, and no remote or production resource was touched.

## Final summary-scope verification — current `c0905b2e` — 2026-08-31

The final identity correction filters hierarchy assignment counts/IDs and
Permission Editor assigned-account detail by immutable assignment scope before
returning a scoped projection. The authoritative document paths are the
repository Specs 091/092 above and the approved plan artifact
`local://s4-phase-c-identity-integration-plan.md`.

| Check | Exact result |
| --- | --- |
| `pnpm typecheck` | **PASS** |
| `pnpm --dir web typecheck` | **PASS** |
| `pnpm --dir web build` | **PASS**, 18/18 static routes generated |
| `pnpm --dir web test:components` | **PASS**, 59 files, 690/690 |
| Scoped-summary component subset | **PASS**, 5 files, 113/113 |
| `pnpm verify:identity` | **PASS**, 4 files, 95/95 |
| Account Access and history tests | **PASS**, 2 files, 29/29 |
| `pnpm test` | **PASS**, 1 file, 38/38 |
| `pnpm test:shell-responsive` | **PASS**, 92 passed, 1 intentional skip |
| `pnpm test:shell-geometry` | **PASS**, 28/28 |
| `pnpm test:role-hierarchy-geometry` | **PASS**, 49/49 |
| `programs-d1.config.ts` | **PASS**, 195/195 after the workspace tile correction |
| `s4-management-hardening.config.ts` | **PASS**, 45 passed and 65 intentional `onlyProjects` skips; 110 scheduled |
| `live-ui.config.ts` | **PASS**, 28/28 |
| `member-directory.config.ts` | **PASS**, 1/1 |
| Local registration hygiene query | **PASS**, `pending: 0`, `legacy_s4: 0` |
| `pnpm check` | **FAIL**, repository-wide Ultracite baseline: 1,813 errors and 0 warnings |

The aggregate `pnpm --dir web test` remains an explicit environment blocker:
37 files and 555 assertions pass, while four normalized Worker files abort
before product assertions with the known Cloudflare-pool/Vite
`EvalError: Code generation from strings disallowed for this context`.
The direct Node 22 Wrangler run was loopback-only and stopped after checks;
the supervised Node 20 `dev:local` launcher still fails on
`ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`.

Manual `C-487-M1` through `C-487-M4` remain unclaimed. No remote or production
resource, Apps Script, Google Sheet, deployment, screenshot, pixel-diff,
WCAG, screen-reader, real-device, or Phase D path was touched.

## Final affordance verification — current `4773b63d` — 2026-08-31

The identity-first Role Tree now renders the Account Access entry only when
the server projects `role.assign` or `role.revoke` assignment actions. A
read-only `role.read` viewer with assigned identities receives the summary but
not a dead-end mutation link. The component regression passes alongside the
existing zero-assignment assignment-action path.

| Check | Exact result |
| --- | --- |
| `pnpm --dir web test:components` | **PASS**, 59 files, 691/691 |
| `pnpm verify:identity` | **PASS**, 4 files, 95/95 |
| `pnpm typecheck` | **PASS** |
| `pnpm --dir web typecheck` | **PASS** |
| `pnpm --dir web build` | **PASS**, 18/18 static routes generated |
| `pnpm test:shell-responsive` | **PASS**, 92 passed, 1 intentional skip |
| `pnpm test:shell-geometry` | **PASS**, 28/28 |
| `pnpm test:role-hierarchy-geometry` | **PASS**, 49/49 |
| `programs-d1.config.ts` | **PASS**, 195/195 after the 320px workspace tile correction |
| `s4-management-hardening.config.ts` | **PASS**, 45 passed and 65 intentional `onlyProjects` skips; 110 scheduled |
| `live-ui.config.ts` | **PASS**, 28/28 |
| `member-directory.config.ts` | **PASS**, 1/1 |
| Account Access and history tests | **PASS**, 2 files, 29/29 |
| `pnpm --dir web test` | **BLOCKED**, 37 files and 556 assertions pass; 4 normalized Worker files abort before assertions with the known Cloudflare-pool/Vite EvalError |
| `pnpm check` | **FAIL**, repository-wide Ultracite baseline: 1,813 errors and 0 warnings |

All local browser checks used disposable D1 on loopback with direct Node 22
Wrangler; the Worker was stopped after verification. Manual M1–M4 remain
unclaimed. No remote/production, Apps Script, Sheet, deployment, screenshot,
pixel-diff, WCAG, screen-reader, real-device, or Phase D claim is made.

## Final pre-publication verification — source `f3cf4e1db292426d5ba4dc93a1dcadbe0f71c262` — 2026-08-31

The final source tree was clean on branch
`feat/s4-c-stackable-identity-integration`. The accepted Phase B merge-base
remained `c75c99e84d699d2d1eac44f07d4e013ead4c12a5`. All authenticated browser
checks below used the direct Node `v22.18.0` Wrangler process at
`http://127.0.0.1:8797`, the `EFCC_ACCESS_TOKEN_SECRET=phase-c-local-only-secret`
test secret, and disposable local D1 only. The Worker was stopped after the
registration-residue query.

### Source and focused verification

| Check | Exact result |
| --- | --- |
| `pnpm typecheck` | **PASS**, root and E2E TypeScript |
| `pnpm --dir web typecheck` | **PASS**, web and Worker TypeScript |
| `pnpm --dir web build` | **PASS**, 18/18 static routes generated |
| `pnpm test` | **PASS**, 1 file, 38/38 |
| `pnpm verify:identity` | **PASS**, 4 files, 96/96 |
| `pnpm --dir web test:components` | **PASS**, 59 files, 692/692 |
| Focused identity/account/Hub/attendance runner | **PASS**, 6 files, 107/107 |
| Focused Account Access handler + Hub runner | **PASS**, 2 files, 18/18 |
| Account Access + Permission Editor component runner | **PASS**, 2 files, 45/45 |
| `pnpm --dir web test` | **INFRA-BLOCKED**, exit 1; 37 files and 559 assertions passed; `lib/auth/normalized-authority-c487.test.ts`, `lib/identity/permission-editor.test.ts`, `lib/identity/permission-editor-handlers.test.ts`, and `lib/identity/normalized-authority.test.ts` aborted before assertions with `EvalError: Code generation from strings disallowed for this context` while starting the Cloudflare pool |
| `pnpm check` / final `ultracite check --format json` | **BASELINE-FAILED**, exit 2; 295 files, 1,824 diagnostics, 0 warnings, 557 rules. The changed-line audit found zero diagnostics introduced by the Phase C patch; existing repository baseline diagnostics remain |
| Retired-authority audit | **PASS**, hits are limited to `web/lib/identity/preflight.ts`, `tests/e2e/seed-disposable-identity.ts`, and explicit stale-schema tests; no executable legacy authority read/write exists outside those guards |

The repository uses Vitest `4.1.10`, workspace Vite resolution `5.4.21`, the
Cloudflare-pool startup stack reports Vite `8.2.0`, Wrangler `4.127.1`,
Playwright `1.62.1`, pnpm `11.7.0`, and Node `22.18.0`. Context7 CLI was
attempted for the shadcn/Radix API facts and returned exactly:

`✖ Monthly quota exceeded. Create a free API key at https://context7.com/dashboard for more requests.`

No fresh Context7 documentation claim is made. The prescribed Node 20
`pnpm dev:local` launcher remains **INFRA-BLOCKED** by
`ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`; the direct Node 22 loopback process
was used only for local verification and is not the prescribed launcher.

### Local disposable seed preflight

The wrapper probe created only disposable local `role_capabilities`, measured
five existing `role_definitions`, and ran `pnpm db:seed:disposable`. It exited
1 before any seed write and printed the manual local-only reset command:

`pnpm --dir web exec wrangler d1 execute efcc-identity --local --command "DROP TABLE IF EXISTS role_capabilities;"`

The post-failure `role_definitions` count remained five. After manually
dropping only that probe table, the wrapper succeeded. The full
`pnpm db:seed:local` caller also succeeded. No remote flag, automatic DROP,
runtime backfill, or alternate seed format was used.

### Browser and geometry gates

Each mutating suite was preceded by a disposable local reset and demo seed.
The final outcomes were:

| Gate | Exact result |
| --- | --- |
| `programs-d1.config.ts` | **PASS**, 195/195 |
| `s4-management-hardening.config.ts` | **PASS**, 45 passed, 65 intentional `onlyProjects` skips, 110 scheduled |
| `live-ui.config.ts` | **PASS**, 28/28 |
| `member-directory.config.ts` | **PASS**, 1/1 |
| `pnpm test:shell-responsive` | **PASS**, 92 passed, 1 intentional skip |
| `pnpm test:shell-geometry` | **PASS**, 28/28 |
| `pnpm test:role-hierarchy-geometry` | **PASS**, 49/49 across W7 `320, 390, 600, 799, 800, 1024, 1440` CSS px |
| Registration residue query | **PASS**, `pending: 0`, `legacy_s4: 0` using `registration_requests.account_status` and the `e2e-s4-*` / `s4-*` username prefixes |

The final hardening and live UI runs required two test-only selector
corrections so semantic Role/Permission links are queried as links rather than
buttons. Those corrections are included in the source provenance above.

### Release-gap classification

`C-485-M1`, `C-485-M2`, `C-486-M1`, `C-486-M2`, and `C-487-M1` through
`C-487-M4` remain `MANUAL — unclaimed`. This evidence makes no screenshot,
pixel-diff, WCAG-conformance, screen-reader, real-device, remote-CI, Cloudflare
promotion, Apps Script, Google Sheet, production-D1, deployment, merge, or
Phase D claim.
