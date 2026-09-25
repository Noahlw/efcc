---
status: accepted
date: 2026-09-25
supersedes: ADR-0020 §2's stateless access-token revocation behavior only
---

# Protected-request session validation

EFCC keeps its 15-minute HMAC-signed access token and 90-day D1 refresh session. For each protected request, the Worker verifies the HMAC and token expiry first; only a valid signature triggers one prepared D1 query joining the matching session and account by `sid`/`uid`. The query rejects revoked or idle-expired sessions and missing accounts. A bad or expired access-token signature is rejected before D1 is read.

Revoking one session or all sessions therefore denies the next protected request. A token from another device remains valid when only one session is revoked. Cookie names and attributes, token format and lifetime, refresh rotation, API response shape, account status handling, role/grant decisions, and audit outcomes remain unchanged. A repeated credential-change request with the already revoked token follows the existing 401 invalid-session path and cannot add a second audit row. `EFCC_ACCESS_TOKEN_SECRET` remains the application HMAC key; the Worker requires it, while Cloudflare does not prescribe this application-specific name.

This supersedes only ADR-0020 §2's claims that protected requests are stateless, use zero D1 reads, and allow a revoked access token until expiry. Auth-provider/library migration and password-login rate limiting remain deferred to [#639](https://github.com/Noahlw/efcc/issues/639). Do not claim a performance improvement; live session revocation requires the D1 lookup.

The implementation keeps direct D1 binding queries and does not opt into the Sessions API. Cloudflare documents read-replica consistency through the [D1 Sessions API](https://developers.cloudflare.com/d1/best-practices/read-replication/); if EFCC later enables read replication, recheck the revocation read path before adopting it.
