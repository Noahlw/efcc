/**
 * EFCC source-backed import boundaries (#651).
 *
 * Four proven families only; no speculative full import-policy matrix.
 * Owner: repository maintainers via `pnpm check:boundaries`. A future
 * boundary exception needs an explicit rule change reviewed in its PR
 * (no blanket ignores): add the narrowest from/to pair, record the reason
 * in `comment`, and extend the known-violations baseline only for
 * pre-existing findings that shrink over time.
 *
 * Docs: dependency-cruiser doc/rules-reference.md + doc/options-reference.md
 * (official primary docs; Context7 quota exhausted, disclosed per #645
 * spec notes). The `@/*` alias resolves through tsconfig.depcruise.json
 * (resolver-only mirror of apps/web/tsconfig.json paths): the real
 * tsconfigs cannot be used because their include/exclude keys abort every
 * cruise (TS18003), and v18 schema has no alias-capable resolve option.
 */
module.exports = {
  forbidden: [
    {
      name: "no-prod-to-test-or-story",
      comment:
        "Production UI/Worker code must not depend on test harnesses or " +
        "Storybook fixtures. Tests and stories import production, never the reverse.",
      severity: "error",
      from: {
        path: "^apps/web/(app|lib|components)/",
        pathNot:
          "(\\.test\\.|\\.stories\\.|/\\.storybook/|test-setup|test-bootstrap)",
      },
      to: {
        path: "(\\.test\\.|\\.stories\\.|/\\.storybook/|test-setup|test-bootstrap)",
      },
    },
    {
      name: "no-browser-to-worker",
      comment:
        "The static-export browser bundle (app, components) must not pull " +
        "in the edge Worker entry; browser reaches the backend over HTTP.",
      severity: "error",
      from: { path: "^apps/web/(app|components)/" },
      to: { path: "^apps/web/worker\\.ts$" },
    },
    {
      name: "no-browser-to-d1",
      comment:
        "Browser code must not touch D1 stores or the workerd test runtime " +
        "directly; persistence goes through Worker routes.",
      severity: "error",
      from: { path: "^apps/web/(app|components)/" },
      to: {
        path: "(d1-workspace-store|/migrations/|cloudflare:test|vitest-pool-workers)",
      },
    },
    {
      name: "no-worker-to-react",
      comment:
        "The edge Worker side (worker.ts plus its handler modules) ships " +
        "without React. UI stays in app/components and client lib.",
      severity: "error",
      from: {
        path: "^apps/web/(worker\\.ts|lib/(auth/cookies|auth/handlers|programs/program-handlers|attendance|home-handlers|home-cms-handlers|identity/(role|permission-editor|account-access)-handlers)\\.ts$)",
      },
      to: { path: "(\\.tsx$|^react$|/react/)", pathNot: "\\.test\\." },
    },
    {
      name: "no-unresolved-internal",
      comment:
        "Internal imports must resolve (tsconfig @/* included). A hit here " +
        "is a typo, a moved file, or a missing alias before it becomes a " +
        "runtime 404.",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: "(\\.next|/out|/storybook-static|/\\.wrangler|/coverage)(/|$)",
    tsConfig: { fileName: "tsconfig.depcruise.json" },
    tsPreCompilationDeps: true,
    baseline: { mode: "shrink-only", staleEntriesSeverity: "error" },
  },
};
