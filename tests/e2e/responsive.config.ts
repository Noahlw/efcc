// Local-shell responsive Playwright suite (CF0-06 criteria 4-7).
// This suite never depends on a remote target, storage state, or HtmlService.
// It builds the Next.js static export on demand and serves it via
// tests/e2e/serve-static.ts.
//
// Paths in `webServer.command` are resolved relative to the testDir cwd
// (tests/e2e/), so `../../apps/web` reaches the workspace directory.

import { defineConfig } from "@playwright/test";

const responsivePort = process.env.RESPONSIVE_TEST_PORT ?? "4173";
const responsiveUrl = `http://127.0.0.1:${responsivePort}`;

export default defineConfig({
  testDir: ".",
  testMatch: /(?:responsive|shell-nav|account-settings|home)\.test\.ts$/u,
  timeout: 30_000,
  retries: 1,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/phase-f/responsive/results.json" }],
  ],
  outputDir: "test-results/phase-f/responsive/artifacts",
  metadata: { phaseFTargetUrl: responsiveUrl },
  use: {
    baseURL: responsiveUrl,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "mobile-375x812",
      use: { viewport: { width: 375, height: 812 } },
    },
    {
      name: "mobile-375x667",
      use: { viewport: { width: 375, height: 667 } },
    },
    {
      name: "desktop-1280x800",
      use: { viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: "pnpm exec tsx serve-static.ts",
    url: responsiveUrl,
    env: { PORT: responsivePort },
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
