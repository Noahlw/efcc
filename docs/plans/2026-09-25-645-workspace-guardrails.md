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
  (shadcn). Keeps proven by entry/import/CSS/config evidence.
  Deletions execute in #652; the gate turns green there.

## #651 — Source-backed import boundaries with dependency-cruiser

Pinned dev-only `dependency-cruiser@18.4.0` (exact). Context7 quota still
exhausted; official `doc/rules-reference.md` + `doc/options-reference.md`
are the cited fallback. Config `.dependency-cruiser.cjs`, resolver mirror
`tsconfig.depcruise.json` (the real tsconfigs abort every cruise via
TS18003; v18 schema has no alias-capable resolve option), command
`pnpm check:boundaries`, wired into `pnpm verify` outside pre-commit.

- Four families, source-backed: `no-prod-to-test-or-story`,
  `no-browser-to-worker`, `no-browser-to-d1`, `no-worker-to-react`, plus
  `no-unresolved-internal`. No speculative matrix, no circular rule.
- Result: the four boundary rules are clean (zero violations); 37
  `no-unresolved-internal` findings are benign artifacts (24 workerd
  builtins, 13 export-map-strict but Node-resolvable specifiers, each
  proven live by passing suites) recorded in the shrink-only
  `.dependency-cruiser-known-violations.json` baseline
  (`baseline.mode: shrink-only`, stale entries error).
- Ratchet proven: temporary `app/page.tsx → worker.ts` import failed the
  gate with exactly `no-browser-to-worker` (exit 1, 37 known ignored),
  then removed; gate green again.
- Owner/review path: config header (`pnpm check:boundaries`); exceptions
  need a narrow reviewed rule change, never a blanket ignore.

## #652 — Docs convergence and proven-dead removals

- Executed the #650 ledger: 7 files deleted (4 ui primitives,
  programs-manager, 2 qa runners), ~250 export actions (un-export /
  barrel-line / code), 2 ledger corrections (shadcn kept on CSS-import
  evidence; screen-foundations restored on live-importer evidence —
  see ledger corrections section). No consolidation refactors, no quota.
- Current guidance converged to `apps/web/`: README, AGENTS.md,
  CONTRIBUTING.md, PRODUCT.md, DESIGN.md, tests/e2e/README,
  apps/web/README, .storybook/README, COMPONENT_INVENTORY (also 18→14
  count plus unwired-primitive note), target inventory, issue template.
  Historical ADRs/specs/evidence keep snapshot wording.
- #498 reconciled: closed COMPLETED 2026-09-25; the syntax-debt owner is
  TESTING.md `pnpm check` discipline + oxlint.config.ts overrides (no
  live doc links debt to #498; ADR-0014 already superseded, others
  historical). No sidecar delta found to transfer (BA worktree preserved).
- Governance fixtures mirror the layout (`apps/web` temp paths, git
  pathspec, mkdir recursive).
- Evidence: Knip default exit 0; `verify:fast` clean; production build;
  workerd 664, components 1184, t07 63/64 (single preserved 2099
  failure), runners/promotion green, governance unit + fast green.
- Known boundary (pre-existing, not this ticket): `test:governance`
  full/release mode reports 259 RULE-NO-NEW-CONTROL-OVERRIDE violations.
  0 of 518 instances sit on lines changed by this stack (verified by
  intersection). Cause: the `apps/web` git pathspec fix (required; the
  old `web` pathspec matched nothing post-move, so the ratchet was
  blind)   exposes the reorganization-stack diff (merge-base b18828d4,
  ~195k added lines) to the incremental ratchet, which flags
  pre-existing caller overrides. Fixing 259 styling overrides is out of
  scope; #653 surfaces it with this evidence.

## #653 — Qualification and review

- Parent revalidated: PR #644 head still
  `a3da16daa8ce3ddb79a9fb402f58e4a4fd8855d7` (OPEN, base main); no
  rebase needed. Branch stays `refactor/workspace-organization` per
  owner direction (tickets named `codex/645-workspace-guardrails`).
- Exact-SHA evidence on `2d00826` (plus review fixes): frozen install,
  `verify:fast`, production build, Knip exit 0, boundaries 0-new,
  workerd 664, components 1184, identity 99, t07 64/64 (the 2099-date
  contract failure fixed post-qualification: fixed 2030-09-19 upcoming
  event, commit `ce61c4c`), scope 13, canary 5, runners 10,
  promotion 31, storybook index 95/36/7/14, `verify:programs`
  functional-passed on `ce61c4c` (browser/home/responsive/feed),
  shell-responsive 92, shell-geometry 35, role-hierarchy-geometry 49,
  governance unit + fast + full + release green.
- Full `pnpm verify` on the final tree passes end to end except for no
  remaining failure: the earlier 259-violation
  `RULE-NO-NEW-CONTROL-OVERRIDE` boundary does not reproduce at HEAD
  (`verify:governance`, `:full`, `:release` all report zero un-waived
  violations); the chain's only halt was `verify:programs` refusing a
  dirty worktree (the uncommitted t07 fix), cleared by committing.
- Ratchet demo (ticket evidence): temporary `app/page.tsx → worker.ts`
  import failed the gate with exactly `no-browser-to-worker` (exit 1,
  37 known ignored), then removed; gate green again.
- Code review (repo skill, Standards + Spec axes): fixed README
  `web/migrations` leftover and the oxlint override for deleted
  `programs-manager.tsx`. Dispositioned: wrong-branch (owner-directed),
  no-PR-yet (awaiting owner push approval), ratchet-demo (recorded
  here), production-advisory (reasoned reading, documented), export
  hygiene (is the #650/#652 ledger execution, not creep), baseline
  (entries verified benign one by one; new specifiers still fail),
  T05-ledgers (live gate inputs, not snapshots), census reflow (hook
  formatter), permissions-panel overrides (pre-existing, preserved).
- Limits: owner spot-check, independent review, device/AT checks, and
  deployment evidence are separate seams (TESTING.md). No merge,
  deploy, remote D1, or credential actions taken.
