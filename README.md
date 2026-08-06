# EFCC Church Management System

EFCC is the church-management system for the Evangelical Free Church of China — Glorious Grace Church (播道會顯恩堂).

The repository has **restarted on the D1 platform** (ADR-0024): Cloudflare Worker + D1 owns identity, credentials, sessions, login, registration, and approval (merged foundation PRs #166/#167). The Apps Script + Google Sheets backend is historical — it remains the transitional domain backend for Programs, Events, Attendance, Enrollments, and related capabilities until each has a Worker/D1 replacement and fresh acceptance proof.

## Current architecture

| Boundary | Current owner | Responsibility |
| --- | --- | --- |
| Identity Authority | Cloudflare Worker + D1 | Accounts, credentials, login, refresh, logout, sessions, legacy-PIN upgrade, registration, approval |
| Domain Backend | Apps Script + Google Sheets | Programs, Events, Attendance, Enrollments, and remaining church-management RPCs during migration |
| Web application | Next.js static export served by the Worker | Login, registration, approval queue, profile, navigation shell, and current section placeholders |
| Transitional bridge | Worker `/api/v1/rpc` proxy | Forwards remaining domain RPCs to the Apps Script deployment |

The ownership rule is deliberate:

> D1 owns identity and authentication. Apps Script owns domain capabilities until each capability is migrated and accepted. Do not delete the Apps Script domain backend merely because D1 authentication is complete.

Read [`CONTEXT.md`](CONTEXT.md) for the project glossary, ADR status, and the two-era ADR table, and [`docs/adr/0022-staged-worker-d1-platform-migration.md`](docs/adr/0022-staged-worker-d1-platform-migration.md) for the boundary decision.

## Feature roadmap

**Feature State** describes what is true today. **Target Owner** describes where the capability should live after migration. "Complete" means the code and local/preview tests exist; a fresh deployed acceptance run on the current deployment is the remaining proof (AGENTS.md headless gate).

| Feature | Current state | Current surface | Target owner | Next milestone |
| --- | --- | --- | --- | --- |
| Identity and accounts | Complete (deployed proof pending) | Worker + D1 | Worker + D1 | Fresh deployment acceptance on every auth change |
| Cookie-only login/session | Complete (deployed proof pending) | `/api/v1/auth/*` | Worker + D1 | Fresh deployment acceptance on every auth change |
| Legacy-PIN upgrade | Complete (deployed proof pending) | Worker + D1 and login UI | Worker + D1 | Keep destructive tests restricted to `E2E_` fixtures |
| Self-service registration | Complete (code) — deployed proof pending | Web registration page + D1 | Worker + D1 | Add deployed acceptance coverage for production-like approval data |
| Admin/Teacher approval | Complete (code) — deployed proof pending | Web approval queue + D1 | Worker + D1 | Expand role and rejection-path acceptance coverage |
| Member profile | Complete (code) — deployed proof pending | Web profile page + D1 profile DTO | Worker + D1 | Add editable profile requirements when specified |
| Programs | Transitional | Apps Script RPC; new web page is a placeholder | Worker + D1 | Define Worker/D1 read and mutation contracts |
| Events | Transitional | Apps Script repositories/RPCs; new web page is a placeholder | Worker + D1 | Define event lifecycle and recurrence migration |
| Attendance/check-in | Transitional | Apps Script check-in RPC and external scanner | Worker + D1 | Migrate event selection, QR resolution, and audited check-in |
| Care dashboard | Planned | New web page placeholder; no accepted Worker/D1 capability | Worker + D1 | Define data contract, privacy boundary, and acceptance plan |
| Permissions/program leadership | Planned | Existing role vocabulary and legacy authorization rules | Worker + D1 | Implement capability matrix and scoped Program Leader permissions |
| Apps Script domain backend retirement | Planned | Required by the transitional bridge | Not applicable | Retire only after every domain capability has replacement proof |

### Migration phases

1. **Foundation — merged (PRs #166/#167)**
   - D1 established as the Identity Authority.
   - Cookie-only authentication and session lifecycle shipped.
   - Legacy credential upgrade, registration, approval, profile, and the authenticated web shell shipped.
   - Apps Script domain backend kept operational.
2. **Capability parity**
   - Migrate Programs, Events, Attendance, and Enrollments one capability at a time.
   - Define the Worker/D1 contract before implementation.
   - Verify each migrated capability against observable acceptance criteria.
3. **Traffic cutover**
   - Move the web application from the corresponding Apps Script RPC to the Worker/D1 implementation.
   - Remove the old caller only after the new path is deployed and accepted.
   - Keep rollback evidence until the cutover is stable.
4. **Retirement**
   - Remove the legacy `/api/v1/rpc` proxy and Apps Script domain code only after no live caller remains.
   - Remove obsolete Apps Script deployment configuration and tests in the same capability-specific migration, not in the auth foundation PR.

## Onboarding — where to start

You are joining after the D1 foundation (PRs #166/#167) merged to `main`. The platform is restarting on D1 (ADR-0024); the Apps Script era ADRs (0001–0016) are read for rationale and surviving domain rules, not as the current architecture.

1. **Read the landscape.** [`CONTEXT.md`](CONTEXT.md) (glossary, data model, two-era ADR table) → [`docs/adr/0024-d1-platform-restart-relationship-to-apps-script.md`](docs/adr/0024-d1-platform-restart-relationship-to-apps-script.md) → ADR-0020/0022 for the identity boundary and migration staging. Then [`CONTRIBUTING.md`](CONTRIBUTING.md) for the contributor workflow.
2. **Pick the next migration.** Start with the roadmap row marked **In progress** (first one will be a domain capability — Programs or Events), read its linked spec/ADR (D1-era specs under `docs/specs/074`–`078`), write its acceptance trace, then migrate one domain capability without broad deletion.
3. **Follow the gates.** Every web change needs an acceptance trace written before code (AGENTS.md headless gate); every Apps Script API/clasp claim needs official docs evidence; a fresh deployed run must pass before READY; the production Google Sheet is edited by the operator only.

## Ground rules

- **Google Sheet safety:** agents must not modify the production Google Sheet. The user performs sheet, column, row, and seed-data changes manually. See [`AGENTS.md`](AGENTS.md).
- **Apps Script evidence:** Apps Script APIs, manifest keys, clasp behavior, and deployments require official documentation evidence before implementation.
- **Acceptance before implementation:** web changes require a written acceptance trace before code changes. The current migration trace is [`docs/specs/078-staged-platform-migration-acceptance-plan.md`](docs/specs/078-staged-platform-migration-acceptance-plan.md).
- **Fresh deployment gate:** local tests are necessary but not sufficient. A fresh `/exec` or isolated Worker deployment must pass the relevant browser/API trace before READY.
- **Secret safety:** never commit credentials, PINs, cookies, tokens, storage states, or deployment secrets.
- **Disposable E2E data:** destructive upgrade tests must use explicitly marked usernames beginning with `E2E_`; never run them against a real member.

## Repository map

| Path | Purpose |
| --- | --- |
| [`web/`](web/) | Next.js static frontend and Cloudflare Worker |
| [`web/lib/auth/`](web/lib/auth/) | D1 accounts, credentials, sessions, lockout, upgrade, and registration logic |
| [`web/migrations/`](web/migrations/) | D1 schema and migrations |
| [`src/gas/`](src/gas/) | Transitional Apps Script domain backend and legacy deployment source |
| [`tests/gas/`](tests/gas/) | Deterministic Apps Script VM-harness tests |
| [`tests/prototype/`](tests/prototype/) | Standalone scanner/prototype tests |
| [`tests/e2e/`](tests/e2e/) | Playwright acceptance and deployment test configuration |
| [`docs/specs/`](docs/specs/) | Behavioral specifications and acceptance traces |
| [`docs/adr/`](docs/adr/) | Durable architecture decisions |
| [`CONTEXT.md`](CONTEXT.md) | Domain glossary, data model, ownership terms, and ADR status |
| [`AGENTS.md`](AGENTS.md) | Contributor, safety, documentation, and verification rules |

## Quick start

New developers should follow [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full contributor workflow — clone, branching, worktrees, pre-commit, environment, and deployment boundaries. The canonical fresh-clone flow is below.

### Clone and install

```sh
git clone <repo-url> efcc
cd efcc
corepack enable
fnm use   # or: mise install / asdf install — selects Node 22 from .node-version
pnpm run bootstrap
```

Requirements: Git, Node.js 22, pnpm 11.7.0 (pinned in `packageManager`), and Chromium for Playwright. Apps Script deployment additionally requires an authenticated `clasp` client.

`pnpm run bootstrap` is the single fresh-clone dependency command. It installs the root dependencies (GAS/prototype tooling, TypeScript, Playwright) and then the `web/` dependencies (Next.js, Cloudflare Wrangler/D1, Vitest) using the frozen root and `web/` lockfiles, and installs the Playwright Chromium browser through the root install lifecycle.

### Verify the repository

```sh
pnpm run verify
```

`pnpm run verify` runs the deterministic CI gate locally in the same order as the Precheck workflow: root typecheck, root GAS/prototype tests, `web/` typecheck, `web/` workerd tests, `web/` component tests, then the responsive-shell Playwright suite. It requires no deployment credentials.

### Lockfiles and the two install boundaries

The repository has two independent pnpm install boundaries, each with its own lockfile:

| Workspace | Lockfile | Contents |
| --- | --- | --- |
| Root | `pnpm-lock.yaml` | GAS/prototype tooling, TypeScript, Playwright, husky |
| `web/` | `web/pnpm-lock.yaml` | Next.js, Cloudflare Wrangler/D1, Vitest, jsdom |

`pnpm run bootstrap` installs both. Work inside `web/` with `pnpm --dir web <script>`; the root and `web/` trees have separate dependency installations and do not share a `node_modules`.

### Build and run the web Worker locally

```sh
cd web
pnpm build
npx wrangler dev
```

The Worker requires a local `web/.dev.vars` with an Apps Script `/exec` target when exercising the transitional RPC proxy. Do not place secrets in tracked files.

### Deploy the isolated Worker

Use the relevant Wrangler configuration under `web/` and deploy only to the isolated test resources intended for acceptance. Record the deployed URL and run the D1 acceptance suite with disposable accounts. Do not point tests at production resources.

### Deploy the transitional Apps Script backend

The clasp root is `src/gas/`:

```sh
clasp push
clasp deploy
```

A fresh Apps Script deployment creates a new `/exec` URL. Follow the Apps Script evidence and fresh-deployment rules in [`AGENTS.md`](AGENTS.md) and the E2E guide before using it.

## Verification layers

- **Worker/auth unit and integration:** `pnpm --dir web test`
- **Web component behavior:** `pnpm --dir web test:components`
- **Apps Script VM harness:** `pnpm test:gas`
- **Prototype tests:** `pnpm test:prototype`
- **Root and E2E type checks:** `pnpm typecheck`
- **Static/lint checks:** `pnpm check`
- **Responsive shell:** `pnpm test:shell-responsive`
- **Deployed D1 auth acceptance:**
  ```sh
  pnpm exec playwright test tests/e2e/auth-d1.test.ts \
    --config=tests/e2e/auth-d1.config.ts
  ```

Authenticated acceptance must use Playwright. Unauthenticated or visual checks may use the repository's browser workflow. See [`docs/specs/078-staged-platform-migration-acceptance-plan.md`](docs/specs/078-staged-platform-migration-acceptance-plan.md) for the migration trace.
