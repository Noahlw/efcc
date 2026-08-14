// Programs Capability-Matrix Proof Configuration (REL-01 #261 — Slice B)
//
// Cross-scope denial and Staff/Admin breadth at the API layer, per the
// capability-authorizer.ts model (role-global hasCapability first, then
// Department scope, then Program scope). No camera/launch args needed.

import { defineConfig } from "@playwright/test";

const DEFAULT_TARGET_URL = "http://127.0.0.1:8787";
const targetUrl = process.env.PROGRAMS_TARGET_URL ?? DEFAULT_TARGET_URL;

export default defineConfig({
  testDir: ".",
  testMatch: ["**/programs-capability-matrix-proof.test.ts"],
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile:
          "test-results/programs-capability-matrix-proof-results.json",
      },
    ],
  ],
  use: {
    baseURL: targetUrl,
    trace: "off",
  },
  projects: [
    {
      name: "desktop-1280x720",
      use: { viewport: { width: 1280, height: 720 } },
    },
  ],
});
