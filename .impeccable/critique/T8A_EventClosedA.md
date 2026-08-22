# Assessment A — Event Detail · Check-in Window CLOSED (T8A_EventClosedA)

**Target:** `web/lib/programs/event-detail.tsx` (`EventDetail` `!canManage` branch, `checkInWindowIsOpen() === false`) + `web/lib/programs/participant-event-detail-page.tsx` · Route `/programs?program=<demoId>&event=<id>`  
**State:** Participant (E2E_member, no enrollment, no `PROGRAM_MANAGE`), seeded weekly events for `E2E_DEMO_成人查經` start 2026-08-26 or later — check-in window not yet open → `可簽到` pill hidden, CTA state is the artifact under review  
**Design ground truth:** `.scratch/efcc-redesign-handoff-2026-08-18/source/claude-design/design_export/participant/event-detail.html` (`file://`)  
**Live ground truth:** source read + token/CSS trace (`web/app/programs/programs.module.css`, `web/lib/copy.ts`, `DESIGN.md`, `PRODUCT.md`). No `wrangler dev` mutation performed — read-only critique per Wave 2 invariant; browser tab left fresh per harness rule (static design file opened, live route gated — see Run Notes)  
**Date:** 2026-08-20 · Worktree `stack-385-389` · Branch `feat/389-s2-05-program-detail`

---

## Design-Specificity Verdict

**Verdict: Category-interchangeable with a church skin.**

The composition is competent Official Civic Minimal — off-white `#f4f5f3` field, white hairline cards (`1px #d6dcde`, `10–12px` radius), ink `#171a1d` / muted `#59636a`, strict 44px targets, cinnabar `#9c302c` CTA — but the _closed-state_ composition is not authored for EFCC's attendance ritual. The same skeleton (back link → title → two fact rows → "簽到說明" paragraph → sticky cinnabar CTA) could ship for any RSVP SaaS by swapping the copy string. Missed opportunities to be church-specific:

- No liturgical/operational specificity when time-bound: the one thing a church gatherer needs before the doors open — _when does scanning open, when does it close, am I eligible to scan_ — is absent in both the design export and the live build. The "Official Ordinance" should be at its most ordinance-like when it says "not yet."
- No HK Church Time cue in the closed state (spec mandates `Asia/Hong_Kong` 24h wall time). The fact row shows `8月20日（三）晚上 7:30–9:00` in design and `hkShortDateLabel + hkShortTimeRange` live — correct for the _event_ window, but the _check-in_ window (`check_in_window_opens_at / closes_at`, the actual gate) is never surfaced.
- The cinnabar accent's rarity rule (DESIGN.md: "solely for primary submission / active state") is violated by keeping a primary cinnabar CTA hot when submission is impossible — it turns the most authoritative color in the system into a false promise.

The shell feels EFCC. This state does not.

---

## Heuristic Scores (Nielsen, 0–4)

| # | Heuristic | Score | Key Issue |
| --- | --- | --- | --- |
| 1 | Visibility of System Status | **1** | Closed window looks identical to open except a missing pill; no "尚未開放" state, no window timing |
| 2 | Match Between System and Real World | **2** | Cantonese correct, but imperative "前往掃描" while scanning will be rejected mismatches the real gathering ritual |
| 3 | User Control and Freedom | **3** | ← 返回 works and is focus-managed; no recovery affordance before a guaranteed-fail scan |
| 4 | Consistency and Standards | **3** | Civic tokens, hairline cards, 44px targets consistent; conditional pill without replacement breaks own pattern |
| 5 | Error Prevention | **1** | CTA always enabled (`<Link href="/scanner?event=…">`) regardless of `checkInWindowIsOpen`, enrollment, `status`/`availability` — invites a preventable server error |
| 6 | Recognition Rather Than Recall | **2** | User must recall window timing and enrollment state from another screen; nothing on this screen answers it |
| 7 | Flexibility and Efficiency of Use | **2** | No accelerator or deep-link nuance; acceptable for a single-purpose screen, but no "copy event link" or stale-window refresh hint |
| 8 | Aesthetic and Minimalist Design | **3** | Minimal, flat civic surfaces well-executed; minimalism becomes omission when status needs extra signal |
| 9 | Help Users Recognize, Diagnose, Recover | **2** | Post-scan errors are mapped in `copy.ts` (`CHECK_IN_CLOSED`, `ENROLLMENT_REQUIRED`, etc.), but pre-scan diagnosis is missing |
| 10 | Help and Documentation | **2** | No inline help for "when can I check in / what if I'm not enrolled" in the closed state |

**Total: 21 / 40 — Poor** (50%+ threshold for Acceptable is 20; this sits just above it, dragged down by H1/H5/H6). Score is honest: the shell is good, the state is not.

---

## Cognitive Load

