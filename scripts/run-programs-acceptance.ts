import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type CommandSpec = {
  name: string;
  command: string;
  args: string[];
};

type ProcessResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  error?: string;
};

type PromiseResolvers<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
};

type PromiseConstructorWithResolvers = PromiseConstructor & {
  withResolvers<T>(): PromiseResolvers<T>;
};

const promiseConstructor = Promise as PromiseConstructorWithResolvers;

type LoggedProcess = {
  child: ChildProcess;
  detached: boolean;
  exit: Promise<ProcessResult>;
  logClosed: Promise<void>;
};

export const DEFAULT_TARGET_URL = "http://127.0.0.1:8787";
export const DEFAULT_TARGET_PORT = 8787;
export const DEFAULT_ARTIFACT_ROOT = "test-results/programs-d1-runs";
export const PROGRAMS_CONFIG = "tests/e2e/programs-d1.config.ts";

export const RUNTIME_STAGE_TIMEOUTS_MS = {
  build: 5 * 60 * 1000,
  bundle: 5 * 60 * 1000,
  migrate: 2 * 60 * 1000,
  "seed-local": 2 * 60 * 1000,
  "seed-demo": 2 * 60 * 1000,
  "programs-playwright": 15 * 60 * 1000,
} as const;

type RuntimeStageName = keyof typeof RUNTIME_STAGE_TIMEOUTS_MS;

export function stageTimeoutMs(name: string): number {
  return RUNTIME_STAGE_TIMEOUTS_MS[name as RuntimeStageName] ?? 2 * 60 * 1000;
}

export function runtimeRunSucceeded(
  journeyCompleted: boolean,
  workerExit: ProcessResult | null,
  interruptedSignal: NodeJS.Signals | null = null,
  workerStopRequested = false
): boolean {
  const workerStoppedCleanly =
    (workerExit?.code === 0 && workerExit.signal === null) ||
    (workerStopRequested &&
      workerExit?.code === null &&
      workerExit.signal === "SIGINT");
  return (
    journeyCompleted &&
    interruptedSignal === null &&
    workerExit !== null &&
    workerStoppedCleanly &&
    workerExit.error === undefined
  );
}

export function createSignalCleanup(
  stopActiveStage: () => Promise<unknown>,
  stopWorker: () => Promise<unknown>,
  onSignal: (signal: NodeJS.Signals) => void
): (signal: NodeJS.Signals) => void {
  let cleanupStarted = false;
  return (signal) => {
    if (cleanupStarted) {
      return;
    }
    cleanupStarted = true;
    onSignal(signal);
    void Promise.allSettled([stopActiveStage(), stopWorker()]);
  };
}

export function runtimeCommands(
  persistTo: string,
  port = DEFAULT_TARGET_PORT
): readonly CommandSpec[] {
  if (!path.isAbsolute(persistTo)) {
    throw new Error("T05 runtime persistence path must be absolute");
  }
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("T05 runtime port must be an unprivileged TCP port");
  }

  return [
    { name: "build", command: "pnpm", args: ["--dir", "web", "build"] },
    {
      name: "bundle",
      command: "pnpm",
      args: [
        "--dir",
        "web",
        "exec",
        "wrangler",
        "deploy",
        "--dry-run",
        "--outdir",
        ".wrangler/local-bundle",
      ],
    },
    {
      name: "migrate",
      command: "pnpm",
      args: [
        "--dir",
        "web",
        "exec",
        "wrangler",
        "d1",
        "migrations",
        "apply",
        "efcc-identity",
        "--local",
        "--persist-to",
        persistTo,
      ],
    },
    { name: "seed-local", command: "pnpm", args: ["db:seed:local"] },
    {
      name: "worker",
      command: "pnpm",
      args: [
        "--dir",
        "web",
        "exec",
        "wrangler",
        "dev",
        ".wrangler/local-bundle/worker.js",
        "--config",
        "wrangler.jsonc",
        "--local",
        "--no-bundle",
        "--port",
        String(port),
        "--persist-to",
        persistTo,
      ],
    },
    { name: "seed-demo", command: "pnpm", args: ["db:seed:demo"] },
    {
      name: "programs-playwright",
      command: "pnpm",
      args: ["exec", "playwright", "test", "-c", PROGRAMS_CONFIG],
    },
  ];
}

