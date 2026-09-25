/**
 * Shared D1 test bootstrap for the auth/session tests (AUTH-01 #159 /
 * AUTH-02 #160).
 *
 * Runs inside the real `workerd` runtime via @cloudflare/vitest-pool-workers.
 * `applyD1Migrations` only applies migrations not yet applied, so calling it
 * per file is safe and idempotent.
 *
 * `env.DB` is the auto-provided local D1 binding declared in wrangler.jsonc;
 * `env.TEST_MIGRATIONS` is the parsed-migrations binding injected in
 * vitest.config.ts.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

import { hashCredential, normalizeUsername } from "./credentials";

/** The test bindings injected by the pool + vitest.config.ts. */
interface TestEnv {
  DB: D1Database;
  TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
}

// `env` from cloudflare:workers is typed loosely; the bindings are present at
// runtime (see worker.test.ts, which does the same cast).
const testEnv = env as unknown as TestEnv;

/** Apply all versioned D1 migrations to the test DB binding. */
export async function applyMigrations(): Promise<void> {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
}

/** The test DB binding. */
export function testDb(): D1Database {
  return testEnv.DB;
}

/** Seed one active/pending password account for a focused D1 test fixture. */
export async function seedTestAccount(options: {
  userId: string;
  name: string;
  username: string;
  password: string;
  accountStatus?: "Pending" | "Active" | "Suspended" | "Deactivated";
  phone?: string | null;
  now?: number;
}): Promise<void> {
  const now = options.now ?? Date.now();
  const credentialHash = await hashCredential(options.password);
  await testDb()
    .prepare(
      `INSERT INTO accounts (
         user_id, name, username, username_normalized,
         credential_hash, account_status, phone, qr_code_string,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         name = excluded.name,
         username = excluded.username,
         username_normalized = excluded.username_normalized,
         credential_hash = excluded.credential_hash,
         account_status = excluded.account_status,
         phone = excluded.phone,
         updated_at = excluded.updated_at`
    )
    .bind(
      options.userId,
      options.name,
      options.username,
      normalizeUsername(options.username),
      credentialHash,
      options.accountStatus ?? "Active",
      options.phone ?? null,
      now,
      now
    )
    .run();
}
