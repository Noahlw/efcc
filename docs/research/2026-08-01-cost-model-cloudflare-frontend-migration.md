# Codebase-Grounded Cost Model: Cloudflare Frontend + Apps Script Backend (Full Migration)

**Date:** 2026-08-01
**Author:** CostModel (codebase-grounded analysis)
**Scope:** Redo the entire cost evaluation for migrating EFCC's FRONTEND to Cloudflare
while KEEPING Apps Script + Google Sheets as the backend/DB. Grounded in the actual
code in `src/gas/` (not estimates). Produces maximum use cases per day / week / month
under the system's regular workflow (attendance taking + other member/admin operations).
**Constraints carried over:** free-tier-only ($0/mo), Sheets stays (hard), ~250 active
members / ~250 weekly check-ins, 2-person volunteer team.
**Unit of cost:** every RPC = **1 Cloudflare Worker proxy request** (the mandatory CORS
proxy) **+ 1 Apps Script execution** (all run as the owner account because
`webapp.executeAs = USER_DEPLOYING`). Static HTML/JS/CSS assets are free and unlimited on
Cloudflare and are NOT counted.

---

## TL;DR

1. **The entire regular workflow (attendance + member portal + admin) costs $0/month,
   with ~84× headroom on the absolute worst day** against Cloudflare's 100k Worker
   requests/day, and the attendance workflow touches NONE of the email/URL-Fetch/trigger
   daily quotas.
2. **Maximum realistic usage (every member logs in + a peak Sunday) is still $0/month**:
   ~1,180 RPCs on the worst day = 1.18% of the Cloudflare ceiling.
3. **The tightest constraint is NOT cost — it is Apps Script's 30 simultaneous
   executions/user** (all funnel through the owner account). Staggered usage stays 2-3×
   under; only a synchronized 30+ request burst in the same ~1-2 seconds would throttle.
4. **First forced spend is unchanged: communications** (email 100/day consumer vs
   1,500/day Workspace; paid SMS) — independent of the attendance/portal workflow.

---

## 1. Per-action RPC cost (verified against source)

Source: `src/gas/Code.gs`, `src/gas/attendance-checkin.gs`, `src/gas/shell-session.js.html`
(call sites at lines 578, 991, 1338, 1654, 2133, 2372, 2418, 2582).

| User action | RPC fired | RPCs | Internal sheet ops |
|---|---|---|---|
| App open / reload | `api_restoreApp` + auto-nav `api_authorizedNavigate` | 2 | ~2 reads (session, user) |
| Login | `api_loginUser` + auto-nav | 2 | ~2 reads + 1 write (session issue) |
| Logout | `api_logoutUser` | 1 | 1 write (session delete) |
| Enter Profile section | `api_authorizedNavigate` | 1 | 2 reads |
| Enter Programs section | auth + `api_getPrograms` | 2 | ~3 reads |
| Enter Scanner section | auth + `api_getScannerEvents` | 2 | ~3 reads |
| Enter Events/Care/Permissions (when built) | auth + section read | 2 | ~3 reads |
| **One QR check-in** | `api_qrCheckIn` | **1** | **~6-8 reads + 2 writes** (attendance + audit) under `LockService` |
| Demo form submit | `api_submitDemoTaskForm` | 1 | 0 (CacheService only) |

Key code facts:
- `api_qrCheckIn` (`attendance-checkin.gs:124`) acquires one `LockService.getScriptLock()`,
  appends **one Attendance row + one Audit_Log row**, then `SpreadsheetApp.flush()` — 2
  writes per successful check-in; duplicates write nothing (quiet success).
- Check-ins are performed by **operators** (Teacher/Admin/Program Leader — capability
  checked at `attendance-checkin.gs:86`), NOT by members scanning themselves. The 250
  weekly check-ins are a small number of operators scanning 250 members.
- **No time-based triggers exist** (no `ScriptApp.newTrigger` in any `.gs`), so ADR-0004's
  recurring event generation is not yet a scheduled job and consumes no trigger quota.
