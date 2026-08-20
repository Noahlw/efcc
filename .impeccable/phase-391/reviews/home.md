# Home Section — Live-vs-Design Reconnaissance (S2 Visual-Parity)

**Branch:** `feat/391-polish-on-88b96af` · **Baseline:** `88b96afa` · **Worktree:** `.worktrees/stack-385-389` **Date:** 2026-08-20 · **Assessor:** HomeRecon (read-only) **Mandate:** Review authenticated Home Section and Home Explore → Program entry point; no production edits, no state mutation beyond view.

---

## 1. Method and Viewport

| Axis | Detail |
| --- | --- |
| **Live source inspected** | `web/app/home/page.tsx` (528 LOC) and `web/app/home/home.module.css` (348 LOC); `web/lib/app-shell.tsx`, `web/lib/nav-bar.tsx`, `web/lib/shell-header.tsx`, `web/lib/copy.ts`, `web/lib/home-api.ts`, `web/lib/hk-time.ts`, `web/lib/programs/programs-intent.ts`, `web/lib/programs/programs-boundary.tsx` sampled only where the Home entry surface delegates to Shared Shell or Programs boundary. |
| **Design authority** | `http://127.0.0.1:8788/participant/home.html` (static export, inline-style prototype, 8-17 date sample) — baseline for hierarchy, tokens, card composition, shell chrome, CTA placement. Fetched via `read(http://127.0.0.1:8788/participant/home.html:raw)` and `ctx_fetch` cache. |
| **Live entry** | `http://127.0.0.1:8787/home` — authenticated route behind `AppShell` + `restoreBootstrap` cookie guard. `read(http://127.0.0.1:8787/home)` without cookie returns `正在還原工作階段…` placeholder (bootstrap spinner), confirming the auth gate. Authenticated behavior verified via code path + Playwright stubs in `tests/e2e/home.test.ts`, not via live credentialed click (see Fixture State). |
| **Viewports** | Spec requires 320 / 375 / 390 / 414, with 390×844 mandatory. Measured by CSS reasoning + token inspection and by the static export’s `min-width:320px` / `clamp(1rem,4vw,1.5rem)` / `width:min(100%,680px)` constraints. Where a headless screenshot tool was unavailable in this container, scrollWidth / wrapping / touch-target were derived from computed style analysis and flagged for manual 390×844 spot-check. |
| **Tooling** | `read` for source and URL fetches; `ctx_execute` for CSS token / intent / fixture audits; no `pnpm test` / lint / build per constraints. Fresh browser context requirement noted; see Screenshots section for artifact strategy. |

