import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const d1State = path.join(
  root,
  "apps",
  "web",
  ".wrangler",
  "state",
  "v3",
  "d1"
);

console.log(
  `Resetting local Wrangler D1 state at ${path.relative(root, d1State)}`
);
await rm(d1State, { recursive: true, force: true });

for (const args of [
  ["--filter", "web", "db:migrate:local"],
  ["db:seed:local"],
]) {
  const result = spawnSync("pnpm", args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
