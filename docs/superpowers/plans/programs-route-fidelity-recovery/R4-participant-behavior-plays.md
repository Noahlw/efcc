# R4 — Prove Participant and Route Behaviors

> Load this packet only when the [master tracker](../2026-09-11-programs-route-fidelity-recovery-tracker.md) marks R4 ACTIVE and R3 is COMPLETE. Read the master Global Constraints, Claim and Update Protocol, and Cold Resume Contract first. Mutable task status lives only in the master ledger.

**Outcome:** Route-backed material Stories execute participant-mode, Back, enrollment lifecycle, Event gate, and Department Settings behaviors. Generic readiness is no longer accepted as evidence for these seams.

## Files

- Modify: `web/.storybook/programs-material-states.stories.tsx`
- Modify: `web/.storybook/programs-fixtures.ts`
- Modify: `web/.storybook/programs-presentation-contract.test.ts`
- Modify: `tests/e2e/t11-storybook.test.ts`
- Verify: `web/lib/programs/participant-enrollment.test.tsx`, `web/lib/programs/participant-event-detail-page.test.tsx`, `web/lib/programs/management-directory.test.tsx`
- Update: master tracker and this packet

## Behavior Contract

- `ParticipantDirectoryCapable` begins on participant intent, exposes the existing management-mode destination, and proves that activating it targets `/programs?mode=management` without changing the baseline identity.
- Program Detail Back targets `/programs`; Event Detail Back targets its Program Detail intent `/programs?program=t07-3-program&from=programs`, subject to the existing history interception contract.
- `participant-program-detail-eligible` can enroll. Active can leave/cancel only through the existing confirmation/mutation. Pending can withdraw its request. Rejected/Withdrawn shows result plus only the existing server-permitted next action.
- Each mutation scenario owns a fresh in-memory MSW state machine: participant-detail GET; enroll POST `/api/v1/programs/:programId/enrollment-requests`; pending-withdraw POST `/api/v1/programs/:programId/enrollment-requests/:requestId/withdraw`; active-cancel POST `/api/v1/programs/:programId/enrollments/:enrollmentId/cancel`; returned server-shaped record; and subsequent participant-detail GET. State never leaks between Story invocations.
- Closed Event has no scanner/check-in CTA. Open Event has exactly one existing scanner-intent CTA. Forbidden/ineligible renders the existing error surface with no CTA.
- `ManagementDirectoryMixed` proves the one compact Department Settings action; with multiple authorized departments it opens the picker, selects one department, opens its existing panel, closes, and restores focus.

## Steps

- [x] **Step 1: Claim R4 and add the Play inventory regression.** Run the master preflight and record the start SHA. Extend the Story contract test so the capable Directory, eligible/active/pending/rejected Program Detail, closed/open/ineligible Event Detail, and mixed Management Directory exports must each define a named custom Play contract rather than inherit the default readiness callback. Complete when the current generic Plays fail the inventory.

- [x] **Step 2: Add stateful fixture regressions.** Pin fresh handler state for enroll, active cancellation, pending withdrawal, and any rejected-to-eligible next action. Require the exact existing endpoints and a post-mutation GET projection. Complete when tests demonstrate that state resets per `getProgramsStoryScenario(...)` call and current stateless handlers fail.

- [x] **Step 3: Write participant route Plays.** Add Play assertions for participant-capable mode destination, Program/Event Back targets, and the initial visual/status state for eligible, Active, Pending, and Rejected/Withdrawn. Complete when every route/history assertion has a named Story and exact destination/status.

- [x] **Step 4: Write enrollment mutation Plays.** For eligible, activate enroll and assert the server-returned pending/active result required by the existing API; for Active, pass confirmation then assert cancelled state; for Pending, pass confirmation then assert withdrawn state. Complete when each Play proves one mutation, one resulting projection, and the absence of disallowed sibling actions.

- [x] **Step 5: Write Event and Department Settings Plays.** Assert closed/no CTA, open/exactly one scanner-intent CTA, forbidden/error/no CTA; then exercise the compact Department Settings picker, selection, panel close, and focus return. Complete when the four seams are interaction evidence rather than readiness-only checks.

- [x] **Step 6: Run the Story red/green loop.** Run `fnm exec --using 22.18.0 pnpm --dir web test:t07:foundation`, `fnm exec --using 22.18.0 pnpm --dir web test:storybook`, and `fnm exec --using 22.18.0 pnpm test:t11:storybook`. Complete when static inventory, Story Plays, and T11 pass with every R4 behavior executed, or one exact production defect is isolated for Step 7.

- [x] **Step 7: Disclose any production defect, then run focused safety.** If Step 6 exposes a production defect, create `R4A-participant-production-defect.md`, insert it after R4 in the master ledger, give it one affected component/test pair, a red assertion, gate, and unique commit subject, mark R4 `BLOCKED`, and stop. Otherwise run the three focused component tests and `fnm exec --using 22.18.0 pnpm --dir web typecheck`. Complete when either the inserted packet fully describes the blocker or all focused component and type checks pass.

- [x] **Step 8: Review the R4 diff.** Compare against the R4 start SHA, run `git diff --check`, confirm stateful handlers are factory-local, and confirm no production file changed in R4. Complete when no Story directly renders a leaf component, no client-side domain rule was invented, and no readiness-only seam remains.

