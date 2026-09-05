import { execFile } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
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
  "programs-responsive"
);

function runId() {
  return new Date()
    .toISOString()
    .replaceAll(/[^0-9a-z]/giu, "")
    .toLowerCase();
}

export function resolveResponsiveReportPath(rawPath, artifactDirectory) {
  return rawPath === undefined || rawPath === ""
    ? path.join(artifactDirectory, "responsive-results.json")
    : path.resolve(REPO_ROOT, rawPath);
}

async function writeJson(filename, value) {
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const artifactDirectory = process.env.PROGRAMS_RESPONSIVE_ARTIFACT_DIRECTORY
    ? path.resolve(
        REPO_ROOT,
        process.env.PROGRAMS_RESPONSIVE_ARTIFACT_DIRECTORY
      )
    : path.join(ARTIFACT_ROOT, runId());
  await mkdir(artifactDirectory, { recursive: true });
  const reportPath = resolveResponsiveReportPath(
    process.env.PROGRAMS_RESPONSIVE_RESULTS_FILE,
    artifactDirectory
  );
  await mkdir(path.dirname(reportPath), { recursive: true });
  const manifest = {
    schemaVersion: 1,
    runtime: "createTestHarness",
    config: "web/wrangler.jsonc",
    suite: "tests/e2e/programs-responsive-matrix.config.ts",
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
      PROGRAMS_RESPONSIVE_RESULTS_FILE: reportPath,
      PROGRAMS_RESPONSIVE_OUTPUT_DIR: path.join(
        artifactDirectory,
        "responsive-output"
      ),
    };
    if (process.env.PROGRAMS_PROMOTION_RUN_ID !== undefined) {
      environment.PROGRAMS_PROMOTION_RUN_ID =
        process.env.PROGRAMS_PROMOTION_RUN_ID;
    }
    const result = await execFileAsync(
      "pnpm",
      [
        "exec",
        "playwright",
        "test",
        "--config=tests/e2e/programs-responsive-matrix.config.ts",
      ],
      { cwd: REPO_ROOT, env: environment, maxBuffer: 16 * 1024 * 1024 }
    );
    await writeFile(
      path.join(artifactDirectory, "responsive.log"),
      `${result.stdout}${result.stderr}`,
      "utf8"
    );
    await access(reportPath);
    manifest.status = "passed";
  } catch (error) {
    failure = error;
    manifest.status = "failed";
    manifest.failure = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
    if (error?.stdout || error?.stderr) {
      await writeFile(
        path.join(artifactDirectory, "responsive.log"),
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
          message: manifest.failure,
          firstCausalRuntimeSignal: firstCausalRuntimeSignal(runtimeLogs),
          target: manifest.target,
          reportPath: manifest.reportPath,
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
        reportPath: manifest.reportPath,
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
