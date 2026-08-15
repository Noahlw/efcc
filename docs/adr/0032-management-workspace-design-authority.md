# Management Workspace Design Authority: Full Prototype Adoption & 5-Slot Shell

**Status:** accepted

The `design_handoff_efcc_redesign` prototypes and the `Web-Prototype/phone-first-ux-redesign-plan.md` planning specification (consolidating 55 logical screens across Auth, Participant, and Management workspaces) are the authoritative design source of truth for the EFCC webapp redesign.

### Key Decisions

1. **5-Slot Bottom Navigation Shell:** The app adopts the prototype's 5-slot phone dock:
   - **Participant Dock:** `首頁` · `課程` · `〔掃描〕` (central raised dock) · `通知` · `帳戶`
   - **Management-Role Dock:** `首頁` · `課程` · `〔掃描〕` (central raised dock) · `管理` · `帳戶`
   - Desktop viewports (≥920px) adapt the same 5 destinations into a sticky side rail.
2. **Two-Layer Management Entry:**
   - **Program Level:** Inside the `課程` tab, management-capable accounts have a persistent `參與者 ｜ 管理` mode switch. Switching to `管理` with an active program context opens its **Course Cockpit** (`ProgramWorkspace`).
   - **Hub Level:** The `管理` dock slot opens the **Management Directory** (`ManagementHub`), grouping capabilities into 會員與權限, 事工營運, and 內容與系統.
3. **Universal Attention Center:** Replaced separate popovers with the unified topbar Bell opening the two-tab **Attention Center** (`待處理` with actionable count badge + `通知` with unread dot).
4. **Course Cockpit Structure:** The per-program cockpit leads with the status-first **下一聚會** card (showing live `已簽到 x/y` progress and direct roster link for recurring programs), 2-up operational cards (`聚會` and `參與者` with pending-count badges), followed by low-frequency facts, settings, and notifications.
5. **Backend Implementation for Prototype Surfaces:**
   - **Home Content CMS:** Full D1 persistence supporting Template A (featured event with automatic next-eligible fallback) and Template B (church announcement with title, summary, sanitized rich body, CTA, and external validated HTTPS editorial image URL), draft/preview/publish, immediate vs. scheduled HK-time publishing (evaluated via a 5-minute Cloudflare cron trigger `*/5 * * * *`), optimistic-concurrency revision checking, and audit history. `Admin` publishes by policy; `Staff` requires a dedicated capability grant.
   - **Account Permissions & Member Directory:** Read-only projection of real `role_capabilities` and admin accounts in pass one. Member Directory search is capability-scoped: Admin and Staff search all Active accounts church-wide; Department Managers see members enrolled in programs under their assigned departments.
   - **Editorial Subscriptions:** Per-account topic subscription preferences are persisted in a dedicated D1 `account_subscriptions` table.
   - **Department & Program Management:** 5 module toggles (`program_catalog`, `enrollment`, `events`, `attendance`, `custom_forms`), Department Manager assignment via member picker, program creation originating inside Department Detail, and atomic enrollment decisions.

### Consequences

Existing partial components (`ProgramsAttention`, `ProgramsNotifications`, legacy 6-section nav) are upgraded and consolidated into the prototype's unified 5-slot shell and attention center. Design token definitions in `web/app/globals.css` are extended with `--pending: #8a5b16`, `--pending-surface: #f3eee8`, and `--pending-border: #c1ad95`.
