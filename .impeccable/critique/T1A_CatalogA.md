# Design Critique (Assessment A): Programs Catalog (Populated State)

Method: dual-agent (A: T1A_CatalogA · B: T1B_CatalogB) Target: `/programs` (Populated Participant Catalog) Branch/Worktree: `feat/389-s2-05-program-detail` (`/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/stack-385-389`) Design Spec: `design_export/participant/programs.html` Design System: Variant A: Official Civic Minimal (`DESIGN.md` / `PRODUCT.md`) Evaluator: Assessment A Subagent (Design Director Review)

---

## Design Health Score

| # | Heuristic | Score | Key Issue |
| --- | --- | :-: | --- |
| 1 | Visibility of System Status | 4/4 | Prominent status badges (`已參加`, `待審批`, `由同工安排`), live region announcements on catalog load. |
| 2 | Match Between System and Real World | 4/4 | Authentic Hong Kong church terminology (`查經`, `團契`, `由同工安排`, `事奉團隊`), natural Church Time dates (`8月26日（星期三）`). |
| 3 | User Control and Freedom | 3/4 | Quick filter chips and instant search clearing; filter chips cannot be toggled off by re-clicking the active chip (requires clicking "全部"). |
| 4 | Consistency and Standards | 3/4 | Outer `.boundary` container creates an unnecessary card-in-card wrapping on mobile compared to the design export; top banner says `課程與活動` while page title says `課程`. |
| 5 | Error Prevention | 4/4 | Badges proactively communicate status to prevent redundant enrollment submissions; `由同工安排` prevents confusion over absence of self-enrollment CTA. |
| 6 | Recognition Rather Than Recall | 3/4 | Search input lacks a visible `placeholder="搜尋課程"` text attribute, leaving an empty box with only an icon when unpopulated. |
| 7 | Flexibility and Efficiency of Use | 3/4 | Fast client-side keyword and status filtering across name, description, and category. |
| 8 | Aesthetic and Minimalist Design | 3/4 | Restrained civic palette (Variant A) and clean typography, but double-border/double-padding card nesting squeezes mobile horizontal space. |
| 9 | Help Users Recognize, Diagnose, and Recover from Errors | 4/4 | Robust error states with contextual retry action and polite screen reader announcements. |
| 10 | Help and Documentation | 3/4 | Clear introductory lead paragraph (`尋找合適的課程，查看聚會及報名狀態。`) sets expectations immediately. |

**Total Score: 34/40 (85% — Good)**

---

## Design Specificity Verdict

### LLM Assessment

The Programs catalog interface is deeply grounded in the operational context of **中國基督教播道會顯恩堂**. It decisively avoids generic SaaS multi-tenant conventions (no marketing heroes, no pricing tiers, no decorative illustrations) in favor of **Official Civic Minimal** dignity:

1. **Authentic Church Ministry Taxonomy**: Status indicators such as `由同工安排` (arranged by church pastoral staff/co-workers) for invitation-only ministries like worship teams (`敬拜隊訓練`), alongside `已參加` (Active) and `待審批` (Pending Approval), directly mirror Hong Kong church governance rather than generic ecommerce registration.
2. **High-Information Density**: Each catalog card balances high-signal metadata (badge status, ministry title, next gathering date with weekday in Cantonese, and total session count) without cluttering the mobile viewport.
3. **Restrained Color Discipline**: Color is reserved strictly for state and semantic meaning (Green `#2e6b37` for Active, Amber `#8a5b16` for Pending, Neutral Slate `#59636a` for ManagerOnly, Charcoal `#171a1d` for selected filter, Cinnabar `#9c302c` for brand and active dock actions).

**Opportunities for Improvement**:

- **Eliminate Double-Card Nesting**: The outer `.boundary` container encapsulates the page header, search bar, filter chips, and the inner `.participantDirectoryList` inside a large white bordered card with 16px/20px padding. In the reference design (`programs.html`), the title, search bar, and filter chips sit directly on the neutral `#f4f5f3` canvas, and only the program list is enclosed in a white grouped card. This would give the mobile view much-needed breathing room and eliminate redundant nested borders.
- **Restore Search Placeholder**: The `<input>` has `aria-label="搜尋課程"`, but is missing `placeholder="搜尋課程"`. Adding the visual placeholder restores immediate visual affordance.

---

## Overall Impression

The populated Programs catalog is structurally sound, responsive, and respectful of the user's attention. It communicates attendance and enrollment status at a single glance. The typography hierarchy is crisp, and touch targets exceed accessibility guidelines. Refining the outer container nesting to match the cleaner canvas layout of `design_export/participant/programs.html` and adding the missing search placeholder will elevate this screen from good to exceptional.

---

## What's Working

1. **Unambiguous Multi-State Badging**: The distinct color tokens (`--success` green for `已參加`, warm amber for `待審批`, muted slate for `由同工安排`) make scanning multi-program statuses effortless and prevent accidental duplicate registrations.
2. **Rich Secondary Copy Projection**: Providing the exact next gathering date and session count (e.g., `下一次聚會：8月26日（星期三） · 共 12 節`) directly in the catalog row saves members from having to drill down into each program detail just to check when they next meet.
3. **Generous Touch Targets & Smooth Feedback**: Every catalog item has a touch target height of >72px with full-row clickability, subtle hover/focus feedback, and right-aligned chevrons indicating forward navigation.

