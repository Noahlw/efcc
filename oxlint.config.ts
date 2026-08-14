import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import vitest from "ultracite/oxlint/vitest";

export default defineConfig({
  extends: [core, react, vitest],
  ignorePatterns: [
    ...(core.ignorePatterns || []),
    ".scratch/**",
    "docs/**",
    "index.html",
    "程式碼.js",
    "prototype/scanner/vendor/**",
  ],
  rules: {
    // Scoped via overrides below where possible; only truly global suppressions here
    "no-nested-ternary": "off",

    "func-style": ["error", "declaration", { allowArrowFunctions: true }],
    "react/react-compiler": "off",
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
      files: [
        "src/frontend/src/views/AttendanceScannerView.tsx",
        "src/frontend/src/components/CreateEventForm.tsx",
      ],
      rules: {
        "jsx-a11y/label-has-associated-control": "off",
        "catch-error-name": "off",
        "no-empty-function": "off",
        "no-use-before-define": "off",
        "promise/prefer-await-to-then": "off",
      },
    },
    {
      files: ["src/frontend/src/views/EventManagementView.tsx"],
      rules: {
        "no-alert": "off",
        "no-use-before-define": "off",
        "unicorn/escape-case": "off",
        "unicorn/prefer-number-properties": "off",
      },
    },
    {
      files: ["src/frontend/src/services/api.ts"],
      rules: {
        "promise/avoid-new": "off",
        "promise/param-names": "off",
      },
    },
    {
      files: ["src/frontend/src/views/CareDashboardView.tsx"],
      rules: {
        "consistent-type-definitions": "off",
        "no-negated-condition": "off",
        "unicorn/no-negated-condition": "off",
        // Clickable card divs and hover effects
        "jsx-a11y/click-events-have-key-events": "off",
        "jsx-a11y/mouse-events-have-key-events": "off",
        "jsx-a11y/no-noninteractive-element-interactions": "off",
        "jsx-a11y/no-static-element-interactions": "off",
      },
    },
    {
      files: ["src/frontend/src/components/CreateEventForm.tsx"],
      rules: {
        // Overlay div with onClick for dismiss
        "jsx-a11y/click-events-have-key-events": "off",
        "jsx-a11y/no-noninteractive-element-interactions": "off",
        "jsx-a11y/no-static-element-interactions": "off",
      },
    },
    {
      files: ["src/frontend/src/views/EventManagementView.tsx"],
      rules: {
        // Banner div with onClick for dismiss
        "jsx-a11y/click-events-have-key-events": "off",
        "jsx-a11y/no-noninteractive-element-interactions": "off",
        "jsx-a11y/no-static-element-interactions": "off",
      },
    },
    {
      files: ["src/frontend/src/components/MemberPassModal.tsx"],
      rules: {
        // Modal dialog, backdrop div with onClick+onKeyDown
        "jsx-a11y/click-events-have-key-events": "off",
        "jsx-a11y/no-noninteractive-element-interactions": "off",
        "jsx-a11y/no-static-element-interactions": "off",
        "jsx-a11y/prefer-tag-over-role": "off",
      },
    },
    {
      files: [
        "src/frontend/src/views/LoginView.tsx",
        "src/frontend/src/views/MemberRegistrationView.tsx",
        "src/frontend/src/views/ProgramCatalogView.tsx",
        "src/frontend/src/views/ProgramEnrollmentView.tsx",
      ],
      rules: {
        // div/p with role="alert" or role="status" for error messages
        "jsx-a11y/prefer-tag-over-role": "off",
      },
    },
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
