// UI-04 (#196) — local/deployed Next frontend browser trace.
//
// This config drives the rebuilt Next.js frontend in a real browser against
// the local Worker/D1 by default, or an isolated efcc-auth-* acceptance
// deployment when explicitly overridden. It uses the out-of-band PROGRAMS_*
// role fixtures, never mocks the backend, and never targets the retired
// Apps Script suite or the legacy efcc-prototype-129 host.

import { defineConfig } from "@playwright/test";

// Local-first default (see AGENTS.md): `wrangler dev` serves the built
// static export + Worker on this origin. Override AUTH_UI_TARGET_URL for
// the isolated efcc-auth-*.efcc-ggc.workers.dev acceptance host described
// above to prove production-bound behavior.
const DEFAULT_TARGET_URL = "http://127.0.0.1:8787";

const targetUrl = process.env.AUTH_UI_TARGET_URL ?? DEFAULT_TARGET_URL;

let parsedTarget: URL;
try {
  parsedTarget = new URL(targetUrl);
} catch {
  throw new Error(
    `AUTH_UI_TARGET_URL must be an absolute URL (default: ${DEFAULT_TARGET_URL})`
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
      "AUTH_UI_TARGET_URL must be an absolute HTTP loopback URL or an absolute HTTPS URL without credentials"
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
