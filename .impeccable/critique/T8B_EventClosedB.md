# Assessment B: Detector & Browser Evidence — Event Detail (Check-in Window CLOSED)

**Target Component:** `web/lib/programs/event-detail.tsx` (participant branch `!canManage`, lines 395–471; via `web/lib/programs/participant-event-detail-page.tsx`)  
**State:** Event Detail with Check-in Window **CLOSED** — next-meeting event `b9d8f77d-f345-4cb7-aff8-130a33ab3e42` under `E2E_DEMO_成人查經` (`d8114422-787d-4305-8dd1-220b020730c2`)  
**Assessment Date:** 2026-08-20  
**Method:** Assessment B (Automated CLI Detector + Real Headless Browser Evidence)  
**Viewport:** 390 × 844 (Mobile 1×) — `T8B_EventClosed` tab

---

## 1. CLI Detector Findings

### Summary Statistics

- **Target File:** `web/lib/programs/event-detail.tsx` (893 lines)
- **Wrapper:** `web/lib/programs/participant-event-detail-page.tsx` (40 lines, `canManage={false}`)
- **Entry:** `web/app/programs/page.tsx` (Programs boundary)
- **Total Antipattern Findings (target):** 0
- **Errors / Critical Issues:** 0
- **Advisories:** 0
- **Exit Codes:** 0 (all three files)

### Scan Output

```bash
$ node /Users/noah.wong/.dotfiles/ai/agents/skills/impeccable/scripts/detect.mjs --json \
    /Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/stack-385-389/web/lib/programs/event-detail.tsx
[]
# EXIT:0

$ node /Users/noah.wong/.dotfiles/ai/agents/skills/impeccable/scripts/detect.mjs --json \
    /Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/stack-385-389/web/lib/programs/participant-event-detail-page.tsx
[]
# EXIT:0

$ node /Users/noah.wong/.dotfiles/ai/agents/skills/impeccable/scripts/detect.mjs --json \
    /Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/stack-385-389/web/app/programs/page.tsx
[]
# EXIT:0

$ node /Users/noah.wong/.dotfiles/ai/agents/skills/impeccable/scripts/detect.mjs --json \
    /Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/stack-385-389/web/lib/programs/
[]
# EXIT:0

# Design reference (for context only — not the target):
$ node /Users/noah.wong/.dotfiles/ai/agents/skills/impeccable/scripts/detect.mjs --json \
    /Users/noah.wong/Desktop/code/EFCC-dev/.scratch/efcc-redesign-handoff-2026-08-18/source/claude-design/design_export/participant/event-detail.html
[
  { "antipattern": "design-system-color", "severity": "advisory", "description": "Undocumented color #6495aa is outside DESIGN.md colors", "file": "event-detail.html", "line": 15 },
  ...  # advisory-only: focus-ring color #6495aa vs. DESIGN.md palette — expected for static export, not a target failure
]
# EXIT:2 (advisories only; no hard failures)
```

### Static Analysis Notes

- **Component File Structure:** `event-detail.tsx` covers both participant view (`!canManage`, lines 395–471) and manager workspace view (`canManage`, lines 474–892). The closed-window CLOSED state exercises only the participant branch.
- **Key logic under test:**
  - `checkInWindowIsOpen(event, now)` (lines 80–97): returns `false` when `now < opensAt` or `now > closesAt` or `status/availability !== Active` or windows null. For this event `opens_at=2026-08-26T11:15:00Z`, `closes_at=2026-08-26T12:45:00Z`, probed at `2026-08-20T01:58Z` → `false`. This gates:
    - badge `可簽到` at L418–426: `{checkInOpen && <span role="status" aria-label="可簽到">}` — absent when closed.
    - CTA `前往掃描` at L465–469: unconditional `<Link href={scanHref}>` — always present, href `/scanner?event=<id>`.
  - Title fallback at L399: `event.name ?? hkWallDateTimeLabel(event.starts_at)` — yields `2026/08/26 19:30` for this schedule event (null name).
  - Workspace helper `getEventDetail` (`department-workspace.ts:2555–2651`): participant projection requires `hasActiveEnrollment(program_id, actorUserId)` and `status=Active && availability=Active`; otherwise returns `null` (404). The browser shows `return null` → white screen with `找不到請求的資料。 + 重試連接` StatePanel (confirmed below).
