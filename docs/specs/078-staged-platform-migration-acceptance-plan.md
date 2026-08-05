# Staged Platform Migration Acceptance Trace

## Purpose

This trace defines the observable checks required before PR #166 is considered merge-ready as the staged Worker/D1 platform starting point.

## Ownership boundary

- **Worker + D1** owns identity, credentials, login, refresh, logout, legacy-credential upgrade, registration, approval, and authenticated profile data.
- **Apps Script + Google Sheets** remains the transitional domain backend for Programs, Events, Attendance, Enrollments, and other domain operations until each capability has a Worker/D1 replacement.
- The repository must not claim a transitional capability is complete for the new website merely because legacy Apps Script code exists.

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
| MIG-1 | The transitional Apps Script domain boundary remains intact until replacement capability acceptance is complete. | Static route/reference review and legacy domain test suite. |
| SAFE-1 | Destructive E2E upgrade tests accept only explicitly marked disposable usernames beginning with `E2E_`. | Test configuration assertion and a negative test with a non-`E2E_` username. |
| SAFE-2 | No credential, token, PIN, or cookie value appears in test output or uploaded artifacts. | Secret-safe test assertions and artifact review. |

## Fresh deployment gate

All criteria must pass against a fresh deployed `/exec` or isolated Worker deployment appropriate to the surface. A partial local test run is not sufficient for READY status.
