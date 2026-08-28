# 091 — Stackable 身份組 Backend and Authorization Contract

**Status:** Proposed — selected through the 2026-08-27 CEO grill; implementation pending
**Parent authority:** `CONTEXT.md`, ADR-0042, ADR-0043, the accepted D1/Worker boundary, and the active product/design-system contract
**Supersedes for identity/permission behavior:** the role boundary in Spec 079, the fixed-role clauses in Spec 460, the permission-write assumptions in Specs 453/454, and the deferred S4.1 custom-role brief
**Scope:** pre-production backend/domain rewrite only. No production code, migration, fixture, or UI implementation is authorized by this document alone.

---

## 1. Outcome

Build the backend model required for a Discord-like identity experience without importing Discord's brand or weakening EFCC's authorization rules.

The system must support:

- Multiple assignable 身份組 on one eligible Active Account
- A visible hierarchy tree with non-assignable category headings
- Admin as the protected highest identity with every permission enabled and locked
- `會友基礎` as the protected automatic lowest baseline
- Department-owned and Program-owned scoped identities
- Additive effective permissions across assignments
- Granular role-management capabilities
- Server-owned hierarchy, scope, revision, idempotency, and audit checks
- Clear Cantonese display labels for non-developers
- A disposable pre-production clean cutover from the obsolete one-global-role model

The backend owns every authorization decision. The browser receives an affordance projection; it never supplies authority.

## 2. Non-goals

This specification does not add:

- Discord colors, assets, server/channel concepts, or gaming vocabulary
- A second component library or theme provider
- A generic plugin engine or arbitrary user-defined authorization vocabulary
- Household check-in, care workflows, S7 roster expansion, or unrelated domain features
- A production physical-delete operation for live identity history
- Multi-account bulk identity assignment in the first release
- A mobile layout implementation; layout work is a separate gated delivery after the colleague's polish commit

## 3. Canonical language

| Technical/domain term | Cantonese product term | Meaning |
| --- | --- | --- |
| Role | 身份組 | An ordered, assignable permission-bearing identity. |
| Role Definition | 身份組定義 | The named identity record with position, kind, grants, and optional scope. |
| Role Category | 身份組分類 | A non-assignable heading that organizes identities. |
| Role Assignment | 身份組指派 | The relationship between an Active Account and an identity. |
| Role Position | 身份組順位 | The identity's place in the hierarchy tree. |
| Effective Permission | 有效權限 | The additive result of all assigned identity grants within scope. |
| Role Management Capability | 身份組管理能力 | A separately authorized operation over identities, assignments, grants, names, order, or scope. |
| Custom Role | 自訂身份組 | A non-system identity created by an authorized Admin or Staff. |
| Member Baseline | 會友基礎 | The automatic, fixed participant baseline applied to every Active Account. |

Technical capability keys may appear in secondary diagnostics and API documentation. They are never the primary operator label.

## 4. Domain model

### 4.1 Role Categories

A Role Category is a structural grouping record. It is not assignable and never grants permission.

The initial category tree is derived from the church domain:

```text
部門管理身份組                         system category
  成人部門                              Department category
    成人部門管理者                       assignable scoped identity
    成人課程管理身份組                   non-assignable Department-owned category
      成人崇拜帶領                       assignable Program-scoped identity
  青少年部門                            Department category
    青少年部門管理者                     assignable scoped identity
    青少年課程管理身份組                 non-assignable Department-owned category
      青少年查經帶領                     assignable Program-scoped identity
```

- `部門管理身份組` is the top category for Department-management identities.
- Each Department owns one `課程管理身份組` category.
- Each Program identity belongs below the category of its owning Department.
- Categories grant no permission, are never assigned, and are not counted in an account's identity set.
- Role Categories are fixed, system/domain-owned, and read-only in the product. No actor, including Admin, can create, rename, reorder, reparent, archive, or delete a category through the app.
- Department and Program domain structure plus the explicit pre-production seed/reset create the required categories. Admin may create global or scoped Role Definitions only under an existing permitted category.