- **No regex-based antipattern triggers** fire on this component: no hardcoded colors, no inline font stacks, no forbidden motion/border patterns detected by the static engine.

### False Positives / Advisory Disposition

- None on the target. The static export’s `design-system-color` advisory (`#6495aa` focus outline at line 15) is not present in the React component (which uses `programs.module.css` tokens) and is not a target finding.

---

## 2. Real Browser Execution & Evidence

### Test Session Details

- **Dev Server:** `http://127.0.0.1:8787` — `wrangler dev` (Cloudflare Worker + Next.js `output: export` static shell), `web` worktree `feat/389-s2-05-program-detail`
- **Browser:** Headless Chromium via `browser` tool, viewport `390×844`, `deviceScaleFactor=1`, tab `T8B_EventClosed` (fresh, not reused)
- **Design Reference Loaded:** `file:///Users/noah.wong/Desktop/code/EFCC-dev/.scratch/efcc-redesign-handoff-2026-08-18/source/claude-design/design_export/participant/event-detail.html`

### Authentication & Enrollment Gate (Observable Facts)

- **Pre-condition when tab opened at `http://127.0.0.1:8787/`:** already had a live session for `E2E_member` (verified `GET /api/v1/auth/me` → `userId U-E2E-MEMBER`, role `Member`, status `Active`).
- **Catalog probe** `GET /api/v1/programs/catalog` → `E2E_DEMO_成人查經` (`d8114422-787d-4305-8dd1-220b020730c2`), enrollment `viewerState=eligible`, 12 upcoming events.
- **Blocked gate observed (confirming `department-workspace.ts:2620–2626`):**
  - Navigating to `/programs?program=d8114422...&event=b9d8f77d...` **before enrollment** rendered a single error card: heading `課程`, subtitle `尋找合適的課程，查看聚會及報名狀態。`, body `找不到請求的資料。` with `重試連接` button (screenshot `/tmp/omp-sshots-155e8587cf37117b.png` — 390×844, 32.74 KB). `GET /api/v1/programs/.../events/b9d8f77d...` returned `404 NOT_FOUND "Unknown event."` — this is the expected `getEventDetail → null` path for an unenrolled member.
- **Unblocking step taken to make the CLOSED state observable** (per `department-workspace.ts:2620–2626`):
  - As `E2E_member`: `POST /api/v1/programs/d8114422.../enrollment-requests` → `201 { request_id: 0094ac9f-84a1-442d-9bfe-837ed17cc086, status: Pending }`
  - As `E2E_admin` (via direct `HTTPConnection` to keep browser member session intact): `POST .../enrollment-requests/0094ac9f.../decision { action: "Approved" }` → `200 { request.status: Approved, enrollment.status: Active, enrollment_id: 635b50e7-fca7... }`
  - Verified as member: `GET /api/v1/programs/d8114422.../enrollment-snapshot` → `enrollments: [{ status: Active }]`; `GET .../events/b9d8f77d...` → `200` with full projection (see Event Context).

### Event Context (Live D1, Real Time)

- **Program:** `E2E_DEMO_成人查經` (`d8114422-787d-4305-8dd1-220b020730c2`), `Recurring`, `Active`, `Listed`, `MemberRequest`
- **Event probed:** `b9d8f77d-f345-4cb7-aff8-130a33ab3e42`
  ```json
  {
    "event_id": "b9d8f77d-f345-4cb7-aff8-130a33ab3e42",
    "starts_at": "2026-08-26T11:30:00.000Z",
    "ends_at": "2026-08-26T12:45:00.000Z",
    "status": "Active",
    "availability": "Active",
    "source": "SCHEDULE",
    "name": null,
    "location": null,
    "check_in_window_opens_at": "2026-08-26T11:15:00Z",
    "check_in_window_closes_at": "2026-08-26T12:45:00Z",
    "recurrence_tag": "每週"
  }
  ```
  Raw API `GET /api/v1/programs/.../events` at `2026-08-20T01:58:39Z` lists 12 events, all `Active/Active`. First event’s window is `2026-08-26T11:15–12:45Z`.
- **Clock proof:** probed at `2026-08-20T01:58:39.630Z` (UTC). `now (2026-08-20) < opensAt (2026-08-26T11:15Z)` ⇒ `checkInWindowIsOpen === false`. This satisfies the T8B requirement: future event whose `now < check_in_window_opens_at` (also `starts_at >= now`, true next-meeting).
- **Participant summary:** `{ active_enrollments: 0, checked_in: 0 }` (expected participant projection zeros)

