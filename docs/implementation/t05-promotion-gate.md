# T05.7 Programs Promotion Gate

**Authority:** [TESTING.md](../../TESTING.md)
**Ticket:** [#557](https://github.com/Noahlw/efcc/issues/557)
**Delivery:** one shared `rescue/t05-layered-testing` branch, one owning commit per child, one replacement T05 PR

## Canonical command

```sh
pnpm verify:programs
```

Run it from a clean worktree after creating the ignored local `web/.dev.vars`. Browser Acceptance and Responsive Matrix each own a `wrangler dev --local` process using `web/wrangler.jsonc`, an isolated per-run D1 persistence directory, and deterministic fixture setup. Migrations and fixture SQL use explicit `--local --persist-to` arguments against the same directory. Direct Responsive config invocation may use `PROGRAMS_TARGET_URL` for diagnostics, but the canonical runner provisions its own loopback Worker. The Runtime Reliability Canary owns a separate local Worker process and disposable D1.

The finite aggregate runs these Browser stages once and in order:

1. `pnpm test:programs:browser` — 70 cases: management at `phone-390`, participant flows at `phone-360`/`phone-390`/`phone-402`, and navigation at `phone-390`; zero retries.
2. `pnpm test:programs:home` — five Home-origin cases, including long-copy checks at 320, 390, 799, and 800 CSS pixels; zero retries.
3. `pnpm test:programs:responsive` — 21 cases across the configured responsive projects (320, 360, 390, 402, 600, 799, 800, 1024, and 1440 CSS pixels); zero retries.
4. `pnpm test:programs:feed` — seven Notices/Messages browser cases; zero retries.

The aggregate validates all four Playwright JSON reports, including expected counts, zero skipped/unexpected/flaky results, zero result retries, passed result statuses, and each runner's local Worker/D1 manifest. The root `pnpm verify` gate owns Worker/D1 contract and pre-commit checks once; standalone `pnpm verify:programs` does not repeat them. It does not require a canary artifact; the final `promotion.json` records the canary as independent `not_run` diagnostic evidence and carries the open B-003 risk disclosure. The wider repository gate is `pnpm verify`, which runs this promotion command with the rest of the local checks. Every stage log and the final `promotion.json` live under the ignored `test-results/programs-promotion/<run-id>/` directory.

## Amended rescue-development contract

Under the owner-approved [T05 rescue qualification amendment](https://github.com/Noahlw/efcc/issues/505#issuecomment-5550498028), `pnpm verify:programs` is the finite Programs browser aggregate. It runs Browser Acceptance, Home-origin Acceptance, Responsive Matrix, feed Acceptance, and parity/report checks. The wider `pnpm verify` command owns Worker/D1 contract and the fast local pre-commit checks once. The promotion manifest records the unchanged five-minute canary as independent `not_run` diagnostic evidence and includes the explicit open B-003 residual-risk disclosure; it does not require a canary artifact.

The canary remains independently runnable through `pnpm test:programs:canary` with its existing five-minute and zero-retry semantics. A red canary remains visible and non-zero, but does not become green or change finite-stage results. A failed finite functional scenario still blocks qualification. The machine result `functional-passed` is not T05 `STACK_GREEN`; ledger reconciliation, current-revision evidence, separate Standards/Spec review, one replacement PR, and the scoped risk record remain required.

When an independent canary run is available, pass its `run.json` through `PROGRAMS_CANARY_RUN_FILE`; the promotion manifest records its `passed`/`failed`/`not_run` status, source revision, and artifact path. With no reference the manifest records `not_run`; an invalid explicit reference fails closed without making the canary a mandatory aggregate stage.

## Contraction boundary

The former `programs-d1` 63-case suite, the five-case PUI-05 Home-origin suite, their shared config, and the now-unused event-window helper were retired after parity qualification. On clean candidate `1cdc15e26bd57eb931a63c29ca4df18c3194486a`, `pnpm verify:programs` reported `functional-passed`: 70 Browser, five Home, 21 responsive, and seven Feed cases; zero skips, unexpected, flaky, or retried results; Worker Contract and non-browser precommit also passed. The promotion manifest records the 26 participant + 37 management mappings and all five Home mappings. The participant and management ledgers preserve historical scenario IDs and replacement ownership.

The repository-wide local-only verification decision is recorded in [ADR-0056](../adr/0056-local-only-verification.md). The three GitHub Actions workflows and the `Fast CI` required status are retired together; `pnpm verify` is the local machine-readiness gate and does not establish deployment qualification. T05 still requires its own promotion evidence, current-revision review, and owner disposition.

The superseded [PR #549](https://github.com/Noahlw/efcc/pull/549) remains closed without merge. Its runtime traces, `Network connection lost` evidence, seed/report lessons, and failure-evidence requirements remain preserved in the T05.3 canary and tracker history. T06 / [#511](https://github.com/Noahlw/efcc/issues/511) and [#550](https://github.com/Noahlw/efcc/pull/550) remain gated until this replacement T05 PR qualifies and merges parent-first; T06 must then restack onto the replacement T05 head and rerun affected/final validation.
