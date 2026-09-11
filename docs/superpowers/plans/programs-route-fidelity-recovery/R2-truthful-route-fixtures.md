# R2 — Make Route Fixtures Truthful

> Load this packet only when the [master tracker](../2026-09-11-programs-route-fidelity-recovery-tracker.md) marks R2 ACTIVE and R1 is COMPLETE. Read the master Global Constraints, Claim and Update Protocol, and Cold Resume Contract first. Mutable task status lives only in the master ledger.

**Outcome:** Every retained baseline and material Story uses a route-appropriate, server-shaped scenario with realistic Cantonese density; the named scenario factory has correct meanings and no complexity suppression.

**Prototype authority:** `docs/design/programs-screen-foundations-v1/01-participant-directory-capable.html` through `10-management-notifications.html`. Preserve domain truth where sample text conflicts with actual API contracts.

## Files

- Modify: `web/.storybook/programs-fixtures.ts`
- Modify: `web/.storybook/programs-story-harness.tsx`
- Modify: `web/.storybook/programs.stories.tsx`
- Modify: `web/.storybook/programs-material-states.stories.tsx`
- Modify: `web/.storybook/programs-presentation-contract.test.ts`
- Modify: `web/.storybook/presentation-catalog.test.ts`
- Modify: `tests/e2e/t11-storybook.test.ts`
- Modify: `web/lib/programs/participant-event-detail-page.test.tsx`
- Update: master tracker and this packet

## Interface Contract

- Preserve `ProgramsStoryScenario { pathname: "/programs"; query: Readonly<Record<string, string>>; handlers: readonly RequestHandler[] }`.
- Preserve `getProgramsStoryScenario(name: ProgramsMaterialScenarioName): ProgramsStoryScenario`, but implement dispatch through an exhaustive `Readonly<Record<ProgramsMaterialScenarioName, () => ProgramsStoryScenario>>` or equivalently focused named maps/helpers. Every invocation returns fresh stateful handlers where attempts or mutations are counted.
- Add `participant-program-detail-eligible` to `PROGRAMS_MATERIAL_SCENARIO_NAMES`; retain all existing names and make the inventory exhaustive.
- Export one Storybook-only `withProgramsFixtureIsolation: Decorator` from `programs-story-harness.tsx`; it owns auth-storage setup and Programs API cache cleanup for both Story files.
- The baseline-to-scenario mapping is explicit and exact: Directory/member; Program Detail/active; Event Detail/closed; Management Directory/mixed; Overview/populated; Events/mixed; Participants/pending; Settings/default dirty-capable state; Schedule/focused; Notifications/unread.

## Fixture Truth

- Use the stable prototype vocabulary: departments `培育部`, `牧養部`, `福音部`, `家庭事工`, `青年部`; Programs `門徒訓練基礎課`, `同行成長小組`, `信仰探索班`, `家庭同行系列`, `青年領袖培訓`.
- Participant Directory renders five rows with joined, eligible, pending, and archived/unavailable distinctions driven by existing fields.
- Management Directory renders authorized Programs across multiple departments and mixed Active/Draft/Archived lifecycles; each row includes department metadata.
- Populated Overview reports non-zero operational values matching its route data, including 12 active events and 2 pending enrollments; zero remains a separate scenario.
- Events supplies multiple scheduled/manual/cancelled rows. Participants supplies at least two pending requests plus active/history counts. Notifications supplies three unread items plus one earlier/read item.
- Use deterministic 2026 Hong Kong dates close to the frozen examples. No baseline-visible English `Storybook` labels or year-2099 dates remain.

## Scenario Truth

- `participant-directory-capable` stays on participant intent (`query: {}`) while its access handler reports management capability and its participant catalog remains available.
- `participant-event-detail-ineligible` returns the existing server-shaped Problem Details `403 FORBIDDEN` path; it does not disguise ineligibility as an HTTP 200 inactive event.
- `management-directory-mixed` uses the multi-department, mixed-lifecycle projection.
- `workspace-overview-populated` uses the non-zero cockpit; `workspace-overview-zero` remains explicitly zero.
- `notifications-unread` uses the dense unread fixture; `notifications-empty-recoverable` fails first with 503 and then returns the explicit empty state.

