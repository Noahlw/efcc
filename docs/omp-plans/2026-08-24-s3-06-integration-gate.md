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

## Completion addendum

The execution record above is the pre-repair baseline. The completion pass
resolved the two local blockers without changing attendance endpoints, schema,
or audit/idempotency contracts:

- `sectionsForRole` now includes the existing Events destination for Admin and
  Staff, and for Members with an active management grant. The auth projection
  contract tests were updated to assert that authorization projection; the
  five-slot navigation projection is unchanged.
- Operator E2E assertions now target the current semantic roster list and
  deep-link contract rather than removed `#event-chooser`, `#event-id`, and
  `article` selectors; row-scoped locators replace global `.last()` chains
  that could cross row forms. No production runtime, API, or client fetch
  policy changed in this pass.
- Guest phone availability is locked at `320×568`: the primary button is
  enabled, 44px high, horizontally inside the viewport, and its measured
  bottom is `544.34px` in a `568px` viewport. The route renders no Shared
  Shell or fixed dock.
- A new guest busy-state regression asserts `送出中…`, `disabled`, and
  `aria-busy="true"` during entry resolution.

Final local evidence on this stack:

- Attendance D1: **52 passed, 0 failed** across phone `375×667` and desktop
  `1280×720`; this includes guest, self, assisted/operator, correction,
  cancellation, duplicate, retry, handoff, and the short-height `320×568`
  regression.
- Camera matrix: **29 passed, 6 intentionally skipped** across the seven
  ADR-0036 width projects.
- Responsive shell: **92 passed, 1 skipped** on supervised static
  `127.0.0.1:4199`; the occupied repository-default `4173` listener was not
  disturbed.
- Repository checks: **38 prototype, 456 Worker/unit, and 538 component
  tests passed**; root/e2e and web typechecks passed; `pnpm --dir web build`
  passed.

The local code gate is green. The required real-iPhone-over-LAN smoke was not
available in this environment and remains the only unexecuted acceptance
item; it must be recorded by an operator before calling the S3 release gate
READY. No device evidence is fabricated here.

## Polish addendum (2026-08-24, impeccable pass)

A scoped UI-polish pass landed after the completion addendum. Refinement only —
no copy strings, routes, contracts, or backend surfaces changed:

- Guest desktop: the form column is horizontally centered (`margin-inline:
  auto`); previously it hugged the left edge past 480px viewports.
- Guest completion card vertically centers on tall viewports (`margin-block:
  auto`, collapsing on short phones).
- `返回` is now a ≥44px touch target.
- Scanner desktop-manual renders one `h1` and one instruction hint instead of
  two `h1`s and three copies; manual/deep-link standalone composition is
  unchanged.
- Scanner phone fallback: methods heading is sr-only (visible duplicate
  removed) and the denied/unsupported status echo is suppressed — its dedicated
  `role="alert"` card owns that message; offline-resolve errors still render
  (guarded by component test).
- Compact guest block top padding tightened (`0.75rem`) because the taller
  back link had left only ~1.7px of fold slack; measured post-fix button rect
  at 320×568: bottom **562.34**, slack **5.66px**, no horizontal overflow,
  short-phone E2E re-run green.

Verification for this pass: components **538/538**; typechecks and build
green. The intermittent M/N login-navigation failure was root-caused to the
static-export hydration window (pre-hydration `fill()` + click submits an
empty controlled form and stays on `/`) and fixed at the test seam with a
reload-and-retry `loginViaUi` helper; the final full attendance D1 run on this
tree is **52/52**, phone `375×667` and desktop `1280×720`. Camera matrix
scanner/guest states all green, with the unrelated programs "reduced motion
Undo" case flaking under load and passing **7/7** isolated; design detector
reported four "side-tab border" warnings that are the spec E-04 viewfinder
corner brackets — intentional geometry, not card accents.

A 36-viewport fold matrix (`320/375/390/414 × 568–896`, plus landscape 320h
and short-desktop sizes) asserts the guest submit is enabled, ≥44px, above the
fold, and overlay-free: **0 defects**; only 320px-height landscape needs
scroll (intrinsic form height).

## Login-surface entry addendum (2026-08-24)

Operator report: no guest check-in button on the phone login surface. Root
cause: the `max-width: 799px` login block set `display: none` on
`.loginNote`, which bundled the decorative register note with the public
`訪客簽到` (`/guest-check-in`) entry link — hidden and unscrollable on every
phone viewport, violating the Guest Check-In Entry contract (public entry
from the signed-out login surface). Fix: the guest entry is now its own
`.guestEntry` control — a full-width ≥44px secondary button, visible at all
widths; the register note stays hidden on phone as decorative copy.
Verified at 429×672 (operator's 2× screenshot geometry) and 320×568: link
visible, 44px tall, click navigates to `/guest-check-in`; components
**538/538**, typecheck and build green.

Same pass, same defect class: the `註冊帳戶` (`/register`) self-service entry
lived in the second `.loginNote` paragraph and was equally `display: none`
below 800px. It is now its own `.registerEntry` control — a ≥44px centered
underlined text link, visible at every width; the decorative sentence stays
hidden on phone. Verified at 320×568 and 429×672: link visible, 44px tall,
click navigates to `/register`; components 538/538, typecheck and build green.
