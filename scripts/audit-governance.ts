#!/usr/bin/env node
/**
 * EFCC UI Control Recovery — Governance & Contract Enforcement CLI.
 *
 * Command-line entry point for CI and local verification:
 * - --mode=fast: validates the six governance registries only.
 * - --mode=affected: runs static source audit on changed/staged files.
 * - --mode=full: runs full governance registry validation and codebase source audit.
 * - --mode=release: runs strict full audit + waiver expiry verification for release gates.
 *
 * Usage:
 *   pnpm verify:governance
 *   pnpm verify:governance:affected
 *   pnpm verify:governance:full
 *   pnpm verify:governance:release
 *   pnpm verify:governance:fast
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  auditSourceCode,
  getCanonicalRegistries,
  resolveRepoRoot,
  validateRegistries,
  type AuditResult,
  type AuditScanError,
  type GovernanceValidationResult,
} from "../web/lib/governance/index";

export type AuditMode = "fast" | "affected" | "full" | "release";

export const VALID_AUDIT_MODES: readonly AuditMode[] = [
  "fast",
  "affected",
  "full",
  "release",
] as const;

export interface CliOptions {
  readonly mode: AuditMode;
  readonly targetFiles?: readonly string[];
  readonly rootDir?: string;
  readonly now?: Date | string | number;
}

export function parseCliArgs(args: readonly string[]): CliOptions {
  let mode: AuditMode = "full";
  const targetFiles: string[] = [];

  for (const arg of args) {
    if (arg.startsWith("--mode=")) {
      const parsedMode = arg.slice(7).trim().toLowerCase();
      if ((VALID_AUDIT_MODES as readonly string[]).includes(parsedMode)) {
        mode = parsedMode as AuditMode;
      } else {
        throw new Error(
          `Unknown or invalid governance audit mode: "${arg.slice(7)}". Allowed modes: ${VALID_AUDIT_MODES.join(", ")}`
        );
      }
    } else if (arg === "--mode" || arg.startsWith("--mode")) {
      throw new Error(
        `Invalid --mode flag syntax: "${arg}". Use --mode=<${VALID_AUDIT_MODES.join("|")}>`
      );
    } else if (arg === "--fast") {
      mode = "fast";
    } else if (arg === "--affected") {
      mode = "affected";
    } else if (arg === "--full") {
      mode = "full";
    } else if (arg === "--release") {
      mode = "release";
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown CLI argument or flag: "${arg}"`);
    } else {
      targetFiles.push(arg);
    }
  }

  if (mode === "release" && targetFiles.length > 0) {
    throw new Error(
      "Release governance audits always run the full repository scope; positional target files are not allowed."
    );
  }

  return {
    mode,
    targetFiles: targetFiles.length > 0 ? targetFiles : undefined,
  };
}

/**
 * Sanitizes process environment for child git processes so that discovery honors
 * the explicit rootDir rather than inherited repository, worktree, index, or
 * object-directory overrides (such as those injected by git hooks or lint-staged).
 * Sets GIT_CEILING_DIRECTORIES to the resolved explicit rootDir when provided.
 */
export function getSanitizedGitEnv(
  baseEnvOrRootDir?: NodeJS.ProcessEnv | string,
  explicitRootDir?: string
): NodeJS.ProcessEnv {
  let baseEnv: NodeJS.ProcessEnv = process.env;
  let rootDir: string | undefined = explicitRootDir;

  if (typeof baseEnvOrRootDir === "string") {
    rootDir = baseEnvOrRootDir;
  } else if (baseEnvOrRootDir) {
    baseEnv = baseEnvOrRootDir;
  }

  const env: NodeJS.ProcessEnv = { ...baseEnv };
  const gitOverrideVars = [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_COMMON_DIR",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_PREFIX",
    "GIT_GRAFT_FILE",
    "GIT_NAMESPACE",
    "GIT_SHALLOW_FILE",
    "GIT_CEILING_DIRECTORIES",
  ];
  for (const key of gitOverrideVars) {
    delete env[key];
  }
  if (rootDir) {
    env.GIT_CEILING_DIRECTORIES = path.resolve(rootDir);
  }
  return env;
}

function execGit(command: string, rootDir: string): string {
  const resolvedRoot = path.resolve(rootDir);
  return execSync(command, {
    cwd: resolvedRoot,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    env: getSanitizedGitEnv(process.env, resolvedRoot),
  });
}

