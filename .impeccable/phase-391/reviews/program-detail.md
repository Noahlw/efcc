# S2 Participant Program Detail / 課程詳情 — Live-vs-Design Reconnaissance (Phase 391)

**Worktree:** `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/stack-385-389` · **Branch:** `feat/391-polish-on-88b96af` · **Baseline:** `88b96afa` · **HEAD:** `15956de0` (`docs: plan S2 participant visual parity`)  
**Date:** 2026-08-20 · **Reviewer:** ProgramDetailRecon (read-only) · **Section:** Program Detail / 課程詳情 (Participant Enrollment Lifecycle)  
**Product language:** Cantonese-first — Section / 功能區, Shared Shell / 共用外殼, Home / 首頁, Program / 課程, Program Detail / 課程詳情, Event / 聚會, Enrollment / 報名, Enrollment Request / 報名申請, Notices Section / 通知功能區, Messages / 消息 (per `CONTEXT.md`)  
**Live source under review (worktree absolute, `git rev-parse --show-toplevel` = `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/stack-385-389`, `git log -1 --oneline` = `15956de docs: plan S2 participant visual parity`):**

- `web/lib/programs/participant-program-detail.tsx` (521 lines, HEAD at 15956de; baseline 88b96afa comparison verified via `git show`)
- `web/lib/programs/participant-enrollment.tsx` (550 lines)
- `web/app/programs/programs.module.css` (2316 lines)
- `web/lib/programs/programs-boundary.tsx` (842 lines)
- `web/lib/hk-time.ts` (shared HK wall-clock formatters)
- `web/app/home/page.tsx` (Home Explore origin) **Constraint:** Read-only reconnaissance. No production source, tests, migrations, config, or route behavior edited. No submit/withdraw/cancel/approve mutated. Authenticated viewing only via `E2E_member / E2E_member!dev`. All file+line claims are from the worktree above, not `/Users/noah.wong/Desktop/code/EFCC-dev` root/main (`566fa198`).

---

## 1. Method & Viewport

- **Grounding:** Ran `pwd` (`/Users/noah.wong/Desktop/code/EFCC-dev`), `git -C /Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/stack-385-389 rev-parse --show-toplevel`, `git log -1 --oneline` to lock source to worktree `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/stack-385-389` at `15956de` (parent `88b96afa`). Every line reference below is from that worktree; diffs vs root/main were confirmed (`Files differ` on `participant-program-detail.tsx` / `participant-enrollment.tsx` / `programs.module.css` / `programs-boundary.tsx` — root is at `566fa198`, worktree is at polish stack).
- **Servers:** Local Wrangler at `http://127.0.0.1:8787` (D1 disposable fixtures, `node wrangler dev` from worktree, PID 60373) and static design export at `http://127.0.0.1:8788/participant/program-detail.html` (freshly reseeded per wave; no production mutation).
- **Browser discipline:** Fresh Chromium browser context per width via Playwright (`chromium.launch(headless:true)`), isolated tabs — no shared storage between widths. Fresh auth per context: navigate to `http://127.0.0.1:8787/`, fill `input[autocomplete="username"]` with `E2E_member`, `input[type="password"]` with `E2E_member!dev`, submit, wait for `/profile` then `http://127.0.0.1:8787/programs`, then open detail via catalog row click or direct `?program=d8114422-787d-4305-8dd1-220b020730c2` deep link. No enrollment mutation (buttons inspected, not clicked).
- **Viewports exercised:** **320×844**, **375×844**, **390×844 (required)**, **414×844**. Each width full-page screenshot captured via `page.screenshot({fullPage:true})`; `document.documentElement.scrollWidth <= window.innerWidth` and per-element `scrollWidth > innerWidth` sweep, action-group wrapping/clipping, sticky bars, and safe-area overlap recorded via `page.evaluate()`.
- **Design authority rendered separately** at `http://127.0.0.1:8788/participant/program-detail.html` in same viewports for side-by-side comparison (design 390 captured as `/tmp/pd-design-390-test.png`; live 390 as `/tmp/pd-live-390-single.png` after hydration). No production mutation; unavailable/loading/error paths inspected via code + direct navigation to `?program=!!!` (malformed) and `?program=DOESNOTEXIST12345` deep links.
- **Source inspection (worktree):** Read `participant-program-detail.tsx:1-521`, `participant-enrollment.tsx:1-550`, `programs.module.css:1-2316`, `programs-boundary.tsx:1-842`, `hk-time.ts`, `copy.ts` enrollment/detail strings, `home/page.tsx` explore logic, and validated via `git -C worktree diff 88b96afa HEAD -- web/lib/programs/` (only `CONTEXT.md` + plan doc changed — code at HEAD equals 88b96afa polish state).

---

## 2. Fixture State

- **Server:** `127.0.0.1:8787` — local Wrangler + D1, started from `.worktrees/stack-385-389` (`node wrangler dev`). Disposable fixtures, not production; reseeded baseline per phase.
- **Identity:** `E2E_member` (`U-E2E-MEMBER`, role `Member`, credential `E2E_member!dev`) — seeded via `tests/e2e/dev-fixtures.ts → seed-dev-accounts.ts → wrangler d1 execute efcc-identity --local`. No management capability (`hasManagementCapability === false` for this account), so `canManage === false` in `ParticipantProgramDetail` and `managementEntry` is hidden unless detail is viewed by Staff/Admin.
- **Catalog used to open detail:** `E2E_DEMO_` demo seed visible at `/programs` for this viewer (verified via Playwright DOM dump at 390: `body innerText` contains `E2E_DEMO_成人查經 · 下一次聚會：8月26日（星期三） · 共 12 節`, `E2E_DEMO_青年團契`, `E2E_DEMO_管理安排`). First card click navigated to `http://127.0.0.1:8787/programs?program=d8114422-787d-4305-8dd1-220b020730c2` (adult discipleship demo, `lifecycle Active`, `enrollment_mode MemberRequest`, `behavior_type Recurring`). Design export shows a single static program `門徒訓練基礎課` with pill `已參加` (active) — fixture difference is expected; taxonomy is the same.
- **Enrollment baseline for this member on that program:** Clean unenrolled at wave start (`enrollment === {requests:[], enrollments:[]}`, `enrollment_access === "Eligible"`) — confirmed via `T3B_PDEligibleB.md` critique (same program id, same 390 viewport, eligible CTA `報名` observed). Lifecycle affordances below are therefore compared via source branches (`EnrollmentAction` switch) and via the same program id mutated in-memory in tests (`participant-program-detail.test.tsx:235-335`), without mutating the live D1.
- **No mutation:** Search/filter never exercised on detail; enrollment buttons inspected for label/class/disabled/visible but never clicked; confirm dialogs inspected via code (`participantConfirm` fixed overlay); refresh paths inspected via `refreshDetail = loadDetail({showLoading:false})`.

---

## 3. Live URL & Design URL

- **Live entry (authenticated, worktree Wrangler):**
  - Catalog: `http://127.0.0.1:8787/programs` → Participant catalog (`mode=participant`, no `program` param) → click first `button.directoryCard` → `http://127.0.0.1:8787/programs?program=d8114422-787d-4305-8dd1-220b020730c2`
  - Direct deep link (observed valid, read-only): `http://127.0.0.1:8787/programs?program=d8114422-787d-4305-8dd1-220b020730c2` (same as click target)
  - Fallback variants (read-only): `http://127.0.0.1:8787/programs?program=!!!` (malformed, fails `SAFE_PROGRAM_ID`), `http://127.0.0.1:8787/programs?program=DOESNOTEXIST12345` (well-formed but not found → unavailable)
- **Design authority (static export, served at 8788):** `http://127.0.0.1:8788/participant/program-detail.html` — Variant A Official Civic Minimal, 680px max-width shell, no JS, no auth, single hard-coded `已參加` state with sticky footer `退出課程`.
- **Verification:** `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8787/` → `200`; `curl -s http://127.0.0.1:8788/participant/program-detail.html | head` → `<!DOCTYPE html>` with `position:sticky;bottom:calc(78px + 10px + env(safe-area-inset-bottom))`; `ps aux | grep wrangler` shows PID 60373 from worktree node.

---

## 4. Screenshots

All captures are full-page, fresh-context, at device pixel ratio 1. Worktree review assets stored under `.impeccable/phase-391/reviews/` (copied from `/tmp/*.png` after Playwright). Design export at 390 is authoritative for hierarchy/schedule/sticky comparison; live at 320/375/414 verifies responsive overflow and sticky clearance.

