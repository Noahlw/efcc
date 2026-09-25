# #645 workspace guardrails — execution record

Stack: one PR above PR #644 (`refactor/repo-wide-organization-implementation`),
below the #646 non-Auth contract PR. This branch is
`refactor/workspace-organization` at `a3da16daa8ce3ddb79a9fb402f58e4a4fd8855d7`,
which equals the PR #644 head OID observed on 2026-09-25. The tickets ask for
branch `codex/645-workspace-guardrails`; the owner directed work to stay on
this branch as-is, so each ticket lands as a focused commit here instead.

## #648 — TypeScript test ownership and Home runner collection

### Inventory (all 12 verified against `tsc --listFiles` at base `a3da16da`)

`web/tsconfig.json` `**/*.ts`/`**/*.tsx` does not match dot-directories, so
`.storybook/*.test.ts(x)` files were in no compiler project. The 23
`.storybook` support files were already owned indirectly (imported by
in-program files such as `web/scripts/verify-storybook-index.ts`); the 10
test leaves were not.

| File | Runtime owner | Compiler owner (before → after) | Collection |
| --- | --- | --- | --- |
| `web/worker.auth.test.ts` | workerd pool (`web/vitest.config.ts`) | none → `web/tsconfig.worker.json` | canonical (`test:workerd` in `verify`) |
| `web/lib/permission-editor-panel.test.tsx` | components jsdom (`vitest.components.config.ts`) | excluded → `web/tsconfig.json` (un-excluded) | canonical (`test:components` in `verify`) |
| `web/.storybook/management-hub-structured-failure.test.ts` | t07 node (`vitest.t07.config.ts`) | none → `web/tsconfig.json` (explicit dot-dir include) | via `test:t07:foundation` (outside `verify` aggregate) |
| `web/.storybook/msw-policy.test.ts` | t07 node | none → `web/tsconfig.json` | via `test:t07:foundation` |
| `web/.storybook/presentation-catalog.test.ts` | t07 node | none → `web/tsconfig.json` | via `test:t07:foundation` |
| `web/.storybook/programs-presentation-contract.test.ts` | t07 node | none → `web/tsconfig.json` | via `test:t07:foundation` |
| `web/.storybook/programs-presentation-contract.test.tsx` | t07 node | none → `web/tsconfig.json` | via `test:t07:foundation` |
| `web/.storybook/storybook-port.test.ts` | t07 node | none → `web/tsconfig.json` | via `test:t07:foundation` |
| `web/.storybook/t07-aggregate-qualification.test.ts` | t07 node | none → `web/tsconfig.json` | via `test:t07:foundation` |
| `web/.storybook/t07-governance.test.ts` | t07 node | none → `web/tsconfig.json` | via `test:t07:foundation` |
| `web/.storybook/t08-presentation-contract.test.ts` | t07 node + components jsdom | none → `web/tsconfig.json` | canonical via components; also t07 |
| `web/.storybook/t09-foundation-identity.test.ts` | t07 node | none → `web/tsconfig.json` | via `test:t07:foundation` |
| `web/scripts/run-programs-home-acceptance.test.mjs` | root vitest via `test:programs:runners:unit` (**added**) | n/a (JS runner unit) | canonical (`verify` aggregate) |

No Project References were added.

### Changes

- `web/tsconfig.json`: explicit `.storybook/**/*.test.ts` /
  `.storybook/**/*.test.tsx` includes; removed the
  `lib/permission-editor-panel.test.tsx` exclusion.
- `web/tsconfig.worker.json`: added `worker.auth.test.ts`; removed `baseUrl`
  (TS 7.0.2 rejects it with TS5102 — pre-existing failure at base).
- `package.json`: `test:programs:runners:unit` now also collects
  `web/scripts/run-programs-home-acceptance.test.mjs`.
- `web/.storybook/programs.stories.tsx`: `msw: [...scenario.handlers]`
  (was a readonly array — 10 pre-existing type errors at base).
- Narrowed three test destructurings by subject with type predicates
  (`presentation-catalog`, `t08`, `t09`); runtime assertions unchanged.
- Regenerated stale `web/.next` via `pnpm --filter web build` (it referenced
  the retired prototype route; static export has no `/prototype`).

### Evidence (this branch)

- `tsc -p web/tsconfig.json` → clean (base: 2 files errored).
- `tsc -p web/tsconfig.worker.json` → clean (base: TS5102).
- `pnpm test:programs:runners:unit` → 3 files, 10 tests pass (home included once).
- `vitest run --config vitest.t07.config.ts` → 63/64 pass; the one failure
  (`programs-presentation-contract` 2099-date source assertion) is
  pre-existing at base (triggered by untouched `programs-fixtures.ts`
  `2099-09-19` dates) and is preserved, not fixed, as out of scope.
