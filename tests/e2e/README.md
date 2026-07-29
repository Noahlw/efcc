# `tests/e2e/` — Playwright end-to-end pipeline

Post-login acceptance runs against the deployed Apps Script `/exec` URL. Lives next to `tests/gas/` (vitest vm-harness unit tests against mocked Apps Script globals) but is intentionally a separate surface — see ADR-0012 for the full rationale.

Auth model: one persisted Google-session storage state per test role (`alice`, `bob`, `noah`), generated locally and uploaded to CI as three separate repo secrets. Per-role storage state is the standard Playwright pattern for Google-authenticated apps under `executeAs: USER_DEPLOYING`.

## Workflow

1. **Set the target URL** (changes on every redeploy — never hardcoded):

   ```sh
   export E2E_TARGET_URL=https://script.google.com/macros/s/<id>/exec
   ```

   Or drop it in a gitignored `.env` and source it from your shell rc.

2. **Regenerate a role's storage state** when its session cookie expires (the `npm test:e2e` run will tell you which role failed):

   ```sh
   npm run e2e:auth -- --role=alice   # repeat for bob / noah
   ```

   The script lives at `tests/e2e/auth.ts` (sibling task in next wave); you'll see a headful browser pop open, sign in with that role's Google account, then dismiss when the EFCC login form is reachable.

3. **Run the suite**:
   ```sh
   npm run test:e2e
   ```
   Sequential by design — see ADR-0012 §Decision-1 / item 5.

## Where this lives in CI

`test:e2e` is a separate on-push GitHub Actions job (per ADR-0012 Decision #5), not folded into the default `npm test` used for the everyday dev loop. Run locally before pushing if you want a green badge on first try.

Full design rationale, alternatives considered, and security boundaries: **`docs/adr/0012-e2e-testing-strategy.md`**.
