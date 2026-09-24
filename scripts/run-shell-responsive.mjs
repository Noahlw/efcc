import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error) {
          reject(error);
        } else if (!address || typeof address === "string") {
          reject(
            new Error("Could not determine an available responsive test port")
          );
        } else {
          resolve(address.port);
        }
      });
    });
  });
}

const port = String(await findAvailablePort());
const child = spawn(
  "pnpm",
  ["exec", "playwright", "test", "--config=tests/e2e/responsive.config.ts"],
  {
    cwd: REPO_ROOT,
    env: { ...process.env, RESPONSIVE_TEST_PORT: port },
    stdio: "inherit",
  }
);

const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
});
process.exitCode = exitCode;
