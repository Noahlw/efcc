// Pinned Chromium geometry suite for the Authenticated Shell (TK-09).
// Runs against the static export served by tests/e2e/serve-static.ts; the
// /api/v1/auth/* cookie boundary is stubbed in-browser (same pattern as the
// responsive suite). Proves shell critical anchors at 320, 390, 600, 799,
// 800, 1024, and 1440 CSS px with no horizontal overflow and no obstruction
// of the shell chrome. Numeric CSS-pixel evidence only — no screenshots.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  metadata: { phaseFTargetUrl: "http://127.0.0.1:4173" },
  testDir: ".",
  testMatch: /shell-geometry\.test\.ts$/u,
  timeout: 30_000,
  retries: 1,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile: "test-results/phase-f/shell-geometry/results.json",
      },
    ],
  ],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    { name: "w-320", use: { viewport: { width: 320, height: 844 } } },
    { name: "w-390", use: { viewport: { width: 390, height: 844 } } },
    { name: "w-600", use: { viewport: { width: 600, height: 844 } } },
    { name: "w-799", use: { viewport: { width: 799, height: 900 } } },
    { name: "w-800", use: { viewport: { width: 800, height: 900 } } },
    { name: "w-1024", use: { viewport: { width: 1024, height: 900 } } },
    { name: "w-1440", use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: "pnpm --dir ../../web build && pnpm exec tsx serve-static.ts",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
