# T0 Smoke Test Checklist — Vanilla Restructure

**Date**: 2026-07-28
**Scope**: `src/gas/` — all 7 pages, all RPC endpoints, all acceptance criteria
**Method**: Manual walkthrough against deployed GAS web app
**Pass threshold**: 100% of critical items (★), ≥90% of all items

---

## Prerequisites

- [ ] **P1** — `clasp push` succeeded with 17 files (check `clasp status`)
- [ ] **P2** — GAS web app is deployed (`clasp deployments` shows active deployment)
- [ ] **P3** — Linked Google Sheet has data: Users (≥2 members including 1 STAFF), Programs (≥2), Enrollments (≥1), Events (≥0), Attendance (may be empty)
- [ ] **P4** — Have test credentials ready:
  - `test-member`: username + 4-digit PIN (role: MEMBER)
  - `test-staff`: username + 4-digit PIN (role: STAFF)
- [ ] **P5** — Open web app URL in browser (Chrome recommended for camera tests)

---

## 1. Infrastructure (T01)

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 1.1 | Open web app URL with no `?page` param | Redirects to `?page=login`, shows login form | [ ] |
| 1.2 | Open `?page=xyz` (invalid page) | Redirects to `?page=login` | [ ] |
| 1.3 | Open `?page=login` directly | Shows login form with "顯恩堂系統" title | [ ] |
| 1.4 | Check browser console | No JavaScript errors on page load | [ ] |
| ★ 1.5 | Verify page is styled (not raw/unstyled HTML) | Card shadow, blue buttons, system font visible | [ ] |

---

## 2. Login (T02)

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| ★ 2.1 | Login with valid credentials | Redirects to `?page=profile` | [ ] |
| ★ 2.2 | Login with wrong PIN | Shows "PIN incorrect" or "Invalid Username or PIN" error (red) | [ ] |
| 2.3 | Login with empty fields | Shows "Please enter your username and PIN" | [ ] |
| 2.4 | Login with pending-approval account (if exists) | Shows "Account pending approval" | [ ] |
| 2.5 | After successful login, refresh the login page | Auto-redirects to `?page=profile` (session restored) | [ ] |
| 2.6 | After successful login, check `sessionStorage` | Key `efcc_session` exists with `token` + `user` object | [ ] |
| 2.7 | Click "Register New Member" link | Navigates to `?page=register` | [ ] |

---

## 3. Registration (T03 — register.html)

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| ★ 3.1 | Fill all fields (name, username, 4-digit PIN, phone, address) and submit | Shows success card with actual username + PIN | [ ] |
| 3.2 | Leave name empty, submit | Shows "Name is required" | [ ] |
| 3.3 | Leave PIN empty or enter 3 digits, submit | Shows "PIN must be exactly 4 digits" | [ ] |
| 3.4 | Register with existing username | Shows "Username already taken" | [ ] |
| 3.5 | Click "Go to Login" after success | Navigates to `?page=login` | [ ] |
| 3.6 | Login with the newly registered credentials | Login succeeds, redirected to profile | [ ] |

---

## 4. Profile & QR Pass (T03 — profile.html)

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| ★ 4.1 | After login, profile page shows name | Correct member name displayed | [ ] |
| ★ 4.2 | Role badge is displayed with correct color | MEMBER=teal, STAFF=blue, ADMIN=red, EVENT_LEADER=purple | [ ] |
| 4.3 | User ID is displayed | Shows `GC-XXXX-XXXX` format | [ ] |
| ★ 4.4 | Click "Show QR Pass" | Modal opens with QR code image (scannable) | [ ] |
| 4.5 | Click "Expand to Full Screen" in QR modal | QR fills ≥80% of viewport | [ ] |
| 4.6 | Close QR modal | Returns to profile page | [ ] |
| ★ 4.7 | Update PIN: enter current PIN + new 4-digit PIN + confirm, submit | Success message displayed | [ ] |
| 4.8 | Logout, re-login with new PIN | Login succeeds with new PIN | [ ] |
| 4.9 | Logout, re-login with old PIN | Login fails (old PIN no longer valid) | [ ] |
| ★ 4.10 | As STAFF, check profile page | Sees nav links: "Event Management", "Attendance Scanner", "Care Dashboard" | [ ] |
| ★ 4.11 | As MEMBER, check profile page | Does NOT see staff nav links | [ ] |
| 4.12 | Click "Logout" | Redirects to login page, `sessionStorage` cleared | [ ] |

