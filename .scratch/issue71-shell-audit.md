# Issue #71 — Shell Usability Audit (Phone / Desktop / Keyboard / Screen Reader)

**Prepared for:** Implementer of issue #71 ("Make the shell usable across phone, desktop, keyboard, and screen reader.")
**Scope:** READ-ONLY audit of the existing shell implementation against issue #71's acceptance criteria. No code changes proposed here.
**Date:** 2026-07-30
**Method:** Static read of `src/gas/*.html` and `styles.html`; cross-check against `docs/specs/009-phone-first-shell-navigation.md`, the prior acceptance plans (`docs/specs/067…070`), the contract test (`tests/gas/app-shell.contract.test.js`), and the existing E2E specs (`tests/e2e/*.test.ts`).

---

## 1. Source-by-source findings (ground truth)

### 1.1 `src/gas/Code.gs` — `doGet()` (lines 38-44)

```js
function doGet(e) {
  return HtmlService.createTemplateFromFile("App")
    .evaluate()
    .setTitle("EFCC 顯恩堂")
    .addMetaTag(
      "viewport",
      "width=device-width, initial-scale=1, maximum-scale=1"
    )
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
```

- **Viewport meta includes `maximum-scale=1`.** This deliberately **blocks user pinch-zoom** at every breakpoint — a clear WCAG 2.2 SC 1.4.4 ("Resize text") failure, and an even clearer violation of issue #71's own AC: *"Layout usable at narrow widths and **browser zoom** without horizontal loss of core actions."* There is no test that catches this; the contract test only checks for the *presence* of a viewport meta (the de-facto contract assertion is `"App.html: ... no inline <meta name=\"viewport\" tag"` in `tests/gas/app-shell.contract.test.js` line 189-194, which guards the **client** from re-introducing one — but says nothing about the **server**'s meta).

### 1.2 `src/gas/App.html` — markup scaffold

```html
<div id="app" class="app-shell" data-app-state="BOOTING">
  <header id="app-header" class="app-header">
    <h1 class="app-title">顯恩堂系統</h1>
  </header>
  <div id="app-status" class="app-status" role="status" aria-live="polite"></div>
  <main id="app-content" class="app-content">
    <?!= include('view-login'); ?>
  </main>
  <nav id="app-nav-phone" class="app-nav-phone" hidden></nav>
  <nav id="app-nav-desktop" class="app-nav-desktop" hidden></nav>
</div>
```

Observations:

- The two navs are **real `<nav>` elements** — that satisfies issue #71's "Root navigation uses semantic `<nav>` / landmark markup" AC structurally, but neither has `aria-label` to disambiguate them (a screen-reader user gets two unlabeled `navigation` landmarks).
- There is **no skip-to-content link** anywhere before `#app-content`.
- `role="status" aria-live="polite"` is set on `#app-status`, but the element is only updated by `setStatus()` in two paths (`shell-session.js.html:1780` "登入中..." and `:1987` "載入中..."). It is *not* used for any success / validation / error / forbidden / session-expired announcement that issue #71's AC requires.
- The `<main id="app-content">` is `role`-default `main` — good.

### 1.3 `src/gas/styles.html` — layout, breakpoints, touch targets, color

#### Breakpoints (`styles.html:111-167`)

- Phone-only rule at `@media (max-width: 767.98px)`.
- Desktop-only rule at `@media (min-width: 768px)`.
- The contract test `tests/gas/app-shell.contract.test.js:294-301` asserts the `768px` value is present.
- **At exactly 768px width there is no rule**, but the two breakpoints are mutually exclusive (767.98 covers ≤767 and 768 covers ≥768), so this is a non-gap (a single CSS pixel is an irrelevant edge case).

#### Phone nav (`styles.html:111-128, 309-325`)

```css
@media (max-width: 767.98px) {
  .app-nav-phone {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 10;
  }
  ...
  .app-content { padding-bottom: 64px; ... }
}

.nav-item-phone {
  flex: 1 1 0; min-width: 0;
  padding: var(--space-2) var(--space-1);   /* 8px 4px */
  min-height: 48px;
}
```

- Phone nav is `position: fixed; bottom: 0` **without** `padding-bottom: env(safe-area-inset-bottom)`, **without** an `env(safe-area-inset-bottom)` adjustment on the content's `padding-bottom: 64px`, and without any `--safe-bottom` CSS variable. iPhone X+ home indicator and Android gesture nav will overlap the bottom edge of the bar — direct issue #71 AC failure ("Fixed phone nav respects safe-area insets; never covers focused controls, error messages, submit actions").
- `.nav-item-phone` is `min-height: 48px` (the height of the button is 48 CSS px). The button is also `flex: 1 1 0`, so on a phone viewport (375 CSS px) divided by 4 visible items, **each button is ~94 CSS px wide** (well above 44) but **only 48 CSS px tall** — exactly at the WCAG 2.5.5 / Apple HIG 44pt minimum in one dimension. That is **borderline acceptable but not generous**; iOS Safari's tap-target heuristic flags buttons whose smallest dimension is exactly 44 as "small". No `padding-top/bottom` is added above the label to bring the bounding box to 44 CSS px tall when the label is small.
- The button's bounding box **does not include the absolutely-positioned badge** (`.nav-item-phone .nav-badge` at `top: 2px; right: 4px;`), which floats outside the button. A 99+ badge sitting on top of the button does not enlarge the touch target, and the badge has no padding of its own — a touch on the badge area is still a tap on the underlying button, which is fine, but a tap inside the badge's own visual bounds is **not** larger than the button.
- `padding-bottom: 64px` on `.app-content` is a **hard pixel value** rather than `calc(64px + env(safe-area-inset-bottom))`. With a home-indicator device, the content's last 24-34 px sit under the bar.

#### Desktop nav (`styles.html:327-353, 93-101`)

