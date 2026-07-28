# ADR-0002: PIN-Based Authentication

**Status**: Accepted  
**Date**: 2026-07-27  
**Context**: 顯恩堂系統 / EFCC Church Management System

## Decision

Authenticate members using a combination of a **username** (lowercased, sanitized) and a **4-digit numeric PIN**. PINs are normalized at login (rightmost 4 digits, zero-padded left). The system auto-generates PINs and usernames for new members.

## Rationale

- **No email/password fatigue** — Many church members (especially elderly or non-technical) do not want to manage yet another email + password. A simple username + short numeric PIN is far more accessible.
- **Offline-friendly mental model** — 4-digit PINs are familiar from banking/phones. No password rules to forget.
- **No external auth provider** — Keeps the system fully self-contained within Google Sheets + Apps Script. No Firebase Auth, no SMS verification, no email setup.
- **Same-channel delivery** — PIN is shared in-person or via the church's existing communication channel (WhatsApp/WeChat). The registration form returns the PIN directly to the administrative user.

## Constraints

- **No rate limiting** — Google Apps Script has no built-in throttling per endpoint. Brute-force protection is limited to the PIN's 10,000-combination space (0000–9999).
- **No password hashing** — PINs are stored in plain text in the Users sheet. This is acceptable only because:
  - The sheet is accessible only to spreadsheet editors (church admin staff).
  - The script runs under the deployer's Google identity.
  - There is no public-facing API beyond the web app itself.
- **Session-less** — The web app does not issue tokens or cookies. Each `google.script.run` call runs as the deployer, not the logged-in member. Authentication is verified only at login time; the client stores the userId in memory for subsequent RPCs.

## Authentication Flow

1. Member enters username + 4-digit PIN.
2. Server normalizes PIN: strips non-digits, takes rightmost 4 digits, zero-pads to 4 places.
3. Server looks up the username in the Users sheet.
4. If found and PIN matches:
   - Status check: "pending" → reject, any other non-active status → reject.
   - Returns `{ success, userId, name, qrString, username, enrolledProgramIds }`.
5. If username found but PIN wrong → "PIN incorrect." (does not reveal which part is wrong).
6. If username not found → "Invalid Username or PIN." (ambiguous error).

## Account Status Lifecycle

| Status      | Meaning                 | Login allowed?                   |
| ----------- | ----------------------- | -------------------------------- |
| `Active`    | Fully registered member | Yes                              |
| `Pending`   | Awaiting admin approval | No ("Account pending approval.") |
| _any other_ | Inactive / removed      | No ("Account not active.")       |

## Consequences

- PIN normalization (`normalizePin_`) allows for input flexibility: "1234", " 1234 ", "01234" (rightmost 4 → "1234"), "12a34" all resolve to "1234".
- PIN is always 4 digits. The full 0000–9999 range is valid.
- Error messages are deliberately ambiguous for the "username not found" case to avoid leaking which usernames exist.
- A future security improvement could add script-level write protection to the Users sheet or move PIN storage to a separate locked sheet.

## Alternatives Considered

- **Google OAuth** — Rejected. Requires every member to have a Google account; adds complexity for non-technical users.
- **Email + password** — Rejected due to password management burden and the need for an email delivery system.
- **No authentication (public access)** — Rejected. Enrollment and personal data must be member-specific.
