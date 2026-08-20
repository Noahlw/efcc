# Impeccable Design Critique: Program Detail (Pending / 待審批 Enrollment State)

Method: single-agent (Assessment A: Design Review · T5A_PDPendingA) Target: `web/lib/programs/participant-program-detail.tsx` (`/programs` -> `E2E_DEMO_青年團契`) Reference: `design_export/participant/program-detail.html` Viewport: 390x844 (Mobile) Role/State: Member (`E2E_member`), Pending Enrollment (`待審批`)

---

## Design Health Score

| # | Heuristic | Score | Key Issue |
| --- | --- | --- | --- |
| 1 | Visibility of System Status | 2/4 | Explanatory pending text ("申請已送出，等待課程負責人處理。") is partially occluded by the floating sticky action bar. |
| 2 | Match Between System and Real World | 3/4 | Church-ops terminology is solid, but mixes "待審批" (badge) with "待處理" (history/body), and withdrawal is phrased as "取消申請" instead of "撤回申請". |
| 3 | User Control and Freedom | 3/4 | Back button `< 課程` functions smoothly; modal allows dismissal, but modal buttons ("取消申請" vs "取消") create semantic ambiguity. |
| 4 | Consistency and Standards | 2/4 | Inconsistent terminology between catalog status pill ("待審批") and detail history ("待處理"); modal action pair creates conflicting "取消" verbs. |
| 5 | Error Prevention | 3/4 | Confirmation dialog effectively prevents accidental withdrawal; autofocus on dismiss button prevents hasty destructive confirmation. |
| 6 | Recognition Rather Than Recall | 3/4 | Request history timestamp is clear ("8月20日"), though details on who or what was requested are omitted. |
| 7 | Flexibility and Efficiency of Use | 3/4 | Fast one-handed mobile drill-down and immediate back-navigation. |
| 8 | Aesthetic and Minimalist Design | 2/4 | Detail view is framed inside the catalog container with redundant H1 "課程" header and double card border; sticky action bar overlaps content. |
| 9 | Help Users Recognize, Diagnose, and Recover from Errors | 3/4 | Modal confirmation copy is reassuring ("你仍可在課程接受報名期間重新提交。"); offline handling has dedicated notice banners. |
| 10 | Help and Documentation | 3/4 | Clear, concise inline status copy guiding the applicant on expected next steps. |

**Total Score: 27/40** (Rating: Acceptable / Good boundary — 67.5%)

---

## Design Specificity Verdict

**LLM Assessment**: The visual language faithfully respects the design system tokens documented in `DESIGN.md` (Cinnabar Red `#9c302c`, Charcoal Ink `#171a1d`, Off-White surface `#f4f5f3`, system Chinese sans-serif stack). The pending state communicates calm, civic restraint rather than consumer SaaS anxiety.

However, the screen suffers from an architectural presentation flaw: rather than transitioning to a dedicated, dignified "Program Detail" page (as established in `design_export/participant/program-detail.html`), the detail view is rendered inside the directory's `.boundary` container. This leaves a redundant catalog header ("課程 / 尋找合適的課程，查看聚會及報名狀態。") sitting above the detail back button. Visually, this feels like an in-place modal expansion rather than a purposeful church program dossier.

Furthermore, a severe CSS positioning flaw in the floating sticky action bar (`.stickyActionBar`) causes the action bar background and button to directly overlay and cut off the descriptive status text ("申請已送出，等待課程負責人處理。"), breaking visual craftsmanship on standard mobile viewports (390×844).

---

## Overall Impression

The Pending state handles state transitions cleanly and provides a safe, confirmed withdrawal flow, but is let down by two prominent visual defects: the sticky action bar overlapping the status description at the bottom of the viewport, and the redundant catalog page header framing the top of the detail screen. Resolving these layout issues and harmonizing the copy ("待審批" vs "待處理", "撤回申請" vs "取消申請") will immediately elevate this screen to full civic excellence.

---

## What's Working

1. **Reassuring Confirmation Dialog**: When tapping "取消申請", the system does not immediately revoke the request. It displays a focused dialog explaining _"你仍可在課程接受報名期間重新提交。"_, preserving user confidence and preventing accidental taps.
2. **Clear Back-Navigation Rhythm**: The `< 課程` back button is prominent (≥44px touch target) and positioned right at the top left of the detail area, making multi-level navigation effortless on mobile.
3. **Clean Civic Color Hierarchy**: The pending status pill (`待審批`) uses a muted neutral/warm tone rather than an aggressive warning yellow, reflecting the peaceful, administrative nature of church enrollment.

