import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { createTestHarness } from "wrangler";

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const CANARY_ARTIFACT_ROOT = path.join(
  REPO_ROOT,
  "test-results",
  "programs-runtime-canary"
);
const REQUEST_TIMEOUT_MS = 10_000;

export const CANARY_DURATION_MS = 5 * 60 * 1000;
export const CANARY_RETRIES = 0;

const ADMIN = { username: "E2E_admin", credential: "E2E_admin!dev" };
const MEMBER = { username: "E2E_member", credential: "E2E_member!dev" };

const RUNTIME_MARKER =
  /(?:Broken pipe|Connection reset by peer|Error (?:in|inside) ProxyController|Error inside ProxyWorker|deadlock|workerd.*(?:fatal|exited)|Network connection lost|ERR_CONNECTION_REFUSED)/iu;
const DOWNSTREAM_MARKER =
  /(?:Network connection lost|ERR_CONNECTION_REFUSED|Connection reset by peer)/iu;
const HTTP_RUNTIME_MARKER =
  /(?:Network connection lost|ERR_CONNECTION_REFUSED|Connection reset by peer)/iu;

export function firstCausalRuntimeSignal(logs) {
  const lines = (Array.isArray(logs) ? logs : [logs])
    .flatMap((entry) =>
      (typeof entry === "string"
        ? entry
        : (JSON.stringify(entry) ?? String(entry))
      ).split(/\r?\n/u)
    )
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && RUNTIME_MARKER.test(line));
  return (
    lines.find((line) => !DOWNSTREAM_MARKER.test(line)) ?? lines[0] ?? null
  );
}

export function isCanaryGreen({ startedAt, finishedAt, failures }) {
  return finishedAt - startedAt >= CANARY_DURATION_MS && failures === 0;
}

export function isRuntimeTransportResponse(status, body) {
  return status >= 500 && HTTP_RUNTIME_MARKER.test(String(body));
}

export function classifyHttpFailure({ status, requestId, body }) {
  const runtimeTransport = isRuntimeTransportResponse(status, body);
  return {
    category: runtimeTransport ? "runtime transport" : "application",
    observedSymptom:
      requestId === null
        ? `HTTP ${status} response without X-Request-Id`
        : `HTTP ${status} response`,
    suspectedOrigin: runtimeTransport ? "undetermined" : "application",
    confirmedOrigin: null,
  };
}

class CanaryFailure extends Error {
  constructor(
    message,
    {
      category,
      phase,
      status,
      cause,
      operation,
      pathname,
      observedSymptom,
      suspectedOrigin,
      confirmedOrigin,
    } = {}
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "CanaryFailure";
    this.category = category ?? "application";
    this.phase = phase ?? "scenario";
    this.status = status ?? null;
    this.operation = operation ?? null;
    this.pathname = pathname ?? null;
    this.observedSymptom = observedSymptom ?? null;
    this.suspectedOrigin = suspectedOrigin ?? "undetermined";
    this.confirmedOrigin = confirmedOrigin ?? null;
  }
}

function runId() {
  return new Date()
    .toISOString()
    .replaceAll(/[^0-9a-z]/giu, "")
    .toLowerCase();
}

async function writeJson(filename, value) {
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function currentRevision() {
  try {
    const result = await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: REPO_ROOT,
    });
    return result.stdout.trim();
  } catch {
    return "unknown";
  }
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

async function generatedFixtureSql() {
  try {
    const result = await execFileAsync(
      "pnpm",
      ["exec", "tsx", "tests/e2e/seed-dev-accounts.ts"],
      { cwd: REPO_ROOT, maxBuffer: 4 * 1024 * 1024 }
    );
    return result.stdout;
  } catch (cause) {
    throw new CanaryFailure("E2E fixture seed generation failed", {
      category: "fixture/setup",
      phase: "fixture/setup",
      cause,
    });
  }
}

