import { defineConfig, devices } from "@playwright/test";

const targetUrl = process.env.E2E_TARGET_URL;

if (!targetUrl) {
  throw new Error("E2E_TARGET_URL is required");
}

// Accept either a Cloudflare Worker URL or an Apps Script /exec URL.
const isWorkerUrl =
  /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/u.test(targetUrl);
const isAppsScriptUrl =
  /^https:\/\/script\.google\.com\/macros\/s\/(?<deploymentId>AK[a-zA-Z0-9_-]+)\/exec$/u.test(
    targetUrl
  );

if (!isWorkerUrl && !isAppsScriptUrl) {
  throw new Error(
    "E2E_TARGET_URL must be a Cloudflare Worker URL or an Apps Script /exec URL"
  );
}

export default defineConfig({
  testDir: ".",
  testMatch: "worker-transport.test.ts",
  timeout: 30_000,
  retries: 1,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/worker-transport-results.json" }],
  ],
  use: {
    baseURL: targetUrl,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chrome",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
