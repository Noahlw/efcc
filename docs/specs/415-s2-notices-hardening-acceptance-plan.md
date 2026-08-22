# S2-HARDEN-NOTICES — Notices mutation-failure and offline hardening

**Ticket:** #415
**Authority:** Production-hardening reconnaissance (harden pass) on `web/lib/notices-panel.tsx`
**Blocked-by:** None
**Status:** Acceptance trace written before implementation

## Contract under test

Mark-all-read failures (offline or server-side) are visible to sighted users,
not only announced to assistive tech. The mutation carries the same
`navigator.onLine` pre-flight guard used elsewhere in the participant surface.
Timestamp parsing never throws on malformed data. Keyboard focus lands on the
current state panel after every load/retry transition. The toolbar wraps
instead of overflowing at narrow widths with an extreme unread count.

## Acceptance trace

| ID | Given | When | Observable result |
| --- | --- | --- | --- |
| NTC-01 | Mark-all-read request fails (network/5xx) | User clicks 全部標示已讀 | A visible `role="alert"` error using `COPY.notices.noticesMarkAllReadError` renders; screen-reader announcement is unchanged. |
| NTC-02 | Device is offline | User clicks 全部標示已讀 | No network request is attempted; the same visible error renders immediately. |
| NTC-03 | A notice has a non-finite/invalid `created_at` | Notices list renders | No `RangeError` is thrown; the row renders with a safe fallback timestamp. |
| NTC-04 | Notices is in the error or loading state | State transitions (e.g. Retry clicked) | Keyboard focus lands on the newly-rendered state container, not `document.body`. |
| NTC-05 | Unread count is very large (e.g. `999+`) | Rendered at 320px | The toolbar wraps to a second line; no horizontal overflow or clipped button. |

## Evidence required

- Component tests cover the visible mark-all-read error, the offline
  pre-flight guard, and the guarded timestamp parser.
- Existing Notices load/retry/origin-navigation tests remain green.
