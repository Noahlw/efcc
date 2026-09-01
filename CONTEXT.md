# EFCC 顯恩堂系統 — Domain Context

This document owns the EFCC ubiquitous language and domain invariants. It is
deliberately not an implementation, schema, route, test, or release-evidence
record. Historical terminology is retained only when it explains a current
domain distinction.

## Ubiquitous language

| Term | Chinese | Definition |
| --- | --- | --- |
| Account | 帳戶 | An authenticated identity holder. An Account may participate in church activities and may receive more than one assignable 身份組. |
| Active Account | 生效帳戶 | An Account currently allowed to authenticate and participate. Pending, Suspended, and Deactivated Accounts are not eligible for ordinary access or scoped authority. |
| Role Category | 身份組分類 | A fixed, non-assignable structural heading for Global, Department, or Program identities. A category grants no permission and is never an Account assignment. |
| Role Definition | 身份組定義 | A named, permission-bearing identity. It has one kind, one position, and either no scope or exactly one Department/Program scope. |
| Role Assignment | 身份組指派 | The auditable relationship between an Active Account and a Role Definition. A revoked assignment remains history and no longer contributes authority. |
| Scope | 適用範圍 | The resource boundary of a Role Definition or grant: global, one Department, or one Program. Scope is explicit, never inferred from presentation. |
| Grant | 權限授予 | One capability allowed by a Role Definition. Grants come from the product-owned capability vocabulary. |
| Effective Permission | 有效權限 | The additive union of `會友基礎` and all active Role Definition grants, restricted by each grant's scope. One identity cannot subtract another identity's grant. |
| Capability-owned authorization | 能力權限 | The authorization rule that names the required capability and scope, rather than trusting a displayed title, badge, or fixed Account label. |
| Member Baseline | 會友基礎 | The automatic, protected participant identity applied to every Active Account. It is not assignable, editable, reorderable, or removable. |
| Admin | 管理員 | The protected highest system identity. Admin has the system-defined all-permission rule and cannot be assigned, edited, moved, archived, or used to receive lower product assignments through ordinary identity management. |
| Staff | 同工 | An assignable system Role Definition below Admin. Its actual authority is the grants and scopes resolved for that Account, not a global Account field. |
| Department Manager | 事工區管理者 | A scoped Role Definition whose authority covers one or more explicitly represented Departments. It is not a global Account role. |
| Program Leader | 事工負責人 | A scoped Role Definition whose authority covers one or more explicitly represented Programs. It is not a global Account role. |
| Registration Request | 註冊申請 | A pending request to create an Account. It carries the applicant's identity and credential material until an authorized approval decision. |
| Registration Approval | 註冊核准 | An authorized decision that creates one Active Account and its automatic `會友基礎` in one atomic outcome. It does not assign a management identity. |
| Approval Selection | 審批選取集 | The pending requests selected for one batch decision. The selection is temporary and ends on reload, logout, module exit, or explicit clear. |
| Department | 事工區 / 部門 | A church ministry area that owns Programs and their scoped operational context. |
| Program | 課程 / 事工 | An activity container under one Department. Members may discover and enroll according to its lifecycle, discoverability, and enrollment mode. |
| Event | 聚會 | One dated occurrence owned by exactly one Program. Attendance refers to this concrete occurrence, not merely to the Program. |
| Enrollment Request | 報名申請 | A historical request to join a Program. Its decision is separate from the resulting Program Enrollment. |
| Program Enrollment | 報名 | The active or historically cancelled Member–Program relationship created by approval or authorized direct enrollment. |
| Attendance | 出席 | A member or guest check-in attached to one Event. Self, assisted, and guest entry are distinct domain methods. |
| Attendance Void | 出席作廢 | An audited correction that voids an attendance record without deleting its history. |
| Audit Outcome | 稽核結果 | The terminal result of a privileged mutation: `SUCCESS`, `DUPLICATE`, `CONFLICT`, `DENIED`, `REJECTED`, or `FAILED`. |
| Section | 功能區 | A named church-management capability available to an authenticated Account. Auth surfaces such as login and registration are not Sections. |
| Origin-aware navigation | 按來源返回 | A detail action returns to the valid Section that opened it, with a safe product fallback when the origin is absent or invalid. |
| Church Time | 教會時間 | EFCC schedules and user-facing timestamps use the `Asia/Hong_Kong` calendar and 24-hour clock. |
| Identity Authority | 身份權威 | The authority that owns identity, credentials, sessions, and authentication decisions. |
| Domain Backend | 領域後端 | The authority that owns church-management records and business operations. |

The retired fixed global Account-role vocabulary is not current domain truth.
`Department Manager` and `Program Leader` describe scoped Role Definitions;
they are not hidden fourth or fifth global roles. A display label never grants
authority.

## Domain invariants

1. Authorization is decided from the Account's active Role Assignments,
   grants, and explicit resource scope. Browser visibility and labels are only
   affordance.
2. Role Categories are system/domain-owned structure. They are
   non-assignable, grant no permission, and cannot be changed as part of
   ordinary identity management.
3. Admin is the protected highest identity. `會友基礎` is the protected lowest
   automatic baseline. Both anchors remain outside ordinary assignment and
   editing flows.
4. An Active Account may hold multiple assignable Role Definitions. Pending,
   Suspended, Deactivated, and otherwise ineligible Accounts cannot receive
   scoped authority.
5. Effective Permission is additive. A lower identity does not remove a grant
   supplied by another active identity, and a new assignment never widens an
   existing identity's scope.
6. A scoped identity has exactly one explicit Department or Program scope.
   Managing several scopes requires separately named scoped identities.
7. Registration approval is atomic: the approved request becomes one Active
   Account with `會友基礎`, while management identities are assigned later by
   capability-owned authority.
8. Privileged mutations are atomic and auditable. Duplicate, conflict,
   denied, rejected, and failed outcomes remain distinguishable from success;
   history is preserved rather than silently erased.
9. A Program belongs to one Department, an Event belongs to one Program, and
   Attendance belongs to one Event. Cancellation and correction preserve
   historical records.
10. Enrollment approval creates the corresponding active Enrollment in the
    same domain outcome. A request decision cannot be treated as an
    enrollment by itself.
11. Event check-in accepts only an active, non-cancelled Event whose
    check-in window is open. A guest Attendance is not silently merged with
    an authenticated member Attendance.
12. All domain schedules and displayed times use Church Time.

## Decision authority

- [ADR-0042](docs/adr/0042-discord-like-stackable-role-model.md) — Accepted:
  stackable Role Definitions, fixed categories, explicit scope, and additive
  permissions.
- [ADR-0043](docs/adr/0043-owned-civic-design-system-governance.md) —
  Accepted: product-owned Civic Minimal design-system governance.
- [Spec 091](docs/specs/091-stackable-identity-backend.md) — normalized
  identity and authorization contract.
- [Spec 092](docs/specs/092-discord-identity-design-system-adoption.md) —
  whole-product presentation and adoption contract.

Implementation details and release evidence belong in those authority records
and the Phase F QA documents, not in this glossary.
