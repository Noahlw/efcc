# Assessment A — Program Detail, Eligible / 可報名 (unenrolled)

**Target:** `web/lib/programs/participant-program-detail.tsx` + `web/lib/programs/participant-enrollment.tsx` + `web/app/programs/programs.module.css` — live state `GET /programs?program=d8114422-787d-4305-8dd1-220b020730c2` as `E2E_member`  
**Viewport:** 390×844 (mobile), wrangler dev `http://127.0.0.1:8787`  
**Design ground truth:** `.scratch/efcc-redesign-handoff-2026-08-18/source/claude-design/design_export/participant/program-detail.html` (depicts Active/已參加 — compared structurally, not copy)  
**Branch:** `feat/389-s2-05-program-detail` — worktree `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/stack-385-389`  
**Seed:** `pnpm db:seed:local + pnpm db:seed:demo` — `E2E_member` has no enrollments, no pending requests  
**Date:** 2026-08-20 · **Assessor:** T3A_PDEligibleA (Assessment A — isolated, no detector/B output)

---

## Design Specificity Verdict

**Verdict: Weakly specific — civic scaffold is present, product authorship is missing on the eligible conversion path.**

The tokens are correct (Variant A: Official Civic Minimal — `--surface #f4f5f3`, `--ink #171a1d`, `--accent #9c302c`, hairline `#d6dcde`), and the shell copy is church-native (下一次聚會, 聚會時間表, 報名). But the eligible detail does not feel authored for 顯恩堂 as an operational ordinance — it feels engineered.

Three tells:

1. **Composition drift from the export.** The export is a tight hierarchy: back ghost link → pill badge → display title → description → white elevated Next Meeting card (pin + calendar) → white Schedule card → sticky cinnabar action bar (48 px, `rgba(255,255,255,.94)` backdrop + shadow). The live inverts that: bordered back chip, `surface` Next Meeting card that blends into the `surface` page, uncarded flat schedule list, and a ghost outline 報名 button buried below 12 schedule rows with no stickiness. The Cinnabar Accent Rule (DESIGN.md: accent is _solely_ for primary submission) is violated — the primary submission is the one place accent is _absent_ (outline ghost, `color: #9c302c` on transparent), while `surface` is over-used.

2. **Structural sameness.** Swap 聚會/報名 for any booking resource and the layout survives unchanged. The export earns specificity through its church-ops voice and civic calm (mono label `下一次聚會` 0.72 rem / 0.08 em, pin/calendar pairing, sticky ordinance bar). The live dilutes those: same program name repeats in header, Next Meeting title, and all 12 schedule rows; location affordance collapses to nothing when `null`; advisory copy is technically correct but tonally generic.

3. **Missed product character.** The export treats enrollment as a civic commitment — prominent, thumb-reachable, shadowed. The eligible state is the congregation's main conversion surface and it hides the commitment below the fold. A church management system whose "join a course" moment is the least prominent element is narratively incoherent.

Neither the source (well-factored `statusForDetail`, `ParticipantEnrollment` state machine) nor the render earns the "Official Ordinance" north star on this state without re-alloying the primary action.

---

## Heuristic Scores (Nielsen, 0–4)

