# 084-04 System Settings Hub acceptance trace

Authority: issue #311, `docs/specs/084-shell-auth-account-settings.md`, and the canonical management prototype (`design/efcc-management-workspace-prototype.html` onSettings/onCheckinSettings/onTimezoneSettings screens).

Run against local `wrangler dev`/local D1 with an authenticated fixture. Assert each step through visible DOM or response state; both informational screens are pure read-only displays — no editable form fields anywhere.

1. Open `/management?module=settings` (reached via the 設定 entry from the Account surface).
   - Observe h1 設定 and exactly three rows in order: 帳戶與權限 (管理帳戶及授權), 簽到設定 (簽到時段及方式), 時區 (香港時間（GMT+8）).
   - Back action returns to `/management`.
2. Select 簽到設定.
   - Observe h1 簽到設定 with a back action to the settings hub.
   - 簽到方式: three status rows — 會員二維碼 (掃描會員帳戶頁面的二維碼) 已啟用, 聚會代碼 (輸入場地顯示的六位數代碼) 已啟用, 代為簽到 (同工於出席名單代簽) 已啟用.
   - 開放時段: two rows — 聚會開始前 (開放簽到的提前時數) 30 分鐘, 聚會結束後 (結束後仍可簽到多久) 15 分鐘.
   - No input/select/textarea/form elements exist on the screen.
3. Select 時區.
   - Observe h1 時區, lead 聚會、報名及發佈時間均以香港時間顯示。, and a read-only 香港時間（GMT+8） row.
   - No editable fields exist.
4. 帳戶與權限 row: present in the hub but its destination screen is wired by 087-03 (this ticket never renders a placeholder page for it).
5. From the Account (profile) surface, the 設定 entry reaches the settings hub.

Focused proof: component tests for the hub shell + both informational screens (no-form regression asserted per screen) + e2e trace; final proof also requires the repository's local verification gate and `git diff --check` before the ticket branch is submitted.