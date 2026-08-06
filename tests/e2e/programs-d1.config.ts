import { defineConfig, devices } from "@playwright/test";

const targetUrl = process.env.PROGRAMS_TARGET_URL;
if (!targetUrl) {
  throw new Error("PROGRAMS_TARGET_URL is required");
}

let parsedTarget: URL;
try {
  parsedTarget = new URL(targetUrl);
} catch {
  throw new Error("PROGRAMS_TARGET_URL must be an absolute HTTPS URL");
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
    !/^efcc-auth-[a-z0-9-]+\.efcc-ggc\.workers\.dev$/iu.test(
      parsedTarget.hostname
    )
  ) {
    throw new Error(
      "PROGRAMS_TARGET_URL must use the isolated efcc-auth-*.efcc-ggc.workers.dev acceptance host"
    );
  }
}

export default defineConfig({
  testDir: ".",
  testMatch: ["**/programs-d1.test.ts"],
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/programs-d1-results.json" }],
  ],
  use: {
    baseURL: targetUrl,
    // UI traces would capture credential request bodies.
    trace: "off",
  },
  projects: [
    {
      name: "phone",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 375, height: 812 },
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
