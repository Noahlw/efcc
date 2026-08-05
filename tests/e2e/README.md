# Playwright end-to-end tests

The E2E suite is GitHub-tracked developer code under `tests/e2e/`, separate from the mocked Apps Script tests under `tests/gas/`. It is outside the `src/gas/` clasp root and is explicitly ignored by `.claspignore`; it is never uploaded as production Apps Script source.

## Test ownership (deployed vs local)

There are three independent Playwright configurations plus a Vitest unit suite under this directory. They share a tree but must NEVER cross loaders, so the rules below are explicit:

| File / config | Loader | Owned by | What it runs |
| --- | --- | --- | --- |
| `tests/e2e/auth-d1.config.ts` (`pnpm exec playwright test --config=tests/e2e/auth-d1.config.ts`) | Playwright request context | CI `.github/workflows/e2e.yml` manual deployed D1 auth smoke | The rebuilt Worker `/api/auth/*` login/upgrade/logout boundary against an isolated HTTPS Worker target. It uses acceptance account secrets, not Google storage state. Only `auth-d1.test.ts` runs here. |
| `tests/e2e/playwright.config.ts` (`pnpm test:e2e`) | Playwright | Legacy/manual only | Retained Apps Script `/exec` role-navigation specs using `alice` / `bob` / `noah` storage states. This is not the rebuilt D1 login gate and is not invoked by the current PR workflows. |
| `tests/e2e/responsive.config.ts` (`pnpm test:shell-responsive`) | Playwright | CI `precheck.yml` `shell-responsive` job (deterministic) | `responsive.test.ts` only — local production-shell static export served by `tests/e2e/serve-static.ts` on `127.0.0.1:4173`, in two viewport projects (`mobile-375x812`, `desktop-1280x800`). No `E2E_TARGET_URL`, no storage state, no HtmlService. |
| `tests/e2e/lib/deploy-acceptance.test.ts` | Vitest | Unit checks (`pnpm exec vitest run tests/e2e/lib/deploy-acceptance.test.ts`) | Vitest unit tests for the deploy CLI helper (`buildDeployPlan` / `buildExecUrl` / `validateExecUrl`). MUST NOT be loaded by Playwright — `import { describe, test } from "vitest"` outside the vitest runtime crashes with `Vitest failed to access its internal state` (verified on PR #166 run #30987198373). |

The deployed configs enforce positive `testMatch` filters so the Vitest helper, legacy Apps Script specs, and local-only static-shell spec never cross loaders. The Vitest helper file is intentionally absent from all Playwright configs.

When adding a new test file under `tests/e2e/`, place it in exactly one of the four rows above. If you need a new Playwright file in the retained Apps Script suite, append it to the legacy specs list above AND confirm `pnpm exec playwright test --list --config=tests/e2e/playwright.config.ts` lists it (currently 54 entries = 18 tests × 3 storage-state projects; new specs multiply the same way). For a new D1 auth smoke, append it to `auth-d1.config.ts`; for a new local static-shell spec, append it to `responsive.config.ts` only.

## Target and data boundary

The rebuilt D1 auth smoke runs only against an isolated, versioned HTTPS Worker deployment backed by a disposable acceptance D1 database. It requires `AUTH_TARGET_URL` plus five acceptance-account secrets and never targets the production database. The login and upgrade requests mutate only those disposable accounts.

The retained Apps Script suite has a separate legacy target and Google storage-state boundary. It is not part of the current D1 PR gate and must not be described as D1 auth coverage.

Set the legacy target locally only when running the retained Apps Script suite:

```sh
export E2E_TARGET_URL="https://script.google.com/macros/s/AKfycbz1aLqfh-DoDqky-KYeLL-mx1uyVDzHXykzyyA8kWmHzXYY7FZDmt5nsKdMM-lhMdHL/exec"
```

The ID is pinned in `playwright.config.ts`, so a mismatched or malformed URL fails before the legacy suite launches. For the rebuilt Worker smoke, set `AUTH_TARGET_URL` and the five acceptance-account environment variables documented in `.github/CI-SECRETS.md`.

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

## Implemented-scope rule

Only implemented scenarios may run as passing acceptance coverage. The D1 auth smoke covers the implemented Worker `/api/auth/*` surface only; the browser UI still uses the retained legacy `/api/v1/rpc` path and is not claimed as D1 login coverage. Unfinished acceptance criteria remain explicitly skipped and linked to their follow-up spec or ticket.

## Expired sessions

CI fails loudly when a stored Google session expires. Recapture only the affected role with `pnpm e2e:auth -- --role=<alice|bob|noah>`, validate locally, base64-encode the replacement, and update that GitHub secret. No expiry classification or silent skip is used.

## Local shell responsive suite

A separate Playwright suite (`tests/e2e/responsive.config.ts`) covers the responsive and accessibility invariants of the local production shell (CF0-06 criteria 4–7). It is a deterministic PR check (the `shell-responsive` job in `precheck.yml`). Run it locally with:

```sh
pnpm test:shell-responsive
```

The suite builds the Next.js static export (`pnpm --dir web build`) and serves it locally on port 4173 via the zero-dependency static server in `tests/e2e/serve-static.ts`. Two viewport projects run the same seven checks: `mobile-375x812` and `desktop-1280x800`. The `POST /api/v1/rpc` endpoint is stubbed in-browser through Playwright's `page.route` interceptor — `restoreApp` returns a full `Bootstrap` fixture and `authorizedNavigate` returns `{ authorized: true }`, so no `E2E_TARGET_URL`, no Google session state, and no HtmlService dependency is required to exercise the production route components. The `web/out` directory and the built assets are produced by the test run itself and remain ephemeral.
