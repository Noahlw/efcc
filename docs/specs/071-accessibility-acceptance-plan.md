# Issue #71 - Accessibility Acceptance Plan

**Issue:** #71 - Make the shell usable across phone, desktop, keyboard, and screen reader
**Parent:** #64 (Stable phone-first App Shell and role-aware navigation)
**Blocked by:** #57, #69, #70
**Date:** 2026-07-31
**Branch:** main

## Goal

Finish the shared shell to be genuinely usable phone-first while remaining effective on desktop, with keyboard navigation and screen-reader feedback. All user-facing language is Traditional Chinese; interaction/state cannot rely on color alone.

## Role Matrix

| Role | User | PIN | Viewports |
|------|------|-----|-----------|
| MEMBER | alice | 1234 | phone 375x812, desktop 1280x800 |
| Program Leader | (via alice/bob with assignment) | - | phone 375x812, desktop 1280x800 |
| STAFF | bob | 5678 | phone 375x812, desktop 1280x800 |
| ADMIN | noah | 6883 | phone 375x812, desktop 1280x800 |

## Acceptance Criteria

### AC #1: Phone default below 768px
Phone is the default layout below 768 CSS pixels; desktop side navigation is used at 768 CSS pixels and above, without changing the authorization model.

### AC #2: 44x44 minimum touch targets
Primary phone actions and navigation targets have a minimum 44x44 CSS-pixel interactive area and sensible spacing.

### AC #3: Safe-area insets
Fixed phone navigation respects device safe-area insets and does not cover focused controls, error messages, or submit actions.

### AC #4: No horizontal overflow
The layout remains usable at narrow supported widths and browser zoom without horizontal loss of core actions.

### AC #5: Semantic navigation markup
Root navigation is represented with semantic navigation markup, clear labels, and an accessible current-item state.

### AC #6: Keyboard traversal
Keyboard users can reach, activate, and leave every navigation item, More menu item, Back action, Refresh action, retry action, and form control in a predictable order.

### AC #7: Intentional focus management
Focus moves intentionally after root navigation, nested task entry/exit, error recovery, Login transition, and discard confirmation.

### AC #8: Accessible status announcements
Loading, success, validation, error, forbidden, and session-expired feedback is announced through an appropriate accessible status mechanism without repeated noise.

### AC #9: Non-color state cues
Selection, error, warning, and disabled states use text, iconography, or semantics in addition to color.

### AC #10: Badge accessible labels
Optional count badges expose an understandable accessible label and do not become the navigation item's only name.

### AC #11: Traditional Chinese copy source
All user-facing shell copy and shared component text is Traditional Chinese and comes from a consistent copy source.

### AC #12: Automated + manual accessibility checks
Automated accessibility checks and manual keyboard checks cover Login, root navigation, nested Back, retry, More, and dirty-form confirmation.

### AC #13: Versioned isolated /exec manual check
A versioned isolated development `/exec` is manually checked at representative phone and desktop widths with recorded results.

## Acceptance Trace

| Step | Action | Expected observable outcome |
|------|--------|------------------------------|
| 1 | Open `/exec` at 375px width | Phone bottom nav visible, desktop side nav hidden |
| 2 | Open `/exec` at 768px width | Desktop side nav visible, phone bottom nav hidden |
| 3 | Inspect `.btn-back`, `.btn-refresh`, `.more-menu-item` bounding boxes | Each >= 44x44 CSS pixels |
| 4 | Inspect phone nav CSS | `padding-bottom: env(safe-area-inset-bottom)` present |
| 5 | At 375px, check `document.documentElement.scrollWidth` | `<= clientWidth` (no horizontal scrollbar) |
| 6 | Inspect root nav element | `<nav>` with `aria-label`, current item has `aria-current="page"` |
| 7 | Tab through all interactive elements | Each focusable, activatable via Enter/Space, predictable order |
| 8 | Navigate to a section, then Back | Focus returns to originating nav item |
| 9 | Trigger error state, then retry | Focus moves to retry button or section content |
| 10 | Login transition | Focus moves to first nav item or Profile heading |
| 11 | Open dirty form, attempt navigation, cancel discard | Focus returns to form field |
| 12 | Check for `[aria-live]` or `[role="status"]` element | Exists, receives text for each feedback state |
| 13 | Inspect active nav item | Has `aria-current="page"` AND visual indicator (not color alone) |
| 14 | Inspect count badges | Has `aria-label`, nav item has its own text label |
| 15 | Run `AxeBuilder({ page }).include('#app')` on each view | Zero violations (or documented incomplete items) |

## Forbidden Paths

- No specific forbidden paths for #71, but the accessibility layer overlays #69's recovery behavior (forbidden/session-expired announced via accessible status mechanism).

## Recovery Paths

- **Login transition:** focus moves intentionally (AC #7).
- **Error recovery:** focus moves to retry action; status announced without noise (AC #8).
- **Dirty-form confirmation:** focus moves intentionally; covered by automated + manual keyboard checks (AC #12).

## Executed results

(Not yet run - this section is populated by the pipeline, not hand-transcribed.)
