# R8A — Close Residual Fidelity and Evidence Defects

> Load this bounded child packet only while the master tracker marks R8A ACTIVE. R8 remains BLOCKED until this packet is complete. Mutable task status lives only in the master ledger.

**Outcome:** Repair the concrete residual defects exposed by the first R8 fixed-point review, then return control to R8 for a fresh candidate freeze and full qualification.

## Why this child packet exists

The first fixed-point Spec and Standards reviews found actionable implementation/evidence defects that cannot be classified as owner-L2 differences: full Notifications consumes every unread item on mount; the material Plays do not prove the required state transitions; the visual reporter writes outside the supplied artifact directory; and the Playwright spec relies on a repository-forbidden lint suppression. The repairs below stay within existing route/domain contracts and do not change baseline IDs, PSNs, or owner approval state.

## Files

- Modify: `web/lib/programs/programs-notifications.tsx`
- Modify: `web/lib/programs/programs-notifications.test.tsx`
- Modify: `web/.storybook/programs-material-states.stories.tsx`
- Modify: `web/lib/programs/workspace-events-task.tsx`
- Verify/modify: `web/lib/programs/workspace-events-task.test.tsx`
- Modify: `tests/e2e/programs-visual-fidelity.config.ts`
- Modify: `tests/e2e/programs-visual-fidelity.test.ts`
- Update: master tracker and this packet

## Contract

- Full Notifications preserves the initial unread/read sections and only marks an item read after an explicit activation; the compact bell retains its existing open-to-mark behavior.
- The Notifications Play starts with three unread plus earlier content, activates one existing event route target, proves the read POST through the resulting unread-count/read-section transition, and proves no compact bell is mounted on the full task.
- Settings dirty Play enters the existing focused editor, proves dirty state, activates Back, then uses the existing Cancel/Discard control to verify the draft is not persisted on re-entry.
- Schedule partial/resume Play proves the same `plan_id` and `run_id` across both server-shaped responses and a single partial-to-complete result surface.
- Visual harness reporter output is written below the supplied artifact directory, and the Playwright imports are explicit aliases that satisfy the repository test-file lint rules without a suppression.

## Steps

- [x] **Step 1: Record the red assertions.** Run the focused notification component test, Storybook material-state/contract test, and visual harness config/type check against the current candidate. Record the exact failures for full Notifications mount behavior, missing Play evidence, fixed reporter output, and the suppression. Complete when each red is attributable to the named residual rather than setup.
- [x] **Step 2: Implement the smallest repairs.** Gate compact auto-marking on the compact popover only; extend the route-backed Plays with explicit state assertions; expose existing generation identity as non-visual test metadata; bind the JSON reporter to the supplied artifact root; and use explicit Playwright aliases to remove the misclassified lint violation without changing behavior.
- [x] **Step 3: Run focused green evidence.** Run the focused Notifications and Workspace Events component tests, T07 Story foundation/contract plus Storybook tests, T11 Storybook, web typecheck, and the visual harness once with a temporary artifact directory. Complete when all pass and all generated output is beneath that directory.
- [x] **Step 4: Review and close the child.** Inspect every changed file, run `git diff --check`, verify no suppression and no fixed output path remain, and append the exact green results. Complete when the bounded diff has no unexplained change and the parent R8 can restart from Step 1.
- [x] **Step 5: Commit once.** Check every box, update the master ledger and parent checkpoint, then commit exactly once with `fix(programs): close residual fidelity evidence defects`. Verify exactly one matching subject after the Start SHA and leave R8 blocked for its fresh restart.

## Checkpoint Log

- 2026-09-11 plan authoring: child packet created from the first R8 fixed-point review; next unchecked item is Step 1.

### Checkpoint — 2026-09-11 21:51 HKT

- **State:** Steps 1–4 complete; bounded diff is in REVIEWING before the one commit.
- **Branch / HEAD:** `codex/programs-screen-foundations/wave-3` / `72c63f6812dd12bbc074e69f10f43d352bbfe00a`.
- **Dirty paths:** parent R8 tracker/packet, R8A packet, the six bounded implementation/test files, and pre-existing durable R8 artifacts; no unrelated overlap.
- **Red:** Temporarily replayed the pre-fix `expanded` auto-mark condition against the new full Notifications regression — `1 failed / 6 tests`, exact failure at `programs-notifications.test.tsx:182`, `onMarkRead` called on full mount. Restored the production fix immediately.
- **Green:** focused component tests `2 files / 7 tests`; T07 foundation `10 files / 64`; Storybook `10 files / 94`; T11 `117/117`; web typecheck PASS; temporary artifact-bound visual harness `2/2` with manifest/contact sheets/JSON reporter all under `/tmp/efcc-r8a-visual.QVErXI`; oxfmt PASS; scoped visual-harness and Notifications oxlint PASS; `git diff --check` PASS.
- **Review:** no `oxlint-disable` in the visual harness, no fixed `test-results/programs-visual-fidelity/storybook.json` reporter path, explicit Playwright aliases pass the filename/global lint rules, and the changed production state remains server-endpoint-owned.
- **Next unchecked checkbox:** Step 5 — commit once.

### Checkpoint — 2026-09-11 21:56 HKT

- **State:** R8A closeout metadata is complete; the one append-only child commit is the next atomic action.
- **Last command / result:** staged diff review, `git diff --cached --check`, and exact file/scope inspection — `PASS; nine staged files including the bounded packet/tracker updates, six implementation/test files, and no durable R8 artifact staged`.
- **Active finding:** R8A has no remaining actionable child finding; after commit verification, R8 must be claimed afresh from the new candidate SHA and rerun from Step 1.
- **Next unchecked checkbox:** none; verify the unique child commit subject after commit.

## Completion Criterion

R8A is complete only when all listed residual defects have focused red/green evidence, the bounded diff is clean, no new suppression or artifact escape exists, and exactly one child commit is present. R8 must then restart at candidate freeze; this child does not grant owner approval or make R8 machine-complete.