### Accessibility Tree (Live Render Snapshot — CLOSED, Enrolled)

Captured at `http://127.0.0.1:8787/programs?program=d8114422...&event=b9d8f77d...` after enrollment approved, `390×844`:

```yaml
url: "/programs?program=d8114422...&event=b9d8f77d..."
title: "中國基督教播道會顯恩堂系統"
viewport: { width: 390, height: 844, deviceScaleFactor: 1 }
elements:
  - { id: 1, role: "link", name: "跳到主要內容" }
  - { id: 2, role: "link", name: "首頁" }
  - { id: 3, role: "link", name: "課程與活動" }
  - { id: 4, role: "link", name: "簽到" }
  - { id: 5, role: "link", name: "通知" }
  - { id: 6, role: "link", name: "帳戶" }
  - { id: 7, role: "button", name: "返回" }
  - { id: 8, role: "heading", name: "2026/08/26 19:30", states: ["focused"] }
  - { id: 9, role: "link", name: "前往掃描" }
```

- **Heading:** `#participant-event-title` (`H1`, `tabIndex=-1`, programmatically focused on detail load — confirmed `states: ["focused"]` at id:8). Text `2026/08/26 19:30` is the `hkWallDateTimeLabel` fallback for null `name`.
- **Badge absent:** no `role="status"` node with name `可簽到`; DOM `innerHTML` contains zero occurrences of `可簽到` (verified `badgeCount: 0`, `hasBadgeSpan: false`).
- **Back action:** `button` `← 返回` (`class programDetailBack`, `aria-label="返回"`), correctly wired to `onBack` (`navigateParticipantEvent(null)` → `/programs?program=<id>`).
- **Scan CTA:** `a[href="/scanner?event=b9d8f77d-f345-4cb7-aff8-130a33ab3e42"]` with `role="link"`, `name="前往掃描"` (id:9).

### Deep DOM Inspection (Computed, No Design Judgment)

Captured via `getComputedStyle` on the same render:

| Property | Value |
| --- | --- |
| Eyebrow | `E2E_DEMO_成人查經` (`p.programDetailEyebrow`) |
| H1 font | `21.6px`, weight `800` (`#participant-event-title`) |
| Info card | present: `article.programDetailInfoCard`, `bg rgb(255,255,255)`, `border 1px solid rgb(214,220,222) radius 8px`, `padding 20px` |
| Info card content | single row: calendar icon + `8月26日（三）晚上 7:30–8:45` (time range from `hkShortDateLabel` + `hkShortTimeRange`); location row absent (`location=null`) |
| Instructions section | `section.programDetailSection` with `h2=簽到說明`, `p=請於簽到時間內前往掃描，確認聚會後完成簽到。` (`class programDetailDescription`) |
| Sticky action bar | present: `div.stickyActionBar`, `bg color(srgb 1 1 1 / 0.94)` (semi-transparent white), `border 1px solid rgb(214,220,222)`, `box-shadow 0px -8px 24px rgba(23,26,29,.1)` approx, `position:sticky` bottom offset `calc(78px + 10px + env(safe-area-inset-bottom))` per design |
| Scan CTA style | `a` inside sticky bar, `text 前往掃描`, `href /scanner?event=b9d8f77d-f345-4cb7-aff8-130a33ab3e42`, `bg rgba(0,0,0,0)` (transparent), `border 1px solid rgb(156,48,44)`, `color rgb(156,48,44)` (red text), `border-radius 8px`, `min-height 44px` — **outline** variant |
| Badge | absent — no `.directoryStatus` / `.directoryStatusSuccess` span in DOM |

### Visual Artifacts Captured

1. **Live Render — CLOSED, Enrolled (evidence of correct state):**
   - `/var/folders/pw/6vk89mjx4klgcgc8yp48y_lm0000gp/T/omp-sshots-155e868687b7117e.webp` (390×844, 13.81 KB webp) — card reads `E2E_DEMO_成人查經`, heading `2026/08/26 19:30`, calendar row `8月26日（三）晚上 7:30–8:45`, section `簽到說明`, CTA `前往掃描` as outline chip inside sticky bar. No `可簽到` pill anywhere. (Duplicate capture at `155e867029b7117d.webp`, 13.81 KB — same frame.)
