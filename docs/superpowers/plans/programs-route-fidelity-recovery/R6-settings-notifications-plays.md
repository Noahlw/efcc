# R6 — Prove Settings and Notifications Behaviors

> Load this packet only when the [master tracker](../2026-09-11-programs-route-fidelity-recovery-tracker.md) marks R6 ACTIVE and R5 is COMPLETE. Read the master Global Constraints, Claim and Update Protocol, and Cold Resume Contract first. Mutable task status lives only in the master ledger.

**Outcome:** Route-backed material Stories prove Settings dirty/conflict recovery and Notifications retry/unread/mark-read behavior while preserving one notification resource and existing focus/announcement contracts.

## Files

- Modify: `web/.storybook/programs-material-states.stories.tsx`
- Modify: `web/.storybook/programs-fixtures.ts`
- Modify: `web/.storybook/programs-presentation-contract.test.ts`
- Modify: `tests/e2e/t11-storybook.test.ts`
- Verify: `web/lib/programs/program-settings.test.tsx`
- Verify: `web/lib/programs/programs-notifications.test.tsx`
- Update: master tracker and this packet

## Behavior Contract

- `WorkspaceSettingsDirty` enters `設定 -> 課程基本資料`, changes a field, proves dirty state, exercises Back/Cancel according to the existing confirmation contract, and returns without silently persisting discarded edits.
- `WorkspaceSettingsConflict` submits an edited field, receives the existing 409 `CONFLICT`, keeps the user's draft visible, announces the conflict, and exposes the existing reload/retry path rather than overwriting server state.
- `NotificationsEmptyRecoverable` receives 503 first, renders the recoverable error, retries, then renders the explicit empty state.
- `NotificationsUnread` renders three unread plus earlier/read content, activates one notification through its existing route target, marks it read through the existing endpoint, updates unread count, and does not mount a duplicate compact/full resource.
- Stateful MSW responses and counters are created per scenario invocation. Settings conflict uses PATCH `/api/v1/programs/:programId`; Notifications uses GET `/api/v1/programs/notifications` and POST `/api/v1/programs/notifications/read`. Existing auth redirect, department/hash links, live announcements, and focus behavior remain production-owned.

## Steps

- [x] **Step 1: Claim R6 and add the Play inventory regression.** Run the master preflight and record the start SHA. Require custom Plays for dirty Settings, conflict Settings, recoverable-empty Notifications, and unread Notifications; associate each with its exact behavior seam. Complete when current generic readiness Plays fail the inventory.

- [x] **Step 2: Add stateful Settings/Notifications fixture regressions.** Pin a fresh 409 conflict sequence, first-503-then-empty retry sequence, and unread-to-read sequence using existing endpoints and response types. Complete when factories reset between invocations and every mutation/read response has an authoritative subsequent projection.

- [x] **Step 3: Prove dirty and conflict Settings.** Add Plays that enter Course Data, edit a field, assert dirty/Back behavior, and separately submit into the 409 path while retaining the draft and exposing the existing recovery control/announcement. Complete when both flows prove behavior after interaction, not just initial headings.

- [x] **Step 4: Prove Notifications retry and mark-read.** Add one Play for 503 -> Retry -> explicit empty, and one for dense unread -> activate/mark read -> decremented count/read styling. Assert no duplicate bell/resource appears on the full Notifications task. Complete when both server response sequences and visible outcomes are checked.

- [x] **Step 5: Run Story and focused gates.** Run `fnm exec --using 22.18.0 pnpm --dir web test:t07:foundation`, `fnm exec --using 22.18.0 pnpm --dir web test:storybook`, `fnm exec --using 22.18.0 pnpm test:t11:storybook`, and `fnm exec --using 22.18.0 pnpm --dir web exec vitest run --config vitest.components.config.ts lib/programs/program-settings.test.tsx lib/programs/programs-notifications.test.tsx`. Complete when static inventory, all R6 Plays, focused components, and T11 pass.

- [x] **Step 6: Handle a production defect by disclosure.** If Step 5 exposes a production contract defect, create the bounded `R6A-settings-back-interception.md` child packet, insert it after R6 in the master ledger, mark R6 `BLOCKED`, and stop. Complete when either production already satisfies the contract or the inserted packet owns one bounded component/test pair, red assertion, gate, and unique commit subject.

- [x] **Step 7: Run type and one-resource checks.** Run `fnm exec --using 22.18.0 pnpm --dir web typecheck` and inspect the route composition to confirm the full Notifications task omits the compact trigger while other management screens own exactly one compact surface. Complete when typecheck passes and one-resource ownership is evidenced.

