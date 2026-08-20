# $impeccable audit — S2 Participant Screens (consolidated)

**Branch:** `feat/389-s2-05-program-detail` · **Worktree:** `.worktrees/stack-385-389` **Date:** 2026-08-20 · **Auditor:** AuditS2Participant (automated, code-level) **Scope:** 5 participant screens together — Programs catalog, Program Detail + Enrollment, Event Detail (`canManage=false` participant view + `canManage=true` management view), Notices, Messages (+ shared `AnnouncementDetail`/`Icon` on `web/app/home/page.tsx`) and `web/app/programs/programs.module.css` + `web/lib/notices-panel.module.css` + `web/app/home/home.module.css`. Tokens from `DESIGN.md` / `web/app/globals.css` (`--surface` `#f4f5f3`, `--surface-raised` `#ffffff`, `--ink` `#171a1d`, `--ink-muted` `#59636a`, `--line` `#d6dcde`, `--line-strong` `#aeb8bc`, `--accent` `#9c302c`, `--accent-deep` `#76231f`, `--focus` `#176a87`, `--success`/`--success-surface`/`--success-border`, `--error`/`--error-surface`/`--error-border`). Breakpoint under test: `800px` (per `DESIGN.md` / `globals.css`; `PRODUCT.md` historical `768px` wording is superseded). Detector: `node …/scripts/detect.mjs --json` over `web/lib/programs/`, `notices-panel`, `messages-panel`, `programs.module.css`, `home/page.tsx` — all returned `[]` (no auto-flagged drift).

**Constraint:** No redesign critique; no source edits; no project-wide lint/build. Mobile `390×844` + desktop `≥800px` inspected via code and `read(http://127.0.0.1:8787/)` pre-check only — no state mutation (no enrollment submit, no D1 write). Where a live check would require authenticated navigation, the finding is marked `[code-audited]` rather than claimed as visually confirmed.

---

## Audit Health Score

| # | Dimension | Score | Key Finding |
| --- | --- | --- | --- |
| 1 | Accessibility | **3 / 4** | One residual keyboard gap (search input missing visible label/placeholder) + one nested-button/heading concern on catalog cards; otherwise strong. |
| 2 | Performance | **4 / 4** | No layout-thrash, no expensive effects, minimal JS; `prefers-reduced-motion` correctly scoped. |
| 3 | Responsive Design | **3 / 4** | Catalogue, detail, notices, and messages fluid at both breakpoints; one sticky-bar safe-area interaction worth hardening at 390px. |
| 4 | Theming | **3 / 4** | Notices + messages + home detail use tokens consistently; Programs chips/status keep 6 hard-coded hexes (see P2-02). |
| 5 | Implementation Integrity | **4 / 4** | No drift, no invented marketing content, coherent product system. Detector `[]`; spot-checked adapter/data-flow consistent. |
| **Total** |  | **17 / 20** | **Good — address the two P1 a11y/overflow items and the hard-coded chip colors; polish remaining P2s.** |

**Rating bands:** 18–20 Excellent · 14–17 Good · 10–13 Acceptable · 6–9 Poor · 0–5 Critical

---

## Implementation Integrity Verdict — ✅ PASS

Does this implementation express a coherent product-specific system (not a generic interchangeable template)? **Yes — pass.**

- **Detector:** `detect.mjs` over `web/lib/programs/`, `notices-panel`, `messages-panel`, `programs.module.css`, `home/page.tsx`, and the whole `web/lib/programs/` directory returned `[]` on every pass — zero repeated shortcuts, zero decorative/misleading-content flags, zero design-system drift. Verified with narrow rescans of `web/lib/messages-panel.tsx`.
- **Product language:** All user-facing strings via `COPY` (Cantonese Chinese primary), full church name `中國基督教播道會顯恩堂` from `DESIGN.md`, no invented testimonials/pricing/multi-tenant claims. A11y strings (`announce()`, `role="status"/"alert"`, `aria-busy`) match `CONTEXT.md` shell baseline.
- **Architecture alignment:** Participant boundary (`programs-boundary.tsx`) makes the 800px participant-default contract explicit; `program-api.ts`/`programs-intent.ts` intent parsing preserved; D1-owned identity + transitional Sheets backend not papered over; `programDetailEventMeta`/`programDetailNextEvent`/`participantConfirm` map cleanly to Spec 071/074 vocabulary.
- **False positives:** None to call out — detector produced no findings to triage.

