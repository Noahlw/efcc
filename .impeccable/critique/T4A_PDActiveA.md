# Design Critique (Assessment A: Design Review) — Program Detail (Active / 已參加)

Method: dual-agent (A: T4A_PDActiveA · B: T4A_PDActiveB) Target: `web/lib/programs/participant-program-detail.tsx` & `web/lib/programs/participant-enrollment.tsx` (Live State: `/programs?program=06256d63-c014-4a5b-b0e4-2dacb7be983d`, Active Enrollment) Comparison: `design_export/participant/program-detail.html` Audience: Church members actively participating in a recurring program (`E2E_member` on mobile viewport 390×844)

---

## Design Health Score

| # | Heuristic | Score | Key Issue |
| --- | --- | :-: | --- |
| 1 | Visibility of System Status | 3/4 | `已參加` badge clearly signals active status, but outer directory header causes contextual confusion |
| 2 | Match Between System & Real World | 3/4 | Authentic HK Church Time and natural terminology, but session title falls back to repeating program slug |
| 3 | User Control and Freedom | 3/4 | Clear `< 課程` back button; confirmation dialog with keyboard escape guards withdrawal |
| 4 | Consistency and Standards | 2/4 | Discrepancy with design ground truth: raw nested cards vs clean modular containers; heading level mismatch |
| 5 | Error Prevention | 3/4 | Destructive "退出課程" action requires explicit modal confirmation defaulting focus to Cancel |
| 6 | Recognition Rather Than Recall | 3/4 | Hero "下一次聚會" card surfaces immediate next date/time; schedule displays all upcoming dates |
| 7 | Flexibility and Efficiency of Use | 2/4 | Long 12-session schedule list forces extensive mobile vertical scrolling without progressive disclosure |
| 8 | Aesthetic and Minimalist Design | 2/4 | Double page header leak (`課程 / 尋找合適...`), triple status repetition, and focus ring glitch on title |
| 9 | Help Users Recognize, Diagnose, & Recover from Errors | 3/4 | Dedicated error boundary with retry CTA and polite screen-reader announcements |
| 10 | Help and Documentation | 3/4 | Clear advisory copy in confirmation dialog explaining re-enrollment requirement |

**Total Score: 27/40 (67.5% — Acceptable, approaching Good)**

---

## Design Specificity Verdict

### LLM Assessment: Grounded Domain Semantics Marred by Container Leaks and List Bloat

The live Program Detail screen in its Active (`已參加`) state embodies the core ethos of **Variant A: Official Civic Minimal**: high-contrast charcoal ink (`#171a1d`) against civic neutral surfaces (`#f4f5f3` and `#ffffff`), precise Hong Kong Church Time date formatting (`8月26日（三）晚上 7:30–8:45`), subtle hairline dividers (`#d6dcde`), and authentic Cantonese terminology (`已參加`, `下一次聚會`, `聚會時間表`, `退出課程`).

However, when compared directly against the design ground truth (`design_export/participant/program-detail.html`), several structural, visual, and ergonomic regressions detract from the intended civic clarity:

1. **Outer Frame Leak (Double Header Hierarchy)**: The detail screen is rendered inside `BoundaryFrame`, which retains the catalog-level heading and lead (`課程` / `尋找合適的課程，查看聚會及報名狀態。`) above the Program Detail view. This forces the program title to become a secondary `<h2>`, consumes ~110px of prime mobile viewport height, and confuses the user's mental model about whether they are in the directory or viewing a specific course.
2. **Session Title Redundancy Glitch**: When recurring events lack custom individual lesson titles, the fallback logic (`eventTitle()`) falls back to the program name (`E2E_DEMO_成人查經`). Consequently, the exact same text is rendered 14 times on the screen: in the main heading, in the "下一次聚會" hero card, and across all 12 schedule list items. In the design export, the hero card clearly reads "第三課聚會" with distinct session numbering.
3. **Triple Status & Redundant Static Enrollment Block**: The active enrollment status is communicated three separate times in close proximity:
   - As the top green badge (`已參加`).
   - In the timeline history (`已加入 · 8月20日`).
   - In a redundant static section at the bottom (`報名` / `已加入` / `你目前已加入此課程。`) right above the "退出課程" button. The design export omits this static redundancy entirely in favor of a clean floating action bar.
4. **Unbounded Schedule List Scrolling**: A 12-session recurring program renders all 12 sessions in full vertical sequence without folding, pagination, or progressive disclosure (e.g. "顯示其餘 8 節聚會"). On a 390×844 mobile screen, this creates an unbroken scroll wall of ~650px before reaching the enrollment history and action bar.
5. **Autofocus Visual Artifact on Mount**: The programmatic focus on `#program-detail-title` on load highlights the heading with a heavy rectangular focus outline (`3px solid #176a87`), creating visual roughness for touch users on mobile.

