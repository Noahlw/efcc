# ADR-0041: Atomic Registration Batch Approval

**Status:** accepted

## Decision

Registration Batch Approval is one all-or-nothing mutation over an explicit set
of Pending registration request IDs selected by the operator. Every selected
request must still be Pending and collision-free at commit time. A missing,
stale, already resolved, or conflicting request rejects the entire batch with
no account, request-status, or audit partials.

The endpoint requires an Active actor with
`registration.approval.manage`, an `Idempotency-Key`, and a bounded,
deduplicated list of opaque request IDs. Durable actor-scoped idempotency stores
the canonical request hash and response summary. A same-key replay returns the
stored result without repeating mutations or audit rows; a same key with a
different request hash is a conflict.

Each approved registration creates its Active Account and terminal request
state inside the same D1 transaction. Each selected request records one
credential-free immutable audit outcome. The existing single approve/reject
endpoints and their deep-linkable Detail flow remain available.

## Selection Contract

- Selection is an explicit set of IDs, never an implicit server-side "all".
- Operators may accumulate selection across scroll, search, filters, and a
  Detail round trip.
- Hidden selections remain visible through a selected-count action bar and a
  review tray where individual entries can be removed.
- Selection clears on reload, logout, leaving the Approvals module, or explicit
  Clear; it does not persist as account or browser storage.
- Select All means currently loaded filtered Pending rows only.
- A conflict preserves the selection and identifies stale entries; the UI never
  retries automatically.
- Bulk rejection is out of scope because rejection reasons belong to individual
  applicants.

## Context

Existing registration endpoints mutate one request at a time and require an
idempotency header, but do not persist an idempotency result. Registration
approval currently has no generic immutable audit row. Adding only checkboxes
and sequential client requests would create ambiguous partial outcomes and
would not satisfy the owner-approved "approve selected" contract.

## Consequences

- A new bounded batch endpoint and durable idempotency persistence are required.
- The maximum batch size is fixed only after an isolated-D1 limit probe; the UI
  exposes the accepted limit and preserves selection on validation failure.
- Single/batch and batch/batch races require deterministic D1 tests.
- Confirmation names the number of applicants and states that Active Accounts
  will be created.
- Success, duplicate replay, conflict, denial, validation, and failure require
  response and audit evidence.
