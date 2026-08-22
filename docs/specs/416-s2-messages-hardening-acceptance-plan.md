# S2-HARDEN-MESSAGES — Messages back-navigation and error-state hardening

**Ticket:** #416
**Authority:** Production-hardening reconnaissance (harden pass) on `web/lib/messages-panel.tsx`
**Blocked-by:** None
**Status:** Acceptance trace written before implementation

## Contract under test

Returning from a message detail to the list consumes exactly the history
entry the list-to-detail navigation pushed, so the native browser back button
never appears "stuck" on a duplicate `/messages` entry. The error state keeps
the same page header every other state shows. The list-load request carries
the same stale-response guard already used by the sibling Notices panel.

## Acceptance trace

| ID | Given | When | Observable result |
| --- | --- | --- | --- |
| MSG-01a | User navigated list -> detail via a row click in this session | User clicks the in-page back control | Exactly one native browser back press (after the in-app back) returns to wherever preceded `/messages`; no duplicate `/messages` entry remains. |
| MSG-01b | User opened `/messages?content=<id>` as a direct/first navigation in this tab (no prior list view shown) | User clicks the in-page back control | Falls back to the existing `replaceState`-to-list behavior (unchanged) since no internal list history exists to return to. |
| MSG-02 | The announcement list fetch fails | Error state renders | `<header>` with `教會消息` title and `messagesLead` is present, matching the ready/empty/not-found states. |
| MSG-03 | A slow initial load is in flight | User clicks Retry before the first response resolves | Only the latest request's result is applied; the stale response is discarded. |

## Evidence required

- Component tests cover the internal-vs-direct-navigation back branch and the
  request-version guard.
- Existing Messages intent/malformed/empty/error tests remain green.
