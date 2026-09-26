# EFCC agent guide

## Start with the source of truth

- Read [CONTEXT.md](CONTEXT.md) for domain language and invariants.
- Read the relevant accepted or superseded decision in [docs/adr/](docs/adr/).
- Read the active handoff or implementation plan in [docs/plans/](docs/plans/).
- Read [TESTING.md](TESTING.md) before changing test ownership or claiming readiness.
- Use [docs/agents/](docs/agents/) for issue, triage, and domain routing.
- Read [skill references and setup status](docs/agents/skills.md) before following the checked-in workflow references.

EFCC is one domain context with one root `CONTEXT.md`. Keep domain terms there, durable decisions in `docs/adr/`, and execution detail in `docs/plans/`. Preserve historical records; mark them historical or superseded when current behavior changes.

## Build the smallest maintainable change

- Inspect callers, routes, scripts, and current tests before editing a shared module.
- Reuse the standard library, platform behavior, or an existing repository helper before adding a dependency or abstraction.
- Keep domain logic under `apps/web/lib/<domain>`, route composition under `apps/web/app`, and Worker/API routing in `apps/web/worker.ts`.
- Keep authentication/session authority separate from the editable scoped Role Definition, Grant, hierarchy, and audit model.
- Keep the root workspace and root command entrypoints as the default navigation path. Read `package.json` when a command is needed instead of copying a command list into a new document.
- When an unfamiliar library, framework, or Cloudflare API is needed, read its current official documentation through Context7 or Firecrawl before choosing an implementation.

Web behavior changes require an acceptance trace before implementation; mechanical documentation changes do not.

## Verify at the real boundary

- Run the smallest affected command during iteration.
- Run `pnpm verify` on the clean candidate before a ready handoff.
- Treat local Worker/D1 tests, Storybook, component tests, geometry tests, human/device review, independent review, and deployment evidence as separate seams. A lower-level pass proves only that seam.
- Use explicit `pnpm install:browsers`; dependency installation must not silently install browser binaries.
- Keep pre-commit fast: formatting, `ultracite doctor`, lint-staged, and `pnpm verify:precommit`.

## Protect data and external boundaries

- Use only local or inventory-approved disposable development/test D1 targets for reset and seed operations.
- Verify Worker account, route, D1 ID, environment, rate-limit namespace, and compatibility date before any remote Wrangler action. A placeholder in `apps/web/wrangler.jsonc` is not identity evidence.
- Never reset production or an unknown target. Never commit credentials, cookies, access tokens, storage state, or `.dev.vars` values.
- Keep Apps Script, Google Sheets, the old RPC bridge, the external scanner opener, and public `/prototype` route retired. Keep the current Worker scanner and ZXing fallback.
- Auth provider/library replacement is deferred to [#639](https://github.com/Noahlw/efcc/issues/639); do not fold it into unrelated cleanup.

## UI rules

- Use the existing local shadcn-style components, Radix primitives, `cn()` helper, and CVA for stable semantic variants where an equivalent exists.
- Use Storybook for local presentation work and owner spot-checks. It does not replace Worker/D1, device, assistive-technology, or production evidence.
- Treat tokens, promoted Storybook/real-app contracts, durable baselines, required coverage, waivers, and approval requirements as contract changes. Record owner approval before changing them.
- Preserve unrelated pre-existing failures and report them with their actual boundary.

## Repository routing

### Issue tracker

GitHub Issues and Wayfinder maps live in Noahlw/efcc. Read [issue-tracker.md](docs/agents/issue-tracker.md) before any GitHub write. Check authentication and read back every write.

### Triage

Use the five canonical labels described in [triage-labels.md](docs/agents/triage-labels.md). Label readiness never authorizes scope changes, merge, deployment, or release.

### Documentation

Update current docs when commands or boundaries change. Do not rewrite old ADRs, applied migration SQL, or historical acceptance records to make them look current.