export type ArtifactPaths = {
  directory: string;
  manifest: string;
  prepareLog: string;
  workerLog: string;
  wranglerLog: string;
  seedLog: string;
  playwrightLog: string;
  results: string;
  playwrightOutput: string;
  persistence: string;
  failureSummary: string;
};

export function runtimeEnvironment(
  target: URL,
  paths: ArtifactPaths,
  inherited: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  return {
    ...inherited,
    CI: "1",
    FORCE_COLOR: "0",
    NO_COLOR: "1",
    PROGRAMS_TARGET_URL: target.origin,
    DEMO_TARGET_URL: target.origin,
    PROGRAMS_RESULTS_FILE: paths.results,
    PROGRAMS_OUTPUT_DIR: paths.playwrightOutput,
    PROGRAMS_PERSIST_TO: paths.persistence,
  };
}

type ManifestStage = {
  name: string;
  command: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  exit?: ProcessResult;
};

export function assertLocalTarget(raw: string): URL {
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    throw new Error(
      `PROGRAMS_TARGET_URL must be an absolute local URL (default: ${DEFAULT_TARGET_URL})`
    );
  }
  if (
    target.protocol !== "http:" ||
    target.username ||
    target.password ||
    !["localhost", "127.0.0.1"].includes(target.hostname) ||
    (target.port !== "" &&
      (!Number.isInteger(Number(target.port)) ||
        Number(target.port) < 1024 ||
        Number(target.port) > 65535))
  ) {
    throw new Error(
      "T05 runtime gate is local-only: PROGRAMS_TARGET_URL must be an HTTP loopback URL on an unprivileged port without credentials"
    );
  }
  if (target.port === "") {
    target.port = "8787";
  }
  target.pathname = "/";
  target.search = "";
  target.hash = "";
  return target;
}

export function artifactPaths(root: string, runId: string): ArtifactPaths {
  if (!/^[a-z0-9][a-z0-9-_.]+$/u.test(runId)) {
    throw new Error("runtime artifact run id contains unsupported characters");
  }
  const directory = path.resolve(root, runId);
  return {
    directory,
    manifest: path.join(directory, "run.json"),
    prepareLog: path.join(directory, "prepare.log"),
    workerLog: path.join(directory, "worker.log"),
    wranglerLog: path.join(directory, "wrangler.log"),
    seedLog: path.join(directory, "seed.log"),
    playwrightLog: path.join(directory, "playwright.log"),
    results: path.join(directory, "programs-d1-results.json"),
    playwrightOutput: path.join(directory, "playwright-output"),
    persistence: path.join(directory, "wrangler-state"),
    failureSummary: path.join(directory, "failure-summary.json"),
  };
}

export function redactSecrets(
  value: string,
  secrets: readonly string[]
): string {
  return secrets.reduce(
    (redacted, secret) =>
      secret.length === 0
        ? redacted
        : redacted.replaceAll(secret, "[REDACTED]"),
    value
  );
}

export type RuntimeSignalSummary = {
  firstRuntimeSignal: string | null;
  proxyFailure: string | null;
  downstreamConnectionSignals: number;
  signals: string[];
};

export function classifyRuntimeSignals(text: string): RuntimeSignalSummary {
  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const signals = lines.filter((line) =>
    /(?:Error (?:in|inside) ProxyController|Error inside ProxyWorker|Could not proxy .*Network connection lost|Network connection lost|Broken pipe|Connection reset by peer|ERR_CONNECTION_REFUSED|deadlock|workerd.*(?:fatal|exited))/iu.test(
      line
    )
  );
  const proxyFailure =
    signals.find((line) =>
      /(?:Error (?:in|inside) ProxyController|Error inside ProxyWorker|Could not proxy .*Network connection lost|Network connection lost|workerd.*(?:fatal|exited)|deadlock)/iu.test(
        line
      )
    ) ?? null;
  return {
    firstRuntimeSignal: signals[0] ?? null,
    proxyFailure,
    downstreamConnectionSignals: signals.filter((line) =>
      /(ERR_CONNECTION_REFUSED|Connection reset by peer)/iu.test(line)
    ).length,
    signals: signals.slice(0, 40),
  };
}

function nowRunId(): string {
  return new Date()
    .toISOString()
    .replaceAll(/[^0-9a-z]/giu, "")
    .toLowerCase();
}

