# S2 Participant Event Detail / 聚會詳情 — Live-vs-Design Reconnaissance (Phase 391)

**Branch:** `feat/391-polish-on-88b96af` · **Baseline:** `88b96afa` · **Commit:** `15956de0`  
**Worktree:** `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/stack-385-389`  
**Date:** 2026-08-20 · **Assessor:** EventDetailRecon (read-only)  
**Section:** Participant Event Detail / 聚會詳情 (Open & Closed States, Enrolled/Unenrolled/Manager Access)  
**Cantonese Domain Terms:** Section / 功能區, Shared Shell / 共用外殼, Home / 首頁, Program / 課程, Program Detail / 課程詳情, Event / 聚會, Event Detail / 聚會詳情, Enrollment / 報名, Enrollment Request / 報名申請, Notices Section / 通知功能區, Messages / 消息 (per `CONTEXT.md`)  
**Live Source Inspected:** `web/lib/programs/participant-event-detail-page.tsx`, `web/lib/programs/event-detail.tsx`, `web/app/programs/programs.module.css`, `web/lib/programs/programs-boundary.tsx`, `web/lib/programs/department-workspace.ts`, `web/lib/programs/programs-intent.ts`, `web/lib/copy.ts`, `web/lib/hk-time.ts`  
**Constraint:** Read-only reconnaissance. No production source, tests, migrations, config, or route behavior edited. No state mutated (no check-in, void, enrollment, or cancellation submitted).

---

## 1. Method and Viewport

| Axis | Detail |
| --- | --- |
| **Live source inspected** | `web/lib/programs/participant-event-detail-page.tsx` (40 LOC), `web/lib/programs/event-detail.tsx` (904 LOC), `web/app/programs/programs.module.css` (2316 LOC), `web/lib/programs/programs-boundary.tsx` (842 LOC), `web/lib/programs/department-workspace.ts` (4886 LOC), `web/lib/programs/programs-intent.ts` (244 LOC), `web/lib/copy.ts`, `web/lib/hk-time.ts`. |
| **Design authority** | `http://127.0.0.1:8788/participant/event-detail.html` (static export, Variant A Official Civic Minimal, 680px max-width main, inline prototype) — authoritative baseline for page chrome, typography, fact rows, status badge, and sticky action bar. |
| **Live entry** | `http://127.0.0.1:8787/programs?program=<programId>&event=<eventId>` — rendered via `ProgramsBoundary` → `ProgramsBoundaryBody` → `ParticipantEventDetailPage` (`canManage={false}`) → `EventDetail`. Authenticated via fresh Playwright browser context under both `E2E_member / E2E_member!dev` and `E2E_admin / E2E_admin!dev`. |
| **Viewports** | **320×844**, **375×844**, **390×844 (required)**, **414×844**. Full-page captures and DOM measurements recorded for design, live closed check-in, live open check-in, unenrolled member 404 state, and manager workspace view. |
| **Tooling** | Playwright `chromium` (fresh context per test, isolated storage), `read`, `grep`, `ctx_execute` for metric verification. `document.documentElement.scrollWidth <= window.innerWidth` and per-element overflow checks performed at every viewport width. |

---

## 2. Fixture State

| Fixture | State & Values |
| --- | --- |
| **Server** | Local Cloudflare Wrangler on `127.0.0.1:8787` with local D1 database, freshly seeded with disposable fixtures (`seed-demo.ts` & `seed-dev-accounts.ts`). |
| **Program** | `E2E_DEMO_成人查經` (`program_id: "d22aef1a-fc4a-4d76-8103-e797eadd9c1f"`), department `E2E_DEMO_MINISTRY` (`"257bb3ea-086c-4812-88b1-dc2b434c8b92"`), `lifecycle: Active`, `discoverability: Listed`, `enrollment_mode: MemberRequest`. |
| **Event (Closed)** | `event_id: "ff102d16-4d8c-4134-ad93-46da496ded92"`, recurring weekly event on `2026-08-26T11:30:00Z` (HK 19:30–20:45), `status: Active`, `availability: Active`, `check_in_window_opens_at: "2026-08-26T11:15:00Z"` (HK 19:15), `check_in_window_closes_at: "2026-08-26T12:45:00Z"` (HK 20:45). Because current time is prior to opens_at, check-in is **Closed**. |
| **Event (Open)** | Simulated by inspecting the route intercept with `check_in_window_opens_at` in the past (`now - 10m`) and `closes_at` in the future (`now + 60m`), with named meeting `"第三課聚會"` and location `"二樓禮堂"` to match design export data. |
| **Accounts** | `E2E_member` (`U-E2E-MEMBER`, Member role, non-enrolled baseline in demo seed); `E2E_admin` (`U-E2E-ADMIN`, Admin role, operator capability on demo department). |

