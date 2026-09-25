import { execFile, spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const WEB_ROOT = path.join(REPO_ROOT, "web");
const WRANGLER_BIN = path.join(
  WEB_ROOT,
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js"
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

async function generatedFixtureSql() {
  try {
    const result = await execFileAsync(
      "pnpm",
      ["--silent", "exec", "tsx", "tests/e2e/seed-dev-accounts.ts"],
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

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error) {
          reject(error);
        } else if (!address || typeof address === "string") {
          reject(new Error("Could not determine an available Worker port"));
        } else {
          resolve(address.port);
        }
      });
    });
  });
}

function localWorkerServer(persistDirectory, port) {
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.execPath,
    [
      WRANGLER_BIN,
      "dev",
      "--local",
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--persist-to",
      persistDirectory,
    ],
    {
      cwd: WEB_ROOT,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  let logText = "";
  let spawnError = null;
  let closePromise = null;
  let exitResult = null;
  const exited = new Promise((resolve) => {
    child.once("close", (code, signal) => {
      exitResult = { code, signal };
      resolve(exitResult);
    });
  });
  const capture = (chunk) => {
    logText = `${logText}${chunk}`.slice(-256_000);
  };
  child.stdout.setEncoding("utf8").on("data", capture);
  child.stderr.setEncoding("utf8").on("data", capture);
  child.once("error", (error) => {
    spawnError = error;
  });

  const close = async () => {
    if (closePromise !== null) return closePromise;
    closePromise = (async () => {
      process.off("SIGINT", onInterrupt);
      process.off("SIGTERM", onTerminate);
      if (exitResult === null) {
        const signal = (name) => {
          try {
            if (process.platform === "win32" || child.pid === undefined) {
              child.kill(name);
            } else {
              process.kill(-child.pid, name);
            }
          } catch (error) {
            if (error?.code !== "ESRCH") throw error;
          }
        };
        signal("SIGTERM");
        let timeoutId;
        try {
          const timeout = new Promise((resolve) => {
            timeoutId = setTimeout(() => resolve(null), 5_000);
          });
          if ((await Promise.race([exited, timeout])) === null) {
            signal("SIGKILL");
            await exited;
          }
        } finally {
          clearTimeout(timeoutId);
        }
      }
      await rm(persistDirectory, { recursive: true, force: true });
    })();
    return closePromise;
  };
  const forwardSignal = (signal, exitCode) => {
    void close()
      .catch((error) => {
        process.stderr.write(
          `Local Worker cleanup failed: ${error instanceof Error ? error.message : String(error)}\n`
        );
      })
      .finally(() => {
        process.exitCode = exitCode;
        process.kill(process.pid, signal);
      });
  };
  const onInterrupt = () => forwardSignal("SIGINT", 130);
  const onTerminate = () => forwardSignal("SIGTERM", 143);
  process.once("SIGINT", onInterrupt);
  process.once("SIGTERM", onTerminate);

  return {
    origin,
    getLogs() {
      return logText.split(/\r?\n/u).filter(Boolean);
    },
    debug() {
      if (logText) process.stderr.write(logText);
    },
    async waitUntilReady() {
      const deadline = Date.now() + 30_000;
      let lastError = null;
      while (Date.now() < deadline) {
        if (spawnError) throw spawnError;
        if (exitResult !== null) {
          throw new Error(
            `Local Wrangler Worker exited before readiness (${exitResult.code ?? exitResult.signal})`
          );
        }
        try {
          const response = await fetch(`${origin}/api/v1/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
            signal: AbortSignal.timeout(1_000),
          });
          if (response.status < 500) return;
          lastError = new Error(
            `Worker readiness returned HTTP ${response.status}`
          );
        } catch (error) {
          lastError = error;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      throw new Error(
        "Local Wrangler Worker did not become ready within 30 seconds",
        {
          cause: lastError,
        }
      );
    },
    close,
  };
}

async function executeLocalSqlFile(
  name,
  persistDirectory,
  sql,
  artifactDirectory
) {
  const filename = path.join(persistDirectory, `${name}.sql`);
  await writeFile(filename, `${sql.trim()}\n`, "utf8");
  try {
    await runCommand(
      name,
      [
        "--filter",
        "web",
        "exec",
        "wrangler",
        "d1",
        "execute",
        "efcc-identity",
        "--local",
        "--persist-to",
        persistDirectory,
        "--file",
        filename,
      ],
      artifactDirectory
    );
  } finally {
    await rm(filename, { force: true });
  }
}

async function assertLocalSecret() {
  const filename = path.join(REPO_ROOT, "web", ".dev.vars");
  let contents;
  try {
    contents = await readFile(filename, "utf8");
  } catch (cause) {
    throw new CanaryFailure(
      "web/.dev.vars is required for the local Worker canary",
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

async function seedWorkerDatabase(persistDirectory, artifactDirectory) {
  try {
    await runCommand(
      "migrations",
      [
        "--filter",
        "web",
        "exec",
        "wrangler",
        "d1",
        "migrations",
        "apply",
        "efcc-identity",
        "--local",
        "--persist-to",
        persistDirectory,
      ],
      artifactDirectory
    );
    const seedSql = (await generatedFixtureSql())
      .replace(/^\s*--.*$/gim, "")
      .trim();
    await executeLocalSqlFile(
      "fixture-seed",
      persistDirectory,
      seedSql,
      artifactDirectory
    );
    await writeJson(path.join(artifactDirectory, "fixture-seed.json"), {
      identitySeed: "applied to fresh local D1",
      storage: "Wrangler local persistence directory",
    });
    return { persistDirectory };
  } catch (cause) {
    throw cause instanceof CanaryFailure
      ? cause
      : new CanaryFailure(
          "Local Wrangler D1 migration or fixture setup failed",
          {
            category: "fixture/setup",
            phase: "fixture/setup",
            cause,
          }
        );
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
  // Program creation is intentionally Draft + Unlisted. Publish the fixture
  // explicitly before the member-facing catalog read below.
  await requestJson(
    target,
    `/api/v1/programs/${programId}`,
    {
      method: "PATCH",
      cookie: adminCookie,
      body: { lifecycle: "Active", discoverability: "Listed" },
    },
    "fixture/setup"
  );
  return { departmentId, programId };
}

async function cleanupScenario(db, programId) {
  const safeProgramId = `'${String(programId).replaceAll("'", "''")}'`;
  const sql = [
    `DELETE FROM enrollments WHERE program_id = ${safeProgramId}`,
    `DELETE FROM enrollment_requests WHERE program_id = ${safeProgramId}`,
    "DELETE FROM sessions WHERE user_id IN ('U-E2E-ADMIN', 'U-E2E-MEMBER')",
  ].join("; ");
  await execFileAsync(
    "pnpm",
    [
      "--filter",
      "web",
      "exec",
      "wrangler",
      "d1",
      "execute",
      "efcc-identity",
      "--local",
      "--persist-to",
      db.persistDirectory,
      "--command",
      sql,
    ],
    { cwd: REPO_ROOT, maxBuffer: 4 * 1024 * 1024 }
  );
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
    if (failure !== null && typeof failure === "object") {
      const lastRequest = requestEvidence.at(-1);
      failure.scenarioIndex ??= scenarioIndex;
      failure.operation ??= lastRequest?.operation ?? null;
      failure.pathname ??= lastRequest?.path ?? null;
    }
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

async function runCommand(name, args, artifactDirectory, env = process.env) {
  try {
    const result = await execFileAsync("pnpm", args, {
      cwd: REPO_ROOT,
      env,
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
  let persistDirectory = null;
  try {
    await assertLocalSecret();
    await runCommand("build", ["--dir", "web", "build"], artifactDirectory);
    persistDirectory = await mkdtemp(path.join(tmpdir(), "efcc-programs-d1-"));
    const db = await seedWorkerDatabase(persistDirectory, artifactDirectory);
    server = localWorkerServer(persistDirectory, await availablePort());
    await server.waitUntilReady();
    const target = new URL(server.origin);
    const adminCookie = await login(target, ADMIN);
    await runCommand(
      "demo-seed",
      ["--silent", "exec", "tsx", "tests/e2e/seed-demo.ts"],
      artifactDirectory,
      { ...process.env, DEMO_TARGET_URL: target.origin }
    );
    const fixture = withFixture
      ? await createFixture(target, adminCookie)
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
        cause: error?.cause instanceof Error ? error.cause.message : undefined,
        revision: await currentRevision(),
        layer: "harness-setup",
        logicalScenario: null,
        route: null,
        state: null,
        viewport: null,
        firstCausalRuntimeSignal: firstCausalRuntimeSignal(runtimeLogs),
        downstreamSymptoms: [],
      }).catch(() => undefined);
      await server.close();
    }
    if (server === null) {
      if (persistDirectory !== null) {
        await rm(persistDirectory, { recursive: true, force: true });
      }
      await writeJson(
        path.join(artifactDirectory, "runtime-logs.json"),
        []
      ).catch(() => undefined);
      await writeJson(path.join(artifactDirectory, "failure-summary.json"), {
        category: error?.category ?? "fixture/setup",
        phase: error?.phase ?? "fixture/setup",
        message: error instanceof Error ? error.message : String(error),
        cause: error?.cause instanceof Error ? error.cause.message : undefined,
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
    runtime: "wrangler-dev-local",
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
