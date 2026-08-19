/**
 * EFCC dev-testing D1 seeder (PRG-05 #224).
 *
 * Prints idempotent SQL for the four E2E_ dev accounts used by the local
 * Worker/D1 Playwright suites. `pnpm db:seed:local` applies the output to the
 * local efcc-identity D1; an operator may also apply it to an explicitly
 * isolated remote D1 when running an optional deployed smoke.
 *
 * No hashes are embedded in this file: each run derives fresh PBKDF2-SHA256
 * hashes from the fixed dev-only plaintext credentials below using the
 * repo's real credential hasher (`hashCredential` in
 * web/lib/auth/credentials.ts) — the same function the worker uses at
 * registration/upgrade time — so the seeded rows are byte-compatible with
 * what `verifyCredential` checks at login.
 *
 * Re-runs are safe: the active fixture accounts use a user_id upsert so a
 * completed password-rotation test cannot poison the next local run.
 * `--reset-legacy` restores the legacy-PIN fixture after an auth upgrade test.
 *
 * Credentials are dev-only fixtures, documented plainly in
 * .github/CI-SECRETS.md — they are NOT GitHub secrets.
 */
import { parseArgs } from "node:util";

import {
  hashCredential,
  normalizeUsername,
} from "../../web/lib/auth/credentials";
import { DEV_ACCOUNTS, DEV_LEGACY } from "./dev-fixtures";
import type { DevFixtureAccount } from "./dev-fixtures";

const FIXTURE_NAMES: Record<string, string> = {
  "U-E2E-ADMIN": "E2E Admin",
  "U-E2E-STAFF": "E2E Staff",
  "U-E2E-MEMBER": "E2E Member",
  "U-E2E-LEGACY": "E2E Legacy",
};

/** Single-quote a string for embedding in SQL (doubles embedded quotes). */
function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function buildInsert(
  account: DevFixtureAccount,
  now: number
): Promise<string> {
  const credentialHash = await hashCredential(account.credential);
  // Deterministic fixture QR value (non-secret), mirroring the pattern used
  // by the acceptance D1 seed so the Profile surface renders its QR square.
  const qrCodeString = `E2E-${account.role.toUpperCase()}-${account.userId}`;
  return [
    "INSERT INTO accounts (",
    "  user_id, name, username, username_normalized,",
    "  credential_hash, credential_kind, credential_version,",
    "  account_status, role, qr_code_string, requires_upgrade, created_at, updated_at",
    ") VALUES (",
    `  ${sqlLiteral(account.userId)}, ${sqlLiteral(FIXTURE_NAMES[account.userId])},`,
    `  ${sqlLiteral(account.username)}, ${sqlLiteral(normalizeUsername(account.username))},`,
    `  ${sqlLiteral(credentialHash)}, 'password', 1,`,
    `  'Active', '${account.role}', ${sqlLiteral(qrCodeString)}, 0, ${now}, ${now}`,
    ")",
    "ON CONFLICT(user_id) DO UPDATE SET",
    "  name = excluded.name,",
    "  username = excluded.username,",
    "  username_normalized = excluded.username_normalized,",
    "  credential_hash = excluded.credential_hash,",
    "  credential_kind = excluded.credential_kind,",
    "  credential_version = excluded.credential_version,",
    "  account_status = excluded.account_status,",
    "  role = excluded.role,",
    "  phone = NULL,",
    "  qr_code_string = excluded.qr_code_string,",
    "  legacy_pin_hash = NULL,",
    "  requires_upgrade = 0,",
    "  lock_level = 0,",
    "  failed_attempts = 0,",
    "  locked_until = NULL,",
    "  lock_since = NULL,",
    "  updated_at = excluded.updated_at;",
  ].join("\n");
}

async function buildLegacyInsert(now: number): Promise<string> {
  const legacyPinHash = await hashCredential(DEV_LEGACY.legacyPin);
  const qrCodeString = `E2E-${DEV_LEGACY.role.toUpperCase()}-${DEV_LEGACY.userId}`;
  return [
    "INSERT OR IGNORE INTO accounts (",
    "  user_id, name, username, username_normalized,",
    "  credential_hash, credential_kind, credential_version,",
    "  account_status, role, qr_code_string, legacy_pin_hash,",
    "  requires_upgrade, created_at, updated_at",
    ") VALUES (",
    `  ${sqlLiteral(DEV_LEGACY.userId)}, ${sqlLiteral(FIXTURE_NAMES[DEV_LEGACY.userId])},`,
    `  ${sqlLiteral(DEV_LEGACY.username)}, ${sqlLiteral(normalizeUsername(DEV_LEGACY.username))},`,
    `  NULL, 'legacy_pin', 1, 'Active', '${DEV_LEGACY.role}',`,
    `  ${sqlLiteral(qrCodeString)}, ${sqlLiteral(legacyPinHash)}, 1, ${now}, ${now}`,
    ");",
  ].join("\n");
}

