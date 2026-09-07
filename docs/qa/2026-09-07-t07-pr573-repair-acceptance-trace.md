# T07 / PR #573 repair acceptance trace

**Scope:** R1–R6 correction pass for the existing shared T07 branch and PR #573.

**Authority:** `EFCC_T07_PR573_FIX_HANDOFF.md` supplied by the owner. This is a repair trace; it does not replace the original T07.1–T07.6 checkpoint provenance or grant human approval.

## Required negative regressions

- affected-scope reads real temporary Git comparisons and remains fail-closed for deletion, rename, invalid-base, empty-diff, identity, and cross-scope move cases;
- Screen Catalog obligations remain independent from discovered Story declarations and reject deleted or renamed baseline references;
- Programs presentation intent is checked through the production parser, including the malformed programful Notifications variant;
- Programs baseline assertions require screen-specific settled content/data, and a representative loading/error shell does not satisfy readiness;
- historical ApprovalPackage / RouteScenario references remain valid while new presentation references remain validated.

## Current qualification boundary

The repair pass may update the existing shared branch and PR only. It must not merge PR #573, close T07 issues, change B-003, begin T08+, or claim human workshop-fidelity approval or `STACK_GREEN`.

## Evidence record

## Final qualification record

**Reviewed implementation head/base:** `24fdca4c24121cb3fb686c9565493fa4b07a8b72` on `rescue/t07-storybook-foundation`, based on rescue merge-base `a1a40d12d7a334183951604ae1adec509015474c`. This receipt is recorded by a later docs-only commit on the same branch. PR #573 remains `OPEN / MERGEABLE / CLEAN` against `rescue/ui-control-recovery`.

**Repair commits:** `ea286792` (R1 affected-scope deletion/rename fail-closed regression), `3d94c972` (R2 independent catalog, R3 parser-backed route correction, R4 settled Stories/negative control/index reconciliation), `9352839a` (R5 workflow/tracker/evidence docs), `24fdca4c` (final parser-backed metadata equality and real production loading-shell negative regression).

**Tests and artifacts:**

- `pnpm test:storybook:scope`: 13 tests PASS.
- `pnpm --dir web test:t07:foundation`: 8 files / 42 tests PASS after the actual production loading-control regression and parser-backed metadata equality test were added.
- `pnpm --dir web test:storybook`: 5 files / 39 browser Story tests PASS.
- `pnpm --dir web storybook:build`: PASS on Storybook `10.6.0`.
- `pnpm --dir web storybook:verify-index`: `39 Stories / 35 Screen Catalog obligations; all baselines resolvable.`
- `pnpm exec playwright test --config tests/e2e/t07-storybook.config.ts`: 8/8 PASS at 390, 799, 800, and 1440.
- `pnpm verify:storybook:affected a1a40d12d7a334183951604ae1adec509015474c HEAD`: frontend/uncertain scope detected; run required.
- `pnpm verify:fast`, `pnpm verify:precommit`, and `git diff --check`: PASS. The full pre-commit aggregate is 60 files / 891 tests; governance reports `Active Violations: 0`.

**Representative Story URLs:**

- `http://127.0.0.1:6006/iframe.html?id=t07-1-management-hub--default&viewMode=story`
- `http://127.0.0.1:6006/iframe.html?id=t07-2-public-auth-member-communications--credential-upgrade&viewMode=story`
- `http://127.0.0.1:6006/iframe.html?id=t07-3-programs--workspace-notifications&viewMode=story`
- `http://127.0.0.1:6006/iframe.html?id=t07-4-management-identity--registrations-fallback&viewMode=story`

**Review disposition:** Final Standards review PASS with two non-blocking heuristics (duplicate identity-hint decorator names; route-intent representation smell). Final Spec review PASS after the parser-backed metadata equality and real production loading-shell negative regression were added. R1, independent catalog, index reconciliation, no T08+/B-003 expansion, and the no-merge boundary are all evidenced. No hard Standards findings remain.

**Remaining owner decisions:** genuine workshop-fidelity review at `390`, `799`, `800`, and `1440`; reviewer/implementation SHA/PSN/viewport/evidenceRef ApprovalPackage; any remaining taxonomy or gap classification. The agent has not created approval evidence, merged PR #573, closed issues, claimed `STACK_GREEN`, or rerun B-003.

**Final state:** `WAITING_HUMAN`; T07.1–T07.5 provenance preserved; T07.6 current machine qualification complete pending owner review; T08+ NOT STARTED; B-003 OPEN.