### 4.2 Role Definitions

Each assignable Role Definition has:

- Stable opaque identity ID
- Globally unique display name
- Role kind: `SYSTEM`, `GLOBAL`, `DEPARTMENT_SCOPED`, or `PROGRAM_SCOPED`
- Parent Role Category, unless it is a protected top-level system identity
- Mutable hierarchy position within the global tree
- Exactly zero or one explicit scope; scoped identities have exactly one Department or Program scope
- Active or archived lifecycle
- Permission grants
- Created/updated actor and timestamps

System identities:

- `Admin`: fixed highest, all permissions enabled, display name fixed, cannot be moved, renamed, archived, edited, or assigned through product identity management. Admin membership is seeded/operational only.
- `Staff`: assignable non-Admin system identity below Admin; its grants are configurable only by an eligible higher identity.
- `會友基礎`: fixed lowest automatic baseline; cannot be assigned, removed, moved, renamed, archived, or edited.

A global custom identity has no Department/Program scope and may be created only by Admin. A scoped identity has exactly one Department or Program scope and must appear under the corresponding category.

### 4.3 Role Assignments

An Active Account may hold multiple assignable identities. An assignment contains:

- Account ID
- Role Definition ID
- Assignment state: `ACTIVE` or `REVOKED`
- Scope copied from the Role Definition for display and authorization
- Granting actor, timestamp, revoking actor, timestamp, and reason
- Idempotency/correlation reference

Uniqueness: one Active Account cannot hold the same active Role Definition twice. Re-adding a revoked identity creates a new auditable assignment event; the revoked record remains immutable. At most one active assignment may exist for an Account/Role Definition pair.

Assignment targets are eligible non-Admin Active Accounts, including Staff accounts and accounts already holding other scoped identities. Pending, Suspended, Inactive, and Admin accounts are rejected server-side. An actor cannot add or revoke its own assignments.

### 4.4 Permission Grants

A Role Definition owns a set of grant records from the controlled capability catalog. Grants are additive; there is no explicit deny state in this release.

- New Custom Roles start with zero grants.
- Scoped child identities carry their own grants and do not inherit hidden grants from category headings.
- `Admin` is represented as all permissions enabled and locked; its grant set cannot be edited by any actor.
- `會友基礎` grants ordinary participant capabilities and is system-locked.
- A Role Definition may grant only capabilities its editor is authorized to grant.

### 4.5 Effective Permission resolution

For an Active Account and requested resource scope:

1. Include `會友基礎`.
2. Include every active Role Assignment for the account.
3. Union each identity's grants.
4. Intersect scoped grants with their one declared Department or Program scope.
5. Apply Admin's protected all-permission rule when the account has Admin.
6. Return the effective capability only if the requested resource is within the grant's scope.

The highest assigned identity is used for role-management authority, not for subtracting capability grants. A lower identity cannot remove a capability granted by another identity.

## 5. Hierarchy and management authority

### 5.1 Position rules

- Admin is permanently highest and is not an ordinary assignable Role Definition.
- `會友基礎` is permanently lowest.
- Every active assignable Role Definition has one unique position in a single global total order. Fixed Role Categories anchor contiguous subtrees but are not movable order entries.
- Within a fixed parent category, sibling Role Definitions use explicit unique order keys. Reorder changes only a Role Definition's sibling position; it cannot change parent category or scope.
- An account's highest identity is its highest globally ordered active assignment. Scope never changes that comparison; the requested operation must separately pass the scope rules in §5.2.
- A Role Definition can be moved only below the actor's highest identity and only within its fixed parent category.
- An actor cannot assign or revoke itself, or move, rename, edit permissions for, or change scope of its highest identity.
- Admin accounts are exclusive and hold no lower product Role Assignments. Admin membership is changed only through seed/operational procedure, never through the app; the last Active Admin cannot be removed, suspended, or deactivated.
- Every order mutation uses an order revision. A stale revision returns a named conflict and never applies a partial reorder.

### 5.2 Scope rules