---

## Executive Summary

- **Health:** **17/20 (Good).** The five participant surfaces ship as one coherent flow (catalog → detail → enrollment/event → notices/messages) with consistent tokens, keyboard focus, and live-region feedback.
- **Issues:** 1 × P1, 6 × P2, 4 × P3. No P0 blockers. The P1 is an a11y gap on the catalog search (missing visible label + placeholder), easy to fix without design change. The only structural P2 is the 6 hard-coded hexes on status/filter chips that should be tokens or documented fallbacks.
- **Top findings:**
  1. **[P1] Catalog search has no visible label or placeholder** — screen-reader label exists (`aria-label`), but sighted keyboard/voice users have no visible affordance (`participant-directory.tsx:349`).
  2. **[P2] Status/filter chips use 6 hard-coded hexes** — `#8a5b16`/`#f3eee8`/`#c1ad95`/`#b3261e`/`#fbecea`/`#d7a199`/`#171a1d`/`#e3e0e1` bypass `var(--*)` on `.directoryStatusPending/Danger`, `.programDetailConflict`, `.filterChip[aria-pressed="true"]`, `.directorySkeletonBar` (`programs.module.css:1318,1358,1401,1413,1550,1563,2104,2129`).
  3. **[P2] Motion kill is correctly scoped but `notices-panel.module.css` has no `prefers-reduced-motion` block** at all — currently harmless (no transitions there) but inconsistent if transitions are added later.
  4. **[P2] Sticky action bar bottom offset `calc(72px + …)` at 390px** + `place-items: center` dialog centering on short viewports — code-audited, not live-confirmed; low risk but worth a 390px smoke.
  5. **[P2] AnnouncementDetail venue card is static placeholder content** (`venueCard` with fixed `worshipLocation`/`familyRoom`/`visitorReception`) — intentional per spec, but note for future CMS wiring (not a defect today).
- **Next steps:** Fix the catalog search label (P1 → `$impeccable clarify` or a one-line `edit`), tokenize the chip hexes (P2 → `$impeccable colorize`), smoke the sticky bar at 390px (`$impeccable layout`), then re-run `$impeccable audit`.

---

## Detailed Findings by Severity

### P1 — Major (fix before release)

#### [P1] Catalog search input has no visible label or placeholder

- **Location:** `web/lib/programs/participant-directory.tsx:349-357` (`#programs-catalog-search`); styles `web/app/programs/programs.module.css:1241-1287` (`.directorySearchRow .input`, `.directorySearchIcon`, `.directorySearchLabel` exists but unused).
- **Category:** Accessibility · **Impact:** Sighted keyboard and voice-control users have no visible name for the field; placeholder cue absent. Screen readers are covered (`aria-label={COPY.programs.catalogSearchLabel}`), but WCAG 3.3.2 Labels or Instructions expects a visible label/placeholder/hint for sighted users. Low-vision magnification also suffers.
- **WCAG:** 3.3.2, 2.4.6 (Headings and Labels).
- **Recommendation:** Render the existing `directorySearchLabel` visibly (or add `placeholder={COPY.programs.catalogSearchPlaceholder}` once copy key exists) and keep `aria-label`. Do not hide the label with `sr-only` — make it visible.
- **Suggested command:** `$impeccable clarify` (or a single `edit` to wire the label/placeholder).

---

### P2 — Minor (fix in next pass)

#### [P2-01] Enrollment `<dialog>` uses `open` without `showModal()` — Escape + backdrop are custom-wired correctly but focus trap is minimal

