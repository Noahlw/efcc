/**
 * Playwright config — per ADR-0012 (docs/adr/0012-e2e-testing-strategy.md).
 *
 * Three named projects, one per EFCC test role, each loading its own
 * persisted Google-session storage state so post-login RPC calls
 * (google.script.run via the Apps Script iframe) work against an
 * executeAs: USER_DEPLOYING deployment that requires a real session cookie.
 *
 * Storage states are generated out-of-band by `npm run e2e:auth -- --role=<role>`
 * (the sibling `tests/e2e/auth.ts` task builds that script in the next wave).
 *
 * baseURL MUST come from the E2E_TARGET_URL env var — never hardcoded. The
 * Apps Script /exec URL changes on every redeploy, and a hardcoded URL here
 * would silently rot the moment the deployment ID rotates. CI sets this from
 * a GitHub Actions repo variable/secret; local runs export it manually or via
 * a gitignored .env file (see .gitignore — `.env` + `.auth/`).
 */
import { defineConfig, devices } from "@playwright/test";

const { E2E_TARGET_URL } = process.env;
if (!E2E_TARGET_URL) {
  throw new Error(
    "E2E_TARGET_URL is not set. Export the deployed Apps Script /exec URL " +
      "before running Playwright (CI: repo variable/secret; local: " +
      "`export E2E_TARGET_URL=https://script.google.com/.../exec`)."
  );
}

export default defineConfig({
  // Colocated inside tests/e2e/ so `npx playwright test` from this directory —
  // or via the `test:e2e` npm script — naturally scopes to E2E specs only and
  // never reaches the vitest-runner tests/gas/ directory.
  testDir: ".",

  // Default to ~30s per test; Google auth roundtrips + Apps Script RPC calls
  // are noticeably slower than typical web-app latency.
  timeout: 30_000,

  // One retry shields against transient Google sign-in / network flakes that
  // we cannot eliminate from the test environment. Per the ADR, expiry of a
  // role's storage state fails loud (not silently) — this retry covers
  // blips, not full session expiration.
  retries: 1,

  // Sequential by default. Three roles share one deployed Apps Script
  // invocation quota; running them in parallel would be a polite way to
  // hammer the quota and trigger rate limits.
  fullyParallel: false,
  workers: 1,

  // `list` for human-readable local runs + `json` for machine-readable
  // artifacts the acceptance-plan appender consumes.
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/e2e-results.json" }],
  ],

  use: {
    baseURL: E2E_TARGET_URL,
    trace: "retain-on-failure",
  },

  projects: [
    {
      name: "alice",
      use: {
        ...devices["Desktop Chrome"],
        storageState: ".auth/alice.storage.json",
      },
    },
    {
      name: "bob",
      use: {
        ...devices["Desktop Chrome"],
        storageState: ".auth/bob.storage.json",
      },
    },
    {
      name: "noah",
      use: {
        ...devices["Desktop Chrome"],
        storageState: ".auth/noah.storage.json",
      },
    },
  ],
});
