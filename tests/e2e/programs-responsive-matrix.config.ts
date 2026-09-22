import { defineConfig, devices } from "@playwright/test";

const DEFAULT_TARGET_URL = "http://127.0.0.1:8787";
const targetUrl = process.env.PROGRAMS_TARGET_URL ?? DEFAULT_TARGET_URL;
let target: URL;
try {
  target = new URL(targetUrl);
} catch {
  throw new Error(
    "PROGRAMS_TARGET_URL must be a valid URL (loopback HTTP or reserved HTTPS Worker)"
  );
}
const isLoopback =
  target.protocol === "http:" &&
  !target.username &&
  !target.password &&
  ["localhost", "127.0.0.1"].includes(target.hostname);
const isReservedWorker =
  target.protocol === "https:" &&
  !target.username &&
  !target.password &&
  /^efcc-(?:auth|dev)-[a-z0-9-]+\.efcc-ggc\.workers\.dev$/iu.test(
    target.hostname
  );

if (!isLoopback && !isReservedWorker) {
  throw new Error(
    "PROGRAMS_TARGET_URL must be a loopback HTTP URL or a reserved HTTPS efcc-auth/efcc-dev Worker URL"
  );
}
const ROSTER_SCENARIO = /attendance roster remains scannable at phone widths/u;

export default defineConfig({
  testDir: ".",
  testMatch: ["**/programs-responsive-matrix.test.ts"],
  timeout: 60_000,
  retries: 0,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["line"],
    [
      "json",
      {
        outputFile:
          process.env.PROGRAMS_RESPONSIVE_RESULTS_FILE ??
          "test-results/programs-responsive-results.json",
      },
    ],
  ],
  outputDir:
    process.env.PROGRAMS_RESPONSIVE_OUTPUT_DIR ??
    "test-results/programs-responsive",
  use: {
    baseURL: targetUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "phone-320",
      grepInvert: ROSTER_SCENARIO,
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 320, height: 812 },
      },
    },
    {
      name: "phone-360",
      grepInvert: ROSTER_SCENARIO,
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 360, height: 800 },
      },
    },
    {
      name: "phone-390",
      grepInvert: ROSTER_SCENARIO,
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "phone-402",
      grepInvert: ROSTER_SCENARIO,
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 402, height: 874 },
      },
    },
    {
      name: "phone-360-roster",
      grep: ROSTER_SCENARIO,
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 360, height: 800 },
      },
    },
    {
      name: "phone-390-roster",
      grep: ROSTER_SCENARIO,
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "phone-402-roster",
      grep: ROSTER_SCENARIO,
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 402, height: 874 },
      },
    },
    {
      name: "phone-600",
      grepInvert: ROSTER_SCENARIO,
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 600, height: 844 },
      },
    },
    {
      name: "phone-799",
      grepInvert: ROSTER_SCENARIO,
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 799, height: 900 },
      },
    },
    {
      name: "desktop-800",
      grepInvert: ROSTER_SCENARIO,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 800, height: 900 },
      },
    },
    {
      name: "desktop-1024",
      grepInvert: ROSTER_SCENARIO,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1024, height: 900 },
      },
    },
    {
      name: "desktop-1440",
      grepInvert: ROSTER_SCENARIO,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
