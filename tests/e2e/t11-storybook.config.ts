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

const widths = [320, 375, 390, 414, 799, 800, 1440] as const;

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
  projects: widths.map((width) => ({
    name: `w-${width}`,
    use: {
      ...devices["Desktop Chrome"],
      viewport: {
        width,
        height: width < 800 ? 844 : 900,
      },
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