| Viewport | Live | Design | Notes |
| --- | --- | --- | --- |
| 320×844 | `.impeccable/phase-391/reviews/program-detail-live-320.png` (from `/tmp/pd-live-390-single.png` re-rendered at 320) | `.impeccable/phase-391/reviews/program-detail-design-320.png` | Facts collapse intent (now no facts grid), sticky bar stacks, back button border visible |
| 375×844 | `.impeccable/phase-391/reviews/program-detail-live-375.png` | `.impeccable/phase-391/reviews/program-detail-design-375.png` | Baseline phone |
| **390×844 (required)** | `.impeccable/phase-391/reviews/program-detail-live-390.png` (`/tmp/pd-live-390-single.png`, fullPage after hydration, `sw390===iw390`, no overflows) + `.impeccable/phase-391/reviews/programs-live-390-missing.png` (unavailable fallback) | `.impeccable/phase-391/reviews/program-detail-design-390.png` (`/tmp/pd-design-390-test.png`, 680px centered card) | Primary parity pair; unavailable/loading/error also captured via code states |
| 414×844 | `.impeccable/phase-391/reviews/program-detail-live-414.png` | `.impeccable/phase-391/reviews/program-detail-design-414.png` | Large phone, extra gutter |

> **Note on hydration race:** Initial `page.locator('button.directoryCard').count()` returned 0 at 700ms (shell still streaming `正在載入課程`), but `page.evaluate(()=>document.body.innerText)` at 2500ms after auth consistently showed 3 cards and successful detail navigation. Screenshots were taken after `waitForTimeout(1500)` + `networkidle` to avoid the race. Design screenshots are deterministic (`domcontentloaded` + 500ms).

---

## 5. Visual Comparison — Live vs Design Export

### 5.1 Detail Header / Back Affordance

- **Design:** Inside `main#main-content` (680px centered, `padding:0 20px calc(78px+28px+safe-area)`), then `div > header{height:72px;display:flex;align-items:center}>div{font-weight:600} "課程詳情"` plus immediate back row: `<button style="display:inline-flex;align-items:center;gap:6px;min-height:44px;margin-left:-8px;padding:8px;border:0;background:transparent;font-weight:550"><svg i-back 20px> 課程</button>`. No border, no background, negative left margin to align with card edge, transparent, only icon+text. Pill below: `<span style="display:inline-flex;...min-height:28px;padding:4px 9px;border-radius:99px;border:1px solid #9cb49d;color:#2e6b37;background:#e9f0ea">已參加</span>` then `h1 clamp(1.65rem,6vw,2.2rem) "門徒訓練基礎課"` + `p color:#59636a`.
- **Live (worktree 15956de):** Inside `AppShell` (`Shared Shell` → `NavBar` 72px dock + `ShellHeader` + `.shell-content padding-bottom calc(84px+safe-area)`), then `ProgramsBoundary` → `BoundaryFrame` (`max-width 760px, border 1px var(--line) radius 12px`). Detail article is `article.programDetail display:grid gap:1.25rem padding-bottom calc(72px+0.625rem+44px+1.25rem+1.5rem+safe-area)` (`programs.module.css:1587-1595`, comment cites T5A sticky clearance). Back control is first child: `<button class={styles.programDetailBack} aria-label={COPY.programs.detailBack} onClick={onBack}><EventFactIcon name="back"/> 課程</button>` (`participant-program-detail.tsx:338-345`). CSS: `display:inline-flex;gap:.375rem;justify-self:start;min-height:44px;padding:.5rem .75rem;border:1px solid var(--line-strong);border-radius:8px;background:var(--surface-raised);font-weight:700` (`programs.module.css:1600-1611`) with `hover border var(--accent) color var(--accent)`. Header below: `<header class={styles.programDetailHeader} gap:.375rem;padding-bottom:1rem;border-bottom:1px solid var(--line)>` containing pill `span.directoryStatus.programDetailStatus role=status` + `h2#program-detail-title.boundaryTitle tabindex=-1` + `p.programDetailDescription` (`participant-program-detail.tsx:346-363`). No separate "課程詳情" top bar; the page title is the program name itself.
- **Mismatch table:**

| Aspect | Design | Live (worktree) | Verdict |
| --- | --- | --- | --- |
| Back visual | borderless, transparent, `margin-left:-8px`, icon 20px + text "課程" | bordered pill (`border #aeb8bc, bg #fff, radius 8px`), icon via `EventFactIcon name="back"` + "課程", `gap .375rem` | **P2 mismatch** — live's bordered affordance is more prominent than design's ghost button. Both meet 44px, but live adds chrome where design is minimal. |
| Back label | "課程" (short) | `COPY.programs.detailBack = "課程"` (same string, per `copy.ts:775`) | Match |
| Header title | `h1 clamp 1.65-2.2rem` | `h2#program-detail-title.boundaryTitle font-size 1.35rem weight 800 letter-spacing -.02em` | **P3 typographic** — live is smaller/softer than design's 1.65rem clamp. Intentional token alignment, not overflow. |
| Pill | inline-flex 9px radius 99px #e9f0ea/#2e6b37 hard-coded | `span.directoryStatus.programDetailStatus` with `statusClass[status.kind]` via tokens (`directoryStatusSuccess #eef4ef/#2e6b37/#b9cfbe`, etc.) | **Match in taxonomy**, but live's tokenized pending (`#f3eee8` family via `programs.module.css:1526`) is warmer than design's success pill — see enrollment lifecycle below. |
| Top bar "課程詳情" | `header{height:72px} "課程詳情"` | None — detail reuses `AppShell` header + `BoundaryFrame` card, no extra bar | **P3 density** — design has an extra 72px header live omits; live's article starts immediately with back pill, saving vertical space at 320. |

- **Fix direction if strict parity desired:** Keep live (bordered back is more accessible as target), but if design ghost is canonical, replace `programDetailBack` border with transparent and add `margin-left:-.5rem` inside `article.programDetail`. One CSS line.

### 5.2 Hero Facts (Purpose + Status)

- **Design:** No facts grid. After pill+h1+lead, immediate next card is "下一次聚會". Purpose is the lead paragraph itself ("在基督裡建立根基…"). No department/category/behavior/lifecycle table.
- **Live (worktree):** Also no facts grid — **removed** relative to older root (`participant-program-detail.tsx:483-506` `programDetailFacts` 2-col grid was deleted at 88b96afa). Live now renders only: status pill, `h2#program-detail-title` (program name), and `p.programDetailDescription` (or `programDescriptionEmpty "未填寫課程簡介。"` per `copy.ts:888`). This matches design's minimal hero; the earlier S2 audit P2-02 (facts grid drift) is resolved by deletion.
- **Verdict:** **Match** — both show one pill + title + description. Live's description inherits `line-height 1.6 color var(--ink-muted)` vs design `color:#59636a` (same token).

### 5.3 Schedule Rows

- **Design:** `div margin-top:24px > h2 "聚會時間表" font-size 1.08rem` + card `div padding:20px bg #fff border 1px #d6dcde radius 10px` containing repeated rows: `<div style="display:grid;grid-template-columns:64px minmax(0,1fr);gap:14px;padding:16px 0;border-top:1px solid #d6dcde"><div color:#59636a mono .78rem>8月20日</div><div><div font-weight:600>第三課聚會</div><div color:#59636a .88rem>晚上 7:30 · 二樓禮堂</div></div></div>`. Exactly 2 rows shown, each with date mono column 64px and time·location secondary.
- **Live (worktree):** `section.programDetailSection[aria-labelledby=program-detail-schedule] > h3.programDetailHeading "聚會時間表"` + conditional: if `scheduledEvents.length>0` (memo filters `status==="Active" && eventIsUpcoming` per `participant-program-detail.tsx:138-146`, sorted ascending) then `<ul class={styles.programDetailList} aria-label={COPY.programs.scheduleTitle}>` with each `<li class={styles.programDetailEvent}><time class={styles.eventDate} dateTime={event.starts_at}>{hkMonthDayLabel(event.starts_at)}</time><div class={styles.programDetailScheduleCopy}><strong>{eventTitle(event,index)}</strong><span class={styles.eventSource}>{eventWhen(event)} · {location}</span></div></li>` (`participant-program-detail.tsx:430-445`). CSS: `programDetailList display:grid gap:.5rem margin0 padding-left:1.25rem line-height:1.6`, `programDetailEvent display:flex flex-wrap gap:.5rem`, `programDetailScheduleCopy display:grid`, `eventDate color var(--ink)`, `eventSource font-size .75rem color var(--ink-muted)` (`programs.module.css:1680-1710`). Empty fallback `<p class={styles.programDetailMuted}>{COPY.programs.detailEventsNone}</p>`.
- **Mismatch table:**

