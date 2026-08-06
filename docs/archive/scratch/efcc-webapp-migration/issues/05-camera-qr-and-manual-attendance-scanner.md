# 05 — Event Attendance Camera QR Scanner & Manual Search

**What to build:** Implement event attendance check-in capabilities (`AttendanceScannerView.tsx`) for event leaders and staff (Spec 006), featuring HTML5 camera QR code scanning (`html5-qrcode`) with live HUD viewfinder + fast name/phone manual search, 3-branch UI feedback states (Green success, Amber duplicate, Red not-enrolled with 1-tap quick enroll), writing check-in records to an `Attendance` spreadsheet with `LockService` atomic guards.

**Blocked by:** 04 — Granted User Dynamic Event Creation & Management  
**Status:** ready-for-agent

- [ ] `AttendanceScannerView.tsx` unlocks for `ADMIN`, `STAFF`, and `EVENT_LEADER` roles.
- [ ] HTML5 WebRTC camera stream scans member QR code strings (`User_ID`).
- [ ] Manual search bar allows searching members by name or phone number with a 1-tap "Check In" button.
- [ ] Client invokes `apiService.checkInMember({ eventId, userId, checkInBy, method })`.
- [ ] Server acquires `LockService.getScriptLock()` to prevent race conditions during duplicate checks and row writes.
- [ ] Server validates member existence, active event status, and active program enrollment.
- [ ] UI renders 3 explicit states:
  - 🟢 **Success**: Green banner + success chime + member name.
  - 🟡 **Duplicate**: Amber warning banner (`"⚠️ Already checked in at 15:30:12"`).
  - 🔴 **Not Enrolled**: Red warning banner + 1-tap `"Quick Enroll & Check In"` button.
- [ ] `Attendance` sheet appends row: `Attendance_ID`, `Event_ID`, `User_ID`, `CheckIn_Time`, `CheckIn_Method`, `CheckIn_By`, `Status`.
