import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineProject } from "vitest/config";

// Worker tests run inside the real `workerd` runtime via
// @cloudflare/vitest-pool-workers (Cloudflare's official integration,
// per ADR-0012 / Spec 074's testing decisions). Client contract tests
// run in the default node environment - they stub `fetch` to assert the
// exact wire shape leaving the browser, which is cheaper than spinning
// up workerd for pure logic.
export default defineProject({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: "./wrangler.jsonc",
      },
    }),
  ],
  test: {
    // Worker tests live next to the worker (`worker.test.ts`) and run
    // in the pool-workers environment declared inline at the top of
    // each file via `// @vitest-environment workers`. Client contract
    // tests (`lib/*.test.ts`) run in the default node environment.
    include: ["worker.test.ts", "lib/**/*.test.ts"],
    // No secrets in output - the ticket's verification requirement.
    // Reporter stays the default (consolidated pass/fail counts).
  },
});
