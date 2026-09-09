# Static Inventory — Sticky / Fixed / Absolute Overlays (S4 + Scanner)

**Date:** 2026-08-27
**Worktree:** `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/s4-management-implementation`
**Branch / HEAD:** `feat/s4-12-shadcn-migration` / `d97af438`
**Triggering report:** user-supplied 748×1366 screenshot of `/management?module=permissions` — sticky unsaved-changes review bar is "visually huge and covers the page."
**Scope:** static inventory only; no production code, tests, package config, audit artifacts, or commits changed. New file: this report.

---

## 0. Executive summary

Three bottom-anchored layers can stack on a 748×1366 (or smaller) phone viewport while a user edits `/management?module=permissions`:

1. **App shell bottom dock** (`.nav-phone`, `position: fixed; z-index: 100; bottom: calc(0.625rem + env(safe-area-inset-bottom))`).
2. **Shared `ManagementStickyActionBar`** (`.stickyBar`, `position: fixed; z-index: 25; bottom: calc(5.1rem + env(safe-area-inset-bottom))`).
3. **`.reviewPanel`** *inside* `PermissionsPanel > PermissionPolicy` (`position: sticky; bottom: calc(5.1rem + env(safe-area-inset-bottom, 0px)); z-index: 2;`).

Layers 1 and 2 already coordinate via a hard-coded `5.1rem` (≈ 81.6 px) dock reserve + a `84px + safe-area-inset-bottom` `padding-bottom` on `.shell-content`. Layer 3 is the failure point: it claims the same `bottom: 5.1rem` as the shared bar, has **no `max-height` and no `overflow`**, contains a 100%-width full-bleed save button, and grows to a tall "unsaved changes" detail list when the admin toggles many permissions. Once it exceeds ~half the viewport, the sticky positioning *visually docks to the dock* and the safe-area reserve on `.shell-content` is insufficient, so the panel plus the save button cover the page content.

Root cause is a **policy gap**: there is no shared bottom-anchored "in-page action surface" contract. The two callers of `ManagementStickyActionBar` (approval queue tray, none in permissions) and the page-local `.reviewPanel` each ship their own `bottom:` value, height model, and overflow discipline. A single shared policy with explicit exceptions closes the gap.

---

## 1. Inventory of every fixed / sticky / absolute overlay

Search: `position:\s*(fixed|sticky|absolute)` across `web/app`, `web/components`, `web/lib` (excludes `.sr-only`, focus indicators, decorative badges).

### 1.1 Global / app shell

| ID | File | CSS selector / symbol | Position | Inset / anchor | z-index | Document flow | Safe-area | Notes |
| -- | ---- | --------------------- | -------- | -------------- | ------- | ------------- | --------- | ----- |
| S-01 | `web/app/globals.css:147-164` (used in `web/lib/app-shell.tsx`) | `.nav-phone` | `fixed` | `right: 0.875rem; bottom: calc(0.625rem + env(safe-area-inset-bottom, 0px)); left: 0.875rem; height: 62px` | `100` | out of flow | yes (`safe-area-inset-bottom`) | Phone-only floating bottom dock. Geometry: ~62 px high + 0.625 rem margin = ~72 px from bottom, expanding to 0.625 rem + safe-area on notched devices. |
| S-02 | `web/app/globals.css:166-168, 283-302` | `.nav-desktop` | `sticky` | `top: 64px; height: calc(100dvh - 64px);` (scanner variant: `top: 0; height: 100dvh`) | `90` | in flow | n/a | Desktop ≥800 px side rail. |
| S-03 | `web/app/globals.css:356-368` | `.shell-content` | `static` | `padding-bottom: calc(84px + env(safe-area-inset-bottom, 0px))` (mobile) | n/a | in flow | yes | Scroller in the shell — reserves 84 px + safe area so the floating dock (S-01) never covers content. |
| S-04 | `web/app/globals.css:370-401` | `.attention-overlay` / `.attention-overlay__backdrop` / `.attention-panel` | `fixed` | `inset: 0` / `inset: 0` / `position: relative; max-height: calc(100dvh - 2rem); overflow-y: auto` | `200` (backdrop 200) | out of flow | no | Attention / notifications modal; `max-height` set, content scrolls. |
| S-05 | `web/lib/auth-shell.module.css:6-24` | `.skipLink` | `absolute` | `left: 1rem; top: -3rem;` (revealed `top: 1rem` on `:focus-visible`) | `100` | out of flow | n/a | Off-canvas skip link, focus-only. |
| S-06 | `web/lib/auth-shell.module.css:32-48` | `.offlineBanner` | `fixed` | `top: max(8px, env(safe-area-inset-top)); left: 50%; transform: translateX(-50%)` | `95` | out of flow | `top` only | Top-center banner; never bottom. |
| S-07 | `web/lib/auth-shell.module.css:121-132` | `.bell` / `.bellBadge` | `relative` / `absolute` | n/a / `top: -0.2rem; right: -0.2rem;` | inherit | in flow | n/a | Notification badge. |

