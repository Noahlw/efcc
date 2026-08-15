# 03 — feat(cockpit): Status-First Course Cockpit & Operational Attendance Roster

**What to build:** The per-program management command center (`ProgramWorkspace` / Course Cockpit) delivering status-first operational orientation and attendance roster operations.

1. **Course Cockpit Layout:**
   - **`下一聚會` Card (Recurring Programs only):** Displays next active gathering date/time, schedule source tag (`自動排程` vs `手動新增`), live arrival progress (`已簽到 x/y`), and a full-width `前往管理名單` CTA deep-linking to the active attendance roster. Cleanly omitted when all events are completed or for single-event OneOff programs.
   - **`營運` (2-Up Operational Tiles):** `聚會` card (shows upcoming event count) and `參與者` card (shows active count + `待審批報名 ×N` amber badge).
   - **`其他` (Quiet Rows):** `課程資料` (M-03 read-only facts), `編輯課程` (M-04 name/purpose form), `聚會時間表` / `課程設定` (M-14), and `課程消息` (M-15).
2. **Attendance Roster & Door Check-In:**
   - Live roster displaying checked-in, not-yet, and total enrolled members.
   - Assisted check-in (`代為簽到`) via personal member QR scan or name/phone search, with enrollment precondition enforcement (displays explicit popup error if not enrolled).
   - Attendance void requiring a mandatory reason note, recording an audit row.
   - Guest attendance contact correction (in-place update of name/phone with `GUEST_ATTENDANCE_CORRECTED` audit event).
3. **Printable Check-in Sheet (M-22):**
   - Clean printable stylesheet rendering Program QR, Event Manual Code, gathering details, and attendee rows with masked phone numbers (`9123****`).
4. **Event Cancellation Guardrail:**
   - Server strictly blocks event cancellation if any active attendance records exist until all rows are first voided with reasons.

**Blocked by:** 02 — feat(attention): Universal Attention Center & Editorial Subscriptions (GitHub #293)

**Status:** ready-for-agent

- [ ] Course Cockpit renders status-first hierarchy with next meeting progress for recurring programs.
- [ ] Next meeting card is omitted when all events are completed or for single-event OneOff programs.
- [ ] 2-up operational cards display live counts and pending badges.
- [ ] Live Attendance Roster supports assisted check-in with enrollment precondition checks (shows error popup if not enrolled).
- [ ] Attendance void requires reason text and logs an immutable audit event.
- [ ] Guest contact correction updates name/phone in-place and writes an audit event.
- [ ] Printable check-in sheet renders with masked phone numbers (`9123****`).
- [ ] Event cancellation is rejected (422) if active attendance exists.
- [ ] Component and E2E tests verify Cockpit navigation, assisted check-in, void reasons, and print sheet formatting.
