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
  exit: Promise<ProcessResult>;
  logClosed: Promise<void>;
};

export const DEFAULT_TARGET_URL = "http://127.0.0.1:8787";
export const DEFAULT_TARGET_PORT = 8787;
export const DEFAULT_ARTIFACT_ROOT = "test-results/programs-d1-runs";
export const PROGRAMS_CONFIG = "tests/e2e/programs-d1.config.ts";

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

function spawnLogged(
  spec: CommandSpec,
  cwd: string,
  environment: NodeJS.ProcessEnv,
  logPath: string,
  echo = true
): LoggedProcess {
  const stream = createWriteStream(logPath, { flags: "a" });
  const child = spawn(spec.command, spec.args, {
    cwd,
    env: environment,
    detached: spec.name === "worker",
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
  return { child, exit, logClosed };
}

async function runLogged(
  spec: CommandSpec,
  cwd: string,
  environment: NodeJS.ProcessEnv,
  logPath: string
): Promise<ProcessResult> {
  const process = spawnLogged(spec, cwd, environment, logPath);
  const result = await process.exit;
  await process.logClosed;
  return result;
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

async function stopLogged(logged: LoggedProcess): Promise<ProcessResult> {
  if (logged.child.exitCode === null && logged.child.signalCode === null) {
    try {
      if (logged.child.pid && process.platform !== "win32") {
        process.kill(-logged.child.pid, "SIGINT");
      } else {
        logged.child.kill("SIGINT");
      }
    } catch {
      // The process may have exited between the state check and signal.
    }
  }
  const graceful = await waitForExit(logged, 10_000);
  if (graceful) {
    await logged.logClosed;
    return graceful;
  }
  try {
    if (logged.child.pid && process.platform !== "win32") {
      process.kill(-logged.child.pid, "SIGTERM");
    } else {
      logged.child.kill("SIGTERM");
    }
  } catch {
    // The process may have exited while the graceful wait elapsed.
  }
  const terminated = await waitForExit(logged, 5_000);
  if (terminated) {
    await logged.logClosed;
    return terminated;
  }
  try {
    if (logged.child.pid && process.platform !== "win32") {
      process.kill(-logged.child.pid, "SIGKILL");
    } else {
      logged.child.kill("SIGKILL");
    }
  } catch {
    // Nothing more can be signalled.
  }
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

async function assertHealthyTarget(target: URL): Promise<void> {
  const response = await fetch(target);
  await response.arrayBuffer();
  if (!response.ok) {
    throw new Error(
      `local Worker readiness request returned HTTP ${response.status}`
    );
  }
  const authResponse = await fetch(new URL("/api/v1/auth/me", target));
  await authResponse.arrayBuffer();
  if (authResponse.status >= 500) {
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
  const seedLog = paths.seedLog;
  const stageLog = (spec: CommandSpec): string =>
    spec.name === "seed-local" || spec.name === "seed-demo"
      ? seedLog
      : spec.name === "programs-playwright"
        ? paths.playwrightLog
        : paths.prepareLog;
  const runStage = async (spec: CommandSpec): Promise<ProcessResult> => {
    const stage: ManifestStage = {
      name: spec.name,
      command: `${spec.command} ${spec.args.join(" ")}`,
      status: "running",
      startedAt: new Date().toISOString(),
    };
    manifest.stages.push(stage);
    await writeManifest(paths.manifest, manifest);
    const result = await runLogged(spec, cwd, environment, stageLog(spec));
    if (spec.name === "programs-playwright") {
      playwrightExit = result;
    }
    stage.exit = result;
    stage.finishedAt = new Date().toISOString();
    stage.status = result.code === 0 ? "passed" : "failed";
    await writeManifest(paths.manifest, manifest);
    if (result.code !== 0) {
      throw new Error(
        `${spec.name} failed with exit code ${result.code ?? "null"}`
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
      paths.workerLog
    );
    await writeManifest(paths.manifest, manifest);
    await waitForWorker(workerProcess, target);
    workerStage.status = "listener-ready";
    workerStage.finishedAt = new Date().toISOString();
    await writeManifest(paths.manifest, manifest);
    await assertHealthyTarget(target);
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
    manifest.status = "passed";
  } catch (error) {
    manifest.status = "failed";
    process.stderr.write(
      `T05 local Programs runtime failed: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  } finally {
    if (workerProcess) {
      workerExit = await stopLogged(workerProcess);
      const workerStage = manifest.stages.find(
        (stage) => stage.name === "worker"
      );
      if (workerStage) {
        workerStage.exit = workerExit;
        workerStage.finishedAt = new Date().toISOString();
        workerStage.status =
          manifest.status === "passed" ? "stopped" : "stopped-after-failure";
      }
    }
    manifest.finishedAt = new Date().toISOString();
    await writeManifest(paths.manifest, manifest);
    await writeFailureSummary(paths, workerExit, playwrightExit, [secret]);
    process.stdout.write(`T05 runtime artifacts: ${paths.directory}\n`);
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
