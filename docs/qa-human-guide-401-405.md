# Human QA Guide — S2 Participant Stack (401→405) on Phase 391 baseline

> Stack head: `feat/405-s2-integration-gate` @ `d234b54b` → `feat/404` `be884f2f` → `feat/403` `8207ba89` → `feat/402` `51732027` → `feat/401` `cf04d951` → `feat/389-s2-05-program-detail` @ `88b96afa`
> PRs: #406, #407, #409, #410, #411 — all **Ready for review**, required remote checks green.
> No merge / auto-merge performed. This guide covers the disposable **local D1** surface only.

---

## 0) Server is already running

```
hub process:  s2-e2e            ready   pid=56924   uptime 6h+
cwd:          .worktrees/s2-401-405/web
command:      node …/wrangler dev --local --port 8787 --inspector-port 8790 --var EFCC_ACCESS_TOKEN_SECRET:s2-e2e-local-secret
url:          http://127.0.0.1:8787
logs tail:    hub logs --name s2-e2e -n 80
ps:           hub ps
restart:      hub restart --name s2-e2e
stop:         hub stop --name s2-e2e
health gate:  http://127.0.0.1:8787/api/v1/auth/me  (unauthenticated → 401 JSON)
app entry:    http://127.0.0.1:8787/
```

- Node is pinned to **v22.18.0** via fnm (`export PATH="/Users/.../fnm/node-versions/v22.18.0/installation/bin:$PATH"`).
- Fresh disposable fixtures were just reseeded at **05:14 UTC**:
  ```bash
  export PATH="/Users/noah.wong/.local/share/fnm/node-versions/v22.18.0/installation/bin:$PATH"
  cd .worktrees/s2-401-405
  pnpm db:seed:local   # → E2E_* accounts
  pnpm db:seed:demo    # → E2E_DEMO_* programs/events + demo home content + notices
  ```
- If Playwright or manual edits poison state, **rerun the two seed commands** and hard-refresh the browser. No `wrangler d1 execute` or Sheets/AppScript mutation is ever needed.

### Credentials (dev-only, disposable)

| Username | Password | Role | User ID |
|---|---|---|---|
| `E2E_member` | `E2E_member!dev` | Member (primary QA actor) | `U-E2E-MEMBER` |
| `E2E_staff` | `E2E_staff!dev` | Staff | `U-E2E-STAFF` |
| `E2E_admin` | `E2E_admin!dev` | Admin | `U-E2E-ADMIN` |
| `E2E_legacy` | `1234` → upgraded to `E2E_legacy!upgrade` | Legacy Member | `U-E2E-LEGACY` |

- Login at `http://127.0.0.1:8787/` → enter credentials → you land in the member shell.
- All 4 programs/fixtures below assume **E2E_member** unless noted.
- `E2E_DEMO_*` dataset (seed-demo): 4 programs (`E2E_DEMO_成人查經`, `E2E_DEMO_青年團契`, `E2E_DEMO_社區關懷`, `E2E_DEMO_管理安排`), 13 events on the first program, member notices (2 unread + 1 read), and demo Home content.

---

## 1) Smoke (30 sec)

1. Open `http://127.0.0.1:8787` — login as `E2E_member / E2E_member!dev`.
2. Top bar shows member identity; shell navigation is responsive.
3. Visit `/home`, `/programs`, `/notices`, `/messages`, `/profile` — each returns 200 without console errors.
4. `hub logs --name s2-e2e` should show `GET /api/v1/... 200` lines, no 500s.

---

## 2) #401 — Member self-check-in availability (`可簽到`)  `INT-AVAIL`

**Spec:** `docs/specs/401-s2-member-self-check-in-availability-acceptance-plan.md`

