// Local-shell responsive Playwright suite (CF0-06 criteria 4-7).
// Separate from the GAS playwright.config.ts so this suite never depends
// on E2E_TARGET_URL, storage state, or HtmlService. Builds the Next.js
// static export on demand and serves it via tests/e2e/serve-static.ts.
//
// Paths in `webServer.command` are resolved relative to the testDir cwd
// (tests/e2e/), so `../../web` reaches the workspace root.

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: /responsive\.test\.ts$/u,
  timeout: 30_000,
  retries: 1,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile-375x812",
      use: { viewport: { width: 375, height: 812 } },
    },
    {
      name: "desktop-1280x800",
      use: { viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: "pnpm --dir ../../web build && pnpm exec tsx serve-static.ts",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
