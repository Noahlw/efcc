import { execFileSync } from "node:child_process";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

import { parseStorybookPort } from "../../apps/web/scripts/storybook-port.mjs";

const requiredEnvironment = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required before starting the visual harness.`);
  }
  return value;
};

const candidateSha = requiredEnvironment("PROGRAMS_CANDIDATE_SHA");
if (!/^[0-9a-f]{40}$/u.test(candidateSha)) {
  throw new Error("PROGRAMS_CANDIDATE_SHA must be a 40-character git SHA.");
}
const artifactDirectoryInput = requiredEnvironment(
  "PROGRAMS_VISUAL_ARTIFACT_DIR"
);

const dirname = import.meta.dirname;
const repositoryRoot = path.resolve(dirname, "../..");
const artifactDirectory = path.resolve(repositoryRoot, artifactDirectoryInput);
const storybookLauncher = path.join(
  repositoryRoot,
  "apps/web/scripts/storybook-worktree.mjs"
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
  testMatch: /programs-visual-fidelity\.test\.ts$/u,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["json", { outputFile: path.join(artifactDirectory, "storybook.json") }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "402x874",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 402, height: 874 },
      },
    },
    {
      name: "360x800",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 800 },
      },
    },
  ],
  webServer: {
    command: `STORYBOOK_PORT=${port} fnm exec --using 22.18.0 pnpm --dir apps/web storybook --ci --port ${port}`,
    cwd: repositoryRoot,
    url: `${baseURL}/iframe.html?id=t07-3-programs--participant-directory&viewMode=story`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
