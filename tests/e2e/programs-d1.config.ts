import { defineConfig, devices } from "@playwright/test";
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

const resultsFile =
  process.env.PROGRAMS_RESULTS_FILE ?? "test-results/programs-d1-results.json";
const outputDirectory =
  process.env.PROGRAMS_OUTPUT_DIR ?? "test-results/programs-d1";

export default defineConfig({
  testDir: ".",
  testMatch: ["**/programs-d1.test.ts", "**/pui-05-home-origin.test.ts"],
  timeout: 45_000,
  // The runtime gate must preserve the first failure. Retrying a navigation
  // could hide a Worker/proxy termination or a broken D1 lifecycle.
  retries: 0,
  fullyParallel: false,
  workers: 1,
  reporter: [["line"], ["json", { outputFile: resultsFile }]],
  outputDir: outputDirectory,
  use: {
    baseURL: targetUrl,
    // Dev fixtures are non-secret: keep traces and screenshots as failure
    // evidence for local debugging.
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
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
});
