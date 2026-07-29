# CI Secrets — E2E Playwright Pipeline

The `.github/workflows/e2e.yml` pipeline runs Playwright against a live Apps Script `/exec` deployment. It requires these GitHub repository secrets and variables. **Copy this file to your own notes; fill in the values for your deployment; then add them in the GitHub repo UI under Settings → Secrets and variables.**

## Secrets

| Secret name | How to create |
| --- | --- |
| `ALICE_STORAGE_STATE` | Run `pnpm e2e:auth -- --role=alice` locally, then `base64 -i .auth/alice.storage.json \| pbcopy` |
| `BOB_STORAGE_STATE` | Same, with `--role=bob` |
| `NOAH_STORAGE_STATE` | Same, with `--role=noah` |

The storage-state files contain live Google session cookies. Never paste the decoded JSON into issues, PRs, or chat logs. The base64 encoding preserves the exact bytes through GitHub's secret transport.

## Variable

| Variable name | Value |
| --- | --- |
| `E2E_TARGET_URL` | The current deployed `/exec` URL, e.g. `https://script.google.com/macros/s/<deployment-id>/exec` |

Find this after running `clasp deploy`. Every new deployment ID rotates the URL — update this variable whenever you redeploy.

## Verify

After setting all four, push any commit. The `E2E (Playwright)` workflow runs on every push and will decode the secrets, run the Playwright role-matrix spec, and append results to `docs/specs/067-role-nav-acceptance-plan.md`.

The workflow is fail-loud: a missing or expired secret turns CI red with a diagnostic message. See `tests/e2e/README.md` and `docs/adr/0012-e2e-testing-strategy.md` for the full onboarding guide.
