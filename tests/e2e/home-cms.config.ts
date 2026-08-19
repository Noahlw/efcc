import { defineConfig, devices } from "@playwright/test";

const DEFAULT_TARGET_URL = "http://127.0.0.1:8787";
const targetUrl = process.env.PROGRAMS_TARGET_URL ?? DEFAULT_TARGET_URL;

export default defineConfig({
  testDir: ".",
  testMatch: ["**/home-cms.test.ts"],
  timeout: 45_000,
  retries: 1,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/home-cms-results.json" }],
  ],
  use: {
    baseURL: targetUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
});
