# 04 — Attendance / Scanner

**What to build:** A Program Leader or Staff member scans a member's QR code (camera) or manually searches and checks them in to a specific event.

**Blocked by:** 01 (shell), 03 (attendance records reference events)

**Status:** ready-for-agent

- [ ] Server attendance functions reimplemented from `程式碼.js` (QR check-in, manual search check-in, atomic duplicate-checkin guard via `LockService` per the existing camera-scanner + manual-search feature) against the existing `Attendance` sheet schema.
- [ ] `scanner.html` fragment: camera-based QR scanner UI + manual search fallback, scoped to Program Leaders (for their programs) and Staff/Admin (any program); defines `initScanner()`.
- [ ] `Scanner` appears in chrome only for users with at least one active grant (Program Leader on any program, or global `STAFF`/`ADMIN`) — not shown to plain MEMBER accounts (Grill 3.3 accessible-pages-only rule).
- [ ] Check-in is a privileged mutation — wrapped in the two-phase audit pattern (ADR-0009); duplicate check-in attempts are rejected with a `DENIED` outcome logged, not silently ignored.
- [ ] Smoke test: as a Program Leader/Staff test account, manually check in a test member to a test event → verify an `Attendance` row is created → attempt a duplicate check-in → verify it's rejected and a `DENIED` audit row is logged.

---

Blocked by #42 (T01 Login \u2192 Profile), #44 (T03 Events).
