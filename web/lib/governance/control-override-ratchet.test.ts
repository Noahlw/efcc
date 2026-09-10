import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { auditFileContent } from "./audit";
import {
  auditNewControlOverrides,
  auditNewPresentationOverrides,
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

  test("tracks every added line in a multiline control element", () => {
    const fixture = createFixture();
    try {
      fs.writeFileSync(
        path.join(fixture.rootDir, "web/app/example.tsx"),
        `import { Button } from "@/components/ui/button";

export function Example() {
  return (
    <Button
      aria-label="welcome"
      className="min-h-8"
    >
      welcome
    </Button>
  );
}
`,
        "utf-8"
      );
      expect(
        auditNewControlOverrides({
          rootDir: fixture.rootDir,
          baseRef: fixture.baseRef,
        }).map(({ message }) => message)
      ).toStrictEqual([expect.stringContaining("min-h-8")]);
    } finally {
      fs.rmSync(fixture.rootDir, { recursive: true, force: true });
    }
  });

  test("does not treat nested object spreads as caller prop spreads", () => {
    const fixture = createFixture();
    try {
      fs.writeFileSync(
        path.join(fixture.rootDir, "web/app/example.tsx"),
        `import { Input } from "@/components/ui/input";

export function Example() {
  const value = "welcome";
  return (
    <Input
      value={value}
      onChange={() => update((previous) => ({ ...previous, value }))}
    />
  );
}
`,
        "utf-8"
      );
      expect(
        auditNewPresentationOverrides({
          rootDir: fixture.rootDir,
          baseRef: fixture.baseRef,
        })
      ).toStrictEqual([]);

      fs.writeFileSync(
        path.join(fixture.rootDir, "web/app/example.tsx"),
        `import { Input } from "@/components/ui/input";

export function Example() {
  return <Input {...inputProps} />;
}
`,
        "utf-8"
      );
      const violations = auditNewPresentationOverrides({
        rootDir: fixture.rootDir,
        baseRef: fixture.baseRef,
      });
      expect(violations).toHaveLength(1);
      expect(violations[0]?.message).toContain("spread props");
    } finally {
      fs.rmSync(fixture.rootDir, { recursive: true, force: true });
    }
  });

  test("fails closed when a conditional class branch is not a literal", () => {
    const fixture = createFixture();
    try {
      fs.writeFileSync(
        path.join(fixture.rootDir, "web/app/example.tsx"),
        `import { Button } from "@/components/ui/button";

const condition = true;
const unknownClass = "text-muted-foreground";

export function Example() {
  return (
    <Button className={condition ? "text-sm" : unknownClass}>
      welcome
    </Button>
  );
}
`,
        "utf-8"
      );
      const violations = auditNewControlOverrides({
        rootDir: fixture.rootDir,
        baseRef: fixture.baseRef,
      });
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toMatch(/not statically classifiable/u);
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

  test("audits namespace aliases for app-facing controls", () => {
    const fixture = createFixture();
    try {
      fs.writeFileSync(
        path.join(fixture.rootDir, "web/app/example.tsx"),
        `import * as UI from "@/components/ui/button";

export function Example() {
  return <UI.Button className="min-h-8">welcome</UI.Button>;
}
`,
        "utf-8"
      );
      const violations = auditNewControlOverrides({
        rootDir: fixture.rootDir,
        baseRef: fixture.baseRef,
      });
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain("min-h-8");
    } finally {
      fs.rmSync(fixture.rootDir, { recursive: true, force: true });
    }
  });

  test("audits wrapped control aliases and createElement factories", () => {
    const fixture = createFixture();
    try {
      fs.writeFileSync(
        path.join(fixture.rootDir, "web/app/example.tsx"),
        `import { Button } from "@/components/ui/button";
import * as React from "react";

const WrappedButton = withTracking(Button);

export function Example() {
  return (
    <>
      <WrappedButton className="rounded-md">wrapped</WrappedButton>
      {React.createElement(Button, { className: "px-2" })}
    </>
  );
}
`,
        "utf-8"
      );
      const violations = auditNewControlOverrides({
        rootDir: fixture.rootDir,
        baseRef: fixture.baseRef,
      });
      expect(violations.map(({ message }) => message)).toStrictEqual([
        expect.stringContaining("rounded-md"),
        expect.stringContaining("px-2"),
      ]);
    } finally {
      fs.rmSync(fixture.rootDir, { recursive: true, force: true });
    }
  });

  test("audits T09 surface and overlay ownership while preserving the neutral API", () => {
    const fixture = createFixture();
    try {
      fs.writeFileSync(
        path.join(fixture.rootDir, "web/app/example.tsx"),
        `import { Card } from "@/components/ui/card";
import { DialogContent } from "@/components/ui/dialog";

export function Example() {
  return (
    <>
      <Card className="border-0 bg-transparent shadow-none">surface</Card>
      <DialogContent className="max-h-[60dvh] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        <div className="z-[9999]">overlay</div>
      </DialogContent>
    </>
  );
}
`,
        "utf-8"
      );
      const violations = auditNewPresentationOverrides({
        rootDir: fixture.rootDir,
        baseRef: fixture.baseRef,
      });
      expect(violations.map(({ message }) => message)).toStrictEqual(
        expect.arrayContaining([
          expect.stringContaining("surface/background"),
          expect.stringContaining("overlay/containment"),
          expect.stringContaining("overlay/safe-area"),
          expect.stringContaining("raw z-index"),
        ])
      );
    } finally {
      fs.rmSync(fixture.rootDir, { recursive: true, force: true });
    }
  });

  test("requires exactly one feedback announcement owner", () => {
    const fixture = createFixture();
    try {
      fs.writeFileSync(
        path.join(fixture.rootDir, "web/app/example.tsx"),
        `import { Alert } from "@/components/ui/alert";
import { announce } from "@/lib/live-region";

export function Example() {
  announce("saved");
  return <Alert>saved</Alert>;
}
`,
        "utf-8"
      );
      expect(
        auditNewPresentationOverrides({
          rootDir: fixture.rootDir,
          baseRef: fixture.baseRef,
        }).map(({ message }) => message)
      ).toStrictEqual([
        expect.stringContaining("exactly one announcement owner"),
      ]);

      fs.writeFileSync(
        path.join(fixture.rootDir, "web/app/example.tsx"),
        `import { Alert } from "@/components/ui/alert";
import { announce } from "@/lib/live-region";

export function Example() {
  announce("saved");
  return <Alert announcement="none">saved</Alert>;
}
`,
        "utf-8"
      );
      expect(
        auditNewPresentationOverrides({
          rootDir: fixture.rootDir,
          baseRef: fixture.baseRef,
        })
      ).toStrictEqual([]);
    } finally {
      fs.rmSync(fixture.rootDir, { recursive: true, force: true });
    }
  });

  test("scopes feedback ownership to the owning function", () => {
    const fixture = createFixture();
    try {
      fs.writeFileSync(
        path.join(fixture.rootDir, "web/app/example.tsx"),
        `import { Alert } from "@/components/ui/alert";
import { announce } from "@/lib/live-region";

export function UnrelatedAnnouncement() {
  announce("saved");
  return <div>saved</div>;
}

export function VisibleState() {
  return <Alert>saved</Alert>;
}
`,
        "utf-8"
      );

      expect(
        auditNewPresentationOverrides({
          rootDir: fixture.rootDir,
          baseRef: fixture.baseRef,
        })
      ).toStrictEqual([]);
    } finally {
      fs.rmSync(fixture.rootDir, { recursive: true, force: true });
    }
  });

  test("limits raw z-index checks to descendants of an overlay element", () => {
    const fixture = createFixture();
    try {
      fs.writeFileSync(
        path.join(fixture.rootDir, "web/app/example.tsx"),
        `import { DialogContent } from "@/components/ui/dialog";

export function Example() {
  return (
    <>
      <div className="z-[1]">unrelated layer</div>
      <DialogContent>
        <div className="z-[9999]">overlay child</div>
      </DialogContent>
    </>
  );
}
`,
        "utf-8"
      );

      const rawZIndexViolations = auditNewPresentationOverrides({
        rootDir: fixture.rootDir,
        baseRef: fixture.baseRef,
      }).filter(({ message }) => message.includes("raw z-index"));
      expect(rawZIndexViolations).toHaveLength(1);
      expect(rawZIndexViolations[0]?.snippet).toContain("z-[9999]");
      expect(rawZIndexViolations[0]?.snippet).not.toContain("z-[1]");
    } finally {
      fs.rmSync(fixture.rootDir, { recursive: true, force: true });
    }
  });

  test("ignores unrelated z-index when an overlay primitive is only imported", () => {
    const fixture = createFixture();
    try {
      fs.writeFileSync(
        path.join(fixture.rootDir, "web/app/example.tsx"),
        `import { DialogContent } from "@/components/ui/dialog";

export function Example() {
  return <div className="z-[1]">unrelated layer</div>;
}
`,
        "utf-8"
      );

      expect(
        auditNewPresentationOverrides({
          rootDir: fixture.rootDir,
          baseRef: fixture.baseRef,
        }).filter(({ message }) => message.includes("raw z-index"))
      ).toStrictEqual([]);
    } finally {
      fs.rmSync(fixture.rootDir, { recursive: true, force: true });
    }
  });

  test("catches a new visible Alert beside an unchanged announcer", () => {
    const fixture = createFixture();
    try {
      fs.writeFileSync(
        path.join(fixture.rootDir, "web/app/example.tsx"),
        `import { Alert } from "@/components/ui/alert";
import { announce } from "@/lib/live-region";

export function Example() {
  announce("saved");
  return <div>saved</div>;
}
`,
        "utf-8"
      );
      git(fixture.rootDir, "add", ".");
      git(fixture.rootDir, "commit", "-qm", "existing announcement");
      const baseRef = git(fixture.rootDir, "rev-parse", "HEAD");

      fs.writeFileSync(
        path.join(fixture.rootDir, "web/app/example.tsx"),
        `import { Alert } from "@/components/ui/alert";

export function Example() {
  return <Alert>saved</Alert>;
}
`,
        "utf-8"
      );
      expect(
        auditNewPresentationOverrides({ rootDir: fixture.rootDir, baseRef })
      ).toStrictEqual([]);

      fs.writeFileSync(
        path.join(fixture.rootDir, "web/app/example.tsx"),
        `import { Alert } from "@/components/ui/alert";
import { announce } from "@/lib/live-region";

export function Example() {
  announce("saved");
  return (
    <>
      <div>saved</div>
      <Alert>saved</Alert>
    </>
  );
}
`,
        "utf-8"
      );
      expect(
        auditNewPresentationOverrides({
          rootDir: fixture.rootDir,
          baseRef,
        }).map(({ message }) => message)
      ).toStrictEqual([expect.stringContaining("announce() remains")]);
    } finally {
      fs.rmSync(fixture.rootDir, { recursive: true, force: true });
    }
  });

  test("fails closed for imported control recipes only", () => {
    const fixture = createFixture();
    try {
      fs.writeFileSync(
        path.join(fixture.rootDir, "web/app/example.tsx"),
        `import { buttonVariants } from "@/components/ui/button";

const unrelated = condition ? "min-h-8" : "text-sm";

export function Example() {
  return <div className={buttonVariants({ size: "sm" })}>{unrelated}</div>;
}
`,
        "utf-8"
      );
      const violations = auditNewControlOverrides({
        rootDir: fixture.rootDir,
        baseRef: fixture.baseRef,
      });
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toMatch(/imported control recipe/u);
      expect(violations[0].message).not.toContain("min-h-8");
    } finally {
      fs.rmSync(fixture.rootDir, { recursive: true, force: true });
    }
  });

  test("classifies literal conditional classes that contain Tailwind variants", () => {
    const fixture = createFixture();
    try {
      fs.writeFileSync(
        path.join(fixture.rootDir, "web/app/example.tsx"),
        `import { Button } from "@/components/ui/button";

const active = true;

export function Example() {
  return (
    <Button
      className={
        active
          ? "w-full hover:bg-primary"
          : "w-fit hover:bg-secondary"
      }
    >
      welcome
    </Button>
  );
}
`,
        "utf-8"
      );
      expect(
        auditNewPresentationOverrides({
          rootDir: fixture.rootDir,
          baseRef: fixture.baseRef,
        })
      ).toStrictEqual([]);
    } finally {
      fs.rmSync(fixture.rootDir, { recursive: true, force: true });
    }
  });

  test("does not reclassify unchanged control styling when another attribute is added", () => {
    const fixture = createFixture();
    try {
      fs.writeFileSync(
        path.join(fixture.rootDir, "web/app/example.tsx"),
        `import { Button } from "@/components/ui/button";

export function Example() {
  return (
    <Button
      className="min-h-8"
    >
      welcome
    </Button>
  );
}
`,
        "utf-8"
      );
      git(fixture.rootDir, "add", ".");
      git(fixture.rootDir, "commit", "-qm", "historical control styling");
      const historicalBase = git(fixture.rootDir, "rev-parse", "HEAD");

      fs.writeFileSync(
        path.join(fixture.rootDir, "web/app/example.tsx"),
        `import { Button } from "@/components/ui/button";

export function Example() {
  return (
    <Button
      className="min-h-8"
      aria-label="welcome"
    >
      welcome
    </Button>
  );
}
`,
        "utf-8"
      );
      expect(
        auditNewControlOverrides({
          rootDir: fixture.rootDir,
          baseRef: historicalBase,
        })
      ).toStrictEqual([]);
    } finally {
      fs.rmSync(fixture.rootDir, { recursive: true, force: true });
    }
  });
});
