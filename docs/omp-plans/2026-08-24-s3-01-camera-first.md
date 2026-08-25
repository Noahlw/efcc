# S3-01 Camera-First Scanner Acceptance Trace

> Written before the S3-01 implementation commit. This trace is the observable gate for #434, not a design prototype.

## Authority and baseline

- Ticket: #434 — S3-01: Make phone Scanner camera-first.
- Parent spec: `docs/specs/370-s3-participant-guest-check-in.md`.
- Frozen stack base: `stack-base/s3-authority` @ `c0455edd614128aaf26385a3cda268775b5b455d`.
- Runtime gate: local Worker/D1 at `http://127.0.0.1:8787`; only disposable `E2E_` / `E2E_DEMO_` fixtures.
- Phone boundary: `<800px`; desktop boundary: `>=800px`.

## Observable acceptance cases

| ID | Setup and action | Observable result | Evidence seam |
| --- | --- | --- | --- |
| CAM-01 | Authenticated Member opens plain `/scanner` at 375px with camera permission. | `data-camera-state="opening"` appears, then `data-camera-state="live"`; the live surface is dark, has `將二維碼放入框內掃描`, one scan frame, persistent navigation, and `停止掃描`. | `tests/e2e/programs-device-proof.test.ts` |
| CAM-02 | While live, inspect controls. | `輸入代碼` and `出示會員 QR` are absent; only the disabled opening/live stop action is present. | `tests/e2e/programs-device-proof.test.ts`, `self-check-in-panel.test.tsx` |
| CAM-03 | While live, activate `停止掃描`. | Camera tracks are released; the light fallback shows equal real controls `輸入代碼` and `出示會員 QR`; the Member QR control targets `/profile`, the existing Account Section. | `tests/e2e/programs-device-proof.test.ts`, `use-qr-camera.test.tsx` |
| CAM-04 | Deny `getUserMedia` with `NotAllowedError`. | The fallback shows `相機權限未開啟。請在瀏覽器設定允許相機，再按「重試相機」。`; `重試相機` is actionable and fallback methods remain available. | `tests/e2e/programs-device-proof.test.ts`, `self-check-in-panel.test.tsx` |
| CAM-05 | Remove camera/decoder capability or fail the capability probe. | The probe terminates at the light unsupported fallback with `相機掃描不可用`; no `重試相機` promise appears. | `tests/e2e/programs-device-proof.test.ts`, `use-qr-camera.test.tsx` |
| CAM-06 | Remove native `BarcodeDetector` before navigation. | The lazily loaded ponyfill reaches live camera or a definitive terminal fallback before the deadline; no request targets jsDelivr. The wasm request is same-origin `/wasm/zxing_reader.wasm`. | `tests/e2e/programs-device-proof.test.ts` |
| CAM-07 | Authenticated Member opens `/scanner` at 1280px. | No camera stage, video, or camera permission request appears. A manual six-digit Event Manual Check-In Code form is visible and keyboard-focusable; desktop rail remains. | `tests/e2e/programs-device-proof.test.ts`, `attendance-d1.test.ts` |
| CAM-08 | Open credential deep links with `event`, `program_token`, or `manual_code`. | Camera opening is skipped and the existing server-backed resolve path runs directly; no client authorization or attendance contract changes. | `self-check-in-panel.test.tsx`, `attendance-d1.test.ts` |
| CAM-09 | Run existing guest/operator component and Worker contracts. | Guest and assisted callers retain their existing click-to-start camera behavior, server resolution, authorization, idempotency, audit, and navigation contracts. | `pnpm --dir web test`, `pnpm --dir web test:components`, attendance component suites |

## Required commands

```sh
pnpm typecheck
pnpm --dir web typecheck
pnpm --dir web test
pnpm --dir web test:components
pnpm test:shell-responsive
pnpm exec playwright test --config tests/e2e/programs-device-proof.config.ts
pnpm exec playwright test --config tests/e2e/attendance-d1.config.ts --grep "D member self check-in|D2|D4|D5|D6|D7"
```

## Scope boundary

This trace does not authorize S3-02 operator mode redesign, S3-03 fallback implementation beyond the S3-01 boundary, S3-04 self outcomes, S3-05 guest rebuild, S7 roster/mutation work, a new API/table, or Cloudflare/Google production mutation.
