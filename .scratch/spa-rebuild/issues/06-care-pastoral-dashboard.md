# 06 — Care (inactive-member pastoral dashboard)

**What to build:** A Staff or Admin user sees members flagged as inactive (per the existing inactivity-badge logic), with an activity profile view for pastoral follow-up.

**Blocked by:** 01 (shell)

**Status:** ready-for-agent

- [ ] Server care-dashboard functions reimplemented from `程式碼.js` (inactive-member detection, activity profile aggregation) — read-only, no privileged mutation, no audit-log requirement.
- [ ] `care.html` fragment: renders the inactivity-flagged member list with the existing badge thresholds (green/amber/red per days-inactive); defines `initCare()`.
- [ ] `Care` appears in chrome only for global `STAFF`/`ADMIN` roles (Grill 3.3).
- [ ] Smoke test: as a Staff test account, Care appears in chrome and renders the inactivity list without error; a direct `loadPage('care')` call from a Member session is rejected server-side.

---

Blocked by #42 (T01 Login \u2192 Profile).
