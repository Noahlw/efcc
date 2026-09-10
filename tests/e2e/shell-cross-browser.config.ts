// Representative T11 shell qualification: only the phone and desktop
// transition widths in Firefox and WebKit. Full W7 remains Chromium-only.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: /shell-geometry\.test\.ts$/u,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    [
      "json",
      { outputFile: "test-results/t11-shell-cross-browser/results.json" },
    ],
  ],
  use: {
    baseURL: "http://127.0.0.1:4173",
    // Shell geometry evidence is numeric only; keep this qualification aligned
    // with the primary runner's no-image evidence contract.
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "w-390-firefox",
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "w-800-firefox",
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 800, height: 900 },
      },
    },
    {
      name: "w-390-webkit",
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "w-800-webkit",
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 800, height: 900 },
      },
    },
  ],
  webServer: {
    command: "pnpm --dir ../../web build && pnpm exec tsx serve-static.ts",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
