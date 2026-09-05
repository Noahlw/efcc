import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  currentRevision,
  firstCausalRuntimeSignal,
  prepareProgramsHarness,
} from "./programs-runtime-canary.mjs";

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const ARTIFACT_ROOT = path.join(
  REPO_ROOT,
  "test-results",
  "programs-browser-acceptance"
);

function runId() {
  return new Date()
    .toISOString()
    .replaceAll(/[^0-9a-z]/giu, "")
    .toLowerCase();
}

async function writeJson(filename, value) {
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function resolveBrowserReportPath(rawPath, artifactDirectory) {
  return rawPath === undefined || rawPath === ""
    ? path.join(artifactDirectory, "browser-results.json")
    : path.resolve(REPO_ROOT, rawPath);
}

async function main() {
  const artifactDirectory = process.env.PROGRAMS_BROWSER_ARTIFACT_DIRECTORY
    ? path.resolve(REPO_ROOT, process.env.PROGRAMS_BROWSER_ARTIFACT_DIRECTORY)
    : path.join(ARTIFACT_ROOT, runId());
  await mkdir(artifactDirectory, { recursive: true });
  const reportPath = resolveBrowserReportPath(
    process.env.PROGRAMS_BROWSER_RESULTS_FILE,
    artifactDirectory
  );
  await mkdir(path.dirname(reportPath), { recursive: true });
  const manifest = {
    schemaVersion: 1,
    runtime: "createTestHarness",
    config: "web/wrangler.jsonc",
    suite: "tests/e2e/programs-participant-acceptance.config.ts",
    revision: await currentRevision(),
    layer: "browser-acceptance",
    retries: 0,
    status: "running",
    startedAt: new Date().toISOString(),
    target: null,
    reportPath: path.relative(REPO_ROOT, reportPath),
    promotionRunId: process.env.PROGRAMS_PROMOTION_RUN_ID ?? null,
    failure: null,
  };
  await writeJson(path.join(artifactDirectory, "run.json"), manifest);

  let prepared = null;
  let failure = null;
  let runtimeLogs = [];
  try {
    prepared = await prepareProgramsHarness(artifactDirectory, {
      withFixture: false,
    });
    manifest.target = prepared.target.origin;
    const environment = {
      ...process.env,
      PROGRAMS_TARGET_URL: prepared.target.origin,
      PROGRAMS_BROWSER_RESULTS_FILE: reportPath,
      PROGRAMS_BROWSER_OUTPUT_DIR: path.join(
        artifactDirectory,
        "browser-output"
      ),
    };
    const result = await execFileAsync(
      "pnpm",
      [
        "exec",
        "playwright",
        "test",
        "--config=tests/e2e/programs-participant-acceptance.config.ts",
      ],
      { cwd: REPO_ROOT, env: environment, maxBuffer: 16 * 1024 * 1024 }
    );
    await writeFile(
      path.join(artifactDirectory, "browser.log"),
      `${result.stdout}${result.stderr}`,
      "utf8"
    );
    manifest.status = "passed";
  } catch (error) {
    failure = error;
    manifest.status = "failed";
    manifest.failure = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
    if (error?.stdout || error?.stderr) {
      await writeFile(
        path.join(artifactDirectory, "browser.log"),
        `${error.stdout ?? ""}${error.stderr ?? ""}`,
        "utf8"
      );
    }
  } finally {
    if (prepared !== null) {
      if (failure !== null) {
        try {
          prepared.server.debug();
        } catch {
          // Structured logs remain available below.
        }
        runtimeLogs = prepared.server.getLogs();
        await writeJson(
          path.join(artifactDirectory, "runtime-logs.json"),
          runtimeLogs
        );
        await writeJson(path.join(artifactDirectory, "failure-summary.json"), {
          revision: manifest.revision,
          layer: manifest.layer,
          logicalScenario: null,
          route: null,
          state: null,
          viewport: null,
          message: manifest.failure,
          firstCausalRuntimeSignal: firstCausalRuntimeSignal(runtimeLogs),
          target: manifest.target,
          downstreamSymptoms: [],
        });
      }
      await prepared.server.close().catch((error) => {
        manifest.status = "failed";
        manifest.failure = `${manifest.failure ?? ""}${manifest.failure ? "; " : ""}Harness close failed: ${error instanceof Error ? error.message : String(error)}`;
        process.exitCode = 1;
      });
    }
    manifest.finishedAt = new Date().toISOString();
    await writeJson(path.join(artifactDirectory, "run.json"), manifest);
    console.log(
      JSON.stringify({
        status: manifest.status,
        target: manifest.target,
        artifactDirectory: path.relative(REPO_ROOT, artifactDirectory),
      })
    );
  }
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
