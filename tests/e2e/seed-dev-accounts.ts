/**
 * EFCC dev-testing D1 seeder (PRG-05 #224).
 *
 * Prints the idempotent SQL that seeds the three E2E_ dev accounts into the
 * `efcc-dev-testing` D1 backing the local programs-d1 E2E suite
 * (tests/e2e/programs-d1.config.ts defaults to the dev-testing worker).
 *
 * No hashes are embedded in this file: each run derives fresh PBKDF2-SHA256
 * hashes from the fixed dev-only plaintext credentials below using the
 * repo's real credential hasher (`hashCredential` in
 * web/lib/auth/credentials.ts) — the same function the worker uses at
 * registration/upgrade time — so the seeded rows are byte-compatible with
 * what `verifyCredential` checks at login.
 *
 * The script is print-only by design (`--print-only` is the default and only
 * mode; the flag exists for explicit runbooks): it never touches a database
 * itself. The operator pipes the SQL into wrangler:
 *
 *   # two-step (recommended):
 *   pnpm exec tsx tests/e2e/seed-dev-accounts.ts > /tmp/seed-dev.sql
 *   pnpm exec wrangler d1 execute efcc-dev-testing --remote --file=/tmp/seed-dev.sql
 *
 *   # single-shot (bash; command substitution pipes the stdout into wrangler):
 *   pnpm exec wrangler d1 execute efcc-dev-testing --remote \
 *     --command="$(pnpm exec tsx tests/e2e/seed-dev-accounts.ts)"
 *
 * Re-runs are safe: `INSERT OR IGNORE` skips rows already present under the
 * fixed user_ids / normalized usernames. To rotate a credential, delete the
 * row first (see the DELETE hint printed with the SQL), then re-run.
 *
 * Credentials are dev-only fixtures, documented plainly in
 * .github/CI-SECRETS.md — they are NOT GitHub secrets.
 */
import { parseArgs } from "node:util";

import { hashCredential } from "../../web/lib/auth/credentials";

type DevRole = "Admin" | "Staff" | "Member";

interface DevAccount {
  /** Immutable User_ID (ADR-0020 §1) — fixed per account for idempotency. */
  userId: string;
  name: string;
  username: string;
  role: DevRole;
  /** Dev-only plaintext credential, hashed at runtime — never embedded. */
  credential: string;
}

const DEV_ACCOUNTS: DevAccount[] = [
  {
    userId: "U-E2E-ADMIN",
    name: "E2E Admin",
    username: "E2E_admin",
    role: "Admin",
    credential: "E2E_admin!dev",
  },
  {
    userId: "U-E2E-STAFF",
    name: "E2E Staff",
    username: "E2E_staff",
    role: "Staff",
    credential: "E2E_staff!dev",
  },
  {
    userId: "U-E2E-MEMBER",
    name: "E2E Member",
    username: "E2E_member",
    role: "Member",
    credential: "E2E_member!dev",
  },
];

/** Single-quote a string for embedding in SQL (doubles embedded quotes). */
function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function buildInsert(account: DevAccount, now: number): Promise<string> {
  const credentialHash = await hashCredential(account.credential);
  return [
    "INSERT OR IGNORE INTO accounts (",
    "  user_id, name, username, username_normalized,",
    "  credential_hash, credential_kind, credential_version,",
    "  account_status, role, requires_upgrade, created_at, updated_at",
    ") VALUES (",
    `  ${sqlLiteral(account.userId)}, ${sqlLiteral(account.name)},`,
    `  ${sqlLiteral(account.username)}, ${sqlLiteral(account.username.toLowerCase())},`,
    `  ${sqlLiteral(credentialHash)}, 'password', 1,`,
    `  'Active', '${account.role}', 0, ${now}, ${now}`,
    ");",
  ].join("\n");
}

async function main(): Promise<void> {
  let reset = false;
  try {
    const parsed = parseArgs({
      options: {
        "print-only": { type: "boolean", default: false },
        reset: { type: "boolean", default: false },
      },
      strict: true,
      allowPositionals: false,
    });
    reset = parsed.values.reset === true;
  } catch (error) {
    process.stderr.write(
      `error: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
  }

  if (reset) {
    // Standing dev-testing D1 accumulates E2E_ rows across runs (departments,
    // programs, leaders, requests, enrollments, events). Delete children
    // before parents (FKs are ON DELETE RESTRICT); audit_events carries no
    // FK and is left as history.
    process.stdout.write(
      [
        "-- EFCC dev-testing D1 reset (PRG-05 #224). Deletes all E2E_ rows.",
        "-- Run before each suite run so consecutive runs stay green:",
        "--   pnpm exec wrangler d1 execute efcc-dev-testing --remote --file=<this output>",
        "DELETE FROM program_schedule_exceptions WHERE rule_id IN (SELECT rule_id FROM program_schedule_rules WHERE program_id IN (SELECT program_id FROM programs WHERE name LIKE 'E2E_%'));",
        "DELETE FROM program_schedule_rules WHERE program_id IN (SELECT program_id FROM programs WHERE name LIKE 'E2E_%');",
        "DELETE FROM attendances WHERE event_id IN (SELECT event_id FROM events WHERE program_id IN (SELECT program_id FROM programs WHERE name LIKE 'E2E_%'));",
        "DELETE FROM events WHERE program_id IN (SELECT program_id FROM programs WHERE name LIKE 'E2E_%');",
        "DELETE FROM enrollments WHERE program_id IN (SELECT program_id FROM programs WHERE name LIKE 'E2E_%');",
        "DELETE FROM enrollment_requests WHERE program_id IN (SELECT program_id FROM programs WHERE name LIKE 'E2E_%');",
        "DELETE FROM program_leaders WHERE program_id IN (SELECT program_id FROM programs WHERE name LIKE 'E2E_%');",
        "DELETE FROM programs WHERE name LIKE 'E2E_%';",
        "DELETE FROM department_modules WHERE department_id IN (SELECT department_id FROM departments WHERE code LIKE 'E2E_%' OR name LIKE 'E2E_%');",
        "DELETE FROM departments WHERE code LIKE 'E2E_%' OR name LIKE 'E2E_%';",
        "",
      ].join("\n")
    );
    return;
  }

  const now = Date.now();
  const statements = await Promise.all(
    DEV_ACCOUNTS.map((account) => buildInsert(account, now))
  );

  process.stdout.write(
    [
      "-- EFCC dev-testing D1 seed (PRG-05 #224). Idempotent: re-runs are safe.",
      "-- Rotate a credential by deleting its row first, then re-run:",
      "--   DELETE FROM accounts WHERE user_id IN",
      "--     ('U-E2E-ADMIN', 'U-E2E-STAFF', 'U-E2E-MEMBER');",
      "",
      ...statements,
      "",
    ].join("\n")
  );
}

async function runMain(): Promise<void> {
  try {
    await main();
  } catch (error: unknown) {
    process.stderr.write(
      `error: seed failed: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
  }
}

void runMain();
