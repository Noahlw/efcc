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
  // Only the top-level *.test.ts files are Playwright scenarios
  // (role-matrix, form-protection, nested-task-navigation). `lib/` holds
  // Vitest unit tests - e.g. deploy-acceptance.test.ts does
  // `import { describe, test } from "vitest"`. Playwright's default
  // `**/*.test.ts` match discovers that file, loads the vitest import at
  // module-eval time outside a vitest worker, and crashes with
  // "Vitest failed to access its internal state". `*.test.ts` (no `**`)
  // matches only top-level files because `*` does not cross `/`, so the
  // `lib/` Vitest tests are never loaded by Playwright.
  // Only top-level *.test.ts are Playwright scenarios. `lib/` holds a
  // Vitest unit test (deploy-acceptance.test.ts imports from "vitest");
  // Playwright's default `**/*.test.ts` loads it at module-eval time
  // outside a vitest worker and crashes ("Vitest failed to access its
  // internal state"). This regex matches any .test.ts whose path does
  // NOT contain `lib/` (testMatch filters pre-load, confirmed empirically).
  testMatch: /^(?!.*lib\/).*\.test\.ts$/u,
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
