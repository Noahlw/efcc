# 086-02 Course Facts + Edit acceptance trace

Authority: issue #314, `docs/specs/086-course-cockpit-and-operations.md` (US 8-9), and the canonical management prototype (`design/efcc-management-workspace-prototype.html` onCourseFacts + course edit).

Run against local `wrangler dev`/local D1 with an authenticated management-capable fixture. Assert each step through visible DOM or response state; no fabricated data.

1. Open a program's Cockpit; select the 課程資料 quiet row.
   - Observe the read-only Course Facts screen rendering all six fields from real data: name, department, purpose, lifecycle, discoverability, enrollment mode. No editable controls on the facts screen.
2. Select 編輯課程.
   - Observe the Course Edit form with name + purpose fields, both pre-filled with the current values; both required.
3. Clear either field and attempt to save.
   - Observe inline validation blocking the save (both fields non-empty required); nothing is submitted.
4. Edit the name (and/or purpose) and save.
   - Observe a success toast and return to Course Facts with the updated values visible; the change persists server-side (reload reflects it).
5. Back navigation from Facts returns to the Cockpit.

Focused proof: component tests for the Facts/Edit screens (validation, save success + return, persistence) + worker/API coverage of the minimal name+purpose update; final proof also requires the repository's local verification gate and `git diff --check` before the ticket branch is submitted.