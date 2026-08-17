# 086-06 Departments Directory + Detail + Create Program acceptance trace

Authority: issue #318, `docs/specs/086-course-cockpit-and-operations.md` (department admin section), and the canonical management prototype.

Run against local `wrangler dev`/local D1 with an authenticated management-capable fixture. Assert each step through visible DOM or response state; no fabricated data.

1. Departments directory scoped to the actor's real authorization.
   - Observe only departments the actor can manage.
2. Department Detail renders exactly 5 independently-toggleable modules — Program Catalog / Enrollment / Events / Attendance / Custom Forms — matching the verified prototype field set.
3. Assigning or revoking a Department Manager via the member picker.
   - Observe an inline success notice and stay on the same screen (no forced navigation away).
4. Create Program reached from within a specific Department's detail.
   - Validate name + purpose non-empty; on success land on the new program's Cockpit with a 課程已建立（草稿狀態） confirmation.
5. Offline department save.
   - Inline error and zero local state change.

Focused proof: component tests (directory scoping, 5 toggles, manager picker inline-notice-no-navigate, create program with confirmation, offline) + worker coverage + e2e; final proof also requires the repository's local verification gate and `git diff --check` before the ticket branch is submitted.