---

## Priority Issues

### [P1] Missing Visual Placeholder in Search Input

- **What**: The search field at `#programs-catalog-search` renders with an empty text box (`placeholder=""`). Only the magnifying glass icon is visible.
- **Why**: Sighted users, especially first-time members and seniors, rely on placeholder text like `搜尋課程` to understand that the field searches by course title, ministry category, and description.
- **Fix**: Add `placeholder={COPY.programs.catalogSearchLabel}` (`搜尋課程`) to the `<input>` element in `participant-directory.tsx`.

### [P2] Double-Container Framing on Mobile (Card-in-Card Nesting)

- **What**: The entire catalog view (heading, lead copy, search input, filter chips, and list) is wrapped in `.boundary` (`background: #ffffff; border: 1px solid #d6dcde; border-radius: 12px; padding: 1.25rem;`), while the list itself is wrapped in `.participantDirectoryList` (`background: #ffffff; border: 1px solid #d6dcde; border-radius: 10px;`).
- **Why**: On a 390px mobile viewport, the double horizontal padding (page shell padding + outer boundary padding + card padding) compresses the available width for program titles and secondary text, creating an unnecessary boxed-in "dashboard widget" appearance. The design export (`design_export/participant/programs.html`) places the heading, search, and filter chips directly on the `#f4f5f3` page canvas, wrapping only the list in a raised white surface.
- **Fix**: Unbox the participant catalog layout on mobile or adjust `.boundary` when in participant directory mode so the background is transparent with zero border, allowing the title and search/filter controls to sit directly on `--surface`.

### [P3] Header Title Inconsistency (Top Shell Bar vs. Page Heading)

- **What**: The fixed AppShell top header displays `課程與活動` (Programs & Events), whereas the page `<h1>` and the design export display `課程` (Programs).
- **Why**: Subtle terminology divergence between the shell title bar, the bottom navigation label (`課程與活動`), and the page header (`課程`) creates slight cognitive friction regarding whether this surface represents courses alone or combined events.
- **Fix**: Harmonize the copy between the shell and the boundary header, or retain `課程` as the concise section name while clarifying the relationship in the lead description.

---

## Persona Red Flags

### 1. Sam (Accessibility-Dependent / Screen Reader & Low Vision)

- **Strengths**: High contrast text ratios (>7:1 for ink against surface), explicit `aria-label` on each row combining badge, title, and schedule info, and aria-pressed state on filter chips.
- **Red Flags**:
  1. _Missing Visual Placeholder_: Low vision users with partial sight do not see any hint text in the search input box before focusing.
  2. _Single Monolithic Accessible Name_: The entire list row button is given an aggregated string label (`${tag.label} · ${program.name} · ${secondaryCopy}`). While screen readers read the full summary, voice control users targeting specific text on screen (e.g., clicking "E2E_DEMO_成人查經") may experience mismatched target names.

### 2. Casey (Distracted Mobile User / One-Handed Thumb Use)

- **Strengths**: Row touch heights of 72px–134px make one-handed tapping reliable while on the move or in church foyer gatherings.
- **Red Flags**:
  1. _Horizontal Space Compression_: Outer boundary padding (20px) squeezes long program titles onto two lines prematurely on small mobile screens (iPhone SE / 375px–390px).
  2. _Search Position_: Search input is positioned at the top of the viewport outside the easy bottom-third thumb reach zone.

### 3. Jordan (Confused First-Timer)

- **Strengths**: Color-coded badges (`已參加`, `待審批`, `由同工安排`) immediately clarify the user's relationship with each ministry without technical jargon.
- **Red Flags**:
  1. _Empty Search Affordance_: An unlabelled empty input box with only an icon requires guessing whether search accepts teacher names, dates, or keywords.

---

## Minor Observations

- **Filter Chip Toggle**: When a filter chip such as `已參加` is active, clicking it again does not toggle it off back to `全部`; users must explicitly tap the `全部` chip to reset.
- **Management Switch Visibility**: For users with management permissions, the `管理模式` entry card at the bottom of the directory is cleanly separated and does not intrude on the participant catalog flow.
- **Skeleton Loading Alignment**: The 3-row skeleton loader (`.directorySkeletonList`) faithfully matches the 3-row layout of the populated list, preventing layout shift during fetch.

---

## Questions to Consider

1. _Should the search input support instant tag filtering (e.g., typing "團契" or "查經") with auto-suggest chips below the search bar?_
2. _Would displaying an empty count badge on filter chips (e.g., "已參加 (1)", "待審批 (1)") help members immediately know how many ministries they are enrolled in without having to switch tabs?_
3. _Could the outer `.boundary` card framing be removed for all participant-facing views so that participant screens feel like modern mobile native feeds rather than desktop admin forms?_
