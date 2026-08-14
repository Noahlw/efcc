// Programs Vertical (Prompts 1 to 4) End-to-End Proof Configuration
//
// Targeted verification suite covering:
// - Tier 1: Participant Discovery & Enrollment Lifecycle (#245-#248)
// - Tier 2: Scoped Management Directory & Workspace (#249-#251, #254, #255)
// - Tier 3: Recurrence, Schedule Exceptions, Event Gen, Queue & Badges (#252, #253, #256)
// - Tier 4: Scanner, Self/Assisted/Guest Attendance, Roster, Void, Correction & Audit (#257-#260)

import { defineConfig } from "@playwright/test";

const DEFAULT_TARGET_URL = "http://127.0.0.1:8787";
const targetUrl = process.env.PROGRAMS_TARGET_URL ?? DEFAULT_TARGET_URL;

export default defineConfig({
  testDir: ".",
  testMatch: ["**/programs-vertical-proof.test.ts"],
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    [
      "json",
      { outputFile: "test-results/programs-vertical-proof-results.json" },
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
