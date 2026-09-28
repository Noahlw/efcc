import { defineConfig, devices } from "@playwright/test";

const DEFAULT_TARGET_URL = "http://127.0.0.1:8787";
const targetUrl = process.env.PROGRAMS_TARGET_URL ?? DEFAULT_TARGET_URL;
let target: URL;
try {
  target = new URL(targetUrl);
} catch {
  throw new Error("PROGRAMS_TARGET_URL must be a loopback HTTP URL");
}
if (
  target.protocol !== "http:" ||
  target.username ||
  target.password ||
  !["localhost", "127.0.0.1"].includes(target.hostname)
) {
  throw new Error("Home Browser Acceptance requires a loopback HTTP target");
}

export default defineConfig({
  testDir: ".",
  testMatch: ["**/programs-home-acceptance.test.ts"],
  grep: /PUI-05 case \d{2}:/u,
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
          process.env.PROGRAMS_HOME_RESULTS_FILE ??
          "test-results/programs-home-results.json",
      },
    ],
  ],
  outputDir:
    process.env.PROGRAMS_HOME_OUTPUT_DIR ??
    "test-results/programs-home-acceptance",
  use: {
    baseURL: target.origin,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "phone-390",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
