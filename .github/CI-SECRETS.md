# CI credentials — DEV Apps Script E2E

The E2E workflow runs Playwright against the existing DEV Apps Script `/exec` deployment. It does not create a project, deployment, or spreadsheet, and it does not write business data to the DEV spreadsheet.

## Repository secrets

Configure these three secrets under GitHub Settings → Secrets and variables → Actions:

- `ALICE_STORAGE_STATE`
- `BOB_STORAGE_STATE`
- `NOAH_STORAGE_STATE`

Each value is the base64 encoding of the complete local storage-state file:

```sh
base64 < .auth/alice.storage.json | tr -d '\n'
```

The files contain live Google session cookies. Never print, commit, upload, or paste decoded storage-state JSON into issues, pull requests, or chat.

## Repository variable

Configure `E2E_TARGET_URL` as the approved DEV URL:

```text
https://script.google.com/macros/s/AKfycbz1aLqfh-DoDqky-KYeLL-mx1uyVDzHXykzyyA8kWmHzXYY7FZDmt5nsKdMM-lhMdHL/exec
```

`tests/e2e/playwright.config.ts` checks this exact deployment ID before Playwright starts. A different URL fails closed.

When a DEV deployment is intentionally rotated, update the pinned ID in the Playwright config and this variable together, then run the fresh `/exec` acceptance plan before treating CI as authoritative.
