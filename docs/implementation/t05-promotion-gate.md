# T05.7 Programs Promotion Gate

**Authority:** [TESTING.md](../../TESTING.md)
**Ticket:** [#557](https://github.com/Noahlw/efcc/issues/557)
**Delivery:** one shared `rescue/t05-layered-testing` branch, one owning commit per child, one replacement T05 PR

## Canonical command

```sh
pnpm verify:programs
```

Run it from a clean worktree after creating the ignored local `web/.dev.vars`. Browser Acceptance and Responsive Matrix each own an official `createTestHarness()` process, disposable D1, and deterministic fixture setup. Direct Responsive config invocation may use `PROGRAMS_TARGET_URL` for diagnostics, but the canonical runner provisions its own loopback Harness. The Runtime Reliability Canary owns a separate official Harness process and disposable D1.

The finite aggregate runs these required stages once and in order:

1. `pnpm test:programs:contract`
2. `pnpm test:programs:browser` — two critical journeys, one `phone-390` project, zero retries
3. `pnpm test:programs:responsive` — six scenarios across exactly 320, 390, and 1280 widths, zero retries
4. `pnpm verify:precommit` — comprehensive local non-browser verification

The aggregate validates both Playwright JSON reports, including expected count, zero skipped/unexpected/flaky results, zero result retries, and passed result statuses. It does not require a canary artifact; the final `promotion.json` records the canary as independent `not_run` diagnostic evidence and carries the open B-003 risk disclosure. Every stage log and the final `promotion.json` live under the ignored `test-results/programs-promotion/<run-id>/` directory.

## Amended rescue-development contract

Under the owner-approved [T05 rescue qualification amendment](https://github.com/Noahlw/efcc/issues/505#issuecomment-5550498028), `pnpm verify:programs` is the finite functional aggregate. It runs the Worker Contract, real local Worker/D1 Browser Acceptance, Responsive Matrix, and comprehensive local non-browser stages. It records the unchanged five-minute canary as an independent `not_run` diagnostic and includes the explicit open B-003 residual-risk disclosure; it does not look up a canary artifact as a mandatory stage.

The canary remains independently runnable through `pnpm test:programs:canary` with its existing five-minute and zero-retry semantics. A red canary remains visible and non-zero, but does not become green or change finite-stage results. A failed finite functional scenario still blocks qualification. The machine result `functional-passed` is not T05 `STACK_GREEN`; ledger reconciliation, current-revision evidence, separate Standards/Spec review, one replacement PR, and the scoped risk record remain required.

When an independent canary run is available, pass its `run.json` through `PROGRAMS_CANARY_RUN_FILE`; the promotion manifest records its `passed`/`failed`/`not_run` status, source revision, and artifact path. With no reference the manifest records `not_run`; an invalid explicit reference fails closed without making the canary a mandatory aggregate stage.

## Contraction boundary

`tests/e2e/programs-d1.config.ts` remains available for selective diagnostic replay of the historical mega-suite. It is not called by `verify:programs`, and its `201 expected` count, three-project multiplication, and former five-complete-run qualification are not T05 promotion authority. The participant and management ledgers account for the historical logical scenarios before this authority is contracted.

Automatic GitHub execution remains the fast typecheck workflow. `.github/workflows/ui-governance.yml` and `.github/workflows/e2e.yml` are manual diagnostic/parity entry points; no heavy governance or Programs qualification job is scheduled.

The superseded [PR #549](https://github.com/Noahlw/efcc/pull/549) remains closed without merge. Its runtime traces, `Network connection lost` evidence, seed/report lessons, and failure-evidence requirements remain preserved in the T05.3 canary and tracker history. T06 / [#511](https://github.com/Noahlw/efcc/issues/511) and [#550](https://github.com/Noahlw/efcc/pull/550) remain gated until this replacement T05 PR qualifies and merges parent-first; T06 must then restack onto the replacement T05 head and rerun affected/final validation.