| # | Heuristic | Score | Key Issue |
| --- | --- | --: | --- |
| 1 | Visibility of System Status | 2 | `可報名` pill is visible but low-signal (pending chip); Next Meeting is visible yet primary action is off-screen — no sticky status, no "applies to this program" anchor while scrolling 12 rows |
| 2 | Match Between System and Real World | 2 | Fixture ID `E2E_DEMO_` prefix leaks into title, Next Meeting heading, and 12× schedule labels; event titles fall back to program name, forcing users to translate system residue |
| 3 | User Control and Freedom | 3 | Back `課程` + bottom nav escape work; panel focus management (`#program-detail-title` on ready) is correct, but no breadcrumb/context for "where am I in the catalog" |
| 4 | Consistency and Standards | 2 | Back style (bordered chip vs export ghost), card elevation (surface-on-surface vs white card), CTA style (outline ghost vs solid cinnabar 48 px sticky) all diverge from the export contract |
| 5 | Error Prevention | 3 | Schedule advisory correctly states "只提供提示，不會因時間重疊自動阻擋"; `navigator.onLine` guard in `runAction` prevents offline submit; no confirmation needed for eligible submit |
| 6 | Recognition Rather Than Recall | 2 | 12 identical schedule rows (`E2E_DEMO_成人查經 · 晚上 7:30–8:45`) must be scanned to locate the `報名` region; heading echo (H2 = Next Meeting = every row) forces recall of which title is actionable |
| 7 | Flexibility and Efficiency of Use | 1 | Primary task requires scrolling ~700 px past the full schedule to reach a 44 px outline `報名` button; no sticky accelerator, no skip-to-action |
| 8 | Aesthetic and Minimalist Design | 2 | `programDetailNextEvent` uses `--surface` on a `--surface` page (no elevation); repeating identical row copy creates a wall of non-information; design's whitespace rhythm is flattened |
| 9 | Help Users Recognize, Diagnose, Recover from Errors | 3 | `panelNotice`/`panelError` live regions, `announce()` calls, and `errorMessage` mapping exist (unexercised in eligible baseline) — structure is sound |
| 10 | Help and Documentation | 2 | Advisory + enrollment notes exist but eligible affordance is undocumented: what does `可報名` lead to (Pending → Staff approval)? Time-to-decision, capacity, or next step is absent |

**Total: 22 / 40 (55%) — Acceptable / borderline Poor.** All 10 heuristics scored (none n/a; this is an Operate surface with error states).

> Bands: ≥36 Excellent · ≥28 Good · ≥20 Acceptable · ≥12 Poor · <12 Critical. 22/40 sits in the lower half of Acceptable — passes civic legibility, fails conversion.

---

## Cognitive Load

**Overall: High — 5 of 8 checklist failures.**

- [x] **Single focus** — ❌ Fail — Schedule's 12 repetitive rows compete with the single primary task (enroll).
- [x] **Progressive disclosure** — ❌ Fail — All 12 future occurrences rendered at once; no collapse, pagination, or "next 3 + expand" pattern. The export shows 2 exemplar rows; the live dumps 12.
- [x] **Working memory (≤4 items)** — ❌ Fail — 12 identical labels + dates + times presented simultaneously exceed Cowan's 4-item limit; no grouping or chunking.
- [x] **Consistent patterns** — ❌ Fail — Export's row pattern is `64px mono date | title + time·location` inside a white card; live uses left-aligned flex + bullet-style list with no location column, breaking the learned pattern for "when/where".
- [x] **Visual hierarchy** — ❌ Fail — H2 title, Next Meeting title, and schedule `<strong>` are all `E2E_DEMO_成人查經`; three levels share the same string at similar weights. Next Meeting card (the decision anchor) is visually recessive.
- [ ] **Context preservation** — Pass — Status pill, next meeting date, and enrollment region are co-located on the same article; no tab jump needed.
- [x] **Jargon barrier** — ❌ Partial fail — `E2E_DEMO_` prefix is domain/test jargon; `MemberRequest · 可報名` internal model leaks into schedule fallback.
- [ ] **Inconsistent interaction cost** — Pass — Thumb-reachable back, 44 px targets, bottom nav remain.

**Notes:**

- The schedule is the extraneous load culprit. Users deciding "can I commit weekly?" need the _pattern_ (day of week, time window) plus the next occurrence — not 12 identical verbatim rows. The live's `toSorted` by `starts_at` is correct computationally but expensive attentionally.
- The next-meeting title equaling the program name removes the export's strongest orienting cue ("第三課聚會" vs "第四課聚會"). When titles don't vary, the card adds no germane load — it's just a duplicate header.
- Germane load opportunity lost: the advisory "申請前請確認時間是否適合" is the only learning scaffold. It could pair with a collapsed schedule summary + explicit "MemberRequest →待審批→ Staff decides" stepper.

---

## What's Working (2–3 strengths)

