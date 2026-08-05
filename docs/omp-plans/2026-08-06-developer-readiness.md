# Developer Readiness and Repository Governance Implementation Plan

> **For OMP workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Dispatch each task as a fresh `task` subagent; gate between tasks with the OMP `reviewer` agent (the `code-review` skill's spec axis) before marking complete.

**Goal:** Make a fresh clone of EFCC understandable and reproducibly installable for another developer while making repository-level GitHub collaboration predictable without changing account-level settings or touching production data.

**Architecture:** Keep the existing two-install boundary explicit: root dependencies serve GAS/prototype tooling and Playwright, while `web/` has its own lockfile and Cloudflare/Next dependencies. Add one canonical setup command and one deterministic verification command, then document branch/worktree, environment, PR, and deployment boundaries in tracked files. Encode low-risk GitHub repository conventions as CODEOWNERS, templates, and Dependabot configuration; leave branch protection, secrets, teams, and deployment resources to an administrator checklist.

**Tech Stack:** pnpm 11.7.0, Node.js 22, TypeScript, Vitest, Playwright, Next.js static export, Cloudflare Wrangler/D1, Google Apps Script/clasp.

## Global Constraints

- Node.js 22 and pnpm 11.7.0 are the supported local toolchain because CI runs Node 22 and the root package pins pnpm 11.7.0.
- A fresh clone must install both root and `web/` dependencies; their lockfiles are independent.
- No credentials, PINs, cookies, storage states, D1 IDs for shared resources, or deployment secrets may be committed.
- Apps Script/Google Sheet work remains subject to `AGENTS.md`; agents never mutate the production Sheet.
- D1 deployed acceptance uses an isolated disposable target and disposable acceptance accounts; only the destructive legacy-upgrade fixture is required to use the `E2E_` username prefix. The official `workflow_dispatch` gate is the deployed-evidence authority.
- No repository-level task may modify GitHub organization settings, branch protection, Actions secrets/variables, Cloudflare resources, Apps Script deployments, or Google Sheets.
- Unrelated local service-envelope files and the local isolated Wrangler config remain outside this change.

## File Structure & Changes

- Create `.node-version` — declares Node 22 for fnm/mise/asdf-compatible local tooling.
- Modify `package.json` — adds `bootstrap` and `verify` entry points while preserving existing test scripts and package-manager pin.
- Modify `README.md` — makes clone/install/verify flow canonical and links contribution/governance instructions.
- Create `CONTRIBUTING.md` — documents clone, branch/worktree, install, test, environment, PR, and deployment boundaries.
- Modify `CONTEXT.md` — replaces stale references to removed README section names with the canonical contributor and deployment sections.
- Create `web/.dev.vars.example` — safe placeholder for the transitional Apps Script URL required by local Worker proxy development.
- Create `.github/CODEOWNERS` — routes repository review to the maintainer without changing branch rules.
- Create `.github/PULL_REQUEST_TEMPLATE.md` — requires scope, acceptance evidence, test commands, and secret/data-safety confirmation.
- Create `.github/ISSUE_TEMPLATE/bug.yml` — collects reproducible bug reports with environment and verification context.
- Create `.github/dependabot.yml` — updates root npm dependencies, web npm dependencies, and GitHub Actions independently.
- Modify `.github/workflows/e2e.yml` — rejects deployed targets outside the reserved isolated acceptance hostname before any Playwright request.
- Modify `.github/CI-SECRETS.md` — documents the acceptance-host namespace and the workflow's fail-closed target guard.
- Modify `.gitignore` only if needed to preserve the example/local-environment boundary; do not loosen secret ignores.

## What Already Exists

- Root scripts cover typecheck, GAS/prototype tests, Playwright, responsive shell, and Ultracite checks.
- `web/package.json` and `web/pnpm-lock.yaml` define a separate web dependency boundary.
- `README.md`, `web/README.md`, `AGENTS.md`, `CONTEXT.md`, `.github/CI-SECRETS.md`, and workflow files already document architecture and acceptance rules; the new guidance must link and consolidate rather than contradict them.
- `.husky/pre-commit` and `lint-staged` already enforce formatting/linting plus root typecheck on commits.
- `web/AGENTS.md` adds a Next.js-specific rule requiring version-local framework docs before web edits.
- `.gitignore` and `web/.gitignore` already protect `.env`, `.dev.vars`, `.wrangler`, build output, storage state, and test artifacts.
- CI already runs deterministic root/web/responsive gates and exposes deployed D1 smoke only through `workflow_dispatch`.

## Not In Scope

- Enabling or changing GitHub branch protection/rulesets, merge queue, required reviewers, teams, Actions secrets, or Actions variables.
- Creating, rotating, or deleting Cloudflare Worker/D1 deployments or Apps Script deployments.
- Editing Google Sheets, seeding acceptance data, or committing any local deployment config.
- Rewriting the auth/domain architecture, migrating Apps Script capabilities, or deleting transitional code.
- Adding a new package manager, monorepo tool, container, or custom bootstrap service.
- Repairing unrelated `service-envelope` work or making the entire repository-wide `pnpm check` pass beyond the scoped setup changes.

## ASCII Diagrams

```text
Fresh clone
    |
    v
corepack + Node 22 + pnpm 11.7
    |
    +--> pnpm run bootstrap
    |       +--> root install + Playwright browser
    |       `--> web install from web/pnpm-lock.yaml
    |
    `--> pnpm verify
            +--> root typecheck/tests
            +--> web typecheck/tests/components
            `--> responsive shell

Local Worker proxy ------------------> web/.dev.vars (never committed)
Deployed D1 auth acceptance ---------> isolated target + GitHub secrets
Apps Script domain deployment --------> clasp + separate AGENTS.md evidence gate
```

## Failure Modes & Gaps

- `pnpm install` alone does not install `web/` dependencies; the canonical setup command must do both.
- Chromium installation is required for responsive and authenticated Playwright flows; setup must make this explicit.
- The repository has two deployment boundaries; instructions must prevent a developer from treating the D1 auth target as the legacy Apps Script `/exec` target.
- The official deployed D1 evidence remains absent until an operator dispatches `e2e.yml` with a fresh isolated target and acceptance secrets; a local manual smoke is supplemental only.
- GitHub branch protection and secrets cannot be made repository-portable through committed files; the admin checklist must name the exact manual actions without pretending they are configured.
- The repository contains historical `.scratch/` material with old setup instructions; canonical contributor guidance must state that `.scratch/` is reference-only and not the source of truth.

## Parallelization / Worktree Strategy

Use the isolated `chore/developer-readiness` worktree, based on `feat/auth-d1-foundation`, so onboarding changes do not contaminate PR #166. Documentation/setup and GitHub-template files are independent after the file contract above is fixed and may be implemented in parallel worktrees; final formatting, setup smoke, and review are sequential. No task may touch the five known local-only untracked files.

---

### Task 1: Canonical local setup and contributor workflow

**Files:**
- Create: `.node-version`
- Modify: `package.json`
- Modify: `README.md`
- Create: `CONTRIBUTING.md`
- Create: `web/.dev.vars.example`

**OMP dispatch:**
- Agent type: `task` (default worker)
- Reviewer gate: reviewer checks that commands match both package manifests, lockfiles, AGENTS.md, and CI.

**Interfaces:**
- Produces `pnpm run bootstrap` as the single fresh-clone dependency command; avoid the pnpm built-in `pnpm setup` command name.
- Produces `pnpm run verify` as the local equivalent of the deterministic test matrix, without deployment credentials.

- [ ] Document the exact clone flow: `git clone`, `cd`, `corepack enable`, Node 22 selection, `pnpm run bootstrap`, and `pnpm run verify`.
- [ ] Add `pnpm run bootstrap` that installs root dependencies and then `web/` dependencies using frozen lockfiles; preserve Playwright browser installation through the existing root lifecycle.
- [ ] Add `pnpm run verify` that runs root typecheck, tracked GAS/prototype tests, web typecheck, web workerd tests, component tests, and responsive shell checks in the same order as CI.
- [ ] Document root versus `web/` lockfile ownership and the exact commands for working in each boundary.
- [ ] Document local Worker proxy setup using `web/.dev.vars.example`; state that it is a copy/reference file and must never contain production credentials.
- [ ] Document branch naming, worktree creation, pre-commit behavior, test selection, and the difference between deterministic CI and deployed acceptance.
- [ ] Document Apps Script/clasp as optional domain-backend work and link to `AGENTS.md` instead of inventing new deployment instructions.
- [ ] Link `web/AGENTS.md` from contributor guidance so framework changes follow the pinned Next.js version's local documentation rule.
- [ ] Mark `.scratch/` as historical/reference-only and state that `CONTRIBUTING.md` is the canonical setup source.
- [ ] Run `pnpm run bootstrap` only in a disposable validation clone/worktree or use existing installed dependencies; do not modify production services.
- [ ] Run `pnpm run verify` and commit the scoped files.

### Task 2: Repository-level GitHub collaboration defaults

**Files:**
- Create: `.github/CODEOWNERS`
- Create: `.github/PULL_REQUEST_TEMPLATE.md`
- Create: `.github/ISSUE_TEMPLATE/bug.yml`
- Create: `.github/dependabot.yml`

**OMP dispatch:**
- Agent type: `task` (default worker)
- Reviewer gate: reviewer checks GitHub syntax, least-privilege ownership, and that templates enforce project safety rules without requiring unavailable secrets.

**Interfaces:**
- CODEOWNERS routes review to `@noahwong-hue` for the current repository; branch protection remains a manual admin action.
- PR template links to `CONTRIBUTING.md`, requires observable acceptance evidence, and explicitly separates local/manual smoke from official deployed evidence.
- Dependabot treats `/` and `/web` as separate npm ecosystems and updates GitHub Actions independently.

- [ ] Add CODEOWNERS with a single maintainer owner and explicit high-risk paths for `.github/`, `web/`, and `src/gas/`.
- [ ] Add a PR template requiring issue linkage, scope boundary, acceptance trace, exact verification commands, migration/deployment notes, and confirmation that secrets/Sheets were untouched.
- [ ] Add a bug issue form requesting reproduction, expected/actual behavior, environment, relevant boundary (Worker/D1, Apps Script, or web), and verification evidence; do not request credentials.
- [ ] Add weekly Dependabot updates for root npm, `web` npm, and GitHub Actions with bounded PR counts and grouping.
- [ ] Validate YAML/Markdown formatting and commit the scoped files.

### Task 3: Repository administrator handoff

**Files:**
- No files — review the implemented documentation and configuration without editing.

**OMP dispatch:**
- Agent type: `reviewer` (read-only)
- Reviewer gate: final review only; no edits to GitHub settings.

**Interfaces:**
- Produces a manual checklist, not an automated mutation, covering branch protection, required checks, Actions variables/secrets, team access, and deployment ownership.

- [ ] Verify the repository's current branch-protection endpoint and record that no protection is configured if the API remains unavailable/not found.
- [ ] List recommended main-branch rules: PR-only changes, required successful checks (`Root typecheck & unit (gas + prototype)`, `Web typecheck & tests (workerd + components)`, `Shell responsive (static shell, 375px + 1280px)`, and `D1 auth contract (workerd)`), conversation resolution, and no force-pushes.
- [ ] List the exact D1 Actions variable/secret names from `.github/CI-SECRETS.md`, with no values.
- [ ] State that the official deployed D1 gate is `workflow_dispatch` and remains not-ready until it passes against a fresh isolated target.
- [ ] State that each developer uses their own local clone/worktree and never shares `.auth`, `.dev.vars`, credentials, or D1 acceptance accounts.

## Verification Matrix

- Fresh-clone smoke: `corepack enable && pnpm run bootstrap` completes without manual dependency installation.
- Setup command check: `pnpm run bootstrap` installs both lockfile boundaries and Playwright Chromium.
- Deterministic verification: `pnpm run verify` passes on a clone without untracked service-envelope files or deployment secrets; the separate PR `D1 auth contract (workerd)` job remains covered by `pnpm --dir web exec vitest run worker.auth.test.ts lib/auth`.
- Secret boundary: `git check-ignore` confirms `.env`, `web/.env`, `web/.dev.vars`, `web/.wrangler/`, `.auth`, and test artifacts remain ignored; examples contain placeholders only.
- GitHub syntax: CODEOWNERS, Dependabot, issue form, and PR template are parseable and contain no secret values.
- Existing PR gates: root/web typechecks, root/web tests, components, responsive shell, and the separate D1 auth contract remain green.

## Manual Admin Checklist (not automated by this plan)

- Configure main branch protection/ruleset with PR-only changes and all four required checks listed above.
- Enable required conversation resolution and prevent force pushes/deletion on `main`.
- Configure `AUTH_TARGET_URL` as an Actions variable and the five `AUTH_*` acceptance values as Actions secrets, using only a disposable isolated Worker/D1 target.
- Grant repository access to the next developer through the appropriate GitHub team/role; do not share personal tokens.
- Confirm Cloudflare and Apps Script deployment ownership separately from repository write access.
- Dispatch the deployed D1 gate only after rotating the isolated target and acceptance fixtures; retain its Playwright artifact.