- Global identities apply according to their grants across the church domain.
- Department-scoped identities apply only to exactly one Department.
- Program-scoped identities apply only to exactly one Program.
- A scoped actor cannot assign, reorder, rename, edit, or create an identity outside the actor's effective scope.
- Receiving another identity never widens an existing identity's scope.
- Staff-created identities are always scoped children below Staff.
- A Program Leader cannot create an identity by virtue of `program.manage`; `role.create` is separate.

## 6. Granular capability catalog

The capability catalog is code-owned and closed. The UI uses the Cantonese display labels below; the keys are secondary detail.

| Key | Primary UI label | Contract |
| --- | --- | --- |
| `role.read` | 檢視身份組 | View identity definitions, categories, assignments, and scope permitted to the actor. |
| `role.assign` | 指派身份組 | Add an existing lower identity to an eligible Active Account within scope. |
| `role.revoke` | 撤銷身份組 | Remove an existing lower identity from an account within scope. |
| `role.reorder` | 調整身份組順序 | Move a lower Role Definition among siblings in its fixed parent category without changing grants or scope. |
| `role.name.write` | 編輯身份組名稱 | Rename a lower identity subject to global uniqueness. |
| `role.permissions.read` | 檢視權限 | Inspect another lower identity's grant state. |
| `role.permissions.write` | 編輯權限 | Edit another lower identity's grant set. |
| `role.scope.read` | 檢視適用範圍 | Inspect Department/Program scope. |
| `role.scope.write` | 編輯適用範圍 | Change a lower identity's scope without widening actor authority. |
| `role.create` | 新增身份組 | Create a new assignable Role Definition under an allowed category. |
| `role.delete` | 停用身份組 | Production lifecycle edit: archive/deactivate a Role Definition and its live assignments. Physical deletion is development reset only. |

`role.manage` is not a grantable aggregate capability. `Admin` has all catalog capabilities, but Admin's own identity remains immutable.

### 6.1 Default built-in grants

| Identity | Default grants |
| --- | --- |
| Admin | All `role.*` operations except moving, renaming, editing, archiving, or changing Admin itself. |
| Staff | `role.read`, `role.assign`, `role.revoke`, `role.reorder`, `role.name.write`, `role.permissions.read`, `role.permissions.write`, `role.scope.read`, `role.scope.write`, `role.create`, and `role.delete` for lower identities. Staff-created identities are scoped-only. A scope write must remain inside the Staff actor's effective authority and atomically reparent the identity under the fixed category for that explicit scope. |
| Department Manager | `role.read`, `role.assign`, `role.revoke`, `role.reorder`, `role.permissions.read`, `role.permissions.write` within the actor's Department scope. No `role.create` or `role.delete` by default. |
| Program Leader | `role.read`, `role.assign`, and `role.revoke` within the actor's Program scope. No reorder, permission-write, scope-write, create, or delete by default. |
| Member | No role-management capability. |
| New Custom Role | No capability grants. |

The seed may narrow these defaults for a particular deployment, but it may not grant a capability outside the actor/target position and scope rules.

## 7. Backend state and revisions

### 7.1 Role Definition state

```text
new -> active -> archived
       ^          |
       |----------|
```

- Only Admin/Staff with `role.create` may create a Role Definition in an allowed fixed category.
- Creation always starts with zero grants.
- Archiving atomically revokes every active assignment after impact review and blocks new assignments.
- Restoring reactivates the Role Definition and its preserved grants, but never reactivates revoked assignments.
- `role.delete` authorizes this audited archive/restore lifecycle; it never physically deletes production history.
- Admin and `會友基礎` never leave their protected states.

### 7.2 Assignment state

```text
active -> revoked
```

A revoked assignment no longer contributes to Effective Permission. The assignment event and reason remain immutable in production audit history. Assigning the same Role Definition again creates a new active assignment event and never reactivates the old record.

### 7.3 Permission draft state

```text
clean -> dirty -> saving -> clean
                 |-> conflict -> restarted clean/draft
                 |-> error -> dirty
```