## Steps

- [ ] **Step 1: Claim R2 and pin the inventory.** Run the master preflight and record the R2 start SHA. Add static contract assertions for every retained scenario name plus `participant-program-detail-eligible`, exhaustive dispatch, absence of lint-suppression comments, and exact baseline-to-scenario mapping. Complete when the tests fail on the missing eligible name, suppression, or generic baseline handlers for the intended reasons.

- [ ] **Step 2: Add visible-density regressions.** Extend baseline Play/T11 assertions so Directory sees five named Cantonese Programs and mixed statuses, Management Directory sees multiple departments/lifecycles, Overview sees 12/2 populated counts, Events/Participants see non-empty mixed rows, and Notifications sees three unread plus earlier content. Add a source/governance assertion rejecting baseline-visible `Storybook` labels and year `2099`. Complete when each current sparse baseline has a concrete failing assertion.

- [ ] **Step 3: Pin forbidden Event behavior.** In `participant-event-detail-page.test.tsx`, assert a server `FORBIDDEN` load renders the existing error/forbidden surface, keeps Back behavior, and exposes no scanner/check-in CTA. Complete when the regression fails against any HTTP-200 inactive substitute or optimistic action.

- [ ] **Step 4: Run the red slice.** Run `fnm exec --using 22.18.0 pnpm --dir web exec vitest run --config vitest.t07.config.ts .storybook/programs-presentation-contract.test.ts .storybook/presentation-catalog.test.ts`, then `fnm exec --using 22.18.0 pnpm --dir web exec vitest run --config vitest.components.config.ts lib/programs/participant-event-detail-page.test.tsx`, then `fnm exec --using 22.18.0 pnpm test:t11:storybook`. Complete when every failure maps to the assertions added in Steps 1–3 and environment setup is green.

- [ ] **Step 5: Replace the sparse canonical dataset.** Build the stable Cantonese departments, Programs, participant catalog/detail, events, cockpit, participant queue, and notifications described above while preserving IDs used by route intents and using actual API types. Complete when each baseline handler returns server-shaped dense data and no baseline-visible English/year-2099 value remains.

- [ ] **Step 6: Refactor scenario dispatch.** Replace the suppressed switch with exhaustive named factories/maps, add the eligible scenario, and implement the five Scenario Truth branches. Fresh invocations must isolate mutable attempts/state. Complete when TypeScript exhaustiveness covers every scenario and there is no lint suppression.

- [ ] **Step 7: Wire route-specific baselines and shared isolation.** Replace generic participant/management handler selection with the exact baseline scenario mapping; use one shared Storybook identity/cache decorator in both Story files; retain all baseline export names, IDs, PSNs, intents, and `ISSUE-#601`. Complete when no baseline bypasses `ProgramsStoryHarness` or uses an unrelated generic handler set.

- [ ] **Step 8: Run focused green.** Re-run all three commands from Step 4, then run `fnm exec --using 22.18.0 pnpm --dir web test:storybook` and `fnm exec --using 22.18.0 pnpm --dir web typecheck`. Complete when contract, component, Storybook, T11, and type checks pass.

- [ ] **Step 9: Review the R2 diff.** Compare against the R2 start SHA, run `git diff --check`, verify all eight files stay within fixture/Story/test responsibility, and inspect the ten baseline IDs/PSNs/gaps. Complete when every fixture branch is server-shaped, deterministic, and no catalog identity changed.

- [ ] **Step 10: Commit and close R2.** Check all boxes, append the final checkpoint, update the master ledger, and commit the listed changes plus tracker updates with `test(programs): make route fixtures truthful`. Complete when exactly one matching subject exists after the R2 start SHA, R2 is `COMPLETE`, `Active Task` is `NONE`, and the ledger records green gates.

## Completion Criterion

R2 is complete only when all retained baselines visibly use dense Cantonese 2026 fixtures, every named scenario has the correct route/error meaning, the eligible state exists, no suppression remains, Story/catalog identities are unchanged, and the Story contract/component/T11 gates pass at the committed SHA.

## Checkpoint Log

- 2026-09-11 plan authoring: R2 procedure created; no implementation attempted; prerequisite is R1 COMPLETE; next unchecked item is Step 1.
