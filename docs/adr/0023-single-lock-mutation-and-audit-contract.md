# ADR-0023 — Single-Lock Mutation and Audit Contract

*Renumbered from ADR-0015 on 2026-08-06: the previous `0015` number collided with the camera-origin ADR (`0015-external-camera-origin-for-qr-scanner.md`); this file was renamed to `0023-single-lock-mutation-and-audit-contract.md`. All inbound references were updated; issue-number citations (ADR-0009, ADR-0013, ADR-0019, CONTEXT.md, spec 073) that referred to this record by number now read ADR-0023.*

- **Status**: Proposed — official Apps Script API support verified (LockService, Session docs, this ADR's Research line); deployed `/exec` proof pending. Per `AGENTS.md`'s Apps Script evidence gate, this stays `Proposed` until a minimal implementation test and a fresh deployed `/exec` smoke test both pass; flip to Accepted then, with the test flow, deployment version, date, and observed result appended here.
- **Deciders**: Noah Wong, OMP planner (grill-with-docs)
- **Date**: 2026-08-01
- **Related**: Supersedes ADR-0009's write-pattern shape (lock ownership, two-phase audit calls). Carries forward ADR-0009's non-repudiation principle and reconciles the `Audit_Log` schema drift across ADR-0006, ADR-0009, and spec #63. Amends ADR-0013 (adds the missing `Audit_Log` sheet definition). Governs every mutating Apps Script service under Feature F1 (#79): Attendance, Enrollment, Events, Permissions. Implementation-facing contract: spec issue #115.
- **Research**: Context7 (`/websites/developers_google_apps-script`) returned `Invalid API key` (pre-existing Known Tooling Issue in `CONTEXT.md`); fell back to `developers.google.com/apps-script/reference/lock/*` and `.../base/session` directly, per the `AGENTS.md` Apps Script evidence gate's documented fallback order.
- **Grill session**: issue #58 (Feature F1 `#79`, map `#77`)

## Context

Issue #58 asked for one cross-cutting `Audit_Log` model and one single-lock write contract that every mutating service follows, with no nested locks and no misleading audit rows. Three prior decisions had already drifted apart on exactly this ground without anyone reconciling them:

- **ADR-0006** (2026-07-28): 8-column `Audit_Log` (`Log_ID, Timestamp, Actor_User_ID, Action_Type, Target_User_ID, Old_Value, New_Value, Reason`). `Action_Type` vocabulary predates Enrollment/Attendance and only covers `ROLE_CHANGE`, `PROGRAM_LEADER_GRANT/REVOKE`, `REGISTRATION_APPROVED/REJECTED`, `MEMBER_DEACTIVATED`.
- **ADR-0009** (2026-07-28, same day, later grill): extends to 11 columns (`Outcome`, `Correlation_ID`, `Actor_Session_Key`), and defines a two-phase `ATTEMPT` → `SUCCESS`/`ERROR` write pattern where `LockService.getScriptLock()` is acquired and released **inside `writeAuditLog()` itself**, called twice per mutation. The actual domain Sheet mutation happens **unlocked**, between the two audit calls.
- **Spec #63** (2026-07-28, approved): restates the plain ADR-0006 8-column shape, with no `Outcome`/`Correlation_ID`/`Actor_Session_Key`, and separately states "one caller-owned minimal script lock protects the final authority recheck, relationship-row mutation, audit append, and spreadsheet flush" — a *single*-acquisition shape that ADR-0009's own code sample does not actually implement.
- **ADR-0013** (2026-07-30, canonical schema record, newest of the four): does not mention `Audit_Log` at all.

ADR-0009's shape cannot satisfy the map's already-decided constraint ("one caller-owned minimal lock wraps final rechecks, duplicate detection, insert, and required audit append; helpers do not take nested locks") because the lock lives inside the audit helper, not the caller, and never covers the domain write. Something had to give — resolving that is this ADR's job.

## Decision

### 1. Lock ownership — supersedes ADR-0009's write-pattern shape

`LockService.getScriptLock()` is the only viable lock primitive for EFCC, established by documentation, not chosen by preference:

- `getDocumentLock()` returns `null` outside a containing document "such as from a standalone script or webapp" (`developers.google.com/apps-script/reference/lock/lock-service`). EFCC is both: `spreadsheet-access.gs` opens the Sheet via `SpreadsheetApp.openById()` (standalone, not container-bound), and the manifest deploys it as a `webapp`.
- `getUserLock()` is "private to the user" — it cannot serialize two different actors racing on the same shared resource (e.g. two Program Leaders scanning the same member into the same Event), which the map explicitly requires correctness against.

A new shared helper, `withScriptLock_(timeoutMs, fn)`, owns the entire lock lifecycle (acquire → `fn()` → `SpreadsheetApp.flush()` → release in `finally`). Every mutating `api_*` RPC entrypoint calls it **exactly once**, passing a callback that performs, in order: final authorization/business-precondition recheck, the domain Sheet write, and the audit append. `*-repository.gs` files (and any future `*-service.gs` domain-logic files) never call `LockService` directly — enforced by a grep-based assertion in `tests/gas/*.test.js` (mirroring the shape-check pattern ADR-0013's Known Issues already recommends), since Apps Script has no module boundary to hide the API behind.

This replaces ADR-0009's two-call-inside-the-helper shape. ADR-0009's non-repudiation principle (below) and schema-extension intent are kept; the mechanics are not.

### 2. Audit scope

Audited: privileged/administrative mutations (Program Leader grant/revoke, assisted enrollment by a leader/STAFF/ADMIN, Event create/cancel/edit, attendance void/correction) **and every attendance check-in write**, not just voids. Not audited: self-service member enrollment/cancellation (its own Sheet row already preserves history, and it is not a privileged action per spec #63's capability matrix), and login (it issues a session; it changes no domain data).

### 3. Outcome vocabulary

`Outcome` is one of `SUCCESS | DUPLICATE | CONFLICT | DENIED | FAILED`, replacing ADR-0009's `ATTEMPT | SUCCESS | ERROR | DENIED` (the `ATTEMPT` phase no longer exists — see §1).

- **`SUCCESS`** — the write happened as requested.
- **`DUPLICATE`** — the final in-lock recheck found the target already in the requested terminal state, from a request attributable to the **same actor** (their own repeat action — e.g. a re-scan by the same operator, or a retried void by the same admin). No-op, quiet success at the RPC boundary.
- **`CONFLICT`** — the final in-lock recheck found the target already in the requested terminal state, but a **different actor** got there first. Scoped to correction/undo actions that carry a reason another actor might not know about — Attendance Void, Enrollment Cancel, Program Leader Revoke, Event Cancel/Edit. Plain attendance check-in re-scans are **always `DUPLICATE` regardless of actor** — a second operator scanning an already-present member carries no competing information worth flagging distinctly, and the map already calls concurrent multi-scanner check-in a normal, silent case.
- **`DENIED`** — the precondition was never true for an otherwise-authorized caller (e.g. a Program Leader with a valid session and role scans a member who is not enrolled in that Program — `NOT_ENROLLED`). Reserved for callers who passed the RPC-boundary session/role gate (`AUTH_REQUIRED`/`FORBIDDEN` in `rpc-envelope.gs`'s `RPC_CODES`) but failed a business-scope check inside the lock. A caller who never had a valid session or the role to call the RPC at all never reaches the audit path — that stays in the existing `rpcLog_` Cloud Logging diagnostics (no PII, already shipped), since there is no legitimate actor/target context yet to audit.
- **`FAILED`** — a system-level failure: lock timeout, Apps Script quota (`"Service invoked too many times"`), or any other exception during the write.

### 4. Idempotency mechanism

No client-supplied idempotency key for these mutations. The final in-lock recheck queries by natural business key — `(member, event)` for attendance, `(member, program)` for enrollment/leader-grant, target row ID for void/revoke/cancel — which the recheck has to query anyway to enforce the domain precondition. The demo form's `requestKey` pattern (`Code.gs`, CacheService + PropertiesService) stays scoped to that one arbitrary-payload use case; it is not the general mechanism here. The actor comparison for `DUPLICATE` vs. `CONFLICT` reads the existing row's `Actor_User_ID` against the current session's own `User_ID` — both server-trusted, no client nonce involved.

### 5. Partial-failure posture — domain write succeeds, audit append fails

Google Sheets has no cross-write transactions (ADR-0009 already established this; the mutation cannot be rolled back once committed). ADR-0009's own code sample had a real ordering gap: its Cloud Logging fallback (`console.log(JSON.stringify({audit: row}))`) ran on the line *after* `appendRow` succeeded, so an `appendRow` failure left zero breadcrumb anywhere. Fixed here: inside `withScriptLock_`, the full audit row is logged to Cloud Logging via `console.log` **before** the `Audit_Log.appendRow` call, guaranteeing a breadcrumb survives even total `Audit_Log` failure. If `appendRow` then throws, the exception propagates — the RPC returns `FAILED`/`INTERNAL_ERROR` to the caller even though their domain mutation already committed (matching ADR-0009's rule that an audit-write failure must never be silently swallowed). A client retry lands on the `DUPLICATE`/`CONFLICT` path per §3, so no double-write results; the caller does see an honest failure despite their data having been saved.

### 6. Final `Audit_Log` schema (supersedes ADR-0006 §Audit Log, ADR-0009 §Schema Change, spec #63's Audit_Log column list)

| Column | Source | Rationale |
|---|---|---|
| `Log_ID` | ADR-0006 | `Utilities.getUuid()`, row PK |
| `Timestamp` | ADR-0006 | `new Date()`, sheet-native — the map's "no raw Date crosses the boundary" rule governs RPC DTOs to the browser, not values stored in Sheet cells |
| `Actor_User_ID` | ADR-0006 | The authenticated EFCC session's own `User_ID` — every audited actor is authenticated by definition (§2) |
| `Action_Type` | ADR-0006, expanded | `PROGRAM_LEADER_GRANT`, `PROGRAM_LEADER_REVOKE`, `ENROLLMENT_ASSISTED_ADD`, `ENROLLMENT_ASSISTED_CANCEL`, `EVENT_CREATE`, `EVENT_CANCEL`, `EVENT_EDIT`, `ATTENDANCE_CHECKIN`, `ATTENDANCE_VOID`. `ROLE_CHANGE` stays defined for schema continuity but is currently unreachable — spec #63 made global role changes spreadsheet-only. |
| `Target_User_ID` | ADR-0006 | The member acted upon |
| `Target_Program_ID` | **New** | No prior schema carried Program context; blank when not applicable (e.g. a pure role/member action has none) |
| `Target_Event_ID` | **New** | Same rationale, for Event/Attendance context |
| `Old_Value` | ADR-0006 | — |
| `New_Value` | ADR-0006 | — |
| `Reason` | ADR-0006 | Optional, as already established |
| `Outcome` | ADR-0009, revised | §3's five-value vocabulary |
| `Correlation_ID` | ADR-0009, repurposed | **Reused as the RPC's own `requestId`** (already generated by `rpcRequestId_()` in `rpc-envelope.gs`) instead of a second, independent UUID. ADR-0009's original purpose — threading an `ATTEMPT` row to its outcome row — no longer applies (§1 removes the two-phase pattern); reusing `requestId` instead gives a free join key between the business `Audit_Log` and the existing `rpcLog_` Cloud Logging diagnostics, at zero extra cost. |

`Actor_Session_Key` (`Session.getTemporaryActiveUserKey()`, ADR-0009) is **dropped**. Two reasons: EFCC already has a durable, meaningful `Actor_User_ID` from the application's own PIN session for every audited action, so an Apps-Script-level anonymous-visitor proxy adds no forensic value here. And its reliability under EFCC's exact deployment shape — `webapp.access = ANYONE_ANONYMOUS`, `executeAs = USER_DEPLOYING` — is undocumented: `Session.getTemporaryActiveUserKey()`'s reference page states it is "unique to the active user" without addressing anonymous-access deployments, and the neighboring `getActiveUser()` entry confirms email is unavailable in exactly this "execute as me" deployment shape, without clarifying whether the temporary key remains meaningfully per-visitor unique in the same configuration. Per the `AGENTS.md` Apps Script evidence gate, an undocumented behavior is not silently assumed; here it is avoided rather than guessed at, since the column was redundant regardless.

## Consequences

- Positive: one mechanically-enforced lock-acquisition point per mutation (§1), checkable by a grep test rather than a comment-only convention.
- Positive: `Outcome` now distinguishes "nothing to do" (`DUPLICATE`) from "someone else already acted" (`CONFLICT`) from "you were never allowed" (`DENIED`) from "the platform failed" (`FAILED`) — four different operational stories that a single `SUCCESS`/`ERROR`/`DENIED` vocabulary could not tell apart.
- Positive: a Cloud Logging breadcrumb survives total `Audit_Log` failure (§5), closing the real gap in ADR-0009's original code sample.
- Negative: every mutating `api_*` function must remember to route its Sheet write and audit append through `withScriptLock_` — no automatic enforcement beyond the grep test (same accepted tradeoff as ADR-0009: GAS V8 has no clean decorator mechanism).
- Risk carried forward from ADR-0009: Sheets-level tamper evidence remains best-effort; a determined spreadsheet editor could alter historical rows. Out of scope here, as it was in ADR-0009.

## Non-goals

- Cryptographic hash-chaining of audit rows (unchanged from ADR-0009 — rejected as impractical in Sheets).
- A client-supplied idempotency key for the mutations this ADR covers (§4) — the demo form's `requestKey` pattern remains scoped to its original arbitrary-payload use case.
- Retrofitting existing read-only repositories (`users-repository.gs`, `programs-repository.gs`, `program-leaders-repository.gs`) — none of them mutate data today; this ADR governs the mutating services Feature F1 unblocks.