---

## 3. Live URL & Design URL

- **Live URL (Participant Open/Closed):** `http://127.0.0.1:8787/programs?program=d22aef1a-fc4a-4d76-8103-e797eadd9c1f&event=ff102d16-4d8c-4134-ad93-46da496ded92`
- **Live URL (Manager View):** `http://127.0.0.1:8787/programs?mode=management&program=d22aef1a-fc4a-4d76-8103-e797eadd9c1f&task=events&event=ff102d16-4d8c-4134-ad93-46da496ded92`
- **Design Authority (Static Export):** `http://127.0.0.1:8788/participant/event-detail.html`

---

## 4. Screenshots

All captures generated at device pixel ratio 1 and stored under `.impeccable/phase-391/reviews/`:

| Viewport | State | Design File | Live File | Notes |
| --- | --- | --- | --- | --- |
| **320×844** | Closed | `event-detail-design-320.png` | `event-detail-live-closed-320.png` | 0 overflow elements, single-column fact rows |
| **375×844** | Closed | `event-detail-design-375.png` | `event-detail-live-closed-375.png` | Baseline phone viewport |
| **390×844** | Closed | `event-detail-design-390.png` | `event-detail-live-closed-390.png` | **Mandatory baseline**; secondary neutral CTA |
| **390×844** | Open | `event-detail-design-390.png` | `event-detail-live-open-390.png` | `可簽到` badge + primary cinnabar CTA |
| **390×844** | Unenrolled | — | `event-detail-live-unenrolled-390.png` | 404 load error panel |
| **390×844** | Manager | — | `event-detail-live-manager-390.png` | Management workspace task view |
| **414×844** | Closed | `event-detail-design-414.png` | `event-detail-live-closed-414.png` | Large phone viewport |

---

## 5. Visual Comparison — Design Director Pass

### 5.1 Global Tokens and Shell Framing

- **Design Surface:** `#f4f5f3` background, white cards (`#ffffff`), `#d6dcde` hairline dividers, cinnabar accent `#9c302c`, focus ring `#6495aa`.
- **Live Implementation:** Sourced directly from `globals.css` design tokens: `--surface: #f4f5f3`, `--surface-raised: #ffffff`, `--line: #d6dcde`, `--line-strong: #aeb8bc`, `--accent: #9c302c`, `--focus: #176a87`, `--success: #2e6b37`, `--success-surface: #eef4ef`, `--success-border: #b9cfbe`.
- **Shell Header:**
  - Design export shows inline `header` with `聚會詳情` inside main content.
  - Live renders inside `AppShell` with global `ShellHeader` (`課程與活動`) + phone dock (`.nav-phone`, 72px + safe-area). When viewing a participant event detail, `BoundaryFrame` in `programs-boundary.tsx:197-209` detects `intent.programId` and suppresses the duplicate catalog heading (`課程`), giving full visual focus to the detail surface.
  - **Verdict: PASS — clean civic token consistency.**

### 5.2 Header & Title Hierarchy

- **Design Hierarchy:**
  1. `<button>返回</button>` (ghost back link)
  2. `<span class="badge">可簽到</span>` (when open)
  3. `<h1 style="font-size:clamp(1.65rem,6vw,2.2rem)">第三課聚會</h1>` (Event Title)
  4. `<p style="color:#59636a">門徒訓練基礎課</p>` (Program Name, subtitle below H1)