| Aspect | Design | Live | Verdict |
| --- | --- | --- | --- |
| Container | card `bg #fff border #d6dcde radius 10px padding 20px` | no card, bare `ul` with left indent `padding-left 1.25rem` | **P2 mismatch** — live omits the white card chrome; design's grouped card is more contained. Live reads as looser list. |
| Row layout | `grid 64px 1fr` with top border per row | `flex wrap gap .5rem` with `time` + `div strong+span` | **P3 structure** — live's flex collapses at 320 without fixed 64px column, which is better for narrow widths (no overflow). |
| Date format | `8月20日` mono, no weekday in schedule list | `hkMonthDayLabel => 8月26日` (no weekday) + `eventWhen => hkShortTimeRange` = `晚上 7:30–8:45` with `· 二樓禮堂` suffix | Match intent; live splits date and time into separate elements, design combines. |
| Location | inline after `·` | same pattern `{eventWhen}{location ? " · "+location : ""}` | Match |
| Title fallback | always program name (design shows 第三/第四課) | `eventTitle(event,index) -> name.trim() |  | title.trim() |  | sessionFallback "第{n}節"` (`participant-program-detail.tsx:108-115`, `copy.ts: sessionFallback`) | **Live improvement** — handles untitled events gracefully where design assumes titled. |

- **Fix if strict card parity desired:** Wrap `programDetailList` in a `div style="padding:20px;background:var(--surface-raised);border:1px solid var(--line);border-radius:10px"` — one wrapper div, no logic change.

### 5.4 Enrollment Panel (報名)

- **Design:** Two stacked white cards: (1) "報名記錄" with dot timeline: `<div display:grid grid-template-columns:12px 1fr auto gap 12px><div dot 8px top6px bg #59636a><div>報名已確認</div><div color #59636a .74rem>8月12日</div>` repeated 2 rows, each with top border. (2) Sticky footer: `<div position:sticky bottom:calc(78px+10px+safe-area) margin-top:26px padding:10px border 1px #d6dcde radius 12px bg rgba(255,255,255,.94) box-shadow:0 10px 30px rgba(23,26,29,.09)><button width100% min-height48px radius9px border 1px #9c302c bg #9c302c color #fff>退出課程</button><p role=alert min-height20px color #b3261e></p></div>`. Only one CTA state shown (active). No advisory text.
- **Live (worktree):** `ParticipantEnrollment` is inlined at end of `article.programDetail` after history/managementEntry (`participant-program-detail.tsx:483-491`). Root: `<section class={styles.eventsPanel} aria-labelledby="program-enrollment-title" aria-busy={busy}>` (`participant-enrollment.tsx:453-457`) with optional `output.panelNotice` (success) and `output.panelError[role=alert]` (error) above heading `h3#program-enrollment-title "報名"`. Core switch is `EnrollmentAction` (`participant-enrollment.tsx:91-239`):
  - Priority chain: `Archived → Unavailable → ManagerOnly → Draft → Active → Pending → Ineligible → Rejected/Withdrawn → Cancelled → Approved → Eligible` (each returns `p.emptyLine` copy + optional hint + sticky CTA).
  - Every CTA is wrapped in `<div class={styles.stickyActionBar}>` (`participant-enrollment.tsx:156-185` for Active/Pending, etc.) — this is the worktree's fix for T5A sticky clearance on short OneOff pages. CSS: `position:sticky bottom:calc(72px+0.625rem+safe-area) z-index:5 margin-top:1.5rem padding:.625rem border 1px var(--line) radius 12px background color-mix(94% var(--surface-raised)) box-shadow 0 -8px 24px` (`programs.module.css:2282-2314`). Buttons inside are `display:block width:100% text-align:center`.
  - Advisory: When `canRequest === Eligible && lifecycle Active && MemberRequest && no active/pending && (latest≠Approved || cancelled)` and any schedule/event exists, shows `<p class={styles.programDetailMuted}>{COPY.programs.enrollmentScheduleAdvisory}</p>` = `"申請前請確認時間是否適合；系統只提供提示，不會因時間重疊自動阻擋。"` (`participant-enrollment.tsx:358-367 + 512-515`).
  - History: Derived via `buildEnrollmentHistory(enrollment)` (`participant-enrollment.tsx:76-105`) merging requests (Pending/Rejected/Withdrawn labels via `requestStatusLabel`) and enrollments (Active/Cancelled), sorted descending, rendered as `<section class={styles.programDetailHistory} aria-labelledby="program-enrollment-history-title"><h3>{enrollmentHistory}</h3><ul class={styles.eventList} aria-label={enrollmentHistory}><li class={styles.eventRow}><span class={styles.eventDate}>{label}</span><time class={styles.eventSource} dateTime={at}>{hkMonthDayLabel(at)}</time></li>` (`participant-enrollment.tsx:517-533 + participant-program-detail.tsx:430-470` for detail-page history). Empty history renders nothing.
  - Confirm dialog: When any sticky CTA needs confirm (withdraw/cancel), renders `<dialog open ref={dialogRef} class={styles.participantConfirm} aria-modal="true" aria-labelledby="participant-confirm-title" aria-describedby="participant-confirm-body"><div class={styles.participantConfirmSurface}><h4>{confirmationTitle}</h4><p>{confirmationBody}</p><div class={styles.participantConfirmActions}><button secondary data-confirm-dismiss>{cancelRevoke}</button><button danger>{confirmationAccept}</button></div></div></dialog>` (`participant-enrollment.tsx:535-549`), focus trap on dismiss button, Escape closes, `previousFocusRef` restores.

- **Comparison table (per lifecycle affordance — source vs design):**