### 1.2 Management shared framework (`web/app/management/`)

| ID | File | CSS selector / symbol | Position | Inset / anchor | z-index | Document flow | Safe-area | Notes |
| -- | ---- | --------------------- | -------- | -------------- | ------- | ------------- | --------- | ----- |
| M-01 | `web/app/management/management-action-framework.tsx:62-72` + `web/app/management/management-action-framework.module.css:52-68` | `ManagementStickyActionBar` → `.stickyBar` | `fixed` | `right: 0.75rem; bottom: calc(5.1rem + env(safe-area-inset-bottom)); left: 0.75rem; min-height: 58px;` | `25` | out of flow | yes | **Shared** sticky action surface. Sits 5.1 rem above the viewport bottom = clears `.nav-phone` (62 px high + 0.625 rem margin = ~72 px) and the safe-area inset. **Importers:** `web/lib/approval-queue.tsx` (selection tray when `selectedIds.length > 0`); `web/lib/management-action-framework.test.tsx` (unit). |
| M-02 | `web/app/management/management-action-framework.tsx:74-116` + `.module.css:70-114` | `ManagementFilterSheet` → `.backdrop` / `.sheet` | `fixed` / `relative` | `inset: 0` / `width: 100%; max-height: 82dvh; overflow: auto; padding: 1.2rem 1rem calc(1rem + env(safe-area-inset-bottom))` | `110` (backdrop) / inherit (sheet) | out of flow | `bottom` | Filter sheet modal; `max-height: 82dvh` keeps it inside the viewport with internal scroll. |
| M-03 | `web/app/management/management-action-framework.module.css:91-102` | `.close` | `absolute` | `top: 0.6rem; right: 0.6rem;` | inherit | in flow (inside `.sheet`) | n/a | Close button inside filter sheet. |
| M-04 | `web/app/management/permissions-panel.tsx:441-453` (sticky toolbar) + `web/app/management/permissions-panel.module.css:441-453` | `.policyToolbar` | `sticky` | `top: 0;` | `3` | in flow | n/a | Sticky search/role-hint bar inside `.policySection`. Top-sticky; only competes with other top-sticky content. |
| M-05 | `web/app/management/permissions-panel.tsx:526-635` + `permissions-panel.module.css:648-660, 851-853, 911-913, 923-926` | `.reviewPanel` (`<aside role="region" aria-label=…>`) | `sticky` | `bottom: calc(5.1rem + env(safe-area-inset-bottom, 0px));` (phone, <800 px) → `position: static` (≥800 px <1024 px) → `position: sticky; top: 1rem;` (≥1024 px) | `2` | in flow | yes (phone) | **Primary suspect.** Contains `reviewHeader`, `changeSummary` (toggleable list of unsaved changes), `.saveButton` (100% width, `min-height: 44px`), `.reloadButton` (100% width), and `<p class="reviewNotice">`. **Has no `max-height` and no `overflow`.** Grows with `changes.length` and the CJK copy. |
| M-06 | `web/app/management/permissions-panel.module.css:889-894` | `.policyLayout` (companion) | `static` | `padding-bottom: calc(12rem + env(safe-area-inset-bottom, 0px)); scroll-padding-bottom: calc(12rem + env(safe-area-inset-bottom, 0px));` | n/a | in flow | yes | Adds 12 rem of bottom padding so the *page* doesn't end under the sticky `.reviewPanel`; on a 748×1366 device the 12 rem = 192 px is still less than a fully-expanded `.reviewPanel` (header + 6+ change items + save button ≈ 320-420 px). |
| M-07 | `web/app/management/permissions-panel.tsx:613-634` | `.saveButton` / `.reloadButton` | n/a (inside `.reviewPanel`) | `width: 100%; min-height: 44px;` | n/a | in flow | n/a | Stacked full-width primary actions; contribute to the vertical expansion of M-05. |
| M-08 | `web/app/management/account-directory-panel.module.css:411-418` | `.detail` / `.detailPlaceholder` (≥800 px) | `sticky` | `top: 88px;` | inherit | in flow | n/a | Account Directory detail column on desktop; not relevant to phone. |
| M-09 | `web/app/management/member-directory-panel.module.css:267-273` | `.visuallyHidden` | `absolute` | sr-only | n/a | out of flow | n/a | Skip-link / a11y label. |

