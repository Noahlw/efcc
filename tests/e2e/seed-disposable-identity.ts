import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DATABASE = "efcc-identity";
const LEGACY_TABLES = [
  "role_capabilities",
  "department_managers",
  "program_leaders",
  "permission_policy_state",
  "permission_policy_mutations",
] as const;

interface WranglerResult {
  results?: { name?: string }[];
}

function readTableNames(): Set<string> {
  const output = execFileSync(
    "pnpm",
    [
      "--filter",
      "web",
      "exec",
      "wrangler",
      "d1",
      "execute",
      DATABASE,
      "--local",
      "--json",
      "--command",
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';",
    ],
    { encoding: "utf-8" }
  );
  const result = JSON.parse(output) as WranglerResult[];
  return new Set(
    (result[0]?.results ?? [])
      .map((row) => row.name?.toLowerCase())
      .filter((name): name is string => typeof name === "string")
  );
}

function main(): void {
  try {
    const tables = readTableNames();
    const staleTables = LEGACY_TABLES.filter((table) => tables.has(table));
    if (staleTables.length > 0) {
      throw new Error(
        `Disposable seed refused: retired authority tables remain (${staleTables.join(", ")}). Stop the local Worker and run pnpm db:reset:local to rebuild only this worktree's local D1.`
      );
    }
    const seedFile = fileURLToPath(
      new URL("seed-disposable-identity.sql", import.meta.url)
    );
    execFileSync(
      "pnpm",
      [
        "--filter",
        "web",
        "exec",
        "wrangler",
        "d1",
        "execute",
        DATABASE,
        "--local",
        "--file",
        seedFile,
      ],
      { stdio: "inherit" }
    );
  } catch (error) {
    process.stderr.write(
      `error: disposable identity seed failed: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  }
}

main();
