# 02 — Programs (catalog + enrollment)

**What to build:** A member browses the program catalog, enrolls in a program, cancels an enrollment, and sees their current enrollments reflected on their Profile.

**Blocked by:** 01 (needs the shell + `loadPage()` infra + RBAC chrome pattern established)

**Status:** ready-for-agent

- [ ] Server program/enrollment functions reimplemented from `程式碼.js` (catalog listing, enroll, cancel enrollment) against the existing `Programs`/`Enrollments` sheet schema (`CONTEXT.md`) — unchanged schema.
- [ ] `programs.html` fragment: lists the program catalog with type/description, shows enroll/cancel controls per program based on the member's current enrollment status; defines `initPrograms()`.
- [ ] `Programs` appears in the accessible-pages chrome for every authenticated role (baseline access per Grill 3.3).
- [ ] Profile fragment (from Slice 01) updates to show the member's active enrollments — either by re-fetching on load or by a shared client-side cache invalidation; specify which in the PR.
- [ ] Smoke test: enroll in a program → see it reflected on Profile → cancel → no longer reflected.

---

Blocked by #42 (T01 Login \u2192 Profile).
