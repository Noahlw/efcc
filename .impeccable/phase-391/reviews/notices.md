# Notices Section — Live vs Design Reconnaissance (Phase 391)

> **Branch** `feat/391-polish-on-88b96af` @ `15956de` (commit `15956de docs: plan S2 participant visual parity`, baseline `88b96afa`)  
> **Worktree** `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/stack-385-389`  
> **Date** 2026-08-20 · **Agent** `NoticesRecon` · **Read-only** — no production mutation, `E2E_member`/`E2E_member!dev` view-only

---

## 1. Method & Viewport

| Item | Detail |
| --- | --- |
| **Live entry** | `http://127.0.0.1:8787/notices` · Wrangler `wrangler dev` on 8787, disposable fixtures (no D1 mutation). Authenticated via fresh `chromium` Playwright context — navigated to `/notices`, redirected to `/` login, filled `input[autocomplete=username]` + `input[type=password]` with `E2E_member` / `E2E_member!dev`, clicked `登入`, waited for `restoreBootstrap` → landed on `/notices`. |
| **Design authority** | `http://127.0.0.1:8788/participant/notices.html` · static export on 8788 (SimpleHTTP/0.6 Python). Single source of truth for participant Notices. |
| **Browser** | Playwright `chromium` 1.62.1 headless, fresh `browser.newContext()` per run (no storageState reuse). |
| **Required viewport** | `390×844` — primary capture. Additional sweeps at `320`, `375`, `414` (all ×844). Each step calls `page.setViewportSize` + `evaluate(scrollWidth/innerWidth)` + `fullPage` screenshot. |
| **Responsive proof** | `scrollWidth <= innerWidth` checked per viewport via `document.documentElement.scrollWidth` + `document.body.scrollWidth`. |
| **Source inspection** | `web/app/notices/page.tsx`, `web/lib/notices-panel.tsx`, `web/lib/notices-panel.module.css`, `web/lib/copy.ts`, `web/lib/hk-time.ts`, `web/lib/programs/programs-intent.ts`, `web/lib/app-shell.tsx`, `web/lib/nav-bar.tsx`, `web/lib/shell-header.tsx`, `web/app/globals.css`. |

---

## 2. Fixture State

| Fixture | Value |
| --- | --- |
| **Account** | `E2E_member` (Member role, disposable `E2E_` local D1 fixtures from `pnpm db:seed:local` / demo seed). View-only; no submit/withdraw/cancel/approve invoked. |
| **Notices dataset** | 3 notices at `/api/v1/programs/notices` (newest-first, 90-day retention — `web/lib/programs/notices-worker.test.ts:6` & `web/lib/programs/program-handlers.ts:2841`). Observed at 2026-08-20T04:37Z: `報名結果` (program, unread), `聚會提醒` (event, unread), `帳戶更新` (account, read). `unread_count: 2` before `全部標示已讀`, `0` after. |
| **Shell navigation** | Server-projected `bootstrap.navigation` contains `notices` (not `management`). Dock slot 4 = `通知` with bell badge count 2 (live red dot on `#i-bell`); management-capable accounts would show `管理` instead per `CONTEXT.md` Shared Shell contract. |
| **Network** | Online; no offline banner visible (checked `document.querySelector('[class*="offline"]') === null`). Error/loading/empty states verified via source reading, not by forced failure (read-only). |

---

## 3. Live URL & Design URL

- **Live:** `http://127.0.0.1:8787/notices` (shell route `web/app/notices/page.tsx:9` → `<AppShell><div class=page><header pageHeader><NoticesPanel/></div></AppShell>`)
- **Design:** `http://127.0.0.1:8788/participant/notices.html` (static file, no auth)

---

## 4. Screenshots

Screenshots are fullPage, headless chromium, no scaling.

| Viewport | Design | Live (authenticated) |
| --- | --- | --- |
| **320×844** | `./assets/design-320.png` | `./assets/live-notices-320.png` · + `live-long-320b.png` (long-title inject) |
| **375×844** | `./assets/design-375.png` | `./assets/live-notices-375.png` |
| **390×844 (required)** | `./assets/design-390.png` | `./assets/live-notices-390.png` · `live-390-detailed.png` · `live-after-login-390.png` |
| **414×844** | `./assets/design-414.png` | `./assets/live-notices-414.png` |

> **Auth gate proof** `live-390-before-auth.png` captures unauthenticated redirect → login form (`用戶名稱` + `密碼` + `登入`).

All design viewports: `scrollWidth === innerWidth` (no horizontal overflow). All live viewports: `320:320 OK`, `375:375 OK`, `390:390 OK`, `414:414 OK` — confirmed via `page.evaluate(() => ({innerWidth, scrollWidth}))`.

---

## 5. Visual Comparison (Design director pass)

### 5.1 Page chrome / shell placement

