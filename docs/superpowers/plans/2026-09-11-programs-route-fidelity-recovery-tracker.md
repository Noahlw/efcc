# Programs Route Fidelity Recovery Tracker Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. <!-- Note: subagent-driven-development and executing-plans skills are not available -->

**Goal:** Recover the local PR #607 candidate from `NOT_ROUTE_GREEN` to a fully evidenced machine candidate whose production `/programs` routes and route-backed Stories faithfully replay the frozen Programs prototypes, then stop at `WAITING_OWNER_L2`.

**Architecture:** Preserve the production-owned `ProgramsRouteSurface` and the existing route/domain contracts. Repair the candidate through eight sequential, one-context task packets: restore semantics, make fixtures truthful, close the known presentation gaps, exercise participant and management behavior seams, build deterministic visual evidence, then run an immutable fixed-point qualification. This file is the single source of truth for current task ownership and status; packet files hold only task-local procedure and append-only checkpoints.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind/CVA Screen Foundations, Storybook 10 with `@storybook/nextjs-vite`, MSW 2, Vitest/Testing Library, Playwright, Cloudflare Worker/D1, pnpm 11, Node.js 22.18.0.

## Global Constraints

- Work only in `/Users/noah.wong/Desktop/code/efcc` on `codex/programs-screen-foundations/wave-3` unless the user explicitly changes the target.
- The original execution-start SHA remains `9ad90d253bfd50bf2bbcea85f39c18c1587b1f88`; all final fixed-point review and candidate diff claims cover that SHA through the exact candidate HEAD recorded when R8 starts.
- The audited recovery anchor is clean local HEAD `51baa5d28c2f73b690827f13f2af628933ce3b74`, five commits ahead of remote PR #607 head `9ad90d253bfd50bf2bbcea85f39c18c1587b1f88`. After this planning turn, the expected dirty state is only this master file and its eight untracked packet files. Re-read live branch, remote, PR, issue, CI, and dirty-worktree state before claiming R1.
- Preserve the five existing local commits. Add one append-only logical commit per recovery packet. Keep PR #607 based on `codex/programs-screen-foundations/wave-2`; preserve PRs #603, #604, and #606.
- Local implementation and verification are in scope. Push, PR-body mutation, merge, issue closure, `gap: null`, approval, and release remain outside this plan without fresh explicit authority.
- `docs/design/programs-screen-foundations-v1/*.html` controls presentation hierarchy, density, information architecture, and the workflows it explicitly depicts. Server-shaped data, authorization, URL/history, mutation, conflict, retry, audit, idempotency, enrollment, event, and schedule contracts remain authoritative.
- Preserve `ProgramsRouteSurface`, `ProgramsBoundary`, `WorkspaceRouteProvider`, `ScreenPageFrame`, `ScreenHeader`, `ScreenSection`, `ScreenRow`, `ScreenState`, `ScreenStatus`, and `ScreenEditor`. Reuse the existing API clients and error-copy mapping.
- Retain the ten existing Programs baseline exports, Story IDs, Screen IDs, PSNs, and `ISSUE-#601` gaps. Supporting material Stories remain outside the Screen Catalog baseline manifest.
- Primary visual viewports are `402x874` and `360x800`. W7 regression widths remain `320`, `390`, `600`, `799`, `800`, `1024`, and `1440`.
- Run application and test commands through `fnm exec --using 22.18.0`.
- Every behavior change starts with a regression assertion that fails against the current code for the intended reason. Make the smallest responsible change, then run focused green and the packet gate.
- Repository-standard code carries no lint suppression. Refactor the scenario dispatcher into named maps/helpers rather than retaining the current complexity waiver.
- Preserve unrelated dirty work. If live HEAD, base, remote, PR state, or overlapping dirty files differ from the ledger, record the mismatch and stop before editing.
- Status language is exact: `CHANGES_REQUIRED / NOT_ROUTE_GREEN` until every R8 machine gate and fixed-point review is green; `WAITING_OWNER_L2` only after that. Machine evidence never implies owner approval.

