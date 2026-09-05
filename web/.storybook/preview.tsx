import type { Decorator, Preview } from "@storybook/nextjs-vite";
import { mswLoader } from "msw-storybook-addon/csf3";

import "../app/globals.css";
import "./deterministic-motion.css";

const DeterministicMotionDecorator = (Story: Parameters<Decorator>[0]) => (
  <div data-t07-deterministic-motion="true">
    <Story />
  </div>
);

const withDeterministicMotion: Decorator = DeterministicMotionDecorator;

const preview: Preview = {
  decorators: [withDeterministicMotion],
  loaders: [mswLoader()],
  parameters: {
    layout: "fullscreen",
    a11y: { test: "error" },
  },
};

export default preview;
