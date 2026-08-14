# EFCC Church Management System

EFCC is the church-management system for the Evangelical Free Church of China — Glorious Grace Church (播道會顯恩堂).

The repository runs on the **Cloudflare Worker + D1 platform** (ADR-0024): identity, credentials, sessions, login, registration, approval, and the domain capabilities — Programs, Events, Attendance, Enrollments — are all Worker/D1-native. The Apps Script + Google Sheets backend is retired; its source (`src/gas/`), VM-harness tests (`tests/gas/`), clasp configuration, and the transitional `/api/v1/rpc` proxy were removed.

## Current architecture

| Boundary | Current owner | Responsibility |
| --- | --- | --- |
| Identity Authority | Cloudflare Worker + D1 | Accounts, credentials, login, refresh, logout, sessions, legacy-PIN upgrade, registration, approval |
| Domain Backend | Cloudflare Worker + D1 | Programs, Events, Attendance, Enrollments, and remaining church-management capabilities |
| Web application | Next.js static export served by the Worker | Login, registration, approval queue, profile, navigation shell, and current section surfaces |
| Transitional bridge | Removed | The `/api/v1/rpc` Apps Script proxy is retired; the browser talks directly to Worker/D1 |

Read [`CONTEXT.md`](CONTEXT.md) for the project glossary, ADR status, and the two-era ADR table, and [`docs/adr/0022-staged-worker-d1-platform-migration.md`](docs/adr/0022-staged-worker-d1-platform-migration.md) for the migration boundary that has now completed.

## Feature roadmap

**Feature State** describes what is true today. **Target Owner** describes where the capability should live after migration. "Complete" means the code, local implementation checks, and required local E2E evidence exist; an optional deployed smoke is operational evidence, not the repository `READY` gate (ADR-0029).

| Feature | Current state | Current surface | Target owner | Next milestone |
| --- | --- | --- | --- | --- |
| Identity and accounts | Complete (local gate) | Worker + D1 | Worker + D1 | Optional isolated deployed smoke for promotion |
| Cookie-only login/session | Complete (local gate) | `/api/v1/auth/*` | Worker + D1 | Optional isolated deployed smoke for promotion |
| Legacy-PIN upgrade | Complete (local gate) | Worker + D1 and login UI | Worker + D1 | Keep destructive tests restricted to `E2E_` fixtures |
| Self-service registration | Complete (local gate) | Web registration page + D1 | Worker + D1 | Optional isolated deployed smoke for promotion |
| Admin/Staff approval | Complete (local gate) | Web approval queue + D1 | Worker + D1 | Expand role and rejection-path acceptance coverage |
| Member profile | Complete (local gate) | Web profile page + D1 profile DTO | Worker + D1 | Add editable profile requirements when specified |
| Programs | Complete (local gate) | Worker + D1 `/api/v1/programs/*` | Worker + D1 | Programs E2E against the dev-testing worker (ADR-0031) |
| Events | Complete (local gate) | Worker + D1 schedule rules and event lifecycle | Worker + D1 | Event recurrence exception acceptance expansion |
| Attendance/check-in | Complete (local gate) | Worker + D1 `/api/v1/attendance*` | Worker + D1 | Assisted scanner and guest check-in E2E coverage |
| Care dashboard | Planned | New web page placeholder; no accepted Worker/D1 capability | Worker + D1 | Define data contract, privacy boundary, and acceptance plan |
| Permissions/program leadership | Planned | Existing role vocabulary and legacy authorization rules | Worker + D1 | Implement capability matrix and scoped Program Leader permissions |

### Migration phases