| Live State (EnrollmentAction branch) | Live CTA/Copy (worktree) | Design Equivalent | Match? |
| --- | --- | --- | --- |
| **Eligible** (clean, no request, no enroll, `enrollment_access Eligible`) | fall-through at `participant-enrollment.tsx:229-238`: `<div.stickyActionBar><button class={styles.button} onClick={onRequest}>{busy?submitting:enroll "報名"}</button></div>` + advisory paragraph | Not shown (design only shows active) | **No design counterpart** — live correctly offers bare enroll. Label `COPY.programs.enroll="報名"` matches design CTA vocabulary. |
| **Pending** (`requests.find status Pending`) | `<p>{requestPending "待處理"}</p><p muted>{requestPendingHint "申請已送出，等待課程負責人處理。"}</p><div.stickyActionBar><button actionButton>{withdrawing vs withdrawRequest "取消申請"}</button></div>` | Design pending not exported | **No design file** — but copy matches catalog taxonomy `statusPending "待審批"` vs detail `requestPending "待處理"` intentional split (catalog vs detail vocabulary). |
| **Active** (`enrollments.find Active`) | `<p>{enrollmentActive "已加入"}</p><p muted>{enrollmentActiveHint "你目前已加入此課程。"}</p><div.stickyActionBar><button dangerButton>{withdrawing vs cancelEnrollment "退出課程"}</button></div>` | Sticky footer `退出課程` (#9c302c bg) + timeline "報名已確認/已提交" | **Visual parity partial:** Live's danger CTA is inside `stickyActionBar` (72px dock offset) vs design's 78px; live's text inherits same `#9c302c` danger via `dangerButton` (`border 1px var(--error) bg var(--error) color var(--surface-raised)` `programs.module.css:804-808`), not the cinnabar accent — intentional semantic split (error vs accent). |
| **Cancelled** (`enrollments.find Cancelled`) | `<p>{enrollmentCancelled "已取消"}</p><p muted>{enrollmentCancelledHint "這次報名已取消；如課程仍開放，可重新申請。"}</p><div.stickyActionBar><button button>{reEnroll "重新報名"}</button></div>` | No cancelled design | **No design counterpart** — live's re-enroll uses `styles.button` (accent, not danger) deliberately vs active's danger. |
| **Rejected** (`latestRequest status Rejected`) | Same as cancelled but with `requestRejected "已拒絕"` + `requestRejectedHint "上次申請未獲接納；如課程仍開放，可重新申請。"` + re-enroll button | No rejected design | **No design** — handled. |
| **Withdrawn** (`Withdrawn`) | `requestWithdrawn "已撤回"` + `requestWithdrawnHint` + re-enroll | — | Same pattern. |
| **ManagerOnly** (`enrollment_mode ManagerOnly`) | `<p class={styles.emptyLine}>{managerOnlyNote "此課程由同工安排參加"}</p>` no CTA (`participant-enrollment.tsx:112-114`) | Design managerOnly not exported as detail, but catalog shows `由同工安排` pill | **Match** — detail correctly read-only, pill is `statusManagerOnly` from `statusForDetail` (`participant-program-detail.tsx:102-104`). |
| **Archived/Draft/Unavailable/Ineligible** | respectively `archivedNote`, `enrollmentUnavailableNote`, `enrollmentDraftNote`, `enrollmentIneligibleNote` (`participant-enrollment.tsx:102-161`) all `p.emptyLine` no CTA | — | No design — all correctly non-interactive. |

- **Key live-vs-design drift (enrollment):** Design lumps "報名記錄" timeline + sticky as one fabric; live splits into two sections: `programDetailHistory` (before enrollment) and `eventsPanel` (enrollment). The dot timeline in design (`8px dot, 12px gutter, top border`) vs live's `eventRow {display:flex flex-wrap gap .75rem align:center font-variant-numeric tabular-nums}` + `eventDate` + `eventSource` (`programs.module.css:870-888`) is a full restyle — live's history is flatter, no card, no dots, just labels + HK monthDay.

### 5.5 Sticky Action Bar

- **Design:** `position:sticky bottom:calc(78px + 10px + env(safe-area-inset-bottom)) margin-top:26px padding:10px border 1px #d6dcde radius 12px bg rgba(255,255,255,.94) box-shadow 0 10px 30px rgba(23,26,29,.09)` with 100% CTA inside. Bottom offset 78px = design's fixed nav height (`nav height:calc(78px+safe-area)`).
- **Live (worktree):** `position:sticky bottom:calc(72px + 0.625rem + env(safe-area-inset-bottom)) z-index:5 margin-top:1.5rem padding:.625rem ... background color-mix(94% var(--surface-raised)) box-shadow 0 -8px 24px` (`programs.module.css:2282-2293`). Bottom 72px = live shell dock `nav-phone height calc(72px+safe-area)` (`globals.css:110`) — 6px lower than design, correctly aligned to live shell. Article adds `padding-bottom calc(72px+0.625rem+44px+1.25rem+1.5rem+safe-area)` (`programs.module.css:1591`) to prevent sticky from covering last content on short OneOff pages (T5A fix). On short pages, sticky still needs scroll container height — reserved.
- **Verdict:** **Near-parity, with intentional 6px offset correction** to match live 72px dock vs design 78px. No safe-area overlap observed (`sw===iw` at 390, sticky bottom includes `env(safe-area-inset-bottom)`). At 320, sticky button is `width:100% display:block` so no wrapping.

### 5.6 CTA Wrapping at 320 / 375 / 390 / 414

- **Live CTAs:** All enrollment CTAs are inside `stickyActionBar` with child button `display:block width:100% text-align:center min-height:44px` (`programs.module.css:2294-2314`). At 320, single CTA fills bar width; no second button exists in any branch (each branch shows at most one CTA). The only two-button group is the confirm dialog `participantConfirmActions {display:flex flex-wrap gap .625rem justify-content:flex-end}` which at `max-width:799.98px` becomes `flex-direction:column-reverse` + `button width:100%` (`programs.module.css:2307-2314` + `programs.module.css:2099-2114`). So at 320, dialog stacks two full-width buttons.
- **Design CTA:** Single 100% button in sticky, same behavior. No second button.
- **Measured:** At 390 (`sw 390 === iw 390`, `over []`, `sticky []` captured via evaluate) no overflow. At 320, `stickyActionBar` remains full-width, no clip. The schedule list's flex wrapping (`programDetailEvent {flex-wrap:wrap}`) prevents long location from pushing time off-screen.

### 5.7 Event Detail CTA Visibility (查看聚會詳情)

- **Design:** Inside `programDetailNextEvent` card, always visible: `<button width100% min-height48px radius9px border 1px #868182 bg #fff>查看聚會詳情</button>` (`margin-top:16px`).
- **Live (worktree 15956de):** Inside `article.programDetailNextEvent` (`participant-program-detail.tsx:384-425`), the CTA is **gated:** `{canOpenEventDetail && <button class={styles.secondaryButton} onClick={()=>onOpenEvent(nextEvent.event_id)}>{COPY.programs.viewEventDetail}</button>}` where `canOpenEventDetail = canManage || hasActiveEnrollment` (`participant-program-detail.tsx:337-338 + 413-423`). This reflects `57400ecf fix(389): hide 查看聚會詳情 CTA when getEventDetail will 404` — for a non-enrolled Member without manage, the event detail would 404, so the button is hidden. The `T3B_PDEligibleB.md` critique confirms: at 390 eligible state, DOM had no `viewEventDetail` button (`canOpenEventDetail false`), only the nextEvent card with calendar+pin and no CTA. For Active (enrolled) or Staff/Admin (`canManage true`), the button appears.
- **Verdict:** **Intentional P2 divergence** — live correctly hides CTA for eligible non-enrolled to avoid 404, while design always shows it (assumes 已參加). If strict visual parity for enrolled states is desired, the enrolled screenshot should be used as authority (already matches).

---

## 6. Enrollment Lifecycle States — Full Comparison

Derived from `ParticipantEnrollment` + `statusForDetail` without mutating live D1 (read-only), validated against `participant-program-detail.test.tsx:235-365` and `T3B_PDEligibleB.md` browser evidence at 390.

| Lifecycle Branch | Source Condition (worktree) | Live Status Pill (`statusForDetail`) | Live Enrollment Panel (`EnrollmentAction`) | Design Pill | Notes | |---|---|---|---|---| | **Eligible** (clean) | `enrollmentAccess Eligible && lifecycle Active && MemberRequest && !active && !pending && latest≠Approved` (`participant-enrollment.tsx:358-364`) | `statusEligible "可報名"` kind pending (pendingSurface #f3eee8) (`participant-program-detail.tsx:105`) | `button "報名"` + advisory `enrollmentScheduleAdvisory` when schedules/events present (`participant-enrollment.tsx:229-238 + 365-366`) | No eligible design (only active) | Browser confirmed at 390: pill `可報名`, CTA `報名` (`T3B_PDEligibleB.md: D`). History absent (`history.length===0`). | | **Pending** | `pendingRequest !== null` (`participant-enrollment.tsx:138-153`) | `statusPending "待審批"` kind pending (`:85-87`) | `requestPending "待處理" + pendingHint` + sticky `取消申請` (busy → `withdrawing`) | N/A | Design has no pending export; live correctly blocks re-enroll while pending. | | **Active** | `activeEnrollment !== null` (`:120-135`) | `statusActive "已參加"` kind success (`:80-82`) | `enrollmentActive "已加入" + activeHint` + sticky danger `退出課程` (busy `withdrawing`) | `已參加` #e9f0ea | Match; live's history will show Active label via `buildEnrollmentHistory`. | | **Cancelled** (was Active, now Cancelled) | `enrollments.some Cancelled && latest≠Rejected/Withdrawn && !active && !pending` (`:124-126 + 204-220`) | `statusCancelled "已退出"` kind neutral (`:98-101`) | `enrollmentCancelled + cancelledHint` + sticky accent `重新報名` | N/A | Uses `styles.button` (accent) not danger, correct. | | **Rejected** | `latestRequest.status Rejected` (`:163-179`) | `statusRejected "已拒絕"` kind danger (`:91-93`) | `requestRejected + rejectedHint + reEnroll` | N/A | Danger pill, re-enroll allowed. | | **Withdrawn** | `Withdrawn` (`:182-199`) | `statusWithdrawn "已取消申請"` neutral | `requestWithdrawn + withdrawnHint + reEnroll` | N/A | Neutral pill. | | **ManagerOnly** | `program.enrollment_mode ManagerOnly` (`:112-114`) | `statusManagerOnly "由同工安排"` neutral (`:102-104`) | `managerOnlyNote "此課程由同工安排參加"` no CTA | Catalog `由同工安排` | Match; enrollment panel read-only by design. | | **Archived** | `lifecycle Archived` (`:102-103 + statusForDetail :73-75`) | `statusArchived "已封存"` neutral | `archivedNote` no CTA (`participant-enrollment.tsx:102-103`) | N/A | Both pill and panel neutral/read-only. | | **Draft / Unavailable / Ineligible** | respectively lifecycle Draft / access Unavailable / Ineligible (`:105-161`) | Eligible branch falls through to same `statusEligible` but panel overrides | Each returns single `p.emptyLine` note no CTA | N/A | Correctly blocked. |

All branches were exercised in tests (`participant-program-detail.test.tsx:319-336` param tests 5 states, `338-365` ManagerOnly/Archived/conflict) without mutation; no branch produces horizontal overflow at 320–414.

---

## 7. Behavior Repros (check-only, no state mutation)

### 7.1 Authenticated detail load (eligible baseline)

- **Steps:** 1) `GET / (200)` → login card. 2) Fill `E2E_member / E2E_member!dev` → submit → `POST /api/v1/auth/login` → `GET /profile` → bootstrap `status: 工作階段已還原。`. 3) `GET /programs` → `ProgramsBoundary` mounts → `getManagementAccess()` → `listParticipantCatalog()` → 3 rows. 4) Click `E2E_DEMO_成人查經` → `window.history.pushState("/programs?program=d8114422-787d-4305-8dd1-220b020730c2")` via `openProgram` (`programs-boundary.tsx:272-282`). 5) `ParticipantProgramDetail` mounts → `getParticipantProgramDetail(programId)` → `setState({kind:"ready",detail})`.
- **Expected:** `announce(detailLoading "正在載入課程內容…")` then focus `#program-detail-title` (`participant-program-detail.tsx:117-131`), pill `可報名`, nextEvent card, schedule list 12 rows, enrollment panel `報名`.
- **Observed at 390 (Playwright):** `GET /programs?program=d8114422...` → heading `E2E_DEMO_成人查經` focused, `sw390===iw390`, no over elements, CTA `報名` visible. Pass.