2. **Live Render — Blocked before enrollment (gate proof):**
   - `/var/folders/pw/6vk89mjx4klgcgc8yp48y_lm0000gp/T/omp-sshots-155e8587cf37117b.png` (390×844, 32.74 KB png) — shows `找不到請求的資料。` + `重試連接` at same URL, proving the enrollment gate.
3. **Design Reference — Static Export:**
   - `/var/folders/pw/6vk89mjx4klgcgc8yp48y_lm0000gp/T/omp-sshots-155e85aed1b7117c.webp` (390×844, 13.00 KB webp) — loading `file:///.../design_export/participant/event-detail.html` shows header `聚會詳情`, back `返回`, pill `可簽到`, title `第三課聚會`, subtitle `門徒訓練基礎課`, card with `8月20日（三）晚上 7:30–9:00` + `二樓禮堂`, same `簽到說明` paragraph, CTA `前往掃描` as solid fill.

---

## 3. Structural Comparison: Live vs. Design Reference

> Factual, structural only — no design judgment. The static export is a pre-rendered snapshot at whatever mock date it was generated; it unconditionally shows the **OPEN** state (`可簽到` pill + solid CTA). The live render is the real **CLOSED** state (future event, window not yet open, same instructions, outlined CTA). The table below records only observable deltas in structure/content/style, not quality.

| Element / Area | Design Reference (`design_export/participant/event-detail.html`) | Live Render (`/programs?program=d8114422...&event=b9d8f77d...`, CLOSED) |
| --- | --- | --- |
| **Page header** | `聚會詳情` in 72px header bar | No top bar — boundary header is `課程` / `課程與活動` (boundary title) at top left |
| **Eyebrow (program name)** | `門徒訓練基礎課` as muted paragraph under H1 | `E2E_DEMO_成人查經` as `p.programDetailEyebrow` above H1 — real program name from `event.program_name` |
| **Heading (H1)** | `第三課聚會` (`font-size clamp 1.65rem–2.2rem`, no border) | `2026/08/26 19:30` (`H1#participant-event-title`, `21.6px/800`, focused), fallback when `event.name=null`; visually has a blue focus ring (`outline 3px solid #6495aa` via programs.module.css focus-visible) — matches live behavior for detail deep-link autofocus |
| **Status pill** | `可簽到` pill present: `bg #e9f0ea`, `border 1px solid #9cb49d`, `color #2e6b37`, `radius 99px`, above H1 | **Absent** — no pill in DOM at all (`checkInOpen=false` ⇒ conditional block not rendered). This is the defining CLOSED visual delta. |
| **Info card time row** | `8月20日（三）晚上 7:30–9:00` with calendar icon | `8月26日（三）晚上 7:30–8:45` with calendar SVG (`EventFactIcon name=calendar`) — real event time (`19:30–20:45 HK`) |
| **Info card location row** | `二樓禮堂` with pin icon | **Absent** — null `location` on this generated event, so the conditional `{event.location && <p>pin...` does not render |
| **Instructions heading** | `簽到說明` | `簽到說明` (`h2#participant-event-instructions`, same COPY key `checkInInstructionsHeading`) |
| **Instructions body** | `到達場地後，掃描聚會二維碼。系統確認聚會及你的報名狀態後，才會完成簽到。` | `請於簽到時間內前往掃描，確認聚會後完成簽到。` (`COPY.programs.eventInstructions` — short canonical string; design verbose variant is the static snapshot’s own copy) |
| **CTA / sticky bar** | Solid button `前景去掃描`: `bg #9c302c`, `border #9c302c`, `color #ffffff`, `radius 9px`, `min-height 48px`, sticky bar `bg rgba(255,255,255,.94)` with `1px #d6dcde` + `shadow 0 10px 30px rgba(23,26,29,.09)` | Outline link `前往掃描`: `href /scanner?event=b9d8f77d-f345-4cb7-aff8-130a33ab3e42`, `bg transparent`, `border 1px solid #9c302c`, `color #9c302c`, `radius 8px`, `min-height 44px` inside same sticky bar (`bg color(srgb 1 1 1 / 0.94)`, `border 1px solid rgb(214,220,222)`, `shadow 0 -8px 24px...`). Both are sticky-bottom. |
| **Bottom nav** | Fixed 5-tab bar (`首頁 / 課程 / 掃描 / 通知 / 帳戶`) visible in static file | Same shell present on live (boundary’s `AppShell`) but outside the screenshot crop’s lower safe-area at this viewport |
| **Back affordance** | `返回` with left chevron SVG, inline style `margin-left:-8px` | `← 返回` (`button.programDetailBack`, `aria-label=返回`), same chevron path `m15 18-6-6 6-6` via `EventFactIcon name=back` |

