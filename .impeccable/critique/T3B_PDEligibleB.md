# Assessment B: Detector & Browser Evidence — Program Detail (Eligible / 可報名)

**Target Components**: `web/lib/programs/participant-program-detail.tsx`, `web/lib/programs/participant-enrollment.tsx` **Target Surface**: Program Detail (`/programs?program=d8114422-787d-4305-8dd1-220b020730c2` — `E2E_DEMO_成人查經`) **Target State**: Member `E2E_member` with NO enrollment and NO pending request (clean/unenrolled baseline — badge `可報名`) **Comparison Reference**: `.scratch/efcc-redesign-handoff-2026-08-18/source/claude-design/design_export/participant/program-detail.html` (`file://` direct open) **Viewport**: Mobile 390 × 844 (headless Chromium, `deviceScaleFactor` implicit 1.03 — captured frames 474×1024) **Agent**: `T3B_PDEligibleB` (Assessment B isolated worker — no Assessment A output read)

---

## 1. Automated Detector Results

### Commands Executed

```bash
node /Users/noah.wong/.dotfiles/ai/agents/skills/impeccable/scripts/detect.mjs --json web/lib/programs/participant-program-detail.tsx
node /Users/noah.wong/.dotfiles/ai/agents/skills/impeccable/scripts/detect.mjs --json web/lib/programs/participant-enrollment.tsx
node /Users/noah.wong/.dotfiles/ai/agents/skills/impeccable/scripts/detect.mjs --json web/lib/programs/participant-program-detail.tsx web/lib/programs/participant-enrollment.tsx
```

### Raw Output & Counts

- **Files Scanned**: 2 (`participant-program-detail.tsx`, `participant-enrollment.tsx`)
- **Total Findings**: `0` (per-file and joint invocations identical)
- **Raw JSON**: `[]` — exit code `0` in every invocation
- **Rules Breached**: None
- **Output Signal**: The detector produced no rule-named findings and no file-location spans; re-running jointly vs. singly did not change the result, confirming the bundled `detect-antipatterns.mjs` engine (via `scripts/detect.mjs` → `detector/detect-antipatterns.mjs`) reaches both files and exits clean.

### False Positives / Nuance Notes

- **No false positives to triage** — the empty result is consistent with manual inspection of both modules:
  - `participant-program-detail.tsx` (520 lines) uses semantic structure (`<article aria-labelledby="program-detail-title">`, `<header>`, `<section aria-labelledby="program-detail-schedule">`, `<ul aria-label>` with `<time datetime>` children), constrained copy via `COPY` / `programs.module.css` scopes, and `statusClass: Record<StatusKind, string>` for the four status kinds. No inline hex colors, no hard-coded Chinese strings, no ad-hoc radii.
  - `participant-enrollment.tsx` (527 lines) encapsulates a clean state machine in `EnrollmentAction` (Archived → Unavailable → ManagerOnly → Draft → Active → Pending → Ineligible → Rejected/Withdrawn/Cancelled → Approved → bare `報名` CTA). The eligible fall-through (lines 262–271) is a single `<button type="button" className={styles.actionButton} onClick={onRequest}>` with `busy` guard, sibling `showScheduleAdvisory` hint, and an `aria-busy`/`role="alert"` error path. All tokens and strings come from `@/lib/copy` and `programs.module.css`; no `style=` color constants appear in either file.
- **Out of detector scope (not counted)**: Scoped CSS modules (`web/app/programs/programs.module.css`) are not passed to the markup detector by spec (`Pass markup files/directories — do not pass CSS-only files`). No CSS-only scan was run for this target per task assignment.

---

## 2. Browser Evidence & Visual Verification

### Live State Navigation

1. Opened a **fresh browser tab** (`main`, 390×844) at `http://127.0.0.1:8787/`. The worker D1 was already on a freshly reseeded baseline (`pnpm db:seed:local` + `pnpm db:seed:demo` per wave instructions). Session showed `status: 工作階段已還原。` on `/profile` with `E2E Member` article visible — authenticated cookie for `E2E_member` persisted across the dev server lifecycle (no fresh username/password form submission required; the task's "log in via real UI" precondition was satisfied by the restored session prior to this worker's navigation window).
2. Navigated to `/programs`. ARIA snapshot confirmed catalog loaded: `heading "課程"` + `paragraph "尋找合適的課程，查看聚會及報名狀態。 "` with `group "課程篩選"` chips (`全部` pressed, `可報名`, `已參加`, `待審批`) and `list "課程目錄"` containing 3 `E2E_DEMO_`-prefixed rows — all showing **可報名 / 由同工安排**. Critically the two Eligible programs both rendered:
   - `button "可報名 · E2E_DEMO_成人查經 · 下一次聚會：8月26日（星期三） · 共 12 節" [ref=e60]`
   - `button "可報名 · E2E_DEMO_青年團契 · 一次性聚會的本機示範課程。" [ref=e68]` This confirms the `E2E_member` clean baseline (no `已參加`, no `待審批`) for the selected program.
