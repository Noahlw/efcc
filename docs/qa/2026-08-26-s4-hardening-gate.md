# S4 Hardening Integration Gate — 2026-08-26

## Verdict

**S4 HARDENING AUTOMATION GREEN — RELEASE CONDITIONAL**

The local Worker/D1 implementation and the responsive browser gate pass. This
does not declare production READY: promotion still requires the operator's
separate device/network smoke and review of the deferred owner decisions.

## Scope and provenance

- Worktree: `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/s4-management-implementation`
- Final branch: `feat/s4-11-integration-gate`
- Stack: `#457 → #458 → #469 → #470 → #471 → #472`
- Base reference for similarity: `main @ 83fafdb813db62fa530ddd2bddcecf60571763ec`
- Local D1: `/tmp/s4-hardening-verify-20260826`
- Browser target: `http://127.0.0.1:8794`
- Screenshot evidence: [`docs/qa/screenshots/s4-hardening/`](./screenshots/s4-hardening/)

Only S4 management surfaces were in scope: Management hub navigation, Account
Directory, Account & Permissions, and Registration Approvals. Custom roles,
role assignment/reordering, and other Discord-only affordances remain S4.1
(#468), not hidden behind speculative controls.

## H-01–H-40 coverage

| Contract | Evidence | Result |
| --- | --- | --- |
| H-01–H-03 | Shared Back/action header, phone dock offset, safe-area CSS; 10-width geometry probe | PASS |
| H-04–H-07 | Account Directory populated default, search/filter, progressive 50+1 page, read-only detail | PASS |
| H-08–H-13 | Role-first fixed Admin/Staff/Member list, origin-aware Back, scoped Staff account projection | PASS |
| H-14–H-18 | Role Detail contains only summary, Permissions, Assigned Accounts, and safety constraints | PASS |
| H-19–H-23 | Assigned Accounts read-only; grouped searchable policy, staged CAS review, high-risk consequences | PASS |
| H-24–H-26 | Pending/Processed separation, detail-only single actions, explicit rejection reason/confirmation | PASS |
| H-27–H-31 | Explicit selection lifecycle, all-item review tray, Select All current filtered rows, capped batch confirmation | PASS |
| H-32–H-36 | Atomic D1 batch, stale conflict/no partial writes, actor/key idempotency, credential-free audit, 100-item limit | PASS |
| H-37–H-38 | 320/375/390/414/600/799/800/1024/1440/1920 responsive matrix | PASS |
| H-39–H-40 | Fresh DOM screenshots for loading, empty, error, forbidden, busy, selection, confirmation, conflict, read-only, role, and directory states plus no-overflow/44px/focus assertions | PASS |

## Findings and repairs

| Severity | Finding | Repair/evidence |
| --- | --- | --- |
| P1 | Queue had no first-level origin-aware Back | Queue now uses `ManagementPageHeader` and `safeManagementReturnHref`; canonical and settings-origin browser probes pass. |
| P1 | 51 selected approvals exceeded D1 batch statement ceiling | `approveRegistrationsBatch` now uses four bulk statements (guard, account insert, audit insert, CAS update); 51-record browser proof passes. |
| P1 | Queue detail links and selection tray were too small/truncated | Links are 44px with visible chevrons; tray renders every selected item with individual removal. |
| P1 | Forbidden states lacked heading/focus | Queue and detail forbidden branches have landmarks and focus movement. |
| P2 | Phone filter/apply action sat below the navigation dock | Shared sheet z-index and sticky offset were corrected; 10-width geometry gate passes. |
| P2 | Role values and baseline styling drifted from Civic Minimal | Role labels use centralized Traditional Chinese copy; 會友基礎 is neutral, fixed, and non-editable. |
| P2 | Permission groups were over-expanded and review lacked consequences | Initial accordion density is compact; matching search expands groups; high-risk changes show consequence copy. |
| P2 | Long applicant names and pending state treatment were fragile | Confirmation/row text wraps anywhere; pending status uses neutral civic treatment. |

## Verification

| Command/probe | Result |
| --- | --- |
| `pnpm --dir web typecheck` | PASS |
| `pnpm --dir web test:components` | PASS — 49 files / 571 tests |
| `pnpm --dir web build` | PASS — 18 static routes |
| Worker auth regression + batch tests | PASS — 53 tests (47 existing + 6 batch) |
| `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json` | PASS |
| `pnpm exec ultracite check` (new S4 E2E files) | PASS — formatting/rules clean |
| `git diff --check` | PASS |
| Impeccable detector on S4 permissions/approval surfaces | PASS — `[]` |
| `tests/e2e/s4-management-hardening.config.ts` local D1 gate | PASS — 80 cases, 28 executed/pass, 52 intentional width/scope skips; `.last-run.json` = `passed` |
| Screenshot matrix | 46 fresh frames across required widths and material management states under `docs/qa/screenshots/s4-hardening/` |

The repository has pre-existing Ultracite rule debt in older source/test files;
this gate did not mass-reformat unrelated code. No new source formatting failure
was used to weaken a contract assertion.

## Deferred owner decisions

- S4.1 / Wayfinder custom Roles, assignment, reorder, and role editor (#468).
- Any Discord-only Role Style/Color/Links/Mention affordance.
- Production promotion and the separately recorded real-device/network smoke.

## Preservation proof

- Existing stack parents remain intact and open: #457, #458, #469, #470, #471.
- The prototype remains isolated at branch `prototype/s4-discord-hardening`
  (HEAD `74ccd49`) and was not edited by the production agents.
- Production changes are limited to the management action framework, permission
  and approval surfaces/tests, the additive batch backend already carried by
  #470, the S4 E2E gate, this report, and its screenshot evidence. No main
  worktree files, `/events`, `/management` unrelated modules, S7 behavior, or
  parked owner features were changed.