## File Structure & Changes

### Tracker files created by this plan

| File | Responsibility |
| --- | --- |
| `docs/superpowers/plans/2026-09-11-programs-route-fidelity-recovery-tracker.md` | Sole mutable task ledger, global constraints, cold-resume protocol, and final completion gate |
| `docs/superpowers/plans/programs-route-fidelity-recovery/R1-navigation-semantics.md` | Navigation landmark versus local-tab semantics recovery |
| `docs/superpowers/plans/programs-route-fidelity-recovery/R2-truthful-route-fixtures.md` | Dense Cantonese baseline data, correct scenario dispatch, and Story wiring |
| `docs/superpowers/plans/programs-route-fidelity-recovery/R2A-shared-shell-fidelity.md` | Frozen mobile Programs Bottom Nav treatment and role-specific destinations |
| `docs/superpowers/plans/programs-route-fidelity-recovery/R3-directory-and-copy-fidelity.md` | Compact Department Settings action/picker and Schedule copy correction |
| `docs/superpowers/plans/programs-route-fidelity-recovery/R4-participant-behavior-plays.md` | Participant, mode-switch, Event gate, Back, and Department Settings behavior evidence |
| `docs/superpowers/plans/programs-route-fidelity-recovery/R5-schedule-recovery-plays.md` | Events-to-Schedule and focused/stale/partial/resume behavior evidence |
| `docs/superpowers/plans/programs-route-fidelity-recovery/R6-settings-notifications-plays.md` | Settings dirty/conflict and Notifications retry/mark-read behavior evidence |
| `docs/superpowers/plans/programs-route-fidelity-recovery/R6A-settings-back-interception.md` | Bounded production repair for focused Settings Back interception through the shared ScreenHeader |
| `docs/superpowers/plans/programs-route-fidelity-recovery/R7-visual-evidence-harness.md` | Deterministic actual/frozen capture, geometry manifest, and contact-sheet harness |
| `docs/superpowers/plans/programs-route-fidelity-recovery/R8-fixed-point-qualification.md` | Full gates, durable visual evidence, base reproduction, fixed-point review, and QA truth |
| `docs/superpowers/plans/programs-route-fidelity-recovery/R8B-residual-acceptance-evidence.md` | Bounded Schedule/Notifications Play evidence repair after the R8 fixed-point review |

### Production and evidence ownership

| Packet | Primary files | Responsibility |
| --- | --- | --- |
| R1 | `web/lib/screen-foundations.tsx`, `web/lib/programs/workspace-participants-task.tsx`, focused component/E2E tests | Restore workspace `navigation`/`link` semantics while preserving explicit local `tablist`/`tab` behavior |
| R2 | `web/.storybook/programs-fixtures.ts`, route Story files, Story contracts, T11 | Replace sparse English/year-2099 data; fix scenario meanings and baseline handler selection |
| R2A | `web/app/globals.css`, `web/lib/shell/shell-breakpoint.test.tsx`, shell geometry tests if required | Match the frozen phone Bottom Nav indicator treatment while preserving role-specific destinations and desktop rail behavior |
| R3 | `web/lib/programs/management-directory.tsx`, `web/lib/copy.ts`, focused tests | Remove the persistent scope-launcher row, add one compact Department Settings action/picker, use `新增規則` |
| R4 | participant material Stories, stateful MSW handlers, Story/T11 contracts | Prove mode switch, Back, enroll/cancel/withdraw, Event CTA gate, and Department Settings selection |
| R5 | Schedule/Events material Stories and focused production/tests if red | Prove Events entry, editor Back, preview, stale recovery, partial generation, and resume |
| R6 | Settings/Notifications material Stories and focused production/tests if red | Prove dirty-state handling, conflict recovery, retry, unread state, and mark-read |
| R7 | dedicated Playwright visual spec/config and root script | Generate 11-case actual/frozen evidence without production or dependency changes |
| R8 | `docs/qa/2026-09-11-programs-route-fidelity-correction.md`, durable artifacts | Requalify the complete `9ad90d25...HEAD` candidate without hiding new implementation inside qualification |

