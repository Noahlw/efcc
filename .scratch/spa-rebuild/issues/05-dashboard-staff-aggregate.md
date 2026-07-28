# 05 — Dashboard (staff aggregate view)

**What to build:** A Staff or Admin user sees aggregate attendance/enrollment metrics across programs.

**Blocked by:** 01 (shell)

**Status:** ready-for-agent

- [ ] Server dashboard aggregation functions reimplemented from `程式碼.js` (attendance summaries, enrollment counts, per-program breakdowns) — read-only, no privileged mutation, no audit-log requirement.
- [ ] `dashboard.html` fragment: renders the aggregate views; defines `initDashboard()`.
- [ ] `Dashboard` appears in chrome only for global `STAFF`/`ADMIN` roles — not shown to MEMBER or plain Program-Leader-only accounts (Grill 3.3).
- [ ] Smoke test: as a Staff test account, Dashboard appears in chrome and renders without error; as a Member test account, Dashboard does not appear in chrome, and a direct `loadPage('dashboard')` call from a Member session is rejected server-side (RBAC gate, not just client-side hiding).

---

Blocked by #42 (T01 Login \u2192 Profile).
