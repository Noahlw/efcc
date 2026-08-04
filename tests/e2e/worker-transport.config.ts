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
  // 60s: the client retries 502/503 (ADR-0018 §6, up to 3 attempts with
  // exponential backoff) when the upstream intermittently returns a
  // non-JSON response; the retry-heavy login/restore path needs headroom.
  timeout: 60_000,
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
