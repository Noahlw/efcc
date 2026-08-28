---
status: proposed
---

# Discord-like Stackable Role Model

EFCC will replace the pre-production permission model with an ordered, stackable Role model inspired by Discord's hierarchy and interaction efficiency, while preserving EFCC's server-authoritative scope and audit boundaries. `Admin` is a system-owned Role fixed at the highest position with every permission enabled and locked; the Member Baseline is system-owned and fixed at the lowest position. Non-Admin Roles are assignable, an Active Account may hold multiple Roles, and Effective Permissions are the additive union of those grants within each Role's explicit scope.

Department Manager and Program Leader are first-class scope-bound Role Definitions, not hidden fourth global roles: a role such as `成人部門管理者` or `青少年查經帶領` carries its Department or Program scope and may coexist with other assignments. Role Definitions share one global order. A role-holder may manage only lower Roles, may not move or edit their highest Role, may not move a Role above their own highest position, and may not widen scope. Role assignment, revocation, reordering, permission reading/writing, scope reading/writing, creation, and deletion are separate capabilities; a broad `role.manage` grant is not implied. Admin and Staff may create Custom Roles; Staff-created roles must be explicitly scoped, start with no permissions, and remain below the creator's highest Role. Every privileged mutation is re-authorized by the Worker and audited; UI visibility is not authority.

The change is a clean pre-production cutover. Obsolete permission code, schema, and disposable local database fixtures may be deleted and rebuilt while the system remains undeployed. This development reset is not a production data-deletion rule and does not supersede EFCC's immutable production audit contract. Production role behavior, capability resolution, and auditability must be implemented from this model before deployment.

## Consequences

- The role-management UI presents clear Cantonese display names and scope descriptions; technical capability keys remain secondary detail.
- Local shadcn/Radix primitives are the default for equivalent controls, including approval checkboxes; native controls require a documented semantic or platform exception.
- Multi-role assignment uses atomic single-target mutations first. Bulk assignment and custom role deletion workflows require separate failure and recovery contracts.
- The existing fixed-global-role/scoped-profile DTO and fixtures are implementation history, not a compatibility target. The follow-up implementation must align schema, Worker authorization, DTOs, seeds, UI, and tests in one cutover.
- The role editor must keep Admin permissions visibly locked, prevent self/highest-role escalation, show plain-language capability consequences, and prove keyboard, focus, scope, and WCAG 2.2 Level AA behavior.

## Locked interaction rules

The role list uses one mutable global order. Admin is pinned at the top and
Member Baseline at the bottom. Drag is the primary reorder affordance, with
`上移` and `下移` available as the keyboard and non-drag pointer equivalent.
Reorder requests are versioned and conflicting orders require an explicit
`保留我的排序` or `採用最新排序` choice.

The permission workflow is Role list → Role detail → Permission edit. It shows
one selected Role, a visible search field, category headings, and one compact
continuous list of on/off controls. Categories do not collapse the primary
list. The toolbar is search-only until a real secondary action exists. Atomic
save is a compact top action; a small change set opens a capped review sheet,
while a large or high-risk change set opens a dedicated review view.

Default role-management capabilities are least-privilege: Admin has all
role-management capabilities except editing or moving Admin; Staff manages
lower Roles and may create/delete explicitly scoped Custom Roles; Department
Manager manages lower Roles within Department scope; Program Leader reads,
assigns, and revokes within Program scope by default; Member has none; a new
Custom Role has none. `role.create`, `role.delete`, `role.scope.write`, and
`role.permissions.write` are never implied by a generic management label.

The first implementation uses atomic single-target assignment, revocation, and
reorder mutations. Permission controls lock while a save is in flight. A
permission revision conflict discards the local draft and restarts from the
server version. The role model is persisted in the canonical management URL
with safe role/view values. Approval history is server-paginated and response
loss replays the same idempotency key.

All final product labels and consequences are clear Cantonese for
non-developers; technical capability keys remain secondary detail. The clean
role-model cutover may delete and rebuild obsolete development code and local
fixtures, but it does not delete production audit history.

## Development schema reset

Because this role model is being replaced before deployment, the obsolete
permission migration history may be rewritten and the disposable local/CI D1
fixture rebuilt from zero. A stale-schema preflight must fail with explicit
reset instructions; it must never auto-drop an unknown or production database.
This repository rule is a development cutover safeguard and does not alter the
immutable production audit contract.

## Role deletion semantics

The `role.delete` capability means a production lifecycle edit. Archiving a
Role Definition atomically revokes its live assignments after impact review,
prevents new assignment, and preserves grants plus reconstructable
audit/history. Restoring reactivates the Role Definition and preserved grants
but never reactivates revoked assignments. A later assignment creates a new
auditable assignment event. Physical deletion is reserved for the explicit
pre-production schema/fixture reset and is not a production operation.

## Role-tree semantics

The Role list is a hierarchy tree, but parent families are non-assignable
categories. `部門管理身份組` groups Department-scoped Role Definitions, and
each Department owns its own `課程管理身份組` category for Program-scoped Role
Definitions. Categories grant no permissions, do not count as account
assignments, and do not create authority by being visible.

Assignable Roles such as `成人部門管理者`, `青少年部門管理者`, and
`青少年查經帶領` carry their own grants and exactly one scope where scoped.
An account may hold several such Roles; effective access is summarized from
the assignments rather than represented by decorative parent assignments.
Role Categories are fixed system/domain structure and read-only in the app.
They are created by the Department/Program domain seed and cannot be created,
renamed, reordered, reparented, archived, or deleted by Admin or any other
actor. Admin may create global or scoped assignable Role Definitions under an
existing permitted category. Staff may create only explicitly scoped child
Roles under an existing permitted Role Category and below Staff. The
create-role flow requires an explicit global-versus-scoped choice, an existing
parent Category, and a plain-language scope preview.

Every active assignable Role Definition has one position in a global total
order. Fixed categories anchor contiguous subtrees; only sibling Role
Definitions inside one fixed parent may be reordered. An actor's highest Role
is its highest globally ordered active assignment, and scope is checked
separately for every operation. Actors cannot mutate their own assignments or
their highest Role.

Admin membership is seeded/operational only, not assignable through the app.
Admin accounts are exclusive and hold no lower product Role Assignments. The
last Active Admin cannot be removed, suspended, or deactivated. Staff receives
`role.name.write` and `role.scope.write` by default for lower identities, but a
scope change must stay within Staff authority and reparent the identity under
the fixed category for its new explicit scope.

## UI vocabulary and scope cardinality

User-facing Traditional Chinese uses `身份組` for Role. Non-assignable parent
categories are displayed as `部門管理身份組` and each Department's
`課程管理身份組`; assignable child Role Definitions use explicit names such as
`成人部門管理者` and `青少年查經帶領`. A scoped Role Definition carries exactly
one Department or Program scope; managing multiple scopes requires separate
named child Roles. Parent categories start collapsed with a count in the role
tree, while the selected Role's permission categories remain continuously
visible.

Role display names are globally unique. Renaming is a separate
`role.name.write` capability, preserves the stable Role Definition and all
assignments, validates uniqueness server-side, and records old/new names in
the audit outcome. Admin's display name is fixed.
