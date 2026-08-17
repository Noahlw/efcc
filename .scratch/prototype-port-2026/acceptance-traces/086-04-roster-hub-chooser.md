# 086-04 Attendance Roster + Hub Attendance Chooser acceptance trace

Authority: issue #316, `docs/specs/086-course-cockpit-and-operations.md` (US 16-21), and the canonical management prototype (`design/efcc-management-workspace-prototype.html` roster + attendance chooser screens).

Run against local `wrangler dev`/local D1 with authenticated management-capable fixtures. Assert each step through visible DOM or response state; no fabricated data.

1. Open a meeting's Roster (via the Cockpit 前往管理名單 or the Hub chooser).
   - Observe the roster header: meeting status badge, title, and live check-in counts (已簽到 x/y).
2. Void an active attendance record.
   - Observe the required-reason flow (作廢簽到 → 作廢原因); confirming voids the record — it is preserved (still listed) but excluded from the check-in count.
3. Correct a guest attendance record's name/phone.
   - Observe the required-reason flow (修正訪客資料 → 姓名或電話); old and new values are preserved in an audit trail.
4. Print/export the check-in sheet.
   - Observe member phone numbers masked (e.g. 9123****) — no full phone number on the printable sheet.
5. Open the Management Hub 聚會／出席 row (`/management?module=attendance`).
   - Observe a real list of every currently-open-for-check-in meeting across the actor's authorized scope — NOT a raw event-ID input.
6. With zero currently-open meetings.
   - Observe an honest empty state on the chooser.
7. Select a row from the chooser.
   - Observe navigation into that exact meeting's Roster.

Focused proof: roster/chooser component tests + worker tests for any new guest-correction/void contract + e2e; final proof also requires the repository's local verification gate and `git diff --check` before the ticket branch is submitted.