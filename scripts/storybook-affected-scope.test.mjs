import { describe, expect, test } from "vitest";

import {
  classifyAffectedPaths,
  isClearlyNonFrontendPath,
} from "./storybook-affected-scope.mjs";

describe("Storybook affected scope", () => {
  test("skips a change set that is clearly non-frontend or backend-only", () => {
    expect(
      classifyAffectedPaths([
        "docs/implementation/ui-control-recovery-plan.md",
        "web/lib/identity/role-hierarchy.ts",
      ])
    ).toStrictEqual({
      run: false,
      reason: "Changed paths are clearly non-frontend or backend-only.",
    });
  });

  test("runs for Storybook and frontend-capable changes", () => {
    expect(
      classifyAffectedPaths([
        "web/.storybook/presentation-catalog.ts",
        "web/app/management/page.tsx",
      ]).run
    ).toBe(true);
  });

  test("fails closed for uncertain shared changes", () => {
    expect(classifyAffectedPaths(["scripts/unknown-shared-tool.mjs"]).run).toBe(
      true
    );
  });

  test("does not treat an empty diff as frontend-affected", () => {
    expect(classifyAffectedPaths([])).toStrictEqual({
      run: false,
      reason: "No changed paths were found.",
    });
  });

  test("keeps the backend-only allowlist narrow", () => {
    expect(isClearlyNonFrontendPath("web/lib/identity/roles.ts")).toBe(true);
    expect(isClearlyNonFrontendPath("web/lib/programs/program-api.ts")).toBe(
      false
    );
    expect(isClearlyNonFrontendPath("web/.storybook/main.ts")).toBe(false);
  });
});