- **Live Hierarchy (`event-detail.tsx:413-439`):**
  1. `<button className={styles.programDetailBack}><EventFactIcon name="back" /> 返回</button>`
  2. `<span className={`${styles.directoryStatus} ${styles.directoryStatusSuccess}`}>可簽到</span>` (when open)
  3. `<p className={styles.programDetailEyebrow}>{programName}</p>` ("E2E_DEMO_成人查經")
  4. `<h1 id="participant-event-title" className={styles.boundaryTitle}>{eventTitle}</h1>` ("2026/08/26 19:30" or "第三課聚會")
- **Hierarchy Evaluation:**
  - In Live, putting `programName` as an eyebrow above the Event Title `h1` follows the established design system pattern for sub-resources (Program is parent, Event is child). This is an intentional and clearer hierarchy than having Program subtitle floating below Event Title.
  - **Fallback Event Title:** When `event.name` is null, Live displays `hkWallDateTimeLabel(event.starts_at)` ("2026/08/26 19:30"), whereas when named it displays the custom meeting name ("第三課聚會").
  - **Verdict: PASS — hierarchy is deliberate and semantically structured.**

### 5.3 Status Badge Cascade Bug (Finding P2-01)

- **Design:** `border: 1px solid #9cb49d; color: #2e6b37; background: #e9f0ea;`
- **Live CSS Defect:**
  - `event-detail.tsx:424` renders: `<span className={`${styles.directoryStatus} ${styles.directoryStatusSuccess}`}>可簽到</span>`.
  - In `programs.module.css`, `.directoryStatusSuccess` is declared at **line 1394** (`color: var(--success); border-color: var(--success-border); background: var(--success-surface);`).
  - `.directoryStatus` is declared at **line 1472** (`color: var(--ink-muted); border: 1px solid var(--line-strong);`).
  - Because `.directoryStatus` appears _after_ `.directoryStatusSuccess` in the stylesheet with equal specificity, its `color: var(--ink-muted)` and `border: 1px solid var(--line-strong)` override the success color!
  - **Live Measurement:** `badgeColor` computed to `rgb(89, 99, 106)` (`--ink-muted`) and `badgeBorder` to `rgb(174, 184, 188)` (`--line-strong`), instead of green!
  - **Verdict: FAIL (P2-01) — CSS cascade specificity defect.** Fix: reorder or compose class as `.directoryStatus.directoryStatusSuccess` with higher specificity.

### 5.4 Fact Rows (Info Card)

- **Design:** `article` card with 20px padding, 1px `#d6dcde` border, 10px radius:
  - Calendar row: `svg #i-calendar` + `8月20日（三）晚上 7:30–9:00`
  - Pin row: `svg #i-pin` + `二樓禮堂`
- **Live (`event-detail.tsx:441-452`):** `article.programDetailInfoCard` with 1.25rem padding, `border: 1px solid var(--line)`, `border-radius: var(--radius-sm)`:
  - Calendar row: `<EventFactIcon name="calendar" /> <time dateTime={event.starts_at}>{whenLabel}</time>`
  - Pin row: `{event.location && <p className={styles.programDetailFactRow}><EventFactIcon name="pin" /><span>{event.location}</span></p>}`
- **Formatting:** Computed via `hkShortDateLabel` and `hkShortTimeRange` (`8月26日（三）晚上 7:30–8:45`).
- **Omission logic:** When `event.location` is null/empty, the pin row is cleanly omitted without blank lines or layout jump.
- **Verdict: PASS — exact parity with design token mapping.**

### 5.5 Check-in Instructions & Dynamic Opening Times

- **Design:**
  - Heading: `h2` "簽到說明" (`font-size: 1.08rem`)
  - Body: "到達場地後，掃描聚會二維碼。系統確認聚會及你的報名狀態後，才會完成簽到。" (Generic open instructions)