| ID | Manual check |
|---|---|
| **AVAIL-01** | As `E2E_member` (Active enrollment on a non-archived participant program / active event / open check-in window) → open **Programs → pick the enrolled program → Participant Program Detail** → the event summary row for the **currently check-in-open** event shows `可簽到` text. Inspect `GET /api/v1/programs/<id>/participant-detail` → response field `self_check_in_available: true` (boolean). |
| **AVAIL-02** | As non-enrolled member (or switch to a **ManagerOnly / archived / inactive-event / closed-window** program, or act as `E2E_admin` in the participant surface) → same detail load → field is `false` and **no `可簽到` label** appears; no window/secret fields leak. |
| **AVAIL-03** | After toggling enrollment or advancing the clock past the window (or reseeding) → reload detail or attempt check-in → server projection flips immediately; a stale `可簽到` never grants attendance. Attendance still depends on Event Detail / scanner authorization. |
| **AVAIL-04** | If you mock-intercept `/participant-detail` and flip the field to a string/truthy (DevTools → override) → UI still shows **not available** — strict boolean handling. |

*Pass criteria:* only strict `true` renders the label; management capability alone does not grant it; no binary/secret leak.

---

## 3) #402 — Program Detail affordances  `INT-SCH / PERM / ENR`

**Spec:** `docs/specs/402-s2-program-detail-affordances-acceptance-plan.md`

1. **Grouped schedule (SCH-01):** Open any participant program with both recurrence rules + concrete events (e.g. `E2E_DEMO_成人查經`). You see **one grouped schedule** with two headings: `時間規則` (recurrence) and `即將舉行` (upcoming concrete events), semantically distinct. Empty groups auto-hide; if both empty → a single truthful empty state.
2. **Responsive caps + resize (SCH-02):** Have >4 active future events. Test widths:
   - **< 800 px** (`320, 375, 390, 414, 799`×900) → exactly **4** rows.
   - **≥ 800 px** (`800, 1440`×900) → exactly **8** rows.
   Resize across 800 px after mount — cap flips without duplication, reorder, or hidden keyboard-only rows. Use DevTools Responsive mode. All rows stay keyboard-reachable and overflow-free.
3. **Lifecycle / availability labels (SCH-03):** Active rows use the **neutral dot** treatment (never color-only). `可簽到` appears as plain visible text only when AVAIL-01 is true.
4. **Requestable advisory (PERM-01/02):**
   - As **requestable non-enrolled** member with visible upcoming events → `加入後可查看聚會詳情` appears, **without leaking** event facts.
   - As **ManagerOnly / archived / already-authorized / no-event** → advisory absent; existing Event Detail authorization and single-sticky-action precedence untouched.
5. **Action ownership (ENR-01):** Every enrollment lifecycle state still has **one sticky action owner**, with existing offline guard, confirmation focus trap, and read-only precedence. There is **no timeline / "View All"** route.

---

## 4) #403 — Programs catalog: recovery + long-copy  `INT-PROG-ERR / WRAP`

**Spec:** `docs/specs/403-s2-programs-recovery-long-copy-acceptance-plan.md`

| ID | Manual check |
|---|---|
| **ERR-01 (403 forbidden)** | Intercept `GET /api/v1/programs/access` (or catalog fetch) → return **403**. The participant Programs boundary shows **distinct forbidden copy** with a single escape `返回首頁` targeting **`/home`** only. **No Retry** button, no arbitrary `returnTo` redirect. Clicking escapes to `/home`. |
| **ERR-02 (recoverable 5xx / offline)** | Return **500 / network failure** instead, optionally with `?q=查經` active. The boundary shows **recoverable copy + `重試` (Retry)**. Clicking Retry **reloads without clearing** your query/filter. Query state is preserved. Focus stays on the boundary control and is keyboard-visible. |
| **WRAP-01** | With long CJK titles (`超長課程名稱…`) and unbroken Latin/URL slabs (`https://example.invalid/programs/this-is-a-deliberately-unbroken-value`) on **Home cards and Programs directory rows** → render at all seven widths → text **wraps**, no horizontal scroll/clip, chevron not displaced, search/filter inputs not broken. |
| **EMPTY-01** | True-empty catalog (no programs) vs filtered-empty (`q` matches nothing) → copy is **semantically distinct**; existing **Clear filters** action clears `q`/filter accurately. |
| **FOCUS-01** | While in ERR-01 or ERR-02, Tab through and activate Retry/escape — focus ring is visible and logical. |

---

## 5) #404 — Home long-copy hardening  `INT-HOME-WRAP`