async function buildLegacyReset(now: number): Promise<string> {
  const legacyPinHash = await hashCredential(DEV_LEGACY.legacyPin);
  const qrCodeString = `E2E-${DEV_LEGACY.role.toUpperCase()}-${DEV_LEGACY.userId}`;
  return [
    `UPDATE accounts SET name = ${sqlLiteral(FIXTURE_NAMES[DEV_LEGACY.userId])},`,
    `  username = ${sqlLiteral(DEV_LEGACY.username)},`,
    `  username_normalized = ${sqlLiteral(normalizeUsername(DEV_LEGACY.username))},`,
    "  credential_hash = NULL, credential_kind = 'legacy_pin',",
    `  credential_version = 1, account_status = 'Active', role = '${DEV_LEGACY.role}',`,
    `  qr_code_string = ${sqlLiteral(qrCodeString)},`,
    `  legacy_pin_hash = ${sqlLiteral(legacyPinHash)}, requires_upgrade = 1,`,
    "  lock_level = 0, failed_attempts = 0, locked_until = NULL, lock_since = NULL,",
    `  updated_at = ${now} WHERE user_id = ${sqlLiteral(DEV_LEGACY.userId)};`,
  ].join("\n");
}

async function main(): Promise<void> {
  let reset = false;
  let resetLegacy = false;
  try {
    const parsed = parseArgs({
      options: {
        reset: { type: "boolean", default: false },
        "reset-legacy": { type: "boolean", default: false },
      },
      strict: true,
      allowPositionals: false,
    });
    reset = parsed.values.reset === true;
    resetLegacy = parsed.values["reset-legacy"] === true;
  } catch (error) {
    process.stderr.write(
      `error: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
  }

  if (reset) {
    // Standing dev-testing D1 accumulates E2E_ rows across runs (departments,
    // programs, leaders, requests, enrollments, events, registration
    // requests). Delete children before parents (FKs are ON DELETE RESTRICT);
    // audit_events carries no FK and is left as history. GLOB treats the
    // underscore in the E2E_ prefix literally; LIKE would treat it as a
    // single-character wildcard.
    const e2eProgramIds =
      "(SELECT p.program_id FROM programs AS p LEFT JOIN departments AS d ON d.department_id = p.department_id WHERE p.name GLOB 'E2E_*' OR d.code GLOB 'E2E_*' OR d.name GLOB 'E2E_*')";
    process.stdout.write(
      [
        "-- EFCC dev-testing D1 reset (PRG-05 #224). Deletes all E2E_ rows.",
        "-- Includes registration requests (no FK, deleted last).",
        "-- Run before each suite run so consecutive runs stay green:",
        "--   pnpm exec wrangler d1 execute efcc-dev-testing --remote --file=<this output>",
        // EVT-02 (#252): preview plans and generation runs reference
        // programs/rules/events with ON DELETE RESTRICT, so they must be
        // deleted before their parents (children first, mirroring the
        // reset's FK ordering contract).
        `DELETE FROM program_generation_run_items WHERE run_id IN (SELECT run_id FROM program_generation_runs WHERE program_id IN ${e2eProgramIds});`,
        `DELETE FROM program_generation_runs WHERE program_id IN ${e2eProgramIds};`,
        `DELETE FROM program_preview_occurrences WHERE plan_id IN (SELECT plan_id FROM program_preview_plans WHERE program_id IN ${e2eProgramIds});`,
        `DELETE FROM program_preview_plans WHERE program_id IN ${e2eProgramIds};`,
        `DELETE FROM program_schedule_exceptions WHERE rule_id IN (SELECT rule_id FROM program_schedule_rules WHERE program_id IN ${e2eProgramIds});`,
        `DELETE FROM program_schedule_rules WHERE program_id IN ${e2eProgramIds};`,
        `DELETE FROM attendances WHERE event_id IN (SELECT event_id FROM events WHERE program_id IN ${e2eProgramIds});`,
        `DELETE FROM events WHERE program_id IN ${e2eProgramIds};`,
        `DELETE FROM enrollments WHERE program_id IN ${e2eProgramIds};`,
        `DELETE FROM enrollment_requests WHERE program_id IN ${e2eProgramIds};`,
        `DELETE FROM program_leaders WHERE program_id IN ${e2eProgramIds};`,
        `DELETE FROM programs WHERE program_id IN ${e2eProgramIds};`,
        "DELETE FROM department_modules WHERE department_id IN (SELECT department_id FROM departments WHERE code GLOB 'E2E_*' OR name GLOB 'E2E_*');",
        "DELETE FROM department_managers WHERE department_id IN (SELECT department_id FROM departments WHERE code GLOB 'E2E_*' OR name GLOB 'E2E_*');",
        "DELETE FROM departments WHERE code GLOB 'E2E_*' OR name GLOB 'E2E_*';",
        "DELETE FROM program_notification_reads WHERE user_id IN (SELECT user_id FROM accounts WHERE username GLOB 'E2E_*');",
        "DELETE FROM participant_notices WHERE member_user_id IN (SELECT user_id FROM accounts WHERE username GLOB 'E2E_*');",
        "DELETE FROM registration_requests WHERE username GLOB 'E2E_*';",
        "",
      ].join("\n")
    );
    return;
  }

  const now = Date.now();
  const statements = await Promise.all([
    ...DEV_ACCOUNTS.map((account) => buildInsert(account, now)),
    buildLegacyInsert(now),
  ]);
  if (resetLegacy) {
    statements.unshift(await buildLegacyReset(now));
  }

  process.stdout.write(
    [
      "-- EFCC dev-testing D1 seed (PRG-05 #224). Idempotent: re-runs are safe.",
      "-- Includes one E2E_ legacy-PIN account for the local auth-d1 upgrade smoke.",
      "-- `--reset-legacy` restores that account after an upgrade test.",
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
