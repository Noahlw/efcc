# 087-03 Account Permissions Real Matrix acceptance trace

Authority: issue #320, `docs/specs/087-management-hub-approvals-home-cms.md` (US 9-12), and the canonical management prototype (onAccountPermissions).

Run against local `wrangler dev`/local D1 with authenticated fixtures. Assert each step through visible DOM or response state; no fabricated data.

1. Admin/Staff account opens `/management?module=permissions`.
   - Observe a real table of every admin-capable account (Admin / Staff-with-DM-grant / Staff) with name, role, and department context — NOT just the actor's own projection.
2. Fixed role-definition section.
   - Observe exactly three roles — 管理員 (全部範圍), 部門管理者 (所屬部門課程、聚會及出席), 同工 (部門範圍內協助工作) — each with its scope description and an assignment-state indicator (已設/可指派).
3. Department-Manager-only fixture calls the new endpoint directly.
   - Observe a server-side 403/FORBIDDEN — explicit test, not just client-side hiding.
4. Explanatory copy.
   - Observe 管理員帳戶可指派角色及部門授權。角色變更會即時反映；部門管理者不能自行授予管理者權限。
5. Settings hub 帳戶與權限 row (from 084-04).
   - Observe it now navigates to this real permissions screen.

Focused proof: worker tests for the new endpoint (Admin/Staff projection, DM 403, elevated-role set + department context) + component tests for the matrix/role-definition rendering + e2e; final proof also requires the repository's local verification gate and `git diff --check` before the ticket branch is submitted.