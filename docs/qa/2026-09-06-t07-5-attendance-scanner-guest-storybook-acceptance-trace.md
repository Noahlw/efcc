# T07.5 Attendance/Scanner/Guest Storybook acceptance trace

**Ticket:** T07.5 / #570
**Scope:** Attendance, Scanner, and Guest presentation catalog only; no device
truth, domain/permission migration, native print proof, or T07.6 approval.
**Status:** `CHECKPOINT_GREEN`

## Pre-implementation meaningful-screen audit

The audit covers the current shipped routes and reuses their production pages
and panels. Query-driven states that change the direct-reviewable composition
receive separate PSNs; camera, scanner, clipboard, safe-area, and print
behavior remain deterministic presentation outcomes only.

| Screen | Production route/component | Persona/context | Planned baseline PSN | Gap |
|---|---|---|---|---|
| Guest Check-In | `/guest-check-in` / `GuestCheckInPage` + `AttendancePanel` | Synthetic Guest | `PSN-ATTENDANCE-GUEST-CHECK-IN` | None |
| Scanner Boundary / Self Check-In | `/scanner?mode=self` / `ScannerPage` + `ScannerBoundary` + `SelfCheckInPanel` | Synthetic authenticated Member | `PSN-ATTENDANCE-SCANNER-BOUNDARY` | None |
| Assisted Scanner / Check-In | `/scanner?mode=assisted&event=t07-5-event` / `ScannerBoundary` + `AssistedScannerPanel` | Synthetic authorized Operator | `PSN-ATTENDANCE-ASSISTED-CHECK-IN` | None |
| Attendance Operator | `/events` / `EventsPage` + `AttendanceOperatorPanel` chooser | Synthetic authorized Operator | `PSN-ATTENDANCE-OPERATOR` | None |
| Attendance Operator Roster | `/events?event=t07-5-event` / `AttendanceOperatorPanel` roster | Synthetic authorized Operator | `PSN-ATTENDANCE-OPERATOR-ROSTER` | None |

The Scanner Boundary baseline intentionally covers the production boundary and
the Self Check-In presentation together; it does not multiply a minor query
state into a second screen. The operator roster is separate because the route
query changes the direct-reviewable composition.

## Device boundary

Stories may show deterministic camera-unavailable/fallback and scanner result
states through system-boundary fixtures. They do not claim camera callback
reliability, real scanner support, safe-area hardware behavior, clipboard
integration, or native print-preview acceptance. Hardware/device truth remains
owned by T28–T31. Guest/member/operator domain behavior and permission truth
remain Worker/real-app authority.

## Implementation evidence

- [x] Five code-backed Attendance/Scanner/Guest compositions have one owning
  Story/PSN declaration and Screen Catalog entry.
- [x] Stories reuse the production route pages, AppShell/GuardedSection,
  attendance panels, styling, and local primitives; no `/prototype` code is
  imported.
- [x] Synthetic 2099-dated event/member/operator fixtures and deterministic
  MSW handlers are used only at the HTTP boundary.
- [x] A Storybook-only routing adapter mirrors declared query navigation into
  `window.history` for production components that read browser URL state.
- [x] A behavior-preserving production accessibility correction removes the
  duplicate chooser landmark while retaining the roster landmark.
- [x] The correction does not redesign Attendance, Scanner, Guest, or device
  behavior.

## Verification and review evidence

- [x] `pnpm typecheck` — PASS.
- [x] `pnpm test:t07:foundation` — PASS, 3 files / 10 tests.
- [x] `pnpm test:storybook` — PASS, 5 files / 37 browser stories.
- [x] Scoped Ultracite check — PASS for the six changed Storybook files.
- [x] `pnpm test` — PASS, 44 files / 606 tests.
- [x] `pnpm storybook:build` — PASS on Storybook `10.6.0`.
- [x] Standards review — PASS by bounded local review against AGENTS.md,
  governance, TESTING.md, and ADR-0045. Existing unrelated lint findings at
  `attendance-operator-panel.tsx:853` and `:868` were not changed.
- [x] Spec review — PASS by bounded local review against #570, this trace,
  production routes, and the T07 catalog contract.

## Review URLs

- `http://127.0.0.1:6006/iframe.html?id=t07-5-attendance-scanner-guest--guest-check-in&viewMode=story`
- `http://127.0.0.1:6006/iframe.html?id=t07-5-attendance-scanner-guest--scanner-boundary&viewMode=story`
- `http://127.0.0.1:6006/iframe.html?id=t07-5-attendance-scanner-guest--assisted-check-in&viewMode=story`
- `http://127.0.0.1:6006/iframe.html?id=t07-5-attendance-scanner-guest--attendance-operator&viewMode=story`
- `http://127.0.0.1:6006/iframe.html?id=t07-5-attendance-scanner-guest--attendance-operator-roster&viewMode=story`

## Checkpoint contract

- [x] Every audited screen has one owning Story/PSN declaration and Screen
  Catalog entry.
- [x] Stories reuse production pages/panels, shell/providers, styling, and
  local primitives; no `/prototype` import is permitted.
- [x] Fixtures are synthetic and deterministic; real API/member records,
  secrets, tokens, and production identifiers are not copied.
- [x] Storybook/Vitest interaction and cheap accessibility checks pass.
- [x] Screen Catalog integrity, typecheck, focused tests, and applicable full
  regression/precommit checks pass.
- [x] Standards and Spec review pass.
- [x] One owning T07.5 checkpoint commit is this shared-branch checkpoint
  commit.

## Scope guard

No device-specific redesign, native print proof, hardware acceptance, human
workshop-fidelity approval, `STACK_GREEN` claim, merge, or T07.6 implementation
is authorized by this child.
