# Playwright end-to-end tests

The E2E suite is GitHub-tracked developer code under `tests/e2e/`, separate from the mocked Apps Script tests under `tests/gas/`. It is outside the `src/gas/` clasp root and is explicitly ignored by `.claspignore`; it is never uploaded as production Apps Script source.

## Test ownership (deployed vs local)

There are four independent Playwright configurations plus a Vitest unit suite under this directory. They share a tree but must NEVER cross loaders, so the rules below are explicit:

| File / config | Loader | Owned by | What it runs |
| --- | --- | --- | --- |
| `tests/e2e/auth-d1.config.ts` (`pnpm exec playwright test --config=tests/e2e/auth-d1.config.ts`) | Playwright request context | CI `.github/workflows/e2e.yml` manual deployed D1 auth smoke | The rebuilt Worker `/api/auth/*` login/upgrade/logout boundary against an isolated HTTPS Worker target. It uses acceptance account secrets, not Google storage state. Only `auth-d1.test.ts` runs here. |
| `tests/e2e/playwright.config.ts` (`pnpm test:e2e`) | Playwright | Legacy/manual only | Retained Apps Script `/exec` role-navigation specs using `alice` / `bob` / `noah` storage states. This is not the rebuilt D1 login gate and is not invoked by the current PR workflows. |
| `tests/e2e/live-ui.config.ts` (`pnpm exec playwright test --config=tests/e2e/live-ui.config.ts`) | Playwright browser | Operator-deployed Next UI gate (Task 8 of the UI-04 release stack) | `live-ui.test.ts` only — real-browser trace of the rebuilt Next frontend against the isolated `efcc-auth-*` Worker/D1 deployment: login as Admin/Staff/Member, shell, Profile, Account Settings, role-gated approval queue, and responsive DOM states at 375x667. Fails closed on missing `AUTH_UI_TARGET_URL` or `PROGRAMS_*` role fixtures; never mocks the backend. |
| `tests/e2e/responsive.config.ts` (`pnpm test:shell-responsive`) | Playwright | CI `precheck.yml` `shell-responsive` job (deterministic) | `responsive.test.ts` only — local production-shell static export served by `tests/e2e/serve-static.ts` on `127.0.0.1:4173`, in three viewport projects (`mobile-375x812`, `mobile-375x667`, `desktop-1280x800`). No `E2E_TARGET_URL`, no storage state, no HtmlService. |
| `tests/e2e/lib/deploy-acceptance.test.ts` | Vitest | Unit checks (`pnpm exec vitest run tests/e2e/lib/deploy-acceptance.test.ts`) | Vitest unit tests for the deploy CLI helper (`buildDeployPlan` / `buildExecUrl` / `validateExecUrl`). MUST NOT be loaded by Playwright — `import { describe, test } from "vitest"` outside the vitest runtime crashes with `Vitest failed to access its internal state` (verified on PR #166 run #30987198373). |

The deployed configs enforce positive `testMatch` filters so the Vitest helper, legacy Apps Script specs, and local-only static-shell spec never cross loaders. The Vitest helper file is intentionally absent from all Playwright configs.

When adding a new test file under `tests/e2e/`, place it in exactly one of the five rows above. If you need a new Playwright file in the retained Apps Script suite, append it to the legacy specs list above AND confirm `pnpm exec playwright test --list --config=tests/e2e/playwright.config.ts` lists it (currently 54 entries = 18 tests × 3 storage-state projects; new specs multiply the same way). For a new D1 auth smoke, append it to `auth-d1.config.ts`; for a new deployed-Next-frontend browser trace, append it to `live-ui.config.ts`; for a new local static-shell spec, append it to `responsive.config.ts` only.

## Target and data boundary

The rebuilt Worker/D1 gates run only against an isolated, versioned HTTPS Worker deployment on the repository's reserved `efcc-auth-*.efcc-ggc.workers.dev` acceptance hostname, backed by a disposable acceptance D1 database; they never target the production database and never reuse the stale `efcc-prototype-129` host. The D1 auth smoke requires `AUTH_TARGET_URL` plus five acceptance-account secrets. The rebuilt Next UI gate (`live-ui.config.ts`) requires `AUTH_UI_TARGET_URL` (the deployed frontend root on the same acceptance host) plus the six `PROGRAMS_*` role fixtures. The login and upgrade requests mutate only those disposable accounts. `AUTH_LEGACY_USERNAME` must begin with the literal `E2E_` prefix; the Playwright test fails before sending an upgrade request otherwise.

The retained Apps Script suite is the **legacy `/exec` gate**: it has a separate Google Apps Script `/exec` target and Google storage-state boundary, and must not be described as D1 auth coverage. The rebuilt Next frontend (served by the Worker ASSETS binding) is a **separate UI gate** from that legacy iframe suite — `playwright.config.ts` targets the Apps Script iframe, never the rebuilt Next UI.

Set the legacy target locally only when running the retained Apps Script suite:

```sh
export E2E_TARGET_URL="https://script.google.com/macros/s/AKfycbz1aLqfh-DoDqky-KYeLL-mx1uyVDzHXykzyyA8kWmHzXYY7FZDmt5nsKdMM-lhMdHL/exec"
```

The ID is pinned in `playwright.config.ts`, so a mismatched or malformed URL fails before the legacy suite launches. For the rebuilt Worker smoke, set `AUTH_TARGET_URL` and the five acceptance-account environment variables documented in `.github/CI-SECRETS.md`; for the rebuilt Next UI trace, set `AUTH_UI_TARGET_URL` and the six `PROGRAMS_*` role-fixture variables documented there as well.

## Local run

Install dependencies and Chromium, capture Google session state for each role, then run the suite:

```sh
pnpm install
pnpm exec playwright install chromium
pnpm e2e:auth -- --role=alice
pnpm e2e:auth -- --role=bob
pnpm e2e:auth -- --role=noah
pnpm test:e2e
```

The capture commands create `.auth/alice.storage.json`, `.auth/bob.storage.json`, and `.auth/noah.storage.json`. They contain live session cookies and remain local and gitignored. The application PIN entered by the role-matrix tests is separate from the Google session used to capture the state.

## CI

`.github/workflows/e2e.yml` is the D1 auth acceptance gate. Pull requests run the deterministic `auth-contract` job (workerd + D1, no secrets). An operator invokes the `deployed-auth` job with `workflow_dispatch` after provisioning an isolated Worker/D1 target; it validates `AUTH_TARGET_URL` and all five account secrets before running `auth-d1.config.ts`, and fails closed if any prerequisite is missing. The workflow uploads `test-results/` as evidence and never decodes Google storage-state files.

The D1 workflow never creates or deletes a Worker deployment or database. A fresh deployed auth smoke requires an operator to rotate the isolated Worker/D1 target and update `AUTH_TARGET_URL` together with its acceptance accounts (see `.github/CI-SECRETS.md`). Until that manual run passes, AUTH-01/02 remain not-READY for deployment evidence.

The deterministic PR checks (typecheck + unit/component tests + the shell responsive suite below) live in `.github/workflows/precheck.yml` and need no secrets or deployment.

## Fresh Cloudflare deployment flow (authenticated E2E authority)

The authenticated D1 auth smoke is the E2E authority and runs against a **fresh Cloudflare deployment**, not a local stub. `AGENTS.md` Headless-Gate requires 100% pass on that deployment before `READY`. Run it end to end with:

```sh
# 1. Deploy the Worker/D1 surface to Cloudflare and cut a versioned deployment
cd web && pnpm exec wrangler deploy

# 2. Point the suite at the deployed URL on the reserved acceptance hostname
#    (efcc-auth-*.efcc-ggc.workers.dev) and set the five acceptance-account
#    secrets (documented in .github/CI-SECRETS.md). Never reuse the stale
#    efcc-prototype-129 host.
export AUTH_TARGET_URL="https://efcc-auth-<name>.efcc-ggc.workers.dev"
export AUTH_TEST_USERNAME="..."   # active account used for password login/logout
export AUTH_TEST_CREDENTIAL="..." # credential for that acceptance account
export AUTH_LEGACY_USERNAME="..." # imported account with requires_upgrade = 1
export AUTH_LEGACY_PIN="..."      # one-time legacy PIN for that account
export AUTH_NEW_CREDENTIAL="..."  # replacement credential used by the upgrade smoke

# 3. Run the authenticated auth-d1 pipeline
pnpm exec playwright test -c tests/e2e/auth-d1.config.ts

# 4. Append the executed-results table to the acceptance plan. Pass the
#    section heading and target URL explicitly so this D1 run's evidence gets
#    its own heading and cannot be overwritten by the legacy /exec or Next UI
#    runs (see "Acceptance evidence appender" below).
npx tsx tests/e2e/plan-doc-appender.ts \
  --plan=docs/omp-plans/2026-08-07-ui-04-release-stack.md \
  --results=test-results/auth-d1-results.json \
  --heading="## Executed results — D1 auth smoke" \
  --target-url="$AUTH_TARGET_URL"
```

The suite fails closed if `AUTH_TARGET_URL` or any of the five secrets is missing or malformed. This is the gate that produces deployment evidence for AUTH-01/02; without a fresh-deployment pass they remain not-READY.

## Rebuilt Next UI gate (deployed browser trace)

The rebuilt Next frontend gets its own executable browser gate — `tests/e2e/live-ui.config.ts` / `live-ui.test.ts` — because the legacy `/exec` suite drives the Apps Script iframe, not the rebuilt Next UI. It drives the real deployed frontend in a real browser and asserts observable DOM state only (login as Admin/Staff/Member, shell, Profile, Account Settings, the role-gated approval queue, and responsive states at 375x667). It never mocks the backend, never submits the registration form, and never decides real registrations — those would mutate target data or invent backend behavior.

```sh
# AUTH_UI_TARGET_URL is the deployed frontend root on the reserved
# efcc-auth-*.efcc-ggc.workers.dev acceptance host (the Next.js static export
# served by the Worker ASSETS binding) — never the legacy /exec URL.
export AUTH_UI_TARGET_URL="https://efcc-auth-<name>.efcc-ggc.workers.dev"
# The six PROGRAMS_* role fixtures (Admin/Staff/Member, all E2E_-prefixed)
# documented in .github/CI-SECRETS.md; the suite fails closed without them.
export PROGRAMS_ADMIN_USERNAME="..."
export PROGRAMS_ADMIN_CREDENTIAL="..."
export PROGRAMS_STAFF_USERNAME="..."
export PROGRAMS_STAFF_CREDENTIAL="..."
export PROGRAMS_MEMBER_USERNAME="..."
export PROGRAMS_MEMBER_CREDENTIAL="..."

pnpm exec playwright test -c tests/e2e/live-ui.config.ts
```

The config fails closed on a missing or non-HTTPS `AUTH_UI_TARGET_URL`, rejects embedded credentials, and rejects hosts outside the `efcc-auth-*` acceptance namespace (`AUTH_UI_ALLOW_LOCAL=1` opts into `http://localhost:*` for local development only). The test fails closed on any missing `PROGRAMS_*` variable or a non-`E2E_` username. `AUTH_UI_ALLOW_LOCAL` is never present in CI. The run produces `test-results/live-ui-results.json` for the appender.

## Acceptance evidence appender

`tests/e2e/plan-doc-appender.ts` appends a per-assertion pass/fail table to an acceptance plan doc. It takes `--plan <doc>`, `--results <json>`, `--heading <markdown heading>`, and `--target-url <url>`; the defaults are the Wave-1 values (`--plan=docs/specs/067-role-nav-acceptance-plan.md`, `--results=test-results/e2e-results.json`, heading `## Executed results`, target from `E2E_TARGET_URL`).

Each gate passes its own heading and target URL explicitly so two result artifacts cannot overwrite each other in the same plan doc. For example, the legacy `/exec` and rebuilt Next UI runs append to the release plan under distinct headings:

```sh
npx tsx tests/e2e/plan-doc-appender.ts \
  --plan=docs/omp-plans/2026-08-07-ui-04-release-stack.md \
  --results=test-results/e2e-results.json \
  --heading="## Executed results — Legacy /exec" \
  --target-url="$E2E_TARGET_URL"

npx tsx tests/e2e/plan-doc-appender.ts \
  --plan=docs/omp-plans/2026-08-07-ui-04-release-stack.md \
  --results=test-results/live-ui-results.json \
  --heading="## Executed results — Next UI" \
  --target-url="$AUTH_UI_TARGET_URL"
```

An existing section is replaced in place (terminated at the next heading of the same or higher level); a missing section is appended. The bare `pnpm test:e2e` → `posttest:e2e` wiring keeps the default behavior unchanged.

## Implemented-scope rule

Only implemented scenarios may run as passing acceptance coverage. The D1 auth smoke covers the implemented Worker `/api/v1/auth/*` surface; unfinished domain capabilities remain explicitly transitional or planned in the [migration roadmap](../../README.md#feature-roadmap) and linked to their follow-up spec or ticket.

## Expired sessions

CI fails loudly when a stored Google session expires. Recapture only the affected role with `pnpm e2e:auth -- --role=<alice|bob|noah>`, validate locally, base64-encode the replacement, and update that GitHub secret. No expiry classification or silent skip is used.

## Local shell responsive suite

A separate Playwright suite (`tests/e2e/responsive.config.ts`) covers the responsive and accessibility invariants of the local production shell (CF0-06 criteria 4–7). It is a deterministic PR check (the `shell-responsive` job in `precheck.yml`). Run it locally with:

```sh
pnpm test:shell-responsive
```

The suite builds the Next.js static export (`pnpm --dir web build`) and serves it locally on port 4173 via the zero-dependency static server in `tests/e2e/serve-static.ts`. Three viewport projects run the same checks: `mobile-375x812`, `mobile-375x667`, and `desktop-1280x800`. The `POST /api/v1/rpc` endpoint is stubbed in-browser through Playwright's `page.route` interceptor — `restoreApp` returns a full `Bootstrap` fixture and `authorizedNavigate` returns `{ authorized: true }`, so no `E2E_TARGET_URL`, no Google session state, and no HtmlService dependency is required to exercise the production route components. The `web/out` directory and the built assets are produced by the test run itself and remain ephemeral.
