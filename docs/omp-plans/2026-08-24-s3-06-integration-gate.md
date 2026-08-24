# S3-06 S3 Local Integration and Readiness Gate

> Verification-only evidence record for #439. No production runtime, API, schema or Cloudflare change is authorized by this ticket.

## Authority and baseline

- Ticket: #439 — S3-06: Run the S3 local integration and readiness gate.
- Parent spec: `docs/specs/370-s3-participant-guest-check-in.md`.
- Stack tip under test: `feat/s3-06-integration-gate` atop `feat/s3-04-self-outcomes`.
- Runtime: local `wrangler dev` at `http://127.0.0.1:8787` with disposable `E2E_` D1 fixtures only.

## Evidence matrix

| Gate | Command/seam | Required observable evidence | Status |
| --- | --- | --- | --- |
| Camera-first Scanner | `tests/e2e/programs-device-proof.config.ts` | Seven-width camera opening/live/stop/fallback/permission/Account matrix; no third-party decoder origin; desktop manual-only. | Run and record exact result |
| Self outcomes | `tests/e2e/attendance-d1.config.ts --grep "D member|D2|D4|D5|D6|D7|D8|H member"` | Confirmation-before-write, chooser, success/duplicate, outcomes, no-write escape, retry and enrollment gate. | Run and record exact result |
| Guest completion | `tests/e2e/attendance-d1.config.ts --grep "A guest|A2|B guest|F cancelled|G unknown|K empty|L invalid|M guest|N guest"` | One-step exact-one, active-unenrolled fixture, ambiguous chooser, B-02 invalid/offline, success, duplicate privacy, validation and handoff. | Run and record exact result |
| Operator boundary | `tests/e2e/attendance-d1.config.ts --grep "D3|Assisted"` | Capability-gated `本人簽到` / `代為簽到` boundary and existing assisted flow. | Run and record exact result |
| Responsive/accessibility | `pnpm test:shell-responsive` | Local responsive suite, no horizontal overflow, 44px controls, keyboard/live-region checks. | Run and record exact result |
| Repository gates | `pnpm verify` | Prototype, typecheck, Worker/unit, components, build and responsive gates. | Run and record exact result |
| Real-device smoke | Manual iPhone over LAN | Permission prompt, live camera, `停止掃描`, fallback manual completion; record device/iOS/browser. | Operator prerequisite; never fabricate |

## Readiness rules

- Local evidence is the READY gate under ADR-0029; no remote Cloudflare or Google mutation is allowed.
- Any failing local suite, absent device smoke, or baseline-parity failure remains an explicit blocker; this record must not call the stack READY while one remains.
- GitHub checks on custom `stack-base/**` pull-request bases are informational/absent when workflow base filters do not trigger them.

## Scope boundary

This record adds verification evidence only. It must not modify production runtime, Worker/API handlers, migrations/schema, authorization contracts, Google Sheets, Cloudflare state, or external acceptance data.
