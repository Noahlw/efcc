# S3-02 Operator Mode Boundary Acceptance Trace

> Written before the S3-02 implementation commit. This trace is the observable gate for #435 and does not authorize S7 runtime scope.

## Authority and baseline

- Ticket: #435 — S3-02: Align the Operator mode boundary.
- Parent spec: `docs/specs/370-s3-participant-guest-check-in.md`.
- Lower layer: `feat/s3-01-camera-first` @ `756b904d3f1bf4038f1a7788ce41a5b27f7c50cf`.
- Runtime gate: local Worker/D1 at `http://127.0.0.1:8787`; disposable `E2E_` / `E2E_DEMO_` fixtures only.

## Observable acceptance cases

| ID | Setup and action | Observable result | Evidence seam |
| --- | --- | --- | --- |
| MODE-01 | Authenticated account has no server-projected assisted Event capability. Open `/scanner`. | The top mode switch is absent; Self remains usable and the camera-first phone/manual-only desktop boundaries remain unchanged. | `web/lib/scanner-boundary.test.tsx`, local browser |
| MODE-02 | Server projects at least one eligible assisted Event. Open `/scanner`. | A semantic tablist exposes exactly `本人簽到` and `代為簽到`; the current tab has `aria-selected="true"`; the global Shared Shell dock/rail remains present and Scanner remains the active Section. | `scanner-boundary.test.tsx`, `tests/e2e/attendance-d1.test.ts` |
| MODE-03 | With the mode switch visible, select `本人簽到`. | The URL is canonical Self intent; no assisted context/search/roster controls remain; the S3 camera-first composition is visible on phone. | `scanner-boundary.test.tsx`, attendance E2E |
| MODE-04 | Select `代為簽到`. | Existing assisted scanner behavior appears with its server-projected Event context, search/member QR resolution, duplicate and authorization handling unchanged. | `scanner-boundary.test.tsx`, assisted component/E2E suites |
| MODE-05 | Switch modes after selecting an Event or seeing a result/error. | Stale mode-specific context/results are cleared by remount/canonical intent; focus moves to the selected tab and a Traditional Chinese mode announcement is emitted. | `scanner-boundary.test.tsx` |
| MODE-06 | Enter malformed/unauthorized assisted intent or force the access probe to fail. | No operator controls leak; stale-context/access recovery is visible, actionable and returns safely to Self. | `scanner-boundary.test.tsx`, local browser |
| MODE-07 | Run responsive/accessibility checks at phone and desktop boundaries. | Tab semantics, keyboard focus, announcements, dock/rail clearance and 44px targets remain valid; no S7 roster, correction, void or settings UI is introduced. | `pnpm verify`, focused component/E2E suites |

## Required commands

```sh
pnpm typecheck
pnpm --dir web typecheck
pnpm --dir web test
pnpm --dir web test:components
pnpm test:shell-responsive
pnpm exec playwright test --config tests/e2e/attendance-d1.config.ts --grep "D3|Assisted"
```

## Scope boundary

This trace does not authorize S7 chooser/roster/audited mutation/settings work, new attendance APIs/tables, changes to assisted eligibility/search/QR/idempotency/audit contracts, or Google/Cloudflare production mutation.
