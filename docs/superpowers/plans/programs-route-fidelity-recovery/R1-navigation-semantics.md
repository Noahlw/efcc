# R1 — Restore Navigation Semantics

> Load this packet only when the [master tracker](../2026-09-11-programs-route-fidelity-recovery-tracker.md) marks R1 ACTIVE. Read its Global Constraints, Claim and Update Protocol, and Cold Resume Contract before acting. Mutable task status lives only in the master ledger.

**Outcome:** Workspace route links expose one named `navigation` landmark with `link` descendants, while the Participants in-page switcher explicitly retains `tablist`/`tab` semantics. The real Programs responsive matrix passes again.

**Original authority:** `docs/superpowers/plans/2026-09-11-programs-prototype-route-fidelity-correction.md` sections “Global Constraints”, Task 2 shell semantics, and Task 5 real-route acceptance. Current failure evidence is in `docs/qa/2026-09-11-programs-route-fidelity-correction.md` under `test:programs:responsive`.

## Files

- Modify: `web/lib/screen-foundations.tsx`
- Modify: `web/lib/screen-foundations.test.tsx`
- Modify: `web/lib/programs/workspace-participants-task.tsx`
- Modify: `web/lib/programs/program-workspace.test.tsx`
- Modify: `web/lib/programs/programs-management-boundary.test.tsx`
- Verify without weakening: `tests/e2e/programs-responsive-matrix.test.ts`
- Update: master tracker and this packet

## Interface Contract

- `ScreenTabs(props: React.ComponentPropsWithoutRef<"nav">)` remains a native `nav`, forwards a caller-supplied `role`, and has no implicit `tablist` role.
- `ScreenTab(props: ScreenTabProps)` keeps visual selected-state styling. An `asChild` navigation link has no implicit `tab` role or `aria-selected` and uses `aria-current="page"` only when selected; an explicit/local `role="tab"` uses `aria-selected` and omits `aria-current`.
- `WorkspaceNavigation` remains route navigation. The Participants pending/active/history control passes `role="tablist"` explicitly and its buttons remain tabs.

## Steps

- [x] **Step 1: Claim R1 and reproduce the real failure.** Run the master preflight, record the exact start SHA, then run `fnm exec --using 22.18.0 pnpm test:programs:responsive`. Complete when the checkpoint records the missing `navigation` named `管理工作` as the intended failure, or records a different exact blocker before edits.

- [x] **Step 2: Write the component regression.** In `screen-foundations.test.tsx`, split route navigation from local tabs: assert a native `ScreenTabs` containing `asChild` anchors is discoverable as `navigation` with `link` children and selected `aria-current="page"`; assert an explicitly declared local `role="tablist"` still contains `tab` buttons with `aria-selected`. In `program-workspace.test.tsx`, require `navigation`/`link` for workspace destinations. Complete when the assertions describe both semantic branches without changing production.

- [x] **Step 3: Prove red locally.** Run `fnm exec --using 22.18.0 pnpm --dir web exec vitest run --config vitest.components.config.ts lib/screen-foundations.test.tsx lib/programs/program-workspace.test.tsx`. Complete when it fails because the current route control reports `tablist`/`tab`, not because of setup or unrelated tests.

- [x] **Step 4: Implement the minimum semantic split.** Remove the hard-coded `tablist` role from `ScreenTabs`; make `ScreenTab` apply tab-only ARIA only to explicit/local tabs; add `role="tablist"` to the Participants pending/active/history `ScreenTabs`. Preserve classes, overflow behavior, selected styling, keyboard-native button behavior, and 44px targets. Complete when source inspection shows route links and local tabs use distinct explicit semantics.

- [x] **Step 5: Run focused green.** Re-run the Step 3 command. Complete when both files pass and the new navigation and local-tab assertions are green.

- [x] **Step 6: Run the route regression gate.** Run `fnm exec --using 22.18.0 pnpm test:programs:responsive`. Complete when participant catalog/detail and management settings all pass, including `navigation` named `管理工作` and its route links.