- `width: 240px` fixed. At a 1024×768 viewport with browser chrome, this is ~30% of width — generous; at 1280×800 (the E2E reference) it is ~19%. Fine.
- `.nav-item-desktop` has `padding: var(--space-2) var(--space-3)` (= 8px 12px) and `font-size: var(--text-md)` (16px). **No `min-height`** declared. Vertical touch target on desktop is browser-default for `<button>` in this UA, typically 24-28 CSS px in headless Chromium. WCAG 2.5.5 doesn't exempt desktop, but SC 2.5.8 (Target Size Minimum, AAA) requires 24 CSS px — borderline.

#### Focus styles (`styles.html:218-221, 309-312`)

```css
.input:focus { outline: 2px solid var(--color-primary); outline-offset: 1px; }
.nav-item:focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }
```

- `.input:focus` uses `:focus` (not `:focus-visible`) — fires on every click as well as keyboard, producing a 2px outline that briefly appears after a tap. Minor noise.
- **No `:focus-visible` rule on `.btn`, `.btn-back`, `.btn-refresh`, `.btn-open-task`, `.more-menu-item`, the More button, or the Login submit button.** A keyboard user tabbing through the page gets **no visible focus indicator** on most actionable controls. This is a direct issue #71 AC failure ("Keyboard users can reach/activate/leave every nav item … in predictable tab order" — the visible-focus half is missing).
- The discard-modal cancel button in `form-guard.js.html:108-127` uses inline `style.cssText` rather than stylesheet rules; it has no `:focus-visible` outline at all.

#### Color tokens (`styles.html:1-31`)

```css
--color-bg: #f6f7f9;
--color-surface: #ffffff;
--color-text: #1f2328;
--color-muted: #5b6470;
--color-primary: #2f6feb;
--color-primary-contrast: #ffffff;
--color-border: #d8dde3;
--color-error: #b42318;
```