**Spec:** `docs/specs/404-s2-home-long-copy-acceptance-plan.md`

Pre-condition: `pnpm db:seed:local && pnpm db:seed:demo` populated the long-copy fixtures (long event title `超長…門徒訓練與社區同行計劃`, long URL summary, Explore long description).

| ID | Manual check |
|---|---|
| **WRAP-01** | Home **enrolled Event card** with long CJK title + long program/location/time → card text wraps inside card, **event icon + primary action (`查看詳情` / `查看聚會詳情`) stay visible**, no `shell-content` overflow. |
| **WRAP-02** | **Announcement** (long title + URL-like summary) and **Explore** program (long name+description) → full values wrap, **chevrons remain inside cards**, no truncation/clamp. |
| **WRAP-03** | Open **announcement detail** (click announcement card with long title/summary/venue) → detail copy wraps, no horizontal scroll, **Back** and external link controls are not displaced. |
| **RESP-01** | With populated long values, test **all seven geometries** in DevTools: `320×812, 375×844, 390×844, 414×844, 799×900, 800×900, 1440×900`. For each: `scrollWidth ≤ clientWidth` on `#shell-content` and every card/text outlet; controls have usable bounds and keyboard focus. |
| **STATE-01** | Force each Home projection state: **loading** (throttle network), **empty**, **error** → skeleton / empty / Retry remain **distinct**; no timer hint or placeholder fake content. |

---

## 6) #405 — Integration gate cross-checks (69/69 promoted gate)

**Spec:** `docs/specs/405-s2-participant-integration-gate-acceptance-plan.md`
**Promoted Playwright grep (local):** `PUI-01 Programs boundary | PUI-02 participant Programs directory | PUI-03 participant Program detail | PUI-04 participant Enrollment lifecycle | PUI-05 participant Event Detail | PUI-05 Home origin supplement` — **23/23 × 3 viewports = 69/69**.

Quick human pass:

1. **Origin-aware navigation** — from **Home / Notices / Messages → Program → Event Detail → Back** → returns to the **origin**, not always to Programs.
2. **Schedule/advisory/action + enrollment lifecycle** — see §3 checks; plus try enroll → pending → approved → withdraw across the same detail surface.
3. **Recovery + wrapping** — see §4 ERR-01/ERR-02 + WRAP checks; verify at 320 and 1440 widths.
4. **Home wrapping + skeleton** — see §5 checks; verify announcement detail overflow/focus.

Non-promoted: a full `programs-d1.test.ts` phone-320 stress run is intentionally **62/66** due to 4 unrelated stateful management/permissions assertions outside the promoted gate — ignore for human QA, re-run the promoted grep if in doubt:

```bash
export PATH="/Users/noah.wong/.local/share/fnm/node-versions/v22.18.0/installation/bin:$PATH"
pnpm exec playwright test --config=tests/e2e/programs-d1.config.ts \
  --grep 'PUI-01 Programs boundary|PUI-02 participant Programs directory|PUI-03 participant Program detail|PUI-04 participant Enrollment lifecycle|PUI-05 participant Event Detail|PUI-05 Home origin supplement' \
  --project=phone-320 --project=phone-390 --project=desktop
```

---

## 7) Responsive reference (copy-paste widths)

Use DevTools → Toggle device toolbar → Responsive → enter exact sizes:

```
320×812   iPhone SE-narrow    phone-320
375×844   iPhone / base       -
390×844   iPhone              phone-390
414×844   iPhone Pro Max      -
799×900   just-below 800px breakpoint
800×900   breakpoint
1440×900  desktop
```

Each width must keep `scrollWidth ≤ clientWidth` and controls ≥ 44×44 px.

---

## 8) Reset / troubleshoot

| Symptom | Fix |
|---|---|
| Stale enrollment / missing events | `pnpm db:seed:local && pnpm db:seed:demo` then hard refresh |
| Wrangler shows 500 on first load after reseed | Wait for `⎔ Local server updated and ready` in `hub logs --name s2-e2e` |
| Auth weirdness after switching accounts | Clear site data for `127.0.0.1:8787` or open an incognito window |
| Port 8787 busy | `lsof -i :8787` → kill or `hub restart --name s2-e2e` |
| Need to prove typecheck/unit quickly | `pnpm typecheck` / `pnpm test:components` / `pnpm test --run` (from `.worktrees/s2-401-405`) |

