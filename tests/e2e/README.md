# Playwright end-to-end tests

Post-login acceptance tests run against a deployed Google Apps Script `/exec` URL. This suite is separate from the mocked Apps Script tests in `tests/gas/`; see `docs/adr/0012-e2e-testing-strategy.md` for the design and security boundaries.

## TL;DR first-time setup

From the repository root:

1. Install the locked dependencies: `pnpm install`.
2. Install Chromium: `playwright install chromium`.
3. Export the current development deployment URL: `export E2E_TARGET_URL="https://script.google.com/macros/s/<deployment-id>/exec"`.
4. Capture Google sessions for all three roles, signing in with the correct Google account each time:
   ```sh
   pnpm e2e:auth -- --role=alice
   pnpm e2e:auth -- --role=bob
   pnpm e2e:auth -- --role=noah
   ```
5. Run the suite: `pnpm test:e2e`.

The capture commands create `.auth/alice.storage.json`, `.auth/bob.storage.json`, and `.auth/noah.storage.json`. These files contain live session cookies, are ignored by Git, and must never be committed or shared as ordinary files.

## Detailed workflow

### 1. Set the target URL

`E2E_TARGET_URL` must be the current deployed Apps Script `/exec` URL. It is deliberately not hardcoded because deployment IDs can rotate:

```sh
export E2E_TARGET_URL="https://script.google.com/macros/s/<deployment-id>/exec"
```

A local `.env` file is gitignored, but no script in this repository automatically loads it; export or source it in your shell before running the commands.

### 2. Generate each role's storage state

Run `pnpm e2e:auth -- --role=<alice|bob|noah>` from the repository root. `tests/e2e/auth.ts` opens visible Chromium because Google sign-in must be completed by a person. Sign in with the Google account bound to that role, wait for the EFCC username/PIN form to load, and do **not** enter the EFCC credentials. The script captures the outer browser context after `#app[data-app-state="SIGNED_OUT"]` appears and writes `.auth/<role>.storage.json`.

The Google account session and the EFCC application login are different layers. During the test, `tests/e2e/role-matrix.test.ts` enters the application credentials for the selected Playwright project.

### 3. Run the suite

```sh
pnpm test:e2e
```

`tests/e2e/playwright.config.ts` defines the `alice`, `bob`, and `noah` projects and loads their corresponding `.auth/*.storage.json` files. The suite runs sequentially with one worker, and the JSON reporter writes `test-results/e2e-results.json`. For local convenience, a successful `pnpm test:e2e` invokes the `posttest:e2e` npm hook, which runs `plan-doc-appender.ts` and upserts an `## Executed results` section into the default plan doc `docs/specs/067-role-nav-acceptance-plan.md`. pnpm skips the post-hook when the main script fails. CI therefore invokes `npx playwright test --config=tests/e2e/playwright.config.ts` directly (without the pnpm post-hook), then runs the appender in a separate `if: always() && hashFiles('test-results/e2e-results.json') != ''` step. If you invoke `npx playwright test --config=tests/e2e/playwright.config.ts` manually outside CI, the post-hook is also bypassed; run `tsx tests/e2e/plan-doc-appender.ts` yourself to update the default plan doc, or add `--plan <other-path>` to target another plan doc.

### 4. When a captured session expires

A captured storage state is reusable across runs until its underlying Google session cookie expires. Expiry is not guaranteed for a fixed duration: an actively used session may last weeks to months, while an idle session may expire in days. Treat it as reusable until a run fails, not as having a promised lifetime.

CI fails loudly rather than skipping an affected role. Re-run `pnpm e2e:auth -- --role=<role>` for that role, confirm the local run, base64-encode the replacement file, and update the matching repository secret. Do not print or paste decoded storage-state JSON into logs or issues.

### 5. Inspect the synthetic examples

