# #589 repair handoff — 2026-09-13

Status: IN PROGRESS. Parent delivery owner coordinates Luna max; no final acceptance claimed.

## Authority and boundary
- User requested cooperation with Luna to fix the reviewed defects. Begin with #589 under #586 accepted R01–R25 amendment/workset.
- Existing checkout /Users/noah.wong/Desktop/code/efcc; branch codex/programs-screen-foundations/wave-3.
- Fixed repair base: 98f3c61f3442f19d80ba0cf1e007e7dba1e00054. Code previously verified at14ad82aa; later commits are documentation-only.
- #607 remote remains 9ad90d253bfd50bf2bbcea85f39c18c1587b1f88 OPEN. No reset, checkout replacement, push, merge, close issue, or skill edits.
- Preserve four existing dirty tracked docs (CONTEXT.md; route-fidelity correction; recovery tracker; R8 qualification), all unrelated untracked artifacts and prior correction commits. Initial index empty.
- Exact repairs reuse current state and capability owners. No backend permission semantics/schema changes or new generalized navigation framework.

## Accepted checks
1. Dirty focused Settings: edit an existing value; Back must not silently discard. Blocked navigation keeps draft and location, with visible existing Save/Discard actions; explicit discard permits exit and clean editor exits normally. This repair uses Save/Discard-first, not a new confirmation dialog. Check relevant workspace/tab/mode navigation consumes the same protection; don't silently narrow R03 to one button.
2. Mode control: authorized Programs management projection shows exactly one destination icon, independent of unrelated global admin privileges. Participant-only/home.publish-only without Programs scope have no misleading management entry. Loading/error/revocation must not leave an unauthorized stale control. Preserve server authority and context-free destination URLs.
3. Preserve one visible focused header/Back, named landmark, bell reachability, original tab order, 44px controls, phone402x874/360x800, and existing dirty save/conflict behavior.
4. Retain all existing tests; prove each defect with failing regression before production repair, then focused/integrated reruns. Do not weaken current tests to bless faults: changing a historically incorrect permission expectation requires explicit spec-derived replacement + regression coverage.
5. Inspect actual routes for non-root/scrolled mode switching and Back with real local Worker/D1 where required. Story screenshot geometry is not real URL/history or visual-match proof. Capture/inspect changed focused editor and keep durable, candidate-bound evidence locators.
6. Tracker must reflect actual delivery state + candidate + evidence + unverified gates. Parent owns tracker publication/readback. Human owner approval and canary residual risk stay distinct; no blanket claim of L1/L2/L3 approval or full stack green.

## Root-cause / hypothesis record before edits
| Hypothesis | Expected observation | Evidence and next check | Status |
| --- | --- | --- | --- |
| Focused Back resets section without consulting dirty draft | Unsaved field lost on exit/reopen | Source handler prevents default then setSection(null); ProgramSettings stores local draft. Prior live synthetic Story observation confirmed exit; Luna adds failing public-interaction regression before fix. | Source confirmed; regression pending |
| Shell confuses global Management navigation with Programs capability | home.publish-only user sees unusable Programs destination | shell-header showModeControl = isPrograms && globalManagement; app fixture uses home.publish; Programs boundary uses getManagementAccess projection. Luna tests both positive/negative roles before fix. | Source confirmed; regression pending |
| Lifted settings focus state survives child remount | Headerless hub on retry/program change | Unverified review hypothesis only; reproduce before any extra change, otherwise report unproven. | Pending, not accepted defect |

Both confirmed acceptance gaps existed before the first #589 implementation. Do not mislabel them as newly introduced regressions.

### First regression checkpoint

Carver reported a pre-production-fix component run of 42 tests: the new dirty-Back regression failed and the 41 existing tests passed. Parent inspected the new public-interaction test in program-workspace.test.tsx. This records the worker's red result, not independent final verification. The failing case edits the Program name, activates focused Back, and requires the editor and draft to remain rather than silently returning to the hub.

## Discovery handoff
Tier2; graph efcc-current-main at /Users/noah.wong/Desktop/code/efcc; generation2026-09-11T06:52:45Z, statusready.
search_graph found ShellHeader, ProgramWorkspace, SettingsTask, ProgramSettings, getManagementAccess.
Coverage: shell-header and programs-boundary metadata_match; workspace-settings-task, program-settings, program-workspace metadata_changed; app/program-workspace tests and material-state Story excluded. Parent read direct relevant source/diff as fallback; graph not exhaustive. Worker must directly read affected owners/callers and coverage-check additional relied-on paths; tools may not be inherited.
Verified entrypoints: web/lib/shell-header.tsx; web/lib/programs/{workspace-settings-task,program-settings,program-workspace,programs-boundary,program-api}.tsx/ts as actual file names; web/lib/app.test.tsx; web/lib/programs/program-workspace.test.tsx; web/.storybook/programs-material-states.stories.tsx.
Existing component regression command: fnm exec --using 22.18.0 pnpm --dir web exec vitest run --config vitest.components.config.ts lib/programs/program-workspace.test.tsx (41 passed before repairs).
Read AGENTS.md, web/AGENTS.md, CONTRIBUTING.md, docs/implementation/ui-control-recovery-governance.md and existing verification entrypoints. Follow Next local docs for changed framework APIs.

## Ownership / return
Two Luna max workers now own disjoint repair slices, using apply_patch. Carver owns dirty Settings source/tests and existing dirty-guard helpers; Nietzsche owns shell-header/app tests and narrowly necessary Programs access projection presentation. Neither may edit the other's files; shared needs escalate to parent before edits. Parent owns this handoff, durable evidence coordination and tracker.
Return a coherent uncommitted patch for independent parent review with changed paths, red/green command results, actual seams/mocks, limitations and proposed follow-up checks. Do not commit until parent reviews; parent will create focused append-only local commit after checks.
No skill changes in this repair. Proposed universal improvements will be judged from observed workflow failures, not copied EFCC-specific policies.

## Independent review checkpoint

Parent reran the combined Shell/Settings/Workspace component suites: 164/164 passed, and Programs Worker contract: 1/1 passed. These are intermediate working-tree results, not the final candidate qualification.

Review requested two bounded evidence repairs before accepting delivery: prove dirty top-right mode interception in the real management browser journey and explicitly test allowed link variants/save release; make asynchronous negative permission tests wait for settled responses rather than succeeding during initial loading. Existing access projection has a 30-second cache: using that established API is not a claim of immediate revocation or a fresh network request on every navigation.