- [x] **Step 8: Review the R6 diff.** Compare against the R6 start SHA, run `git diff --check`, verify factory-local state and exact endpoints, and confirm no conflict resolution or unread count is calculated solely in Story code. Complete when every changed line is Story/test evidence and no generic readiness callback remains for R6.

- [x] **Step 9: Commit and close R6.** Check all boxes, append the final checkpoint, update the master ledger, and commit the changed Story/test files plus tracker updates with `test(programs): exercise settings and notification seams`. Complete when exactly one matching subject exists after the R6 start SHA, R6 is `COMPLETE`, `Active Task` is `NONE`, and the ledger records green gates.

## Completion Criterion

R6 is complete only when route-backed Plays prove dirty-state return, conflict recovery, 503 retry-to-empty, unread-to-read behavior, and one notification resource; focused components, Storybook, T11, and typecheck are green at the committed SHA; and any production defect is disclosed into a separate packet.

## Checkpoint Log

- 2026-09-11 plan authoring: R6 procedure created; no implementation attempted; prerequisite is R5 COMPLETE; next unchecked item is Step 1.

### Checkpoint — 2026-09-11 19:36 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `f32f5082f1628c0ba7f74b10f14bd4d99cd1b03e`
- Dirty paths: this packet and the master tracker (claim/update only)
- Last completed checkbox: `none; R6 claim/preflight`
- Last command / result: live local/remote/PR preflight — `PASS; local HEAD f32f5082, remote wave-3 9ad90d25, PR #607 OPEN on wave-2 base, worktree clean before claim, no remote write`
- Active finding: R5 is COMPLETE and R6 is the only active packet; no Settings/Notifications implementation has started.
- Next unchecked checkbox: `Step 1 — claim R6 and add the Play inventory regression`

### Checkpoint — 2026-09-11 19:52 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `f32f5082f1628c0ba7f74b10f14bd4d99cd1b03e`
- Dirty paths: master tracker, this packet, R6A packet, and the three R6 Story/fixture/contract files
- Last completed checkbox: `Step 4 — prove Notifications retry and mark-read`
- Last command / result: targeted R6 Storybook Plays, T07 contract, and Screen Foundations component test — `PASS; 4 R6 Plays, 18 contract tests, 9 Screen Foundations tests`; prior Chromium red recorded above
- Active finding: The shared production `ScreenHeader` Back link now returns Settings to its hub through capture-phase interception; R6A owns the pending review/commit boundary.
- Next unchecked checkbox: `R6 Step 5 — run the complete Story/focused gate after R6A closes`

### Checkpoint — 2026-09-11 19:58 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `f32f5082f1628c0ba7f74b10f14bd4d99cd1b03e`
- Dirty paths: master tracker, this packet, R6A packet, the three R6 Story/fixture/contract files, and the two Screen Foundations production/test files
- Last completed checkbox: `Step 4 — prove Notifications retry and mark-read`
- Last command / result: R6A bounded diff review plus `git diff --check` — `PASS; child repair is scoped and R6A closeout is ready for its unique commit`
- Active finding: R6A resolved the shared Back seam and is ready to commit; R6 resumes at its complete Story/focused gate with its existing Start SHA `f32f5082`.
- Next unchecked checkbox: `Step 5 — run Story and focused gates`

### Checkpoint — 2026-09-11 20:25 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `4e333cbeabfb5d8c47a7d0dc71f5da4dfc6ab221`
- Dirty paths: `tests/e2e/t11-storybook.test.ts`; `web/.storybook/programs-fixtures.ts`; `web/.storybook/programs-material-states.stories.tsx`; `web/.storybook/programs-presentation-contract.test.ts`
- Last completed checkbox: `Step 8 — review the R6 diff`; `Step 9 — prepare the closeout commit`
- Last command / result: full R6 gates, one-resource source inspection, `git diff f32f5082.. --check`, and bounded diff review — `PASS; T07 foundation 64/64, R6 Plays 4/4, contract 18/18, focused Settings/Notifications 28/28, Storybook 94/94, T11 117/117 across 9 W7 viewports, and web typecheck pass`
- Active finding: R6 contains only the four scoped Story/fixture/contract/T11 harness files; fixture state is factory-local with exact PATCH/GET/POST endpoints, and the full Notifications route renders the full feed without the compact bell while workspace/directory routes each receive one compact surface.
- Next unchecked checkbox: `none; verify the unique R6 commit subject after the closeout commit`
