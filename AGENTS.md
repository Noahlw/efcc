# EFCC Project Guidance

## Docs-Backed (Apps Script)

- Surface missing official docs as blocking question. Status stays `Proposed` until official docs, the smallest local VM/API check, and any explicitly scoped operator `/exec` smoke are complete; `/exec` is not the default `READY` gate.

## Headless-Gate (Verification)

- Web app changes require an acceptance trace written BEFORE implementation (mechanical edits exempt).
- Authenticated E2E canonical acceptance is Playwright through the official Wrangler `createTestHarness()` runtime with the production EFCC Worker build/config and disposable local D1 (zero Cloudflare account touched). The canonical T05 gate is `pnpm verify:programs-runtime`; it must preserve the existing browser, route, auth/session, D1, and fail-closed acceptance contract. For manual runs, apply local migrations and complete direct disposable `pnpm db:seed:local` before starting `pnpm dev:local`; only after Worker readiness run the real API-backed `pnpm db:seed:demo`, then the browser suite. Direct CLI seeding must never race an already-open D1 runtime. The existing shell-supervised runner `scripts/run-programs-acceptance.ts` is Diagnostic during this migration and remains available for manual development/upstream diagnosis; `pnpm dev:local` remains the manual developer path. Unauthenticated/CSS checks use Orca `browser` (`Stateless-Wall` blocks Orca on authenticated RPCs).
- The required full Programs/Worker/D1 prerequisite is `pnpm verify:programs-runtime` after `web/.dev.vars` exists; the Canonical Harness gate owns the production build/config, disposable local D1 migrations/fixtures, real Worker/API seed, listener/auth readiness, and the complete unfiltered single-process Programs journey. It preserves each run's logs/results under `test-results/programs-d1-runs/`, never touches remote resources, and does not change the required `201 expected / 0 skipped / 0 unexpected / 0 flaky / workers: 1 / fullyParallel: false / retries: 0` contract. The authenticated readiness probe intentionally runs after seeding.
- The local Canonical Harness run is the required `READY` gate (ADR-0029): relevant Playwright suites must pass 100% against the real production-configured Worker and local D1, with every criterion asserted through observable DOM or response state. The shell-supervised `wrangler dev` path is Diagnostic evidence only and cannot be used to claim the Canonical gate is green. Cloudflare deployment is optional/manual production-promotion evidence only; if run, use a fresh reserved `efcc-auth-*` or `efcc-dev-*` host, never the stale `efcc-prototype-129` host. Pipeline results append to the ticket plan when an appender command is explicitly run.

## UI Components and Variants

- All new or changed web UI MUST use the repository's local shadcn-style components and Radix primitives from `web/components/ui` where an equivalent exists. Extend an existing primitive or variant before creating a new control.
- Component state, size, intent, and other stable semantic variants MUST use `class-variance-authority` (`cva`) with the repository's `cn` class-composition helper. Layout and composition belong to approved EFCC patterns/routes and ordinary Tailwind utilities; they are not blanket CVA variants. Keep variant definitions beside the component and preserve the existing shadcn API shape.
- When a library, framework, or component API is unfamiliar, use the Context7 CLI before coding: `npx ctx7@latest library <name> "<specific question>"`, select the authoritative result, then run `npx ctx7@latest docs <library-id> "<single concept>"`. Keep queries free of secrets and use the fetched guidance in the implementation.

## Database Safety

- Local/CI E2E may reset only explicitly disposable `E2E_`/`E2E_DEMO_` D1 fixtures through the checked-in seed scripts. Apps Script and Google Sheets are never mutated by automated tests; the `Users` tab remains immutable.

## UI Control Recovery

- Canonical UI operating authority: [`docs/implementation/ui-control-recovery-governance.md`](docs/implementation/ui-control-recovery-governance.md). Read it before app-facing UI work.
- Use Tailwind for ordinary layout/visual rules, CVA for stable semantic axes, local shadcn/Radix primitives plus `cn()`, tokens, and narrow layered global CSS. Patterns own repeated composition; routes own domain content/state/arrangement.
- Ordinary implementation agents MUST NOT lower expectations, widen tolerances, change baselines, add skips/allowlists/suppressions, remove coverage, extend waivers, or use `!important` as routine containment.
- Any token, primitive/pattern contract, scenario, tolerance, baseline, coverage, native exception, waiver, or approval requirement is a human-approved **CONTRACT CHANGE**.
- Keep at most one unapproved visual **phase stack** in flight. A phase stack may contain multiple ticket-isolated PRs after each parent reaches `STACK_GREEN`; human approval and parent-first merge remain required before the stack enters the next phase.
- A dependent ticket may start from a `STACK_GREEN` parent PR without waiting for that parent to merge. Keep one branch/PR per ticket and keep child PR bases pointed at their immediate stack parent so each PR remains an incremental ticket-isolated diff.
- Do not mix visual rescue with unrelated backend, schema, feature, lint, or data work. Do not treat screenshots or headless geometry as human approval.
