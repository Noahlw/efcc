/**
 * Shared D1 test bootstrap for the auth/session tests (AUTH-01 #159 /
 * AUTH-02 #160).
 *
 * Runs inside the real `workerd` runtime via @cloudflare/vitest-pool-workers
 * (declared with `// @vitest-environment workers` at the top of each test
 * file). `applyD1Migrations` only applies migrations not yet applied, so
 * calling it per file is safe and idempotent.
 *
 * `env.DB` is the auto-provided local D1 binding declared in wrangler.jsonc;
 * `env.TEST_MIGRATIONS` is the parsed-migrations binding injected in
 * vitest.config.ts.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

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
  // Fix broken FKs left by the first version of 0026 (which used
  // `ALTER TABLE accounts RENAME TO accounts_old` and left
  // role_definitions/role_assignments FKs pointing at accounts_old).
  // The repaired migration uses accounts_new + DROP + RENAME so new DBs
  // are clean; this patch heals DBs that already applied the broken 0026.
  try {
    const fk = await testEnv.DB.prepare("PRAGMA foreign_key_list(role_definitions)").all();
    const broken = (fk.results as { table: string }[] | undefined)?.some((r) => r.table === "accounts_old");
    if (broken) {
      await testEnv.DB.prepare("PRAGMA foreign_keys=OFF").run();
      await testEnv.DB.prepare("PRAGMA writable_schema=ON").run();
      await testEnv.DB.prepare(
        "UPDATE sqlite_master SET sql = replace(sql, 'accounts_old', 'accounts') WHERE name IN ('role_definitions','role_definition_grants','role_assignments','role_policy_mutations') AND sql LIKE '%accounts_old%'"
      ).run();
      await testEnv.DB.prepare("PRAGMA writable_schema=OFF").run();
      // Reopen the schema by running a dummy query; D1 will pick up the new sql on next prepare.
      await testEnv.DB.prepare("SELECT 1").run();
      await testEnv.DB.prepare("PRAGMA foreign_key_check").all().catch(() => {});
      await testEnv.DB.prepare("PRAGMA foreign_keys=ON").run();
    }
  } catch {}
}

/** The test DB binding. */
export function testDb(): D1Database {
  return testEnv.DB;
}