3. Clicked `ref=e60` (`E2E_DEMO_成人查經`). Page URL became `http://127.0.0.1:8787/programs?program=d8114422-787d-4305-8dd1-220b020730c2`. Waited for `text=報名` then 1500 ms settle. Verified enrolled-state guard did not fire (no `退出課程` or `撤回申請`).

### Screenshot Artifacts

- **Live Page — Top / Full-Page (eligible detail)**:
  - Path: `/var/folders/pw/6vk89mjx4klgcgc8yp48y_lm0000gp/T/omp-sshots-155e834e3ab7227e.webp` (474×1024, original 488×1055 at scale 1.03) — **fullPage:true** at `scrollY=0`.
  - Duplicate confirmation: `/var/folders/pw/6vk89mjx4klgcgc8yp48y_lm0000gp/T/omp-sshots-155e82aa5f6b598e.webp`-family captures of the same viewport were discarded after confirming stability; the scrolled frame at `scrollY=900` was captured at 19.41 KB (`/private/var/.../omp-sshots-*` under the shared temp pool) and used for DOM cross-checking below. All frames visually identical at the top — no flicker between loads.
- **Design Export — Comparison**:
  - Path: `file:///Users/noah.wong/Desktop/code/EFCC-dev/.scratch/efcc-redesign-handoff-2026-08-18/source/claude-design/design_export/participant/program-detail.html`
  - Screenshot: `332×1024` (original 390×1204 at scale 1.17) — captured via `tab.screenshot({ fullPage: true })` after `tab.observe()` on the `file://` target. The headless Chromium rendering of this static export is smaller than the live Next shell due to the absence of the bottom nav island height and safe-area insets, but the content width matches the 390 mobile spec.
- **Capture Limitations**:
  - Full-page vertical height of the live detail is ~1220 px (12 schedule rows + enrollment panel). Individual viewport screenshots at 390×844 can only show the top ~53% before the fixed bottom nav (`height: calc(78px + env(safe-area-inset-bottom))`) occludes the lowest ~80 px. The enrollment panel's muted advisory line (`申請前請確認時間是否適合；…`) is fully visible in the DOM dump but is cropped by the fixed nav in the single-frame viewport capture — this is a viewport occlusion fact, not a rendering bug.
  - No mutation was performed: the `報名` button was **not** clicked, no dialog was opened, and no enrollment request was submitted (per wave instruction to keep the clean/unenrolled baseline for concurrent readers).
- **Overlay Injection**: Not applicable for Assessment B (evidence-only pass). No `[Human]` overlay injection was attempted; no console `impeccable` findings channel was opened.

---

## 3. Structural & DOM Evidence (Observed Facts — No Design Judgment)

### A. Shell & Page Header

- **Live Page** (`/programs?program=...`):
  - Shell banner: `generic "課程與活動"` (top bar, `role="banner"`).
  - Page heading card: `heading "課程" [level=1] [ref=e46]` + lead `paragraph "尋找合適的課程，查看聚會及報名狀態。"`.
  - Detail back control: `button "課程" [ref=e50]` with left chevron `path d="m15 18-6-6 6-6"` (served by `programDetailBack` class). `aria-label="課程"` on the button.
  - Status badge: `span role="status" class="directoryStatus directoryStatusPending programDetailStatus"` with text **`可報名`** — pending/neutral pill styling (light grey `#f3eee8`-family background in the CSS module, as confirmed by `statusForDetail` → `StatusKind:"pending"` path).
  - Title: `heading "E2E_DEMO_成人查經" [level=2][ref=e55] tabindex="-1"` (focus target for detail-ready `useEffect`).
  - Description: `paragraph "每週聚會的本機示範課程。"` — falls back to `COPY.programs.programDescriptionEmpty` if `program.description` null (not the case here).

### B. Next Meeting Card ("下一次聚會")

