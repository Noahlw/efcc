# Legacy-Credential Upgrade Acceptance Plan

**Feature:** Forced legacy-credential upgrade in the signed-out login surface
**Authority:** AUTH-01 (#159), AUTH-04 (#162), ADR-0020, Spec 074, Spec 076 (landing-page baseline)
**Date:** 2026-08-05
**Status:** proposed — acceptance trace established before final implementation integration; this feature is not READY until every criterion below has fresh evidence.

## Scope

When `POST /api/v1/auth/login` verifies a legacy credential and returns
`mustSetNewCredential: true`, the landing page must keep the user signed out
and render a dedicated upgrade form. The form submits the verified legacy PIN
and a new password to `POST /api/v1/auth/upgrade`; only a successful upgrade
may establish the non-secret presence hint, resolve `/api/v1/auth/me`, and
redirect into the authenticated shell.

The browser never stores the legacy PIN, new password, access token, refresh
token, session identifier, or credential object. The existing cold-boot login,
restore, invalid-login, and logout-notice behaviors remain unchanged.

## Preconditions

1. The fresh browser profile has no `efcc_auth_active` hint and no legacy
   `efcc_session` object.
2. The component test server provides deterministic login, upgrade, and `/me`
   responses.
3. The deployed auth acceptance target has isolated D1 data and the five
   required acceptance secrets; no production Sheet/Apps Script state is used.

## Acceptance criteria — observable DOM / network / storage assertions

| # | Criterion | Observable assertion |
|---|---|---|
| U1 | Legacy login is a hard gate | A login response with `mustSetNewCredential: true` renders the upgrade heading and does not call `/api/v1/auth/me`, redirect, or set `efcc_auth_active`. |
| U2 | Upgrade form is explicit and labeled | The DOM exposes username, legacy PIN, and new-password labels; the username remains visible and the submit control is named by the upgrade copy. |
| U3 | Upgrade request carries the intended payload | Exactly one `POST /api/v1/auth/upgrade` is sent with `{ username, legacyPin, newCredential }`; no token or credential is written to browser storage. |
| U4 | Successful upgrade completes the boundary | A successful upgrade response is followed by `/api/v1/auth/me`, sets only the non-secret presence hint, and redirects with client navigation to the first authorized section. |
| U5 | Failed upgrade remains recoverable | A 4xx/network failure renders `role="alert"`, keeps the upgrade form mounted, clears the presence hint, and permits a retry without redirect. |
| U6 | Cold-boot login remains stable | With an ordinary successful login, the existing login form and `登入` action remain observable; the default login still calls `/me`, sets the hint, and redirects. |
| U7 | Credential secrecy holds | `localStorage`, `sessionStorage`, response bodies, and test-captured request logs contain no access token, refresh token, session identifier, legacy PIN, or new password after the flow. |
| U8 | Accessibility and responsive behavior hold | Upgrade inputs have programmatic labels, the busy state disables duplicate submission, alerts are announced, keyboard focus remains visible, and desktop/mobile widths have no horizontal overflow. |

## Verification plan

1. Run the focused component contract (`web/lib/app.test.tsx`) with U1–U7
   assertions and the web typecheck.
2. Run the Worker auth contract (`web/worker.auth.test.ts`) against the real
   workerd/D1 runtime for the login/upgrade boundary and cookie behavior.
3. Run the authenticated Playwright pipeline (`tests/e2e/auth-d1.config.ts`)
   against a fresh isolated deployment supplied through `AUTH_TARGET_URL` and
   acceptance secrets. Assert each criterion through DOM, request, response,
   cookie, and storage observations; do not use Google session-state fixtures.
4. Run the unauthenticated responsive browser checks at 375px and desktop
   widths against the local static shell, including the upgrade form state.

## Evidence

Pending fresh execution. Results must be appended here with command, target
URL/deployment identifier, timestamp, and pass/fail evidence before this
feature or the superseding landing plan is marked READY.
