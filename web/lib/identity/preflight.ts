/**
 * Disposable D1 schema preflight for the normalized identity cutover.
 *
 * The check is read-only. It refuses non-disposable databases and any
 * database containing a retired authority table, even when normalized tables
 * are also present. The result contains the exact manual reset command; this
 * module never executes DROP.
 */

const DISPOSABLE_NAME_PREFIXES = [
  "E2E_",
  "E2E_DEMO_",
  "E2E_DISPOSABLE_",
] as const;

const LEGACY_PRE_019_TABLES = [
  "role_capabilities",
  "department_managers",
  "program_leaders",
  "permission_policy_state",
  "permission_policy_mutations",
] as const;

const REQUIRED_POST_019_TABLES = [
  "role_categories",
  "role_definitions",
  "role_definition_grants",
  "role_assignments",
  "role_policy_revisions",
  "role_policy_mutations",
  "role_audit_events",
] as const;

const REQUIRED_POST_019_COLUMNS = [
  { table: "role_policy_mutations", column: "result_json" },
  { table: "role_assignments", column: "scope_kind" },
  { table: "role_assignments", column: "scope_id" },
] as const;

type RequiredPost019Column = (typeof REQUIRED_POST_019_COLUMNS)[number];

export type PreflightOutcome =
  | { kind: "ok" }
  | {
      kind: "stale-schema";
      database: string;
      legacyTables: readonly string[];
      resetCommand: string;
      message: string;
    }
  | {
      kind: "non-disposable";
      database: string;
      reason: string;
      resetCommand: string;
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

function buildResetCommand(database: string): string {
  const drops = LEGACY_PRE_019_TABLES.map(
    (table) => `DROP TABLE IF EXISTS ${table};`
  ).join(" ");
  return (
    `wrangler d1 execute ${database} --local --command "${drops}" ` +
    `# then: pnpm --dir web db:migrate:local && pnpm db:seed:disposable`
  );
}

interface TableNameRow {
  name: string;
}

/**
 * Inspect the binding for a stale pre-019 schema, a non-disposable database
 * name, or a missing disposable schema. The check is read-only and never
 * issues a DROP of its own.
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
      resetCommand: buildResetCommand(database),
      message: [
        `Refusing to seed or migrate the non-disposable database "${database}".`,
        `Only databases prefixed with ${DISPOSABLE_NAME_PREFIXES.join(
          ", "
        )} are eligible for the disposable pre-production schema.`,
        `Manual reset command:`,
        buildResetCommand(database),
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

  const legacyHits = LEGACY_PRE_019_TABLES.filter((table) => tables.has(table));
  if (legacyHits.length > 0) {
    return {
      kind: "stale-schema",
      database,
      legacyTables: legacyHits,
      resetCommand: buildResetCommand(database),
      message: [
        `Detected retired authority tables in "${database}" (tables: ${legacyHits.join(
          ", "
        )}).`,
        `The preflight does NOT auto-drop. Run the following command by hand, then re-run seeds:`,
        buildResetCommand(database),
      ].join("\n"),
    };
  }

  const missing = REQUIRED_POST_019_TABLES.filter(
    (table) => !tables.has(table)
  );
  if (missing.length === REQUIRED_POST_019_TABLES.length) {
    return { kind: "ok" };
  }
  const missingColumns = (
    await Promise.all(
      REQUIRED_POST_019_COLUMNS.filter(({ table }) => tables.has(table)).map(
        async (requirement: RequiredPost019Column) => {
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
        "Re-run the latest disposable identity migrations before seeding.",
      ].join("\n"),
    };
  }

  return { kind: "ok" };
}

export const __test = {
  DISPOSABLE_NAME_PREFIXES,
  LEGACY_PRE_019_TABLES,
  REQUIRED_POST_019_TABLES,
  REQUIRED_POST_019_COLUMNS,
  isDisposableName,
  buildResetCommand,
};
