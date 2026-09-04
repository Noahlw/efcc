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
  outputDir: "test-results/programs-responsive",
  use: {
    baseURL: targetUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "phone-320",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 320, height: 812 },
      },
    },
    {
      name: "phone-390",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "desktop-1280",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
});
