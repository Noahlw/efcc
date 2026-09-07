# T08 / #513 acceptance trace

This trace is the execution record for the one T08 branch/PR. It is kept in
the repository's existing `docs/qa` convention and is updated at every
implementation checkpoint. No status below is inferred from the supplied
handoff package.

## Revision and scope

- Effective fixed base: `af4857e8e3a86f5979840c70f06999f569e9ed1a`
- Original start base: `af4857e8e3a86f5979840c70f06999f569e9ed1a`
- Branch / worktree / PR: `rescue/t08-control-contracts` / `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/t08-control-contracts` / [PR #574](https://github.com/Noahlw/efcc/pull/574) (`DRAFT / OPEN / MERGEABLE`, target `rescue/t07-storybook-foundation`)
- Current implementation HEAD: `7b8f8bf2fca4af9c99cfa431ddb69cad2f0cfa05` (exploratory Story/test/decision checkpoint)
- Parent eligibility: live `Noahlw/efcc` PR #573 is OPEN, unmerged, mergeable, head `rescue/t07-storybook-foundation` at `af4857e8e3a86f5979840c70f06999f569e9ed1a`, base `rescue/ui-control-recovery`; T07 ApprovalPackage is `APV-T07-WORKSHOP-FIDELITY-5D22835D`.
- Dirty-worktree status / included changes: clean before this checkpoint; only this trace, the caller disposition record, and the canonical tracker update are intended for the first commit.
- #513 body/version checked: live issue is OPEN, updated `2026-09-05T14:11:23Z`, 0 comments; the 16 acceptance criteria remain the scope.
- Existing authority references: `AGENTS.md`, `web/AGENTS.md`, `DESIGN.md`, `TESTING.md`, `docs/implementation/ui-control-recovery-governance.md`, `docs/adr/0045-local-storybook-presentation-authority.md`, `docs/implementation/ui-control-recovery-plan.md`, `web/COMPONENT_INVENTORY.md`.
- Contract decisions required / source: `02_CONTRACT_DECISIONS.md` remains proposals. Existing 44px minimum, local-only Storybook, primitive ownership, native exceptions, one T08 branch/PR, and T08 design approval are treated as existing authority; any new protected mapping, waiver, or tolerance remains owner-pending.
- Census source pin / files covered / exclusions / unresolved cases: supplied `audit/t08-control-census.mjs`, ref `af4857e8e3a86f5979840c70f06999f569e9ed1a`; 183 committed source files parsed, 135 excluded by tool scope, 586 JSX occurrences. 83 unresolved class expressions remain for manual source review (81 Button, one native Input implementation, one native Textarea implementation); two spreads are the native implementations; 15 ancestor candidates require ownership review.
- Planned production owners / compatibility consumers: `web/components/ui/{button,input,textarea,checkbox,switch,select}.tsx`; compatibility tracers are Login, ProgramForm, PermissionEditor, Dialog/AlertDialog, DirectoryFrame, ApprovalQueue, shell attention, and documented native-select callers.

## Acceptance matrix — observable expectations written before implementation

| AC | Requirement from live #513 | Planned public assertion / layer | Status | Current SHA / command / evidence |
|---|---|---|---|---|
| AC-01 | Production control imports plus Select/native-select disposition | Real production primitive imports, control-owned Stories, and native-exception review | NOT_RUN | — |
| AC-02 | Every designed control has named meaningful states | Story-owned deterministic state matrix discovered from real CSF exports | NOT_RUN | — |
| AC-03 | Traditional Chinese / Latin long-text strategy | Browser Story assertions for safe wrap, single-line input behavior, textarea reflow, and long selected values | NOT_RUN | — |
| AC-04 | Applicable busy, disabled, invalid, focus, selected, destructive, and icon states | Storybook/Vitest semantic state assertions plus browser focus/state checks | NOT_RUN | — |
| AC-05 | Controls own target size without route height patches | Browser `getBoundingClientRect()` checks at control roots and caller census/migration review | NOT_RUN | — |
| AC-06 | Names, keyboard, focus, native, and Radix semantics | Public API component tests and composed Dialog/AlertDialog/Select/label interactions | NOT_RUN | — |
| AC-07 | CVA contains only real semantic axes, no route vocabulary | Source/governance review of primitive variants and callers | NOT_RUN | — |
| AC-08 | Padding, radius, focus, icon, and busy geometry have one owner | Before/after owned-property census and primitive source review | NOT_RUN | — |
| AC-09 | Every identified direct override is handled | Maintained 30-record disposition plus complete census limits/unresolved list | NOT_RUN | — |
| AC-10 | New equivalent direct overrides are blocked | Incremental governance ratchet negative fixture; valid layout/native exceptions remain allowed | NOT_RUN | — |
| AC-11 | Storybook/Vitest and browser coverage are real and discoverable | Runner discovery, build/index reconciliation, and control-owned Story execution | NOT_RUN | — |
| AC-12 | Browser catches target, wrapping, focus-geometry, and state-semantic regressions | Real browser control geometry/focus/keyboard negative cases, not mocked rectangles | NOT_RUN | — |
| AC-13 | Stable selective visual baselines only when earned | No new golden until owner approves stable high-leverage evidence | NOT_RUN | — |
| AC-14 | Representative human design approval references exact PSNs/contracts/evidence | Actual `kind: design` ApprovalPackage after owner review; no agent self-approval | NOT_RUN | — |
| AC-15 | No domain, permission, API, mutation, or URL vocabulary moves into controls | Source imports/props review and regression tests preserve caller ownership | NOT_RUN | — |
| AC-16 | Required tests and separate Standards/Spec review before T08 qualification | Final evidence at exact reviewed HEAD and incremental PR | NOT_RUN | — |

## Negative / integrity checks planned

| Check | Planned observable expectation | Status |
|---|---|---|
| Control subject | Control Stories resolve PSNs but do not create fake Screen Catalog obligations | NOT_RUN |
| PSN references | Duplicate, deleted, renamed, or approval-referenced PSNs fail closed; existing T07 screen PSNs remain valid | NOT_RUN |
| Story/index discovery | Every new control Story is listed and executed by the expected runner and reconciled in the built index | NOT_RUN |
| Broken control contract | Deliberately broken target/wrap/focus fixture fails against the approved expectation and is not shipped | NOT_RUN |
| Composition | Real `asChild`, form submit, Dialog/AlertDialog action/cancel, Select keyboard/focus return, and label activation remain observable | NOT_RUN |
| Caller ownership | Valid layout, noninteractive status, hidden input, and approved native exceptions are not misclassified as controls | NOT_RUN |
| Retained T07 scope | T07 screen deletion/rename and historical approval references remain fail-closed and unchanged | NOT_RUN |

## Actual runs

| Revision | Command | Environment | Exit / result | First failure / artifact | Follow-up |
|---|---|---|---|---|---|
| `af4857e8` | supplied `t08-control-census.mjs --repo ... --ref af4857e8...` | Node `22.18.0`, pnpm `11.7.0`; output outside repo | 0 / 586 JSX occurrences | none | Manual disposition below; keep unresolved expressions visible |
| `af4857e8` | `fnm exec --using 22.18.0 pnpm --dir web test:t07:foundation` | isolated T08 worktree | 0 / 8 files, 42 tests passed | none | baseline preserved |
| `af4857e8` | `fnm exec --using 22.18.0 pnpm --dir web test:storybook` | isolated T08 worktree | 0 / 5 files, 39 tests passed | none | baseline preserved |
| `2d056bb8` | `fnm exec --using 22.18.0 pnpm --dir web test:storybook` | isolated T08 worktree, Chromium | 0 / 6 Stories, 45 tests passed | none | exploratory only; no PSN/catalog qualification |
| `2d056bb8` | `fnm exec --using 22.18.0 pnpm --dir web test:components` | isolated T08 worktree | 0 / 61 files, 896 tests passed | none | exploratory public-contract coverage |
| `2d056bb8` | `fnm exec --using 22.18.0 pnpm --dir web typecheck` | Node `22.18.0` | 0 | none | exploratory Stories typecheck |
| `2d056bb8` | read-only browser geometry diagnostic at 390×844 | Chromium, live HMR Storybook | 0 / diagnostic | Button 32px, icon 32×32, Input 32px, Switch 32×18.39px; Checkbox 44×44, Textarea 66px, Select 44px high/477.31px long trigger | owner decision required before shared mapping change |
| `7b8f8bf2` | `fnm exec --using 22.18.0 pnpm --dir web storybook:build` | Node `22.18.0`, Storybook `10.6.0` | 0 / build completed | none | actual six exploratory Story entries built |
| `7b8f8bf2` | `fnm exec --using 22.18.0 pnpm --dir web storybook:verify-index` | Node `22.18.0`, built index | 1 / fail closed | unexpected entries: `t08-controls--button-states`, `t08-controls--input-states`, `t08-controls--textarea-states`, `t08-controls--checkbox-states`, `t08-controls--switch-states`, `t08-controls--select-states` | expected until D1 control-subject metadata/catalog decision |

## Current findings / caller dispositions

See [`2026-09-07-t08-caller-dispositions.md`](2026-09-07-t08-caller-dispositions.md).
The record distinguishes static occurrences from rendered instances and keeps
unresolved/dynamic/ancestor cases explicit.

## Standards

- Fixed point / diff command: not applicable before implementation; fixed base is `af4857e8e3a86f5979840c70f06999f569e9ed1a`.
- Review method: NOT_RUN; final review will be a separate Standards pass against the T08 incremental diff.
- Hard findings: none yet.
- Heuristics: unresolved class expressions and ancestor candidates are review inputs, not automatic approvals.
- Fixes / evidence: —
- Outcome: NOT_RUN

## Spec

- Source / full AC coverage: live #513 plus existing governance/design/testing authority; implementation not started.
- Missing / partial / wrong / out-of-scope behavior: all T08 implementation evidence pending.
- Fixes / evidence: —
- Outcome: NOT_RUN

## Human / promotion

- Contract decision source(s): [`2026-09-07-t08-contract-decision-record.md`](2026-09-07-t08-contract-decision-record.md); D1/D2/D3 are PROPOSED and no new owner decision is recorded.
- Design-review packet / actual reviewed scope: PENDING; not yet prepared.
- ApprovalPackage ID: NONE YET (T07's APV is not reused).
- Reviewed implementation SHA vs approval-record commit: NOT APPLICABLE.
- Required final checks: pending completion of A–G and current `TESTING.md` gates.
- Current qualification state: `OWNER_DECISION_REQUIRED`; exploratory machine checks are green, but T08 implementation/acceptance is not qualified.
- Merge authorization: NOT GIVEN BY THIS TRACE.
- Actual merge / issue reconciliation: NOT DONE.
- B-003 disposition: retain existing OPEN record; no runtime fix claimed.
- Next safe action: owner approves/adjusts D1/D2/D3 exact scope in the decision record; then implement only that scope, finish A–G, and stop at `MACHINE_QUALIFIED / WAITING_HUMAN` if only design approval remains.
