import { defineConfig, devices } from "@playwright/test";

const DEFAULT_TARGET_URL = "http://127.0.0.1:8787";
const targetUrl = process.env.PROGRAMS_TARGET_URL ?? DEFAULT_TARGET_URL;
const suite =
  process.env.PROGRAMS_ACCEPTANCE_SUITE === "feed" ? "feed" : "home";
const prefix = `PROGRAMS_${suite.toUpperCase()}`;
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
  throw new Error(
    "Home/Feed Browser Acceptance requires a loopback HTTP target"
  );
}

export default defineConfig({
  testDir: ".",
  testMatch: ["**/programs-home-acceptance.test.ts"],
  grep:
    suite === "feed"
      ? /programs-d1 #(?:1[89]|2[0-4]):/u
      : /PUI-05 case \d{2}:/u,
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
          process.env[`${prefix}_RESULTS_FILE`] ??
          `test-results/programs-${suite}-results.json`,
      },
    ],
  ],
  outputDir:
    process.env[`${prefix}_OUTPUT_DIR`] ??
    `test-results/programs-${suite}-acceptance`,
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
