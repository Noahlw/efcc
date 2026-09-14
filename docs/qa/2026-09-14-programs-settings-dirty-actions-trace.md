# Programs Settings Dirty Actions — Acceptance Trace

**Status:** PRE_IMPLEMENTATION

**Date:** 2026-09-14

**Plan:** [`docs/superpowers/plans/2026-09-14-programs-settings-dirty-actions.md`](../superpowers/plans/2026-09-14-programs-settings-dirty-actions.md)

## Candidate boundary

- Repository: `/Users/noah.wong/Desktop/code/efcc`
- Branch: `codex/programs-screen-foundations/wave-3`
- Pre-change HEAD: `bce5e15cf0364fd103431bb2d91904f9d51af906`
- Remote PR: `https://github.com/Noahlw/efcc/pull/607`
- Remote PR head at preflight: `9ad90d253bfd50bf2bbcea85f39c18c1587b1f88`
- Runtime: Node `22.18.0`, pnpm `11.7.0`
- Existing tracked dirty files preserved: `CONTEXT.md`,
  `docs/qa/2026-09-11-programs-route-fidelity-correction.md`, and
  `docs/superpowers/plans/programs-route-fidelity-recovery/R8-fixed-point-qualification.md`.
- No production source edit has been made for this correction at trace creation.

## Approved correction

Only the production Programs Settings focused editor is in scope. Its dirty
`Discard` and `Save` controls are one ordinary normal-flow action group at the
end of the focused editor content. The group appears only when the focused
editor is dirty and manageable; it is not `sticky` or `fixed`. The unsaved
message remains outside the group. Discard stays secondary/left, Save stays
primary/right, both targets remain at least 44px, and native scrolling and
keyboard behavior are preserved.

## Exclusions

- `/prototype` and frozen prototype files;
- Bottom Navigation, desktop rail, and shell safe-area rules;
- generic `ScreenStickyActions` and its foundation Playground Story;
- participant enrollment, permission, directory, modal, offline, and other
  action surfaces;
- domain/API, authorization, persistence, navigation-policy, and downstream
  ticket changes;
- push, merge, issue close, release, and downstream unlock.

## Acceptance inventory

| ID | Starting state and action | Required observable result | Evidence |
| --- | --- | --- | --- |
| DSA-01 | Open each supported focused Settings editor while clean | No dirty marker or dirty action group is rendered | Vitest + Storybook |
| DSA-02 | Change a focused field | Unsaved message and both actions appear at the end of content | Vitest + Storybook |
| DSA-03 | Inspect the rendered dirty group | Computed position is `static`; no sticky/fixed/bottom anchoring; group follows the fields | Storybook Playwright |
| DSA-04 | Scroll at initial and end positions | No field or unsaved message is covered by the action group | Rendered Playwright + owner L2 |
| DSA-05 | Use a phone-sized viewport and keyboard focus | Actions remain reachable through normal scrolling; no viewport JavaScript is required | Browser interaction |
| DSA-06 | Click Discard | Server baseline returns, no update mutation is sent, dirty marker and actions disappear | Vitest + real route |
| DSA-07 | Save, retry an uncertain save, or hit conflict | Existing busy/error/retry/conflict behavior remains intact | Existing focused tests |
| DSA-08 | Attempt Back, tab, mode, global-link, or unload navigation while dirty | Existing dirty-navigation protection remains intact | Workspace tests + browser |
| DSA-09 | Check 360x800, 402x874, and desktop | No horizontal overflow; action targets are at least 44px; no shell/nav regression | Storybook/Playwright + owner L2 |
| DSA-10 | Review the candidate diff | Only the approved Settings action composition and its evidence/tests change | Diff + governance review |

## Evidence rules

The production source revision after implementation is the immutable candidate.
Prior #589 code, visual, and owner evidence is not inherited after this source
change. A fresh candidate requires affected focused checks, fresh rendered
evidence, review/repair, and a new owner L2 spot-check before any acceptance
decision is reopened.

## Implementation candidate and qualification (appended 2026-09-14)