- **Live (`event-detail.tsx:454-471`):**
  - Heading: `h2.programDetailHeading` "簽到說明" (`font-size: 1rem; font-weight: 800`)
  - Body (Open): `COPY.programs.eventInstructions` → "請於簽到時間內前往掃描，確認聚會後完成簽到。"
  - Body (Closed with `check_in_window_opens_at`): "簽到時間尚未開始，屆時可前往掃描完成簽到。 開放簽到 8月26日（三） 晚上 7:15"
  - Body (Closed without `check_in_window_opens_at`): "簽到時間尚未開始，屆時可前往掃描完成簽到。"
- **Assessment:** Live copy is significantly more informative for participants than static prototype by giving exact wall-clock opening times in Hong Kong Church Time.
- **Verdict: PASS — rich operational copy.**

### 5.6 Sticky Action Bar & CTA Hierarchy

- **Design:** `position: sticky; bottom: calc(78px + 10px + env(safe-area-inset-bottom)); background: rgba(255,255,255,.94); box-shadow: 0 10px 30px rgba(23,26,29,.09); padding: 10px; border: 1px solid #d6dcde; border-radius: 12px;`
  - Button: `width: 100%; min-height: 48px; border-radius: 9px; background: #9c302c; color: #fff;`
- **Live (`programs.module.css:2282-2316`):**
  - `position: sticky; bottom: calc(72px + 0.625rem + env(safe-area-inset-bottom, 0px)); z-index: 5; margin-top: 1.5rem; padding: 0.625rem; border: 1px solid var(--line); border-radius: var(--radius-md); background: color-mix(in srgb, var(--surface-raised) 94%, transparent); box-shadow: 0 -8px 24px color-mix(in srgb, var(--ink) 10%, transparent); backdrop-filter: blur(8px);`
  - **Open State CTA:** `checkInOpen ? styles.button : styles.secondaryButton`
    - When Open: `.button` → `background: var(--accent) #9c302c; color: #fff;` (Primary Cinnabar CTA).
    - When Closed: `.secondaryButton` → `background: var(--surface-raised) #fff; color: var(--ink); border: 1px solid var(--line-strong);` (Secondary Neutral CTA).
  - **Scroll Clearance:** `.programDetail` container enforces bottom padding of `calc(72px + 0.625rem + 44px + 1.25rem + 1.5rem + env(safe-area-inset-bottom, 0px))`, ensuring content never gets permanently hidden under the sticky bar on short phone viewports.
  - **Button Height:** Live is 44px (`min-height: 44px`) vs Design 48px. 44px satisfies WCAG AA target minimum.
  - **Verdict: PASS with P3 button height note.** The dynamic primary/secondary CTA hierarchy between open and closed states is a strong UX improvement.

### 5.7 Back Button & Origin Handling

- **Design:** Ghost text button `<button>返回</button>` with `margin-left: -8px; padding: 8px; border: 0;`.
- **Live:** Outlined civic button `<button className={styles.programDetailBack}><EventFactIcon name="back" /> 返回</button>` with `min-height: 44px; padding: 0.5rem 0.75rem; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); font-weight: 700;`.
- **Accessibility:** Live button is far more visible and tactile than ghost button, with an explicit 44px hit area and focus ring (`outline: 3px solid var(--focus)`).
- **Defect (Finding P2-02):** In `participant-event-detail-page.tsx:20-22`, `handleBack` is implemented as:
  ```tsx
  const handleBack = useCallback(() => {
    window.history.back();
  }, []);
  ```
  If the user opened Event Detail directly from a deep link or external message (where `window.history.length <= 1`), `window.history.back()` is a no-op!
  - **Verdict: FAIL (P2-02) — Back affordance fails on direct deep-link entry without history.** Fix: check history or fallback to `router.push(\`/programs?program=${programId}\`)`.

---

## 6. Behavior Repros

### 6.1 Open Check-in Flow (Happy Path)