1. **Token fidelity and a11y plumbing are disciplined.** `aria-labelledby="program-detail-title"`, `article[aria-labelledby="program-detail-next-event"]`, `role="status"` on the pill, `tabIndex=-1` focus on title/state, `aria-busy` on the enrollment panel, and `announce()` on loads are all wired correctly. Focus-visible ring in `globals.css`, 44 px `min-height` on back and primary buttons, and the `rememberDeepLink` + `AUTH_REQUIRED` → `/` redirect preserve the Operate contract. This is not a throwaway screen — its state machine (`statusForDetail` → `success/pending/neutral/danger`) is cleanly factored.

2. **Church-native information architecture.** The decision flow — Status → "Why join" (title + description) → "When is it" (Next Meeting + Schedule) → "How to join" (報名) — mirrors how a congregant actually evaluates a weekly Bible study. Time is rendered in Church Time (`hkShortDateLabel`, `hkShortTimeRange`, `hkMonthDayLabel`) with Hong Kong weekday annotations (`8月26日（三）晚上 7:30–8:45`), matching PRODUCT.md's operating context without forcing users to convert UTC.

3. **Advisory tone is honest and non-blocking.** `enrollmentScheduleAdvisory` ("系統只提供提示，不會因時間重疊自動阻擋") resists the easy anti-pattern of hard-blocking on time conflicts and the export's assumed friction. The conflict note infrastructure (`conflictNote` with `conflict_note` / `has_schedule_conflict` fallbacks, and the muted `programDetailConflict` style) exists and would read correctly when triggered, without overstating authority.

---

## Priority Issues (ordered by impact)

### [P0] Primary action is buried, recessive, and violates the Cinnabar Rule

**What:** In the eligible state the only conversion affordance is a `44 px` outline `報名` button (`background: transparent; color: #9c302c; border: 1px solid #9c302c; border-radius: 8px`) rendered _after_ the entire 12-row schedule, with no `stickyActionBar`. The export specifies a solid cinnabar `48 px` `退出課程`/`報名` bar (`background: #9c302c; color: #fff; border: 1px solid #9c302c; radius: 9px`) in a sticky translucent panel (`bottom: calc(78px + 10px + safe-area)`, `padding: 10px`, `border: 1px solid #d6dcde`, `background: rgba(255,255,255,.94)`, `box-shadow: 0 10px 30px rgba(23,26,29,.09)`).

**Why it hurts:** On first viewport (390×844) the user sees Back + Title + Next Meeting + first schedule row; the `報名` CTA is ~one full scroll below the fold. On a 12-row schedule that is ~700 px of identical content before the ask. Conversion affordance in the thumb zone (bottom half) is zero; the one element that should carry the accent carries its inverse.

**Fix:** Restore the export's sticky pattern for the eligible state: wrap the eligible CTA in `.stickyActionBar` (or a new `.enrollmentBar` with identical sticky geometry), switch `actionButton` ghost → solid cinnabar (`background: var(--accent); color: #fff`) at `48 px` min-height, and ensure the enrollment `<section>` is the last semantic block so the bar sticks above the `bottom dock`. Add `aria-describedby` linking the button to the advisory for screen readers. Verify the bar never underlaps the fixed nav at `env(safe-area-inset-bottom)`.

---

### [P1] Next Meeting card has no elevation and the info card is under-specified

**What:** `.programDetailNextEvent` renders with `background: var(--surface) (#f4f5f3)` on a page whose shell is also `#f4f5f3` — surface-on-surface with only a `1px solid #d6dcde` line to separate it. The inner `.programDetailInfoCard` is white but reduced to a single `08/26` calendar row; the location row (`pin`) is conditionally omitted when `null`, leaving a single-line pill inside a gray card. The export uses `background: #ffffff` for the outer card, `20px` padding, stacked calendar + pin rows with `19px` icons and `9px` gap.

**Why it hurts:** The decision anchor ("when/where is the next gathering") should be the highest contrast block on the page. Instead it whispers, pushing attention down toward the noisy schedule list. When location is `null` the card looks broken rather than intentionally minimal.

**Fix:** Flip the outer card to `background: var(--surface-raised) (#fff)` to earn elevation on the off-white page. When `nextLocation == null`, render a muted fallback row — e.g., `地點：聚會地點容後公布` with the same pin icon at `color: var(--ink-muted)` — so the row's geometry stays stable. Align `programDetailFactRow` gap/icon sizing with the export (`10px` gap, `19px` icons, `2px` top nudge) to stop the cramped `0.625rem` spacing.

