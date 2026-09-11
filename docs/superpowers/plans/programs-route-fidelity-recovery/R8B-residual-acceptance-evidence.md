# R8B — Close Residual Acceptance Evidence Gaps

> Load this bounded child packet only while the master tracker marks R8B ACTIVE. R8 remains BLOCKED until this packet is complete and restarted from a fresh candidate freeze.

**Outcome:** Strengthen the existing route-backed Schedule and Notifications Plays so the R8 fixed-point review can observe the server-shaped request and state transitions it already exercises. This packet changes no production API, route, baseline identity, PSN, or owner-approval state.

## Files

- Modify: `web/.storybook/programs-material-states.stories.tsx`
- Modify: `web/.storybook/programs-fixtures.ts`
- Update: master tracker and this packet

## Contract

- The Schedule partial/resume Play observes two generate requests carrying the same `plan_id` and `run_id`, then proves the final server-shaped result reports `created: 0`, `skipped: 1`, and leaves exactly one result surface.
- The Notifications Play observes the explicit read `POST` payload for the activated event, proves the unread count changes `3 -> 2`, and proves that the activated row moves from the unread section into the earlier/read section.
- Fixture instrumentation is test-only and reset for each scenario factory invocation. No production component, API payload, baseline ID, PSN, or `ISSUE-#601` value changes.

## Steps

- [x] **Step 1: Record the red evidence assertions.** Add the missing request/state assertions to the two existing Plays and run the focused Storybook gate. Complete when the failure is attributable to absent fixture-observation markers rather than setup.
- [x] **Step 2: Add bounded fixture observation.** Record the exact generate plan-id sequence and notification read payload in test-only DOM data attributes, reset them per factory, and keep the existing response shapes/semantics unchanged.
- [x] **Step 3: Run the focused green gate.** Run `fnm exec --using 22.18.0 pnpm --dir web test:storybook`; complete when the full Storybook suite passes with the strengthened Plays.
- [x] **Step 4: Review and close.** Inspect the four-file bounded diff, run `git diff --check`, confirm no production/API/baseline change, and append the exact result.
- [x] **Step 5: Commit once.** Check every box, update the master ledger, and commit exactly once with `test(programs): close residual acceptance evidence gaps`; verify the unique subject after the Start SHA.

## Checkpoint Log

### Checkpoint — 2026-09-12 01:48 HKT

- **State:** R8B claimed; R8 remains BLOCKED.
- **Branch / HEAD:** `codex/programs-screen-foundations/wave-3` / `e4a1ca4636bd4ebd8800fb60c3f23665660ab565`.
- **Dirty paths before child edits:** the existing R8 QA/tracker/packet and candidate-bound artifacts; no implementation files overlapped.
- **Last command / result:** live branch, HEAD, remote refs, PR #607, and process preflight — `PASS; no unsafe overlap; remote unchanged`.
- **Active finding:** R8 review identified indirect Schedule/Notifications evidence; this packet owns only the missing test-observation assertions.
- **Red:** `fnm exec --using 22.18.0 pnpm --dir web test:storybook` failed `2/94` because the new Schedule and Notifications observation markers were absent; the existing server-shaped interactions had already reached the intended response points.
- **Green:** test-only fixture metadata now records the two Schedule generate request/response identities and exact Notifications read payload; Story Plays assert the required state transitions. Focused Storybook `94/94`, T11 `117/117`, web typecheck, oxfmt, and `git diff --check` pass.
- **Last completed checkbox:** Step 3 — run the focused green gate.
- **Next unchecked checkbox:** Step 4 — review and close.

### Checkpoint — 2026-09-12 01:50 HKT

- **State:** R8B review and closeout are complete; the four-file child commit is the next atomic action.
- **Review:** changed files are limited to this packet, the master tracker, the two existing material Story/fixture files, and test-only DOM observation. No production component, API payload, baseline ID, PSN, or `ISSUE-#601` value changed.
- **Last command / result:** final Storybook `94/94`, T11 `117/117`, web typecheck, oxfmt check, and `git diff --check` — `PASS`.
- **Last completed checkbox:** Step 5 — commit once (ready; no commit has been made yet).
- **Next action:** stage only the four bounded files, commit exactly once with `test(programs): close residual acceptance evidence gaps`, verify the unique subject, then leave R8 blocked until a fresh R8 claim.

## Completion Criterion

R8B is complete only when the two Plays explicitly observe the required request/state transitions, the focused Storybook gate passes, the bounded diff is reviewed, and exactly one matching child commit exists. R8 must then restart from candidate-freeze Step 1.