function sleep(milliseconds: number): Promise<void> {
  const { promise, resolve } = promiseConstructor.withResolvers<void>();
  setTimeout(resolve, milliseconds);
  return promise;
}
async function localSecret(): Promise<string> {
  const file = path.resolve("web/.dev.vars");
  let content: string;
  try {
    content = await readFile(file, "utf8");
  } catch {
    throw new Error(
      "web/.dev.vars is required; copy web/.dev.vars.example and set a disposable local EFCC_ACCESS_TOKEN_SECRET"
    );
  }
  const value =
    content.match(
      /^EFCC_ACCESS_TOKEN_SECRET\s*=\s*["']?([^"'\r\n]+)["']?\s*$/mu
    )?.[1] ?? "";
  if (
    value.length < 16 ||
    value.includes("REPLACE_WITH_A_LOCAL_ONLY_RANDOM_HEX_STRING")
  ) {
    throw new Error(
      "web/.dev.vars must contain a non-placeholder disposable EFCC_ACCESS_TOKEN_SECRET"
    );
  }
  return value;
}

export type AuthProbeCredentials = {
  username: string;
  credential: string;
};

export function authProbeCredentials(
  inherited: NodeJS.ProcessEnv = process.env
): AuthProbeCredentials {
  const username = inherited.PROGRAMS_ADMIN_USERNAME ?? "E2E_admin";
  const credential = inherited.PROGRAMS_ADMIN_CREDENTIAL ?? "E2E_admin!dev";
  if (!username.startsWith("E2E_") || credential.trim().length < 8) {
    throw new Error(
      "T05 auth readiness requires disposable PROGRAMS_ADMIN_USERNAME and PROGRAMS_ADMIN_CREDENTIAL fixtures"
    );
  }
  return { username, credential };
}

export function cookieHeaderFromSetCookieHeaders(
  headers: readonly string[]
): string {
  const cookies = headers
    .map((header) => header.split(";", 1)[0]?.trim() ?? "")
    .filter(Boolean);
  if (cookies.length === 0) {
    throw new Error("local Worker auth readiness response set no cookies");
  }
  return cookies.join("; ");
}

function responseSetCookieHeaders(headers: Headers): string[] {
  const responseHeaders = headers as Headers & {
    getSetCookie?: () => string[];
  };
  const nativeHeaders = responseHeaders.getSetCookie?.() ?? [];
  if (nativeHeaders.length > 0) {
    return nativeHeaders;
  }
  const combined = headers.get("set-cookie");
  return combined === null ? [] : combined.split(/,(?=\s*[^;,=\s]+=[^;,]*)/u);
}

