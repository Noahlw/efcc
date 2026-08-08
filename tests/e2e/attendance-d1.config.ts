import { defineConfig } from "@playwright/test";

// ATT-04 (#216) — deployed QR-attendance end-to-end proof.
//
// Mirrors programs-d1.config.ts: same shared dev-testing worker default,
// same PROGRAMS_TARGET_URL override, same six PROGRAMS_* role fixtures,
// same fail-closed host validation. Test list is attendance-only; runs on
// the phone-375x667 and desktop-1280x720 viewport projects like live-ui.
// Traces stay off (UI traces would capture credential request bodies).

// Shared dev-testing worker (see .github/CI-SECRETS.md). Overridable via
// PROGRAMS_TARGET_URL; everything else stays fail-closed below.
const DEFAULT_TARGET_URL = "https://efcc-dev-testing.efcc-ggc.workers.dev";

const targetUrl = process.env.PROGRAMS_TARGET_URL ?? DEFAULT_TARGET_URL;

let parsedTarget: URL;
try {
  parsedTarget = new URL(targetUrl);
} catch {
  throw new Error(
    `PROGRAMS_TARGET_URL must be an absolute HTTPS URL (default: ${DEFAULT_TARGET_URL})`
  );
}

const allowLocal =
  process.env.PROGRAMS_ALLOW_LOCAL === "1" &&
  (parsedTarget.hostname === "localhost" ||
    parsedTarget.hostname === "127.0.0.1");
if (!allowLocal) {
  if (
    parsedTarget.protocol !== "https:" ||
    parsedTarget.username ||
    parsedTarget.password
  ) {
    throw new Error(
      "PROGRAMS_TARGET_URL must be an absolute HTTPS URL without credentials"
    );
  }
  if (
    !/^efcc-(?:auth|dev)-[a-z0-9-]+\.efcc-ggc\.workers\.dev$/iu.test(
      parsedTarget.hostname
    )
  ) {
    throw new Error(
      "PROGRAMS_TARGET_URL must use the efcc-auth-*.efcc-ggc.workers.dev acceptance host or the efcc-dev-*.efcc-ggc.workers.dev dev-testing host"
    );
  }
}

export default defineConfig({
  testDir: ".",
  testMatch: ["**/attendance-d1.test.ts"],
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/attendance-d1-results.json" }],
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
