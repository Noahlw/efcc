import { defineConfig, devices } from "@playwright/test";

const targetUrl = process.env.PROGRAMS_TARGET_URL ?? "http://127.0.0.1:8787";
const parsedTarget = new URL(targetUrl);
const localTarget = ["localhost", "127.0.0.1"].includes(parsedTarget.hostname);
if (
  !(
    (parsedTarget.protocol === "http:" &&
      localTarget &&
      !parsedTarget.username &&
      !parsedTarget.password) ||
    (parsedTarget.protocol === "https:" &&
      !parsedTarget.username &&
      !parsedTarget.password)
  )
) {
  throw new Error(
    "PROGRAMS_TARGET_URL must be an absolute loopback HTTP URL or an HTTPS acceptance URL"
  );
}

export default defineConfig({
  testDir: ".",
  testMatch: ["**/member-directory.test.ts"],
  timeout: 45_000,
  retries: 1,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/member-directory-results.json" }]],
  use: {
    baseURL: targetUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
