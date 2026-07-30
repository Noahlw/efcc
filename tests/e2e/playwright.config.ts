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
