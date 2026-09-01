# S4 Phase F — Contraction Evidence

**Date:** 2026-09-01
**Base:** `c06f9fc0921830a237a7334f1009a7867663a784`
**Branch:** `feat/s4-f-contraction-release-gate`
**Scope:** #475 / #494 contraction only. All commands below used local loopback Worker/D1 and disposable fixtures. No production Worker, remote D1, Apps Script, Google Sheet, or non-disposable account was touched.

## Evidence

| Row | Exact command / action | Observed result | Status |
| --- | --- | --- | --- |
| F-494-01 | `pnpm verify:identity`; focused auth/registration suite with `lib/auth/accounts.test.ts`, `lib/auth/registrations.test.ts`, `lib/auth/registration-authority.test.ts`, and `lib/auth/registration-batch.test.ts` | Identity suite: 4 files / 98 tests passed. Auth/registration suite: 4 files / 29 tests passed. Role-free approval and capability guard behavior passed. | READY |
| F-494-02 | `pnpm --dir web exec vitest run --config vitest.config.ts worker.test.ts -t unknown-phase-f`; `pnpm verify:contraction`; root and web typechecks | Generic unknown `/api` route returned 404 `application/problem+json` with `NOT_FOUND`. Scanner reported 0 forbidden shipped occurrences across 144 files. Both typechecks passed. | READY |
| F-494-03 | `pnpm verify:contraction`; component and geometry seams from the styling slice | Scanner reported 0 shipped CSS Module imports. Component suite: 115 tests passed. Phase D public geometry: 94 tests passed. Shell geometry: 28 tests passed. Browser inspection at 390×844 and 1280×800 observed 0 overflow and 44px minimum target heights. | READY |
| F-494-04 | `pnpm --dir web exec vitest run --config vitest.config.ts lib/identity/d1-schema.test.ts`; local migration/seed and SQLite inspection | Schema suite: 27 tests passed. A legacy table coexisting with normalized tables produced `stale-schema` and an explicit reset command without dropping the table. Final local SQLite contained `role_categories`, `role_definitions`, `role_definition_grants`, `role_assignments`, `role_policy_revisions`, `role_policy_mutations`, and `role_audit_events`; no pre-019 tables or role write-guard triggers; `accounts` and `registration_requests` had no `role` column. | READY |

## Seed and local Worker proof

`pnpm dev:local` was started under the process supervisor on `127.0.0.1:8787`. After the first post-migration attempt exposed a remaining fixture SQL write to `accounts.role`, commit `715b96a` removed that obsolete seed column while retaining normalized identity assignments and the legacy-PIN upgrade fixture. A clean rerun then passed:

- `pnpm db:seed:local`: reset 28 commands and role-free legacy reset/seed 11 commands succeeded.
- `pnpm db:seed:disposable`: 6 commands succeeded.
- `DEMO_TARGET_URL=http://127.0.0.1:8787 pnpm db:seed:demo`: demo programs/events, module gate, notices, and home content seeded successfully.

The initial seed failure is retained here as provenance; it was not converted into a skip or hidden from the final gate.

## Scanner fixture contract

`node --experimental-strip-types --test tests/e2e/verify-phase-f-contraction.ts` passed all 15 fixture tests, including explicit rejection of shipped CSS Module imports, `systemRole`, `requireAdminOrStaff`, the compatibility route, legacy table names outside preflight, fixed-role DTO fields, and SQL role columns. It accepted only normalized Role Definition/Assignment terminology, Account Directory identity labels, preflight legacy-table text, and excluded stale-schema test setup. The production entrypoint is exactly `node --experimental-strip-types tests/e2e/verify-phase-f-contraction.ts` via `pnpm verify:contraction`; no second scanner remains.

## Contraction disposition

F-494-01 through F-494-04 are `READY`. The implementation commits are authored as `Noahlw <83105194+Noahlw@users.noreply.github.com>`:

- `488403b` — freeze contraction and release acceptance trace
- `8e6de15` — remove fixed role compatibility paths
- `e2a8a9b` — use single TypeScript contraction scanner entrypoint
- `19dc303` — enforce shipped CSS contraction
- `05f1a68` — contract shipped styling system
- `715b96a` — update disposable seeds for role-free accounts
- `54fc26f` — cover generic unknown route fallback

F-495 release evidence and human gates remain pending in this intermediate record. This document does not claim production readiness.
