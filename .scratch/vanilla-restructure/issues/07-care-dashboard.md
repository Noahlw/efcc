# 07 — Care dashboard
**What to build:** `dashboard.gs` with pastoral care RPCs, and `dashboard.html` with inactive member stats and outreach tools.
**Blocked by:** 02 (needs `auth.gs` session verification; parallel-safe with 04)
**Status:** ready-for-agent

## Data shapes (from reference)
- `api_getCareDashboard(thresholdDays, sessionToken)` → `{ generatedAt: string, thresholdDays: number, inactiveMembers: [{ userId, name, phone, totalCheckIns, lastCheckInAt?, enrolledPrograms: [{ programId, title, type }] }] }`
  - Only includes MEMBER-role users who are enrolled in ≥1 program
  - Inactive = no check-in within `thresholdDays` days (default 30)
- `api_getUserActivityProfile(userId, sessionToken)` → `{ userId, name, phone, totalCheckIns, lastCheckInAt?, enrolledPrograms: [Program], attendance: [{ attendanceId, eventId, checkInTime, checkInMethod, checkInBy, status }] }`
  - Returned as raw object (not wrapped in `{ success, data }` — returns `null` on error)
  - Role gate: STAFF/ADMIN only (returns `null` otherwise)

## Change
1. `src/gas/dashboard.gs` — port verbatim: `api_getUserActivityProfile`, `api_getCareDashboard`
2. `src/gas/dashboard.html`:
   - **Role gate**: `!isStaff()` → "Access denied" (STAFF/ADMIN only — MEMBER and EVENT_LEADER cannot see member activity data)
   - **Summary cards** (top row, 4 cards):
     - Total enrolled members (count of MEMBERs with ≥1 enrollment)
     - Active members (checked in within threshold)
     - Inactive members (not checked in within threshold)
     - Inactive percentage
   - **Threshold control**: `<select>` or slider to change threshold (default 30 days). Options: 14, 30, 60, 90 days. Changing refetches.
   - **Inactive member list**: table/grid. Per row: name, phone (with WhatsApp link `https://wa.me/852{phone}#` stripping non-digits), last check-in date (or "Never"), days inactive, **color-coded inactivity badge** (green ≤30d, amber 31–60d, red >60d, gray "Never"), enrolled programs (comma-separated). (Per issue #8 comment 1.)
   - **Expandable detail**: click member row → fetches `api_getUserActivityProfile(userId, token)` → shows attendance history (each check-in: date, event, method) + enrolled program list
   - Empty state: if 0 inactive members, show "No inactive members — great pastoral engagement!"
   - On page load: `restoreSession()` guard
   - Back link: `?page=profile`

## Acceptance
- [ ] STAFF/ADMIN sees summary cards with correct counts
- [ ] MEMBER/EVENT_LEADER sees "Access denied"
- [ ] Changing threshold (30→60→90 days) updates inactive list
- [ ] WhatsApp link per member opens `wa.me` with +852 prefix and correct phone
- [ ] Clicking member expands to show attendance history + enrolled programs
- [ ] Empty state shown when all members are active

- [ ] Color-coded inactivity badges show: green ≤30d, amber 31–60d, red >60d, gray "Never"