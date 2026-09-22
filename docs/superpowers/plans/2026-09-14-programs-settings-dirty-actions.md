# Programs Settings Dirty Actions — Normal-Flow Correction

**Status:** Implemented candidate `1017449523e06e7d71982fd36b771a47aae2e44f`; machine-qualified; independent review unavailable; owner L2 pending.

**Date:** 2026-09-14

## Outcome and authority

Change the focused Programs Settings editor so its dirty-state `Discard` and
`Save` actions are an ordinary normal-flow element at the end of the editor
content. The actions must never cover a field, depend on viewport anchoring, or
remain visible when the focused editor is clean.

The authority for this correction is the owner-confirmed grooming decision in
the current delivery chat (Q4–Q12):

- Scope is only the production Programs Settings focused editor.
- `/prototype`, the Bottom Navigation, and every other sticky/fixed surface are
  out of scope.
- The whole two-button action group is the dirty-state affordance.
- It appears only for `focusedEditor && focusedDirty && canManage`.
- It is normal flow at the end of the content, not `position: sticky` or
  `position: fixed`.
- The unsaved message remains outside the action group in normal content flow.
- `Discard` is the secondary left action and `Save` is the primary right
  action; both remain at least 44px high and may wrap responsively.
- Native keyboard and scrolling remain the interaction model; no
  `visualViewport` JavaScript is required.
- Dirty navigation protection, form submission, discard/reset, save success,
  retry, conflict, and accessible labels must be preserved.

The product language for `Focused Settings Editor` and `Unsaved Settings
Change` is recorded in [`CONTEXT.md`](../../../CONTEXT.md). The broader visual
baseline remains governed by [`DESIGN.md`](../../../DESIGN.md), but this owner
decision supersedes the earlier dirty-editor sticky presentation only within
this local correction.

### Explicit exclusions

Do not change:

- `#main-navigation`, the phone dock, the desktop rail, or shell safe-area
  rules;
- `/prototype` or frozen prototype files;
- the generic `ScreenStickyActions` foundation contract or its Playground Story;
- participant enrollment actions, management permission actions, directory
  detail rails, modal overlays, or offline banners;
- domain/API contracts, authorization, persistence, navigation policy, or
  downstream Programs tickets.

## Current basis

- **Repository:** `/Users/noah.wong/Desktop/code/efcc`
- **Branch:** `codex/programs-screen-foundations/wave-3`
- **HEAD:** `bce5e15cf0364fd103431bb2d91904f9d51af906`
- **Remote base:** `9ad90d253bfd50bf2bbcea85f39c18c1587b1f88`
- **Current worktree:** three tracked dirty files are already present and must
  be preserved: `CONTEXT.md`,
  `docs/qa/2026-09-11-programs-route-fidelity-correction.md`, and
  `docs/superpowers/plans/programs-route-fidelity-recovery/R8-fixed-point-qualification.md`.
  The two QA/planning files are unrelated to this task. The accepted glossary
  terms in `CONTEXT.md` are part of this grooming work and must not be reverted.
- **Existing implementation:**
  [`program-settings.tsx`](../../../web/lib/programs/program-settings.tsx) derives
  `focusedDirty` for Basics, Publishing, Enrollment, and Attendance, but the
  current `showStickyActions` condition is only `focusedEditor && canManage`.
  The action group is rendered near the end of the focused editor and currently
  uses [`ScreenStickyActions`](../../../web/lib/screen-foundations.tsx), whose
  class includes `position: sticky` and a bottom offset. The surrounding
  section also adds action-specific bottom padding.
- **Observed issue:** a fresh rendered DOM check showed the action surface
  painted at the bottom of the scroll viewport while the content outlet had no
  equivalent action-bar clearance at desktop. The action surface can therefore
  cover the lower fields. The desired correction removes the overlay behavior
  by making the route action group normal flow and rendering it only when dirty.