---

## 5. Programs (T04)

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| ★ 5.1 | As logged-in user, navigate to `?page=programs` | Shows "All Programs" tab with program cards | [ ] |
| ★ 5.2 | Each program card shows: title, type badge, description, schedule (if available) | Schedule shows e.g. "Monday, 10:00 - 11:30" | [ ] |
| 5.3 | Click "Enroll" on a program | Button changes to "Cancel Enrollment", enrollment saved | [ ] |
| 5.4 | Click "Cancel Enrollment" | Button reverts to "Enroll", enrollment cancelled | [ ] |
| ★ 5.5 | Switch to "My Enrollments" tab | Shows only enrolled programs | [ ] |
| 5.6 | Cancel all enrollments, switch to "My Enrollments" | Shows "You are not enrolled in any programs" | [ ] |
| ★ 5.7 | As STAFF, check page | Sees "Staff Quick Enroll" section (member ID + program dropdown) | [ ] |
| 5.8 | As STAFF, Quick Enroll: enter a valid MEMBER user ID, select program, click "Enroll" | Success message shown, enrollment created for that member | [ ] |
| 5.9 | As STAFF, Quick Enroll: enter invalid member ID | Error message shown | [ ] |
| 5.10 | As MEMBER, check page | Does NOT see Staff Quick Enroll section | [ ] |

---

## 6. Events (T05)

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| ★ 6.1 | As STAFF, navigate to `?page=events` | Shows "Event Management" page with event list + "Create New Event" button | [ ] |
| ★ 6.2 | As MEMBER, navigate to `?page=events` | Shows "Access denied" message, no event list | [ ] |
| ★ 6.3 | As STAFF, click "Create New Event" | Form appears with: Program dropdown, Event Name, Date, Time Slot, Type radios, Recurrence dropdown | [ ] |
| 6.4 | Fill form (all fields), submit | Event appears in list with correct type badge (REGULAR/Special) | [ ] |
| 6.5 | Create event with missing name, submit | Shows "Event name is required" error | [ ] |
| 6.6 | Date picker uses native `<input type="date">` | Opens device-native date picker on mobile | [ ] |
| ★ 6.7 | Click "Cancel" on an active event | Confirm dialog shown → click confirm → event status changes, removed from active list | [ ] |
| 6.8 | Check canceled event | Event has "Cancelled" badge, no cancel button | [ ] |
| 6.9 | Verify GAS Triggers dashboard | `generateMonthlyRecurringEvents` has a monthly time trigger configured | [ ] |

---

## 7. Attendance Scanner (T06)

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| ★ 7.1 | As STAFF, navigate to `?page=scanner` | Shows camera viewfinder + event dropdown | [ ] |
| ★ 7.2 | As MEMBER, navigate to `?page=scanner` | Shows "Access denied" message | [ ] |
| 7.3 | Event dropdown shows upcoming events | Populated from `api_getGrantedUserEvents` | [ ] |
| ★ 7.4 | Camera permission granted | QR scanner viewfinder is visible | [ ] |
| 7.5 | Camera permission denied | Shows "Camera unavailable — use manual search below" | [ ] |
| ★ 7.6 | Scan a valid QR code from a member's profile | Green flash overlay with member name + time + audio chime | [ ] |
| ★ 7.7 | Scan the same QR code again (duplicate) | Amber flash overlay with "Already checked in at XX:XX" | [ ] |
| ★ 7.8 | As STAFF, attempt to check-in an unenrolled member | Red flash with "Not enrolled" + "Quick Enroll" button visible | [ ] |
| 7.9 | Click "Quick Enroll", then verify check-in happens | Enrollment succeeded → auto-retry check-in → green confirmation | [ ] |
| ★ 7.10 | Manual search: type a member name (one keystroke at a time) | Results appear instantly on each keystroke (no debounce delay) | [ ] |
| 7.11 | Click "Check In" on a search result | Green/amber confirmation shown | [ ] |
| ★ 7.12 | Attendance table shows check-ins | Name, Check-in Time, Method columns populated correctly | [ ] |
| 7.13 | Change event in dropdown | Attendance table refreshes for new event | [ ] |

