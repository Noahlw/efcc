import { execFileSync } from "node:child_process";

import { describe, expect, test } from "vitest";

function resetSql(): string {
  return execFileSync(
    "pnpm",
    ["exec", "tsx", "tests/e2e/seed-dev-accounts.ts", "--reset"],
    { encoding: "utf8" }
  );
}

describe("development identity reset", () => {
  test("deletes only active fixture assignments", () => {
    const assignmentDeletes = resetSql()
      .split("\n")
      .filter((line) => line.startsWith("DELETE FROM role_assignments"));

    expect(assignmentDeletes).toHaveLength(3);
    for (const statement of assignmentDeletes) {
      expect(statement).toContain("revoked_at IS NULL");
    }
  });
});
