# ADR-0047 — Generate Attempt Unresolved Until Authoritative

- **Status:** Accepted
- **Decider:** Product owner (grilling of PR #634 review, 2026-09-18)
- **Date:** 2026-09-18
- **Related:** #586 R42/R43, #628 RP1/RP6, #629, ADR-0043, ADR-0053/0054/0055 (cited; files not in this tree)

## Context

PR #634 wrote generation recovery only after a caught Generate failure and
returned from unmounted catch paths without persisting. A reviewed Schedule
Plan fingerprint (`#623` acceptance-trace authority `ADR-0047/0050/0053/0054`
covers the fingerprint family; this file is the Generate-recovery member)
plus a settled `requires_review` latch could block Generate after Review Again
yielded a matching new Plan. A parsed mutation HTTP 500 `INTERNAL_ERROR` was
treated as settled, and `efcc_generation_recovery:` survived logout.

React discards in-memory state on unmount; aborting or ignoring the HTTP
response does not unsend work the Worker may already have started
([React state](https://react.dev/learn/preserving-and-resetting-state),
[Effects](https://react.dev/learn/synchronizing-with-effects)).
`sessionStorage` is origin+tab, not user
([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage)).
RFC 9457 is an error document, not a D1 rollback proof
([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)).

## Decision

A Generate attempt is **unresolved from dispatch** until an authoritative
Audit Outcome exists:

- Persist the attempted Reviewed Schedule Plan **before** `generateEvents()`
  using the existing unknown-outcome record (`needsReconciliation: true`,
  `data: null`, Plan id set, run id null). Survive SPA unmount and reload.
  Clear only after an authoritative outcome. No auto-replay.
- Preview/Review Again must not erase an unresolved write. After a settled
  `requires_review` result is reconciled, a successful Preview of the
  **current schedule fingerprint** is a new Plan and Generate dispatches that
  new Plan id. Failed Preview, `STALE_PLAN`, and unknown writes keep the latch.
- Unexpected mutation HTTP 500 `INTERNAL_ERROR` is unknown. GET/Preview 500
  stays a settled read failure. Known 4xx stay settled.
- Session recovery is keyed by Program, not Account, and clears at logout /
  expiry / failed-RPC cleanup. **No actor key.**
- No Generation Run durable object. No distinct in-flight UI state. Reuse the
  current unknown-outcome UI.

## Consequences

- A false unknown (request never left the browser) is the accepted
  conservative cost.
- `isUnknownMutationOutcome` stays transport-only; a mutation-only wrapper
  carries the `INTERNAL_ERROR` rule so GET/Preview 500s never show
  unknown-Generate UI and attendance/enrollment behavior is unchanged.
- Real-route proof (in-flight reload, Plan B dispatch, logout as another
  Account) stays with #633; component proof must use deferred promises, not
  mocked "on the wire" claims.
