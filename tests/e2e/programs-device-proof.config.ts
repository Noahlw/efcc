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
      name: "desktop-1280x720",
      use: { viewport: { width: 1280, height: 720 } },
    },
  ],
});
