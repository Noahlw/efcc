# Programs #589 Salvage Convergence Acceptance Ledger

**Date:** 2026-09-14 HKT
**Scope:** #589 shared shell only
**Delivery owner:** This chat session
**Implementor boundary:** Luna Max, bounded packets only; no self-approval
**Current status:** `WAITING_OWNER_L2`
**Current candidate:** `c4d10c7464325d548105e449f5be4614b026ff7b`
**Owner decision:** `PENDING`
**Independent review:** `CLEAN` for the exact candidate; owner decision still required

## Authority and scope

The accepted 2026-09-14 CEO Review amendment governs this ledger. The frozen Programs prototypes under `docs/design/programs-screen-foundations-v1/` govern shared-shell visual decisions. #590–#601 are locked until #589 receives explicit owner approval. This record does not authorize push, merge, issue closure, release, or downstream implementation.

## Candidate identity

- Production candidate at S1 fixed point: `ea7a54ef5580f399d0db2c2c67795ce4689f71b0`
- Current production candidate at S4 repair: `c4d10c7464325d548105e449f5be4614b026ff7b` — `fix(programs): dedupe access prefetch across routes`; parent candidate `6fc65cc4bd762ce5d1d8a16f80c53ba97cce5924`
- Evidence-only commit: `ed4e484ee565c6bcdb13484a88b3aa1de892c994` — `test(programs): record #589 salvage evidence`
- Qualification harness commit: `d4165463c663f7b11d8e12eebc69b6d9df933b19` — `test(programs): scope material detail back assertion`; Storybook material Play locator only, with no production-candidate change
- PR: #607, OPEN, base `codex/programs-screen-foundations/wave-2`, remote head `9ad90d253bfd50bf2bbcea85f39c18c1587b1f88`
- Local branch: `codex/programs-screen-foundations/wave-3`, ahead of its remote by 27 commits
- Pre-existing dirty paths preserved at claim: `CONTEXT.md`; `docs/qa/2026-09-11-programs-route-fidelity-correction.md`; `docs/superpowers/plans/2026-09-11-programs-route-fidelity-recovery-tracker.md`; `docs/superpowers/plans/programs-route-fidelity-recovery/R8-fixed-point-qualification.md`
- The live recheck also found additional untracked paths under existing `docs/adr/`, `docs/design/`, `docs/qa/artifacts/`, `memory/`, and `web/storybook-static/` trees. They are outside this packet and remain untouched; only the new salvage ledger and later candidate-bound evidence will be staged explicitly.

The production candidate SHA is immutable for a qualification cycle. A later evidence-only commit must not be substituted for it.

## Acceptance trace written before production edits

### In-scope acceptance criteria

| ID | Observable acceptance criterion | Evidence required |
| --- | --- | --- |
| `589-SHELL-01` | Management mode switch is visible only for management-capable access and uses exact participant/management root destinations | Focused behavior tests + browser route evidence |
| `589-SHELL-02` | Header and Back ownership is single and exact; Programs navigation label/current treatment is correct | Focused behavior tests + shell contact sheets |
| `589-SHELL-03` | Named route region is a native semantic section with an accessible name | Focused component test |
| `589-SHELL-04` | Notification action is visible/placed within the shared shell and has no duplicate owner | Component/browser evidence + contact sheets |
| `589-SHELL-05` | Fixed navigation, safe-area clearance, touch targets, circle/icon geometry, and responsive overflow meet computed contracts | Sequential browser/responsive/W7 checks across supported widths |
| `589-SHELL-06` | Cold-load management-access request count is measured; loader changes occur only if duplicate requests are proven | Route-level request observation |
| `589-SHELL-07` | Dirty-save busy/dirty/navigation/late-unmount behavior remains intact | Existing focused/stateful tests |
| `589-EVIDENCE-01` | Exact candidate-bound manifest/checksums and two four-state shell sheets are committed | Manifest, `acceptance-record.json`, SHA-256 sums |
| `589-REVIEW-01` | Independent review finds zero actionable issues for the exact candidate | Fresh-context review record |
| `589-OWNER-01` | Owner explicitly approves the exact candidate | Owner decision with SHA and timestamp |

### Explicit exclusions

No database/schema/index or backend/API contract changes; permission-model redesign; speculative global access provider; deferred screen-body work; real-device camera/QR/download/print proof; raw-log/trace/full-page-matrix commit; push/merge/release; or downstream-ticket authorization.

## Salvage packet ledger

