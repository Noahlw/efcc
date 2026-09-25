/** EFCC D1 identity — account lookup repository. */

import { normalizeUsername } from "./credentials";

export const ACCOUNT_STATUS = {
  PENDING: "Pending",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  DEACTIVATED: "Deactivated",
} as const;

export type AccountStatus =
  (typeof ACCOUNT_STATUS)[keyof typeof ACCOUNT_STATUS];

export interface AccountRow {
  user_id: string;
  name: string;
  username: string;
  username_normalized: string;
  credential_hash: string | null;
  account_status: AccountStatus;
  phone: string | null;
  qr_code_string: string | null;
  created_at: number;
  updated_at: number;
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
