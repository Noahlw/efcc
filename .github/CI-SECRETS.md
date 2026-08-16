# CI credentials — optional D1 deployment smoke

The rebuilt login boundary is the Cloudflare Worker `/api/v1/auth/*` surface backed by D1. Local `wrangler dev` + local D1 is the required repository `READY` gate; the workflow below is an optional operator-run smoke against a disposable deployed Worker. It never uses the retired Apps Script `/exec` role-nav suite or Google storage-state cookies.

## How the checks behave

- **Deterministic PR checks** (`.github/workflows/precheck.yml`) need no secrets or deployment: root prototype checks, web typechecks, workerd D1 auth tests, component tests, and the local static-shell responsive suite.
- **D1 auth contract check** (`e2e.yml`, `auth-contract` job) also needs no secrets or deployment. It runs the real Worker/D1 `Fetch` boundary in the Cloudflare Vitest pool and covers the cookie-only transport, legacy-PIN upgrade, session lifecycle, and forbidden header/CORS paths.
- **Optional deployed D1 auth smoke** (`e2e.yml`, `deployed-auth` job) runs only from `workflow_dispatch`. It is fail-closed: missing target or acceptance credentials produce an explicit failure before Playwright starts. A manual run is operational evidence only; it is not required for repository `READY` and never writes to a production database.

The browser talks directly to the Worker/D1 surfaces (`/api/v1/auth/*`, `/api/v1/programs/*`, `/api/v1/attendance*`); there is no Apps Script proxy in the request path.

## Repository variable

Configure `AUTH_TARGET_URL` under GitHub Settings → Secrets and variables → Actions → Variables. It must be an HTTPS URL for an isolated, versioned Worker deployment backed by a disposable/acceptance D1 database, using the repository's reserved `efcc-auth-*.efcc-ggc.workers.dev` acceptance hostname. Do not point it at production or a shared developer database. The workflow rejects embedded credentials and rejects hosts outside the reserved acceptance namespace before Playwright starts.

Rotate the target whenever the auth contract or D1 migration changes:

1. Deploy the branch's Worker code to the isolated target.
2. Apply the branch's D1 migrations to the isolated acceptance database.
3. Seed one active password account and one legacy-PIN account used only by this gate.
4. Update `AUTH_TARGET_URL` to the new deployment URL.
5. Run `D1 auth acceptance gate` with `workflow_dispatch` and retain the Playwright artifact.

The deployed result is evidence for that fresh deployment only. A missing manual run never blocks repository `READY` and must never be described as a passing production smoke.

## Repository secrets

Configure these under GitHub Settings → Secrets and variables → Actions → Secrets:

- `AUTH_TEST_USERNAME` — active account used for password login/logout.
- `AUTH_TEST_CREDENTIAL` — credential for that acceptance account.
- `AUTH_LEGACY_USERNAME` — imported account with `requires_upgrade = 1`.
- `AUTH_LEGACY_PIN` — one-time legacy PIN for that account.
- `AUTH_NEW_CREDENTIAL` — replacement credential used by the upgrade smoke.

These values are sent only to the deployed Playwright process. Never print them, include them in test names, commit them, or paste them into issues/PRs. The test asserts cookie names and security attributes without printing cookie values or response bodies.

## Rebuilt Next UI role fixtures

The deployed Next UI gate (`tests/e2e/live-ui.config.ts`) also requires six out-of-band fixtures under **Secrets and variables → Actions → Secrets**:

- `PROGRAMS_ADMIN_USERNAME` / `PROGRAMS_ADMIN_CREDENTIAL` — disposable Admin account.
- `PROGRAMS_STAFF_USERNAME` / `PROGRAMS_STAFF_CREDENTIAL` — disposable Staff account.
- `PROGRAMS_MEMBER_USERNAME` / `PROGRAMS_MEMBER_CREDENTIAL` — disposable Member account.

Each username must be distinct and start with `E2E_`; each credential must contain at least eight non-whitespace characters. Seed the three active accounts in the isolated acceptance D1/database before running `pnpm exec playwright test -c tests/e2e/live-ui.config.ts`; the legacy account is only for the auth upgrade smoke. These values are never printed or committed and must not be reused for production or the D1 auth smoke fixtures above.

## Local-first E2E (default target)

The D1 suites target `wrangler dev` on `http://127.0.0.1:8787` by default (AGENTS.md local-first policy — zero Cloudflare account touched). Bring up the stack with `pnpm dev:local` (builds, applies local D1 migrations, serves on :8787), seed accounts with `pnpm db:seed:local` (rerunnable; restores active fixture credentials), and seed the walkthrough with `pnpm db:seed:demo`. The local auth suite uses the active and legacy fixtures; the Programs, attendance, and live UI suites use the three active fixtures.

Any `*_TARGET_URL` override must stay fail-closed: use HTTP only for loopback local testing, or HTTPS without embedded credentials for the reserved `efcc-auth-*.efcc-ggc.workers.dev` (acceptance) / `efcc-dev-*.efcc-ggc.workers.dev` (dev-testing) hostnames.

## Shared dev-testing worker (opt-in, deployed E2E)

To run the D1 suites against the shared dev-testing worker instead: `https://efcc-dev-testing.efcc-ggc.workers.dev`, backed by the `efcc-dev-testing` D1 seeded with dev-only fixtures. These are NOT GitHub secrets: they are plaintext in the repo (`tests/e2e/seed-dev-accounts.ts` + this doc) and hashed with the real PBKDF2 hasher at seed time. Never reuse them for production or the CI acceptance gate.

| username     | role   | credential       |
| ------------ | ------ | ---------------- |
| `E2E_admin`  | Admin  | `E2E_admin!dev`  |
| `E2E_staff`  | Staff  | `E2E_staff!dev`  |
| `E2E_member` | Member | `E2E_member!dev` |
| `E2E_legacy` | Member | PIN `1234`       |

One-time provisioning runbook (all wrangler commands from `web/`):

1. Create the dev database: `wrangler d1 create efcc-dev-testing` (record its `database_id`).
2. Apply migrations: `wrangler d1 migrations apply efcc-dev-testing --remote`.
3. Deploy the worker with the dev D1 override: `wrangler deploy --d1 DB=<database_id>`.
4. Set a dev-only secret: `wrangler secret put EFCC_ACCESS_TOKEN_SECRET`.
5. Seed the four fixtures (the legacy account is needed only by the auth upgrade smoke; all are idempotent): `./node_modules/.bin/tsx tests/e2e/seed-dev-accounts.ts --reset-legacy > /tmp/seed-dev.sql && wrangler d1 execute efcc-dev-testing --remote --file=/tmp/seed-dev.sql` (or single-shot: `wrangler d1 execute efcc-dev-testing --remote --command="$(./node_modules/.bin/tsx tests/e2e/seed-dev-accounts.ts --reset-legacy)"`)

Then run the suite against that worker: `PROGRAMS_TARGET_URL=https://efcc-dev-testing.efcc-ggc.workers.dev pnpm exec playwright test -c tests/e2e/programs-d1.config.ts` (omit the override to run local-first against `wrangler dev`).

## Retired Apps Script suite

The deployed Apps Script `/exec` Playwright suite, Google storage-state fixtures, clasp deployment helper, `src/gas/`, and `tests/gas/` VM-harness are retired and removed. An Apps Script browser trace is out of scope and would require an explicit new operator decision; it is not part of the D1 `READY` gate.