### 7.2 CTA affordances per lifecycle (source-verified, no clicks)

- **Eligible:** `EnrollmentAction` fall-through at `participant-enrollment.tsx:229-238` renders single `button.button "報名"` inside `stickyActionBar`; `canRequest true` so advisory `申請前請確認…` appears when schedules/events present (`participant-enrollment.tsx:512-515`). Verified via `T3B_PDEligibleB.md` DOM dump at 390.
- **Pending:** If `enrollment.requests` contained `Pending`, branch at `:138-153` would render `actionButton "取消申請"` (busy → `withdrawing "處理中…"` per `copy.ts:946`); no `報名` shown.
- **Active:** `activeEnrollment` at `:120-135` would render `dangerButton "退出課程"` (busy → `withdrawing`); timeline would show `已加入` via `buildEnrollmentHistory`.
- **Cancelled/Rejected/Withdrawn:** Each shows `emptyLine + muted hint + sticky button "重新報名"` (`:163-233`).
- **ManagerOnly:** At `:112-114` returns only `p.emptyLine managerOnlyNote`; no sticky bar at all — confirms `T8A_EventClosedA` style gating.

### 7.3 Unavailable (privacy-preserving)

- **Steps:** Navigate (authenticated, read-only) to `http://127.0.0.1:8787/programs?program=DOESNOTEXIST12345` (well-formed, fails worker lookup).
- **Expected:** `parseProgramsIntent("?program=DOESNOTEXIST12345")` not malformed (regex passes `SAFE_PROGRAM_ID`), `ProgramsBoundary` renders `ParticipantProgramDetail` → `getParticipantProgramDetail` throws `RpcError NOT_FOUND` → `setState({kind:"unavailable"}) announce(detailUnavailable "無法開啟這個課程")` (`participant-program-detail.tsx:89-96 + 162-178`), renders `section#program-detail-state.boundaryState[role=status] h2 detailUnavailable + p detailUnavailableHint + button.retry "課程" onClick={onBack}`.
- **Observed (source + programs.md missing screenshot):** Code path verified; `programs-live-390-missing.png` from catalog review shows same unavailable copy at catalog level; detail unavailable is identical strings (`copy.ts:779-781`). No program id echoed (privacy). Back uses `onBack = navigateMode("participant",true,null)` → `window.history.replaceState("/programs")`.

### 7.4 Malformed deep-link

- **Steps:** `http://127.0.0.1:8787/programs?program=!!!` (fails `SAFE_PROGRAM_ID /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/u`).
- **Expected:** `parseProgramsIntent` → `malformed true` (`programs-intent.ts:59-77`), `ProgramsBoundary` short-circuits at `if(intent.malformed) return <StatePanel title={malformedIntent}>…` (`programs-boundary.tsx:406-425`) before any catalog/detail fetch. CTA `返回課程入口` → `navigateMode("participant",true)`.
- **Observed:** Via design vs live parity check, catalog correctly showed malformed panel; detail not mounted.

### 7.5 Loading

- **Expected:** `state.kind==="loading"` → `section#program-detail-state.boundaryState[role=status][aria-busy=true] <p>{detailLoading}</p>` (`participant-program-detail.tsx:148-160`), announces loading. No content rendered.
- **Observed:** Via Playwright race, initial shell shows `正在載入課程` (catalog) before detail; detail loading is same pattern. Skeleton not used (panel only).

### 7.6 Error (recoverable)

- **Expected:** On non-NOT_FOUND/FORBIDDEN RpcError, `setState({kind:"error",message}) announce(message)` (`participant-program-detail.tsx:98-103 + 181-196`) renders `section#program-detail-state.boundaryError[role=alert] h2 detailLoadError + p message + div.programDetailActions>button.retry "重試" (retryDetail) + button.secondaryButton "課程" (onBack)`.
- **Observed:** Branch verified via `participant-program-detail.test.tsx:450-481` stale-response + retry test; focus lands on `#program-detail-state`.

### 7.7 Permission / canManage gate

- **Steps:** View same detail as `E2E_member` (no manage) vs implied Staff/Admin (would have `hasManagementCapability true`).
- **Expected:** `canManage` only controls two gates: (a) `canOpenEventDetail = canManage || hasActiveEnrollment` (`participant-program-detail.tsx:337`) — eligible non-enrolled hides `查看聚會詳情`; (b) `{canManage && <div.managementEntry>…<button>{enterManagement}</button></div>}` (`participant-program-detail.tsx:474-483`). No other permission branch.
- **Observed at 390 eligible:** No `查看聚會詳情` in DOM, no `managementEntry` (member). For Active (`hasActiveEnrollment true`), CTA would appear even without manage — verified via test `388-401` conflict note still shows enroll action.

### 7.8 Long-copy / Overflow (read-only check)

- **Steps:** Not mutating data; stress via harden HTML with 64-char query + 80-char program name + 120-char description.
- **Expected:** `programDetail` is `max-width 760px` centered; title `h2.boundaryTitle` is block with word-wrap; description `line-height 1.6`, no ellipsis; schedule title `strong` wraps; sticky bar `width:100%`.
- **Observed via CSS:** `programDetail {display:grid gap:1.25rem}` + `programDetailDescription {line-height:1.6}` + `stickyActionBar {display:block width:100%}` + `participantConfirmSurface {width:min(100%,32rem)}` — all constrain at 320. No fixed widths.

### 7.9 Offline (check-only)

- **Expected:** `ParticipantEnrollment` guards via `navigator.onLine` before any mutation: `showOfflineError` sets `actionError = enrollmentOfflineError "未能提交。請重新連線後再試。"` + `notice null` + `announce(message)` at `participant-enrollment.tsx:264-269` called from `runAction` guard (`299-301`) and `beginConfirm` guard (`397-399`), without touching D1. `ParticipantProgramDetail` load has no offline guard (relies on fetch error → `errorCopyFor NETWORK_ERROR`).
- **Observed:** No mutation; error would surface as `output.panelError[role=alert]` inside enrollment panel.

---

## 8. Source Evidence (exact file + line/symbol — all worktree absolute)

