# 086-03 Program Events (manual-primary, cancel guard) acceptance trace

Authority: issue #315, `docs/specs/086-course-cockpit-and-operations.md` (US 10-15), and the canonical management prototype (`design/efcc-management-workspace-prototype.html` program events screens).

Run against local `wrangler dev`/local D1 with an authenticated management-capable fixture. Assert each step through visible DOM or response state; no fabricated data.

1. Open a program's 聚會 (events) task.
   - Observe the Meetings list scoped to the program; each row shows name/date/time/type and an explicit 重複：<tag> label; copy or a visible note makes clear the tag never auto-generates other meetings.
   - The rule-based recurring-schedule generator (preview/generate) remains reachable as a clearly-labeled secondary action.
2. Select 建立聚會 (primary action).
   - Observe the manual creation form (date, time, name, type, recurrence-tag-as-informational); submit with any of date/time/name missing → inline error 請輸入日期、時間及聚會名稱。, nothing submitted; valid submit creates the meeting via the real createEvent contract.
3. Edit an existing meeting that already has attendance records.
   - Observe the edit succeeds and is recorded with the explicit acknowledgement (已有出席記錄，變更已記錄原因與時間) — never silently blocked.
4. Attempt to cancel a meeting that already has attendance.
   - Observe the explicit refusal 此聚會已有出席記錄，不能取消；如需更正請使用出席名單的作廢功能。 — no cancellation occurs.
5. Cancel a meeting with no attendance yet.
   - Observe an explicit confirm dialog (取消此聚會？取消後此聚會不再開放簽到，記錄會保留為「已取消」。); confirming commits the cancellation, canceling the dialog keeps the meeting active.

Focused proof: component tests for the events panel (create validation, cancel guard/confirm paths, edit-with-history acknowledgement, recurrence tag informational) + worker/API coverage of the guard; final proof also requires the repository's local verification gate and `git diff --check` before the ticket branch is submitted.