Status: IMPLEMENTATION_CANDIDATE_UNDER_REVIEW

- Production candidate: `1017449523e06e7d71982fd36b771a47aae2e44f`
- Candidate parent: `bce5e15cf0364fd103431bb2d91904f9d51af906`
- Commit: `fix(programs): keep dirty settings actions in flow`
- Remote PR remains unpushed; the branch is ahead locally and no merge, issue
  close, release, or downstream unlock was performed.
- The implementation range changes only the focused Programs Settings action
  composition plus its deterministic Storybook and browser assertions in the
  six files recorded by the candidate commit. Existing unrelated dirty docs
  and untracked artifacts remain untouched.

### Candidate evidence

- Focused component tests: 3 files, 77 tests passed using the component
  Vitest configuration.
- Storybook interaction tests: 10 files, 94 tests passed.
- T11 Storybook W7 suite after the candidate commit: 126/126 passed across
  320–1440 widths.
- T11 R6 material Settings test with the end-of-content scroll proof: 9/9
  passed across 320, 360, 375, 390, 402, 414, 799, 800, and 1440 widths.
- Real Programs management browser acceptance: passed after the candidate
  commit and the real-route geometry assertion was added.
- Programs responsive matrix: 18/18 passed across phone and desktop widths.
- Typecheck: root and web TypeScript checks passed.
- Commit verification: 606 worker tests, 1,039 component tests, full
  governance audit with 0 active violations, and all configured pre-commit
  checks passed.
- Affected governance audit: 0 active violations and 0 waived items.
- Storybook affected-scope test: 13/13 passed.
- `git diff --check`: passed.

### Fresh rendered spot-check

The following candidate screenshots are stored under
[`docs/qa/artifacts/programs-settings-dirty-actions/10174495/`](artifacts/programs-settings-dirty-actions/10174495/):

- [360x800 top](artifacts/programs-settings-dirty-actions/10174495/360x800-top.png)
- [360x800 end](artifacts/programs-settings-dirty-actions/10174495/360x800-end.png)
- [402x874 top](artifacts/programs-settings-dirty-actions/10174495/402x874-top.png)
- [402x874 end](artifacts/programs-settings-dirty-actions/10174495/402x874-end.png)
- [1280x720 top](artifacts/programs-settings-dirty-actions/10174495/1280x720-top.png)
- [1280x720 end](artifacts/programs-settings-dirty-actions/10174495/1280x720-end.png)

Measured dirty action group at the end of `#shell-content`:

| Viewport | Action group | Bottom Navigation | Position | Overflow | Minimum target |
| --- | ---: | ---: | --- | ---: | ---: |
| 360x800 | 645–700 | starts 728 | `static` | 0px | 44px |
| 402x874 | 719–774 | starts 802 | `static` | 0px | 44px |
| 1280x720 | 637–692 | desktop rail; no bottom dock | `static` | 0px | 44px |

In each rendered state, the final form field and unsaved message end before
the action group begins. The owner visual L2 spot-check is still separate and
pending, as is the fresh independent review required before reopening #589
acceptance.

## Review disposition (appended 2026-09-14)

- Focused delivery-owner review completed against the immutable candidate
  range. The candidate contains exactly the six intended production/test
  files; the generic sticky foundation, its Playground Story, `/prototype`,
  Bottom Navigation, and API/domain files are absent from the range.
- The route contains no `ScreenStickyActions` usage. The dirty group is gated
  by `focusedEditor && focusedDirty && canManage`, keeps the unsaved output
  outside the group, preserves the existing form association and callbacks,
  and uses only the Button primitive's own target/padding contract.
- Two fresh independent verifier attempts were dispatched. Both remained
  running without returning a report and were stopped after bounded timeout
  recovery; no `CLEAN` verdict was received. Independent acceptance review is
  therefore **UNAVAILABLE**, not passed.
- Owner L2 visual/interaction approval remains **PENDING**. This candidate is
  machine-qualified and locally committed, but #589 acceptance must not be
  reopened or treated as complete until the owner decision and an independent
  review are obtained.
