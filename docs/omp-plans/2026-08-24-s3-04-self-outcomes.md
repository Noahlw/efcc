# S3-04 Self Check-In Confirmation and Outcomes Acceptance Trace

> Written before the S3-04 implementation commit. This trace is the observable gate for #438.

## Authority and baseline

- Ticket: #438 — S3-04: Complete self check-in confirmation and outcomes.
- Parent spec: `docs/specs/370-s3-participant-guest-check-in.md`.
- Lower layer: `feat/s3-05-guest-checkin` @ `f7980c817e5ff315113c8c7bd044e6333aa4bfbf`.
- Runtime gate: local Worker/D1 at `http://127.0.0.1:8787`; disposable `E2E_` fixtures only.

## Observable acceptance cases

| ID | Setup and action | Observable result | Evidence seam |
| --- | --- | --- | --- |
| SELF-01 | Resolve a credential to exactly one open Event. | A focused confirmation surface shows the resolved program/Event/time/location before any self attendance mutation. | `self-check-in-panel.test.tsx`, attendance D1 E2E |
| SELF-02 | Resolve a credential to multiple open Events. | A semantic chooser presents every candidate, supports keyboard/focus interaction, and selecting one leads only to that Event's confirmation. | self component test, attendance D1 E2E |
| SELF-03 | On an ambiguous confirmation choose `不是這個聚會`; on a single-event confirmation choose it. | Ambiguous flow returns to the chooser; single-event flow returns to camera-first entry; neither path writes attendance. | self component/E2E + roster/API no-write assertion |
| SELF-04 | Confirm a valid enrolled self check-in. | Existing self API writes once and renders the approved success result with `返回首頁` and `再次簽到` navigation. | self component test, attendance D1 E2E |
| SELF-05 | Repeat the same self check-in. | Duplicate is a quiet neutral result, exposes no attendance identifier, and creates no second active row. | self component/Worker/E2E assertions |
| SELF-06 | Exercise future/not-open, cancelled, forbidden, and not-enrolled resolutions/submissions. | Each outcome remains distinct, actionable, in-flow, and non-blank; not-enrolled `查看課程詳情` targets the resolved Program ID. | self component tests, attendance D1 E2E, Worker contract tests |
| SELF-07 | Force a recoverable self submit failure and retry rapidly. | Inline error appears, focused `重試簽到` retries the same Event, controls expose `aria-busy`, and duplicate clicks cannot create extra writes. | self component/E2E and existing Worker tests |
| SELF-08 | Exercise phone widths 320/375/390/414/799/800/1440 and the local Worker. | No horizontal overflow or clipped outcome/confirmation controls; camera/fallback boundary remains unchanged; all existing attendance authorization/audit/window/idempotency contracts remain intact. | responsive gate, focused attendance E2E, diff scope |

## Required commands

```sh
pnpm typecheck
pnpm --dir web typecheck
pnpm --dir web test
pnpm --dir web test:components
pnpm test:shell-responsive
pnpm exec playwright test --config tests/e2e/attendance-d1.config.ts --grep "D member|D2|D4|D5|D6|D7|D8|H member"
```

## Scope boundary

This trace authorizes self confirmation/result/outcome presentation and its tests only. It does not authorize Worker/API/schema changes, guest check-in changes, operator/roster/correction/void/settings work, new routes, or production Google/Cloudflare mutation.