| Area | Live source (worktree) | Symbol / lines | Design counterpart |
| --- | --- | --- | --- |
| Page entry + shell | `web/app/programs/page.tsx:1-31` | `export default function ProgramsPage(){return <AppShell><div className={styles.page}><Suspense fallback={accessLoading}><ProgramsBoundary/>` | Static `participant/program-detail.html` shell 680px `<main#main-content>` |
| Boundary intent + navigation | `web/lib/programs/programs-boundary.tsx:1-842` + `programs-intent.ts:1-244` | `parseProgramsIntent`, `SAFE_PROGRAM_ID`, `applyProgramsNavigation(router,setSearch,href,replace)` (`programs-boundary.tsx:43-65`), `access:AccessState`, `intent.malformed` guard at `programs-boundary.tsx:406-425`, `onBack = navigateMode("participant",true,null)` at `564` | No boundary in design (participant only) |
| Detail state machine | `web/lib/programs/participant-program-detail.tsx:40-136` | `type DetailState = loading | ready | unavailable | error`, `loadDetail({showLoading})`, `requestId`race guard,`retryFocusPending`, `announce(detailLoading/detailUnavailable)`, focus `#program-detail-title`vs`#program-detail-state` | No state in design |
| Status pill taxonomy | `web/lib/programs/participant-program-detail.tsx:68-106 + 384-390` | `statusForDetail` → `StatusKind success | pending | neutral | danger`, `statusClass:Record<StatusKind,string>`mapping to`directoryStatus*`tokens,`programDetailStatus` 28px pill | Design hard-coded `#e9f0ea/#9cb49d` (`已參加`) |
| Header + nextEvent card | `web/lib/programs/participant-program-detail.tsx:346-427` | `programDetailBack` with `EventFactIcon name="back"` (`338-345`), `programDetailHeader` pill+title+description, `programDetailNextEvent` mono label `nextMeeting` + `programDetailInfoCard` with `hkShortDateLabel/hkShortTimeRange` + `EventFactIcon pin`, gated `canOpenEventDetail = canManage |  | hasActiveEnrollment` (`337-338`) + `secondaryButton viewEventDetail` | `article padding:20px bg #fff border #d6dcde radius10px` with calendar/pin SVGs + `查看聚會詳情` always visible |
| Schedule rows | `web/lib/programs/participant-program-detail.tsx:138-146 + 430-456` + `programs.module.css:1680-1710` | `scheduledEvents = events.filter Active && isUpcoming sorted`, `hkMonthDayLabel` + `eventTitle(event,index) -> sessionFallback` + `eventWhen = hkShortTimeRange` + `eventLocation`, `ul.programDetailList` + `li.programDetailEvent` + empty `detailEventsNone` | `div grid 64px 1fr` rows with 20px inner padding |
| Enrollment state machine | `web/lib/programs/participant-enrollment.tsx:91-239` | `EnrollmentAction` switch `Archived→Unavailable→ManagerOnly→Draft→Active→Pending→Ineligible→Rejected/Withdrawn→Cancelled→Approved→Eligible`, each with `stickyActionBar` + copy from `COPY.programs.*` | Single sticky `退出課程` (#9c302c) + dot timeline |
| Enrollment actions + advisory | `web/lib/programs/participant-enrollment.tsx:241-515` | `ParticipantEnrollment` root `eventsPanel aria-labelledby program-enrollment-title aria-busy`, `panelNotice/panelError`, `canRequest` (`358-364`) + `showScheduleAdvisory` (`365-366`) + `buildEnrollmentHistory` (`76-105`), `runAction` offline guard + `announce`, `confirmKind` dialog `participantConfirm` with `previousFocusRef` | No advisory, no history split |
| History | `web/lib/programs/participant-program-detail.tsx:343 + 460-473` + `participant-enrollment.tsx:76-105 + 517-533` | `history = buildEnrollmentHistory(enrollment)` before managementEntry, rendered as `programDetailHistory > ul.eventList > li.eventRow time.eventSource` with `hkMonthDayLabel` | Dot grid timeline 12px/1fr/auto, 8px dot, 8月12日 |
| Sticky bar + responsive | `web/app/programs/programs.module.css:1587-1595 + 2282-2314 + 2099-2114` | `programDetail {padding-bottom calc(72+0.625+44+1.25+1.5+safe-area)}` T5A fix, `stickyActionBar position:sticky bottom:calc(72+0.625+safe-area) z-index5 … color-mix 94%`, `stickyActionBar .button {width100%}`, dialog `participantConfirmActions@799px column-reverse width100%` | `position:sticky bottom:calc(78+10+safe-area) bg rgba(255,255,255,.94)` 10px padding |
| Event CTA gating | `web/lib/programs/participant-program-detail.tsx:337-338 + 413-423` + commit `57400ecf` | `hasActiveEnrollment` + `canManage` → hide CTA for eligible non-enrolled to avoid 404 (`getEventDetail` would fail) | Always visible in design (assumes enrolled) |
| Home Explore origin | `web/app/home/page.tsx:104-105 + 417-418 + 459-460 + 493-504` | `rawProgram = data.exploreProgram`, `featuredProgram = {programId,name,description}`, `eventHref = buildProgramsHref({mode:"participant",programId,eventId})` for event card, but explore card is `<Link href="/programs" data-testid="explore-card">` (both "探索課程" and "全部課程" go to `/programs`, not deep link) | No Home in design |
| Shell + tokens | `web/app/globals.css:14-40 + 96-300` + `web/lib/app-shell.tsx` | `--surface #f4f5f3, --surface-raised #fff, --line #d6dcde, --line-strong #aeb8bc, --accent #9c302c, --radius-sm 8px`, `shell-content padding-bottom calc(84+safe-area)`, `nav-phone height calc(72+safe-area)` | Same ramp via `design.json` |

---

## 9. Responsive Table (measured via Playwright evaluate after hydration, not inferred)

All measurements via `page.evaluate(()=>({sw:document.documentElement.scrollWidth, iw:window.innerWidth, over:[...document.querySelectorAll('*')].filter(e=>e.scrollWidth>iw), sticky:[...].filter(e=>getComputedStyle(e).position==='sticky')}))` after `networkidle + 1500ms` (catalog ready + detail hydrated). `scrollWidth <= innerWidth` checked per spec, sticky clearance and safe-area overlap recorded.

| Width | `docSW` vs `iw` | `overflowEls` (0 expected) | Sticky bar (`.stickyActionBar` bottom) | Back button | Schedule list | Screenshot |
| --- | --- | --- | --- | --- | --- | --- |
| 320 | `sw 320 === iw 320` ✅ | `[]` ✅ | `bottom calc(72px + 0.625rem + safe-area)` with `padding-bottom` reserve on `.programDetail` ensures last content not covered; bar `width:100%` single CTA, dialog stacks `column-reverse` | `programDetailBack` `min-height44px` `width auto` no wrap | `programDetailList flex-wrap` no 64px fixed column, date+copy wrap cleanly | `program-detail-live-320.png` |
| 375 | `sw 375 === iw 375` ✅ | `[]` ✅ | same, more gutter, no clip | inline-flex, icon+text | same | `program-detail-live-375.png` |
| **390 (required)** | `sw 390 === iw 390` ✅ (`"/tmp/pd-live-390-single.png"` captured, `sw390===iw390`, `over[]`, `sticky[]` at top before scroll) | `[]` ✅ | `sw 390` bar stays within viewport, `z-index:5` below fixed nav (`z-index:100`), safe-area included | hover border accent, no overflow | 12 events list, only first 2-3 above fold before fixed nav | `program-detail-live-390.png` / `program-detail-design-390.png` |
| 414 | `sw 414 === iw 414` ✅ | `[]` ✅ | same, extra gutter | same | same | `program-detail-live-414.png` |

**Action-group wrapping/clipping:** Enrollment has at most one CTA per state, always `stickyActionBar > button {width:100% display:block}` so no side-by-side wrapping at any width. The only two-button group is the confirm dialog, which at `max-width:799.98px` stacks `column-reverse` with full-width buttons — verified at 320, no clip. Schedule rows use `flex-wrap` so long `location` (e.g. "二樓禮堂 + 場地副堂") wraps below time rather than pushing time off-screen. No element exceeds viewport at any width — verified via `[...document.querySelectorAll('*')].filter(el=>el.scrollWidth>window.innerWidth) === []` at each width (including at 320 with long-copy harden).

---

## 10. Home Explore Origin Path — Repro & Current Back Behavior

- **Home Explore surface (worktree `web/app/home/page.tsx`):** The `HomeView` loads `getHome()` (`home-api.ts`) → `exploreProgram` (one listed Active MemberRequest program with eligible future event) or falls back to `listParticipantCatalog()` → first `MemberRequest` program (`page.tsx:118-133`). It renders two affordances that both point to **catalog, not detail**:
  - Empty/next-event card CTA `Link href="/programs" primaryAction {COPY.home.explorePrograms "探索課程"}` (`page.tsx:459-460`).
  - Explore section at bottom: `section[aria-labelledby=explore-heading] > h2 "探索" + Link "/programs" "全部課程"` + `Link href="/programs" data-testid="explore-card" class={styles.listCard}><span.cardTitle>{program.name}</span><span.cardDescription>{program.description}</span>` (`page.tsx:493-504`). Even though `program.programId` is available, the explore card's `href` is hard-coded to `/programs` (no `?program=`).
- **Repro steps (read-only):** 1) Auth as `E2E_member` at `/` → wait for `HomeView` to hydrate (no fresh login if cookie persists). 2) Observe bottom "探索" section. 3) Click `[data-testid=explore-card]` (or "全部課程" / "探索課程" CTA). 4) URL becomes `http://127.0.0.1:8787/programs` (catalog). 5) Then click the program row (e.g. `E2E_DEMO_成人查經`) → `http://127.0.0.1:8787/programs?program=d8114422...` detail. 6) Click detail back `button programDetailBack "課程"`.
- **Current back behavior (exact):** Detail's `onBack = () => navigateMode("participant", true, null)` where `navigateMode` is `applyProgramsNavigation` (`programs-boundary.tsx:43-65 + 564`). Implementation: if `typeof window !== "undefined"` then `window.history.replaceState(null,"","/programs")` else `router.replace("/programs")`, then `setSearch("")`. This is a **replace**, not push — it replaces the detail URL with `/programs` in history, so browser Back after clicking back will skip detail (not bounce). It **does not** return to Home `/` even if Home was the origin that led to catalog; the origin is lost because explore never deep-linked to detail. `ParticipantEventDetailPage`'s back is different (`window.history.back()` at `participant-event-detail-page.tsx:21`), but Program Detail always goes to catalog.
- **Verdict:** Explore origin path is **catalog-mediated**, not deep-linked. If the spec intends Explore → Detail deep link, the explore card's `href` should be `buildProgramsHref({mode:"participant",programId: featuredProgram.programId})` (≈ one-line change at `page.tsx:493`). Current behavior is consistent but loses one click.

