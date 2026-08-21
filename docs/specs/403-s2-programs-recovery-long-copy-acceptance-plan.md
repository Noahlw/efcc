# S2-INT-PROG-ERR / WRAP — Programs recovery and long-copy

**Ticket:** #403
**Authority:** `docs/specs/396-s2-participant-hardening-and-design-integration.md`
**Blocked-by:** None
**Status:** Acceptance trace written before implementation

## Contract under test

The participant Programs catalog keeps forbidden access distinct from recoverable
transport/server failures. A forbidden authenticated catalog response offers only
the canonical `/home` escape; it never retries or follows an arbitrary return URL.
Recoverable failures preserve the active query/filter state and expose Retry.
Long CJK and unbroken Latin/URL-like titles and secondary values wrap within Home
and Programs cards without horizontal overflow or displaced controls. True-empty,
filtered-empty, and their existing clear actions remain semantically distinct.

## Acceptance trace

| ID | Given | When | Observable result |
| --- | --- | --- | --- |
| ERR-01 | Authenticated participant catalog receives 403 | Render the Programs boundary and activate recovery | Forbidden copy is distinct; `返回首頁` targets `/home`; Retry is absent; no arbitrary return URL or auth-surface redirect is used. |
| ERR-02 | Catalog request fails with network/5xx | Render the Programs boundary, with query/filter state active | Recoverable copy and Retry remain visible; retry reloads without clearing the query or filter. |
| WRAP-01 | Home card or Programs directory row contains long CJK and unbroken Latin/URL-like values | Render at 320/375/390/414/799/800/1440px | Text remains readable and wraps; no horizontal scrolling, clipping, chevron displacement, or broken search/filter controls. |
| EMPTY-01 | Catalog has no programs or has programs but active query/filter matches none | Render the catalog | True-empty and filtered-empty copy remain distinct; the existing clear action clears query/filter accurately. |
| FOCUS-01 | Forbidden or recoverable error is rendered or retried | Load state and activate recovery | The boundary state retains its focus target and keyboard-visible action behavior. |

## Evidence required

- Component tests cover forbidden Home escape, recoverable Retry with preserved query/filter state, focus, true-empty versus filtered-empty copy, and long-copy DOM fixtures.
- Local Playwright coverage asserts observable recovery, wrapping, search/filter controls, no horizontal overflow, and the seven required widths against local Worker/D1 fixtures.
- Existing Worker/API authorization tests remain green; no authorization policy or arbitrary return URL is introduced.
