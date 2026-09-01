import { defineConfig, devices } from "@playwright/test";

// E-491-05 — numeric attendance geometry on local Worker/D1 loopback.
const DEFAULT_TARGET_URL = "http://127.0.0.1:8787";
const targetUrl =
  process.env.PHASE_E_TARGET_URL ??
  process.env.PROGRAMS_TARGET_URL ??
  DEFAULT_TARGET_URL;

let parsedTarget: URL;
try {
  parsedTarget = new URL(targetUrl);
} catch {
  throw new Error(
    `PHASE_E_TARGET_URL must be an absolute URL (default: ${DEFAULT_TARGET_URL})`
  );
}

const isLocal =
  parsedTarget.protocol === "http:" &&
  !parsedTarget.username &&
  !parsedTarget.password &&
  ["localhost", "127.0.0.1"].includes(parsedTarget.hostname);
if (!isLocal) {
  throw new Error(
    "PHASE_E_TARGET_URL must be a local loopback URL (http://127.0.0.1:8787 or http://localhost:8787); remote acceptance/dev workers and non-loopback URLs are rejected for Phase E geometry suites"
  );
}

export default defineConfig({
  testDir: ".",
  testMatch: ["**/phase-e-attendance-geometry.test.ts"],
  timeout: 60_000,
  retries: 1,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile:
          "tests/e2e/test-results/phase-f/phase-e-attendance-geometry/results.json",
      },
    ],
  ],
  use: {
    baseURL: targetUrl,
    permissions: ["camera"],
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--enable-blink-features=ShapeDetection",
      ],
    },
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "w-320",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 320, height: 568 },
      },
    },
    {
      name: "w-390",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 390, height: 667 },
      },
    },
    {
      name: "w-600",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 600, height: 844 },
      },
    },
    {
      name: "w-799",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 799, height: 900 },
      },
    },
    {
      name: "w-800",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 800, height: 900 },
      },
    },
    {
      name: "w-1024",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1024, height: 768 },
      },
    },
    {
      name: "w-1440",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "print-media",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 800, height: 1000 },
        contextOptions: {
          forcedColors: "none",
        },
      },
    },
  ],
});
