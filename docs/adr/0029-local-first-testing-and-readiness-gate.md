# ADR-0029 — Local-First Testing and Readiness Gate

- **Status**: Accepted
- **Deciders**: Noah Wong, OMP planner (grill-with-docs)
- **Date**: 2026-08-11
- **Related**: `AGENTS.md`, `CONTRIBUTING.md`, `tests/e2e/README.md`, Issue #245 / PUI-01

## Context

The rebuilt application runs as a Cloudflare Worker with static assets and D1. Requiring a fresh Cloudflare deployment for every implementation check makes ordinary development depend on account access, remote state, and deployment rotation. The retired Apps Script `/exec` browser suite also depended on Google storage-state credentials and did not exercise the rebuilt Worker.

The repository needs one deterministic gate that maintainers can run without touching Cloudflare or Google production resources, while retaining a safe way to collect deployed operational evidence when a release operator explicitly chooses to do so.

## Decision

1. The required repository `READY` gate is the relevant deterministic checks plus 100% pass of the relevant Playwright suite against local `wrangler dev` and local D1 at `http://127.0.0.1:8787`.
2. `pnpm dev:local` is the standard local entry point. `pnpm db:seed:local` creates disposable `E2E_` account fixtures, and `pnpm db:seed:demo` creates an idempotent local `E2E_DEMO_` department/program walkthrough with generated events.
3. Cloudflare deployment is optional/manual production-promotion evidence. Optional deployed runs must use a fresh allowlisted `efcc-auth-*` or `efcc-dev-*` Worker hostname, disposable `E2E_` fixtures, and the existing fail-closed workflow/config validation. A missing deployed run never blocks repository `READY`.
4. The legacy Apps Script `/exec` Playwright suite, Google storage-state capture helper, and clasp deployment helper are retired. Deterministic `tests/gas/` coverage remains for transitional Apps Script code; an Apps Script browser smoke requires an explicitly scoped operator decision.
5. Acceptance evidence is appended only when a maintainer explicitly runs `tests/e2e/plan-doc-appender.ts` with a named plan, artifact, heading, and target URL.

## Consequences

- Daily feature work has a reproducible Worker/D1 browser gate with no Cloudflare account or production data dependency.
- Local D1 fixtures are intentionally disposable and must remain prefixed `E2E_` or `E2E_DEMO_`; the seed commands are the source of truth for resetting them.
- A local pass proves the implementation against the local Worker/runtime, not the availability or configuration of a deployed Cloudflare resource. Operators may add the optional deployed smoke when promotion evidence is needed.
- Removing the `/exec` suite deletes Google storage-state maintenance and its remote credential boundary; legacy Apps Script behavior remains covered by deterministic VM tests rather than a hidden deployment gate.

## Alternatives considered

- **Require a fresh Cloudflare deployment for every `READY` claim** — rejected because it couples routine correctness checks to remote account access and mutable deployed state.
- **Keep the Apps Script `/exec` suite as the universal gate** — rejected because it is retired scope and cannot validate the rebuilt Worker/D1 application.
- **Use only unit tests and static-shell checks** — rejected because the required gate must exercise authenticated cookies, Worker routes, local D1 state, and observable browser behavior end to end.