| Packet | Status | Candidate/evidence SHA | Result / next action |
| --- | --- | --- | --- |
| S0 Audit and fresh evidence | `COMPLETE` | `0ca965214da9f1be41746435ad0f847ca2e6a977` | Fresh actual/frozen four-state baseline, lint measurement, and Storybook request-count probe complete; real Worker/D1 setup limitation recorded |
| S1 Verified #589 fixes | `COMPLETE` | `ea7a54ef5580f399d0db2c2c67795ce4689f71b0` | Append-only production fixed point committed; full pre-commit hook passed, including 69 component files / 1039 tests |
| S2 Sequential qualification/evidence | `MACHINE_GREEN / WAITING_INDEPENDENT_REVIEW` | `ea7a54ef5580f399d0db2c2c67795ce4689f71b0` | Browser, responsive, W7, computed geometry, request-count, and shell-only evidence pass; compact artifacts are committed without changing the production candidate |
| S3 Independent review | `COMPLETE / CLEAN` | `c4d10c7464325d548105e449f5be4614b026ff7b` | Fresh top-level reviewer `01a09f5e-65ea-7451-9fd2-d0e7f6404e9c` verified the repaired harness and found zero actionable issues; owner approval remains separate |
| S4 Owner decision | `WAITING_OWNER_L2` | `c4d10c7464325d548105e449f5be4614b026ff7b` | Approval packet requests `APPROVE #589`, `REQUEST CHANGES`, or `KEEP PENDING`; #589 is not accepted yet |

## S0 baseline observations

- Existing measured lint findings in `web/lib/programs/programs-boundary.tsx`: `no-shadow` in `syncSearch`; `react-hooks/exhaustive-deps` missing `routeQuery`; and `ProgramsBoundaryBody` complexity `21` versus configured max `20` when the current suppression is removed.
- Boundary semantic gap: the named `programs-mode-panel` region is currently a `div` with a role suppression; no production edit has been made for this salvage.
- Fresh visual render: **PASS — 2/2 Playwright projects** at `402x874` and `360x800`, candidate `0ca965214da9f1be41746435ad0f847ca2e6a977`; local artifact `/private/tmp/efcc-589-baseline-0ca96521/`.
- Frozen/actual shell comparison: **RED — verified #589 mismatches.** Actual Programs nav reads `課程與活動` while frozen nav reads `課程`; on management-capable directory/settings states, actual notification action is route-header-owned while frozen notification action is global-shell-owned. The dirty/focused actual pair is `actual-workspace-settings-dirty-402x874.png` / `actual-workspace-settings-dirty-360x800.png`, compared with `09-management-settings.html` frozen shell references.
- Cold-load management-access request count: **RED in Storybook — 2 GETs** to `/api/v1/programs/access` on a single cold material Story load (one ShellHeader consumer and one ProgramsBoundary consumer). Existing 30-second success TTL does not deduplicate concurrent calls. Real Worker/D1 probe reached build/bundle but stalled during local Harness setup before route observation; it was interrupted after the bounded timeout and is recorded as an external setup limitation, not an application pass.
- Shell computed baseline: **PASS** for the fresh dirty/focused probe at both viewports: `#shell-content` padding-bottom `72px`; active indicator `18px × 2px`, radius `2px`; sampled ScreenIconButton `44px × 44px` with equal circular geometry; no visual-harness overflow.
- Canonical browser baseline: **PASS** — `pnpm test:programs:browser` completed against local target `http://127.0.0.1:53940`; artifact `/private/tmp/efcc-589-browser-s0-0ca96521/`. Responsive/W7 qualification remains pending.
- Canonical responsive qualification: **PASS** — 18/18 expected checks, 0 skipped/unexpected/flaky, across `320x812`, `360x800`, `390x844`, `402x874`, `600x844`, `799x900`, `800x900`, `1024x900`, and `1440x900`; artifact `/private/tmp/efcc-589-responsive-s2-ea7a54ef-r3/`.
- W7/Storybook qualification: **PASS** — 126/126, 0 skipped/unexpected/flaky, one sequential worker across 9 configured widths; report `tests/e2e/test-results/t11-storybook/storybook.json`. The accepted run used a freshly restarted Storybook server; an earlier discarded attempt was traced to a stale pre-edit server bundle, not the candidate.
- Candidate-bound shell visual qualification: **PASS** — 2/2 Playwright projects, 8 shell rows for the exact four-state set, with committed sheets under `docs/qa/artifacts/programs-route-fidelity/ea7a54ef5580/`; local full-page matrix remains supporting evidence only at `/private/tmp/efcc-589-visual-s2-ea7a54ef/`.
- Candidate-bound cold-load access request count: **PASS** — exactly 1 `GET /api/v1/programs/access` on the management cold load; browser report `/private/tmp/efcc-589-browser-s2-ea7a54ef/browser-results.json`.
- S2 failure classification: **PASS** — no blocking or advisory runtime failures in the accepted runs. The stale-server diagnostic and an initial wrong-directory Vitest invocation are recorded as non-gate diagnostics in the compact manifest.
- Independent review: `BLOCKED_EXTERNAL_REVIEW` — no source/diff/evidence verdict was obtained from the delegated reviewer service
- Owner approval: `PENDING`

