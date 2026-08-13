# Acceptance trace — Wave-1 Full E2E Coverage (#250, #251, #254, #255)

**Status: Trace-first specification. Written BEFORE implementing tests.**

This acceptance trace specifies the complete browser E2E test scenarios to be added to `tests/e2e/programs-d1.test.ts`, covering the remaining UI interaction boundaries across Wave-1 tickets.

Target branch: `test/e2e-wave1-full-coverage` in worktree `/Users/noah.wong/orca/workspaces/EFCC-dev/e2e-wave1-full-coverage` (rooted at `origin/main` `@` `06a3a3ce`).

---

## 1. AUTH-01: Program Leader & Department Manager Administration

### 1.1 Program Leader Grant, Self-Assignment Denial, and Revocation
- **GIVEN** an authorized Staff or Admin user (`E2E_admin` / `E2E_staff`),
  **WHEN** navigating to Program Settings (`/programs?mode=management&program=<id>&task=settings`) for an owned program (`E2E_DEMO_成人查經`),
  **THEN** the `事工負責人` panel displays the current leader list (`E2E Member`), member picker combobox (`選擇會友`), and `新增負責人` button.
- **WHEN** selecting an active member (`E2E_member`) and clicking `新增負責人`,
  **THEN** the server returns 200/201, `已新增事工負責人。` notice is announced, and the member appears in the leaders list with a grant timestamp.
- **WHEN** selecting self (`E2E_staff`) in the member picker and clicking `新增負責人`,
  **THEN** the request fails server-side with 403 `FORBIDDEN`, surfacing `您沒有權限執行此操作。` alert.
- **WHEN** clicking `移除負責人` on a listed leader,
  **THEN** an inline confirmation appears (`確定要移除此事工負責人嗎？`).
- **WHEN** clicking `確定移除`,
  **THEN** `已移除事工負責人。` notice appears and the leader is removed from the list.
- **TEARDOWN**: Re-grant `E2E_member` to preserve clean demo fixture state.

### 1.2 Department Manager Grant, Scope Inheritance, and Revocation
- **GIVEN** an Admin user (`E2E_admin`),
  **WHEN** opening the Management Directory (`/programs?mode=management`) and expanding the department settings card (`部門設定: E2E_DEMO_示範事工`),
  **THEN** the `部門管理者` region renders with combobox `選擇部門管理者` and `新增部門管理者` button.
- **WHEN** selecting `E2E_member` and clicking `新增部門管理者`,
  **THEN** `已新增部門管理者。` status notice appears, and `E2E Member (E2E_member)` is listed with `移除部門管理者` button.
- **WHEN** logging out and logging in as `E2E_member`,
  **WHEN** opening Management Directory (`/programs?mode=management`),
  **THEN** `E2E_member` sees ALL 4 department programs (`E2E_DEMO_成人查經`, `E2E_DEMO_青年團契`, `E2E_DEMO_社區關懷`, `E2E_DEMO_管理安排`) PLUS the `部門設定` department card (inherited scope).
- **TEARDOWN**: Log in as `E2E_admin`, click `移除部門管理者` for `E2E_member`, and confirm clean list state (`目前沒有部門管理者。`).

---

## 2. CFG-01: Scope-Owned Program Settings (Module-Gated & Consequential)

### 2.1 Module-Disabled Settings Display
- **GIVEN** an Admin user (`E2E_admin`),
  **WHEN** navigating to Program Settings for a program in a department where the `events` module is disabled (e.g. `青區`),
  **THEN** the `時間表` section renders `COPY.programs.settingsScheduleUnavailable` ("所屬部門目前未啟用聚會模組；不能在這裡編輯時間表規則。") instead of editable schedule rule forms.

### 2.2 Consequential Enrollment Settings Confirmation
- **GIVEN** an Admin user (`E2E_admin`),
  **WHEN** opening Program Settings for `E2E_DEMO_成人查經` and changing `discoverability` to `Unlisted` (`不公開`),
  **THEN** an inline confirmation warning (`settingsConfirmEnrollment`) appears with `確定變更` button.
- **WHEN** clicking `確定變更`,
  **THEN** `課程設定已儲存。` notice appears and the setting persists.
- **TEARDOWN**: Revert discoverability to `Listed` (`公開`) and confirm.

---

## 3. EVT-01: Consequential Event Deactivation Confirmation UI

### 3.1 Consequential Deactivation Confirmation Modal & Toggle
- **GIVEN** an Admin user (`E2E_admin`),
  **WHEN** navigating to an event detail page where `check_in_window_opens_at` is set to an open window (or an event with active check-ins),
  **WHEN** clicking `暫停聚會`,
  **THEN** an inline confirmation dialog (`eventAvailabilityConfirmTitle`) appears naming affected open operations (`eventAvailabilityConfirmBody`).
- **WHEN** clicking `確定暫停`,
  **THEN** status notice `聚會已暫停開放。` appears, availability badge updates to `暫停`, and `恢復開放` button is displayed.
- **WHEN** clicking `恢復開放`,
  **THEN** status notice `聚會已恢復開放。` appears and availability badge returns to `開放`.

---

## 4. Verification Protocol

1. `pnpm dev:local`, `pnpm db:seed:local`, `pnpm db:seed:demo`
2. `npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p tests/e2e/tsconfig.json`
3. `npx vitest run --config vitest.components.config.ts` (302/302)
4. `npx vitest run --config vitest.config.ts` (332/332)
5. `npx playwright test -c tests/e2e/programs-d1.config.ts` (100% pass across all projects)