### 1.3 Approval queue (S4 surface; uses shared bar M-01)

| ID | File | CSS selector / symbol | Position | Inset / anchor | z-index | Document flow | Safe-area | Notes |
| -- | ---- | --------------------- | -------- | -------------- | ------- | ------------- | --------- | ----- |
| A-01 | `web/lib/approval-queue.tsx:767-832` (uses M-01) | `.tray` (inside M-01) | `static` (inside the shared bar) | grid; `min-height: 44px` controls | n/a | in flow | n/a | Wraps `trayMain`, `trayActions`, and (when open) `trayItems`. |
| A-02 | `web/lib/approval-queue.module.css:485-496` | `.trayItems` | `static` | `max-height: 8rem; overflow-y: auto;` | n/a | in flow | n/a | **Caps tray expansion at 8 rem.** This is the model `.reviewPanel` is missing. |
| A-03 | `web/lib/approval-queue.tsx:834-876` + `.module.css:531-563` | `.confirmDialog` (native `<dialog>`) | browser-positioned, `width: min(32rem, calc(100% - 2rem)); margin: auto;` + `::backdrop { background: rgb(17 20 22 / 56%); }` | inherits UA centering | inherit (UA) | in flow | n/a | Native batch-approval confirm. `confirmNames` capped at `max-height: 9rem` (`.module.css:565-571`). |

### 1.4 Programs / event detail

| ID | File | CSS selector / symbol | Position | Inset / anchor | z-index | Document flow | Safe-area | Notes |
| -- | ---- | --------------------- | -------- | -------------- | ------- | ------------- | --------- | ----- |
| P-01 | `web/app/programs/programs.module.css:2215-2229` | `.participantConfirm` | `fixed` | `inset: 0; padding: 1rem;` | `20` | out of flow | no | Programs participant confirm dialog; below the global `z-50` modal layer. |
| P-02 | `web/app/programs/programs.module.css:2302-2336` | `.actionBarCard` | `static` (explicitly) | `position: static; bottom: auto; z-index: auto;` | n/a | in flow | n/a | Programs detail action card; overrides any inherited sticky behavior. |
| P-03 | `web/app/programs/programs.module.css:249-262` | `.notificationBadge` / `.notificationPopover` | `absolute` | `top: -0.35rem; right: -0.45rem;` / `top: 3rem;` | inherit / `2` | in flow | n/a | Header bell badge and popover. |
| P-04 | `web/app/programs/programs.module.css:985-989` | `.memberOptions` | `absolute` | `inset: calc(100% - 0.5rem) 0 auto;` | `2` | in flow | n/a | Per-row member options menu. |
| P-05 | `web/app/programs/programs.module.css:1276-1280` | `.directorySearchIcon` | `absolute` | `top: 50%; left: 0.75rem;` | inherit | in flow | n/a | Search field icon. |
| P-06 | `web/app/programs/programs.module.css:1711-1713` | `sr-only subheading` | `absolute` | sr-only | n/a | out of flow | n/a | Accessibility. |
| P-07 | `web/app/programs/programs.module.css:1357-1361` | `.directorySrOnly` | `absolute` | sr-only | n/a | out of flow | n/a | Accessibility. |

### 1.5 Attendance / scanner overlays

| ID | File | CSS selector / symbol | Position | Inset / anchor | z-index | Document flow | Safe-area | Notes |
| -- | ---- | --------------------- | -------- | -------------- | ------- | ------------- | --------- | ----- |
| SC-01 | `web/lib/attendance-panel.module.css:201-236` | `.cameraCorner*` (Top/Right/Bottom/Left) | `absolute` | `1rem` insets | inherit | in flow (inside `.cameraStage`) | n/a | Viewfinder brackets. |
| SC-02 | `web/lib/attendance-panel.module.css:298-309` | `.cameraHint` | `absolute` | `top: 112px; left/right: 20px;` | inherit | in flow | n/a | Overlay text. |
| SC-03 | `web/lib/attendance-panel.module.css:311-322` | `.cameraState` | `absolute` | `top: 50%; left/right: 20px;` | `1` | in flow | n/a | Centered state text. |
| SC-04 | `web/lib/attendance-panel.module.css:337-370` | `.cameraCornerLive*` | `absolute` | corners | inherit | in flow | n/a | Live-view brackets. |
| SC-05 | `web/lib/attendance-panel.module.css:372-377` | `.cameraStop` | `absolute` | `right: 20px; bottom: calc(76px + env(safe-area-inset-bottom, 0px)); left: 20px;` | inherit | in flow (inside `.cameraStage`) | yes | Live-stage stop button; **also hard-codes the dock reserve** (76 px ≈ 5.1 rem - 5 px) — distinct from the global 84 px reserve. |
| SC-06 | `web/lib/attendance-panel.module.css:1138-1148` | `.srOnly` | `absolute` | sr-only | n/a | out of flow | n/a | A11y. |

