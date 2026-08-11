import { defineConfig } from "@playwright/test";

// Local-first default (see AGENTS.md): `wrangler dev` serves the Worker +
// local D1 on this origin with no Cloudflare account touched. Override
// AUTH_TARGET_URL for a deployed efcc-auth-*.efcc-ggc.workers.dev
// acceptance host to prove production-bound behavior.
const DEFAULT_TARGET_URL = "http://127.0.0.1:8787";

const targetUrl = process.env.AUTH_TARGET_URL ?? DEFAULT_TARGET_URL;

let parsedTarget: URL;
try {
  parsedTarget = new URL(targetUrl);
} catch {
  throw new Error(
    `AUTH_TARGET_URL must be an absolute URL (default: ${DEFAULT_TARGET_URL})`
  );
}

const isLocal =
  parsedTarget.protocol === "http:" &&
  !parsedTarget.username &&
  !parsedTarget.password &&
  ["localhost", "127.0.0.1"].includes(parsedTarget.hostname);
if (!isLocal) {
  if (
    parsedTarget.protocol !== "https:" ||
    parsedTarget.username ||
    parsedTarget.password
  ) {
    throw new Error(
      "AUTH_TARGET_URL must be an absolute HTTP loopback URL or an absolute HTTPS URL without credentials"
    );
  }
  if (
    !/^efcc-(?:auth|dev)-[a-z0-9-]+\.efcc-ggc\.workers\.dev$/iu.test(
      parsedTarget.hostname
    )
  ) {
    throw new Error(
      "AUTH_TARGET_URL must use the efcc-auth-*.efcc-ggc.workers.dev acceptance host or the efcc-dev-*.efcc-ggc.workers.dev dev-testing host"
    );
  }
}

export default defineConfig({
  testDir: ".",
  testMatch: ["**/auth-d1.test.ts"],
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/auth-d1-results.json" }],
  ],
  use: {
    baseURL: targetUrl,
    // API request traces would capture credential/PIN request bodies.
    trace: "off",
  },
});
