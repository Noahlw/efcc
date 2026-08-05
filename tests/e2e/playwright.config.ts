import { defineConfig, devices } from "@playwright/test";

const targetUrl = process.env.E2E_TARGET_URL;

if (!targetUrl) {
  throw new Error("E2E_TARGET_URL is required");
}

const deploymentMatch = targetUrl.match(
  /^https:\/\/script\.google\.com\/macros\/s\/(?<deploymentId>AK[a-zA-Z0-9_-]+)\/exec$/u
);
if (!deploymentMatch) {
  throw new Error("E2E_TARGET_URL must be a Google Apps Script /exec URL");
}

export default defineConfig({
  testDir: ".",
  // Deployed /exec acceptance config. Drives real browser specs against the
  // pinned GAS /exec URL using three role-based storage-state projects
  // (alice / bob / noah). All non-browser specs must be excluded here:
  //   - tests/e2e/lib/** holds Vitest unit tests for the deploy CLI helper
  //     (lib/deploy-acceptance.test.ts). Importing `vitest` outside the
  //     vitest runtime crashes Playwright with
  //     "Vitest failed to access its internal state" (verified empirically
  //     on PR #166 run #30987198373).
  //   - tests/e2e/responsive.test.ts is the local-only static-shell suite
  //     served by tests/e2e/serve-static.ts under responsive.config.ts (the
  //     deterministic `shell-responsive` precheck job). It needs no
  //     E2E_TARGET_URL, no storage state, and no HtmlService — running it
  //     here would try to navigate to the deployed GAS URL and fail.
  testIgnore: ["**/lib/**", "**/responsive.test.ts"],
  timeout: 30_000,
  retries: 1,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/e2e-results.json" }],
  ],
  use: {
    baseURL: targetUrl,
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
