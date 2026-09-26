import path from "node:path";

import type { NextConfig } from "next";

// PROTOTYPE (issue #129): static export per ADR-0017 - no server runtime,
// serves as pure static assets from the Cloudflare Worker's `assets`
// binding. Do not switch to SSR/OpenNext without revisiting ADR-0017.
const nextConfig: NextConfig = {
  output: "export",
  turbopack: {
    root: path.resolve(import.meta.dirname, "../.."),
  },
};

export default nextConfig;