---

## Priority Issues

### [P0] Sticky Action Bar Overlaps Pending Status Copy

- **What**: The `.stickyActionBar` element containing the "取消申請" button floats directly on top of the "報名" section's paragraph texts (`待處理` and `申請已送出，等待課程負責人處理。`).
- **Why**: `participant-enrollment.tsx` renders the explanation paragraphs in normal flow followed immediately by `.stickyActionBar`. Because the parent article lacks sufficient bottom padding (`calc(sticky_height + safe-area)`), the floating action bar covers the text on standard 390px mobile screens.
- **Fix**: Add a dedicated content spacer / padding to `.eventsPanel` or `.programDetail` equal to the sticky bar's height, or integrate the helper copy into a clean info card above the sticky boundary.

### [P1] Redundant Directory Header Above Program Detail

- **What**: Navigating into a program still displays the top directory header: `<h1>課程</h1>` with lead paragraph `尋找合適的課程，查看聚會及報名狀態。` above the back button.
- **Why**: `programs-boundary.tsx` preserves the outer boundary header when rendering `ParticipantProgramDetail`. In the design export (`program-detail.html`), the detail view replaces the catalog header entirely with a top bar `課程詳情` and promotes the program title to the main `<h1>`.
- **Fix**: Hide or replace `.boundaryHeader` when a specific `programId` is active, allowing the program title `E2E_DEMO_青年團契` to serve as the primary page heading.

### [P2] Inconsistent Status & Action Terminology

- **What**: The interface switches between three different terms for the pending state:
  1. Directory badge & Detail header badge: **`待審批`** (Pending Approval)
  2. History list & Enrollment section lead: **`待處理`** (Pending Processing)
  3. Action button: **`取消申請`** (Cancel Application)
- **Why**: `programs.ts` / `COPY.programs` uses disparate string constants across the badge helpers and enrollment history builders. In Cantonese church operations, "Pending Approval" is `待審批`, and withdrawing a pending application before review is `撤回申請` (whereas `取消報名` applies to active enrollments).
- **Fix**: Standardize on `待審批` for all status displays, and rename the action button to `撤回申請` to clearly distinguish withdrawing a request from cancelling an approved membership.

### [P2] Ambiguous Modal Confirmation Button Pair ("取消申請" vs "取消")

- **What**: In the confirmation dialog, the destructive button is labeled **`取消申請`** (Cancel Request) and the dismiss button is labeled **`取消`** (Cancel).
- **Why**: Both buttons start with the same verb `取消`, creating cognitive friction and mis-tap risk for users trying to dismiss the dialog.
- **Fix**: Rename the dismiss action to `返回` (Back / Keep Request) and the confirmation action to `確認撤回` (Confirm Withdrawal).

---

## Persona Red Flags

### Sam (Accessibility-Dependent User)

- **Heading Level Inversion**: The page renders `<h1>課程</h1>` (the general catalog heading) above `<h2>E2E_DEMO_青年團契</h2>`. Screen reader users navigating by landmarks/headings hear the generic category title first rather than their selected program name.
- **Duplicate Cancel Labels**: Screen reader announcements for the modal buttons read "取消申請, button" and "取消, button", creating disorientation for users relying on synthesized speech.

### Casey (Distracted Mobile User)

- **Bottom Obscuration**: While walking or holding the phone one-handed, Casey sees only the floating button "取消申請" and misses the obscured explanation that the application was already sent and is awaiting leader review.
- **Close Button Confusion in Modal**: The two stacked buttons ("取消申請" on top in cinnabar red, "取消" below in white outline) with identical starting characters risk an accidental withdrawal when trying to cancel the modal.

---

## Minor Observations

- The empty schedule state text (`目前沒有即將進行的活動。`) is clear and muted, appropriately signaling that no sessions are currently scheduled for this one-off program.
- Focus outline on the program title (`outline: 3px solid #176a87`) is helpful for keyboard accessibility upon navigating into the view.
- The history list (`你的報名紀錄`) neatly formats the date (`8月20日`), though adding a subtle bullet or status dot (as seen in `program-detail.html`) would improve visual scanability.

---

## Questions to Consider

1. Should the Program Detail view take over the entire `<main>` shell surface (as in `program-detail.html`) instead of being wrapped in the `.boundary` card?
2. Would replacing "取消申請" / "取消" with "撤回申請" / "返回" make the member's intent unmistakable in both Cantonese and standard Chinese?
3. Should the "下一次聚會" hero card render an explicit empty card state or collapse cleanly when no upcoming events exist?
