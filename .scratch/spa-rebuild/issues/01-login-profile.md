# 01 — Login → Profile (first vertical slice)

**What to build:** A member logs in with username + PIN, lands on the Profile fragment inside the SPA shell, sees their own data (name, role badge, QR code string), and can log out. This is the smallest complete path through every architectural layer: auth domain reimplementation, RBAC-filtered chrome, DOM-swap navigation, one fragment, session validation.

**Blocked by:** 00 (scaffold)

**Status:** ready-for-agent

- [ ] `login.html` reimplements `程式碼.js`'s login logic (username + PIN, not email + password) as a top-level page with `<base target="_top">`. No success card, no "Continue" confirmation — on success, `document.open(); document.write(mainHtml); document.close();` swaps in `main.html` immediately.
- [ ] Server auth functions reimplemented from `程式碼.js` (login credential check, session token issuance, session validation) — not ported from the current `src/gas/auth.gs`.
- [ ] A server function (e.g. `getAccessiblePages(role, grants)`) returns the pages a user can navigate to, computed from `Role` (ADMIN/STAFF/MEMBER, ADR-0006) — for this slice, at minimum `profile` must always be included for every authenticated role.
- [ ] `main.html` chrome (sidebar + bottom tabs) renders exactly the accessible-pages list returned by the server; for a MEMBER-only test account with no other grants, only Profile should appear.
- [ ] `profile.html` fragment (bare `<div>` + `<script>`, no `<html>/<head>/<body>`) renders the logged-in user's name, role badge, and QR code string; defines `initProfile()`.
- [ ] Logout clears `localStorage` and DOM-swaps back to `login.html`; a fresh page load after logout does not auto-restore the session.
- [ ] F5 refresh from `main.html` with a valid session resolves back to `main.html` within a few seconds (brief login flash acceptable per ADR-0008 Consequences; permanent trap is not).
- [ ] Smoke test (Seam 1, browser automation against the deployed `/exec` URL, real test-account credential): login → profile renders → logout → session cleared. This is the exit-criteria subset of ADR-0008's Bulletproof Baseline covering login/profile/logout.

---

Blocked by #41 (T00 scaffold).
