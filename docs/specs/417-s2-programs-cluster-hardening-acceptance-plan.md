# S2-HARDEN-PROGRAMS — Programs/Program Detail/Event Detail robustness

**Ticket:** #417
**Authority:** Production-hardening reconnaissance (harden pass) on `web/lib/programs/*`
**Blocked-by:** None
**Status:** Acceptance trace written before implementation

## Contract under test

Programs navigation never pushes a duplicate history entry for an
already-current URL. Enrollment action failures move keyboard focus to the
visible error instead of dropping it to the document body. A stale enrollment
confirm dialog (target changed server-side while open) reconciles the UI
instead of silently no-opping. Long program descriptions and titles wrap
instead of overflowing. Event Detail shows an accessible loading indicator
instead of a blank flash on initial load and every retry, and moves focus to
its recovery panel when one renders.

## Acceptance trace

| ID | Given | When | Observable result |
| --- | --- | --- | --- |
| PGM-01 | A program card is rendered | User double-clicks it rapidly | Exactly one navigation/history entry results; the second click to the identical URL is a no-op. |
| PD-01 | An enrollment submit/withdraw/cancel action fails | Error renders | Keyboard focus moves to the `role="alert"` error output. |
| PD-02 | Program title or description contains a long unbroken token | Rendered at 320px | Text wraps; no horizontal overflow. |
| PD-03 | The withdraw/cancel confirm dialog is open and the target request/enrollment no longer matches current state when confirmed | User confirms | `onRefresh()` runs and the UI reconciles to current server truth instead of silently doing nothing. |
| ED-01 | Event Detail is loading (initial mount or retry) | Rendered before the response arrives | An `aria-busy`/`role="status"` loading indicator renders; no blank flash. |
| ED-02 | Event Detail load fails (404/5xx) | Recovery panel renders | Keyboard focus moves to the recovery panel heading. |

## Evidence required

- Component tests cover the duplicate-navigation guard, the enrollment
  error-focus restore, the stale-confirm reconciliation, and the Event Detail
  loading/error focus states.
- Existing Programs/Program Detail/Event Detail authorization and navigation
  tests remain green; no backend contract change.
