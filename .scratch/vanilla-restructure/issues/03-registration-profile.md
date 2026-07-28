# 03 — Member registration, profile & QR pass
**What to build:** `members.gs` with RPCs, `register.html` for sign-up, `profile.html` for member dashboard.
**Blocked by:** 02 (needs `auth.gs` for session verification and login redirect)
**Status:** ready-for-agent

## Data shapes (from reference)
- `api_registerUser({ name, username, pin, phone, address })` → `{ success, data: { name, role: "MEMBER", userId }, message }`
  - Side-effect: writes user to Users sheet with auto-generated `GC-XXXX-XXXX` ID and random 4-digit PIN
  - Validation errors: "Name is required", "Username is required", "PIN must be exactly 4 digits", "Username already taken"
- `api_searchMembers(query, grantedUserId, sessionToken)` → `{ data: [{ name, phone, userId }], success }` — max 10 results, only active MEMBERs
- `updateCredentials(userId, newUsername, newPin)` → updates Users sheet
- Role badge mapping: ADMIN=red, STAFF=blue, EVENT_LEADER=purple, MEMBER=teal

## Change
1. `src/gas/members.gs` — port verbatim: `registerNewMember`, `api_searchMembers`
2. `src/gas/register.html`:
   - **Form fields**: Name (text), Username (text), PIN (4 digits, type=password), Phone (tel), Address (textarea)
   - **Validation**: all fields required before submit. Show field-level errors inline.
   - **Submit**: `api.call('api_registerUser', { name, username, pin, phone, address })`
   - **On success**: show success card with "Registration successful! Your username: X, PIN: XXXX" + "Go to Login" button → `?page=login`
   - **On error**: display error message (e.g. "Username already taken")
   - Back link: `?page=login`
3. `src/gas/profile.html`:
   - **Info card**: `sessionManager.getUser()` → name, user ID, role badge (colored)
   - **QR pass section**: load `qrcode` from CDN (`jsdelivr`). "Show QR Pass" button → full-screen overlay with large canvas-generated QR code from `qrCodeString`. Overlay has "Close" button and "Expand to Full Screen" toggle. QR code fills ≥80% of viewport in full-screen mode. (Per spec #8 comment 1: "Full-screen QR Pass" for door check-in.)
   - **Update PIN section**: current PIN + new PIN (2 inputs) + confirm PIN + "Update" button → `api.call('updateCredentials', userId, newUsername, newPin)`. Show success/error.
   - **Granted-user links**: if `isGrantedUser()` → show nav buttons: "Event Management", "Attendance Scanner", "Care Dashboard"
   - **Logout button**: `sessionManager.clear()` → `navigate('login')`
   - On page load: `restoreSession()` guard

## Acceptance
- [ ] New member can register with name + username + PIN + phone + address → success page with credentials
- [ ] Duplicate username shows "Username already taken"
- [ ] After login → profile shows name, ID, correct-colored role badge
- [ ] "Show QR Pass" opens modal with QR code image matching `qrCodeString`
- [ ] PIN update works: enter current + new → success → new PIN works on next login
- [ ] Logout clears session and redirects to login
- [ ] STAFF sees nav links for Events, Scanner, Dashboard; MEMBER sees none
- [ ] QR pass modal has "Expand to Full Screen" button that fills ≥80% of viewport