## S0 fresh evidence locators

- Full actual/frozen matrix: `/private/tmp/efcc-589-baseline-0ca96521/actual-402x874.png`, `/private/tmp/efcc-589-baseline-0ca96521/frozen-402x874.png`, `/private/tmp/efcc-589-baseline-0ca96521/actual-360x800.png`, `/private/tmp/efcc-589-baseline-0ca96521/frozen-360x800.png`.
- #589 shell states: `participant-directory-capable`, `management-directory`, `workspace-settings`, and material `workspace-settings-dirty` at both approval viewports.
- Existing harness manifest: `/private/tmp/efcc-589-baseline-0ca96521/manifest.json`; all actual rows are bound to the S0 candidate SHA and report zero horizontal/main overflow with minimum visible target size `44`.
- Dirty/focused fresh pair checksums: `6955081ea0a2305a62d8f17dbc789682f57abf6acab0152591bcff22d91245d7` (actual 402), `dc2549e61c109100ef843c31d782843165ac06de18c745b24a87bfcb43eddded` (frozen 402), `24301f18e5b318d7c0d94cfd29c1c322545373fde26e91ba6713a0fdf52b6961` (actual 360), `c3b65490508464156e1fff2561b4ae6e4f2505c0cff2fc3345a8d791516e6c60` (frozen 360).

## S0 checkpoint

### Checkpoint — 2026-09-14 HKT

- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `0ca965214da9f1be41746435ad0f847ca2e6a977`
- Dirty paths: `CONTEXT.md`; `docs/qa/2026-09-11-programs-route-fidelity-correction.md`; `docs/superpowers/plans/2026-09-11-programs-route-fidelity-recovery-tracker.md`; `docs/superpowers/plans/programs-route-fidelity-recovery/R8-fixed-point-qualification.md`; this new acceptance ledger
- Last completed checkbox: S0 live recheck, acceptance trace, fresh actual/frozen render, and shell comparison
- Last command / result: `PROGRAMS_CANDIDATE_SHA=0ca965214da9f1be41746435ad0f847ca2e6a977 PROGRAMS_VISUAL_ARTIFACT_DIR=/private/tmp/efcc-589-baseline-0ca96521 fnm exec --using 22.18.0 pnpm test:programs:visual` — `PASS (2/2)`
- Active finding: Fresh evidence proves a Programs nav-label mismatch, management notification ownership mismatch, and two concurrent Storybook access requests; local Worker/D1 probe stalled during Harness setup before route observation.
- S0 gate: **COMPLETE** — fresh candidate-bound baseline, acceptance trace, lint findings, request-count result, and mismatch ownership decisions are recorded; no production commit was made for S0.
- S1 claim: **IN_PROGRESS** at the same production candidate SHA. The next action is a canonical route-level request-count regression plus focused behavior regressions before implementation.

## S1 claim checkpoint

### Checkpoint — 2026-09-14 HKT

- Start SHA: `0ca965214da9f1be41746435ad0f847ca2e6a977`; no production salvage commit exists yet.
- Verified S1 scope: native semantic section; `no-shadow`; missing `routeQuery` hook dependency; minimum complexity extraction; exact Programs navigation label; global-shell notification action ownership; and in-flight access request deduplication conditional on the red request test.
- Protected behavior: capability-gated mode switch, exact root destinations, Back/history behavior, dirty-save busy/dirty/navigation/late-unmount semantics.
- No S1 code edit has been made after this claim; red tests are the next bounded action.

## S1 red regression checkpoint

### Checkpoint — 2026-09-14 HKT