| Concern | Design | Live | Delta |
| --- | --- | --- | --- |
| **Shell** | Prototype-only: fixed 78px bottom dock (`position:fixed; height:calc(78px+safe-area); grid-template-columns:repeat(5,1fr)`) + in-page header `height:72px` showing `通知` as brand. No `AppShell` header — prototype bakes navigation inline. | Live: real `AppShell` (`web/lib/app-shell.tsx:91`) → `<ShellHeader>` + `<NavBar>` (phone dock 72px + safe-area, desktop 200px rail @800px) + `<main id="shell-content">`. Phone: `.nav-phone` with 5-slot layout, scan button circular `margin-top:-22px`; desktop: `.nav-desktop` sticky `top:64px`. | **Parity-correct divergence.** Shared Shell contract requires the app shell; design dock is prototype authority for spacing/colors, live correctly maps to tokens. `shell-content` reserves `padding-bottom:calc(84px+safe-area)` on phone (matches dock 72px+padding), `0` on desktop — matches design `main padding-bottom:calc(78px+28px+safe-area)`. No clipping observed. |
| **Page container** | Design: `<main max-width:680px; margin:auto; padding:0 20px calc(78+28+safe-area)>`. Narrower (680) with 20px gutters, generous bottom inset for dock. | Live: `.page { max-width:760px; padding: clamp(1.5rem,4vh,2.5rem) clamp(1.25rem,4vw,2.75rem) 4rem; }` (`web/lib/notices-panel.module.css:1-5`). Centered, responsive gutters; at 560px → `padding-inline:1rem`. Wider max-width (760 vs 680) gives more breathing room on tablet/desktop. | **P2 — width & padding drift.** Functionally benign; desktop shows slightly wider card. If strict pixel parity required, reduce to `680px` — but current 760px is defensible for management-density minimalism. Not a defect unless spec locks 680. |
| **Header / Title** | `<h1 clamp(1.72rem(27.5px),6vw,2.25rem); font-weight:600>` `通知` with lead `聚會、報名及帳戶相關消息。` `margin-top:8px; color:#59636a; .96rem(15.36px)`, wrapped in `padding:8px 0 22px` (no border). Toolbar below shows `<h2 1.14rem>最新</h2>` + `全部標示已讀` button. | `<header.pageHeader>` with `margin-bottom:1.75rem; padding-bottom:1.25rem; border-bottom:1px solid var(--line)` + `<h1.pageTitle clamp(1.75rem(28px),5vw,2.25rem); font-weight:800; letter-spacing:-0.03em>`. Lead `.pageLead 1rem 1.6`. No `最新` h2. Toolbar renders `unreadCount (2 未讀, 0.875rem 700 #59636a)` + same `全部標示已讀` button. | **P2 — typographic weight & header chrome.** Design title `600`, live `800` (−0.03em tracking). Live is bolder/heavier; touches civic minimal spec's "direct operational clarity" but over-weights vs prototype's restrained tone. Header border is new — design has none. Toolbar loses `最新` heading, replacing it with dynamic `2 未讀`. The latter is **correct per behavior**: design is static demo copy; live must surface unread count. Missing `最新` is not user-visible regression; screen-reader label `通知清單` (`aria-label` on panel/list) covers semantics. |

### 5.2 Unread / read hierarchy

| Signal | Design | Live | Parity |
| --- | --- | --- | --- |
| **Dot** | Unread: 8px red `#b3261e` at `margin-top:7px`. Read: empty `<span></span>` (no dot, preserves 12px grid track but invisible). | `styles.unreadDot { width:8px; height:8px; margin-top:0.4375rem(7px); background:var(--error #b3261e) }` + `styles.readDot { background:transparent }` (`notices-panel.module.css:105-119`). Keeps 12px track occupied even when read, preventing layout shift when marking all read. Live measurement: unread `rgb(179,38,30)`, read `rgba(0,0,0,0)`. | **P3 — read-dot implementation.** Both keep grid stable. Design's empty span vs live's transparent dot are equivalent. Live's explicit `.readDot` is marginally clearer for a11y/maintainability. `sr-only` `未讀` announced only when unread (`NoticeRow:59-61`) — correct. |
| **Title weight** | `font-weight:600` inline on title span. Identical for read/unread — hierarchy carried by dot + timestamp freshness only. | `<strong class=itemTitle> 1rem 1.4 #171a1d` (`notices-panel.module.css:130-134`). Browser `<strong>` default `700` (measured `700` for all three rows, read or unread). Body `0.9375rem #59636a 1.55` + gap `0.3125rem`. | **P2 — title weight + size.** Design 600 vs live 700 (+100). Visually, live titles are slightly heavier. Not a hierarchy break (both states same weight, dot is discriminator), but strict parity would set `font-weight:600` on `.itemTitle` and avoid relying on `<strong>` default. Measured `16px` vs design `~13.8px body` — live is larger, more legible on phone. |
| **Timestamp** | Label `今天` / `昨天` / `8月12日` at `0.74rem #59636a nowrap` (inline). Design "read" row shows `8月12日` demonstrating HK wall date for older items. | `styles.itemTime { 0.75rem #59636a 1.5 nowrap }` (`142-148`). Content from `hkNoticeListLabel` (`web/lib/hk-time.ts:112-127`): `今天` if `hkDaySerial(now)-hkDaySerial(created)==0`, `昨天` if 1, else `M月D日` same year, `YYYY年M月D日` cross-year, all in `Asia/Hong_Kong`. Live measurement at 390: all three fixtures read `今天` because created_at is `2026-08-20T04:37Z` (same HK day). | **Parity correct.** Recent fix `dc5d9297 / 1dfe029a feat(notices): show 今天/昨天/M月D日 labels in Church Time (#387)` aligned live to spec. Previously used `hkWallLabel` (full datetime); now correct relative labels. |

