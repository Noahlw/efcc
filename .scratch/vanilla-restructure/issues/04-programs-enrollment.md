# 04 — Program catalog & enrollment
**What to build:** `programs.gs` with catalog/enrollment RPCs, `programs.html` two-tab page.
**Blocked by:** 02 (needs `auth.gs` for session verification; parallel-safe with 03, 07)
**Status:** ready-for-agent

## Data shapes (from reference)
- `api_getProgramsCatalog(userId, sessionToken)` → `{ data: Program[], success }` where Program = `{ programId, title, type, description, dayOfWeek, startTime, endTime }`
- `api_getAvailablePrograms(userId, sessionToken)` → `{ data: ProgramWithEnrollment[], success }` — wraps programs with `isEnrolled: boolean`
- `api_enrollUser(userId, programId, sessionToken)` → `{ success, message }`
- `api_cancelEnrollment(userId, programId, sessionToken)` → `{ success, message }`
- `api_staffEnrollMember(grantedUserId, targetUserId, programId, sessionToken)` → `{ success, message }`

## Change
1. `src/gas/programs.gs` — port verbatim all 13 functions from `程式碼.js`: catalog, enrollment, staff-enrollment RPCs.
2. `src/gas/programs.html`:
   - **Two tabs**: tab navigation bar with "All Programs" | "My Enrollments" (buttons, active state styled). Clicking tab shows/hides sections (no page reload).
   - **All Programs tab**: list cards. Each card: program name (bold), type badge, description, schedule. "Enroll" / "Cancel Enrollment" button based on `isEnrolled`. Button disabled + "..." text while RPC is in-flight.
   - **My Enrollments tab**: same card list but filtered to `isEnrolled === true`. Empty state: "You are not enrolled in any programs."
   - **Loading**: spinner or "Loading..." while `api_getProgramsCatalog` + `api_getAvailablePrograms` fetch (parallel).
   - **Staff Quick Enroll**: if `isStaff()`, show an inline form: member ID input + program dropdown + "Enroll" button → `api_staffEnrollMember`
   - On page load: `restoreSession()` guard
   - Back link: `?page=profile`

## Acceptance
- [ ] "All Programs" tab shows all programs with name, type badge, description
- [ ] "Enroll" button → calls API → button changes to "Cancel Enrollment"
- [ ] "Cancel Enrollment" → calls API → button reverts to "Enroll"
- [ ] "My Enrollments" tab shows only enrolled programs; empty state shown when none
- [ ] Staff Quick Enroll appears for STAFF; hidden for MEMBER
- [ ] Tab switching is instant (no page reload)