- [x] **Step 7: Review the R1 diff.** Inspect `git diff <R1-start-sha> --` for only the listed code/test/tracker files; run `git diff --check`; search the changed files for lint suppressions. Complete when every change is explained and there is no weakened E2E assertion or unrelated formatting churn.

- [x] **Step 8: Commit and close R1.** Check all boxes, append the final checkpoint, update the master ledger, and stage the nine tracker files plus the R1 code/tests. Commit with `fix(programs): restore navigation semantics`. Complete when exactly one matching subject exists after the R1 start SHA, the ledger records green gates, R1 is `COMPLETE`, and `Active Task` is `NONE`.

## Completion Criterion

R1 is complete only when route navigation is exposed as `navigation`/`link`, local Participants tabs remain `tablist`/`tab`, the focused components and full Programs responsive matrix pass at the committed R1 SHA, and the master ledger agrees with git.

## Checkpoint Log

- 2026-09-11 plan authoring: R1 procedure created; no implementation attempted; expected start HEAD is `51baa5d28c2f73b690827f13f2af628933ce3b74`; next unchecked item is Step 1.

### Checkpoint — 2026-09-11 15:24 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `51baa5d28c2f73b690827f13f2af628933ce3b74`
- Dirty paths: `docs/superpowers/plans/2026-09-11-programs-route-fidelity-recovery-tracker.md`; this packet file; remaining seven packet files are expected untracked plan artifacts
- Last completed checkbox: `Step 1 claim — R1 claimed from the audited recovery anchor`
- Last command / result: `git status --short --branch`, `git rev-parse HEAD`, `git log --oneline --decorate -10`, and `gh pr view 607 --json number,state,headRefName,headRefOid,baseRefName,statusCheckRollup,url` — `PASS; live state matches the tracker anchor`
- Active finding: `HEAD` is the clean local five-commit candidate, PR #607 remains open with remote head `9ad90d253bfd50bf2bbcea85f39c18c1587b1f88`, and no tracked implementation files are dirty.
- Next unchecked checkbox: `Step 1 — reproduce the real responsive navigation failure`

### Checkpoint — 2026-09-11 15:25 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `51baa5d28c2f73b690827f13f2af628933ce3b74`
- Dirty paths: `docs/superpowers/plans/2026-09-11-programs-route-fidelity-recovery-tracker.md`; this packet file; remaining seven packet files are expected untracked plan artifacts
- Last completed checkbox: `Step 1 — claim R1 and reproduce the real failure`
- Last command / result: `fnm exec --using 22.18.0 pnpm test:programs:responsive` — `EXPECTED FAIL; report test-results/programs-responsive/20260911t072453219z/responsive-results.json`
- Active finding: all three responsive projects fail at `getByRole('navigation', { name: '管理工作' })` because the current route control exposes no matching navigation landmark; the failure is the intended R1 defect.
- Next unchecked checkbox: `Step 2 — write the component regression`

### Checkpoint — 2026-09-11 15:26 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `51baa5d28c2f73b690827f13f2af628933ce3b74`
- Dirty paths: `web/lib/screen-foundations.test.tsx`; `web/lib/programs/program-workspace.test.tsx`; `web/lib/screen-foundations.tsx`; `web/lib/programs/workspace-participants-task.tsx`; tracker and expected packet files
- Last completed checkbox: `Step 2 — write the component regression`
- Last command / result: `git diff -- web/lib/screen-foundations.tsx web/lib/screen-foundations.test.tsx web/lib/programs/workspace-participants-task.tsx web/lib/programs/program-workspace.test.tsx` — `PASS; route and local-tab assertions account for each semantic branch`
- Active finding: focused tests now require route workspace links to be `navigation`/`link` with `aria-current`, while participant controls explicitly retain `tablist`/`tab` and `aria-selected`.
- Next unchecked checkbox: `Step 3 — prove red locally`