export async function fetchWithTimeout(
  input: URL,
  init: RequestInit = {},
  timeoutMs = 10_000
): Promise<Response> {
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

function spawnLogged(
  spec: CommandSpec,
  cwd: string,
  environment: NodeJS.ProcessEnv,
  logPath: string,
  echo = true
): LoggedProcess {
  const stream = createWriteStream(logPath, { flags: "a" });
  const detached = process.platform !== "win32" || spec.name === "worker";
  const child = spawn(spec.command, spec.args, {
    cwd,
    env: environment,
    detached,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const forward = (chunk: Buffer): void => {
    stream.write(chunk);
    if (echo) {
      process.stdout.write(chunk);
    }
  };
  child.stdout?.on("data", forward);
  child.stderr?.on("data", forward);
  const { promise: exit, resolve: resolveExit } =
    promiseConstructor.withResolvers<ProcessResult>();
  let settled = false;
  const finish = (result: ProcessResult): void => {
    if (settled) {
      return;
    }
    settled = true;
    resolveExit(result);
  };
  child.once("error", (error) =>
    finish({ code: null, signal: null, error: error.message })
  );
  child.once("close", (code, signal) => finish({ code, signal }));
  const { promise: logClosed, resolve: resolveLogClosed } =
    promiseConstructor.withResolvers<void>();
  let closed = false;
  const closeLog = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    stream.end(resolveLogClosed);
  };
  child.once("close", closeLog);
  child.once("error", closeLog);
  return { child, detached, exit, logClosed };
}

type RunLoggedHooks = {
  echo?: boolean;
  onStart?: (process: LoggedProcess) => void;
  onFinish?: (process: LoggedProcess) => void;
};

export async function runLogged(
  spec: CommandSpec,
  cwd: string,
  environment: NodeJS.ProcessEnv,
  logPath: string,
  timeoutMs = stageTimeoutMs(spec.name),
  hooks: RunLoggedHooks = {}
): Promise<ProcessResult> {
  const process = spawnLogged(
    spec,
    cwd,
    environment,
    logPath,
    hooks.echo ?? true
  );
  hooks.onStart?.(process);
  try {
    const result = await waitForExit(process, timeoutMs);
    if (result === null) {
      const terminated = await stopLogged(process);
      await process.logClosed;
      return {
        ...terminated,
        error: `${spec.name} timed out after ${timeoutMs}ms`,
      };
    }
    await process.logClosed;
    return result;
  } finally {
    hooks.onFinish?.(process);
  }
}

async function waitForExit(
  process: LoggedProcess,
  timeoutMs: number
): Promise<ProcessResult | null> {
  const { promise: timeout, resolve } =
    promiseConstructor.withResolvers<null>();
  const timer = setTimeout(resolve, timeoutMs, null);
  const result = await Promise.race([process.exit, timeout]);
  clearTimeout(timer);
  return result;
}

export async function stopLogged(
  logged: LoggedProcess
): Promise<ProcessResult> {
  const signal = (name: NodeJS.Signals): void => {
    try {
      if (logged.detached && logged.child.pid && process.platform !== "win32") {
        process.kill(-logged.child.pid, name);
      } else {
        logged.child.kill(name);
      }
    } catch {
      // The process may have exited between the state check and signal.
    }
  };
  if (logged.child.exitCode === null && logged.child.signalCode === null) {
    signal("SIGINT");
  }
  const graceful = await waitForExit(logged, 10_000);
  if (graceful) {
    await logged.logClosed;
    return graceful;
  }
  signal("SIGTERM");
  const terminated = await waitForExit(logged, 5_000);
  if (terminated) {
    await logged.logClosed;
    return terminated;
  }
  signal("SIGKILL");
  const killed = await logged.exit;
  await logged.logClosed;
  return killed;
}

async function waitForWorker(
  logged: LoggedProcess,
  target: URL,
  timeoutMs = 120_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (logged.child.exitCode !== null || logged.child.signalCode !== null) {
      const exited = await logged.exit;
      throw new Error(
        `local Worker exited before readiness (code=${exited.code ?? "null"}, signal=${exited.signal ?? "none"})`
      );
    }
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 2_000);
    try {
      const response = await fetch(target, { signal: controller.signal });
      await response.arrayBuffer();
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the Worker is ready or the bounded deadline expires.
    } finally {
      clearTimeout(abortTimer);
    }
    await sleep(250);
  }
  throw new Error(`local Worker did not become ready within ${timeoutMs}ms`);
}

export async function assertHealthyTarget(
  target: URL,
  credentials: AuthProbeCredentials
): Promise<void> {
  const response = await fetchWithTimeout(target);
  if (!response.ok) {
    throw new Error(
      `local Worker readiness request returned HTTP ${response.status}`
    );
  }
  const loginResponse = await fetchWithTimeout(
    new URL("/api/v1/auth/login", target),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: target.origin,
      },
      body: JSON.stringify({
        username: credentials.username,
        password: credentials.credential,
      }),
    }
  );
  if (!loginResponse.ok) {
    throw new Error(
      `local Worker auth readiness login returned HTTP ${loginResponse.status}`
    );
  }
  const setCookieHeaders = responseSetCookieHeaders(loginResponse.headers);
  const cookieHeader = cookieHeaderFromSetCookieHeaders(setCookieHeaders);
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

