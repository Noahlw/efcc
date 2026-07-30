# Issue #71 — Shell Usability Acceptance Plan

**Status:** Implemented locally / **Blocked on fresh `/exec` deployment**
**Branch:** (implemented on the active working branch at implementation time)
**Parent:** #64. Blocked-by (per issue body): #57 (open grilling ticket — see
Scope note below), #69 (merged), #70 (merged).
**Spec:** `docs/specs/009-phone-first-shell-navigation.md` §"Responsive layout
contract" + issue #64's Implementation Decisions (44×44 targets, safe-area,
non-color states, Traditional-Chinese-only copy, keyboard/AT baseline) +
issue #71's 13-item AC list.
**Date:** 2026-07-30

## Scope, as researched and confirmed

Issue #71 lists `#57` (a "Grill: Bilingual language and accessibility
baseline" ticket) as a blocker. `#57` is still open on GitHub, but its
content — default language, bilingual toggle, terminology, minimum touch
target/contrast/focus/screen-reader baseline — is already answered as
binding decisions in `#64`'s "Implementation Decisions" section: Traditional
Chinese only (no toggle, no bilingual requirement), stable English internal
identifiers, 44×44 CSS px targets, safe-area padding, visible focus, semantic
navigation, Traditional Chinese accessible labels, and non-color state
indicators are all already specified there. `#57`'s open GitHub state is
stale wayfinder bookkeeping — its output already exists inside `#64`, just
not as a separate posted comment on `#57` itself. This branch proceeds
directly against `#71`'s AC list and `#64`'s existing decisions rather than
re-grilling settled questions.

An audit of the existing shell (`src/gas/App.html`, `styles.html`,
`shell-session.js.html`, `form-guard.js.html`) was performed first against
all 13 of #71's acceptance criteria, identifying 8 BLOCKER-severity gaps
(touch targets, safe-area insets, pinch-zoom disabled, missing visible
focus, missing focus management on 6 of 7 required transitions, missing
`aria-live` on section-level feedback, color-only state signals, no
centralized copy source), 1 CONCERN (badge accessible label), 1 NIT (nav
landmark disambiguation), plus bonus findings (`role="link"` misuse on nav
buttons, nested-interactive-element violation in the old More menu, missing
dialog `aria-labelledby`). All BLOCKER and CONCERN items are addressed by
this branch; the NIT (nav `aria-label`) is also addressed.

## What was implemented

### New module: `src/gas/copy.js.html`

A `window.EfccCopy` object holding every centrally-managed Traditional
Chinese string: nav labels (full + phone-compact), per-error-code copy
objects, common actions (登出/重新整理/重試/返回/登入), Profile/Login field
labels, status/loading text, the discard-confirmation dialog's default
copy, task-navigation titles, forbidden-view copy, and a badge
accessible-label template (`"{count} 項待處理"`). Included before
`form-guard.js.html` and `shell-session.js.html` in `App.html`. Both
consuming modules read from it via a small resolver (`copyText_` in
`shell-session.js.html`, a direct `window.EfccCopy || {}` read in
`form-guard.js.html`) that **always falls back to the historical literal
string** when the copy source is absent — this keeps every pre-existing
test harness (which does not inject `window.EfccCopy`) passing unchanged
while giving the shell a single source of truth in normal operation.

### `src/gas/Code.gs`

