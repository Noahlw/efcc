import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("T05 layered testing authority", () => {
  test("publishes all five testing responsibilities", () => {
    const authority = readRepoFile("TESTING.md");

    for (const responsibility of [
      "Worker Contract Gate",
      "Runtime Reliability Canary",
      "Browser Acceptance Journey",
      "Responsive UI Matrix",
      "Promotion Gate",
    ]) {
      expect(authority).toContain(responsibility);
    }
  });

  test("routes fresh agents to the authority and preserves historical constraints", () => {
    const agents = readRepoFile("AGENTS.md");
    const governance = readRepoFile(
      "docs/implementation/ui-control-recovery-governance.md"
    );
    const authority = readRepoFile("TESTING.md");

    expect(agents).toContain("TESTING.md");
    expect(governance).toContain("Testing architecture authority");
    expect(authority).toMatch(/201 expected[\s\S]*historical/iu);
    expect(authority).toMatch(
      /five complete full-suite runs[\s\S]*historical/iu
    );
    expect(authority).toMatch(/automatic GitHub CI remains fast-only/iu);
  });
});
