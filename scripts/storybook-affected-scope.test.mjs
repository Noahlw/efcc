import { describe, expect, test } from "vitest";

import {
  classifyAffectedPaths,
  isClearlyNonPresentationPath,
} from "./storybook-affected-scope.mjs";

describe("Storybook affected scope", () => {
  test("skips a change set that is clearly non-presentation", () => {
    expect(
      classifyAffectedPaths([
        "docs/implementation/ui-control-recovery-plan.md",
        "web/migrations/0001_identity.sql",
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

  test("keeps the non-presentation allowlist narrow", () => {
    expect(isClearlyNonPresentationPath("web/lib/identity/roles.ts")).toBe(
      false
    );
    expect(isClearlyNonPresentationPath("web/migrations/roles.sql")).toBe(true);
    expect(isClearlyNonPresentationPath("web/worker.ts")).toBe(false);
    expect(
      isClearlyNonPresentationPath("web/lib/programs/program-api.ts")
    ).toBe(false);
    expect(isClearlyNonPresentationPath("web/.storybook/main.ts")).toBe(false);
  });
});
