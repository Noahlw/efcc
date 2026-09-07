import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  classifyAffectedPaths,
  isClearlyNonPresentationPath,
  main,
  readChangedPaths,
} from "./storybook-affected-scope.mjs";

const runGit = (cwd, args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    env: cleanGitEnvironment(),
  }).trim();

function cleanGitEnvironment() {
  const environment = { ...process.env };
  delete environment.GIT_DIR;
  delete environment.GIT_INDEX_FILE;
  delete environment.GIT_WORK_TREE;
  return environment;
}

function writeFixtureFile(cwd, filePath, contents = "fixture\n") {
  const absolutePath = path.join(cwd, filePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents);
}

function createGitComparison({ baseFiles, mutate }) {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "efcc-storybook-scope-"));
  try {
    runGit(cwd, ["init", "-q"]);
    runGit(cwd, ["config", "user.email", "storybook-scope@example.invalid"]);
    runGit(cwd, ["config", "user.name", "Storybook scope fixture"]);
    for (const [filePath, contents] of Object.entries(
      baseFiles ?? {
        "web/features/example/example.stories.tsx": "export {}\n",
        "docs/note.md": "fixture\n",
      }
    )) {
      writeFixtureFile(cwd, filePath, contents);
    }
    runGit(cwd, ["add", "."]);
    runGit(cwd, ["commit", "-qm", "fixture base"]);
    const base = runGit(cwd, ["rev-parse", "HEAD"]);

    mutate?.(cwd);
    runGit(cwd, ["add", "-A"]);
    let hasCachedChanges = true;
    try {
      execFileSync("git", ["diff", "--cached", "--quiet"], {
        cwd,
        env: cleanGitEnvironment(),
        stdio: "ignore",
      });
      hasCachedChanges = false;
    } catch {
      hasCachedChanges = true;
    }
    const head = hasCachedChanges
      ? (runGit(cwd, ["commit", "-qm", "fixture head"]),
        runGit(cwd, ["rev-parse", "HEAD"]))
      : base;
    return { cwd, base, head };
  } catch (error) {
    rmSync(cwd, { force: true, recursive: true });
    throw error;
  }
}

function withComparison(options, assertion) {
  const comparison = createGitComparison(options);
  try {
    assertion(comparison);
  } finally {
    rmSync(comparison.cwd, { force: true, recursive: true });
  }
}

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

  test("reads deleted Story paths and still runs the affected check", () => {
    withComparison(
      {
        mutate: (cwd) => {
          rmSync(path.join(cwd, "web/features/example/example.stories.tsx"));
        },
      },
      ({ base, head, cwd }) => {
        const paths = readChangedPaths(base, head, cwd);
        expect(paths).toContain("web/features/example/example.stories.tsx");
        expect(classifyAffectedPaths(paths).run).toBe(true);
      }
    );
  });

  test("reads both sides of a Story-to-docs move without rename quoting", () => {
    withComparison(
      {
        mutate: (cwd) => {
          mkdirSync(path.join(cwd, "docs"), { recursive: true });
          runGit(cwd, [
            "mv",
            "web/features/example/example.stories.tsx",
            "docs/retired.stories.tsx",
          ]);
        },
      },
      ({ base, head, cwd }) => {
        const paths = readChangedPaths(base, head, cwd);
        expect(paths).toEqual(
          expect.arrayContaining([
            "web/features/example/example.stories.tsx",
            "docs/retired.stories.tsx",
          ])
        );
        expect(classifyAffectedPaths(paths).run).toBe(true);
      }
    );
  });

  test("runs for a docs-to-frontend move and preserves filenames with spaces", () => {
    withComparison(
      {
        baseFiles: { "docs/retired story.md": "fixture\n" },
        mutate: (cwd) => {
          mkdirSync(path.join(cwd, "web/features/example"), {
            recursive: true,
          });
          runGit(cwd, [
            "mv",
            "--",
            "docs/retired story.md",
            "web/features/example/restored story.stories.tsx",
          ]);
        },
      },
      ({ base, head, cwd }) => {
        const paths = readChangedPaths(base, head, cwd);
        expect(paths).toEqual(
          expect.arrayContaining([
            "docs/retired story.md",
            "web/features/example/restored story.stories.tsx",
          ])
        );
        expect(classifyAffectedPaths(paths).run).toBe(true);
      }
    );
  });

  test("keeps a mixed deletion and docs edit fail-closed", () => {
    withComparison(
      {
        mutate: (cwd) => {
          rmSync(path.join(cwd, "web/features/example/example.stories.tsx"));
          writeFileSync(path.join(cwd, "docs/note.md"), "updated\n");
        },
      },
      ({ base, head, cwd }) => {
        const paths = readChangedPaths(base, head, cwd);
        expect(paths).toEqual(
          expect.arrayContaining([
            "docs/note.md",
            "web/features/example/example.stories.tsx",
          ])
        );
        expect(classifyAffectedPaths(paths).run).toBe(true);
      }
    );
  });

  test("does not run for a real empty comparison", () => {
    withComparison({ mutate: () => {} }, ({ base, cwd }) => {
      const paths = readChangedPaths(base, base, cwd);
      expect(paths).toStrictEqual([]);
      expect(classifyAffectedPaths(paths)).toStrictEqual({
        run: false,
        reason: "No changed paths were found.",
      });
    });
  });

  test("keeps production identity paths fail-closed", () => {
    withComparison(
      {
        mutate: (cwd) =>
          writeFixtureFile(cwd, "web/lib/identity/presentation-panel.ts"),
      },
      ({ base, head, cwd }) => {
        const paths = readChangedPaths(base, head, cwd);
        expect(paths).toContain("web/lib/identity/presentation-panel.ts");
        expect(classifyAffectedPaths(paths).run).toBe(true);
      }
    );
  });

  test("runs when the comparison base is invalid", () => {
    withComparison({ mutate: () => {} }, ({ head, cwd }) => {
      const previousOutput = process.env.GITHUB_OUTPUT;
      delete process.env.GITHUB_OUTPUT;
      try {
        const result = main({
          baseRef: "not-a-real-commit",
          headRef: head,
          cwd,
        });
        expect(result.run).toBe(true);
        expect(result.reason).toMatch(/failing closed/u);
      } finally {
        if (previousOutput === undefined) {
          delete process.env.GITHUB_OUTPUT;
        } else {
          process.env.GITHUB_OUTPUT = previousOutput;
        }
      }
    });
  });

  test("does not depend on a line-oriented path parser", () => {
    withComparison(
      {
        baseFiles: {
          "web/features/example/story with spaces.stories.tsx": "export {}\n",
        },
        mutate: (cwd) => {
          writeFileSync(
            path.join(
              cwd,
              "web/features/example/story with spaces.stories.tsx"
            ),
            readFileSync(
              path.join(
                cwd,
                "web/features/example/story with spaces.stories.tsx"
              ),
              "utf-8"
            ) + "export const Changed = {};\n"
          );
        },
      },
      ({ base, head, cwd }) => {
        const paths = readChangedPaths(base, head, cwd);
        expect(paths).toStrictEqual([
          "web/features/example/story with spaces.stories.tsx",
        ]);
        expect(classifyAffectedPaths(paths).run).toBe(true);
      }
    );
  });
});
