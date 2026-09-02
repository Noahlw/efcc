# S4 Phase F — Release Gate Record

**Date:** 2026-09-01  
**Base:** `c06f9fc0921830a237a7334f1009a7867663a784`  
**Branch:** `feat/s4-f-contraction-release-gate`  
**Parent scope:** #475 / #494 / #495  
**Runtime:** Linux `6.17.0-1020-oracle` arm64, Node `22.18.0`, pnpm `11.7.0`, pinned Playwright Chromium, local Worker `http://127.0.0.1:8787`  
**Fixture boundary:** local disposable `E2E_`, `E2E_DEMO_`, and `E2E_DISPOSABLE_` D1 rows only

## Aggregate verdict

**BLOCKED — full local Programs D1 journey is not green.**

The required single-process Programs D1 suite was retried after clean local
reseeds and after the navigation/readiness fixes on this branch. On each
attempt the local arm64 `workerd` process disconnected with
`kj::async-io-unix.c++:186 disconnected` / `Broken pipe`; Playwright then
reported `Network connection lost` or `ERR_CONNECTION_REFUSED` after roughly
30–53 tests. This is a failed required automated row, not an intentional skip.

The manual rows below are also `UNCLAIMED`, because no human device,
assistive-technology, print-preview, or preference evaluation was performed.
That absence alone would produce `AUTOMATION READY — RELEASE CONDITIONAL`; the
reproducible failed Programs D1 row makes the aggregate verdict `BLOCKED`.

## Automated evidence disposition

| Trace row | Evidence | Disposition |
| --- | --- | --- |
| F-494-01 | `docs/qa/2026-09-01-s4-phase-f-contraction-evidence.md`; `pnpm verify:identity`; focused identity/auth/registration suites | **READY** — role-free approval, automatic `會友基礎`, capability guard, and normalized schema tests passed. |
| F-494-02 | `pnpm verify:contraction`; generic unknown-route assertion; root and web typechecks | **READY** — zero forbidden shipped occurrences; unknown API route returns standard 404 Problem Details. |
| F-494-03 | Component suites; public geometry; shell responsive/geometry; contraction scanner | **READY** — shipped CSS Module imports are absent and the cited component/geometry seams passed. |
| F-494-04 | `lib/identity/d1-schema.test.ts`; local seed commands; SQLite inspection | **READY** — stale-schema preflight refuses without dropping; post-migration identity tables and role-free Account/registration columns are present as required. |
| F-495-01 | Public, management, attendance, auth, live UI, and Programs D1 route suites | **BLOCKED** — the complete Programs D1 single-process journey loses the loopback Worker. Other route suites passed in their recorded runs. |
| F-495-02 | `docs/qa/2026-09-01-s4-phase-f-release-evidence.{json,html}` | **BLOCKED for the current gate** — the latest required Programs geometry rerun failed when the local Worker died. The 367-item report and 24/24 Programs geometry input remain historical numeric evidence only; they are not promoted to a current `READY` result. |
| F-495-03 | `pnpm verify:identity`, `pnpm test:workerd`, component/prototype/auth/attendance/live UI suites | **BLOCKED** — identity, components, prototype, auth, attendance, and clean-fixture live UI passed, but the fresh workerd PUI-02 timeout and required full Programs D1 runtime failure block the aggregate row. |
| F-495-04 | Manual matrix below | **UNCLAIMED** — no human hardware, assistive technology, print preview, or preference run. |
| F-495-05 | This record, audit dispositions, reconciled authority files, acceptance trace, and rendered evidence | **READY after the authority files are committed** — the aggregate release verdict remains blocked by F-495-01/F-495-03. |

### Recorded passing suites

- `pnpm verify:identity`: 4 files / 98 tests passed.
- Historical `pnpm test:workerd` run: 39 files / 574 tests passed after the NTF lifecycle
  timeout was given its required 120-second per-test budget. The final
  post-matrix rerun is recorded below as 573 passed / 1 failed.
- `pnpm --dir web test:components`: 59 files / 786 tests passed.
- `pnpm test`: 38 prototype tests passed.
- `auth-d1`: 2 tests passed; `attendance-d1`: 52 tests passed; the clean-fixture
  `live-ui` retry passed 32/32. A preceding unreset `live-ui` run failed 2 of
  32 approval-empty assertions and remains recorded above.
