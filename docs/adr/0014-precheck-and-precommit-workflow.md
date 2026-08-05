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
     `worker.test.ts`, `worker.auth.test.ts`, `lib/auth`, `lib/mirror`, and the
     #151 `lib/service-envelope*`) — those resolve in the workerd vitest pool,
     not plain `tsc`; `tsconfig.worker.json` typechecks them with
     `@cloudflare/workers-types` plus `@cloudflare/vitest-pool-workers/types`.

3. **Separated CI Workflows (`precheck.yml` + `e2e.yml`)**:

   - **`precheck.yml`** — the deterministic PR gate. Runs on both `push` and
     `pull_request` to `main`/`master`. Two jobs own the two separate pnpm
     workspaces (root and `web/`), each installing only its own lockfile so
     nothing is installed twice:

       - `root-precheck`: `pnpm typecheck` (root tooling + `tests/e2e` TS) and
         `pnpm test` (`tests/gas` vm-harness incl. the GAS identity-mirror suite,
         plus `tests/prototype`).
       - `web-precheck`: `pnpm --dir web typecheck` (Next app + worker/auth
         tsconfigs), `pnpm --dir web test` (workerd pool: worker, worker.auth,
         `lib/auth`, `lib/mirror`, client contract), and
         `pnpm --dir web test:components` (jsdom, incl. the landing-page
         `lib/app.test.tsx` contract).

   - **`e2e.yml`** — the deployed `/exec` acceptance gate. It is **fail-closed**:
     it validates `E2E_TARGET_URL` (`vars`) and the three storage-state secrets
     before running, decodes them only after validation, and fails with an
     explicit message — never a green result — when any prerequisite is missing.
     It does not deploy; a fresh deployed `/exec` smoke (AGENTS.md Headless-Gate)
     requires an operator to rotate a new versioned deployment and update the
     pinned ID + `E2E_TARGET_URL` together (see `.github/CI-SECRETS.md`).

## Consequences

- Commit attempts with broken TypeScript code fail fast locally.
- Pull Requests are gated by both fast unit/type checks (`precheck.yml`) and end-to-end acceptance tests (`e2e.yml`).
- PRs can be safely configured with required status checks in GitHub branch protection.
- The `e2e.yml` deployed acceptance gate is red (fail-closed) until the operator
  provisions `E2E_TARGET_URL` and the storage-state secrets and rotates a fresh
  deployment; a missing deployment proof is never reported as a green check.
