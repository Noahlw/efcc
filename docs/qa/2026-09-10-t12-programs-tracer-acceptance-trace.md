# T12 / #517 Programs tracer acceptance trace

**Status:** `T12 MACHINE_GREEN — PATH_PROPOSED: SALVAGE STACK — READY_FOR_OWNER_L2`

**Issue:** [#517](https://github.com/Noahlw/efcc/issues/517)

**Branch:** `codex/t12-issue-517`

**Exact continuing rescue base:**
`eee8ba1872fbb53ffd835063b78e824b8d187e68` (`origin/main`, `main`, and the
new T12 branch at baseline resolution).

**Scope:** a thin dual-authority Programs tracer and rescue-path evidence.
This trace does not change the Programs Screen Catalog, existing T07 PSNs,
domain behavior, authorization, URL semantics, Worker/D1 behavior, mutation
semantics, or Preservation Ledger authority.

**Reviewed implementation candidate:**
`de287156ce8b380fc3c22b304417e66a6a3e1659` (the current participant and
management tracer implementation, including fixture-boundary and cleanup
hardening; the acceptance trace remains documentation-only on top of it).

## Authority and handoff disposition

Live issue #517 is the current ticket authority. The current repository
authorities are `AGENTS.md`, `TESTING.md`, `CONTEXT.md`, `DESIGN.md`,
`docs/implementation/ui-control-recovery-governance.md`,
`docs/implementation/ui-control-recovery-plan.md`, the Preservation Ledger,
Specs 004 and 086, accepted ADR-0046, and the existing T07–T11 acceptance
traces. ADR-0045 is retained only as historical rationale because ADR-0046
supersedes its delivery architecture.

The requested `START-HERE.md`, `SPEC.md`, `RECON-EVIDENCE.md`,
`TICKET-GRAPH.md`, and `IMPLEMENT-WORKFLOW.md` handoff files were not present
in the repository, current refs, attachments, or available temporary handoff
locations at baseline. No replacement authority is being invented; the live
issue and current authorities provide the bounded fallback for this ticket.

## Observable acceptance contract

| ID | Given | When | Required observable result | Evidence | Status |
|---|---|---|---|---|---|
| T12-00 | Branch starts at the exact continuing rescue base | Ticket 00 is recorded | Plan and this trace exist before behavior/test-runner changes; first T12 commit is docs-only | Git commit and `git diff` scope | `RECORDED` |
| T12-P01 | Disposable local D1 contains a unique listed `MemberRequest` Program | A real member logs in and opens ordinary `/programs` | Authenticated Programs directory renders from the real Worker/D1 journey | `test-results/programs-browser-acceptance/20260910t064726713z/browser-results.json`, 2/2 | `PASS` |
| T12-P02 | The member's real `/api/v1/programs/access` projection has no management capability | Directory settles | `進入管理模式` is absent; no fake Storybook prop can grant it | Participant response assertion in `test-results/programs-browser-acceptance/20260910t064726713z/browser-results.json` | `PASS` |
| T12-P03 | Participant directory contains the disposable Program | Member searches a unique fixture name | Search returns the disposable row | `test-results/programs-browser-acceptance/20260910t064726713z/browser-results.json` | `PASS` |
| T12-P04 | Directory has a non-matching query | Member enters a guaranteed impossible query | No-result state is visible and the disposable row is not visible | `test-results/programs-browser-acceptance/20260910t064726713z/browser-results.json` | `PASS` |
| T12-P05 | Search is non-empty and no-result state is active | Member clears search/filter | Catalog returns to a usable result state; filter `可報名` is observable and pressed state is truthful | `test-results/programs-browser-acceptance/20260910t064726713z/browser-results.json` | `PASS` |
| T12-P06 | Disposable Program is listed and eligible | Member selects the row under `可報名` | Canonical participant transition reaches `/programs?program=<id>&from=programs` and visible `#program-detail-title` | Exact href/URL and title assertions in `test-results/programs-browser-acceptance/20260910t064726713z/browser-results.json` | `PASS` |
| T12-P07 | Detail enrollment is `MemberRequest` | Member requests, admin approves, and member reloads | Existing request, approval, read-back, and cancellation journey remains green | `test-results/programs-browser-acceptance/20260910t064726713z/browser-results.json`; POST 201, decision 200, cancellation/read-back pass | `PASS` |
| T12-M01 | Disposable local D1 contains a unique manageable Program | A real admin logs in and opens ordinary `/programs` | Real server projection exposes `進入管理模式` | Management response assertion in `test-results/programs-browser-acceptance/20260910t064726713z/browser-results.json` | `PASS` |
| T12-M02 | Management entry is visible | Admin clicks it | Canonical URL is `/programs?mode=management`; `管理課程目錄` is visible | URL/title assertions in `test-results/programs-browser-acceptance/20260910t064726713z/browser-results.json` | `PASS` |
| T12-M03 | Management directory has the disposable Program | Admin searches its unique name | Search returns and opens the selected Program | `test-results/programs-browser-acceptance/20260910t064726713z/browser-results.json`; canonical URL assertion | `PASS` |
| T12-M04 | Existing management settings are reachable | Admin edits and reloads | Settings save and read-back remain green; disposable fixture is archived in cleanup | `test-results/programs-browser-acceptance/20260910t064726713z/browser-results.json`; PATCH/read-back/cleanup pass | `PASS` |
| T12-S01 | Existing production Stories own the three tracer baselines | T12 Storybook runner opens direct iframe URLs | Only `ParticipantDirectory`, `ParticipantProgramDetail`, and `ManagementDirectory` are qualified | Existing IDs `t07-3-programs--participant-directory`, `t07-3-programs--participant-program-detail`, `t07-3-programs--management-directory` | `PASS` |
| T12-S02 | W7 is exactly the established width set | Chromium runner executes | `320 / 375 / 390 / 414 / 799 / 800 / 1440`, one worker, zero retries, all pass | `tests/e2e/test-results/t12-programs-storybook/storybook.json`; 21/21, 7 projects, 1 worker, 0 retries | `PASS` |
| T12-S03 | Existing production locators are stable | Storybook renders each baseline | Directory row, `#program-detail-title`, and `#programs-management-directory-title` are visible; shell geometry has no overflow | T12 Storybook runner direct locator/geometry assertions | `PASS` |
| T12-S04 | Presentation review covers shell transition risk | Rendered Stories are inspected | `390`, `799`, and `800` are visually inspected; no fake permission authority is inferred | AI visual self-review of all three baselines at those widths; no production presentation defect found | `PASS` |
| T12-R01 | Programs contract and responsive suites remain unchanged in authority | Qualification runs | Worker Contract, responsive, build/index, fast/precommit, Programs verification, and census outcomes are recorded truthfully | Promotion `test-results/programs-promotion/20260910t065658650z/promotion.json` is `functional-passed` at `de287156ce8b380fc3c22b304417e66a6a3e1659`; census limitation is separately recorded in T12-R02 | `PASS_WITH_SEPARATE_CENSUS_LIMITATION` |
| T12-R02 | Census includes deferred Programs records | Census JSON is inspected | CEN-026 and CEN-059–CEN-068 remain separately dispositioned; T13–T16 debt is not absorbed | T10 disposition table keeps these rows `DEFERRED_TO_ROUTE_FAMILY`; required command is blocked before JSON because its deleted historical parent ref is hard-coded | `DEFERRED — TOOLING BLOCKED` |
| T12-A01 | Current-main merge base is fixed | Standards and Spec review runs | Review uses actual live-main merge base and resolves every real in-scope finding | `origin/main` resolves to `eee8ba1872fbb53ffd835063b78e824b8d187e68`; final two-axis review of `origin/main...HEAD` found no unresolved hard in-scope finding | `PASS` |
| T12-A02 | Fresh evidence compares both rescue paths | Final decision is written | Preservation, ownership/locality, composability, regression confidence, lineage, rollback/reviewability, and failure attribution are explicit; loser is rejected | Completed rubric below; no evidence met the selective-replay threshold | `PASS` |
| T12-A03 | Machine evidence is complete but human design approval is not automated | T12 closes | Exactly one `PATH_PROPOSED ... READY_FOR_OWNER_L2` result is reported; no approval, merge, T13 authorization, or `STACK_GREEN` is claimed | This trace and final handoff; owner spot-check/L2 remain open | `PASS` |

## Preservation constraints

- Preserve canonical Programs URL construction and deep-link/back semantics.
- Preserve server-owned capability projection and authorization; browser
  visibility is not authority.
- Preserve D1/Worker domain, enrollment, audit, idempotency, mutation, and
  cleanup semantics.
- Preserve existing Screen Catalog identities and PSNs, including the three
  T07 Programs baselines used by this tracer.
- Preserve the existing W7 widths and zero-tolerance runner policy; no skips,
  tolerances, or baseline weakening is permitted.
- Keep B-003 and the Preservation Ledger's `PRESERVE_AND_AUDIT` Programs rows
  separately reported.

## Rescue-path rubric

| Dimension | SALVAGE STACK evidence | SELECTIVE REPLAY evidence | T12 conclusion |
|---|---|---|---|
| Preservation | No production code changed; real URL/authz/Worker/D1/mutation behavior remains covered by the existing seams and new assertions. | Would preserve those contracts while replacing only a proven presentation seam. | SALVAGE preserves every contract with zero replay risk; no replay evidence exists. |
| Ownership/locality | Existing `ParticipantDirectory`, `ParticipantProgramDetail`, and `ManagementDirectory` seams expose bounded props and existing locators; no T12 defect required a cross-module repair. | Requires fresh proof of non-local ownership or a presentation seam that cannot be repaired locally. | SALVAGE; the threshold was not met. |
| Composability with T08–T11 | New evidence composes with the existing shell, controls, Screen Catalog, PSNs, Worker contract, and responsive gates without touching their ownership. | Could be bounded to named presentation modules, but no such module needs replay. | SALVAGE; additive tracer is the smaller composable change. |
| Regression confidence | 2 real browser tests, Worker Contract, 6 responsive checks, 21 Storybook W7 checks, full precommit and promotion all pass at the source candidate. | Expand → migrate → prove → contract would add a new migration surface and is unnecessary without a defect. | SALVAGE has higher current confidence. |
| Code lineage | Continues directly from current `main` at `eee8ba18`; commits are docs → participant tracer → management tracer. | Must also continue from current `main`; old Phase-F/S4 restoration is prohibited. | SALVAGE; no old branch/ref was merged, cherry-picked, rebased, or restored. |
| Rollback/reviewability | Each ticket has a focused commit; reverting the tracer assertions/runner is isolated and production behavior is unchanged. | Named replay checkpoints would be reviewable, but would enlarge the rollback surface. | SALVAGE; easiest rollback and owner review. |
| Evidence/failure attribution | Assertions map directly to real Worker/D1 authority, route URLs, mutation statuses, and existing Story locators; failure ownership is explicit. | Replay is justified only if it improves attribution materially. | SALVAGE; no attribution gap was found. |

If both paths remain viable, the default proposal is `SALVAGE STACK`. A
`SELECTIVE REPLAY` proposal requires direct fresh evidence for non-local
ownership, shotgun change, interface widening, poor rollback, or poor failure
attribution that local repair cannot address. No path may weaken preserved
contracts or promote a synthetic Storybook permission state into real authority.

**Losing-path rejection:** `SELECTIVE REPLAY` is rejected for T12 because the
fresh diff contains no production presentation/composition change and no
non-local ownership, shotgun change, interface widening, rollback, or failure
attribution defect. Replay would add migration and rollback surface without a
proven benefit. If later Programs evidence crosses that threshold, the named
presentation module must be handled by `expand → migrate → prove → contract`
from this same rescue base; this T12 proposal does not pre-authorize it.

**Approved replay modules:** none.

**Rollback strategy:** revert the T12 commits in reverse order, or revert the
individual participant/management tracer commit while retaining the Ticket 00
contract. Production behavior is unchanged, so rollback does not require a
Worker/D1 or URL migration.

## Qualification ledger

All commands used Node `22.18.0` because Node 20 cannot load `node:sqlite`.
The promotion run temporarily stashed and restored the pre-existing dirty
`web/.storybook/public/mockServiceWorker.js` only to satisfy the clean-worktree
precondition; that file is not part of T12 and remains untouched in the final
worktree. The Storybook build output was moved to
`/private/tmp/efcc-t12-storybook-static-20260910-final` after verification so it
does not become a worktree artifact.

| Command | Result | Evidence |
|---|---|---|
| `pnpm test:t12:programs-storybook` | PASS, 21/21 | `tests/e2e/test-results/t12-programs-storybook/storybook.json`; exact W7, 1 worker, 0 retries; fresh run started `2026-09-10T06:46:51.404Z` |
| `pnpm test:programs:browser` | PASS, 2/2 | `test-results/programs-browser-acceptance/20260910t064726713z/browser-results.json`; target `http://127.0.0.1:64143`, Chromium `phone-390`, 1 worker, 0 retries |
| `pnpm test:programs:contract` | PASS, 1/1 | Direct contract run passed; promotion also records `test-results/programs-promotion/20260910t065658650z/worker-contract.log` |
| `pnpm test:programs:responsive` | PASS, 6/6 | `test-results/programs-responsive/20260910t064806664z/responsive-results.json`; 320/390/1280 matrix, 1 worker, 0 retries |
| `pnpm --dir web storybook:build` | PASS | Storybook 10.6.0 build completed; generated output moved to `/private/tmp/efcc-t12-storybook-static-20260910-final` |
| `pnpm --dir web storybook:verify-index` | PASS | 60 Stories / 35 Screen Catalog obligations; all baselines resolvable |
| `pnpm verify:fast` | PASS | Root and `web/` typecheck |
| `pnpm verify:precommit` | PASS | Root 606 tests, web component 924 tests, governance audit 0 active violations (339 files scanned) |
| `pnpm verify:programs` | PASS, `functional-passed` | `test-results/programs-promotion/20260910t065658650z/promotion.json`; all four finite stages passed at revision `de287156ce8b380fc3c22b304417e66a6a3e1659`; B-003 remains OPEN/not run |
| `node scripts/t09-frontier-census.mjs --json` | BLOCKED before JSON | Hard-coded `rescue/t08-control-contracts` ref is absent and expected SHA `6ab0561f` is not in this current-main clone; no old ref was recreated or restored |

The first direct `pnpm verify:programs` attempt under Node 20 failed at
`node:sqlite`; it was rerun under the required Node 22.18.0 and passed. An
earlier clean promotion attempt also captured a single Miniflare
`Network connection lost` response: the enrollment POST was `201`, followed by
a `500` participant-detail refresh. The fresh clean promotion at
`20260910t065658650z` reproduced neither the response failure nor the UI
symptom; both browser tests passed with zero retries. The promotion
clean-worktree gate was satisfied by stashing only the preserved generated
dirty files and restoring them immediately after the run.

## Census and preservation disposition

The required census command cannot currently emit JSON because its T09-era
script resolves a deleted local branch before it computes records. This is a
pre-existing census-tooling limitation, not a T12 production or lineage
failure. The committed T10 disposition was inspected directly: `CEN-026` and
`CEN-059`–`CEN-068` remain `DEFERRED_TO_ROUTE_FAMILY` for T13–T16 Programs
owners. They are not absorbed into this tracer. Programs Preservation Ledger
rows C-05, C-07, C-13, and C-18–C-20 remain `PRESERVE_AND_AUDIT`; B-003 remains
separately `OPEN`.

## Review and owner boundary

This is a machine-candidate trace for human L2 review. It cannot itself create
approval, `PATH_APPROVED`, `STACK_GREEN`, merge readiness, T13 authorization,
or a release claim. The final T12 status must stop at:

```text
T12 MACHINE_GREEN — PATH_PROPOSED: SALVAGE STACK — READY_FOR_OWNER_L2
```

## Two-axis review

**Fixed point:** `origin/main` → `eee8ba1872fbb53ffd835063b78e824b8d187e68`.
The review diff is `git diff origin/main...HEAD`; it contains only the Ticket
00 plan/trace, participant and management browser assertions, the T12
Storybook W7 config/spec, fixture cleanup hardening, and one root package
script. No production app or component file is changed.

- **Standards:** PASS. No hard documented-standard violation remains; the
  runner uses the existing Playwright/worktree pattern, one worker/zero
  retries, direct production Story IDs, and does not weaken a baseline, skip,
  tolerance, waiver, or contract. Review-only judgement notes (not blockers)
  are duplicated `/api/v1/programs/access` assertions, a mirrored Storybook
  shell helper, width parsing from the encoded project name, and empty-string
  partial-fixture sentinels.
- **Spec:** PASS. The participant and management journeys prove the required
  real `/api/v1/programs/access` projection, ordinary `/programs` route,
  search/no-result/filter/detail transition, existing enrollment/settings
  mutations, and cleanup. The W7 runner qualifies only the three existing
  production baselines. The census limitation is disclosed rather than
  hidden, and no T13–T16 scope or fake permission authority is introduced.

No Firefox/WebKit ceremony was added because T12 changed no production
presentation/composition code. The AI visual self-review at 390/799/800 is
complete; the owner Storybook spot-check and human L2 design decision remain
the explicit next step.

## Final handoff

**T12 MACHINE_GREEN — PATH_PROPOSED: SALVAGE STACK — READY_FOR_OWNER_L2**

- **Branch:** `codex/t12-issue-517`
- **Continuing rescue base:** `eee8ba1872fbb53ffd835063b78e824b8d187e68`
- **Commits:** `882c4c32` Ticket 00 contract; `a0029045` participant tracer;
  `2d00cabb` management tracer; `3432289a` qualification trace;
  `a56f3e0c` participant fixture boundary; `59ad1935` fixture-cleanup
  hardening; `de287156` disposable fixture closure. The final trace update is
  documentation-only on top of this implementation candidate.
- **Production defects found/repaired:** none; zero production-code diff.
- **Owner L2 focus:** confirm the three existing Programs baselines at
  390/799/800, decide whether the disclosed stale T09 census tool needs a
  separate maintenance ticket, and accept/reject the SALVAGE STACK proposal.

The implementation agent does not claim `PATH_APPROVED`, `STACK_GREEN`, merge
readiness, T13 authorization, human approval, or release safety.
