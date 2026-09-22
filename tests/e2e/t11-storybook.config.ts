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

const viewports = [
  { width: 320, height: 844 },
  { width: 360, height: 800 },
  { width: 375, height: 844 },
  { width: 390, height: 844 },
  { width: 402, height: 874 },
  { width: 414, height: 844 },
  { width: 799, height: 844 },
  { width: 800, height: 900 },
  { width: 1440, height: 900 },
] as const;

export default defineConfig({
  testDir: dirname,
  testMatch: /t11-storybook\.test\.ts$/u,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/t11-storybook/storybook.json" }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: viewports.map(({ width, height }) => ({
    name: `w-${width}`,
    use: {
      ...devices["Desktop Chrome"],
      viewport: { width, height },
    },
  })),
  webServer: {
    command: `STORYBOOK_PORT=${port} pnpm --dir web storybook --ci --port ${port}`,
    cwd: repositoryRoot,
    url: `${baseURL}/iframe.html?id=t07-2-public-auth-member-communications--home&viewMode=story`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
