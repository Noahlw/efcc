# ADR-0006: Admin Capability Matrix, Program Leader Model & Member Approval Flow

**Status**: Accepted
**Date**: 2026-07-28
**Context**: 顯恩堂系統 / EFCC Church Management System
**Parent Wayfinder Ticket**: [#19](https://github.com/Noahlw/efcc/issues/19) (D1, decision ticket under map [#18](https://github.com/Noahlw/efcc/issues/18))
**Amends**: [ADR-0005](./0005-role-based-access-control-and-pin-auth.md) — retires the global `EVENT_LEADER` role and its `rolesPriority` table (see amendment note appended to ADR-0005)

---

## Decision

Four changes to the RBAC model established by ADR-0005:

1. **The role hierarchy shrinks from four tiers to three**: `ADMIN` > `STAFF` > `MEMBER`. Global `EVENT_LEADER` is retired.
2. **`STAFF` gains near-parity with `ADMIN`.** The only remaining `STAFF` restriction is role-assignment: `STAFF` cannot change the role of an existing `STAFF` account (no promoting to `ADMIN`, no demoting a peer), and `ADMIN` membership itself is granted/revoked exclusively by a direct spreadsheet edit — never through the app.
3. **A new orthogonal concept, Program Leader**, replaces global `EVENT_LEADER`: a member (regardless of their global `Role`) can be granted full `STAFF`-equivalent event-management power **scoped to one or more specific programs**.
4. **`Pending` becomes a real member-registration gate**, not dead spec: self-registration lands in `Pending`; `STAFF`/`ADMIN` approve or reject.

---

## Rationale

The prior model (ADR-0005) specified four tiers but the implementation never differentiated `ADMIN` from `STAFF`, and `EVENT_LEADER` granted blanket access to manage *any* event system-wide — too broad for a role meant to represent "leads one ministry." Splitting event-management into a scoped, many-to-many assignment (Program Leader) matches the actual shape of a church's ministry structure: one member can lead multiple programs (e.g. Youth Worship *and* Sunday School), and a program can have more than one leader.

`STAFF` was widened to near-`ADMIN` parity because the only capability that genuinely needs a hard backstop is control over who else holds administrative power — everything else (catalog edits, data export, approvals, deactivation) is operational and multiple trusted staff should be able to do it without bottlenecking on one person.

---

## Capability Matrix

| Capability | `ADMIN` | `STAFF` | Program Leader (scoped) | `MEMBER` |
| --- | --- | --- | --- | --- |
| View member roster | ✅ | ✅ | ❌ | ❌ |
| Assign roles (`STAFF` / `MEMBER`) | ✅ full | ✅ upward-only; cannot touch an existing `STAFF` account | ❌ | ❌ |
| Grant / revoke `ADMIN` | Spreadsheet edit only — no UI/RPC path for anyone | | | |
| Grant / revoke Program Leader | ✅ | ✅ | ❌ | ❌ |
| Approve / reject pending registrations | ✅ | ✅ | ❌ | ❌ |
| Deactivate a member | ✅ | ✅ | ❌ | ❌ |
| Edit program catalog | ✅ | ✅ | ❌ | ❌ |
| Create / cancel / edit events | ✅ any program | ✅ any program | ✅ own program(s) only | ❌ |
| Take attendance (scan / manual) | ✅ any program | ✅ any program | ✅ own program(s) only | ❌ (self check-in only) |
| View attendance | ✅ any program | ✅ any program | ✅ own program(s) only | ❌ |
| View care dashboard / activity profiles | ✅ | ✅ | ❌ | ❌ |
| Export data | ✅ | ✅ | ❌ | ❌ |

`STAFF` and `ADMIN` are functionally identical except for the single role-assignment boundary above.

---

## Program Leader Model

**Data model**: a new `Program_Leaders` sheet (many-to-many join, mirroring the existing `Enrollments` join-sheet pattern between `Users` and `Programs`):

| Column | Purpose |
| --- | --- |
| `Assignment_ID` | Unique row id |
| `Program_ID` | The program this assignment scopes to |
| `User_ID` | The assigned member — their global `Role` is unaffected by this assignment |
| `Assigned_By` | `User_ID` of the `STAFF`/`ADMIN` who granted it |
| `Assigned_Date` | Timestamp |
| `Status` | `Active` / `Revoked` |

**Semantics**: a member's authority to create/cancel/edit events, take attendance, and view attendance for a given program derives from having an `Active` `Program_Leaders` row for that `Program_ID` — not from their `Users.Role`. A member can hold multiple active assignments across different programs. A program can have multiple active leaders. Granting or revoking requires `STAFF` or `ADMIN`.

**Migration of existing `EVENT_LEADER` users**: there is no existing data linking a global `EVENT_LEADER` to the specific program(s) they lead — the old model never recorded that. Rollout is therefore:

1. Every `Users.Role = EVENT_LEADER` row is reset to `MEMBER`.
2. `STAFF`/`ADMIN` manually re-grant `Program_Leaders` assignments per person, per program, via the admin console.
3. To reduce manual guesswork, the migration tooling may scan `Events.Created_By` history and suggest which program(s) each former `EVENT_LEADER` was actually running — a prefill hint for the admin doing the backfill, not an automatic migration, since a suggestion could be wrong.

This migration is **out of scope for shipping attendance-taking** and should not block it — see the Sequencing note below.

---

## `Pending` Member Approval Flow

- `api_registerUser` writes `Status = "Pending"` (currently hardcodes `"Active"` at 程式碼.js ~L599 and ~L1064 — both sites must change).
- A `Pending` member cannot log in. ADR-0002's existing behavior already covers this correctly: login is rejected with "Account pending approval."
- `STAFF` or `ADMIN` approve or reject from a pending-registrations queue. Rejecting requires a reason (see Audit Log below).
- Approving flips `Status` to `Active`; the member can then log in normally with no further change needed.

---

## Audit Log

A new append-only `Audit_Log` sheet, following the same "sheet as table" pattern as `Attendance` (ADR-0001):

| Column | Purpose |
| --- | --- |
| `Log_ID` | Unique row id |
| `Timestamp` | When |
| `Actor_User_ID` | Who performed the action |
| `Action_Type` | `ROLE_CHANGE`, `PROGRAM_LEADER_GRANT`, `PROGRAM_LEADER_REVOKE`, `REGISTRATION_APPROVED`, `REGISTRATION_REJECTED`, `MEMBER_DEACTIVATED` |
| `Target_User_ID` | Who was acted on |
| `Old_Value` | Prior value (blank where not applicable, e.g. an approval) |
| `New_Value` | New value (e.g. the new role, or the program name for a Program Leader grant) |
| `Reason` | Free text — **required** for `REGISTRATION_REJECTED`, optional elsewhere |

Every admin mutation appends one row here inside the same `LockService`-guarded transaction as the mutation itself.

---

## Sequencing note (does not block attendance shipping)

None of this ADR's decisions require changing the *currently working* attendance flow (QR scanner, manual check-in, `LockService` duplicate guard). The existing code gates attendance actions on `EVENT_LEADER`-or-above via `checkRoleAtLeast_`. Retiring the global `EVENT_LEADER` role in code should happen **only** once the `Program_Leaders` RPC and admin UI exist to reassign today's leaders — flipping the role off earlier would strand currently-working leaders with no replacement mechanism. See the implementation ticket roster under map #18 for the ordering.

---

## Consequences

- `ADR-0005`'s `rolesPriority` table (`MEMBER: 1, EVENT_LEADER: 2, STAFF: 3, ADMIN: 4`) is superseded by a 3-tier `{ MEMBER: 1, STAFF: 2, ADMIN: 3 }` table plus the orthogonal Program Leader check.
- Every existing role-gated endpoint that previously accepted `EVENT_LEADER` as a floor must be re-gated to accept "role ≥ `STAFF`, OR active Program Leader for the relevant program" instead.
- `CONTEXT.md`'s domain glossary, Data Store table, and Architecture Decisions table are updated alongside this ADR.
