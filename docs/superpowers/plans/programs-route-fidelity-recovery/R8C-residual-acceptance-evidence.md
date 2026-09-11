# R8C — Close Residual Fixed-Point Evidence Gaps

> Load this bounded child packet only while the master tracker marks R8C ACTIVE. R8 remains BLOCKED until this packet is complete and restarted from a fresh candidate freeze.

**Outcome:** Make the remaining fixed-point evidence truthful and route-backed: distinguish Schedule request identity from server response identity, execute every R6 material Play through T11, and record the existing Settings conflict recovery as a real second mutation after re-entry. This packet changes no production API, route, baseline identity, PSN, or owner-approval state.

## Files

- Modify: `web/.storybook/programs-material-states.stories.tsx`
- Modify: `web/.storybook/programs-fixtures.ts`
- Modify: `tests/e2e/t11-storybook.test.ts`
- Update: master tracker and this packet

## Contract

- Schedule observation records each generate request's `plan_id` and the server response's `plan_id`/`run_id`; the two requests reuse the same plan and the two server-shaped responses reuse the same run, without claiming that the client sent a `run_id` that the production API does not accept.
- The Settings conflict Play records the existing flow's 409 draft preservation, Back/re-entry, and successful second PATCH; it does not invent a retry control or alter production conflict semantics.
- T11 visits and asserts the terminal state of all four R6 material Stories: dirty Settings, conflict Settings, unread Notifications, and recoverable-empty Notifications, at every configured W7 viewport.

## Steps

- [x] **Step 1: Add the red evidence regressions.** Add the truthful Schedule marker shape, conflict-attempt assertion, and R6 T11 inventory/terminal assertions; run the focused Storybook/T11 checks and record the expected failures against the current candidate. `test:storybook` reproduced `92/94`, failing only the new `responseRunId` and Settings-attempt assertions; the T11 matrix reached the new R6 test at all W7 widths.
- [x] **Step 2: Add bounded test-only observation.** Rename the Schedule marker field to `responseRunId`, reset and record the conflict PATCH attempt count per scenario factory, and keep response/API semantics unchanged. No production/API/baseline file changed.
- [x] **Step 3: Run focused green gates.** Run `fnm exec --using 22.18.0 pnpm --dir web test:storybook` and `fnm exec --using 22.18.0 pnpm test:t11:storybook`; complete when Storybook and the R6 assertions pass. Storybook `94/94`, T11 `126/126` across the nine W7 widths, web typecheck, oxfmt, and diff check pass.
- [x] **Step 4: Review and close.** Inspect the bounded four-file diff, run `git diff --check`, confirm no production/API/baseline change, and append the exact results. Review found only the three test harness files plus this packet/tracker; no suppression, generated output, or business-rule change.
- [x] **Step 5: Commit once.** Check every box, update the master ledger, and commit exactly once with `test(programs): complete fixed-point behavior evidence`; verify the unique subject after the Start SHA and leave R8 ready for a fresh claim.

## Completion Criterion

R8C is complete only when the Schedule identity evidence is truthful, Settings conflict recovery is observed through the existing route-backed flow, all R6 material Plays execute under T11 with terminal assertions, focused Storybook/T11 gates are green, the bounded diff is reviewed, and exactly one matching child commit exists. R8 must then restart from candidate-freeze Step 1.

## Checkpoint Log

- 2026-09-12 plan authoring: R8 fixed-point review identified residual evidence gaps; no production defect is claimed; next unchecked item is Step 1.

### Checkpoint — 2026-09-12 02:44 HKT

- **State:** R8C claimed; R8 remains BLOCKED.
- **Branch / HEAD:** `codex/programs-screen-foundations/wave-3` / `ca63fc143602f5e99cfe620d464e18477c9a3671`.
- **Dirty paths:** existing R8 QA/packet/tracker/artifacts plus the R8C packet, Storybook fixtures/Play, and T11 test; no production overlap.
- **Red:** `fnm exec --using 22.18.0 pnpm --dir web test:storybook` — `EXPECTED FAIL; 92/94`; the new Schedule `responseRunId` and Settings PATCH-attempt assertions correctly failed against the old markers. The new T11 R6 test reached the W7 runner but its terminal assertions were not yet the focused red gate.
- **Next unchecked checkbox:** `Step 2 — add bounded test-only observation`.

### Checkpoint — 2026-09-12 02:55 HKT

- **State:** R8C Steps 1–4 are green and reviewed; child commit is the next atomic action.
- **Last command / result:** `fnm exec --using 22.18.0 pnpm --dir web test:storybook` — `PASS; 10 files / 94 tests`; `fnm exec --using 22.18.0 pnpm test:t11:storybook` — `PASS; 126 tests across 9 W7 widths`; web typecheck, oxfmt, and `git diff --check` — `PASS`.
- **Active finding:** Schedule evidence now labels server response identity truthfully, Settings conflict records the existing two-PATCH re-entry flow, and T11 executes all four R6 Plays; no production/API/baseline change is present.
- **Next unchecked checkbox:** `Step 5 — commit once`.

### Checkpoint — 2026-09-12 02:57 HKT

- **State:** First R8C commit attempt was blocked by the repository typecheck, not by the bounded behavior gates.
- **Last command / result:** `fnm exec --using 22.18.0 git commit -m "test(programs): complete fixed-point behavior evidence"` — `BLOCKED; tests/e2e/t11-storybook.test.ts:493 used an unsupported Playwright getByText option`; the hook made no commit. The assertion was corrected to a typed locator filter, then root/e2e typecheck, oxfmt, and diff check passed.
- **Active finding:** R8C remains REVIEWING with exactly one intended commit still outstanding; no production/API/baseline change is present.
- **Next unchecked checkbox:** `Step 5 — commit once`.

### Checkpoint — 2026-09-12 02:59 HKT

- **State:** R8C child commit is present; the packet and tracker are being closed without changing the bounded implementation scope.
- **Commit verification:** `git log --format='%H%x09%s' ca63fc143602f5e99cfe620d464e18477c9a3671..HEAD` returns exactly one matching subject: `test(programs): complete fixed-point behavior evidence`.
- **Final gates:** Storybook `94/94`; R6 T11 `9/9` across the nine W7 widths; root/e2e typecheck, web typecheck, oxfmt, and `git diff --check` pass. The earlier full T11 run's post-81 cascade was `ERR_CONNECTION_REFUSED` after the dev server exited; it was not treated as a behavior failure.
- **Final boundary:** R8C is COMPLETE; Active Task is `NONE`. R8 remains BLOCKED and must restart from a fresh candidate freeze after the owner Contract Change and owner Storybook spot-check authority are supplied.
