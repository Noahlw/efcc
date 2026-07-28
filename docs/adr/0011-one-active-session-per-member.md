# One Active Session per Member

**Status:** Deferred — not part of the shell-navigation baseline  
**Date:** 2026-07-28  
**Amends when proven:** ADR-0002's obsolete session-less constraint

EFCC considered permitting one active Session per Member rather than maintaining a
session table or per-device session records. On login, the server stores one
issued-at timestamp for the Member in Script Properties and returns an HMAC
token bound to the Member, normalized PIN value, issued-at timestamp, and a
deployment secret. A later login replaces the issued-at timestamp and therefore
invalidates the previous token. Logout deletes the timestamp. Every protected
browser-callable RPC validates the token, account status, expiry, and current
server-side capability before acting.

This design deliberately trades simultaneous devices and device-specific logout
for a smaller Apps Script implementation. It uses the documented
`PropertiesService.getScriptProperties()` and
`Utilities.computeHmacSha256Signature()` APIs and requires no `Sessions` sheet.
The deployment must fail closed when `EFCC_SESSION_SALT` is absent; the current
development-salt fallback is forbidden in a deployed build. Session duration is
not decided by this ADR.

If resumed, the decision can become accepted only after deterministic tests cover signature
validation, token tampering, expiry, replacement login, missing secret, and
logout, and a fresh `/exec` deployment proves login, refresh, a protected RPC,
second-device login, rejection of the old token, and logout. The proof record
must include deployment version, date, account role, observed result, and any
console or execution-log failure.

On 2026-07-28, the session-concurrency limit was deferred to a later
authentication-hardening ticket. Spec 009 requires a server-validated Session
boundary but does not choose one-device versus multi-device behavior, token
rotation policy, persistence duration, or scanner-device policy. No part of this
ADR is an implementation prerequisite for the shell-navigation baseline.
