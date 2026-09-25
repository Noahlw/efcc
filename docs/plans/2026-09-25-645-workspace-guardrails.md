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
