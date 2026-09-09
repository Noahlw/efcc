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
}

/** The test DB binding. */
export function testDb(): D1Database {
  return testEnv.DB;
}
