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
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "../..");
const WEB_ROOT = path.join(REPO_ROOT, "web");
const ARTIFACT_ROOT = path.join(REPO_ROOT, "test-results", "programs-d1-runs");
const STAGE_TIMEOUTS_MS = Object.freeze({
  build: 5 * 60 * 1000,
  bundle: 5 * 60 * 1000,
  "harness-listen": 2 * 60 * 1000,
  "d1-migrations-and-seed": 2 * 60 * 1000,
  "authenticated-readiness": 2 * 60 * 1000,
  "real-worker-demo-seed": 2 * 60 * 1000,
  "unfiltered-programs-playwright": 15 * 60 * 1000,
  "harness-close": 60 * 1000,
});
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
  const args = ["exec", "tsx", "tests/e2e/seed-dev-accounts.ts"];
  if (option) {
    args.push(option);
  }
  return execFileSync("pnpm", args, { cwd: REPO_ROOT, encoding: "utf8" });
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

function runChild(
  command,
  args,
  environment,
  logPath,
  { onStart, onFinish } = {}
) {
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
    let settled = false;
    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      onFinish?.(child);
      resolve(result);
    };
    child.stdout?.on("data", (chunk) => chunks.push(chunk.toString()));
    child.stderr?.on("data", (chunk) => chunks.push(chunk.toString()));
    child.once("error", (error) => {
      writeFileSync(logPath, chunks.join(""), "utf8");
      if (!settled) {
        settled = true;
        onFinish?.(child);
        reject(error);
      }
    });
    child.once("close", (code, signal) => {
      writeFileSync(logPath, chunks.join(""), "utf8");
      finish({ code, signal });
    });
    onStart?.(child);
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

function canonicalArtifactPaths(runIdValue) {
  const directory = path.join(ARTIFACT_ROOT, runIdValue);
  return {
    directory,
    manifest: path.join(directory, "run.json"),
    summary: path.join(directory, "summary.json"),
    buildLog: path.join(directory, "build.log"),
    bundleLog: path.join(directory, "bundle.log"),
    seedProgress: path.join(directory, "seed-progress.log"),
    demoSeedLog: path.join(directory, "seed-demo.log"),
    playwrightLog: path.join(directory, "playwright.log"),
    results: path.join(directory, "programs-d1-results.json"),
    playwrightOutput: path.join(directory, "playwright-output"),
    harnessDebug: path.join(directory, "harness-debug.log"),
    failureSummary: path.join(directory, "failure-summary.json"),
    playwrightFailure: path.join(directory, "playwright-failure.txt"),
  };
}

function artifactReferences(paths) {
  return Object.fromEntries(
    Object.entries(paths).map(([name, pathname]) => [
      name,
      path.relative(REPO_ROOT, pathname),
    ])
  );
}

function writeJson(pathname, value) {
  writeFileSync(pathname, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readFileSafe(pathname) {
  try {
    readFileSync(pathname, "utf8");
    return true;
  } catch {
    return false;
  }
}

function withTimeout(promise, timeoutMs, label) {
  let timeoutHandle;
  const timeout = new Promise((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timeoutHandle);
  });
}

function currentRevision() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

function stageStarted(name, command) {
  return {
    name,
    command,
    status: "running",
    startedAt: new Date().toISOString(),
  };
}

function stageFinished(stage, status, details = {}) {
  stage.status = status;
  stage.finishedAt = new Date().toISOString();
  stage.durationMs =
    new Date(stage.finishedAt).getTime() - new Date(stage.startedAt).getTime();
  Object.assign(stage, details);
}

function stageDuration(stages, name) {
  return stages.find((stage) => stage.name === name)?.durationMs ?? null;
}

function timingSummary(stages) {
  const firstStage = stages[0];
  const lastStage = stages.at(-1);
  const totalMs =
    firstStage?.startedAt && lastStage?.finishedAt
      ? new Date(lastStage.finishedAt).getTime() -
        new Date(firstStage.startedAt).getTime()
      : null;
  return {
    buildMs: stageDuration(stages, "build"),
    bundleMs: stageDuration(stages, "bundle"),
    harnessStartupMs: stageDuration(stages, "harness-listen"),
    d1MigrationSeedMs: stageDuration(stages, "d1-migrations-and-seed"),
    demoApiSeedMs: stageDuration(stages, "real-worker-demo-seed"),
    playwrightMs: stageDuration(stages, "unfiltered-programs-playwright"),
    totalMs,
  };
}

function responseSetCookieHeaders(headers) {
  const responseHeaders = headers;
  const nativeHeaders = responseHeaders.getSetCookie?.() ?? [];
  if (nativeHeaders.length > 0) {
    return nativeHeaders;
  }
  const combined = headers.get("set-cookie");
  return combined === null ? [] : combined.split(/,(?=\s*[^;,=\s]+=[^;,]*)/u);
}

function cookieHeaderFromSetCookieHeaders(headers) {
  const cookies = headers
    .map((header) => header.split(";", 1)[0]?.trim() ?? "")
    .filter(Boolean);
  if (cookies.length === 0) {
    throw new Error("local Worker auth readiness response set no cookies");
  }
  return cookies.join("; ");
}

async function fetchWithTimeout(input, init = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    await response.arrayBuffer();
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function assertHealthyTarget(target) {
  const loginResponse = await fetchWithTimeout(
    new URL("/api/v1/auth/login", target),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: target.origin,
      },
      body: JSON.stringify({
        username: process.env.PROGRAMS_ADMIN_USERNAME ?? "E2E_admin",
        password: process.env.PROGRAMS_ADMIN_CREDENTIAL ?? "E2E_admin!dev",
      }),
    }
  );
  if (!loginResponse.ok) {
    throw new Error(
      `local Worker auth readiness login returned HTTP ${loginResponse.status}`
    );
  }
  const cookieHeader = cookieHeaderFromSetCookieHeaders(
    responseSetCookieHeaders(loginResponse.headers)
  );
  const authResponse = await fetchWithTimeout(
    new URL("/api/v1/auth/me", target),
    {
      headers: {
        Cookie: cookieHeader,
        Origin: target.origin,
      },
    }
  );
  if (!authResponse.ok) {
    throw new Error(
      `local Worker auth readiness request returned HTTP ${authResponse.status}`
    );
  }
}

