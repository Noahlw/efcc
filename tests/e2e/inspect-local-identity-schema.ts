import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const REQUIRED_TABLES = [
  "role_categories",
  "role_definitions",
  "role_definition_grants",
  "role_assignments",
  "role_policy_revisions",
  "role_policy_mutations",
  "role_audit_events",
] as const;

const REQUIRED_ROLE_FREE_TABLES = [
  "accounts",
  "registration_requests",
] as const;

const LEGACY_TABLES = [
  "role_capabilities",
  "department_managers",
  "program_leaders",
  "permission_policy_state",
  "permission_policy_mutations",
] as const;

const REMOVED_ROLE_GUARDS = [
  "accounts_role_write_guard_insert",
  "accounts_role_write_guard_update",
] as const;

const SCHEMA_QUERY = `
SELECT 'object' AS kind, name, type, NULL AS table_name, NULL AS column_name
FROM sqlite_master
WHERE type IN ('table', 'trigger')
UNION ALL
SELECT 'column', NULL, 'table', 'accounts', name
FROM pragma_table_info('accounts')
UNION ALL
SELECT 'column', NULL, 'table', 'registration_requests', name
FROM pragma_table_info('registration_requests')
ORDER BY kind, name, table_name, column_name;
`;

interface SchemaRow {
  kind: "column" | "object";
  name: string | null;
  type: string;
  table_name: string | null;
  column_name: string | null;
}

interface WranglerResult {
  results?: SchemaRow[];
}

export interface LocalIdentitySchemaSnapshot {
  objects: Set<string>;
  columns: Map<string, Set<string>>;
}

export function parseSchemaRows(output: string): LocalIdentitySchemaSnapshot {
  const payload = JSON.parse(output) as WranglerResult[];
  const rows = payload[0]?.results ?? [];
  const objects = new Set<string>();
  const columns = new Map<string, Set<string>>();

  for (const row of rows) {
    if (row.kind === "object" && row.name) {
      objects.add(row.name);
      continue;
    }
    if (row.kind === "column" && row.table_name && row.column_name) {
      const tableColumns = columns.get(row.table_name) ?? new Set<string>();
      tableColumns.add(row.column_name);
      columns.set(row.table_name, tableColumns);
    }
  }

  return { objects, columns };
}

export function assertRoleFreeIdentitySchema(
  snapshot: LocalIdentitySchemaSnapshot
): void {
  const missingTables = REQUIRED_TABLES.filter(
    (table) => !snapshot.objects.has(table)
  );
  const missingRoleFreeTables = REQUIRED_ROLE_FREE_TABLES.filter(
    (table) => !snapshot.objects.has(table)
  );
  const legacyTables = LEGACY_TABLES.filter((table) =>
    snapshot.objects.has(table)
  );
  const legacyGuards = REMOVED_ROLE_GUARDS.filter((trigger) =>
    snapshot.objects.has(trigger)
  );
  const roleColumns = REQUIRED_ROLE_FREE_TABLES.filter((table) =>
    snapshot.columns.get(table)?.has("role")
  );

  if (
    missingTables.length > 0 ||
    missingRoleFreeTables.length > 0 ||
    legacyTables.length > 0 ||
    legacyGuards.length > 0 ||
    roleColumns.length > 0
  ) {
    throw new Error(
      JSON.stringify(
        {
          missingTables,
          missingRoleFreeTables,
          legacyTables,
          legacyGuards,
          roleColumns,
        },
        null,
        2
      )
    );
  }
}

function readLocalSchema(): LocalIdentitySchemaSnapshot {
  const repositoryRoot = path.resolve(import.meta.dirname, "../..");
  const wrangler = path.join(repositoryRoot, "web/node_modules/.bin/wrangler");
  const output = execFileSync(
    wrangler,
    [
      "d1",
      "execute",
      "efcc-identity",
      "--local",
      "--json",
      "--command",
      SCHEMA_QUERY,
    ],
    {
      cwd: path.join(repositoryRoot, "web"),
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "inherit"],
    }
  );
  return parseSchemaRows(output);
}

export function main(): void {
  const snapshot = readLocalSchema();
  assertRoleFreeIdentitySchema(snapshot);
  console.log(
    JSON.stringify({
      status: "PASS",
      requiredTables: REQUIRED_TABLES,
      requiredRoleFreeTables: REQUIRED_ROLE_FREE_TABLES,
      forbiddenLegacyTables: LEGACY_TABLES,
      removedRoleGuards: REMOVED_ROLE_GUARDS,
      accountRoleColumn: false,
      registrationRequestRoleColumn: false,
    })
  );
}

if (process.argv[1] === import.meta.filename) {
  try {
    main();
  } catch (error) {
    console.error(
      `local identity schema check failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exitCode = 1;
  }
}
