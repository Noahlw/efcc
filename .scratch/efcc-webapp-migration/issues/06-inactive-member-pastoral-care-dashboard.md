# 06 — Inactive Member Pastoral Care Dashboard

**What to build:** Implement staff care dashboard (`CareDashboardView.tsx`) and RPC handlers (`api_getCareDashboard`, `api_getUserActivityProfile`) per Spec 007, enabling church staff (`STAFF`, `ADMIN`) to identify inactive members (enrolled but 0 check-ins in past 30 days) and initiate pastoral outreach via 1-click WhatsApp messaging.

**Blocked by:** 05 — Event Attendance Camera QR Scanner & Manual Search  
**Status:** ready-for-agent

- [ ] `CareDashboardView.tsx` unlocks for `ADMIN` and `STAFF` roles.
- [ ] Header summary cards display Total Active Members, Active This Month, and Inactive Needing Care count.
- [ ] Controls allow selecting inactivity threshold (14 / 30 / 60 / 90 days) and filtering by program.
- [ ] Table renders inactive members with color-coded inactivity badges (14d/30d/60d+), enrolled programs, and 1-click WhatsApp (`wa.me`) link.
- [ ] Clicking a member row opens `MemberActivityProfileModal.tsx` showing full attendance history and attendance rate (%).
- [ ] RPC `api_getCareDashboard` calculates inactivity dynamically against `Attendance` and `Enrollments` sheets.