- `webapp.executeAs = USER_DEPLOYING` (CONTEXT.md) → **all 250 members' traffic counts
  against the single owner account's per-user quotas.**

---

## 2. Actor model (stated assumptions)

| Actor | Count | Behaviour |
|---|---|---|
| Operators (Teacher/Admin/Program Leader) | ~10 | Run check-ins; view attendance/manage events |
| Members | 250 | Log in for portal: profile, programs, events |
| Admins | 1-2 | Event creation, enrollment mgmt, attendance review |

Check-ins: 250/week (one per active member), concentrated in 2-4 service windows/week
(bursty, not uniform).

---

## 3. Usage models

### 3a. REGULAR (steady-state)

| Component | Calc | RPCs/week |
|---|---|---|
| Attendance check-ins | 250 × 1 | 250 |
| Operator scanner sessions | 10 × (open 2 + enter-scanner 2) | 40 |
| Operator other section views | 10 × 3 views × 2 | 60 |
| Member portal (25% login weekly ≈ 62 × 5 RPCs/session) | 62 × 5 | 310 |
| Admin / event operations | — | 40 |
| **Regular weekly total** | | **~700** |

- **Daily average:** ~100/day
- **Peak day (Sunday, attendance burst):** ~250 (check-ins) + 40 (operator) + 60 (members) ≈ **350/day**
- **Monthly (×4.33):** **~3,000/month**

### 3b. MAXIMUM (peak week — big service + every member engages)

| Component | Calc | RPCs/week |
|---|---|---|
| Attendance (check-ins + overhead) | 250 + 150 | 400 |
| Member portal (100% login = 250 × 6 RPCs) | 250 × 6 | 1,500 |
| Admin / event operations | — | 100 |
| **Maximum weekly total** | | **~2,000** |

- **Daily average:** ~285/day
- **Monthly (×4.33):** **~8,700/month**

### 3c. MAXIMUM PEAK DAY (Sunday — attendance + members same day)

| Component | RPCs |
|---|---|
| Attendance that day (250 check-ins + 30 overhead) | 280 |
| Members logging in that day (150 × 6) | 900 |
| **Peak day total** | **~1,180/day** |

---

## 4. Ceiling mapping (at MAXIMUM PEAK DAY = 1,180 RPCs/day)

| Resource | Free ceiling | Max peak day usage | Headroom | Threatened? |
|---|---|---|---|---|
| **Cloudflare Worker requests** | 100,000/day | 1,180 (1.18%) | ~84× | No |
| Cloudflare Worker CPU | 10 ms/invocation | <2 ms (proxy is I/O) | ~5× | No |
| Cloudflare Pages builds | 500/month | ~20/month | 25× | No |
| **Apps Script simultaneous exec / user** | 30 | ~10-15 (staggered) | ~2-3× | **Watch** (synchronized burst) |
| Apps Script simultaneous exec / script | 1,000 | <20 | ~50× | No |
| Apps Script runtime / execution | 6 min | <2 s | ~180× | No |
| Apps Script executions / day | (no daily count cap; bounded by 30 concurrent) | 1,180 | — | No |
| Apps Script URL Fetch | 20,000/day (consumer) | 0 (not used by this workflow) | ∞ | No |
| Apps Script Email | 100/day (consumer) | 0 (not used) | ∞ | No |
| Apps Script Triggers runtime | 90 min/day (consumer) | 0 (no triggers) | ∞ | No |
| Sheets writes | (no daily cap) | ~500/week | — | No |
| Sheets cell ceiling | 10M cells | ~13k rows/yr | ~770× | No |

**Notes on the one "Watch" item:** the 30-simultaneous-execution limit is per-user and all
traffic runs as the owner account. At 250 check-ins over a 2-hour service (~2/min, each
~1-2 s) concurrency is ~0.05. The only way to approach 30 is a synchronized stampede
(e.g. "everyone open the app now") — 30+ requests in the same ~1-2 s window would throw
`Script invoked too many times per second`. Staggered real usage stays 2-3× under.

