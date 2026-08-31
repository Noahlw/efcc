# EFCC Project Guidance

## Docs-Backed (Apps Script)

- Surface missing official docs as blocking question. Status stays `Proposed` until official docs, the smallest local VM/API check, and any explicitly scoped operator `/exec` smoke are complete; `/exec` is not the default `READY` gate.

## Headless-Gate (Verification)

- Web app changes require an acceptance trace written BEFORE implementation (mechanical edits exempt).
- Authenticated E2E = Playwright versus `wrangler dev` on `127.0.0.1:8787` by default (zero Cloudflare account touched). `pnpm dev:local` builds, migrates, and starts it; `pnpm db:seed:local` seeds the disposable `E2E_` account fixtures and `pnpm db:seed:demo` seeds the `E2E_DEMO_` domain walkthrough. Unauthenticated/CSS checks use Orca `browser` (`Stateless-Wall` blocks Orca on authenticated RPCs).
- The local run is the required `READY` gate (ADR-0029): relevant Playwright suites must pass 100% against local `wrangler dev` + local D1, with every criterion asserted through observable DOM or response state. Cloudflare deployment is optional/manual production-promotion evidence only; if run, use a fresh reserved `efcc-auth-*` or `efcc-dev-*` host, never the stale `efcc-prototype-129` host. Pipeline results append to the ticket plan when an appender command is explicitly run.

## UI Components and Variants

- All new or changed web UI MUST use the repository's local shadcn-style components and Radix primitives from `web/components/ui` where an equivalent exists. Extend an existing primitive or variant before creating a new control.
- Component state, size, intent, and layout variants MUST use `class-variance-authority` (`cva`) with the repository's `cn` class-composition helper. Keep variant definitions beside the component and preserve the existing shadcn API shape; avoid scattered conditional class strings and bespoke control semantics.
- When a library, framework, or component API is unfamiliar, use the Context7 CLI before coding: `npx ctx7@latest library <name> "<specific question>"`, select the authoritative result, then run `npx ctx7@latest docs <library-id> "<single concept>"`. Keep queries free of secrets and use the fetched guidance in the implementation.
## Database Safety

- Local/CI E2E may reset only explicitly disposable `E2E_`/`E2E_DEMO_` D1 fixtures through the checked-in seed scripts. Apps Script and Google Sheets are never mutated by automated tests; the `Users` tab remains immutable.
