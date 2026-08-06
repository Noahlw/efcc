# 02 — Auth module & Login page
**What to build:** `auth.gs` with all authentication RPCs and role guards, and `index.html` login page.
**Blocked by:** 01 (needs `Code.gs`, `styles.html`, `app.js.html`)
**Status:** ready-for-agent

## Data shapes (from reference)
- `api_loginUser(username, pin)` → `{ success, data: { userId, name, role, sessionToken, qrCodeString, expiryTimestamp }, message }`
- `api_getCurrentSession(userId, sessionToken)` → `{ success, data: { userId, name, role, sessionToken, qrCodeString, expiryTimestamp }, message }`
- `api_logoutUser(userId, sessionToken)` → `{ success }` (always succeeds)
- `api_registerUser(payload)` → `{ success, data: { name, role: "MEMBER", userId }, message }`
- Error messages: "Invalid Username or PIN", "PIN incorrect", "Account pending approval", "Account not active", "Session invalid or expired"

## Change
1. `src/gas/auth.gs` — port verbatim from `程式碼.js`:
   - `verifyLogin`, `lookupUserByCredentials_`, `verifySessionToken_`
   - `api_loginUser`, `api_getCurrentSession`, `api_logoutUser`, `api_registerUser`
   - `updateCredentials`, `checkRoleAtLeast_`, `checkIsGrantedUser_`, `resolveSessionUser_`
2. Replace placeholder `src/gas/index.html` with real login page:
   - **Form**: Username (text input) + PIN (type=password, maxlength=4, inputmode=numeric, autocomplete=off)
   - **Submit**: "Login" button → `api.call('api_loginUser', username, pin)`
   - **On success**: `sessionManager.set(token, { userId, name, role, qrCodeString })`, then `navigate('profile')`
   - **On error**: show the exact `message` string from server under the form (red text)
   - **Auto-login**: on page load, `restoreSession()` — if session valid, `navigate('profile')` immediately
   - **Register link**: `?page=register` below the form
   - **Layout**: `.page` card container, church name "顯恩堂" as heading, subtitle in Chinese

## Acceptance
- [ ] Login with valid test credentials → redirects to `?page=profile`
- [ ] Wrong PIN shows "PIN incorrect" / "Invalid Username or PIN"
- [ ] Pending-approval account shows "Account pending approval"
- [ ] `sessionStorage` contains `efcc_session` with token + user after login
- [ ] Refreshing login page while logged in → auto-redirect to profile
- [ ] "Register" link → navigates to `?page=register`
