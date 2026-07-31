# EFCC Church Management System

EFCC is the church-management web app for the Evangelical Free Church of China — Glorious Grace Church (播道會顯恩堂). It is a phone-first Google Apps Script HTML Service application backed by Google Sheets, with one stable App Document for authenticated Members (會員), staff, and administrators. This README is the starting map for developers; detailed rules, domain language, architecture, and test procedures live in the linked project documents.

## Read these two ground rules first

> **Never let an agent modify the backend Google Sheet.** The user must add or change sheets, columns, rows, and seed data manually. Read [AGENTS.md — Google Sheet database: no automatic mutation](AGENTS.md#google-sheet-database--no-automatic-mutation) before doing backend work.

> **Back every Apps Script API call with official documentation.** This includes server and browser APIs, manifest fields, clasp commands, and deployment behavior. Read [AGENTS.md — Apps Script docs-backed method rule](AGENTS.md#apps-script-docs-backed-method-rule) before proposing or implementing a platform-facing change.

These are repository gates, not optional conventions. [AGENTS.md](AGENTS.md) is authoritative if this overview and the detailed rules ever appear to differ.

## Tech stack

Google Apps Script on the V8 runtime, Google Sheets, HTML Service, and clasp power the application. Vitest, oxlint/oxfmt through Ultracite, and Playwright provide the repository's automated checks; the [E2E guide](tests/e2e/README.md) explains the deployed-browser layer.

## Quick start

### Prerequisites

Install:

- Git;
- Node.js 20+;
- clasp, authenticated for the Apps Script project.

The repository does not define a local development-server script. Runtime verification happens through unit tests and a deployed Apps Script `/exec` URL.

### Clone and install

```sh
git clone https://github.com/Noahlw/efcc.git
cd efcc
pnpm install
```

`pnpm install` installs the exact dependency graph recorded by the lockfile, auto-approves the esbuild build scripts required by vitest and tsx, downloads Chromium for the E2E pipeline, and runs the Husky `prepare` hook. After this single command, the repo is ready to run tests.

### Run local checks

Run the Apps Script unit suite:

```sh
pnpm test:gas
```

Run the complete repository test command:

```sh
pnpm test
```

Run the configured static checks:

```sh
pnpm check
```

See [Testing](#testing) before running login-gated E2E checks; they require a deployed URL and captured authentication state.

### Push and deploy

The verified [.clasp.json](.clasp.json) points clasp at `src/gas/` and the EFCC Apps Script project. From the repository root:

```sh
clasp push
clasp deploy
```

`clasp push` synchronizes the local Apps Script source. `clasp deploy` creates a versioned deployment; record its `/exec` URL and update the E2E target as described in [Deployment](#deployment).

Do not run deployment commands until the relevant checks and the [AGENTS.md browser gate](AGENTS.md#implementation-verification-workflow--headless-browser-gate) are understood.

## Where things live

| Path | What belongs there | Read next |
| --- | --- | --- |
| [`src/gas/`](src/gas/) | Deployable Apps Script source; server code uses `.gs`, while the App Document, client scripts, views, and styles use `.html` | [`src/gas/appsscript.json`](src/gas/appsscript.json) |
| [`tests/gas/`](tests/gas/) | Vitest tests using a VM harness and mocked Apps Script globals | [`tests/gas/login-and-bootstrap.test.js`](tests/gas/login-and-bootstrap.test.js) |
| [`tests/e2e/`](tests/e2e/) | Playwright configuration, authentication capture, role-matrix tests, and acceptance-result appending | [`tests/e2e/README.md`](tests/e2e/README.md) |
| [`docs/specs/`](docs/specs/) | System specifications, architecture contracts, feature plans, and acceptance plans | [`docs/specs/009-phone-first-shell-navigation.md`](docs/specs/009-phone-first-shell-navigation.md) |
| [`docs/adr/`](docs/adr/) | Architecture Decision Records explaining important choices and their status | [`docs/adr/0012-e2e-testing-strategy.md`](docs/adr/0012-e2e-testing-strategy.md) |
| [`.github/workflows/e2e.yml`](.github/workflows/e2e.yml) | Every-push Playwright workflow and its repository-value contract | [`tests/e2e/README.md#ci-secrets-table`](tests/e2e/README.md#ci-secrets-table) |
| [`AGENTS.md`](AGENTS.md) | Authoritative contributor, research, verification, deployment, and sheet-safety rules | [`AGENTS.md#apps-script-evidence-gate`](AGENTS.md#apps-script-evidence-gate) |
| [`CONTEXT.md`](CONTEXT.md) | Domain glossary, data-store overview, ADR status table, and known tooling issues | [`CONTEXT.md#domain-glossary`](CONTEXT.md#domain-glossary) |

The clasp configuration sets `rootDir` to `src/gas`, so files elsewhere in the repository are not application source pushed to Apps Script. The V8 runtime and web-app settings are recorded in [`src/gas/appsscript.json`](src/gas/appsscript.json).

Current test surfaces are intentionally small and explicit:

- [`tests/gas/login-and-bootstrap.test.js`](tests/gas/login-and-bootstrap.test.js), [`tests/gas/role-navigation.test.js`](tests/gas/role-navigation.test.js), [`tests/gas/app-shell.contract.test.js`](tests/gas/app-shell.contract.test.js), and [`tests/gas/shell-session.test.js`](tests/gas/shell-session.test.js);
- [`tests/e2e/auth.ts`](tests/e2e/auth.ts), [`tests/e2e/playwright.config.ts`](tests/e2e/playwright.config.ts), [`tests/e2e/role-matrix.test.ts`](tests/e2e/role-matrix.test.ts), [`tests/e2e/plan-doc-appender.ts`](tests/e2e/plan-doc-appender.ts), and [`tests/e2e/tsconfig.json`](tests/e2e/tsconfig.json).

## Development workflow

A typical behavioral change follows this sequence:

1. Read [AGENTS.md](AGENTS.md), the governing file in [`docs/specs/`](docs/specs/), and any related decision in [`docs/adr/`](docs/adr/).
2. Confirm terminology in the [`CONTEXT.md` domain glossary](CONTEXT.md#domain-glossary); use names such as Member (會員), Program (課程 / 事工), and Section (功能區) consistently.
3. For Apps Script methods or deployment behavior, satisfy the [official-documentation evidence rule](AGENTS.md#apps-script-docs-backed-method-rule).
4. Write the acceptance plan required by the [headless browser gate](AGENTS.md#implementation-verification-workflow--headless-browser-gate) before implementation.
5. Edit the relevant server `.gs` and client `.html` files under [`src/gas/`](src/gas/).
6. Add or update focused VM-harness coverage in [`tests/gas/`](tests/gas/), then run `pnpm test:gas`.
7. Push to Apps Script and create a fresh versioned deployment with `clasp push` and `clasp deploy`.
8. Use the Orca `browser` tool for deployed cold-start, signed-out, CSS, layout, and one-off debugging checks.
9. For any login-gated behavior, add or update the Playwright specification under [`tests/e2e/`](tests/e2e/) and follow its [onboarding guide](tests/e2e/README.md).
10. Verify observable outcomes against the fresh `/exec` deployment; do not infer success from a click or from unit tests alone.
11. Push the branch so [GitHub Actions](.github/workflows/e2e.yml) runs the Playwright pipeline on the configured `E2E_TARGET_URL`.

If a change needs a new sheet, column, row, or data correction, stop at the boundary described in [AGENTS.md](AGENTS.md#google-sheet-database--no-automatic-mutation). Describe the exact manual edit and wait for the user to confirm it.

## Testing

EFCC has three complementary verification layers:

### Apps Script unit tests

[`tests/gas/`](tests/gas/) exercises server and shell behavior with Vitest and mocked Apps Script globals. Run it from the repository root:

```sh
pnpm test:gas
```

These tests are fast and deterministic, but they cannot prove the deployed HTML Service iframe, `google.script.run`, Google authentication, or a versioned `/exec` deployment works end to end.

### Playwright E2E tests

[`tests/e2e/`](tests/e2e/) covers login-gated behavior against a deployed `/exec` URL using role-specific Playwright Storage State (儲存狀態). Start with the complete [`tests/e2e/README.md`](tests/e2e/README.md), then read [ADR-0012](docs/adr/0012-e2e-testing-strategy.md).

The verified local entry points are:

```sh
pnpm e2e:auth -- --role=alice
pnpm e2e:auth -- --role=bob
pnpm e2e:auth -- --role=noah
pnpm test:e2e
```

Before those commands, export the current deployment URL exactly as shown in the [E2E setup guide](tests/e2e/README.md#1-set-the-target-url). Authentication-state files contain live session cookies; follow the guide's security and rotation instructions rather than committing or sharing them.

### Manual deployed-browser checks

Use the Orca `browser` tool for cold-start and no-login assertions such as the `SIGNED_OUT` state, login-form presence, responsive layout, navigation visibility, and scroll locking. It is also suitable for interactive E2E troubleshooting.

Orca is not a substitute for Playwright after crossing the login boundary. The authoritative division of responsibility is in [AGENTS.md](AGENTS.md#how-to-execute) and [ADR-0012](docs/adr/0012-e2e-testing-strategy.md).

## Deployment

The local deployment boundary is [`src/gas/`](src/gas/) because [.clasp.json](.clasp.json) declares it as `rootDir`. The manifest uses the V8 runtime; inspect [`src/gas/appsscript.json`](src/gas/appsscript.json) rather than guessing runtime or access settings.

For a new versioned deployment:

```sh
clasp push
clasp deploy
```

A newly created deployment receives a new deployment ID and therefore a new `/exec` URL. That makes the old `E2E_TARGET_URL` stale. If deliberately redeploying an existing deployment, clasp supports targeting its deployment ID; consult the official clasp documentation first as required by [AGENTS.md](AGENTS.md#apps-script-docs-backed-method-rule).

After deployment:

1. Copy the fresh `/exec` URL.
2. Export it locally as `E2E_TARGET_URL` using the command in [`tests/e2e/README.md`](tests/e2e/README.md#1-set-the-target-url).
3. Update the GitHub Actions repository variable `E2E_TARGET_URL`.
4. Refresh an expired role's Storage State (儲存狀態) and corresponding secret by following the [rotation procedure](tests/e2e/README.md#4-when-a-captured-session-expires).
5. Run the appropriate cold-start and login-gated acceptance paths.

[`.github/workflows/e2e.yml`](.github/workflows/e2e.yml) runs on every push. It installs Node 20 dependencies and Chromium, restores three role-specific storage states from repository secrets, runs Playwright against `E2E_TARGET_URL`, appends available results to the acceptance plan, and uploads diagnostic artifacts. The exact secret names and encoding contract live in the [E2E CI table](tests/e2e/README.md#ci-secrets-table).

## Architecture and specs

The master architecture document is [`docs/specs/009-phone-first-shell-navigation.md`](docs/specs/009-phone-first-shell-navigation.md). It defines the phone-first shell, stable App Document, Section (功能區) navigation, authorization boundaries, lifecycle, and acceptance expectations.

Use the documentation layers this way:

- [`docs/specs/`](docs/specs/) describes **what** the system should do and how acceptance is demonstrated;
- [`docs/adr/`](docs/adr/) records **why** durable architecture choices were made and their current status;
- [`CONTEXT.md`](CONTEXT.md) supplies the shared domain glossary, Google Sheet model, ADR status index, and tooling notes;
- [`AGENTS.md`](AGENTS.md) defines **how contributors must work** in this repository.

Start feature work from the relevant spec rather than from filenames alone. The system-level overview is [`docs/specs/000-efcc-system-spec.md`](docs/specs/000-efcc-system-spec.md), while the current shell direction is governed by the master architecture spec and its linked ADRs.

## Agent and contributor workflow

[AGENTS.md](AGENTS.md) is the authoritative workflow contract for human and agent contributors. Read it before changing Apps Script, client HTML, navigation, session, RPC, audit, repository, Section content, styles, or deployment configuration.

Its key linked gates include:

- the [Apps Script evidence gate](AGENTS.md#apps-script-evidence-gate);
- the [docs-backed method rule](AGENTS.md#apps-script-docs-backed-method-rule);
- the [headless browser gate](AGENTS.md#implementation-verification-workflow--headless-browser-gate);
- the [no-automatic-sheet-mutation rule](AGENTS.md#google-sheet-database--no-automatic-mutation).

Do not copy those rules into feature plans and let the copies drift. Link back to `AGENTS.md`, and record feature-specific evidence in the governing spec or ADR as directed there.

## ADR index

See [`docs/adr/`](docs/adr/) for the project's 12 Architecture Decision Records. The sequence currently runs from [ADR-0001 — Google Sheets as Database](docs/adr/0001-google-sheets-as-database.md) through [ADR-0012 — E2E Testing Strategy](docs/adr/0012-e2e-testing-strategy.md), including [ADR-0011 — One Active Session per Member](docs/adr/0011-one-active-session-per-member.md).

Use the status table in [`CONTEXT.md`](CONTEXT.md#architecture-decisions) as the concise index; do not maintain a second status table here.

## Quick reference

For the current role-aware navigation acceptance flow, use [`docs/specs/067-role-nav-acceptance-plan.md`](docs/specs/067-role-nav-acceptance-plan.md). It is the E2E acceptance plan and the target for generated executed results.

Keep these entry points close at hand:

- Contributor rules: [`AGENTS.md`](AGENTS.md)
- Domain and decision context: [`CONTEXT.md`](CONTEXT.md)
- Master shell architecture: [`docs/specs/009-phone-first-shell-navigation.md`](docs/specs/009-phone-first-shell-navigation.md)
- E2E onboarding: [`tests/e2e/README.md`](tests/e2e/README.md)
- E2E decision: [`docs/adr/0012-e2e-testing-strategy.md`](docs/adr/0012-e2e-testing-strategy.md)
- E2E workflow: [`.github/workflows/e2e.yml`](.github/workflows/e2e.yml)
- Role-navigation acceptance plan: [`docs/specs/067-role-nav-acceptance-plan.md`](docs/specs/067-role-nav-acceptance-plan.md)

## External resource IDs

These are the canonical IDs for the project's Google resources. They are not hard-coded in application source (the app reads the spreadsheet ID from a Script Property), but operators and CI need them to configure and verify the deployment.

| Resource | ID | Where configured |
| --- | --- | --- |
| Apps Script project | `1NvyYCSXEl3dBZzmEPOQNfwJbHm49WFxFFb3OHzENBP45H-myiU0FQppX` | [`.clasp.json`](.clasp.json) (push target) |
| Google Spreadsheet | `1ISBjcQmsWrvrt93gxbShyvAax2uMgYkrhbNJiYSCHdw` | Script Property `EFCC_SPREADSHEET_ID` |

These two IDs plus `EFCC_SESSION_SALT` (a random hex string set once in Script Properties) are the only values the standalone Apps Script project must be configured with before a deployment will accept logins. Run `diagSetupScriptProperties` from the Apps Script editor to seed all three. See [Push and deploy](#push-and-deploy) for the push/deploy cycle and the [diagnosis document](docs/research/2026-07-30-login-failure-diagnosis.md) for the rationale.

## First-time deployment checklist

Before the login gate accepts logins on a new standalone Apps Script project, complete these steps once.

### 1. Authorize OAuth scopes

`clasp deploy` cannot trigger the OAuth consent dialog. The `spreadsheets` scope (declared in `appsscript.json`) is only consented when a function that calls `SpreadsheetApp` runs from the editor. `doGet` alone is NOT enough - it only uses `HtmlService`.

1. Open the [Apps Script editor](https://script.google.com/home/projects/1NvyYCSXEl3dBZzmEPOQNfwJbHm49WFxFFb3OHzENBP45H-myiU0FQppX/edit).
2. From the function dropdown, select `diagRunSheetStructure`.
3. Click **Run** (▶). A dialog prompts for the `spreadsheets` scope.
4. Click **Review permissions**, select your account, and click **Allow**.
5. Verify the Executions log shows the sheet structure JSON (sheet names + row counts). This confirms `SpreadsheetApp.openById` works end-to-end.

See [Google's authorization documentation](https://developers.google.com/apps-script/guides/services/authorization) for the official OAuth flow reference.

### 2. Seed Script Properties

Run `diagSetupScriptProperties` once to set `EFCC_SPREADSHEET_ID` and `EFCC_SESSION_SALT`.

1. From the editor function dropdown, select `diagSetupScriptProperties`.
2. Click **Run** (▶).
3. Check **Executions** — you should see `EFCC_SPREADSHEET_ID set.` and `EFCC_SESSION_SALT set.`.

These properties persist across deployments — they only need to be set once per project.

### 3. Verify Script Properties

1. Open **Project Settings** (⚙) > **Script Properties**.
2. Confirm `EFCC_SPREADSHEET_ID` = `1ISBjcQmsWrvrt93gxbShyvAax2uMgYkrhbNJiYSCHdw`.
3. Confirm `EFCC_SESSION_SALT` exists and is non-empty.

### 4. Deploy and test

1. Click **Deploy** > **New deployment**, type **Web app**.
2. Set **Execute as** = "Me (`...@gmail.com`)".
3. Set **Who has access** = "Anyone".
4. Click **Deploy**, copy the `/exec` URL.
5. Open the URL. The login form must render with username and PIN fields.
6. Submit valid credentials — you must reach the Profile section.
7. Update `E2E_TARGET_URL` with the new URL per [Deployment](#deployment).