async function assertLocalSecret() {
  const filename = path.join(REPO_ROOT, "web", ".dev.vars");
  let contents;
  try {
    contents = await readFile(filename, "utf8");
  } catch (cause) {
    throw new CanaryFailure(
      "web/.dev.vars is required for the local Harness canary",
      { category: "fixture/setup", phase: "fixture/setup", cause }
    );
  }
  const secret = contents.match(
    /^EFCC_ACCESS_TOKEN_SECRET\s*=\s*["']?([^"'\r\n]+)["']?\s*$/mu
  )?.[1];
  if (
    typeof secret !== "string" ||
    secret.length < 32 ||
    secret.includes("REPLACE_WITH_A_LOCAL_ONLY_RANDOM_HEX_STRING")
  ) {
    throw new CanaryFailure(
      "web/.dev.vars must contain a non-placeholder local EFCC_ACCESS_TOKEN_SECRET",
      { category: "fixture/setup", phase: "fixture/setup" }
    );
  }
}

async function seedWorkerDatabase(worker, artifactDirectory) {
  try {
    await worker.applyD1Migrations("DB");
    const workerEnv = await worker.getEnv();
    if (!workerEnv?.DB) {
      throw new Error("Harness Worker did not expose the DB binding");
    }
    const statements = splitSqlStatements(
      (await generatedFixtureSql()).replace(/^\s*--.*$/gim, "")
    );
    const progress = [];
    for (const [index, statement] of statements.entries()) {
      progress.push({ statement: index + 1, status: "started" });
      await workerEnv.DB.prepare(statement).run();
      progress[progress.length - 1].status = "passed";
    }
    await writeJson(path.join(artifactDirectory, "fixture-seed.json"), {
      statements: progress.length,
      progress,
      storage: "createTestHarness Worker DB binding",
    });
    return workerEnv.DB;
  } catch (cause) {
    throw cause instanceof CanaryFailure
      ? cause
      : new CanaryFailure("Harness D1 migration or fixture setup failed", {
          category: "fixture/setup",
          phase: "fixture/setup",
          cause,
        });
  }
}

function setCookieValues(headers) {
  const getSetCookie = headers.getSetCookie;
  if (typeof getSetCookie === "function") {
    return getSetCookie.call(headers);
  }
  const combined = headers.get("set-cookie");
  return combined === null ? [] : combined.split(/,(?=\s*[^;,=\s]+=[^;,]*)/u);
}

function cookieHeader(headers) {
  const cookies = setCookieValues(headers)
    .map((value) => value.split(";", 1)[0]?.trim() ?? "")
    .filter(Boolean);
  if (cookies.length === 0) {
    throw new CanaryFailure("Worker login returned no cookies", {
      category: "fixture/setup",
      phase: "login",
    });
  }
  return cookies.join("; ");
}