- Shell responsive: 92 passed / 1 intentional skip; shell geometry: 28
  passed; Role Hierarchy geometry: 49 passed.
- Public geometry: 94 passed / 4 intentional skips; attendance geometry: 25
  passed / 7 intentional skips.
- Management hardening: the prior isolated run recorded 62 passed / 74
  intentional skips; the final re-verification recorded 7 expected passes,
  74 skips, and 55 unexpected failures after Worker death and is blocked.
- Programs geometry: 24 passed through eight isolated local project runs;
  the single-process Programs D1 journey remains blocked as described above.

The final post-matrix reliability rerun also exposed one workerd-suite
failure: `pnpm test:workerd` exited 1 with 39 files, 573 passed, and the
existing `lib/programs/programs.test.ts` PUI-02 test timing out at its default
30-second budget (`programs.test.ts:7454`). `pnpm verify:identity` passed
98/98 before that command. The chained component and prototype commands were
rerun separately and passed at 786/786 and 38/38. The earlier 39-file /
574-test workerd pass remains historical; the current reliability gate is
blocked by this fresh timeout.


### Numeric report

The renderer command was run against
`tests/e2e/test-results/phase-f`:

```sh
pnpm exec tsx tests/e2e/render-phase-f-evidence.ts \
  --input=tests/e2e/test-results/phase-f \
  --json=docs/qa/2026-09-01-s4-phase-f-release-evidence.json \
  --html=docs/qa/2026-09-01-s4-phase-f-release-evidence.html
```

Observed renderer output: `367 tests (282 passed, 85 skipped, 0 failed)`.
The renderer accepts only loopback target URLs and non-image attachments. The
HTML/JSON report contains numeric JSON attachments, project/viewport/state,
status, and explicit skip reasons; it contains no screenshots or image
attachments.

## Final gate re-verification — 2026-09-02

The required final local matrix was rerun against the already-seeded disposable
D1 database and loopback Worker. These results supersede no prior evidence
artifact; failed reruns remain failed results.

| Exact command | Result | Disposition |
| --- | --- | --- |
| `PROGRAMS_TARGET_URL=http://127.0.0.1:8787 pnpm exec playwright test --config=tests/e2e/phase-d-programs-geometry.config.ts` | **BLOCKED** — exit 1; the Worker reached `GET /api/v1/programs/access` and then Wrangler/esbuild terminated with `fatal error: all goroutines are asleep - deadlock`; subsequent attempts reported `ERR_CONNECTION_REFUSED`. | F-495-02 remains `READY` only for the committed 24/24 isolated-project artifact; this rerun is not converted to a skip or pass. |
| `PROGRAMS_TARGET_URL=http://127.0.0.1:8787 pnpm exec playwright test --config=tests/e2e/s4-management-hardening.config.ts` | **BLOCKED** — exit 1; the report recorded 7 expected passes, 74 skips, and 55 unexpected failures after the Worker died; later requests reported `ERR_CONNECTION_REFUSED`. | The earlier 62-pass / 74-skip report remains historical and is not this rerun's result. |
| `PROGRAMS_TARGET_URL=http://127.0.0.1:8787 pnpm exec playwright test --config=tests/e2e/programs-d1.config.ts` | **BLOCKED** — exit 1; the 201-test suite lost the Worker after the first four tests, then failed at `page.goto("/")` with `ERR_CONNECTION_REFUSED`. | F-495-01 and F-495-03 remain blocked by the required single-process journey. |
| `AUTH_UI_TARGET_URL=http://127.0.0.1:8787 pnpm exec playwright test --config=tests/e2e/live-ui.config.ts` before reset | **BLOCKED** — 30 expected, 2 unexpected; both failures were the missing `目前沒有待審批的申請。` assertion. | This failed fixture-state run is retained as a failure. |
| The same `live-ui` command after `db:seed:local`, `db:seed:disposable`, and `db:seed:demo` | **PASS** — 32/32. | Clean-fixture retry is the applicable live UI result. |

The committed numeric report remains the prior deterministic artifact:
367 total, 282 passed, 85 intentional skips, and 0 failed. The failed
Programs geometry rerun does not replace its 24/24 isolated-project input.


## Local-only safety boundary

The Worker ran on loopback and all D1 setup used disposable seed scripts. The
following were not touched: production or remote D1, Cloudflare deployment,
Apps Script, Google Sheets, production credentials, or non-disposable accounts.
The four excluded Phase C Worker files remain explicit #498 infrastructure /
syntax debt; they are not relabelled as passing.

