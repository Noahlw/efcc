# EFCC Testing Authority

**Status:** Active **Owner:** Product/release owner **Rationale:** [ADR-0044](docs/adr/0044-layered-testing-authority.md), [ADR-0046](docs/adr/0046-ai-first-ui-playground-delivery.md)

This document owns testing-layer boundaries, isolation, canonical commands, failure evidence, and promotion composition. Domain behavior remains owned by `CONTEXT.md`, active domain ADRs/specs, and Worker contracts. UI ownership remains governed by [`docs/implementation/ui-control-recovery-governance.md`](docs/implementation/ui-control-recovery-governance.md).

## T05 rescue qualification

For rescue development, `pnpm verify:programs` is the finite functional aggregate. It must pass the Worker Contract Gate, real local Worker/D1 Browser Acceptance journeys, the Responsive UI Matrix, comprehensive local non-browser regression, migration-ledger reconciliation, current-revision evidence, and separate Standards/Spec review.

The unchanged `pnpm test:programs:canary` is a five-minute, zero-retry sustained-runtime diagnostic. Its result is reported independently as `passed`, `failed`, or `not_run`; a failure remains non-zero and keeps B-003 `OPEN`. It does not waive a finite functional failure, claim the runtime fault fixed, or authorize production release. `functional-passed` is not `STACK_GREEN`; promotion additionally needs the reviewed replacement PR and scoped risk record.

## Testing seams

| Seam | Owns | Canonical command or evidence |
| --- | --- | --- |
| Worker Contract Gate | Worker routes, authorization, D1 state, audit/idempotency, conflicts, and projections | `pnpm test:programs:contract` |
| Runtime Reliability Canary | Repeated real HTTP mutation/read reliability against the production Worker configuration and disposable local D1 | `pnpm test:programs:canary` |
| Browser Acceptance | Critical browser-specific participant and management journeys using one representative viewport | `pnpm test:programs:browser` |
| Responsive UI Matrix | Layout, overflow, action visibility, target geometry, dock clearance, and viewport behavior at 320, 390, and 1280 CSS px | `pnpm test:programs:responsive` |
| Playground / isolated presentation | Deterministic production rendering, local interaction, cheap accessibility, baseline Story/W7 checks, material states, and promoted browser/presentation contracts | Storybook/Vitest and focused Playwright |
| Real-app integration | Routing, auth/session, navigation/history, shell integration, Worker/D1 projection, critical mutations, and integration recovery | focused real-app Playwright |
| Worker/domain | Authorization, validation, persistence, mutation, audit/idempotency, and domain projections | Worker/D1 contracts |
| Human/platform | Subjective design, camera, touch, safe area, virtual keyboard, assistive technology, preference/zoom, and native print | named reviewer/device evidence |
| Promotion Gate | The required finite layers plus local non-browser verification and reconciliation | `pnpm verify:programs` |

Each behavior has one primary seam. A higher-level check may retain a small cross-boundary proof when it tests an integration truth that the cheaper seam cannot provide; it must not replay cheaper matrices without a reason.

## T05 isolation and execution

### Worker Contract Gate

Use the official `@cloudflare/vitest-pool-workers` integration with `web/wrangler.jsonc`. Await D1 setup and assertions. Fixtures use isolated disposable storage and the existing `E2E_`/`E2E_DEMO_` conventions.

### Runtime Reliability Canary

Use `createTestHarness()` with `web/wrangler.jsonc` and `server.listen()` so requests cross the real local HTTP boundary. Apply migrations and seed disposable D1 through the Harness Worker binding. A scenario owns setup, mutation/read sequence, and cleanup. The five-minute window remains fixed and zero-retry; retries, skipped iterations, automatic restarts, or reduced fallback runs cannot produce Green.

### Browser Acceptance

Use real Playwright against the Harness URL. The critical journey uses the representative `phone-390` viewport (`390×844`), `workers: 1`, and `retries: 0`. Independent journeys start with clean scenario state. Preserve Harness debug output, Playwright traces, and screenshots on failure.

### Responsive UI Matrix