The structure and transport encoding are demonstrated safely under `.auth/.example/`. See [Synthetic example files](#synthetic-example-files) before preparing CI values. These examples cannot authenticate and must not be copied over `.auth/<role>.storage.json`.

## CI secrets table

The workflow at `.github/workflows/e2e.yml` expects these case-sensitive repository values:

| Repository value | GitHub kind | Exact content / encoding |
| --- | --- | --- |
| `ALICE_STORAGE_STATE` | Actions secret | Base64 of the complete bytes of `.auth/alice.storage.json` |
| `BOB_STORAGE_STATE` | Actions secret | Base64 of the complete bytes of `.auth/bob.storage.json` |
| `NOAH_STORAGE_STATE` | Actions secret | Base64 of the complete bytes of `.auth/noah.storage.json` |
| `E2E_TARGET_URL` | Actions variable | Plain-text deployed Apps Script `/exec` URL; **not** base64 and not a secret |

For example, encode a real local state without emitting decoded JSON:

```sh
base64 < .auth/alice.storage.json | tr -d '\n'
```

Store the resulting single-line string in the appropriate GitHub Actions secret. CI uses `base64 -d` to reconstruct `.auth/<role>.storage.json`. Repeat independently for each role so one expired session can be rotated without changing the other two.

## Synthetic example files

`.auth/.example/` is the committed onboarding fixture directory:

- `alice.storage.json`, `bob.storage.json`, and `noah.storage.json` contain the same unmistakably synthetic JSON placeholder.
- Their `.b64` siblings contain the exact base64 encoding of those placeholder bytes.
- `E2E_TARGET_URL.example` contains a synthetic URL-shaped text value.

The real `.auth/*` files remain gitignored, while `.gitignore` explicitly re-allows only `.auth/.example/` and its descendants. This path mismatch is intentional: real runtime state lives at `.auth/<role>.storage.json`; examples live one level deeper. The JSON is deliberately not a Playwright `storageState` cookie/origin shape, so accidental use fails fast instead of resembling valid authentication material.

To verify the demonstrated encoding locally:

```sh
base64 -d < .auth/.example/alice.storage.json.b64
```

The decoded output must match `.auth/.example/alice.storage.json`; it still cannot authenticate.

## Local development without real auth

Real login-gated checks require the Playwright pipeline and valid per-role Google storage states. Do not substitute mocked local storage or a stateless headless login: that would bypass the real Apps Script RPC authentication boundary.

For cold-start and no-login checks, `AGENTS.md` permits the Orca `browser` tool against the deployed `/exec` URL. Use it to observe `SIGNED_OUT`, the login form, CSS/layout behavior, mobile navigation visibility, and scroll locking. Orca is also suitable for one-off pipeline debugging, but it is not a substitute for Playwright once a check crosses the login boundary because a stateless browser cannot pass the Google session requirement for `google.script.run`.

## What's NOT in the pipeline

The current `tests/e2e/role-matrix.test.ts` covers MEMBER (`alice`), STAFF (`bob`), and ADMIN (`noah`) navigation on the configured phone/desktop paths, active-section state, and the negative half of forbidden navigation. These issue #67 criteria remain deferred:

- **AC #3 — Program Leader navigation:** no Program Leader Playwright project or controlled `Program_Leaders` sheet assignment exists in this pipeline.
- **AC #8 — positive forbidden recovery:** the test proves unauthorized MEMBER controls are absent, but it cannot invoke the private IIFE-scoped `navigateTo_` to assert the visible `無法存取` view, `返回` button, and recovery destination without a production test hook.
- **AC #9 — direct protected RPC rejection:** the five Section RPCs are not implemented; the follow-up contract is `docs/specs/067-follow-up-section-rpcs.md`.
- **AC #10 — authorization refresh after a sheet-side role/leadership change:** this requires controlled sheet mutation and validation that visible navigation refreshes and a now-forbidden active Section is invalidated. Automatic sheet mutation is prohibited by `AGENTS.md`.

These gaps must not be reported as passed merely because the current role-matrix suite is green.

## CI behavior summary

`.github/workflows/e2e.yml` runs on every push using Node 20. It installs dependencies with `pnpm install`, installs Chromium with system dependencies, decodes the three secrets into `.auth/*.storage.json`, and invokes `npx playwright test --config=tests/e2e/playwright.config.ts` with the repository variable `E2E_TARGET_URL`. Unlike the local `pnpm test:e2e` path, this direct `npx` invocation does not trigger the pnpm post-hook or double-fire the appender.

The workflow instead has an explicit `if: always() && hashFiles('test-results/e2e-results.json') != ''` appender step. It runs after either a passing or failing Playwright run whenever the JSON report exists; if Playwright produced no report, there is nothing to append and the step is skipped. Appender errors fail loudly: a non-zero exit makes CI red and is not masked. The Playwright config uses one worker, disables full parallelism, retries each test once for transient network/sign-in blips, retains traces on failure, and emits list plus JSON reports. CI prints an expiry hint on failure and uploads `test-results/` together with the modified plan doc as `playwright-e2e-results` for 14 days. The ephemeral runner is destroyed after the job, and `.auth/` is outside the uploaded artifact path.

## File map

| Path | Purpose |
| --- | --- |
| `tests/e2e/README.md` | This setup, rotation, CI, and scope guide |
| `tests/e2e/auth.ts` | Headful per-role Google session capture |
| `tests/e2e/playwright.config.ts` | Target URL, reporters, and three role projects |
| `tests/e2e/role-matrix.test.ts` | Deployed role-navigation acceptance assertions |
| `tests/e2e/plan-doc-appender.ts` | Converts the JSON report into executed-plan Markdown |
| `tests/e2e/tsconfig.json` | TypeScript settings for the E2E surface |
| `.auth/<role>.storage.json` | Real, local, gitignored authentication state |
| `.auth/.example/` | Committed, synthetic, non-functional onboarding examples |
| `.github/workflows/e2e.yml` | Every-push CI job and secret decoding |
| `docs/adr/0012-e2e-testing-strategy.md` | Governing E2E architecture decision |
| `docs/specs/067-role-nav-acceptance-plan.md` | Acceptance plan and generated executed results |
| `docs/specs/067-follow-up-section-rpcs.md` | Deferred AC #9 contract |