- **Location:** `web/lib/programs/participant-enrollment.tsx:493-524` (`<dialog open … aria-modal="true">`, `dialogRef`, `data-confirm-dismiss` focus).
- **Category:** Accessibility · **Impact:** Dialog is not modal via the platform — backdrop click does not dismiss (by design), but focus is only sent to the dismiss button on open and returned via `queueMicrotask` on close (`closeConfirm:304`). Focus is not trapped inside the dialog; a Tab past the last button escapes to the page behind the overlay. Screen-reader `aria-modal` is present, so the practical risk is keyboard-only users tabbing behind the scrim.
- **WCAG:** 2.4.3 Focus Order.
- **Recommendation:** Either call `dialogRef.current?.showModal()` when `confirmKind` becomes non-null (and `close()` on dismiss) to get free focus trapping, or add a lightweight trap that cycles focus between the two buttons. Existing Escape handler (`320-327`) is correct — keep it.
- **Suggested command:** `$impeccable harden`

#### [P2-02] Six hard-coded hex colors bypass the token system (status chips + skeleton + conflict note + active filter chip)

- **Location:** `web/app/programs/programs.module.css:1318-1322` (`.filterChip[aria-pressed="true"]` → `#171a1d`), `1358` (`.directorySkeletonBar` → `#e3e0e1`), `1401-1403` / `1550-1552` (pending → `#c1ad95`/`#8a5b16`/`#f3eee8`), `1413-1415` / `1563-1565` (danger → `#d7a199`/`#b3261e`/`#fbecea`), `2104-2106` / `2129-2132` (`.programDetailConflict` / next-event conflict note → `#c1ad95`/`#f3eee8`/`#6e4a14`).
- **Category:** Theming (also contrast-adjacent) · **Impact:** These do not follow `var(--*)` with fallback hex, unlike 95%+ of the file. Dark-mode or token-override themes will miss them. Contrast itself still passes (e.g. `#8a5b16` on `#f3eee8` = 5.07:1, `#6e4a14` on `#f3eee8` = 6.86:1, `#b3261e` on `#fbecea` = 5.69:1 — verified), but the theming contract is broken.
- **WCAG/Standard:** DESIGN.md token contract.
- **Recommendation:** Introduce `--pending-bg`/`--pending-fg`/`--pending-border` etc. in `globals.css` (or at minimum use `var(--pending-*, #f3eee8)` with the current hex as fallback) and replace the literals. Same for skeleton (`--line-muted` or reuse `--line`) and selected chip (reuse `--ink`/`--surface-raised` via `var()`).
- **Suggested command:** `$impeccable colorize`

#### [P2-03] `prefers-reduced-motion` only kills `.actionButton` — `notices-panel.module.css` and `programs.module.css` wider transitions are uncovered

- **Location:** `web/app/programs/programs.module.css:1078-1082` (only `.actionButton { transition: none }`); `web/app/home/home.module.css:343-348` (`.primaryAction, .listCard`); `web/lib/notices-panel.module.css` — no `@media (prefers-reduced-motion)` at all; `web/app/globals.css` — no count (`grep` returned only `transition:` on `.nav-item` without a reduce block).
- **Category:** Accessibility (motion sensitivity) · **Impact:** Currently harmless — notices panel has no transitions, and program surfaces only animate `background-color`/`border-color`/`box-shadow`/`color` at `0.15s` (no layout, no blur, no parallax). But if a transition is added to notices or to other program controls later, reduced-motion users will not be respected there. Also, the kill is not the destructive global `0.01ms` — it correctly uses `transition: none`, which is the right pattern.
- **WCAG:** 2.3.3 Animation from Interactions.
- **Recommendation:** Broaden the reduce block to `*, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important }` scoped narrowly, or at least mirror it in `notices-panel.module.css` and expand the programs block to `button, a, .directoryCard, .modeButton` alongside `.actionButton`. Keep it intentional — do not add a global `0.01ms` kill that breaks state-change feedback.
- **Suggested command:** `$impeccable animate`

#### [P2-04] Notices `itemTime` + Messages `listCard` date suffix rely on CSS-only responsive reflow without a min tap target on the row link itself

