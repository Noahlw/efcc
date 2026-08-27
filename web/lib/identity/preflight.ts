/**
 * EFCC D1 identity (Spec 091 §1) — pre-production disposable schema preflight.
 *
 * The disposable pre-production schema replaces the obsolete fixed-role
 * permission tables (role_capabilities / permission_policy_state /
 * permission_policy_mutations). The preflight refuses to proceed against
 * any D1 binding whose name does not match the documented disposable
 * convention, surfaces the explicit DROP TABLE commands the operator must
 * run by hand, and never issues a DROP of its own.
 *
 * Two failure modes are explicitly handled:
 *
 *   1. Stale pre-019 schema: a legacy role_capabilities /
 *      permission_policy_state / permission_policy_mutations table is present
 *      and the disposable schema is missing. The preflight prints the
 *      exact `wrangler d1 execute ... --command "DROP TABLE IF EXISTS ..."`
 *      line the operator must run themselves and exits non-zero. No DROP is
 *      issued by the preflight.
 *   2. Unknown or non-disposable database name: a name that does not match
 *      the disposable prefix convention is treated as a production or
 *      shared-environment target. The preflight refuses to proceed and
 *      surfaces the name plus the required manual reset command.
 *
 * When the new schema (role_categories, role_definitions, ...) is present,
 * the preflight allows the seed and mutation paths to run even if some
 * legacy tables still co-exist; the operator is responsible for running the
 * manual reset on a clean disposable D1 before that D1 enters the
 * replacement cutover.
 */

const DISPOSABLE_NAME_PREFIXES = [
  "E2E_",
  "E2E_DEMO_",
  "E2E_DISPOSABLE_",
  "disposable-",
] as const;

const LEGACY_PRE_019_TABLES = [
  "role_capabilities",
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
    `# then: pnpm db:migrate:local && pnpm db:seed:disposable`
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
        `To override, set EFCC_DISPOSABLE_ALLOW_NON_DISPOSABLE=1 in the local environment,`,
        `or rename the database to follow the disposable convention.`,
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
  const tables = new Set((result.results ?? []).map((row) => row.name));

  const legacyHits = LEGACY_PRE_019_TABLES.filter((table) => tables.has(table));
  const hasNewSchema = REQUIRED_POST_019_TABLES.every((table) =>
    tables.has(table)
  );
  if (legacyHits.length > 0 && !hasNewSchema) {
    return {
      kind: "stale-schema",
      database,
      legacyTables: legacyHits,
      resetCommand: buildResetCommand(database),
      message: [
        `Detected stale pre-019 schema in "${database}" (legacy tables: ${legacyHits.join(
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
  if (missing.length > 0) {
    return {
      kind: "incomplete-schema",
      database,
      missingTables: missing,
      message: [
        `Disposable database "${database}" is partially migrated; missing tables: ${missing.join(
          ", "
        )}.`,
        `Re-run \`pnpm db:migrate:local\` to bring the schema to 0019.`,
      ].join("\n"),
    };
  }

  return { kind: "ok" };
}

export const __test = {
  DISPOSABLE_NAME_PREFIXES,
  LEGACY_PRE_019_TABLES,
  REQUIRED_POST_019_TABLES,
  isDisposableName,
  buildResetCommand,
};
