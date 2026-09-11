# R3 — Align Directory and Schedule Copy

> Load this packet only when the [master tracker](../2026-09-11-programs-route-fidelity-recovery-tracker.md) marks R3 ACTIVE and R2 is COMPLETE. Read the master Global Constraints, Claim and Update Protocol, and Cold Resume Contract first. Mutable task status lives only in the master ledger.

**Outcome:** The normal Management Directory opens on the aggregate authorized catalog with one compact prototype-style `部門設定` action; multiple scopes use a focused picker. Schedule uses the approved `新增規則` label.

**Original authority:** Original correction plan Task 3 Steps 3, 8, and 9; frozen `04-management-directory.html` and `07-management-schedule.html`.

## Files

- Modify: `web/lib/programs/management-directory.tsx`
- Modify: `web/lib/programs/management-directory.test.tsx`
- Modify: `web/lib/copy.ts`
- Modify: `web/lib/programs/program-settings.test.tsx`
- Update: master tracker and this packet

## Interface Contract

- Keep `ManagementDirectoryProps` and `projectManagementPrograms(...)` unchanged.
- Replace the normal-route per-department launcher row with a local `DepartmentSettingsAction` that consumes `departments: readonly Department[]` and `onOpenProgram: (programId: string, created?: boolean) => void`.
- Zero authorized department scopes render no Department Settings action. One scope opens the existing `DepartmentSettingsPanel` directly. Multiple scopes first render a focused, keyboard-operable picker; choosing one opens that department's existing panel. Closing returns focus to the compact trigger.
- Put the single trigger in `ScreenSection.action` for the aggregate catalog. Preserve the separate `departmentOnly` route/compatibility surface and explicit `departmentId` narrowing.
- `COPY.programs.addRule` is exactly `新增規則`; existing error messages may continue to say that adding a schedule failed when they describe the operation rather than the button label.

## Steps

- [ ] **Step 1: Claim R3 and write the aggregate-directory regressions.** Run the master preflight and record the start SHA. In `management-directory.test.tsx`, assert that the normal route shows every authorized Program with department metadata, no `部門範圍` explainer, and exactly one `部門設定` action. Complete when the current per-department launcher row makes the test fail for the intended reason.

- [ ] **Step 2: Write zero/one/many scope regressions.** Assert zero scopes omit the action; one scope opens `DepartmentSettingsPanel`; multiple scopes open a focused picker, selecting a department opens its panel, and close restores trigger focus. Also retain explicit `departmentId` narrowing and `departmentOnly` compatibility assertions. Complete when all authorization/picker branches have binary expected behavior before production edits.

- [ ] **Step 3: Write the Schedule copy regression.** In `program-settings.test.tsx`, assert the Schedule overview and focused-create heading use `COPY.programs.addRule === "新增規則"`. Complete when the current `新增時間表` value fails the assertion.

- [ ] **Step 4: Run the focused red slice.** Run `fnm exec --using 22.18.0 pnpm --dir web exec vitest run --config vitest.components.config.ts lib/programs/management-directory.test.tsx lib/programs/program-settings.test.tsx`. Complete when failures are limited to the persistent scope launchers/picker absence and copy mismatch.

- [ ] **Step 5: Implement the compact action/picker.** Use `ScreenSection.action`, the existing `DepartmentSettingsPanel`, existing authorized `scopedDepartments`, and local focus state. Keep the aggregate list as `filteredRows`; never query, infer, or broaden management scope client-side. Complete when normal route content begins with search/catalog rather than a launcher row and the zero/one/many flows match the interface contract.

- [ ] **Step 6: Correct the approved label.** Set `COPY.programs.addRule` to `新增規則` and make no unrelated copy rewrite. Complete when every existing consumer receives the new approved label through the shared key.

- [ ] **Step 7: Run focused and Story green.** Re-run Step 4, then run `fnm exec --using 22.18.0 pnpm --dir web test:storybook` and `fnm exec --using 22.18.0 pnpm --dir web typecheck`. Complete when component, Story, and type checks pass.

- [ ] **Step 8: Review the R3 diff.** Compare against the R3 start SHA, run `git diff --check`, and verify no authorization/API/interface widening, no persistent multi-button chooser, and no unrelated copy churn. Complete when every changed line maps to the known directory or label defect.

- [ ] **Step 9: Commit and close R3.** Check all boxes, append the final checkpoint, update the master ledger, and commit the listed changes plus tracker updates with `fix(programs): align directory and schedule copy`. Complete when exactly one matching subject exists after the R3 start SHA, R3 is `COMPLETE`, `Active Task` is `NONE`, and the ledger records green gates.

## Completion Criterion

R3 is complete only when aggregate Management Directory has exactly one compact authorized Department Settings entry with correct zero/one/many behavior, explicit narrowing remains intact, the Schedule action says `新增規則`, and focused component/Story/type gates pass at the committed SHA.

## Checkpoint Log

- 2026-09-11 plan authoring: R3 procedure created; no implementation attempted; prerequisite is R2 COMPLETE; next unchecked item is Step 1.
