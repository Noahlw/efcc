# S4 Phase D foundation QA evidence

## Scope

- Branch: `feat/s4-d-member-public-route-polish`
- Phase D base: `f914de96df329f0e455890865f98e80143d7c27e` (Phase C PR #501 head)
- Implementation head: `343cafd28a210f6eac2c4c96714a0e51f8e6463c`
- Tickets: #488 (public route polish), #489 (participant route polish), #490 (management route polish)
- Verification used a disposable local D1 database and a direct Node 22 Wrangler process. No production, Apps Script, Google Sheets, remote D1, or Cloudflare deployment/write was used.

## Local runtime and fixtures

The checked-in `pnpm` commands were run with Node `v22.18.0` and pnpm `11.7.0`.

Local Worker command, started from `web/`:

```text
/Users/noah.wong/.local/share/fnm/node-versions/v22.18.0/installation/bin/node /Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/s4-phase-d/web/node_modules/.pnpm/wrangler@4.127.1_@cloudflare+workers-types@5.20260804.1/node_modules/wrangler/wrangler-dist/cli.js dev --port 8797 --var EFCC_ACCESS_TOKEN_SECRET:phase-d-local-only-secret
```

Fixture reset and seed commands, from the repository root:

```text
pnpm db:seed:local
DEMO_TARGET_URL=http://127.0.0.1:8797 pnpm db:seed:demo
```

`pnpm db:seed:local` completed its checked-in reset/seed sequence. The disposable identity wrapper is Node 22 strip-types compatible and was also run directly:

```text
node --experimental-strip-types tests/e2e/seed-disposable-identity.ts
```

That command completed six local Wrangler D1 commands. `tests/e2e/seed-dev-accounts.test.ts` passed 1/1, including reset cleanup coverage.

The prescribed `pnpm dev:local` launcher remains unavailable on this workstation because the installed Node 20 runtime raises `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`; this is why the local acceptance Worker used the direct Node 22 Wrangler command above.

## Source and baseline gates

All listed commands were run with the Node 22/pnpm environment above.

| Check | Result |
| --- | --- |
| `pnpm typecheck` | **PASS** — root and E2E TypeScript |
| `pnpm --dir web typecheck` | **PASS** — web and Worker TypeScript |
| `pnpm --dir web build` | **PASS** — Next `16.2.12`, all generated routes |
| `pnpm test` | **PASS** — 1 file, 38/38 |
| `pnpm verify:identity` | **PASS** — 4 files, 98/98 |
| `pnpm --dir web test:components` | **PASS** — 59 files, 742 tests |
| `pnpm test:shell-responsive` | **PASS** — 92 passed, 1 intentional skip |
| `pnpm test:shell-geometry` | **PASS** — 28/28 |
| `pnpm test:role-hierarchy-geometry` | **PASS** — 49/49 |

The full web Vitest command (`pnpm --dir web test`) ran 37 files with 561 tests passing but exited nonzero because four Cloudflare/Vite pool setup failures occurred before assertions. These are the documented Phase C infrastructure baseline (`EvalError: Code generation from strings disallowed for this context`), not product assertion failures:

- `web/lib/auth/normalized-authority-c487.test.ts`
- `web/lib/identity/permission-editor.test.ts`
- `web/lib/identity/permission-editor-handlers.test.ts`
- `web/lib/identity/normalized-authority.test.ts`

Ultracite was run repository-wide and exited nonzero with **0 warnings and 1,965 errors**. The Phase C baseline was **0 warnings and 1,823 errors**. Changed files were formatted with `oxfmt`; the remaining count is recorded as a repository baseline/format-diagnostic blocker, not a clean-lint claim.

## Focused component evidence

The full component suite passed 59 files/742 tests. The final targeted recovery checks for notification reads, ambiguous cancellation retry, and workspace behavior passed 3 files/72 tests; the latest workspace/notification-focused run passed 49 tests. No changed-path component assertion remained failing.

## Local browser acceptance evidence

All browser checks used the direct local Worker at `http://127.0.0.1:8797`, one Playwright worker, and disposable fixtures after reset/seed.

### Public/authenticated route geometry

```text
AUTH_UI_TARGET_URL=http://127.0.0.1:8797 fnm exec --using v22.18.0 pnpm exec playwright test --config=tests/e2e/phase-d-public-geometry.config.ts
```

**PASS — 94 passed, 4 intentional skips.** The dedicated config covers 320, 390, 600, 799, 800, 1024, and 1440 CSS-pixel widths. Authenticated account/settings geometry requires the shell containment assertion; public login/register checks remain local public-route checks.

### Programs geometry

```text
PROGRAMS_TARGET_URL=http://127.0.0.1:8797 fnm exec --using v22.18.0 pnpm exec playwright test --config=tests/e2e/phase-d-programs-geometry.config.ts
```

**PASS — 24 passed.** The dedicated config covers the Phase D 320/390/600/799/800/900/1024/1440 CSS-pixel seams, shell containment, and mobile dock/focused-control geometry. These dedicated geometry configs are intentionally out-of-band acceptance seams rather than package/precheck scripts; `AGENTS.md` requires the relevant local suite, not package registration.

### Ticket lanes

| Acceptance lane | Result |
| --- | --- |
| PUI participant lane (`programs-d1.config.ts`, clean local D1) | **PASS** — 63/63 focused participant tests across phone 320, phone 390, and desktop |
| MUI management lane (`programs-d1.config.ts`, clean local D1) | **PASS** — 24/24 management tests across phone 320, phone 390, and desktop |
| NTF-01 management notification lane | **PASS** — 6/6 after clean reset/seed |
| Management hardening (`s4-management-hardening.config.ts`) | **PASS** — 45 passed, 65 intentional `onlyProjects` skips (110 scheduled) |
| Live UI (`live-ui.config.ts`) | **PASS** — 32/32 on the clean local run |
| Member directory (`member-directory.config.ts`) | **PASS** — 1/1 |
| Auth local loopback smoke | **PASS** — 2/2 with the target explicitly set to port 8797 |

A prior run against the default 8787 target returned two 404 setup errors; it is excluded from the final evidence above.

## Standalone shell responsive rerun

The required standalone gate was rerun while the disposable Node 22 Wrangler Worker was ready on `127.0.0.1:8797`:

```text
PATH=/Users/noah.wong/.local/share/fnm/node-versions/v22.18.0/installation/bin:/usr/local/bin:/usr/bin:/bin pnpm test:shell-responsive
```

**PASS — 92 passed, 1 intentional skip in 93 scheduled tests; 1 worker; 31.2s.**

`tests/e2e/responsive.config.ts` intentionally builds and serves the static Next output at `127.0.0.1:4173`; it does not issue Worker requests. The Worker remained ready on port 8797 for the local acceptance environment, and the standalone command was not combined with `test:shell-geometry`.

## Cutover and cleanup evidence

- Deleted public/Programs CSS module callers were searched after the cutover; no executable import of a deleted module remained.
- The seed reset now removes disposable filter-account children and account rows before reseeding. Role-assignment cleanup retains the `revoked_at IS NULL` guard.
- Event-exception cleanup now fails loudly on failed GET/DELETE instead of suppressing errors.
- No stale implementation shim, alias, or deprecated CSS-module path was retained.

## Manual evidence

The following rows remain explicitly **MANUAL — unclaimed**. No screenshot, real-device safe-area, reduced-motion, forced-colors, 200% zoom, text-spacing, or remote-CI evidence is claimed:

- D-488-M1 — public route accessibility/appearance manual review
- D-488-M2 — public route real-device/safe-area review
- D-489-M1 — participant route accessibility/appearance manual review
- D-489-M2 — participant route real-device/safe-area review
- D-490-M1 — management route accessibility/appearance manual review
- D-490-M2 — management route real-device/safe-area review

No production promotion, Apps Script mutation, Google Sheets mutation, or remote Cloudflare action was attempted.