- **Location:** `web/lib/notices-panel.module.css:89-148` (`.itemLink` `min-height:92px` correct, but `.itemTime` `white-space:nowrap` reflows via `max-width:560px` grid change); `web/lib/messages-panel.tsx:107-121` (`homeStyles.listCard` `min-height:72px` correct); `web/lib/notices-panel.tsx:54` (`<a class="itemLink">` wrapping dot+copy+time as a single grid link).
- **Category:** Responsive / Accessibility · **Impact:** Touch target itself is generous (≥72px) — this is not a `<44px` failure. Edge case: on 390px, the notices time wraps to its own row (`grid-column:2`) which pushes total height taller but keeps the whole row tappable (the `<a>` is the grid). Messages `listCard` is also `min-height:72px` and full-width — compliant. Flagged as P2 not for size but for confirming that very long `itemBody` does not push `itemTime` off-screen; `min-width:0` on `.itemCopy` + `overflow:hidden` on `.list` keep it contained `[code-audited]`.
- **Recommendation:** No code change required beyond a 390px smoke with a long notice body to confirm `itemTime` stays in the click target. Consider adding `word-break: break-word` to `.itemBody` if long URLs appear in notices.
- **Suggested command:** `$impeccable layout`

#### [P2-05] Sticky enrollment action bar `bottom: calc(72px + 0.625rem + safe-area)` overlaps Phone bottom nav on short viewports if content is tall

