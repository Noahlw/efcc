# CI credentials — D1 auth acceptance gate

The rebuilt login boundary is the Cloudflare Worker `/api/auth/*` surface backed by D1. The deployed gate (`.github/workflows/e2e.yml`) no longer uses the retired Apps Script `/exec` role-nav suite or Google storage-state cookies.

## How the checks behave

- **Deterministic PR checks** (`.github/workflows/precheck.yml`) need no secrets or deployment: root GAS/prototype checks, web typechecks, workerd D1 auth tests, component tests, and the local static-shell responsive suite.
- **D1 auth contract check** (`e2e.yml`, `auth-contract` job) also needs no secrets or deployment. It runs the real Worker/D1 `Fetch` boundary in the Cloudflare Vitest pool and covers the cookie-only transport, legacy-PIN upgrade, session lifecycle, and forbidden header/CORS paths.
- **Deployed D1 auth smoke** (`e2e.yml`, `deployed-auth` job) runs only from `workflow_dispatch`. It is fail-closed: missing target or acceptance credentials produce an explicit failure before Playwright starts. A manual run is not a deployment and never writes to a production database.

The branch's signed-out UI still calls the retained Apps Script `/api/v1/rpc` path; it is not presented as the rebuilt D1 login. The deployed smoke therefore targets `/api/auth/*` directly with Playwright's request context until the browser client is rewired in the follow-up login/UI work.

## Repository variable

Configure `AUTH_TARGET_URL` under GitHub Settings → Secrets and variables → Actions → Variables. It must be an HTTPS URL for an isolated, versioned Worker deployment backed by a disposable/acceptance D1 database, using the repository's reserved `efcc-auth-*.efcc-ggc.workers.dev` acceptance hostname. Do not point it at production or a shared developer database. The workflow rejects embedded credentials and rejects hosts outside the reserved acceptance namespace before Playwright starts.

Rotate the target whenever the auth contract or D1 migration changes:

1. Deploy the branch's Worker code to the isolated target.
2. Apply the branch's D1 migrations to the isolated acceptance database.
3. Seed one active password account and one legacy-PIN account used only by this gate.
4. Update `AUTH_TARGET_URL` to the new deployment URL.
5. Run `D1 auth acceptance gate` with `workflow_dispatch` and retain the Playwright artifact.

The deployed result is evidence for the fresh deployment only. A missing manual run must never be described as a passing production smoke.

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

Each username must be distinct and start with `E2E_`; each credential must contain at least eight non-whitespace characters. Seed the three accounts in the isolated acceptance D1/database before running `pnpm exec playwright test -c tests/e2e/live-ui.config.ts`. These values are never printed or committed and must not be reused for production or the D1 auth smoke fixtures above.

## Dev-testing worker (local E2E)

The programs-d1 suite (`tests/e2e/programs-d1.test.ts`) runs **locally**, not in CI, against the shared dev-testing worker: `https://efcc-dev-testing.efcc-ggc.workers.dev`. `tests/e2e/programs-d1.config.ts` defaults to that URL; `PROGRAMS_TARGET_URL` overrides it. Either way the config stays fail-closed: HTTPS-only, no embedded credentials, and only the reserved `efcc-auth-*.efcc-ggc.workers.dev` (acceptance) / `efcc-dev-*.efcc-ggc.workers.dev` (dev-testing) hostnames.

The dev worker is backed by the `efcc-dev-testing` D1, seeded with three **dev-only** fixture accounts. These are NOT GitHub secrets: they are plaintext in the repo (`tests/e2e/seed-dev-accounts.ts` + this doc) and hashed with the real PBKDF2 hasher at seed time. Never reuse them for production or the CI acceptance gate.

| username     | role   | credential       |
| ------------ | ------ | ---------------- |
| `E2E_admin`  | Admin  | `E2E_admin!dev`  |
| `E2E_staff`  | Staff  | `E2E_staff!dev`  |
| `E2E_member` | Member | `E2E_member!dev` |

One-time provisioning runbook (all wrangler commands from `web/`):

1. Create the dev database: `wrangler d1 create efcc-dev-testing` (record its `database_id`).
2. Apply migrations: `wrangler d1 migrations apply efcc-dev-testing --remote`.
3. Deploy the worker with the dev D1 override: `wrangler deploy --d1 DB=<database_id>`.
4. Set a dev-only secret: `wrangler secret put EFCC_ACCESS_TOKEN_SECRET`.
5. Seed the three accounts (idempotent — safe to re-run): `pnpm exec tsx tests/e2e/seed-dev-accounts.ts > /tmp/seed-dev.sql && wrangler d1 execute efcc-dev-testing --remote --file=/tmp/seed-dev.sql` (or single-shot: `wrangler d1 execute efcc-dev-testing --remote --command="$(pnpm exec tsx tests/e2e/seed-dev-accounts.ts)"`)

Then run the suite locally: `pnpm exec playwright test -c tests/e2e/programs-d1.config.ts`.

## Legacy Apps Script gate

The old `E2E_TARGET_URL`, `ALICE_STORAGE_STATE`, `BOB_STORAGE_STATE`, and `NOAH_STORAGE_STATE` inputs are intentionally no longer consumed by this branch's PR workflows. The retained `/api/v1/rpc` domain proxy remains covered by deterministic Worker regression tests; a separate Apps Script role-navigation deployment gate can be restored only when that legacy UI is deliberately brought back into scope.

The AGENTS.md fresh `/exec` headless-gate requirement still applies whenever the legacy Apps Script UI/domain flow is in scope. This D1 auth gate is a separate Worker boundary proof and must not be used as a substitute for that legacy UI smoke.
