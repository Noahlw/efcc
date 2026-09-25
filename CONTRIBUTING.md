# Contributing to EFCC

This is a local-first Cloudflare Worker + D1 project. Keep the repository easy to install, easy to verify, and easy for the next agent to navigate.

## Requirements and fresh clone

- Git
- Node.js 22.18.0 from [`.node-version`](.node-version)
- pnpm 11.7.0 from the root `packageManager` field
- Chromium for Playwright

```sh
git clone <repo-url> efcc
cd efcc
corepack enable
fnm use                 # or mise/asdf using .node-version
pnpm bootstrap
pnpm install:browsers
pnpm verify
```

The repository has one pnpm workspace (`pnpm-workspace.yaml`) and one lockfile (`pnpm-lock.yaml`). Keep `apps/web/` as the application directory (package name `web`), but run contributor commands from the root so the command and dependency boundary stays obvious. Use `pnpm --filter web <script>` only when a web package script is the explicit owner of the task.

`pnpm bootstrap` runs the frozen workspace install. Playwright browser binaries are installed only by the explicit `pnpm install:browsers` command; dependency installation must not silently download them.

## Branches and worktrees

Create one branch per coherent change and keep unrelated cleanup out of it. Use a worktree for long-running or parallel work:

```sh
git worktree add ../efcc-<branch> -b <branch>
cd ../efcc-<branch>
pnpm bootstrap
pnpm install:browsers
```

Read the active plan and the relevant ADR before changing architecture, schema, test ownership, or deployment configuration. Preserve unrelated dirty work. Do not push, merge, deploy, or change a remote ruleset unless the owner authorizes that separate action.

## Development loop

1. Read [`CONTEXT.md`](CONTEXT.md), the relevant domain code, and the current plan/ADR.
2. Write the acceptance trace before a web behavior change; mechanical documentation changes are exempt.
3. Reuse an existing domain module, platform API, or installed dependency before adding an abstraction or package.
4. Run the smallest affected command while iterating.
5. Run `pnpm verify` on the clean candidate before calling the implementation ready.

Useful commands are listed in [`README.md`](README.md) and owned in the root `package.json`. The local aggregate is `pnpm verify`; the fast pre-commit gate is `pnpm verify:precommit`.

## Local Worker and D1

```sh
pnpm dev:local
pnpm db:seed:local
pnpm db:seed:demo
```

The local run builds the static export, applies Wrangler migrations to local D1, and serves the Worker on loopback. Playwright suites that need an already-running Worker use `PROGRAMS_TARGET_URL=http://127.0.0.1:8787` or their config default. Stop processes started by your worktree and leave parent-owned processes alone.

Only local or inventory-approved disposable development/test D1 targets may be reset. A reset must name the target explicitly and happen after the baseline has passed against an empty local D1. Production and unknown targets are outside the development workflow. Do not run remote Wrangler commands until the Worker account, route, D1 ID, environment, and rate-limit namespace are verified from authoritative account evidence; the checked-in placeholder configuration is not that evidence.

The D1 schema ledger is `apps/web/migrations/`. Keep it as the single migration history. The project has no production data, but a development reset still requires a verified target and a reproducible seed.

## Verification and pre-commit

The accepted machine gate is local `pnpm verify`, described in [`TESTING.md`](TESTING.md) and [ADR-0056](docs/adr/0056-local-only-verification.md). It does not replace code review, independent review, owner approval, human/device checks, or deployment evidence. GitHub Actions is not a development dependency or a source of readiness claims.

The Husky pre-commit hook runs:

1. Node version guard.
2. `pnpm exec ultracite doctor`.
3. `pnpm exec lint-staged --config package.json` for formatting.
4. `pnpm verify:precommit` for the fast type/static gate.

`pnpm check` is an opt-in repository-wide Ultracite lint scan while its existing syntax backlog is being reduced. A failed optional scan must be reported accurately and must not be hidden by changing the required local gate.

Keep one primary test owner for each behavior. Do not duplicate a Worker/Node test in the component project merely to increase a count. Retire an old browser or fixture suite only after a named replacement proves each still-valid behavior; see the repo-wide plan for the parity rule.

## Product and data boundaries

- Keep the current Worker scanner and ZXing fallback. The external Apps Script camera flow and public `/prototype` route are retired; internal presentation review belongs in Storybook.
- Do not reintroduce Google Sheets, Apps Script, the old RPC bridge, or a Users/PIN import path. New accounts use the current registration and approval flow.
- Keep authentication/session authority separate from the editable scoped Role Definition, Grant, hierarchy, and audit model. Auth provider/library migration is deferred to [#639](https://github.com/Noahlw/efcc/issues/639).
- Never commit credentials, PINs, tokens, cookies, storage state, or `.dev.vars` values.

## Review and deployment

Every change should state the candidate revision, commands run, results, and known limitations. A Storybook story, unit test, geometry check, or local Worker test proves only its own boundary. Keep these evidence layers distinct:

- local machine verification;
- independent review;
- owner approval and product judgment;
- real device or assistive-technology review;
- Cloudflare configuration and deployment/promotion evidence.

Routine development does not deploy. When deployment work is explicitly authorized, verify the target identity first and use a disposable development/acceptance resource. Never treat the stale `efcc-prototype-129` name or placeholder IDs in `web/wrangler.jsonc` as a valid target.

## Documentation routing

- [`CONTEXT.md`](CONTEXT.md) is the single domain glossary and invariant source.
- [`docs/adr/`](docs/adr/) stores durable decisions; add a new ADR for a new durable decision and preserve old records.
- [`docs/plans/`](docs/plans/) stores current implementation plans and handoffs.
- [`docs/agents/`](docs/agents/) stores issue, triage, and domain routing.
- [`TESTING.md`](TESTING.md) owns testing-layer boundaries and canonical commands.

When a library or platform API is unfamiliar, read the current official documentation through Context7 or Firecrawl before coding and record the decision in the active plan when it changes architecture or maintenance cost.