1. **Foundation — merged (PRs #166/#167)**
   - D1 established as the Identity Authority.
   - Cookie-only authentication and session lifecycle shipped.
   - Legacy credential upgrade, registration, approval, profile, and the authenticated web shell shipped.
2. **Capability parity**
   - Programs, Events, Attendance, and Enrollments migrated to Worker/D1 one capability at a time, each with a defined contract and observable acceptance criteria.
3. **Traffic cutover**
   - The web application moved from Apps Script RPCs to the Worker/D1 implementations; no live caller of the legacy RPC proxy remains.
4. **Retirement — complete**
   - The legacy `/api/v1/rpc` proxy, `src/gas/` Apps Script domain code, `tests/gas/` VM-harness suite, and clasp configuration are removed; the browser talks only to Worker/D1.

## Onboarding — where to start

You are joining after the D1 foundation (PRs #166/#167) merged to `main`. The platform is restarting on D1 (ADR-0024); the Apps Script era ADRs (0001–0016) are read for rationale and surviving domain rules, not as the current architecture.

1. **Read the landscape.** [`CONTEXT.md`](CONTEXT.md) (glossary, data model, two-era ADR table) → [`docs/adr/0024-d1-platform-restart-relationship-to-apps-script.md`](docs/adr/0024-d1-platform-restart-relationship-to-apps-script.md) → ADR-0020/0022 for the identity boundary and migration staging. Then [`CONTRIBUTING.md`](CONTRIBUTING.md) for the contributor workflow.
2. **Pick the next capability.** The domain stack is Worker/D1-native; start with the roadmap row marked **In progress** or **Planned** (Care dashboard or Permissions/program leadership), read its linked spec/ADR (D1-era specs under `docs/specs/074`–`080`), write its acceptance trace, then implement it without broad deletion.
3. **Follow the gates.** Every web change needs an acceptance trace written before code (AGENTS.md headless gate); run the relevant local `wrangler dev` + D1 E2E before `READY`; the production Google Sheet is edited by the operator only.

## Ground rules

- **Google Sheet safety:** agents must not modify the production Google Sheet. The user performs sheet, column, row, and seed-data changes manually. See [`AGENTS.md`](AGENTS.md).
- **Acceptance before implementation:** web changes require a written acceptance trace before code changes. The current migration trace is [`docs/specs/078-staged-platform-migration-acceptance-plan.md`](docs/specs/078-staged-platform-migration-acceptance-plan.md).
- **Local-first gate:** local tests plus a fresh local `wrangler dev`/D1 browser trace are required for `READY`; an isolated Worker deployment is an optional operator smoke, never an automatic repository gate.
- **Secret safety:** never commit credentials, PINs, cookies, tokens, storage states, or deployment secrets.
- **Disposable E2E data:** destructive upgrade tests must use explicitly marked usernames beginning with `E2E_`; never run them against a real member.

## Repository map

| Path | Purpose |
| --- | --- |
| [`web/`](web/) | Next.js static frontend and Cloudflare Worker |
| [`web/lib/auth/`](web/lib/auth/) | D1 accounts, credentials, sessions, lockout, upgrade, and registration logic |
| [`web/lib/programs/`](web/lib/programs/) | D1 Programs domain: workspace, departments, events, enrollment |
| [`web/lib/attendance.ts`](web/lib/attendance.ts) | D1 Attendance domain handlers |
| [`web/migrations/`](web/migrations/) | D1 schema and migrations |
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

Requirements: Git, Node.js 22, pnpm 11.7.0 (pinned in `packageManager`), and Chromium for Playwright.

`pnpm run bootstrap` is the single fresh-clone dependency command. It installs the root dependencies (TypeScript, Playwright, prototype tooling) and then the `web/` dependencies (Next.js, Cloudflare Wrangler/D1, Vitest) using the frozen root and `web/` lockfiles, and installs the Playwright Chromium browser through the root install lifecycle.

### Verify the repository

```sh
pnpm run verify
```

`pnpm run verify` runs the deterministic CI gate locally in the same order as the Precheck workflow: root typecheck, root prototype tests, `web/` typecheck, `web/` workerd tests, `web/` component tests, then the responsive-shell Playwright suite. It requires no deployment credentials.

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

The Worker reads local variables from `web/.dev.vars` (see `web/.dev.vars.example`); `EFCC_ACCESS_TOKEN_SECRET` is required for auth/programs/attendance routes. Do not place secrets in tracked files.

### Deploy the isolated Worker

Use the relevant Wrangler configuration under `web/` and deploy only to the isolated test resources intended for acceptance. Record the deployed URL and run the D1 acceptance suite with disposable accounts. Do not point tests at production resources.

## Verification layers

- **Worker/auth unit and integration:** `pnpm --dir web test`
- **Web component behavior:** `pnpm --dir web test:components`
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