- [x] **Step 9: Commit and close R4.** Check all boxes, append the final checkpoint, update the master ledger, and commit the listed changed files plus tracker updates with `test(programs): exercise participant route seams`. Complete when exactly one matching subject exists after the R4 start SHA, R4 is `COMPLETE`, `Active Task` is `NONE`, and the ledger records green gates.

## Completion Criterion

R4 is complete only when route-backed Plays prove participant-capable mode routing, Back, eligible/Active/Pending/Rejected behavior, mutation outcomes, closed/open/forbidden Event gating, and Department Settings picker/focus behavior, with Storybook, T11, focused components, and type checks green at the committed SHA.

## Checkpoint Log

- 2026-09-11 plan authoring: R4 procedure created; no implementation attempted; prerequisite is R3 COMPLETE; next unchecked item is Step 1.

### Checkpoint — 2026-09-11 17:39 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `1529e5f8d51c56c9e2c20aebfe0a3c99f97cb8c3`
- Dirty paths: `docs/superpowers/plans/2026-09-11-programs-route-fidelity-recovery-tracker.md`, `docs/superpowers/plans/programs-route-fidelity-recovery/R3-directory-and-copy-fidelity.md`, and this packet (claim/update only)
- Last completed checkbox: `Step 1 — claim R4 and add the Play inventory regression` (claim/preflight portion complete; regression edit is next)
- Last command / result: live branch/status/remote/PR verification plus exact R3 commit-subject check — `PASS; R3 is complete once, remote and PR #607 are unchanged`
- Active finding: R4 is claimed at the verified R3 HEAD; no production edits have started, and the first required red check is the material-Story custom Play inventory.
- Next unchecked checkbox: `Step 1 — claim R4 and add the Play inventory regression`

### Checkpoint — 2026-09-11 17:44 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `1529e5f8d51c56c9e2c20aebfe0a3c99f97cb8c3`
- Dirty paths: `docs/superpowers/plans/2026-09-11-programs-route-fidelity-recovery-tracker.md`, this packet, and `web/.storybook/programs-presentation-contract.test.ts`
- Last completed checkbox: `Step 1 — claim R4 and add the Play inventory regression`
- Last command / result: `fnm exec --using 22.18.0 pnpm --dir web exec vitest run --config vitest.t07.config.ts .storybook/programs-presentation-contract.test.ts` — `EXPECTED FAIL; 1 failed / 7 passed, only the new named-Play inventory assertion failed on ParticipantDirectoryCapable`
- Active finding: Target material Stories still inherit the generic readiness callback; the regression is isolated to Story contract inventory and no production code changed.
- Next unchecked checkbox: `Step 2 — add stateful fixture regressions`

### Checkpoint — 2026-09-11 18:25 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `1529e5f8d51c56c9e2c20aebfe0a3c99f97cb8c3`
- Dirty paths: `docs/superpowers/plans/2026-09-11-programs-route-fidelity-recovery-tracker.md`, `docs/superpowers/plans/programs-route-fidelity-recovery/R3-directory-and-copy-fidelity.md`, this packet, `tests/e2e/t11-storybook.test.ts`, `web/.storybook/programs-fixtures.ts`, `web/.storybook/programs-material-states.stories.tsx`, and `web/.storybook/programs-presentation-contract.test.ts`
- Last completed checkbox: `Step 8 — review the R4 diff`
- Last command / result: `fnm exec --using 22.18.0 pnpm test:t11:storybook` — `PASS; 108/108 across 9 W7 viewports`; foundation `58/58`, Storybook `94/94`, focused participant components `51/51`, root/web typechecks, formatter, and `git diff --check` also pass
- Active finding: Stateful MSW factories are invocation-local and project the returned server records through participant-detail GET; named Plays cover mode destination, Program/Event Back targets, enrollment lifecycle, Event CTA gates, and Department Settings picker/focus. No production file changed. The first Step 2 red attempt hit an absolute-fetch/MSW URL matching setup issue and is not claimed as a clean base red; the resulting factory-local regression is green.
- Next unchecked checkbox: `Step 9 — commit and close R4`

### Checkpoint — 2026-09-11 18:52 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `1529e5f8d51c56c9e2c20aebfe0a3c99f97cb8c3`
- Dirty paths: this packet, the master tracker, `tests/e2e/t11-storybook.test.ts`, `web/.storybook/programs-fixtures.ts`, `web/.storybook/programs-material-states.stories.tsx`, and `web/.storybook/programs-presentation-contract.test.ts`; R3 packet restored clean and excluded from R4.
- Last completed checkbox: `Step 9 — commit and close R4`
- Last command / result: `fnm exec --using 22.18.0 pnpm --dir web exec vitest run --config vitest.t07.config.ts .storybook/programs-presentation-contract.test.ts`, `fnm exec --using 22.18.0 pnpm --dir web test:t07:foundation`, `fnm exec --using 22.18.0 pnpm --dir web test:storybook`, `fnm exec --using 22.18.0 pnpm test:t11:storybook`, focused participant components, `fnm exec --using 22.18.0 pnpm verify:fast`, formatter, and `git diff --check` — `PASS; 13 contract tests, 59 foundation tests, 94 Storybook tests, 108 T11 tests across 9 W7 viewports, 51 focused component tests, and all type checks green`
- Active finding: invocation-local MSW loaders, route-backed named Story Plays, and browser-level DOM activation now cover every R4 behavior seam; no production file changed and no remote write occurred.
- Next unchecked checkbox: `none; verify the matching commit after commit`