- Canonical browser request-count probe: **RED as expected** at candidate `0ca965214da9f1be41746435ad0f847ca2e6a977`; the new authenticated route test observed exactly 2 `GET /api/v1/programs/access` requests and expected 1. Artifact: `/private/tmp/efcc-589-browser-s1-red-0ca96521/`; failure summary records both identical request URLs.
- Focused component regressions: **RED as expected** — 9 failures / 136 passes across the three touched test files. The failures are the new native-section, shared-shell notification ownership, exact Programs nav label, and request-count assertions; existing mode destination/icon tests remain covered.
- The red assertions were added before production implementation and use DOM/accessibility/request observables only. No source-reading suppression test or Tailwind class-string assertion was added.
- Next action: implement the minimum native-section/lint repair, exact nav label, global-shell notification ownership, and in-flight access dedupe, then rerun the focused tests.

## S1 implementation verification checkpoint

### Checkpoint — 2026-09-14 HKT

- Production working tree changes are limited to the verified S1 seams: native `section`, measured boundary extraction, shadow/dependency repair, canonical Programs label, global-shell notification link with route-owned compact actions removed, and keyed in-flight access dedupe. The two pre-existing `program-api.ts` lint findings were also removed because that file is part of the changed loader seam; no behavior or API contract was altered by those mechanical cleanups.
- Focused component tests: **PASS — 145/145** across `programs-boundary.test.tsx`, `app.test.tsx`, and `authenticated-shell.test.tsx`.
- Touched production lint: **PASS** for `programs-boundary.tsx`, `program-api.ts`, `nav-bar.tsx`, `copy.ts`, and `shell-header.tsx`.
- Web typecheck: **PASS** — `pnpm --dir web typecheck`.
- Canonical browser suite: **PASS** — target `http://127.0.0.1:60593`; artifact `/private/tmp/efcc-589-browser-s1-green-0ca96521-v2/`. The new route-level request assertion passed after the dedupe fix.
- Fresh working-tree visual sanity: **PASS — 2/2** at `402x874` and `360x800`; local artifact `/private/tmp/efcc-589-s1-visual-working/`. This is pre-commit sanity evidence, not yet candidate-bound evidence.
- S1 production fixed point: **COMMITTED** at `ea7a54ef5580f399d0db2c2c67795ce4689f71b0` with subject `fix(programs): salvage shared shell acceptance seams`. The hook passed typecheck, Storybook scope, governance, identity, Programs contract/canary/promotion, root/worker suites, web unit `606/606`, and component suite `69 files / 1039 tests`. This commit is the frozen production candidate; no owner approval is inferred.

## S1 commit and S2 claim checkpoint

### Checkpoint — 2026-09-14 HKT

- Live recheck before S2 claim: branch `codex/programs-screen-foundations/wave-3`, local HEAD `ea7a54ef5580f399d0db2c2c67795ce4689f71b0`, branch ahead of its remote by 27 commits; preserved dirty documentation paths remain unchanged. Remote PR head remains `9ad90d253bfd50bf2bbcea85f39c18c1587b1f88`; PR #607 remains OPEN with base `codex/programs-screen-foundations/wave-2` at `e5a05a833410fdd7e48c8bfc238667adf4ed1ba1`; no remote write occurred.
- S1 gate: **COMPLETE** — focused behavior tests `151/151`, touched production lint clean, web typecheck clean, canonical browser pass, working-tree visual sanity `2/2`, and full append-only commit hook pass. The previously observed recovery-focus failure passed when isolated and was not a changed-file regression.
- S2 claim: **IN_PROGRESS** at frozen candidate `ea7a54ef5580f399d0db2c2c67795ce4689f71b0`. Next action is candidate-bound focused/type checks, then sequential browser → responsive → W7/Storybook qualification and shell-only contact-sheet generation.

## S2 qualification and evidence checkpoint

### Checkpoint — 2026-09-14 HKT

