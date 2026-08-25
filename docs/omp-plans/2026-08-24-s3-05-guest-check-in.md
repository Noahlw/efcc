# S3-05 Guest Check-In Completion Acceptance Trace

> Written before the S3-05 implementation commit. This trace is the observable gate for #437.

## Authority and baseline

- Ticket: #437 — S3-05: Complete Guest Check-In form and completion.
- Parent spec: `docs/specs/370-s3-participant-guest-check-in.md`.
- Lower layer: `feat/s3-03-scanner-fallback` @ `d1989b859a737cd7633363e78e4d359e81f98273`.
- Runtime gate: local Worker/D1 at `http://127.0.0.1:8787`; disposable `E2E_` fixtures only.

## Observable acceptance cases

| ID | Setup and action | Observable result | Evidence seam |
| --- | --- | --- | --- |
| GUEST-01 | Open `/guest-check-in` with camera APIs available or unavailable. | One light form visibly contains `聚會代碼`, `姓名`, and `電話號碼`; no camera component is rendered and `getUserMedia` is never called. | `attendance-panel.test.tsx`, guest E2E DOM/request assertions |
| GUEST-02 | Enter an exactly-one-open-event credential, name, and valid phone; press `確認簽到`. | The single action resolves the Event and submits through the existing guest API; no intermediate second submit is required; the real completion card shows `訪客簽到完成`, a period-derived lead, and `完成`. | `attendance-panel.test.tsx`, local guest E2E |
| GUEST-03 | Enter a credential resolving to more than one open Event and press `確認簽到`. | The visible form data is retained, an explicit chooser appears, and selecting one Event submits exactly that Event; the visitor cannot be checked into an implicit first choice. | component test, attendance D1 E2E |
| GUEST-04 | Enter a credential matching zero open Events. | An actionable inline Traditional Chinese error is shown, the form remains usable, and no guest attendance POST is made. | component test, attendance D1 E2E |
| GUEST-05 | Submit missing fields or an invalid phone. | Validation copy is inline/live-announced, focus remains useful on the invalid field, typed values are preserved, and no invalid guest write is accepted. | component test, focused E2E |
| GUEST-06 | Submit a phone already active for the selected Event, including a normalized equivalent. | The result is a neutral duplicate completion state; no attendance identifier is displayed or exposed. | `attendance-panel.test.tsx`, worker/E2E response and DOM assertions |
| GUEST-07 | Use the member-login link before submission; exercise repeated guest submission, rate limiting, and audit paths. | Existing `/scanner` credential handoff, normalized-phone idempotency, rate limiting, authorization, and audit behavior remain unchanged; no API/schema/backend edits are introduced. | existing worker tests, attendance D1 E2E, diff scope |
| GUEST-08 | Use deterministic disposable fixtures: one active exactly-one-open Event and one active Event in a program where the test member is unenrolled. | Guest resolution/check-in is exercised against the exactly-one fixture; the active-unenrolled fixture remains deterministic and member outcome coverage continues to pass. | attendance D1 fixture setup and focused E2E |
| GUEST-09 | Exercise 320px/375px/desktop keyboard paths. | No horizontal overflow; all controls remain reachable with useful heading/result focus and the completion action is operable. | component, responsive, focused E2E checks |

## Required commands

```sh
pnpm typecheck
pnpm --dir web typecheck
pnpm --dir web test
pnpm --dir web test:components
pnpm test:shell-responsive
pnpm exec playwright test --config tests/e2e/attendance-d1.config.ts --grep "A guest|B guest|GUEST|K empty|L invalid|M guest|N guest"
```

## Scope boundary

This trace authorizes the guest presentation/state rebuild and its tests only. It does not authorize backend/API/schema changes, camera UI on `/guest-check-in`, S3-04 self outcomes, S7 roster/correction/void/settings work, new routes, or production Google/Cloudflare mutation.
