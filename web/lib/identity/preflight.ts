/**
 * Disposable D1 schema preflight for the current normalized identity seed.
 *
 * The check is read-only. It refuses non-disposable databases and any
 * database containing a retired authority table, even when normalized tables
 * are also present. Rebuild instructions name the database owner; this module
 * never executes DROP or suggests dropping selected tables.
 */

const DISPOSABLE_NAME_PREFIXES = [
  "E2E_",
  "E2E_DEMO_",
  "E2E_DISPOSABLE_",
] as const;

const RETIRED_AUTHORITY_TABLES = [
  "role_capabilities",
  "department_managers",
  "program_leaders",
  "permission_policy_state",
  "permission_policy_mutations",
] as const;

const REQUIRED_IDENTITY_TABLES = [
  "accounts",
  "departments",
  "programs",
  "role_categories",
  "role_definitions",
  "role_definition_grants",
  "role_assignments",
  "role_policy_revisions",
  "role_policy_mutations",
  "role_audit_events",
] as const;

const REQUIRED_IDENTITY_COLUMNS = [
  { table: "role_policy_mutations", column: "result_json" },
  { table: "role_assignments", column: "scope_kind" },
  { table: "role_assignments", column: "scope_id" },
] as const;

type RequiredIdentityColumn = (typeof REQUIRED_IDENTITY_COLUMNS)[number];

export type PreflightOutcome =
  | { kind: "ok" }
  | {
      kind: "stale-schema";
      database: string;
      legacyTables: readonly string[];
      message: string;
    }
  | {
      kind: "non-disposable";
      database: string;
      reason: string;
      message: string;
    }
  | {
      kind: "incomplete-schema";
      database: string;
      missingTables: readonly string[];
      missingColumns: readonly string[];
      message: string;
    };

export interface DisposableDatabaseInfo {
  /** The binding name (e.g. `DB`) and database_name from wrangler.jsonc. */
  readonly databaseName: string;
}

function isDisposableName(name: string): boolean {
  return DISPOSABLE_NAME_PREFIXES.some((prefix) => name.startsWith(prefix));
}

interface TableNameRow {
  name: string;
}

/**
 * Inspect the binding for retired authority tables, a non-disposable database
 * name, or a missing identity schema. The check is read-only and never drops
 * tables.
 */
export async function preflightDisposableSchema(
  db: D1Database,
  info: DisposableDatabaseInfo
): Promise<PreflightOutcome> {
  const database = info.databaseName;
  if (!isDisposableName(database)) {
    return {
      kind: "non-disposable",
      database,
      reason: `Database name "${database}" does not match the documented disposable prefix (${DISPOSABLE_NAME_PREFIXES.join(", ")}).`,
      message: [
        `Refusing to seed or migrate the non-disposable database "${database}".`,
        `Only databases prefixed with ${DISPOSABLE_NAME_PREFIXES.join(
          ", "
        )} are eligible for the disposable pre-production schema.`,
        "No database command was run. Verify the intended target and use its separately approved maintenance procedure.",
      ].join("\n"),
    };
  }

  const result = await db
    .prepare(
      `SELECT name FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`
    )
    .all<TableNameRow>();
  const tables = new Set(
    (result.results ?? []).map((row) => row.name.toLowerCase())
  );

  const legacyHits = RETIRED_AUTHORITY_TABLES.filter((table) =>
    tables.has(table)
  );
  if (legacyHits.length > 0) {
    return {
      kind: "stale-schema",
      database,
      legacyTables: legacyHits,
      message: [
        `Detected retired authority tables in "${database}" (tables: ${legacyHits.join(
          ", "
        )}).`,
        "The preflight never drops selected tables. Recreate this disposable database from the current baseline through its owning test runner.",
        "For this worktree's Wrangler-local D1 only, stop its Worker and run pnpm db:reset:local before reseeding.",
      ].join("\n"),
    };
  }

  const missing = REQUIRED_IDENTITY_TABLES.filter(
    (table) => !tables.has(table)
  );
  const missingColumns = (
    await Promise.all(
      REQUIRED_IDENTITY_COLUMNS.filter(({ table }) => tables.has(table)).map(
        async (requirement: RequiredIdentityColumn) => {
          const columns = await db
            .prepare(`PRAGMA table_info(${requirement.table})`)
            .all<{ name: string }>();
          return (columns.results ?? []).some(
            ({ name }) => name === requirement.column
          )
            ? null
            : `${requirement.table}.${requirement.column}`;
        }
      )
    )
  ).filter((column): column is string => column !== null);
  if (missing.length > 0 || missingColumns.length > 0) {
    const details = [
      missing.length > 0 ? `missing tables: ${missing.join(", ")}` : null,
      missingColumns.length > 0
        ? `missing columns: ${missingColumns.join(", ")}`
        : null,
    ].filter((detail): detail is string => detail !== null);
    return {
      kind: "incomplete-schema",
      database,
      missingTables: missing,
      missingColumns,
      message: [
        `Disposable database "${database}" is partially migrated; ${details.join(
          "; "
        )}.`,
        "Recreate this disposable database from the current migration baseline through its owning test runner.",
        "For this worktree's Wrangler-local D1 only, stop its Worker and run pnpm db:reset:local before reseeding.",
      ].join("\n"),
    };
  }

  return { kind: "ok" };
}

export const __test = {
  DISPOSABLE_NAME_PREFIXES,
  RETIRED_AUTHORITY_TABLES,
  REQUIRED_IDENTITY_TABLES,
  REQUIRED_IDENTITY_COLUMNS,
  isDisposableName,
};
