# Local end-to-end tests

The Playwright suites under `tests/e2e/` exercise the rebuilt Worker/D1 application or the static export. They run locally against loopback services and disposable data. No suite is a production-data, Google Sheets, or Apps Script boundary.

## Test ownership

Each config declares a positive `testMatch`; invoke the named runner from the repository root.

| Config or runner | Command | Coverage |
| --- | --- | --- |
| `auth-d1.config.ts` | `pnpm exec playwright test --config=tests/e2e/auth-d1.config.ts` | Cookie-only username/password auth and session behavior against a local Worker/D1 target. |
| `programs-participant-acceptance.config.ts` | `pnpm test:programs:browser` | Critical Programs participant and management journeys at the representative phone viewport. |
| `programs-home-acceptance.config.ts` | `pnpm test:programs:home` | Five Home-origin parity journeys, including overlay history, long copy, Event, and Program navigation. |
| `programs-responsive-matrix.config.ts` | `pnpm test:programs:responsive` | Focused Programs responsive behavior at the configured representative widths. |
| `attendance-d1.config.ts` | `pnpm exec playwright test --config=tests/e2e/attendance-d1.config.ts` | Attendance and check-in flows through the Worker API and UI. |
| `live-ui.config.ts` | `pnpm exec playwright test --config=tests/e2e/live-ui.config.ts` | Rebuilt shell, profile, account settings, approval, and responsive states. |
| `responsive.config.ts` | `pnpm test:shell-responsive` | Static-export shell responsive behavior. |
| `shell-geometry.config.ts` | `pnpm test:shell-geometry` | Numeric static-shell geometry at the pinned widths in the config. |
| `role-hierarchy-geometry.config.ts` | `pnpm test:role-hierarchy-geometry` | Numeric role hierarchy geometry and target clearance. |
| `s4-management-hardening.config.ts` | `PROGRAMS_TARGET_URL=http://127.0.0.1:8787 pnpm exec playwright test --config=tests/e2e/s4-management-hardening.config.ts` | Authenticated management and identity geometry when the local Worker is running. |
| Storybook configs | `pnpm test:t08:controls`, `pnpm test:t09:foundations`, `pnpm test:t10:composition`, `pnpm test:t11:storybook` | Focused presentation contracts; these do not prove Worker/D1 behavior. |

The root `pnpm verify` aggregate owns the required local stages. Use `pnpm verify:programs` for the Programs promotion composition. The former `programs-d1` and PUI-05 Home-origin suites were retired after all 63 Programs and five Home scenarios had executable replacement mappings and passed the clean local promotion gate. The migration ledgers preserve their scenario IDs and replacement evidence.

## Local-first run

Prepare local variables once:

```sh
cp apps/web/.dev.vars.example apps/web/.dev.vars
openssl rand -hex 32 # place the value in EFCC_ACCESS_TOKEN_SECRET
```

Use separate terminals:

```sh
# terminal 1
pnpm dev:local

# terminal 2
pnpm db:seed:local
pnpm db:seed:disposable
pnpm db:seed:demo
pnpm test:programs:browser
```

`pnpm dev:local` builds the static export, applies local Wrangler migrations, and serves the Worker at `http://127.0.0.1:8787` by default. A suite that accepts an already-running target may use `PROGRAMS_TARGET_URL=http://127.0.0.1:8787`. Keep all D1 resets local or inventory-approved disposable development/test operations; never use a production or unknown target.

Playwright acceptance runners use one worker and zero retries for the required functional slices. A retry, skip, synthetic route fulfillment, or reduced fallback run is reported separately and cannot be relabelled as full Worker/D1 acceptance. Static geometry configurations may have their own focused settings; report their boundary exactly.

## Reports and cleanup

Preserve the first causal failure, revision, route/state/viewport, and resulting artifacts. Stop only processes started by your worktree. Do not commit `web/.dev.vars`, cookies, storage state, tokens, or generated test results unless a plan explicitly names a review artifact.

`tests/e2e/plan-doc-appender.ts` is a manual utility. Use it only when an approved plan explicitly requires a recorded evidence append, and pass every argument explicitly. It does not run automatically after a test.

## Evidence boundaries

Playwright proves the boundary exercised by its config. Static shell and geometry suites do not prove Worker authorization, D1 persistence, production auth/session, camera hardware, native print, real-device behavior, assistive technology, or deployment. Storybook and component tests are presentation seams. Human/device review, independent review, owner approval, and Cloudflare deployment evidence remain separate.

## Historical Phase F evidence

Phase F reports under `docs/qa/` and `docs/specs/s4-phase-f-acceptance-trace.md` are retained as historical evidence. They describe the older contraction and release investigation; their commands, counts, and deleted `verify:contraction` helper are not current contributor entrypoints. Use the current root scripts and [TESTING.md](../../TESTING.md) for present work. Preserve historical records and provenance instead of rewriting them to match current commands.
