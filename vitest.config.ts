import { configDefaults, defineConfig } from "vitest/config";

// Root-level suites are discovered by filename filter, so the gitignored
// `.worktrees/` checkouts inside the repository would otherwise run their own
// stale copies of these tests against historical revisions.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "**/.worktrees/**"],
  },
});
