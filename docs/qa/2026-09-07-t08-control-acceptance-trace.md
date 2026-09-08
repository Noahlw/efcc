# T08 / #513 acceptance trace

This is the current execution record for one T08 branch/PR. It records
machine evidence and owner gates separately. It does not infer a result from
the handoff package, and it does not grant final design approval.

## Revision scope

- Effective qualification comparison base: `af4857e8e3a86f5979840c70f06999f569e9ed1a`.
- Original T08 implementation base: `af4857e8e3a86f5979840c70f06999f569e9ed1a`.
- Production implementation HEAD: `1fbb4d64a93be2e7d5c8d381f66c88e1b9896c76` (`fix(t08): close review regressions`). The later acceptance-trace update is documentation/evidence only.
- Evidence closeout commits: `9ed1e5bb` (acceptance evidence), `37951c11` (review outcomes), and `c77dc1da` (canonical tracker). The latest qualification/tooling fix is `1efa3b1f3a8ac9e3c4794003a7961a13653d2266` (`fix(governance): preserve unchanged affected waivers`), which is separate from the production control implementation.
- Latest verified PR head: `8db6e58c66c69463f9930ac15e7a7ee0b78b2fd5`.
- Branch/worktree: `rescue/t08-control-contracts` / `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/t08-control-contracts`.
- PR: [#574](https://github.com/Noahlw/efcc/pull/574), target `rescue/t07-storybook-foundation`, kept DRAFT and OPEN.
- Immediate parent: PR [#573](https://github.com/Noahlw/efcc/pull/573), OPEN/unmerged/mergeable, head `af4857e8e3a86f5979840c70f06999f569e9ed1a`.
- Owner contract checkpoint: PR #574 at `abf0914b06f6b62d605b683f98bc66fe14579255`; D1, D2, and D3 were approved with conditions for continued implementation only.
- Design ApprovalPackage: `APV-T08-CONTROL-DESIGN-1FBB4D64`, approved by Noah Wong / Repository Owner for production implementation `1fbb4d64a93be2e7d5c8d381f66c88e1b9896c76`; evidence is [`2026-09-08-t08-design-approval.md`](2026-09-08-t08-design-approval.md).
- Current local state: implementation, evidence closeout, and the qualification fix are committed; generated `web/storybook-static/` was moved out of the worktree and is not tracked.
- T07 preservation: `SCREEN_PRESENTATION_DECLARATIONS` remains 39, `SCREEN_CATALOG` remains 35 obligations, and the existing screen PSNs/Stories remain in the T07 catalog path.
- T08 control presentation: seven real production-primitive Stories use durable control PSNs and `subject: "control"`; controls have stable `controlId`, `route: null`, and `intent: null`, and do not enter the Screen Catalog.
- Live HMR: `http://127.0.0.1:6007/`.

## Durable control Stories

| Control | PSN | Direct Story URL |
|---|---|---|
| Button | `PSN-CONTROL-BUTTON` | [Controls / Button States](http://127.0.0.1:6007/iframe.html?id=controls--button-states&viewMode=story) |
| Icon Button | `PSN-CONTROL-ICON-BUTTON` | [Controls / Icon Button States](http://127.0.0.1:6007/iframe.html?id=controls--icon-button-states&viewMode=story) |
| Input | `PSN-CONTROL-INPUT` | [Controls / Input States](http://127.0.0.1:6007/iframe.html?id=controls--input-states&viewMode=story) |
| Textarea | `PSN-CONTROL-TEXTAREA` | [Controls / Textarea States](http://127.0.0.1:6007/iframe.html?id=controls--textarea-states&viewMode=story) |
| Checkbox | `PSN-CONTROL-CHECKBOX` | [Controls / Checkbox States](http://127.0.0.1:6007/iframe.html?id=controls--checkbox-states&viewMode=story) |
| Switch | `PSN-CONTROL-SWITCH` | [Controls / Switch States](http://127.0.0.1:6007/iframe.html?id=controls--switch-states&viewMode=story) |
| Select | `PSN-CONTROL-SELECT` | [Controls / Select States](http://127.0.0.1:6007/iframe.html?id=controls--select-states&viewMode=story) |

These URLs are genuine HMR Storybook locators for the recorded owner review.
The required `kind: design` ApprovalPackage is recorded in
[`2026-09-08-t08-design-approval.md`](2026-09-08-t08-design-approval.md).

## Acceptance criteria

| AC | Result at implementation HEAD | Current evidence |
|---|---|---|
| AC-01 | PASS | `web/.storybook/presentation-meta.ts` has a true additive screen/control discriminator; `presentation-catalog.ts` keeps controls out of the independent screen catalog. Seven control Stories use real Button/Input/Textarea/Checkbox/Switch/Select imports; native-select callers remain native. Built index reconciled 46 Stories, 35 screen obligations, and 7 control Stories. |
| AC-02 | PASS | `Controls` CSF exports seven named deterministic state galleries. `pnpm --dir web test:storybook` passed 6 files / 46 tests. |
| AC-03 | PASS | Real browser Stories cover Traditional Chinese and Latin Button wrapping, native single-line Input behavior, multiline Textarea reflow, and bounded long Select values/open options. T08 Playwright passed at 390, 799, 800, and 1440 widths. |
| AC-04 | PASS | Story/unit and browser coverage exercises Button disabled/busy/destructive/icon states, Input invalid/disabled, Textarea invalid/disabled, Checkbox checked/unchecked/indeterminate/disabled, Switch on/off/disabled, and Select placeholder/selected/open states. |
| AC-05 | PASS | Primitive geometry tests and browser measurements enforce the approved 44px app-facing floor; Textarea retains its larger multiline minimum. The browser includes a deliberately undersized disposable fixture and proves the detector fails it. |
| AC-06 | PASS | `pnpm --dir web test:components` passed 64 files / 910 tests; public ref/attribute, form, `asChild`, Checkbox label/Space, Switch keyboard, and Radix Select selection/Escape/focus-return contracts are covered. |
| AC-07 | PASS | Standards source review found CVA axes are semantic (`variant`, `size`, approved `shape`) and route/domain vocabulary did not move into primitives. CVA definitions remain colocated with their management components; public exports remain unchanged. |
| AC-08 | PASS | Button/Input/Textarea/Select shared padding/radius/focus and target ownership, compact Switch visual track/thumb geometry, and Icon Button target geometry are asserted in `web/lib/t08-control-geometry.test.tsx`, `web/lib/t08-control-contracts.test.tsx`, and the browser suite. |
| AC-09 | PASS | Pinned audit receipt: 183 parsed files, 135 excluded, 586 static JSX occurrences, 81 unresolved Button class expressions and 15 ancestor-style candidates for manual review. `docs/qa/2026-09-07-t08-caller-dispositions.md` resolves all of them: 30-record register, 9 `MIGRATE_NOW`, 72 explicit `BOUNDED_LATER_DEBT`, 2 proven-false-positive spreads, and no `UNKNOWN` or `UNCLASSIFIED` debt. |
| AC-10 | PASS | The focused contract/geometry/ratchet run passed 3 files / 17 tests; `control-override-ratchet.test.ts` passed 9/9, including owned-geometry rejection, multiline added-line coverage, mixed dynamic-branch fail-closed behavior, supplied-base resolution, generated-output exclusion, and the historical-attribute regression. The affected governance audit now preserves unchanged baseline findings while keeping newly added violations active; pinned-base release audit passed with 0 active violations. |
| AC-11 | PASS | Affected Storybook scope passed 13/13; T07 foundation passed 9 files / 44 tests; Storybook/Vitest passed 6 files / 46 tests; Storybook build `10.6.0` passed; built-index reconciliation passed with 46/35/7. |
| AC-12 | PASS | `pnpm test:t08:controls` passed 20/20 at 390/799/800/1440 with zero retries and zero skips. JSON artifact: `tests/e2e/test-results/t08-control-contracts/storybook.json`. |
| AC-13 | PASS (no baseline promoted) | No selective visual baseline was added or promoted. Promotion remains intentionally deferred until a stable, high-leverage baseline is earned and owner-approved. |
| AC-14 | PASS | The owner approved all seven durable PSNs/Stories at `390`, `799`, `800`, and `1440`; `APV-T08-CONTROL-DESIGN-1FBB4D64` records the genuine `kind: design` package for exact production implementation SHA `1fbb4d64a93be2e7d5c8d381f66c88e1b9896c76`. |
| AC-15 | PASS | Source review and focused public-contract tests preserve production exports, props, refs, native attributes, Radix behavior, form behavior, `asChild`, caller-supplied `aria-busy`, and domain/permission/API/URL boundaries. |
| AC-16 | PASS | Fresh Standards and Spec passes against `af4857e8...1fbb4d64` found no documented-standard breach and no hard missing, extra, or wrong requirement. Fowler smell observations, if any, remain non-blocking judgement calls. |

## Negative and integrity checks

| Check | Result | Evidence |
|---|---|---|
| Control subject does not create a screen obligation | PASS | `t08-presentation-contract.test.ts`; controls are present in `ALL_PRESENTATION_DECLARATIONS` but absent from `SCREEN_PRESENTATION_DECLARATIONS`/`SCREEN_CATALOG`. |
| Duplicate/deleted/renamed PSN or baseline fails closed | PASS | Existing T07 catalog negative tests remain green; the control metadata negative test rejects invented `screenId`, non-null route, and non-null intent. |
| Story/index discovery | PASS | Built `storybook-static/index.json` reconciled by `storybook:verify-index`; generated output is not shipped or tracked. |
| Broken control contract | PASS | T08 Playwright disposable undersized fixture fails the target-floor assertion as expected; it is not an active Story or shipped control. |
| Affected governance baseline | PASS | The CI-equivalent affected audit against `af4857e8...` scanned 36 files, reported 0 active violations, and retained 3 unchanged route-CVA findings as waivers; the focused regression also proves a newly added inline style remains active. |
| Composition | PASS | Focused component tests cover `asChild`, native form submit, Dialog/AlertDialog action/cancel wrappers, Checkbox/Switch labels and keyboard, and Select keyboard/typeahead/Escape/focus return. |
| Caller ownership | PASS | Census disposition record distinguishes layout/placement, noninteractive status, hidden input, native exceptions, and later ticket-owned contextual controls from primitive-owned styling. |
| Retained T07 scope | PASS | T07 suite remains 9 files / 44 tests; 39 screen declarations and 35 independent obligations continue to validate. No T07 history was rewritten. |

## Caller census and migrations

- Supplied audit: `audit/t08-control-census.mjs`, pinned to `af4857e8...`, output outside the repository. Current rerun reported 183 parsed files and 586 static JSX occurrences.
- Census limitations remain explicit: static occurrences are not rendered instances; dynamic/imported recipes, factories, spreads, CSS cascade, browser geometry, native picker behavior, and reachability require source/manual/runtime review.
- All currently unresolved census cases were dispositioned. The 81 Button expressions and 15 ancestor candidates have explicit final ownership; no `UNKNOWN`/`UNCLASSIFIED` item remains.
- Approved `MIGRATE_NOW` callers were migrated where they redefined primitive-owned target, padding, radius, focus, or geometry. Caller-owned placement, width intent, grid/flex composition, overlay positioning, domain state, hidden inputs, and registered native exceptions remain explicit.
- Later debt is not a blanket exemption: each retained case has a named later owner/property in the disposition record, including #516, #518–#521, #526, #530, #533–#536, #531, and #532.

## Actual run ledger

UI rows below ran against production implementation HEAD
`1fbb4d64a93be2e7d5c8d381f66c88e1b9896c76`; governance-fix rows and the final
governance/approval rows and the final aggregate ran against qualification HEAD
`8db6e58c66c69463f9930ac15e7a7ee0b78b2fd5`. Node `22.18.0` and pnpm
`11.7.0` were used unless noted.

| Command | Result / artifact |
|---|---|
| `git diff --check` | PASS |
| `pnpm test:storybook:scope` | PASS, 1 file / 13 tests |
| `pnpm --dir web test:t07:foundation` | PASS, 9 files / 44 tests |
| `pnpm --dir web test:storybook` | PASS, 6 files / 46 tests |
| `pnpm --dir web storybook:build` | PASS, Storybook `10.6.0`; generated `web/storybook-static/` removed before closeout |
| `pnpm --dir web storybook:verify-index` | PASS, 46 Stories / 35 Screen Catalog obligations / 7 control Stories; all baselines resolvable |
| `pnpm test:t08:controls` | PASS, 20/20; 0 retries, 0 skips, four viewport projects; JSON artifact at `tests/e2e/test-results/t08-control-contracts/storybook.json` |
| `pnpm --dir web test:components` | PASS, 64 files / 910 tests; jsdom emitted existing diagnostics, with no failed tests |
| `pnpm --dir web exec vitest run --config vitest.components.config.ts lib/t08-control-contracts.test.tsx lib/t08-control-geometry.test.tsx lib/governance/control-override-ratchet.test.ts` | PASS, 3 files / 17 tests; ratchet 9/9 |
| `pnpm test:governance` | PASS, 19/19 governance tests, including unchanged affected-waiver preservation and new-violation detection |
| `GITHUB_BASE_SHA=af4857e8e3a86f5979840c70f06999f569e9ed1a pnpm verify:governance:affected --control-base=af4857e8e3a86f5979840c70f06999f569e9ed1a` | PASS, 36 files scanned / 0 active violations / 3 unchanged baseline waivers |
| `pnpm verify:fast` | PASS at qualification HEAD, root and web TypeScript checks |
| `pnpm verify:governance:release` | PASS, 379 files scanned / 0 active violations / 69 historical waivers |
| `pnpm exec tsx scripts/audit-governance.ts --mode=release --control-base=af4857e8e3a86f5979840c70f06999f569e9ed1a` | PASS, pinned D3 comparison; 379 files scanned / 0 active violations |
| Separate Standards review | PASS, final implementation diff reviewed from `af4857e8e3a86f5979840c70f06999f569e9ed1a` to `1fbb4d64a93be2e7d5c8d381f66c88e1b9896c76`; no documented-standard breach. |
| Separate Spec review | PASS, final implementation diff reviewed against live #513 plus D1/D2/D3; no hard missing, extra, or wrong requirement. |
| `pnpm verify:precommit` | PASS, full existing pre-commit aggregate completed with exit 0 after the review fixes. |
| `pnpm verify:programs` | PASS at qualification HEAD `8db6e58c66c69463f9930ac15e7a7ee0b78b2fd5`; `functional-passed`, all four stages passed; artifact at `test-results/programs-promotion/20260908t022633886z`. |

The T08 browser run's JSON result reports expected 20, skipped 0,
unexpected 0, flaky 0, with all 20 individual tests passed.

## Standards review

- Fixed point: review the implementation diff `af4857e8e3a86f5979840c70f06999f569e9ed1a...1fbb4d64a93be2e7d5c8d381f66c88e1b9896c76`; the subsequent trace commit is documentation-only.
- Standards sources: `AGENTS.md`, `web/AGENTS.md`, `DESIGN.md`, `TESTING.md`, `docs/implementation/ui-control-recovery-governance.md`, ADR-0043, ADR-0045, and `web/COMPONENT_INVENTORY.md`.
- Result: PASS at `af4857e8e3a86f5979840c70f06999f569e9ed1a...1fbb4d64a93be2e7d5c8d381f66c88e1b9896c76`; no hard documented-standard breach, no parallel control layer, and no source/API boundary violation. The review checked preserved public exports and the D3 `endOffset`/`hasAddedLineInRange` fix with its historical-attribute regression. One test-only duplicated-assertion smell was recorded as a non-actionable judgement call because the layered Storybook/Vitest/Playwright seams are required by the repo testing authority.

## Spec review

- Fixed point: review the implementation diff `af4857e8e3a86f5979840c70f06999f569e9ed1a...1fbb4d64a93be2e7d5c8d381f66c88e1b9896c76`; the subsequent trace commit is documentation-only.
- Sources: live #513 (OPEN, current issue body), `references/ISSUE_513_SNAPSHOT.md`, the T08 execution/verification/closeout handoff documents, and the owner D1/D2/D3 decision.
- Result: PASS at `af4857e8e3a86f5979840c70f06999f569e9ed1a...1fbb4d64a93be2e7d5c8d381f66c88e1b9896c76`; no missing/partial, unrequested, or implemented-but-wrong requirement against live #513, the handoff, and D1/D2/D3. The owner decision is now recorded separately as the final T08 design approval.
- Qualification boundary: AC-14 is `PASS` through `APV-T08-CONTROL-DESIGN-1FBB4D64`; no visual baseline promotion, merge, issue closure, or T09 authorization is inferred.

## Human / promotion state

- Contract decision record: [`2026-09-07-t08-contract-decision-record.md`](2026-09-07-t08-contract-decision-record.md), with the owner result `APPROVED WITH CONDITIONS` for D1/D2/D3.
- Design-review packet: the seven-row durable PSN/Story table above plus the current machine evidence; owner approval is recorded in [`2026-09-08-t08-design-approval.md`](2026-09-08-t08-design-approval.md).
- ApprovalPackage ID: `APV-T08-CONTROL-DESIGN-1FBB4D64`; T07's APV is not reused.
- Current qualification state after the final aggregate Programs command: `functional-passed` at `8db6e58c66c69463f9930ac15e7a7ee0b78b2fd5`; Worker Contract, Browser Acceptance, Responsive Matrix, and non-browser precommit all passed. With AC-14 approved, T08 is `STACK_GREEN`; merge authorization remains NOT GIVEN.
- Merge authorization: NOT GIVEN.
- Actual merge / issue reconciliation: NOT DONE.
- B-003: remains OPEN and independent; no runtime fix or relabel is claimed.
- Next safe action: retain PR #574 OPEN/DRAFT/unmerged until an explicit merge and issue-reconciliation decision is given; do not close #513, change B-003, or start T09+ work.
