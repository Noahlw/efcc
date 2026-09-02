import path from "node:path";

import { defineConfig } from "@playwright/test";

/**
 * S4-12 / issue #467.
 *
 * This suite is deliberately a consumer of an already-running local Worker
 * and disposable D1. The target is required from the environment so this
 * gate cannot accidentally attach to a shared deployment or claim one of the
 * repository's other local ports.
 */
const targetUrl = process.env.PROGRAMS_TARGET_URL;
if (!targetUrl) {
  throw new Error(
    "PROGRAMS_TARGET_URL is required for the S4 Management hardening gate"
  );
}

let parsedTarget: URL;
try {
  parsedTarget = new URL(targetUrl);
} catch {
  throw new Error("PROGRAMS_TARGET_URL must be an absolute URL");
}

if (
  parsedTarget.protocol !== "http:" ||
  parsedTarget.username ||
  parsedTarget.password ||
  !["localhost", "127.0.0.1"].includes(parsedTarget.hostname)
) {
  throw new Error(
    "PROGRAMS_TARGET_URL must be an HTTP loopback URL without credentials"
  );
}

const outputDir =
  process.env.S4_E2E_OUTPUT_DIR ??
  path.resolve("tests/e2e/test-results/phase-f/s4-management-hardening");
const resultsFile =
  process.env.S4_E2E_RESULTS_FILE ?? path.join(outputDir, "results.json");
export default defineConfig({
  metadata: { phaseFTargetUrl: targetUrl },
  testDir: ".",
  testMatch: ["**/s4-management-hardening.test.ts"],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 1,
  fullyParallel: false,
  workers: 1,
  outputDir,
  reporter: [["list"], ["json", { outputFile: resultsFile }]],
  use: {
    baseURL: targetUrl,
    // Login credentials are entered in this suite; keep traces and
    // screenshots out of the evidence bundle. Geometry is proven with
    // numeric DOM measurements only.
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "phone-320",
      use: { viewport: { width: 320, height: 844 } },
    },
    {
      name: "phone-390",
      use: { viewport: { width: 390, height: 844 } },
    },
    {
      name: "tablet-600",
      use: { viewport: { width: 600, height: 844 } },
    },
    {
      name: "tablet-799",
      use: { viewport: { width: 799, height: 900 } },
    },
    {
      name: "desktop-800",
      use: { viewport: { width: 800, height: 900 } },
    },
    {
      name: "desktop-900",
      use: { viewport: { width: 900, height: 900 } },
    },
    {
      name: "desktop-1024",
      use: { viewport: { width: 1024, height: 900 } },
    },
    {
      name: "desktop-1440",
      use: { viewport: { width: 1440, height: 900 } },
    },
  ],
});
