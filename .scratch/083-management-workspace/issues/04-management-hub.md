# 04 — feat(hub): Management Hub, Department Settings & Registration Approvals

**What to build:** The grouped Management Hub directory (`ManagementHub`) providing high-level operational modules, department administration, registration approvals, and capability-scoped member search.

1. **Management Hub Directory (`M-16`):** Grouped into `會員與權限`, `事工營運`, and `內容與系統`. Rows and groups are server-filtered; unauthorized groups are omitted without shifting sequence.
2. **Department Settings & Module Toggles (`M-17` to `M-19`):**
   - View and toggle 5 product modules (`program_catalog`, `enrollment`, `events`, `attendance`, `custom_forms`).
   - Assign / revoke Department Managers via active member search picker.
   - `建立課程` form lives exclusively inside Department Detail (`M-05`), capturing Name, Purpose, and Behavior Type (`Recurring` vs `OneOff`).
   - Department Archival Guardrail: strictly blocked if any child Program is in `Draft` or `Active` status.
3. **Registration Approvals Queue (`M-24`, `M-25`):**
   - Pending registration application queue with details view.
   - `核准` creates an `Active` account with the canonical default `Member` role.
   - `拒絕` requires a rejection explanation note.
4. **Member Directory (`M-27`):**
   - Search input over Name, Username, Phone with capability scoping: Admin/Staff search church-wide; Department Managers search only members in their assigned department's programs.
5. **Account Permissions (`M-26`):**
   - Read-only projection of `role_capabilities` and active admin accounts in this pass.

**Blocked by:** 03 — feat(cockpit): Status-First Course Cockpit & Operational Attendance Roster (GitHub #294)

**Status:** ready-for-agent

- [ ] Management Hub renders domain groups (`會員與權限`, `事工營運`, `內容與系統`) with server-filtered module access.
- [ ] Department settings allows toggling 5 modules and assigning/revoking Department Managers.
- [ ] `建立課程` creates initial Draft+Unlisted program under the owning department.
- [ ] Department archival is rejected (422) if child active/draft programs exist.
- [ ] Registration approval atomically creates an Active Member account; rejection logs reason.
- [ ] Member Directory search is capability-scoped (Admin=all, DM=department only).
- [ ] Account Permissions renders read-only role capability overview.
- [ ] Integration and E2E tests verify department module toggling, DM scoping, and approval flows.