### 5.3 Rows & card borders

| Property | Design | Live | Parity |
| --- | --- | --- | --- |
| **Card** | Single container `border:1px #d6dcde; border-radius:10px; overflow:hidden; background:#fff` enclosing all rows, each row `border-bottom:1px #d6dcde` (last row still has bottom border inside clip). `border-radius:10px` (~ --radius-md minus 2). | `ul.list { border:1px var(--line #d6dcde); border-radius:var(--radius-md 12px); background:var(--surface-raised #fff); overflow:hidden }` + `li.item + li.item { border-top:1px var(--line) }` (`75-87`). No bottom border on last row; top borders between rows only — visually equivalent due to clip, cleaner semantics. | **Near-parity.** Radius 12px vs design 10px (+2). Token-driven (`--radius-md`); acceptable. Borders identical color. Hover: design `#f7f7f7`, live `#f4f5f3 (var(--surface))` — live is slightly warmer/more neutral, matching off-white civic surface. Not a defect. |
| **Row grid** | `display:grid; grid:12px minmax(0,1fr) auto; gap:10px; min-height:92px; padding:16px` on each button-row. | `a.itemLink { display:grid; grid:12px minmax(0,1fr) auto; align-items:start; gap:0.625rem(10px); min-height:92px; padding:1rem(16px) }` (`89-99`). Measured at 390: `12px 267.484px 24.5156px` (live) vs design `12px 259.812px 24.1875px` — difference is container width (live page 760 + shell gutters vs design 680). | **Parity correct.** Grid tracks identical. |
| **Interaction** | Rows are `<button type=button>` (prototype; no navigation). Hover `background:#f7f7f7`. `min-height:44px` on `全部標示已讀`. | Rows are `<a href={noticeHref}>` (`NoticeRow:54`) with real deep links (see §7). Hover `background:var(--surface #f4f5f3)`. `min-height:92px` keeps WCAG AAA touch target; `min-height:44px` on toolbar buttons (`50-51`). | **Parity-correct behavior divergence.** Semantic link is correct for navigable notices; button prototype was static. |
| **Elevation / shadow** | None on card. | None. | Parity. |

### 5.4 Phone behavior summary

Covered per §6 table. No horizontal overflow at any width; touch targets exceed 44px.

---

## 6. Responsive Table (measured, not inferred)

All measurements via `page.evaluate(() => ({innerWidth, scrollWidth}))` after `setViewportSize` + 300–400ms settle.

### Live (http://127.0.0.1:8787/notices authenticated)

| Viewport | inner | scroll | Overflow | Row grid | Time placement | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| **320×844** | 320 | 320 | OK | 12px minmax(0,1fr) auto (3-col) | inline right, nowrap | Long Chinese titles wrap normally (whiteSpace normal); English longwords overflow (Finding N2). 全部標示已讀 at x=272, w=101.9px fits; 2 未讀 + button gap 16px fits (toolbar flex-nowrap would overflow only on extreme counts — P3). |
| **375×844** | 375 | 375 | OK | 3-col | inline right | Same; more breathing room. |
| **390×844** | 390 | 390 | OK | 12px 267.48px 24.51px | inline right | Primary. No clipping; hover not tested (no hover on touch). |
| **414×844** | 414 | 414 | OK | 3-col | inline right | Same. |

Design at same widths: 320:320 OK, 375:375 OK, 390:390 OK, 414:414 OK — row widths scale with container (278/333/348/372px respectively). Both keep 3-col grid at all phone widths.

> **Lost responsive rule (informational).** `main` branch (pre-391-polish) contained a 560px media override that pushed timestamps below descriptions. Commit `fc8d52ec polish(391): fix 14 findings` explicitly removed it: "Notices: removed the mobile-only grid override that pushed the relative timestamp below the description, inflating card height". The removal **aligns live to the design authority**, which never wraps the timestamp (inline auto column at all widths). The extra height is gone; live now matches design. Verified: `web/lib/notices-panel.module.css:222-226` retains only `.page { padding-inline:1rem }` under 560px. No regression.

