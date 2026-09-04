import { execFileSync, spawn } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createTestHarness } from "wrangler";

const QUALIFICATION_TIMEOUT_MS = 15 * 60 * 1000;
const EXPECTED_PROGRAMS_TESTS = 201;
const REPO_ROOT = path.resolve(process.cwd(), "..");
const REQUIRED_PROGRAMS_COUNTS = Object.freeze({
  expected: EXPECTED_PROGRAMS_TESTS,
  skipped: 0,
  unexpected: 0,
  flaky: 0,
});

function reportSource(report) {
  if (
    report &&
    typeof report === "object" &&
    "report" in report &&
    report.report &&
    typeof report.report === "object"
  ) {
    return report.report;
  }
  return report;
}

function testStatus(test) {
  if (typeof test?.status === "string") {
    if (test.status === "unexpected" || test.status === "flaky") {
      return test.status;
    }
    if (["failed", "timedOut", "interrupted"].includes(test.status)) {
      return "unexpected";
    }
    return test.status;
  }
  const results = Array.isArray(test?.results) ? test.results : [];
  if (
    results.some((result) =>
      ["failed", "timedOut", "interrupted"].includes(result?.status)
    )
  ) {
    return "unexpected";
  }
  if (results.some((result) => result?.status === "skipped")) {
    return "skipped";
  }
  return "expected";
}

function errorMessages(results) {
  return results.flatMap((result) => {
    const errors = Array.isArray(result?.errors)
      ? result.errors
      : result?.error
        ? [result.error]
        : [];
    return errors
      .map((error) => error?.message)
      .filter((message) => typeof message === "string");
  });
}

function fullTitle(suitePath, specTitle) {
  return [...suitePath, specTitle]
    .filter((part) => typeof part === "string" && part.length > 0)
    .join(" > ");
}

/**
 * @typedef {Object} ProgramsReportSummary
 * @property {Object} stats Playwright's report stats object.
 * @property {Object} counts The exact count fields used by the acceptance gate.
 * @property {Array} failedTests Unexpected or flaky row identities.
 */

/**
 * @typedef {Object} FailedProgramsTest
 * @property {string} title Complete suite/spec title.
 * @property {string} fullTitle Alias for the complete suite/spec title.
 * @property {string|null} projectId Playwright project id when reported.
 * @property {string|null} projectName Playwright project name when reported.
 * @property {string|null} viewport Viewport identity when reported.
 */

/**
 * Read a Playwright JSON report without starting a Worker or Harness.
 *
 * @param {string} reportPath
 * @returns {ProgramsReportSummary & Object}
 */
