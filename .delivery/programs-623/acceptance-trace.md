# Issue #623 acceptance trace

Production candidate: `6cc9a5d9c8beb87833a6183f65834d102f3a7215`

Immutable base: `49bdbce0244ded445b1e3d4f3f9836c58d2580f4`

Authority: GitHub #623, canonical #586, accepted R40-R52 amendment, ADR-0047/0050/0053/0054.

Scope: reviewed Schedule Plan fingerprint, stale invalidation, Generate safety, durable generation semantics, UI states, and focused tests. The candidate also enforces Schedule-rule permission before all mutation target lookups and preserves read-only refresh recovery after a confirmed stale generation outcome.

## Acceptance inventory

| ID | Acceptance boundary | Evidence mapping | Settled result |
| --- | --- | --- | --- |
| R43.1 | A reviewed Plan durably binds visible range, Rule/exception inputs, schedule revision, and fingerprint. | Candidate-pinned Worker/D1 artifact `.delivery/programs-623/artifacts/worker-6cc9/run.json` + `worker-results.json` (44 files/648 tests); contract 1/1; migrations 0034/0035; same-millisecond review-order, replacement-date reload, and terminal-occurrence settlement tests. | Verified at Worker/D1 persistence seam. |
| R43.2 | Range, Rule, saved-exception, or draft changes retain the old Preview, expose Cantonese stale guidance and Review Again, and disable Generate. | Candidate-pinned components artifact (69 files/1,092); local Browser 6/6; local Responsive 18/18; phone-390 route 2/2; desktop-1280 route 2/2; targeted T11 R5 9/9. | Verified at component and real local Worker/D1 route seams. |
| R43.3 | Pending/failed/unknown exception persistence keeps generation blocked until reconciliation. | Worker/D1 648/648 and components 1,092/1,092 cover persistence/recovery and Generate gating; local Browser/Responsive cover the real route. | Verified at Worker/component/route seams; live saved-exception network-failure mutation journey remains unrun. |
| R43.4 | A bypassed stale Plan is rejected before Event writes, including atomic schedule and newer-reviewed-Plan races. | Worker/D1 648/648; focused Programs 147/147; phone-390 and desktop-1280 real-route stale-bypass tests; route source assertions map Event-count no-write checks. | Verified at Worker/D1 and local route seams. |
| R43.5 | A fresh matching review generates bounded Events with provenance and truthful created/skipped/failed outcomes. | Local Browser artifact 6/6; local Responsive artifact 18/18; phone-390 route 2/2; Worker/D1 648/648; components 1,092/1,092. | Verified against candidate-bound local Wrangler/D1 and persistence seams. |
| R43.6 | Retry/resume is durable, idempotent, duplicate-safe, and stale partials require a new Plan. | Worker/D1 648/648; focused Programs 147/147; components 1,092/1,092; injected mid-generation stale test, no-replay recovery, terminal-occurrence settlement, and permission-before-lookup regressions. | Verified at Worker/component seams; browser interruption/restart injection remains unrun. |
| R43.7 | Finite bounds remain inclusive and ongoing defaults remain the next three calendar months with explicit range. | Worker/D1 648/648; components 1,092/1,092; local Responsive 18/18; desktop-1280 and phone-390 route evidence; Hong Kong wall-date recurrence paths. | Verified for tested Hong Kong wall-date paths. |
| R52.1 | Candidate-bound evidence is pinned and fresh independent Spec/Acceptance review remains separate from owner approval, merge, release, and deployment. | Fresh Lovelace (`focused_reviewer`) Spec PASS and Carson (`acceptance_verifier`) SCOPED-ACCEPT reports against candidate `6cc9a5d9`; evidence record checker passes. | Verified as candidate evidence separation; full R52 device/Owner boundary is not claimed. |

## Required route trace

The final candidate-bound phone-390 route exercises Preview A -> mutate the visible range -> stale guidance and disabled Generate -> Review Again -> Generate, plus a bypassed stale Plan request rejected by the Worker before Event writes. It ran against `wrangler dev` + disposable local D1 at zero retries and reports 2/2 in `.delivery/programs-623/artifacts/local-route-6cc9.txt`; the same pair also passed at desktop `1280x720` in `.delivery/programs-623/artifacts/desktop-1280-6cc9/`.

## Checks and evidence boundary

- `pnpm test:workerd` — 44 files / 648 tests passed; JSON report is `.delivery/programs-623/artifacts/worker-6cc9/worker-results.json`.
- Focused Programs Worker — 147/147 passed.
- `pnpm test:programs:contract` — 1/1 passed.
- `pnpm --dir web test:components` — 69 files / 1,092 tests passed; JSON report is `.delivery/programs-623/artifacts/components-6cc9/components-results.json`.
- `pnpm typecheck` and `pnpm --dir web typecheck` — passed.
- Local Browser Acceptance fallback — 6/6, zero retries, `.delivery/programs-623/artifacts/local-browser-6cc9/run.json` + `browser-results.json`, revision `6cc9a5d9c8beb87833a6183f65834d102f3a7215`, target `http://127.0.0.1:8787`.
- Local Responsive Matrix fallback — 18/18, zero retries, `.delivery/programs-623/artifacts/local-responsive-6cc9/run.json` + `responsive-results.json`, same revision/target.
- Desktop 1280 route — 2/2, zero retries, `.delivery/programs-623/artifacts/desktop-1280-6cc9/run.json` + `result.txt`.
- Focused phone-390 route — 2/2, zero retries, `.delivery/programs-623/artifacts/local-route-6cc9.txt`; source assertions cover unchanged Event count after stale rejection and increased count after fresh generation.
- T11 Storybook targeted R5 — 9/9 Schedule recovery Plays passed across W7 widths. The previous full T11 run was 108/126; its 18 failures were confined to existing R4 route-backed behavior and R6 Settings/Notifications baseline interactions, so no full-suite green claim is made.
- `git diff --check` — passed for candidate code and final trace.

The official `createTestHarness` Browser/Responsive wrapper was attempted on the candidate and in clean detached worktrees; it currently fails/blocks after reporting all 36 migrations applied, before fixture setup. This is recorded as an external Wrangler helper/runtime limitation and excluded from green evidence. The fallback uses the required real local Worker/D1 route with disposable `E2E_`/`E2E_DEMO_` seeds; it is not Storybook or a mock.

Component and Storybook fixtures are not used as persistence proof. `pnpm check` and the commit hook's repository governance stage remain red on pre-existing repository-wide lint/governance debt; the hook also encountered git-discovery ENOBUFS. The aggregate promotion verifier has a known baseline Browser Acceptance expected-test mismatch (canonical disposable suite is 6, verifier expects 4); no aggregate green claim is made.

Not covered by this worker package: saved-exception browser failure recovery, browser interruption/restart injection, the missing member-capability fixture in the reviewer runtime, physical-device/QR/native-print/assistive-technology checks, Owner L2, deployment, release, merge, and issue closure. B-003 sustained canary remains diagnostic and is not claimed fixed.

## Independent review

- Spec: Lovelace (`01a0a9f6-e0a3-7931-adee-244d1e2318ab`), fresh `focused_reviewer`, verdict `PASS/CLEAN` for candidate `6cc9a5d9`.
- Acceptance: Carson (`01a0aa08-d036-7f43-9c51-b723102dbc20`), fresh `acceptance_verifier`, verdict `SCOPED-ACCEPT` for candidate `6cc9a5d9`; remaining limitations are evidence/runtime/owner gates, not a material source finding.
