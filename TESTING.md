# EFCC Testing Authority

**Status:** Active testing architecture for the T05 Programs rework **Owner:** Product/release owner **Rationale:** [ADR-0044](docs/adr/0044-layered-testing-authority.md) **Current T05 routing:** [#505 architecture amendment](https://github.com/Noahlw/efcc/issues/505#issuecomment-5538740674) and [#505 rescue qualification amendment](https://github.com/Noahlw/efcc/issues/505#issuecomment-5550498028), [#510 current routing](https://github.com/Noahlw/efcc/issues/510#issuecomment-5550505098)

This document owns the testing-layer boundaries, test isolation, canonical commands, failure evidence, and promotion rules for the T05 layered-testing migration. Domain behavior remains owned by `CONTEXT.md`, the active domain ADRs/specs, and the Worker contracts. UI ownership remains governed by `docs/implementation/ui-control-recovery-governance.md`.

## Current rescue qualification amendment

For rescue-development, `pnpm verify:programs` is the finite functional aggregate. It must pass the Worker Contract Gate, real local Worker/D1 Browser Acceptance journeys, the approved Responsive UI Matrix, comprehensive local non-browser regression, migration-ledger reconciliation, current-revision artifacts, and separate Standards/Spec review.

The unchanged `pnpm test:programs:canary` remains a five-minute, zero-retry sustained-runtime diagnostic. Its result is reported independently as `passed`, `failed`, or `not_run`; a failure remains non-zero and keeps B-003 `OPEN`. This amendment does not claim the runtime fault is fixed, waive any finite functional failure, or authorize production release. The runner’s `functional-passed` result is not T05 `STACK_GREEN`, which additionally requires the reviewed replacement PR and scoped risk record.

## Authority model

EFCC uses five complementary testing responsibilities. Each behavior has one primary owner, while a higher-level test may retain a deliberately small cross-boundary proof.

| Responsibility | Primary seam | Scope | Planned command |
| --- | --- | --- | --- |
| Worker Contract Gate | Cloudflare Workers Vitest integration | Worker routes, authorization, D1 state, audit/idempotency, conflicts, and projections | `pnpm test:programs:contract` |
| Runtime Reliability Canary | `createTestHarness().listen()` real HTTP | Repeated authenticated mutation/read reliability against the production Worker configuration and disposable local D1 | `pnpm test:programs:canary` |
| Browser Acceptance Journey | Real Playwright + Test Harness | Critical browser-specific participant and management journeys, using one representative viewport | `pnpm test:programs:browser` |
| Responsive UI Matrix | Focused Playwright viewport scenarios | Layout, overflow, action visibility, target geometry, dock clearance, and viewport interaction at 320, 390, and 1280 | `pnpm test:programs:responsive` |
| Promotion Gate | Independent aggregate | The four T05 layers plus the required local non-browser verification | `pnpm verify:programs` |

The commands are introduced by T05.2–T05.7 in dependency order. Existing commands remain valid during migration; the historical Programs suite is retained until the contract step has accounted for every logical scenario.

## Ownership rules

- Worker/D1 correctness is proved at the Worker Contract Gate. Tests call the Worker boundary and disposable D1; they do not mock EFCC modules that the test owns.
- Runtime reliability is proved by the small canary. It exercises the mutation-to-read boundary exposed by the historical T05 failure and preserves the first causal signal. It does not become a second domain suite.
- Browser Acceptance keeps only behavior that needs cookies/session handling, real navigation/history, real DOM interaction, multi-step user workflow, or an observable browser → Worker → D1 → browser round trip.
- Responsive UI Matrix owns viewport variation. It uses deterministic state and does not replay enrollment, approval, audit, or other broad domain workflows merely to reach another viewport.
- The Promotion Gate aggregates independent layers. It does not recreate one shared browser environment or make the old mega-suite the hidden authority.

## Isolation and execution

### Worker Contract Gate

Use the official `@cloudflare/vitest-pool-workers` integration with the repository `web/wrangler.jsonc`. D1 setup and assertions are awaited. The Workers test model supplies isolated storage per test file; fixtures remain disposable and use the existing `E2E_`/`E2E_DEMO_` conventions.

### Runtime Reliability Canary

The canary remains independently runnable diagnostic evidence. Its five-minute window and zero-retry semantics are unchanged, but it is not a mandatory finite stage of rescue-development promotion under the approved B-003 residual-risk amendment. A failed finite functional scenario still blocks qualification.

Use `createTestHarness()` with `web/wrangler.jsonc` and `server.listen()` so requests cross the real local HTTP boundary. Apply migrations and seed the disposable D1 through the Harness Worker binding. A canary scenario owns its setup, mutation/read sequence, and cleanup. Qualification is a fixed five-minute sustained window with zero unexplained runtime failures. Retries, skipped iterations, automatic Worker restarts, and smaller fallback runs cannot produce Green.

### Browser Acceptance Journey

Use real Playwright against the Harness URL. The critical journey uses the representative `phone-390` viewport (`390×844`), `workers: 1`, and `retries: 0`. Each independent journey starts with clean scenario state; steps within one logical journey may share state. On failure, retain the supported Harness debug output plus the Playwright trace/screenshot evidence.

### Responsive UI Matrix

Run deterministic focused scenarios at exactly `320`, `390`, and `1280` widths. The scenario title, viewport, and observable contract belong in failure output. A domain mutation is present only when its resulting state changes the responsive behavior under test. Participant and management responsive intent is carried from their migration ledgers.

## Promotion and evidence

The current rescue-development aggregate separates finite functional qualification from sustained-runtime diagnosis. `pnpm verify:programs` runs the Worker Contract, Browser Acceptance, Responsive Matrix, and comprehensive local non-browser stages only. It records the canary as an independent `not_run` diagnostic in `promotion.json` and includes the explicit open B-003 risk disclosure. A red canary remains visible and non-zero when run separately; it does not become green and does not alter finite-stage results.

T05.7 is the only child that can make the replacement T05 PR `STACK_GREEN`. Promotion requires:

1. Worker Contract Gate Green;
2. every required critical Browser Acceptance journey Green with zero retries;
3. Responsive UI Matrix Green at all three required widths;
4. local comprehensive non-browser precommit verification Green;
5. a clean worktree and structured evidence recording the exact reviewed revision and the B-003 risk disclosure; and
6. `/code-review Standards` and `/code-review Spec` against this authority and the current T05 routing.

The runnable aggregate is `pnpm verify:programs`. Browser Acceptance and Responsive Matrix each start and close their own official Harness with disposable local D1 and deterministic fixtures. Their Playwright reports are written to the current promotion directory; direct config invocation with a supplied `PROGRAMS_TARGET_URL` remains a diagnostic-only path. The aggregate writes revision-pinned finite-stage evidence and an independent `not_run` canary diagnostic record under `test-results/programs-promotion/<run-id>/`. Run `pnpm test:programs:canary` separately when sustained-runtime evidence is required.

Automatic GitHub CI remains fast-only. Heavy qualification and governance/testing workflows are local-first, with optional manual GitHub runs serving diagnostic/parity purposes only. The old shell-supervised Wrangler runner remains diagnostic when useful.

Failure evidence records the logical scenario, layer, revision, route/state/viewport where relevant, first causal runtime signal, and downstream symptoms separately. A later retry does not erase an earlier failure.

The historical `201 expected` execution count and five complete full-suite runs are preserved as diagnostic implementation constraints from the previous T05 investigation. They are not permanent architecture contracts and are not promotion authority for the layered model.

## Migration sequence

T05 follows **expand → migrate → contract**:

1. **Expand — T05.1:** publish this authority while the existing Programs path still runs.
2. **Migrate — T05.2–T05.6:** establish Worker contracts and the canary, then move participant and management ownership and extract the responsive matrix.
3. **Contract — T05.7:** account for every historical logical scenario, remove the old suite from canonical authority, and qualify the aggregate promotion gate.

The seven child issues are separate planning and commit boundaries on the shared `rescue/t05-layered-testing` branch. They produce one replacement T05 PR; T05.7 is the sole promotion boundary. The historical [PR #549](https://github.com/Noahlw/efcc/pull/549) is superseded without merge, while its diagnostic evidence remains part of the failure history.

## Agent routing

The current T05.1–T05.7 implementation is already committed on `rescue/t05-layered-testing`; use the amended qualification contract above and do not restart the architecture. The next normal roadmap frontier is T07/#512 only after T05 and T06 are actually merged into `rescue/ui-control-recovery`.

Read this document before changing test architecture. For the current T05 state, continue qualification from `rescue/t05-layered-testing`; T05.1–T05.7 are already committed. A fresh implementation session begins at T07/#512 only after T05 and T06 are actually merged into `rescue/ui-control-recovery`.

`#551 → (#552 and #553) → (#554 and #555) → #556 → #557`

Use `/implement` for each child, keep one owning commit per child, run the child’s focused seam before proceeding, and reserve final promotion claims for T05.7.

## Phase 1 presentation-testing authority

T07–T12 add a presentation-testing layer without replacing the T05 Programs testing architecture above. The same principle applies: each concern belongs to the cheapest truthful seam, and a more expensive seam does not replay lower-level matrices without a reason.

| Responsibility | Primary seam | Owns |
| --- | --- | --- |
| Isolated presentation | Storybook + Vitest | deterministic render, named presentation states, local interaction, cheap accessibility |
| Browser presentation contracts | Playwright against the same Story presentation truth | semantic browser behavior, bounded geometry, relational layout, viewport-dependent presentation |
| Real-app integration | Playwright against the real app/Worker | routing, authentication/session, real shell integration, navigation/history, selected critical user journeys |
| Domain/backend | Worker/D1 contract tests | authorization, persistence, mutations, audit/idempotency, domain projections |
| Human presentation approval | Storybook + ApprovalPackage evidence | workshop fidelity or design intent, depending on the ticket |
| Hardware/platform | owning device/print/accessibility qualification | camera, scanner, native print preview, real-device safe area/touch, assistive-technology outcomes |

### Storybook does not replace integration authority

A Storybook mock may prove only the observable presentation outcome it is designed to represent. It cannot prove:

- Worker authorization;
- D1 persistence;
- real authentication/session behavior;
- production routing/history;
- camera or scanner hardware;
- native print preview;
- real-device or assistive-technology outcomes.

Conversely, real Worker/D1 setup is not required merely to render every loading/empty/error/long-copy presentation branch.

### Presentation identity

A named Story carries a stable repo-owned `PSN-*` presentation identity. RouteScenario / `SCN-*` remains the real-app integration identity. The two may map explicitly where useful, but neither duplicates the other’s fixture/state authority.

### Viewports

Routine human Storybook review uses `390`, `799`, `800`, and `1440`. This is a human-review shortcut, not a replacement for the existing machine W7 viewport authority. A separate Story is not created merely because the viewport changes.

### Visual evidence

Screenshots are evidence and debugging inputs, not universal routine pass/fail authority. Pixel visual-regression baselines are promoted selectively only after a surface is stable, deterministic, high-leverage, and sufficiently low-noise. T07 legacy-screen cataloging does not automatically create hard pixel baselines.

### Failure ownership

A failing test blocks a ticket when the ticket owns the failing contract/state or when the shared change in the ticket caused the downstream failure. A pre-existing unrelated failure remains visible and owned, but is not an automatic blocker for unrelated work. This rule never permits a ticket to ignore a failing criterion within its own acceptance scope.

### Automatic CI

EFCC retains one automatic Fast CI authority. T07 proves checks are deterministic and cheap; frontend/Storybook-affected changes add only lightweight Storybook/catalog integrity to Fast CI, such as:

- Screen Catalog → PSN → Story integrity;
- Storybook configuration/import/build sanity;
- proven-cheap interaction/accessibility checks.

Clearly backend-only changes may skip presentation checks. Ambiguous shared changes capable of affecting frontend presentation run them. Heavy Storybook qualification, browser geometry/relational matrices, cross-browser runs, human visual evidence, and real Worker/D1 acceptance remain explicit local/manual qualification. Exact commands are documented only after T07.1 proves the local workflow and T07.6 qualifies it.

### T12 Programs division

T12 uses broad deterministic Storybook presentation coverage and a narrow, finite real Worker/D1 browser tracer. The real tracer proves high-value integration boundaries; it does not replay the entire Story presentation matrix. Both presentation authority and real-system authority must be green before the T12 `SALVAGE STACK` / `SELECTIVE REPLAY` decision.