### Checkpoint — 2026-09-11 15:30 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `51baa5d28c2f73b690827f13f2af628933ce3b74`
- Dirty paths: `web/lib/screen-foundations.test.tsx`; `web/lib/programs/program-workspace.test.tsx`; tracker and expected packet files; production files restored to the R1 start semantics for genuine red reproduction
- Last completed checkbox: `Step 3 — prove red locally`
- Last command / result: `fnm exec --using 22.18.0 pnpm --dir web exec vitest run --config vitest.components.config.ts lib/screen-foundations.test.tsx lib/programs/program-workspace.test.tsx` — `EXPECTED FAIL; 4 semantic failures, 45 passed; no setup failure`
- Active finding: the unchanged implementation exposes workspace route nav as `tablist` and route anchors as `tab`, so the new navigation/link contract fails for the intended reason.
- Next unchecked checkbox: `Step 4 — implement the minimum semantic split`

### Checkpoint — 2026-09-11 15:30 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `51baa5d28c2f73b690827f13f2af628933ce3b74`
- Dirty paths: `web/lib/screen-foundations.tsx`; `web/lib/programs/workspace-participants-task.tsx`; component tests; tracker and expected packet files
- Last completed checkbox: `Step 4 — implement the minimum semantic split`
- Last command / result: `rg -n -C 3 'ScreenTabs|isTab|aria-selected|aria-current|role="tablist"' web/lib/screen-foundations.tsx web/lib/programs/workspace-participants-task.tsx` — `PASS; route and local-tab branches are explicit in source`
- Active finding: `ScreenTabs` no longer imposes `tablist`; `ScreenTab` gives only explicit `role="tab"` the tab state contract; Participants supplies the local `tablist` role.
- Next unchecked checkbox: `Step 5 — run focused green`

### Checkpoint — 2026-09-11 15:31 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `51baa5d28c2f73b690827f13f2af628933ce3b74`
- Dirty paths: `web/lib/screen-foundations.tsx`; `web/lib/programs/workspace-participants-task.tsx`; component tests; tracker and expected packet files
- Last completed checkbox: `Step 5 — run focused green`
- Last command / result: `fnm exec --using 22.18.0 pnpm --dir web exec vitest run --config vitest.components.config.ts lib/screen-foundations.test.tsx lib/programs/program-workspace.test.tsx` — `PASS; 2 files, 49 tests`
- Active finding: route navigation and explicit local Participants tabs now satisfy their separate accessibility contracts in focused component coverage.
- Next unchecked checkbox: `Step 6 — run the route regression gate`

### Checkpoint — 2026-09-11 15:33 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `51baa5d28c2f73b690827f13f2af628933ce3b74`
- Dirty paths: `web/lib/screen-foundations.tsx`; `web/lib/programs/workspace-participants-task.tsx`; component tests; tracker and expected packet files
- Last completed checkbox: `Step 7 — review the R1 diff`
- Last command / result: `git diff --check`; added-line suppression scan; expected packet inventory — `PASS; no whitespace errors, no new lint suppression, no unexplained R1 code/test path`
- Active finding: the R1 diff contains only the navigation semantic split, its focused assertions, explicit Participants tablist ownership, and recovery ledger/checkpoint documents.
- Next unchecked checkbox: `Step 8 — commit and close R1`

### Checkpoint — 2026-09-11 15:39 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `51baa5d28c2f73b690827f13f2af628933ce3b74`
- Dirty paths: staged R1 code/tests and tracker/packet files
- Last completed checkbox: `Step 8 — prepare the corrected R1 closeout`
- Last command / result: `git diff --cached --check`; focused/full component and responsive reruns — `PASS; corrected downstream route assertion is included and the unique commit subject is ready to retry`
- Active finding: R1 has no remaining unchecked acceptance step; the append-only commit is the next atomic operation, after which git history must verify exactly one matching subject after the start SHA.
- Next unchecked checkbox: `none; verify the unique commit subject after commit`

