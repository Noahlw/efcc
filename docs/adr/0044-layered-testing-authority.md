# ADR-0044 — Layered Testing Authority for Programs

- **Status:** Accepted
- **Deciders:** Noah Wong, product/release owner
- **Date:** 2026-09-05
- **Related:** T05 / [#510](https://github.com/Noahlw/efcc/issues/510), [#505 amendment](https://github.com/Noahlw/efcc/issues/505#issuecomment-5538740674), ADR-0029, ADR-0031, `TESTING.md`

## Context

The historical Programs acceptance path coupled Worker/D1 correctness, runtime reliability, browser workflows, and responsive layout into one stateful Playwright suite. Its three viewport projects multiplied logical scenarios into an execution count, and the previous T05 investigation exposed a request-level runtime failure after a successful mutation. That evidence is valuable, but using the whole browser suite as the only authority makes a domain failure, transport failure, fixture contamination, and layout failure difficult to attribute.

## Decision

EFCC adopts five layered testing responsibilities:

1. **Worker Contract Gate** owns Worker/D1 behavior through the official Workers Vitest integration.
2. **Runtime Reliability Canary** owns repeated real-HTTP mutation/read reliability through `createTestHarness().listen()` with the production Worker configuration and disposable local D1.
3. **Browser Acceptance Journey** owns a small set of critical real Playwright participant and management workflows at one representative viewport.
4. **Responsive UI Matrix** owns deterministic layout and viewport interaction scenarios at 320, 390, and 1280 widths.
5. **Promotion Gate** aggregates the independent layers and the required local verification before T05 can become `STACK_GREEN`.

The migration is expand → migrate → contract. Existing coverage remains available during expansion and migration. A logical scenario is removed from the historical browser authority only after its replacement owner and disposition are recorded. The old `201 expected` count and five full-suite runs remain historical diagnostic constraints, not permanent promotion contracts.

The required default is local-first: automatic GitHub CI stays fast-only, while heavy runtime/browser qualification is run locally and optional GitHub execution is manual diagnostic/parity evidence. Failure artifacts preserve the first causal signal and distinguish it from downstream connection symptoms.

## Amendment — rescue qualification separates sustained-runtime risk

On 2026-09-05 the repository owner approved a narrow T05 rescue-development policy change. The finite qualification aggregate must pass the Worker Contract Gate, real local Worker/D1 Browser Acceptance journeys, the Responsive UI Matrix, comprehensive local non-browser regression, migration-ledger reconciliation, current-revision evidence, and separate Standards/Spec review. Required functional failures remain blockers.

The unchanged five-minute, zero-retry Runtime Reliability Canary remains independently runnable diagnostic evidence. Its own failure remains non-zero and B-003 remains `OPEN` residual risk; it is not claimed fixed, harmless, conclusively upstream, or production-safe. The finite aggregate records the canary as `not_run` rather than silently treating it as passed, carries an explicit B-003 disclosure, and reports `functional-passed` rather than `STACK_GREEN`. T05 `STACK_GREEN` still requires the reviewed one-replacement-PR delivery and scoped risk disposition, and rescue acceptance does not authorize a production release or a merge to `main`.

This amendment supersedes only the former mandatory five-minute promotion prerequisite. It does not remove coverage, change baselines or tolerances, replace the real Worker/D1 browser seam, or authorize another runtime adapter. B-003 is re-evaluated at ordinary finite failures, relevant Worker/D1/Harness/toolchain changes, T33/#538 reconciliation, and before T35/#540 final owner release approval.

## Consequences

- Worker/D1 failures can be diagnosed without browser transport or viewport noise.
- Browser coverage becomes smaller and more attributable while preserving critical user journeys.
- Responsive coverage can run independently without replaying broad mutable domain workflows.
- The repository maintains more than one test command, but each command has a narrow owner and the aggregate remains explicit.
- Migration requires ledgers and a final contraction review so scenario count reduction cannot silently remove behavior.

## Alternatives considered

- **One monolithic browser authority:** rejected because it couples unrelated failure classes, multiplies stateful work across viewports, and made the historical runtime failure hard to attribute.
- **Only Worker tests:** rejected because cookies, navigation, DOM interaction, and responsive contracts still require browser seams.
- **Only a reduced browser suite:** rejected because it would leave Worker/D1 matrices and sustained runtime reliability under-proven.
