// ATT-04 (#216) — local/deployed D1 QR-attendance end-to-end proof.
//
// Mirrors programs-d1.config.ts: local Worker/D1 by default, with an
// explicit PROGRAMS_TARGET_URL override for an isolated remote smoke and
// the same six PROGRAMS_* role fixtures and fail-closed host validation.
// The test list is attendance-only; runs use phone-375x667 and
// desktop-1280x720 viewport projects like live-ui.
// Traces stay off (UI traces would capture credential request bodies).

import { defineConfig } from "@playwright/test";

// Local-first default (see AGENTS.md): `wrangler dev` serves the Worker +
// local D1 on this origin. Override PROGRAMS_TARGET_URL for the shared
// dev-testing worker (see .github/CI-SECRETS.md) or another
// efcc-auth-*/efcc-dev-*.efcc-ggc.workers.dev acceptance host.
const DEFAULT_TARGET_URL = "http://127.0.0.1:8787";

const targetUrl = process.env.PROGRAMS_TARGET_URL ?? DEFAULT_TARGET_URL;

let parsedTarget: URL;
try {
  parsedTarget = new URL(targetUrl);
} catch {
  throw new Error(
    `PROGRAMS_TARGET_URL must be an absolute URL (default: ${DEFAULT_TARGET_URL})`
  );
}

const isLocal =
  parsedTarget.protocol === "http:" &&
  !parsedTarget.username &&
  !parsedTarget.password &&
  ["localhost", "127.0.0.1"].includes(parsedTarget.hostname);
if (!isLocal) {
  if (
    parsedTarget.protocol !== "https:" ||
    parsedTarget.username ||
    parsedTarget.password
  ) {
    throw new Error(
      "PROGRAMS_TARGET_URL must be an absolute HTTP loopback URL or an absolute HTTPS URL without credentials"
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
    // Camera-first S3 tests use Chromium's deterministic fake stream; the
    // required real-iPhone smoke remains a separate manual gate.
    permissions: ["camera"],
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--enable-blink-features=ShapeDetection",
      ],
    },
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