**Grounding verification (2026-08-20):** All source citations re-validated against worktree `.worktrees/stack-385-389` at `88b96afa` (polish 391 fix A) and HEAD `15956de` (docs: plan only — `git diff --stat 88b96afa..HEAD` shows `CONTEXT.md` + `docs/omp-plans/2026-08-20-s2-participant-visual-parity.md` only; `web/app/home/page.tsx` 528 LOC, `home.module.css` 348 LOC, `copy.ts` 1300 LOC, `programs-boundary.tsx` 842 LOC identical between the two). Repo root at `566fa198` (Member header #384) is **not** the basis — root `web/app/home/page.tsx` is 517 LOC and `copy.ts` lacks `viewAllMessages/messagesEmpty` keys added on stack, so that root was explicitly excluded. Key evidence `href="/programs"` at `page.tsx:502-504` and `buildProgramsHref` at `417` confirmed via `git show 88b96afa:web/app/home/page.tsx | grep -n`. No participant-directory search-icon claim was made in this report; that divergence is stack-local (stack has `directorySearch` with SVG at 248, root has `catalogSearchLabel` label).

**Read-only contract:** No `POST`/`PATCH`/`DELETE` to enrollment, attendance, or CMS surfaces. `E2E_member / E2E_member!dev` viewed only via bootstrap trace, never used to submit/approve/cancel.

---

## 2. Fixture State

| Layer | State |
| --- | --- |
| **D1 seed** | Local Wrangler disposable fixtures (`pnpm db:seed:local` + `pnpm db:seed:demo` in repo docs). `DEV_MEMBER = {userId:"U-E2E-MEMBER", username:"E2E_member", role:"Member"}` from `tests/e2e/dev-fixtures.ts:32-37`. |
| **Home stubs (Playwright)** | `tests/e2e/home.test.ts:56-125` defines `stubHomeEndpoint` defaults: `featuredEvent: {eventId:"e-101", programId:"p-disc", programTitle:"門徒訓練基礎課", title:"第三課聚會", startsAt:"2026-08-20T11:30:00Z", endsAt:"2026-08-20T13:00:00Z", location:"二樓禮堂"}`; `announcement: {contentId:"c-001", title:"本週崇拜及聚會安排", summary:"請留意本週三晚聚會改於二樓禮堂舉行。其他聚會時間維持不變。", publishedAt:"8月15日"}`; `exploreProgram: {programId:"p-intro", title:"慕道入門課程", summary:"現正接受報名 · 9月7日開始"}`. These are the visual-parity fixtures for enrolled vs empty (`featuredEvent:null`) splits. |
| **Bootstrap projection** | `getHome()` → `HomeData {featuredEvent, announcement, exploreProgram}` via `web/lib/home-api.ts:135`. On `catch` the HomeView falls through to `loadParticipantProjection()` which queries `listParticipantCatalog()` filtered to `lifecycle===Active && discoverability===Listed`, then picks the smallest `display_order` program where `enrollment_mode===MemberRequest` as `featuredProgram` and the earliest upcoming `Active` event from any `Active` enrollment (see `web/app/home/page.tsx:124-190`). When both sources are null the empty state renders. |
| **Shared Shell fixture** | Non-management Member nav projection (5 slots): `home / programs / scanner / notices / profile` via `stableNavigationSections("Member")` — verified in `tests/e2e/home.test.ts` and `web/lib/nav-bar.tsx:118-152`. |
| **Live API probe** | `GET http://127.0.0.1:8787/api/v1/home` unauthenticated returned `401 AUTH_REQUIRED {"detail":"Access cookie missing."}` confirming the cookie-only transport guard (no repro auth header). |

---

## 3. Live URL and Design URL

- **Live (authenticated):** `http://127.0.0.1:8787/home` — rendered by `web/app/home/page.tsx:522-528` (`HomePage` → `AppShell` → `HomeView`) on top of `web/app/globals.css` + `web/lib/auth-shell.module.css` + `web/app/home/home.module.css`.
- **Design (static authority):** `http://127.0.0.1:8788/participant/home.html` — inline-style export, Cantonese copy, church civic tokens. Title `顯恩堂 · 會員及簽到 · 首頁 Home`. Header `顯恩堂` + `示範資料` pill, date `星期日 · 8月17日`.
- **Code ground truth for copy:** `web/lib/copy.ts:238-273` (`COPY.home.*`).

---

## 4. Screenshots

> The harness asks for captured screenshots at 320/375/390/414 with 390×844 mandatory, in a fresh browser context under `E2E_member`. This container had no headed-browser screenshot capability wired to the Wrangler-authenticated surface (no `playwright screenshot` invocation against `127.0.0.1:8787` with cookie injection in this read-only wave). The assessment compensates with three artifacts:
>
> 1. **Design fetch** — `read(http://127.0.0.1:8788/participant/home.html:raw)` succeeded (200) and was retained inline; its inline styles are the visual contract.
> 2. **Live code + token truth** — `home.module.css` + `globals.css` + `auth-shell.module.css` fully describe the rendered box model; scrollWidth / wrapping / touch-target were derived from those values (see Responsive Table).
> 3. **Harden proposals** — `.impeccable/phase-391/harden/home-*.html` are static, offline-openable viewports (320/390/414) that replicate the live DOM with edge-state injections for reviewers to open at `http://127.0.0.1:8788` or file://.

**Reviewer action to produce the mandatory 390×844 pair:** Open `http://127.0.0.1:8787/home` in a fresh Incognito, sign in as `E2E_member / E2E_member!dev`, set viewport 390×844, capture Home enrolled + empty toggle; side-by-side with `http://127.0.0.1:8788/participant/home.html`. Record `document.documentElement.scrollWidth <= window.innerWidth` (expected true) and note any `.nav-phone` overlap with `#shell-content` bottom padding.

Suggested capture checklist (not executed in this read-only wave, but asserted for the next live pass):

- [ ] 390×844 enrolled: `dateTag` → `早晨，陳小明` → `已報名` badge → `門徒訓練基礎課` → event rows (calendar/clock/pin) → `查看聚會` cinnabar CTA → `教會消息` listCard → `探索` `全部課程` → `慕道入門課程` listCard → dock `首頁` active.
- [ ] 390×844 empty: `暫時沒有與你有關的聚會` + `探索課程` CTA → `探索` still visible.
- [ ] 320 × 600 narrow: confirm primaryAction does not wrap/clip, sectionHeading does not overflow, listCard grid stays `minmax(0,1fr) auto`.
- [ ] Design at same widths for parity delta.

---

## 5. Visual Comparison — Design Director Pass

### 5.1 Global Tokens and Surface

The live is AUTHORED, not approximated. `web/app/globals.css:1-40` correctly sources Variant A Civic Minimal: `--surface #f4f5f3`, `--surface-raised #ffffff`, `--ink #171a1d`, `--ink-muted #59636a`, `--line #d6dcde`, `--line-strong #aeb8bc`, `--accent #9c302c`, `--accent-deep #76231f`, `--focus #176a87`, `--success #2e6b37 / #eef4ef / #b9cfbe`. Shell chrome (`web/lib/auth-shell.module.css`) reuses the same vars with literal fallbacks, so the design’s `#f4f5f3` page, white cards, hairline borders, and cinnabar CTA translate 1:1. The shell `skipLink` + `OfflineBanner` are additive and do not disturb the document quiet.

**Verdict: PASS — token parity is high; no civic redesign needed.**

### 5.2 Hierarchy (Home Section)

Design order (top to bottom):

1. 72px header (`顯恩堂` + `示範資料` pill)
2. Intro block `padding 8 0 22`, `dateTag` monospace `0.72rem weight 600 letter-spacing 0.08em uppercase`, `h1 clamp 1.72-2.25rem weight 600 ls -0.025em`, `p 0.96rem muted line 1.6`
3. EventCard `padding 22, border 1, radius 10, white` → badge (`pill`) → programTitle muted 0.86 rem → h2 1.5 rem → eventDetails grid gap 9 muted → primary CTA 48px cinnabar
4. Church News section heading `1.14rem weight 650` (no link in design header?) → listCard 72px `border #868182`
5. Explore section heading `探索` + ghost `全部課程` `44px min-height padding 8 2` → listCard 72px identical
6. Bottom dock fixed 78px + safe-area, 5 tabs with scan raised

Live order matches, with two additive divergences described in card composition. The `page` wrapper (`width min(100%,680px) margin 0 auto padding 0 clamp(1rem,4vw,1.5rem) 2rem`) caps the reading measure correctly; intro `greetingDate()` uses `Intl.DateTimeFormat zh-Hant-HK weekday long` (e.g. `星期三 · 8月20日`) whereas design shows `星期日 · 8月17日` — same pattern, different fixture date, parity PASS.

### 5.3 Card Composition

**EventCard (enrolled):** Live `web/app/home/page.tsx:437-454` replicates design faithfully: `enrolledBadge` (`display:inline-flex fit-content 28px padding 4 9 pill border success-border bg success-surface color success weight650 0.75rem`) → conditional `programTitle` muted → conditional `h2` title → `eventDetails` grid → `<Link href={eventHref} className={styles.primaryAction}>查看聚會</Link>`.  
Delta: design badge values are `border #9cb49d bg #e9f0ea` while live token is `#b9cfbe / #eef4ef` — visually indistinguishable (both civic green), severity P3. Iconography (`Icon name="calendar"|"clock"|"pin"` with `strokeWidth 1.8`) matches the export’s symbol set. The CTA’s `min-height 48` + `border-radius 9` + `hover border #76231f bg #76231f` is identical to the export hover comment `background:#8c2e2a` (close enough; token is deeper). **PASS with P3 token-note.**

**Announcement / Church News:** Design: `button` listCard `padding16 grid 1fr auto gap14 min-height72 border #868182 radius10` with title `font-weight600` and description `margin-top5 color #59636a .88rem`. Live `web/app/home/page.tsx:465-491` wraps it as `<section class=section aria-labelledby="church-news-heading"><div.sectionHeading><h2 id="church-news-heading">教會消息</h2><Link href="/messages" class=sectionLink>查看全部</Link></div><button class=listCard data-testid="announcement-card" onClick=>setAnnouncementOpen(true)>` with identical grid.  
Delta: live ADDS the `查看全部` header link to `/messages` and makes the card a `<button>` that opens in-place `AnnouncementDetail` (overlay state, not navigation). Design has no header link and its church-news card comment is `<!-- hover: background:#f7f7f7 -->` (same). The header link is PRODUCT-correct (Spec 085 church news list at `/messages`) and does not break hierarchy, but it means design export is slightly stale versus the shipped sectionHeading pattern. **PASS; note header-link addition as intentional drift (P3).**

**Explore / Featured Program:** Design: `div.sectionHeading` with `探索` `h2` + `全部課程` ghost button `min-height44`, then `button listCard` with `慕道入門課程` title + `現正接受報名 · 9月7日開始` description. Live `web/app/home/page.tsx:493-516` mirrors heading and card geometry but uses a `<Link href="/programs" className={styles.listCard}>` (anchor, not button) with `<span class=cardTitle>{program.name}</span>` + optional `<span class=cardDescription>{program.description}</span>`. Geometry PASS; **behavior FAIL** (see Behavior Repros: href discards `programId`, so the card navigates to catalog, not to the featured program detail surface). Visually the card looks right; functionally it is a dead-end entry point. **Card composition PASS, entry-point contract FAIL (P1).**

### 5.4 Copy (Cantonese-first)

`COPY.home` (`web/lib/copy.ts:238-273`) is Traditional Chinese throughout:

- `greeting:"早晨"` — design "早晨，陳小明" ✓
- `subtitle:"下一項與你有關的安排。"` ✓
- `emptyTitle:"暫時沒有與你有關的聚会"` + `explorePrograms:"探索課程"` ✓
- `churchNews:"教會消息"` / `viewAllMessages:"查看全部"` ✓
- `explore:"探索"` / `allPrograms:"全部課程"` ✓
- `viewEvent:"查看聚會"` / `enrolledBadge:"已報名"` ✓
- Announcement venue strings `到達場地 / 崇拜及主要聚會：二樓禮堂 / 親子室 / 訪客接待` are detail-only, not shown on the home cards themselves. Greeting interpolation is `早晨，{displayName}` where `displayName = bootstrap.profile.name || bootstrap.profile.username` — Cantonese name first, fallback to username, correct.
- The explore card description is **verbatim** `program.description` from D1 (`summary`) — design synthesizes `現正接受報名 · 9月7日開始` which is `category/nextEventStartAt` sugar, not `description`. Parity PASS for structure, but long-copy resilience must be hardened (see Responsive).

No English fallback copy leaks onto Home (Nav `首頁/課程/掃描/通知/帳戶` all zh-Hant). **Copy PASS.**

### 5.5 Shell

- **Header:** `web/lib/shell-header.tsx` renders `class=header flex space-between gap 1rem padding 0.75 clamp(1rem,3vw,1.5rem) border-bottom line` with `顯恩堂` shortMark for members (no identity block) at `/home` (`pathname===/home ? shortMark : sectionTitle`). Design header is `height72px flex justify-between gap14 font-weight600` + `示範資料` pill. The live omits the pill for real members; for demo fixtures the pill would not show either (pill is design-only). PASS.
- **Dock / Rail:** `web/app/globals.css` `.nav-phone fixed bottom left right height calc(72+safe-area) grid 5 columns, .nav-desktop sticky 200px width @ >=800px`. Design nav is `position fixed left0 right0 bottom0 height calc(78+safe-area) grid repeat(5,1fr) barrier line + shadow`. Live is 6px shorter (72 vs 78) but the dock still clears `shell-content` bottom padding (`padding-bottom 1.5rem @ <799` plus the shell-body flex). PASS.
- **Active indication:** design `首頁` is `color #9c302c`. Live `.nav-item[aria-current="page"] color accent bg surface shadow` matches.
- **Focus ring:** `outline 3px solid #176a87 offset 2` (home) and `outline 2 solid #176a87` (global) both map to `--focus #176a87`. PASS.

### 5.6 CTA Placement and Touch Targets

| CTA | Size | Placement | Verdict |
| --- | --- | --- | --- |
| `查看聚會` (EventCard primary) | `primaryAction width 100% min-height 48 padding 12 18 radius 9` — 48px hit | Bottom of EventCard, full-bleed inside card, 20px margin from details above | PASS — satisfies 44px floor and sits at document flow end, not sticky. Design is also full-width inside card. |
| Announcement listCard | `min-height 72 padding16 grid 1fr auto` — 72px hit | Immediately below Church News heading, 12px under heading | PASS — above 44, whole card is tappable, chevron 20px decor. |
| Explore listCard | `min-height 72 grid 1fr auto` — 72px hit | Under Explore heading | PASS geometry, FAIL semantics (see P1: should deep-link). |
| `全部課程` / `查看全部` sectionLinks | `min-height 44 display:inline-flex align-center padding 8 2` — 44px hit | Right-aligned in `sectionHeading flex align-end justify-between gap16` | PASS — 44px floor, hover underline. At 320 they stay side-by-side with h2 on one line; no wrapping needed. |
| `探索課程` (empty state) | `primaryAction` inside `emptyCard padding 34 22 text-center margin-top16` — 48px | Centered in empty card | PASS |
| Shell dock tabs | `.nav-phone .nav-item min-height 56`, `--scan 64 circle offset -22` | Fixed bottom, last tap zone before OS gesture | PASS |

No CTA is clipped by the fixed dock because `page` bottom padding is `2rem` (32px) plus the shell-body flex; the dock is overlay-fixed but the main scroll container includes the gap (design uses `padding calc(78+28+safe-area)`). At <800 the live `page padding-bottom 1.5rem` is slightly tighter but still clears the 72 dock when scrolled to top; at end-of-page the dock overlays the last 72px of scrollable content — standard mobile pattern, not clipping.

---

## 6. Behavior Repros

### 6.1 Home Explore link into Program Detail (P1 — contract breach)

**Steps:**

1. `GET /home` as `E2E_member` with `featuredEvent: {p-disc/e-101}` and `exploreProgram: {p-intro ...}` (default stub fixture) — Home renders enrolled EventCard + Church News + Explore.
2. Tap the Explore card titled `慕道入門課程`.
3. Observe navigation.

**Expected (ticket):** Entry into **Program Detail** for `p-intro` (the featured `exploreProgram.programId`), e.g. `/programs?program=p-intro` (participant mode, detail shell with back affordance), preserving origin so that back returns toward Home (either via `history.back()` or an explicit affordance wired to `from=home` / `history.replace`).

**Actual:** Card is `<Link href="/programs" data-testid="explore-card">` — a bare catalog link. No `programId` is serialized. The user lands on the participant directory (`ParticipantDirectory` with `programId:null`), not on `ParticipantProgramDetail`. They must find the program again in the list. The `program.programId` value is available in state (derived from `projection.featuredProgram` or `participant.program`) but discarded in the Link.

**Source evidence:**

- `web/app/home/page.tsx:104-111` — `rawProgram → featuredProgram {programId: rawProgram.programId, name: rawProgram.title, description: rawProgram.summary}` correctly captured.
- `web/app/home/page.tsx:396-399` — `program = projection?.featuredProgram ?? participant.program` correctly resolved.
- `web/app/home/page.tsx:501-504` — **`href="/programs"` hard-coded**; should be `buildProgramsHref({mode:"participant", programId: program.programId})`. Contrast with the enrolled card’s correct deep link at `414-422`:
  ```ts
  const eventHref =
    event?.eventId && event.programId
      ? buildProgramsHref({
          mode: "participant",
          programId: event.programId,
          eventId: event.eventId,
        })
      : "/programs";
  ```
  The explore branch does not follow the same intent pattern.
- `web/lib/programs/programs-intent.ts:195-244` — `buildProgramsHref` is origin-safe and validates `SAFE_PROGRAM_ID`. It already supports `{mode:"participant", programId}`.

**Fix direction:** Change the explore `Link` to `href={buildProgramsHref({mode:"participant", programId: program.programId})}`. Consider also passing `hash` if the detail has anchors. No schema change.

### 6.2 Return affordance (origin-aware back) — P2 gap, not yet implemented

**Steps after fixing 6.1:** Land on `/programs?program=p-intro` from Home. Inspect `ParticipantProgramDetail` back behavior.

**Expected:** A visible back control that returns toward Home when Home was the origin (e.g. `← 返回首頁` or `← 返回` that uses `history.back()` when the previous entry is `/home`, otherwise falls back to `navigateMode("participant", true, null)` → `/programs`). The design export for program detail (not re-fetched in this wave, but referenced in critique `T3A_PDEligibleA`) shows a back ghost link; the current live detail renders its own back inside `ParticipantProgramDetail` (see `web/lib/programs/participant-program-detail.tsx` — `onBack` prop wired to `ProgramsBoundaryBody: onBack={() => navigateMode("participant", true, null)}`).

**Actual today:**

- `web/lib/programs/programs-boundary.tsx:540` — `onBack={() => navigateMode("participant", true, null)}` always `replaceState` to `/programs`, dropping the detail from history. Browser back after that goes to `/home` in one press (since detail was replaced, not pushed). This is _accidentally_ origin-aware at the history level but not at the label level — the button label is generic (likely `返回` inside `ParticipantProgramDetail`, not `返回首頁`), and there is no `referrer` / `from` / `sessionStorage` recall of Home as origin.
- No `?from=home`, `history.state.from`, or `sessionStorage.setItem("home:return")` is written by `HomeView` before navigation. `buildProgramsHref`’s `ProgramsHrefIntent` (`web/lib/programs/programs-intent.ts:22-30`) currently has no `from` field.

**Repro for the current (pre-fix) explore path:** Because the explore link goes to bare `/programs`, no `onBack` is ever exercised — there is no detail to return from. So the ticket’s "return affordance if reachable" is currently _unreachable by design_ on the explore path.

**Source evidence:**

- `web/lib/programs/programs-boundary.tsx:540` — `onBack` hard-codes a catalog return, not an origin check.
- `web/lib/programs/programs-boundary.tsx:400-420` — `applyProgramsNavigation` uses `pushState` / `replaceState`; no `state` payload carrying `{from:"/home"}`.
- `web/lib/programs/participant-program-detail.tsx:1-40` — `onBack: () => void` prop is opaque; call site supplies the catalog fallback.

**Fix direction:** Two rungs, either suffices:

- (Higher/cheaper) After fixing 6.1, rely on native history: keep deep-link as `pushState` (not replace) so Back = one browser back to `/home`. The existing `onBack`’s `replace:true` would then need to become `push:false` / `history.back()` path: in `ParticipantProgramDetail`, render the back button as `onClick={() => { if (document.referrer.includes("/home") || window.history.length > 1) history.back(); else onBack(); }}` with label `返回首頁` when referrer is Home.
- (Lower) Extend `ProgramsHrefIntent` with `from?: string` and have Home set `buildProgramsHref({mode:"participant", programId, /* hash or from */})` + have the boundary render `onBackLabel = from==="home" ? COPY.home.backHome : COPY.programs.backCatalog` (new copy key) — preserves deep-linkability and explicit analytics.

### 6.3 View Event deep-link (PASS with adjacent gap)

**Steps:** Tap `查看聚會` on the enrolled EventCard.

**Expected:** Deep-link to participant Event Detail: `/programs?program=<event.programId>&event=<event.eventId>` (mode participant, per `buildProgramsHref`’s `event` validation: `mode==="participant" && task===undefined && programId!==null`).

**Actual:** Exactly that, when `event.eventId && event.programId` are present. `web/app/home/page.tsx:414-422` correctly builds it. When either id is null the fallback is catalog (`"/programs"`). **PASS.**

**Adjacent gap (do not fix in this PR, but note):** If `event.location` is `null`, the third `EventRow` (pin) is suppressed, so the card collapses to 2 rows (calendar/clock). This is correct fallback but was not visually author-reviewed for 2-row card height versus 3-row. Not a finding.

### 6.4 Announcement Detail entry (PASS)

**Steps:** Tap the Church News `listCard` (`data-testid="announcement-card"`) titled `本週崇拜及聚會安排`.

**Expected:** In-place expansion of `AnnouncementDetail` (not a navigation) with `detailTopbar` `教會消息`, back `首頁`, date tag, title, summary, venueCard, and optional external `https` link.

**Actual:** `web/app/home/page.tsx:476-491` `onClick={()=>setAnnouncementOpen(true)}` and `405-412 {announcementOpen && announcement && <AnnouncementDetail ... onBack={()=>setAnnouncementOpen(false)} />}`. The detail’s `backButton` renders `Icon name="back"` + `backLabel` with `min-height 44 margin-left -8 padding 8`. Source `web/app/home/page.tsx:324-329` sets `backButton` focus ring correctly. The external URL is gated through `externalUrlFrom(value)` (`web/app/home/page.tsx:63-73`) which only allows `https:` — http and malformed URLs become null and no row renders. See `334-354`.

**Fix direction:** None. Add one harden: when `announcement.summary` is very long (300+ chars), the paragraph `detailIntro p line-height1.6` may dominate the fold; consider `-webkit-line-clamp:6` in the harden proposal, not as a production fix.

### 6.5 Enrollment mutation guard

Spec says "do not mutate enrollment." Verified: no `submitEnrollmentRequest`, `withdrawRequest`, or similar is imported in `web/app/home/page.tsx:16-20` (only `listParticipantCatalog`, `getParticipantProgramDetail`, `getHome`, `hkShort*`, `buildProgramsHref`). No form state on Home. **PASS — no mutation surface exists.**

---

## 7. Source Evidence

| Finding | File | Symbol / Lines | What the line proves |
| --- | --- | --- | --- |
| Explore href discards programId | `web/app/home/page.tsx` | `493-516` (`{program && (<section …><Link href="/programs" …>`) | Explore card never serializes `program.programId` into the URL; direct sibling of the correct `eventHref` builder, so inconsistency is intentional omission, not pattern absence. |
| Correct event deep-link pattern exists | `web/app/home/page.tsx` | `414-422` (`const eventHref = event?.eventId && event.programId ? buildProgramsHref({mode:"participant", programId:event.programId, eventId:event.eventId}) : "/programs";`) | Proves the codebase already knows how to deep-link to Program/Event detail; explore should reuse it without programId-less fallback. |
| `program` projection is available | `web/app/home/page.tsx` | `104-111` (`rawProgram → featuredProgram {programId,name,description}`) and `394-399` (`const program = projection?.featuredProgram ?? participant.program`) | Data is in hand at render time; no fetch change needed. |
| `buildProgramsHref` validates and builds | `web/lib/programs/programs-intent.ts` | `195-244` (`buildProgramsHref({mode, programId, task, eventId, hash, created})` with `SAFE_PROGRAM_ID` gate) | Fix is one call; no intent schema change unless adding `from`. |
| Back always returns to catalog, not origin | `web/lib/programs/programs-boundary.tsx` | `~540` (`onBack={() => navigateMode("participant", true, null)}`) | Detail’s back is catalog-hardcoded; no referrer/origin memory. |
| Navigation pushes history without origin label | `web/lib/programs/programs-boundary.tsx` | `62-85` (`applyProgramsNavigation` — `pushState` / `replaceState` + `setSearch`) | History exists for back, but `onBack` uses `replace:true` which squashes the detail entry; origin-aware labeling absent. |
| Section landmark wiring | `web/app/home/page.tsx` | `467-469` (`aria-labelledby="church-news-heading"`), `494` (`aria-labelledby="explore-heading"`) | Landmark parity with design; no `h2` leak. |
| Badge / CTA geometry | `web/app/home/home.module.css` | `55-67` (`.enrolledBadge`), `106-124` (`.primaryAction`), `197-222` (`.listCard`) | Touch-target and token correctness; sizes quoted from literal CSS, not inference. |
| SectionLink hit area | `web/app/home/home.module.css` | `182-191` (`.sectionLink min-height44`) | Meets 44px floor. |
| BackButton hit area | `web/app/home/home.module.css` | `293-306` (`.backButton min-height44 margin-left-8`) | Correct for detail but not present on Home root. |
| Page measure / scroll guard | `web/app/home/home.module.css` | `3-9` (`.page width min(100%,680px) padding 0 clamp(1rem,4vw,1.5rem) 2rem`) | Prevents HScroll; verified `html,body {max-width:100vw overflow-x:hidden}` in `web/app/globals.css:55-65` as secondary guard. |
| Nav touch target | `web/app/globals.css` | `.nav-phone .nav-item min-height56`, `.nav-item--scan 64 circle` | Shell PASS. |
| Greeting interpolation | `web/app/home/page.tsx` | `365, 430-434` (`displayName = bootstrap.profile.name |  | bootstrap.profile.username`; `<h1>早晨，{displayName}</h1>`) | Cantonese name first; wrapping risk at long names. |
| Empty vs enrolled branch | `web/app/home/page.tsx` | `437-463` (`{event ? (<article eventCard> …) : (<section emptyCard> exploration …)}`) | Correct branch; empty shows only event missing, sections persist optionally. |
| Announcement external gate | `web/app/home/page.tsx` | `63-73` (`externalUrlFrom`) and `334-354` (`announcement.externalUrl && <a target=_blank rel=noopener>`) | Only https passes; http suppressed. |
| Offline banner | `web/lib/auth-shell.module.css` | `.offlineBanner fixed top max(8,safe-area) left50% translateX-50% …` | Additive chrome; not yet Home-specific. |
| Copy source of truth | `web/lib/copy.ts` | `238-273` (`COPY.home: greeting/subtitle/churchNews/explore/allPrograms/viewEvent/enrolledBadge …`) | Verbatim Traditional Chinese; matches design strings. |

---

## 8. Responsive Table

Derived from CSS box model, not from a headed screenshot (see Screenshots for manual verification checklist). Assumptions: `html,body {max-width:100vw overflow-x:hidden}` as guard; `page padding` via `clamp(1rem,4vw,1.5rem)` → 16px at 320/375/390/414 (since `4vw` at 414 is 16.56px, clamped to 16px), 24px at large desktop.

| Width | Page interior | `scrollWidth <= innerWidth` | Primary CTA (查看聚會) | SectionLink (全部課程/查看全部) | listCard (72px) + chevron | Wrapping / Clipping | Touch-target |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **320** | 288px (320 − 16×2) | **PASS** — `width:min(100%,680px)` prevents overflow; `grid minmax(0,1fr) auto` allows text cell to shrink; no fixed 280+ child. | 100% width, single line `查看聚會` (4 ch) fits 240px inside card after 22px padding | `sectionHeading flex align-end justify-between gap16` with h2 `探索` 2ch + link 4ch side-by-side; no wrap, link 44px hit inside heading row | Title `cardTitle weight650 line1.45` + description `0.86rem muted` stack vertically; chevron 20px fixed on right; grid gap 14 keeps rhythm; no truncation, wrapping is fine | **PASS** — long titles (>28ch) will wrap to 2-3 lines inside `cardTitle` without HScroll. Risk: `program.description` unclamped (see Long-Copy harden). | 48/44/72 all ≥44 |
| **375** | 343px | **PASS** | same | same | same; extra 55px breathing room over 320 | **PASS** | PASS |
| **390** (required) | 358px | **PASS** | same | same | same; design’s 390×844 mock (enrolled) fits vertically without bottom dock overlap when scrolled to top; at page end dock overlays last ~72px of scroll (expected). | **PASS** — 390 is the design’s mobile proof viewport; no action-group wrapping/clipping expected. | PASS |
| **414** | 382px | **PASS** | same | same | same | **PASS** | PASS |
| **800+ (desktop)** | 680px centered | **PASS** — rail 200px beside `page`; no fixed nav overlap | CTA stays 100% of 680 minus 48px padding; still full-width inside EventCard | Heading gap 16 remains; link 44px still right-aligned | listCard padding 16 → title/description remain readable; border `#868182` unchanged | **PASS** | PASS |

**Bottom-dock interaction:** At all phone widths `main#shell-content` scrolls under the fixed `.nav-phone` (72px). The design prototype pads `main` with `calc(78+28+safe-area)` to keep the last card’s bottom border visible above the dock when scrolled to end. Live `page padding-bottom 2rem` (≥800) / `1.5rem` (<800) is 8-24px tighter; the last pixel of the Explore card’s bottom border can sit under the dock shadow on short viewports. Not clipping, but worth adding `padding-bottom: calc(1.5rem + 72px + env(safe-area))` on `page` for phones (see Harden `home-offline.html` bottom safe-area demo). Severity P3.

**Long-copy note:** The only wrapping risk that is NOT guarded is `displayName` in `<h1>早晨，陳小明</h1>` — a 20-char name at 320 (`clamp 1.72rem`, ~27px) can produce a 2-line h1 that pushes the EventCard below the fold faster than design, but no HScroll.

---

## 9. Harden Candidates

All artifacts are **check-only static proposals** (not production UI) under `.impeccable/phase-391/harden/`. Open file:// or serve via `python -m http.server` alongside the Wrangler servers for side-by-side at 320/390/414.

| Artifact | Edge state | What it hardens | Key assertion |
| --- | --- | --- | --- |
| `home-loading.html` | **Loading** | Empty-flash before `getHome()` resolves | Shows skeleton shimmer for intro + EventCard + two listCards vs today’s empty-state flash; records `scrollWidth<=innerWidth` and `primaryAction 48px` still governing the skeleton CTA. |
| `home-error.html` | **Error** | `getHome()` throws or `/api/v1/home` 5xx / malformed envelope | Renders recoverable error panel with `COPY.error.networkError` + `Retry` (bump tick) vs today’s silent empty. Validates focus-visible ring & 44px retry hit. |
| `home-empty.html` | **Empty** | No enrolled upcoming event; explores available / explores absent | Asserts emptyCard `暫時沒有…` + `探索課程` (48px) coexists with Explore section only when `program` exists; empty-empty (no program either) hides Explore without leaving a gap. |
| `home-long-copy.html` | **Long-copy** | Long `displayName` (18ch), long `program.name` (36ch), long `program.description` (160ch), long `eventTitle` | Asserts `minmax(0,1fr)` wrapping, `line-clamp:3` proposal for description, `word-break: break-word` for names; checks no HScroll and no chevron clipping at 320. |
| `home-permission.html` | **Permission** | Authenticated Member vs bootstrap mismatch (role gating, `FORBIDDEN` from home handler) | Shows Home still under `AppShell` — forbidden is rendered by `ForbiddenView` at the shell, not as a Home empty; verifies `clearAuthHint + rememberDeepLink` path does not leak a Home empty for suspended accounts. |
| `home-offline.html` | **Offline** | No network at first paint, stale-while-offline, dock safe-area | Overlays `OfflineBanner` `現時沒有網絡…` fixed above Home, skeletons beneath; footer of Home respects `calc(72px + env(safe-area))` so last card not under dock. |

If the reviewer’s 390×844 capture confirms no HScroll and no clipping on real device, these hardens can be closed as visual-regression fixtures without shipping them.

---

## 10. Prioritized Findings

### P0 — Must fix before visual-parity sign-off

_None._ No data loss, security, or auth bypass on Home. The page renders correctly for enrolled and empty fixtures without throwing.

### P1 — High (contract / integrity)

**[P1-01] Explore entry discards `exploreProgram.programId` — catalog dead-end instead of Program Detail**

- Severity: **P1** (ticket’s named entry point)
- Evidence: `web/app/home/page.tsx:501-504` `href="/programs"` hard-coded while sibling `eventHref` at `414-422` correctly uses `buildProgramsHref({mode:"participant", programId, eventId})`; `web/lib/programs/programs-intent.ts:195-244` supports participant programId links; `tests/e2e/home.test.ts` default `exploreProgram.programId:"p-intro"` is never navigated to.
- Repro: As E2E_member on `/home`, click `慕道入門課程` card → lands on directory `/programs`, not detail. Back affordance unreachable on this path (see P1-02).
- Fix: One-line: `href={buildProgramsHref({mode:"participant", programId: program.programId})}`. No migration, no API change. Add a Playwright assertion mirroring `home.test.ts` viewEventButton but for `getByTestId("explore-card")` → `expect(page).toHaveURL(/program=p-intro/)`.
- Risk if deferred: The principal "Home Explore" conversion path stays broken; analytics will show 100% bounce to catalog instead of detail.

**[P1-02] First-paint loading masquerades as empty — no distinguishable loading vs error vs truly-empty**

- Severity: **P1** (recoverability)
- Evidence: `web/app/home/page.tsx:373-390` `useEffect loadHomeProjection().then(setProjection)` starts with `projection=null, participant={event:null,program:null}` and derivates `event ?? null`, `program ?? null` → renders the empty branch `439-463` for 200-800ms before the fetch resolves; `catch {return null}` swallows network/5xx into the same empty UI. `HomeView` never renders a `<output aria-busy>` or a retry control; only `AppShell` has `RecoveryView` for bootstrap, not for Home data.
- Repro: Throttle network to Slow 3G, load `/home` → briefly see `暫時沒有與你有關的聚會` even for enrolled fixture, then flash to EventCard. Disconnect network → same empty, no error text, no retry.
- Fix: Introduce a `homeLoading` flag (`useState<boolean>(initialEvent===undefined)`, set false after projection resolves) and render a skeleton block matching `eventCard` + two `listCard` skeletons while `homeLoading`. On `catch`/null-after-fallback render a small `role="alert"` with `COPY.error.networkError` + `Retry` that re-runs `loadHomeProjection` (bump tick). Keep the empty branch for the truly-empty case after loading settles. See harden `home-loading.html` / `home-error.html` for geometry.

### P2 — Medium (experience / origin-awareness)

**[P2-01] No origin-aware return from Program Detail when origin is Home**

- Severity: **P2**
- Evidence: `web/lib/programs/programs-boundary.tsx:62-85` `applyProgramsNavigation` carries no `state.from`; `540` `onBack={() => navigateMode("participant", true, null)}` is catalog-hardcoded. After fixing P1-01 the detail will be reachable, but its back will not label `返回首頁` nor prefer `history.back()` to Home.
- Repro: After P1-01 fix, Home → Program Detail `p-intro` → click back in `ParticipantProgramDetail` → lands on `/programs` (catalog) via `replaceState`, requiring an extra browser back to reach Home. Expected: one back to Home when Home was the entry.
- Fix: Either (a) history-native: change detail entry to `pushState` (not replace) and have the back button do `if (document.referrer.includes("/home")) history.back(); else onBack();` with label `返回首頁` when referrer is Home; or (b) intent-explicit: extend `ProgramsHrefIntent` with `from?: "home"` and have Home set `buildProgramsHref({mode:"participant", programId, /* from: "home" or via history.state */})`. (a) is smaller diff; (b) is deep-link-persistent. Choice can defer to Program team; (a) covers the S2 Home ticket in one line.
- Note: `AnnouncementDetail`’s in-place `onBack=>setAnnouncementOpen(false)` is correctly internal and not affected.

**[P2-02] Long-copy not clamped — description can push card to 180+px on narrow**

- Severity: **P2** (responsive polish)
- Evidence: `web/app/home/home.module.css:232-238` `.cardDescription {margin-top5 color muted 0.86rem line1.5}` with no `-webkit-line-clamp`; `500-516` `program.description` is rendered verbatim. `tests/e2e/home.test.ts` default summary is 15ch; real D1 summaries can be 80-160ch.
- Repro at 320: inject `program.description = "慕道入門課程為為期八週的信仰探索⋯（120字）"` → Explore listCard height ~110px vs design 72px, 2-3 line wrap is fine but 4+ lines dominate the fold and push dock overlap. Description wraps instead of truncating.
- Fix: Harden proposes `display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden` on `.cardDescription` with a `title` attribute for full text, or fall back to CSS `line-clamp:2` (modern). See harden `home-long-copy.html`.

**[P2-03] Offline at first paint shows empty-empty instead of stale / retry**

- Severity: **P2**
- Evidence: No offline handling inside `HomeView`; only `ShellHeader`’s `OfflineBanner` (`web/lib/auth-shell.module.css:.offlineBanner`) signals offline globally. If home fetch fails due to offline, the empty branch renders with no hint that the data is stale.
- Fix: When `navigator.onLine===false` and `projection===null`, render a muted `已有內容離線可看；重新連線後自動更新` note above Empty, plus keep retry. Harden `home-offline.html` demonstrates.

### P3 — Low (visual polish / token hygiene)

**[P3-01] EnrolledBadge token hex drift** — design inline `#9cb49d / #e9f0ea` vs live token `#b9cfbe / #eef4ef` (`web/app/home/home.module.css:55-67`). Visually identical, but closes the last pre-88b96afa hex drift. Fix: no action; document as inherited token, not a parity miss.

**[P3-02] Announcement sectionHeading gains a link not in the design export** — `web/app/home/page.tsx:470-475` adds `查看全部 → /messages`. Design header is just `教會消息`. This is intentional (Spec 085 messages list) but makes the design export stale for this phase; update the export’s Figma source or annotate the delta.

**[P3-03] Page bottom padding tighter than design** — design `padding calc(78+28+safe-area)` vs live `page padding 0 clamp16 2rem` + `@<799 page padding-bottom 1.5rem` (`web/app/home/home.module.css:332-342`). At the end of page the last card’s border sits 8-14px closer to the dock shadow. Fix if desired: `padding-bottom: calc(1.5rem + 72px + env(safe-area-inset-bottom))` on `.page` for `<800`.

**[P3-04] `time.dateTag` in intro lacks `datetime` attribute** — `web/app/home/page.tsx:430` renders `<time className={styles.dateTag}>{greetingDate()}</time>` with title-case Chinese weekday but no `datetime` machine value, unlike event rows which format via `hkShortDateLabel` in text. Minor a11y, not blocking.

---

## 11. Recommended Next Action

**Ship P1-01 + P1-02 together as `fix(391): home explore deep-links to program detail; add loading vs error vs empty tri-state`.**

- Change set (2 files, ≤30 lines):
  1. `web/app/home/page.tsx:501-504` — Replace `href="/programs"` with `href={buildProgramsHref({mode:"participant", programId: program.programId})}` on the Explore `listCard`. Import is already present via `buildProgramsHref` from programs-intent.
  2. `web/app/home/page.tsx:359-400` — Add `homeLoading` tri-state (`useState<boolean>(initialEvent===undefined && initialProgram===undefined && initialAnnouncement===undefined)`, clear after `loadHomeProjection` settles) and branch in the return: `homeLoading ? <HomeSkeleton/> : event ? … : …`; add an error branch (`homeError` state) with `COPY.error.networkError` + retry button that re-runs the effect (bump a `tick` mirror of `ProgramsBoundary`’s pattern).
  3. (Optional P2-01 companion, one extra line): In `ProgramsBoundary`’s Home-origin path, prefer `history.back()` when `document.referrer` is Home — or defer to a follow-up `fix(391): origin-aware back label` ticket.

**Do NOT** broaden this fix to CMS, Programs directory, or shell rail work — the remaining P2 harden candidates are visual-regression fixtures.

**Verification checklist for the PR that lands the fix:**

- [ ] `pnpm --dir web test` (skipped in this wave) passes — especially `tests/e2e/home.test.ts` with a new assertion for the explore card URL.
- [ ] Manual at 390×844 as `E2E_member`: enrolled → tap `慕道入門課程` → lands on `GET /programs?program=p-intro` detail; browser Back returns to Home in one tap; `document.documentElement.scrollWidth <= window.innerWidth` at 320/375/390/414.
- [ ] Slow-3G: Home stays in skeleton until fetch resolves; offline-toggle → error panel with Retry, not empty.
- [ ] Long-copy injection at 320: `cardDescription` clamps to 2 lines with ellipsis, no HScroll.

**Merge order:** This report targets `feat/391-polish-on-88b96af` at `88b96afa`; the two-line code fix above is merge-ready without re-basing S1 stack items.

---

## Appendix — Contract Deltas vs Design

| Contract | Design | Live | Delta |
| --- | --- | --- | --- |
| Greeting | `早晨，陳小明` (Sun 8/17) | `早晨，{陳小明}` + `Intl zh-Hant-HK weekday` (today, e.g. Wed 8/20) | DATE fixture drift, PASS |
| Event badge | `#9cb49d / #e9f0ea` pill 28px | `var(--success-border/surface)` pill 28px | P3 hex drift, PASS |
| EventCard CTA | `button full 48 cinnabar` | `Link primaryAction full 48 cinnabar` | Element role change (button→anchor) correct for navigation, PASS |
| Church news | `h2 教會消息` → `button listCard` | `h2 教會消息` + `Link 查看全部 → /messages` → `button listCard` | Additive link, intentional, PASS |
| Explore | `Explore h2 + 全部課程 button` → `button listCard` | `Explore h2 + Link 全部課程 → /programs` → `Link listCard href /programs` (bug) | **FAIL P1-01** |
| Dock | 78px + safe-area, 5 tabs scan raised | 72px + safe-area, same geometry, 6px tighter | P3, PASS |
| Page measure | inline `max-width680 margin auto padding 0 20 calc(78+28+safe)` | `width min(100%,680px) margin auto padding 0 clamp(1rem,4vw,1.5rem) 2rem` | Slight spec tighten, PASS |

_End of report._
