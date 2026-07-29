# Issue #67 — Headless Browser Acceptance Plan

**Target:** Fresh versioned `/exec` deployment after push
**Spec:** `docs/specs/009-phone-first-shell-navigation.md` + issue #67 AC
**Date:** 2026-07-29
**Branch:** `feat/issue-67-role-navigation`


>**Status: PARTIALLY EXECUTED (2026-07-29)** — Cold-start (AC #1) executed against @29 via headless browser and **PASSED** (8/8 assertions: SIGNED_OUT state, hidden nav, login form). Note: the trace ran before the mobile sidebar + viewport scroll fixes landed; the current deployment is @33 which additionally includes those fixes (verified independently at 375/1280 widths, see code-review handoff for evidence). All other ACs require test users in the dev Google Sheet (per AGENTS.md no-mutate rule, user must add them manually) or server-side RPC enforcement that does not exist yet.
>
>**Deferred to follow-up tickets:**
>- **AC #9 (protected RPC returns forbidden)** — deferred. The 5 section RPCs (`api_getPrograms`, `api_getEvents`, `api_getScannerEvents`, `api_getCareData`, `api_getPermissionsData`) do not exist in `Code.gs`; `renderSection_` currently shows static placeholder text. Requires a separate ticket for the section content work.
>- **AC #12 (full /exec matrix run)** — partial. Cold-start + login UI verified against @32. Full role-matrix trace blocked on dev sheet test users (see "User-supplied prerequisites" below).
>
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

## User-supplied prerequisites (manual dev-sheet edits)

Per AGENTS.md "no automatic sheet mutation" rule, the following rows must be
added to the **Users** tab of the dev Google Sheet by the user before
the full role-matrix trace (steps 2-14) can run:

| User_ID | Username | Name | PIN_Code | System_Role | Status | QR_Code_String |
|---------|----------|------|----------|-------------|--------|----------------|
| U-TEST-M | alice | Alice | 1234 | Member | Active | QR-alice |
| U-TEST-S | bob | Bob | 5678 | STAFF | Active | QR-bob |
| U-TEST-A | noah | Noah | 6883 | ADMIN | Active | QR-noah |

(Use these exact PINs in the headless trace.)

For Program Leader trace (AC #3 client-side), also add a **Program_Leaders** tab if not present, with header row `Assignment_ID | Program_ID | User_ID | Assigned_By | Assigned_Date | Status` and one Active row referencing U-TEST-M to make alice a Program Leader.

When complete, confirm by running the headless trace and the agent will
update this doc with executed results.