- Permission writes use a base policy revision.
- A conflict discards/restarts the local draft from the authoritative server policy.
- Controls are locked while saving; unknown in-flight edits are never merged silently.
- A successful response returns the authoritative grant set and new revision.

### 7.4 Role-order draft state

```text
clean -> moving -> saving -> clean
                  |-> conflict -> explicit keep-latest choice
```

A stale order revision returns the latest tree plus a named conflict. The operator chooses `保留我的排序` or `採用最新排序` before retrying.

## 8. Normalized storage contract

The clean cutover uses explicit relational records. Do not encode roles, assignments, scopes, positions, or grants as an account JSON blob.

### 8.1 Required records

| Record | Required fields and invariants |
| --- | --- |
| `role_categories` | ID, parent category ID, kind, Department/Program owner, display name, order key, lifecycle, timestamps. Parent categories are non-assignable. |
| `role_definitions` | ID, display name, normalized unique name, kind, category ID, scope kind/ID, order key, lifecycle, created/updated actor and timestamps. Admin and Member Baseline are protected. |
| `role_assignments` | Account ID + Role Definition ID unique while active, assignment state, actor/reason/timestamps, FK to Active Account and Role Definition. |
| `role_grants` | Role Definition ID + capability key unique, grant state, actor/timestamps, FK to closed capability catalog. |
| `role_capabilities` | Closed catalog key, Cantonese label, description, risk class, whether system-only, and whether scope is required. The catalog is code-owned; operators cannot create arbitrary capability keys. |
| `role_order_revisions` | Monotonic revision, ordered tree snapshot/hash or normalized order changes, actor, timestamp, idempotency/correlation reference. |
| `role_policy_revisions` | Monotonic grant-policy revision and authoritative change metadata. |
| `idempotency_records` | Actor, key, request hash, operation, terminal response reference, timestamps; changed request with the same key is rejected. |
| `audit_events` | Immutable append-only privileged mutation event with actor, operation, target identity/account/scope, outcome, old/new summary, reason, correlation ID, and revision. |

Stable IDs remain opaque. Display names and scopes are safe human-readable output; credentials and secrets never enter this projection.

### 8.2 Constraints

- `Admin` has one protected highest position and cannot be edited, renamed, archived, or assigned through ordinary identity creation.
- `會友基礎` is automatically applied, protected lowest, and non-assignable.
- Scoped Role Definitions have exactly one Department or Program scope.
- Global display names are unique after trim/Unicode normalization/case folding.
- An active assignment references an Active Account and an active Role Definition.
- A Role Definition may not be positioned above its parent/actor constraints.
- A grant key must exist in the closed capability catalog.
- A Custom Role may not start with grants.
- Foreign keys and closed vocabularies are enforced in D1.
- Production privileged mutations never physically delete audit records.

## 9. Operation contracts

All operations are authenticated Worker commands. Each command recomputes actor authority from D1, validates the target, accepts an idempotency key, and returns a request/correlation ID plus the authoritative relevant revision.

### 9.1 Read operations

- `GET role tree`: returns categories, Role Definitions, positions, kind, scope, assignment counts, protected state, and permitted action affordances.
- `GET Role Definition`: returns summary, grant state, assigned-account projection, scope, order, revision, and allowed operation capabilities.
- `GET Account identities`: returns active assignments plus scoped Effective Permission summary grouped by Department/Program.
- `GET capability catalog`: returns display label, description, risk, lock state, and technical key as secondary detail.

### 9.2 Mutation operations

- `POST Role Definition`: guided global/scoped creation; Staff may create only scoped child identities under permitted Department-owned categories; returns empty identity and revision.
- `POST Account identity batch`: one account plus several additions; all-or-nothing; existing assignments remain unchanged; no multi-account bulk in the first release.
- `POST assignment revoke`: one account plus one identity; idempotent.
- `PATCH identity order`: one Role Definition sibling move inside its fixed parent category plus base order revision; parent category and scope do not change; stale revision returns conflict.
- `PATCH identity name`: one identity plus globally unique name; stable ID and assignments remain unchanged.
- `PATCH identity permissions`: one Role Definition plus base policy revision and complete intended grant changes; all-or-nothing.
- `PATCH identity scope`: one lower identity plus a new explicit single scope inside actor authority; atomically reparent under the corresponding fixed category and never widen actor authority.
- `PATCH identity lifecycle`: archive atomically revokes live assignments after impact review; restore reactivates only the Role Definition and preserved grants; preserve all assignment and audit history.

