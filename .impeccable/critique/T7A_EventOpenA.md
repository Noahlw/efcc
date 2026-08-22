# Design Critique (Assessment A: Design Review) — Event Detail (Check-in Window OPEN)

Method: dual-agent (A: T7A_EventOpenA · B: T7B_EventOpenB) Target: `web/lib/programs/event-detail.tsx` (Live State: `/programs?program=06256d63-c014-4a5b-b0e4-2dacb7be983d&event=cb5fdf4e-bcb0-4580-a396-bef817b414fb`) Comparison: `design_export/participant/event-detail.html` Audience: Members attending an active church gathering (`E2E_member` on mobile viewport 390×844)

---

## Design Health Score

| # | Heuristic | Score | Key Issue |
| --- | --- | :-: | --- |
| 1 | Visibility of System Status | 3/4 | `可簽到` badge clearly indicates open state, but remaining window duration is omitted |
| 2 | Match Between System & Real World | 4/4 | Authentic Hong Kong Church Time, Cantonese terminology (`二樓禮堂`, `前往掃描`), and natural date formatting |
| 3 | User Control and Freedom | 3/4 | Back button works via history, but lacks breadcrumb hierarchy back to parent course |
| 4 | Consistency and Standards | 2/4 | Primary CTA uses outline style (`.actionButton`) instead of solid Cinnabar (`.button`); nested inside directory frame |
| 5 | Error Prevention | 3/4 | Scan button is restricted to open check-in window; physical on-site requirements clearly stated |
| 6 | Recognition Rather Than Recall | 4/4 | Program name displayed as eyebrow; venue and time co-located in high-contrast fact card |
| 7 | Flexibility and Efficiency of Use | 3/4 | Sticky action bar places scan button directly in mobile thumb zone; lacks calendar export |
| 8 | Aesthetic and Minimalist Design | 2/4 | Leaked directory header ("課程 / 尋找合適的課程..."), double card borders, and autofocus outline rectangle on heading |
| 9 | Recognize, Diagnose, & Recover from Errors | 3/4 | Proper fallback retry states on network error; deep-link auth recovery |
| 10 | Help and Documentation | 3/4 | Concise "簽到說明" clarifies that QR scanning completes attendance |

**Total Score: 30/40 (75% — Good)**

---

## Design Specificity Verdict

### LLM Assessment: Grounded but Structurally Leaky

The live Event Detail screen demonstrates strong domain alignment with the **Official Civic Minimal** design system: high-contrast typography, authentic Hong Kong Church Time formatting (`8月20日（四）早上 8:43–10:13`), crisp SVG icons for calendar and physical room location (`二樓禮堂`), and unambiguous Cantonese attendance copy (`簽到說明`).

However, the visual composition suffers from structural leaks where the screen is hosted:

1. **Outer Frame Leak**: Instead of presenting a clean standalone event surface as intended in `event-detail.html`, the live page is rendered inside `BoundaryFrame`. This forces a redundant top-level directory banner (`課程` / `尋找合適的課程，查看聚會及報名狀態。`) above the event card, confusing the user about whether they are browsing a catalog or viewing their specific gathering.
2. **Primary Action Demotion**: The main call to action ("前往掃描") is rendered as a hollow outline button (`.actionButton`) with a transparent background rather than the solid Cinnabar Red button (`.button` / `#9c302c`). This violates the Cinnabar Accent Rule and dilutes the visual weight of the primary check-in CTA.
3. **Mount Focus Glitch**: An imperative `element.focus()` call on mount highlights the event `h1` heading with a blue/teal focus box (`3px solid #176a87`), creating visual friction on touch devices.

---

## Overall Impression

The core gathering information is functionally complete and accurate for on-site church attendance. However, wrapping the event view inside the parent directory header and rendering the primary scan CTA as an outline button rather than a commanding solid cinnabar button prevents the interface from reaching the crisp, distraction-free clarity of the reference design.

---

## What's Working

1. **High-Contrast Church Time & Venue Fact Card**: The `.programDetailInfoCard` presents the date, time range, and physical room location with clean SVG icons, high typographic contrast, and zero clutter.
2. **Sticky Thumb-Zone Action Bar**: The bottom-anchored `.stickyActionBar` floats cleanly above the bottom navigation bar, ensuring one-handed access to the scan action as members walk into the hall.
3. **Clear Attendance Guidance**: The "簽到說明" section concisely sets expectations: physical presence, QR scan, and system validation are required before attendance is recorded.

