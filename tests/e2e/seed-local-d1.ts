import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const DATABASE = "efcc-identity";
const persistTo = process.env.PROGRAMS_PERSIST_TO?.trim() ?? "";

function persistenceArgs(): string[] {
  return persistTo ? ["--persist-to", persistTo] : [];
}

function applyGeneratedSeed(
  temporaryDirectory: string,
  label: string,
  option: "--reset" | "--reset-legacy"
): void {
  const sql = execFileSync(
    "pnpm",
    ["exec", "tsx", "tests/e2e/seed-dev-accounts.ts", option],
    { encoding: "utf8" }
  );
  const seedFile = path.join(temporaryDirectory, `${label}.sql`);
  writeFileSync(seedFile, sql, "utf8");
  execFileSync(
    "pnpm",
    [
      "--dir",
      "web",
      "exec",
      "wrangler",
      "d1",
      "execute",
      DATABASE,
      "--local",
      ...persistenceArgs(),
      "--file",
      seedFile,
    ],
    { stdio: "inherit" }
  );
}

function main(): void {
  const temporaryDirectory = mkdtempSync(
    path.join(os.tmpdir(), "efcc-seed-local-d1-")
  );
  try {
    applyGeneratedSeed(temporaryDirectory, "reset", "--reset");
    applyGeneratedSeed(temporaryDirectory, "reset-legacy", "--reset-legacy");
    execFileSync("pnpm", ["db:seed:disposable"], {
      stdio: "inherit",
      env: process.env,
    });
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error: unknown) {
  process.stderr.write(
    `error: local D1 seed failed: ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exitCode = 1;
}