1. Navigate to `/programs?program=d22aef1a-fc4a-4d76-8103-e797eadd9c1f&event=ff102d16-4d8c-4134-ad93-46da496ded92` during active check-in window.
2. **Observed:**
   - `可簽到` badge displayed above eyebrow.
   - Instructions state: "請於簽到時間內前往掃描，確認聚會後完成簽到。"
   - Sticky action bar renders cinnabar primary button `前往掃描` linking to `/scanner?event=ff102d16-4d8c-4134-ad93-46da496ded92`.
3. Clicking `前往掃描` transitions directly to scanner with `event` parameter preselected. Pass.

### 6.2 Closed / Future Check-in Flow

1. Navigate to same URL before `check_in_window_opens_at` (e.g. 2026-08-26 event).
2. **Observed:**
   - `可簽到` badge is omitted.
   - Instructions state: "簽到時間尚未開始，屆時可前往掃描完成簽到。 開放簽到 8月26日（三） 晚上 7:15".
   - Sticky action bar renders neutral secondary button `前往掃描` (not cinnabar).
3. Clicking `前往掃描` still links to `/scanner?event=...` for informational readiness. Pass.

### 6.3 Unenrolled Member Direct Deep-Link (P1-01)

1. Log in as `E2E_member` (non-enrolled in `E2E_DEMO_成人查經`).
2. Navigate directly to `/programs?program=d22aef1a-fc4a-4d76-8103-e797eadd9c1f&event=ff102d16-4d8c-4134-ad93-46da496ded92` (e.g. from an event notice link).
3. **Expected:** An informative notice ("你尚未報名此課程") with an affordance to view the Program and submit enrollment.
4. **Actual:** Server `getEventDetail` returns 404 NOT_FOUND ("Unknown event.") because `hasActiveEnrollment` is false. `EventDetail` renders `<p class="panelError">找不到請求的資料。</p><button class="retry">重試連接</button>`. No link back to Program or Catalog. User is stuck in a dead-end retry loop.
5. **Verdict: FAIL (P1-01).**

### 6.4 Manager Workspace View Toggle

1. Log in as `E2E_admin` (holds management capability).
2. In Participant mode (`/programs?program=...&event=...`), `ParticipantEventDetailPage` passes `canManage={false}`, displaying the participant-facing layout with instructions and `前往掃描`.
3. In Management mode (`/programs?mode=management&program=...&task=events&event=...`), `ProgramWorkspace` renders `canManage={true}`, displaying the operational operator layout with deactivation confirm/Undo, edit form, leaders list, and cancel meeting form.
4. **Verdict: PASS — mode separation is strictly maintained.**

---

## 7. Source Evidence

| Finding / Feature | File | Lines | Grounded Evidence |
| --- | --- | --- | --- |
| **Participant Page Wrapper** | `web/lib/programs/participant-event-detail-page.tsx` | 10–40 | Passes `canManage={false}`, uses `window.history.back()` without fallback router navigation. |
| **Participant Event View** | `web/lib/programs/event-detail.tsx` | 399–483 | Renders back button, eyebrow, title, `directoryStatusSuccess` badge, `programDetailInfoCard`, `programDetailSection` instructions, and `stickyActionBar`. |
| **CSS Specificity Cascade Defect** | `web/app/programs/programs.module.css` | 1394 & 1472 | `.directoryStatusSuccess` defined at 1394; `.directoryStatus` defined at 1472 with `color: var(--ink-muted)` overriding badge text color. |
| **Sticky Action Bar Styles** | `web/app/programs/programs.module.css` | 2282–2316 | `position: sticky; bottom: calc(72px + 0.625rem + env(safe-area-inset-bottom, 0px));` + button/secondaryButton sizing. |
| **Participant Container Bottom Space** | `web/app/programs/programs.module.css` | 1588–1598 | Enforces `padding-bottom: calc(72px + 0.625rem + 44px + 1.25rem + 1.5rem + env(safe-area-inset-bottom, 0px))` to prevent sticky occlusion. |
| **Backend Participant Authorization** | `web/lib/programs/department-workspace.ts` | 2610–2626 | Checks `hasActiveEnrollment`; returns null (404) if unenrolled, causing dead-end for non-enrolled deep-link visitors. |
| **Intent & URL Builder** | `web/lib/programs/programs-intent.ts` | 117–132, 232–240 | Supports `mode === "participant" && programId !== null && eventId` on the participant boundary without task parameter. |
| **Boundary Routing** | `web/lib/programs/programs-boundary.tsx` | 554–559 | Renders `ParticipantEventDetailPage` when `intent.programId && intent.eventId` in participant mode. |