- **Evidence limitation:** the codebase-memory project `efcc-current-main` is
  indexed at generation `2026-09-11T06:52:45Z`; `globals.css`, `nav-bar.tsx`,
  and `screen-foundations.tsx` have metadata changes or partial parsing. Exact
  source reads above are the authority for this plan. Revalidate all mutable
  revision and dirty-work facts before editing.

## Implementation steps

### 1. Write the pre-implementation acceptance trace

Before changing source, create
`docs/qa/2026-09-14-programs-settings-dirty-actions-trace.md`. Record this
plan, the current candidate, the owner decisions above, the exact dirty editor
states, the excluded surfaces, and the checks below. Keep it append-only and do
not stage unrelated existing QA files.

### 2. Replace only the Programs Settings action composition

In [`web/lib/programs/program-settings.tsx`](../../../web/lib/programs/program-settings.tsx):

1. Rename the local visibility concept to make the state truthful, for example
   `showDirtyActions = focusedEditor && focusedDirty && canManage`.
2. Keep the existing `focusedDirty` calculation and all four editor sections.
3. Render the two actions after the focused editor's content, as the final
   normal-flow content of that editor.
4. Keep `data-screen-settings-dirty="true"` and its unsaved copy outside the
   action group.
5. Use a route-local normal-flow action element (or an equivalently narrow
   local composition) with no `sticky`, `fixed`, `bottom`, `z-index`,
   backdrop-blur, or overlay shadow declarations. Give it stable
   `data-screen-foundation="program-settings-dirty-actions"` and
   `data-testid="program-settings-dirty-actions"` markers for focused proof.
   Preserve tokenized spacing, borders, button order, form association, and
   minimum target geometry.
6. Remove the conditional bottom padding that existed only to reserve the old
   sticky action surface. Do not remove or alter the shell's existing Bottom
   Navigation clearance.
7. Leave generic `ScreenStickyActions` and its foundation Story unchanged. Do
   not solve this one route by changing a shared sticky contract.

Preserve the current callbacks and semantics: `Discard` restores the server
baseline without calling `updateProgram`; `Save` submits through the existing
focused form; busy/error/conflict/retry state remains visible and usable; and
the existing back/tab/mode/unload dirty guards remain unchanged.

### 3. Update focused deterministic tests and material Story

Update the smallest relevant seams:

- [`web/lib/programs/program-settings.test.tsx`](../../../web/lib/programs/program-settings.test.tsx):
  assert that a clean focused editor has no dirty action group, that editing a
  value makes the group appear with enabled Discard/Save controls, and that
  Discard or a successful Save removes the group. Keep the existing retry,
  conflict, and section behavior assertions.
- [`web/lib/programs/program-workspace.test.tsx`](../../../web/lib/programs/program-workspace.test.tsx):
  retain the dirty Back/tab/mode/unload journey assertions and add only the
  narrow action-group presence/absence assertion needed to prove the workspace
  still composes the new route-local surface.
- [`web/.storybook/programs-material-states.stories.tsx`](../../../web/.storybook/programs-material-states.stories.tsx):
  keep `WorkspaceSettingsDirty` as the representative material state and assert
  the new normal-flow action marker and both actions after the draft is dirty.
  Do not alter frozen prototype references or add a second production
  implementation in Storybook.

Do not change `web/lib/screen-foundations.test.tsx` or the generic foundation
Playground expectation unless the implementation accidentally changes the
generic component; that would be scope expansion and must stop for review.

### 4. Add the real rendered geometry proof

Extend the focused Storybook/Playwright proof in
[`tests/e2e/t11-storybook.test.ts`](../../../tests/e2e/t11-storybook.test.ts), or
the nearest existing Programs material test, to exercise the dirty Settings
Story at the configured W7 widths. The proof must observe settled UI and
assert:

- the dirty action group has computed `position: static` and no active bottom
  anchoring;
- the group is after the editor fields in document flow;
- the final field's bottom is not covered by the action group;
- on phone widths, the existing Bottom Navigation remains the only viewport
  dock and is not modified;
- no horizontal overflow exists and each action target is at least 44px.

