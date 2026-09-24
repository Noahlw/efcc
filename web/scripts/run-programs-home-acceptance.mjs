import { execFile } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { readPlaywrightFailureEvidence } from "./playwright-failure-evidence.mjs";
import {
  currentRevision,
  firstCausalRuntimeSignal,
  prepareProgramsHarness,
} from "./programs-runtime-canary.mjs";

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const ARTIFACT_ROOT = path.join(
  REPO_ROOT,
  "test-results",
  "programs-home-acceptance"
);

export const HOME_ACCEPTANCE_VIEWPORTS = {
  "phone-390": { width: 390, height: 844 },
};

function runId() {
  return new Date()
    .toISOString()
    .replaceAll(/[^0-9a-z]/giu, "")
    .toLowerCase();
}

export function resolveHomeReportPath(rawPath, artifactDirectory) {
  return rawPath === undefined || rawPath === ""
    ? path.join(artifactDirectory, "home-results.json")
    : path.resolve(REPO_ROOT, rawPath);
}

async function writeJson(filename, value) {
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

async function runPlaywright(artifactDirectory, reportPath, prepared) {
  const environment = {
    ...process.env,
    PROGRAMS_TARGET_URL: prepared.target.origin,
    PROGRAMS_HOME_RESULTS_FILE: reportPath,
    PROGRAMS_HOME_OUTPUT_DIR: path.join(artifactDirectory, "browser-output"),
  };
  try {
    const result = await execFileAsync(
      "pnpm",
      [
        "exec",
        "playwright",
        "test",
        "--config=tests/e2e/programs-home-acceptance.config.ts",
      ],
      { cwd: REPO_ROOT, env: environment, maxBuffer: 16 * 1024 * 1024 }
    );
    await writeFile(
      path.join(artifactDirectory, "browser.log"),
      `${result.stdout}${result.stderr}`,
      "utf-8"
    );
    await access(reportPath);
  } catch (error) {
    if (error?.stdout || error?.stderr) {
      await writeFile(
        path.join(artifactDirectory, "browser.log"),
        `${error.stdout ?? ""}${error.stderr ?? ""}`,
        "utf-8"
      );
    }
    throw error;
  }
}

async function writeFailureArtifacts(
  artifactDirectory,
  reportPath,
  manifest,
  prepared
) {
  let runtimeLogs = [];
  if (prepared !== null) {
    try {
      prepared.server.debug();
    } catch {
      // Preserve the structured runtime logs even if debug output fails.
    }
    runtimeLogs = prepared.server.getLogs();
  }
  await writeJson(
    path.join(artifactDirectory, "runtime-logs.json"),
    runtimeLogs
  );
  const failureEvidence = await readPlaywrightFailureEvidence(
    reportPath,
    HOME_ACCEPTANCE_VIEWPORTS,
    {
      route: "/home, /notices, /messages, /programs",
      state: "member-visible Home-origin journey",
    }
  );
  const primaryFailure = failureEvidence[0] ?? null;
  await writeJson(path.join(artifactDirectory, "failure-summary.json"), {
    revision: manifest.revision,
    layer: manifest.layer,
    logicalScenario: primaryFailure?.logicalScenario ?? null,
    route: primaryFailure?.route ?? "/home",
    state: primaryFailure?.state ?? "member-visible Home-origin journey",
    viewport:
      primaryFailure?.viewport ?? HOME_ACCEPTANCE_VIEWPORTS["phone-390"],
    failureEvidence,
    message: manifest.failure,
    cause: manifest.failureCause ?? null,
    firstCausalRuntimeSignal:
      prepared === null ? null : firstCausalRuntimeSignal(runtimeLogs),
    target: manifest.target,
    reportPath: manifest.reportPath,
    downstreamSymptoms: [],
  });
}

async function runAcceptance(artifactDirectory, reportPath, manifest) {
  let prepared = null;
  try {
    prepared = await prepareProgramsHarness(artifactDirectory, {
      withFixture: false,
    });
    manifest.target = prepared.target.origin;
    await runPlaywright(artifactDirectory, reportPath, prepared);
    manifest.status = "passed";
  } catch (error) {
    manifest.status = "failed";
    manifest.failure = error instanceof Error ? error.message : String(error);
    manifest.failureCause =
      error?.cause instanceof Error ? error.cause.message : null;
    process.exitCode = 1;
    await writeFailureArtifacts(
      artifactDirectory,
      reportPath,
      manifest,
      prepared
    );
  } finally {
    if (prepared !== null) {
      try {
        await prepared.server.close();
      } catch (error) {
        manifest.status = "failed";
        manifest.failure = `${manifest.failure ?? ""}${manifest.failure ? "; " : ""}Harness close failed: ${error instanceof Error ? error.message : String(error)}`;
        process.exitCode = 1;
      }
    }
  }
}

async function main() {
  const artifactDirectory = process.env.PROGRAMS_HOME_ARTIFACT_DIRECTORY
    ? path.resolve(REPO_ROOT, process.env.PROGRAMS_HOME_ARTIFACT_DIRECTORY)
    : path.join(ARTIFACT_ROOT, runId());
  await mkdir(artifactDirectory, { recursive: true });
  const reportPath = resolveHomeReportPath(
    process.env.PROGRAMS_HOME_RESULTS_FILE,
    artifactDirectory
  );
  await mkdir(path.dirname(reportPath), { recursive: true });

  const manifest = {
    schemaVersion: 1,
    runtime: "createTestHarness",
    config: "web/wrangler.jsonc",
    suite: "tests/e2e/programs-home-acceptance.config.ts",
    revision: await currentRevision(),
    layer: "home-browser-acceptance",
    retries: 0,
    status: "running",
    startedAt: new Date().toISOString(),
    target: null,
    reportPath: path.relative(REPO_ROOT, reportPath),
    promotionRunId: process.env.PROGRAMS_PROMOTION_RUN_ID ?? null,
    failure: null,
  };
  await writeJson(path.join(artifactDirectory, "run.json"), manifest);
  await runAcceptance(artifactDirectory, reportPath, manifest);
  manifest.finishedAt = new Date().toISOString();
  await writeJson(path.join(artifactDirectory, "run.json"), manifest);
  console.log(
    JSON.stringify({
      status: manifest.status,
      revision: manifest.revision,
      target: manifest.target,
      reportPath: manifest.reportPath,
      artifactDirectory: path.relative(REPO_ROOT, artifactDirectory),
    })
  );
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === import.meta.filename
) {
  await main();
}
