# S2-INT-HOME-WRAP — Home long-copy hardening

**Ticket:** #404
**Authority:** `docs/specs/396-s2-participant-hardening-and-design-integration.md`
**Blocked-by:** None
**Status:** Acceptance trace written before implementation

## Contract under test

Home keeps its accepted structural loading skeleton and truthful ready, empty,
and error states while treating CMS/member-provided strings as untrusted length.
Event titles, program names, announcement summaries, descriptions, and detail
copy wrap naturally at narrow and breakpoint widths. No line clamp, clipping,
horizontal overflow, or hidden-copy shortcut is introduced. Icons, chevrons, and
primary actions remain visible and usable.

## Acceptance trace

| ID | Given | When | Observable result |
| --- | --- | --- | --- |
| WRAP-01 | Enrolled event has long CJK/Latin title, program name, location, and time text | Render Home | Event card text wraps within the card; event icon and primary action remain visible; no shell-content overflow. |
| WRAP-02 | Announcement has long title and URL-like summary; Explore program has long name and description | Render Home populated state | Announcement and Explore cards wrap full values; chevrons remain inside cards; no text is clipped or line-clamped. |
| WRAP-03 | Announcement detail contains long title/summary and venue values | Open announcement detail | Detail copy wraps without horizontal scrolling or displaced external/back controls. |
| RESP-01 | Populated Home contains long values | Render at 320/375/390/414/799/800/1440px | `#shell-content` and each card/text outlet remain overflow-free; controls retain usable bounds and keyboard focus. |
| STATE-01 | Home projection is loading, ready, empty, or error | Render each state | Existing structural skeleton, truthful empty state, error Retry, and ready content remain distinct; no timer hint or fake content is introduced. |

## Evidence required

- Component tests cover long event/program/announcement values, detail values,
  visible controls, and the existing loading/empty/error distinctions.
- Local Playwright coverage asserts shell-content/card/text geometry, no horizontal
overflow, control bounds, and the seven required widths against local fixtures.
- Existing Home API and navigation/origin tests remain green; no backend or CMS
schema change is introduced.
