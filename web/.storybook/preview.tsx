import type { Decorator, Preview } from "@storybook/nextjs-vite";
import { isCommonAssetRequest } from "msw";
import type { UnhandledRequestCallback } from "msw";
import { mswLoader } from "msw-storybook-addon/csf3";
import { setupWorker } from "msw/browser";

import "../app/globals.css";
import "./deterministic-motion.css";

const DeterministicMotionDecorator = (Story: Parameters<Decorator>[0]) => (
  <div data-t07-deterministic-motion="true">
    <Story />
  </div>
);

const withDeterministicMotion: Decorator = DeterministicMotionDecorator;

export const storybookOnUnhandledRequest: UnhandledRequestCallback = (
  request,
  print
) => {
  if (!isCommonAssetRequest(request)) {
    print.error();
  }
};

const startStorybookWorker = async () => {
  const worker = setupWorker();
  await worker.start({ onUnhandledRequest: storybookOnUnhandledRequest });
  return worker;
};

const preview: Preview = {
  decorators: [withDeterministicMotion],
  loaders: [mswLoader(startStorybookWorker)],
  parameters: {
    layout: "fullscreen",
    a11y: { test: "error" },
  },
};

export default preview;