`doGet()`'s `addMetaTag("viewport", ...)` call no longer sets
`maximum-scale=1` — pinch-zoom is restored (issue #71 AC: "Layout usable at
narrow widths and browser zoom without horizontal loss of core actions").

### `src/gas/styles.html`

- **Touch targets:** `.btn-refresh`, `.btn-back`, `.btn-open-task`, and
  `.more-menu-item` all now guarantee `min-height: 44px` (44×44 CSS px
  minimum interactive area).
- **Safe-area insets:** `.app-nav-phone` gets
  `padding-bottom: env(safe-area-inset-bottom)`; `.app-content`'s phone
  `padding-bottom` becomes `calc(64px + env(safe-area-inset-bottom))` so
  scrolled content and the fixed bottom nav never overlap a device's home
  indicator / gesture area.
- **Visible focus:** a combined `:focus-visible` rule covers `.btn`,
  `.btn-back`, `.btn-refresh`, `.btn-open-task`, and `.more-menu-item` with
  a 2px primary-color outline.
- **Disabled state:** `.btn:disabled`, `.btn-primary:disabled`,
  `.btn-refresh:disabled`, `.btn-open-task:disabled` get `opacity: 0.5;
  cursor: not-allowed` — a non-color signal in addition to whatever color
  change exists.
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` zeroes out
  transition/animation durations.
- **Non-color active-nav signal:** `.nav-item-phone.nav-item-active` gets
  an `inset 0 2px 0 0` box-shadow (a non-layout-shifting top border) since
  the phone nav previously signalled the active item via color + font
  weight only.
- **More-menu restructure support:** `.nav-more-wrap` (new) takes the same
  flex slot `.nav-item-phone` occupies in the bottom bar, since the trigger
  button and its popup menu are now siblings rather than parent/child (see
  below).
- **Skip-to-content link:** `.skip-link` (new) is visually hidden until
  keyboard-focused, then pinned to the top-left corner.

### `src/gas/App.html`

- A `<a href="#app-content" class="skip-link">跳至主要內容</a>` skip link
  is the first focusable element in the document.
- `#app-nav-phone` and `#app-nav-desktop` each carry a distinct
  `aria-label` (`主要導覽（手機）` / `主要導覽（桌面）`) so AT landmark
  navigation can disambiguate the two `<nav>` regions.
- `#app-content` carries `tabindex="-1"` so the skip link can move focus
  into it.
- `copy.js.html` is included before `form-guard.js.html` and
  `shell-session.js.html`.

### `src/gas/form-guard.js.html` (`confirmDiscard`)

- Reads heading/message/button copy from `window.EfccCopy` with literal
  fallbacks (see copy-source note above).
- `heading`/`message` elements get stable ids
  (`discard-dialog-heading` / `discard-dialog-message`); the dialog carries
  `aria-labelledby` / `aria-describedby` pointing at them — the modal now
  has a proper accessible name and description.
- A `Tab`-trap keydown handler cycles focus between the Confirm and Cancel
  buttons (the only two focusable elements inside the modal), removed
  alongside the existing `Escape` handler in `removeOverlay()`.
- The overlay mounts under `#app` (falling back to `document.body` when
  `#app` is absent) instead of unconditionally under `document.body`, so
  AT landmark navigation no longer skips the modal.

### `src/gas/shell-session.js.html`

- **Nav semantics:** `role="link"` removed from both the per-Section nav
  button (`buildNavItem_`) and the More trigger (`buildMoreButton_`) — both
  are now plain `<button>` elements with correct implicit ARIA semantics.
- **Badges:** every badge (both the initial render in `buildNavItem_` /
  `buildMoreButton_` and the dynamic update path in `updateBadge_`) carries
  an `aria-label` built from the copy-source template
  (`"{count} 項待處理"`), so the count is never silent to a screen reader
  and never becomes the nav item's only accessible name.
- **`aria-live` status regions:** a new `sectionStatusRegion_` helper wraps
  every Section-level card renderer — loading, error (with retry), Programs
  empty, and forbidden — in `role="status" aria-live="polite"
  aria-atomic="true"`, so loading/success/validation/error/forbidden/
  session-expired feedback is announced once per transition.
- **Focus management** (issue #71's single biggest gap per the audit) now
  covers all 7 required transitions:
  1. **Root nav change** — `navigateToImpl_` moves focus to the new
     Section's heading (`tabindex="-1"`, `data-app-heading="<key>"`) after
     render.
  2. **Nested task entry** — `openTask_` moves focus to the task's Back
     button.
  3. **Nested task exit** — `closeTaskImpl_` restores focus to the nav item
     (or overflow-menu wrapper) that originally opened the task, falling
     back to the parent Section's heading.
  4. **Error recovery / retry** — `renderSectionErrorCard_` and
     `renderRecoverableError_` both focus their retry button.
  5. **Login transition** — unchanged pre-existing behavior
     (`renderLogin_` already focused the username field); verified intact.
  6. **Discard confirmation** — unchanged pre-existing behavior
     (`confirmDiscard`'s Cancel-focused-by-default + Escape/Cancel restore);
     now additionally focus-trapped (see form-guard.js.html above).
  7. **Forbidden recovery** — `navigateToImpl_` focuses the forbidden
     card's primary action when authorization fails.
- **More-menu accessible widget rebuild:** the overflow menu was previously
  a `<div role="menu">` nested INSIDE the trigger `<button>` — invalid HTML
  (nested interactive elements) with no keyboard support beyond a raw
  click toggle. It is now:
  - A `.nav-more-wrap` container holding the trigger button and the
    `#more-menu` popup as **siblings**, not parent/child.
  - The trigger carries `aria-haspopup="menu"` and `aria-expanded`
    (toggled true/false).
  - Opening the menu moves focus to the first `role="menuitem"`.
  - `ArrowDown`/`ArrowRight`, `ArrowUp`/`ArrowLeft`, `Home`, `End` navigate
    between items; `Tab` past the last item closes the menu.
  - `Escape` closes the menu and restores focus to the trigger.
  - A document-level click-outside handler also closes the menu.
- **Copy-source rewiring:** all previously-duplicated literal strings
  (5 flagged by the audit: dirty-form discard message, `重新整理`,
  `載入中...`, `伺服器回應格式不正確。`, `網絡連線不穩定，請稍後再試。`)
  plus nav labels, error copy (`errorCopyFor_` and
  `renderRecoverableError_` now share one `ERROR_COPY_FALLBACK_` literal
  table, eliminating their prior independent duplication), Profile/Login
  field labels, action button text, and task/forbidden copy now resolve
  through `copyText_(...)` against `window.EfccCopy`, with the historical
  literal as a fallback. Rare one-off demo-only strings (placeholder task
  body text, the sample form field label/value) were left as literals —
  a deliberate scope boundary, not an oversight, since they carry no
  duplication risk and aren't part of the shared shell chrome.

## Tests

- **`tests/gas/shell-a11y.test.js`** (new, 9 tests) — covers `copyText_`
  fallback/override behavior, `errorCopyFor_` per-code distinctness, nav
  buttons carrying no `role="link"` + `aria-current` toggling, badge
  `aria-label`, focus landing on the new Section heading after root
  navigation, focus landing on the task Back button on open and a real
  focus target on close, the error card being a
  `role="status" aria-live="polite"` region with the retry button focused,
  the forbidden view carrying the same status-region contract, and the
  More menu's `aria-expanded` toggle + `Escape`-closes-and-restores-focus
  behavior.
- **`tests/e2e/accessibility.test.ts`** (new) — `@axe-core/playwright`
  automated scans of the Login view and the authenticated STAFF shell
  (`AxeBuilder({ page }).analyze()`, which per its documented behavior
  "automatically injects into all frames" — necessary since the app
  renders inside a nested Google HTML Service sandbox iframe chain); plus
  keyboard-traversal specs: Tab walks every phone nav item in DOM order
  including More; Enter opens the More menu with focus landing on the
  first item and Escape closing it while restoring focus to the trigger;
  a nested task's Back button is keyboard-focused on entry and Enter
  closes it; a forced Programs failure focuses the retry button which is
  keyboard-activatable; and the dirty-form discard dialog's Tab-trap
  (`aria-labelledby`/`aria-describedby` + Confirm/Cancel cycling) plus
  Escape-restores-focus-to-the-field behavior.
- All 8 pre-existing `tests/gas/*.test.js` files continue to pass
  unmodified (150 tests) — the copy-source rewiring, focus management, and
  More-menu rebuild are additive/backward-compatible by construction (see
  the fallback-literal design above).

**Total: 159/159 `tests/gas` unit tests pass. `pnpm typecheck` clean.
`pnpm check` (lint + format) clean.**

Two real regressions were found and fixed during this branch's own
red-green cycle before the final green state: `errorCopyFor_` initially
lost its per-error-code literal fallback (all codes rendered the generic
"load failed" message when `window.EfccCopy` was absent); and
`renderSectionErrorCard_`'s retry-focus code called `.querySelector` on a
plain DOM element instead of `document.querySelector` (element-scoped
`querySelector` is real in a browser but not guaranteed by every minimal
test-DOM shim, and the fix — routing through `document.querySelector` —
is also simply more consistent with the rest of the file's pattern). Both
are covered by the new `tests/gas/shell-a11y.test.js` assertions so they
cannot regress silently again.

## Official documentation evidence (AGENTS.md gate)

This branch's changes are markup/CSS/ARIA/DOM-API changes to the existing
client shell — no new Apps Script server API surface was introduced.
Relevant official platform facts already established by prior specs and
unchanged here:

- `HtmlOutput.addMetaTag(name, content)` — the viewport meta tag mechanism
  used by `Code.gs`'s `doGet()` — is on the explicit official allowlist
  (`developers.google.com/apps-script/reference/html/html-output`); this
  branch only changes the `content` string value passed to an already-
  approved call, not the API surface itself.
- `Element.focus()`, `document.activeElement`, ARIA attributes
  (`role`, `aria-live`, `aria-expanded`, `aria-labelledby`, etc.), and
  keyboard event handling (`keydown`, `key` property) are standard Web
  Platform / WHATWG DOM and WAI-ARIA APIs, not Apps Script-specific
  surface — they run identically inside the HTML Service `userHtmlFrame`
  as in any browser document, per the existing shell's established
  client-side execution model (spec 009).
- `@axe-core/playwright`'s `AxeBuilder` is a devDependency test tool, not
  an Apps Script API; its cross-frame injection behavior is documented in
  its own README (bundled at
  `node_modules/@axe-core/playwright/README.md`), consulted directly.

## AC disposition

| AC | Status | Evidence |
|---|---|---|
| #1 Phone default <768px / desktop side nav ≥768px, no authz change | **already satisfied pre-branch** | `styles.html` breakpoints unchanged; `bootstrapSectionsForRole_` untouched |
| #2 Primary phone actions/nav targets ≥44×44 CSS px | **proven locally** | `styles.html` `.btn-refresh`/`.btn-back`/`.btn-open-task`/`.more-menu-item` `min-height: 44px` |
| #3 Fixed phone nav respects safe-area insets | **proven locally** | `styles.html` `env(safe-area-inset-bottom)` on `.app-nav-phone` + `.app-content` |
| #4 Usable at narrow widths / browser zoom | **proven locally** | `Code.gs` viewport meta no longer sets `maximum-scale=1` |
| #5 Semantic nav markup, clear labels, accessible current-item state | **proven locally** | `App.html` `<nav aria-label>` ×2; `aria-current` toggle in `updateActiveNav_`; `shell-a11y.test.js` |
| #6 Keyboard reach/activate/leave every nav item, More item, Back, Refresh, retry, form control | **proven locally** | `role="link"` removed; More-menu keyboard widget; `shell-a11y.test.js` + `accessibility.test.ts` keyboard traversal |
| #7 Focus moves intentionally after 7 named transitions | **proven locally** | `focusSectionHeading_`, `openTask_`/`closeTaskImpl_`, error/forbidden retry focus, discard-dialog trap; `shell-a11y.test.js` |
| #8 Loading/success/validation/error/forbidden/session-expired via accessible status mechanism | **proven locally** | `sectionStatusRegion_` (`role="status" aria-live="polite"`) on loading/error/empty/forbidden cards |
| #9 Selection/error/warning/disabled use non-color signals too | **proven locally** | `styles.html` `:disabled` opacity/cursor + `.nav-item-phone.nav-item-active` box-shadow |
| #10 Badges carry accessible label, never become the only name | **proven locally** | `aria-label` on badge spans in `buildNavItem_`/`buildMoreButton_`/`updateBadge_`; `shell-a11y.test.js` |
| #11 All shell copy is Traditional Chinese from a consistent copy source | **proven locally** (scoped — see Non-goals) | `copy.js.html` + `copyText_` rewiring across shared/duplicated/primary strings |
| #12 Automated a11y + manual keyboard checks across Login/root nav/nested Back/retry/More/dirty-form | **written, execution BLOCKED** | `tests/e2e/accessibility.test.ts` (axe scans + keyboard traversal) — requires a fresh `/exec` deployment + authenticated Playwright run to execute |
| #13 Versioned isolated `/exec` manually checked at phone/desktop widths with recorded results | **BLOCKED** | requires a fresh versioned `/exec` deployment |

## Remaining blocker: AC #12 / AC #13 — the fresh `/exec` gate

Per AGENTS.md and this repo's established pattern (see #069, #070), this
issue is not `READY` until a fresh, isolated versioned `/exec` deployment
demonstrates the same accessibility/responsive/keyboard paths live, with
axe-core results and manual keyboard-check evidence recorded.

**Deployment status:** not yet deployed from this branch. `clasp push` /
`clasp deploy` require the user's authorization and credentials — this
session cannot perform them (per the Google Sheet / deployment sections
of `AGENTS.md`).

**Further blocker:** even once deployed, `tests/e2e/accessibility.test.ts`'s
login-gated specs require the pre-captured Playwright storage states
(`pnpm e2e:auth -- --role=<alice|bob|noah>`) — an interactive Google
sign-in only a human can complete, per the existing `.auth/*.storage.json`
workflow documented in `AGENTS.md` and `tests/e2e/README.md`.

### What the `/exec` run must cover

#### Role × viewport matrix

Reuses the three seeded EFCC application-layer users (unchanged from
issue #67 / ADR-0012) — no new Sheet rows required.

| Role | Username | PIN | Notable for #71 |
| --- | --- | --- | --- |
| MEMBER | alice | 1234 | Fits in `PHONE_MAX_VISIBLE` — no More menu; Programs/nested-task/retry focus checks |
| STAFF | bob | 5678 | 6 Sections — exercises the More-menu overflow keyboard widget and dirty-form discard flow |
| ADMIN | noah | 6883 | Same nav shape as STAFF; confirms admin session parity |

Test at **375×812** (phone), **768×1024** (the exact breakpoint boundary),
**1024×768** (small desktop), and **1280×800** (existing E2E reference
desktop).

#### Automated a11y trace

1. Run `new AxeBuilder({ page }).analyze()` against the Login view
   (cold start, no stored session). Confirm zero violations.
2. Log in as bob (STAFF — full nav set including More/Care/Permissions).
   Run the same axe scan against the authenticated Profile root. Confirm
   zero violations.
3. Repeat both scans at the desktop viewport.

#### Manual keyboard trace (phone, 375×812)

1. **Skip link:** with no prior interaction, press `Tab` once from a fresh
   page load. Confirm the `跳至主要內容` skip link becomes visible and
   focused. Press `Enter`. Confirm focus lands inside `#app-content`.
2. **Root nav reachability:** `Tab` through every phone nav item in order
   (profile → programs → scanner → events → more for STAFF/ADMIN;
   profile → programs → events for MEMBER). Confirm each item shows a
   visible focus outline and the correct `aria-current` state after
   activation via `Enter`/`Space`.
3. **More menu:** with focus on the More trigger, press `Enter`. Confirm
   `aria-expanded="true"`, the menu becomes visible, and focus lands on
   the first menu item ("關懷"). Press `ArrowDown` — confirm focus moves
   to "權限管理". Press `End` — confirm focus jumps to the last item.
   Press `Home` — confirm focus returns to the first item. Press `Escape`
   — confirm the menu closes, `aria-expanded="false"`, and focus returns
   to the More trigger.
4. **Nested task Back:** navigate to 課程 (Programs), activate "查看範例課程詳情"
   via `Enter`. Confirm focus lands on the "返回" (Back) button and the
   task title is audible via a screen reader (VoiceOver/NVDA/TalkBack).
   Press `Enter` on Back. Confirm the task closes and focus lands on a
   sensible target (the Programs nav item or heading), never lost to
   `<body>`.
5. **Retry:** with the device offline (airplane mode or DevTools network
   throttling), navigate to 課程. Confirm the error card announces via a
   screen reader (role="status" aria-live="polite") and focus lands on
   the "重試" button. Restore connectivity, press `Enter`. Confirm the
   Programs list loads.
6. **Dirty-form discard:** navigate to 聚會 (Events), open "編輯範例聚會",
   type a value into the field, then press the phone Back control.
   Confirm the discard dialog appears with an accessible name ("確認離開")
   and description read by the screen reader. Press `Tab` from the
   default-focused "繼續編輯" — confirm focus wraps to "捨棄變更" and
   `Shift+Tab` wraps back, never leaving the two-button trap. Press
   `Escape`. Confirm the dialog closes and focus returns to the
   `demo-edit-field` input.
7. **Reflow / zoom:** at 375px width, use the browser's pinch-zoom (now
   restored — AC #4) to zoom to 200%. Confirm no horizontal scrollbar
   appears and all core actions (nav, submit, retry) remain reachable
   without horizontal scrolling.

#### Manual keyboard trace (desktop, 1280×800)

1. Repeat the root-nav reachability, retry, and dirty-form discard checks
   above — desktop uses the same router/state/templates per spec 009, so
   the same `Tab` order and focus targets apply against the side rail
   instead of the bottom bar.
2. Confirm the side rail's Care/Permissions items are directly reachable
   (no More menu at this breakpoint) and carry the same `aria-current`
   behavior.

## Non-goals for this branch

- **Not every literal string in `shell-session.js.html` was routed
  through `copy.js.html`.** Shared, duplicated, and primary-navigation/
  action/error copy is centralized (see "Copy-source rewiring" above);
  rare one-off demo-only strings (the sample task body placeholder text,
  the sample form field's label/seed value) remain literals — they carry
  no duplication risk and are not part of the shared shell chrome AC #11
  targets. This is a deliberate, documented scope boundary.
- No changes to the authorization model, `bootstrapSectionsForRole_`, or
  any server-side capability calculation — issue #71 is presentation-layer
  only, per its own AC #1 ("no change to authorization model").
- No new Sheet schema, no Apps Script server API surface beyond the
  `Code.gs` viewport-meta value change.
- Full manual screen-reader transcript testing (actual VoiceOver/NVDA/
  TalkBack audio verification) is listed as a required step in the
  `/exec` manual trace above but cannot be executed by this session —
  it requires a human operator with assistive technology and the live
  deployment.

## Executed results

_(Appended automatically by `pnpm test:e2e` → `tests/e2e/plan-doc-appender.ts`
once the Playwright assertions run against a fresh `/exec` deployment with
captured role storage states. Not yet run — this is the AC #12/#13
blocker above.)_

## Rollback

No production Sheet, Apps Script project, or deployment is touched by
this branch. `copy.js.html` is a new additive file; every other change is
either additive (new CSS rules, new test files) or a backward-compatible
rewiring guarded by literal fallbacks. If the `/exec` run fails
acceptance, revert the branch; no other rollback procedure is needed
since nothing is deployed to a shared environment yet.
