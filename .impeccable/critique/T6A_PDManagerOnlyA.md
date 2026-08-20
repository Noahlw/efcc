Method: dual-agent (A: T6A_PDManagerOnlyA · B: pending)

### Heuristics Scoring Guide

| # | Heuristic | Score | Key Issue |
| --- | --- | :-: | --- |
| 1 | Visibility of System Status | 3 | 「由同工安排」badge and locked note clearly state the restricted mode, but lacks visual hierarchy distinction between informational status and actionable guidance. |
| 2 | Match Between System and Real World | 4 | Copy reflects church operational reality accurately (同工安排, 聚會時間表, 下一次聚會). |
| 3 | User Control and Freedom | 3 | Back navigation is prominent and works cleanly; absence of action is correct for restricted enrollment, though no contact/inquiry escape hatch is provided. |
| 4 | Consistency and Standards | 4 | Consistent typography, border styles, icon usage, and badge shapes matching the Civic Minimal design system tokens. |
| 5 | Error Prevention | 4 | Completely eliminates false submissions by removing the primary action button entirely for non-eligible members. |
| 6 | Recognition Rather Than Recall | 3 | Schedule and next meeting details are visible, but non-enrolled members cannot see event details due to enrollment gating. |
| 7 | Flexibility and Efficiency of Use | 3 | Clean and linear mobile reading experience; lacks deep shortcuts but appropriate for read-only informational detail. |
| 8 | Aesthetic and Minimalist Design | 3 | Off-white civic surface and neutral typography are well balanced; the manager-only notice line feels slightly orphaned at the bottom. |
| 9 | Help Users Recognize, Diagnose, and Recover from Errors | 3 | Static notice explains why self-enrollment is absent, though does not provide next steps if a member believes they should be enrolled. |
| 10 | Help and Documentation | 3 | Self-explanatory copy; could benefit from a short note clarifying which ministry team manages assignments. |

**Total Score: 33/40** (Rating: Good — 82.5%)

---

### Design Specificity Verdict

**LLM assessment**: The Program Detail view in the `ManagerOnly` (由同工安排) state is strongly rooted in the EFCC church management domain. Rather than falling into the SaaS trap of displaying disabled grey buttons with tooltips or generic "Contact Admin" prompts, the screen leans into the "Official Ordinance" (Variant A: Official Civic Minimal) aesthetic. The neutral badge (`由同工安排`), paired with the clear informational note (`此課程由同工安排參加`), correctly communicates that enrollment is curated by ministry staff without creating confusion or false affordances.

However, compared to the active enrolled state shown in `design_export/participant/program-detail.html`, this restricted view lacks a dedicated container or explanatory callout for the restriction. In the prototype reference, the action area features a sticky bar at the bottom; in the live `ManagerOnly` state, the action bar is intentionally absent and replaced with a plain `<p className={styles.emptyLine}>` note. While semantically clean, this leaves the bottom of the long schedule list visually unresolved.

---

### Overall Impression

The restricted `ManagerOnly` state functions cleanly, honestly, and without deceptive affordances. It respects church operational boundaries by hiding self-enrollment controls. The primary opportunity is elevating the restriction notice into a clear civic status callout rather than an unstyled bottom paragraph.

---

### What's Working

1. **Clean Status Pill & Hierarchy**: The top status badge immediately flags `由同工安排` with neutral styling, preventing any initial assumption that the program is open for direct member registration.
2. **Schedule Transparency**: Members can still inspect the full curriculum schedule, future meeting dates, and locations, allowing them to plan their calendar even if placement is handled by ministry leaders.
3. **No Phantom CTAs**: The absence of disabled buttons prevents tapping frustration on touch devices.

---

### Priority Issues

- **[P2] Visual Weight of Restriction Note**:
  - _What_: The restriction copy `此課程由同工安排參加` renders as a standalone text line at the very bottom of the page, below all schedule events.
  - _Why_: On longer programs with many scheduled dates, users may scroll past the entire schedule before seeing why there is no enrollment button, or miss the explanation entirely.
  - _Fix_: Wrap the manager-only explanation into an informational banner near the header or within a styled civic notice card at the bottom.

- **[P3] Missing Ministry Contact Context**:
  - _What_: The page states that staff arrange participation, but does not indicate _which_ department or ministry team oversees it (e.g., 崇拜事奉團隊).
  - _Why_: Members who wish to serve or join have no guidance on who to speak with after Sunday service.
  - _Fix_: Display the department name alongside the enrollment mode notice or in the metadata summary.

- **[P3] Secondary Event Inspection Gating**:
  - _What_: The "查看聚會詳情" button is hidden because `canOpenEventDetail` requires active enrollment or management rights.
  - _Why_: While non-enrolled members cannot check in, they might benefit from viewing the full description/speaker details of individual open lectures.
  - _Fix_: Ensure read-only event summaries can be tapped if the event is marked public/discoverable.

---

### Persona Red Flags

- **Sam (Accessibility-Dependent)**:
  - Linear screen reader navigation must traverse the entire list of scheduled meetings before reaching the notice explaining why enrollment is unavailable. The status badge at the top helps, but an explicit alert or note block upfront would improve screen reader orientation.

- **Casey (Distracted Mobile User)**:
  - On a 390px mobile viewport, the user lands on the page expecting a sticky bottom action bar (as seen on open programs). Finding empty white space at the bottom might feel like a loading glitch unless they notice the explanatory text.

---

### Minor Observations

- The back button (`EventFactIcon name="back"`) provides consistent navigation back to the program directory.
- Date and time formatting rigorously follows Church Time (Hong Kong GMT+8) standards.
- Spacing between the schedule list and the bottom notice adheres to the 8px/12px/24px design system grid.

---

### Questions to Consider

1. Would placing an informational callout immediately below the program description help set expectations before the user reviews the schedule?
2. Should programs marked `ManagerOnly` provide an "Inquire" or "Express Interest" secondary action, or is pure manual assignment preferred by ministry policy?