---

## 5. Cost verdict

| Scenario | Cloudflare | Apps Script | Sheets | **Total / month** |
|---|---|---|---|---|
| Regular (~700 RPCs/wk) | $0 | $0 (free w/ Google account) | $0 | **$0** |
| Maximum (~2,000 RPCs/wk) | $0 | $0 | $0 | **$0** |
| Maximum peak day (~1,180/day) | $0 (1.18% of 100k) | $0 | $0 | **$0** |

- **Cloudflare Paid ($5/mo) triggers only above 100,000 Worker requests/day** ≈ ~85× the
  worst realistic day. Not reachable at this scale.
- **Apps Script has no paid tier** — its limits are quotas, not paywalls. The only "upgrade"
  is consumer → Google Workspace (~$6-12/user/mo) to lift email (100→1,500/day), trigger
  (90 min→6 hr/day), and URL-Fetch (20k→100k/day) quotas. **None of these are consumed by
  the attendance/portal workflow** — only by communications / scheduled jobs / webhooks.
- **Sheets:** free, no daily write cap; the 10M-cell ceiling is ~770× annual volume away.

**Bottom line:** migrating the frontend to Cloudflare while keeping Apps Script + Sheets
costs **$0/month at regular AND maximum realistic usage**, with ~84× Cloudflare headroom on
the worst day. The workflow does not consume any of the daily-count quotas that would force
a Workspace upgrade. Cost is not the constraint; the only thing to monitor is the 30-
simultaneous-execution concurrency under a synchronized burst.

---

## 6. What would actually force spend (independent of this workflow)

1. **Communications** — email (100/day consumer, 1,500/day Workspace) and paid SMS. First
   forced cost; per-message or a small Workspace sub, not a re-architecture.
2. **Synchronized burst throttling** — if 30+ members hit the app in the same ~1-2 s, Apps
   Script queues/throttles; mitigated by client retry, not by paying.
3. **>100k Cloudflare Worker requests/day** — ~85× current max; would force the $5/mo plan.

---

## Sources

### Codebase (read, primary for call counts)
- `src/gas/Code.gs` — `api_loginUser` (215), `api_restoreApp` (291), `api_logoutUser` (369),
  `api_getPrograms` (436), `api_authorizedNavigate` (510), `api_submitDemoTaskForm` (594).
- `src/gas/attendance-checkin.gs` — `api_qrCheckIn` (124): LockService + 2 writes;
  `api_getScannerEvents` (395); `checkinCallerHasCapability_` (86).
- `src/gas/shell-session.js.html` — frontend RPC call sites (lines 578, 991, 1338, 1654,
  2133, 2372, 2418, 2582): section-entry = auth + section-content read.
- `CONTEXT.md` — `webapp.executeAs = USER_DEPLOYING`; sections; AuthenticatedBootstrap DTO.

### Quotas / pricing (primary, from prior report)
- `developers.cloudflare.com/workers/platform/limits` — 100k req/day, 10 ms CPU, 100 Workers.
- `developers.cloudflare.com/workers/platform/pricing` — Paid $5/mo; static assets free/unlimited.
- `developers.cloudflare.com/pages/platform/limits` — 500 builds/month.
- `developers.google.com/apps-script/guides/services/quotas` — 30 simul/user, 1000/script,
  6 min/exec; URL Fetch 20k/day, Email 100/day, Triggers 90 min/day (consumer).

## Assumptions to confirm with user
- ~10 operators (affects operator-overhead term only; check-in count is fixed at 250/wk).
- Member-portal login rate (25% regular / 100% max) — currently placeholder sections; this
  models the "other operations online" case the user asked for.
- Owner account type (consumer vs Workspace) — does not affect attendance cost (both $0);
  only affects the comms/trigger/URL-Fetch ceilings.