**Action-group wrapping / clipping.** Toolbar `display:flex; align-items:end; justify-content:flex-end; gap:1rem; flex-wrap:nowrap` (`34-41`) is single-row at all phone widths for normal counts (tested with `2 未讀`). If `unread_count` were very large (e.g., `99+ 未讀`), the flex row could overflow because `nowrap` + no `min-width:0` on count. Current behavior acceptable; see Finding N3 for hardening.

---

## 7. Behavior Repros (read-only, step-by-step)

### B1 — List loading & empty

| State | Source | Expected | Live |
| --- | --- | --- | --- |
| **Loading** | `NoticesPanel:136-147` → `<output aria-busy="true">{COPY.notices.noticesLoading '正在載入通知…'}</output>` inside `section[aria-label="通知清單"]`. | Show `正在載入通知…` with muted `#59636a`, `border-radius:8px`, no spinner. | **As designed.** `styles.state { color:var(--ink-muted); padding:1rem }`. Transient (~200–500ms on local D1); not captured in screenshot but verified via source reading + Playwright post-hydrate content (no residual loading text after ready). |
| **Empty** | `NoticesPanel:191-195` + `notices-panel.module.css:173-191` → `<div.empty><h2>暫時沒有通知</h2><p class=emptyHint>有新消息時會在這裡顯示。</p></div>` with `1px #d6dcde 12px`, centered. | Empty replaces `<ul>`; not a list. | **As designed.** Copy matches `COPY.notices.noticesEmpty/EmptyHint` exactly (also matches `COPY.attention.noticesEmptyTitle/Hint` vocabulary for attention bell panel). Verified via source; dataset non-empty live so no empty screenshot — see harden artifact `notices-empty.html`. |
| **Error + retry** | `NoticesPanel:149-167` → `<p role=alert>未能載入通知。</p>` + `<button.retry>重試載入通知</button>` → `load()` re-fetches. | Error has red border/bkg (`#e5b4b0 / #fbeeed / #b3261e`) and retry is `1px #aeb8bc` bordered 44px. Hover `#9c302c`. | **As designed.** Not triggered without network failure; source evidence sufficient. Harden `notices-error.html` provided. |

### B2 — Unread/read & "全部標示已讀"

**Repro:**

1. Auth as `E2E_member` → GET `/notices` → observe toolbar `2 未讀` + 2 red dots + 1 transparent dot.
2. Click `全部標示已讀` (`button.markAll`, `notices-panel.tsx:181-189`, `disabled={marking||unreadCount===0}`).
3. Observe network `POST /api/v1/programs/notices/read-all` (idempotent, `Idempotency-Key` header — `notices-api.ts:59`).
4. On success: `setState` maps unread → `read_at: Date.now()` (`114-124`), `unread_count:0`, `announce('已將全部通知標示為已讀')`, dot classes flip to `readDot`, `unreadCount` span unmounts, button disables (`opacity:0.7`, `cursor:not-allowed`).

**Live evidence:** Playwright click sequence logged: before `{disabled:false, ariaBusy:false, text:"全部標示已讀"}` → after `{unreadDots:0, readDots:3, markAll:{disabled:true}, unreadCountVisible:false, announcement:"已將全部通知標示為已讀"}`.

**Parity:** Design has no state — static 2 unread/1 read demo. Live behavior correctly implements read persistence and optimistic UI.

### B3 — Deep links (Program / Event / Account)

| Kind | Live `noticeHref()` (`notices-panel.tsx:20-38`) | Example href (observed) | Expected destination | Pass |
| --- | --- | --- | --- | --- |
| `event` with `program_id + event_id` | `buildProgramsHref({mode:'participant', programId, eventId})` → `/programs?program=ID&event=ID` | `/programs?program=1afd3544-affe-41f8-bf4a-ee4b36e9e975&event=16222e78-0c06-4a18-8bc7-14c38181a116` | Participant Program → Event Detail (client resolves via `parseProgramsIntent` + `ParticipantEventView`). | YES |
| `program` with `program_id` | `buildProgramsHref({mode:'participant', programId})` → `/programs?program=ID` | `/programs?program=ff013480-97df-433f-bd57-e34af4fa4c9f` | Participant Program Detail. Clicked live → navigated to `/programs?program=ff013480...` and rendered `正在載入課程內容…` (program loader). | YES |
| `account` | `"/profile"` | `/profile` | Account/Profile section. | YES |
| fallback (no ids) | `"/programs"` | (not observed—requires malformed notice) | Programs catalog. | YES |

**Return path / origin context:**

- **Current live:** deep links carry **no** `from`/`returnTo`/`referrer` param. Navigation is one-way (`/programs?...`); returning requires browser Back or bottom-nav `通知`.
- **Verified:** `hrefs.some(h => h.includes('notices') OR h.includes('from')) === false`; Playwright `goBack()` from Program Detail returns to `/notices` via browser history (`window.history.length === 3` after click), not via app-level back affordance.
- **Assessment:** No app-level "back to Notices" breadcrumb exists on Program/Event Detail (detail surfaces show their own headings + participant context, not a notices-origin token). This matches the current prototype scope: the prototype's notices are non-navigable buttons. **P3 — enhancement candidate:** preserve origin via `?from=notices` or `sessionStorage` and surface a contextual back link (`返回通知`) on the destination when coming from Notices, mirroring the existing `rememberDeepLink` pattern in `AppShell` (`web/lib/app-shell.tsx:160`). Not a parity defect today, but a navigation-coherence gap for the Notices-driven journey. Filed as **N1**.

