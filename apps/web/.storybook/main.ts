import path from "node:path";
import { fileURLToPath } from "node:url";

import type { StorybookConfig } from "@storybook/nextjs-vite";

// import.meta.dirname is unavailable under some config loaders (e.g. Knip);
// fall back to the module URL so static analysis can load this file.
const dirname =
  import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(dirname, "..");

const config: StorybookConfig = {
  stories: ["./*.stories.tsx"],
  addons: [
    "@storybook/addon-a11y",
    "@storybook/addon-vitest",
    "msw-storybook-addon",
  ],
  framework: {
    name: "@storybook/nextjs-vite",
    options: {},
  },
  staticDirs: ["./public"],
  viteFinal: (viteConfig) => {
    const existingAlias = viteConfig.resolve?.alias;
    const alias = Array.isArray(existingAlias)
      ? [...existingAlias, { find: "@", replacement: webRoot }]
      : { ...existingAlias, "@": webRoot };

    return {
      ...viteConfig,
      resolve: {
        ...viteConfig.resolve,
        alias,
      },
    };
  },
};

export default config;
