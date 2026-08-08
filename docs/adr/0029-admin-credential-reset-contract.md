# 0029 — Admin Credential Reset Contract

- **Status**: Accepted — decision locked via grilling (2026-08-08). Implements the path ADR-0020 §1.1 reserved: *"A future Admin reset or account-recovery path requires a separate authorized and audited contract."*
- **Related**: Amends ADR-0020 (adds the credential-reset path to §1.1's account credential changes); extends ADR-0027's D1 audit vocabulary with `CREDENTIAL_RESET`.
- **Grill session**: grill-with-docs (2026-08-08), rounds Q1–Q10.

## Context

Members forget their credentials. The legacy system stored 4-digit PINs in plaintext in the `Users` sheet, which let an operator "look up" a member's secret; ADR-0020 ended that — no cleartext PIN, password, access token, or raw session value is ever stored in D1. The operator asked to reintroduce plaintext storage to see passwords directly. The grilling session identified the underlying need as **account recovery/reset** (member forgot their secret), and the operator accepted that plaintext storage is not the mechanism: it is a schema-level footgun (one shared migration lands a plaintext column in every environment), it permanently exposes every member account to any D1 reader, and it makes later admin-as-member logins indistinguishable from member logins in the audit trail.

## Decision

A dedicated **Admin Credential Reset** contract, replacing the need for plaintext:

1. **Who**: Staff/Admin may reset Member and Staff accounts; Admin accounts require an Admin caller. This closes the escalation path (no Staff → Admin credential takeover) while covering desk-level support.
2. **What the reset produces**: a system-generated random ≥8-char temporary credential, returned **once** to the caller. Only its PBKDF2 hash plus a must-change flag are stored — the temporary credential is never persisted, logged, or returned again.
3. **First login**: the temporary credential authenticates, then the member is forced to set their own password before any Session is issued — reusing the existing upgrade-gate pattern (ADR-0020 §4).
4. **Reset is reset**: one code path. Setting the temporary credential clears `legacy_pin_hash` + `requires_upgrade`, clears the lockout ladder (`lock_level` / `failed_attempts` / `locked_until`), and revokes all refresh sessions (ADR-0020 §1.1). `account_status` is untouched — Suspended/Deactivated accounts stay gated. No expiry on the temporary credential (operator decision): validity ends at first successful use.
5. **Reason required**: every reset carries a required reason, stored in the audit row — matching the event-cancel precedent (E2E-22).
6. **Audit**: append-only `audit_events` row `CREDENTIAL_RESET` with actor, target, reason, outcome, requestId — never credential material.
7. **UI**: a new dedicated account-management surface (new Section, role-gated) reusing the existing member-search picker (E2E-19), rather than overloading the registration approval queue.
8. **Delivery**: the member receives the temporary credential out-of-band from the operator (no email/SMS infrastructure, per ADR-0020's self-contained principle).

## Considered options

- **Plaintext storage of credentials** — rejected: shared schema would carry plaintext into every environment; any D1 reader could take over every account; defeats ADR-0020's actor model (ADR-0023 §4).
- **Member-initiated recovery with approval queue** — rejected: larger surface (new table, login-surface entry, queue wiring, two extra flows); the operator chose the admin-initiated path as the operational norm (admins already hand out credentials in person).
- **Admin sets a permanent password** — rejected: the admin would know the member's secret forever, and the audit trail cannot distinguish admin-login-as-member from member login.
- **Temporary credential with expiry** — rejected by operator: bounded window adds support friction; validity ends at first successful use.

## Consequences

- New migration: `must_change` flag (and any supporting column) on `accounts`.
- New API: `POST /api/v1/auth/accounts/:userId/reset` (Staff/Admin; Admin targets require Admin), Idempotency-Key, `{ reason, note? }`, problem-details envelope per ADR-0018/0023.
- New Section: account management, role-gated, member-search picker, reset action with required reason, one-time temporary credential display.
- ADR-0020 §1.1's open path is now specified; ADR-0020 itself is not superseded.
- Spec: `docs/specs/082-admin-credential-reset.md`; implementation ticket filed against it.