- Candidate remained immutable at `ea7a54ef5580f399d0db2c2c67795ce4689f71b0`; no production file changed after S1.
- A discarded pre-qualification material Play probe found a blocking duplicate accessible-name assertion after the shared nav label became `課程`; the first scope attempt also selected the outer Programs header without a Back link. The final route-owned semantic Back locator is fixed in harness commit `d4165463c663f7b11d8e12eebc69b6d9df933b19`. These were blocking assertion failures in discarded probes and are disclosed separately; they are not reclassified as advisory.
- Focused candidate checks: **PASS — 151/151** across the four in-scope component files; root/e2e typecheck and web/Worker typecheck both passed.
- Ordered machine gates: **PASS** — canonical browser first (`3/3`, target `http://127.0.0.1:50856`), responsive second (`18/18`, target `http://127.0.0.1:52440`), and W7/Storybook third (`126/126`, single worker, 9 widths). W7 was refreshed after a fresh Storybook restart and harness commit `d4165463c663f7b11d8e12eebc69b6d9df933b19`; no accepted run had a skipped, unexpected, flaky, assertion, navigation, DOM, application, or regression failure.
- Cold-load request gate: **PASS — 1/1** `GET /api/v1/programs/access`; the S1 loader dedupe remains the smallest measured repair and no provider architecture was introduced.
- Computed shell gate: **PASS** — responsive checks cover fixed/sticky placement, safe-area/content clearance, 44px targets, equal circle geometry, active indicator `18x2` with radius `2`, and no horizontal overflow across the nine matrix widths.
- Shell visual gate: **PASS — 2/2** at `402x874` and `360x800`; each committed contact sheet contains Frozen/Actual columns for exactly Participant Directory, Management Directory, Workspace Settings overview, and Workspace Settings dirty/focused editor. The generated harness manifest records 8 candidate-bound shell rows; raw full-page output remains local.
- Compact evidence: `docs/qa/artifacts/programs-route-fidelity/ea7a54ef5580/manifest.json`, `acceptance-record.json`, `checksums.sha256`, `shell-402x874.png`, and `shell-360x800.png`. This evidence commit does not change the production candidate.
- Evidence commit checkpoint: `ed4e484ee565c6bcdb13484a88b3aa1de892c994`; post-commit `shasum -a 256 -c checksums.sha256` passed for all four listed files. HEAD now includes the evidence-only commit; the production candidate remains `ea7a54ef5580f399d0db2c2c67795ce4689f71b0`.
- Qualification refresh checkpoint: harness-only commit `d4165463c663f7b11d8e12eebc69b6d9df933b19`; refreshed W7 `126/126` passed after a fresh server restart. Evidence refresh commit `180e047550c30f8c4b4f7517dfc3b0f3512eb588` records the refreshed manifest/ledger/checksums. The contact-sheet bytes and production candidate remain unchanged.
- S2 gate: **MACHINE_GREEN / WAITING_INDEPENDENT_REVIEW**. Independent review is the next packet; owner approval remains pending and #590–#601 remain locked.

## S3 independent review checkpoint

### Checkpoint — 2026-09-14 HKT

- Three delegated read-only review attempts were made for the exact production candidate `ea7a54ef5580f399d0db2c2c67795ce4689f71b0` and compact evidence bundle: one timed out and was shut down; two returned `REVIEW_INCOMPLETE` after bounded interrupt requests.
- The attempts did not complete the required source/diff/evidence audit. No `CLEAN` verdict and no zero-actionable-findings result exists; the incomplete reviewer output is not treated as a code finding or approval.
- S3 status: **BLOCKED_EXTERNAL_REVIEW**. The last safe state remains **MACHINE_GREEN / WAITING_INDEPENDENT_REVIEW**; owner approval and #590–#601 unlock remain blocked until a completed independent review is available.

## Gate policy

Canonical Programs browser, responsive, and W7 failures are blocking. Assertion, navigation, DOM, application, and regression failures are blocking. A broad live-runtime failure is advisory only when proven to be solely the known Worker/Miniflare `HTTP 500 Network connection lost` harness condition; that condition must still be named. Machine evidence does not imply owner approval.

## Owner decision

`PENDING` — no owner approval has been inferred from the CEO Review plan decision, prior machine evidence, or this ledger.

## S3 finding and repair checkpoint

### Checkpoint — 2026-09-14 HKT

- Fresh independent reviewer Gibbs completed the exact self-contained packet-v2 review for candidate `ea7a54ef5580f399d0db2c2c67795ce4689f71b0` and returned one actionable P1 finding. The review was read-only and did not constitute owner approval.
- Finding: `web/lib/shell-header.tsx` left the management mode switch on the default transparent treatment while the Programs notification action exposed the soft border; this reversed the frozen prototype treatment and violated `589-SHELL-02` / `589-SHELL-04`.
- Root cause was confirmed against the frozen management-directory/settings CSS and the candidate source. The smallest repair was made append-only: mode `ScreenIconButton` now uses `tone="soft"`; the Programs notification action now retains only `className="relative"` and the default transparent shell treatment.
- Repair candidate: `6fc65cc4bd762ce5d1d8a16f80c53ba97cce5924`, subject `fix(programs): restore frozen shell action treatments`. Changed paths are limited to `web/lib/shell-header.tsx` and the computed-style regression proof in `tests/e2e/phase-d-programs-geometry.test.ts`.
- All `ea7a54ef` candidate-bound evidence was invalidated by the production change. The prior artifact directory remains untouched as historical evidence and is not reused for approval.