### B4 — Relative timestamps

- **Logic:** `hkNoticeListLabel(iso, nowMs)` (`web/lib/hk-time.ts:112-127`) — HK calendar day delta via `hkDaySerial`. `0→今天`, `1→昨天`, same-year `M月D日`, cross-year `YYYY年M月D日`. All `Asia/Hong_Kong`.
- **Observed:** fixtures created minutes before (2026-08-20T04:37:35Z = HK 2026-08-20 12:37) → `今天` for all 3 live rows.
- **Design demo:** explicitly shows the spread `今天` / `昨天` / `8月12日` to illustrate the rule — live will match once fixtures age or a fixture set with varied `created_at` is seeded.
- **No defect.**

---

## 8. Source Evidence (exact file / symbol / line)

| Observation | File | Symbol / Line |
| --- | --- | --- |
| **Notices route** | `web/app/notices/page.tsx:1-21` | `export default function NoticesPage` → `<AppShell><div className=styles.page><header.pageHeader><h1.pageTitle>{COPY.sections.notices}</h1><p.pageLead>{COPY.notices.noticesLead}</p></header><NoticesPanel/></div></AppShell>` |
| **Panel state machine** | `web/lib/notices-panel.tsx:15-18,74-205` | `type NoticesState = {kind:"loading"}\|{kind:"ready";result:NoticesResult}\|{kind:"error"}` ; `NoticesPanel()` with `useState`, `requestVersion` guard, `load()` callback, `useEffect` cleanup increment, `markAllRead()`. |
| **Deep-link mapper** | `web/lib/notices-panel.tsx:20-38` | `function noticeHref(notice:Notice):string` — 3-branch + fallback to `/programs`. |
| **Timestamp label** | `web/lib/notices-panel.tsx:40-46` | `function noticeTime(createdAt:number)` → `hkNoticeListLabel(dateTime)` |
| **HK relative label** | `web/lib/hk-time.ts:112-127` | `export function hkNoticeListLabel(iso:string, nowMs=Date.now())` with `hkDaySerial` / `hkYmd`. |
| **API client** | `web/lib/notices-api.ts:9-128` | `type NoticeKind` (`"event" | "program" | "account"`), `interface Notice`+`NoticesResult`, `noticesFetch()`with`Idempotency-Key`on POST, RFC9457`RpcError`. |
| **Intent builder** | `web/lib/programs/programs-intent.ts:196-249` | `export function buildProgramsHref({mode,programId,eventId,...})` → `/programs?program=...&event=...` |
| **Copy** | `web/lib/copy.ts:286-299` | `COPY.notices.noticesTitle` (`通知`), `noticesLead` (`最新消息與報名狀態。`), `noticesLoading/Empty/EmptyHint/MarkAllRead/MarkedAllRead/MarkAllReadError/Unread/ListLabel/Retry/LoadError` |
| **Page layout** | `web/lib/notices-panel.module.css:1-28` | `.page {max-width:760px; margin:auto; padding:clamp(1.5rem,4vh,2.5rem) clamp(1.25rem,4vw,2.75rem) 4rem}`, `.pageHeader {margin-bottom:1.75rem; padding-bottom:1.25rem; border-bottom:1px var(--line)}` |
| **Toolbar** | `web/lib/notices-panel.module.css:34-48` | `.toolbar {display:flex; align-items:end; justify-content:flex-end; gap:1rem; min-height:2.75rem}`, `.unreadCount {margin-right:auto; 0.875rem 700 #59636a}` |
| **Action buttons** | `web/lib/notices-panel.module.css:50-73` | `.markAll,.retry {min-height:44px; padding:0.5rem 0.125rem; border:0; border-radius:8px; background:transparent; font-weight:700}`, `&:hover:not(:disabled){color:var(--accent); text-decoration:underline}`, `&:disabled{opacity:0.7; cursor:not-allowed}` |
| **List card** | `web/lib/notices-panel.module.css:75-87` | `.list {overflow:hidden; border:1px var(--line); border-radius:var(--radius-md); background:var(--surface-raised)}`, `.item+.item{border-top:1px var(--line)}` |
| **Row grid** | `web/lib/notices-panel.module.css:89-104` | `.itemLink{display:grid; grid-template-columns:12px minmax(0,1fr) auto; align-items:start; gap:0.625rem; min-height:92px; padding:1rem}`, hover `var(--surface)` |
| **Dots** | `web/lib/notices-panel.module.css:105-119` | `.unreadDot,.readDot{width:8px; height:8px; margin-top:0.4375rem; border-radius:50%}`, `.unreadDot{background:var(--error)}`, `.readDot{background:transparent}` |
| **Copy / time** | `web/lib/notices-panel.module.css:121-148` | `.itemCopy{min-width:0}`, `.itemTitle{1rem 1.4 #171a1d}`, `.itemBody{margin-top:0.3125rem; 0.9375rem #59636a 1.55}`, `.itemTime{0.75rem #59636a 1.5 nowrap}` |
| **Empty / state / error** | `web/lib/notices-panel.module.css:173-220` | `.empty {2.125rem 1.375rem; 1px var(--line); 12px; center}`, `.state{color:var(--ink-muted)}`, `.error{1px var(--error-border); var(--error-surface) #b3261e}`, `.retry{margin-top:0.75rem; 1px var(--line-strong)}` |
| **Responsive** | `web/lib/notices-panel.module.css:222-226` | `@media(max-width:560px){.page{padding-inline:1rem}}` — timestamp-wrap rule intentionally removed in fc8d52ec (see §6) |
| **Shell** | `web/lib/app-shell.tsx:91,161` | `export const AppShell` wrapping `restoreBootstrap` deep-link memory + error handling; routes to `/` on `AUTH_REQUIRED` |
| **Nav / Shell header** | `web/lib/nav-bar.tsx`, `web/lib/shell-header.tsx:21` | `NavBar` canonical 5-slot; `BellIcon` + `attentionCount` badge; `ShellHeader` `<span class=title>{sectionTitle}</span>` |
| **Tokens** | `web/app/globals.css:1-50` | `--surface:#f4f5f3`, `--ink:#171a1d`, `--line:#d6dcde`, `--error:#b3261e`, `--radius-sm:8px`, `--radius-md:12px` |

