/**
 * EFCC D1 identity — accounts repository and one-time legacy Users-sheet
 * import (AUTH-01 #159).
 *
 * The legacy import is READ-ONLY against Google Sheets (AGENTS.md
 * Sheet-Immutable rule): it consumes the same 2D row shape that
 * `usersReadAll_` in `src/gas/users-repository.gs` returns (row 0 = header,
 * columns resolved by header name, tolerant of extra/reordered columns), and
 * never writes the sheet. Re-running the import is idempotent: accounts
 * already present under the same immutable User_ID are skipped, never
 * duplicated. Duplicate usernames and malformed rows fail closed with a clear
 * diagnostic before any row is written (no partial migration).
 *
 * The user-selected legacy migration path (ADR-0020 §4) is the one-time
 * legacy-PIN-hash: each imported account stores only a salted PBKDF2 hash of
 * the normalized legacy PIN in `legacy_pin_hash`, marks `requires_upgrade=1`,
 * and is forced through a credential upgrade before any session is issued.
 * No cleartext PIN is ever persisted, logged, or returned.
 */

import { normalizePin, normalizeUsername, hashCredential } from "./credentials";

export const ACCOUNT_STATUS = {
  PENDING: "Pending",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  DEACTIVATED: "Deactivated",
} as const;

export const ROLE = {
  ADMIN: "Admin",
  TEACHER: "Teacher",
  MEMBER: "Member",
} as const;

export type AccountStatus =
  (typeof ACCOUNT_STATUS)[keyof typeof ACCOUNT_STATUS];
export type Role = (typeof ROLE)[keyof typeof ROLE];

export interface AccountRow {
  user_id: string;
  name: string;
  username: string;
  username_normalized: string;
  credential_hash: string | null;
  credential_kind: string;
  credential_version: number;
  account_status: AccountStatus;
  role: Role;
  phone: string | null;
  qr_code_string: string | null;
  legacy_pin_hash: string | null;
  requires_upgrade: number;
  lock_level: number;
  failed_attempts: number;
  locked_until: number | null;
  lock_since: number | null;
  created_at: number;
  updated_at: number;
}

/** Header-name candidates per logical field, mirroring users-repository.gs. */
const USERS_COL_CANDIDATES: Record<string, string[]> = {
  USER_ID: ["User_ID"],
  NAME: ["Name"],
  USERNAME: ["Username"],
  PIN_CODE: ["PIN_Code"],
  ROLE: ["Role", "System_Role"],
  STATUS: ["Status"],
};

/**
 * Resolve required column indices from an actual Users-sheet header row.
 * Throws if any required logical field has no matching header — fail closed
 * rather than silently misreading columns.
 */
function resolveUsersColumns_(headerRow: unknown[]): Record<string, number> {
  const normalized = headerRow.map((h) => String(h).trim().toLowerCase());
  const col: Record<string, number> = {};
  for (const [key, candidates] of Object.entries(USERS_COL_CANDIDATES)) {
    let idx = -1;
    for (const c of candidates) {
      idx = normalized.indexOf(c.toLowerCase());
      if (idx !== -1) break;
    }
    if (idx === -1) {
      throw new Error(
        `Users sheet is missing a required column. Expected one of: ${candidates.join(
          " / "
        )}`
      );
    }
    col[key] = idx;
  }
  return col;
}

/** A validated, normalized row ready for insertion. */
interface ParsedRow {
  sheetRow: number; // 1-indexed, for diagnostics only
  user_id: string;
  name: string;
  username: string;
  username_normalized: string;
  role: Role;
  status: string;
  legacyPinNormalized: string;
}

export interface LegacyImportResult {
  imported: number;
  skipped: number;
}

/**
 * Import legacy Users-sheet rows into D1. `rows` is the 2D array from
 * `usersReadAll_` (row 0 = header). Deterministic and idempotent; duplicate
 * usernames and malformed rows fail closed with a diagnostic before any write.
 *
 * @param db D1 binding.
 * @param rows 2D Users-sheet rows.
 * @param now Epoch millis (injectable for tests).
 */