- **Location:** `web/app/programs/programs.module.css:2268-2290` (`.stickyActionBar` `position:sticky; bottom: calc(72px + …)`; `web/lib/programs/participant-enrollment.tsx:156-185,262-271` (bar rendered inside `eventsPanel` after `EnrollmentAction`); `web/app/globals.css:288-294` (`.shell-content` bottom padding `84px + safe-area` on phone).
- **Category:** Responsive · **Impact:** On 390px phone the shell reserves `84px` for the fixed 5-slot nav; the sticky bar sits `72px+` above the viewport bottom, so on short viewports (e.g. 667px tall iPhone SE) the bar and nav can visually crowd if `programDetail` content is short. The bar uses `color-mix(… 94%)` translucent background + shadow, so it remains readable — but a very long program description + schedule list could leave the bar floating mid-scroll before it sticks. `[code-audited]`, not live-confirmed.
- **WCAG/Standard:** Responsive; PRODUCT.md phone-first.
- **Recommendation:** Smoke at 390×667 with the longest seeded program description. If crowding shows, consider `bottom: calc(84px + env(safe-area-inset-bottom,0px) + 0.5rem)` to align exactly with `.shell-content` padding, or hide the shadow when `position:sticky` is not yet stuck (via `position: sticky` sentinel).
- **Suggested command:** `$impeccable layout`

#### [P2-06] `AnnouncementDetail` venue card is static fixture content, not a CMS placeholder

- **Location:** `web/app/home/page.tsx:331-353` (`venueCard` with `COPY.home.venueTitle/Instructions/worshipLocation/familyRoom/visitorReception`, fixed `<ul>` + optional `externalUrl` row); `web/lib/messages-panel.tsx:100-102` (`messagesEmptyHint` path reuses `AnnouncementDetail` via `toDetail()`).
- **Category:** Implementation Integrity · **Impact:** Not a bug — spec-intentional for S2. The venue list is identical for every announcement regardless of content, which is correct per current CMS scope. Future risk: when the CMS gains per-announcement venue/schedule fields, this card will need to become data-driven rather than copy-driven; otherwise writers will file “venue wrong” bugs.
- **Recommendation:** No fix now. Add a `// TODO(CMS): venueCard should read from announcement.venue when the field ships` comment when that schema lands.
- **Suggested command:** none (track in CONTEXT.md when CMS scope expands)

---

### P3 — Polish (nice-to-fix)

#### [P3-01] Skeleton bars have decorative-only contrast 1.31:1 (intentional)

- **Location:** `web/app/programs/programs.module.css:1357-1377` (`.directorySkeletonBar { background:#e3e0e1 }` on `var(--surface-raised) #ffffff`).
- **Category:** Accessibility (decorative) · **Impact:** 1.31:1 fails WCAG text contrast, but these are 3 pulsing placeholder bars with `aria-hidden="true"` and a sibling `sr-only` + `aria-busy="true"` on the section — fully non-informative. No fix needed.
- **Recommendation:** Keep as-is. If contrast is ever tightened for `prefers-contrast: more`, bump to `#c9c4c4` (~2:1) — not required.

#### [P3-02] `programDetailConflict` uses `role="note"` — low support

- **Location:** `web/lib/programs/participant-program-detail.tsx:411` (`<p className={styles.programDetailConflict} role="note">`).
- **Category:** Accessibility · **Impact:** `note` is valid ARIA 1.2 but AT support is thin; some readers ignore it. Content is a schedule-conflict advisory — benign if unannounced (users still see it visually). The `aria-label` on the schedule list nearby is the more important signal.
- **Recommendation:** Keep or swap to `role="status"` with `aria-live="polite"` only if conflict appears dynamically after load (it does not — it comes with `detail`). Not worth changing now.

#### [P3-03] Event Detail participant view check-in success reuses `role="status"` span, not an assertive live region

- **Location:** `web/lib/programs/event-detail.tsx:418-425` (`checkInAvailable` badge `role="status"`); error/success use `role="alert"` / `output aria-live="polite"` elsewhere in the same file.
- **Category:** Accessibility · **Impact:** `role="status"` is polite — correct for a non-urgent “check-in window open” badge. No user task is blocked if announcement is delayed.
- **Recommendation:** None.

#### [P3-04] Notices `markAll` is `border:0` text button — focus ring still wins, but hit area relies on padding

- **Location:** `web/lib/notices-panel.module.css:50-61` (`.markAll, .retry { min-height:44px; border:0; padding:0.5rem 0.125rem; border-radius:var(--radius-sm) }`), `web/app/globals.css:254-264` (`:focus-visible { outline:2px solid var(--focus) }`).
- **Category:** Accessibility / Theming · **Impact:** `min-height:44px` passes PRODUCT.md ≥44px target; `outline` is global and applies. Visual hit area feels smaller than boxed buttons because horizontal padding is `0.125rem` — still large enough vertically, but a future denser toolbar could regress. No current failure.
- **Recommendation:** If toolbar gains more actions, switch `.markAll` to `border:1px solid var(--line)` or bump `padding-inline` to `0.5rem` for parity with `.retry`.

---

## Patterns & Systemic Issues

1. **Hard-coded pending/danger palette outside the token set.** The only theming gap in an otherwise token-clean pass. Source: `programs.module.css` status chips + `programDetailConflict`. Impact: dark-mode / high-contrast theme overrides miss these six values; contrast still passes today but the contract is inconsistent. Fix: tokenize once in `globals.css` and replace literals. (P2-02)

2. **Motion preference handled correctly where transitions exist, absent where none exist yet.** `programs.module.css` + `home.module.css` both scope `prefers-reduced-motion` to exactly the elements that transition. `notices-panel.module.css` has none — correct today, but a missing pattern if transitions are later added there. Fix: add a matching reduce block when that file gains transitions. (P2-03)

3. **Sticky action bar vs. phone shell bottom nav — code-audited spacing.** `stickyActionBar` bottom `72px` vs. `.shell-content` bottom padding `84px` — 12px delta intentional (bar floats above the dock with shadow), but on short viewports the bar + dock + schedule list can feel crowded. Not a breakpoint break, but the only responsive item that needs a live smoke. (P2-05)

4. **A11y otherwise strong and consistent.** Live regions (`announce()` + `role="status"/"alert"` + `output aria-busy`/`aria-live`), focus return on dialogs/retry, `aria-busy` on panels, `aria-label` on icon-only controls (`back`, `checkInAvailable`), `sr-only` on unread dot, `tabIndex=-1` + `.focus()` on state/load panels — all present and correctly wired across the five screens.

---

## Positive Findings (keep & replicate)

- **Token discipline 95%+:** Notices, messages, home detail, and most of programs surface use `var(--*)` with hex fallbacks consistently. Card `max-width:760px` / `880px` / `680px`, `clamp()` padding, and `minmax(0,1fr)` grids are fluid at both 390px and ≥800px.
- **Focus-visible is global and covered:** `globals.css:254` + `programs.module.css:420-440` + `home.module.css:131-138` list every interactive class (`button`, `a`, `input`, `filterChip`, `directoryCard`, `programDetailBack`, `taskButton`, `actionButton`, `dangerButton`, etc.) with `outline:3px solid var(--focus)` / `outline-offset:2px`.
- **Touch targets ≥44px everywhere:** Grep confirms `min-height:44px` on `filterChip`, `directoryCard` (grid row), `input`/`select`/`textarea`, `button`/`actionButton`/`dangerButton`/`secondaryButton`/`dangerOutline`/`successOutline`, `modeButton`, `memberOption`, `notificationTrigger`, `notices markAll/retry`, `messages listCard (72px)`, `notices itemLink (92px)`. PRODUCT.md compliant.
- **Contrast for all text tokens passes AA:** `ink` 17.47:1, `ink-muted` 6.14:1 on white, `white` on `accent` 7.31:1, `pending #8a5b16` on `#f3eee8` 5.07:1, `danger #b3261e` on `#fbecea` 5.69:1, `conflict #6e4a14` on `#f3eee8` 6.86:1, `success #2e6b37` on `#eef4ef` 5.75:1, `focus #176a87` on `#f4f5f3` 5.57:1 (verified via WCAG relative luminance).
- **Live regions and focus management:** `announce()` on every load/error/retry, `retryFocusPending` + `requestId` guards, `previousFocusRef` + Escape on dialogs, `confirmRef` focus handoff on inline confirms — all correctly implemented.
- **Responsive grids are resilient:** `notices .itemLink` `grid-template-columns:12px minmax(0,1fr) auto` → collapses to `12px minmax(0,1fr)` at `560px`; `programDetailEventMeta` `5rem minmax(0,1fr)` → `4.5rem` at `799.98px`; `.programDetailTableWrap { overflow-x:auto }` — no horizontal scroll on 390px `[code-audited]`.
- **Enrollment state machine is exhaustive:** `EnrollmentAction` covers `Archived → Unavailable → ManagerOnly → Draft → Active → Pending → Ineligible → Rejected/Withdrawn → Cancelled → Approved → Eligible` without fallthrough gaps; `AnnounceMentDetail` external link has `target="_blank" rel="noopener"`.
- **Implementation integrity:** No marketing fluff, no invented testimonials, no schedule duplication — `programs-intent.ts`/`program-api.ts` boundaries honored, Cantonese copy only via `COPY`, church name `中國基督教播道會顯恩堂` used correctly.

---

## Recommended Actions (priority order)

1. **[P1] `$impeccable clarify`** — Add a visible label (or placeholder) to the Programs catalog search input (`participant-directory.tsx:349`) alongside the existing `aria-label`.
2. **[P2] `$impeccable colorize`** — Tokenize the 6 hard-coded pending/danger/skeleton/conflict hexes in `programs.module.css:1318,1358,1401,1413,1550,1563,2104,2129` via `globals.css` custom properties (keep current hex as fallback).
3. **[P2] `$impeccable harden`** — Promote the enrollment confirm `<dialog>` to `showModal()` (or add a focus trap) and keep the existing Escape + return-focus behavior.
4. **[P2] `$impeccable animate`** — Expand `prefers-reduced-motion` coverage to `notices-panel.module.css` and broaden the `programs.module.css` reduce block beyond `.actionButton` (keep `transition:none`, not a global `0.01ms` kill).
5. **[P2] `$impeccable layout`** — Smoke `stickyActionBar` + phone nav + long program content at `390×667` and at `≥800px`; align sticky `bottom` with shell `84px` padding if crowding shows; confirm `notices itemTime` wraps inside the full-row link with a long `itemBody`.
6. **[P2] `$impeccable polish`** — Final pass after the above (contrast smoke, keyboard tab order through catalog → detail → enrollment/event → back, notices/messages empty/loading/error states).

> You can ask me to run these one at a time, all at once, or in any order you prefer.
>
> Re-run `$impeccable audit` after fixes to see your score improve.