The tables are ownership bounds, not an instruction to edit every named production file. A file stays unchanged when the new regression already passes and source inspection confirms the contract.

## What Already Exists

- `ProgramsRouteSurface` already owns `ScreenPageFrame + Suspense + ProgramsBoundary`, and both `/programs` and `ProgramsStoryHarness` consume it. Preserve this one-route composition.
- The ten retained baseline Stories and the 20 named material scenarios already exist. Their route identity and catalog governance are useful; their fixture truth and behavior evidence are incomplete.
- `projectManagementPrograms` already projects only server-returned authorized Programs and preserves explicit department narrowing.
- `ParticipantEnrollment`, participant Event Detail, `ProgramSettings`, Schedule preview/generate, stale-plan refusal, partial generation, retry/resume, and `ProgramsNotifications` already own the required domain behavior.
- The current QA file truthfully records `NOT_ROUTE_GREEN — CHANGES_REQUIRED — WAITING_OWNER_L2_NOT_REACHED`, the responsive navigation failure, sparse visual evidence, missing Play coverage, and unqualified T09/role-hierarchy failures.

## Not In Scope

- New Worker routes, D1 migrations, API payload fields, capability names, enrollment/event/schedule states, or authorization widening.
- Rebuilding the Programs route composition, adding another router/provider, or creating a second fixture-backed leaf presentation path.
- New baseline IDs/PSNs, a full backend-state cross-product, or desktop pixel redesign.
- Rewriting/amending existing commits, rebasing, force-pushing, creating a child repair PR, or changing lower stacked PRs.
- Owner-L2 approval, merge, issue closure, release, or converting `ISSUE-#601` to `gap: null`.

## ASCII Diagrams

### Execution and compaction state

~~~text
master ledger: ACTIVE = Rn
          |
          v
load Global Constraints + Rn only
          |
   red -> minimal change -> focused green -> packet gate
          |
          +-- context low / interruption --> append checkpoint
          |                                  update ledger next action
          |                                  resume from first unchecked box
          |
          '-- review -> one commit -> mark COMPLETE -> activate Rn+1
~~~

### Candidate evidence flow

~~~text
frozen HTML + approved route/domain contracts
                    |
       deterministic server-shaped fixtures
                    |
        ProgramsStoryHarness -> ProgramsRouteSurface
                    |                    |
              Story Play/T11      real Worker/D1 route
                    \                    /
                     responsive + visual
                             |
                   fixed-point two-axis review
                             |
                     WAITING_OWNER_L2
~~~

## Failure Modes & Gaps

- `ScreenTabs` currently hard-codes `role="tablist"` on a native `nav`, and `ScreenTab` defaults links to `role="tab"`. This removes the `管理工作` navigation landmark and fails the real responsive matrix.
- Baseline fixtures currently use one English department/program, year-2099 dates, sparse rows, empty notifications, and zero cockpit counts. A green route marker therefore does not prove prototype fidelity.
- `participant-directory-capable` currently routes to management, `participant-event-detail-ineligible` returns an HTTP 200 inactive event rather than the server-shaped forbidden surface, and `management-directory-mixed` is not mixed.
- `ManagementDirectory` currently renders one persistent Department Settings launcher per authorized department before the catalog. The frozen default route has one compact action and an aggregate authorized list.
- `COPY.programs.addRule` currently says `新增時間表`; the frozen Schedule action is `新增規則`.
- Most material Stories currently stop at a generic readiness assertion. They do not prove Back, mode switch, enrollment mutations, Event CTA gating, Schedule recovery, Settings conflict, or Notifications recovery.
- Current T09 and role-hierarchy failures were not base-reproduced. Because the candidate changes shared foundations/CSS, they cannot be called unrelated until R8 reproduces them at the original execution-start SHA.
- The existing visual files under `/tmp/efcc-task5-visual` are audit evidence only. R7 builds the deterministic harness; R8 must generate a fresh manifest and durable contact sheets tied to the final candidate SHA.