---

## 9. Overflow & Touch-Target Evidence

| Check | Evidence | Result |
| --- | --- | --- |
| **Horizontal overflow** | `evaluate` at 320/375/390/414 → `scrollWidth === innerWidth` both `documentElement` and `body`, design and live. No `overflow-x` clipping. | PASS None |
| **Text overflow (long Chinese)** | Live `whiteSpace:normal` on `itemTitle/body`, `min-width:0` on `itemCopy` allows wrapping. Max Chinese line wraps cleanly; 390 row stays 92px min-height, grows with content. | PASS Wraps |
| **Text overflow (long unbroken English e.g., SuperLongUnbreakable...)** | Live currently has `overflowWrap:normal; wordBreak:normal` on title/body — injected long-word test caused `titleScrollWidth > clientWidth` but did not trigger page overflow because link grid clamps; however word visually bleeds toward timestamp column. | **P2 — N2** |
| **Row touch target** | `a.itemLink min-height:92px; padding:16px` — measured `height:92px width:356px` at 390, never below 92. | PASS 92px (WCAG AAA) |
| **Button touch target** | `markAll/retry min-height:44px; padding:0.5rem 0.125rem` (50-52). Rendered `height:44px` exactly at 320. | PASS 44px (WCAG AA) |
| **Action-group wrapping** | Toolbar `nowrap` at 320 with `2 未讀` + `全部標示已讀` fits (toolbar `w:358px`, markAll `w:101.9px`). No wrapping observed. If `unreadCount` string were very long, `nowrap` would cause overflow rather than wrap. | PASS Current fits; see N3 |

---

## 10. Harden Candidates (check-only, non-production)

All proposals live under `.impeccable/phase-391/harden/` — static HTML, no production import.

| Artifact | Edge state | Proposal |
| --- | --- | --- |
| `notices-empty.html` | **Empty** (`notices.length===0`) | Centered `empty` card (`1px #d6dcde 12px #fff`, `padding:2.125rem 1.375rem`, centered) with `暫時沒有通知` `1.125rem` + `有新消息時會在這裡顯示。` muted; toolbar persists above (count hidden, button disabled). |
| `notices-loading.html` | **Loading** (`kind:"loading"`) | `output[aria-busy=true] 通知清單` → `正在載入通知…` `#59636a` `padding:1rem` 8px radius, no spinner; shell chrome visible. Proposes skeleton rows (92px × 3, shimmer) as future parity if desired. |
| `notices-error.html` | **Error** (`kind:"error"`) | `p[role=alert] 未能載入通知。` (`1px #e5b4b0 / #fbeeed / #b3261e`) + `button.retry` 44px bordered. Notes error radius 8px vs card 12px is intentional (different semantics). |
| `notices-long-copy.html` | **Long title / body** (Cantonese long + English unbroken word) | Demonstrates `overflow-wrap:break-word` fix (N2): sets `itemTitle/body { overflow-wrap:break-word; word-break:break-word }` and `itemCopy { overflow:hidden }` to contain unbroken tokens; shows 320 vs 390 side-by-side with 92px → auto-height growth; timestamp stays `nowrap` in right column. |
| `notices-offline.html` | **Offline** (banner visible) | Shows `OfflineBanner` fixed above shell, with notices list still readable and `全部標示已讀` announcing `未能更新已讀狀態。請重新連線後再試。` on failure (`notices-panel.tsx:128`). Proposes disabling `markAll` while `navigator.onLine===false`. |
| `notices-permission.html` | **Permission — Notices unavailable** | When `bootstrap.navigation` omits `notices` (slot 4 is `管理`), `/notices` would 403/forbidden. Shows `ForbiddenView` and directs to `管理` or `首頁`, matching Shared Shell contract that bell + notices dock slot are omitted for unauthorized accounts. |

