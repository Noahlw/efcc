# ADR-0040: Discord-Derived S4 Management Interaction Authority

**Status:** accepted

## Decision

S4 management presentation follows Discord's role-management information
architecture and interaction grammar closely: dense searchable identity rows,
compact filters, role-first drill-down, grouped permission descriptions and
toggles, persistent staged-save feedback, contextual multi-selection, and an
explicit Back action at every depth.

This is an interaction authority, not a brand or domain import. EFCC retains
Variant A Civic Minimal, Cantonese-first copy, church vocabulary, existing
icons, and the Worker/D1 authorization contract. Discord colors, proprietary
assets, source code, gaming vocabulary, custom-role semantics, and server or
channel concepts do not enter the product.

The global Roles remain the fixed values `Admin`, `Staff`, and `Member`. The
**Member Baseline** (`會友基礎`) is a system-owned, non-editable policy applying
to every Active Account; it is presented separately from editable Role Policy
and must never render as an enabled toggle or assignable Role.

Phone navigation is list → detail → deeper task, with origin-aware Back at
each level. Desktop may preserve list/detail context when sufficient width is
available. A desktop shell breakpoint does not force a cramped multi-pane
content layout.

## Context

The implemented S4 UI drifted from the selected Account Directory B,
Approvals A, and Permission Policy C prototypes. It opens Account Directory on
an empty filter form, keeps the approval queue in a horizontally scrolling
table, and renders account summaries, Role definitions, and the complete
Permission Policy as one long page. The owner confirmed that Discord's role
system was the original UX model and requested direct structural reproduction
adapted to EFCC.

## Consequences

- Account Directory opens with a populated, progressively loaded list.
- Phone filters use a compact control and bottom sheet; desktop uses an inline
  toolbar.
- Permission Policy starts from a Role list. Phone drills into Role Detail and
  then Permissions or Assigned Accounts; desktop can use adjacent panes.
- Permission changes remain staged and atomically saved only after explicit
  review.
- Assigned Accounts is read-only in this S4 amendment.
- Custom Role creation, deletion, reordering, naming, and account Role mutation
  move to the separate S4.1/Wayfinder decision chain.
- Prototype implementation remains decision evidence and does not ship in the
  production stack.

## References

- GitHub issue #449, frozen S4 authority
- ADR-0035, origin-aware detail navigation
- ADR-0037, Civic Minimal visual system
- Discord Help Center: Roles and Permissions, Members Page, Permission FAQ,
  Member Applications, and View Server As Role
- Owner-supplied Discord mobile role-management screenshots, 2026-08-26