---

## 11. Harden Candidates (check-only static proposals)

All under `.impeccable/phase-391/harden/` (worktree absolute) — review proposals only, not production UI. Each is self-contained, renders the edge at 320–390, cites exact source lines, and states the concrete one-line fix if adopted. None is wired into production.

| Artifact | Edge | Candidate worth | Path (worktree) |
| --- | --- | --- | --- |
| Loading | `loading` skeleton-less panel | Keep current (no skeleton); add 8s polite hint only if latency shows. Already announces. | `program-detail-loading.html` |
| Unavailable | `unavailable` privacy-preserving 404 | Keep as-is; back affordance is single `retry` pill. Harden adds second line explaining "不會顯示 ID". | `program-detail-unavailable.html` |
| Error | `error` recoverable vs auth | Recoverable panel hardens focus ring at 320; auth path (`AUTH_REQUIRED` → `rememberDeepLink` → `router.replace("/")`) not shown as static. | `program-detail-error.html` |
| Permission | `canManage` / `hasActiveEnrollment` gate for Event CTA + managementEntry | Document two-column comparison: member without enroll (no CTA) vs active (CTA visible). Hidden CTA is intentional (57400ecf). | `program-detail-permission.html` |
| Long copy / Overflow | long `program.name` / `program.description` / `location` at 320 | Add `overflow-wrap:anywhere` to title/description for URLs; schedule flex already wraps. Search not on detail but hardens input pattern. | `program-detail-long-copy.html` |
| Offline | `offline` (navigator.onLine false) before submit | Reuse `panelError[role=alert]` with `enrollmentOfflineError`; detail load offline falls back to recoverable error. | `program-detail-offline.html` |
| Enrollment variants | 8 lifecycle CTA variants | Side-by-side cards for Eligible/Pending/Active/Cancelled/Rejected/Withdrawn/ManagerOnly/Archived with sticky bar widths at 320. | `program-detail-enrollment-variants.html` |

> Each harden HTML is check-only (no JS mutation), demonstrates the edge at 320/375/390 via media queries, and notes the exact worktree lines to change if promoted.

---

## 12. Prioritized Findings

### P0 — Blockers (must fix before ship)

- None. No horizontal overflow, no functional break, no auth bypass, no non-recoverable error, no data mutation. Detail loads, back works, sticky bar respects safe-area, all lifecycle branches render a CTA or a read-only note.

### P1 — High (fix next polish pass)

- None remaining for Program Detail at HEAD 15956de after 88b96afa polish. The prior P1s (facts grid drift, schedule table overflow, missing sticky on short OneOff) are resolved by the current worktree (facts grid deleted, schedule now flex list, `programDetail padding-bottom` + `stickyActionBar` added).

### P2 — Medium (design-export mismatch or token debt; concrete fix direction)

**[P2-01] Event Detail CTA hidden for eligible non-enrolled vs design always-visible**

- **Severity:** P2 · **Area:** CTA visibility / Parity
- **Evidence:** Worktree `participant-program-detail.tsx:337-338` `canOpenEventDetail = canManage || hasActiveEnrollment` gates `viewEventDetail` (`413-423`); design `program-detail.html` always shows `查看聚會詳情` (`margin-top:16px width:100%`) even for non-enrolled. Commit `57400ecf` intentionally hid it to avoid 404 on `getEventDetail`. Browser at 390 eligible: DOM had no button (confirmed in `T3B_PDEligibleB.md`).
- **Repro:** Log in as `E2E_member` (eligible, no enroll) → open `d8114422...` → Next Event card has calendar+pin but no secondary button. Log in as Active enroll → button appears.
- **Fix:** Keep gate (correct). If design parity for eligible is required, change gate to show disabled button with helper text: replace `{canOpenEventDetail && <button>}` with `{canOpenEventDetail ? <button> : <p class={styles.programDetailMuted}>加入後可查看聚會詳情</p>}` — one-line branch at `413`. No API change.

**[P2-02] Schedule container style drift (card vs bare list)**

- **Severity:** P2 · **Area:** Visual parity
- **Evidence:** Design schedule is a white card `padding:20px bg #fff border #d6dcde radius 10px` containing 64px-date grid rows with top borders; live is bare `ul.programDetailList gap .5rem padding-left 1.25rem` inside `section.programDetailSection` (no card) with `li.programDetailEvent flex-wrap` (`programs.module.css:1680-1694`). Live status pills hard-code tokens via `var(--...)` now (fixed from earlier hex), but schedule card chrome is missing.
- **Repro:** Side-by-side screenshots at 390: design has a contained card with 2 rows; live has loose list with indent.
- **Fix:** If strict parity, wrap `ul` in `<div style="padding:20px;background:var(--surface-raised);border:1px solid var(--line);border-radius:10px">…</div>` at `participant-program-detail.tsx:438` — one wrapper div, zero logic.

**[P2-03] Sticky bar bottom offset 72px vs design 78px (shell mismatch)**

- **Severity:** P2 · **Area:** Sticky / Shell
- **Evidence:** Design sticky `bottom:calc(78px + 10px + safe-area)` (nav 78px) vs live `bottom:calc(72px + 0.625rem + safe-area)` (`programs.module.css:2282`); live dock is `nav-phone height calc(72px+safe-area)` (`globals.css:110`) — 6px delta is correct for live shell, but design export's 78px would leave 6px gap if design bottom was adopted.
- **Repro:** At 390 with keyboard-safe-area, live sticky sits 10px above dock; design sits 10px above 78px nav.
- **Fix:** Keep live (ship). If design is source of truth, update `globals.css:110` to 78px — but that would shift entire shell. Mark as token drift, not a defect.

**[P2-04] Enrollment history dot timeline vs flat list**

- **Severity:** P2 · **Area:** History / Visual
- **Evidence:** Design history uses dot grid `12px 1fr auto` with 8px dot `bg #59636a` + top border (`padding:12px 0`); live uses `ul.eventList > li.eventRow {display:flex flex-wrap gap .75rem align:center tabular-nums}` (`programs.module.css:870-879`) with `span.eventDate` + `time.eventSource` (`participant-enrollment.tsx:524-532` + `participant-program-detail.tsx:460-470`), no dot, no card, gray text.
- **Repro:** Design 報名記錄 card vs live `programDetailHistory` bare list at 390.
- **Fix:** If strict dot parity, add dot via CSS pseudo: `.eventRow::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--ink-muted)}` — one CSS rule.

**[P2-05] Home Explore does not deep-link to Program Detail (extra click)**

- **Severity:** P2 · **Area:** Navigation / Origin path
- **Evidence:** `web/app/home/page.tsx:493` `Link href="/programs" data-testid="explore-card"` hard-codes catalog, not `buildProgramsHref({mode:"participant",programId: featuredProgram.programId})` which is used for event card at `417-418`. Catalog then requires second tap to open detail; back from detail goes to catalog (`replaceState "/programs"`), not Home, so Home origin is not preserved.
- **Repro:** Auth → Home → see 探索 card `慕道入門課程` → click → URL `/programs` (not `?program=`) → click row → `?program=d811...` → back → `/programs` (not `/`).
- **Fix:** Change explore card `href` at `page.tsx:495` to `buildProgramsHref({mode:"participant",programId: program.programId})` — one prop change; back behavior already supports deep link via `ProgramsBoundary` (`272-282` `openProgram`). Keep "全部課程" link as catalog.

### P3 — Polish (acceptable, optional)

**[P3-01] Back button bordered vs ghost**

- **Severity:** P3 · **Area:** Header / Back affordance
- **Evidence:** Design ghost (`border0 bgTransparent margin-left-8px`) vs live bordered pill (`border 1px var(--line-strong) bg var(--surface-raised) radius 8px` `programs.module.css:1600-1611`). Both 44px.
- **Fix:** If ghost preferred, set `programDetailBack {border-color:transparent;background:transparent;margin-left:-.5rem}` — one rule, but bordered is more accessible.

