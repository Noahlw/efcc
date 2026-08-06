# Contributing to EFCC

This document is the entry point for a developer working from a fresh clone. It covers the canonical setup, the two install boundaries, local verification, and the safety and deployment rules that keep the repository reproducible.

## Requirements

- **Git**
- **Node.js 22** — pinned in [`.node-version`](.node-version) and used by CI. Select it with `fnm use`, `mise install`, or `asdf install` from the repo root.
- **pnpm 11.7.0** — pinned in the root `packageManager` field. `corepack enable` makes the pinned version available.
- **Chromium** — installed automatically for Playwright by `pnpm run bootstrap`.
- **`clasp`** — only for Apps Script deployment (optional; see [Apps Script boundary](#apps-script-optional-boundary)).

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
- `pnpm run verify` — the local equivalent of the deterministic CI gate (see [Verification](#verification)).

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

### Deterministic CI gate (local)

`pnpm run verify` runs the same deterministic, credential-free checks as the Precheck workflow, in the same order:

1. Root typecheck (`pnpm typecheck`)
2. Root GAS/prototype tests (`pnpm test`)
3. `web/` typecheck (`pnpm --dir web typecheck`)
4. `web/` workerd tests (`pnpm --dir web test`)
5. `web/` component tests (`pnpm --dir web test:components`)
6. Responsive-shell Playwright suite (`pnpm test:shell-responsive`)

None of these deploy anything or require secrets. Prefer `pnpm run verify` before opening a PR.

### Test selection

Run only the relevant suite when iterating locally:

- **GAS domain code (`src/gas/`):** `pnpm test:gas`
- **Prototype/scanner code:** `pnpm test:prototype`
- **Worker/auth and client contract (`web/`):** `pnpm --dir web test`
- **Web components (`web/`):** `pnpm --dir web test:components`
- **Responsive/accessibility shell:** `pnpm test:shell-responsive`
- **Static/lint checks (optional, not part of the CI gate):** `pnpm check`

### Deterministic CI vs deployed acceptance

Local and CI-precheck results prove the code is deterministic and self-contained. They do **not** prove a deployed target works.

- **Deployed-authority rule:** the official D1 deployed acceptance gate is the `e2e.yml` **`workflow_dispatch`** job. It runs only when an operator manually dispatches it, requires the `AUTH_TARGET_URL` Actions variable and the five `AUTH_*` Actions secrets, and fails closed if any are missing. Its Playwright artifact is the retained deployed-evidence authority.
- The workflow validates that `AUTH_TARGET_URL` is an HTTPS URL without embedded credentials; it cannot mechanically prove that the target or accounts are non-production. The operator must verify the isolated Worker/D1 ownership and disposable fixtures before dispatching.
- Developing against a deployed Worker locally is not a substitute for the official gate. See [`.github/CI-SECRETS.md`](.github/CI-SECRETS.md) for how the isolated target and acceptance fixtures are provisioned and rotated.

## Local environment and secrets

- The Worker reads local variables from `web/.dev.vars` (gitignored). A safe template lives at `web/.dev.vars.example`.
- To exercise the transitional `/api/v1/rpc` proxy locally, copy the template and point it at an **isolated** Apps Script deployment's `/exec` URL:

  ```sh
  cp web/.dev.vars.example web/.dev.vars
  ```

- `web/.dev.vars` is a copy/reference with placeholder values only — never put production credentials, PINs, cookies, or tokens in it, and never commit real values. Prefer `wrangler secret put APPS_SCRIPT_EXEC_URL` for anything beyond a throwaway prototype.
- `.env`, `web/.dev.vars`, `.wrangler/`, `.auth/`, and test artifacts are gitignored and must stay that way. Do not loosen secret ignores.

## Pre-commit

The repository uses [husky](https://typicode.github.io/husky/) with a pre-commit hook (`.husky/pre-commit`) that runs, in order:

1. `lint-staged` — formats and fixes staged JS/TS/JSON/Markdown files (Ultracite + oxfmt)
2. `pnpm typecheck` — root and `tests/e2e` TypeScript

The hook is auto-installed by `pnpm run bootstrap` (via the root `prepare` script). If it fails, fix the reported formatting or type errors and re-stage; the commit is blocked until it passes.

## Apps Script optional boundary

Apps Script / Google Sheets is the **transitional domain backend**, not the primary platform. Work there is optional, gated by the rules in [`AGENTS.md`](AGENTS.md) — do not invent new deployment instructions:

- Agents never modify the production Google Sheet.
- Every Apps Script API, manifest key, clasp directive, or deployment requires official documentation evidence.
- A fresh `/exec` deployment must pass the relevant browser/API trace before READY.

If your change does not touch `src/gas/`, `tests/gas/`, or the transitional RPC proxy, you do not need `clasp`.

When changing `web/`, read [`web/AGENTS.md`](web/AGENTS.md) first. This repository pins a breaking Next.js version; the relevant version-specific guide under `web/node_modules/next/dist/docs/` is required reading before editing framework code.

## Pull requests and deployments

- **PR scope:** describe the change, the acceptance evidence, the exact test commands run, and a confirmation that no secrets or data were exposed.
- **Do not deploy** to production Cloudflare resources, Apps Script deployments, or Google Sheets from this repository. Deployments target isolated acceptance resources only.
- Branch protection, required checks, Actions secrets/variables, teams, and deployment ownership are repository-administrator concerns and are not managed by contributors.

### Administrator handoff

Configure these in GitHub repository settings; committed files cannot enable them:

- Protect `main`: require pull requests, conversation resolution, and the four deterministic checks `Root typecheck & unit (gas + prototype)`, `Web typecheck & tests (workerd + components)`, `Shell responsive (static shell, 375px + 1280px)`, and `D1 auth contract (workerd)`; prevent force-pushes and branch deletion.
- Grant the next developer access through the appropriate GitHub team or repository role. Never share personal access tokens.
- Configure `AUTH_TARGET_URL` as an Actions variable and the five `AUTH_*` values as Actions secrets. The workflow accepts only the reserved `efcc-auth-*.efcc-ggc.workers.dev` acceptance namespace, but the operator must still verify that the Worker/D1 target and accounts are disposable before dispatch.
- Keep Cloudflare and Apps Script deployment ownership separate from repository write access. Dispatch the deployed D1 gate only after rotating the isolated target and acceptance fixtures, then retain its Playwright artifact.
