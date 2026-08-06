# 02 — Member PIN Authentication, Persistent Session & Profile Pass View

**What to build:** Port member authentication and member profile view to React TypeScript (`LoginView.tsx`, `MemberRegistrationView.tsx`, `MyProfileView.tsx`). Users log in using Username + 4-digit PIN (ADR-0002 & ADR-0005) or register a new account. Persistent session (`session.ts`) saves `sessionToken` in `localStorage`, bypassing login on weekly visits. Authenticated members view their full-screen digital QR check-in pass.

**Blocked by:** 01 — Scaffold TypeScript WebApp Architecture & Mock RPC Layer  
**Status:** ready-for-agent

- [ ] `LoginView.tsx` renders Username + 4-digit PIN form and validates credentials via `apiService.loginUser(username, pin)`.
- [ ] `MemberRegistrationView.tsx` collects Name, Username, PIN, Phone, and Address, submitting via `apiService.registerUser(payload)`.
- [ ] `session.ts` persists `sessionToken` in `localStorage`. On app launch, active session automatically bypasses PIN login screen.
- [ ] `MyProfileView.tsx` displays member info, role badge (`MEMBER` / `STAFF` / `ADMIN`), and full-screen high-contrast QR pass modal.
- [ ] Log out button clears `localStorage` session immediately via `api_logoutUser()`.
- [ ] Server RPC handlers in `程式碼.js` verify `sessionToken` (`verifySessionToken_`) and return `role` directly from `Users` sheet.
