/**
 * EFCC UI Control Recovery — Governance CLI Integration Tests.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveRepoRoot } from "../web/lib/governance/index";
import {
  getAffectedFiles,
  getSanitizedGitEnv,
  parseCliArgs,
  runGovernanceAudit,
} from "./audit-governance";

describe("Governance CLI", () => {
  it("parses CLI arguments correctly", () => {
    expect(parseCliArgs([])).toEqual({ mode: "full", targetFiles: undefined });
    expect(parseCliArgs(["--mode=fast"])).toEqual({
      mode: "fast",
      targetFiles: undefined,
    });
    expect(parseCliArgs(["--mode=affected"])).toEqual({
      mode: "affected",
      targetFiles: undefined,
    });
    expect(parseCliArgs(["--mode=full"])).toEqual({
      mode: "full",
      targetFiles: undefined,
    });
    expect(parseCliArgs(["--mode=release"])).toEqual({
      mode: "release",
      targetFiles: undefined,
    });
    expect(parseCliArgs(["--fast"])).toEqual({
      mode: "fast",
      targetFiles: undefined,
    });
    expect(parseCliArgs(["--affected"])).toEqual({
      mode: "affected",
      targetFiles: undefined,
    });
    expect(parseCliArgs(["--full"])).toEqual({
      mode: "full",
      targetFiles: undefined,
    });
    expect(parseCliArgs(["--release"])).toEqual({
      mode: "release",
      targetFiles: undefined,
    });
    expect(parseCliArgs(["--mode=affected", "web/app/page.tsx"])).toEqual({
      mode: "affected",
      targetFiles: ["web/app/page.tsx"],
    });
  });

  it("rejects release mode positional target files because release always scans full scope", () => {
    expect(() => parseCliArgs(["--mode=release", "web/app/page.tsx"])).toThrow(
      /release.*full.*scope|target files.*not allowed/i
    );
    expect(() => parseCliArgs(["web/app/page.tsx", "--release"])).toThrow(
      /release.*full.*scope|target files.*not allowed/i
    );

    const result = runGovernanceAudit({
      mode: "release",
      targetFiles: ["web/app/page.tsx"],
      now: "2026-09-03T00:00:00Z",
    });
    expect(result.success).toBe(false);
    expect(result.auditResult?.scanErrors?.[0].message).toMatch(
      /full repository scope/i
    );
  });

  it("rejects unknown --mode values instead of silently defaulting to full", () => {
    expect(() => parseCliArgs(["--mode=unknown"])).toThrow(
      /Unknown or invalid governance audit mode/i
    );
    expect(() => parseCliArgs(["--mode=invalid-mode"])).toThrow(
      /Unknown or invalid governance audit mode/i
    );
    expect(() => parseCliArgs(["--mode="])).toThrow(
      /Unknown or invalid governance audit mode/i
    );
    expect(() => parseCliArgs(["--mode-foo"])).toThrow(
      /Invalid --mode flag syntax/i
    );
    expect(() => parseCliArgs(["--unknown-flag"])).toThrow(
      /Unknown CLI argument or flag/i
    );
  });

  it("executes fast mode governance check successfully", () => {
    const result = runGovernanceAudit({ mode: "fast" });
    expect(result.success).toBe(true);
    expect(result.validationResult.valid).toBe(true);
    expect(result.auditResult).toBeUndefined();
  });

  it("executes full mode governance check successfully", () => {
    const result = runGovernanceAudit({
      mode: "full",
      now: "2026-09-03T00:00:00Z",
    });
    expect(result.success).toBe(true);
    expect(result.validationResult.valid).toBe(true);
    expect(result.auditResult).toBeDefined();
    expect(result.auditResult?.passed).toBe(true);
  });

  it("executes release mode governance check with strict full audit and waiver expiry tracking", () => {
    const result = runGovernanceAudit({
      mode: "release",
      now: "2026-09-03T00:00:00Z",
    });
    expect(result.success).toBe(true);
    expect(result.validationResult.valid).toBe(true);
    expect(result.auditResult).toBeDefined();
    expect(result.auditResult?.passed).toBe(true);
    expect(result.auditResult?.violations).toHaveLength(0);
  });

  it("fails and reports scanErrors when given a missing target file", () => {
    const result = runGovernanceAudit({
      mode: "affected",
      targetFiles: ["web/app/missing-file-for-cli-test.tsx"],
    });
    expect(result.success).toBe(false);
    expect(result.auditResult?.passed).toBe(false);
    expect(result.auditResult?.scanErrors?.length).toBeGreaterThan(0);
  });

  it("fails and reports scanErrors when given a directory as an explicit target path", () => {
    const result = runGovernanceAudit({
      mode: "affected",
      targetFiles: ["web/app"],
      now: "2026-09-03T00:00:00Z",
    });
    expect(result.success).toBe(false);
    expect(result.auditResult?.passed).toBe(false);
    expect(result.auditResult?.scanErrors?.length).toBeGreaterThan(0);
    expect(result.auditResult?.scanErrors?.[0].message).toContain("directory");
  });

  it("fails closed when given an invalid now reference date", () => {
    const result = runGovernanceAudit({
      mode: "full",
      now: "invalid-date-xyz",
    });
    expect(result.success).toBe(false);
    expect(result.validationResult.valid).toBe(false);
  });

  describe("Affected Scope & Waiver Policy", () => {
    it("discovers affected files cleanly and filters to auditable extensions", () => {
      const rootDir = resolveRepoRoot();
      const affected = getAffectedFiles(rootDir);
      expect(Array.isArray(affected)).toBe(true);
      for (const file of affected) {
        expect(
          /\.(ts|tsx|js|jsx|css|scss|sass|less|pcss|json|mjs)$/i.test(file)
        ).toBe(true);
      }
    });

    it("includes committed base changes plus staged, dirty, and untracked CSS preprocessors", () => {
      const tempRoot = fs.mkdtempSync(
        path.join("/tmp", "efcc-governance-git-")
      );
      const realRoot = resolveRepoRoot();
      const realBranchBefore = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: realRoot,
        encoding: "utf8",
        env: getSanitizedGitEnv(),
      }).trim();

      const git = (args: string) =>
        execSync(`git ${args}`, {
          cwd: tempRoot,
          encoding: "utf8",
          env: {
            ...getSanitizedGitEnv(process.env, tempRoot),
            GIT_CEILING_DIRECTORIES: tempRoot,
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
      try {
        git("init -q");
        git("config user.email governance@example.invalid");
        git("config user.name Governance");
        fs.writeFileSync(
          path.join(tempRoot, "base.ts"),
          "export const base = true;",
          "utf8"
        );
        git("add base.ts");
        git("commit -qm base");
        git("switch -qc feature");

        fs.writeFileSync(
          path.join(tempRoot, "committed.less"),
          ".card {}",
          "utf8"
        );
        git("add committed.less");
        git("commit -qm committed");

        fs.writeFileSync(
          path.join(tempRoot, "staged.sass"),
          ".card\n  color: red\n",
          "utf8"
        );
        git("add staged.sass");
        fs.writeFileSync(
          path.join(tempRoot, "dirty.scss"),
          ".card { color: red; }",
          "utf8"
        );
        fs.writeFileSync(
          path.join(tempRoot, "untracked.pcss"),
          ".card { color: red; }",
          "utf8"
        );

        const affected = getAffectedFiles(tempRoot);
        expect(affected).toEqual(
          expect.arrayContaining([
            "committed.less",
            "staged.sass",
            "dirty.scss",
            "untracked.pcss",
          ])
        );
        // Verify the temporary repository switched branches internally while real worktree remained untouched
        expect(git("rev-parse --abbrev-ref HEAD").trim()).toBe("feature");
        const realBranchAfter = execSync("git rev-parse --abbrev-ref HEAD", {
          cwd: realRoot,
          encoding: "utf8",
          env: getSanitizedGitEnv(),
        }).trim();
        expect(realBranchAfter).toBe(realBranchBefore);
      } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    });
    it("preserves isolation under simulated git hook/lint-staged environment overrides", () => {
      const tempRoot = fs.mkdtempSync(
        path.join("/tmp", "efcc-governance-override-")
      );
      const originalEnv = { ...process.env };
      const realRoot = resolveRepoRoot();
      const realBranchBefore = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: realRoot,
        encoding: "utf8",
        env: getSanitizedGitEnv(),
      }).trim();

      try {
        // Simulate Git hook / lint-staged environment overrides pointing to real repo or fake index
        process.env.GIT_DIR = path.join(realRoot, ".git");
        process.env.GIT_WORK_TREE = realRoot;
        process.env.GIT_INDEX_FILE = path.join(realRoot, ".git", "index");

        // 1. Negative /tmp discovery must still fail closed and report invalid git repository
        expect(() => getAffectedFiles("/tmp")).toThrow(
          /not a valid git repository/i
        );

        // 2. Audit in /tmp must still report git-discovery failure rather than scanning real repo
        const result = runGovernanceAudit({
          mode: "affected",
          rootDir: "/tmp",
          now: "2026-09-03T00:00:00Z",
        });
        expect(result.success).toBe(false);
        expect(result.auditResult?.scanErrors?.[0].file).toBe("git-discovery");

        // 3. Temporary repo discovery must succeed in its own sandbox without polluting real repo
        const git = (args: string) =>
          execSync(`git ${args}`, {
            cwd: tempRoot,
            encoding: "utf8",
            env: {
              ...getSanitizedGitEnv(process.env, tempRoot),
              GIT_CEILING_DIRECTORIES: tempRoot,
            },
            stdio: ["ignore", "pipe", "pipe"],
          });

        git("init -q");
        git("config user.email governance@example.invalid");
        git("config user.name Governance");
        fs.writeFileSync(
          path.join(tempRoot, "base.ts"),
          "export const base = true;",
          "utf8"
        );
        git("add base.ts");
        git("commit -qm base");
        git("switch -qc isolate-feature");
        fs.writeFileSync(
          path.join(tempRoot, "changed.tsx"),
          "export const x = 1;",
          "utf8"
        );
        git("add changed.tsx");

        const affected = getAffectedFiles(tempRoot);
        expect(affected).toContain("changed.tsx");

        // Verify real repo branch was never switched
        const realBranchAfter = execSync("git rev-parse --abbrev-ref HEAD", {
          cwd: realRoot,
          encoding: "utf8",
          env: getSanitizedGitEnv(),
        }).trim();
        expect(realBranchAfter).toBe(realBranchBefore);
      } finally {
        for (const key of Object.keys(process.env)) {
          if (!(key in originalEnv)) {
            delete process.env[key];
          }
        }
        Object.assign(process.env, originalEnv);
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("uses GITHUB_BASE_SHA in CI when provided", () => {
      const rootDir = resolveRepoRoot();
      const originalBaseSha = process.env.GITHUB_BASE_SHA;
      try {
        process.env.GITHUB_BASE_SHA = "HEAD~1";
        const affected = getAffectedFiles(rootDir);
        expect(Array.isArray(affected)).toBe(true);
      } finally {
        if (originalBaseSha !== undefined) {
          process.env.GITHUB_BASE_SHA = originalBaseSha;
        } else {
          delete process.env.GITHUB_BASE_SHA;
        }
      }
    });

    it("uses GITHUB_BASE_REF in CI when provided", () => {
      const rootDir = resolveRepoRoot();
      const originalBaseRef = process.env.GITHUB_BASE_REF;
      try {
        process.env.GITHUB_BASE_REF = "main";
        const affected = getAffectedFiles(rootDir);
        expect(Array.isArray(affected)).toBe(true);
      } finally {
        if (originalBaseRef !== undefined) {
          process.env.GITHUB_BASE_REF = originalBaseRef;
        } else {
          delete process.env.GITHUB_BASE_REF;
        }
      }
    });

    it("handles explicit empty targetFiles array in affected mode without falling back to full scan", () => {
      const result = runGovernanceAudit({
        mode: "affected",
        targetFiles: [],
        now: "2026-09-03T00:00:00Z",
      });
      expect(result.success).toBe(true);
      expect(result.auditResult?.passed).toBe(true);
      expect(result.auditResult?.scannedFilesCount).toBe(0);
      expect(result.auditResult?.violations).toHaveLength(0);
    });

    it("throws an actionable error when discovering affected files on an invalid git directory", () => {
      expect(() => getAffectedFiles("/tmp")).toThrow(
        /not a valid git repository/i
      );
    });

    it("surfaces scanErrors and returns nonzero failure when affected git discovery fails", () => {
      const result = runGovernanceAudit({
        mode: "affected",
        rootDir: "/tmp",
        now: "2026-09-03T00:00:00Z",
      });
      expect(result.success).toBe(false);
      expect(result.auditResult?.passed).toBe(false);
      expect(result.auditResult?.scanErrors?.length).toBeGreaterThan(0);
      expect(result.auditResult?.scanErrors?.[0].file).toBe("git-discovery");
      expect(result.auditResult?.scanErrors?.[0].message).toContain(
        "not a valid git repository"
      );
    });

    it("enforces zero waivers for newly changed UI in affected mode while full mode respects waivers", () => {
      // In affected mode, target file with historical debt fails because no waivers are applied
      const affectedResult = runGovernanceAudit({
        mode: "affected",
        targetFiles: ["web/app/prototype/page.tsx"],
        now: "2026-09-03T00:00:00Z",
      });
      expect(affectedResult.success).toBe(false);
      expect(affectedResult.auditResult?.passed).toBe(false);
      expect(affectedResult.auditResult?.violations.length).toBeGreaterThan(0);
      expect(affectedResult.auditResult?.waivedViolations).toHaveLength(0);

      // In full mode, the same target file applies historical waivers and passes cleanly
      const fullResult = runGovernanceAudit({
        mode: "full",
        targetFiles: ["web/app/prototype/page.tsx"],
        now: "2026-09-03T00:00:00Z",
      });
      expect(fullResult.success).toBe(true);
      expect(fullResult.auditResult?.passed).toBe(true);
      expect(fullResult.auditResult?.violations).toHaveLength(0);
      expect(fullResult.auditResult?.waivedViolations.length).toBeGreaterThan(
        0
      );
    });
  });
});