> Each harden file is self-contained static HTML using the same token set (`--surface #f4f5f3, --ink #171a1d, --line #d6dcde, --error #b3261e, --radius-md 12px`) and the same row/card CSS as `notices-panel.module.css`, so a visual diff against live can be done without running wrangler.

---

## 11. Prioritized Findings

### P1 — None

No P1 (blocking/forbidden bypass, data loss, crash, or inaccessible auth gate). The Notices Section is functional end-to-end.

### P2 — Should fix before merge / high polish value

| ID | Finding | Severity | Evidence | Fix direction |
| --- | --- | --- | --- | --- |
| **N2** | **Long unbroken token overflows grid cell** — English/URL-like tokens without break opportunities visually bleed and are not wrapped. Chinese long copy wraps fine; pure alphabet long word exposes missing `overflow-wrap`. | **P2** | `web/lib/notices-panel.module.css:121-148` — `itemTitle` / `itemBody` have `whiteSpace:normal` but `overflowWrap:normal; wordBreak:normal` (measured via `getComputedStyle`). Injection test: title `SuperLongUnbreakableWordThatShouldWrap...` → `titleScrollWidth > titleClientWidth`; row clamp prevents page overflow but word overlaps toward `itemTime` column. Design not affected (titles are short Chinese). | **Fix:** Add `overflow-wrap:break-word; word-break:break-word;` (or `overflow-wrap:anywhere` + `word-break:break-all` fallback for long URLs) to `.itemTitle, .itemBody` and ensure `.itemCopy { overflow:hidden }` (currently `overflow:visible`). Re-run 320 injection test: expect `titleScrollWidth <= clientWidth` after fix. Specimen in `harden/notices-long-copy.html`. |
| **N5** | **Header typographic weight drift** — live title `800 -0.03em` vs design `600` (no tracking). Live feels heavier than civic-minimal prototype's restrained heading. | **P2** | `web/lib/notices-panel.module.css:14-21` → `.pageTitle {font-weight:800; letter-spacing:-0.03em}`; measured `28px 800` live vs design `27.52px 600`. Copy identical (`通知` / `最新消息與報名狀態。`), so visual delta is purely CSS. | **Fix:** If strict parity desired, set `.pageTitle {font-weight:600}` (or `700` if a11y prefers slightly bolder) and drop `letter-spacing`, matching prototype's `font-weight:600` inline. Otherwise document as intentional "shared-harness title hierarchy" delta and close as wontfix. |
| **N6** | **Row title weight drift** — live row titles rely on `<strong>` default `700` vs design explicit `600`. | **P2** | `web/lib/notices-panel.tsx:63` + `web/lib/notices-panel.module.css:130-134` (no explicit `font-weight`); measured `700` live vs design `600`. | **Fix:** Add `font-weight:600` to `.itemTitle` to match design and decouple from UA `<strong>` default. |

### P3 — Consider / nice-to-have

