# Staged Platform Migration Acceptance Trace

## Purpose

This trace defined the observable checks required before PR #166 was considered merge-ready as the staged Worker/D1 platform starting point.

## Ownership boundary

- **Worker + D1** owns identity, credentials, login, refresh, logout, legacy-credential upgrade, registration, approval, authenticated profile data, and the domain capabilities (Programs, Events, Attendance, Enrollments).
- **Apps Script + Google Sheets** was the transitional domain backend; it is now **retired**. `src/gas/`, `tests/gas/`, the clasp configuration, and the transitional `/api/v1/rpc` proxy were removed once every capability had a Worker/D1 replacement and no live caller remained.

## Acceptance criteria

| ID | Observable criterion | Verification |
| --- | --- | --- |
| AUTH-1 | A valid account can log in through the deployed Worker using the cookie-only boundary. | Fresh deployed acceptance run asserts HTTP success, public user data, and both locked cookies. |
| AUTH-2 | A legacy account can verify its PIN once and choose a new credential through the real UI/API flow. | Disposable `E2E_` account; assert upgrade success and no session before upgrade completion. |
| AUTH-3 | Refresh rotates the refresh credential and preserves the authenticated profile. | Acceptance run asserts old refresh value is rejected and the rotated flow succeeds. |
| AUTH-4 | Logout revokes the session and clears both cookies, including when revocation fails. | Worker contract test plus deployed smoke assertion for cookie clearing and problem correlation. |
| AUTH-5 | Registration creates a pending request and an authorized Admin/Teacher can approve or reject it. | Workerd contract tests and deployed acceptance flow with disposable test data. |
| AUTH-6 | Legacy Authorization and `X-Efcc-Session-Id` headers are rejected on the cookie-only auth surface. | Worker transport contract tests assert fail-closed responses. |
| WEB-1 | Cold boot without an auth hint renders the login page and does not attempt restore. | Component test and fresh static deployment browser assertion. |
| WEB-2 | Responsive navigation renders the phone bottom navigation below 768px and desktop rail at or above 768px for an authenticated test session. | Fresh deployed browser trace at 375px and 1280px. |
| WEB-3 | The new website labels domain capabilities according to their actual state: placeholder/target work is not presented as complete. | Roadmap and UI copy review; no false completion claims. |
| MIG-1 | ~~The transitional Apps Script domain boundary remains intact until replacement capability acceptance is complete.~~ **Complete (2026-08-15):** every domain capability has a Worker/D1 replacement and the Apps Script boundary, proxy, and tests were removed. | Static route/reference review and the `web/` workerd + `tests/prototype/` suites. |
| SAFE-1 | Destructive E2E upgrade tests accept only explicitly marked disposable usernames beginning with `E2E_`. | Test configuration assertion and a negative test with a non-`E2E_` username. |
| SAFE-2 | No credential, token, PIN, or cookie value appears in test output or uploaded artifacts. | Secret-safe test assertions and artifact review. |

## Fresh deployment gate

The D1-era criteria are verified against local `wrangler dev` + local D1 (the default `READY` gate, ADR-0029); an isolated Worker deployment is optional operational evidence. The legacy `/exec` surface no longer exists.