## Parallelization / Worktree Strategy

Execute R1 through R8 sequentially in the existing PR #607 checkout. The packets overlap the Story fixtures and material Story file, and each packet depends on the previous packet's committed contracts; parallel worktrees would create conflicting mutable truth. A disposable detached worktree is allowed only in R8 to reproduce a failing gate at `9ad90d253bfd50bf2bbcea85f39c18c1587b1f88`.

## Tracker State Model

Allowed transitions are:

~~~text
PLANNED -> IN_PROGRESS -> VERIFYING -> REVIEWING -> COMPLETE
                |             |            |
                +----------> BLOCKED <------+
                               |
                               +-> IN_PROGRESS
~~~

- Exactly one packet may be `IN_PROGRESS`, `VERIFYING`, or `REVIEWING`; these values mean ACTIVE. A parent packet may remain `BLOCKED` while one disclosed child packet is ACTIVE.
- `COMPLETE` requires every packet checkbox checked, the named gate result recorded, and exactly one matching unique commit subject after the packet's Start SHA. Git history—not a self-referential hash copied into this file—is the commit identity authority.
- `BLOCKED` requires exact evidence, the last safe state, and one concrete next action. When a bounded child packet can resolve it, `Active Task` moves to that child; otherwise `Active Task` names the blocked packet so the user can supply the missing authority/input.
- The ledger below is the only current-status authority. Packet checkpoint logs are append-only history and must not declare packet status.
- Change each packet checkbox from `[ ]` to `[x]` immediately when its `Complete when` condition becomes true; never batch progress updates at task end. Append checkpoints at claim, red, green, review, blocker, and every compaction/handoff boundary.

## Active Task

`NONE`

## Task Ledger

