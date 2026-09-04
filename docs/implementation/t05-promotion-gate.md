# T05.7 Programs Promotion Gate

**Authority:** [TESTING.md](../../TESTING.md)  
**Ticket:** [#557](https://github.com/Noahlw/efcc/issues/557)  
**Delivery:** one shared `rescue/t05-layered-testing` branch, one owning commit per child, one replacement T05 PR

## Canonical command

```sh
pnpm verify:programs
```

Run it from a clean worktree after creating the ignored local `web/.dev.vars`. Browser Acceptance owns an official `createTestHarness()` process and disposable D1. The Responsive Matrix uses the local `PROGRAMS_TARGET_URL` when provided, otherwise `http://127.0.0.1:8787`, so start that loopback Worker and seed its disposable `E2E_` accounts before running the aggregate. The Runtime Reliability Canary owns a separate official Harness process and disposable D1.

The aggregate runs these stages once and in order:

1. `pnpm test:programs:contract`
2. `pnpm test:programs:canary` — fixed five-minute window, zero retries/restarts/skips
3. `pnpm test:programs:browser` — two critical journeys, one `phone-390` project, zero retries
4. `pnpm test:programs:responsive` — six scenarios across exactly 320, 390, and 1280 widths, zero retries
5. `pnpm verify:precommit` — comprehensive local non-browser verification

The aggregate validates both Playwright JSON reports, including expected count, zero skipped/unexpected/flaky results, zero result retries, and passed result statuses. It validates that the current revision has a passed five-minute canary artifact, so stale evidence cannot satisfy a new revision. Every stage log and the final `promotion.json` live under the ignored `test-results/programs-promotion/<run-id>/` directory.

## Contraction boundary

`tests/e2e/programs-d1.config.ts` remains available for selective diagnostic replay of the historical mega-suite. It is not called by `verify:programs`, and its `201 expected` count, three-project multiplication, and former five-complete-run qualification are not T05 promotion authority. The participant and management ledgers account for the historical logical scenarios before this authority is contracted.

Automatic GitHub execution remains the fast typecheck workflow. `.github/workflows/ui-governance.yml` and `.github/workflows/e2e.yml` are manual diagnostic/parity entry points; no heavy governance or Programs qualification job is scheduled.

The superseded [PR #549](https://github.com/Noahlw/efcc/pull/549) remains closed without merge. Its runtime traces, `Network connection lost` evidence, seed/report lessons, and failure-evidence requirements remain preserved in the T05.3 canary and tracker history. T06 / [#511](https://github.com/Noahlw/efcc/issues/511) and [#550](https://github.com/Noahlw/efcc/pull/550) remain gated until this replacement T05 PR qualifies and merges parent-first; T06 must then restack onto the replacement T05 head and rerun affected/final validation.
