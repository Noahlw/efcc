// REL-01 (#261) Slice C — Programs Resilience Proof Configuration
//
// Targeted verification suite covering failure-path resilience of the
// deployed Programs vertical (each test is self-contained and runs against a
// fresh, locally seeded E2E_ D1):
// - T1: Enrollment-request network failure -> graceful retry -> recovery
// - T2: Scanner check-in going offline mid-flow, then recovering
// - T3: Viewport change mid-flow preserves partially entered Guest Check-In data
// - T4: Session expiry during an active mutation -> clean 401 -> login -> restore
//
// Mirrors tests/e2e/programs-vertical-proof.config.ts (projects array, worker
// model, reporter) with this suite's own testMatch and results file.

import { defineConfig } from "@playwright/test";

const DEFAULT_TARGET_URL = "http://127.0.0.1:8787";
const targetUrl = process.env.PROGRAMS_TARGET_URL ?? DEFAULT_TARGET_URL;

export default defineConfig({
  testDir: ".",
  testMatch: ["**/programs-resilience-proof.test.ts"],
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    [
      "json",
      { outputFile: "test-results/programs-resilience-proof-results.json" },
    ],
  ],
  use: {
    baseURL: targetUrl,
    trace: "off",
  },
  projects: [
    {
      name: "phone-375x667",
      use: { viewport: { width: 375, height: 667 } },
    },
    {
      name: "desktop-1280x720",
      use: { viewport: { width: 1280, height: 720 } },
    },
  ],
});