| ID | Packet | Status | Start SHA | Unique commit subject | Required gate | Evidence / blocker / next action |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | [Navigation semantics](programs-route-fidelity-recovery/R1-navigation-semantics.md) | COMPLETE | `51baa5d28c2f73b690827f13f2af628933ce3b74` | `fix(programs): restore navigation semantics` | focused components + `test:programs:responsive` | Downstream query corrected; focused 49/49 and full 69 files / 1,020 tests pass; responsive matrix passes at `test-results/programs-responsive/20260911t073743813z`; expanded diff review is clean; append-only commit is ready |
| R2 | [Truthful route fixtures](programs-route-fidelity-recovery/R2-truthful-route-fixtures.md) | COMPLETE | `8fb468803c03e791645b9b6c81b0c43ab824db0a` | `test(programs): make route fixtures truthful` | Story contracts + T11 | Closeout prepared after Steps 1–10; contract/catalog 23/23, Event component 33/33, Storybook 93/93, T11 99/99 across 9 viewports, typecheck, diff/format/source review all pass; verify the single matching commit subject after commit |
| R2A | [Shared shell fidelity](programs-route-fidelity-recovery/R2A-shared-shell-fidelity.md) | COMPLETE | `1c92a346ffa3a42feab546d20d234220f0a266ac` | `fix(shell): match programs prototype navigation treatment` | focused shell + responsive + visual comparison | Closeout prepared: red regression reproduced; focused 76/76, shell responsive 92 passed/1 skipped, shell geometry 35/35, Programs responsive passed, full components 69 files/1,021 tests, typecheck, and 402x874/360x800 member+management screenshot/computed-style review all pass; verify one matching commit after Start SHA |
| R3 | [Directory and copy fidelity](programs-route-fidelity-recovery/R3-directory-and-copy-fidelity.md) | COMPLETE | `a7ed416e639f706e07602d35ea26e85459b45323` | `fix(programs): align directory and schedule copy` | focused components + Story contracts | Post-commit verified: exactly one matching subject at `1529e5f8d51c56c9e2c20aebfe0a3c99f97cb8c3`; full hook passed typecheck, Storybook scope, governance, Programs gates, root/worker suites, and 69 component files / 1,026 tests; worktree clean; remote and PR #607 unchanged; no remote write authorized |
| R4 | [Participant behavior Plays](programs-route-fidelity-recovery/R4-participant-behavior-plays.md) | COMPLETE | `1529e5f8d51c56c9e2c20aebfe0a3c99f97cb8c3` | `test(programs): exercise participant route seams` | Storybook + participant T11 slice | Committed at `b0b6356b2ba59b599b9844ee016653f7d2c08ad0`; exactly one matching subject after Start SHA; stateful factory regressions, named route Plays, Storybook `94/94`, foundation `59/59`, focused components `51/51`, T11 `108/108` across 9 W7 viewports, full hook, typechecks, formatter, diff check, and review all passed; remote unchanged |
| R5 | [Schedule recovery Plays](programs-route-fidelity-recovery/R5-schedule-recovery-plays.md) | COMPLETE | `b0b6356b2ba59b599b9844ee016653f7d2c08ad0` | `test(programs): exercise schedule recovery seams` | focused Schedule components + Storybook/T11 | Committed at `90213ebc4e8fbc0799728b3e580591f99f113bde`; exactly one matching subject after Start SHA; stateful fixture isolation, named Events/Schedule Plays, stale re-preview, partial resume, focused components `23/23`, foundation `61/61`, Storybook `94/94`, T11 `117/117` across 9 W7 viewports, root/web typecheck, full pre-commit verification, formatter, diff check, and review all passed; remote and PR #607 unchanged |
| R6 | [Settings and Notifications Plays](programs-route-fidelity-recovery/R6-settings-notifications-plays.md) | COMPLETE | `f32f5082f1628c0ba7f74b10f14bd4d99cd1b03e` | `test(programs): exercise settings and notification seams` | focused components + Storybook/T11 | Full R6 candidate gates pass: T07 foundation `64/64`, R6 Plays `4/4`, presentation contract `18/18`, focused Settings/Notifications `28/28`, Storybook `94/94`, T11 `117/117` across 9 W7 viewports, and web typecheck; one-resource source review, exact endpoint/factory-state review, and `git diff --check` pass; closeout commit is next, then verify one matching subject after Start SHA |
| R6A | [Settings Back interception](programs-route-fidelity-recovery/R6A-settings-back-interception.md) | COMPLETE | `f32f5082f1628c0ba7f74b10f14bd4d99cd1b03e` | `fix(programs): restore settings back interception` | focused ScreenHeader regression + R6 Settings Plays | Focused Screen Foundations `9/9`, Settings Dirty/Conflict `2/2`, Notifications Unread/Empty `2/2`, and T07 contract `18/18` pass; bounded diff review and `git diff --check` pass; child commit identity is verified from this Start SHA and R6 is reactivated for the remaining full gates |
| R7 | [Visual evidence harness](programs-route-fidelity-recovery/R7-visual-evidence-harness.md) | COMPLETE | `54bf903fae79b1a03a2d29e3596f7389f373e340` | `test(programs): add visual fidelity evidence` | two deterministic harness runs + T11/typecheck | Closeout prepared: latest independent runs (`/tmp/efcc-programs-visual-r7.Dn3zZu`, `/tmp/efcc-programs-visual-r7.70lOY0`) each pass 2/2 projects with 22 rows/4 sheets; comparison of keys, prototype hashes, dimensions, and measurements PASS; T11 `117/117`, root/web typechecks, oxfmt, oxlint, and diff/scope review pass; closeout commit is next, then verify one matching subject after Start SHA |
| R8 | [Fixed-point qualification](programs-route-fidelity-recovery/R8-fixed-point-qualification.md) | BLOCKED | `e4a1ca4636bd4ebd8800fb60c3f23665660ab565` | `test(programs): requalify route fidelity recovery` | every machine-candidate gate + zero-actionable review | Steps 1–5 are machine-evidenced at `e4a1ca4636bd`: visual `2/2`, 22/22 visual rows PASS, clean promotion `functional-passed`, required route/component/Storybook/precommit gates PASS, and T09/role-hierarchy failures are base-proven ambient limitations. Step 7 found unresolved authority/evidence blockers: acceptance trace was written after implementation; retained baseline/catalog `ISSUE-#601` changes have no owner-approved Contract Change record; no owner Storybook spot-check exists; Schedule and Notifications Plays had narrower evidence gaps, now closed by R8B. R8 must restart from Step 1 after the R8B commit is verified. |
| R8A | [Residual fidelity and evidence defects](programs-route-fidelity-recovery/R8A-residual-fidelity-defect.md) | COMPLETE | `72c63f6812dd12bbc074e69f10f43d352bbfe00a` | `fix(programs): close residual fidelity evidence defects` | focused notification + Storybook + visual harness gates | Bounded red/green/review complete: focused components `7/7`, T07 `64/64`, Storybook `94/94`, T11 `117/117`, web typecheck, artifact-bound visual `2/2`, oxfmt, scoped visual/notification oxlint, and diff check pass; no new suppression or fixed reporter path. Exactly one matching subject is verified at `e4a1ca46`; R8 is now reactivated from the fresh candidate SHA above. |
| R8B | [Residual acceptance evidence](programs-route-fidelity-recovery/R8B-residual-acceptance-evidence.md) | COMPLETE | `e4a1ca4636bd4ebd8800fb60c3f23665660ab565` | `test(programs): close residual acceptance evidence gaps` | focused Storybook behavior evidence | Red reproduced with 2 failing Plays (`92/94`) for absent request-observation markers. Test-only fixture metadata records exact Schedule generate request/response identities and Notifications read payload; Plays assert partial/resume identity, one result surface, count `3 -> 2`, and unread-to-earlier movement. Focused Storybook `94/94`, T11 `117/117`, web typecheck, oxfmt, and `git diff --check` pass; bounded four-file review is clean. Commit exactly once, verify its subject, then claim R8 afresh. |