export function readProgramsReport(reportPath) {
  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Unable to read Programs Playwright JSON report at ${reportPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (report === null || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("Programs Playwright JSON report must be an object");
  }
  const stats = report.stats;
  const counts = Object.fromEntries(
    Object.keys(REQUIRED_PROGRAMS_COUNTS).map((name) => [name, stats?.[name]])
  );
  return {
    ...report,
    reportPath,
    counts,
    failedTests: failedProgramsTests(report),
  };
}

/**
 * Extract every unexpected/flaky Programs row with enough identity to rerun it.
 *
 * @param {ProgramsReportSummary & Object} report
 * @returns {FailedProgramsTest[]}
 */
export function failedProgramsTests(report) {
  const source = reportSource(report);
  const failures = [];

  function visit(suites, parents = [], inheritedFile = null) {
    for (const suite of Array.isArray(suites) ? suites : []) {
      const suiteTitle =
        typeof suite?.title === "string" ? suite.title : undefined;
      const suitePath = suiteTitle ? [...parents, suiteTitle] : parents;
      const suiteFile = suite?.file ?? inheritedFile;
      for (const spec of Array.isArray(suite?.specs) ? suite.specs : []) {
        const specTitle =
          typeof spec?.title === "string" ? spec.title : undefined;
        for (const test of Array.isArray(spec?.tests) ? spec.tests : []) {
          const status = testStatus(test);
          if (status !== "unexpected" && status !== "flaky") {
            continue;
          }
          const results = Array.isArray(test.results) ? test.results : [];
          const lastResult = results.at(-1) ?? null;
          const projectId =
            test.projectId ?? test.project?.id ?? test.projectName ?? null;
          const projectName =
            test.projectName ?? test.project?.name ?? test.projectId ?? null;
          const viewport = test.viewport ?? test.project?.viewport ?? null;
          const title = fullTitle(suitePath, specTitle);
          failures.push({
            title,
            fullTitle: title,
            suitePath,
            specTitle: specTitle ?? null,
            file: test.file ?? spec.file ?? suiteFile ?? null,
            line: test.line ?? spec.line ?? null,
            column: test.column ?? spec.column ?? null,
            projectId,
            projectName,
            viewport,
            status,
            expectedStatus: test.expectedStatus ?? null,
            retry: lastResult?.retry ?? null,
            resultStatuses: results.map((result) => result?.status ?? null),
            errorMessages: errorMessages(results),
          });
        }
      }
      visit(suite?.suites, suitePath, suiteFile);
    }
  }

  visit(source?.suites);
  return failures;
}

/**
 * Assert the exact required Programs report counts.
 *
 * @param {ProgramsReportSummary & Object} report
 */
export function assertProgramsReportComplete(report) {
  const stats = reportSource(report)?.stats;
  if (stats === null || typeof stats !== "object" || Array.isArray(stats)) {
    throw new Error("Programs Playwright JSON report has no stats object");
  }
  const mismatches = Object.entries(REQUIRED_PROGRAMS_COUNTS).filter(
    ([name, expected]) =>
      typeof stats[name] !== "number" || stats[name] !== expected
  );
  if (mismatches.length > 0) {
    throw new Error(
      `Programs Playwright JSON report is incomplete: ${Object.keys(
        REQUIRED_PROGRAMS_COUNTS
      )
        .map((name) => `${name}=${String(stats[name])}`)
        .join(", ")}`
    );
  }
}

function runId() {
  return new Date()
    .toISOString()
    .replaceAll(/[^0-9a-z]/giu, "")
    .toLowerCase();
}

function generatedIdentitySeed(option) {
  const args = ["--dir", "..", "exec", "tsx", "tests/e2e/seed-dev-accounts.ts"];
  if (option) {
    args.push(option);
  }
  return execFileSync("pnpm", args, { cwd: process.cwd(), encoding: "utf8" });
}

function executableSql(sql) {
  return sql.replace(/^\s*--.*$/gim, "");
}

function splitSqlStatements(sql) {
  const statements = [];
  let start = 0;
  let quote = null;
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    if (quote !== null) {
      if (character === quote && sql[index + 1] === quote) {
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (character === ";") {
      const statement = sql.slice(start, index).trim();
      if (statement) {
        statements.push(statement);
      }
      start = index + 1;
    }
  }
  const finalStatement = sql.slice(start).trim();
  if (finalStatement) {
    statements.push(finalStatement);
  }
  return statements;
}

async function executeSeedSql(db, sql, progressPath) {
  const statements = splitSqlStatements(executableSql(sql));
  writeFileSync(progressPath, `total=${statements.length}\n`, "utf8");
  for (const [index, statement] of statements.entries()) {
    appendFileSync(progressPath, `start=${index + 1}\n`, "utf8");
    await db.prepare(statement).run();
    appendFileSync(progressPath, `done=${index + 1}\n`, "utf8");
  }
}

function runChild(command, args, environment, logPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: REPO_ROOT,
      env: environment,
      // Keep qualification children in the probe's process group so the
      // outer watchdog can terminate the complete tree on timeout.
      detached: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks = [];
    child.stdout?.on("data", (chunk) => chunks.push(chunk.toString()));
    child.stderr?.on("data", (chunk) => chunks.push(chunk.toString()));
    child.once("error", (error) => reject(error));
    child.once("close", (code, signal) => {
      writeFileSync(logPath, chunks.join(""), "utf8");
      resolve({ code, signal });
    });
  });
}

function killProcessGroup(child, signal) {
  if (child.pid === undefined) {
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    // The child may have exited between the timeout and cleanup signal.
  }
}

function waitForExitOrTimeout(exited, timeoutMs) {
  let timeoutHandle;
  const timeout = new Promise((resolve) => {
    timeoutHandle = setTimeout(() => resolve(null), timeoutMs);
  });
  return Promise.race([exited, timeout]).finally(() => {
    clearTimeout(timeoutHandle);
  });
}

