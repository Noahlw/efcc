// UI-04 (#196) — deployed Next frontend browser trace.
//
// Separate from the GAS playwright.config.ts (legacy Apps Script iframe) and
// the local responsive.config.ts (stubbed static shell). This config drives
// the rebuilt Next.js frontend in a real browser against the isolated
// efcc-auth-* Worker/D1 acceptance deployment, using the out-of-band
// PROGRAMS_* role fixtures. It never mocks the backend and never targets the
// production deployment or the legacy efcc-prototype-129 host.

import { defineConfig } from "@playwright/test";

const targetUrl = process.env.AUTH_UI_TARGET_URL;
if (!targetUrl) {
  throw new Error(
    "AUTH_UI_TARGET_URL is required (deployed Next frontend root on the isolated efcc-auth-*.efcc-ggc.workers.dev acceptance host)"
  );
}

let parsedTarget: URL;
try {
  parsedTarget = new URL(targetUrl);
} catch {
  throw new Error("AUTH_UI_TARGET_URL must be an absolute HTTPS URL");
}

const allowLocal =
  process.env.AUTH_UI_ALLOW_LOCAL === "1" &&
  (parsedTarget.hostname === "localhost" ||
    parsedTarget.hostname === "127.0.0.1");
if (!allowLocal) {
  if (
    parsedTarget.protocol !== "https:" ||
    parsedTarget.username ||
    parsedTarget.password
  ) {
    throw new Error(
      "AUTH_UI_TARGET_URL must be an absolute HTTPS URL without credentials"
    );
  }
  if (
    !/^efcc-auth-[a-z0-9-]+\.efcc-ggc\.workers\.dev$/iu.test(
      parsedTarget.hostname
    )
  ) {
    throw new Error(
      "AUTH_UI_TARGET_URL must use the isolated efcc-auth-*.efcc-ggc.workers.dev acceptance host"
    );
  }
}

export default defineConfig({
  testDir: ".",
  testMatch: ["**/live-ui.test.ts"],
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/live-ui-results.json" }],
  ],
  use: {
    baseURL: targetUrl,
    // UI traces would capture credential request bodies.
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