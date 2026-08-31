# S4 Phase C — Stackable Identity Integration QA Evidence

**Status: LOCAL EVIDENCE RECORDED; RELEASE GATES REMAIN OPEN.**

## Scope and references

- Scope: #485 Permission Editor, #486 Account Access, and #487 normalized authority cutover, under parent #475.
- Required specifications: `docs/specs/091-stackable-identity-backend.md` and `docs/specs/092-discord-identity-design-system-adoption.md`.
- Plan: `local://s4-phase-c-identity-integration-plan.md`.
- Acceptance trace: `docs/specs/s4-phase-c-acceptance-trace.md`.
- Current local verification revision: `c0905b2e`.
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
