# EFCC Church Management System

EFCC is the church-management system for Evangelical Free Church of China — Glorious Grace Church (播道會顯恩堂).

The current product boundary is a static Next.js export served by a Cloudflare Worker. The Worker owns the HTTP API and binds the D1 database. Development and verification use local Wrangler, local D1, and disposable fixtures. The accepted local-only verification decision is recorded in [ADR-0056](docs/adr/0056-local-only-verification.md).

## Architecture

| Boundary | Owner | Responsibility |
| --- | --- | --- |
| Browser application | `apps/web/` Next.js static export | Routes, screens, navigation, forms, and presentation |
| HTTP/API runtime | `apps/web/worker.ts` | Auth/session transport, domain routes, authorization, validation, and D1 access |
| Database | Cloudflare D1 | Accounts, sessions, registrations, role definitions, grants, domain data, and immutable audit records |
| Static assets | Worker `ASSETS` binding | Serves `apps/web/out/` produced by `pnpm build` |
| Scanner | `apps/web/app/scanner/` and `apps/web/lib/use-qr-camera.ts` | In-app camera flow with the supported barcode detector and ZXing fallback |
| Internal presentation | Storybook | Local design review and isolated UI states; it is not a production runtime |

The application does not use Next.js SSR in production. `apps/web/next.config.ts` uses `output: "export"`; `apps/web/wrangler.jsonc` serves the resulting static directory and sends `/api/*` to the Worker. The repository keeps D1 migrations in `web/migrations/` and does not add a second migration ledger for the bounded Drizzle trial.

Apps Script, Google Sheets, the old `/api/v1/rpc` bridge, and the external scanner opener are retired product paths. The current cleanup removes the remaining Users/PIN import and forced-upgrade path because the project has no legacy accounts to migrate. The Auth provider/library replacement is a separate deferred decision under [#639](https://github.com/Noahlw/efcc/issues/639); the editable scoped Role Definition and Grant model remains a product concern.

The `/prototype` route and external prototype scanner are not part of the production export. Use Storybook and the current route surfaces for internal review.

## Start here

1. Read [CONTEXT.md](CONTEXT.md) for domain terms and invariants.
2. Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, branch, data, and review rules.
3. Read [TESTING.md](TESTING.md) before changing test ownership or claiming readiness.
4. Read the relevant accepted decision in [docs/adr/](docs/adr/) and the active implementation plan in [docs/plans/](docs/plans/).
5. For repository agent routing, read [AGENTS.md](AGENTS.md) and the focused guides under [docs/agents/](docs/agents/).

## Fresh clone

```sh
git clone <repo-url> efcc
cd efcc
corepack enable
fnm use                 # or mise/asdf using .node-version
pnpm bootstrap
pnpm install:browsers
```

Requirements: Git, Node.js 22.18.0, pnpm 11.7.0, and Chromium for Playwright. The root `pnpm-workspace.yaml` is the only workspace manifest and `pnpm-lock.yaml` is the only lockfile. `pnpm bootstrap` installs the frozen workspace; browser binaries are installed explicitly with `pnpm install:browsers`.

## Canonical local commands

Run scripts from the repository root. The root package owns the contributor entrypoints and delegates web-specific work through the workspace.

| Goal | Command |
| --- | --- |
| Install dependencies | `pnpm bootstrap` |
| Install Playwright Chromium | `pnpm install:browsers` |
| Next.js development | `pnpm dev` |
| Local Worker + D1 development | `pnpm dev:local` |
| Reset and reseed local D1 | `pnpm db:reset:local` |
| Static production build | `pnpm build` |
| Fast type/static gate | `pnpm verify:fast` |
| Complete local machine gate | `pnpm verify` |
| Worker/D1 tests | `pnpm test:workerd` |
| Identity and role tests | `pnpm verify:identity` |
| Component tests | `pnpm test:components` |
| Storybook | `pnpm storybook` or `pnpm storybook:build` |
| Storybook index contract | `pnpm storybook:verify-index` |
| Programs promotion aggregate | `pnpm verify:programs` |
| Optional repository-wide lint debt scan | `pnpm check` |

`pnpm verify` is the local aggregate and must report each required stage. A passing lower-level test proves only its own seam. The aggregate is not a claim of Cloudflare deployment readiness, human/device approval, or independent review. The five-minute Programs canary remains a separately labelled diagnostic.

For a local Worker session, `pnpm dev:local` builds the static export, applies local Wrangler migrations, and starts the Worker on the default loopback port. Stop the local Worker before running `pnpm db:reset:local`; it removes only this worktree's `.wrangler/state/v3/d1`, then applies the current baseline and seeds local accounts. `pnpm db:seed:local`, `pnpm db:seed:disposable`, and `pnpm db:seed:demo` are local development fixtures. They do not select a remote target.

## Repository map

| Path | Purpose |
| --- | --- |
| [`web/app/`](apps/web/app/) | Next.js routes and route composition |
| [`web/lib/auth/`](apps/web/lib/auth/) | Authentication/session handlers and account lifecycle |
| [`web/lib/identity/`](apps/web/lib/identity/) | Editable role definitions, assignments, grants, hierarchy, and audit contracts |
| [`web/lib/programs/`](apps/web/lib/programs/) | Programs, departments, events, enrollment, and related projections |
| [`web/lib/attendance.ts`](apps/web/lib/attendance.ts) | Attendance and check-in domain handlers |
| [`apps/web/worker.ts`](apps/web/worker.ts) | Worker entrypoint and API routing |
| [`web/migrations/`](apps/web/migrations/) | Wrangler D1 schema ledger |
| [`tests/e2e/`](tests/e2e/) | Local Worker/D1 and static-export Playwright journeys |
| [`scripts/`](scripts/) | Local verification, promotion, governance, and report runners |
| [`docs/adr/`](docs/adr/) | Durable architecture decisions |
| [`docs/plans/`](docs/plans/) | Active implementation plans and handoffs |
| [`docs/agents/`](docs/agents/) | Repository routing for issue, domain, and triage work |
| [`CONTEXT.md`](CONTEXT.md) | Single domain glossary and invariant source |

## Evidence boundaries

Local machine checks establish candidate behavior against local Worker/D1 and static assets. Code review, owner approval, independent review, human/device checks, and any Cloudflare deployment or promotion remain separate evidence. Do not infer a remote Worker, D1, rate-limit namespace, or ruleset identity from the checked-in placeholder configuration. Verify resource identity before any remote action.

Never commit credentials, cookies, access tokens, storage state, or deployment secrets. Never use a production or unknown database as a test fixture.

## Further reading

- [CONTRIBUTING.md](CONTRIBUTING.md) — contributor workflow and safety boundaries.
- [TESTING.md](TESTING.md) — test seams, commands, and evidence rules.
- [docs/plans/2026-09-23-repo-wide-organization.md](docs/plans/2026-09-23-repo-wide-organization.md) — repo-wide cleanup plan and open prerequisites.
- [docs/adr/0029-local-first-testing-and-readiness-gate.md](docs/adr/0029-local-first-testing-and-readiness-gate.md) — local Worker/D1 readiness boundary.
- [docs/adr/0056-local-only-verification.md](docs/adr/0056-local-only-verification.md) — accepted local-only machine gate.
- [docs/adr/0057-rebuildable-development-d1.md](docs/adr/0057-rebuildable-development-d1.md) — rebuildable development/test D1 boundary.