Run deterministic focused scenarios at exactly `320`, `390`, and `1280` widths. Failure output includes scenario title, viewport, and observable contract. Include a domain mutation only when its resulting state changes the responsive behavior under test.

## Phase 1 presentation authority

T07–T12 add isolated presentation testing without replacing T05’s domain and integration authority.

### Playground / isolated presentation

Storybook is the current renderer for the UI Playground role. It uses real production presentation code and deterministic synthetic fixtures. It owns:

- visual development and agent self-review;
- one representative baseline Story for each active shipped screen;
- W7 responsive coverage for each baseline;
- only material additional states at risk-relevant viewports;
- isolated interaction and cheap accessibility;
- promoted presentation/browser contracts at the cheapest truthful seam.

The existing Screen Catalog and T07–T09 PSNs are preserved. Ordinary new Playground cases do not need a stable identity. A PSN is promoted only for a durable approval, contract, regression, or provenance reference. SCN/RouteScenario is for durable real-app integration only; CTR/UIContract is for promoted shared or high-risk machine-verifiable invariants.

Storybook cannot prove Worker authorization, D1 persistence, production auth/session, routing/history, camera hardware, native print preview, real-device behavior, or assistive-technology outcomes. Conversely, real Worker/D1 setup is not required to render a material loading, empty, error, long-copy, or recovery presentation state.

### Real-app Playwright

Real-app Playwright proves integrated truth only: routing, auth/session, navigation/history, shell/app integration, Worker/D1 projection, critical mutations, and integration recovery. It does not serve as the universal visual seam and does not repeat the Playground presentation matrix.

### Cross-browser

Routine focused presentation work uses Chromium. Browser-sensitive or broad-blast-radius work adds impacted Firefox/WebKit. Route-family and release checkpoints use the required supported-browser matrix. Scope follows risk; a ticket does not receive an engine matrix merely because it changes UI.

### Human and platform

L2 covers genuine design judgment triggered by the change. L3 covers truths requiring real device, platform, or assistive technology: camera, scanner, touch, safe area, virtual keyboard, VoiceOver/NVDA, forced preferences/zoom where applicable, and native print. Automation may prepare evidence but cannot sign as the human reviewer.

## Contract and evidence protection

Implementation agents cannot make a failing required check green by silently weakening a promoted contract, durable baseline, required coverage, approved tolerance, native exception, or waiver. A changed requirement is a Contract Change and records owner approval, exact scope, current/proposed expectation, reason, preservation impact, replacement proof, rollback point, and removal condition when temporary.

Failure evidence records the logical scenario, layer, revision, route/state/viewport where relevant, first causal runtime signal, and downstream symptoms separately. A clean retry does not erase an earlier failure. Unrelated pre-existing failures remain visible and owned without blocking unrelated work.

## Promotion

`pnpm verify:programs` runs the finite Worker Contract, Browser Acceptance, Responsive Matrix, and comprehensive local non-browser stages. It records the canary as an independent diagnostic and includes the explicit B-003 disclosure. The aggregate writes revision-pinned evidence under `test-results/programs-promotion/<run-id>/`.

Promotion requires the applicable machine layers, reconciliation evidence, the exact reviewed revision, current Standards/Spec review, required human/platform evidence, and the owner’s route-family/checkpoint decision. A machine result is not human approval. Automatic GitHub CI remains fast-only; heavy local qualification and manual platform evidence remain explicit.

The historical Programs execution count and prior full-suite runs remain diagnostic history from the T05 investigation. They are not permanent presentation or release contracts.

## Migration and routing

T05 follows expand → migrate → contract. T05.1–T05.7 retain their separate planning and commit boundaries on the shared rescue branch, with T05.7 as the replacement PR promotion boundary. The current T05 finite-gate amendment and B-003 risk remain active.

T07–T09 are grandfathered. Their Storybook/Vitest setup, Screen Catalog, PSNs, T08 controls/contracts, and T09 surface/feedback/overlay contracts require no migration. Future UI tickets use the baseline/W7, material-state, risk-proportional, owner-spot-check, and L2/L3 rules above.
