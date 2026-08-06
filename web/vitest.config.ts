import path from "node:path";
import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineProject } from "vitest/config";

// Worker tests run inside the real `workerd` runtime via
// @cloudflare/vitest-pool-workers (Cloudflare's official integration,
// per ADR-0012 / Spec 074's testing decisions). Client contract tests
// run in the default node environment - they stub `fetch` to assert the
// exact wire shape leaving the browser, which is cheaper than spinning
// up workerd for pure logic.
export default defineProject(async () => {
  // Read the versioned D1 migrations (AUTH-01 #159) so the test setup can
  // apply them to the auto-provided local DB binding before auth tests run.
  const migrations = await readD1Migrations(
    path.join(import.meta.dirname, "migrations")
  );

  return {
    plugins: [
      cloudflareTest({
        wrangler: {
          configPath: "./wrangler.jsonc",
        },
        miniflare: {
          // Test-only binding exposing the parsed migrations so setup files
          // can call applyD1Migrations(env.DB, env.TEST_MIGRATIONS).
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }),
    ],
    resolve: {
      // Node-environment client tests import lib sources via the `@/` alias
      // (e.g. sections.ts → @/lib/copy); resolve it here for the worker pool
      // just like vitest.components.config.ts does for the jsdom suite.
      alias: { "@": import.meta.dirname },
    },
    test: {
      // Worker tests live next to the worker (`worker.test.ts`) and run
      // in the pool-workers environment declared inline at the top of
      // each file via `// @vitest-environment workers`. Client contract
      // tests (`lib/*.test.ts`) run in the default node environment. The
      // auth/session D1 tests (`lib/auth/*.test.ts`) run in the workers
      // pool and call applyD1Migrations(env.DB, env.TEST_MIGRATIONS) at
      // module scope (it only applies unapplied migrations, so it is safe
      // to call per file).
      include: ["worker.test.ts", "worker.auth.test.ts", "lib/**/*.test.ts"],
      // No secrets in output - the ticket's verification requirement.
      // Reporter stays the default (consolidated pass/fail counts).
    },
  };
});
