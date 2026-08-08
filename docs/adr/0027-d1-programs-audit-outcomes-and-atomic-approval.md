# D1 Programs Domain: Audit Outcomes and Atomic Approval

**Status:** proposed

## Decision

The D1 programs domain records every terminal mutation outcome in its audit stream using the ADR-0023 vocabulary — `SUCCESS`, `DUPLICATE` (same-actor repeat that reached the terminal state — quiet no-op at the RPC boundary), `CONFLICT` (a different actor reached the terminal state first), `DENIED`, and `FAILED` — and every terminal outcome writes exactly one audit row, including repeats (revoke-on-revoked audits `DUPLICATE`, it never returns silently).

Enrollment approval is one atomic transaction: the request decision and the enrollment creation commit together, with the Enrollment row — not the request status — as the terminal evidence of approval. An Approved request without an Enrollment cannot exist, and the `DECIDE` audit row is written only when the transaction commits.

`generateEvents` with zero schedule rules is a `422 VALIDATION` error; every accepted generation run emits exactly one `EVENT_GENERATE` audit row, and idempotent duplicate runs audit `created = 0, skipped > 0`.

## Context

The stacked PRG-01..05 implementation surfaced three defects against the program contracts:

- `decideEnrollmentRequest` flipped the request to `Approved` before creating the Enrollment; when the `(member, program)` unique-index race fired, the `409` left an Approved request with no Enrollment row and no `DECIDE` audit — an inconsistent state no read path could repair.
- Same-actor repeat mutations (repeat enrollment request, revoke-on-revoked leader) audited `CONFLICT` or wrote no row at all, despite ADR-0023 reserving `CONFLICT` for cross-actor correction and `DUPLICATE` for same-actor repeats. The D1 tables' CHECK constraints already copied the vocabulary, so the module claimed the contract without honoring it.
- `generateEvents` with no schedule rules returned early with no audit row, breaking the "generation run is audited once" rule.

## Considered Options

- **Two-phase approval (request status flip, then enrollment insert)** was rejected because it leaves an orphan `Approved` request whenever the second write fails; the request status is not transactional evidence of anything.
- **Deriving enrollment from the request row** (dropping the separate enrollment insert) was rejected because it conflates request history with the active membership relationship and would break direct `ManagerOnly` enrollment, which creates an Enrollment without any request.
- **Silent no-op generation** was rejected because generating from an empty rule set is a caller mistake that should surface loudly at the boundary rather than succeed quietly.
- **Keeping `CONFLICT` for same-actor repeats** was rejected because it blurs two operationally distinct stories — "nothing to do" vs "someone else acted first" — that the audit stream must tell apart.
