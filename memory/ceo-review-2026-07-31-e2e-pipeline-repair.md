# CEO Review Summary - EFCC E2E Pipeline Repair Plan

**Date:** 2026-07-31 **Plan:** `docs/superpowers/plans/2026-07-31-e2e-pipeline-repair.md` **Mode:** HOLD SCOPE **Approach:** Approach 2 (Current Plan - all 8 phases, all 3 tickets)

## Strongest Challenges (Top 3)

1. **Anonymous auth model (D5) vs ADR-0012 contradiction** - ADR-0012 claimed a "Google sign-in wall" prevents anonymous browsers from completing `google.script.run` RPCs. Official docs (`ANYONE_ANONYMOUS` = "any user, even if not logged in"; `USER_DEPLOYING` = "runs as owner, no matter who accesses") and code review evidence (RPCs return AUTH_REQUIRED/UNAVAILABLE, not transport failures) contradict this. **Resolved:** D5 confirmed correct. ADR-0012's claim is a misdiagnosis (real failure was spreadsheet access, not Google auth). Task 8.3 must document this with doc citations.

2. **Fixture crash recovery** - If CI runner is hard-killed between seed and restore, DEV Sheet is polluted with hostile test data. **Resolved:** Add standalone `fixture-reset.ts` (writes known-good baseline) + smart teardown (detects missing snapshot, falls back to reset) + separate CI step with `if: always()` for hard-killed runners. Playwright docs confirm teardown runs even when setup fails.

3. **`api_authorizedNavigate` race condition** - Client could briefly render unauthorized section before FORBIDDEN response arrives. **Resolved:** Tiered auth model - server check only for security-guarded sections (scanner, care, permissions). Server flags `requiresServerAuth: boolean` per section in bootstrap DTO. Client waits for server response before rendering guarded sections. Member-accessible sections (profile, programs, events) use client-side check only.

## Plan Amendments Approved

| # | Issue | Amendment |
| --- | --- | --- |
| 1.1 | D5 vs ADR-0012 | D5 confirmed. Add doc citations to Task 8.3. ADR-0012's "sign-in wall" claim is contradicted by official docs. |
| 1.2 | Fixture crash recovery | Add `fixture-reset.ts` standalone script. Smart teardown detects missing snapshot, falls back to reset. Separate CI step with `if: always()`. |
| 1.3 | `<dialog>` in IFRAME | Tests assert behavior (focus, Escape, inert), not implementation. Fallback to enhanced custom `<div>` if IFRAME smoke test fails. |
| 1.4 | Test credential mismatch | Keep real users (alice/bob/noah). Fixture manager seeds E2E_-prefixed rows in Programs and Program_Leaders tabs (hostile content, test assignments). Users tab never mutated. |
| 1.5 | Navigation auth race | Tiered: server check only for guarded sections (scanner, care, permissions). `requiresServerAuth` flag in bootstrap DTO. Client waits for server on guarded sections only. |
| 2.1 | Teardown with no snapshot | Smart teardown: checks for snapshot file. If absent, runs `fixture-reset.ts`. Setup writes failure marker. Mid-seed failure -> always reset. |
| 2.2 | Broken deployment = 50 timeouts | Move deployment smoke test (assert SIGNED_OUT) into setup project. If it fails, all acceptance tests skipped via Playwright dependency check. One clear failure message. |
| 8.1 | Script Properties accumulation | After returning idempotent result, scan `demoform_*` keys under lock, `deleteProperty()` entries older than 60s. |

## Accepted Scope

- All 8 phases (0-8) of the current plan
- All 38 acceptance criteria across #69 (12), #70 (13), #71 (13)
- All 21 grilling decisions, doc-validated via Context7 and official sources
- Amendments listed above integrated into the plan

## Deferred

- Parallel test workers (explicitly deferred in plan - `workers: 1` for now)
- Multi-environment Apps Script projects (separate operational plan)
- Production monitoring via StackDriver (future work)
- Real domain write RPCs (deferred to #53 and later tickets)

## NOT In Scope

- Production deployment (DEV/acceptance only)
- Multi-browser E2E (Chromium only per ADR-0012)
- English language support (Traditional Chinese only)
- Server-side CSP or HTTP header control (Apps Script limitation)
- Domain-owned rebuild (`docs/specs/domain-owned-rebuild-acceptance-plan.md` - separate plan)

## Sections Evaluated

| Section | Issues Found | Resolved |
| --- | --- | --- |
| 1. Architecture | 5 issues | All resolved |
| 2. Error & Rescue Map | 2 issues | All resolved |
| 3. Security & Threat Model | No new issues | N/A |
| 4. Data Flow & Edge Cases | No new issues (RAW confirmed safe) | N/A |
| 5. Code Quality | 1 minor (dead code cleanup) | Noted, no decision needed |
| 6. Test Review | No new issues | N/A |
| 7. Observability | 1 minor (rpcLog_ in new RPC) | Noted, no decision needed |
| 8. Database & State | 1 issue (Script Properties accumulation) | Resolved |
| 9. API Design | No new issues | N/A |
| 10. Performance | No new issues | N/A |
| 11. Design & UX | No issues requiring decision | N/A |

## Completion Status

**DONE_WITH_CONCERNS** - All sections evaluated. 8 amendments approved. 3 landmines from Step 0 resolved (D5 confirmed, fixture crash recovery designed, deployment status assumed working). The plan is ready for implementation with the approved amendments integrated.

**Critical pre-implementation gate:** Before Phase 1, confirm that `clasp push` + `clasp deploy` succeed (the domain-owned-rebuild may need to be completed first). Before Phase 5, run the anonymous browser smoke test (open `/exec`, login as alice/1234, confirm READY) to definitively validate D5.
