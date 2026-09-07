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

The final section will record current-head SHA, repair commits, command exit/results, Storybook build/index evidence, two-axis review disposition, representative Story URLs, remaining owner decisions, and the final `WAITING_HUMAN` state.
