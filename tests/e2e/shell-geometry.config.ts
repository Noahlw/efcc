// Pinned Chromium geometry suite for the Authenticated Shell (TK-09).
// Runs against the static export served by tests/e2e/serve-static.ts; the
// /api/v1/auth/* cookie boundary is stubbed in-browser (same pattern as the
// responsive suite). Proves shell critical anchors at 320, 375, 390, 414,
// 799, 800, and 1440 CSS px with no horizontal overflow and no obstruction
// of the shell chrome. Numeric CSS-pixel evidence only — no screenshots.
import { defineConfig } from "@playwright/test";

const staticPort = Number(process.env.EFCC_STATIC_PORT ?? 4173);
const staticUrl = `http://127.0.0.1:${staticPort}`;

export default defineConfig({
  metadata: { phaseFTargetUrl: staticUrl },
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
    baseURL: staticUrl,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    { name: "w-320", use: { viewport: { width: 320, height: 844 } } },
    { name: "w-375", use: { viewport: { width: 375, height: 844 } } },
    { name: "w-390", use: { viewport: { width: 390, height: 844 } } },
    { name: "w-414", use: { viewport: { width: 414, height: 844 } } },
    { name: "w-799", use: { viewport: { width: 799, height: 900 } } },
    { name: "w-800", use: { viewport: { width: 800, height: 900 } } },
    { name: "w-1440", use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `pnpm --dir ../../web build && PORT=${staticPort} pnpm exec tsx serve-static.ts`,
    url: staticUrl,
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
