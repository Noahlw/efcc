# 03 — Events (view + Program-Leader create/cancel)

**What to build:** Any authenticated member views upcoming events for programs they're enrolled in. A Program Leader (per ADR-0006, `Program_Leaders` sheet grant — independent of global `Role`) creates or cancels an event for a program they lead.

**Blocked by:** 01 (shell), 02 (events are program-scoped, so enrollment/catalog must exist first)

**Status:** ready-for-agent

- [ ] Server event functions reimplemented from `程式碼.js` (list events for a program, create event, cancel event, monthly recurring event generation per ADR-0004) against the existing `Events` sheet schema.
- [ ] `events.html` fragment: lists upcoming events for the member's enrolled programs; for a Program Leader, additionally shows create/cancel controls scoped to programs they lead — checked both server-side (RBAC gate) and client-side in `initEvents()` (defense in depth per ADR-0008 architecture summary).
- [ ] `Events` appears in chrome for every authenticated role (baseline view access); create/cancel controls only render for a user with an active `Program_Leaders` grant on that program, or global `STAFF`/`ADMIN`.
- [ ] Event creation/cancellation are privileged mutations — each wrapped in `writeAuditLog()`'s two-phase `ATTEMPT`→`SUCCESS`/`ERROR` pattern (ADR-0009), sharing one `Correlation_ID`, inside `LockService.getScriptLock()`.
- [ ] Smoke test: as a Program Leader test account, create an event → verify it appears in the events list → cancel it → verify it's removed/marked cancelled → verify a correctly-shaped `Audit_Log` `ATTEMPT`+`SUCCESS` row pair exists for the creation.

---

Blocked by #42 (T01 Login \u2192 Profile), #43 (T02 Programs).
