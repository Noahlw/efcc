import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    ".scratch/**",
    "CONTEXT.md",
    "docs/**",
    "index.html",
    "程式碼.js",
    "prototype/scanner/vendor/**",
  ],
});
