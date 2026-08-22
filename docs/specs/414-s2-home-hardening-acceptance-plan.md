# S2-HARDEN-HOME — Home fallback/overlay/copy hardening

**Ticket:** #414
**Authority:** Production-hardening reconnaissance (harden pass) on `web/app/home/page.tsx`
**Blocked-by:** None
**Status:** Acceptance trace written before implementation

## Contract under test

Home's dual-load strategy (`/api/v1/home` with a client-reconstructed fallback)
stops burning a doomed second request wave on authentication failures. The
announcement detail overlay becomes a real navigable state: the phone
hardware/gesture back button closes it instead of leaving `/home`. The
enrolled-event card never renders an empty geometry wrapper when every fact
row is absent. The greeting date carries a machine-readable timestamp. The
static venue-card placeholder (documented intentional in
`.impeccable/audit-s2-participant.md` P2-06) is annotated for future CMS
wiring but its behavior is unchanged.

## Acceptance trace

| ID | Given | When | Observable result |
| --- | --- | --- | --- |
| HOME-01 | `/api/v1/home` responds 401 | Home mounts | No `listParticipantCatalog`/`getParticipantProgramDetail` fallback requests fire; `loadState` goes straight to `"error"`. |
| HOME-02 | `/api/v1/home` responds with a network failure or 5xx | Home mounts | The existing catalog-reconstruction fallback still runs unchanged (preserves current safety-net behavior). |
| HOME-03 | Announcement card is visible and clicked | Overlay opens | A new history entry is pushed; browser back (or the in-app back button) closes the overlay and returns to `/home` without leaving the page. |
| HOME-04 | Enrolled event has null `startsAt`, `endsAt`, and `location` | Home renders the event card | No empty `.eventDetails` wrapper is present in the DOM. |
| HOME-05 | Home renders | Inspect the greeting `<time>` | It carries a `dateTime` attribute equal to today's ISO date. |
| HOME-06 | Any announcement | Detail view renders | `venueCard` content and structure are unchanged (documented placeholder, not a defect); a `// TODO(CMS)` comment is present at the JSX site. |

## Evidence required

- Component tests cover the 401-vs-network/5xx fallback branch split and the
  overlay history push/pop.
- Existing Home API and navigation/origin tests remain green; no backend
  contract change.
