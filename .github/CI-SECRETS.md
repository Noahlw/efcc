# CI credentials — DEployed /exec acceptance gate

The deployed acceptance gate (`.github/workflows/e2e.yml`) runs Playwright against a _deployed_ Apps Script `/exec` URL using three Google session states. It does not create a project, deployment, or spreadsheet, and it does not write business data to the DEV spreadsheet.

## How the gate behaves

- **Deterministic PR checks** (`.github/workflows/precheck.yml`) need no secrets and no deployment: root typecheck + GAS/prototype unit tests, web typecheck, web workerd/auth/mirror tests, and web component (incl. landing-page contract) tests. These are the mergeable status checks.
- **The deployed `/exec` acceptance gate** (`e2e.yml`) is **fail-closed**: if any prerequisite below is missing it fails with an explicit message — it never decodes empty secrets, never runs against an empty URL, and never degrades to a green result. A missing deployment proof must never look like a pass.
- The gate does **not** deploy. It exercises whichever `/exec` URL is pinned in `E2E_TARGET_URL`. A **fresh** deployed `/exec` smoke (AGENTS.md Headless-Gate) additionally requires the operator to push + version + redeploy and rotate the pinned ID and `E2E_TARGET_URL` together (below). Until that rotation, the gate reports the currently-deployed version only, and the AUTH-01/02/03 tickets stay not-READY (see `docs/specs/075-auth-d1-foundation-acceptance-plan.md`).

## Repository secrets

Configure these three secrets under GitHub Settings → Secrets and variables → Actions:

- `ALICE_STORAGE_STATE`
- `BOB_STORAGE_STATE`
- `NOAH_STORAGE_STATE`

Each value is the base64 encoding of the complete local storage-state file:

```sh
base64 < .auth/alice.storage.json | tr -d '\n'
```

The files contain live Google session cookies. Never print, commit, upload, or paste decoded storage-state JSON into issues, pull requests, or chat. If any secret is missing when the gate runs, the gate fails closed with a message naming the missing secret.

## Repository variable

Configure `E2E_TARGET_URL` as the approved DEV URL:

```text
https://script.google.com/macros/s/AKfycbz1aLqfh-DoDqky-KYeLL-mx1uyVDzHXykzyyA8kWmHzXYY7FZDmt5nsKdMM-lhMdHL/exec
```

`tests/e2e/playwright.config.ts` checks this exact deployment ID before Playwright starts. A different URL fails closed.

## Fresh deployment rotation

The AGENTS.md Headless-Gate requires a **fresh** deployed `/exec` smoke before a login-scoped ticket is READY. `e2e.yml` cannot create a deployment, so the operator must do the rotation and then re-run the gate:

1. `clasp push --force` + `clasp version <sha>` + `clasp redeploy <deploymentId> <version> …` to rotate the DEV deployment to the new commit.
2. Update the pinned deployment ID in `tests/e2e/playwright.config.ts` **and** `E2E_TARGET_URL` together.
3. Re-run the deployed acceptance gate (push to the branch or `workflow_dispatch`).

Until steps 1–3 complete, the deployed acceptance gate reflects the **previous** deployment, and the fresh-smoke acceptance criterion is **blocked** — it must not be reported as passed.