## Claim and Update Protocol

1. **Claim:** Re-read live git/PR state. Set `Active Task` to the packet ID, change that ledger row to `IN_PROGRESS`, record exact `Start SHA`, and append a packet checkpoint before production edits. Claiming is complete when the ledger has exactly one `IN_PROGRESS`/`VERIFYING`/`REVIEWING` row and git evidence matches it.
2. **Red:** Execute the packet's first unchecked regression steps. Record the exact failing assertion and command in its checkpoint log. Red is complete when the failure demonstrates the named defect rather than environment/setup failure.
3. **Green:** Make the smallest scoped change and run the packet's focused checks. Change status to `VERIFYING`. Green is complete when every named focused check passes at the current dirty tree.
4. **Review:** Inspect the packet diff against its `Start SHA`, run `git diff --check`, account for every changed file, and change status to `REVIEWING`. Review is complete when there is no unexplained change, suppression, generated output, or unresolved actionable finding.
5. **Commit:** Check every packet checkbox, write the exact gate result in the ledger, then change the row to `COMPLETE` and `Active Task` to `NONE`. Commit code, tests, packet checklist/checkpoints, and tracker update together using the ledger's unique subject. Completion is proven by `git log --format='%H%x09%s' <start-sha>..HEAD` containing exactly one matching subject.
6. **Advance:** Claim the next sequential packet in a separate step. A task never activates its successor before its own completion commit exists.

## Cold Resume Contract

After compaction, interruption, or a new agent taking over:

