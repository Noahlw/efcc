import { defineConfig } from "@playwright/test";

const DEFAULT_TARGET_URL = "http://127.0.0.1:8787";
const targetUrl = process.env.PROGRAMS_TARGET_URL ?? DEFAULT_TARGET_URL;

export default defineConfig({
  testDir: ".",
  testMatch: ["**/programs-device-proof.test.ts"],
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/programs-device-proof-results.json" }],
  ],
  use: {
    baseURL: targetUrl,
    trace: "off",
    permissions: ["camera"],
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--enable-blink-features=ShapeDetection",
      ],
    },
  },
  projects: [
    {
      name: "s3-phone-320x844",
      use: { viewport: { width: 320, height: 844 } },
    },
    {
      name: "s3-phone-375x844",
      use: { viewport: { width: 375, height: 844 } },
    },
    {
      name: "s3-phone-390x844",
      use: { viewport: { width: 390, height: 844 } },
    },
    {
      name: "s3-phone-414x844",
      use: { viewport: { width: 414, height: 844 } },
    },
    {
      name: "s3-phone-799x900",
      use: { viewport: { width: 799, height: 900 } },
    },
    {
      name: "s3-desktop-800x900",
      use: { viewport: { width: 800, height: 900 } },
    },
    {
      name: "s3-desktop-1440x900",
      use: { viewport: { width: 1440, height: 900 } },
    },
  ],
});
