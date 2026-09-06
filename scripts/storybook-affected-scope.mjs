import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Keep this allowlist deliberately narrow. In particular, web/lib/identity
// contains production presentation panels and must remain fail-closed.
const CLEARLY_NON_PRESENTATION_PATHS = [
  /^docs\//u,
  /^(?:README|CHANGELOG|LICENSE)(?:\.|$)/u,
  /^web\/migrations\//u,
];

export function isClearlyNonPresentationPath(filePath) {
  const normalized = filePath.replaceAll("\\", "/");
  return CLEARLY_NON_PRESENTATION_PATHS.some((pattern) =>
    pattern.test(normalized)
  );
}

export function classifyAffectedPaths(filePaths) {
  const paths = filePaths.map((filePath) => filePath.trim()).filter(Boolean);

  if (paths.length === 0) {
    return { run: false, reason: "No changed paths were found." };
  }

  if (paths.every(isClearlyNonPresentationPath)) {
    return {
      run: false,
      reason: "Changed paths are clearly non-frontend or backend-only.",
    };
  }

  return {
    run: true,
    reason:
      "Frontend-capable or uncertain paths changed; run the cheap catalog check.",
  };
}

export function readChangedPaths(
  baseRef,
  headRef = "HEAD",
  cwd = process.cwd()
) {
  if (!baseRef || /^0+$/u.test(baseRef)) {
    throw new Error("No committed comparison base was provided.");
  }

  const output = execFileSync(
    "git",
    [
      "diff",
      "--name-only",
      "--diff-filter=ACMRTUXB",
      `${baseRef}...${headRef}`,
    ],
    { cwd, encoding: "utf-8" }
  );
  return output.split(/\r?\n/u).filter(Boolean);
}

function writeGitHubOutput(result) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }

  appendFileSync(
    outputPath,
    `run=${String(result.run)}\nreason=${result.reason.replaceAll("\n", " ")}\n`
  );
}

export function main({
  baseRef = process.env.STORYBOOK_SCOPE_BASE ?? process.argv[2] ?? "",
  headRef = process.env.STORYBOOK_SCOPE_HEAD ?? process.argv[3] ?? "HEAD",
  cwd = process.cwd(),
} = {}) {
  let result;
  let changedPaths;

  try {
    changedPaths = readChangedPaths(baseRef, headRef, cwd);
    result = classifyAffectedPaths(changedPaths);
  } catch (error) {
    changedPaths = ["<unknown-change-scope>"];
    result = {
      run: true,
      reason: `Unable to determine changed paths; failing closed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  console.log(`Storybook affected scope: ${result.run ? "run" : "skip"}`);
  console.log(`Reason: ${result.reason}`);
  console.log(`Changed paths: ${changedPaths.length}`);
  writeGitHubOutput(result);
  return result;
}

const isCli =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isCli) {
  main();
}