### 9.3 Named failure outcomes

| Code | Trigger | Required result |
| --- | --- | --- |
| `ROLE_FORBIDDEN` | Actor lacks the operation capability | No mutation; DENIED audit. |
| `ROLE_HIGHEST_PROTECTED` | Actor targets its highest identity | No mutation; named explanation. |
| `ROLE_ADMIN_PROTECTED` | Actor targets Admin | No mutation; Admin remains all-on and locked. |
| `ROLE_BASELINE_PROTECTED` | Actor targets 會友基礎 | No mutation. |
| `ROLE_SCOPE_MISMATCH` | Target is outside actor/identity scope | No mutation; preserve current selection/draft. |
| `ROLE_TARGET_INELIGIBLE` | Account is Pending/Suspended/Inactive | No mutation; picker explains eligibility. |
| `ROLE_NAME_TAKEN` | Normalized display name already exists | No mutation; return existing-name conflict without leaking private data. |
| `ROLE_ORDER_CONFLICT` | Stale hierarchy revision | No mutation; return latest tree/revision. |
| `ROLE_POLICY_CONFLICT` | Stale permission revision | No mutation; return latest policy/revision. |
| `ROLE_IDEMPOTENCY_REUSE` | Same key with different request hash | No mutation; reject request. |
| `ROLE_ASSIGNMENT_DUPLICATE` | Account already has identity | Idempotent no-op or named duplicate outcome; no second assignment. |
| `ROLE_ARCHIVED` | New assignment targets archived identity | No mutation; explain identity is unavailable. |
| `ROLE_INVALID_PARENT` | Child/category relationship violates tree | No mutation; return named validation error. |

## 10. Authorization flow

```text
Cookie session
  -> load Active Account
  -> load all active identity assignments
  -> resolve highest identity position
  -> resolve requested operation capability
  -> resolve target identity/account/scope
  -> reject Admin/baseline/highest/above-highest violations
  -> reject scope mismatch or ineligible account
  -> validate revision + idempotency hash
  -> execute one D1 transaction
       -> write normalized mutation
       -> write immutable audit outcome
       -> write idempotency terminal result
  -> return authoritative state + revision
```

Nil, empty, malformed, and upstream-error paths are explicit:

- Missing session → `AUTH_REQUIRED`, no query beyond session resolution.
- Empty role/assignment target → `ROLE_INVALID_TARGET`, no mutation.
- Unknown identity/category/capability/scope → named `ROLE_NOT_FOUND`/`ROLE_INVALID_*`, no partial write.
- Stale revision → conflict response, no partial write.
- D1/Worker failure → `FAILED` audit outcome where the transaction reaches the audit boundary; client retains the draft/selection and offers retry or reconciliation.

## 11. Idempotency and audit

Every role mutation uses an actor-bound idempotency key. The same actor, key, operation, and request hash replays the terminal response. A changed request with the same key is rejected. Response loss must never turn a committed assignment, reorder, rename, permission write, or scope edit into an apparent failure.

Production audit events are immutable and append-only. They capture operation, actor, target, scope, previous/current summary, outcome (`SUCCESS`, `DUPLICATE`, `CONFLICT`, `DENIED`, or `FAILED`), reason, revision, and correlation ID. No credential, password, token, member phone, attendance detail, or pastoral note is copied into role telemetry.

Operational metrics are separate and PII-safe:

- operation/outcome count
- latency bucket
- scope kind
- conflict/timeout/reconciliation count
- correlation ID for support tracing

The release runbook defines alert thresholds for elevated failures, conflicts, and response-loss reconciliation.

## 12. Pre-production cutover and reset