async function writeManifest(pathname: string, value: unknown): Promise<void> {
  await writeFile(pathname, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeFailureSummary(
  paths: ArtifactPaths,
  workerExit: ProcessResult | null,
  playwrightExit: ProcessResult | null,
  secrets: readonly string[]
): Promise<void> {
  const [prepare, worker, wrangler, seed, playwright] = await Promise.all([
    readFile(paths.prepareLog, "utf8").catch(() => ""),
    readFile(paths.workerLog, "utf8").catch(() => ""),
    readFile(paths.wranglerLog, "utf8").catch(() => ""),
    readFile(paths.seedLog, "utf8").catch(() => ""),
    readFile(paths.playwrightLog, "utf8").catch(() => ""),
  ]);
  const prepareSignals = classifyRuntimeSignals(
    redactSecrets(prepare, secrets)
  );
  const workerSignals = classifyRuntimeSignals(redactSecrets(worker, secrets));
  const wranglerSignals = classifyRuntimeSignals(
    redactSecrets(wrangler, secrets)
  );
  const seedSignals = classifyRuntimeSignals(redactSecrets(seed, secrets));
  const playwrightSignals = classifyRuntimeSignals(
    redactSecrets(playwright, secrets)
  );
  const proxyFailure =
    wranglerSignals.proxyFailure ?? workerSignals.proxyFailure;
  await writeManifest(paths.failureSummary, {
    schemaVersion: 1,
    workerExit,
    playwrightExit,
    prepareSignals,
    workerSignals,
    wranglerSignals,
    seedSignals,
    playwrightSignals,
    interpretation:
      proxyFailure === null
        ? "No ProxyController/workerd failure marker was observed; inspect the Playwright result and logs for the first failed required row."
        : "The first runtime marker is retained separately from downstream connection-refused/reset signals; this artifact does not convert a failed row into a pass.",
  });
}

async function currentRevision(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"]);
    return stdout.trim();
  } catch {
    return "unknown";
  }
}

async function main(): Promise<void> {
  const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  process.chdir(cwd);
  const target = assertLocalTarget(
    process.env.PROGRAMS_TARGET_URL ?? DEFAULT_TARGET_URL
  );
  const secret = await localSecret();
  const root = process.env.PROGRAMS_ARTIFACT_ROOT ?? DEFAULT_ARTIFACT_ROOT;
  const paths = artifactPaths(root, nowRunId());
  await mkdir(path.dirname(paths.directory), { recursive: true });
  await mkdir(paths.directory, { recursive: false });
  await mkdir(paths.playwrightOutput, { recursive: true });
  await mkdir(paths.persistence, { recursive: true });
  const commands = runtimeCommands(paths.persistence, Number(target.port));

  const manifest: {
    schemaVersion: number;
    runId: string;
    targetUrl: string;
    revision: string;
    status: string;
    startedAt: string;
    finishedAt?: string;
    stages: ManifestStage[];
    artifacts: ArtifactPaths;
  } = {
    schemaVersion: 1,
    runId: path.basename(paths.directory),
    targetUrl: target.origin,
    revision: process.env.GIT_COMMIT ?? (await currentRevision()),
    status: "running",
    startedAt: new Date().toISOString(),
    stages: [],
    artifacts: paths,
  };
  await writeManifest(paths.manifest, manifest);

  const environment = runtimeEnvironment(target, paths);
  const workerEnvironment: NodeJS.ProcessEnv = {
    ...environment,
    WRANGLER_LOG_PATH: paths.wranglerLog,
  };
  let workerProcess: LoggedProcess | null = null;
  let workerExit: ProcessResult | null = null;
  let playwrightExit: ProcessResult | null = null;
  let activeStageProcess: LoggedProcess | null = null;
  let activeStageStop: Promise<ProcessResult> | null = null;
  let workerStop: Promise<ProcessResult> | null = null;
  let workerStopRequested = false;
  let interruptedSignal: NodeJS.Signals | null = null;
  let journeyCompleted = false;
  const seedLog = paths.seedLog;
  const stageLog = (spec: CommandSpec): string =>
    spec.name === "seed-local" || spec.name === "seed-demo"
      ? seedLog
      : spec.name === "programs-playwright"
        ? paths.playwrightLog
        : paths.prepareLog;
  const stopActiveStage = (): Promise<ProcessResult | null> => {
    if (!activeStageProcess) {
      return Promise.resolve(null);
    }
    activeStageStop ??= stopLogged(activeStageProcess);
    return activeStageStop;
  };
  const stopWorker = (): Promise<ProcessResult | null> => {
    if (!workerProcess) {
      return Promise.resolve(null);
    }
    if (
      workerProcess.child.exitCode === null &&
      workerProcess.child.signalCode === null
    ) {
      workerStopRequested = true;
    }
    workerStop ??= stopLogged(workerProcess);
    return workerStop;
  };
  const handleSignal = createSignalCleanup(
    stopActiveStage,
    stopWorker,
    (signal) => {
      interruptedSignal = signal;
      manifest.status = "failed";
      process.exitCode = 1;
    }
  );
  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);
  const runStage = async (spec: CommandSpec): Promise<ProcessResult> => {
    if (interruptedSignal !== null) {
      throw new Error(`T05 runtime interrupted by ${interruptedSignal}`);
    }
    const stage: ManifestStage = {
      name: spec.name,
      command: `${spec.command} ${spec.args.join(" ")}`,
      status: "running",
      startedAt: new Date().toISOString(),
    };
    manifest.stages.push(stage);
    await writeManifest(paths.manifest, manifest);
    activeStageStop = null;
    const result = await runLogged(
      spec,
      cwd,
      environment,
      stageLog(spec),
      stageTimeoutMs(spec.name),
      {
        echo: spec.name !== "programs-playwright",
        onStart: (logged) => {
          activeStageProcess = logged;
        },
        onFinish: (logged) => {
          if (activeStageProcess === logged) {
            activeStageProcess = null;
          }
        },
      }
    );
    if (spec.name === "programs-playwright") {
      playwrightExit = result;
    }
    stage.exit = result;
    stage.finishedAt = new Date().toISOString();
    stage.status =
      result.code === 0 && result.error === undefined ? "passed" : "failed";
    await writeManifest(paths.manifest, manifest);
    if (
      result.code !== 0 ||
      result.error !== undefined ||
      interruptedSignal !== null
    ) {
      throw new Error(
        `${spec.name} failed${result.error ? `: ${result.error}` : ` with exit code ${result.code ?? "null"}`}`
      );
    }
    return result;
  };

  try {
    for (const spec of commands.slice(0, 4)) {
      await runStage(spec);
    }

    const workerSpec = commands[4];
    if (!workerSpec) throw new Error("T05 worker command is missing");
    const workerStage: ManifestStage = {
      name: workerSpec.name,
      command: `${workerSpec.command} ${workerSpec.args.join(" ")}`,
      status: "running",
      startedAt: new Date().toISOString(),
    };
    manifest.stages.push(workerStage);
    workerProcess = spawnLogged(
      workerSpec,
      cwd,
      workerEnvironment,
      paths.workerLog,
      false
    );
    await writeManifest(paths.manifest, manifest);
    await waitForWorker(workerProcess, target);
    workerStage.status = "listener-ready";
    workerStage.finishedAt = new Date().toISOString();
    await writeManifest(paths.manifest, manifest);
    await assertHealthyTarget(target, authProbeCredentials(environment));
    workerStage.status = "authenticated-ready";
    workerStage.finishedAt = new Date().toISOString();
    await writeManifest(paths.manifest, manifest);

    const seedDemoSpec = commands[5];
    const playwrightSpec = commands[6];
    if (!seedDemoSpec || !playwrightSpec) {
      throw new Error("T05 post-worker commands are missing");
    }
    await runStage(seedDemoSpec);
    playwrightExit = await runStage(playwrightSpec);
    journeyCompleted = true;
  } catch (error) {
    manifest.status = "failed";
    process.stderr.write(
      `T05 local Programs runtime failed: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  } finally {
    try {
      if (workerProcess) {
        try {
          workerExit = await stopWorker();
        } catch (error) {
          workerExit = {
            code: null,
            signal: null,
            error: error instanceof Error ? error.message : String(error),
          };
          process.exitCode = 1;
        }
        const completedWorkerStage = manifest.stages.find(
          (stage) => stage.name === "worker"
        );
        if (completedWorkerStage) {
          if (workerExit !== null) {
            completedWorkerStage.exit = workerExit;
          }
          completedWorkerStage.finishedAt = new Date().toISOString();
          completedWorkerStage.status = runtimeRunSucceeded(
            journeyCompleted,
            workerExit,
            interruptedSignal,
            workerStopRequested
          )
            ? "stopped"
            : "stopped-after-failure";
        }
      }
      const succeeded = runtimeRunSucceeded(
        journeyCompleted,
        workerExit,
        interruptedSignal,
        workerStopRequested
      );
      if (succeeded) {
        manifest.status = "passed";
      } else {
        manifest.status = "failed";
        process.exitCode = 1;
      }
      manifest.finishedAt = new Date().toISOString();
      await writeManifest(paths.manifest, manifest);
      await writeFailureSummary(paths, workerExit, playwrightExit, [secret]);
      process.stdout.write(`T05 runtime artifacts: ${paths.directory}\n`);
    } finally {
      process.off("SIGINT", handleSignal);
      process.off("SIGTERM", handleSignal);
    }
  }
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `T05 local Programs runtime failed: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  });
}