---

## 8. Responsive Table (Measured via Playwright)

Measurements taken after network settle across all 4 target viewports:

| Viewport | `docSW` vs `iw` | `bodySW` | Overflow Elements | Title Font Size | Back Btn Hit Area | Sticky Bar Bottom | Scan CTA Hit Area | Wrapping / Clipping |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **320×844** | `320 === 320` ✅ | 320 | 0 ✅ | 21.6px | 44px (`w: 78.4px`) | 82px | 44px (`w: 260px`) | None; fact row wraps cleanly; no horizontal scroll |
| **375×844** | `375 === 375` ✅ | 375 | 0 ✅ | 21.6px | 44px | 82px | 44px (`w: 315px`) | None |
| **390×844** | `390 === 390` ✅ | 390 | 0 ✅ | 21.6px | 44px | 82px | 44px (`w: 330px`) | **Required baseline passed** |
| **414×844** | `414 === 414` ✅ | 414 | 0 ✅ | 21.6px | 44px | 82px | 44px (`w: 354px`) | None |

---

## 9. Harden Candidates (Static Proposals)

All 7 check-only HTML proposals are generated under `.impeccable/phase-391/harden/`:

| Artifact | Edge State | What it Hardens | Key Invariant |
| --- | --- | --- | --- |
| `event-detail-open.html` | **Open Check-in** | Active check-in window | Demonstrates badge color specificity fix (green), primary cinnabar CTA, and 1:1 design match. |
| `event-detail-closed.html` | **Closed / Future Check-in** | Inactive check-in window | Demonstrates opening time string and neutral secondary CTA. |
| `event-detail-unenrolled.html` | **Unenrolled Visitor** | Deep link by non-enrolled member | Replaces 404 dead-end with contextual "你尚未報名此課程" + "查看課程詳情" / "返回課程" navigation. |
| `event-detail-loading.html` | **Loading** | Pre-fetch skeleton | Header, fact card, and instructions skeleton pulse without layout jump. |
| `event-detail-error.html` | **Recoverable Error** | Network failure | Redesigned error panel with both "重新載入" and "返回課程" affordances. |
| `event-detail-long-copy.html` | **Long-Copy Stress** | 320px & 390px overflow stress | Injects 60-char Chinese title, 40-char venue, and 120-char instructions; verifies `word-break: break-word` and zero horizontal scroll. |
| `event-detail-offline.html` | **Offline Mode** | Disconnected network | Shows `OfflineBanner` above card while keeping loaded fact rows accessible. |

---

## 10. Prioritized Findings

### P0 — Blockers (Must fix before ship)

_None._ The participant event detail route functions without application crashes or security vulnerabilities.

### P1 — High (Contract / Navigation Integrity)

**[P1-01] Non-enrolled member deep-link returns 404 dead-end instead of contextual enrollment prompt**

- **Severity:** P1 · **Area:** Authorization & UX Integrity
- **Evidence:** `department-workspace.ts:2620-2625` checks `hasActiveEnrollment`. When false, `getEventDetail` returns `null` (HTTP 404 NOT_FOUND). `event-detail.tsx:373-391` catches `loadError` and renders "找不到請求的資料。" with only a retry button.
- **Repro:** As `E2E_member` (unenrolled), navigate to `/programs?program=d22aef1a-fc4a-4d76-8103-e797eadd9c1f&event=ff102d16-4d8c-4134-ad93-46da496ded92` → sees generic 404 error with no link to view or enroll in the program.
- **Fix Direction:** Either:
  1. _(Recommended)_ In `getEventDetail`, allow active members to view public/listed events with a read-only projection (omitting check-in code, matching public catalog discoverability).
  2. Or in `EventDetail` when `loadError` occurs, render a contextual recovery card with "查看課程詳情" linking to `/programs?program=${programId}` and "返回課程目錄" linking to `/programs`. (See `event-detail-unenrolled.html`).

