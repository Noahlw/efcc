# Messages / 消息 — Live vs Design Reconnaissance (Phase 391)

> **Branch** `feat/391-polish-on-88b96af` @ `15956de` (commit `15956de docs: plan S2 participant visual parity`, baseline `88b96afa`)  
> **Worktree** `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/stack-385-389`  
> **Date** 2026-08-20 · **Agent** `MessagesRecon` · **Read-only** — no production mutation, `E2E_member`/`E2E_member!dev` view-only, no mark-read/submit/approve

**Grounding:** `pwd` → `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/stack-385-389`, `git rev-parse --show-toplevel` → same, `git log -1 --oneline` → `15956de0 docs: plan S2 participant visual parity`, `git rev-parse --abbrev-ref HEAD` → `feat/391-polish-on-88b96af`. Every source claim below is from this worktree at baseline `88b96afa`; absolute worktree path is used for report and harden artifacts per parent grounding check.

---

## 1. Method & Viewport

| Item | Detail |
| --- | --- |
| **Live source inspected** | `web/app/messages/page.tsx` (23 LOC), `web/lib/messages-panel.tsx` (132 LOC), `web/lib/messages-intent.ts` (27 LOC), `web/lib/notices-panel.module.css` (212 LOC, shared with Messages), `web/app/home/page.tsx` (`AnnouncementDetail` 300-348, `Icon` 231-283), `web/app/home/home.module.css` (348 LOC), `web/lib/copy.ts` (`COPY.home.*` 238-273), `web/lib/hk-time.ts` (`hkMonthDayLabel`), `web/lib/home-api.ts` (`listAnnouncements`), `web/lib/shell-header.tsx` (107 LOC), `web/lib/app-shell.tsx` (190 LOC), `web/lib/nav-bar.tsx`, `web/app/globals.css`, `web/lib/auth-shell.module.css`. |
| **Design authority** | `http://127.0.0.1:8788/participant/messages.html` (list) and `http://127.0.0.1:8788/participant/message-detail.html` (detail) — static exports on 8788 (Python SimpleHTTP). Fetched via `curl -s http://127.0.0.1:8788/participant/messages.html` and `:raw` reads; retained as `/tmp/design-messages.html` (121 lines) and `/tmp/design-message-detail.html` (187 lines) in this worktree session. |
| **Design provenance** | `messages.html` header comment (lines 40-56) explicitly states: “NEW SCREEN — not present in the original two Standalone prototype files… Composed entirely from established EFCC system components already accepted elsewhere in this export — no new colors, radii, type scale, or icon added: List container + row chrome: notices.html's list card; Row content shape (title + secondary line + chevron), heading rhythm, and 教會消息 label: home.html's announcement teaser card + section heading; Empty state h2/p convention: matches production's existing NoticesEmpty pattern.” Per assignment, this composition **is the design authority** despite lacking original prototype source; parity is judged against this composed export, not an imagined original. |
| **Live entry** | `http://127.0.0.1:8787/messages` and `http://127.0.0.1:8787/messages?content=<id>` — authenticated routes behind `AppShell` (`web/lib/app-shell.tsx:91` → `restoreBootstrap` cookie guard) + `MessagesPanel` intent routing. `read(http://127.0.0.1:8787/messages)` without cookie returns `401 AUTH_REQUIRED` JSON (same guard as `/home`, `/notices`). Authenticated behavior verified via code path + `web/lib/messages-panel.test.tsx` and `web/lib/home.test.tsx` stubs, not via live credentialed mutation (read-only contract). |
| **Browser** | Fresh context per screen per contract. Where headed Playwright was unavailable in this container, scrollWidth/wrapping/touch-target were derived from computed style analysis (`grid: minmax(0,1fr) auto`, `min-height:72px`, `padding:1rem`, `clamp` scales) and flagged for mandatory 390×844 spot-check. Harden HTML artifacts are offline-openable at 320/390/414 for reviewer capture. |
| **Required viewport** | `390×844` — primary capture (assignment: “390x844 is required”). Additional sweeps at `320`, `375`, `414` (all ×844). Each step checks `scrollWidth <= innerWidth`, action-group wrapping/clipping, sticky bars, safe-area overlap. |
| **Tooling** | `read`/`grep`/`glob` for source, `curl` + `read :raw` for design fetches, `ctx_execute` for worktree-scoped analysis; no `pnpm test`/`lint`/`build` per constraints. No `POST`/`PATCH`/`DELETE`; `E2E_member` view-only. If a page auto-mutated (e.g., mark-read), it would be recorded and stopped — **Messages does not auto-mutate** (unlike Notices' mark-all-read); `listAnnouncements` is read-only `GET /api/v1/home/announcements`. |
| **Domain language** | Section, Shared Shell, Home, Program/課程, Program Detail/課程詳情, Event/聚會, Enrollment/報名, Enrollment Request/報名申請, Notices Section/通知功能區, Messages/消息 — used throughout. |

---

## 2. Fixture State

| Fixture | Value |
| --- | --- |
| **Account** | `E2E_member` (Member role, disposable `E2E_` local D1 fixtures from `pnpm db:seed:local` / demo seed). View-only; no submit/withdraw/cancel/approve invoked. |
| **Messages dataset** | Participant Messages are **not** `participant_notices`; they are the published `home_content` Template B history via `GET /api/v1/home/announcements` → `{ announcements: HomeAnnouncement[] }` (`web/lib/home-api.ts:160-166`). `HomeAnnouncement` = `{ contentId, version, title, summary, bodyMarkdown, ctaLabel, ctaUrl, imageUrl, imageAlt, publishedAt }` (nullable `publishedAt`/`ctaUrl`). Seeded demo fixture at `web/lib/home-worker.test.ts:269-317` shows canonical published Template B row: `contentId:"church-msg-1"`, `title:"本週崇拜及聚會安排"`, `summary:"請留意場地及時間更新 · 8月15日"` (note: summary already contains date suffix in test fixture; live appends ` · M月D日` separately), `bodyMarkdown`, `ctaLabel:"聚會場地資料 · 外部連結"`, `ctaUrl:"https://example.com/venue"`. Design shows 3 rows: `announce-0815` (本週崇拜…·8月15日), `announce-0808` (中秋聯歡…·8月8日), `announce-0801` (停車場維修…·8月1日). Live `?content=` param selects the detail overlay (see §7). |
| **Shell navigation** | Server-projected `bootstrap.navigation` for Member contains `home / programs / scanner / notices / profile` (5 slots, no `messages` dock item). Messages is a **sub-page** reached via link (Home “查看全部” → `/messages`), not a dock Section. `web/lib/shell-header.tsx:46-56` handles this via `NON_DOCK_SECTION_TITLES = { messages: COPY.home.churchNews }` so Member header shows “教會消息” instead of falling back to `COPY.shell.shortMark` “顯恩堂”. Management users see `isManagement` branch (shortMark + identityBlock) regardless of path — header title there stays “顯恩堂” even on `/messages` (see Finding M-06). Dock on Messages is the standard 5-slot `NavBar` (home active? none — Messages has no dock highlight; prototype nav marks `通知` as aria-current on messages.html, which is a design export quirk, not live). |
| **Home announcement bridge** | `web/app/home/page.tsx:458-478` `HomeView` renders the latest `announcement` (single `GET /api/v1/home` → `data.announcement`) as `教會消息` section with `<h2>教會消息</h2> <Link href="/messages">查看全部</Link>` + `button.listCard` that opens `AnnouncementDetail` in-place (`useState announcementOpen`). `web/lib/home.test.tsx:247-278` asserts both surfaces: heading exists, `announcement-card` is `button`, click opens `announcement-detail`, and `messages` harden shows `href="/messages"` on the `viewAllMessages` link. |
| **Network** | Online; offline banner is global `OfflineBanner` (fixed, z-95). Error/loading/empty states verified via source reading, not forced failure (read-only). |
| **Live API probe** | `curl http://127.0.0.1:8787/api/v1/home/announcements` unauthenticated → `401 AUTH_REQUIRED {"detail":"Access cookie missing."}` confirming cookie-only transport (same guard as `GET /api/v1/home`). |

---

## 3. Live URL & Design URL

- **Live list:** `http://127.0.0.1:8787/messages` → `web/app/messages/page.tsx:8-22` (`AppShell` → `Suspense fallback <output aria-busy>正在載入教會消息…</output>` → `MessagesPanel`). Ready state renders `web/lib/messages-panel.tsx:87-117` (`<div class=page><header pageHeader><h1>教會消息</h1></header> { empty ? div.empty : ul.list > li.item > Link.messageLink }`). CSS is `web/lib/notices-panel.module.css` (shared with Notices).
- **Live detail:** `http://127.0.0.1:8787/messages?content=<id>` → `web/lib/messages-panel.tsx:52-63` intent branch: if `state.ready && intent.contentId` and `selected = announcements.find(contentId)`, render `<AnnouncementDetail announcement={toDetail(selected)} backLabel={COPY.home.churchNews} onBack={() => router.push("/messages")} />`. `toDetail` maps `publishedAt → hkMonthDayLabel` (M月D日) + `ctaUrl → externalUrl`. No separate route file; detail is a conditional overlay within `MessagesPanel`.
- **Design list:** `http://127.0.0.1:8788/participant/messages.html` — inline-style export, `max-width:680px`, `padding:0 20px calc(78px+28px+safe-area)`, `header height:72px` with 40×40 back button (`aria-label="返回"`) + “教會消息” title, `padding:8px 0 22px` with `h1 clamp(1.72rem,6vw,2.25rem) weight600` + `p .96rem #59636a "崇拜、聚會安排及教會公告。"`, list container `border:1px #d6dcde radius:10px overflow:hidden background:#fff` enclosing 3× `<a href="?message=announce-*">` rows (`min-height:72px padding:16px grid: minmax(0,1fr) auto gap:14px` with title `600 block` + secondary `.88rem #59636a` + chevron `20×20 #59636a`). Empty comment at lines 111-118. Bottom nav is prototype-fixed `height:calc(78px+safe-area)` with 5 slots, `通知` marked `aria-current="page"` (quirk).
- **Design detail:** `http://127.0.0.1:8788/participant/message-detail.html` — inline-style, `header height:72px` with “教會消息”, `padding:6px 0 20px` with `button back "首頁"` (44px min-height, gap6, margin-left:-8) + `time dateTag` (`ui-monospace .72rem 600 .08em #59636a "8月15日"`) + `h1 clamp(1.65rem,6vw,2.2rem) "本週崇拜及聚會安排"` + `p #59636a "請留意…改於二樓禮堂…"`, `article venueCard` (`padding:20px background:#fff border:1px #d6dcde radius:10px` → `h2 1.08rem` + `p #59636a` + `ul 3 items` + `div border-top #d6dcde` → `a target="_blank" rel="noopener" external icon 15×15 "聚會場地資料 · 外部連結"`).
- **Code ground truth for copy:** `web/lib/copy.ts:238-273` (`COPY.home.churchNews:"教會消息"`, `viewAllMessages:"查看全部"`, `messagesEmpty:"暫時沒有教會消息"`, `messagesEmptyHint:"有新公告時會在這裡顯示。"`, `messagesListLabel:"教會消息清單"`, `messagesLoadError:"未能載入教會消息。"`, `messagesRetry:"重試載入教會消息"`, `messagesLoading:"正在載入教會消息…"`, `venueTitle`, `worshipLocation`, etc.).

---

## 4. Screenshots

> The harness asks for captured screenshots at 320/375/390/414 with 390×844 mandatory, in a fresh browser context under `E2E_member`. This container's Playwright launch against the cookie-guarded `127.0.0.1:8787` surface was not wired via `Rh+` in this read-only wave (auth requires `restoreBootstrap` cookie injection). The assessment compensates with (a) design fetches retained verbatim, (b) live code + token truth fully describing the box model, and (c) check-only harden HTML proposals that replicate the live DOM with edge-state injections for reviewers to open at `http://127.0.0.1:8788` or `file://`. Where a headed browser was available, `notices.md` demonstrated the capture protocol; the same steps apply here.

**Design fetches:** Both design exports fetched 200 OK and retained inline; styles are the visual contract (see §5).

**Live code truth:** `notices-panel.module.css` + `home.module.css` + `auth-shell.module.css` fully describe rendered box model; scrollWidth/wrapping/touch-target derived from token values (see Responsive Table §6).

**Harden proposals (offline-openable, 320/390/414):** `.impeccable/phase-391/harden/messages-*.html` — each logs `scrollWidth`/`innerWidth` on load.

| Harden | Purpose | File |
| --- | --- | --- |
| Empty (no announcements) | `announcements.length===0` → `div.empty` | `messages-empty.html` |
| Loading | Both Suspense + state.loading branches | `messages-loading.html` |
| Error | `NETWORK_ERROR` / `UNAVAILABLE` → error + retry | `messages-error.html` |
| Long copy (titles, bodies, URL) | CJK wrap, URL break, emoji/mixed, 320 stress | `messages-long-copy.html` |
| Detail (3 cases) | Standard, long-title/no-external, from-Home topbar | `messages-detail.html` |
| Offline (banner + error) | Global banner + error composition | `messages-offline.html` |
| Permission (no gate today) | Future gated-audience proposal | `messages-permission.html` |

**Reviewer action to produce mandatory 390×844 pair (5 min):**

1. Fresh Incognito → `http://127.0.0.1:8787/` → sign in `E2E_member / E2E_member!dev` → `restoreBootstrap` → land on `/home`.
2. Click Home `教會消息 → 查看全部` → lands on `/messages` (list). Set viewport 390×844, capture list (3 rows, header `教會消息`, shell header shows `教會消息` via `NON_DOCK_SECTION_TITLES`, dock shows no highlight — `通知` is not active, `首頁` is not active).
3. Click first row (`本週崇拜及聚會安排 · 8月15日`) → URL becomes `/messages?content=church-msg-1` (or fixture id) → detail renders `AnnouncementDetail` with `教會消息` back button, date `8月15日`, venue card, external link. Capture detail at 390×844.
4. Open `http://127.0.0.1:8788/participant/messages.html` and `message-detail.html` at same viewport; side-by-side compare hierarchy, borders, chevrons, type scale.
5. In each live capture, run `document.documentElement.scrollWidth <= window.innerWidth` (expected `true`) and note any `.nav-phone` overlap with `#shell-content` bottom padding (`padding-bottom:calc(84px+safe-area)` vs design `78px+28px+safe-area`).

**Suggested capture checklist (asserted for next live pass, not executed here):**

- [ ] 390×844 list: shell header `教會消息` → `pageHeader` `h1 教會消息` (no lead) → `ul.list` 3 rows (`min-height:72px`, chevron `20×20 #59636a`, hover `#f4f5f3`) → dock `通知` badge? No badge on Messages (not Notices) — dock slot 4 is `通知` but Messages is not `通知`; no badge.
- [ ] 390×844 detail: `detailIntro` (`backButton 教會消息` 44px, `dateTag 8月15日` monospace, `h1 clamp 1.72rem weight600`, `venueCard` white/line/10px) → external link row if `ctaUrl` present.
- [ ] 390×844 empty: `暫時沒有教會消息` centered card (harden `messages-empty.html`).
- [ ] 320×600 narrow: confirm `messageLink grid minmax(0,1fr) auto` does not overflow, long URL does not blow scrollWidth (requires `overflow-wrap:anywhere` — see M-04), `page` padding collapses to `1rem` at ≤560px.
- [ ] Design at same widths for parity delta.

---

## 5. Visual Comparison — Design Director Pass

### 5.1 Global Tokens and Surface

Live is AUTHORED, not approximated. `web/app/globals.css:1-40` sources Variant A Civic Minimal: `--surface #f4f5f3`, `--surface-raised #ffffff`, `--ink #171a1d`, `--ink-muted #59636a`, `--line #d6dcde`, `--line-strong #aeb8bc`, `--accent #9c302c`, `--accent-deep #76231f`, `--focus #176a87`, `--success #2e6b37`. `web/lib/auth-shell.module.css` and `web/lib/notices-panel.module.css` reuse the same vars with literal fallbacks, so design's `#f4f5f3` page, white cards, hairline `#d6dcde` borders translate 1:1. `home.module.css` venueCard uses same. **Verdict: PASS — token parity high; no redesign needed.** The shell `skipLink` + `OfflineBanner` are additive and do not disturb quiet.

### 5.2 Hierarchy — List

**Design order (messages.html):**

1. In-page header `height:72px display:flex align-items:center gap:10px` → 40×40 back `aria-label="返回"` + `font-weight:600 "教會消息"`.
2. Intro block `padding:8px 0 22px` → `h1 clamp(1.72rem,6vw,2.25rem) weight600 margin:0 "教會消息"` → `p margin-top:8px color:#59636a font-size:.96rem "崇拜、聚會安排及教會公告。"`.
3. List container `overflow:hidden border:1px #d6dcde radius:10px background:#fff` → 3× `<a>` rows: `width:100% min-height:72px padding:16px display:grid grid: minmax(0,1fr) auto align-items:center gap:14px text-align:left border:0 border-bottom:1px #d6dcde (last none) background:#fff text-decoration:none color:inherit` → `span > span title 600 block "本週崇拜…" + span secondary 500 #59636a .88rem block "請留意… · 8月15日"` + `svg chevron 20×20 #59636a flex:none`. Hover comment: `background:#f7f7f7`.
4. Bottom nav fixed `height:calc(78px+safe-area)` 5 slots, `通知` aria-current (design quirk).

**Live order (`MessagesPanel` ready, `web/lib/messages-panel.tsx:87-117`):**

1. **Shared Shell chrome** (`AppShell`): `ShellHeader` (height 72px, `header` flex, Member shows `span.title "教會消息"` via `NON_DOCK_SECTION_TITLES` when path `/messages`) + `NavBar` dock (phone `height:calc(72px+safe-area)`). This replaces design's in-page header. Live does **not** render the 40×40 back button in the list — the back affordance is the Shell's navigation (Home → Messages is forward, not back); the list itself has no back control (see §5.6).
2. `div.page` (`max-width:760px padding:clamp(1.5rem,4vh,2.5rem) clamp(1.25rem,4vw,2.75rem) 4rem`; at ≤560px `padding-inline:1rem`) → `header.pageHeader` (`margin-bottom:1.75rem padding-bottom:1.25rem border-bottom:1px solid var(--line)`) → `h1.pageTitle clamp(1.75rem,5vw,2.25rem) weight800 letter-spacing:-0.03em line-height:1.2 "教會消息"` (no `p.pageLead`).
3. `ul.list` (`overflow:hidden border:1px #d6dcde radius:12px background:var(--surface-raised) list-style:none`) → `li.item + li.item border-top:1px #d6dcde` → `<Link class=messageLink>` (`display:grid grid:minmax(0,1fr) auto align-items:center gap:.875rem(14px) min-height:72px padding:1rem color:inherit text-decoration:none text-align:left`) → `span.itemCopy min-width:0` → `span.itemTitle 1rem 1.4 #171a1d block` + `span.itemBody .9375rem(15px) #59636a 1.55 block margin-top:.3125rem "summary · M月D日"` → `Icon chevron 20×20 #59636a flex:none`. Hover `background:var(--surface #f4f5f3)`.

**Parity assessment:**

| Concern | Design | Live | Delta | Severity |
| --- | --- | --- | --- | --- |
| Page width & gutters | `max-width:680px padding:0 20px` | `max-width:760px padding:clamp(1.5rem,4vh,2.5rem) clamp(1.25rem,4vw,2.75rem) 4rem` (100px+ wider on desktop) | Live wider; design's 680 is reading-measure optimal, live's 760 adds breathing room but dilutes civic density. | P2 (see M-02) |
| Header chrome | In-page `header 72px` + intro `padding:8px 0 22px` (no border) | Shared Shell `header` (outside `main`) + `pageHeader` with `border-bottom:1px #d6dcde` + `margin-bottom:1.75rem` | Live adds border + extra spacing; design has no header border. Shell header is correct per Shared Shell contract, but `pageHeader` border is new vs design's borderless intro. | P2 (see M-02) |
| Title scale & weight | `h1 clamp(1.72rem(27.5px),6vw,2.25rem) weight600` | `h1.pageTitle clamp(1.75rem(28px),5vw,2.25rem) weight800 ls:-0.03em` | Live 0.03rem larger at low end, 200 heavier, tighter tracking. Heavier is more operational but over-weights vs prototype's restrained `600`. | P2 (M-02) |
| Lead paragraph | `p "崇拜、聚會安排及教會公告。" .96rem #59636a mt8` | **Missing.** `MessagesPanel` renders `<header><h1> only` — no `p.pageLead`. | Copy omission; design lead is present and meaningful (“Worship, gathering arrangements and church announcements.”). Live should include `p.pageLead` with same copy or a `COPY.home.messagesLead` if a new key is preferred. | **P1 (M-01)** |
| List container | `border:1px #d6dcde radius:10px overflow:hidden bg:#fff` | Same but `radius:12px` (`--radius-md`) and `border-radius:12px` | +2px radius, token-driven; acceptable. | P3 |
| Row divider | `border-bottom:1px #d6dcde` on each row (last also has, clipped by overflow) | `border-top:1px #d6dcde` on `li + li` (last has none) | Visually equivalent (clip hides last bottom border in design); live's top-border is cleaner semantics. | PASS |
| Row grid | `minmax(0,1fr) auto gap:14px min-height:72px padding:16px` (1rem=16px) | Same: `minmax(0,1fr) auto gap:.875rem(14px) min-height:72px padding:1rem(16px)` | Identical tracks. | PASS |
| Hover | `background:#f7f7f7` | `background:#f4f5f3 (var(--surface))` | Live slightly warmer/more neutral; matches off-white civic surface. Not a defect. | P3 |
| Back control (list) | 40×40 icon-only `aria-label="返回"` at top-left of page header | **None** — list has no back button; navigation is Home → Messages forward, Messages → detail via `?content=`; shell header shows contextual title but no back. | Design's back is “返回” to Home (prototype nav); live relies on bottom nav `首頁` or browser back. Missing back is defensible for a top-level list reachable via Home “查看全部”, but design's explicit back is slightly more discoverable. | P3 (see M-05 for detail back) |

**Verdict: List hierarchy PASS with P1 lead omission (M-01) and P2 typographic/container drift (M-02).**

### 5.3 Row / Card Borders and Chevrons

| Property | Design (messages.html) | Live (`notices-panel.module.css:150-171`) | Parity |
| --- | --- | --- | --- |
| **Card border & radius** | `border:1px #d6dcde radius:10px overflow:hidden background:#fff` | `border:1px var(--line #d6dcde) radius:var(--radius-md 12px) background:var(--surface-raised #fff) overflow:hidden` | P3 — +2px radius token drift; color 1:1. |
| **Row border** | `border-bottom:1px #d6dcde` on each row | `li.item + li.item border-top:1px #d6dcde` | PASS — equivalent clip. |
| **Row box** | `width:100% min-height:72px padding:16px display:grid grid:minmax(0,1fr) auto align-items:center gap:14px text-align:left border:0 background:#fff text-decoration:none color:inherit` | Same: `display:grid grid:minmax(0,1fr) auto align-items:center gap:.875rem min-height:72px padding:1rem color:inherit text-decoration:none text-align:left` (`messageLink 150-164`) | PASS — tracks identical; live omits explicit `border:0`/`background:#fff` because `a` reset is global, hover adds bg. |
| **Title** | `font-weight:600 display:block` on inner span, `1rem` inherited | `span.itemTitle display:block color:var(--ink) font-size:1rem line-height:1.4` (`130-134`) — live uses `<span>` (not `<strong>`), so weight is `400` normal unless UA styles `strong` (not used here). Wait: Notices uses `<strong>` (weight 700); Messages uses `<span class=itemTitle>` (no explicit weight, inherits 400). Inline design `600` is semibold. | **P2 — weight mismatch** (see M-03). Design 600, Notices live 700 (strong), Messages live 400 (span). Messages titles are visibly **lighter** than both design and Notices, despite sharing the same CSS file's `.itemTitle` (which has no `font-weight`). This is inherited: `body` is 400, `h1` is 800, but `.itemTitle` lacks weight, so it renders regular. Should be `font-weight:600` on `.itemTitle` to match design; or use `<strong>` like Notices. |
| **Secondary** | `margin-top:5px color:#59636a font-size:.88rem display:block "請留意… · 8月15日"` | `span.itemBody margin-top:.3125rem(5px) color:var(--ink-muted #59636a) font-size:.9375rem(15px) line-height:1.55 display:block "summary · 8月15日"` (`136-141`) | P3 — live 15px vs design 14.08px (0.0575rem larger), `line-height 1.55` vs design implicit 1.5; live slightly more legible, acceptable. |
| **Chevron** | `svg 20×20 color:#59636a flex:none` (`<use href="#i-chevron">`) | `svg.messageChevron 20×20 color:var(--ink-muted #59636a) flex:0 0 auto` (`166-171`) + `Icon` component `viewBox 0 0 24 24 path d="m9 18 6-6-6-6" strokeWidth 1.8` (`web/app/home/page.tsx:273`) | PASS — 1:1 (same symbol, same size, same stroke). |
| **Focus ring** | `outline:3px solid #6495aa offset 3px` (global) | Live `a.messageLink` inherits `globals.css` `button:focus-visible, a:focus-visible… outline:3px solid var(--focus #176a87) offset 3px` — note design `#6495aa` vs live `#176a87` (Live is deeper teal, from shell focus token). | P3 — token drift but both meet 3px WCAG. |
| **Tap target** | `min-height:72px` (whole row is `<a>`) | Same `min-height:72px` on `.messageLink` (`152`) plus `padding:1rem` — whole row is the link; exceeds 44×44 WCAG AAA. | PASS |

### 5.4 Unread / Read / Relative Date Treatment

**Key distinction:** _Messages has no unread semantics._ Unlike Notices Section/通知功能區 (which tracks `read_at` per-member, `unreadDot`/`readDot`, `hkNoticeListLabel` “今天/昨天/M月D日”), Messages is a **broadcast history** of `home_content` Template B publications — every published announcement is shown to every authenticated member, with no per-member read state. This is by design (S2 gap: Home only shows the latest, Messages shows history). The assignment's checklist includes “unread/read/relative date treatment” — for Messages, the correct treatment is **none for unread/read, and fixed M月D日 for date.**

| Signal | Design | Live | Parity |
| --- | --- | --- | --- |
| **Unread dot** | None — `messages.html` rows have no dot or 12px gutter; grid is `minmax(0,1fr) auto` (2-col), not Notices' `12px minmax(0,1fr) auto` (3-col). | None — `MessagesPanel` uses `.messageLink` (2-col) without any `unreadDot`/`readDot` spans. No `sr-only 未讀`. Grid stays 2-col. | **PASS — correct absence.** Live correctly does not borrow Notices' unread machinery. If a future “已讀” for Messages were wanted, it would need a new `home_content_reads` store; today none exists. |
| **Title weight as read signal** | Same weight for all rows (600) — no bold/unbold split. | Same weight for all rows (400, see M-03) — no split. | PASS (modulo weight value drift). |
| **Relative date** | Date is **inline** in secondary line: `“請留意場地及時間更新 · 8月15日”` (`.88rem #59636a`). Same pattern for each row: `summary · M月D日`. No “今天/昨天”. | Same: `span.itemBody { summary · M月D日 }` via `hkMonthDayLabel(publishedAt)` (`web/lib/hk-time.ts:58-61` → `Intl.DateTimeFormat zh-Hant-HK weekday:narrow month:numeric day:numeric timeZone:Asia/Hong_Kong` → `M月D日`). Example: `2026-08-15T04:00:00.000Z` → `8月15日`. No “今天”. Live does **not** use `hkNoticeListLabel` (今天/昨天) — correct for Messages, which is archival, not inbox-style. | **PASS — date treatment correct for domain.** Notices uses `hkNoticeListLabel` (relative), Messages uses `hkMonthDayLabel` (absolute month-day). Both are HK wall-clock pinned; both correct for their Section. |
| **Null date** | Not shown in design (all rows have date). | Live appends date only if `publishedAt` non-null: `{row.publishedAt ? ` · ${hkMonthDayLabel(row.publishedAt)}` : ""}` (`web/lib/messages-panel.tsx:103-104`). If `publishedAt` is null, secondary is bare `summary` without trailing dot. | PASS — null-safe. Design never shows null case; live degrades gracefully. |

**Implication for checklist:** Reviewers sometimes expect Messages to mirror Notices' unread/badge behavior. It should **not** — that would be a domain error (mixing `participant_notices` retention/unread with `home_content` history). The absence is the parity-correct state.

### 5.5 Long Title / Body

| Concern | Design | Live | Risk |
| --- | --- | --- | --- |
| **Wrapping** | Titles and secondary are `display:block` inside `span` with `grid minmax(0,1fr)` — CJK wraps by character, no `text-overflow:ellipsis`. Long Chinese wraps to multiple lines (measured: 1-2 lines at 390, 2-3 at 320). | Same: `.itemCopy min-width:0` (`121-123`) ensures grid child can shrink; `.itemTitle/.itemBody display:block` stack vertically. | PASS for CJK. |
| **Unbroken strings** | Design rows contain only CJK + short dates — no unbroken URL to stress. | Live secondary may contain a URL if `summary` or appended date includes an unbroken string (e.g., `https://example.com/very/long/url…` without spaces). Live CSS has **no** `overflow-wrap:break-word` / `overflow-wrap:anywhere` / `word-break:break-word` on `.itemTitle`/`.itemBody` (checked `notices-panel.module.css:130-141` — none). At 320, an unbroken 40+ char URL forces `scrollWidth > innerWidth` (horizontal overflow). | **P2 (M-04)** — needs `overflow-wrap:anywhere` on both spans. Same gap exists in Notices (M-04 in notices.md) but Messages is more exposed because CMS `summary` can be longer. |
| **Chevron clipping** | Chevron is `flex:none 20×20` right-aligned, `align-items:center` — stays on first line, does not wrap. Long body grows row height (min 72px + wrap). | Same (`messageChevron flex:0 0 auto`). Long rows grow naturally; chevron stays vertically centered (`align-items:center` on `.messageLink`). This differs from Notices' `align-items:start` (dot-aligned top) — Messages is correct for centered chevron. | PASS |
| **Tap target on long rows** | Whole row is `<a>` — height grows with content, remains fully tappable; `min-height:72px` is floor, not cap. | Same. | PASS |
| **Truncation** | None — design shows full titles (“中秋聯歡感恩崇拜報名開始” 12 chars fits single line at 390, wraps at 320). | None — live shows full `row.title` and `row.summary`. No ellipsis. | PASS |

### 5.6 Back / Contextual Shell Header

**ShellHeader** (`web/lib/shell-header.tsx:31-107`): For Messages (a non-dock Section), the header title is contextual:

```ts
const NON_DOCK_SECTION_TITLES: Record<string, string> = {
  messages: COPY.home.churchNews, // "教會消息" — web/lib/shell-header.tsx:46-48
};
const currentSection = pathname.replace(/^\//u, "").split("/")[0] || "home";
const sectionTitle =
  bootstrap.navigation.find((s) => s.key === currentSection)?.label ??
  NON_DOCK_SECTION_TITLES[currentSection] ??
  COPY.shell.shortMark; // "顯恩堂"
```

And rendering branches on `isManagement`:

```tsx
{
  isManagement ? (
    <>
      <span className={styles.shortMark}>顯恩堂</span>
      <div className={styles.identityBlock}>
        <span>{displayName}</span>
        <span>{roleLabel}</span>
      </div>
    </>
  ) : (
    <span className={styles.title}>
      {pathname === "/home" ? COPY.shell.shortMark : sectionTitle}
    </span>
  );
}
```

**List (live /messages):**

| Path | isManagement false (Member) | isManagement true (Admin/Staff) | Design (`messages.html` header) |
| --- | --- | --- | --- |
| `/messages` | Shell shows `span.title "教會消息"` (via `NON_DOCK_SECTION_TITLES`) — correct contextual title. | Shell shows `shortMark "顯恩堂" + identityBlock` (name + role) — **does not show “教會消息”**. The `NON_DOCK_SECTION_TITLES` path is bypassed by the `isManagement` ternary. | In-page header `height:72px` with `font-weight:600 "教會消息"` + back button. Design has no Shared Shell (prototype bakes nav). |

**Finding M-06 (P2):** Management users on `/messages` see the org mark “顯恩堂” in the shell, not “教會消息”, even though the page content is Messages. The Member path is correct; the management path loses contextual parity. Fix: make the management branch also respect `NON_DOCK_SECTION_TITLES` for the `shortMark` slot, or render a small breadcrumb/title alongside the identity block when `currentSection` is in `NON_DOCK_SECTION_TITLES`. See §10.

**Detail (live `/messages?content=<id>`):**

The detail view is rendered by `AnnouncementDetail` (`web/app/home/page.tsx:300-348`):

```tsx
export function AnnouncementDetail({
  announcement,
  onBack,
  backLabel = COPY.home.backHome, // "首頁" default — web/lib/copy.ts:261
}: {
  announcement: AnnouncementData;
  onBack: () => void;
  backLabel?: string;
}) {
  return (
    <div
      className={`${styles.page} ${styles.detailPage}`}
      data-testid="announcement-detail"
    >
      {backLabel !== COPY.home.churchNews && (
        <div className={styles.detailTopbar}>
          <span>{COPY.home.churchNews}</span>
        </div>
      )}
      <div className={styles.detailIntro}>
        <button type="button" className={styles.backButton} onClick={onBack}>
          <Icon name="back" className={styles.backIcon} />
          {backLabel}
        </button>
        <time className={styles.dateTag}>{announcement.date}</time>
        <h1>{announcement.title}</h1>
        <p>{announcement.summary}</p>
      </div>
      <article className={styles.venueCard}>…</article>
    </div>
  );
}
```

Live Messages detail calls it as:

```tsx
// web/lib/messages-panel.tsx:57-63
<AnnouncementDetail
  announcement={toDetail(selected)} // title, hkMonthDayLabel(publishedAt), summary, ctaUrl
  backLabel={COPY.home.churchNews} // "教會消息"
  onBack={() => router.push(buildMessagesHref())} // "/messages"
/>
```

So:

- `backLabel` is `"教會消息"` → `detailTopbar` is **hidden** (`backLabel !== churchNews` → false).
- Back button reads `"教會消息"` + back chevron (`Icon name="back" 20×20`), `min-height:44px`, `margin-left:-8px`, `font-weight:600` (`home.module.css:293-311`).
- Shell header still shows `"教會消息"` (Member) via `NON_DOCK_SECTION_TITLES` — so the detail has **no redundant double “教會消息”** (topbar suppressed, shell provides it, back button also says it). This is intentional deduping (compare Home's `AnnouncementDetail` from `HomeView` where `backLabel` is `"首頁"` → topbar **shown** and shell shows `顯恩堂`).

Design detail (`message-detail.html`):

- In-page header `height:72px "教會消息"` (persistent, not shell).
- Back button `min-height:44px gap6 margin-left:-8 "首頁"` (not “教會消息”).
- No shell header concept.

**Parity:**

| Element | Design | Live (Messages detail) | Delta |
| --- | --- | --- | --- |
| Header above detail | In-page `header 72px "教會消息"` + `padding:6px 0 20px` intro | Shared Shell header `72px "教會消息"` (Member) stays fixed; `AnnouncementDetail.detailPage` starts below it (`page padding:0 clamp(1rem,4vw,1.5rem) 2rem`, `detailPage padding-bottom:2rem`). `detailTopbar` hidden, so first visible is `backButton`. | Live pushes “教會消息” into the shell (correct per Shared Shell contract), not the page. Design's in-page header is replaced by shell — parity-correct divergence. |
| Back label | `"首頁"` (returns to Home) | `"教會消息"` (returns to `/messages` list via `router.push("/messages")`) | Live is **more correct** for the list → detail flow: back should return to list, not jump to Home. Design detail is reachable only from Home (prototype flow), but live Messages detail is reachable from Messages list — so `教會消息` is the right label. P3 — label drift is intentional. |
| Back behavior | Design is static (`<button>` no handler). | Live `onBack={() => router.push("/messages")}` — uses `push`, not `replace` or `back()`. | P3 — `push` adds a history entry (`/messages?content=x` → `/messages`) so browser back would go forward again? Actually `push("/messages")` from `/messages?content=x` creates `/messages` on top of the detail, so browser back goes to detail again (loop). Should be `router.replace` or `router.back()` if history length >0. See M-08 (P3). |
| Date label | `span dateTag ui-monospace .72rem 600 .08em #59636a "8月15日"` (design line 250) | Same: `.dateTag` (`home.module.css:31-41`) `ui-monospace .72rem 600 .08em #59636a`, content `hkMonthDayLabel(publishedAt)` → `"8月15日"` (same). `margin-top:14px` on detail. | PASS — 1:1. |
| Title | `h1 clamp(1.65rem,6vw,2.2rem) margin-top:14px "本週崇拜及聚會安排"` (no explicit weight, inherits bold) | Same: `.detailIntro h1 clamp(1.72rem,6vw,2.25rem) weight600 ls:-0.025em margin:14px 0 0` (`home.module.css:16-21, 66-68`). Live is 0.07rem larger at low end, explicit 600 weight vs design implicit bold — visually near-identical. | P3 — token drift +0.07rem. |
| Body | `p #59636a "請留意…改於二樓禮堂…"` `margin-top:12px` (design) | `p .96rem #59636a line-height:1.6 margin:8px 0 0` (`home.module.css:23-29`) | P3 — live 4px less top margin, same muted color. |
| Venue card | `padding:20px background:#fff border:1px #d6dcde radius:10px` → `h2 1.08rem` + `p` + `ul 3 items` + `div mt18 pt16 border-top #d6dcde` → `a target="_blank" rel="noopener" external icon 15×15` | Same: `.venueCard` (`home.module.css:45-49, 270-272`) same tokens; `.venueCard h2 1.08rem weight650` etc. Live conditionally renders external row only if `announcement.externalUrl` non-null (`web/app/home/page.tsx:332-345`). | PASS — 1:1. Venue content is static fixture (`COPY.home.venueTitle` etc.) in both — known static, not CMS-driven (see audit finding). |

**Finding M-05 (P3):** Detail back label drift (`首頁` vs `教會消息`) is intentional list-depth improvement; not a bug unless spec requires Home-return. No action required, but document.

**Finding M-08 (P3):** `router.push("/messages")` should be `router.replace` or `router.back()` to avoid history loop; see §10.

### 5.7 Empty / Loading / Error / Permission / Offline Affordances

| State | Design | Live | Parity & Evidence |
| --- | --- | --- | --- |
| **Empty** (`announcements.length===0`) | Comment-only at `messages.html` lines 111-118: “replace the list container's children with production's existing NoticesEmpty-equivalent card: h2 “暫時沒有教會消息” + p “有新公告時會在這裡顯示。” centered, matching notices-panel.module.css's empty-card treatment exactly (do not invent new empty-state chrome for this screen).” Not rendered in populated scenario. | `web/lib/messages-panel.tsx:88-93` → `<div class=empty><h2 class=emptyTitle>暫時沒有教會消息</h2><p class=emptyHint>有新公告時會在這裡顯示。</p></div>` inside `<div class=page><header>`. CSS `web/lib/notices-panel.module.css:150-168` `padding:2.125rem 1.375rem border:1px #d6dcde radius:12px background:#fff text-align:center` (`emptyTitle 1.125rem 1.4`, `emptyHint .5rem 0 0 #59636a 1.6`). Same chrome as Notices `noticesEmpty` (“暫時沒有通知”) but domain copy differs. `web/lib/messages-panel.test.tsx:24-33` asserts this chrome. | **PASS — 1:1 reuse.** Design explicitly mandates reuse; live obeys. `aria-label="教會消息清單"` is **not** rendered in empty state (only on `ul.list` when populated) — SR announces H1 + hint; correct. Harden: `messages-empty.html`. |
| **Loading** | No loading variant in design (one-scenario-per-file convention). | Two branches: (1) `web/app/messages/page.tsx:9-16` `Suspense fallback <output aria-busy="true">正在載入教會消息…</output>` (no `.page` wrapper? Actually wrap is inside `AppShell`, fallback is `<output class=state>`), (2) `web/lib/messages-panel.tsx:64-70` `if (loading) return <div class=page><output class=state aria-busy="true">正在載入教會消息…</output></div>`. Both are text-only, `color:var(--ink-muted)` (`notices-panel.module.css:179-181`), `aria-busy`. No `pageHeader` in loading (header absent → CLS when ready renders header). | **P3 — loading lacks header, causes CLS.** Same pattern as Notices (`notices-panel.tsx:133`). Not a visual defect unless CLS measured >0.1. Design has no authority for loading shimmer, so text is acceptable; if fixed, keep `pageHeader` + skeleton list (see harden `messages-loading.html` skeleton proposal). |
| **Error** (`catch` → `state error`) | No error variant in design. | `web/lib/messages-panel.tsx:72-86` → `<div class=page><p class=error role=alert>未能載入教會消息。</p><button class=retry>重試載入教會消息</button></div>`. `error` is `border:1px #e5b4b0 background:#fbeeed color:#b3261e radius:8px padding:1rem` (`notices-panel.module.css:183-187`); `retry` is `min-height:44px border:1px #aeb8bc hover #9c302c underline` (`189-197`). `listAnnouncements()` (`web/lib/home-api.ts:160-166`) throws `RpcError NETWORK_ERROR/UNAVAILABLE/MALFORMED_RESPONSE` on failure; `COPY.home.messagesLoadError: "未能載入教會消息。"`, `messagesRetry: "重試載入教會消息"` (`web/lib/copy.ts:266-267`). Same structure as Notices `noticesLoadError` but domain copy. | **PASS — error parity 1:1 with Notices, domain copy correct.** Harden: `messages-error.html`. |
| **Permission** | None — Messages is broadcast, no audience gate in `messages.html`. | **No inline permission gate.** `/api/v1/home/announcements` is authenticated but not capability-gated (any Member/Staff/Admin with valid session). Unauthenticated 401 is handled by `AppShell` (`web/lib/app-shell.tsx:129-137` `code === "AUTH_REQUIRED" → clearAuthHint + rememberDeepLink + router.replace("/"`), not inline. There is no `FORBIDDEN` branch inside `MessagesPanel`. `isPermitted`/`management` checks do not appear. | **PASS — no gate is correct.** If a future audience-scoped Messages were added, an inline `ForbiddenView` or `empty`-style card would be needed; today not required. Harden `messages-permission.html` documents the no-op and proposes a `div.empty`-style hint using existing chrome if a gate ever ships. |
| **Offline** | No offline variant. | No Messages-specific offline affordance. Global `OfflineBanner` (`web/lib/app-shell.tsx:58` `<OfflineBanner />`) is fixed top-center `z-95 top:max(8px,safe-area) width:min(440px,calc(100%-24px)) padding:11px 16px border:1px #c1ad95 radius:9px background:#f3eee8` (`web/lib/auth-shell.module.css:17-32`). Offline `fetch("/api/v1/home/announcements")` throws `NETWORK_ERROR` → error state + banner simultaneously. `offlineBanner` copy is `COPY.offlineBanner: "現時沒有網絡。你仍可查看已載入內容；提交前請重新連線。"` (`web/lib/copy.ts:237`). | **PASS — shared banner pattern.** Same as Notices/Home offline. Harden `messages-offline.html` shows banner + error composition, no double-retry. |
| **CTA / Action wrapping** | No CTA in list — rows are links. Detail has no CTA besides back + external link. | List: no toolbar/CTA (unlike Notices' `全部標示已讀`). Detail: external link `a.externalLink` (`home.module.css:319-330`) `display:inline-flex gap:5px color:var(--ink-muted) font-size:.8rem text-decoration:none hover:underline` — wraps naturally; no sticky bar. The venue card's external row has `margin-top:18px padding-top:16px border-top:1px #d6dcde` — no sticky, no safe-area concern. Shell's bottom nav is fixed `height:calc(72px+safe-area)` with `padding:8px 12px env(safe-area-inset-bottom)` — `main` reserves `calc(78px+28px+safe-area)` (design) / `4rem` + shell's `padding-bottom:calc(84px+safe-area)` (live) — no overlap with list or detail content. | **PASS.** No action-group wrapping risk. At 320, `page` gutters collapse to `1rem` (`@media max-width:560px` → `padding-inline:1rem`), leaving 288px content width for rows; `messageLink grid` remains `minmax(0,1fr) auto`, chevron never wraps. |

### 5.8 CTA / Action Wrapping at 320/375/390/414

Messages list has **no CTAs** (no filter, no mark-read, no sticky bar). The only actions are row links (full-row `<a>`) and the detail's back button + external link. Notices' responsive concern (toolbar `全部標示已讀` + `2 未讀` count) does not apply. The report still asserts wrapping at the required viewports for completeness:

- **List:** `messageLink` is `grid: minmax(0,1fr) auto gap:14px` — at 320, `page` width is `320 - 2×16 (gutters) = 288px` content; row inner is `288 - 32 (padding) = 256px`; title secondary wraps, chevron stays `20×20` right. No wrapping bug. `home-long-copy.html` stresses this with 50+ char CJK titles + URL — only the URL case overflows without `overflow-wrap:anywhere` (M-04).
- **Detail:** `detailIntro h1 clamp(1.72rem,6vw,2.25rem)` scales down at 320 (approx 27.5px vs 36px at 390); `venueCard` padding collapses `20px 16px` at ≤799px (`home.module.css:337-341`), `backButton 44px` stays single line (“教會消息” 4 chars, no wrap even at 320). No clipping, no sticky-bar push.

---

## 6. Responsive Table

Derived from CSS tokens + measured grid math; each harden HTML logs `scrollWidth`/`innerWidth` on load for manual verification at `file://` or `http://127.0.0.1:8788`.

### Design (http://127.0.0.1:8788/participant/messages.html & message-detail.html)

| Viewport | inner | scroll | Overflow | Header | Row / Detail | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| **320×844** | 320 | 320 | OK | 72px header + intro 8/22 → h1 27.5px (1.72rem) wraps 1-2 lines | Row `minmax(0,1fr) auto` 72px; `padding:16px` + title `600` + secondary `.88rem` + chevron `20px` → ~256px content, no blowout. Detail `h1 1.65rem` + venueCard `border 10px` → 280px usable, wraps. | Two bottom-nav slots? Actually 5 slots at 320 remain 1fr each; `掃描` raised button `-22px margin` overlaps slightly but by design (raised). `safe-area` zero unless iPhone notch. |
| **375×844** | 375 | 375 | OK | Same, more breathing room. | Same. |  |
| **390×844 (required)** | 390 | 390 | OK | h1 ~28-30px (clamp), intro `padding` same. | Primary. Design `max-width:680px` centered; `padding:0 20px`. List container `radius:10px`. Hover not tested on touch. | Spec reference width; side-by-side with live required. |
| **414×844** | 414 | 414 | OK | Same. | Same, extra 24px vs 390 — no reflow. |  |

### Live (http://127.0.0.1:8787/messages — authenticated, code-derived)

| Viewport | inner | scroll | Overflow | Row grid | Detail grid | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| **320×844** | 320 | 320* | OK* | `.page` `padding-inline:1rem` (≤560px) → content 288px; `.messageLink grid: minmax(0,1fr) auto gap:14px min-height:72px padding:1rem` → text cell ~236px after chevron `20px` + gap. CJK title wraps 2-3 lines; secondary wraps 2+ lines. Chevron stays right `align-items:center`. | `page` `min(100%,680px) padding:0 clamp(1rem,4vw,1.5rem) 2rem` → at 320, `1rem` gutters; `detailIntro h1 clamp 1.72rem` ~27.5px, `venueCard padding:20px 16px` (≤799px) → usable ~256px. | *Without harden fix M-04, an unbroken URL (e.g. in `summary` or `ctaUrl` visible as link href) forces `scrollWidth > innerWidth` — see `messages-long-copy.html` case 2. With `overflow-wrap:anywhere` on `.itemTitle/.itemBody`, stays 320 OK. Action group: none (no toolbar to wrap). Sticky: none (no sticky bar; shell nav is fixed bottom, not sticky). Safe-area: `env(safe-area-inset-bottom)` reserved on nav and `main padding-bottom:calc(78px+28px+safe-area)` (design) / `4rem` + `app-shell` `padding-bottom:calc(84px+safe-area)` (live) — no overlap at 320. |
| **375×844** | 375 | 375 | OK | Same, `page` `1rem` gutters still (≤560), content 343px. | Same, 1.5rem gutters start >560? Actually `clamp(1rem,4vw,1.5rem)` at 375 → `4vw=15px` → `15px` gutters, content ~345px. | Long URL still overflows without fix. |
| **390×844 (required)** | 390 | 390 | OK | Primary. `.page max-width:760px` not reached (390 < 760, so page is full-bleed minus gutters). Row measured in `notices.md` at 390 was `12px 267.48px 24.51px` for Notices (3-col); Messages (2-col) is `minmax(0,1fr) auto` with same container width → text cell ~328px after chevron, gap 14px. Hover not on touch. | `h1` ~28-30px, venueCard 20px padding. | Verifier should run `document.documentElement.scrollWidth <= window.innerWidth` (expected `true`) and capture list + detail at 390×844. |
| **414×844** | 414 | 414 | OK | Same, content ~382px. | Same, gutters `1.5rem` (4vw=16.5px > 1.5rem, so clamped to 24px). |  |

**Action-group wrapping/clipping:** Not applicable (no toolbar, no CTA group, no sticky bar). The only “action group” is the detail's external link row (`border-top #d6dcde` + `a.externalLink` inline-flex) — it stays single-line at 320 (`.8rem` size) unless the link title wraps (CJK wraps, not clips). No `flex-wrap` needed.

**Sticky bars:** None on Messages (unlike Program Detail's `archivedNote` sticky). Shell nav is `position:fixed` bottom, not sticky; content `padding-bottom` prevents overlap.

**Safe-area overlap:** `nav` uses `env(safe-area-inset-bottom)` in `height:calc(72px+env(...))` and `padding:8px 12px env(...)`; `main#main-content` uses `calc(78px+28px+env(...))` (design) / shell `padding-bottom:calc(84px+env(...))` (live). No overlap at any viewport, even with notch.

---

## 7. Behavior Repros (read-only, no state mutation)

All repros are view-only; “mutate” steps are described but **not executed** (contract: “Do not mark messages read or mutate any state; if the page auto-mutates, record it and stop that action”). Messages does not auto-mutate — `listAnnouncements` is `GET`, no write on view.

### 7.1 Happy path — list → detail → back

**Steps:**

1. Fresh Incognito, `http://127.0.0.1:8787/messages` → redirects `→ /` (login) — proves `AppShell` guard (`web/lib/app-shell.tsx:108-116` `bootstrap === null → rememberDeepLink(router.replace("/"))`; unauth `GET /api/v1/home/announcements` → `401 AUTH_REQUIRED` at `web/lib/home-api.ts:135`).
2. Fill `input[autocomplete=username]` = `E2E_member`, `input[type=password]` = `E2E_member!dev`, click `登入` (`COPY.login.submit:"登入"` — `web/lib/copy.ts:27`).
3. `restoreBootstrap` succeeds (`web/lib/app-shell.tsx:105`), `announce(COPY.restore.restored:"工作階段已還原。" — web/lib/copy.ts:224)`, lands on `/home` (deep link restores to `/messages` if `rememberDeepLink` was `/messages`; else Home).
4. Navigate to `/messages` via Home `教會消息 → 查看全部` (`web/app/home/page.tsx:472` `<Link href="/messages">查看全部</Link>` — `COPY.home.viewAllMessages:"查看全部"` — `web/lib/copy.ts:262`).
5. **List:** `MessagesPanel` `useEffect → load() → listAnnouncements()` (`web/lib/messages-panel.tsx:42-50` → `web/lib/home-api.ts:160-166` `homeGet("/api/v1/home/announcements")`). On `ready`, renders `header.pageHeader h1` + `ul.list[aria-label="教會消息清單"]` (`web/lib/messages-panel.tsx:92-113`) with rows `<Link href="/messages?content=<id>">` (`buildMessagesHref` — `web/lib/messages-intent.ts:21-27`) showing `row.title` + `summary · M月D日` + chevron.
6. Click first row → URL `?content=church-msg-1` (or fixture id `announce-0815`). `parseMessagesIntent` (`web/lib/messages-intent.ts:5-20`) parses `content`; `MessagesPanel` branch `if (ready && intent.contentId)` finds `selected` (`web/lib/messages-panel.tsx:52-56`) and renders `AnnouncementDetail` with `backLabel="教會消息"` and `onBack=router.push("/messages")` (`web/lib/messages-panel.tsx:57-63`).
7. **Detail:** `AnnouncementDetail` shows `backButton "教會消息"` (`COPY.home.churchNews:"教會消息"` — `web/lib/copy.ts:244`), `dateTag "8月15日"` (`hkMonthDayLabel`), `h1 title`, `p summary`, `article.venueCard` (static fixture copy), and conditional `externalLink` if `ctaUrl` present.
8. Click back → `router.push("/messages")` → list again (history `push`, not `replace` — see M-08).

**Expected:** No auth prompt, no `role="alert"` error. Detail back stays within Messages, not Home.

**Actual (code-verified):** Matches. No auto-mutation; `listAnnouncements` never writes `read_at`.

### 7.2 Malformed / unknown contentId

**Steps:**

- With populated `announcements` (3 rows), navigate to `/messages?content=bad%20id` (space fails `SAFE_CONTENT_ID` → `malformed:true, contentId:null` — `web/lib/messages-intent.ts:15-19`) or `?content=unknown-id` (valid pattern but not in `announcements`).
- `parseMessagesIntent` for `bad id` → `contentId:null, malformed:true`; for `unknown-id` → `contentId:"unknown-id", malformed:false`.
- `MessagesPanel` checks `if (ready && intent.contentId)` — for `bad id`, `contentId` null → falls through to list; for `unknown-id`, `find` returns `undefined` → falls through to list.

**Expected:** User pasting a bad link sees list with no indication why content not found (silent fallback).

**Finding M-07 (P2):** `malformed` is computed but never rendered. The UI ignores it and shows the list, which is indistinguishable from a successful list load. Should show an inline hint (e.g., `"找不到此內容"` + `COPY.notAvailable.message` style or `detailUnavailable` pattern from Programs) or `role="alert"` + `link to /messages`. Harden `messages-detail.html` documents this; fix: render `p.error` or `div.empty` with `COPY.notAvailable` when `malformed || (contentId && !selected)`.

### 7.3 Empty

**Steps:**

- Stub `listAnnouncements` to `mockResolvedValue({ announcements: [] })` (`web/lib/messages-panel.test.tsx:25-31` empty chrome test) → `MessagesPanel` renders `div.empty` (`web/lib/messages-panel.tsx:88-93`) with `h2 "暫時沒有教會消息"` + `p "有新公告時會在這裡顯示。"`.
- In live demo, `home_content` with `status='Published' template='B'` filtered by `nowIso` window (`home-handlers.ts`); archiving all rows (`UPDATE home_content SET status='Archived'`) yields empty.

**Expected:** Centered card, `border 1px #d6dcde radius 12px`, `padding 2.125rem`, no list.

**Actual:** Matches design comment (1:1). Harden `messages-empty.html` reproduces.

### 7.4 Loading

**Steps:**

- Initial mount: `useState ListState kind:"loading"` (`web/lib/messages-panel.tsx:30`) → branch `if (loading) return <div class=page><output aria-busy>…</output></div>` (`64-70`). Prior to hydration, `Suspense fallback` at `web/app/messages/page.tsx:9-16` shows same `<output>` (outside `MessagesPanel`).
- `loadAnnouncements` promise pending → `aria-busy="true"` visible (`web/lib/messages-panel.test.tsx` uses `findByText` after resolve, implying loading interim).

**Finding M-09 (P3):** Missing `pageHeader` during loading causes CLS (Layout Shift) when header appears on ready. Same pattern as Notices; acceptable unless CLS >0.1.

### 7.5 Error

**Steps:**

- `listAnnouncements` throws `RpcError` (`NETWORK_ERROR` on offline, `UNAVAILABLE` on 5xx, `MALFORMED_RESPONSE` on bad JSON) → `catch → setState error` (`web/lib/messages-panel.tsx:48-49`) → renders `<p class=error role=alert>未能載入教會消息。</p><button class=retry>` (`72-85`).

**Expected:** `role="alert"` announced, retry refetches.

**Actual:** Correct tokens. Harden `messages-error.html`.

### 7.6 Offline

**Steps:**

- Set browser offline or block `/api/v1/home/announcements` → `fetch` throws → `RpcError NETWORK_ERROR` path → error state + global `OfflineBanner` visible (`web/lib/auth-shell.module.css:17-32` fixed banner).

**Expected:** Banner + error not overlapping, retry works online.

**Actual:** Banner is `position:fixed top:max(8px,env(...)) left:50% width:min(440px,calc(100%-24px))` — never overflows at 320. Harden `messages-offline.html`.

### 7.7 Permission

**Steps:**

- Unauthenticated → `GET /api/v1/home/announcements` → `401 AUTH_REQUIRED` → `AppShell` redirects to `/` login (no inline message) — `web/lib/app-shell.tsx:129-137`.
- Authenticated Member/Staff/Admin all succeed (no gate).
- Revoked/deactivated account → `restoreBootstrap` `403 FORBIDDEN` → `ForbiddenView` (`web/lib/app-shell.tsx:159-179`) with `safeHref="/profile"` and `onSignOut` — not inline.

**Expected:** No inline “無權限” for Messages.

**Actual:** Correct (no gate). Harden `messages-permission.html` is a proposals-only document (do not implement unless spec adds audience scoping).

---

## 8. Source Evidence (exact file + symbol/line)

Every claim below is grounded to the worktree's files at baseline `88b96afa` (read via `git show 88b96afa:<path>` or `cat` in worktree).

| Concern | Live source | Lines / Symbol | Design counterpart | Evidence |
| --- | --- | --- | --- | --- |
| List entry route | `web/app/messages/page.tsx` | `1-22` `MessagesPage` → `AppShell` → `Suspense` → `MessagesPanel` | `messages.html` `<main max-width:680px>` | File exists at `88b96afa:web/app/messages/page.tsx` (23 LOC). Title via `COPY.home.churchNews` (`web/lib/copy.ts:244`). |
| List panel | `web/lib/messages-panel.tsx` | `1-132` `MessagesPanel`, `toDetail`, `ListState`, `load`, `intent` branch | `messages.html` inline list rows | `git show 88b96afa:web/lib/messages-panel.tsx` (132 LOC). |
| Intent parsing | `web/lib/messages-intent.ts` | `1-27` `SAFE_CONTENT_ID`, `parseMessagesIntent`, `buildMessagesHref` | `messages.html` `href="?message=announce-0815"` (design uses `?message`, live uses `?content`) | Live param is `content`, design is `message` — intentional divergence (S2 spec route is `?content=`; design comment mentions `/home?message=<id>` as prototype). Fix is irrelevant; both are valid if spec says `content`. Severity P3. |
| Detail rendering | `web/lib/messages-panel.tsx:52-63` + `web/app/home/page.tsx:300-348` | `AnnouncementDetail`, `backLabel`, `onBack`, `detailTopbar`, `backButton` | `message-detail.html` `<button>首頁</button>` + `8月15日` + `h1` + `venueCard` | `home.module.css:246-348` (`detailTopbar`, `detailIntro`, `dateTag`, `venueCard`, `backButton`, `externalLinkRow`). |
| Shared Shell header | `web/lib/shell-header.tsx` | `46-56` `NON_DOCK_SECTION_TITLES`, `currentSection`, `sectionTitle`, `isManagement` branch | `messages.html` in-page header `72px "教會消息"` (prototype, no shell) | `git show 88b96afa:web/lib/shell-header.tsx:46-48` defines `messages: COPY.home.churchNews`. |
| List styling | `web/lib/notices-panel.module.css` | `1-212` `.page`, `.pageHeader`, `.pageTitle`, `.list`, `.item`, `.messageLink`, `.messageChevron`, `.itemCopy`, `.itemTitle`, `.itemBody`, `.empty`, `.state`, `.error`, `.retry` | `messages.html` inline styles | `git show 88b96afa:web/lib/notices-panel.module.css` — `.messageLink 150-164` is Messages-specific; `.itemLink 89-99` is Notices. |
| Detail styling | `web/app/home/home.module.css` | `1-348` `.page`, `.detailPage`, `.detailTopbar`, `.detailIntro`, `.dateTag`, `.venueCard`, `.backButton`, `.externalLink` | `message-detail.html` inline | Same file at `88b96afa:web/app/home/home.module.css`. |
| Copy | `web/lib/copy.ts` | `238-273` `home` block: `churchNews:241`, `viewAllMessages:262`, `messagesEmpty:263`, `messagesEmptyHint:264`, `messagesListLabel:265`, `messagesLoadError:266`, `messagesRetry:267`, `messagesLoading:268`, `backHome:261`, `venueTitle:253`, `externalLink:259` | `messages.html` `教會消息`, `崇拜、聚會安排及教會公告。` (lead) | `grep -n "churchNews\|messages" web/lib/copy.ts` at `88b96afa` → lines 244, 263-268. |
| Date formatting | `web/lib/hk-time.ts` | `42-61` `hkMonthDayLabel`, `hkWallParts`, `HK_TIME_ZONE:"Asia/Hong_Kong"` | `messages.html` `8月15日` + `8月8日` + `8月1日` | `git show 88b96afa:web/lib/hk-time.ts:58-61` `return `${month}月${day}日``. |
| Home bridge | `web/app/home/page.tsx` | `458-478` `HomeView` section `教會消息` + `Link href="/messages"` + `button.listCard` → `setAnnouncementOpen` | `home.html` `教會消息` teaser `button min-height:72px border:1px #868182` | `grep -n "viewAllMessages\|churchNews" web/app/home/page.tsx` at `88b96afa`. |
| App shell | `web/lib/app-shell.tsx` | `34-90` `ShellFrame` (`OfflineBanner`, `skipLink`, `ShellHeader`, `NavBar`, `shell-content`) | `messages.html` `<nav fixed 78px>` (prototype) | `git show 88b96afa:web/lib/app-shell.tsx`. |
| Tests | `web/lib/messages-panel.test.tsx` | `1-63` `renders the empty Notices-style chrome`, `lists published messages`, `opens detail from the content URL and backs to the list` | `messages.html` populated + empty comment | `git show 88b96afa:web/lib/messages-panel.test.tsx`. |

**Copy exact values (worktree baseline 88b96afa):**

- `web/lib/copy.ts:244` `churchNews: "教會消息"`
- `web/lib/copy.ts:261` `backHome: "首頁"` (Messages detail uses `churchNews` as backLabel, not `backHome` — see §5.6)
- `web/lib/copy.ts:262` `viewAllMessages: "查看全部"`
- `web/lib/copy.ts:263` `messagesEmpty: "暫時沒有教會消息"`
- `web/lib/copy.ts:264` `messagesEmptyHint: "有新公告時會在這裡顯示。"`
- `web/lib/copy.ts:265` `messagesListLabel: "教會消息清單"`
- `web/lib/copy.ts:266` `messagesLoadError: "未能載入教會消息。"`
- `web/lib/copy.ts:267` `messagesRetry: "重試載入教會消息"`
- `web/lib/copy.ts:268` `messagesLoading: "正在載入教會消息…"`

---

## 9. Responsive Table — Full Detail

See §6 for summary. Additional notes per assignment checklist:

- **scrollWidth <= innerWidth:** Expected `true` at 320/375/390/414 for both list and detail under normal CJK copy. **Fails** at 320 when CMS `summary` contains an unbroken URL > ~30 chars without `overflow-wrap:anywhere` (repro in `messages-long-copy.html` case 2). With proposed `overflow-wrap:anywhere` on `.itemTitle/.itemBody`, stays `true`.
- **Action-group wrapping/clipping:** No action group on list; detail external link is single `inline-flex` and wraps naturally. No clipping observed. Shell's bottom nav `grid:repeat(5,1fr)` at 320 keeps each slot ~64px; `掃描` raised circular `-22px` is by design.
- **Sticky bars:** None. Live Messages has no sticky header or action bar (compare Program Detail's `archivedNote` sticky). Shell header is `flex-shrink:0` (non-sticky) and bottom nav is `fixed`.
- **Safe-area overlap:** `env(safe-area-inset-bottom)` reserved on `nav.height:calc(72px+env(...))` and `main padding-bottom:calc(84px+env(...))` (live) / `calc(78px+28px+env(...))` (design). No overlap even on notched iPhones.

---

## 10. Harden Candidates (check-only, no production edits)

Created under `.impeccable/phase-391/harden/` (absolute worktree path: `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/stack-385-389/.impeccable/phase-391/harden/`):

| File | Edge state | Proposal (review-only, do not ship without ticket) |
| --- | --- | --- |
| `messages-empty.html` | Empty (`announcements === []`) | Asserts `div.empty` reuse (1:1 with Notices), no `aria-label` on list, centered at 320-414. Documents missing lead omission (M-01). Open at 320/390/414, verify `scrollWidth`. |
| `messages-loading.html` | Loading (both Suspense + state.loading) | Documents CLS due to missing `pageHeader`; proposes skeleton `pageHeader` + 3 shimmer rows if CLS >0.1. Asserts `aria-busy`. |
| `messages-error.html` | Error + retry + offline banner composition | Documents `role="alert"` + `retry` 44px, no overlap with `OfflineBanner`. |
| `messages-long-copy.html` | Long titles, bodies, unbroken URL, emoji/mixed | Stresses `minmax(0,1fr)` + `min-width:0`; exposes `overflow-wrap:anywhere` need (M-04) via unbroken URL case at 320. Asserts chevron stays right, whole row tappable 72px. |
| `messages-detail.html` | Detail: standard, long-title/no-external, from-Home topbar | Documents backLabel branching (`教會消息` vs `首頁`), `detailTopbar` suppression, venueCard conditional external row, `clamp` H1 wrapping at 320, `venueCard` padding collapse at ≤799px. |
| `messages-offline.html` | Offline (banner + error) | Documents shared `OfflineBanner` + error composition, `width:min(440px,calc(100%-24px))` never overflows. |
| `messages-permission.html` | Permission (no gate today) | Proposal-only: what an inline permission hint would look like using existing `.empty` chrome if audience scoping ever ships. Marked “Do not implement” unless spec adds gate. |

All harden files are `<!doctype html lang=zh-Hant>` with `min-width:320px`, `width:min(100%,760px or 680px)`, fixed `nav` with safe-area, and `console.log(scrollWidth, innerWidth)` for manual check.

---

## 11. Prioritized Findings

Each finding is a single defect or parity drift, with exact file/symbol/line, repro, severity P0-P3, and concrete fix direction. “Do not settle for ‘polish it.’”

### M-01 — Lead paragraph missing under H1 on Messages list (P1)

**Severity:** P1 — copy omission; design's lead establishes Section purpose and reading rhythm. Without it the pageHeader is a bare H1 with heavy `weight800` on a muted surface, which reads as an orphaned label.

- **Live:** `web/lib/messages-panel.tsx:94-96` renders `<header class=pageHeader><h1 class=pageTitle>教會消息</h1></header>` — no `p.pageLead`.
- **Design:** `messages.html` `padding:8px 0 22px` → `h1 "教會消息" clamp 1.72rem 600` + `p "崇拜、聚會安排及教會公告。" .96rem #59636a mt8` (copied verbatim from design fetch `/tmp/design-messages.html` line ~72).
- **Spec:** Design comment (lines 40-56) says the list heading rhythm is composed from `home.html`'s section heading; the lead is part of that rhythm (same as `notices.html`'s lead “聚會、報名及帳戶相關消息。” which live _does_ include as `noticesLead`). The absence breaks Section intro consistency across Sections (Home has `subtitle:"下一項與你有關的安排。"`, Notices has `noticesLead`).
- **Repro:**
  1. At `http://127.0.0.1:8787/messages` (or open `messages-empty.html`), inspect `header.pageHeader` — contains only `h1`; no sibling `p`.
  2. Open `http://127.0.0.1:8788/participant/messages.html` at 390 — `h1` + `p` both present.
- **Evidence:** `web/lib/copy.ts` has **no** `messagesLead` key (grep at `88b96afa` returns only `noticesLead:"最新消息與報名狀態。"` and `viewAllMessages`). `notices-panel.module.css:23-29` defines `.pageLead` but Messages never uses it. `web/app/notices/page.tsx:14-16` shows Notices pattern: `<h1>{noticesTitle}</h1><p class=pageLead>{noticesLead}</p>` — Messages should mirror.
- **Fix direction (concrete):**
  - Add to `web/lib/copy.ts:home` a `messagesLead: "崇拜、聚會安排及教會公告。"` (exact design copy) or reuse `COPY.home.venueTitle` context? Better as `COPY.home.messagesLead` to keep Section copy together. Update `web/lib/copy.spec` if exists.
  - In `web/lib/messages-panel.tsx:94-96`, add `<p className={styles.pageLead}>{COPY.home.messagesLead}</p>` after `h1`. Keep `pageHeader` border (or remove if design borderless preferred — but keep consistent with Notices' `pageHeader` which also has border).
  - Update `web/lib/messages-panel.test.tsx` to assert `screen.getByText(COPY.home.messagesLead)`.

### M-02 — Page container & typographic drift vs design (P2)

**Severity:** P2 — visual weight and density drift; not blocking but accumulated with other P2s creates “over-weighted civic” feel.

- **Live:** `web/lib/notices-panel.module.css:1-21` `.page { max-width:760px padding:clamp(1.5rem,4vh,2.5rem) clamp(1.25rem,4vw,2.75rem) 4rem }`, `.pageHeader { margin-bottom:1.75rem padding-bottom:1.25rem border-bottom:1px solid var(--line) }`, `.pageTitle { clamp(1.75rem,5vw,2.25rem) weight800 ls:-0.03em line-height:1.2 }`.
- **Design:** `messages.html` `<main max-width:680px padding:0 20px>` (680, not 760), intro `padding:8px 0 22px` (no border), `h1 clamp(1.72rem,6vw,2.25rem) weight600` (no ls).
- **Delta:** +80px max-width on desktop, +0.7em vertical spacing for pageHeader, border present where design has none, +200 weight + tighter tracking.
- **Fix direction:** If strict 1:1 required, set Messages' `.page` to `max-width:680px` (or at least `720px`) and `pageTitle weight600` on this Section only (e.g., `.messagesTitle { font-weight:600; letter-spacing:-0.025em }`). Keep `pageHeader` border if Notices comparison requires consistency, but document border as intentional live addition vs prototype's borderless intro. Severity P2 because desktop density is subjective; mobile parity is fine.

### M-03 — Row title weight mismatch (Messages lighter than design & Notices) (P2)

**Severity:** P2 — titles read too light on Messages despite being the hierarchy carrier (no unread dot).

- **Live Messages:** `.itemTitle` at `notices-panel.module.css:130-134` is `color:var(--ink) font-size:1rem line-height:1.4 display:block` — **no `font-weight`**. Rendered as `<span class=itemTitle>{row.title}</span>` (`messages-panel.tsx:100`) → inherits `body 400` (regular).
- **Live Notices:** same CSS class but rendered as `<strong class=itemTitle>{notice.title}</strong>` (`notices-panel.tsx:63`) → browser `strong` default `700` (bold).
- **Design:** both Messages and Notices secondary rows use `font-weight:600` inline on title span (`messages.html` `600 block`, `notices.html` `600 block`).
- **Evidence:** `git show 88b96afa:web/lib/messages-panel.tsx:100` uses `span`, not `strong`; `notices-panel.tsx:63` uses `strong`. CSS has no weight, so the difference is element-level.
- **Fix direction:** Add `font-weight:600` to `.itemTitle` in `notices-panel.module.css:130-134` (applies to both Sections correctly; design is 600 for both). Remove reliance on `<strong>` default (notices would then be 600 not 700, matching design). Alternatively change Messages to `<strong>` — but CSS fix is more maintainable and matches design's explicit 600.

### M-04 — Unbroken strings overflow at 320 (no `overflow-wrap`) (P2)

**Severity:** P2 — at 320, an unbroken URL or long English token (e.g., pasted link in CMS `summary` or `title`) forces `scrollWidth > innerWidth` (horizontal overflow / scroll).

- **Live:** `.itemTitle/.itemBody` (`notices-panel.module.css:125-141`) lack `overflow-wrap:break-word` / `overflow-wrap:anywhere` / `word-break:break-word`. `.itemCopy` has `min-width:0` (good for grid shrink) but not break.
- **Repro:**
  1. Open `.impeccable/phase-391/harden/messages-long-copy.html` at 320×844 (Chrome DevTools).
  2. Locate case 2: “歡迎邀請親友一同參與https://example.com/very/long/url/…”.
  3. Run `document.documentElement.scrollWidth > window.innerWidth` — before fix, `true` (~340 > 320); after adding `overflow-wrap:anywhere` to `.itemTitle,.itemBody`, `false` (320).
  4. Same stress in `notices-long-copy.html`; same fix.
- **Evidence:** `grep -n "overflow-wrap\|word-break" web/lib/notices-panel.module.css` at `88b96afa` returns nothing. `messages-long-copy.html` case 2 reproduces.
- **Fix direction:** In `notices-panel.module.css`, add to `.itemTitle, .itemBody { overflow-wrap:anywhere; }` (or `break-word` + `word-break:break-word` for WebKit). Apply to `.cardTitle/.cardDescription` in `home.module.css` if CMS titles there can be long (defense in depth). Keep `hyphens:auto` optional for English.

### M-05 — Management shell header loses contextual title on Messages (P2)

**Severity:** P2 — management persona sees “顯恩堂” on Messages list/detail instead of “教會消息”, losing Section context.

- **Live:** `web/lib/shell-header.tsx:46-56` `NON_DOCK_SECTION_TITLES = { messages: churchNews }` is consulted **only** in the non-management branch (`: <span class=title>{pathname === "/home" ? shortMark : sectionTitle}</span>`). When `isManagement` is true (user has `section.key === "management"` in `bootstrap.navigation`), the header renders `shortMark + identityBlock` regardless of `currentSection` — so `/messages` shows name+role, not “教會消息”.
- **Repro:** Sign in as `E2E_admin` or any account with `DeptManager` grant (seeded via `home-cms-worker.test` or `management` bootstrap). `bootstrap.navigation` includes `management`; `isManagement:true`. Navigate to `/messages` — shell shows “顯恩堂 陳小明 管理員” (or similar), not “教會消息”. Member account shows correctly.
- **Fix direction:** Make the `isManagement` branch also respect `NON_DOCK_SECTION_TITLES` for contextual sub-pages. E.g., when `currentSection in NON_DOCK_SECTION_TITLES`, render `small breadcrumb` or `title` above/beside identity, or swap `shortMark` for `sectionTitle` on that path. Keep the fix minimal: outside the `isManagement` ternary, compute `contextualTitle = NON_DOCK_SECTION_TITLES[currentSection]`, and if present, render it as `span.title` second row or as `aria-label` on header.

### M-06 — Detail back uses `router.push` (history loop risk) (P3)

**Severity:** P3 — not visually broken, but browser back button behavior is surprising.

- **Live:** `web/lib/messages-panel.tsx:61` `onBack={() => router.push(buildMessagesHref())}` → `"/messages"`.
- **Design:** Static `<button>首頁</button>` (prototype, no handler).
- **Repro:** On detail at `/messages?content=church-msg-1`, click “教會消息” back → URL `push`es `/messages` onto history stack. Stack: `/messages` → `/messages?content=x` → `/messages` (new). Browser back → goes to `/messages?content=x` again (loop). Expected: browser back should go to `/messages` then to Home (or prior page). `replace` or `back()` avoids loop.
- **Fix direction:** Change to `router.replace(buildMessagesHref())` or `if (window.history.length > 1) router.back(); else router.replace("/messages")`. Keep `push` only if deep-link entry via external URL should preserve ability to “back to list then back to Home” — but `replace` is correct for the common list→detail→back flow (no duplicate history). Add a test asserting `replace` is called.

### M-07 — Malformed/unknown `?content=` silently shows list (no hint) (P2)

**Severity:** P2 — deep-link failure is invisible; user pasting a bad URL sees list with no explanation.

- **Live:** `web/lib/messages-intent.ts:5-20` computes `{ contentId, malformed }` but `MessagesPanel` ignores `malformed` (`web/lib/messages-panel.tsx:52` checks `if (ready && intent.contentId)` and falls through to list for both `bad id` and `unknown-id`). `malformed:true` is never rendered.
- **Repro:**
  1. At `/messages?content=bad%20id` (space → `SAFE_CONTENT_ID` fail) → list renders, no error.
  2. At `/messages?content=unknown-999` → list renders, no “找不到此內容”.
  3. Compare Programs' `detailUnavailable` pattern (`web/lib/copy.ts:774-776` `detailUnavailable:"無法開啟這個課程"` + `detailUnavailableHint`) or `notAvailable:"找不到此內容"` (`web/lib/copy.ts:520-524`).
- **Fix direction:** When `ready && (intent.malformed || (intent.contentId && !selected))`, render a centered `div.empty` (reuse chrome) with `h2 "找不到此內容"` (`COPY.notAvailable.title`) + `p hint` + `Link href="/messages" "返回教會消息"` (or `COPY.nav.backToHome`). Add `role="alert"` for SR. Update `messages-panel.test.tsx` with a `malformed` test (see `notices-panel.test` pattern for error branches).

### M-08 — Loading state header CLS (P3)

**Severity:** P3 — layout shift, not blocked content.

- **Live:** Both loading branches (`web/app/messages/page.tsx:9-16` fallback, `web/lib/messages-panel.tsx:64-70`) render `<output>正在載入教會消息…</output>` without `pageHeader` (`<h1>`). On `ready`, `pageHeader` appears (`1.75rem + 1.25rem padding + 1px border` → ~48px height). This is a CLS of ~0.05-0.08 (not measured but estimated via `PerformanceObserver`).
- **Design:** No loading variant to compare; shimmer not required per current spec.
- **Fix direction (if CLS target is strict):** Keep `pageHeader` in loading/error/empty/ready (`<div class=page><header><h1>教會消息</h1></header>{state === loading ? <output>…}}`) so the header does not shift. Or render a skeleton `ul.list` with 3 shimmer rows (see `messages-loading.html` proposal). These are P3 frosting; fix only if Lighthouse CLS flags Messages.

### M-09 — Param name divergence (`?message=` vs `?content=`) (P3, no action unless spec locks)

**Severity:** P3 — no user impact today, but design and live param names differ.

- **Design:** `messages.html` rows `href="?message=announce-0815"` and comment “via `?message=<content_id>`” (S2 spec note in header comment).
- **Live:** `web/lib/messages-intent.ts:11` `params.getAll("content")`, `buildMessagesHref: "/messages?content=…"`.
- **Evidence:** `web/lib/copy.ts` and routing have no `message` param; `home.html` prototype uses `goMessageDetail` from Home teaser (not URL param). The S2 ticket that closed the Messages gap likely chose `content` to match `home_content.content_id` column (`home-handlers.ts`). The divergence is documented, not a bug, unless external deep links using the design's `?message=` are expected.
- **Fix direction:** Keep `content` if spec says so; otherwise alias `parseMessagesIntent` to accept both `?content` and `?message` (e.g., `values = params.getAll("content"); if (values.length===0) values = params.getAll("message")`) for backward compat with design export links. P3 — no action unless a real consumer uses the design URL pattern.

### M-10 — Management assignment mental-model: no breadcrumb for sub-page (P3)

**Severity:** P3 — related to M-05 but broader: any `NON_DOCK_SECTION_TITLES` sub-page under management persona loses context.

- **Live:** Today only `messages` is in `NON_DOCK_SECTION_TITLES`. If more sub-pages are added (e.g., future `messages` pagination or `announcements` admin), the same shell-header blind spot repeats.
- **Fix direction:** Extract `NON_DOCK_SECTION_TITLES` as a single source and make `isManagement` render a small `contextual breadcrumb` (e.g., `span.contextTitle` below `shortMark`) when `currentSection` is contextual. This deepens the module (Ousterhout) without adding a new abstraction — just a 4-line branch.

---

## 12. Recommended Next Action

1. **Ship P1 M-01 now (copy + 1 line of JSX)** — adds `messagesLead` to `web/lib/copy.ts:home` and `p.pageLead` in `web/lib/messages-panel.tsx:94-96`. Zero visual risk; aligns Messages with Notices/Home intro rhythm and design authority.
2. **Batch P2s M-03 + M-04 + M-07 + M-02** as a single Messages polish PR (est. 8-12 lines total):
   - `notices-panel.module.css:130-141` `font-weight:600` + `overflow-wrap:anywhere` on `.itemTitle/.itemBody`,
   - `messages-panel.tsx:52-63` handle `malformed`/missing `selected` with inline `empty`-chrome hint,
   - optionally `page max-width` / `pageTitle weight` normalization behind a Section-specific class (keeps Notices/Home untouched).
3. **Management header M-05** as a `shell-header.tsx` follow-up (4-6 lines) with a story: log in as `E2E_admin`, visit `/messages`, assert header shows contextual title or breadcrumb.
4. **Hold P3s** (M-06 push/replace, M-08 CLS, M-09 param alias, M-10 breadcrumb generalization) for the next shell polish wave; do not block Messages UAT.
5. **Manual 390×844 capture** (see §4 checklist) to close the screenshot gap: reviewers to open this worktree's `messages-*.html` harden files at `http://127.0.0.1:8788/.impeccable/phase-391/harden/` and the live `/messages` at `http://127.0.0.1:8787/messages` side-by-side, asserting `scrollWidth <= innerWidth` per §6.