**Checklist (8 items):** 3 failures → **Moderate load — address soon** (0–1 low, 2–3 moderate, 4+ high)

- [x] Single focus — one primary CTA, no competing CTAs
- [ ] Progressive disclosure — same CTA and same paragraph for open _and_ closed; closed state needs graduated disclosure (window timing → eligibility → action)
- [x] Familiar patterns — sticky bottom CTA above 78px nav, fact rows with calendar/pin icons are familiar mobile patterns
- [ ] Minimal memory load — requires remembering when scanning opens and whether enrollment is Active from another surface
- [x] Clear hierarchy — eyebrow (program) → H1 (event) → card (when/where) → H2 (instructions) → sticky bar is clear
- [x] Reduced clutter — civic minimal holds; no decoration
- [ ] Guided action — imperative copy does not guide a closed-state user toward the correct next step (wait / enroll / contact leader)
- [x] Avoid jargon — "簽到說明" / "前往掃描" plain for this congregation

**Working-memory pressure:** At the decision point "Should I tap 前往掃描?" the user must hold ~4 items (event time, location, window timing (missing), enrollment state (missing)) — at the revised Cowan limit of 4. With two items invisible, extraneous load is high despite a visually quiet screen.

**Intrinsic vs extraneous:** Intrinsic load is low (one question: can I check in now?). Extraneous load is high because the screen withholds the two facts that answer it.

---

## Emotional Journey (closed-window tap)

Curiosity ("查看聚會詳情") → brief confidence (clean civic card, legible time/place) → hesitation (no pill, no window time — "is this open?") → commission (cinnabar CTA looks authoritative, thumb-zone, says "前往掃描") → anticipated failure (server `CHECK_IN_CLOSED` or `ENROLLMENT_REQUIRED` after leaving this screen). The screen's calm aesthetic promises competence, then delegates the "no" to the scanner — a classic trust dent.

---

## What's Working (2–3 strengths)

**1. Civic Minimal shell is faithful and calm.**  
`programDetailInfoCard` (white, `1px #d6dcde`, 10px radius), `programDetailFactRow` with `EventFactIcon` (calendar/pin, 19px, `stroke 1.8`), and `stickyActionBar` (sticky `bottom: calc(78px + 10px)`, `rgba(255,255,255,.94)` + `0 10px 30px rgba(23,26,29,.09)`) match the design export's 680px centered `main`, 20px gutters, and shadow. Typography stays on the system sans stack; no SaaS heroism. This is the right visual language for an official church ordinance.

**2. Participant affordances are a11y-considered.**  
Back control keeps `programDetailBack` 44px target with `focus-visible: 3px #6495aa`; title `id="participant-event-title" tabIndex={-1}` is focused on mount for `!canManage` (the `useEffect` → `getElementById(...).focus()`), giving screen-reader users a landing point. Status pill, when present, carries `role="status" aria-label="可簽到"`. Fact rows use `<time dateTime={event.starts_at}>` for machine-readable HK wall time. These are not decorative choices; they survive a real gathering.

**3. Slice keeps the right data minimal.**  
Two fact rows only (when + optional where) plus one H2/H1 hierarchy. No enrollment count, no leader list, no management chrome leaks into the participant branch (`canManage` fully forks at line ~395). That restraint is correct — the participant's job is "where/when/how to check in," not program administration.

---

## Priority Issues (ordered)

### [P0] Primary CTA stays hot when check-in is impossible

**What:** In `event-detail.tsx:465–469`, the `!canManage` branch renders

```tsx
<div className={styles.stickyActionBar}>
  <Link href={scanHref} className={styles.actionButton}>
    {COPY.programs.goToScan}
  </Link>
</div>
```

unconditionally. `checkInWindowIsOpen(event)` (defined at `:80`) gates only the `可簽到` pill (`{checkInOpen && <span …>可簽到</span>}`, `:418`). A closed window, a `Cancelled` event, an `Inactive` availability, and an unenrolled viewer all see the same enabled cinnabar "前往掃描." The server will then reject with `CHECK_IN_CLOSED` / `EVENT_CANCELLED` / `ENROLLMENT_REQUIRED` — a preventable round-trip failure.

**Why:** Violates H1, H5, H9 and DESIGN.md's Cinnabar Accent Rule. The most authoritative color in the system promises actionability; when the window is closed it should promise _timing_. Also violates the spec's own error-prevention principle and burns trust on a phone in a crowded lobby.

