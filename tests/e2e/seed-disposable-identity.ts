import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DATABASE = "efcc-identity";
const persistTo = process.env.PROGRAMS_PERSIST_TO?.trim() ?? "";
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

function persistenceArgs(): string[] {
  return persistTo ? ["--persist-to", persistTo] : [];
}

function readTableNames(): Set<string> {
  const output = execFileSync(
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
      const persistence = persistenceArgs();
      const persistenceSuffix =
        persistence.length > 0 ? `${persistence.join(" ")} ` : "";
      const resetCommand = `pnpm --dir web exec wrangler d1 execute ${DATABASE} --local ${persistenceSuffix}--command "${staleTables.map((table) => `DROP TABLE IF EXISTS ${table};`).join(" ")}"`;
      throw new Error(
        `Disposable seed refused: retired authority tables remain (${staleTables.join(", ")}). Manually confirm this is the disposable local DB, run ${resetCommand}, then rerun pnpm db:seed:disposable.`
      );
    }
    const seedFile = fileURLToPath(
      new URL("seed-disposable-identity.sql", import.meta.url)
    );
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
  } catch (error) {
    process.stderr.write(
      `error: disposable identity seed failed: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  }
}

main();
