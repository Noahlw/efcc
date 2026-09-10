# T12 / #517 Programs tracer acceptance trace

**Status:** `IN_PROGRESS — TICKET 00 CONTRACT RECORDED`

**Issue:** [#517](https://github.com/Noahlw/efcc/issues/517)

**Branch:** `codex/t12-issue-517`

**Exact continuing rescue base:**
`eee8ba1872fbb53ffd835063b78e824b8d187e68` (`origin/main`, `main`, and the
new T12 branch at baseline resolution).

**Scope:** a thin dual-authority Programs tracer and rescue-path evidence.
This trace does not change the Programs Screen Catalog, existing T07 PSNs,
domain behavior, authorization, URL semantics, Worker/D1 behavior, mutation
semantics, or Preservation Ledger authority.

## Authority and handoff disposition

Live issue #517 is the current ticket authority. The current repository
authorities are `AGENTS.md`, `TESTING.md`, `CONTEXT.md`, `DESIGN.md`,
`docs/implementation/ui-control-recovery-governance.md`,
`docs/implementation/ui-control-recovery-plan.md`, the Preservation Ledger,
Specs 004 and 086, ADR-0045, and the existing T07–T11 acceptance traces.

The requested `START-HERE.md`, `SPEC.md`, `RECON-EVIDENCE.md`,
`TICKET-GRAPH.md`, and `IMPLEMENT-WORKFLOW.md` handoff files were not present
in the repository, current refs, attachments, or available temporary handoff
locations at baseline. No replacement authority is being invented; the live
issue and current authorities provide the bounded fallback for this ticket.

## Observable acceptance contract

| ID | Given | When | Required observable result | Evidence | Status |
|---|---|---|---|---|---|
| T12-00 | Branch starts at the exact continuing rescue base | Ticket 00 is recorded | Plan and this trace exist before behavior/test-runner changes; first T12 commit is docs-only | Git commit and `git diff` scope | `RECORDED` |
| T12-P01 | Disposable local D1 contains a unique listed `MemberRequest` Program | A real member logs in and opens ordinary `/programs` | Authenticated Programs directory renders from the real Worker/D1 journey | Playwright browser artifact | `PENDING` |
| T12-P02 | The member's real `/api/v1/programs/access` projection has no management capability | Directory settles | `進入管理模式` is absent; no fake Storybook prop can grant it | Browser assertion plus request/response log | `PENDING` |
| T12-P03 | Participant directory contains the disposable Program | Member searches a unique fixture name | Search returns the disposable row | Browser artifact | `PENDING` |
| T12-P04 | Directory has a non-matching query | Member enters a guaranteed impossible query | No-result state is visible and the disposable row is not visible | Browser artifact | `PENDING` |
| T12-P05 | Search is non-empty and no-result state is active | Member clears search/filter | Catalog returns to a usable result state; filter `可報名` is observable and pressed state is truthful | Browser artifact | `PENDING` |
| T12-P06 | Disposable Program is listed and eligible | Member selects the row under `可報名` | Canonical participant transition reaches `/programs?program=<id>` and visible `#program-detail-title` | URL/title assertions | `PENDING` |
| T12-P07 | Detail enrollment is `MemberRequest` | Member requests, admin approves, and member reloads | Existing request, approval, read-back, and cancellation journey remains green | Browser artifact and response statuses | `PENDING` |
| T12-M01 | Disposable local D1 contains a unique manageable Program | A real admin logs in and opens ordinary `/programs` | Real server projection exposes `進入管理模式` | Browser assertion plus access response | `PENDING` |
| T12-M02 | Management entry is visible | Admin clicks it | Canonical URL is `/programs?mode=management`; `管理課程目錄` is visible | URL/title assertions | `PENDING` |
| T12-M03 | Management directory has the disposable Program | Admin searches its unique name | Search returns and opens the selected Program | Browser artifact and URL | `PENDING` |
| T12-M04 | Existing management settings are reachable | Admin edits and reloads | Settings save and read-back remain green; fixture is restored in cleanup | Browser artifact and PATCH status | `PENDING` |
| T12-S01 | Existing production Stories own the three tracer baselines | T12 Storybook runner opens direct iframe URLs | Only `ParticipantDirectory`, `ParticipantProgramDetail`, and `ManagementDirectory` are qualified | Story IDs and catalog declarations | `PENDING` |
| T12-S02 | W7 is exactly the established width set | Chromium runner executes | `320 / 375 / 390 / 414 / 799 / 800 / 1440`, one worker, zero retries, all pass | `test-results/t12-programs-storybook/storybook.json` | `PENDING` |
| T12-S03 | Existing production locators are stable | Storybook renders each baseline | Directory row, `#program-detail-title`, and `#programs-management-directory-title` are visible; shell geometry has no overflow | Direct locator assertions | `PENDING` |
| T12-S04 | Presentation review covers shell transition risk | Rendered Stories are inspected | `390`, `799`, and `800` are visually inspected; no fake permission authority is inferred | Screenshots/review notes | `PENDING` |
| T12-R01 | Programs contract and responsive suites remain unchanged in authority | Qualification runs | Worker Contract, responsive, build/index, fast/precommit, Programs verification, and census outcomes are recorded truthfully | Command artifacts | `PENDING` |
| T12-R02 | Census includes deferred Programs records | Census JSON is inspected | CEN-026 and CEN-059–CEN-068 remain separately dispositioned; T13–T16 debt is not absorbed | Census JSON and notes | `PENDING` |
| T12-A01 | Current-main merge base is fixed | Standards and Spec review runs | Review uses actual live-main merge base and resolves every real in-scope finding | Review record | `PENDING` |
| T12-A02 | Fresh evidence compares both rescue paths | Final decision is written | Preservation, ownership/locality, composability, regression confidence, lineage, rollback/reviewability, and failure attribution are explicit; loser is rejected | Final trace section | `PENDING` |
| T12-A03 | Machine evidence is complete but human design approval is not automated | T12 closes | Exactly one `PATH_PROPOSED ... READY_FOR_OWNER_L2` result is reported; no approval, merge, T13 authorization, or `STACK_GREEN` is claimed | Final report / PR | `PENDING` |

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

## Rescue-path rubric (to complete after fresh evidence)

| Dimension | SALVAGE STACK evidence | SELECTIVE REPLAY evidence | T12 conclusion |
|---|---|---|---|
| Preservation | Current deep Programs behavior remains the preserved seam | URL/authz/Worker/mutation stay preserved while only proven presentation seams replay | `PENDING` |
| Ownership/locality | Existing module ownership is repairable locally | Fresh evidence proves non-local ownership cannot be repaired locally | `PENDING` |
| Composability with T08–T11 | Incremental rescue composes with existing controls, overlays, shell | Replay is bounded to named presentation/composition modules | `PENDING` |
| Regression confidence | Existing characterization plus focused tracer and W7 evidence | Expand → migrate → prove → contract adds confidence without widening scope | `PENDING` |
| Code lineage | Continues from current main/T12 ancestry | Also continues from current main/T12 ancestry; no old-stack restoration | `PENDING` |
| Rollback/reviewability | Small tracer commits and existing production seams are easy to revert | Named replay modules and checkpoints are independently reviewable | `PENDING` |
| Evidence/failure attribution | Failures map to existing seams and selective boundaries | Replay is chosen only when it improves attribution materially | `PENDING` |

If both paths remain viable, the default proposal is `SALVAGE STACK`. A
`SELECTIVE REPLAY` proposal requires direct fresh evidence for non-local
ownership, shotgun change, interface widening, poor rollback, or poor failure
attribution that local repair cannot address. No path may weaken preserved
contracts or promote a synthetic Storybook permission state into real authority.

## Review and owner boundary

This is a machine-candidate trace for human L2 review. It cannot itself create
approval, `PATH_APPROVED`, `STACK_GREEN`, merge readiness, T13 authorization,
or a release claim. The final T12 status must stop at:

```text
T12 MACHINE_GREEN — PATH_PROPOSED: <SALVAGE STACK|SELECTIVE REPLAY> — READY_FOR_OWNER_L2
```

