# 087-01 Management Hub Directory acceptance trace

Authority: issue #310, `docs/specs/087-management-hub-approvals-home-cms.md` (US 1-3, 22), and the canonical management prototype in `design/efcc-management-workspace-prototype.html`.

Run against local `wrangler dev`/local D1 with authenticated E2E fixtures. Assert each step through visible DOM or response state; no fabricated rows.

1. Sign in as an Admin with full scope and open `/management`.
   - Observe h1 管理工作, lead 在你獲授權的範圍內處理會員、課程、聚會及內容工作。, and the three groups in the fixed order: 會員與權限, 事工營運, 內容與系統.
   - 會員與權限 rows: 註冊審批 (核准或拒絕會員申請), 帳戶與權限 (管理員帳戶及角色).
   - 事工營運 rows: 部門設定 (部門開關、管理者及建立課程), 聚會／出席 (出席點名、代簽及修正), 參與者 (搜尋並查看會員資料).
   - 內容與系統 rows: 首頁內容 (版面 A／B 編輯及發佈).
   - 另一個工作入口 card: 前往課程管理 with its description; opens `/programs` in management mode.
2. Sign in as a fixture with a narrow capability subset (e.g. department-scoped manager without home.publish).
   - Observe only the rows/groups the actor is actually authorized for — omitted entirely, never shown disabled. E.g. 首頁內容 absent when home.publish is not granted; 部門設定 present only with department.manage scope.
3. Every visible row renders BOTH its label and its short description text.
4. No Care row renders anywhere in the Hub for any fixture (explicit regression assertion per spec 084).
5. Each row navigates to its canonical Hub URL (defined in the ticket contract): `/management?module=approvals`, `/management?module=permissions`, `/management?module=departments`, `/management?module=attendance`, `/management?module=members`, `/management?module=home-content` (destination screens built by later tickets; the links exist now).

Focused proof: `web/app/management` hub component tests (group order, capability filtering, no-Care regression) + worker tests for the hub projection endpoint; e2e additions in `tests/e2e/programs-d1.test.ts` or a hub e2e; final proof also requires the repository's local verification gate and `git diff --check` before the ticket branch is submitted.