async function recordFailureDiagnostics(
  paths,
  server,
  target,
  report,
  cause,
  interruptedSignal
) {
  const failedTests = report ? failedProgramsTests(report) : [];
  const health = {
    serverAliveAfterFailure: null,
    status: null,
    error: null,
  };
  if (server && target) {
    try {
      const response = await fetchWithTimeout(
        new URL("/programs", target),
        {},
        5_000
      );
      health.serverAliveAfterFailure = true;
      health.status = response.status;
    } catch (error) {
      health.serverAliveAfterFailure = false;
      health.error = error instanceof Error ? error.message : String(error);
    }
  }

  const diagnosticLines = [];
  let debugError = null;
  if (server) {
    const originalLog = console.log;
    const originalError = console.error;
    const capture = (...values) => {
      diagnosticLines.push(values.map((value) => String(value)).join(" "));
    };
    console.log = (...values) => {
      capture(...values);
      originalLog(...values);
    };
    console.error = (...values) => {
      capture(...values);
      originalError(...values);
    };
    try {
      server.debug();
    } catch (error) {
      debugError = error instanceof Error ? error.message : String(error);
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
  }
  writeFileSync(
    paths.harnessDebug,
    `${diagnosticLines.join("\n")}${diagnosticLines.length > 0 ? "\n" : ""}${debugError ? `server.debug() failed: ${debugError}\n` : ""}`,
    "utf8"
  );

  writeFileSync(
    paths.playwrightFailure,
    JSON.stringify(
      {
        error: cause,
        interruptedSignal,
        failedProgramsTests: failedTests,
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
  writeJson(paths.failureSummary, {
    schemaVersion: 2,
    outcome: "failed",
    error: cause,
    interruptedSignal,
    serverHealth: health,
    failedProgramsTests: failedTests,
    harnessDebug: path.relative(REPO_ROOT, paths.harnessDebug),
    runtimeLogs: server?.getLogs?.() ?? [],
    interpretation:
      "The failed-row identity and Harness health were captured before close; a failed required row is never converted into a pass.",
  });
}

async function runCanonical() {
  const paths = canonicalArtifactPaths(runId());
  mkdirSync(ARTIFACT_ROOT, { recursive: true });
  mkdirSync(paths.directory, { recursive: false });
  mkdirSync(paths.playwrightOutput, { recursive: true });

  const manifest = {
    schemaVersion: 2,
    runId: path.basename(paths.directory),
    canonical: true,
    runtime: "createTestHarness",
    targetUrl: null,
    revision: currentRevision(),
    status: "running",
    startedAt: new Date().toISOString(),
    stages: [],
    timings: null,
    artifacts: artifactReferences(paths),
  };
  writeJson(paths.manifest, manifest);

  const environment = {
    ...process.env,
    CI: "1",
    FORCE_COLOR: "0",
    NO_COLOR: "1",
  };
  let server = null;
  let target = null;
  let report = null;
  let activeChild = null;
  let closePromise = null;
  let interruptedSignal = null;
  let failure = null;
  let closeFailure = null;

  const writeState = () => writeJson(paths.manifest, manifest);
  const emit = (phase, outcome, details = {}) =>
    console.log(JSON.stringify({ phase, outcome, ...details }));
  const stopActiveChild = () => {
    if (activeChild?.pid === undefined) {
      return;
    }
    try {
      activeChild.kill("SIGINT");
    } catch {
      // The child may have exited between the signal and cleanup.
    }
  };
  const closeHarness = () => {
    if (!server) {
      return Promise.resolve();
    }
    closePromise ??= server.close();
    return closePromise;
  };
  const handleSignal = (signal) => {
    interruptedSignal = signal;
    process.exitCode = 1;
    stopActiveChild();
    void closeHarness().catch(() => undefined);
  };
  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);

  const runAsyncStage = async (name, action) => {
    const stage = stageStarted(name, name);
    manifest.stages.push(stage);
    await writeState();
    try {
      if (interruptedSignal !== null) {
        throw new Error(
          `Canonical runtime interrupted by ${interruptedSignal}`
        );
      }
      const value = await withTimeout(
        action(),
        STAGE_TIMEOUTS_MS[name] ?? 2 * 60 * 1000,
        name
      );
      stageFinished(stage, "passed");
      await writeState();
      emit(name, "pass", {
        durationMs: stage.durationMs,
      });
      return value;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      stageFinished(stage, "failed", { error: message });
      await writeState();
      throw error;
    }
  };

  const runCommandStage = async (
    name,
    args,
    logPath,
    childEnvironment = environment
  ) => {
    const stage = stageStarted(name, `pnpm ${args.join(" ")}`);
    manifest.stages.push(stage);
    await writeState();
    let result;
    try {
      result = await runChild("pnpm", args, childEnvironment, logPath, {
        onStart: (child) => {
          activeChild = child;
        },
        onFinish: (child) => {
          if (activeChild === child) {
            activeChild = null;
          }
        },
      });
    } catch (error) {
      result = {
        code: null,
        signal: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    let reportError = null;
    if (name === "unfiltered-programs-playwright") {
      try {
        report = readProgramsReport(paths.results);
        assertCompletePlaywrightReport(paths.results);
      } catch (error) {
        reportError = error instanceof Error ? error.message : String(error);
      }
    }
    if (reportError !== null && result.error === undefined) {
      result = { ...result, error: reportError };
    }
    stage.exit = result;
    if (
      result.code !== 0 ||
      result.signal !== null ||
      result.error !== undefined ||
      interruptedSignal !== null
    ) {
      stageFinished(stage, "failed");
      await writeState();
      emit(name, "fail", {
        code: result.code,
        signal: result.signal,
        error: result.error ?? null,
        log: path.relative(REPO_ROOT, logPath),
        results:
          name === "unfiltered-programs-playwright"
            ? path.relative(REPO_ROOT, paths.results)
            : undefined,
      });
      throw new Error(
        `${name} failed${result.error ? `: ${result.error}` : ` with exit code ${result.code ?? "null"}`}`
      );
    }
    stageFinished(stage, "passed");
    await writeState();
    emit(name, "pass", {
      durationMs: stage.durationMs,
      log: path.relative(REPO_ROOT, logPath),
    });
    return result;
  };

  try {
    await runCommandStage("build", ["--dir", "web", "build"], paths.buildLog);
    await runCommandStage(
      "bundle",
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
      paths.bundleLog
    );

    server = createTestHarness({
      root: REPO_ROOT,
      workers: [
        {
          configPath: "./web/wrangler.jsonc",
          prebuiltWorkerDir: "./web/.wrangler/local-bundle",
        },
      ],
    });
    const listenResult = await runAsyncStage("harness-listen", async () => {
      const result = await server.listen();
      target = result.url;
      manifest.targetUrl = target.origin;
      const response = await fetchWithTimeout(
        new URL("/programs", target),
        {},
        10_000
      );
      if (!response.ok) {
        throw new Error(`real asset route returned HTTP ${response.status}`);
      }
      return { status: response.status };
    });
    emit("listen-assets-and-real-network", "pass", listenResult);

    const worker = server.getWorker();
    await runAsyncStage("d1-migrations-and-seed", async () => {
      await worker.applyD1Migrations("DB");
      const workerEnvironment = await worker.getEnv();
      if (!workerEnvironment?.DB) {
        throw new Error("Canonical Harness Worker has no DB binding");
      }
      await executeSeedSql(
        workerEnvironment.DB,
        `${generatedIdentitySeed()}\n${generatedIdentitySeed("--reset-legacy")}\n${readFileSync(path.join(REPO_ROOT, "tests/e2e/seed-disposable-identity.sql"), "utf8")}`,
        paths.seedProgress
      );
    });
    emit("migrations-and-direct-d1-seed", "pass", {
      storage: "official createTestHarness D1 binding",
      progress: path.relative(REPO_ROOT, paths.seedProgress),
    });

    await runAsyncStage("authenticated-readiness", () =>
      assertHealthyTarget(target)
    );
    await runCommandStage(
      "real-worker-demo-seed",
      ["db:seed:demo"],
      paths.demoSeedLog,
      { ...environment, DEMO_TARGET_URL: target.origin }
    );
    await runCommandStage(
      "unfiltered-programs-playwright",
      ["exec", "playwright", "test", "-c", "tests/e2e/programs-d1.config.ts"],
      paths.playwrightLog,
      {
        ...environment,
        PROGRAMS_TARGET_URL: target.origin,
        PROGRAMS_RESULTS_FILE: paths.results,
        PROGRAMS_OUTPUT_DIR: paths.playwrightOutput,
      }
    );
    emit("canonical-qualification", "pass", {
      artifacts: path.relative(REPO_ROOT, paths.directory),
    });
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    manifest.status = "failed";
    process.exitCode = 1;
    process.stderr.write(`T05 Canonical Programs runtime failed: ${failure}\n`);
  } finally {
    if (failure === null && interruptedSignal !== null) {
      failure = `Canonical runtime interrupted by ${interruptedSignal}`;
    }
    if (failure !== null) {
      try {
        const failureReport =
          report ??
          (() => {
            try {
              return readProgramsReport(paths.results);
            } catch {
              return null;
            }
          })();
        await recordFailureDiagnostics(
          paths,
          server,
          target,
          failureReport,
          failure,
          interruptedSignal
        );
      } catch (error) {
        const diagnosticsFailure =
          error instanceof Error ? error.message : String(error);
        failure = `${failure}; failure diagnostics could not be written: ${diagnosticsFailure}`;
        process.exitCode = 1;
      }
    }

    if (server) {
      const closeStage = stageStarted("harness-close", "server.close()");
      manifest.stages.push(closeStage);
      await writeState();
      try {
        await closeHarness();
        stageFinished(closeStage, "passed");
      } catch (error) {
        closeFailure = error instanceof Error ? error.message : String(error);
        stageFinished(closeStage, "failed", { error: closeFailure });
        process.exitCode = 1;
      }
      await writeState();
    }

    if (closeFailure !== null) {
      failure = failure
        ? `${failure}; Harness close failed: ${closeFailure}`
        : `Harness close failed: ${closeFailure}`;
      if (!readFileSafe(paths.failureSummary)) {
        await recordFailureDiagnostics(
          paths,
          server,
          target,
          report,
          failure,
          interruptedSignal
        ).catch(() => undefined);
      }
    }

    manifest.status = failure === null ? "passed" : "failed";
    manifest.finishedAt = new Date().toISOString();
    manifest.timings = timingSummary(manifest.stages);
    writeJson(paths.summary, {
      schemaVersion: 1,
      canonical: true,
      runtime: "createTestHarness",
      runId: manifest.runId,
      targetUrl: manifest.targetUrl,
      revision: manifest.revision,
      status: manifest.status,
      error: failure,
      interruptedSignal,
      counts: report?.counts ?? null,
      failedProgramsTests: report ? failedProgramsTests(report) : [],
      timings: manifest.timings,
      stages: manifest.stages,
      artifacts: manifest.artifacts,
    });
    if (failure === null) {
      writeJson(paths.failureSummary, {
        schemaVersion: 2,
        outcome: "passed",
        failedProgramsTests: [],
        interpretation:
          "The Canonical Harness closed after a complete report satisfying the unchanged Programs acceptance contract.",
      });
    }
    await writeState();
    process.off("SIGINT", handleSignal);
    process.off("SIGTERM", handleSignal);
    if (failure !== null) {
      process.exitCode = 1;
      emit("canonical-qualification", "fail", {
        artifacts: path.relative(REPO_ROOT, paths.directory),
      });
    }
    process.stdout.write(
      `T05 Canonical runtime artifacts: ${path.relative(REPO_ROOT, paths.directory)}\n`
    );
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
  const child = spawn(process.execPath, [SCRIPT_PATH, "--probe"], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
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
    await runCanonical();
  } else {
    await runBoundedQualification();
  }
}