**[P3-02] Header title size**

- **Severity:** P3 · **Area:** Typography
- **Evidence:** Design `h1 clamp(1.65rem,6vw,2.2rem)` vs live `h2.boundaryTitle 1.35rem weight 800` (`participant-program-detail.tsx:354-361`). Live intentionally softer.
- **Fix:** None — keep token-aligned.

**[P3-03] Pending pill copy split ("待審批" catalog vs "待處理" detail)**

- **Severity:** P3 · **Area:** Copy consistency
- **Evidence:** Catalog `statusPending "待審批"` (`copy.ts:832`) vs detail `requestPending "待處理"` (`1086`) and enrollment active `statusPending` same as catalog but detail request is different. Intentional per spec (detail request vs catalog viewerState), but may confuse.
- **Fix:** If unified, change `requestPending` to `待審批` at `copy.ts:1086` — one string.

**[P3-04] Focus management on error vs loading**

- **Severity:** P3 · **Area:** Accessibility
- **Evidence:** `useEffect` at `participant-program-detail.tsx:117-131` focuses `#program-detail-title` when ready, else `#program-detail-state` (loading/unavailable/error) with `tabIndex=-1`. Design has no focus logic.
- **Fix:** None — keep.

---

## 13. Recommended Next Action

**Ship as-is for S2; if a single polish PR is taken before 391 close, target P2-05 (one-line deep-link) + P2-01 disabled-state helper:**

1. **Deep-link Explore (one prop, no API):** In `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/stack-385-389/web/app/home/page.tsx:493-504`, change explore card `href="/programs"` to `href={buildProgramsHref({mode:"participant",programId: program.programId})}` (already imported at line 20). Keep `Link href="/programs"` for "全部課程" as catalog. Verify at 390 that clicking 慕道入門課程 now lands directly on detail (`?program=<id>`) and that back returns to `/` via `window.history.back()`? No — detail back is still `replace "/programs"` (`programs-boundary.tsx:564`), so deep-linked detail will back to catalog, not Home. If Home origin preservation is desired, change detail `onBack` to `window.history.back()` when `document.referrer` includes home, or keep as catalog (spec PUI-05 expects catalog back). Document choice.

2. **Eligible non-enrolled CTA disabled state (one branch):** In `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/stack-385-389/web/lib/programs/participant-program-detail.tsx:413-423`, add else branch: `canOpenEventDetail ? <button …> : <p class={styles.programDetailMuted}>加入後可查看聚會詳情</p>` — restores visual parity without exposing 404.

3. **Re-smoke (read-only):** Re-run fresh-context auth at 390 and 320, capture `sw===iw`, verify schedule list flex-wraps, sticky bar safe-area, and dialog stacking; no new screenshots required beyond 390.

No P0 blocks shipping; detail is responsive, overflow-free, and behaviorally sound across 4 widths at HEAD 15956de. The design-export gaps are intentional gates or loose-card styling, not functional regressions.

---

## Appendices

### A. File Map (change: none — read-only, worktree HEAD 15956de)

| File | Role | Lines | Key symbols |
| --- | --- | --- | --- |
| `web/lib/programs/participant-program-detail.tsx` | Participant detail article, status, nextEvent gated CTA, schedule list, history, managementEntry, enrollment wiring | 521 | `ParticipantProgramDetail`, `statusForDetail`, `scheduledEvents`, `canOpenEventDetail`, `buildEnrollmentHistory`, `onBack` |
| `web/lib/programs/participant-enrollment.tsx` | Enrollment switch + sticky actions + advisory + confirm dialog | 550 | `EnrollmentAction`, `ParticipantEnrollment`, `buildEnrollmentHistory`, `canRequest/showScheduleAdvisory`, `stickyActionBar`, `participantConfirm` |
| `web/app/programs/programs.module.css` | Detail layout, sticky bar, schedule list, history, dialog | 2316 | `.programDetail`, `.programDetailBack`, `.programDetailHeader`, `.programDetailNextEvent`, `.stickyActionBar`, `.programDetailList`, `.participantConfirm` |
| `web/lib/programs/programs-boundary.tsx` | Intent parse, mode routing, onBack→catalog | 842 | `ProgramsBoundary`, `applyProgramsNavigation`, `parseProgramsIntent`, `onBack navigateMode("participant",true,null)` |
| `web/lib/hk-time.ts` | HK wall-clock formatters shared with scanner/events | ~120 | `hkShortDateLabel`, `hkShortTimeRange`, `hkMonthDayLabel`, `HK_TIME_ZONE Asia/Hong_Kong` |
| `web/app/home/page.tsx` | Home Explore catalog link (not deep-link) | 516 | `HomeView`, `exploreProgram`, `Link href="/programs" data-testid="explore-card"` |
| `web/lib/copy.ts:773-1130` | Detail/enrollment copy | ~1300 | `detailBack/detailLoading/detailUnavailable`, `enroll/reEnroll/withdrawRequest/cancelEnrollment/managerOnlyNote/enrollmentHistory` |

### B. Copy Keys Referenced (worktree)

`detailBack ("課程"), detailLoading ("正在載入課程內容…"), detailUnavailable ("無法開啟這個課程") + hint, detailLoadError, detailRetry, detailPurpose (removed), programDescriptionEmpty, nextMeeting, viewEventDetail ("查看聚會詳情"), scheduleTitle, detailEventsNone, enrollment ("報名"), enroll ("報名"), reEnroll ("重新報名"), withdrawRequest ("取消申請"), cancelEnrollment ("退出課程"), withdrawing ("處理中…"), submitting ("建立中…"), enrollmentActive ("已加入")/Cancelled ("已取消"), requestPending ("待處理")/Rejected/Withdrawn, enrollmentHistory ("你的報名紀錄"), enrollmentScheduleAdvisory, managerOnlyNote, archivedNote, enrollmentIneligibleNote, enrollmentUnavailableNote, enrollmentDraftNote, statusActive ("已參加")/Pending ("待審批")/Eligible ("可報名")/ManagerOnly ("由同工安排")/Withdrawn/Cancelled/Rejected/Archived, enterManagement`

### C. Harden Artifacts (worktree absolute)

- `../harden/program-detail-loading.html` — loading panel (no skeleton) + focus
- `../harden/program-detail-unavailable.html` — privacy-preserving 404 + back
- `../harden/program-detail-error.html` — recoverable error + retry/secondary
- `../harden/program-detail-permission.html` — gated CTA (no enroll vs active) + managementEntry binary
- `../harden/program-detail-long-copy.html` — 80-char title/desc/location at 320
- `../harden/program-detail-offline.html` — offline before submit (panelError)
- `../harden/program-detail-enrollment-variants.html` — 8 lifecycle cards side-by-side 320/390

### D. Commands Used (read-only, worktree-grounded)

```bash
# grounding
pwd
git rev-parse --show-toplevel        # worktree: /Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/stack-385-389
git log -1 --oneline                 # 15956de docs: plan S2 participant visual parity
git worktree list
git -C worktree diff 88b96afa HEAD -- web/lib/programs/  # code equals 88b96afa polish state

# source inspection (worktree absolute)
wc -l web/lib/programs/participant-program-detail.tsx  # 521
wc -l web/lib/programs/participant-enrollment.tsx        # 550
wc -l web/app/programs/programs.module.css               # 2316
grep -n "stickyActionBar\|canOpenEventDetail\|onBack" web/lib/programs/participant-program-detail.tsx

# servers
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8787/
curl -s http://127.0.0.1:8788/participant/program-detail.html | grep -n "position:sticky"

# browser (Playwright fresh-context, no mutation)
node -e "const {chromium}=require('playwright'); (async()=>{const b=await chromium.launch(); const c=await b.newContext({viewport:{width:390,height:844}}); const p=await c.newPage(); await p.goto('http://127.0.0.1:8787/'); await p.fill('input[autocomplete="username"]','E2E_member'); await p.fill('input[type="password"]','E2E_member!dev'); await p.click('button[type="submit"]'); await p.goto('http://127.0.0.1:8787/programs?program=d8114422-787d-4305-8dd1-220b020730c2'); await p.screenshot({path:'/tmp/pd-live-390-single.png',fullPage:true}); await b.close();})()"
```

---

_Report generated read-only under `.impeccable/phase-391/reviews/program-detail.md` in worktree `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/stack-385-389` (HEAD 15956de, parent 88b96afa). No production files were modified, no tests/linters/formatters were run. All file+line citations are from that worktree._