### 1.6 shadcn primitives (used by future dialogs / sheets; not currently mounted in any management surface)

| ID | File | Selector | Position | Notes |
| -- | ---- | -------- | -------- | ----- |
| U-01 | `web/components/ui/dialog.tsx:42-44` | `Dialog.Overlay` | `fixed; inset-0; isolate; z-50; bg-black/10;` | Backdrop. |
| U-02 | `web/components/ui/dialog.tsx:64-65` | `Dialog.Content` | `fixed; top-1/2; left-1/2; -translate-x-1/2 -translate-y-1/2; z-50;` | Centered modal. |
| U-03 | `web/components/ui/sheet.tsx:40-41` | `Sheet.Overlay` | `fixed; inset-0; z-50; bg-black/10;` | Backdrop. |
| U-04 | `web/components/ui/sheet.tsx:65-66` | `Sheet.Content` | `fixed; z-50; data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t` | Bottom sheet default. |
| U-05 | `web/components/ui/dialog.tsx:74` / `sheet.tsx:75-77` | Close button | `absolute; top-2/3 right-2/3;` | In-flow corner close. |

No `toast.tsx` in `web/components/ui/`; `@radix-ui/react-toast` is in `pnpm-lock.yaml` but is not currently used (`useToast` / `toast(` searches return zero results in `web/`). Status messaging is via `announce()` in `web/lib/live-region.ts` and the `<output role="status" aria-live="polite">` tested in `responsive.test.ts:310-325`.

### 1.7 Prototype page (only used at `/prototype`; not in the live app shell)

| ID | File | Selector | Position | Notes |
| -- | ---- | -------- | -------- | ----- |
| PR-01 | `web/app/prototype/prototype.module.css:625-635` | `.qrFind` | `absolute; 34×34;` | Decorative. |
| PR-02 | `web/app/prototype/prototype.module.css:925-931` | `.navPhone` | `sticky; bottom: 0;` | Prototype's own bottom nav, separate from S-01. |

---

## 2. Trace: imports and callers (for systemic fixes)

