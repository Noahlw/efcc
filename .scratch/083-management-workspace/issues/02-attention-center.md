# 02 — feat(attention): Universal Attention Center & Editorial Subscriptions

**What to build:** The unified topbar Attention Center overlay providing centralized access to operational tasks (`待處理`) and informational announcements (`通知`), backed by D1 account subscription persistence.

1. **Universal Topbar Bell:** Single bell icon present across all authenticated screens.
2. **Dynamic Badge Semantics:** Solid cinnabar red numeric badge when actionable tasks exist (count > 0); compact unread dot when actionable count is 0 but unread informational announcements exist.
3. **`待處理` (Actionable Work) Tab:** Grouped by owning module (`會員與權限` → `課程` → `聚會/出席` → `首頁內容`). Displays task name, submission time, warning state, and manual priority chip (`高` / `一般` / `低`). Only `Admin` role can mutate task priority, writing to `task_priorities` with an audit event.
4. **`通知` (Informational Messages) Tab:** Chronological list of operational notices with `全部標示已讀` batch action and 90-day retention.
5. **Editorial Subscriptions Schema:** D1 migration `0011_account_subscriptions.sql` storing per-account opt-in preferences for church announcement topics, with `GET/PUT /api/v1/subscriptions` endpoints.
6. **Task Deep Links:** Tapping any task re-validates current authority and deep-links directly into the owning workflow.

**Blocked by:** 01 — feat(shell): 5-Slot Phone-First Shell & Neutral Skeleton Hydration (GitHub #292)

**Status:** ready-for-agent

- [ ] Universal bell is rendered on topbar and opens the full-screen (phone) or dialog (desktop) Attention Center.
- [ ] Number badge accurately reflects server-projected actionable count; unread dot appears when actionable count is zero.
- [ ] `待處理` tasks are grouped by owning module in fixed sequence and cannot be dismissed without resolving the source workflow.
- [ ] Admin can update task priority (`高/一般/低`); changes persist and record an audit event.
- [ ] `通知` tab supports `全部標示已讀` without affecting `待處理` items.
- [ ] D1 migration `0011_account_subscriptions.sql` creates `account_subscriptions` table with strict constraints.
- [ ] `GET/PUT /api/v1/subscriptions` allows members to manage topic subscription preferences.
- [ ] Unit and integration tests verify read-state batch updates, priority mutation authorization, and deep-link generation.