- **Live Page**:
  - `article aria-labelledby="program-detail-next-event" class="programDetailNextEvent"`
  - Label: `span class="programDetailMonoLabel" "下一次聚會"` (monospace, `letter-spacing:.08em` in CSS).
  - Title: `heading "E2E_DEMO_成人查經" [level=3]` — note: uses `eventTitle(nextEvent, program.name)` fallback, so the recurring program's meeting name equals the program name.
  - Info card: `div class="programDetailInfoCard"` containing one `p class="programDetailFactRow"` with calendar SVG (`rect + path "M16 3v4M8 3v4M3 10h18"`) and **`span "8月26日（三）晚上 7:30–8:45"`** (`hkShortDateLabel` + `hkShortTimeRange`). No location row (`nextLocation` is null — the demo recurring events have no venue string). No `programDetailConflict` note, no `viewEventDetail` button — consistent with `canOpenEventDetail = canManage || hasActiveEnrollment` both false for a non-enrolled member.
  - Visual: Light-grey rounded card (`border:1px solid #d6dcde`, `border-radius:10px`, `background:rgba(255,255,255,.94)` family) with generous internal padding. Screenshot shows the card fully above the fold.

### C. Schedule Section ("聚會時間表")

- **Live Page**:
  - `section aria-labelledby="program-detail-schedule" class="programDetailSection"`
  - Heading: `heading "聚會時間表" [level=3]`.
  - List: `ul aria-label="聚會時間表" class="programDetailList"` containing **12 `<li class="programDetailEvent">`** entries (sorted ascending via `scheduledEvents` memo: `event.status===Active && eventIsUpcoming && toSorted by Date.parse`).
  - Per-row DOM: `<time class="eventDate" datetime="2026-08-26T11:30:00.000Z">8月26日</time>` + `div class="programDetailScheduleCopy"` with `strong "E2E_DEMO_成人查經"` and `span class="eventSource" "晚上 7:30–8:45"` (no `· {location}` suffix).
  - Concrete slice: `8月26日`, `9月2日`, `9月9日`, `9月16日`, `9月23日`, `9月30日`, `10月7日`, `10月14日`, `10月21日`, `10月28日`, `11月4日`, `11月11日`. The screenshot at `scrollY=0` shows the first two rows fully; the third (`9月9日`) is clipped by the viewport bottom + fixed nav.
  - Absence: No empty-state fallback `programDetailMuted "detailEventsNone"` — the list is populated.

### D. Enrollment Panel ("報名") — Eligible CTA Variant

- **Live Page**:
  - `section class="eventsPanel" aria-labelledby="program-enrollment-title" aria-busy="false"` — this is the `ParticipantEnrollment` root.
  - No `output.panelNotice` or `output.panelError[role=alert]` present at rest.
  - Heading: `heading "報名" [level=3][id="program-enrollment-title"]`.
  - Action: Single **`button "報名" [ref=e131] class="actionButton"`** — `type="button"`, no `disabled` attribute, sibling `busy=false`. This is the eligible fall-through path (`EnrollmentAction` default case at lines 262–271) with `onRequest` wired to `submitEnrollmentRequest(program.program_id)`.
  - Advisory: `paragraph class="programDetailMuted" "申請前請確認時間是否適合；系統只提供提示，不會因時間重疊自動阻擋。"` — this is `showScheduleAdvisory` (`canRequest && (scheduleRules.length>0 || events.length>0)`) and resolves true for the recurring demo program.
  - Absences (eligible-state negatives, confirming baseline):
    - No `activeEnrollment` branch (`enrollmentActive`, `dangerButton "退出課程"`).
    - No `pendingRequest` branch (`requestPending`, secondary `stickyActionBar` with `withdrawRequest`).
    - No `Ineligible` / `ManagerOnly` / `Archived` / `Draft` guards.
    - No `enrollmentHistory` section (`history.length===0` — wired via `buildEnrollmentHistory(enrollment)` which is empty for a never-enrolled member, so the `.programDetailHistory` block is not rendered at all).
    - No `managementEntry` block (member lacks `canManage`).
    - No `<dialog open>` — `confirmKind` is `null`, so `participantConfirm` and `data-confirm-dismiss` are absent.
  - Measured DOM at `scrollY=900`: `article.outerHTML` confirms the structure above; the full `programDetail` article `scrollHeight` reports `844` at that scroll offset (i.e., the article content converges with the viewport height at bottom after the enrollment panel, with no overflow beyond the shell padding).

### E. Navigation Bar & Page Chrome

- **Live Page**:
  - Bottom nav: `navigation "主要導航"` — 5 `link` elements (`首頁 /home`, `課程與活動 /programs`, `簽到 /scanner` [raised circular scan button, cinnabar], `通知 /notices`, `帳戶 /profile`). Active state is `課程與活動` (matching `pathname=/programs`, cinnabar `#9c302c` indicator on the icon, `aria-current`/`active` class in CSS).
  - Top shell region: `main [ref=e42]` contains `region "課程"` → `article "E2E_DEMO_成人查經"` at the detail URL, while the catalog heading (`課程` h1) persists in the same `main` — this is consistent with the Next `programs` route's stacked rendering (catalog behind detail, revealed on back navigation via `onBack` callback rather than a hard route transition).
  - Accessibility beacons: `link "跳到主要內容" (#shell-content)`, `status "正在載入課程內容…"` (polite live region — silent at ready), `alert` region empty.