async function stopProbeGroup(child, exited, signal) {
  killProcessGroup(child, signal);
  const graceful = await waitForExitOrTimeout(exited, 5_000);
  if (graceful !== null) {
    return graceful;
  }
  killProcessGroup(child, "SIGKILL");
  return waitForExitOrTimeout(exited, 5_000);
}

function assertCompletePlaywrightReport(reportPath) {
  assertProgramsReportComplete(readProgramsReport(reportPath));
}

async function runProbe() {
  const artifactDirectory = path.join(
    REPO_ROOT,
    "test-results",
    "test-harness-qualification",
    runId()
  );
  mkdirSync(artifactDirectory, { recursive: true });
  const preparationEnvironment = {
    ...process.env,
    CI: "1",
    FORCE_COLOR: "0",
    NO_COLOR: "1",
  };
  const buildLog = path.join(artifactDirectory, "build.log");
  const buildResult = await runChild(
    "pnpm",
    ["--dir", "web", "build"],
    preparationEnvironment,
    buildLog
  );
  if (buildResult.code !== 0 || buildResult.signal !== null) {
    throw new Error(
      `fresh Worker build failed with exit code ${buildResult.code ?? "null"}`
    );
  }
  const bundleLog = path.join(artifactDirectory, "bundle.log");
  const bundleResult = await runChild(
    "pnpm",
    [
      "--dir",
      "web",
      "exec",
      "wrangler",
      "deploy",
      "--dry-run",
      "--outdir",
      ".wrangler/local-bundle",
    ],
    preparationEnvironment,
    bundleLog
  );
  if (bundleResult.code !== 0 || bundleResult.signal !== null) {
    throw new Error(
      `fresh Worker bundle failed with exit code ${bundleResult.code ?? "null"}`
    );
  }
  console.log(
    JSON.stringify({
      phase: "fresh-build-and-bundle",
      outcome: "pass",
      logs: {
        build: path.relative(REPO_ROOT, buildLog),
        bundle: path.relative(REPO_ROOT, bundleLog),
      },
    })
  );
  const server = createTestHarness({
    root: process.cwd(),
    workers: [
      {
        configPath: "./wrangler.jsonc",
        prebuiltWorkerDir: "./.wrangler/local-bundle",
      },
    ],
  });

  try {
    const { url } = await server.listen();
    const rootResponse = await fetch(new URL("/programs", url));
    await rootResponse.arrayBuffer();
    if (!rootResponse.ok) {
      throw new Error(`real asset route returned HTTP ${rootResponse.status}`);
    }
    console.log(
      JSON.stringify({
        phase: "listen-assets-and-real-network",
        outcome: "pass",
        status: rootResponse.status,
      })
    );

    const worker = server.getWorker();
    await worker.applyD1Migrations("DB");
    const env = await worker.getEnv();
    console.log(
      JSON.stringify({ phase: "generate-d1-seeds", outcome: "start" })
    );
    await executeSeedSql(
      env.DB,
      `${generatedIdentitySeed()}\n${generatedIdentitySeed("--reset-legacy")}\n${readFileSync(path.join(REPO_ROOT, "tests/e2e/seed-disposable-identity.sql"), "utf8")}`,
      path.join(artifactDirectory, "seed-progress.log")
    );
    console.log(
      JSON.stringify({
        phase: "migrations-and-direct-d1-seed",
        outcome: "pass",
        storage: "official createTestHarness D1 binding",
      })
    );

    const demoLog = path.join(artifactDirectory, "seed-demo.log");
    const demoResult = await runChild(
      "pnpm",
      ["db:seed:demo"],
      {
        ...process.env,
        DEMO_TARGET_URL: url.origin,
        CI: "1",
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
      demoLog
    );
    if (demoResult.code !== 0) {
      throw new Error(
        `real Worker demo seed failed with exit code ${demoResult.code ?? "null"}`
      );
    }
    console.log(
      JSON.stringify({
        phase: "real-worker-demo-seed",
        outcome: "pass",
        log: path.relative(REPO_ROOT, demoLog),
      })
    );

    const playwrightDirectory = path.join(
      artifactDirectory,
      "playwright-output"
    );
    mkdirSync(playwrightDirectory, { recursive: true });
    const playwrightResults = path.join(
      artifactDirectory,
      "programs-d1-results.json"
    );
    const playwrightLog = path.join(artifactDirectory, "playwright.log");
    const playwrightResult = await runChild(
      "pnpm",
      ["exec", "playwright", "test", "-c", "tests/e2e/programs-d1.config.ts"],
      {
        ...process.env,
        PROGRAMS_TARGET_URL: url.origin,
        PROGRAMS_RESULTS_FILE: playwrightResults,
        PROGRAMS_OUTPUT_DIR: playwrightDirectory,
        CI: "1",
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
      playwrightLog
    );
    let reportError = null;
    if (playwrightResult.code === 0 && playwrightResult.signal === null) {
      try {
        assertCompletePlaywrightReport(playwrightResults);
      } catch (error) {
        reportError = error;
      }
    }
    console.log(
      JSON.stringify({
        phase: "unfiltered-programs-playwright",
        outcome:
          playwrightResult.code === 0 &&
          playwrightResult.signal === null &&
          reportError === null
            ? "pass"
            : "fail",
        code: playwrightResult.code,
        signal: playwrightResult.signal,
        log: path.relative(REPO_ROOT, playwrightLog),
        results: path.relative(REPO_ROOT, playwrightResults),
      })
    );
    if (playwrightResult.code !== 0 || playwrightResult.signal !== null) {
      throw new Error(
        `unfiltered Programs Playwright journey failed with exit code ${playwrightResult.code ?? "null"}`
      );
    }
    if (reportError !== null) {
      throw reportError;
    }
    console.log(
      JSON.stringify({
        phase: "qualification",
        outcome: "equivalent-and-reliable",
        artifacts: path.relative(REPO_ROOT, artifactDirectory),
      })
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        phase: "qualification",
        outcome: "failed",
        error: error instanceof Error ? error.message : String(error),
        artifacts: path.relative(REPO_ROOT, artifactDirectory),
      })
    );
    process.exitCode = 1;
  } finally {
    await server.close();
  }
}

