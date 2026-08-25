# S3-03 Scanner Fallback and Account QR Acceptance Trace

> Written before the S3-03 implementation commit. This trace is the observable gate for #436.

## Authority and baseline

- Ticket: #436 — S3-03: Add Scanner fallback methods and Account QR path.
- Parent spec: `docs/specs/370-s3-participant-guest-check-in.md`.
- Lower layer: `feat/s3-02-operator-boundary` @ `3039ef3b852ee58c016482a54774a4ea3a1a2db8`.
- Runtime gate: local Worker/D1 at `http://127.0.0.1:8787`; disposable fixtures only.

## Observable acceptance cases

| ID | Setup and action | Observable result | Evidence seam |
| --- | --- | --- | --- |
| FALLBACK-01 | Member taps `停止掃描` or camera startup fails on phone. | A light fallback surface appears with equal real controls `輸入代碼` and `出示會員 QR`; no method card is present while live. | `self-check-in-panel.test.tsx`, device-proof E2E |
| FALLBACK-02 | Select `輸入代碼`. | A single focused form shows persistent `六位數代碼`, placeholder `例如 482913`, numeric input mode, `[0-9]{6}` pattern, validation and `繼續`/busy semantics. | `self-check-in-panel.test.tsx`, attendance E2E |
| FALLBACK-03 | Submit invalid or offline code. | The code remains actionable, an inline Traditional Chinese error is announced, and no attendance write occurs. | self panel component/E2E and resolve API assertions |
| FALLBACK-04 | Select `出示會員 QR`. | Navigation goes to the existing Account Section `/profile`, where the existing Member QR is shown; no new in-flow QR route/card/waiting state exists. | profile component/E2E and navigation DOM |
| FALLBACK-05 | Open Account from Scanner with `from=scanner` intent and return. | Account exposes a safe first-party `返回掃描` link to `/scanner`; it does not trust arbitrary client return URLs or change authorization. | profile component/E2E |
| FALLBACK-06 | Exercise stop/failure/retry/manual transitions. | Heading focus and Traditional Chinese live announcements remain correct; controls are at least 44px and fallback rows remain one full-width control per row. | component suite, responsive gate |

## Required commands

```sh
pnpm typecheck
pnpm --dir web typecheck
pnpm --dir web test
pnpm --dir web test:components
pnpm test:shell-responsive
pnpm exec playwright test --config tests/e2e/attendance-d1.config.ts --grep "D4|D5|D6|D7"
```

## Scope boundary

This trace does not authorize S3-04 outcome redesign, S3-05 guest rebuild, new attendance APIs/tables, a Member QR route, S7 roster/correction/void/settings work, or production Google/Cloudflare mutation.
