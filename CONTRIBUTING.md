# Contributing to EFCC

This document is the entry point for a developer working from a fresh clone. It covers the canonical setup, the two install boundaries, local verification, and the safety and deployment rules that keep the repository reproducible.

## Requirements

- **Git**
- **Node.js 22.18.0** — pinned in [`.node-version`](.node-version) and used by CI. Select it with `fnm use`, `mise install`, or `asdf install` from the repo root. The pre-commit hook refuses to run on older Node (the checked-in TypeScript Oxfmt config requires ≥ 22.18.0).
- **pnpm 11.7.0** — pinned in the root `packageManager` field. `corepack enable` makes the pinned version available.
- **Chromium** — installed automatically for Playwright by `pnpm run bootstrap`.

## Fresh clone

```sh
git clone <repo-url> efcc
cd efcc
corepack enable
fnm use            # or: mise install / asdf install
pnpm run bootstrap
pnpm run verify
```

- `pnpm run bootstrap` — the single canonical fresh-clone dependency command. Installs the root dependencies and then the `web/` dependencies using their frozen lockfiles, and installs the Playwright Chromium browser through the root install lifecycle. (It is named `bootstrap`, not `setup`, to avoid colliding with pnpm's built-in `pnpm setup`.) Run it once in the clone; run it again after lockfile changes.
- `pnpm run verify` — the full local gate: pre-commit checks plus the browser shell/geometry suites (see [Verification](#verification)).

## Branching and worktrees

- Create a feature branch per change. Use a short descriptor that names the effort, e.g. `feat/<area>-<summary>` or `chore/<summary>`.
- Do not commit directly to `main`. Open a pull request against `main` and let the deterministic checks gate it.
- To keep long-running work isolated, use a git worktree rather than switching branches in your working tree:

  ```sh
  git worktree add ../efcc-<branch> -b <branch>
  cd ../efcc-<branch>
  pnpm run bootstrap
  ```

  Each worktree is a fresh checkout on its branch, so re-run `pnpm run bootstrap` there before working.

## The two install boundaries and lockfiles

The repository has two independent pnpm install boundaries with separate lockfiles and separate `node_modules`:

| Workspace | Lockfile | What it installs | Work here with |
| --- | --- | --- | --- |
| Root | `pnpm-lock.yaml` | GAS/prototype tooling, TypeScript, Playwright, husky | `pnpm <script>` |
| `web/` | `web/pnpm-lock.yaml` | Next.js, Cloudflare Wrangler/D1, Vitest, jsdom | `pnpm --dir web <script>` |

- Install everything fresh: `pnpm run bootstrap`.
- Install only the root tree: `pnpm install --frozen-lockfile`.
- Install only the web tree: `pnpm --dir web install --frozen-lockfile`.
- When you change a dependency in one tree, update that tree's lockfile and commit it. The two lockfiles change independently.
- Keep lockfiles in sync with their manifests — CI installs with `--frozen-lockfile` and fails if they drift.

## Verification

### Fast CI — the single automatic gate

The only automatic workflow is **Fast CI** (`.github/workflows/fast-ci.yml`): one job that runs `pnpm verify:fast` — root and `web/` typechecks. It is the single required status check on `main`.

All other deterministic, credential-free checks run locally before commits through the pre-commit hook and `pnpm verify:precommit`:

1. Root typecheck (`pnpm typecheck`)
2. `web/` typecheck (`pnpm --dir web typecheck`)
3. Root GAS/prototype tests (`pnpm test`)
4. Identity tests (`pnpm verify:identity`)
5. `web/` workerd tests (`pnpm test:workerd` — excludes the four Phase C Worker files whose defects are tracked on #498)
6. `web/` component tests (`pnpm --dir web test:components`)

`pnpm run verify` additionally runs the browser shell/geometry Playwright suites (`pnpm test:shell-responsive`, `pnpm test:shell-geometry`, `pnpm test:role-hierarchy-geometry`). None of these deploy anything or require secrets. Prefer `pnpm run verify` before opening a PR; `pnpm run verify:precommit` is the faster non-browser gate the hook runs.

`pnpm check` (Ultracite repository-wide lint) is **deferred** — the existing syntax backlog is tracked on issue #498 and will be repaired after Phase F; it is not part of Fast CI or the pre-commit gate.

### Test selection

Run only the relevant suite when iterating locally:

- **Prototype/scanner code:** `pnpm test:prototype`
- **Worker/auth/programs/attendance and client contract (`web/`):** `pnpm --dir web test`
- **Web components (`web/`):** `pnpm --dir web test:components`
- **Responsive/accessibility shell:** `pnpm test:shell-responsive`
- **Static/lint checks (optional, not part of the CI gate):** `pnpm check`

### Local-first implementation gate vs optional deployment smoke

The required `READY` evidence is deterministic checks plus the relevant Playwright suite against local `wrangler dev` and local D1 at `http://127.0.0.1:8787`. This exercises the Worker, static assets, cookies, and database without touching a Cloudflare account.

- Start the stack with `pnpm dev:local`.
- Seed disposable accounts with `pnpm db:seed:local`.
- Seed the walkthrough dataset with `pnpm db:seed:demo`.
- Run the suite named by the changed capability under `tests/e2e/`.

Cloudflare deployment is optional/manual production-promotion evidence. If an operator runs it, use a fresh reserved `efcc-auth-*`/`efcc-dev-*` host and disposable `E2E_` fixtures; the workflow remains fail-closed. A deployed result never replaces the local gate and a missing manual run does not block repository `READY`.

## Local environment and secrets

- The Worker reads local variables from `web/.dev.vars` (gitignored). A safe template lives at `web/.dev.vars.example`:

  ```sh
  cp web/.dev.vars.example web/.dev.vars
  ```

- `web/.dev.vars` is a copy/reference with placeholder values only — never put production credentials, PINs, cookies, or tokens in it, and never commit real values. Prefer `wrangler secret put` for anything beyond a throwaway prototype.
- `.env`, `web/.dev.vars`, `.wrangler/`, `.auth/`, and test artifacts are gitignored and must stay that way. Do not loosen secret ignores.

## Pre-commit

The repository uses [husky](https://typicode.github.io/husky/) with a pre-commit hook (`.husky/pre-commit`) that runs, in order:

1. **Node version guard** — fails fast with `EFCC pre-commit requires Node >=22.18.0; run fnm use` when the runtime is too old (the checked-in TypeScript Oxfmt config cannot load on older Node).
2. `ultracite doctor` — proves the installed Ultracite/Oxlint/Oxfmt configuration (6 passed, 0 warnings, 0 failed).
3. `lint-staged` — formats staged JS/TS/JSON/Markdown files via the Ultracite-owned Oxfmt backend (`oxfmt --write --no-error-on-unmatched-pattern`).
4. `verify:precommit` — the full non-browser gate (root/web typechecks, prototype, identity, workerd, components).

The hook is auto-installed by `pnpm run bootstrap` (via the root `prepare` script). If it fails, fix the reported formatting or type errors and re-stage; the commit is blocked until it passes. The full repository-wide Ultracite lint (`pnpm check`) is intentionally not part of the hook — its backlog is tracked on #498.

## Apps Script retirement note

Apps Script / Google Sheets is **retired**. `src/gas/`, `tests/gas/`, the clasp configuration, and the Worker's transitional `/api/v1/rpc` proxy were removed once every capability had a Worker/D1 replacement and no live caller remained. Do not reintroduce Apps Script or Sheets deployment paths; the platform is Cloudflare Worker + D1.

- Agents never modify the production Google Sheet; the operator performs sheet changes manually.
- The legacy deployment and its `/exec` Playwright suite are deleted; deterministic coverage lives in `web/` (workerd) and `tests/prototype/`.

When changing `web/`, read [`web/AGENTS.md`](web/AGENTS.md) first. This repository pins a breaking Next.js version; the relevant version-specific guide under `web/node_modules/next/dist/docs/` is required reading before editing framework code.

## Pull requests and deployments

- **PR scope:** describe the change, the acceptance evidence, the exact test commands run, and a confirmation that no secrets or data were exposed.
- **Do not deploy** to production Cloudflare resources or Google Sheets from this repository. Deployments target isolated acceptance resources only.
- Branch protection, required checks, Actions secrets/variables, teams, and deployment ownership are repository-administrator concerns and are not managed by contributors.

### Administrator handoff

Configure these in GitHub repository settings; committed files cannot enable them:

-- Protect `main`: require pull requests, conversation resolution, and the single required status check **Fast CI**; prevent force-pushes and branch deletion. The D1 auth acceptance contract and deployed smoke are manual `workflow_dispatch` jobs and are not required checks.

- Grant the next developer access through the appropriate GitHub team or repository role. Never share personal access tokens.
- Configure `AUTH_TARGET_URL` and the five `AUTH_*` values as Actions inputs only if the optional deployed D1 smoke is needed. The workflow accepts only the reserved `efcc-auth-*.efcc-ggc.workers.dev` namespace, but the operator must still verify that the Worker/D1 target and accounts are disposable before dispatch.
- Keep Cloudflare deployment ownership separate from repository write access. Dispatch the optional deployed D1 smoke only after rotating the isolated target and acceptance fixtures; retain its Playwright artifact as operational evidence, not as the local `READY` gate.