This is a clean pre-production rewrite:

1. Rewrite/remove obsolete permission migration files in the development branch.
2. Replace the old fixed-global-role tables/DTO assumptions with the normalized records above.
3. Recreate disposable local and CI D1 databases from zero.
4. Seed Admin, Staff, `會友基礎`, Department categories, Department-scoped identities, Department-owned course categories, Program identities, grants, and E2E accounts.
5. Detect the obsolete schema before migration/seed. If found, fail with explicit reset instructions.
6. Never automatically drop an unknown or production database.
7. Do not preserve a compatibility adapter for the obsolete one-global-role DTO.
8. Production audit/history rules remain intact; this reset is not a production deletion feature.

## 13. Acceptance scenarios

### Identity tree

- Admin sees Admin pinned highest and `會友基礎` pinned lowest.
- A Department category expands to its Department identities and its Department-owned course category.
- A Program identity appears only under its owning Department/course category.
- Fixed Role Categories remain unchanged while authorized Role Definitions reorder among siblings without changing grants or scope.
- Staff cannot see global-identity creation; Admin can choose global or scoped Role Definition creation under existing fixed categories.

### Account assignments

- An eligible Active Account can receive multiple non-Admin identities.
- A Staff account can hold Staff + Adult Department Manager + Youth Program Leader.
- Pending/Suspended/Inactive targets are absent from the eligible picker and rejected server-side if tampered.
- One Account selecting several identities commits all additions or none.
- Removing one identity shows lost/retained Effective Permissions when access changes.
- An actor cannot add or revoke its own assignments; an Admin account cannot receive lower assignments through product UI.
- Revoking and later re-adding the same identity creates a new auditable assignment event while the old revoked event remains immutable.

### Permission editing

- Admin selecting Staff opens `身份組詳情` → `權限編輯` with a search-only toolbar and a continuous category-grouped list.
- Admin permission state is visible, all on, disabled, and explained as system-fixed; no Save action exists.
- Staff cannot edit Staff as its highest identity but may edit lower identities when the exact capability and scope allow.
- A Program Leader cannot create identities or edit a higher/equal identity without an explicit grant.
- Switches expose `role=switch`, `aria-checked`, keyboard activation, lock state, and WCAG 2.2 AA focus behavior.

### Recovery and safety

- A stale permission revision discards/restarts from server state; no stale overwrite occurs.
- A stale order revision exposes latest order and requires `保留我的排序` or `採用最新排序`.
- A lost mutation response replays the same idempotency key.
- A stale local database fails with reset instructions rather than auto-dropping data.
- Admin membership is seed/operations-only, Admin accounts are exclusive, and the last Active Admin cannot be removed, suspended, or deactivated.
- The final report remains `RELEASE CONDITIONAL` when required human/AT evidence is missing.

## 14. Implementation handoff order

1. Rewrite development permission migrations and reset/seed contract.
2. Implement normalized Role Category/Definition/Assignment/Grant records and closed capability catalog.
3. Implement server authority resolver, hierarchy/scope checks, and idempotent operation commands.
4. Implement role-tree and account/identity projections.
5. Implement permissions projection and atomic revision handling.
6. Migrate local shadcn controls and permission UX only after the layout colleague's commit is present.
7. Add deterministic, keyboard, screen-reader, reflow, focus-not-obscured, and real-device evidence.
8. Consolidate this spec and related documents into the canonical ADR/CONTEXT/design-system chain.

## 15. Current document authority

- `CONTEXT.md` — canonical domain vocabulary
- `docs/adr/0042-discord-like-stackable-role-model.md` — role-model decision
- `docs/adr/0043-owned-civic-design-system-governance.md` — design-system decision
- This document — normalized backend/domain/API contract
- `DESIGN.md` — human visual and interaction contract
- `web/app/globals.css` — runtime token authority
- `web/components/ui/` — local primitive source
- `web/COMPONENT_INVENTORY.md` — adoption/exception ledger
- `docs/research/2026-08-27-wcag-2.2-ux-audit-gates.md` — WCAG evidence gates
