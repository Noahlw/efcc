import { execFileSync } from "node:child_process";
import path from "node:path";

import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

import { parseStorybookPort } from "./scripts/storybook-port.mjs";

const dirname = process.cwd();
const storybookLauncher = path.join(dirname, "scripts/storybook-worktree.mjs");
const storybookPort = parseStorybookPort(
  process.env.STORYBOOK_PORT ??
    execFileSync(process.execPath, [storybookLauncher, "--print-port"], {
      cwd: dirname,
      encoding: "utf-8",
    }).trim(),
  "STORYBOOK_PORT"
);

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: path.join(dirname, ".storybook"),
            storybookScript: `pnpm storybook --port ${storybookPort}`,
            storybookUrl: `http://127.0.0.1:${storybookPort}`,
          }),
        ],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{ browser: "chromium" }],
          },
          setupFiles: [path.join(dirname, ".storybook/vitest.setup.ts")],
        },
      },
    ],
  },
});