---

### [P1] Schedule is a wall of identical rows with no progressive disclosure

**What:** All `Active` + `eventIsUpcoming` events (12 in demo seed) render as `<ul><li><time>8月26日</time><strong>E2E_DEMO_成人查經</strong><span>晚上 7:30–8:45</span></li>×12`. Every `<strong>` is the same fixture-prefixed string; no lesson number, no location, no differentiation. The list is uncarded (no outer `background: #fff` / border / radius) and sits flush against the page, unlike the export's `padding: 20px; background: #fff; border: 1px solid #d6dcde; border-radius: 10px` wrapper with `grid-template-columns: 64px 1fr`.

**Why it hurts:** Nielsen 6/8 and Cowan's 4-item rule — the user must serially scan 12 identical labels to answer "do I have time on Wednesdays?" The redundant title is extraneous load; the missing container reduces grouping and scannability on a surface that should communicate rhythm at a glance.

**Fix:** In the eligible state, collapse to "pattern + window": render 3 upcoming rows by default with a "顯示全部 12 節" disclose button (`secondaryButton`, 44 px) that expands `scheduledEvents`. Suppress the repeated `<strong>` when `eventTitle === program.name` (or render it muted/secondary, not as the primary label) so the date+time is the visual anchor. Re-wrap the list in a white card container (`background: var(--surface-raised)`) matching the export's schedule card and restore the `64px` mono date column (`font-family: ui-monospace`, `0.78rem`, `color: var(--ink-muted)`) for scannability.

---

### [P2] Back and status chrome diverge from the export contract

**What:** Back control live: `display: inline-flex; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: var(--surface-raised); padding: 0.5rem 0.75rem; font-weight: 700` with an inner `programDetailFactIcon` chevron. Export back: `border: 0; background: transparent; margin-left: -8px; padding: 8px; font-weight: 550` — a lightweight ghost that recedes. Status pill live: `directoryStatusPending` chip (likely amber/warn token set) with `min-height: 28px; padding: 0.25rem 0.625rem; font-size: 0.75rem` — the screenshot shows a low-contrast outline that does not match the export's semantic pill (`已參加: #2e6b37 on #e9f0ea, 1px solid #9cb49d`).

**Why it hurts:** A bordered back button competes with the pill and title for ink, flattening the header's information scent. The pending pill's color semantics are ambiguous (is 可報名 a warning? an opportunity?). Members rely on pill color to triage the directory; inconsistent pills erode that learned mapping.

**Fix:** Demote back to the export ghost (`border: 0; background: transparent; margin-left: -4px`) on this detail route (keep the bordered variant for management surfaces where it is the standard). Align `statusPending` with DESIGN.md's "rarity preserves authority" — eligible is an opportunity, not a warning; map it to the neutral/success border treatment consistent with the directory's `directoryStatusPending` token and audit the token so `可報名` and `待審批` are not visually interchangeable.

---

### [P2] Enrollment region labeling is correct but visually orphaned

**What:** Region is labeled `報名` (`h3#program-enrollment-title`), button says `報名`, advisory sits in `programDetailMuted` gray. Three consecutive blocks all say "報名" at similar typographic weight, with the pill `可報名` one screen above. The heading uses `panelHeading` (`.panelHeading { margin-top: .25rem }`) but the region sits directly on the page surface with no card, unlike `programDetailNextEvent` and distinct from the workspace's `settingsGroup` treatment.

**Why it hurts:** The duplication (pill → heading → button all "報名") creates a stutter without adding information. First-timers (Jordan) get no answer to "what happens after I tap 報名?" — the heading does not carry intent.

**Fix:** Collapse the heading + button + advisory into a single intention block: keep the `h3 報名` but demote the button's text to the action verb users expect in Cantonesesys — e.g., keep `報名` on the sticky solid CTA, but add a one-line `programDetailMuted` subhead "提交後由同工審批，结果會顯示於通知" adjacent to the pill, not below the CTA. Alternatively, eliminate the region `h3` when the sticky bar carries the label and use `aria-label` on the bar.

