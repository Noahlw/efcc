# EFCC Testing Authority

**Status:** Active testing architecture for the T05 Programs rework  
**Owner:** Product/release owner  
**Rationale:** [ADR-0044](docs/adr/0044-layered-testing-authority.md)  
**Current T05 routing:** [#505 amendment](https://github.com/Noahlw/efcc/issues/505#issuecomment-5538740674) and [#510 execution authority](https://github.com/Noahlw/efcc/issues/510#issuecomment-5538740935)

This document owns the testing-layer boundaries, test isolation, canonical commands, failure evidence, and promotion rules for the T05 layered-testing migration. Domain behavior remains owned by `CONTEXT.md`, the active domain ADRs/specs, and the Worker contracts. UI ownership remains governed by `docs/implementation/ui-control-recovery-governance.md`.

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

Use `createTestHarness()` with `web/wrangler.jsonc` and `server.listen()` so requests cross the real local HTTP boundary. Apply migrations and seed the disposable D1 through the Harness Worker binding. A canary scenario owns its setup, mutation/read sequence, and cleanup. Qualification is a fixed five-minute sustained window with zero unexplained runtime failures. Retries, skipped iterations, automatic Worker restarts, and smaller fallback runs cannot produce Green.

### Browser Acceptance Journey

Use real Playwright against the Harness URL. The critical journey uses the representative `phone-390` viewport (`390×844`), `workers: 1`, and `retries: 0`. Each independent journey starts with clean scenario state; steps within one logical journey may share state. On failure, retain the supported Harness debug output plus the Playwright trace/screenshot evidence.

### Responsive UI Matrix

Run deterministic focused scenarios at exactly `320`, `390`, and `1280` widths. The scenario title, viewport, and observable contract belong in failure output. A domain mutation is present only when its resulting state changes the responsive behavior under test. Participant and management responsive intent is carried from their migration ledgers.

## Promotion and evidence

T05.7 is the only child that can make the replacement T05 PR `STACK_GREEN`. Promotion requires:

1. Worker Contract Gate Green;
2. the five-minute Runtime Reliability Canary with zero unexplained failures;
3. every required critical Browser Acceptance journey Green with zero retries;
4. Responsive UI Matrix Green at all three required widths;
5. local comprehensive non-browser precommit verification Green;
6. a clean worktree and structured evidence recording the exact reviewed revision; and
7. `/code-review Standards` and `/code-review Spec` against this authority and the current T05 routing.

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

Read this document before changing test architecture. Start implementation at [T05.1 / #551](https://github.com/Noahlw/efcc/issues/551), then follow the blockers in [#510](https://github.com/Noahlw/efcc/issues/510):

`#551 → (#552 and #553) → (#554 and #555) → #556 → #557`

Use `/implement` for each child, keep one owning commit per child, run the child’s focused seam before proceeding, and reserve final promotion claims for T05.7.
