# ADR-0020 — Cloudflare D1 Identity, Session, and Auth Boundary

- **Status**: Proposed — decision locked via grilling and the AUTH-01 (#159) / AUTH-02 (#160) implementation. Local and preview D1 proof is AUTH-01/AUTH-02 implementation evidence; the map goal (deployed D1 auth behind the login landing page, AUTH-04/CF0-08) is the acceptance that flips this ADR to Accepted under `AGENTS.md`.
- **Deciders**: Noah Wong, OMP planner (grilling)
- **Date**: 2026-08-05
- **Related**: [Map #158 — EFCC Cloudflare D1 Identity, Login & Registration Foundation](https://github.com/Noahlw/efcc/issues/158), [AUTH-01 #159](https://github.com/Noahlw/efcc/issues/159), [AUTH-02 #160](https://github.com/Noahlw/efcc/issues/160), [AUTH-04 #162](https://github.com/Noahlw/efcc/issues/162), [ADR-0002](0002-pin-based-authentication.md), [ADR-0011](0011-one-active-session-per-member.md) (deferred — superseded here), [ADR-0017](0017-frontend-repo-rendering-and-cloudflare-deployment-boundary.md), [ADR-0018](0018-frontend-http-boundary-auth-and-api-contract.md), [AGENTS.md](../../AGENTS.md) (Sheet-Immutable rule).

## Context

EFCC's auth today lives entirely in Apps Script against the Google Sheets `Users` tab (ADR-0002): a 4-digit PIN is stored in plaintext in the sheet, sessions are non-expiring `PropertiesService` HMAC tokens (issue #73), and every `api_*` RPC re-reads the sheet (ADR-0011 deferred the concurrency question). The cost model (`docs/research/2026-08-01-cost-model-cloudflare-frontend-migration.md`) identifies the shared Apps Script 30-simultaneous-execution ceiling as the scaling constraint; every auth read from the sheet consumes that shared ceiling.

Map #158 moves identity off that shared ceiling: **Cloudflare D1 becomes the sole system of record for identity, credentials, global Role, Account Status, sessions, and registration**, while Google Sheets/Apps Script remain the untouched system of record for church/domain records (Programs, Enrollments, Events, Attendances, Program_Leaders, Audit_Log). The Cloudflare Worker + D1 (already the frontend boundary per ADR-0017/0018) serves login, refresh, registration, and session lifecycle directly, removing every auth-related read from the Apps Script quota path.

## Decision

### 1. D1 identity schema — accounts, registration requests, sessions

Three tables in `web/migrations/` (versioned Wrangler D1 migrations, applied by `wrangler d1 migrations apply`):

- **`accounts`** — one row per member. `user_id` (immutable existing `User_ID`, including its established format, enforced by a schema trigger), `username` + `username_normalized` (mutable display login name plus trimmed/lowercased unique lookup key, enforced transactionally), `credential_hash` (PBKDF2-sha256, `pbkdf2:salt:hash`), `credential_kind` (`legacy_pin` | `password` | `pin`), `account_status` (`Pending` | `Active` | `Suspended` | `Deactivated`), `role` (`Admin` | `Teacher` | `Member`), plus the legacy-migration marker (`legacy_pin_hash`, `requires_upgrade`).
- **`registration_requests`** — `Pending` self-service registrations awaiting Teacher/Admin approval (§3; the approval workflow UI is AUTH-05).
- **`sessions`** — the refresh-session rows populated by §2.

No cleartext PIN, password, access token, or raw session value is ever stored in D1, logged, or returned across an RPC boundary.

### 1.1 Account credential changes

Active account holders may change their login username and password through an authenticated account-settings flow. A username change never changes `user_id`, the established User_ID format, QR identity, role, or account status. The display username may retain user-selected casing, while `username_normalized = trim + lowercase` remains the unique login key.

The uniqueness check must be atomic and must reject collisions with both existing accounts and registration requests, including concurrent updates. A password change stores only a fresh PBKDF2 hash. Normal self-service password changes require the current password; the legacy-PIN upgrade remains the existing controlled exception. Credential changes are audited without credential material; both password changes and username changes revoke all refresh sessions and require the user to sign in again. A future Admin reset or account-recovery path requires a separate authorized and audited contract.

### 2. Session architecture — short-lived access token + refresh session

The Worker issues a **short-lived (~15 min) HMAC-signed access token** on login/refresh and verifies it **statelessly** on ordinary protected requests — **zero D1 reads on the common path**. The D1 `sessions` row (`sessionId`, `userId`, `issuedAt`, `lastSeenAt`, `expiresAt`, `revokedAt`, device/UA fingerprint) is read **only** on token refresh or explicit revocation:

- **Idle expiry**: 90 days since last successful refresh (`expiresAt = lastSeenAt + 90d`, touched on each refresh). An idle session requires full re-login; an actively used session never forces re-entry.
- **Multi-device**: each login creates an independent session row; revoking one device's session does not affect the others. "Remember me" is the default outcome, not an opt-in flag.
- **Revocation**: logout, a credential change, and an admin suspend each revoke the refresh session. A revoked session's outstanding access token keeps working only until its remaining lifetime (≤ ~15 min, stateless) and can never be silently renewed.

The access token binds to both the user and the specific session (`sid`), so a revoked session cannot be masked by a token minted for a different session of the same member.

### 3. Registration — self-service Pending, Teacher/Admin approval

New members register self-service: the request is stored as a `Pending` `registration_requests` row (identity + credential hash + `Pending` status). A Teacher/Admin later approves it into `accounts` with a global Role. The approval workflow itself is AUTH-05; §3 here only fixes the storage shape and the Pending-before-Active gate.

### 4. Legacy migration — user-selected one-time legacy-PIN-hash path

The ~250 legacy `Users` sheet rows migrate under **AGENTS.md's Sheet-Immutable rule**: the import is **read-only** against Sheets — it consumes the same row shape `usersReadAll_` returns and never writes the sheet.

The migration key question (this ADR's open question, carried into AUTH-01) was: after migrating, what proves a forced-upgrade first login belongs to the legacy account owner? Three candidate shapes were considered:

1. **One-time legacy-PIN-hash (SELECTED by the user).** The import stores only a salted PBKDF2 hash of the normalized legacy PIN (`legacy_pin_hash`), never cleartext. The first login must present the legacy PIN, which D1 verifies against that one-time hash; on success the member sets a new credential and the one-time hash is **cleared** — the legacy PIN is then gone from D1 entirely and can never be used again. Every migrated account is gated (`requires_upgrade = 1`) and no session is issued until the upgrade completes. Credential change during upgrade revokes any outstanding sessions.
2. **Out-of-band invite only.** Identity proof happens entirely via a Teacher/Admin-issued invite, with no legacy-PIN verification at all. Rejected: it abandons the one credential the member already knows and forces every legacy member through manual staff contact.
3. **Keep hashed legacy PIN as the long-term credential.** Verify the legacy PIN on every login. Rejected: it preserves the weak 4-digit numeric key space indefinitely instead of using the migration as the moment to move to a stronger credential.

The user selected Shape 1. It honors "no cleartext PIN ever" while giving each legacy member a self-service, identity-proven upgrade on first login, then permanently discards the legacy secret.

The first-login browser contract is `POST /api/auth/upgrade` with `{ username, legacyPin, newCredential }`. The Worker resolves the account by username, verifies the one-time legacy PIN, clears the legacy proof and requires the new credential before issuing either auth cookie; the client does not provide a `userId` to begin this flow. The replacement credential is password-style, accepts Unicode input, and requires at least 8 characters; it is stored as `credential_kind = 'password'`.

The migration boundary accepts only a trimmed, non-empty source `PIN_Code` containing exactly four ASCII digits. A complete identity row with no `PIN_Code` is skipped and reported as non-legacy so it cannot block valid legacy rows; the row is never created without a credential. Non-digit, overlong, and underlong non-empty values fail closed before hashing or writing. The older Apps Script interactive-login normalization is not used to sanitize migration rows. This validation is scoped to the one-time legacy import: new registration requests and password accounts do not require `PIN_Code`.

### 4.1 Legacy-PIN brute-force lockout (escalating ladder)

The one-time legacy-PIN hash is a **throwaway identity gate**, not a standalone
security boundary: it proves the upgrade on first login and is then cleared
forever. Because the legacy key space is only 4 numeric digits (10,000
possibilities), the check is hardened against brute force by a per-account
escalation ladder persisted on `accounts` as non-secret state only
(`lock_level`, `failed_attempts`, `locked_until`, `lock_since` — never the PIN
or any credential):

| Stage | Trigger                        | Duration  | Cleared by |
| ----- | ------------------------------ | --------- | --------------------------- |
| 0 — none | fewer than 5 failed verifications | —       | — |
| 1 — 5-min lock | 5th failed verification | 5 minutes | time expiry |
| 2 — 15-min lock | fresh round of 5 after stage 1 expires | 15 minutes | time expiry |
| 3 — admin unlock | fresh round of 5 after stage 2 expires | permanent | Admin/Teacher `adminUnlockLegacyUpgrade` |

Each stage is entered by a fresh round of `LEGACY_FAIL_THRESHOLD` (5) failures
since the last reset; `failed_attempts` resets to 0 when a stage is entered.
While a time-lock (stage 1/2) is active, the gate rejects the verification
before the PIN is ever checked; stage 3 rejects until an Admin/Teacher clears
it. A successful upgrade clears the whole lockout state. The threshold (5) is
the ticket's proposed value confirmed by the operator during the 2026-08-05
grilling: 5 failures, then 5 additional failures, then the next failure requires
unlock. The stage durations (5/15 minutes) follow the same decision. The exact numeric
threshold/durations are constants in `web/lib/auth/lockout.ts`, intentionally
configurable before deploy.

## Consequences

- Identity, credentials, sessions, and registration are read from D1, removing every auth read from the shared Apps Script ceiling (cost model).
- The existing Apps Script PIN/session path (ADR-0002, issue #73) is superseded for the webapp; domain RPCs stay Sheets-authoritative and unchanged.
- A one-time, deterministic, idempotent import stands between the legacy sheet and D1; duplicate/malformed non-empty-PIN rows abort the whole import with a diagnostic and no partial write, while complete rows without a legacy PIN are reported as skipped and never inserted without a credential.
- This ADR stays `Proposed` until the deployed D1 login path (AUTH-04 + CF0-08) proves the boundary against a fresh isolated deployment; AUTH-01/AUTH-02 provide the local/preview D1 evidence.

## Considered options

- **Keep auth in Apps Script / Sheets** — rejected by the map's scaling rationale (shared 30-simultaneous-execution ceiling).
- **Third-party IdP (Firebase Auth, etc.)** — rejected for the same self-contained reason as ADR-0002: no external account dependency for elderly/non-technical members, no SMS/email verification channel.
- **Legacy-migration shapes 1–3 above** — Shape 1 selected by the user.