---

## Persona Red Flags

### Jordan — Confused First-Timer (never used a church course system)

**Walk:** Jordan lands on 可報名 detail to decide "can I join this 12-week Wednesday study?"

- **No eligibility mental model.** `可報名` pill says "you can enroll" but nothing explains the `MemberRequest → 待審批 → Staff/DeptMgr decision` pipeline. No stepper, no timeline ("通常 1–2 日內回覆"), no link to `通知`. Jordan taps `報名` with no expectation of what "submitted" means — will she get an email? A push notice? This is the exact gap PRODUCT.md warns about (staged approvals, Apps Script backend) that the UI must narrate.
- **Repeated identical labels punish careful reading.** Jordan reads each schedule row expecting variation (lesson topics, venues). Every row is `E2E_DEMO_成人查經`, so she re-reads wondering what she missed. A first-timer who reads _carefully_ is punished most — classic extraneous load.
- **Hidden primary action.** Jordan's first viewport has no CTA; her attention is spent on the schedule before she discovers enrollment requires scrolling past it. First action is not obviously clear within 5 seconds — the heuristic threshold this persona tests.

### Casey — Distracted Mobile User (one-handed, thumb-only, frequently interrupted)

**Walk:** Casey opens the detail on the MTR to quickly join before the next Wednesday.

- **CTA outside the thumb zone.** In the live screenshots the `報名` ghost button is below the fold; the reachable thumb zone (bottom half of 844 px viewport) contains only the schedule's middle rows. Casey must shift grip to scroll + locate the CTA — a forced two-hand operation for a single-tap intent.
- **No sticky persistence across interruption.** Casey scrolls, is interrupted, returns mid-schedule — there is zero persistent enrollment affordance to re-enter. The export's sticky translucent bar exists precisely for this re-entry; the live removed it for the one state that needs it most.
- **Dense date wall on a narrow viewport.** 12 rows × 2 lines × identical title is a long scroll body on 390 px; an interrupted return requires re-scanning from the top. A collapsed 3-row preview with "展開全部" would keep the scroll thumb work inside one swipe.

### Sam — Accessibility-Dependent User (VoiceOver/NVDA, keyboard-only, possible low vision)

**Walk:** Sam navigates the article via headings + landmarks.

- **Heading string echo impairs rotor navigation.** Rotor shows `E2E_DEMO_成人查經` three times (H2, H3 Next Meeting, plus implicit schedule strongs). Sam cannot distinguish "detail title" from "next meeting title" from "row title" — all are the same fixture string, collapsing the heading outline's utility. The export's distinct event title ("第三課聚會") would give Sam a unique anchor.
- **Outline CTA contrast risk.** The ghost `actionButton` (`color: #9c302c` on `transparent` over `#f4f5f3`, `1px solid #9c302c`, `radius: 8px`) is border-dependent on a low-contrast page. Against the export's solid cinnabar (`#fff on #9c302c`) the live variant has meaningfully lower effective contrast for low-vision users, and border-only buttons fail at high zoom.
- **Location omission without fallback.** When `eventLocation` returns `null`, the `programDetailInfoCard` renders a single calendar row. A screen reader hears only one fact row; there is no "地點未定" announcement to confirm the absence is intentional vs a data bug. The conditional `{nextLocation ? <p>…pin…</p> : null}` should render a muted confirmed absence.

> Not evaluated as primary personas here but worth a guard: **Alex (Power User)** would want a keyboard skip past the 12-row schedule (`#program-enrollment-title` anchor or skip link); current tab order walks through all 12 rows to reach the CTA. **Riley (Stress Tester)** would probe 0 upcoming events (empty list → `detailEventsNone: "目前沒有即將進行的活動。"` correctly, but Next Meeting card layout with zero rows is visually under-tested).

---

## Minor Observations