export async function importLegacyUsers(
  db: D1Database,
  rows: unknown[][],
  now: number = Date.now()
): Promise<LegacyImportResult> {
  if (rows.length === 0) {
    throw new Error("Users sheet is empty — nothing to import.");
  }
  const col = resolveUsersColumns_(rows[0]);

  const seenNormalized = new Set<string>();
  const seenUserId = new Set<string>();
  const parsed: ParsedRow[] = [];
  const diagnostics: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const sheetRow = i + 1; // 1-indexed for diagnostics
    const userId = String(row[col.USER_ID] ?? "").trim();
    const name = String(row[col.NAME] ?? "").trim();
    const username = String(row[col.USERNAME] ?? "").trim();
    const pinRaw = String(row[col.PIN_CODE] ?? "");
    const roleRaw = String(row[col.ROLE] ?? "").trim().toUpperCase();
    const status = String(row[col.STATUS] ?? "").trim();

    const problems: string[] = [];
    if (!userId) problems.push("missing User_ID");
    if (!name) problems.push("missing Name");
    if (!username) problems.push("missing Username");
    if (!pinRaw) problems.push("missing PIN_Code");

    const usernameNormalized = normalizeUsername(username);
    if (problems.length === 0) {
      if (seenUserId.has(userId)) {
        problems.push(`duplicate User_ID ${userId} in source`);
      }
      if (seenNormalized.has(usernameNormalized)) {
        problems.push(`duplicate username '${username}' in source`);
      }
    }

    if (problems.length > 0) {
      diagnostics.push(`row ${sheetRow}: ${problems.join(", ")}`);
      continue;
    }

    seenUserId.add(userId);
    seenNormalized.add(usernameNormalized);

    // Map the uppercased sheet value to the canonical stored Role so the
    // schema values ("Admin" / "Teacher" / "Member") stay consistent.
    const role: Role =
      roleRaw === "ADMIN"
        ? ROLE.ADMIN
        : roleRaw === "TEACHER"
          ? ROLE.TEACHER
          : ROLE.MEMBER;

    parsed.push({
      sheetRow,
      user_id: userId,
      name,
      username,
      username_normalized: usernameNormalized,
      role,
      status: status || ACCOUNT_STATUS.ACTIVE,
      legacyPinNormalized: normalizePin(pinRaw),
    });
  }

  if (diagnostics.length > 0) {
    // Fail closed: no partial write. Duplicate/malformed source rows abort the
    // whole import before any account is created.
    throw new Error(`Legacy import failed closed:\n  ${diagnostics.join("\n  ")}`);
  }

  let imported = 0;
  let skipped = 0;

  for (const row of parsed) {
    // Idempotency: skip accounts already imported under the same immutable
    // User_ID. Re-running never duplicates.
    const existing = await db
      .prepare("SELECT user_id FROM accounts WHERE user_id = ?")
      .bind(row.user_id)
      .first<{ user_id: string }>();
    if (existing) {
      skipped++;
      continue;
    }

    const legacyPinHash = await hashCredential(row.legacyPinNormalized);
    await db
      .prepare(
        `INSERT INTO accounts (
           user_id, name, username, username_normalized,
           credential_hash, credential_kind, credential_version,
           account_status, role, phone, qr_code_string,
           legacy_pin_hash, requires_upgrade, created_at, updated_at
         ) VALUES (?, ?, ?, ?, NULL, 'legacy_pin', 1, ?, ?, NULL, NULL, ?, 1, ?, ?)`
      )
      .bind(
        row.user_id,
        row.name,
        row.username,
        row.username_normalized,
        row.status || ACCOUNT_STATUS.ACTIVE,
        row.role,
        legacyPinHash,
        now,
        now
      )
      .run();
    imported++;
  }

  return { imported, skipped };
}

/** Look up an account by immutable User_ID, or null. */
export async function findAccountByUserId(
  db: D1Database,
  userId: string
): Promise<AccountRow | null> {
  if (!userId) return null;
  return (
    (await db
      .prepare("SELECT * FROM accounts WHERE user_id = ?")
      .bind(userId)
      .first<AccountRow>()) ?? null
  );
}

/** Look up an account by username (case-insensitive via normalized form). */
export async function findAccountByUsername(
  db: D1Database,
  username: string
): Promise<AccountRow | null> {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;
  return (
    (await db
      .prepare("SELECT * FROM accounts WHERE username_normalized = ?")
      .bind(normalized)
      .first<AccountRow>()) ?? null
  );
}