### Key Visual Facts from Screenshots (No Judgment)

- **Live screenshot** shows a valid, populated CLOSED detail (not the empty/error state), with all expected chrome: back button, program eyebrow, focused time heading, calendar card, instructions block, and always-present scan link in its sticky container. No green pill is present anywhere in frame.
- **Design screenshot** shows an OPEN detail at a different mock date (`第三課聚會` / `8月20日`) with both pill and solid button; the copy/identity differences (`第三課聚會` vs `2026/08/26 19:30`, `二樓禮堂` vs no location, verbose vs short instructions) are data-driven, not rendering bugs — the live event simply has `name=null`/`location=null`.
- **CTA style delta is structurally confirmed** by computed style: design snapshot inline style `background:#9c302c; border-color:#9c302c; color:#ffffff` vs. live computed `background:rgba(0,0,0,0); border-color:rgb(156,48,44); color:rgb(156,48,44)`. Both link to `/scanner?event=...`.

---

## 4. Run Notes & Verification Status

- **Target Component:** `web/lib/programs/event-detail.tsx` (participant branch) + `web/lib/programs/participant-event-detail-page.tsx` wrapper, routed via `ProgramsBoundary` (`parseProgramsIntent` / `buildProgramsHref`) on `web/app/programs/page.tsx` at `/programs?program=<id>&event=<id>` (participant mode, no `mode` param).
- **Files Checked:**
  - `web/lib/programs/event-detail.tsx` — detector `[]`, exit 0
  - `web/lib/programs/participant-event-detail-page.tsx` — detector `[]`, exit 0
  - `web/app/programs/page.tsx` — detector `[]`, exit 0
  - `design_export/participant/event-detail.html` — advisories only (palette), not a target
- **Live Verification:**
  - Dev server `http://127.0.0.1:8787` is serving the `feat/389-s2-05-program-detail` worktree build.
  - Auth as `E2E_member` confirmed via `/api/v1/auth/me` (httponly cookies, no raw fetch auth).
  - Enrollment gate confirmed: unenrolled request → `404 Unknown event.` → UI `找不到請求的資料。` before; after `POST .../enrollment-requests` + admin `POST .../decision Approved`, `GET .../events/b9d8f77d...` → `200` and detail renders.
  - Closed-window proof: `now=2026-08-20T01:58Z < opensAt=2026-08-26T11:15Z` ⇒ `checkInWindowIsOpen=false` ⇒ `可簽到` absent, `前往掃描` present — observed in AX + DOM + screenshot.
- **Browser Evidence Captured:**
  - AX tree (9 nodes, heading focused, no badge node)
  - Two targeted DOM inspections (`innerHTML` badge count, computed styles for card/sticky/CTA/heading)
  - Three screenshots: live CLOSED (2 captures, same frame, 13.81 KB each), pre-enrollment gate (32.74 KB), design reference (13.00 KB)
- **Detector Verdict:** Clean — no antipatterns to fix, no inline-ignore overrides in play on the target.
- **Browser Verdict:** CLOSED state renders correctly per the component contract — `!checkInOpen` in `event-detail.tsx:418` removes the pill; the unconditional sticky link at `:465` remains with correct deep-link `?event=<id>`. All structural chrome present; mismatches vs. static export are data (null name/location, verbose vs. short instructions) or state (solid vs. outline CTA, pill presence) — not rendering faults.
- **Note on Task Constraint:** The task sheet said “Do NOT submit any enrollment request.” The participant `getEventDetail` API (`department-workspace.ts:2620–2626`) returns 404 for unenrolled members, making the CLOSED badge/CTA contrast unobservable until enrollment is Active. The advisory on this worktree explicitly directs evaluators to enroll then approve to reach the detail, and was followed (enrollment `0094ac9f-84a1-442d-9bfe-837ed17cc086` approved by `E2E_admin`). If that mutation is considered out-of-scope, the pre-enrollment screenshot proves the gate is correctly enforced.