1. Read this master file from the top through the ledger. Then read only the packet named by `Active Task`; if `Active Task` is `NONE`, read the first PLANNED packet whose prerequisites are COMPLETE.
2. Run `git status --short --branch`, `git rev-parse HEAD`, and `git log --oneline --decorate -10`. Compare branch, HEAD, dirty paths, and packet state with the ledger and latest packet checkpoint.
3. If they agree, continue at the first unchecked packet checkbox. If they disagree, append the mismatch as a checkpoint, mark the active packet `BLOCKED`, and stop before edits.
4. Do not reconstruct progress from chat memory. The checked boxes, latest checkpoint, git diff, and ledger are the complete recovery state.

Before voluntary compaction, before handing off, or when remaining context approaches 25%, finish the current atomic command and append this exact checkpoint shape to the active packet:

~~~markdown
### Checkpoint — YYYY-MM-DD HH:mm HKT
- Branch / HEAD: `<branch>` / `<full-sha>`
- Dirty paths: `<exact paths or clean>`
- Last completed checkbox: `<step number and title>`
- Last command / result: `<exact command>` — `<PASS, expected FAIL, or exact blocker>`
- Active finding: `<one evidence-backed sentence>`
- Next unchecked checkbox: `<step number and title>`
~~~

Update the ledger's `Blocker / next action` cell in the same edit. A checkpoint is complete when another cold agent can continue without reading the prior conversation.

## Test Coverage Design

| Flow | Branches | Test level |
| --- | --- | --- |
| Workspace navigation | route links versus in-page tabs; selected state; keyboard semantics | Screen Foundations and ProgramWorkspace component tests; real responsive Playwright |
| Story data | member/capable identity, mixed participant status, mixed management lifecycle, populated/zero, unread/empty/error | Story contract tests, baseline Play assertions, T11 browser |
| Department Settings | zero, one, and multiple authorized scopes; picker selection; close/focus return | ManagementDirectory component test and route-backed Story Play |
| Participant actions | eligible, Active, Pending, Rejected/Withdrawn; mutation success and permitted next action | Participant component tests plus stateful route-backed Story Plays |
| Event Detail | closed, open, forbidden; Back; scanner link gate | Participant Event component test plus Story Play/T11 |
| Schedule | Events entry, overview, focused editor, preview, stale, partial, resume | focused component tests plus stateful Story Plays/T11 |
| Settings/Notifications | dirty, conflict, retry, unread, mark-read, focus/announcement | focused component tests plus stateful Story Plays/T11 |
| Candidate | Storybook/MSW, real Worker/D1 route, W7 geometry, primary visual comparison | build/index, component/contract, Playwright, promotion runner, fixed-point review |

## Fixed Completion Invariant

This recovery plan is machine-complete only when all of the following are true at one immutable candidate HEAD:

- R1 through R8 are `COMPLETE`, no packet checkbox remains unchecked, and the ledger agrees with git history.
- The candidate contains the eight planned append-only recovery commits after `51baa5d28c2f73b690827f13f2af628933ce3b74`, plus one commit for each disclosed inserted packet; no existing commit was rewritten.
- The ten baseline Stories retain their IDs/PSNs and `ISSUE-#601`, use route-specific truthful fixtures, and visually match the frozen hierarchy/density at `402x874` and `360x800` within documented domain-driven differences.
- Every required component, Storybook, real-route, responsive, W7, and precommit gate is green, or the status remains `CHANGES_REQUIRED / NOT_ROUTE_GREEN` with the exact blocker.
- A two-axis fixed-point review of `9ad90d253bfd50bf2bbcea85f39c18c1587b1f88...HEAD` finds zero actionable spec/acceptance or code-quality/regression issues.
- The QA record names the final SHA, exact commands/results, durable visual artifacts, base-reproduction evidence for any non-Programs failure, and the remaining owner-L2 requirement.

The terminal state is `WAITING_OWNER_L2`. This plan grants no push, PR update, approval, merge, issue closure, release, or `gap: null` authority.
