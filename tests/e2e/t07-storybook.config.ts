import { execFileSync } from "node:child_process";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const dirname = import.meta.dirname;
const repositoryRoot = path.resolve(dirname, "../..");
const storybookLauncher = path.join(
  repositoryRoot,
  "web/scripts/storybook-worktree.mjs"
);
const port = Number(
  process.env.STORYBOOK_PORT ??
    execFileSync(process.execPath, [storybookLauncher, "--print-port"], {
      cwd: repositoryRoot,
      encoding: "utf-8",
    }).trim()
);
const baseURL = `http://127.0.0.1:${port}`;
process.env.STORYBOOK_PORT = String(port);
process.env.STORYBOOK_BASE_URL = baseURL;

export default defineConfig({
  testDir: dirname,
  testMatch: /t07-management-hub-storybook\.test\.ts/u,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/t07-1/storybook.json" }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "390",
      use: {
        ...devices["Desktop Chrome"],
        baseURL,
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "799",
      use: {
        ...devices["Desktop Chrome"],
        baseURL,
        viewport: { width: 799, height: 900 },
      },
    },
    {
      name: "800",
      use: {
        ...devices["Desktop Chrome"],
        baseURL,
        viewport: { width: 800, height: 900 },
      },
    },
    {
      name: "1440",
      use: {
        ...devices["Desktop Chrome"],
        baseURL,
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: {
    command: `fnm exec --using 22.18.0 pnpm --dir web storybook --ci --port ${port}`,
    cwd: repositoryRoot,
    url: `${baseURL}/iframe.html?id=t07-1-management-hub--default&viewMode=story`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
