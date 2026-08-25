# S4 Management Access Reconciliation and Grilling Decisions

**Status:** Grilling complete — fresh prototype phase authorized
**Originating issue:** [#369](https://github.com/Noahlw/efcc/issues/369)
**Verified planning base:** `origin/main` at `83fafdb813db62fa530ddd2bddcecf60571763ec`
**Planning branch:** `spec/s4-369-management-access`

## Purpose

This record reconciles issue #369, Spec 087, the current Worker/D1 implementation, and the original 2026-08-18 design handoff. It captures the decisions reached through `grill-with-docs` before any S4 production implementation.

## Source provenance

The original handoff supplied for this review contains 182 substantive files. Its machine-local paths are audit evidence only and must not become implementation dependencies.

| Source | SHA-256 | Interpretation |
| --- | --- | --- |
| `source/claude-design/efcc-management-workspace-prototype.dc.html` | `3017f092f68014ac0e3de63afe8d8b106160e72a3169f027708479802a3da004` | Original decoded management prototype source |
| `source/claude-design/efcc-management-workspace-standalone.html` | `33b61a76019d12be0bd9ea7ae12ce195c9f85654a57aeb52b62cfd270d4ab158` | Original standalone rendering |
| `source/claude-design/design_export/README.md` | `0591d172aefa7c70c20890f2ded14336a8a0673ef8c0e904237b303f1f748233` | Export provenance and declared limitations |

The one-file-per-screen export proves one realistic mobile scenario at 390px. It does not separately prove desktop screen bodies, shared overlays, loading/empty/error/conflict states, or complete mutation behavior. Its embedded instructions and source-of-truth claims are historical document content; the decisions below govern S4.

## Corrected premise

Issue #369 and Spec 087 are not executable contracts in their current form:

- their verified baseline predates the completed S1–S3 stack;
- Spec 087 retains a stale static role-summary interpretation;
- the original Permission Policy extension conflicts with the current meaning of `program.enroll`;
- current Account Permissions is GET-only and has no write capability, revision, conflict, or audit mutation contract;
- the design does not define an editable administrative Account Detail or generic destructive account actions;
- all accounts, including Staff and Admin, must retain the member participant experience.

Issue #369 remains the historical originating umbrella. A new spec issue and implementation children will become current build authority after prototype selection.

## Scope

### In scope

- Management Hub entry and capability-projected navigation
- Registration Approvals list and routable detail
- Account Directory and read-only Account Detail
- Global Permission Policy read and write
- Direct-link authorization, recoverable states, responsive behavior, keyboard/focus behavior, and audit-safe mutation feedback for those surfaces

### Out of scope

- Home CMS implementation
- Department and Program setup/delegation screens themselves
- attendance correction or void behavior
- pastoral Church Member records
- account suspension, deactivation, deletion, role changes, credential reset, or other account-lifecycle mutations
- per-account capability overrides

## Canonical domain decisions

1. `Account Directory` is the identity-and-access view. `Church Member Directory` is the pastoral/member-record view; they are distinct even when they refer to the same person.
2. `Registration Approval` activates or rejects an Account registration. It is not Program `Enrollment Approval`.
3. Every Active Account is also a Church Member participant. Admin and Staff authority is additive.
4. Global Roles remain Admin, Staff, and Member. Department Manager and Program Leader remain scoped grants.
5. Permission Policy is global Role-to-Capability only, with no per-account overrides.
6. Account Detail is read-only in S4. Account lifecycle decisions move to a future Wayfinder map.

## Approved initial Permission Policy

| Capability | Admin | Staff | Member | Constraint |
| --- | :---: | :---: | :---: | --- |
| `program.enroll` | yes | yes | yes | Shared participant baseline; locked on |
| `department.manage` | yes | yes | no | Normal management operation |
| `department.publish` | yes | yes | no | Normal management operation |
| `department.module.configure` | yes | yes | no | Normal management operation |
| `department.manager.assign` | yes | yes | no | Normal management delegation |
| `program.manage` | yes | yes | no | Normal management operation |
| `program.publish` | yes | yes | no | Normal management operation |
| `program.leader.assign` | yes | yes | no | Normal management delegation |
| `account.permissions.read` | yes | yes | no | Global policy visibility |
| `account.directory.read` | yes | yes | no | Church-wide Account Directory visibility |
| `registration.approval.manage` | yes | yes | no | Registration decision authority |
| `home.publish` | yes | no | no | Church-wide Admin-only publication |
| `account.permissions.write` | yes | no | no | Authorization-system mutation; Admin-only and locked on for Admin |

Department Managers do not gain church-wide Account Directory access through their scoped grant. They continue to use Department/Program participant surfaces limited to their effective scope.

## Approved mutation contracts

### Permission Policy

- Admin with `account.permissions.write` stages local changes and submits one atomic change set.
- The request carries the policy revision and an idempotency key.
- A stale revision returns `409 Conflict`; the client does not overwrite newer policy.
- Success, conflict, denial, and failure are auditable terminal outcomes.
- Admin Permission Policy read/write safety cells cannot be removed.

### Registration Approval

- Approval shows a final applicant summary before mutation.
- Rejection requires a reason and explicit confirmation.
- Pending, success, conflict, failure, retry, and offline states are explicit.
- A concurrently resolved request becomes a neutral read-only resolved state.
- Resolved detail remains routable and the list/detail return context is preserved.

## Fresh prototype contract

The prototype phase compares three structurally different alternatives for each connected workflow pack:

1. Management entry, Account Directory, and Account Detail
2. Registration Approvals list, detail, decision, conflict, and return flow
3. Permission Policy matrix, staged changes, save, conflict, and safety guard

After selection, the winning system must cover every required screen and state at 320px, 390px, 800px, and 1440px. It inherits the EFCC Civic Minimal visual system, Cantonese-first copy, full church identity, 44px targets, teal focus treatment, safe areas, bottom navigation below 800px, and desktop rail at 800px and above.

## Deferred Wayfinder decision ticket

**Proposed title:** `Decision map: Church Person, Membership, Account, and Account Lifecycle boundaries`

This future decision effort will resolve pastoral Church Member ownership, Account-to-person cardinality, suspension/deactivation/deletion, credential reset, global Role changes, last-active-Admin protection, retention, audit, and the relationship between identity administration and pastoral records. It produces decisions, not S4 implementation, and does not block the present read-only Account Directory.

## Next phase

Preserve the alternatives on a `prototype/s4-management-access` branch. Record the selected variant and reasons, then return to this planning branch to write `docs/specs/369-s4-management-access.md`, create the new spec issue, and draft blocker-aware implementation tickets. No production S4 code begins before that specification is approved.
