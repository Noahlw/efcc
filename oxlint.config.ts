import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import vitest from "ultracite/oxlint/vitest";

export default defineConfig({
  extends: [core, vitest],
  ignorePatterns: [
    ...(core.ignorePatterns || []),
    ".scratch/**",
    "docs/**",
    "index.html",
    "程式碼.js",
    "src/gas/template-reference/**",
  ],
  rules: {
    "no-nested-ternary": "off",

    "func-style": ["error", "declaration", { allowArrowFunctions: true }],
    "sort-keys": "off",
    "typescript/no-invalid-void-type": "off",
    "unicorn/filename-case": [
      "error",
      {
        cases: {
          camelCase: true,
          kebabCase: true,
          pascalCase: true,
        },
      },
    ],
    "unicorn/no-array-sort": "off",
    "unicorn/no-nested-ternary": "off",
    "unicorn/prefer-number-coercion": "off",
    "unicorn/prefer-set-has": "off",
  },
  overrides: [
    {
      // Playwright automation is inherently sequential-polling code
      // (findAppFrame's while-loop, per-tick frame checks) — the
      // "collect promises, then await all" rewrite the rule suggests
      // does not apply to a bounded polling loop with an early return.
      // Also works around an oxlint 1.76.0 quirk where inline
      // oxlint-disable-next-line comments for this rule do not
      // reliably suppress inside this file's specific AST shape.
      files: ["tests/e2e/**/*.ts"],
      rules: {
        "no-await-in-loop": "off",
      },
    },
  ],
});