---

## Priority Issues

### [P1] Primary Action Button Uses Secondary Outline Style Instead of Solid Cinnabar

- **What**: The "前往掃描" button inside `.stickyActionBar` renders with a transparent background and 1px red outline (`.actionButton`) instead of the solid primary CTA style (`.button` / `background: #9c302c; color: #ffffff`).
- **Why**: Check-in is the single primary task on this screen. Outline buttons are reserved for secondary actions; using an outline button here deprives the primary action of visual dominance and violates the Cinnabar Accent Rule.
- **Fix**: Apply `.button` (or solid primary styling) to the scan Link in `event-detail.tsx:466`.

### [P1] Boundary Frame Header Leaks Directory Context into Event Detail

- **What**: The outer `BoundaryFrame` renders `<h1>課程</h1>` and `<p>尋找合適的課程，查看聚會及報名狀態。</p>` above the event detail view.
- **Why**: A participant arriving via deep-link or from their enrolled program schedule is looking at a specific gathering instance. Displaying a catalog search banner introduces extraneous cognitive load and false navigation context.
- **Fix**: Suppress or customize `BoundaryFrame` header and outer card wrapper when `intent.eventId` is active.

### [P2] Autofocus Rectangle on Event Heading Creates Touch UI Artifact

- **What**: On page load, `document.getElementById("participant-event-title")?.focus()` places a persistent focus ring (`3px solid #176a87`) around the `h1` title.
- **Why**: While intended for accessibility navigation, programmatic focus on static text creates an unwanted visual box on mobile touch screens without user keyboard interaction.
- **Fix**: Use programmatic focus only for keyboard/screen-reader navigation or suppress visual outline when focus is triggered programmatically via `:focus:not(:focus-visible)`.

### [P2] Status Badge Layout & Spacing Alignment

- **What**: The `可簽到` status badge sits awkwardly in the header block rather than as an inline pill tag aligned with the hierarchy.
- **Why**: In `event-detail.html`, the status tag is a compact rounded pill (`border-radius: 99px; padding: 4px 9px`) nestled closely with the back link and heading.
- **Fix**: Harmonize `.directoryStatus` styling within `.programDetailHeader` to ensure compact pill geometry.

### [P3] Content Bottom Inset & Sticky Bar Spacing

- **What**: When scrolled, the floating action bar can occlude the last line of the "簽到說明" copy if bottom padding on `.programDetail` is insufficient.
- **Why**: The sticky bar occupies ~68px of vertical space plus safe-area insets.
- **Fix**: Ensure the container has `padding-bottom: calc(72px + 68px + env(safe-area-inset-bottom))`.

---

## Persona Red Flags

### Casey (Distracted Mobile User)

- **Context**: Walking into the church hall holding a bag in one hand, trying to check in quickly before worship starts.
- **Red Flag**: The outline "前往掃描" button has weak visual contrast against the white floating card and blends in with container borders. Casey hesitates for a second looking for the "real" check-in button.
- **Red Flag**: The top banner ("尋找合適的課程...") makes Casey double-take and check if they accidentally navigated back to the catalog.

### Sam (Accessibility-Dependent User)

- **Context**: Navigating via VoiceOver on iOS.
- **Red Flag**: The programmatic focus shift directly to `participant-event-title` skips the back button and status badge announcements, forcing Sam to swipe backward to find navigation controls.
- **Red Flag**: The `可簽到` status element has `role="status"`, which can cause a live-region announcement to interrupt the title reading sequence on initial load.

### Jordan (Confused First-Timer)

- **Context**: Attending their first Bible study gathering at EFCC.
- **Red Flag**: Seeing "課程 / 尋找合適的課程..." at the top of the card creates confusion about whether their enrollment is already confirmed or if further registration steps are required.

---

## Minor Observations

- The back button text is `← 返回` with a text arrow rather than an inline SVG chevron (`<svg><use href="#i-back"/></svg>`), creating slight optical misalignment.
- The date string (`8月20日（四）早上 8:43–10:13`) is exceptionally clean and readable.

---

## Questions to Consider

1. _What if Event Detail bypassed the parent `BoundaryFrame` card entirely on mobile to render as a dedicated full-bleed gathering sheet?_
2. _Should the `可簽到` badge display the remaining check-in window time (e.g., `可簽到 · 尚餘 45 分鐘`) to provide clear temporal urgency?_
3. _Could tapping "前往掃描" seamlessly transition straight to the camera viewfinder with zero layout stutter?_
