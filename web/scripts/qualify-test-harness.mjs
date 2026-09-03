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
const REPO_ROOT = path.resolve(process.cwd(), "..");

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
      detached: true,
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

async function runProbe() {
  const artifactDirectory = path.join(
    REPO_ROOT,
    "test-results",
    "test-harness-qualification",
    runId()
  );
  mkdirSync(artifactDirectory, { recursive: true });
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
    console.log(
      JSON.stringify({
        phase: "unfiltered-programs-playwright",
        outcome: playwrightResult.code === 0 ? "pass" : "fail",
        code: playwrightResult.code,
        signal: playwrightResult.signal,
        log: path.relative(REPO_ROOT, playwrightLog),
        results: path.relative(REPO_ROOT, playwrightResults),
      })
    );
    if (playwrightResult.code !== 0) {
      throw new Error(
        `unfiltered Programs Playwright journey failed with exit code ${playwrightResult.code ?? "null"}`
      );
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
  const timeout = new Promise((resolve) => {
    setTimeout(() => resolve({ timeout: true }), QUALIFICATION_TIMEOUT_MS);
  });
  const result = await Promise.race([exited, timeout]);
  if ("timeout" in result) {
    killProcessGroup(child, "SIGTERM");
    await Promise.race([
      exited,
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
    killProcessGroup(child, "SIGKILL");
    console.log(
      JSON.stringify({
        phase: "qualification",
        outcome: "timeout",
        timeoutMs: QUALIFICATION_TIMEOUT_MS,
        capturedOutput: summarizeOutput(output),
      })
    );
    process.exitCode = 2;
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

if (process.argv.includes("--probe")) {
  await runProbe();
} else {
  await runBoundedQualification();
}
