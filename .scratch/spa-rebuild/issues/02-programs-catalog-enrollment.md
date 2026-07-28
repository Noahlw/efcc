# 02 — Programs (catalog + enrollment)

**What to build:** A member browses the program catalog, enrolls in a program, cancels an enrollment, and sees their current enrollments reflected on their Profile.

**Blocked by:** 01 (needs the shell + `loadPage()` infra + RBAC chrome pattern established)

**Status:** ready-for-agent

- [x] Server program/enrollment functions reimplemented from `程式碼.js` (catalog listing, enroll, cancel enrollment) against the existing `Programs`/`Enrollments` sheet schema (`CONTEXT.md`) — unchanged schema.
- [x] `programs.html` fragment: lists the program catalog with type/description, shows enroll/cancel controls per program based on the member's current enrollment status; defines `initPrograms()`.
- [x] `Programs` appears in the accessible-pages chrome for every authenticated role (baseline access per Grill 3.3).
- [x] Profile fragment (from Slice 01) updates to show the member's active enrollments — fetches via dedicated `api_getMyEnrollments()` server call (new function), called from `loadMyEnrollments()` helper inside `initProfile()`.
- [x] Smoke test: enroll in a program → see it reflected on Profile → cancel → no longer reflected. (Code path complete; actual end-to-end test requires real GAS deployment with Program + Events sheet data.)
---

Blocked by #42 (T01 Login \u2192 Profile).
