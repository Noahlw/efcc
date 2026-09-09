import { execFileSync } from "node:child_process";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

import { parseStorybookPort } from "../../web/scripts/storybook-port.mjs";

const dirname = import.meta.dirname;
const repositoryRoot = path.resolve(dirname, "../..");
const storybookLauncher = path.join(
  repositoryRoot,
  "web/scripts/storybook-worktree.mjs"
);
const configuredPort = process.env.STORYBOOK_PORT?.trim();
const discoveredPort = execFileSync(
  process.execPath,
  [storybookLauncher, "--print-port"],
  {
    cwd: repositoryRoot,
    encoding: "utf-8",
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  }
).trim();
const port = parseStorybookPort(
  configuredPort || discoveredPort,
  "STORYBOOK_PORT"
);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: dirname,
  testMatch: /t08-control-contracts\.test\.ts/u,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    [
      "json",
      { outputFile: "test-results/t08-control-contracts/storybook.json" },
    ],
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
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "799",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 799, height: 900 },
      },
    },
    {
      name: "800",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 800, height: 900 },
      },
    },
    {
      name: "1440",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: {
    command: `STORYBOOK_PORT=${port} fnm exec --using 22.18.0 pnpm --dir web storybook --ci --port ${port}`,
    cwd: repositoryRoot,
    url: `${baseURL}/iframe.html?id=controls--button-states&viewMode=story`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
