## Plan — Vertical Slice Breakdown for #39 (SPA Rebuild)

Parent spec: #39 (`docs/adr/0008`, `docs/adr/0009`). This ticket proposes how to decompose that spec into demoable, individually-shippable vertical slices per `to-tickets`. **Not yet split into child tickets — that happens after this plan is approved.**

### Prefactor (ticket 00 — no user-visible behavior, blocks everything)

Scaffold shared by every later slice: `Code.gs` (`doGet` always-login, `loadPage(name)` with allow-list, `include(filename)`), `appsscript.json`, `main.html` shell skeleton (sidebar + bottom-tab CSS breakpoint, empty menu), `styles.html` unchanged include. No fragments yet — this alone is not demoable, which is why it's a prefactor, not a tracer bullet.

### Proposed vertical slices (each a complete path: server domain fn → RBAC gate → chrome entry → fragment → smoke-testable)

| # | Slice | What's demoable | Blocked by |
|---|---|---|---|
| 01 | **Login → Profile** | Log in with username+PIN, land on Profile fragment, see own data, log out | 00 |
| 02 | **Programs (catalog + enrollment)** | Browse programs, enroll/cancel enrollment, see own enrollments on Profile | 01 |
| 03 | **Events (view + program-leader create/cancel)** | View upcoming events for enrolled programs; a Program Leader creates/cancels an event | 01, 02 (events are program-scoped) |
| 04 | **Attendance / Scanner** | A Program Leader/Staff scans a member's QR or manually checks them in to an event | 01, 03 (attendance references events) |
| 05 | **Dashboard (staff aggregate view)** | Staff/Admin sees attendance/enrollment aggregates | 01 |
| 06 | **Care (inactive-member pastoral dashboard)** | Staff/Admin sees inactivity-flagged members | 01 |
| 07 | **Registration + Member Approval** | A new visitor self-registers (Pending), Staff/Admin approves/rejects | 00 (independent of 01 — happens before login exists) |

Audit logging (ADR-0009's two-phase `ATTEMPT`/`SUCCESS`/`ERROR` pattern) is **not** a separate ticket — it's an acceptance criterion baked into whichever slice contains the first privileged mutation (Slice 07's approval action is the first candidate; role-assignment, if scoped later, would be another).

### Open edges to confirm before publishing child tickets

1. **Registration/approval (Slice 07) is missing from #39's fragment list** (`profile, programs, events, scanner, dashboard, care` — no `register`). Register/approval predates having a session (a visitor has no account yet), so it can't be a `loadPage()` fragment behind the authenticated shell — it needs its own unauthenticated top-level page (`register.html`, swapped in from `login.html` the same DOM-swap way, per the template's pattern extended). Confirm this is in scope for the rebuild (it must be — EFCC can't onboard new members without it) and that Slice 07 is the right place for it.
2. **Slice granularity** — is per-domain (7 slices) the right size, or should some combine (e.g. Dashboard + Care are both "staff aggregate view" and might be one slice)?
3. **Ordering** — Slices 02–06 all only depend on 01 (or 01+03 for 04). They could run in parallel after 01 lands. Confirm whether you want them sequenced or parallelized once 01 is done.
4. **Test seam** — issue #39's spec proposed a browser-automation smoke test (Seam 1) per slice plus direct server-function invocation (Seam 2) for pure logic. Still awaiting your confirmation on this (called out in #39, unresolved).

**Status: awaiting your review** — reply with edits to the slice list/edges, or approve to proceed to publishing the individual child tickets.