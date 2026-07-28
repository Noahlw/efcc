# 01 — Scaffold & core infrastructure
**What to build:** The `src/gas/` directory skeleton — `Code.gs` with `doGet()` + `include()`, shared `styles.html` (CSS tokens), `app.js.html` (session/api/navigation JS utilities), and a smoke-test placeholder page. After clasp push, the web app serves a styled placeholder confirming the pipeline works end-to-end.
**Blocked by:** None — can start immediately
**Status:** ready-for-agent

## Data shapes (from reference)
The `api.login()` call returns: `{ success, data: { userId, name, role, sessionToken, qrCodeString, expiryTimestamp }, message }`
All RPCs return `{ success, data?, message? }` — the `app.js.html` api wrapper must handle this envelope uniformly.

## Change
1. `src/gas/appsscript.json` — copy from root, no changes.
2. `src/gas/Code.gs`:
   - `doGet(e)` — reads `e.parameter.page`, defaults to `"login"`. Allowlist: `login, register, profile, programs, events, scanner, dashboard`. Unknown page → serve `login`. Uses `HtmlService.createTemplateFromFile(page).evaluate().setTitle('EFCC 顯恩堂')`.
   - `include(filename)` — `HtmlService.createHtmlOutputFromFile(filename).getContent()`.
   - Port all infrastructure utilities verbatim: `normalizeHeader_`, `findHeaderIndex_`, `normalizeId_`, `isActiveStatus_`, `PROGRAMS_CACHE_KEY_`, `PROGRAMS_CACHE_TTL_SEC_`, `SESSION_TTL_MS_`, `DEFAULT_DEV_SALT_`, `getSessionSalt_`, `sha256Hmac_`, `getSessionIssuedAt_`, `setSessionIssuedNow_`, `clearSessionIssued_`, `isSessionActiveForUser_`.
3. `src/gas/styles.html` — `<style>` with:
   - CSS custom properties: `--color-surface`, `--color-surface-muted`, `--color-text`, `--color-text-muted`, `--color-accent`, `--color-danger`, `--color-success`
   - Role badge colors: `--color-role-admin: #b91c1c`, `--color-role-staff: #1d4ed8`, `--color-role-event-leader: #7c3aed`, `--color-role-member: #0f766e`
   - `.page` container (max-width 26rem, centered card with shadow)
   - `.btn`, `.btn-primary`, `.btn-danger`, `.btn-ghost` button classes
   - `.input`, `.label` form element classes
   - `.card`, `.error-msg`, `.success-msg`, `.badge` utility classes
   - Mobile-first: touch targets ≥44px, readable at 320px width
4. `src/gas/app.js.html` — `<script>` with:
   ```javascript
   // sessionManager backed by sessionStorage key "efcc_session"
   sessionManager.getToken()     // → string | null
   sessionManager.set(token, user) // stores { token, user }
   sessionManager.clear()        // removes session
   sessionManager.getUser()      // → { userId, name, role, qrCodeString }
   sessionManager.isLoggedIn()   // → boolean

   // api wrapper — Promise-like over google.script.run
   api.call(fnName, ...args)     // → Promise<{success, data?, message?}>
   // internally: google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)[fnName](...args)

   // navigation
   navigate(page)                // window.location = '?page=' + page

   // role helpers (read from sessionManager)
   isGrantedUser()               // role !== "MEMBER"
   isStaff()                     // role === "STAFF" || "ADMIN"

   // page init
   restoreSession()              // calls api_getCurrentSession → if valid, renders page; if not, redirect to login
   // called on DOMContentLoaded by every page
   ```
5. `src/gas/index.html` — minimal placeholder with `<h1>EFCC Scaffold</h1>` + session status display. Real login page arrives in T02.
6. Update root `.clasp.json` → `"rootDir": "src/gas"`.
7. Update root `.claspignore` → `**/**`, `!**/*.gs`, `!**/*.html`, `!appsscript.json`.

## Acceptance
- [ ] `clasp push` succeeds with 0 errors
- [ ] Web app URL shows placeholder with styles applied
- [ ] `include('styles')` injects CSS; `include('app.js')` injects JS
- [ ] `sessionManager` + `api` objects available in browser console
- [ ] `?page=xyz` unknown page redirects to login placeholder
- [ ] `程式碼.js` and `src/frontend/` are untouched
