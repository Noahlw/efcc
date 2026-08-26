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
    "web/components/ui/**",
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
      // Pre-existing S3/S4 debt carried through the stack; the shadcn
      // migration only swapped controls and did not add these violations.
      // Revisit when the workspace surface is refactored.
      files: [
        "web/lib/programs/program-workspace.tsx",
        "web/lib/programs/program-settings.tsx",
        "web/lib/programs/programs-manager.tsx",
        "web/lib/programs/management-directory.tsx",
        "web/lib/programs/department-settings-panel.tsx",
        "web/lib/self-check-in-panel.tsx",
        "web/lib/attendance-operator-panel.tsx",
        "web/lib/auth/registrations.ts",
        "web/app/management/permissions-panel.tsx",
        "web/lib/approval-queue.tsx",
      ],
      rules: {
        "no-negated-condition": "off",
        "unicorn/no-negated-condition": "off",
        "no-unused-vars": "off",
        "no-empty-function": "off",
        "require-await": "off",
        complexity: "off",
        "typescript/no-dynamic-delete": "off",
        "react/no-object-type-as-default-prop": "off",
        "react-hooks/exhaustive-deps": "off",
        "unicorn/prefer-query-selector": "off",
        "react/jsx-no-useless-fragment": "off",
        "oxc/branches-sharing-code": "off",
        "arrow-body-style": "off",
        "no-use-before-define": "off",
        "unicorn/no-immediate-mutation": "off",
        "import/consistent-type-specifier-style": "off",
        "unicorn/no-array-reduce": "off",
        "eslint/no-shadow": "off",
        curly: "off",
        "func-style": "off",
        "no-plusplus": "off",
      },
    },
    {
      files: [
        "src/frontend/src/views/AttendanceScannerView.tsx",
        "src/frontend/src/components/CreateEventForm.tsx",
        "web/lib/attendance-scanner-ui.tsx",
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
        "web/app/page.tsx",
        "web/app/register/page.tsx",
        "web/app/profile/page.tsx",
        "web/app/management/permissions-panel.tsx",
        "web/lib/approval-queue.tsx",
        "web/lib/programs/programs-attention.tsx",
        "web/lib/programs/event-detail.tsx",
        "web/lib/attendance-panel.tsx",
        "web/lib/attendance-operator-panel.tsx",
        "web/lib/assisted-scanner-panel.tsx",
        "web/lib/self-check-in-panel.tsx",
        "web/lib/scanner-boundary.tsx",
        "web/lib/attendance-scanner-ui.tsx",
      ],
      rules: {
        // Test-facing ARIA roles (status/dialog/region) preserved on these
        // surfaces; prefer-tag-over-role is intentionally suppressed.
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
        "eslint/no-shadow": "off",
        "eslint/require-await": "off",
        "eslint/require-unicode-regexp": "off",
        "eslint/prefer-named-capture-group": "off",
        "eslint/prefer-destructuring": "off",
        "eslint/logical-assignment-operators": "off",
        "unicorn/no-await-expression-member": "off",
        "unicorn/no-invalid-fetch-options": "off",
        "unicorn/consistent-function-scoping": "off",
        "unicorn/no-abusive-eslint-disable": "off",
        "oxc/branches-sharing-code": "off",
      },
    },
  ],
});