## Human accessibility and device gates

`UNCLAIMED` means the exact human run was not performed. No result below is
inferred from Playwright, DOM geometry, screenshots, or the desktop
accessibility tree. Reviewer is recorded as **Unassigned** for each row; an
automation agent is not a human accessibility reviewer.

| Gate | Reviewer | OS / browser | Device / AT | Viewport or setting | Exact route / state / action | Observed result | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| iOS camera and decoder | Unassigned | Not run | iPhone/iOS Safari not supplied | Phone viewport; camera permission | `/scanner` Self entry; grant/deny camera, decode a QR, stop/retry, verify track cleanup and manual fallback | No human run recorded | **UNCLAIMED** |
| Android camera and decoder | Unassigned | Not run | Android Chrome device not supplied | Phone viewport; camera permission | `/scanner` Self entry; grant/deny camera, decode a QR, stop/retry, verify track cleanup and manual fallback | No human run recorded | **UNCLAIMED** |
| Native print preview | Unassigned | Not run | Native browser print preview not supplied | Paper/PDF defaults and alternate orientation | `/events` event detail → attendance roster/check-in sheet → print preview; verify clipping, visibility, and page breaks | No human run recorded | **UNCLAIMED** |
| Keyboard-only management | Unassigned | Not run | Physical keyboard; no AT supplied | 100% browser zoom | `/management`, `/profile/settings`, `/home`, and `/management?module=home-content`; Tab/Shift+Tab, Enter, Escape, retry, Back, and save/review actions | No human run recorded | **UNCLAIMED** |
| Keyboard-only identity workflows | Unassigned | Not run | Physical keyboard; no AT supplied | 100% browser zoom | `/management?module=accounts`, `?module=members`, `?module=approvals`, and `?module=permissions`; traverse Identity Tree, reorder alternatives, Permission Switches, review, Account Access, and conflict recovery | No human run recorded | **UNCLAIMED** |
| VoiceOver | Unassigned | Not run | macOS/iOS VoiceOver device not supplied | Default text size | The same Hub, settings, directories, approvals, Identity Tree, reorder, Permission Switch, review, and Account Access states; verify names, state, focus, and live-region announcements | No human run recorded | **UNCLAIMED** |
| NVDA | Unassigned | Not run | Windows/NVDA device not supplied | Default text size | The same management and identity route states; verify landmarks, names, state changes, focus return, and announcements | No human run recorded | **UNCLAIMED** |
| Reduced motion | Unassigned | Not run | OS/browser preference not supplied | `prefers-reduced-motion: reduce` | `/management?module=permissions` dirty/review/conflict states and Sheet/Dialog open/close | No human run recorded | **UNCLAIMED** |
| Forced colors | Unassigned | Not run | OS/browser forced-colors environment not supplied | Forced colors enabled | `/management?module=permissions` and `/management?module=approvals`; verify borders, focus, disabled, selected, and error states remain legible | No human run recorded | **UNCLAIMED** |
| Zoom and reflow | Unassigned | Not run | Desktop browser not supplied | 200% and 400% zoom | Hub, settings, Home Content, directories, approvals, Identity Tree, Permission Editor, review, and Account Access; verify no lost actions or horizontal overflow | No human run recorded | **UNCLAIMED** |
| Text spacing | Unassigned | Not run | Browser/extension not supplied | WCAG text-spacing override | The same management and identity routes with increased line/word/letter spacing; verify containment and action reachability | No human run recorded | **UNCLAIMED** |
| Touch and safe area | Unassigned | Not run | Real touch device and safe-area device not supplied | Phone portrait; narrow and short heights | `/scanner` camera/manual fallback and `/management?module=approvals` selection/review; verify 44px targets, dock clearance, safe-area inset, scrolling, and no obscured action | No human run recorded | **UNCLAIMED** |

## Re-run / unblock condition

Do not change this verdict to `READY` or `CONDITIONAL` from this record alone.
Re-run the complete single-process local Programs D1 suite after the arm64
Worker failure is resolved, preserve the failure or pass artifact, and obtain
human rows for every applicable device/accessibility/print gate. A manual
failure or another required automation failure remains `BLOCKED`; unavailable
human rows remain `UNCLAIMED` and produce the conditional verdict only when all
automated rows are green.
