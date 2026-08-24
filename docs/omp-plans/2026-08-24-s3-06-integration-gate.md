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

## Execution record

- Camera matrix: **29 passed, 6 intentionally skipped** across 320, 375, 390, 414, 799, 800 and 1440 width projects. The skipped cases are desktop-only camera permission/unsupported branches.
- Self outcomes: **20 passed** across phone 375x667 and desktop 1280x720, including confirmation, duplicate privacy, ambiguous escape, outcomes, retry and enrollment denial.
- Guest completion: **18 passed** across phone 375x667 and desktop 1280x720, including exact-one, active-unenrolled, ambiguous, invalid/offline, duplicate and handoff paths.
- Operator boundary: **4 passed, 2 failed**. The failures are the pre-existing S7 `/events` operator-surface tests: `sectionsForRole` omits `events` for Admin/Staff, so `GuardedSection` renders the existing forbidden view. The same 10 operator failures reproduce on the lower `d1989b8` baseline; no S3-06 runtime change was made.
- Responsive gate: **92 passed, 1 skipped** on a supervised static server at `127.0.0.1:4199`; the repository's default 4173 listener was left untouched.
- Repository gates: **38 prototype, 455 Worker/unit, 537 component tests passed**; typechecks and build passed. The default `pnpm verify` responsive step hit the occupied 4173 port, then the equivalent 4199 run passed.
- Real iPhone smoke: **not executed**. No physical iPhone/LAN operator session was available; this remains an explicit manual prerequisite and is not represented as passed.

**NOT READY.** The reachable local evidence is recorded above, but the S3 integration gate cannot be called READY while the baseline-parity operator failures and the required real-iPhone smoke remain unresolved.