- **Datetime precision:** `<time datetime="2026-08-26T11:30:00.000Z">8月26日</time>` emits UTC ISO while display is Hong Kong evening (UTC+8). Rendering is correct via `hkShortTimeRange`, but the machine-readable `datetime` is midnight HK mapped to `11:30Z` previous day — not a user bug but worth aligning to `+08:00` offset for correctness and testing.
- **Iconography:** Live `programDetailFactIcon` paths match the export's `i-calendar`/`i-pin` symbols; the pin uses the same `1.8` stroke width. Good fidelity — just restore the `2px` top offset the export uses (`margin-top: 2px`) to optically center against the first text line.
- **Typography queuing:** `programDetailHeader { gap: 0.375rem; padding-bottom: 1rem; border-bottom: 1px solid var(--line) }` tracks the export's header cadence; title `boundaryTitle` at `tabIndex=-1` correctly steers focus on load via the `state.kind === "ready"` effect.
- **Description emptiness:** `programDescriptionEmpty: "未填寫課程簡介。"` guard in the detail header is prudent; the demo seed's "每週聚會的本機示範課程。" is intentionally sparse — live clamps gracefully without leaving a blank paragraph.
- **Card radii:** Live uses `var(--radius-md)` (12px) for Next Meeting and `var(--radius-sm)` (8px) for the inner info card vs export's `10px` / `9px`. Harmonize to the token set (sm/md) but keep the outer→inner contrast; the current mix is token-adjacent but slightly tighter than the export.

---

## Questions to Consider

1. **What if the sticky bar were the eligible detail's "official ordinance"?** The export's translucent sticky panel with shadow _is_ the civic signature — what does the page feel like if `報名` is always that solid 48 px cinnabar bar (even on eligible), the outline ghost is never used for primary enrollment, and the bar's presence alone signals "this is actionable" without requiring a scan to the page end?

2. **What if schedule communicated _rhythm_ instead of listing _instances_?** Rather than 12 rows of `Program · Evening 7:30–8:45`, show "逢星期三 晚上 7:30–8:45 · 8月26日至11月11日 · 共12節" as the primary pattern, keep 3 upcoming occurrences as exemplars, and disclose the rest. Would that lower extraneous load enough to let the Next Meeting card carry the decision weight?

3. **What if the eligible badge earned its semantics?** Currently `可報名` (pending chip) and `待審批` (pending state) share a family, blurring opportunity vs in-flight. If eligible used a neutral or success-tinted pill with its own iconography (e.g., open dot vs hourglass), would members triaging the directory learn the system faster — and would the detail header then need the redundant `報名` region heading at all?

---

## Source Evidence

- Live captures: `T3A-eligible` tab at `http://127.0.0.1:8787/programs?program=d8114422-787d-4305-8dd1-220b020730c2` — ARIA snapshot shows `article.aprogramDetail[aria-labelledby=program-detail-title]`, `status 可報名`, `article.programDetailNextEvent` with single `FactRow`, `section.programDetailSection[aria-labelledby=program-detail-schedule]` with `ul.programDetailList` 12× `li.programDetailEvent`, `section.eventsPanel[aria-labelledby=program-enrollment-title]` with `button.actionButton.報名` (computed `rgba(0,0,0,0) / rgb(156,48,44) / 44px / 8px`). Screenshots at 390×844 (v0 + scrolled) attached.
- Design export: `design_export/participant/program-detail.html` — `header 72px`, back `margin-left -8px / border 0`, badge `1px solid #9cb49d / #2e6b37 on #e9f0ea / 28px pill`, Next Meeting `20px / #fff / 1px #d6dcde / 10px` with `calendar+pin` rows, Schedule `64px mono date col`, sticky action `78px+10px bottom / rgba(255,255,255,.94) / shadow / 48px cinnabar`.
- Source slices: `participant-program-detail.tsx:68–106` (`statusForDetail` → pending for eligible), `:349–426` (Next Meeting + Schedule), `:510–517` (`<ParticipantEnrollment>` pass-through); `participant-enrollment.tsx:120–272` (`EnrollmentAction` eligible default → plain `button.actionButton` without `stickyActionBar`; `260–271`), `:398–400` (`showScheduleAdvisory`); `programs.module.css:1581–2259` (Next Meeting `surface` vs export `white`, `programDetailFactRow`, `participantConfirm`, `stickyActionBar`).

---

_Assessment A closed — no detector/overlay output consulted per assignment isolation. This wave is the unenrolled baseline; no enrollment submit or seed mutation was performed._
