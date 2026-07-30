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
   - `package.json` `"typecheck"` script is standardized to: `tsc --noEmit -p tsconfig.json && tsc --noEmit -p tests/e2e/tsconfig.json`.
   - Ensures both root-level tooling/configs and E2E test files are strictly validated.

3. **Separated CI Workflows (`precheck.yml` + `e2e.yml`)**:
   - **`precheck.yml`**: A fast pre-merge pipeline running on both `push` and `pull_request` events to `main`/`master` (and feature branches). Runs Node 22, `pnpm install`, `pnpm typecheck`, and `pnpm test:gas` (unit tests).
   - **`e2e.yml`**: Updated to trigger on both `push` and `pull_request` events so full Playwright E2E role-navigation acceptance checks run against the deployed WebApp on PRs before merge.

## Consequences

- Commit attempts with broken TypeScript code fail fast locally.
- Pull Requests are gated by both fast unit/type checks (`precheck.yml`) and end-to-end acceptance tests (`e2e.yml`).
- PRs can be safely configured with required status checks in GitHub branch protection.