---

## 8. Care Dashboard (T07)

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| ★ 8.1 | As STAFF, navigate to `?page=dashboard` | Shows summary cards (4 cards) with member counts | [ ] |
| ★ 8.2 | As MEMBER, navigate to `?page=dashboard` | Shows "Access denied" message | [ ] |
| 8.3 | Summary cards show: Total enrolled, Active, Inactive, Inactive % | Numbers are nonzero and reasonable | [ ] |
| ★ 8.4 | Inactive member table shows members with: name, phone (WhatsApp link), last check-in, days inactive | WhatsApp link opens `wa.me/852{phone}#` | [ ] |
| ★ 8.5 | Color-coded badges: green ≤30d, amber 31–60d, red >60d, gray "Never" | Badges use correct CSS colors | [ ] |
| 8.6 | Change threshold from 30 to 60 days | List updates — fewer or same inactive members | [ ] |
| 8.7 | Change threshold to 14 days | List updates — more inactive members | [ ] |
| ★ 8.8 | Click a member row to expand | Shows attendance history + enrolled programs list | [ ] |
| 8.9 | Dashboard with all members active | Shows "No inactive members — great pastoral engagement!" | [ ] |

---

## 9. Session Persistence & Cross-Cutting

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| ★ 9.1 | Login as MEMBER, then navigate (via URL bar) to `?page=profile`, `?page=programs`, `?page=events` | Each page loads with correct data, no redirect to login | [ ] |
| 9.2 | Close browser tab, reopen URL | Session restored (if within 30-day TTL) | [ ] |
| ★ 9.3 | Login as STAFF, navigate to all 7 pages | Every page loads without errors | [ ] |
| 9.4 | As MEMBER, attempt to access STAFF-only pages (events, scanner, dashboard) | Each shows "Access denied" | [ ] |
| 9.5 | Logout from any page, then navigate to a protected page | Redirected to `?page=login` | [ ] |

---

## 10. GAS Server-Side Verification

Run these in GAS Editor (`clasp run` or Editor > Run):

| # | Function | Expected | Pass? |
|---|----------|----------|-------|
| ★ 10.1 | `verifyLogin("test-member", "0000")` (with real PIN) | Returns `{success: true, name, userId, qrString}` | [ ] |
| 10.2 | `api_getProgramsCatalog(userId, token)` | Returns `{success: true, data: [...]}` with correct field names | [ ] |
| 10.3 | `api_getAvailablePrograms(userId, token)` | Returns `{success: true, data: [...]}` with `isEnrolled` boolean | [ ] |
| 10.4 | `api_createEvent({...})` | Returns `{success: true, data: {eventId, ...}}` | [ ] |
| 10.5 | `api_cancelEvent({...})` | Returns `{success: true}` | [ ] |
| 10.6 | `api_checkInMember({...})` | Returns appropriate response (success/duplicate/notEnrolled) | [ ] |
| 10.7 | `api_getEventAttendance(eventId, ...)` | Returns `{success: true, data: [{...}]}` | [ ] |
| 10.8 | `api_getCareDashboard(30, token)` | Returns `{generatedAt, thresholdDays, inactiveMembers: [...]}` | [ ] |

---

## Results Summary

| Section | Critical (★) | Total | Passed |
|---------|--------------|-------|--------|
| Infrastructure | 1 | 5 | ___/5 |
| Login | 2 | 7 | ___/7 |
| Registration | 1 | 6 | ___/6 |
| Profile | 4 | 12 | ___/12 |
| Programs | 3 | 10 | ___/10 |
| Events | 3 | 9 | ___/9 |
| Scanner | 6 | 13 | ___/13 |
| Dashboard | 4 | 9 | ___/9 |
| Cross-cutting | 2 | 5 | ___/5 |
| Server | 8 | 8 | ___/8 |
| **Total** | **34★** | **84** | ___/84 |

**Pass**: All 34 critical items (★) pass.  
**Fail**: Any critical item fails — BLOCKED for production.
