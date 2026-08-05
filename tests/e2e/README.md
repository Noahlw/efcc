# Playwright end-to-end tests

The E2E suite is GitHub-tracked developer code under `tests/e2e/`, separate from the mocked Apps Script tests under `tests/gas/`. It is outside the `src/gas/` clasp root and is explicitly ignored by `.claspignore`; it is never uploaded as production Apps Script source.

## Target and data boundary

E2E runs against the existing DEV Apps Script deployment and the existing DEV spreadsheet. The Playwright configuration rejects any `/exec` URL other than the approved DEV deployment ID. Current scenarios are read-only with respect to spreadsheet business data; the demo form scenario uses its existing client-side test path. Do not add a backend-writing scenario without a new approved isolation decision.

Set the target locally:

```sh
export E2E_TARGET_URL="https://script.google.com/macros/s/AKfycbz1aLqfh-DoDqky-KYeLL-mx1uyVDzHXykzyyA8kWmHzXYY7FZDmt5nsKdMM-lhMdHL/exec"
```

The ID is pinned in `playwright.config.ts`, so a mismatched or malformed URL fails before tests launch.

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

`.github/workflows/e2e.yml` is the deployed `/exec` acceptance gate. It runs on pushes and pull requests targeting `main` or `master`, plus `workflow_dispatch` (so an operator can re-run it right after a fresh deployment). It is **fail-closed**: before decoding anything it validates `E2E_TARGET_URL` (repo `vars`) and the three storage-state secrets (`ALICE`/`BOB`/`NOAH_STORAGE_STATE`), and fails with an explicit message — never a green result — if any is missing, empty, or not a valid `/exec` URL. Only then does it decode the states to `.auth/*.storage.json` and run Playwright against the deployed URL. The workflow then appends the generated JSON results to the acceptance plan (`docs/specs/067-role-nav-acceptance-plan.md`) and uploads `test-results/` plus the plan document as short-lived evidence.

It never creates or deletes an Apps Script deployment, so it exercises whichever `/exec` URL is pinned in `E2E_TARGET_URL`. A **fresh** deployed `/exec` smoke (AGENTS.md Headless-Gate) additionally requires an operator to rotate a new versioned deployment and update the pinned ID + variable together (see `.github/CI-SECRETS.md`); until then the gate reports the currently-deployed version only and the AUTH-01/02/03 tickets stay not-READY.

The deterministic PR checks (typecheck + unit/component tests) live in `.github/workflows/precheck.yml` and need no secrets or deployment.

## Implemented-scope rule

Only implemented scenarios may run as passing acceptance coverage. Unfinished acceptance criteria remain explicitly skipped and linked to their follow-up spec or ticket; they must not be described as passed because the current role matrix is green. The governing acceptance plan is `docs/specs/067-role-nav-acceptance-plan.md`, and the generated `Executed results` section is written by the pipeline appender.

## Expired sessions

CI fails loudly when a stored Google session expires. Recapture only the affected role with `pnpm e2e:auth -- --role=<alice|bob|noah>`, validate locally, base64-encode the replacement, and update that GitHub secret. No expiry classification or silent skip is used.

## Local shell responsive suite

A separate Playwright suite (`tests/e2e/responsive.config.ts`) covers the responsive and accessibility invariants of the local production shell (CF0-06 criteria 4–7). Run it with:

```sh
pnpm test:shell-responsive
```

The suite builds the Next.js static export (`pnpm --dir web build`) and serves it locally on port 4173 via the zero-dependency static server in `tests/e2e/serve-static.ts`. Two viewport projects run the same seven checks: `mobile-375x812` and `desktop-1280x800`. The `POST /api/v1/rpc` endpoint is stubbed in-browser through Playwright's `page.route` interceptor — `restoreApp` returns a full `Bootstrap` fixture and `authorizedNavigate` returns `{ authorized: true }`, so no `E2E_TARGET_URL`, no Google session state, and no HtmlService dependency is required to exercise the production route components. The `web/out` directory and the built assets are produced by the test run itself and remain ephemeral.