**Fix (boring, minimal):** Gate the sticky bar on `checkInOpen && event.status === "Active" && event.availability === "Active" && enrolledOrCanManage` (reuse the `hasActiveEnrollment` derivation from `participant-program-detail.tsx`'s CTA gate). Closed state: render a _disabled_ `actionButton` (`aria-disabled="true"`) with copy like "簽到尚未開放" + a muted line showing HK wall window `hkShortDateLabel(opens_at) hkShortTimeRange(opens_at, closes_at)` (data already on `ProgramEvent`). Keep the same sticky container so thumb-zone and visual weight stay consistent; rarity of cinnabar is preserved because the disabled button uses muted/outline treatment.

### [P1] No check-in window timing or eligibility preview

**What:** Design export shows only the _event_ time (`8月20日（三）晚上 7:30–9:00`) and location. Live shows `whenLabel = hkShortDateLabel + hkShortTimeRange(starts_at, ends_at)` and optional location. Neither surface shows `check_in_window_opens_at / closes_at` (present on `ProgramEvent`, typed as ISO strings, used only inside `checkInWindowIsOpen`). For the closed cohort (all `E2E_DEMO` events start 2026-08-26, window opens ~30 min before), the user has no way to answer "when can I scan?" without leaving this screen.

**Why:** H1, H6, Checklist "minimal memory load" + "guided action." The spec's Church Time rule is met for the event but not for the gate that actually controls success.

**Fix:** Add a third fact row or muted line under the calendar row when `!checkInOpen`: `簽到時間：8月26日 19:00–21:30開放簽到` (using existing `hkShortDateLabel`/`hkShortTimeRange` on the window fields). Hide when window fields are null. No new component needed — `programDetailFactRow` + `programDetailMuted` already exist.

### [P1] Instruction copy is state-agnostic

**What:** Live `COPY.programs.eventInstructions` (`"請於簽到時間內前往掃描，確認聚會後完成簽到。"`) and design's longer `"到達場地後，掃描聚會二維碼。系統確認聚會及你的報名狀態後，才會完成簽到。"` are both open-state imperatives. In the closed state the same paragraph renders, so a user who cannot scan is told to scan.

**Why:** H2, H6. The paragraph is the only place that could contextualize the closed state; repeating the open imperative wastes its one chance to be helpful.

**Fix:** Branch the paragraph on `checkInOpen` (or better, on a derived `closedReason`): closed → `"簽到尚未開放，請於簽到時間內返回此頁面並前往掃描。"` + window line from P1 fix; if `!hasActiveEnrollment` → append `"你目前未報名此課程，請先在課程頁面報名。"` with a link back to program detail. Keep copy in `copy.ts` (existing pattern), no component invention.

### [P2] CTA reachability vs CTA gate mismatch (information architecture)

**What:** The task brief says to reach this screen via `/programs` → `E2E_DEMO_成人查經` → `查看聚會詳情` on the next-meeting card. Since `391-s2-05-event-detail-cta-gate-acceptance-plan.md` shipped the `canOpenEventDetail = canManage || hasActiveEnrollment` gate, an unenrolled `E2E_member` _has no CTA to tap_ — the closed state is unreachable via the advertised path and only reachable via direct deep link (`/programs?program=<id>&event=<id>`). Wave 2's seed is explicitly unenrolled, so the cohort under critique cannot see the screen the critique targets without a URL paste.

**Why:** H3, H4. The Program Detail card now correctly prevents a dead-click 404, but it leaves no explanatory affordance ("為什麼沒有詳情？") — a ghost affordance. For a future-enrolled, future-window program, the absence reads as missing data, not as a deliberate gate.

**Fix (out of scope for this file, but note for Program Detail):** When `!canOpenEventDetail`, keep the next-meeting card but replace the CTA with muted explanatory text: `"報名成功後可查看聚會詳情及簽到"` (or enrollment-state-specific variant). This screen itself should also handle the deep-link unenrolled case with a soft enrollment nudge rather than silently showing the same closed-state CTA (see P0/P1 fixes — gated CTA + enrollment line covers it).

### [P2] Back affordance polish drift

**What:** Design export back control is an inline-flex button with `#i-back` chevron SVG, `gap:6px`, `margin-left:-8px`, 44px min-height, transparent bg. Live `!canManage` back is `<button className={styles.programDetailBack}>← 返回</button>` — unicode arrow, no SVG, different optical weight and hit-area. Functional parity is fine; visual parity is off for a screen that otherwise nails the civic tokens.

**Why:** H4, H8. At 390×844 the 8px left bleed and SVG weight matter for thumb-target alignment with the eyebrow/title stack.

**Fix:** Reuse `EventFactIcon name="back"` (already defined in this file) inside the participant back button, matching the design's `i-back` glyph, and align `programDetailBack` padding to design's `8px` with `margin-left:-8px`. One-line template change, no new icon.

---

## Persona Red Flags (most relevant: Casey, Sam, Jordan)

### Casey — Distracted Mobile User (one-handed, interrupted, slow connection)

- **Thumb-zone betrayal:** The sticky cinnabar CTA sits perfectly in the thumb zone (`position: sticky; bottom: calc(78px + …)`), which is excellent when actionable — and actively harmful when closed, because the easiest thing to do is the wrong thing to do. Casey taps while walking into the hall; the scan fails off-screen.
- **No at-a-glance window timing:** Casey cannot tell from the card whether to keep the phone out or put it away. No "opens in 2h 14m" or wall-clock window — requires navigating away to infer.
- **Top vs bottom signal split:** The only closed signal (absence of a small pill near the top) is outside the thumb zone and outside foveal attention when the CTA is bottom-fixed. Status should live near the action (sticky bar), not only near the title.

### Sam — Accessibility-Dependent (VoiceOver/NVDA, keyboard-only)

- **Focus lands well, but action misleads:** `participant-event-title` focus on mount is good (announces the event), but the next Tab lands on an enabled "前往掃描" link that will fail. `aria-disabled` + explanatory text would let Sam understand _why_ without leaving the screen.
- **Status pill is the single source of truth, and it's absent:** `role="status"` with `aria-label="可簽到"` only exists when open. When closed there is no `role="status"` at all — VoiceOver hears nothing about availability. An `aria-live` polite region with "簽到尚未開放，開放時間 …" would close the gap.
- **Time semantics partial:** `<time dateTime={event.starts_at}>` is present for the event start, but the check-in window — the gate that determines operability — has no `<time>` element when closed, so screen-reader users cannot query it.

### Jordan — Confused First-Timer (never checked in, reads everything)

- **Same instruction for both states:** Jordan reads "請於簽到時間內前往掃描" and reasonably asks "那現在是不是簽到時間？" — the screen doesn't answer. First-timers will tap to find out, which is the error-prevention failure.
- **Enrollment invisibility:** Jordan is unenrolled (Wave 2 baseline). Nothing on this screen mentions enrollment; the scanner is the first place they learn they need to enroll. A first-timer's mental model breaks at that point because enrollment lives on a different screen.
- **Back label ambiguity:** "返回" (from `backToOrigin`) with a `←` is clear to return, but return _where_? Design's context is "返回" inside 聚會詳情 heading context; after the gate change, Jordan who deep-linked has no breadcrumb of which program they came from beyond the eyebrow line.

---

## Minor Observations

- Copy delta between design and live instruction is intentional shorthand but loses the QR specificity ("掃描聚會二維碼") that helps a church gatherer know _what_ to scan — worth keeping the QR noun in the open-state copy.
- `programDetailEyebrow` (program name) is a good addition over design's subtitle, but its muted `#59636a` size competes with the calendar row's same color — eyebrow could be `0.8125rem` / `600` / `letter-spacing: 0.02em` to separate program identity from operational facts.
- `stickyActionBar` background `rgba(255,255,255,.94)` + blur would pass more civic polish if paired with `backdrop-filter: blur(8px)` (already in shell tokens) — currently flat translucent.
- Event title fallback `hkWallDateTimeLabel(event.starts_at)` is robust but produces a long H1 when name is null; `boundaryTitle` clamp handles it, but a "未命名聚會" fallback would be more human for manual events.

---

## Provocative Questions

1. **What if the closed state _was_ the design?** Instead of hiding the pill, what if "尚未開放" became a first-class status pill (neutral outline, with a countdown like "2小時後開放") and the sticky bar became its _explanation_ rather than its _contradiction_ — would cinnabar's authority be better spent on "設提醒" than on a disabled scan?
2. **What if eligibility lived here?** If the check-in window and enrollment are the two gates, and both are known at render time (`check_in_window_*` + `enrollment.status`), why does the user have to discover the second gate on another screen — could this screen become the single "Can I check in?" oracle with one sentence per gate?
3. **What if the CTA disappeared when it shouldn't be tapped?** Civic minimal often means "show less" — but on a phone in a lobby, is hiding the wrong action more honest than disabling it, and would a _blank_ sticky zone with a centered window-time line reduce mis-taps more than any disabled button treatment?

---

## Run Notes

- **Static design file:** opened via `file://` (`event-detail.html`) — verified: open-state shell with `可簽到` pill, fact rows, 680px main, sticky CTA spec captured above.
- **Live route:** direct `file://` live render not exercised via browser `wrangler dev` in this Assessment A pass (Wave 2 parallel subagents share D1 state; task instructs fresh tab per task, live server already running at `127.0.0.1:8787`, no start/stop performed). Visual comparison derived from source-of-truth rendering branch (`event-detail.tsx:395–471` !canManage), CSS module (`programs.module.css:2250+` sticky bar, info card, fact row), and copy (`copy.ts:1152–1155`). This grounds the "closed looks like open" finding in code, not screenshot illusion.
- **Detector/Browser isolation:** No `detect.mjs` run, no Assessment B output read — Assessment A independence preserved.
- **Mutation invariant:** No source file modified, no enrollment submitted — `E2E_member` remains unenrolled as seeded.