/**
 * Discovers affected files from git diff relative to upstream or merge-base.
 * Includes staged, unstaged, and untracked paths locally and uses GITHUB_BASE_SHA/PR base in CI.
 */
export function getAffectedFiles(rootDir: string): string[] {
  const affectedSet = new Set<string>();
  const AUDITABLE_EXTENSION_REGEX =
    /\.(ts|tsx|js|jsx|css|scss|sass|less|pcss|json|mjs)$/i;

  const collectIfAuditable = (file: string) => {
    const cleaned = file
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/\\/g, "/");
    if (cleaned && AUDITABLE_EXTENSION_REGEX.test(cleaned)) {
      affectedSet.add(cleaned);
    }
  };

  // Verify that rootDir is inside a working tree
  try {
    const worktreeState = execGit(
      "git rev-parse --is-inside-work-tree",
      rootDir
    ).trim();
    if (worktreeState !== "true") {
      throw new Error(
        `git reports a non-worktree repository (${worktreeState || "empty response"})`
      );
    }
  } catch (err) {
    throw new Error(
      `Directory "${rootDir}" is not a valid git repository or git command failed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  // 1. Gather local dirty changes: staged, unstaged, and untracked files
  try {
    const stagedOutput = execGit(
      "git diff --name-only --cached --diff-filter=ACMRTUXB",
      rootDir
    );
    for (const line of stagedOutput.split("\n")) {
      collectIfAuditable(line);
    }
  } catch (err) {
    throw new Error(
      `Failed to read staged git diff: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  try {
    const unstagedOutput = execGit(
      "git diff --name-only --diff-filter=ACMRTUXB",
      rootDir
    );
    for (const line of unstagedOutput.split("\n")) {
      collectIfAuditable(line);
    }
  } catch (err) {
    throw new Error(
      `Failed to read unstaged git diff: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  try {
    const untrackedOutput = execGit(
      "git ls-files --others --exclude-standard",
      rootDir
    );
    for (const line of untrackedOutput.split("\n")) {
      collectIfAuditable(line);
    }
  } catch (err) {
    throw new Error(
      `Failed to read untracked files: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  try {
    const statusOutput = execGit("git status --porcelain", rootDir);
    for (const line of statusOutput.split("\n")) {
      const match = line.trim().match(/^[A-Z?]{1,2}\s+(.+)$/);
      if (match) {
        let filePath = match[1].trim();
        if (filePath.includes("->")) {
          filePath = filePath.split("->")[1].trim();
        }
        collectIfAuditable(filePath);
      }
    }
  } catch (err) {
    throw new Error(
      `Failed to read git status: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 2. Resolve committed PR / branch base reference (merging dirty changes with branch commits)
  let baseRef: string | undefined;

  if (
    process.env.GITHUB_BASE_SHA &&
    process.env.GITHUB_BASE_SHA.trim().length > 0
  ) {
    baseRef = process.env.GITHUB_BASE_SHA.trim();
  } else if (
    process.env.GITHUB_BASE_REF &&
    process.env.GITHUB_BASE_REF.trim().length > 0
  ) {
    const prBase = process.env.GITHUB_BASE_REF.trim();
    try {
      const mergeBase = execGit(
        `git merge-base origin/${prBase} HEAD`,
        rootDir
      ).trim();
      if (mergeBase) baseRef = mergeBase;
    } catch {
      try {
        const directMergeBase = execGit(
          `git merge-base ${prBase} HEAD`,
          rootDir
        ).trim();
        if (directMergeBase) baseRef = directMergeBase;
      } catch {
        baseRef = `origin/${prBase}`;
      }
    }
  } else {
    // Local discovery: first check if an upstream tracking branch is configured
    try {
      const upstreamMergeBase = execGit(
        "git merge-base @{u} HEAD",
        rootDir
      ).trim();
      if (upstreamMergeBase) {
        baseRef = upstreamMergeBase;
      }
    } catch {
      // Upstream tracking not configured or invalid, try candidate branches
    }

    if (!baseRef) {
      const candidates = ["origin/main", "main", "origin/master", "master"];
      for (const candidate of candidates) {
        try {
          const mergeBase = execGit(
            `git merge-base ${candidate} HEAD`,
            rootDir
          ).trim();
          if (mergeBase) {
            baseRef = mergeBase;
            break;
          }
        } catch {
          // Try next candidate
        }
      }
    }

    if (!baseRef) {
      try {
        const headPrev = execGit(
          "git rev-parse --verify HEAD~1",
          rootDir
        ).trim();
        if (headPrev) {
          baseRef = "HEAD~1";
        }
      } catch {
        // Single commit repository or shallow clone without HEAD~1
      }
    }
  }

  if (!baseRef) {
    throw new Error(
      "Unable to resolve a committed git base for affected-file discovery; refusing to scan only dirty files."
    );
  }

  // 3. If a base ref was resolved, diff committed branch changes against base and merge them
  if (baseRef) {
    try {
      const branchDiff = execGit(
        `git diff --name-only --diff-filter=ACMRTUXB ${baseRef}...HEAD`,
        rootDir
      );
      for (const line of branchDiff.split("\n")) {
        collectIfAuditable(line);
      }
    } catch {
      try {
        const directDiff = execGit(
          `git diff --name-only --diff-filter=ACMRTUXB ${baseRef} HEAD`,
          rootDir
        );
        for (const line of directDiff.split("\n")) {
          collectIfAuditable(line);
        }
      } catch (err) {
        throw new Error(
          `Failed to calculate git diff against base ref "${baseRef}": ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }
  }

  return Array.from(affectedSet);
}
export function runGovernanceAudit(options: CliOptions): {
  success: boolean;
  validationResult: GovernanceValidationResult;
  auditResult?: AuditResult;
} {
  const repoRoot = options.rootDir ?? resolveRepoRoot();
  const registries = getCanonicalRegistries();

  if (options.mode === "release" && options.targetFiles !== undefined) {
    const validationResult = validateRegistries(registries, {
      now: options.now,
    });
    const scanErrors: AuditScanError[] = [
      {
        file: "cli",
        message:
          "Release governance audits always run the full repository scope; targetFiles are not allowed.",
      },
    ];
    return {
      success: false,
      validationResult,
      auditResult: {
        passed: false,
        violations: [],
        waivedViolations: [],
        scannedFilesCount: 0,
        scanErrors,
      },
    };
  }

  console.log(
    "================================================================================"
  );
  console.log(
    `EFCC UI Control Recovery — Governance & Contract Audit [mode: ${options.mode}]`
  );
  console.log(
    "================================================================================"
  );

  // 1. Validate Registries
  const validationResult = validateRegistries(registries, { now: options.now });

  console.log("\n[1/2] Governance Registries Validation:");
  console.log(
    `  - Scenarios:           ${validationResult.stats.scenarioCount}`
  );
  console.log(
    `  - UI Contracts:        ${validationResult.stats.contractCount}`
  );
  console.log(
    `  - Approval Packages:   ${validationResult.stats.approvalCount}`
  );
  console.log(`  - Exact Waivers:       ${validationResult.stats.waiverCount}`);
  console.log(
    `  - Preservation Refs:   ${validationResult.stats.preservationCount}`
  );
  console.log(
    `  - Native Exceptions:   ${validationResult.stats.nativeExceptionCount}`
  );

  if (!validationResult.valid) {
    console.error(
      `\n❌ Registry Validation FAILED with ${validationResult.errors.length} error(s):`
    );
    for (const err of validationResult.errors) {
      console.error(
        `  - [${err.code}] (${err.registry}${err.entryId ? ` / ${err.entryId}` : ""}): ${err.message}`
      );
    }
    return { success: false, validationResult };
  }
  console.log("  ✓ All governance registries validated successfully.");

  if (options.mode === "fast") {
    console.log(
      "\n================================================================================"
    );
    console.log("✓ Fast governance check completed successfully.");
    console.log(
      "================================================================================"
    );
    return { success: true, validationResult };
  }

  // 2. Static Source Audit
  let targetFiles: readonly string[] | undefined = options.targetFiles;
  if (options.mode === "affected" && targetFiles === undefined) {
    try {
      targetFiles = getAffectedFiles(repoRoot);
    } catch (err) {
      console.error(
        `\n❌ Git affected discovery FAILED: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      const scanErrors: AuditScanError[] = [
        {
          file: "git-discovery",
          message: `Affected file discovery failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
          error: err,
        },
      ];
      return {
        success: false,
        validationResult,
        auditResult: {
          passed: false,
          violations: [],
          waivedViolations: [],
          scannedFilesCount: 0,
          scanErrors,
        },
      };
    }
    console.log(
      `\n[2/2] Static Source Audit (Affected Scope: ${targetFiles.length} files):`
    );
  } else if (options.mode === "affected" && targetFiles !== undefined) {
    console.log(
      `\n[2/2] Static Source Audit (Affected Scope: ${targetFiles.length} target files):`
    );
  } else {
    console.log(`\n[2/2] Static Source Audit (Full Repository Scope):`);
  }

  // In affected mode, do NOT let historical waivers hide newly changed UI.
  // Full and release modes evaluate historical waivers as designed.
  const activeWaivers = options.mode === "affected" ? [] : registries.waivers;

  const auditResult = auditSourceCode({
    rootDir: repoRoot,
    targetFiles,
    waivers: activeWaivers,
    nativeExceptions: registries.nativeExceptions,
    now: options.now,
  });

  console.log(`  - Files Scanned:       ${auditResult.scannedFilesCount}`);
  console.log(`  - Active Violations:   ${auditResult.violations.length}`);
  console.log(
    `  - Waived Items:        ${auditResult.waivedViolations.length}`
  );

  if (auditResult.waivedViolations.length > 0) {
    console.log(`\n  Documented Historical Debt (Ledger-Backed Waivers):`);
    for (const w of auditResult.waivedViolations) {
      console.log(
        `    - [${w.waiverId}] ${w.ruleId} in ${w.file}${w.line ? `:${w.line}` : ""}`
      );
    }
  }

  if (auditResult.scanErrors && auditResult.scanErrors.length > 0) {
    console.error(
      `\n❌ Source Governance Audit encountered ${auditResult.scanErrors.length} scan error(s):`
    );
    for (const err of auditResult.scanErrors) {
      console.error(`  - ${err.file}: ${err.message}`);
    }
  }

  if (!auditResult.passed) {
    if (auditResult.violations.length > 0) {
      console.error(
        `\n❌ Source Governance Audit FAILED with ${auditResult.violations.length} violation(s):`
      );
      for (const v of auditResult.violations) {
        console.error(
          `\n  [${v.ruleId}] in ${v.file}${v.line ? `:${v.line}` : ""}`
        );
        console.error(`  Layer:      ${v.likelyOwnershipLayer.toUpperCase()}`);
        console.error(`  Message:    ${v.message}`);
        if (v.snippet) {
          console.error(`  Snippet:    ${v.snippet}`);
        }
      }
      console.error(
        "\nAction: Refactor using Civic Minimal Tailwind token utilities, shadcn primitives, or obtain an owner-approved waiver."
      );
    }
    return { success: false, validationResult, auditResult };
  }
  if (options.mode === "release") {
    const now = options.now !== undefined ? new Date(options.now) : new Date();
    const thirtyDaysAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const upcomingExpirations = registries.waivers.filter((w) => {
      if (w.status !== "active") return false;
      const exp = new Date(w.expiresAt);
      return (
        !Number.isNaN(exp.getTime()) && exp >= now && exp <= thirtyDaysAhead
      );
    });

    console.log("\n[Release Gate Invariants]");
    console.log(`  - Registry Invariants:   PASSED (0 errors)`);
    console.log(`  - Source Audit:          PASSED (0 active violations)`);
    console.log(`  - Total Scanned Files:   ${auditResult.scannedFilesCount}`);
    console.log(
      `  - Active Waivers Total:  ${registries.waivers.filter((w) => w.status === "active").length}`
    );
    if (upcomingExpirations.length > 0) {
      console.log(
        `  - Waivers Expiring Soon (<30d): ${upcomingExpirations.length}`
      );
      for (const w of upcomingExpirations) {
        console.log(
          `      * [${w.id}] expires ${w.expiresAt} (owner: ${w.owner})`
        );
      }
    } else {
      console.log("  - Waivers Expiring Soon (<30d): 0");
    }
    console.log(
      "\n================================================================================"
    );
    console.log("✓ Release Gate Governance & Contract Audit PASSED.");
    console.log(
      "================================================================================"
    );
    return { success: true, validationResult, auditResult };
  }

  console.log("  ✓ All source rules satisfied (zero un-waived violations).");

  console.log(
    "\n================================================================================"
  );
  console.log("✓ Governance & Contract Audit PASSED.");
  console.log(
    "================================================================================"
  );

  return { success: true, validationResult, auditResult };
}

// Direct execution entry point
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename ?? "")
) {
  const cliOptions = parseCliArgs(process.argv.slice(2));
  const result = runGovernanceAudit(cliOptions);
  process.exit(result.success ? 0 : 1);
}