### Checkpoint — 2026-09-11 15:32 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `51baa5d28c2f73b690827f13f2af628933ce3b74`
- Dirty paths: `web/lib/screen-foundations.tsx`; `web/lib/programs/workspace-participants-task.tsx`; component tests; tracker and expected packet files
- Last completed checkbox: `Step 6 — run the route regression gate`
- Last command / result: `fnm exec --using 22.18.0 pnpm test:programs:responsive` — `PASS; target http://127.0.0.1:65360; report test-results/programs-responsive/20260911t073118641z/responsive-results.json`
- Active finding: the real Programs responsive matrix now finds `navigation` named `管理工作` and its route links across the participant and management settings cases.
- Next unchecked checkbox: `Step 7 — review the R1 diff`

### Checkpoint — 2026-09-11 15:34 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `51baa5d28c2f73b690827f13f2af628933ce3b74`
- Dirty paths: `web/lib/screen-foundations.tsx`; `web/lib/programs/workspace-participants-task.tsx`; component tests; tracker and expected packet files
- Last completed checkbox: `Step 7 — review the R1 diff`
- Last command / result: `git diff --check`; added-line suppression scan; expected packet inventory — `PASS; no whitespace errors, no new lint suppression, no unexplained R1 code/test path`
- Active finding: the R1 diff contains only the navigation semantic split, its focused assertions, explicit Participants tablist ownership, and recovery ledger/checkpoint documents.
- Next unchecked checkbox: `Step 8 — commit and close R1`

### Checkpoint — 2026-09-11 15:34 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `51baa5d28c2f73b690827f13f2af628933ce3b74`
- Dirty paths: `web/lib/screen-foundations.tsx`; `web/lib/programs/workspace-participants-task.tsx`; component tests; master tracker; eight recovery packet files
- Last completed checkbox: `Step 8 — prepare the R1 closeout commit`
- Last command / result: `git diff --check`; focused green; responsive matrix green; review scan — `PASS; closeout is staged next with the unique packet subject`
- Active finding: all R1 acceptance evidence is green at the dirty candidate, and the master ledger records `R1 COMPLETE` / `Active Task NONE`; the next atomic command is the append-only R1 commit.
- Next unchecked checkbox: `none; verify the unique commit subject after commit`

### Checkpoint — 2026-09-11 15:36 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `51baa5d28c2f73b690827f13f2af628933ce3b74`
- Dirty paths: staged R1 code/tests and tracker/packet files; `web/lib/programs/programs-management-boundary.test.tsx` now has one required route-role assertion correction
- Last completed checkbox: `Step 6 — run the route regression gate`; the prior Step 7/8 closeout was reopened after downstream component coverage exposed a stale route-role query
- Last command / result: `fnm exec --using 22.18.0 git commit -m 'fix(programs): restore navigation semantics'` — `BLOCKED by pre-commit: 68 component files / 1,019 tests ran with one failure at programs-management-boundary.test.tsx:223, still querying route link 聚會 as role tab`
- Active finding: the implementation correctly renders route navigation as `navigation`/`link`; the failing test is a downstream consumer assertion and the smallest correction is `tab` -> `link`.
- Next unchecked checkbox: `Step 7 — review the expanded R1 diff`, then retry Step 8 commit

### Checkpoint — 2026-09-11 15:38 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `51baa5d28c2f73b690827f13f2af628933ce3b74`
- Dirty paths: staged R1 code/tests and tracker/packet files
- Last completed checkbox: `Step 7 — review the expanded R1 diff`
- Last command / result: `fnm exec --using 22.18.0 pnpm --dir web exec vitest run --config vitest.components.config.ts` — `PASS; 69 files / 1,020 tests`; `fnm exec --using 22.18.0 pnpm test:programs:responsive` — `PASS; report test-results/programs-responsive/20260911t073743813z`; staged `git diff --check` and added-line suppression scan — `PASS`
- Active finding: the required downstream route assertion now matches `navigation`/`link`; all component and responsive evidence remains green after the correction, with no new suppression or unrelated diff.
- Next unchecked checkbox: `Step 8 — commit and close R1`
