# Issue #67 — Headless Browser Acceptance Plan

**Target:** Fresh versioned `/exec` deployment after push
**Spec:** `docs/specs/009-phone-first-shell-navigation.md` + issue #67 AC
**Date:** 2026-07-29
**Branch:** `feat/issue-67-role-navigation`

## Role matrix

| Role | Username | PIN | Sections expected (phone order) |
|------|----------|-----|----------------------------------|
| MEMBER | (member user) | (their PIN) | 個人, 課程, 聚會 |
| STAFF/ADMIN | (staff user) | (their PIN) | 個人, 課程, 掃描, 聚會, 更多(關懷, 權限管理) |

## Phone viewport trace (375×812)

### 1. Cold start → Login visible, no navigation
- Open `/exec` at 375×812.
- **Assert:** `data-app-state` = `SIGNED_OUT`.
- **Assert:** Login form visible with 使用者名稱 + PIN 碼 + 登入 button.
- **Assert:** Phone bottom nav is hidden (`[hidden]` present).
- **Assert:** Desktop side rail is hidden (`[hidden]` present).

### 2. Login as MEMBER → Profile, phone nav with 3 items
- Fill credentials, click 登入.
- **Assert:** `data-app-state` transitions through LOADING_SECTION → READY.
- **Assert:** Phone nav visible with exactly 3 nav items: 個人, 課程, 聚會.
- **Assert:** No 掃描, 關懷, 權限管理 in phone nav.
- **Assert:** 個人 is active (`aria-current="page"` + `.nav-item-active`).
- **Assert:** Content shows Profile with username and QR code.

### 3. MEMBER navigates to Programs → active state updates
- Click 課程.
- **Assert:** 課程 is active, 個人 is not.
- **Assert:** Content shows "課程" heading (placeholder).

### 4. MEMBER navigates to Events → active state updates
- Click 聚會.
- **Assert:** 聚會 is active.
- **Assert:** Content shows "聚會" heading.

### 5. Logout → nav hidden, Login visible
- Click 登出.
- **Assert:** `data-app-state` = `SIGNED_OUT`.
- **Assert:** Phone nav hidden, Login form visible.

### 6. Login as STAFF/ADMIN → 4 visible nav + 更多
- Fill STAFF credentials, click 登入.
- **Assert:** Phone nav visible with items: 個人, 課程, 掃描, 聚會, 更多.
- **Assert:** Exactly 5 buttons in phone nav.
- **Assert:** 個人 is active.

### 7. STAFF 更多 menu opens → Care + Permissions
- Click 更多.
- **Assert:** `.more-menu` is visible (not `.hidden`).
- **Assert:** Menu contains 關懷 and 權限管理 items.

### 8. STAFF navigates to Care via 更多
- Click 關懷 in the 更多 menu.
- **Assert:** 更多 menu closes (`.hidden`).
- **Assert:** Content shows "關懷" heading.
- **Assert:** 更多 button is NOT active (only specific sections get active state).

### 9. STAFF navigates to Scanner
- Click 掃描.
- **Assert:** 掃描 is active.
- **Assert:** Content shows "掃描" heading.

## Desktop viewport trace (1280×800)

### 10. Desktop: side rail with all sections
- Open `/exec` at 1280×800 (or resize).
- Login as STAFF/ADMIN.
- **Assert:** Desktop nav visible, phone nav hidden.
- **Assert:** Desktop nav has 6 items: 個人資料, 課程, 掃描, 聚會, 關懷, 權限管理.
- **Assert:** No 更多 button in desktop nav.
- **Assert:** 個人資料 is active.

### 11. Desktop: click Programs → active updates
- Click 課程.
- **Assert:** 課程 is active in desktop nav.
- **Assert:** Content shows "課程" heading.

## Forbidden trace

### 12. Direct unauthorized section via navigateTo_
- After MEMBER login, evaluate in browser console:
  `navigateTo_("scanner")` (accessing the internal function).
- **Assert:** Content shows "無法存取" heading.
- **Assert:** "返回" button is visible.

### 13. Return from forbidden to nearest permitted
- Click 返回.
- **Assert:** Navigates to 個人 (Profile) — the first permitted section.
- **Assert:** 個人 is active.

## Recovery trace

### 14. Logout → Login → navigation persists correctly
- Logout, then re-login as MEMBER.
- **Assert:** Phone nav shows 3 items (個人, 課程, 聚會) — not STAFF nav.
- **Assert:** Content shows Profile.

## Non-goals for this run

- Program Leader role testing (requires Program_Leaders sheet data we don't control in the headless run).
- Direct RPC forbidden testing (requires server-side RPC calls to protected endpoints not yet exposed).
- Session expiry testing (requires waiting for or forcing session expiry).
- Refresh-after-role-change (requires modifying sheet data mid-test).
