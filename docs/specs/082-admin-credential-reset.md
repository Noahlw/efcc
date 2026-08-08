# 082 — Admin Credential Reset

**Status:** Ready for ticket decomposition
**Parent:** ADR-0029 — Admin Credential Reset Contract
**Domain basis:** `CONTEXT.md` (Password Credential, PIN (legacy), Legacy-PIN upgrade) and ADR-0020 §1.1

## Problem Statement

Members forget their credentials. The legacy system stored 4-digit PINs in plaintext in the `Users` sheet, letting an operator look up a member's secret; ADR-0020 ended plaintext storage entirely — no cleartext PIN, password, access token, or raw session value is ever stored in D1. The operator initially asked to reintroduce plaintext storage, but the underlying need is account recovery: a member cannot log in and needs an operator to restore access. There is currently no supported path for an operator to replace a forgotten credential — the normal self-service password change requires the current password (ADR-0020 §1.1), and the legacy-PIN upgrade gate can strand a member who forgot their PIN before upgrading.

## Solution

A dedicated **Admin Credential Reset** capability: a Staff/Admin operator searches for an account, triggers a reset with a required reason, and the system returns a one-time temporary credential the operator relays to the member. The member's first login with it forces them to set their own password before any Session is issued. No credential material is ever stored, logged, or returned again; every reset is audited.

## User Stories

1. As an Admin/Staff operator, I want to search for an account by name or username, so that I can reset the right member's credential without guessing an ID.
2. As an Admin/Staff operator, I want to reset a Member's credential, so that a member who forgot their password can log in again.
3. As a Staff operator, I want to reset another Staff member's credential, so that desk-level support covers staff accounts too.
4. As an Admin operator, I want Admin accounts resettable only by Admin, so that a Staff member cannot take over the administrator account.
5. As an operator, I want a required reason on every reset, so that the audit trail explains why the credential was replaced.
6. As an operator, I want the system to generate the new credential and show it to me exactly once, so that I can relay it to the member without the member's new secret being permanently visible anywhere.
7. As a member who received a temporary credential, I want my first login to force me to set my own password, so that the operator never permanently knows my secret.
8. As a member on the legacy-PIN path, I want a reset to clear the one-time upgrade gate, so that forgetting my PIN before upgrading does not strand my account.
9. As a member in credential lockout, I want a reset to clear the lockout ladder, so that a legitimate reset restores full access rather than inheriting the lock.
10. As the system, I want a reset to revoke all the target account's refresh sessions, so that a compromised or forgotten credential cannot keep old sessions alive.
11. As the system, I want a reset to never change `account_status`, so that Suspended/Deactivated accounts remain gated.
12. As the system, I want every reset audited with actor, target, reason, outcome, and requestId but never the credential material, so that resets are accountable without leaking secrets.
13. As an Admin/Staff operator, I want the reset entry to be a dedicated account-management surface, so that account lifecycle actions are not buried in the registration queue.
14. As a member whose credential was reset, I want the temporary credential to remain valid until first successful use, so that a slow return to the church does not force a second reset.

## Implementation Decisions

- New API contract: `POST /api/v1/auth/accounts/:userId/reset` — Staff/Admin; Admin targets require an Admin caller; `Idempotency-Key` required; body `{ reason, note? }`; responses follow the existing envelope (ADR-0018 §5 problem details, `X-Request-Id` correlation).
- Reset generates a random credential of at least 8 characters; only its PBKDF2 hash and a `must_change` flag are persisted (new migration on `accounts`).
- The temporary credential is returned exactly once in the reset response; it is never stored, logged, or returned again.
- First login with the temporary credential is gated: no Session is issued until the member sets their own password — reusing the upgrade-gate pattern from ADR-0020 §4 (the temporary credential replaces the legacy PIN as the one-time proof).
- Reset clears `legacy_pin_hash`, `requires_upgrade`, and the lockout ladder (`lock_level` / `failed_attempts` / `locked_until`); revokes all refresh sessions of the target account; never changes `account_status`.
- The temporary credential has no expiry: validity ends at first successful use (operator decision in the grilling session).
- Audit: append-only `audit_events` row with action `CREDENTIAL_RESET`, actor `user_id`, target `user_id`, required reason, outcome, requestId — never credential material (ADR-0027/0023 vocabulary).
- UI: new role-gated account-management Section reusing the member-search picker pattern; search by name/username → account → reset with required reason → one-time temporary credential display with relay guidance.
- The member receives the temporary credential out-of-band from the operator (no email/SMS infrastructure, per ADR-0020's self-contained principle).

## Acceptance Criteria

- C1: Staff/Admin can search an account by name or username and trigger a reset with a required reason; the API returns a one-time temporary credential.
- C2: Admin accounts are reset-only-by-Admin: a Staff caller receives 403.
- C3: First login with the temporary credential forces the member to set their own password before any Session is issued.
- C4: Reset of a legacy-PIN account (`requires_upgrade = 1`) clears the upgrade gate and the legacy proof; the member can log in with the temporary credential.
- C5: Reset clears the lockout ladder; a locked account becomes immediately resettable.
- C6: Reset revokes all the target account's refresh sessions; a pre-reset session cannot refresh.
- C7: `account_status` is untouched: resetting a Suspended/Deactivated account leaves it gated.
- C8: Every reset writes an append-only `CREDENTIAL_RESET` audit row (actor, target, reason, outcome, requestId) with no credential material.
- C9: The temporary credential is shown once; repeated calls or later views never reveal it again.
- C10: Phone + desktop widths, keyboard-accessible, announced transitions — per the repo's responsive/accessibility baseline.
- C11: Fresh deployed acceptance run (deployed `auth-d1`-style suite against the shared dev-testing worker) proves C1–C10.
