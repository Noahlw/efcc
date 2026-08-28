# S4 Phase A — Foundation QA & Results

**Date:** 2026-08-28
**Worktree:** `/Users/noah.wong/Desktop/code/EFCC-dev-478`
**Branch:** `remediate-478` at `8e902b4a1eadf4a2f25aa2924243d53ab2f471d4`
**Stack base:** `85817f563a801e891bfbf758e3174ea0bdea9544` (PR #473 `feat/s4-12-shadcn-migration` head)
**Acceptance trace:** [`docs/specs/s4-phase-a-acceptance-trace.md`](../specs/s4-phase-a-acceptance-trace.md)
**Grouped PR:** #496 `feat(s4-a): identity and UI foundations` — open, no merge
**Tickets:** #476 (S5-A01), #477 (S5-A02), #478 (S5-A03)

## Phase A scope boundary

In scope — recorded by this report:

- #476 disposable pre-production D1 identity foundation.
- #477 Civic Minimal token contract + shadcn/Radix shell foundation.
- #478 normalized read-only 身份組 hierarchy + one rename mutation.

Out of scope — explicitly excluded: Phase B (#479–#484), Phase C (#485–#487), Phase D (#488–#490), Phase E (#491–#493), Phase F (#494–#495). No claim, gate, or evidence from those phases is made here.

## Implemented commits (Phase A implementation)

| Ticket | Commit | Subject |
| --- | --- | --- |
| #476 | `7307d6f6` | feat(s4-476): disposable D1 identity foundation |
| #476 | `81328e66` | fix(s4-476): terminal-state immutability for role_policy_mutations |
| #477 | `e7dc21d1` | feat(s4-a): #477 Civic Minimal token contract + shadcn shell foundation |
| #477 | `614518a1` | fix(s4-a): #477 remediate attention dialog overlay, focus restore, geometry gate |
| #477 | `31f8383d` | fix(s4-a): #477 tokenize attention panel layout, wire geometry gate |
| #478 | `4d1e3c23` | feat(s4-a): #478 role hierarchy read projection and rename mutation |
| #478 | `75694e77` | fix(s4-a): #478 remediate Problem Details, name validation, REJECTED audit, hierarchy UI |
| #478 | `83ea428f` | fix(s4-a): complete phase A role remediation |
| #476/#478 | `7306d854` | fix(s4-a): harden phase A acceptance blockers |
| #476 | `58ee9fdd` | fix: remove extra blank line at EOF in disposable identity seed |
| #478 | `c9191d1b` | fix(s4-a): close H-06 same-key concurrent mutation race |
| #477 | `8e902b4a` | test(s4-a): replace Promise.withResolvers with ES2015 deferred gate |
| trace | `f87f2ee2` | docs(s4-a): #478 trace — split Staff as assignable system identity |

Trace correction `f87f2ee2` re-casts Staff as an **assignable** system identity (Global, below Admin, governed by capability and hierarchy rules) while keeping **Admin** and **會友基礎** as protected/immutable anchors. This correction is reflected throughout the acceptance trace and the test seams.

## Deterministic gate results

| Gate | Result |
| --- | --- |
| `git diff --check` | PASS on final tree |
| `git status` | PASS (clean) |
| JSON / YAML parse checks | PASS |
| Web typecheck | PASS |
| Root typecheck | PASS |
| Worker typecheck | PASS |
| E2E typecheck | PASS |
| `pnpm --dir web build` | PASS — 18 static routes |

Note: root `pnpm build` is a pre-existing stub script that fails on a known non-Phase-A syntax error; the real web build is the one above and is green.

## Test results

| Surface | Result |
| --- | --- |
| Identity disposable foundation (focused) | 4 files / 57 tests |
| #477 focused components | 3 files / 102 tests |
| #478 focused worker (role-hierarchy) | 5 files / 69 tests |
| `pnpm --dir web test` (full web suite) | 36 files / 540 tests |
| `pnpm --dir web/components test` (full components) | 54 files / 613 tests on rerun (one initial parallel-load focus flake; isolated pass confirms) |
| Shell responsive suite | 92 passed / 1 skipped |
| Shell geometry | 28 assertions |
| Role geometry at 320 / 390 / 600 / 799 / 800 / 1024 / 1440 | 14 assertions |

## Local D1 Playwright verification

- Runtime: isolated `wrangler dev` + D1 persistence, disposable `E2E_`/`E2E_DEMO_` seed.
- Direct Phase A probes: PASS at the responsive matrix above with no horizontal overflow, minimum interactive target `44px`, and rename-mutation probes returning the documented Problem Details for the protected-anchor and self/highest/scope/name/idempotency failure paths.

## Final review

- Phase A final review: READY, no findings.

## Caveats (truthful, not minimised)

- Evidence is **local-only**. No production Cloudflare, Apps Script, or Google Sheets mutation was attempted; this report does not claim a remote deployment.
- Remote CI run and human accessibility / device matrix remain **manual** gates outside this report's evidence.
- Root `pnpm build` is a pre-existing stub with a known syntax error unrelated to Phase A; `pnpm --dir web build` is the real production build and is green.
- Full components suite had **one initial parallel-load focus flake** then 613/613 on rerun; an isolated pass confirms the flake is timing, not contract.
- Numeric role-geometry and shell-geometry assertions have no screenshots attached; their evidence is the assertion log only.

## Verdict

**PHASE A IMPLEMENTED — LOCAL EVIDENCE GREEN; PR #496 OPEN, NO MERGE.**

The Phase A implementation chain (#476, #477, #478 plus the trace correction `f87f2ee2`) is present on `remediate-478` at `8e902b4a`. Deterministic local code gates are green and the final review returned READY with no findings. The grouped child PR #496 is open against PR #473 and has not been merged. No production-readiness claim is made from this report; remote CI and human accessibility/device gates remain manual.