---

## 9) What NOT to QA here

- Deployed Cloudflare / remote D1 — manual smoke is intentionally skipped.
- Apps Script / Google Sheets / `/exec` — never mutated by local QA; `Users` tab stays immutable.
- Badge-color drift (ADR-0033 pre-existing) — accepted, not in scope.

Happy QA — when you hit a failure, note the **width + account + program ID + response JSON** and the fix belongs to the lowest responsible stack layer (#401–#404), not the #405 trace.

---

## 10) S2 Full Harden Pass (PRs #413, #418, #419, #420, #421)

This upper stack layer was audited across all 6 S2 participant screens using Impeccable's `harden` and `adapt` dimensions (loading, empty, error, offline, permissions, double-submission, edge-case copy, focus restore, deep-link sanitization) and implemented on stacked branches:

| PR | Issue | Scope | Key QA Checks |
|---|---|---|---|
| **#413** | #412 | Program Detail enrollment bar | `.stickyActionBar` is `position: static` -- renders inline in normal flow after schedule/advisory copy, zero overlap with status/hint text at 320/375/390/414px. |
| **#418** | #414 | Home hardening | 1) Force `/api/v1/home` 401: no catalog fallback burst, single error shows. 2) Open announcement card: phone hardware/gesture back closes overlay and stays on `/home` (doesn't exit). 3) Next-event with no date/time/location: no empty 40px `.eventDetails` gap. 4) Greeting `<time>` has ISO `dateTime`. |
| **#419** | #415 | Notices hardening | 1) Mark-all-read with network cut: visible red `role="alert"` appears (not silent re-enable). 2) Offline pre-flight guard blocks dispatch immediately. 3) Malformed `created_at` doesn't crash with `RangeError`. 4) Focus lands on container after load/retry transition. 5) Toolbar wraps gracefully at 320px with large unread count. |
| **#420** | #416 | Messages hardening | 1) In-app back after opening detail: native browser back button exits Messages cleanly (no duplicate history entry / stuck press). 2) Error state includes `教會消息` header. 3) `load()` has `requestVersion` guard against slow/retry races. |
| **#421** | #417 | Programs cluster hardening | 1) Double-click program card rapidly: exactly one history entry pushed (one back press returns to catalog). 2) Enrollment action error: focus moves to the alert output (doesn't drop to body). 3) Program description/title: long unbroken tokens wrap (`overflow-wrap: anywhere`). 4) Stale confirm dialog: reconciles via `onRefresh()` instead of silent no-op. 5) Event Detail: renders accessible `aria-busy` loading indicator on initial mount and retries (no blank flash). 6) Event Detail recovery/404: focus moves to recovery heading. |

### Complete PR Stack Reference (Bottom to Top)

```
[base: 88b96afa on feat/389]
  ↑
#406: feat/401-self-check-in-availability (self_check_in_available projection, 可簽到)
  ↑
#407: feat/402-program-detail-affordances (grouped schedule, 4/8 row caps, advisory)
  ↑
#409: feat/403-programs-recovery (403->/home, 5xx->retry, long-copy wrap, empty bifurcated)
  ↑
#410: feat/404-home-long-copy (7-width Home long-copy wrapping, skeleton/empty/error tri-state)
  ↑
#411: feat/405-s2-integration-gate (verification-only gate record, 69/69 promoted Playwright)
  ↑
#413: feat/412-enrollment-bar-static (enrollment bar static position, no overlap)
  ↑
#418: feat/414-home-hardening (401 fast-fail, overlay back-nav, empty wrapper guard)
  ↑
#419: feat/415-notices-hardening (visible mark-all error, offline guard, safe date parse)
  ↑
#420: feat/416-messages-hardening (back-button history deduplication, error header)
  ↑
#421: feat/417-programs-cluster-hardening (double-nav guard, focus restore, ED loading skeleton)
```