---

## Overall Impression

The Active Program Detail screen reliably surfaces key functional data: active enrollment status, next gathering time, full recurring schedule, and withdrawal capability. However, hosting the page inside the parent directory header, repeating the program name as every session title, and rendering an uncollapsed 12-item list pushes the interface into an overwhelming vertical scroll with redundant headings, diverging from the clean, structured elegance of the static design prototype.

---

## What's Working

1. **Prominent "下一次聚會" Hero Fact Card**: The dedicated hero card co-locates the monospace eyebrow (`下一次聚會`), event date/time with a clean SVG calendar icon, and a direct full-width CTA (`查看聚會詳情`). This allows active members to immediately answer "When is my next class?" without digging through the full schedule.
2. **Robust Error Prevention on Withdrawal**: The destructive "退出課程" action triggers an accessible HTML `<dialog>` confirmation modal. The dialog clearly explains the consequence (`退出後如需再參加，需重新報名。`) and appropriately sets initial focus on the "取消" button, preventing accidental exits.
3. **High-Contrast Civic Typography and Palette**: The green `已參加` badge (`#2e6b37` on `#eef4ef` with `#b9cfbe` border) conforms accurately to the design system's success tokens, standing out crisply against the neutral surface.

---

## Priority Issues

### [P1] Boundary Frame Header Leaks Directory Context into Detail View

- **What**: The outer `BoundaryFrame` renders `<h1>課程</h1>` and `尋找合適的課程，查看聚會及報名狀態。` with a divider line above the Program Detail card.
- **Why**: Wastes ~110px of vertical space on mobile and degrades the program title from an authoritative `<h1>` into an `<h2>`. The user is on a detail page; catalog-browsing instructions are irrelevant and confusing.
- **Fix**: In `programs-boundary.tsx`, conditionally suppress the `BoundaryFrame` header and lead when an active program or event intent is selected, matching `program-detail.html`.

### [P1] Session Title Fallback Causes 14× Program Name Repetition

- **What**: When event records lack individual lesson names, `eventTitle()` returns `program.name`. This prints `E2E_DEMO_成人查經` in the hero card and inside all 12 list items in `聚會時間表`.
- **Why**: Destroys scannability. Members cannot distinguish individual lessons, and the UI appears repetitive and robotic.
- **Fix**: Update `eventTitle()` to generate numbered session descriptors (e.g. `第 1 課聚會`, `第 2 課聚會`) or fall back to the formatted date when individual titles are absent.

### [P2] Long 12-Session Schedule List Lacks Progressive Disclosure

- **What**: All 12 recurring sessions are rendered in an unbroken list, pushing enrollment history and management actions far off-screen.
- **Why**: Forces mobile users to scroll through 12 identical-looking date rows on every visit. Most members only need to see the next 2–3 upcoming sessions.
- **Fix**: Implement progressive disclosure: show the next 3–4 upcoming sessions by default with an expand/collapse toggle (`顯示全部 12 節聚會`).

### [P2] Redundant Static "報名 / 已加入" Panel Above Sticky Exit CTA

- **What**: A static `<section className={styles.eventsPanel}>` renders `<h3>報名</h3>`, `<p>已加入</p>`, and `<p>你目前已加入此課程。</p>` right above the "退出課程" button.
- **Why**: Information redundancy. The user already saw the green `已參加` badge at the top and the `你的報名紀錄` timeline. The extra static text adds visual clutter without delivering new value.
- **Fix**: Simplify the active state in `EnrollmentAction` to render only the action button within the sticky bar, removing the redundant static text block to match the design export.

### [P3] Autofocus on Mount Leaves Visible Focus Box on Touch Devices

- **What**: `panel.focus()` on `#program-detail-title` activates the `:focus-visible` ring (`outline: 3px solid #176a87`) on the main heading upon initial page render.
- **Why**: Creates an unintended visual artifact that looks like an active text selection or bug to mobile touch users.
- **Fix**: Apply focus programmatically using `{ preventScroll: true }` and style `:focus:not(:focus-visible)` on heading elements to suppress the outline for programmatic jumps while preserving keyboard accessibility.

---

## Persona Red Flags

### 1. Casey (Distracted Mobile User)

- **Profile**: Church member walking into the chapel lobby on Wednesday evening, checking meeting details one-handed on an iPhone.
- **Primary Action**: Find tonight's meeting room and start time, or check in.
- **Red Flags**:
  - **Title Visual Noise**: When scanning the "下一次聚會" card, Casey sees `E2E_DEMO_成人查經` repeated directly under the page title `E2E_DEMO_成人查經`. It takes a few extra seconds to locate the actual time (`晚上 7:30–8:45`).
  - **Excessive Scrolling**: To check enrollment history or manage participation, Casey must scroll past 12 bulky schedule items.
  - **Header Occlusion**: The extraneous `課程 / 尋找合適...` header pushes the hero meeting card halfway down the initial screen.

