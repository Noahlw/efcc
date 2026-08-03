# ADR-0019 — Permissions and Program Leadership HTTP Contract

- **Status**: Proposed — decision locked via grilling. Local and deployed proof is downstream CF2 implementation evidence, not work or an acceptance claim for issue #133; the ADR remains Proposed under `AGENTS.md` until that downstream acceptance is complete.
- **Deciders**: Noah Wong, OMP planner (grilling)
- **Date**: 2026-08-03
- **Related**: [Feature CF2 — Permissions & Program Leadership on HTTP Frontend (#120)](https://github.com/Noahlw/efcc/issues/120), [Map #117](https://github.com/Noahlw/efcc/issues/117), [ADR-0006](0006-admin-capability-matrix.md), [ADR-0010](0010-stable-app-document-and-expandable-sections.md) (bootstrap shape), [ADR-0013](0013-google-sheets-database-structure.md) (authoritative sheet schema), [ADR-0015](0015-single-lock-mutation-and-audit-contract.md), [Spec #63](https://github.com/Noahlw/efcc/issues/63), and the CF0/CF1 HTTP decisions tracked by issues [#128](https://github.com/Noahlw/efcc/issues/128) and [#131](https://github.com/Noahlw/efcc/issues/131).

## Context

Issue #133 asks how the existing Permissions and Program Leader authority appears in React and travels over HTTP while preserving exact-Program scope, live server enforcement, capability refresh, legacy `EVENT_LEADER` behavior, and audit semantics.

The inherited domain model is deliberately not a global event-leader role:

- Global roles are `ADMIN`, `STAFF`, and effective `MEMBER`.
- Program Leader is an orthogonal, many-to-many relationship in `Program_Leaders`.
- An active assignment is scoped to one `Program_ID`; a member may have several active assignments.
- A Program Leader assignment covers Events belonging to that Program. It does not grant authority over another Program.
- STAFF and ADMIN, not Program Leaders, grant and revoke Program Leader assignments.
- Existing `EVENT_LEADER` Sheet values are legacy storage and cannot be treated as current authority.

CF2 must add a browser boundary without making the browser an authority source. `sections[]` remains a navigation/presentation snapshot; protected RPCs remain live server decisions.

## Decision

### 1. Bootstrap and capability refresh

1. `loginUser` and `restoreApp` keep returning the existing `AuthenticatedBootstrap` shape. The browser receives the server-computed `sections[]` snapshot and effective role/profile data, but no `programIds[]`, `legacyRole`, or client-generated capability map.
2. `sections[]` controls visibility only. It is never proof of authority. Every protected read and mutation resolves the authenticated user from the session and rechecks the current global role and active `Program_Leaders` rows on the server.
3. Program/Event RPC parameters carry resource identifiers and query values only. The client never supplies a role, capability, Program Leader claim, or target actor identity as an authority assertion. Returned Program/Event data is filtered by the server before it crosses the boundary.
4. When a protected RPC returns `FORBIDDEN`, the client may call `restoreApp` **at most once for that user action** to refresh `sections[]` and reroute. The original failing RPC is never automatically replayed. If the refreshed state remains forbidden, or refresh returns `AUTH_REQUIRED`, the client surfaces the error or returns to Login. A later, independent user action gets its own one-refresh allowance.

### 2. Permissions reads are narrow and query-driven

The Permissions Section uses separate HTTP actions rather than an uncontrolled dashboard snapshot:

- `permissionsSearchMembers(query)` requires a Member ID or name query, returns active members only, and exposes only the approved minimal lookup fields: Member ID, display name, masked phone digits, and active status.
- `permissionsListPrograms()` is a separate read for the Programs that may be selected for assignment.
- `permissionsGetAssignments(filters)` is a separate read for the current relationship rows relevant to the selected member or Program.

All three reads require the current Permissions capability (STAFF/ADMIN) at the server boundary. No read returns an uncontrolled all-members/all-leaders snapshot. There is no artificial product-level ten-result cap; a later server-pagination refinement must preserve the action contract and must not become a hidden authorization rule.

### 3. Grant and revoke mutations

The HTTP action surface has two separate mutations:

- `grantProgramLeader({targetUserId, programId, reason?})`
- `revokeProgramLeader({targetUserId, programId, reason?})`

The authenticated actor is derived from the verified session, never accepted as a trusted request field. Only STAFF and ADMIN may invoke these actions. The React confirmation step is a UX safeguard; it is not an authority claim and does not become a trusted `confirmed` parameter.

Each mutation performs its final authorization and natural-key recheck inside the single caller-owned mutation lock required by ADR-0015. The natural key is `(targetUserId, programId)`:

- A grant creates one active relationship when no active row exists.
- A repeated grant by the same actor is a `DUPLICATE` quiet success and creates no second active relationship.
- A revoke changes the active relationship to the existing revoked state without deleting history.
- A repeated revoke by the same actor is a `DUPLICATE` quiet success.
- A revoke that races with a different actor is a `CONFLICT`; it does not silently retry past the competing change.

Actor attribution for duplicate/conflict classification uses the latest matching `Audit_Log` row for the relationship's current terminal action (`PROGRAM_LEADER_GRANT` for an active pair or `PROGRAM_LEADER_REVOKE` for a revoked pair). The six-column `Program_Leaders` relationship schema has no revoker columns, and this ADR does not add any; if audit history cannot establish the prior actor, the implementation must return a deterministic failure rather than inventing a relationship field.

These mutations do not use a client-supplied `Idempotency-Key` and are never automatically replayed after an ambiguous network result. The natural-key recheck is the deduplication mechanism. This is a deliberate CF2 exception to any generic HTTP retry set that would otherwise include all mutations.

### 4. Audit semantics

Grant and revoke preserve ADR-0015's single-lock and `Audit_Log` contract. When the authenticated actor and target are known, each authorized mutation outcome writes exactly one business audit row:

- `SUCCESS`
- `DUPLICATE`
- `CONFLICT`
- `DENIED` for an authorized actor rejected by a business precondition
- `FAILED` for a system/lock/quota failure during the mutation path

Rows use `PROGRAM_LEADER_GRANT` or `PROGRAM_LEADER_REVOKE`, the session-derived `Actor_User_ID`, target User and Program identifiers, optional `Reason`, the existing `Audit_Log` value fields, and the RPC `requestId` as `Correlation_ID`. No new `Program_Leaders` columns are assumed by this contract; the current six-column relationship schema remains authoritative.

`AUTH_REQUIRED`, pre-authority `FORBIDDEN`, malformed requests, and schema-level validation failures write no business audit row. They remain transport/RPC diagnostics. No audit-history UI is added by CF2.

### 5. Legacy `EVENT_LEADER` and many-to-many scope

1. The raw `Users` Sheet value is preserved. Agents and the HTTP normalizer do not rewrite `EVENT_LEADER` rows.
2. At the `loginUser` and `restoreApp` DTO boundary, the exact normalization is `EVENT_LEADER → MEMBER`. The public DTO contains no `legacyRole` or raw-role field. Other effective roles remain in the current `ADMIN`/`STAFF`/`MEMBER` vocabulary.
3. Program Leader authority comes only from active `Program_Leaders` rows. One member can have multiple active rows, for example `(U-1, P-1)` and `(U-1, P-2)`, and therefore lead Events in both Programs. One active row covers all Events in its Program. Revoking one Program leaves other Program assignments unchanged.
4. An `Event_Leaders` relationship would be a different domain model and is outside #133. It requires a separate decision and schema contract.

## Downstream verification handoff (not #133 implementation)

The following checklist is handed to the CF2 specification and implementation tickets. It is not implementation/deployment work or an acceptance claim for issue #133. Those downstream tickets must prove, locally and against a fresh isolated versioned `/exec` deployment, at minimum:

1. Raw `Users` Sheet role cells are byte-identical before and after the tested flows; no HTTP path writes them.
2. For raw `EVENT_LEADER`, both `loginUser` and `restoreApp` return effective `MEMBER` and never emit the literal `EVENT_LEADER` in the DTO.
3. A protected `FORBIDDEN` causes no more than one `restoreApp` for that user action and never replays the original RPC.
4. Member search requires a Member ID/name query, excludes inactive/pending users, exposes only minimal fields, and has no product-level ten-result cap.
5. STAFF/ADMIN reads succeed; MEMBER and Program Leader calls to Permissions reads and mutations return `FORBIDDEN` without business audit rows.
6. Two active assignments for one member across two Programs authorize exactly those Programs; an unrelated Program remains forbidden, and one assignment applies to all Events in its Program.
7. Grant/revoke natural-key duplicates create no second active relationship, competing revokes return `CONFLICT`, no automatic mutation replay occurs, and every authorized outcome has exactly one matching audit row with `Correlation_ID = requestId`.
8. No production or operational Google Sheet is mutated by the agent; any required schema/fixture change follows the Sheet-Immutable rules in `AGENTS.md`.

## Considered options

- **Expose Program IDs or raw `legacyRole` in `AuthenticatedBootstrap` — rejected.** The browser needs navigation visibility, not an authority claim or raw migration state. Scoped data can be returned by the relevant Permissions read and remains server-filtered.
- **Unbounded `restoreApp`/replay after `FORBIDDEN` — rejected.** It can loop or amplify traffic and can replay an operation after authority changed.
- **One permissions snapshot RPC — rejected.** It loads more member/relationship data than the operator requested and couples unrelated query, rate-limit, and privacy behavior.
- **Client idempotency ledger for grant/revoke — rejected.** The natural `(targetUserId, programId)` key already supports the required duplicate/conflict distinction; hidden replay can mask a competing change.
- **Rewrite legacy `EVENT_LEADER` rows during CF2 — rejected.** The Sheet remains immutable for agents, and the HTTP boundary can provide the effective role without changing production data.
- **Per-Event `Event_Leaders` — rejected for CF2.** The inherited authority is Program-scoped; per-Event leadership needs a new domain decision and schema.

## Consequences

- React can render only what the latest bootstrap permits and can display server-filtered relationship data, but cannot grant itself authority by editing state or request parameters.
- The backend owns current role/assignment checks, exact-Program filtering, mutation locking, duplicate/conflict classification, and audit writes.
- The legacy `EVENT_LEADER` migration remains an operator-owned Sheet concern; CF2 provides compatibility at the DTO boundary without a data rewrite.
- CF2 remains a contract/specification gate. It does not implement RPCs, frontend components, new Sheets, global role edits, audit-history UI, Event_Leaders, or deployed proof.
