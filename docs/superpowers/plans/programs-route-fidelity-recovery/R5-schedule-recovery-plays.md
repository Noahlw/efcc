# R5 — Prove Schedule Recovery Behaviors

> Load this packet only when the [master tracker](../2026-09-11-programs-route-fidelity-recovery-tracker.md) marks R5 ACTIVE and R4 is COMPLETE. Read the master Global Constraints, Claim and Update Protocol, and Cold Resume Contract first. Mutable task status lives only in the master ledger.

**Outcome:** Route-backed material Stories prove the single Events-to-Schedule destination, focused editor return path, preview/generate lifecycle, stale-plan recovery, partial generation, and resume.

## Files

- Modify: `web/.storybook/programs-material-states.stories.tsx`
- Modify: `web/.storybook/programs-fixtures.ts`
- Modify: `web/.storybook/programs-presentation-contract.test.ts`
- Modify: `tests/e2e/t11-storybook.test.ts`
- Verify: `web/lib/programs/workspace-events-task.test.tsx`
- Verify: `web/lib/programs/program-settings.test.tsx`
- Update: master tracker and this packet

## Behavior Contract

- `WorkspaceEventsMixed` shows operational mixed-lifecycle events first, then one low-frequency Schedule destination. Activating it targets the existing `task=schedule` route.
- `WorkspaceScheduleFocused` starts on the Schedule overview, opens New Rule, hides overview-only content while focused, and returns to the same overview via Back/Cancel without losing authoritative rules.
- `WorkspaceScheduleStale` previews, attempts generate, receives the existing `STALE_PLAN` problem, clears/refuses the stale plan as production already defines, and requires a fresh preview before generate is available again.
- `WorkspaceSchedulePartialResume` previews, generates a partial result, preserves run/plan identity, exposes the existing resume action, and finishes through a subsequent server-shaped response without duplicating completed occurrences.
- Story handlers are fresh per invocation and use POST `/api/v1/programs/:programId/events/preview` plus POST `/api/v1/programs/:programId/events/generate` with existing payload/result shapes. The Story layer does not reimplement schedule rules.

## Steps

- [x] **Step 1: Claim R5 and add the Play inventory regression.** Run the master preflight and record the start SHA. Require custom Plays for `WorkspaceEventsMixed`, `WorkspaceScheduleFocused`, `WorkspaceScheduleStale`, and `WorkspaceSchedulePartialResume`, each tagged to the exact behavior contract it proves. Complete when the current readiness-only Stories fail the inventory.

- [x] **Step 2: Add stateful Schedule fixture regressions.** Pin independent preview/generate attempt state for happy, stale, partial, and resumed responses, using the existing plan/run/result shapes and endpoints. Complete when repeated factory calls reset state and one Story cannot consume another Story's response sequence.

- [x] **Step 3: Prove Events-to-Schedule and editor Back.** Add Plays that activate the single Schedule destination and verify its route target; open New Rule from the overview, assert focused-editor hierarchy/hidden overview, then return and assert overview/rules are restored. Complete when both route and focused-state transitions are asserted.

- [x] **Step 4: Prove stale recovery.** Add a Play that previews, attempts generate, observes the existing stale-plan error, verifies stale generation is unavailable, previews again, and observes a fresh actionable plan. Complete when every transition is backed by the expected MSW response and visible state.

- [x] **Step 5: Prove partial resume.** Add a Play that previews, receives a partial generate result, activates resume, receives completion, and verifies the resume action disappears while the final summary remains truthful. Complete when the Story proves one partial-to-complete sequence without duplicate creation claims.

- [x] **Step 6: Run Story and route gates.** Run `fnm exec --using 22.18.0 pnpm --dir web test:t07:foundation`, `fnm exec --using 22.18.0 pnpm --dir web test:storybook`, `fnm exec --using 22.18.0 pnpm test:t11:storybook`, and `fnm exec --using 22.18.0 pnpm --dir web exec vitest run --config vitest.components.config.ts lib/programs/workspace-events-task.test.tsx lib/programs/program-settings.test.tsx`. Complete when static inventory, all R5 Plays, focused components, and T11 pass.