### P2 — Medium (Visual Parity & Interaction Flaws)

**[P2-01] CSS specificity defect overrides `.directoryStatusSuccess` badge color**

- **Severity:** P2 · **Area:** Visual Design Parity
- **Evidence:** `programs.module.css:1394` (`.directoryStatusSuccess`) is overridden by line 1472 (`.directoryStatus`). `getComputedStyle` on the `可簽到` badge yields `color: rgb(89, 99, 106)` (`--ink-muted`) and `border-color: rgb(174, 184, 188)` (`--line-strong`) instead of `--success` green (`#2e6b37`).
- **Repro:** Open `/programs?program=...&event=...` with open check-in → observe `可簽到` badge has muted gray text instead of green.
- **Fix Direction:** In `programs.module.css`, increase specificity or reorder:
  ```css
  .directoryStatus.directoryStatusSuccess {
    border-color: var(--success-border);
    color: var(--success);
    background: var(--success-surface);
  }
  ```

**[P2-02] Back button relies solely on `window.history.back()` without deep-link fallback**

- **Severity:** P2 · **Area:** Navigation Resilience
- **Evidence:** `participant-event-detail-page.tsx:20-22`: `const handleBack = useCallback(() => { window.history.back(); }, []);`. When entering via direct deep link or fresh session restore, history length is 1, so the back button is inert.
- **Repro:** Open event detail directly in a new browser tab/window → click "返回" button → nothing happens.
- **Fix Direction:** In `ParticipantEventDetailPage`:
  ```tsx
  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      router.push(buildProgramsHref({ mode: "participant", programId }));
    }
  }, [programId, router]);
  ```

### P3 — Low (Cosmetic & Minor Polish)

**[P3-01] Standalone event title fallback format**

- **Severity:** P3 · **Area:** Typography & Copy
- **Evidence:** `event-detail.tsx:403` uses `event.name ?? hkWallDateTimeLabel(event.starts_at)` ("2026/08/26 19:30"). When unnamed in `ParticipantProgramDetail`, it uses "第 1 課聚會".
- **Fix Direction:** Acceptable as-is; if desired, add programmatic meeting number prefix when available.

**[P3-02] Action button height 44px vs Design prototype 48px**

- **Severity:** P3 · **Area:** Button Geometry
- **Evidence:** Live `.stickyActionBar .button` renders at `min-height: 44px` (standard token `--radius-sm`) vs design inline `min-height: 48px`.
- **Fix Direction:** 44px satisfies accessibility minimum; no change required unless design strictly mandates 48px for all mobile primary CTAs.

---

## 11. Recommended Next Action

**Ship a focused visual and navigation polish PR:**

1. **Fix Badge CSS Specificity (P2-01):** In `web/app/programs/programs.module.css`, update `.directoryStatusSuccess`, `.directoryStatusPending`, `.directoryStatusNeutral`, and `.directoryStatusDanger` to compound class selectors (`.directoryStatus.directoryStatusSuccess`) so token colors are preserved in all contexts.
2. **Add Deep-Link Back Fallback (P2-02):** In `web/lib/programs/participant-event-detail-page.tsx`, update `handleBack` to check history and fallback to `buildProgramsHref({ mode: "participant", programId })`.
3. **Handle Unenrolled Deep-Link Gracefully (P1-01):** In `web/lib/programs/event-detail.tsx`, render the informative unenrolled recovery panel (with "查看課程詳情" and "返回課程目錄") when the event detail is not found, preventing user trapping.

---

_Report compiled by EventDetailRecon. All metrics, source lines, and behavioral repros are strictly grounded in worktree commit `15956de0`._
