import { defineConfig } from "@playwright/test";

const targetUrl = process.env.AUTH_TARGET_URL;
if (!targetUrl) {
  throw new Error("AUTH_TARGET_URL is required");
}

let parsedTarget: URL;
try {
  parsedTarget = new URL(targetUrl);
} catch {
  throw new Error("AUTH_TARGET_URL must be an absolute HTTPS URL");
}
if (
  parsedTarget.protocol !== "https:" ||
  parsedTarget.username ||
  parsedTarget.password
) {
  throw new Error(
    "AUTH_TARGET_URL must be an absolute HTTPS URL without credentials"
  );
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
