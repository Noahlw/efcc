# 06 — Attendance scanner & check-in
**What to build:** `attendance.gs` with check-in RPCs, `scanner.html` with QR camera + manual search.
**Blocked by:** 05 (needs `api_getGrantedUserEvents` to list scannable events)
**Status:** ready-for-agent

## Data shapes (from reference)
- `api_checkInMember({ staffId, sessionToken, eventId, userId, method })` → complex response:
  - Success: `{ data: { checkInTime, memberName }, success: true }`
  - Already checked in: `{ data: { checkInTime, memberName }, duplicate: true, message: "X is already checked in", success: false }`
  - Not enrolled: `{ data: { memberId, memberName }, notEnrolled: true, message: "X is not enrolled in this program", success: false }`
  - Member not found: `{ message: "Member not found", success: false }`
  - Role gate: `{ message: "Permission denied. Only granted users can check in members", success: false }`
- `api_getEventAttendance(eventId, viewerId, sessionToken)` → `{ data: [{ attendanceId, eventId, userId, userName, checkInTime, checkInMethod, checkInBy }], success }`
- `api_searchMembers(query, grantedUserId, sessionToken)` → `{ data: [{ name, phone, userId }], success }` — max 10 active MEMBERs

## Change
1. `src/gas/attendance.gs` — port verbatim: `api_checkInMember`, `api_getEventAttendance`
2. `src/gas/scanner.html`:
   - Load `html5-qrcode` from CDN: `<script src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"></script>`
   - **Role gate**: `!isGrantedUser()` → "Access denied"
   - **Event selector**: `<select>` dropdown populated from `api_getGrantedUserEvents`. Default: first active event. Changing refreshes attendance list.
   - **QR scanner panel**:
     - Camera starts when page loads (first available camera). Viewfinder in a `<div id="reader">`.
     - On scan: decode QR text → `api_checkInMember({ staffId, sessionToken, eventId, userId: scannedText, method: "QR" })`
     - **Success** (success:true): green flash overlay + member name + check-in time + play audio chime (`<audio>` element with a short success tone). Auto-dismiss after 3s. (Per spec 006 §3.1 + issue #8 comment 1.)
     - **Duplicate** (duplicate:true): amber flash overlay + "Already checked in at XX:XX". Auto-dismiss.
     - **Not enrolled** (notEnrolled:true): red flash + "Not enrolled in this program." + "Quick Enroll" button that calls `api_staffEnrollMember(memberId, programId)`, then on success → auto-retry `api_checkInMember`. (Per spec 006 §3.1: "1-tap quick enroll" from issue #8 comment 3.)
     - Camera error: show message "Camera unavailable — use manual search below"
   - **Manual search panel** (toggle between scanner/search):
     - Input field: type name or phone → search on each keystroke (instant, no debounce) → `api_searchMembers(query, userId, token)` (Per issue #8 comment 1: "Instant Typeahead Search")
     - Results list: per member row → name, phone, "Check In" button
     - Click "Check In" → `api_checkInMember({ ..., method: "Manual" })` → show result (same 3-branch: green/amber/red)
   - **Attendance list** (below scanner):
     - Table: Name | Check-in Time | Method. Fetched from `api_getEventAttendance` on event change.
     - Auto-refresh after successful check-in
   - Back link: `?page=profile`

## Acceptance
- [ ] STAFF sees event dropdown + camera viewfinder
- [ ] MEMBER sees "Access denied"
- [ ] Scanning valid QR → green confirmation with member name + time
- [ ] Scanning same QR twice → yellow "Already checked in at XX:XX"
- [ ] Manual search: typing name shows results, clicking "Check In" completes it
- [ ] "Not enrolled" response shows red error message
- [ ] Attendance table shows all check-ins with correct times and method
- [ ] Camera error → manual search still works as fallback
- [ ] Scanning valid QR plays audio chime + shows green confirmation overlay
- [ ] "Not enrolled" response shows "Quick Enroll" button that successfully enrolls + check-ins
- [ ] Manual search responds instantly on each keystroke (no debounce delay)