## S2 refresh after S3 repair

### Checkpoint — 2026-09-14 HKT

- Node `22.18.0` commit-hook qualification passed: root/web typechecks, governance, worker checks, web unit `606/606`, and component suite `69 files / 1039 tests`.
- Sequential canonical browser gate: **PASS — 3/3**, retries `0`, target `http://127.0.0.1:53655`; cold management load observed exactly one `GET /api/v1/programs/access`.
- Sequential responsive gate: **PASS — 18/18**, skipped/unexpected/flaky `0/0/0`, one worker, across `320x812`, `360x800`, `390x844`, `402x874`, `600x844`, `799x900`, `800x900`, `1024x900`, and `1440x900`; target `http://127.0.0.1:53807`.
- Sequential fresh-server W7 gate: **PASS — 126/126**, skipped/unexpected/flaky `0/0/0`, one worker, Storybook port `6017`, with the unchanged qualification harness commit `d4165463c663f7b11d8e12eebc69b6d9df933b19`.
- Candidate-bound visual gate: **PASS — 2/2** at `402x874` and `360x800`; exact four-state shell set and 8 shell rows. New primary owner sheets are `docs/qa/artifacts/programs-route-fidelity/6fc65cc4bd76/shell-402x874.png` and `shell-360x800.png`. Full-page output remains local supporting evidence only.
- Supplemental direct Storybook computed-style probe: **PASS** at both approval viewports. Mode switch measured `rgb(255,255,255)` background, `rgb(226,221,213)` border, and `44x44`; notification measured transparent background/border and `44x44`.
- Two standalone Phase-D attempts (with and without the optional fixture) again stalled before the test assertion during local `createTestHarness`/D1 setup after build/bundle. They are recorded as non-gate setup diagnostics only; no unrun assertion is claimed as pass. Canonical browser/responsive/W7 and direct Storybook probes completed independently.
- Compact candidate-bound evidence is under `docs/qa/artifacts/programs-route-fidelity/6fc65cc4bd76/`; its checksums pass. The self-contained packet-v3 will bind this candidate, these artifacts, the verified CEO Review, the accepted amendment clauses, and the active S0-S4 tracker excerpt.
- Current state remains **MACHINE_GREEN / WAITING_INDEPENDENT_REVIEW**. A fresh independent review is required; owner approval remains `PENDING`, and #590–#601 remain locked.

### S3 fresh-review working note

- Self-contained packet-v3: `/private/tmp/efcc-589-review-packet-6fc65cc4bd76-v3.md`, `37316` bytes, SHA-256 `4109fe37ff14f9458e572913a1ff01e4757389ad8dccfa75ff0704c28c1807d3`.
- Packet-v3 embeds the complete verified CEO Review, material accepted #586 R01–R25 clauses, the active S0-S4 tracker excerpt, the Gibbs finding and repair, exact candidate/harness ranges, current compact evidence identities, and the four terminal S3 questions. It is immutable and read-only; no heavy suites are requested from the reviewer.

## S4 finding and repair checkpoint

### Checkpoint — 2026-09-14 HKT

- Fresh independent reviewer Goodall completed packet-v3 for candidate `6fc65cc4bd762ce5d1d8a16f80c53ba97cce5924` and returned one actionable P1 finding. The review was read-only and did not constitute owner approval.
- Finding: `getManagementAccess()` reused an in-flight request only when route-query keys matched. Home used the default `programs` key while ShellHeader and ProgramsBoundary used pathname/query keys, so a pending Home prefetch could race with the Programs shell and issue two identical `GET /api/v1/programs/access` requests. The prior 3-test browser result did not exercise this cross-route race.
- The red browser regression held the Home access request while navigating to `/programs` and observed `2` requests before the fix. The route was then corrected explicitly with `await page.goto("/home")` so the test proves the intended Home-prefetch race rather than a same-route load.
- The smallest repair was made append-only at candidate `c4d10c7464325d548105e449f5be4614b026ff7b`, subject `fix(programs): dedupe access prefetch across routes`. `getManagementAccess()` now shares one module-level pending request regardless of route key; route keys remain only as local `useAsyncResource` lifecycle dependencies. The focused app stale-response contract was updated to use an explicit newer access load, and the browser regression is committed in the five-file repair delta.
- The repair changes no backend/API contract, permission model, provider architecture, or downstream screen body. All `6fc65cc4bd76` candidate-bound evidence is stale after this production change and is retained only as historical evidence.