function summarizeOutput(output) {
  return output
    .split(/\r?\n/u)
    .filter((line) => line.trim().startsWith("{"))
    .slice(-20)
    .join("\n");
}

async function runBoundedQualification() {
  const child = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), "--probe"],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  let output = "";
  child.stdout?.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr?.on("data", (chunk) => {
    output += chunk.toString();
  });
  const exited = new Promise((resolve) => {
    child.once("close", (code, signal) => resolve({ code, signal }));
    child.once("error", (error) =>
      resolve({ code: null, signal: null, error: error.message })
    );
  });
  let timeoutHandle;
  const timeout = new Promise((resolve) => {
    timeoutHandle = setTimeout(
      () => resolve({ timeout: true }),
      QUALIFICATION_TIMEOUT_MS
    );
  });
  let interruptedSignalResolve;
  const interrupted = new Promise((resolve) => {
    interruptedSignalResolve = resolve;
  });
  const handleSignal = (signal) => {
    process.exitCode = 1;
    interruptedSignalResolve({ interrupted: signal });
  };
  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);
  const result = await Promise.race([exited, timeout, interrupted]);
  clearTimeout(timeoutHandle);
  process.off("SIGINT", handleSignal);
  process.off("SIGTERM", handleSignal);
  if ("timeout" in result) {
    const terminated = await stopProbeGroup(child, exited, "SIGTERM");
    console.log(
      JSON.stringify({
        phase: "qualification",
        outcome: "timeout",
        timeoutMs: QUALIFICATION_TIMEOUT_MS,
        childTerminated: terminated !== null,
        capturedOutput: summarizeOutput(output),
      })
    );
    process.exitCode = 2;
    return;
  }
  if ("interrupted" in result) {
    const terminated = await stopProbeGroup(child, exited, result.interrupted);
    console.log(
      JSON.stringify({
        phase: "qualification",
        outcome: "interrupted",
        signal: result.interrupted,
        childTerminated: terminated !== null,
        capturedOutput: summarizeOutput(output),
      })
    );
    process.exitCode = terminated === null ? 2 : 1;
    return;
  }
  console.log(
    JSON.stringify({
      phase: "child-process",
      outcome: result.code === 0 ? "completed" : "failed",
      code: result.code,
      signal: result.signal,
      capturedOutput: summarizeOutput(output),
    })
  );
  process.exitCode = result.code === 0 ? 0 : 1;
}

const isMainModule =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  if (process.argv.includes("--probe")) {
    await runProbe();
  } else {
    await runBoundedQualification();
  }
}