| Layer | Defined in | Imported by | Notes |
| ----- | ---------- | ----------- | ----- |
| `.nav-phone` (S-01) | `app/globals.css` (token source, not a JS module) | `web/lib/app-shell.tsx` mounts it via `web/lib/nav-bar.tsx` (`<nav className="nav-phone">`) | Single mount point — every authenticated page goes through `<AppShell>`. |
| `ManagementStickyActionBar` (M-01) | `app/management/management-action-framework.tsx` | `web/lib/approval-queue.tsx:9` (production use, `<ManagementStickyActionBar label=…>…</…>` when `selectedIds.length > 0`); `web/lib/management-action-framework.test.tsx:7` (test) | Only the approval queue uses it in production. PermissionsPanel does **not** — it ships its own in-page `.reviewPanel` (M-05). |
| `ManagementFilterSheet` (M-02) | same file | `account-directory-panel.tsx`, `member-directory-panel.tsx` (re-use the framework's filter sheet for phone filter UI), `management-action-framework.test.tsx:5` | Single shared modal — good. |
| `safeManagementReturnHref` | same file | `account-directory-panel.tsx:22`, `permissions-panel.tsx:33`, `app/permissions/page.tsx:6`, `lib/approval-queue.tsx:11` | Used for origin-aware Back. Not sticky. |
| `.reviewPanel` (M-05) | `app/management/permissions-panel.module.css` | only `app/management/permissions-panel.tsx:529` | No external consumer; safe to refactor in place, but the pattern is repeated in spirit elsewhere (Home CMS editor's "publish" card, account detail cards). |
| `.policyToolbar` (M-04) | same CSS | `permissions-panel.tsx:459` | Top-sticky; not the failing layer. |
| `.detail/.detailPlaceholder` (M-08) | `account-directory-panel.module.css` | `account-directory-panel.tsx` (desktop only) | Reuses the same sticky `top: 88px` pattern. |
| `.cameraStop` (SC-05) | `lib/attendance-panel.module.css` | `lib/attendance-scanner-ui.tsx` and `lib/attendance-panel.tsx` (via class names) | The only scanner-layer bottom-anchored action; coordinates with the global 84 px dock reserve but uses a **different hard-coded value (76 px)**, which the comment at lines 281-283 flags as a known tight fit. |

**Implication for systemic fixes:** the only production caller of `ManagementStickyActionBar` is the approval queue. Permissions' `.reviewPanel` is the lone outlier. A shared policy that all three (M-01, M-05, and any future in-page action panel) must follow is feasible without touching the scanner surfaces.

---

## 3. Phone / responsive contracts and test gaps

### 3.1 Existing contracts

- **Global dock reserve** — `.shell-content { padding-bottom: calc(84px + env(safe-area-inset-bottom, 0px)); }` (`globals.css:356-362`) plus `.nav-phone` height 62 px + 0.625 rem margin and `bottom: calc(0.625rem + env(safe-area-inset-bottom, 0px))`. Documented as the "shell outlet must reserve the nav height plus safe-area inset" — verified by `tests/e2e/responsive.test.ts:185-222` (CDP `Emulation.setSafeAreaInsetsOverride` and asserted `navBottom === "44px"`, `shellBottom === "118px"` on phone).
- **Scanner reserve** — `.cameraStage { min-height: min(760px, calc(100dvh - 84px - env(safe-area-inset-bottom, 0px))); }` (`attendance-panel.module.css:253-276`) and a tight `padding: 92px 20px 142px` that yields the 142 px bottom space consumed by `.cameraStop` at `bottom: calc(76px + safe-area)`. Tested in `tests/e2e/responsive.test.ts` only via no-horizontal-overflow and 44 px checks, not via "stop button clears the dock."
- **Management action framework** — `tests/e2e/s4-management-hardening.test.ts:312-363` ships `assertResponsiveGeometry()` which only checks no-horizontal-overflow and ≥44 px controls. It does **not** check the geometry of `.stickyBar` or `.reviewPanel`.
- **Permissions page sticky bottom** — only `permissions-panel.module.css:889-894` reserves 12 rem of `padding-bottom` on `.policyLayout` (media `(max-width: 799px)`) and `scroll-padding-bottom`; no test asserts the panel actually clears the dock.

### 3.2 Test gaps (ranked by impact on this bug)

1. **No test asserts the *height* of `.reviewPanel` or `ManagementStickyActionBar` against viewport height.** Without a max-height + overflow contract, nothing fails when the bar covers the page.
2. **No test asserts the *z-index ordering* between `.nav-phone` (z-100), `ManagementStickyActionBar` (z-25), and `.reviewPanel` (z-2).** When `.reviewPanel` "docks" to `bottom: 5.1rem`, it sits below the floating nav (good), but its shadow + 100% button can still occlude content; the bar is the right z-tier, but the panel's *height* is the actual defect.
3. **No test asserts that page content under the sticky panels is reachable via tab/click after the bar mounts.** `responsive.test.ts:327-394` asserts the *first* primary control is 44 px but does not iterate beyond the first.
4. **No test covers the 748×1366 viewport (the user's screenshot).** The S4 hardening config (`tests/e2e/s4-management-hardening.config.ts:62-102`) covers phone-320/375/390/414, tablet-600/799, desktop-800/1024/1440/1920 — no 7-inch tablet. The 1366-tall device is a Pixel Tablet / iPad-mini portrait; the S3 `responsive.test.ts` only uses 375×667 and 1280×800.
5. **No test asserts a "double-bottom-reserve" guard:** when both `.nav-phone` and a `position: sticky bottom:` surface are present, the page must reserve at least `84 + 58 (stickyBar min-height) + safe-area = ~142 px + safe-area`. Currently the only reservation in permissions is 12 rem (192 px) on `.policyLayout`; the global `.shell-content` reservation (84 px) is *not* combined with the panel height.
6. **No test asserts the sticky bar's content is scrollable internally** (A-02 caps `.trayItems` at 8 rem and scrolls; nothing caps `.changeSummary` ul).
7. **No test confirms the `748×1366` matrix in any gate.** The `s4-management-hardening` is the only local-D1 run that exercises permissions; only `phone-390` and `desktop-1024` are used for the Account Directory test, and permissions has no phone-targeted assertion.
8. **No test guards the scanner `76 px` vs. global `84 px` divergence** (SC-05 vs S-01). Comment in CSS explains the danger; no test enforces the floor.

### 3.3 Route inventory (for the lead to cover)

`web/app/**/page.tsx` (excluding the prototype):
- `/` (landing/login) — `app/page.tsx`
- `/register` — `app/register/page.tsx`
- `/home` — `app/home/page.tsx`
- `/profile` — `app/profile/page.tsx`
- `/profile/settings` — `app/profile/settings/page.tsx`
- `/scanner` — `app/scanner/page.tsx`
- `/notices` — `app/notices/page.tsx`
- `/messages` — `app/messages/page.tsx`
- `/programs` — `app/programs/page.tsx`
- `/guest-check-in` — `app/guest-check-in/page.tsx`
- `/management` (with `?module=` switch) — `app/management/page.tsx`. Sub-modules:
  - `accounts` (AccountDirectoryPanel)
  - `approvals` (ApprovalQueue or ApprovalDetail by `?request=`)
  - `members` (MemberDirectoryPanel)
  - `home-content` (HomeContentEditor)
  - `permissions` (PermissionsPanel — **the failing surface**)
  - `attendance` (AttendanceOperatorPanel)
  - `settings` (SettingsHub)
  - `checkin-settings` (CheckinSettings)
  - `timezone-settings` (TimezoneSettings)
  - default → ManagementHub
- `/permissions` — legacy redirect to `/management?module=permissions` (`app/permissions/page.tsx`)
- `/registrations` — legacy redirect to `/management?module=approvals` (`app/registrations/page.tsx`)
- `/events` — `app/events/page.tsx`
- `/prototype` — `app/prototype/page.tsx` (isolated; not exercised in S4 gates)

Test coverage by route:
- `responsive.test.ts` (375×667, 375×812, 1280×800): `/`, `/register`, `/home`, `/profile`, `/profile/settings`.
- `s4-management-hardening.test.ts` (10 widths): `/management` + every sub-module. The `assertResponsiveGeometry` is called on the *current* page in each test; it only checks no-overflow and 44 px. No 748×1366.

**No matrix entry for 748×1366 (Pixel Tablet portrait).** That gap matches the user's reproduction. The S3 audit captures 320×568 / 375×667 / 375×844 / 414×736 / 414×896; the S4 audit captures 10 widths but none in the 7-inch tablet band.

---

## 4. Ranked root-cause hypotheses

> Order: most-likely → least-likely. Each cites the exact selector and file.

### H1 (PRIMARY) — `.reviewPanel` has no max-height and no overflow, so it grows past the safe-area reserve and covers the page.

- **Selector:** `.reviewPanel` in `web/app/management/permissions-panel.module.css:648-660` (and companion `.changeSummary`/`.saveButton`/`.reloadButton` rules at 689-793).
- **Evidence:**
  - `position: sticky; bottom: calc(5.1rem + env(safe-area-inset-bottom, 0px));` with no `max-height` and no `overflow`.
  - `.changeSummary ul` (line 702) and `.changeSummary li` (line 710) have no height cap; each list item is `min-height` 0 with multi-line `strong` + `span` + `.changeConsequence` (line 728) that wraps CJK consequence copy.
  - `.saveButton, .reloadButton` are `width: 100%; min-height: 44px`; both render when the panel is dirty.
  - Companion reservation `.policyLayout { padding-bottom: calc(12rem + env(safe-area-inset-bottom, 0px)) }` (line 890-893) — 12 rem = 192 px. A panel with header (~64 px) + 5 changes (~6 lines × ~32 px ≈ 192 px) + save button (44 px) + padding (~32 px) easily exceeds 332 px. On a 1366-tall device that covers ~24 % of the viewport alone.
  - No other page-level reservation complements this. `.shell-content` only reserves 84 px (for the dock). The page's own `.policyLayout` padding does, but at the 12 rem = 192 px value it's below a fully-loaded panel.
- **Why this is the leading hypothesis:** the report names a "sticky unsaved-changes review bar" — the only sticky-bottom surface on `/management?module=permissions` is `.reviewPanel` (M-05). M-01 is not in this route (no `ManagementStickyActionBar` call). The screenshot region in question is the lower half of the viewport where the panel docks.

### H2 — Layer-stack coordination is by hard-coded `5.1rem` literals, not by token.

- **Selectors:** `.stickyBar` (`management-action-framework.module.css:53-56`) uses `bottom: calc(5.1rem + env(safe-area-inset-bottom))`; `.reviewPanel` (`permissions-panel.module.css:649-650`) uses the *same literal*; `.shell-content` reserves `84px` (≈ 5.25 rem) in `globals.css:361`.
- **Why it matters:** if a future change moves the dock height or safe-area handling, the panel and the bar can desync. The shared "5.1 rem" is brittle.
- **Why it isn't the immediate cause:** at the user's viewport (748×1366, no notched inset reported), the literal evaluates identically for both layers, so they overlap, not collide. H1 is the rendering failure; H2 is the maintainability surface that let H1 happen.

### H3 — `z-index` ordering leaves the page's "saving" state inside a non-modal sticky panel that traps visual attention.

- **Selectors:** `.reviewPanel` is `z-index: 2`; `.policyToolbar` is `z-index: 3`; `.stickyBar` is `z-index: 25`; `.nav-phone` is `z-index: 100`. The review panel sits **below** the top sticky toolbar and **below** the shared bar, so on a 748×1366 device the panel's shadow + button chrome can co-exist with the toolbar, but the user's complaint is the panel is "huge" — H1 explains the size, not the layer.
- **Evidence this is a secondary contributor:** `box-shadow: 0 10px 30px rgb(30 38 42 / 12%)` on `.reviewPanel` and `rgb(255 255 255 / 98%)` background — i.e. the panel is opaque on a tinted surface and reads as a modal-like sheet even though it is `position: sticky` and not `aria-modal="true"`. The lack of `aria-modal` may be the user-trust side of the complaint; not a layout defect.

### H4 — The 12 rem `padding-bottom` on `.policyLayout` under-counts the panel's worst-case height.

- **Selector:** `permissions-panel.module.css:889-894` (`@media (max-width: 799px)`).
- **Evidence:** 12 rem ≈ 192 px. With the panel's stacking of `reviewHeader` (≥32 px) + `<p>` lines (~50 px) + `<p class="reviewNotice">` (~32 px) + `changeSummary` heading + N changes (each ~48-64 px) + save button (44 px) + padding (32 px) = roughly `160 + 56·N px`. At N=4, 384 px; the page reservation is half that.
- **Why it's secondary:** the *real* fix is to cap the panel (H1). The padding is a band-aid that assumed a fixed worst case.

### H5 — The page assumes the global `84px + safe-area` reserve is sufficient for an in-page sticky surface.

- **Selector:** `globals.css:356-362` vs. `permissions-panel.module.css:648-660`.
- **Evidence:** `.shell-content` reserves 84 px for the *floating dock only*. The sticky panel sits *above* the dock (bottom: 5.1 rem) and *inside* the scroller, so it occupies page space; the 84 px reservation does not cover it. Only `.policyLayout` does, at 12 rem.
- **Secondary:** fixing H1 makes the reservation fit. Otherwise, the reservation should grow to `min(viewport, 100%)` of the panel's actual height.

### H6 (LOW) — Scanner `.cameraStop` divergence (`76px` vs `84px`).

- **Selector:** `attendance-panel.module.css:375`.
- **Status:** not the failing surface (permissions is not the scanner). Mentioned because the audit asks for "scanner overlays" in the inventory; the comment in the CSS at lines 281-283 already documents the risk and the F-01 regression test exists in the S3 grand round.

---

## 5. Recommendation — one shared policy + explicit exceptions

### 5.1 One shared policy (the contract)

A "bottom-anchored in-page action surface" used by `ManagementStickyActionBar` (M-01) and `.reviewPanel` (M-05) — and any future in-page sticky — must follow these invariants. Codify as a single utility class in `app/globals.css` and have all callers consume it.

| Invariant | Concrete value / rule |
| --------- | --------------------- |
| Anchor | `position: fixed; left/right: 0.75rem; bottom: calc(5.1rem + env(safe-area-inset-bottom));` (matches M-01's existing math; consumed by both). |
| Layer | `z-index: 25` (current M-01 value). Same tier as the existing shared bar. |
| Document flow | Out of flow (`position: fixed`); page padding must accommodate the worst-case content. |
| **Max height** | `max-height: calc(100dvh - 9rem - env(safe-area-inset-bottom, 0px));` (leaves room for the dock, safe-area, and a small top peek). |
| **Internal scroll** | `overflow-y: auto; overscroll-behavior: contain;` on the *content* child, not the surface. |
| Reserve | Pages hosting the surface must add `padding-bottom` ≥ `max-height` + 0.5 rem (so the user can scroll the last content row above the surface). |
| Sticky content | The change-summary list is the one allowed to grow; it must `max-height: 8rem; overflow-y: auto;` (the existing `.trayItems` precedent in A-02). |
| Primary action | At most one full-width primary button (the `.saveButton`/`.bulkApprove` pattern). Reload/secondary actions stack *above* the primary, not below. |
| Tablet/desktop | `position: static; max-height: none;` from `(min-width: 800px)` (the existing breakpoint in M-01's media query) and `position: sticky; top: 1rem;` from `(min-width: 1024px)` (the existing `.reviewPanel` desktop pattern). |
| A11y | `role="region"` + `aria-label`; `aria-busy="true"` only during save; no `aria-modal` (it is not a modal); the floating dock and the surface must not trap focus. |
| Geometry test | The shared contract must come with a Playwright assertion (see §5.3). |

### 5.2 Explicit exceptions

- **`.nav-phone` (S-01)** — five-slot app shell dock. Stays at `z-index: 100`, `position: fixed`, `bottom: calc(0.625rem + safe-area)`. **Out of scope** for the shared policy: it is the dock, not an in-page action surface.
- **`.nav-desktop` (S-02)** — `position: sticky` side rail at `top: 64px`. Different layer; not bottom-anchored.
- **`.offlineBanner` (S-06)** — `position: fixed; top: max(8px, env(safe-area-inset-top))`. Top-anchored; not in this contract.
- **`.attention-overlay` (S-04), `ManagementFilterSheet` (M-02), `participantConfirm` (P-01), shadcn `Dialog` / `Sheet` (U-01..U-05)** — true modals, `inset: 0` + scrollable inner panel. They live at z-50/110/200 and are not in-page action surfaces. Keep as-is.
- **`.cameraStop` (SC-05)** — `position: absolute` *inside* the dark `.cameraStage`; the 76 px bottom anchor is intentionally 8 px tighter than the global 84 px dock reserve, because the camera stage is the full bleed and the floating dock is the only thing above it. Documented in the CSS comment; do not change.
- **`.navPhone` (PR-02)** in `/prototype` — isolated; not in the live shell. Out of scope.
- **`.policyToolbar` (M-04)** — top-sticky, not bottom. Different layer.

### 5.3 Test gaps to close (concrete, ordered)

1. **Add `phone-748` to `tests/e2e/s4-management-hardening.config.ts` projects** (`viewport: { width: 748, height: 1366 }`). This is the single most useful change: it makes the user's reproduction a permanent regression case.
2. **Add an `assertBottomAnchoredSurface()` helper to `s4-management-hardening.test.ts`** mirroring the existing `assertResponsiveGeometry()` (line 312). It should:
   - Goto `/management?module=permissions`, force one policy toggle to mark the panel dirty, then evaluate the geometry of `.reviewPanel`-equivalent region (or, after the policy lands, the shared utility class).
   - Assert `rect.height ≤ maxHeight` where `maxHeight = window.innerHeight - 9 * 16 - 34` (the 9 rem = 144 px and 34 px safe-area override).
   - Assert the bottom of the surface is `<= window.innerHeight - 84` (clears the dock reserve).
   - Assert `getComputedStyle(surface).overflowY` is `"auto"` on its scroll child.
3. **Assert the page reservation** — verify `getComputedStyle(policyLayout).paddingBottom` is at least `maxHeight + 8` (8 px breathing room).
4. **Assert the dock + surface + scroller hierarchy** — the floating dock, the surface, and the `save` button must all be within the viewport; the save button must be fully visible without scrolling the surface itself.
5. **Add the same assertion to the approval-queue gate** to catch the selection-tray growth on long select-all runs (A-01 currently caps `.trayItems`; the wrapper does not).
6. **Cap the change-summary list explicitly** with a Playwright probe: toggle 6+ capabilities and assert the `changeSummary` ul is internally scrollable (catches a future refactor that drops the cap).
7. **Reuse the helper in `responsive.test.ts`** at the existing widths to guard the global dock and `.shell-content` reservation.
8. **Document the 748×1366 case** in `docs/qa/2026-08-26-s4-hardening-gate.md` H-37 row (320/375/390/414/600/799/800/1024/1440/1920) by extending to 11 widths; or add a follow-up audit when the policy lands.

### 5.4 Implementation order (for the lead, not this report)

1. Land the shared utility class + token in `globals.css` (e.g. `.bottom-action-surface { … }`).
2. Migrate `ManagementStickyActionBar` to it.
3. Migrate `.reviewPanel` to it; raise the per-list cap on `.changeSummary ul`.
4. Raise `.policyLayout` `padding-bottom` to match `maxHeight` (or compute via `100dvh`).
5. Add `phone-748` to the hardening config and the new helper assertion.
6. Re-run the S4 hardening gate; capture a fresh `permissions-dirty-review-748x1366.png` to compare against the user's screenshot.

---

## 6. Provenance

- **Worktree:** `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/s4-management-implementation`
- **Branch / HEAD:** `feat/s4-12-shadcn-migration` / `d97af438` (no commits added; this is a docs-only deliverable).
- **No code, no tests, no package config, no existing audit artifacts modified.**
- **Files referenced but not changed:** see §1 / §2 tables for exact paths and line ranges.
- **Screenshots cited:** user's 748×1366 (external); existing `docs/qa/screenshots/s4-hardening/phone-390/...-permissions-loading.png`, `...-permissions-error.png`, `...-role-permissions-search.png` show the same surface at 390×844 and confirm the layered chrome (toolbar + groups + review panel) is the same composition.