## S4 sequential qualification checkpoint

### Checkpoint — 2026-09-14 HKT

- The c4d10c74 production commit hook passed under Node `22.18.0`: root/web typechecks, governance, worker checks, web unit `606/606`, and component suite `69 files / 1039 tests`.
- Sequential canonical Programs browser gate: **PASS — 4/4**, retries `0`, target `http://127.0.0.1:56053`; the Home-to-Programs pending-prefetch regression observed exactly one `GET /api/v1/programs/access` before release. Report: `/private/tmp/efcc-589-browser-s4-c4d10c74/browser-results.json`, SHA-256 `2158aa8901f0eefe57fa2c7371bebb767ed523ece83c528f538f01c103a34adc`.
- Sequential responsive gate: **PASS — 18/18**, skipped/unexpected/flaky `0/0/0`, one worker, across `320x812`, `360x800`, `390x844`, `402x874`, `600x844`, `799x900`, `800x900`, `1024x900`, and `1440x900`; target `http://127.0.0.1:56243`. Report: `/private/tmp/efcc-589-responsive-s4-c4d10c74/responsive-results.json`, SHA-256 `447774b7daeaaac20d1f9f192db6515391ad16aefdb6427eb0acd63db4a6faf4`.
- Sequential fresh-server W7 gate: **PASS — 126/126**, skipped/unexpected/flaky `0/0/0`, one worker, Storybook port `6017`, with unchanged qualification harness commit `d4165463c663f7b11d8e12eebc69b6d9df933b19`. Report: `tests/e2e/test-results/t11-storybook/storybook.json`, SHA-256 `4c1ae99e35d45d69bc276671477e996d1b913bbc459fca0aeb2ef07df303b35c`.
- Candidate-bound shell visual gate: **PASS — 2/2** at `402x874` and `360x800`, exact four-state shell set and 8 rows. Fresh generated manifest: `/private/tmp/efcc-589-visual-s4-c4d10c74/manifest.json`, SHA-256 `9dda5ca6726502c7167eaa00986dfd5add5c9f558cbe30f729d1c089a673ba20`; durable contact sheets are under `docs/qa/artifacts/programs-route-fidelity/c4d10c746432/`.
- Direct Storybook computed-shell probe: **PASS** at both approval viewports. Mode switch measured background `rgb(255,255,255)`, border `rgb(226,221,213)`, circular radius, and `44x44`; notification measured transparent background/border, circular radius, and `44x44`; responsive overflow was `0`.
- The standalone Phase-D management geometry probe remains a non-gate setup diagnostic: both bounded local Worker/Miniflare `createTestHarness`/D1 attempts stalled after build/bundle before assertions. No Phase-D assertion pass is claimed. Canonical browser, responsive, W7, direct Storybook, and visual gates completed independently.
- Candidate-bound durable manifest, acceptance record, checksums, and the two contact sheets were committed in evidence-only commit `f52dbe8ad9906d084645b043485c4143b9b10e11`; the production candidate remains `c4d10c7464325d548105e449f5be4614b026ff7b`. Post-commit checksums pass for all four listed artifacts.
- Current state remains **MACHINE_GREEN / WAITING_INDEPENDENT_REVIEW**. Owner approval remains `PENDING`, and #590–#601 remain locked.

## S4 fresh-review working note

- Self-contained packet-v4: `/private/tmp/efcc-589-review-packet-c4d10c746432-v4.md`, `38615` bytes, SHA-256 `2a92b0eac12fc1ba16c2fd3eb713ae197654af7aae9cb21a9c8d50bf8339144f`.
- Packet-v4 embeds the complete verified CEO Review, material accepted #586 R01–R25 clauses, the active S0-S4 tracker boundary, Gibbs and Goodall findings plus repairs, exact c4d candidate/harness ranges, current c4d compact evidence identities, and the terminal-result contract. It is immutable and read-only; no heavy suites are requested from the reviewer.

## S4 external-review boundary checkpoint

### Checkpoint — 2026-09-14 HKT

