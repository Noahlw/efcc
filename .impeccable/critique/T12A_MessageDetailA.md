Method: dual-agent (A: T12A_MessageDetailA · B: T12B_MessageDetailB)

# Design Critique: Message Detail View (教會消息詳情)

## Heuristic Scoring (Nielsen's 10)

| # | Heuristic | Score | Key Issue |
| --- | --- | :-: | --- |
| 1 | Visibility of System Status | 3/4 | Loading state is announced via live region, but transition to detail has no skeleton/fade; topbar status lacks hierarchy. |
| 2 | Match Between System and Real World | 3/4 | Clean, respectful church-ops tone; "到達場地" section is hardcoded mock copy regardless of announcement topic. |
| 3 | User Control and Freedom | 4/4 | Back button ("< 教會消息") and browser back navigation properly restore previous context without state loss. |
| 4 | Consistency and Standards | 2/4 | **Double topbar stacking**: AppShell header ("顯恩堂") sits right above `detailTopbar` ("教會消息"), creating visual stutter and duplicate navigation headers. |
| 5 | Error Prevention | 3/4 | Safe ID parsing with fallback; deep link with invalid parameter safely defaults without breaking the UI. |
| 6 | Recognition Rather Than Recall | 3/4 | Clear headline, date badge, and summary; however, external links look like plain text and can blend in. |
| 7 | Flexibility and Efficiency of Use | 3/4 | Clean single-column layout optimized for mobile reading; lacks quick-share or calendar bookmarking. |
| 8 | Aesthetic and Minimalist Design | 3/4 | Civic Minimal aesthetic is respected with calm neutral surfaces, but top spacing feels bloated due to duplicate headers. |
| 9 | Help Users Recognize, Diagnose, and Recover from Errors | 3/4 | Safe fallback to 404 / list when item ID is not found. |
| 10 | Help and Documentation | 3/4 | Contact information for church office mentioned in venue instructions. |

**Total Score: 30/40 (75% · Good)**

---

## Design Specificity Verdict

**Assessment**: The Message Detail view successfully captures the Civic Minimal aesthetic of "The Official Ordinance" (Variant A). It avoids generic marketing fluff and presents pastoral announcements with clean, dignified typography. However, it currently suffers from two major structural discrepancies when compared against the design export (`design_export/participant/message-detail.html`):

1. **Header Stacking & Redundancy**: In the live implementation, `AppShell` renders its standard top header (`顯恩堂`), and immediately below it, `AnnouncementDetail` renders its own 72px `detailTopbar` containing `教會消息`, immediately followed by the back button labeled `< 教會消息`. This triple-declaration of church/message headers wastes ~120px of prime above-the-fold mobile real estate.
2. **Hardcoded Domain Template ("到達場地")**: The `AnnouncementDetail` component renders static venue instructions ("到達場地", "親子室", "訪客接待") under every announcement, regardless of whether the announcement is a spiritual reflection, event notice, or general bulletin.

---

## Overall Impression

A restrained, legible, and respectful document-reading experience that aligns with Hong Kong church operations. The typography is well-scaled, the date tag (`8月20日` in monospace) gives crisp civic identity, and the card layout feels grounded. The chief flaw is redundant layout scaffolding around the top navigation and static boilerplate content in the card body.

---

## What's Working

1. **Monospace Date Badge**: The `ui-monospace` date pill (`8月20日`) establishes an authoritative, timestamped ordinance feel that perfectly aligns with DESIGN.md's Civic Minimal philosophy.
2. **Typography Hierarchy & Legibility**: The clamp-sized title (`clamp(1.65rem, 6vw, 2.2rem)`) and 1.7 line-height paragraph text provide effortless legibility on mobile screens without visual noise.
3. **Clean Back Navigation**: The back button (`< 教會消息`) offers a generous touch target (min-height 44px) and properly reflects the source view context.

---

## Priority Issues (P0–P3)

### [P1] Double Header Stacking & Navigation Clutter

- **What**: The live screen displays the global shell header (`顯恩堂`, 47px), followed by `detailTopbar` (`教會消息`, 72px), followed by `backButton` (`< 教會消息`, 44px).
- **Why**: On a 390px mobile viewport, ~160px is consumed by three separate headers before the user reaches the announcement title. In `design_export/participant/message-detail.html`, the topbar is intended to replace or blend into the shell header rather than stack beneath it.
- **Fix**: Suppress `detailTopbar` when rendered inside `AppShell` on mobile, or merge the back button directly into the shell header slot.

### [P2] Hardcoded Venue Card on All Announcements

- **What**: `AnnouncementDetail` unconditionally renders `<article className={styles.venueCard}><h2>到達場地</h2>...` for every announcement.
- **Why**: Announcements are general bulletins (e.g., devotional notes, holiday schedules, administrative updates). Forcing a 3-bullet venue location list onto every item confuses readers when the message is not an in-person gathering notice.
- **Fix**: Only render the venue card if the announcement payload contains structured venue or gathering metadata, or allow full markdown/body rendering for the announcement content.

### [P3] External Link Visual Prominence & Contrast

- **What**: The external link at the bottom of the card uses `#59636a` (muted ink) with a small icon, making it look like passive metadata rather than an interactive tap target.
- **Why**: Users skimming the announcement may miss registration or livestream links.
- **Fix**: Apply standard link affordance with accent color or a dedicated button-link container meeting WCAG AA contrast and clear tap boundaries.

---

## Persona Red Flags

- **Sam (Accessibility-Dependent / Low Vision)**:
  - The date tag uses a small `0.72rem` (11.5px) font size with letter-spacing. While readable in monospace, low-vision users on mobile may struggle without font scaling.
  - Three nested headings/labels (`顯恩堂` -> `教會消息` -> `< 教會消息` -> `Title`) create excessive screen-reader verbosity when navigating to the main content.
- **Casey (Distracted Mobile User / One-Handed)**:
  - The back button is placed at the top-left edge (`margin-left: -8px`), outside the natural thumb zone on modern tall mobile devices (e.g., iPhone 390x844).
  - The announcement title is pushed down the viewport due to the double header stack, forcing immediate scrolling on smaller screens.
- **Jordan (First-Time Church Attendee)**:
  - Sees "到達場地" with specific room instructions even if the announcement is about an online prayer meeting, creating confusion about where they are expected to go.

---

## Minor Observations

- The bottom dock navigation remains visible and functional, keeping consistent orientation with the rest of the participant app.
- Focus rings on the back button and external links adhere cleanly to `--focus: #176a87`.
- Safe area inset handling (`env(safe-area-inset-bottom)`) is properly integrated into the container padding.

---

## Questions to Consider

1. **Header Unification**: Should detail views (Announcements, Event Detail, Program Detail) adopt a unified minimal shell header with an integrated back button, eliminating page-level duplicate headers entirely?
2. **Content Model Richness**: Should church announcements support rich text / paragraph arrays from the Google Sheet / D1 CMS rather than a fixed summary + venue card template?
