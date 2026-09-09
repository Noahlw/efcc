# S4.1 Wayfinder Brief — Discord-Style Custom Roles and Account Assignment

**Status:** Deferred; decision ticket only

**Parent decision map:** GitHub issue #456

## Question

Should EFCC move beyond its fixed Admin/Staff/Member Role Policy into a Discord-
style custom-role system with creation, naming, order, assignment, and effective-
permission preview without weakening the Church Member baseline or allowing an
operator to remove the last safe administrator?

## Why this is separate

S4 hardening copies Discord's Role-management UX while keeping fixed global
Roles and read-only Assigned Accounts. Functional custom-role parity changes the
authorization model, schema, migration, delegation rules, lifecycle safety,
audit semantics, and every capability projection. It cannot be treated as UI
polish.

## Required grilling frontier

1. Fixed system Roles versus custom Roles and whether both may coexist.
2. Whether Role order has authorization meaning or presentation meaning only.
3. Additive, deny, or tri-state permission composition.
4. Member Baseline inheritance and which capabilities are permanently locked.
5. Who may create, rename, reorder, delete, clone, or assign each Role.
6. Highest-Role editing rules and Staff/Admin boundaries.
7. Last-active-Admin, self-demotion, self-lockout, and orphaned-scope recovery.
8. Interaction between global Roles, Department Manager, and Program Leader.
9. Role assignment history, effective-access preview, and audit evidence.
10. Migration of every existing Account and the rollback/cutover contract.

## Prototype requirement

Before implementation, compare at least two structural models using realistic
EFCC data:

- fixed system Roles plus additive custom ministry Roles;
- fully composable custom Roles above the non-editable Member Baseline.

The prototype may sample Discord's Role list, Role Detail, Permissions, Members,
reorder, and View-As-Role interactions, but must use EFCC domain language and
Civic Minimal.

## Non-goals for the decision ticket

- no schema or API implementation;
- no Account Role mutation;
- no migration;
- no changes to the S4 hardening stack;
- no assumption that Discord's deny/hierarchy semantics fit EFCC.

## Exit criteria

- accepted domain glossary and ADR;
- explicit safety invariants and recovery operator;
- selected prototype and complete state/viewport contract;
- migration and rollback plan;
- dependency-ordered implementation ticket chain.
