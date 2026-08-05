# ADR-0021 — D1 → Sheets Identity-Metadata Review Mirror (AUTH-03)

- **Status**: Proposed — decision locked via the operator's authorization of the original request; implementation evidence in AUTH-03 (#161). Flips to Accepted on deployed proof of a verified Cloudflare Cron Trigger run.
- **Deciders**: Noah Wong, OMP planner
- **Date**: 2026-08-05
- **Related**: [AUTH-03 #161](https://github.com/Noahlw/efcc/issues/161), [Map #158 — EFCC Cloudflare D1 Identity, Login & Registration Foundation](https://github.com/Noahlw/efcc/issues/158), [ADR-0020](0020-cloudflare-d1-identity-session-and-auth-boundary.md) (D1 identity boundary), [ADR-0018](0018-frontend-http-boundary-auth-and-api-contract.md), [AGENTS.md](../../AGENTS.md) (Sheet-Immutable rule).

## Context

AUTH-01/AUTH-02 (ADO-0020) move identity into Cloudflare D1 as the sole system of record. Operators still need a human-readable, at-a-glance review of identity metadata (who is Active/Suspended, what Role each member holds, who is still awaiting the forced credential upgrade, whether any account is mid-lockout). The cost model and the shared Apps Script ceiling do not apply to a low-frequency (once daily) review read.

The operator authorized an **optional** mirror: a scheduled, one-directional push of D1 identity **metadata** into a Google Sheet for human read-only review. The parent user explicitly confirmed this scope; no relevant decisions changed.

## Decision

### 1. D1 is authoritative; the Sheet is human read-only review data

D1 remains the sole system of record **and the only authorization source**. The mirror exports only non-secret identity **metadata** — `user_id`, `name`, `username`, `role`, `account_status`, `credential_kind`, `requires_upgrade`, `lock_level`, timestamps — and **never** credential hashes, legacy-PIN hashes, or session values. The review Sheet is never read back as any kind of authorization input; all decisions derive from D1.

### 2. Schedule — 03:00 Asia/Hong_Kong (UTC form on a verified Cron Trigger)

The mirror runs once daily via a Cloudflare Cron Trigger. The schedule is **03:00 Asia/Hong_Kong**; because Cloudflare cron expressions are evaluated in UTC and Asia/Hong_Kong is UTC+8, that is **19:00 UTC the previous day**, i.e. the cron expression `0 19 * * *` (verified against Cloudflare's cron-trigger syntax in the workers-sdk docs). The operator controls the schedule; disabling the trigger pauses the mirror with no effect on D1.

### 3. Signed Worker → Apps Script boundary

The Worker builds a deterministic, content-addressed snapshot, signs it (canonical JSON + HMAC-SHA256 over `{version, issuedAt, idempotencyKey, accounts}`) with the shared `EFCC_SERVICE_SECRET`, and POSTs it to the Apps Script mirror endpoint. Apps Script verifies the signature before applying — the same signed-boundary pattern as the existing service envelope (CF1-01 / #151), using the official `Utilities.computeHmacSha256Signature` API. An invalid signature fails closed (403). The boundary ensures the review sheet can only be written by a Worker that holds the shared secret.

### 4. Idempotent, convergent, non-destructive apply

Repeated runs converge: the Apps Script side keys rows by `user_id`, **appends new rows and updates changed rows in place**, and never clears/rewrites the whole sheet. A duplicate `user_id` is never written. An exact re-run of the same snapshot (`idempotencyKey` short-circuit) is a no-op (`ALREADY_APPLIED`).

### 5. Fail-closed diagnostics (secret-free)

Missing/duplicate `user_id` in the payload aborts with 422 naming the offending identifiers; a Sheets API/lock failure aborts with 500/503 and no partial write; the Worker fails closed on upstream unreachability or a rejected run. Diagnostics never include secrets, PINs, tokens, credentials, or internals.

## Consequences

- Operators get a daily human-readable identity review without any auth read leaving D1 on the interacting path.
- The review Sheet must be treated as non-authoritative; AGENTS.md's Sheet-Immutable rule is honored (the Worker never writes Sheets except through the signed mirror boundary, and never reads review data back).
- Adding/reconfiguring the mirror is operator-controlled and reversible; D1 is unaffected by the mirror's presence or absence.

## Considered options

- **Manual export / no mirror** — rejected: the operator explicitly authorized the scheduled mirror for routine review.
- **Read the review Sheet back for any decision** — rejected outright; D1 is the only authorization source.
- **Whole-sheet rewrite each run** — rejected; destructive and non-convergent. In-place append/update is chosen.