# ADR-0014 — GitHub Merge Precheck & Pre-commit Typecheck Standardization

- **Status**: Accepted (grill-with-docs session, locked 2026-07-30)
- **Deciders**: Noah Wong, OMP planner (grill-with-docs)
- **Date**: 2026-07-30
- **Related**: `docs/adr/0012-e2e-testing-strategy.md`, `.husky/pre-commit`, `.github/workflows/precheck.yml`, `.github/workflows/e2e.yml`

## Context

Prior to this decision:
1. **Pre-commit gaps**: `.husky/pre-commit` only executed `npx lint-staged --config package.json` (which ran `ultracite fix` and `oxfmt --write`). Type checking was not enforced prior to committing code, allowing type errors to escape into the working branch.
2. **Typecheck scope fragmentation**: `package.json` defined `"typecheck": "tsc --noEmit --project tests/e2e/tsconfig.json"`. This ignored root TypeScript configurations (`tsconfig.json`), leaving root scripts/tools unchecked.
3. **CI gate gaps**: GitHub Actions contained only `.github/workflows/e2e.yml`, which ran solely on `push` events. PRs had no required automated precheck gating mergeability (type checking, Vitest unit tests, and Playwright E2E acceptance tests).

The original deployed gate also targeted the retired Apps Script role-navigation
surface. The rebuilt login boundary is a Cloudflare Worker `/api/auth/*`
surface backed by D1, so Google iframe storage state is not evidence for this
auth contract.

## Decision

1. **Full Pre-commit Typecheck & Hygiene**:
   - `.husky/pre-commit` executes `npx lint-staged --config package.json` first (formatting and lint autofixes on staged files), followed immediately by `pnpm typecheck`.
   - If type errors exist, `tsc` exits non-zero and the git commit is rejected.

2. **Sequential Multi-Config Type Checking**:

   - Root `package.json` `"typecheck"` stays `tsc --noEmit -p tsconfig.json
     && tsc --noEmit -p tests/e2e/tsconfig.json` (root tooling + E2E TS).
   - `web/package.json` `"typecheck"` validates the Next app tsconfig and the
     worker/auth tsconfig (`tsconfig.json` + `tsconfig.worker.json`).
   - The web app tsconfig excludes the workerd-pool files (`worker.ts`,
     worker.test.ts, worker.auth.test.ts, `lib/auth`, and the
     #151 `lib/service-envelope*`) — those resolve in the workerd vitest pool,
     not plain `tsc`; `tsconfig.worker.json` typechecks them with
     `@cloudflare/workers-types` plus `@cloudflare/vitest-pool-workers/types`.

3. **Separated CI Workflows (`precheck.yml` + `e2e.yml`)**:

   - **`precheck.yml`** — the deterministic PR gate. Runs on both `push` and
     `pull_request` to `main`/`master`. Two jobs own the two separate pnpm
     workspaces (root and `web/`), each installing only its own lockfile so
     nothing is installed twice:

       - `root-precheck`: `pnpm typecheck` (root tooling + `tests/e2e` TS) and
         `pnpm test` (`tests/gas` vm-harness plus `tests/prototype`).
       - `web-precheck`: `pnpm --dir web typecheck` (Next app + worker/auth
         tsconfigs), `pnpm --dir web test` (workerd pool: worker, worker.auth,
         `lib/auth`, client contract), and
         `pnpm --dir web test:components` (jsdom, incl. the landing-page
         `lib/app.test.tsx` contract).
       - `shell-responsive`: `pnpm test:shell-responsive` — the local
         static-shell Playwright suite (`tests/e2e/responsive.config.ts`),
         which builds the Next static export, serves it on 127.0.0.1:4173, and
         asserts the responsive/accessibility invariants (CF0-06) at 375px and
         1280px with no `E2E_TARGET_URL`, no storage states, and no Sheet
         access. This job installs the root deps + Playwright Chromium and the
         web deps needed for the static build.

   - **`e2e.yml`** — the rebuilt D1 auth acceptance gate. Its `auth-contract`
     job runs on every PR/push with the real workerd + D1 boundary and no
     secrets. Its `deployed-auth` job runs only by `workflow_dispatch` after an
     operator provisions an isolated Worker/D1 target and seeded acceptance
     accounts. That job is **fail-closed**: it validates `AUTH_TARGET_URL` and
     all five acceptance-account secrets before Playwright starts, and fails
     with an explicit message when any prerequisite is missing. It never
     deploys or mutates a production database. The retained Apps Script
     `/exec` suite is legacy/manual and is not this branch's login gate.

## Consequences

- Commit attempts with broken TypeScript code fail fast locally.
- Pull Requests are gated by deterministic type/unit/component/shell checks
  (`precheck.yml`) plus the rebuilt D1 auth contract (`e2e.yml`'s
  `auth-contract` job).
- PRs can be safely configured with those deterministic status checks in GitHub
  branch protection.
- A fresh deployed D1 auth proof remains a separate manual gate. It is red
  (fail-closed) until the operator provisions `AUTH_TARGET_URL`, acceptance
  accounts, and an isolated D1 database; a missing deployment proof is never
  reported as a green deployed result.