- `vitest.components` `lib/permission-editor-panel.test.tsx` → 12 pass.
- workerd `worker.auth.test.ts` → 47 pass.
- `pnpm --filter web build` → static export succeeds (16 routes, no prototype).

## #649 — Relocate web/ to apps/web/

Package name stays `web` (so `pnpm --filter web` keeps selecting by name);
only the directory moves. Historical evidence (`.delivery/`, `docs/qa/`,
ADRs, specs, prior plans) retains `web/` snapshot wording. Current guidance
prose (README, AGENTS.md, TESTING.md, issue template) moves in #652.

Mechanical updates (all `web/` → `apps/web/` live refs):

- `pnpm-workspace.yaml`, `pnpm-lock.yaml` importer key, root `package.json`
  `apps/web/scripts/...` commands, `.gitignore` storybook-static ignore,
  `oxlint.config.ts` override paths, `.github/CODEOWNERS`, dependabot comment.
- `apps/web/package.json` verify-index (`../../node_modules`), `next.config.ts`
  turbopack root (`../..`), `wrangler.jsonc` comment.
- Runner `REPO_ROOT` (`../../..`), canary `WEB_ROOT`/`.dev.vars`/`--dir`,
  `reset-local-d1.mjs` D1 state dir, `run-shell-responsive.mjs` `--dir`.
- `tests/e2e/*` imports (`../../apps/web/`), tsconfig `@/*` mapping, Playwright
  `--dir ../../apps/web build` commands, storybook launcher paths,
  wrangler binary/cwd, `serve-static.ts` `apps/web/out` root.
- `scripts/*` governance/verify imports (`../apps/web/...`), CLI-arg and
  manifest fixtures (`apps/web/...`), storybook scope allowlist + fixtures,
  t09 census paths, `verify-programs.ts` wrangler/test mappings.
- Governance runtime paths: `resolveRepoRoot` marker, scan `webDir`,
  `normalizeRepoPath` (apps-first, legacy `web/` fallback),
  `resolveTargetFilePath` (both prefixes), generated-output classifiers,
  `registries.ts` scopes, `validation.ts`, ratchets, failure hints, runner
  manifests (`config: apps/web/wrangler.jsonc`).
- `docs/implementation/t05-*-migration-ledger.md` executable mappings: these
  ledgers are live `verify:programs` gate inputs, so their cited paths move
  (historical prose untouched).

### Evidence (this branch)

- `pnpm install --frozen-lockfile` → pass; `apps/web/node_modules` linked.
- `pnpm verify:fast` (root + e2e + both web projects) → clean.
- `pnpm --filter web build` → static export, 16 routes.
- `pnpm --filter web storybook:build` + `pnpm storybook:verify-index` →
  95 Stories / 36 Screen obligations reconciled.
- runners:unit 10 pass; canary:unit 5 pass; `test:governance` 18 pass;
  `test:programs:promotion` 31 pass; `test:storybook:scope` 13 pass.
- `pnpm db:reset:local` → D1 migrated at `apps/web/.wrangler`.
- `wrangler dev` smoke: `/`, `/home`, `/programs`, `/scanner`,
  `/wasm/zxing_reader.wasm` → 200; API routes → 401 unauthenticated.
- `serve-static.ts` smoke over `apps/web/out`: same five URLs → 200.
- t07: 63/64 (only the preserved pre-existing 2099-date failure).
- workerd `worker.auth.test.ts`: 47 pass (moved `wrangler.jsonc` resolves).
- Note: port 8787 is held by an unrelated pre-existing python process; smoke
  used :18787 instead and left the holder untouched.

## #650 — Trusted Knip reports and evidence-based cleanup ledger

Pinned dev-only `knip@6.38.0` (exact). Context7 quota still exhausted, so
knip.dev official docs are the cited fallback. `pnpm knip` (default, gated
in `pnpm verify` outside pre-commit) and `pnpm knip:production` (advisory)
are separate commands; `treatConfigHintsAsErrors` makes any new hint fail.

- Resolved: dynamic-config load blockers (env shims in scripts;
  `main.ts` `import.meta.dirname` fallback — Node behavior unchanged),
  workspace/entry/project design per knip.dev, all configuration hints.
- Empirical scope finding: user `!` production entries only register
  outside Next/Wrangler plugin-claimed paths, so production stays advisory
  and default mode is the enforcement ratchet. No blanket `ignoreIssues`.
- Ledger `docs/plans/2026-09-25-650-knip-cleanup-ledger.md` (660 lines):
  259 export findings triaged (157 un-export, 65 barrel-line, 34 code,
  3 catalog re-export deletes), 8 file deletes (4 ui primitives,
  programs-manager, 2 qa runners, screen-foundations), 1 dep delete
  (shadcn). Keeps proven by entrypoint/import/CSS/config/builtin evidence.
  Deletions execute in #652; the gate turns green there.