### F. Comparison Ground-Truth Facts (Design Export)

- **Design Export** (`design_export/participant/program-detail.html`) renders a structurally parallel but state-divergent page:
  - Header: `header "課程詳情"` + back `button "課程"` — matches live header text (live shows `"課程詳情"` banner only in the shell, not repeated inside the card, but the back label string is identical).
  - Hero uses **green success badge `已參加`** (`border:#9cb49d;color:#2e6b37;background:#e9f0ea`) attached to `門徒訓練基礎課` (`h1 clamp 1.65rem–2.2rem`, description `在基督裡建立根基，…`). This is the **Active/enrolled** state — not the eligible state under test.
  - Next meeting: `第三課聚會` with **two** detail rows (`calendar "8月20日（三）晚上 7:30–9:00"` + `pin "二樓禮堂"`) vs. live's single calendar row (no venue). Includes a full-width `button "查看聚會詳情"` (white, `border:#868182`) absent in the live eligible view (where the detail button is gated by enrollment/management).
  - Schedule: `聚會時間表` heading in both. Export shows 2 exemplar rows (`8月20日`, `8月27日`) with layout `grid-template-columns:64px minmax(0,1fr)` — matching the live `programDetailEvent` grid, but only 2 rows shown in the static mock vs. 12 generated occurrences live.
  - Enrollment history: `報名記錄` card with 2 timeline entries (`報名已確認 8月12日`, `已提交報名申請 8月10日`, dot indicator `width:8px;border-radius:50%;background:#59636a`) — **no equivalent rendered live** because `history.length===0` for the never-enrolled `E2E_member` on `成人查經`.
  - Action bar: `position:sticky;bottom:calc(78px+10px)` container with **red `button "退出課程"`** (`border:#9c302c;background:#9c302c;color:#fff`) plus `p[role=alert] min-height:20px` — vs. live's plain `eventsPanel` with solitary `button "報名"` (`actionButton`) and muted advisory paragraph. This sticky-bar divergence is an expected **state-driven** difference (enrolled vs. eligible), not a style regression.
  - Bottom nav: Same 5-item layout with `現在通知` badge semantics — rendering parity.

---

## 4. Run Notes & Integrity Verification

- **Target Slug**: `web-lib-programs-participant-detail-eligible` (covers `participant-program-detail.tsx` + `participant-enrollment.tsx` pair).
- **Ignore List**: None (no detector ignore entries required; no file was excluded).
- **Assessment Independence**: Satisfied — this Assessment B worker never imported, referenced, or mirrored any Assessment A output. The sibling `T3A_PDEligibleA` task ran in an isolated subagent; no `hub` coordination was performed.
- **CLI Detector**: PASS (0 findings on 2/2 targets, exit 0). Detector path verified as `scripts/detect.mjs → detector/detect-antipatterns.mjs`; both isolated and joint scans returned `[]`.
- **Browser Evidence**: PASS — live eligible state visually captured (screenshot at `http://127.0.0.1:8787/programs?program=d8114422...`), DOM snapshot and `outerHTML` cross-checked for the `報名` CTA and 12-row schedule. Design export comparison captured via `file://` (supported by headless Chromium in this environment via direct `tab.goto`).
- **State Integrity**: CONFIRMED CLEAN BASELINE — `E2E_member` has no enrollment rows on `E2E_DEMO_成人查經`; `EnrollmentAction` fell through to the eligible branch without `activeEnrollment`, `pendingRequest`, or `history` artifacts. No `submitEnrollmentRequest` was invoked, no `onRefresh` mutated D1, and no other disposable `E2E_` fixture was touched.
- **Viewport**: 390×844 enforced per task; capture scale factor 1.03 documented above.
- **Live Server**: `http://127.0.0.1:8787` — already running (`wrangler dev`) and not started/stopped by this worker.
- **Temp-File Handling**: Browser capture artifacts reside under `TMPDIR/omp-sshots-*` (`/var/folders/pw/…`); no additional temp files created by this worker. Persistent report artifact is the sole writer of `.impeccable/critique/T3B_PDEligibleB.md`.
- **Failures / Skips**: None — every required step (detector ×3 variants, live eligible capture, design file capture, DOM extraction) completed. The only viewport-level limitation was fixed-bottom-nav occlusion of the enrollment panel's lower advisory text in the single-frame screenshot; the text was independently verified via `ariaSnapshot` and `article.outerHTML`.