async function requestJsonWithTransport(
  target,
  pathname,
  options = {},
  phase = "scenario"
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = new Headers({ Origin: target.origin });
  if (options.cookie) {
    headers.set("Cookie", options.cookie);
  }
  if (options.idempotencyKey) {
    headers.set("Idempotency-Key", options.idempotencyKey);
  }
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  let response;
  let raw;
  try {
    response = await fetch(new URL(pathname, target), {
      method: options.method ?? "GET",
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    raw = await response.text();
  } catch (cause) {
    throw new CanaryFailure(
      `Runtime transport failure at ${pathname}: ${cause instanceof Error ? cause.message : String(cause)}`,
      {
        category: "runtime transport",
        phase,
        cause,
        observedSymptom: "fetch/response transport exception",
      }
    );
  } finally {
    clearTimeout(timer);
  }

  const requestId = response.headers.get("X-Request-Id");
  if (!requestId) {
    const classification = classifyHttpFailure({
      status: response.status,
      requestId: null,
      body: raw,
    });
    throw new CanaryFailure(
      `Response without X-Request-Id at ${pathname}: HTTP ${response.status} ${raw.slice(0, 300)}`,
      {
        ...classification,
        phase,
        status: response.status,
        pathname,
      }
    );
  }
  let body;
  try {
    body = raw.length > 0 ? JSON.parse(raw) : null;
  } catch (cause) {
    const classification = classifyHttpFailure({
      status: response.status,
      requestId,
      body: raw,
    });
    throw new CanaryFailure(`Worker returned non-JSON at ${pathname}`, {
      ...classification,
      phase,
      status: response.status,
      pathname,
      cause,
    });
  }
  if (!response.ok) {
    const classification = classifyHttpFailure({
      status: response.status,
      requestId,
      body: raw,
    });
    throw new CanaryFailure(
      `Worker returned HTTP ${response.status} at ${pathname}: ${raw.slice(0, 300)}`,
      {
        ...classification,
        phase,
        status: response.status,
        pathname,
      }
    );
  }
  if (body?.requestId !== undefined && body.requestId !== requestId) {
    throw new CanaryFailure(`Request correlation mismatch at ${pathname}`, {
      category: "application",
      phase,
      status: response.status,
      pathname,
      observedSymptom: "response/body correlation mismatch",
      suspectedOrigin: "application",
    });
  }
  return {
    body,
    headers: response.headers,
    requestId,
    status: response.status,
  };
}

async function requestJson(target, pathname, options = {}, phase = "scenario") {
  const {
    deadlineAt = null,
    operation = pathname,
    scenarioIndex = null,
    trace = null,
    ...transportOptions
  } = options;
  const bodyText =
    transportOptions.body === undefined
      ? undefined
      : JSON.stringify(transportOptions.body);
  const evidence = {
    scenarioIndex,
    operation,
    method: transportOptions.method ?? "GET",
    path: pathname,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    requestBodyBytes:
      bodyText === undefined
        ? 0
        : new TextEncoder().encode(bodyText).byteLength,
    status: null,
    contentType: null,
    responseCorrelationId: null,
    aborted: false,
    deadlineExceeded: false,
    error: null,
  };
  try {
    const result = await requestJsonWithTransport(
      target,
      pathname,
      transportOptions,
      phase
    );
    evidence.status = result.status;
    evidence.contentType = result.headers.get("content-type");
    evidence.responseCorrelationId = result.requestId;
    return result;
  } catch (error) {
    if (error !== null && typeof error === "object") {
      error.operation ??= operation;
      error.pathname ??= pathname;
    }
    evidence.status = error?.status ?? null;
    evidence.aborted = error?.cause?.name === "AbortError";
    evidence.error = {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? (error.stack ?? null) : null,
    };
    throw error;
  } finally {
    evidence.finishedAt = new Date().toISOString();
    evidence.deadlineExceeded = deadlineAt !== null && Date.now() > deadlineAt;
    trace?.push(evidence);
  }
}

async function login(target, identity, context = {}) {
  const result = await requestJson(
    target,
    "/api/v1/auth/login",
    {
      method: "POST",
      body: { username: identity.username, password: identity.credential },
      ...context,
    },
    "login"
  );
  return cookieHeader(result.headers);
}

async function createFixture(target, adminCookie) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const department = await requestJson(
    target,
    "/api/v1/programs/departments",
    {
      method: "POST",
      cookie: adminCookie,
      idempotencyKey: `t05-canary-department-${suffix}`,
      body: {
        code: `E2E_CANARY_${suffix}`,
        name: `E2E_CANARY_ Runtime ${suffix}`,
        lifecycle: "Active",
      },
    },
    "fixture/setup"
  );
  const departmentId = department.body?.data?.department?.department_id;
  if (typeof departmentId !== "string") {
    throw new CanaryFailure("Department fixture response had no ID", {
      category: "fixture/setup",
      phase: "fixture/setup",
    });
  }
  for (const moduleKey of ["program_catalog", "events", "enrollment"]) {
    await requestJson(
      target,
      `/api/v1/programs/departments/${departmentId}/modules/${moduleKey}/enable`,
      { method: "POST", cookie: adminCookie },
      "fixture/setup"
    );
  }
  const program = await requestJson(
    target,
    `/api/v1/programs/departments/${departmentId}/programs`,
    {
      method: "POST",
      cookie: adminCookie,
      idempotencyKey: `t05-canary-program-${suffix}`,
      body: {
        name: `E2E_CANARY_ Program ${suffix}`,
        description: "Disposable T05 runtime canary program.",
        category: "T05",
        behavior_type: "Recurring",
        lifecycle: "Active",
        discoverability: "Listed",
        enrollment_mode: "MemberRequest",
      },
    },
    "fixture/setup"
  );
  const programId = program.body?.data?.program?.program_id;
  if (typeof programId !== "string") {
    throw new CanaryFailure("Program fixture response had no ID", {
      category: "fixture/setup",
      phase: "fixture/setup",
    });
  }
  return { departmentId, programId };
}

async function cleanupScenario(db, programId) {
  await db.batch([
    db.prepare("DELETE FROM enrollments WHERE program_id = ?").bind(programId),
    db
      .prepare("DELETE FROM enrollment_requests WHERE program_id = ?")
      .bind(programId),
    db
      .prepare(
        "DELETE FROM sessions WHERE user_id IN ('U-E2E-ADMIN', 'U-E2E-MEMBER')"
      )
      .bind(),
  ]);
}

async function runScenario(target, db, programId, scenarioIndex, deadlineAt) {
  const requestEvidence = [];
  let adminCookie;
  let memberCookie;
  try {
    adminCookie = await login(target, ADMIN, {
      trace: requestEvidence,
      scenarioIndex,
      operation: "admin login",
      deadlineAt,
    });
    memberCookie = await login(target, MEMBER, {
      trace: requestEvidence,
      scenarioIndex,
      operation: "member login",
      deadlineAt,
    });
  } catch (error) {
    error.requestEvidence = requestEvidence;
    throw error;
  }
  const scenarioId = crypto.randomUUID();
  let failure = null;
  try {
    const auth = await requestJson(
      target,
      "/api/v1/auth/me",
      {
        cookie: memberCookie,
        trace: requestEvidence,
        scenarioIndex,
        operation: "member auth/me",
        deadlineAt,
      },
      "scenario"
    );
    if (!auth.body?.data?.user) {
      throw new CanaryFailure("auth/me returned no user projection", {
        category: "application",
        phase: "scenario",
      });
    }

    const catalog = await requestJson(
      target,
      "/api/v1/programs/catalog",
      {
        cookie: memberCookie,
        trace: requestEvidence,
        scenarioIndex,
        operation: "member catalog read",
        deadlineAt,
      },
      "scenario"
    );
    const catalogProgram = catalog.body?.data?.catalog
      ?.flatMap(({ programs }) => programs ?? [])
      .find(({ program_id }) => program_id === programId);
    if (!catalogProgram) {
      throw new CanaryFailure("catalog omitted the canary program", {
        category: "application",
        phase: "scenario",
      });
    }

    const enrollmentRequest = await requestJson(
      target,
      `/api/v1/programs/${programId}/enrollment-requests`,
      {
        method: "POST",
        cookie: memberCookie,
        idempotencyKey: `t05-canary-request-${scenarioId}`,
        body: {},
        trace: requestEvidence,
        scenarioIndex,
        operation: "member enrollment-request create",
        deadlineAt,
      },
      "scenario"
    );
    const requestId = enrollmentRequest.body?.data?.request?.request_id;
    if (typeof requestId !== "string") {
      throw new CanaryFailure("enrollment request response had no ID", {
        category: "application",
        phase: "scenario",
      });
    }

    const decision = await requestJson(
      target,
      `/api/v1/programs/${programId}/enrollment-requests/${requestId}/decision`,
      {
        method: "POST",
        cookie: adminCookie,
        idempotencyKey: `t05-canary-decision-${scenarioId}`,
        body: { action: "Approved" },
        trace: requestEvidence,
        scenarioIndex,
        operation: "admin enrollment-request decision",
        deadlineAt,
      },
      "scenario"
    );
    const enrollmentId = decision.body?.data?.enrollment?.enrollment_id;
    if (
      decision.body?.data?.request?.status !== "Approved" ||
      decision.body?.data?.enrollment?.status !== "Active" ||
      typeof enrollmentId !== "string"
    ) {
      throw new CanaryFailure("approval did not project an active enrollment", {
        category: "application",
        phase: "scenario",
      });
    }

    const detail = await requestJson(
      target,
      `/api/v1/programs/${programId}/participant-detail`,
      {
        cookie: memberCookie,
        trace: requestEvidence,
        scenarioIndex,
        operation: "member participant detail read",
        deadlineAt,
      },
      "scenario"
    );
    if (detail.body?.data?.detail?.program?.program_id !== programId) {
      throw new CanaryFailure(
        "participant detail read-back omitted the program",
        {
          category: "application",
          phase: "scenario",
        }
      );
    }

    await requestJson(
      target,
      `/api/v1/programs/${programId}/management`,
      {
        cookie: adminCookie,
        trace: requestEvidence,
        scenarioIndex,
        operation: "admin management read",
        deadlineAt,
      },
      "scenario"
    );
    await requestJson(
      target,
      `/api/v1/programs/${programId}/enrollments/${enrollmentId}/cancel`,
      {
        method: "POST",
        cookie: memberCookie,
        idempotencyKey: `t05-canary-cancel-${scenarioId}`,
        body: {},
        trace: requestEvidence,
        scenarioIndex,
        operation: "member enrollment cancel",
        deadlineAt,
      },
      "scenario"
    );
  } catch (error) {
    failure = error;
  }

  try {
    await cleanupScenario(db, programId);
  } catch (cleanupError) {
    if (failure === null) {
      failure = new CanaryFailure("canary cleanup failed", {
        category: "fixture/setup",
        phase: "cleanup",
        cause: cleanupError,
      });
    } else {
      failure.cleanup =
        cleanupError instanceof Error
          ? cleanupError.message
          : String(cleanupError);
    }
  }
  if (failure !== null) {
    failure.requestEvidence = requestEvidence;
    throw failure;
  }
}

async function runCommand(name, args, artifactDirectory) {
  try {
    const result = await execFileAsync("pnpm", args, {
      cwd: REPO_ROOT,
      maxBuffer: 8 * 1024 * 1024,
    });
    await writeFile(
      path.join(artifactDirectory, `${name}.log`),
      `${result.stdout}${result.stderr}`,
      "utf8"
    );
  } catch (cause) {
    const output = `${cause?.stdout ?? ""}${cause?.stderr ?? ""}`;
    await writeFile(
      path.join(artifactDirectory, `${name}.log`),
      output,
      "utf8"
    );
    throw new CanaryFailure(`${name} failed`, {
      category: "fixture/setup",
      phase: "fixture/setup",
      cause,
    });
  }
}

export async function prepareProgramsHarness(
  artifactDirectory,
  { withFixture = true } = {}
) {
  let server = null;
  try {
    await assertLocalSecret();
    await runCommand("build", ["--dir", "web", "build"], artifactDirectory);
    await runCommand(
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
      artifactDirectory
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
    const target = (await server.listen()).url;
    const db = await seedWorkerDatabase(server.getWorker(), artifactDirectory);
    const fixture = withFixture
      ? await createFixture(target, await login(target, ADMIN))
      : null;
    return { server, target, db, fixture };
  } catch (error) {
    if (server !== null) {
      try {
        server.debug();
      } catch {
        // Keep the structured log capture below even when debug printing fails.
      }
      const runtimeLogs = server.getLogs();
      await writeJson(
        path.join(artifactDirectory, "runtime-logs.json"),
        runtimeLogs
      ).catch(() => undefined);
      await writeJson(path.join(artifactDirectory, "failure-summary.json"), {
        category: error?.category ?? "fixture/setup",
        phase: error?.phase ?? "fixture/setup",
        message: error instanceof Error ? error.message : String(error),
        revision: await currentRevision(),
        layer: "harness-setup",
        logicalScenario: null,
        route: null,
        state: null,
        viewport: null,
        firstCausalRuntimeSignal: firstCausalRuntimeSignal(runtimeLogs),
        downstreamSymptoms: [],
      }).catch(() => undefined);
      await server.close().catch(() => undefined);
    }
    if (server === null) {
      await writeJson(
        path.join(artifactDirectory, "runtime-logs.json"),
        []
      ).catch(() => undefined);
      await writeJson(path.join(artifactDirectory, "failure-summary.json"), {
        category: error?.category ?? "fixture/setup",
        phase: error?.phase ?? "fixture/setup",
        message: error instanceof Error ? error.message : String(error),
        revision: await currentRevision(),
        layer: "harness-setup",
        logicalScenario: null,
        route: null,
        state: null,
        viewport: null,
        firstCausalRuntimeSignal: null,
        downstreamSymptoms: [],
      }).catch(() => undefined);
    }
    throw error;
  }
}

async function main() {
  const artifactDirectory = process.env.PROGRAMS_CANARY_ARTIFACT_DIRECTORY
    ? path.resolve(REPO_ROOT, process.env.PROGRAMS_CANARY_ARTIFACT_DIRECTORY)
    : path.join(CANARY_ARTIFACT_ROOT, runId());
  await mkdir(artifactDirectory, { recursive: true });
  const setupStartedAt = Date.now();
  const manifest = {
    schemaVersion: 1,
    runtime: "createTestHarness",
    config: "web/wrangler.jsonc",
    retries: CANARY_RETRIES,
    windowMs: CANARY_DURATION_MS,
    revision: await currentRevision(),
    status: "running",
    promotionRunId: process.env.PROGRAMS_PROMOTION_RUN_ID ?? null,
    setupStartedAt: new Date(setupStartedAt).toISOString(),
    startedAt: null,
    scenariosCompleted: 0,
    failures: [],
  };
  await writeJson(path.join(artifactDirectory, "run.json"), manifest);

  let server = null;
  let failure = null;
  let target = null;
  let db = null;
  let causalSignal = null;
  let observedRuntimeFailure = null;
  let confirmedOrigin = null;
  try {
    const prepared = await prepareProgramsHarness(artifactDirectory);
    server = prepared.server;
    target = prepared.target;
    db = prepared.db;
    if (prepared.fixture === null) {
      throw new CanaryFailure("canary fixture was not prepared", {
        category: "fixture/setup",
        phase: "fixture/setup",
      });
    }
    const fixture = prepared.fixture;
    const startedAt = Date.now();
    manifest.startedAt = new Date(startedAt).toISOString();
    await writeJson(path.join(artifactDirectory, "run.json"), manifest);
    const deadline = startedAt + CANARY_DURATION_MS;
    while (Date.now() < deadline) {
      await runScenario(
        target,
        db,
        fixture.programId,
        manifest.scenariosCompleted + 1,
        deadline
      );
      manifest.scenariosCompleted += 1;
      await writeJson(path.join(artifactDirectory, "run.json"), manifest);
    }
    const finishedAt = Date.now();
    if (
      !isCanaryGreen({
        startedAt,
        finishedAt,
        failures: manifest.failures.length,
      })
    ) {
      throw new CanaryFailure("canary did not satisfy the full Green window", {
        category: "runtime transport",
        phase: "qualification",
      });
    }
    manifest.finishedAt = new Date(finishedAt).toISOString();
    manifest.status = "passed";
  } catch (error) {
    failure = error;
    manifest.failures.push({
      category: error?.category ?? "application",
      phase: error?.phase ?? "unknown",
      status: error?.status ?? null,
      operation: error?.operation ?? null,
      path: error?.pathname ?? null,
      observedSymptom: error?.observedSymptom ?? null,
      suspectedOrigin: error?.suspectedOrigin ?? "undetermined",
      confirmedOrigin: error?.confirmedOrigin ?? null,
      message: error instanceof Error ? error.message : String(error),
    });
    manifest.finishedAt = new Date().toISOString();
    manifest.status = "failed";
    process.exitCode = 1;
    process.stderr.write(
      `T05.3 Runtime Reliability Canary failed (${manifest.failures.at(-1).category}/${manifest.failures.at(-1).phase}): ${manifest.failures.at(-1).message}\n`
    );
  } finally {
    if (failure !== null && server !== null) {
      try {
        server.debug();
      } catch {
        // The structured logs below remain the primary failure artifact.
      }
      const runtimeLogs = server.getLogs();
      causalSignal = firstCausalRuntimeSignal(runtimeLogs);
      confirmedOrigin =
        causalSignal !== null && !DOWNSTREAM_MARKER.test(causalSignal)
          ? "runtime"
          : null;
      observedRuntimeFailure =
        failure?.category === "runtime transport"
          ? failure instanceof Error
            ? failure.message
            : String(failure)
          : null;
      await writeJson(
        path.join(artifactDirectory, "runtime-logs.json"),
        runtimeLogs
      );
      await writeJson(path.join(artifactDirectory, "failure-summary.json"), {
        category: failure?.category ?? "application",
        phase: failure?.phase ?? "unknown",
        message: failure instanceof Error ? failure.message : String(failure),
        revision: manifest.revision,
        layer: "runtime-canary",
        logicalScenario:
          failure?.requestEvidence?.at(-1)?.scenarioIndex ?? null,
        route: failure?.pathname ?? null,
        state: failure?.phase ?? null,
        viewport: null,
        operation: failure?.operation ?? null,
        path: failure?.pathname ?? null,
        observedSymptom: failure?.observedSymptom ?? null,
        suspectedOrigin: failure?.suspectedOrigin ?? "undetermined",
        confirmedOrigin,
        cause:
          failure?.cause instanceof Error
            ? {
                message: failure.cause.message,
                stack: failure.cause.stack ?? null,
              }
            : null,
        firstCausalRuntimeSignal: firstCausalRuntimeSignal(runtimeLogs),
        observedRuntimeFailure,
        downstreamSymptoms: observedRuntimeFailure
          ? [observedRuntimeFailure]
          : [],
        scenariosCompleted: manifest.scenariosCompleted,
        target: target?.origin ?? null,
        requestEvidence: Array.isArray(failure?.requestEvidence)
          ? failure.requestEvidence
          : [],
      });
    }
    if (server !== null) {
      try {
        await server.close();
      } catch (closeError) {
        manifest.status = "failed";
        manifest.failures.push({
          category: "runtime transport",
          phase: "cleanup",
          message:
            closeError instanceof Error
              ? closeError.message
              : String(closeError),
        });
        process.exitCode = 1;
      }
    }
    await writeJson(path.join(artifactDirectory, "run.json"), manifest);
    console.log(
      JSON.stringify({
        status: manifest.status,
        scenariosCompleted: manifest.scenariosCompleted,
        artifactDirectory: path.relative(REPO_ROOT, artifactDirectory),
        firstCausalRuntimeSignal: causalSignal,
        observedRuntimeFailure,
      })
    );
  }
}

const isMainModule =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  await main();
}
