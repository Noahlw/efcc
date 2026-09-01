// D-488-05 — pinned Chromium public/auth/account geometry.
// Numeric CSS-pixel evidence only; no screenshots or image snapshots.
import { defineConfig } from "@playwright/test";

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
    !/^efcc-(?:auth|dev)-[a-z0-9-]+\.efcc-ggc\.workers\.dev$/iu.test(
      parsedTarget.hostname
    )
  ) {
    throw new Error(
      "AUTH_UI_TARGET_URL must use the isolated efcc-auth-*.efcc-ggc.workers.dev acceptance host or the efcc-dev-*.efcc-ggc.workers.dev dev-testing host"
    );
  }
}

export default defineConfig({
  testDir: ".",
  testMatch: ["**/phase-d-public-geometry.test.ts"],
  timeout: 45_000,
  retries: 1,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile:
          "tests/e2e/test-results/phase-f/phase-d-public-geometry/results.json",
      },
    ],
  ],
  use: {
    baseURL: targetUrl,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    { name: "w-320", use: { viewport: { width: 320, height: 844 } } },
    { name: "w-390", use: { viewport: { width: 390, height: 844 } } },
    { name: "w-600", use: { viewport: { width: 600, height: 844 } } },
    { name: "w-799", use: { viewport: { width: 799, height: 900 } } },
    { name: "w-800", use: { viewport: { width: 800, height: 900 } } },
    { name: "w-1024", use: { viewport: { width: 1024, height: 900 } } },
    { name: "w-1440", use: { viewport: { width: 1440, height: 900 } } },
  ],
});