Use fresh 360×800, 402×874, and desktop owner spot-checks for the user-facing
render. The 360/402 checks are visual/interaction evidence for this correction;
the existing frozen prototype sheets are not acceptance authority for this
scope.

### 5. Requalify and review the new candidate

Run stateful browser and responsive checks sequentially to avoid the known Next
build-lock contention. At minimum, run the focused Vitest tests, Storybook
material interaction, the relevant `t11` Storybook Playwright test, the
Programs browser journey, the Programs responsive matrix, typecheck, affected
Storybook/governance checks, and `git diff --check`. Run broader promotion
checks when `deliver-work` determines the changed seam requires them.

The source change creates a new candidate: do not reuse the prior #589 code or
visual evidence as proof. Re-run the affected dirty-editor criteria, capture
fresh evidence, obtain a fresh independent review if this candidate is used for
#589 acceptance, and repeat the owner L2 spot-check. Keep implementation,
machine qualification, independent review, owner approval, merge, release, and
downstream authorization separate.

## Acceptance matrix

| Requirement | Observable check | Evidence level |
| --- | --- | --- |
| Clean focused editor has no dirty actions | Render each supported focused editor; no dirty marker or Discard/Save action group is present | Vitest + Storybook interaction |
| Dirty editor exposes both actions | Change a value; unsaved message and both actions appear; Discard is left/secondary and Save is right/primary | Vitest + Storybook interaction |
| Actions are normal flow | Computed action group position is `static`; no `fixed`/`sticky`/bottom anchoring; group follows fields | Rendered Storybook Playwright |
| No content overlap | At initial and end-of-content scroll positions, final field and unsaved message remain readable above the action group | Rendered Playwright + owner L2 |
| Mobile keyboard/scroll remains native | Focus fields, scroll the content, and reach the action group without JS viewport repositioning or hidden controls | Browser interaction |
| Discard remains safe | Draft resets to the server baseline, no update request is sent, and dirty actions disappear | Vitest + real route journey |
| Save/retry/conflict remains safe | Existing save success, uncertain retry, busy, error, and conflict outcomes remain reachable and dirty state clears only on the existing successful outcome | Existing focused tests |
| Dirty navigation remains protected | Back, sibling tabs, mode switch, global links, and unload guard retain current behavior | `program-workspace` tests + browser journey |
| Responsive geometry holds | Fresh 360×800, 402×874, and desktop checks show no horizontal overflow and targets at least 44px | Storybook/Playwright + owner L2 |
| Scope is contained | Bottom Nav, prototype, generic sticky foundation, other action surfaces, and domain/API behavior have no diff | Diff review + governance check |

## Review and completion

**Risk:** Medium. The change is local and has no backend or authorization
impact, but it changes a user-visible editing interaction and invalidates the
dirty-editor portion of the previous #589 visual evidence.

**Required completion:** focused implementation, fresh truthful checks, a
focused review/repair cycle, a new local commit owned by the executing task,
and owner Storybook/L2 spot-check. If the changed candidate remains part of
#589, independent review must be fresh and isolated before owner acceptance is
reopened.

**Not authorized by this plan:** push, merge, close an issue, release, unlock
downstream tickets, or start unrelated Programs work.

## Manual execution brief

Implement this plan at
[`docs/superpowers/plans/2026-09-14-programs-settings-dirty-actions.md`](2026-09-14-programs-settings-dirty-actions.md)
in `/Users/noah.wong/Desktop/code/efcc` on
`codex/programs-screen-foundations/wave-3`. The outcome is a normal-flow,
dirty-only Discard/Save action group at the end of the focused Programs
Settings editor, with no content overlap. Preserve the existing form,
navigation-guard, retry/conflict, accessibility, shell, and Bottom Navigation
behavior. Exclude `/prototype`, Bottom Navigation, generic sticky foundations,
other action surfaces, and backend/API work. Revalidate the current revision
and the three pre-existing dirty files before editing, then follow the
small-task path of `deliver-work`: write the acceptance trace, implement,
verify, review, repair, and create a focused local commit. Requalify affected
#589 evidence and stop before push/merge/release or downstream authorization.
