import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { auditFileContent } from "./audit";
import {
  auditNewControlOverrides,
  resolveControlOverrideBase,
} from "./control-override-ratchet";

function cleanGitEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  delete environment.GIT_DIR;
  delete environment.GIT_COMMON_DIR;
  delete environment.GIT_INDEX_FILE;
  delete environment.GIT_WORK_TREE;
  return environment;
}

function git(rootDir: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd: rootDir,
    encoding: "utf-8",
    env: cleanGitEnvironment(),
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function createFixture(): { rootDir: string; baseRef: string } {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "efcc-t08-ratchet-"));
  git(rootDir, "init", "-q");
  git(rootDir, "config", "user.email", "t08@example.invalid");
  git(rootDir, "config", "user.name", "T08 Ratchet");
  fs.mkdirSync(path.join(rootDir, "web/app"), { recursive: true });
  fs.writeFileSync(
    path.join(rootDir, "web/app/example.tsx"),
    `import { Button } from "@/components/ui/button";\n\nexport function Example() {\n  return <Button>welcome</Button>;\n}\n`,
    "utf-8"
  );
  git(rootDir, "add", ".");
  git(rootDir, "commit", "-qm", "base");
  return { rootDir, baseRef: git(rootDir, "rev-parse", "HEAD") };
}

describe("T08 incremental control override ratchet", () => {
  test("blocks new owned geometry while allowing layout and safe conditionals", () => {
    const fixture = createFixture();
    try {
      fs.writeFileSync(
        path.join(fixture.rootDir, "web/app/example.tsx"),
        `import { Button } from "@/components/ui/button";\n\nconst active = true;\nconst unrelated = "text-muted-foreground";\n\nexport function Example() {\n  return (\n    <>\n      <div className={unrelated}>copy</div>\n      <Button className={active ? "w-full" : "w-fit"}>welcome</Button>\n    </>\n  );\n}\n`,
        "utf-8"
      );
      expect(
        auditNewControlOverrides({
          rootDir: fixture.rootDir,
          baseRef: fixture.baseRef,
        })
      ).toStrictEqual([]);

      fs.writeFileSync(
        path.join(fixture.rootDir, "web/app/example.tsx"),
        `import { Button } from "@/components/ui/button";\n\nexport function Example() {\n  return <Button className="min-h-8 px-2 rounded-md">welcome</Button>;\n}\n`,
        "utf-8"
      );
      const violations = auditNewControlOverrides({
        rootDir: fixture.rootDir,
        baseRef: fixture.baseRef,
      });
      expect(violations.map(({ message }) => message)).toStrictEqual(
        expect.arrayContaining([
          expect.stringContaining("min-h-8"),
          expect.stringContaining("px-2"),
          expect.stringContaining("rounded-md"),
        ])
      );
    } finally {
      fs.rmSync(fixture.rootDir, { recursive: true, force: true });
    }
  });

  test("fails closed for an added control class expression and resolves supplied bases", () => {
    const fixture = createFixture();
    try {
      fs.writeFileSync(
        path.join(fixture.rootDir, "web/app/example.tsx"),
        `import { Button } from "@/components/ui/button";\n\nconst classes = "w-full";\n\nexport function Example() {\n  return <Button className={classes}>welcome</Button>;\n}\n`,
        "utf-8"
      );
      const violations = auditNewControlOverrides({
        rootDir: fixture.rootDir,
        baseRef: fixture.baseRef,
      });
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toMatch(/not statically classifiable/u);
      expect(resolveControlOverrideBase(fixture.rootDir, fixture.baseRef)).toBe(
        fixture.baseRef
      );
    } finally {
      fs.rmSync(fixture.rootDir, { recursive: true, force: true });
    }
  });

  test("does not audit generated Storybook output as production source", () => {
    expect(
      auditFileContent(
        "web/storybook-static/assets/iframe.js",
        'import "forbidden-runtime";'
      )
    ).toStrictEqual([]);
  });
});