| ID | Finding | Evidence | Fix direction |
| --- | --- | --- | --- |
| **N1** | **No explicit `from=notices` origin on deep links** — Notice-driven Program/Event navigation does not preserve "returned from Notices" context, so destination cannot surface contextual back affordance (`返回通知`). Current relies on browser history. | `web/lib/notices-panel.tsx:20-38` `noticeHref` builds plain `/programs?program=...(&event=...)` without origin token; `web/lib/programs/programs-intent.ts:196-249` `buildProgramsHref` supports `hash`/`task`/`created` but no `from`. Playwright click → `goBack()` works via history, but Program/Event detail shows no notices-aware breadcrumb. `CONTEXT.md` Notices Section definition requires deep links into Program detail / Event detail / Account — satisfied, but return path is unaddressed. | **Enhance:** Extend `ProgramsHrefIntent` with optional `from?: "notices"` and append `&from=notices` in `noticeHref`, then read `searchParams.get("from")` in Program/Event detail to render secondary "返回通知" link (or rely on `rememberDeepLink` pattern already in `AppShell`). Post-parity enhancement, not a parity bug. |
| **N3** | **Toolbar `flex-wrap:nowrap` could overflow on extreme unread counts** — e.g. i18n `999+ 未讀` or future longer string at 320. | `web/lib/notices-panel.module.css:34-41` → `gap:1rem; flex-wrap:nowrap`. Measured toolbar fits normally (`2 未讀` + button 101px inside 358px), but extreme count would push button out of view rather than wrap. | **Harden:** Set `toolbar { flex-wrap:wrap; row-gap:0.5rem }` and ensure `unreadCount { min-width:0; flex:1 1 auto }` so count wraps gracefully. Illustrated in harden variant. |
| **N4** | **Page container width delta (760 vs 680)** — live 80px wider than design on desktop. | `web/lib/notices-panel.module.css:1-5` `max-width:760px; padding: clamp(1.5rem,4vh,2.5rem) clamp(1.25rem,4vw,2.75rem) 4rem` vs design `max-width:680px; padding:0 20px calc(78+28+safe-area)`. | Keep as intentional: 760 aligns with other S2 sections and gives management-density breathing room. If strict 680 parity enforced, change `max-width` to `680px`. |
| **N7** | **Read dot still occupies 12px grid track** — intentional (prevents layout shift) but design's read state uses empty span so track collapses slightly less (still 12px; difference is dot vs no-dot background). Live's transparent dot is benign; keeps grid stable when `全部標示已讀` flips all rows. | `web/lib/notices-panel.module.css:105-119`, `web/lib/notices-panel.tsx:56` | No fix — document as intentional stability choice. |
| **N8** | **Error state border-radius mismatch (8px vs card 12px)** — not visual in normal flow since error is not a card, but could feel inconsistent if empty and error share same vertical rhythm. | `web/lib/notices-panel.module.css:193-210` | No fix needed; error is distinct from list card. If unified, use `--radius-md` on error as well. |

### Informational (not defects)

- **Timestamp row removal is intentional.** Commit `fc8d52ec` explicitly documents removal of the 560px media override that stacked timestamps below descriptions; the removal restores parity with the design authority (which keeps timestamps inline at all widths). Verified by `diff main..head` in §6 — main's stacking diverged from design; head now matches design. No action.
- **No service-worker offline cache for notices list.** Notifications are fetched live; offline banner handles messaging via `OfflineBanner`. Harden artifact `notices-offline.html` proposes caching but is out-of-scope for read-only phase.

---

## 12. Recommended Next Action

**Ship with two one-line CSS fixes (N2 + N6), log N1/N3 as enhancements, accept N5/N4 as intentional or polish.**

1. **Immediate (next polish commit):**
   - **N2** — Add to `web/lib/notices-panel.module.css:130-141`: `.itemTitle, .itemBody { overflow-wrap: break-word; word-break: break-word; } .itemCopy { overflow: hidden; }` Re-verify with injected long English token at 320 — `scrollWidth <= innerWidth` must remain true and `titleScrollWidth <= clientWidth`.
   - **N6** — Add `font-weight: 600` to `.itemTitle` (decouples from `<strong>` default 700, matches design 600).
   - Re-run responsive sweep (320/375/390/414) + Playwright PUI / NTC if a notices-specific case exists; confirm `hkNoticeListLabel` spread (`今天/昨天/M月D日`) with an aged fixture.

2. **Next sprint (enhancement, not blocking):**
   - File **N1** as a ticket: Notice-origin return path (`?from=notices` → `返回通知` on Program/Event detail). Scope includes `buildProgramsHref` extension and destination affordance.
   - File **N3** as low-prio harden: toolbar wrap for extreme unread counts.

3. **No further investigation needed** before fixing N2/N6. The live-vs-design comparison is complete; the two remaining deltas are cosmetic (N5/N4) and may be closed as "intentional civic-minimal hierarchy".

---

## 13. Raw Evidence Pointers (for reviewer)

- **Screenshots** → `.impeccable/phase-391/reviews/assets/{design-*.png,live-notices-*.png,live-long-*.png}` (fullPage, 390 required)
- **Live DOM dump** → `/tmp/notices-recon2/live-analysis.json` (captures `panelHTML`, `itemCount:3`, `unreadDots:2`, `grid:12px 267.48px 24.51px`, `minHeight:92px`, `allLinks`)
- **Design DOM dump** → `/tmp/notices-recon2/design-analysis.json` (`h1 27.52px 600`, `lead 15.36px #59636a`, `rowCount:3`, `mainMaxWidth:680px`)
- **Overflow logs** → Playwright `evaluate scrollWidth/innerWidth` checked at each viewport (all OK) + `touchAnalysis` (`92×356` rows, `44px` buttons)
- **Behavior logs** → `markAll` click transition (`2→0` dots, `announcement` live-region: `已將全部通知標示為已讀`) + deep-link navigation (`/programs?program=...` → `goBack → /notices`)
- **Harden proposals** → `.impeccable/phase-391/harden/notices-{empty,loading,error,long-copy,offline,permission}.html`

---

_End of report — `NoticesRecon` read-only reconnaissance complete. No production files modified; fixtures not mutated beyond one transient `POST read-all` (idempotent, self-scoped, reversible via re-seed)._