- `--color-text` (#1f2328) on `--color-surface` (#ffffff): contrast ≈ **16.1:1** — passes AAA easily.
- `--color-primary` (#2f6feb) on white: contrast ≈ **5.1:1** — passes AA for normal text, fails AAA. Used for active nav state and submit buttons.
- `--color-primary-contrast` (#ffffff) on `--color-primary`: same ≈ 5.1:1 — passes AA.
- `--color-muted` (#5b6470) on white: ≈ 5.5:1 — passes AA. Used in `.app-status`, `.label`, `.breadcrumb-current`. Fine.
- **`.nav-item` (idle) uses `color: var(--color-muted)` — 5.5:1 — fine.**
- **`.nav-item` (active) uses `color: var(--color-primary)` + `font-weight: 600`** — the weight compensates for the 5.1:1 ratio being borderline, but active-vs-idle distinction is now **color-only** for color-blind users in low-end display conditions. The `font-weight: 600` switch and `.nav-item-desktop.nav-item-active { background: rgba(47,111,235,0.08) }` *do* provide a non-color signal on desktop, but **on phone, the only signal is color + font-weight**, and `font-weight` going from inherited to 600 is barely perceptible at 12px label size.
- `.msg-error { color: var(--color-error) }` (#b42318) on white — contrast ≈ **6.4:1**, passes AA, passes AAA for large text. But this is a `role="alert"` whose only signal is color + a hidden→visible transition; no icon, no text-style cue. **Direct issue #71 AC failure** ("Selection / error / warning / disabled states use text / icon / semantics in addition to color").

#### Disabled state styling — missing

- There is **no `:disabled` selector anywhere in `styles.html`**. When `submitBtn.setAttribute("disabled","disabled")` fires in `shell-session.js.html:1547, 1792`, the button visually looks identical to its enabled state. A user has no signal that the button is disabled except loss of hover. Direct issue #71 AC failure.

#### Motion (`styles.html:306, 311`)

```css
.nav-item { transition: color 0.15s; }
```

- Single 0.15s color transition on `.nav-item`. **No `@media (prefers-reduced-motion: reduce)` rule** anywhere. WCAG 2.3.3 (AAA) and the practical norm: a `prefers-reduced-motion` block should zero out non-essential motion. Direct issue #71 AC omission.

#### Nav badge (`styles.html:544-562`)

```css
.nav-badge {
  min-width: 18px; height: 18px; ...
  background: var(--color-primary); color: var(--color-primary-contrast);
}
.nav-badge[hidden] { display: none !important; }
```

- The badge is created by `shell-session.js.html:385-393, 439-447` as a `<span class="nav-badge" data-badge="...">` with `textContent = formatBadgeCount_(count)`. **No `aria-label`**, no `role`, no `aria-hidden`. Issue #71 AC: "Optional count badges have accessible label, don't become the nav item's only name." A screen reader announcing the button will hear the label only — the badge is just decoration. That **partially** satisfies the AC (the button isn't *named* by the badge), but the **count is lost to screen readers** entirely, which is the opposite of the badge's information purpose.

### 1.4 `src/gas/shell.js.html` — static shell (43 lines)

- Sets `data-app-state="SIGNED_OUT"` and `preventDefault`s the login submit (lines 19-31). Clean.
- No a11y concerns — by design this module does not touch navs.

### 1.5 `src/gas/view-login.html`

```html
<div id="login-msg" class="msg-error hidden" role="alert"></div>
```

- `role="alert"` is set — but **no `aria-live`** on the container (redundant on `alert` since `role="alert"` implies `aria-live="assertive"` implicitly). Fine.
- `<button id="login-submit" class="btn btn-primary btn-full" type="submit">` — has no `aria-label` (label is the text content "登入"), no `:focus-visible` style (see §1.3).

### 1.6 `src/gas/shell-session.js.html` — dynamic shell (2098 lines)

#### Table of contents (function name → line range)

| Section / function | Lines | Notes |
|---|---|---|
| Module preamble (comment) | 1-58 | State machine docs. |
| Constants (`STORAGE_KEY`, `STATE`, `SECTION_KEYS`) | 60-110 | |
| Module-private state (`session_`, `loginPending_`, `sections_`, `currentSection_`, `activeTask_`, `sectionViewCache_`, `sectionBadgeCounts_`, `eventsDemoCounter_`, `activeFormGuard_`, `navGeneration_`, `sectionStates_`) | 60-122 | |
| Tiny DOM helpers (`$`, `appRoot`, `setAppState`, `setStatus`, `clearChildren`, `el`) | 127-200 | `el()` is a tag-attribute factory used everywhere. |
| `readStoredSession_` / `writeStoredSession_` / `clearStoredSession_` | 205-235 | |
| `callServer_` (RPC wrapper with per-tag dedup + monotonic id) | 240-275 | |
| `renderProfile_` (legacy bootstrap-time) | 280-320 | Largely superseded by `renderProfileContent_` at line 1180. |
| `renderNavigation_` / `renderNavPhone_` / `renderNavDesktop_` | 350-440 | |
| `buildNavItem_(section, isPhone)` | 370-415 | Phone label shorthand at 373-380. |
| `buildMoreButton_(overflowSections)` | 420-465 | Menu items use `role="menuitem"` (line 466). |
| `toggleMoreMenu_` / `hideMoreMenu_` | 470-490 | No focus-into-menu, no Escape handler, no arrow-key handling. |
| `updateActiveNav_` | 495-510 | Sets `aria-current="page"` / `"false"`. |
| `navigateTo_(sectionKey)` | 515-545 | Calls `confirmDiscard` if form dirty. |
| `navigateToImpl_(sectionKey)` | 547-580 | Auth check, sets `currentSection_`, calls `renderSection_`. |
| `buildSectionCard_(sectionKey, title, description)` | 585-660 | Refresh button + per-section demo tasks. |
| `errorCopyFor_(code)` | 655-680 | Distinct TC copy per error code. |
| `renderSectionLoadingCard_` | 685-700 | |
| `renderSectionErrorCard_(sectionKey, code)` | 705-730 | Has 重試 button. |
| `renderProgramsEmpty_` | 735-770 | |
| `renderProgramsContent_(programs)` | 775-870 | Renders program list. |
| `loadProgramsSection_` | 880-920 | Real RPC call. |
| `isValidProgramItem_` | 925-935 | |
| `applyProgramsData_(data)` | 940-980 | |
| `handleProgramsEnvelope_` | 985-1035 | |
| `handleProgramsFailure_` | 1035-1050 | |
| `handleSectionRetry_(sectionKey)` | 1055-1095 | |
| `renderSection_(sectionKey)` | 1100-1130 | Error boundary + navGeneration bump. |
| `renderSectionImpl_(sectionKey)` | 1135-1195 | Switch over section keys. |
| `renderProfileContent_(sessionData)` | 1195-1240 | |
| `buildPlaceholderSection_(title, message)` | 1245-1255 | |
| `renderForbidden_(sectionKey)` | 1255-1275 | |
| `navigateToNearestPermitted_` | 1280-1290 | |
| `formatBadgeCount_(count)` | 1295-1300 | "99+" cap. |
| `updateBadge_(sectionKey, count)` | 1305-1360 | Updates both phone & desktop badges. |
| `invalidateSection_(sectionKey)` | 1365-1375 | |
| `refreshSection_(sectionKey)` | 1380-1405 | Refresh button handler. |
| `openTask_(descriptor)` | 1410-1440 | Sets activeFormGuard_ for edit tasks. |
| `closeTask_` / `closeTaskImpl_` | 1440-1485 | Dirty-form guard + close. |
| `renderTask_(descriptor)` | 1490-1540 | Back button + breadcrumb + body. |
| `handleFieldInput_` | 1545-1550 | markDirty. |
| `handleDemoFormSubmit_` | 1550-1620 | Real RPC submit. |
| `refreshAuthorization_` | 1625-1635 | |
| `renderLoadingSection_` | 1640-1655 | |
| `renderLogin_` | 1655-1720 | Rebuilds login form client-side. |
| `showLoginError_(message)` / `clearLoginError_` | 1725-1740 | |
| `renderRecoverableError_(kind)` | 1745-1770 | Generic recovery card. |
| `handleRetryClick_` | 1775-1790 | |
| `handleLoginSubmit_(event)` | 1795-1830 | |
| `handleLogoutClick_` / `handleLogoutClickImpl_` | 1835-1870 | |
| `handleRpcEnvelope_(envelope, tag)` | 1880-1935 | |
| `handleRpcFailure_(err, tag)` | 1940-1965 | |
| `applyBootstrap_(data)` | 1970-2000 | |
| `clearAuthenticatedClientState_` | 2000-2030 | |
| `restoreFromStorage_` | 2040-2095 | |
| `onReady` + script-end test hooks (`window.__test__`) | 2095-2187 | |

#### Hardcoded Traditional-Chinese strings (smell: scattered literals)

The grep below produced ~50 hits in `shell-session.js.html` alone. Highlights (line, copy):

- L277 `"個人資料"`, L280 `"已登入：" + name`, L283 `"使用者名稱"`, L285 `"角色"`, L287 `"QR 碼"`, L294 `img.alt = "QR 碼"`, L310 `"登出"`
- L374-379 phone-label if/else cascade (`"個人"`, `"課程"`, `"聚會"`, `"掃描"`, `"關懷"`, `"權限"`)
- L426 `"更多"` More button label
- L520 `"系統將捨棄尚未儲存的變更，確定要離開嗎？"` — duplicated at L1401 and L1822 (dirty-form guard message).
- L577 `"重新整理"`, L584 `"重新整理"`, L609 `"查看範例課程詳情"`, L617 `"範例計數器：" + n`, L638 `"編輯範例聚會"`
- L657-678 `errorCopyFor_()` headings/details (TC strings)
- L693 `"載入中..."`, L726 `"重試"`, L747 `"課程"`, L748 `"目前沒有課程資料。"`, L761 `"重新整理"`
- L961 `"伺服器回應格式不正確。"` — duplicated at L973, L991, L1871, L1941.
- L1010 `"登入工作階段已失效，請重新登入。"`, L1121-1122 `"個人資料"` + `"載入中..."`
- L1153-L1176 placeholder section strings (`"聚會管理將於後續版本提供。"`, etc.)
- L1252-1266 forbidden view (`"無法存取"`, `"你沒有權限使用此功能（" + sectionKey + "）。"`, `"返回"`)
- L1449-1452 `"返回"` aria-label and label
- L1486 `"（示範資料，實際課程資料由後續票證提供）"`, L1493 `"（示範編輯功能，實際聚會編輯由後續票證提供）"`
- L1498 `"範例欄位"`, L1503 `"範例資料"`, L1525 `"儲存"`
- L1575, L1607 `"網絡連線不穩定，請稍後再試。"` (duplicated), L1595 `"提交失敗，請稍後再試。"`
- L1633 `"載入中..."`, L1649-1697 full Login form rebuild (all TC)
- L1716 `"登入失敗，請再試一次。"`, L1734-1739 recovery card headings/details (TC), L1757 `"重試"`
- L1787 `"請輸入使用者名稱和 PIN 碼。"`
- L1793 `"登入中..."`, L1822 `"系統將捨棄尚未儲存的變更..."` (3rd copy)
- L1887 `"操作失敗，請稍後再試。"`
- L1959, L2002 `"載入中..."`

**Total:** ≈ 50 distinct literal sites, with **5 duplicated strings** (the dirty-form message ×3, "重新整理" ×4, "載入中..." ×4, "伺服器回應格式不正確。" ×5, "網絡連線不穩定，請稍後再試。" ×2, "個人資料" ×3). There is **no `window.EfccCopy` / `strings` / `i18n` module** anywhere in `src/gas/`. Direct issue #71 AC failure ("All shell copy is Traditional Chinese from a consistent copy source (single object/module of strings vs scattered literals).").

#### `aria-current` (lines 402, 501, 504)

- Initial nav item is built with `aria-current="false"` (line 402).
- `updateActiveNav_` (lines 495-510) sets `aria-current="page"` on the active item and `aria-current="false"` on others. Good.
- This is exercised by `tests/e2e/role-matrix.test.ts:296-328` ("EFCC role-matrix active-section state" describe block). Passes.

#### `<button role="link">` misuse (lines 403, 423)

- `buildNavItem_` builds nav items as `<button>` elements with `role="link"`. This is an ARIA role misuse — a button is not a link, and forcing `role="link"` removes button semantics from the accessibility tree. Screen readers will announce these as "link" and may not fire button-specific keyboard events. Issue #71 AC requires "Keyboard users can reach/activate/leave every nav item" — the elements do work, but the announced role is wrong.

#### Focus management

| Trigger | Current behavior | Issue #71 expectation | Source |
|---|---|---|---|
| Login submit (after server reply) | `renderLogin_` ends with `u.focus()` at L1710 | (good) | `shell-session.js.html:1709-1711` |
| Root nav change (navigateTo_) | **No focus move.** | Move focus to content heading or first focusable in new section | `shell-session.js.html:530-580` |
| Nested task entry (openTask_) | **No focus move.** | Move focus to task title or Back button | `shell-session.js.html:1410-1440` |
| Nested task exit (closeTask_) | **No focus move.** | Restore focus to the nav item that opened the task | `shell-session.js.html:1440-1485` |
| Error recovery | **No focus move.** | Move focus to retry button | `shell-session.js.html:705-730, 1745-1770` |
| Login transition | **No focus move.** | Move focus to username field (currently done in `renderLogin_` — partial credit) | `shell-session.js.html:1655-1720` |
| Discard confirmation | Cancel restores focus to `restoreFocusTo` (good) | (good) | `form-guard.js.html:230-247, 253-255` |

This is the **biggest single gap** against issue #71. Direct, unambiguous AC failure on every row except the discard-cancel one.

#### More menu (overflow menu)

- `buildMoreButton_` (lines 420-465) creates a `<button class="nav-item nav-item-phone nav-item-more" aria-haspopup="true" role="link" onclick="toggleMoreMenu_">` with an embedded `<div id="more-menu" class="more-menu hidden" role="menu">` and `<button class="more-menu-item" role="menuitem" data-section="...">`.
- **`role="menu"` requires `role="menuitem"` children, AND requires keyboard support for arrow-key navigation, Escape to close, and Home/End.** None of this is implemented.
- `toggleMoreMenu_` (lines 470-480) only flips the `.hidden` class. It does not:
  - Move focus into the menu when opened.
  - Trap Tab inside the menu.
  - Move focus back to the More button when closed.
  - Close the menu on Escape.
  - Support arrow-key navigation between `role="menuitem"` items.
- The `aria-haspopup="true"` on the trigger button declares a popup exists, but the popup is not a separate accessible widget — it's a `<div>` inside the same button. **Nested interactive elements** (a button containing other buttons) is invalid HTML.
- This is a direct AC failure on every issue #71 keyboard-navigation bullet that touches the More menu.

#### Dirty-form confirmation (`form-guard.js.html:140-260`)

- `confirmDiscard(opts)` renders a `<div class="discard-overlay">` with `<div role="dialog" aria-modal="true">` containing heading, message, confirm button "捨棄變更", cancel button "繼續編輯".
- Escape handler closes the modal (good).
- Cancel button is focused by default via `setTimeout` (good).
- **No focus trap** — Tab after the cancel button leaves the modal into the page below.
- **No `aria-labelledby`** pointing to the heading (the modal has a heading but no accessible name).
- **No `aria-describedby`** for the message body.
- The Cancel and Confirm buttons are styled via **inline `style.cssText` strings** (lines 108-127) — meaning:
  - There is no `:focus-visible` style for them.
  - A keyboard user navigating past the default-focused Cancel button gets **no visible focus indicator**.
- Direct AC failure on "Focus moves intentionally after … discard confirmation" (no focus return on Escape, only on Cancel/Confirm click).

#### `aria-live` / status messaging

The grep for `aria-live` across `src/gas/` finds **exactly 2 occurrences**:

1. `App.html:18` — `role="status" aria-live="polite"` on `#app-status` (the global status strip).
2. `shell-session.js.html:154` — the attribute name appears inside the `el()` factory's `if`-chain so that callers can pass `aria-live: "polite"` if they want; **no caller actually does**.

Search for `aria-live` in `shell-session.js.html` (the body) returns **no matches**. There is **no live region for any of the issue #71 feedback states** (loading / success / validation / error / forbidden / session-expired). The `role="alert"` containers `#login-msg` and `#demo-submit-msg` cover those two specific paths only (login failure and form submit failure), but:

- Loading state ("載入中...") goes to `#app-status` (status role, polite live — good).
- Section-level error cards (lines 705-730) have **no** `aria-live` and are placed inside `<section>` with no role — a screen reader user navigating the DOM after a Programs failure will not be informed of the failure unless they happen to tab through the section.
- Forbidden view (lines 1255-1275) — same problem.
- Session-expired message (line 1010) — shown via `showLoginError_` which writes to `#login-msg` with `role="alert"` (good, because `role="alert"` implies `aria-live="assertive"`).

### 1.7 `src/gas/form-guard.js.html` — see §1.6 dirty-form section above.

---

## 2. Existing tests that touch the AC space

| Test file | Coverage relevant to #71 AC |
|---|---|
| `tests/gas/app-shell.contract.test.js` | Shell scaffolding (id presence, no inline viewport meta, hidden nav regions, 768px breakpoint in CSS). **No a11y tests.** |
| `tests/gas/login-and-bootstrap.test.js` | Login flow + state machine. **No keyboard / focus / screen-reader tests.** |
| `tests/gas/role-navigation.test.js` | Server-side `bootstrapSectionsForRole_` capability calc. **No client-side nav render tests beyond `shell-session.test.js`.** |
| `tests/gas/nested-task-navigation.test.js` | Nested-task state machine. **No focus management, no keyboard nav.** |
| `tests/gas/form-guard.test.js` | Form state machine, idempotency, safe rendering. **No focus / aria assertion on the modal itself** (covered only by structural checks). |
| `tests/gas/shell-session.test.js` | State transitions + RPC wrappers. **No aria / focus / zoom / keyboard checks.** |
| `tests/gas/programs-section-recovery.test.js` | Programs loading + stale-response handling. **No a11y checks.** |
| `tests/gas/api-get-programs.test.js`, `tests/gas/programs-repository.test.js`, `tests/gas/api-submit-demo-form.test.js` | Server-side only. **Out of scope for #71.** |
| `tests/e2e/role-matrix.test.ts` | Phone/desktop nav structure (AC #2/#4/#5/#6/#8 negative). Asserts `aria-current` switch and `[data-section]` enumerations. **No keyboard navigation, no screen-reader semantic assertions, no focus management.** |
| `tests/e2e/nested-task-navigation.test.ts` | Nested-task DOM swap, document title unchanged, breadcrumb visible, Back control aria-label = "返回". **No keyboard-only traversal.** |
| `tests/e2e/form-protection.test.ts` | Discard modal Cancel/Confirm, submit-button disabled state, safe-render (no injected scripts/handlers). **No focus trap assertion, no `:focus-visible` check, no Escape-keyboard assertion beyond clicking the visible Cancel button.** |

**No Playwright spec uses `page.keyboard.press('Tab')` to walk the DOM** — there is **no automated keyboard-traversal coverage at all**. No spec imports `@axe-core/playwright` or `axe-playwright`. There is **no manual keyboard-test document** in `docs/specs/`.

---

## 3. Acceptance-plan doc naming convention

Reviewed:

- `docs/specs/067-role-nav-acceptance-plan.md` — heading `# Issue #67 — Headless Browser Acceptance Plan`; sections: Status header, Scope / role matrix, Phone viewport trace (numbered 1-9), Desktop viewport trace (10-11), Forbidden trace (12-13), Recovery trace (14), Non-goals, User-supplied prerequisites.
- `docs/specs/068-nested-task-navigation-acceptance-plan.md` — heading `# Issue #68 — Nested Task Navigation Acceptance Plan`; sections: Status, Scope note, Role matrix, Phone viewport trace (MEMBER), Desktop viewport trace (STAFF), Forbidden / unknown route trace, Badge trace, Non-goals, Executed results placeholder.
- `docs/specs/069-async-recovery-acceptance-plan.md` — heading `# Issue #69 — Async Recovery Acceptance Plan`; sections: Status, Scope (grilled and confirmed), What was implemented (server/client/tests), Official documentation evidence, **AC disposition table** with row per AC and status (`proven locally` / `BLOCKED`), Remaining blocker `/exec` gate, Non-goals, Executed results, Rollback.
- `docs/specs/070-form-protection-acceptance-plan.md` — same shape as #69, with role-matrix, phone-viewport trace, desktop-viewport trace, AC disposition table.

The **modern pattern** (069/070) is:

1. Header with issue number, status, branch, parent, spec citation, date.
2. Scope note (grilled and confirmed — explicitly records what is in/out).
3. "What was implemented" with three subsections (server / client / tests), each enumerated.
4. "Official documentation evidence (AGENTS.md gate)" — URLs cited per AGENTS.md.
5. **AC disposition table** — one row per AC, columns `AC | Status | Evidence`, with `proven locally` / `BLOCKED` / `done`.
6. "Remaining blocker: AC #12 / the fresh `/exec` gate" — explicit note that human must run the deployment.
7. "Non-goals" — explicit out-of-scope list.
8. "Executed results" — auto-appended by `tests/e2e/plan-doc-appender.ts`.
9. "Rollback".

For issue #71 a `docs/specs/071-shell-accessibility-acceptance-plan.md` (or `071-shell-usability-acceptance-plan.md` to match issue title wording) following this exact template is the right shape. The issue body here does not give issue #71 a numeric title beyond "Make the shell usable across phone, desktop, keyboard, and screen reader." — recommend `071-shell-usability-acceptance-plan.md`.

---

## 4. Consolidated gap table mapped to issue #71 acceptance criteria

Legend: `BLOCKER` = AC cannot be satisfied without addressing; `CONCERN` = AC partially satisfied, gap material; `NIT` = missing polish.

| # | Issue #71 AC (verbatim) | Current state | Gap | Severity |
|---|---|---|---|---|
| 1 | Phone is default layout <768px; desktop side nav ≥768px; no authz model change. | `styles.html:111-128` (`max-width: 767.98px`) and `:138-167` (`min-width: 768px`); `Code.gs:38-44` sets viewport meta; `bootstrapSectionsForRole_` unchanged from #67. | None material. | — |
| 2 | Primary phone actions/nav targets: min 44×44 CSS px interactive area, sensible spacing. | `.nav-item-phone` is 48 CSS px tall, flex-1 wide (≥44 wide). Refresh button (`.btn-refresh`) has only `padding: 4px 12px` and no `min-height` — touch target likely 28 CSS px tall. Submit button (`.btn-primary`) has `padding: 8px 16px` ≈ 40 CSS px tall. Open-task button (`.btn-open-task`) similar. Back button (`.btn-back`) has `padding: 8px 0` and no `min-height` — touch target likely 24 CSS px tall. | Phone nav items OK; all other primary actions under-target. | **BLOCKER** |
| 3 | Fixed phone nav respects safe-area insets; never covers focused controls, error messages, submit actions. | Phone nav is `position: fixed; bottom: 0` with **no `env(safe-area-inset-bottom)`** on either the nav or the `padding-bottom: 64px` on `.app-content`. | iPhone X+/Android gesture-nav devices overlap the bar and the content's bottom 24-34 px sit under it. | **BLOCKER** |
| 4 | Layout usable at narrow widths and browser zoom without horizontal loss of core actions. | `Code.gs:38-44` sets `maximum-scale=1` — **disables user pinch-zoom**. `position: fixed; inset: 0` on `html, body` (styles.html:33-44) prevents any document scroll, including horizontal — at narrow widths the **fixed 240px desktop nav** would overflow but is hidden below 768px so OK on phone; on desktop it works. | Two blockers: (a) pinch-zoom disabled; (b) no horizontal-overflow audit on phone zoom. | **BLOCKER** |
| 5 | Root navigation uses semantic `<nav>`/landmark markup, clear labels, accessible current-item state (`aria-current` or similar). | Both navs are `<nav>` elements (App.html:23-24). Nav items have visible Traditional-Chinese labels. `aria-current="page"` / `"false"` updates on active switch (lines 495-510). `<nav>`s lack `aria-label` to disambiguate from each other for screen-reader landmark navigation. | Mostly satisfied; minor disambiguation gap. | NIT |
| 6 | Keyboard users can reach/activate/leave every nav item, More menu item, Back action, Refresh action, retry action, and form control in predictable tab order. | Native `<button>` elements → DOM order is tab order. **No `:focus-visible` on `.btn`, `.btn-back`, `.btn-refresh`, `.btn-open-task`, `.more-menu-item`, Login submit, modal buttons** → keyboard users have **no visible focus indicator** on most controls. More menu has no Escape / arrow / Home / End keyboard handling. | Visible-focus missing everywhere except nav items and inputs; More menu is keyboard-broken. | **BLOCKER** |
| 7 | Focus moves intentionally after: root nav change, nested task entry/exit, error recovery, Login transition, discard confirmation. | Only the discard-cancel path (`form-guard.js.html:230-247, 253-255`) and `renderLogin_`'s username field (`shell-session.js.html:1709-1711`) restore/move focus. All other transitions leave focus where it was. | Six of seven listed triggers miss focus management. | **BLOCKER** |
| 8 | Loading/success/validation/error/forbidden/session-expired feedback announced via accessible status mechanism (`aria-live`) without repeated noise (no spam on every keystroke/poll). | `#app-status` is `role="status" aria-live="polite"` but only updated twice (login + section load). Section-error cards (lines 705-730), Forbidden view (1255-1275), form validation (1595-1598) all **lack** `aria-live`. `#login-msg` and `#demo-submit-msg` have `role="alert"` (good). Programs-loading card (685-700) and Programs-empty card (735-770) — no live announcement. Status updates happen once per RPC (not on every poll/keystroke) so no spam risk. | Most feedback paths are silent to screen readers. | **BLOCKER** |
| 9 | Selection/error/warning/disabled states use text/icon/semantics in addition to color (not color-only). | Active nav state: color + `font-weight: 600` + desktop-only `background: rgba(...)` (so on phone, weight + color only — weight barely perceptible at 12px). Disabled state: button styled identically to enabled (no `:disabled` rule). Error state: color only (`msg-error` is just `color: var(--color-error)`). No icons anywhere in the shell. | Every listed state is color-only or near-color-only. | **BLOCKER** |
| 10 | Optional count badges have accessible label; don't become the nav item's only name. | Badge is a `<span class="nav-badge">` with `textContent = N` — **no `aria-label`, no `aria-hidden`, no `role`**. Screen readers using button-name heuristic may or may not include the badge text (implementation-defined). | Badge value is opaque to AT. | CONCERN |
| 11 | All shell copy is Traditional Chinese from a consistent copy source. | Copy is scattered as literals across `shell-session.js.html` (≈50 sites), `form-guard.js.html`, and `App.html` / `view-login.html`. No `window.EfccCopy` / `strings` / `i18n` module. | No copy source exists. | **BLOCKER** |
| 12 | Existing automated a11y checks + manual keyboard checks covering Login, root nav, nested Back, retry, More, dirty-form confirmation. | No `axe-core` / `@axe-core/playwright` is used. No `page.keyboard.press('Tab')` traversal in any E2E spec. No manual keyboard-test doc in `docs/specs/`. | Zero automated a11y coverage; zero manual a11y test plan. | **BLOCKER** |
| 13 | A versioned isolated `/exec` is manually checked at phone/desktop widths with recorded results. | Pattern established by `069-async-recovery-acceptance-plan.md` §"Remaining blocker: AC #12 / the fresh `/exec` gate" and `070-form-protection-acceptance-plan.md` §"Executed results" — manual log of (deployment version ID, execution IDs, viewport, role, step, observed result). A new `071-shell-usability-acceptance-plan.md` should follow that exact section shape. | No plan doc exists yet; the pattern to follow is #69/#70. | (planning gap — no code gap) |

### Bonus gaps discovered (not in the AC list but material)

- **`<button role="link">`** on every nav item (lines 403, 423). ARIA role misuse — screen readers announce "link" and may not fire button-specific keyboard events. Should be a plain `<button>` with no `role`.
- **Nested interactive controls** — the More button (`<button class="nav-item-more">`) contains `<div role="menu">` which contains `<button role="menuitem">`. Putting interactive elements inside another interactive element is invalid HTML and produces undefined AT behavior. Should be a sibling, not a child.
- **`role="link"` on the More button** (line 423) is the same misuse as #5 above.
- **No `aria-label` on either `<nav>`** (App.html:23-24) — screen-reader landmark navigation distinguishes them by `aria-label` or accessible name; without one, both read as "navigation".
- **`role="dialog"` on the discard modal** has no `aria-labelledby` (form-guard.js.html:169-170). The heading is a sibling `<h3>` with no `id`. The dialog has no accessible name.
- **The discard modal's overlay** is appended to `document.body` (form-guard.js.html:163) **outside** `#app`, so AT landmark navigation skips it (it sits outside the `<main>` landmark). It should be moved into `#app` or `#app-content`.
- **`.app-shell { position: fixed; inset: 0 }`** (styles.html:47-51) plus `html, body { position: fixed; inset: 0; overflow: hidden }` (styles.html:33-44) — **disables the browser's viewport-resize behavior on Android keyboards** and prevents any element outside the shell from scrolling. Acceptable for the App Document model but worth confirming with issue #71.
- **`color: var(--color-muted)` on `.breadcrumb-parent`** (styles.html:458-460, set to `var(--color-primary)` actually) — fine.
- **`<button class="btn btn-refresh" data-action="refresh-section">` has `aria-label="重新整理"`** (lines 577, 756, 784) — but the visible text content is also `"重新整理"`. Redundant; could be either `aria-label` removed or the visible text moved into a child span. Minor.

---

## 5. Severity summary

- **BLOCKERS (8 of 13 ACs):** #2 touch targets, #3 safe-area insets, #4 zoom, #6 visible focus, #7 focus management, #8 live regions, #9 non-color state signals, #11 copy source, #12 a11y test coverage (8 distinct ACs).
- **CONCERN:** #10 badge a11y.
- **NIT:** #5 landmark disambiguation.
- **Planning gap:** #13 acceptance plan doc.
- **Bonus material (not AC):** `<button role="link">` misuse, nested interactive controls, dialog `aria-labelledby` missing, modal landmark placement, `:disabled` CSS missing.

---

## 6. Implementation recommendations (not for this audit; for the implementer of #71)

These are NOT implementation tasks; this is read-only. Listed as a quick reference for the implementer:

1. **Drop `maximum-scale=1`** from `Code.gs:42-44` (also re-check `tests/gas/app-shell.contract.test.js` — the assertion is on presence, not value, so the test will pass without change).
2. **Add `env(safe-area-inset-bottom)`** to both `.app-nav-phone` `padding-bottom` and `.app-content` `padding-bottom` (currently `64px` → `calc(64px + env(safe-area-inset-bottom))`).
3. **Add a single `window.EfccCopy` module** (new file `src/gas/copy.js.html`) holding every TC string, including the duplicated `errorCopyFor_` copy and the dirty-form message; rewrite the ~50 literal sites to read from it.
4. **Add `:focus-visible` rules** in `styles.html` for `.btn`, `.btn-back`, `.btn-refresh`, `.btn-open-task`, `.more-menu-item`, `.btn-primary`, and the inline-styled modal buttons. Also add `:disabled` rules (opacity + cursor + maybe aria-disabled on JS side).
5. **Add a skip-to-content link** before `<main id="app-content">`.
6. **Remove `role="link"`** from every nav item button (line 403, 423) and let `<button>` semantics stand.
7. **Make the More menu a proper menu widget** — sibling of the trigger, not child; add `aria-expanded` on the trigger, focus first item on open, Escape to close + restore focus to trigger, arrow-key navigation between items, Home/End.
8. **Add focus management** at every navigation transition: render the new section heading with `tabindex="-1"` and `.focus()` after paint; restore focus to the nav item that opened a task on close.
9. **Wrap every status transition in `aria-live="polite"`** at the document region (section-error cards, forbidden view, programs-empty card). Either set `role="status"` on the wrapping `<section>` or wrap the message in a `<div role="status" aria-live="polite">`.
10. **Add non-color state signals** — a leading glyph or text prefix on disabled buttons ("重新整理（處理中...）"); an icon next to error messages; a visual marker beyond weight on phone active nav (e.g. top-border accent).
11. **Add `@media (prefers-reduced-motion: reduce) { * { transition: none !important } }`** to zero out the `0.15s color` transition.
12. **Add `aria-label` on the badge** (`aria-label="${count} 個未讀"` or similar) AND on each `<nav>` (`aria-label="主要導覽（手機）"` / `aria-label="主要導覽（桌面）"`).
13. **Move the discard modal into `#app`** (or apply `role="dialog"` to a container that is a sibling of the focus-trap, with `aria-labelledby` pointing to the heading `id`). Add a focus trap.
14. **Add `aria-disabled`** programmatically when `submitBtn.setAttribute("disabled", "disabled")` fires (lines 1547, 1792).
15. **Add automated a11y tests**: import `@axe-core/playwright`, run `new AxeBuilder({ include: ['#app'] }).analyze()` after every E2E scenario; add `page.keyboard.press('Tab')` walks that assert the focused element's `data-section` / `data-action` follows the expected order.
16. **Author `docs/specs/071-shell-usability-acceptance-plan.md`** following the #69 / #70 template (sections in §3 above). Include a `/exec` deployment gate and a viewport matrix that explicitly tests 375×812 (phone), 768×1024 (the exact breakpoint), 1024×768 (small desktop), and 1280×800 (E2E reference desktop).

---

## 7. Acceptance-plan doc shape to clone

For `docs/specs/071-shell-usability-acceptance-plan.md`, mirror `069-async-recovery-acceptance-plan.md` line-for-line. Key sections in order:

```
# Issue #71 — Shell Usability Acceptance Plan
**Status:** Implemented locally / **Blocked on fresh `/exec` deployment**
**Branch:** feat/issue-71-shell-usability
**Parent:** #64. Blocked-by: #67 (merged), #68 (merged), #69 (merged), #70 (merged).
**Spec:** docs/specs/009-phone-first-shell-navigation.md + WCAG 2.2 AA + issue #71 AC list
**Date:** 2026-07-30

## Scope, as grilled and confirmed
... (what #71 owns vs. what #64's children own)

## What was implemented
### Client (`src/gas/`)
... (enumerated per AC)

### Tests
... (new tests/gas/* and tests/e2e/* files)

## Official documentation evidence (AGENTS.md gate)
- WCAG 2.2 SC 1.4.4 (Resize text): https://www.w3.org/TR/WCAG22/#resize-text
- WCAG 2.2 SC 1.4.10 (Reflow): https://www.w3.org/TR/WCAG22/#reflow
- WCAG 2.2 SC 2.4.1 (Bypass Blocks): https://www.w3.org/TR/WCAG22/#bypass-blocks
- WCAG 2.2 SC 2.5.5 (Target Size): https://www.w3.org/TR/WCAG22/#target-size-enhanced
- WCAG 2.2 SC 2.5.8 (Target Size Minimum): https://www.w3.org/TR/WCAG22/#target-size-minimum
- WCAG 2.2 SC 3.3.1 (Error Identification): https://www.w3.org/TR/WCAG22/#error-identification
- WCAG 2.2 SC 4.1.2 (Name, Role, Value): https://www.w3.org/TR/WCAG22/#name-role-value
- WCAG 2.2 SC 4.1.3 (Status Messages): https://www.w3.org/TR/WCAG22/#status-messages
- ARIA Authoring Practices — Menu pattern: https://www.w3.org/WAI/ARIA/apg/patterns/menubar/
- env(safe-area-inset-*): https://developer.mozilla.org/en-US/docs/Web/CSS/env()
- prefers-reduced-motion: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion

## AC disposition
| AC | Status | Evidence |
|---|---|---|
| #1 phone <768, desktop ≥768 | proven locally | styles.html media queries |
| #2 44×44 touch targets | proven locally | nav-item + btn rules |
| ... | ... | ... |
| #13 /exec recorded | BLOCKED | requires deployment |

## Remaining blocker: AC #13 / the fresh `/exec` gate
... (deploy matrix, evidence capture protocol, identical to #69/#70)

## Non-goals for this branch
- Real Programs/Events/Scanner/Care domain UX (own tickets).
- Internationalization beyond Traditional Chinese (own ticket if needed).
- iOS/Android native app shell (out of scope per ADR-0007).

## Executed results
_(Appended automatically by pnpm test:e2e → tests/e2e/plan-doc-appender.ts once the Playwright a11y + keyboard assertions exist and run against a fresh /exec deployment.)_

## Rollback
No production Sheet, Apps Script project, or deployment is touched by this branch.
```

---

## 8. Appendix — full file:line inventory

### Shell scaffold / chrome
- `src/gas/App.html:1-29` — doctype + main scaffold + 2 `<nav>`s.
- `src/gas/shell.js.html:1-43` — static shell, `data-app-state="SIGNED_OUT"`.
- `src/gas/Code.gs:38-44` — `doGet` with viewport meta containing `maximum-scale=1`.
- `src/gas/styles.html:1-578` — all CSS, breakpoints at 111-128 and 138-167.

### Dynamic shell
- `src/gas/shell-session.js.html:1-2098` — full client (TOC in §1.6 above).
- `src/gas/form-guard.js.html:1-260` — state machine + safe-render + `confirmDiscard`.

### Login
- `src/gas/view-login.html:1-39` — markup-only Login.
- Login rebuild at `shell-session.js.html:1655-1720`.

### Tests
- `tests/gas/app-shell.contract.test.js:294-301` — asserts `768px` is present.
- `tests/gas/app-shell.contract.test.js:189-194` — asserts no **inline** viewport meta in App.html (does not gate `Code.gs`).
- `tests/e2e/role-matrix.test.ts:296-328` — only place `aria-current` is asserted.
- `tests/e2e/form-protection.test.ts:160-205` — only place the discard modal Cancel/Confirm buttons are asserted visible.

### Spec docs
- `docs/specs/009-phone-first-shell-navigation.md` — original architecture spec; lists "minimum 44px interactive target" and "no horizontal scrolling at 375px" as Goals (lines 386-388). This audit's evidence trail maps to that spec.
- `docs/specs/067…070-*-acceptance-plan.md` — the four prior acceptance plans whose shape the new #71 plan should mirror.

### Acceptance-plan doc naming for #71
**Recommended filename:** `docs/specs/071-shell-usability-acceptance-plan.md` (mirrors the wording of issue #71's title: "Make the shell usable across phone, desktop, keyboard, and screen reader"). Alternative names seen in repo: nothing else with the "071-" prefix; `071-database-schema.md` exists but is unrelated.