- [x] **Step 7: Handle a production defect by disclosure.** If Step 6 fails because production behavior violates the contract rather than because the Story is wrong, create `R5A-schedule-production-defect.md`, add it immediately after R5 in the master ledger, mark R5 `BLOCKED`, and stop. Complete when either no production defect exists or the new packet names one component/test pair, red assertion, gate, and unique commit subject.

- [x] **Step 8: Review the R5 diff.** Compare against the R5 start SHA, run `git diff --check`, verify handler state isolation and exact endpoint reuse, and confirm Events has one Schedule destination. Complete when no business rule moved into Story code and no generic readiness callback remains for R5.

- [ ] **Step 9: Commit and close R5.** Check all boxes, append the final checkpoint, update the master ledger, and commit the changed Story/test files plus tracker updates with `test(programs): exercise schedule recovery seams`. Complete when exactly one matching subject exists after the R5 start SHA, R5 is `COMPLETE`, `Active Task` is `NONE`, and the ledger records green gates.

## Completion Criterion

R5 is complete only when route-backed Plays prove Events entry, focused-editor return, stale re-preview, partial generation, and resume-to-complete; focused components, Storybook, and T11 are green at the committed SHA; and any production defect has been disclosed into a separate packet rather than hidden in R5.

## Checkpoint Log

- 2026-09-11 plan authoring: R5 procedure created; no implementation attempted; prerequisite is R4 COMPLETE; next unchecked item is Step 1.

### Checkpoint — 2026-09-11 18:55 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `b0b6356b2ba59b599b9844ee016653f7d2c08ad0`
- Dirty paths: this packet and the master tracker (claim/update only); worktree was clean before the R5 claim.
- Last completed checkbox: `Step 1 — claim R5 and add the Play inventory regression` (claim/preflight portion complete; regression edit is next)
- Last command / result: live `git status --short --branch`, local HEAD, remote branch SHA, and PR #607 state/base verification — `PASS; local HEAD b0b6356b, remote HEAD 9ad90d25, PR OPEN on wave-2 base, no overlap or remote write`
- Active finding: R4 is complete at the committed candidate SHA, and R5 is the only active packet; no production edits have started.
- Next unchecked checkbox: `Step 1 — claim R5 and add the Play inventory regression`

### Checkpoint — 2026-09-11 18:58 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `b0b6356b2ba59b599b9844ee016653f7d2c08ad0`
- Dirty paths: this packet, the master tracker, and `web/.storybook/programs-presentation-contract.test.ts` (R5 Step 1 regression only).
- Last completed checkbox: `Step 1 — claim R5 and add the Play inventory regression`
- Last command / result: `fnm exec --using 22.18.0 pnpm --dir web exec vitest run --config vitest.t07.config.ts .storybook/programs-presentation-contract.test.ts` — `EXPECTED FAIL; 1 failed / 13 tests, WorkspaceEventsMixed is missing a named behavior Play`
- Active finding: the readiness-only schedule Stories are correctly rejected by the new inventory contract; no production code or fixture behavior has changed.
- Next unchecked checkbox: `Step 2 — add stateful Schedule fixture regressions`

### Checkpoint — 2026-09-11 19:35 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `b0b6356b2ba59b599b9844ee016653f7d2c08ad0`
- Dirty paths: this packet, the master tracker, `web/.storybook/programs-fixtures.ts`, `web/.storybook/programs-material-states.stories.tsx`, `web/.storybook/programs-presentation-contract.test.ts`, and `tests/e2e/t11-storybook.test.ts`
- Last completed checkbox: `Step 8 — review the R5 diff`
- Last command / result: `git diff --check` plus focused diff review against R5 Start SHA — `PASS; stateful handlers are isolated per factory, exact preview/generate POST endpoints are reused, Events has one Schedule destination, and no production code changed`
- Active finding: all R5 behavior is now covered by named route-backed Plays and fresh fixture state; no production defect was exposed.
- Next unchecked checkbox: `Step 9 — commit and close R5`
