import path from "node:path";

import type { StorybookConfig } from "@storybook/nextjs-vite";

const { dirname } = import.meta;
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
  staticDirs: ["../public"],
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