- Packet-v4 and its candidate/evidence inputs were available for review. Kant (`01a09f2b-0d66-7b42-b34c-c5afc8f11e1f`) received two bounded `300000ms` waits and returned no status/verdict; it was closed as `TIMEOUT_NO_VERDICT`.
- Kierkegaard (`01a09f35-165b-7b42-b34c-c5afc8f11e1f`) received one bounded `300000ms` wait and returned no status/verdict; it was closed as `TIMEOUT_NO_VERDICT`.
- These timeouts are not `CLEAN`, `FINDINGS`, or `REVIEW_BLOCKED`, and no source/evidence access failure was reported. Therefore `589-REVIEW-01` remains pending and owner approval remains blocked. The machine-green candidate/evidence state is unchanged; #590–#601 remain locked.

## S3 harness finding repair checkpoint

### Checkpoint — 2026-09-14 HKT

- The genuine independent S3 verifier found, and the delivery owner reproduced, a stale live-ui fixture at `tests/e2e/live-ui.test.ts:95`: `programsSection` expected `課程與活動` while the candidate shared navigation copy is `COPY.sections.programs = "課程"` at `web/lib/copy.ts:311`. The fixture is consumed by the exact role-link assertion at `tests/e2e/live-ui.test.ts:319-328`, and `tests/e2e/live-ui.config.ts:56` selects this suite.
- The smallest harness-only repair is append-only commit `61556a9922bc610522f08c501f671a1bf3f3de62`, subject `test(programs): align live UI navigation fixture`. The exact diff changes only `tests/e2e/live-ui.test.ts:95` from `課程與活動` to `課程`; the immutable production candidate remains `c4d10c7464325d548105e449f5be4614b026ff7b`.
- Affected live-ui command: `fnm exec --using 22.18.0 pnpm exec playwright test --config=tests/e2e/live-ui.config.ts --grep "member shell keeps stable navigation"`. Both configured projects attempted `http://127.0.0.1:8787/` and failed at `page.goto` with `net::ERR_CONNECTION_REFUSED` before the route assertion. This is an external Worker-target setup boundary; the affected live-ui assertion is **UNRUN/BLOCKED**, not a pass.
- Focused checks: `oxfmt --check tests/e2e/live-ui.test.ts` and `git diff --check` passed. Direct `oxlint tests/e2e/live-ui.test.ts` still reports the pre-existing `typescript(consistent-type-definitions)` at line 181 (`CascadeGeometry`), introduced before this one-line repair; no unrelated lint cleanup was absorbed. The append-only commit hook exited successfully.
- The prior independent S3 result remains **FINDINGS** pending verification by the existing independent top-level reviewer against this repaired harness. No new `CLEAN` or acceptance claim is made; owner approval remains blocked. Browser/responsive/W7/visual evidence for the unchanged production candidate was not rerun because this repair is test-fixture-only. #590–#601 remain locked.

## S3 clean review / S4 owner handoff checkpoint

### Checkpoint — 2026-09-14 HKT

- The existing independent top-level reviewer task `01a09f5e-65ea-7451-9fd2-d0e7f6404e9c` completed a fresh, user-authorized, read-only review separate from the implementor and delivery owner, and returned terminal `CLEAN` for the exact production candidate `c4d10c7464325d548105e449f5be4614b026ff7b` after the harness-only repair. This is independent review evidence, not owner approval.
- The harness repair remains separate at `61556a9922bc610522f08c501f671a1bf3f3de62`; its exact one-line diff is `tests/e2e/live-ui.test.ts:95`, `programsSection` `課程與活動` → `課程`. No production source changed after c4d. Prior ledger repair record is `b835008bd6696abe3975b5809f6553e611117149`.
- The affected real-boundary live-ui scenario passed `2/2` in `2.3s`: `phone-375x667` and `desktop-1280x720`, one worker, zero retries. The exact role-link assertion remained active and executed.
- Existing c4d machine evidence remains unchanged: canonical browser `4/4`; responsive `18/18`; W7 `126/126`; shell visual `2/2`; direct computed shell evidence remains candidate-bound. Browser/responsive/W7/visual evidence was not rerun because this repair is test-fixture-only.
- Remaining limitations, not candidate findings: unchanged pre-existing root TypeScript API errors outside the candidate dependency changes; standalone Phase-D runner unverified after setup stall while responsive/direct computed evidence exists; pre-existing no-capability management negative-network behavior unverified; and no owner spot-check, device/AT validation, L2/L3 approval, merge, release, or downstream authorization inferred.
- Current state is **WAITING_OWNER_L2**. The explicit owner decision requested is exactly one of `APPROVE #589`, `REQUEST CHANGES`, or `KEEP PENDING`. #589 remains unaccepted and #590–#601 remain locked.