### 2. Sam (Accessibility-Dependent User)

- **Profile**: Screen reader user (VoiceOver on iOS) navigating program details via rotor headings.
- **Primary Action**: Linear inspection of program description, upcoming schedule, and participation records.
- **Red Flags**:
  - **Hierarchical Inversion**: Sam encounters `H1: 課程`, followed by `H2: E2E_DEMO_成人查經`, followed by four separate `H3` sections (`H3: 下一次聚會`, `H3: 聚會時間表`, `H3: 你的報名紀錄`, `H3: 報名`). The true page topic is demoted to H2.
  - **Repetitive Status Announcements**: Screen readers announce "已參加" (status badge), "已加入" (history row), "報名: 已加入: 你目前已加入此課程。" (enrollment panel). This triple verbosity slows navigation.

### 3. Riley (Deliberate Stress Tester)

- **Profile**: Testing multi-month programs with 20+ recurring sessions and varying enrollment lifecycles.
- **Primary Action**: Verifying layout stability under extreme schedule lengths.
- **Red Flags**:
  - **Unbounded DOM List**: A 30-session discipleship course creates a 1,500px tall page. Without virtualization or list folding, the relationship between the header and the sticky bottom action becomes disconnected.
  - **Missing Timeline Dots**: The enrollment history list in live is rendered as plain text rows (`eventList`), dropping the clear timeline dots (`8px` circular bullets) present in `program-detail.html`.

---

## Minor Observations

- **Back Button Spacing**: In `program-detail.html`, the back button is styled with negative left margin (`margin-left: -8px`) so the text aligns flush with the card margin. In live, the back button has a visible border box (`.programDetailBack`) that looks more like an isolated secondary button than an inline breadcrumb link.
- **Icon Alignment**: In the next meeting card, the SVG calendar icon is slightly misaligned with the multi-line date text when the time range wraps on narrower viewports.
- **Schedule Card Border**: In the design export, `聚會時間表` and `報名記錄` are enclosed in clean white card containers with rounded corners (`10px`). In live, `聚會時間表` has no outer card container and blends into the background.

---

## Questions to Consider

1. _What if recurring schedule lists automatically collapsed after the first 3 sessions, highlighting the active week with a subtle accent indicator?_
2. _Should the back button adapt to the user's referrer (e.g. `< 返回課程目錄` vs `< 返回首頁`) rather than a hardcoded static label?_
3. _Could individual recurring sessions automatically compute dynamic lesson labels (e.g. `第 1 課`, `第 2 課`) when explicit event titles are omitted?_

---

## Ask the User

Based on the findings above, here are three high-impact design directions we can take:

1. **Visual Hierarchy & Header De-duplication**: Suppress the outer `BoundaryFrame` header on detail screens, elevate the program title to `<h1>`, and remove the redundant static "報名 / 已加入" text block.
   - _Option A_: Full clean cutover to match `program-detail.html` (single unified header, flush back link, floating action bar).
   - _Option B_: Retain minimal breadcrumbs (`課程 > E2E_DEMO_成人查經`) while removing the catalog banner.
2. **Schedule Density & Progressive Disclosure**: Optimize the 12-session schedule list for mobile ergonomics.
   - _Option A_: Show the next 3 sessions with a "展開全部 12 節聚會" toggle.
   - _Option B_: Group schedule sessions by month with collapsible month headers.
3. **Session Title & Lesson Formatting**: Fix the robotic 14× title repetition.
   - _Option A_: Auto-generate `第 N 節聚會` for recurring events that lack distinct custom titles.
   - _Option B_: Emphasize the session date and time as the primary row title when custom titles are absent.

---

## Recommended Actions

1. **`$impeccable layout`**: Remove outer `BoundaryFrame` directory header leak when viewing Program Detail and restore the clean top bar structure from `program-detail.html`.
2. **`$impeccable distill`**: Eliminate the redundant static "報名 / 已加入" section in `participant-enrollment.tsx` for Active enrollments, leaving only the clean sticky action bar.
3. **`$impeccable clarify`**: Refactor `eventTitle()` fallback in `participant-program-detail.tsx` to generate numbered lesson descriptors (`第 N 課聚會`) instead of echoing `program.name`.
4. **`$impeccable adapt`**: Add progressive disclosure / folding to `聚會時間表` so lists with >4 sessions do not flood the mobile viewport.

> You can ask me to run these one at a time, all at once, or in any order you prefer.
>
> Re-run `$impeccable critique` after fixes to see your score improve.
