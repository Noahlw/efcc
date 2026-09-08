# T10 / #515 composition grammar disposition

## Status

`IMPLEMENTATION_GREEN — TICKET 03 COMPLETE`

This record closes the supporting grammar against the live T10 candidate at
`8fe49350`. It records ownership decisions; it does not create a second
component registry or claim owner L2 approval.

## Live grammar disposition

| Concept | Disposition | Live authority / boundary |
|---|---|---|
| Page Frame | `PROMOTED` | `web/lib/page-frame.tsx`; shared gutter, width and frame reserve. `DirectoryFrame` and the ordinary T10 Story consume it. |
| Route Header | `PROMOTED` | `web/lib/route-header.tsx`; H1, optional Back, lead, route status/action slots and wrapping. Route callers retain copy, state and mutation. |
| Section Stack | `MAPPED_TO_EXISTING` | Caller-owned `grid`/`flex` composition. No repeated product-wide ownership proves another wrapper. |
| Surface | `MAPPED_TO_EXISTING` | `web/components/ui/card.tsx` and its existing Card slots remain the canonical surface foundation. |
| Form / Field Group | `FEATURE_LOCAL` | Feature forms retain field layout, validation, values and domain semantics. No generic form abstraction is introduced. |
| Action Group / Surface | `MAPPED_TO_EXISTING` | Existing `ActionSurface` plus `Button` composition remains authoritative. No generic action group is introduced. |
| Status / Feedback | `MAPPED_TO_EXISTING` | Existing `Alert`, `EmptyState`, `RecoveryView` and live-region/presentation seams retain semantic ownership. |
| List Group / Row | `FEATURE_LOCAL` | Directory and feature routes retain list/row semantics and selection behavior; no universal row contract is proven. |
| Loading / Empty / Error | `MAPPED_TO_EXISTING` | Existing distinct state slots and state-presentation seams remain separate; no universal `StateView` is introduced. |

## Residual census disposition

The live `node scripts/t09-frontier-census.mjs --json` output contains 41
records whose advisory `laterOwner` names T10. None proves a missing shared
pattern. They are explicitly deferred to route-family owners:

| Later owner | Census records | Disposition |
|---|---|---|
| T11 authenticated shell / shell-adjacent surfaces | `CEN-030`, `CEN-058` | `DEFERRED_TO_ROUTE_FAMILY`; preserve the current Home and offline behavior until that route-family review. |
| T13–T16 Programs route family | `CEN-026`, `CEN-059`–`CEN-068` | `DEFERRED_TO_ROUTE_FAMILY`; the nested detail, participant, boundary and workspace surfaces remain with Programs owners. |
| T17 Profile / Account Settings | `CEN-051` | `DEFERRED_TO_ROUTE_FAMILY`; preserve Account Settings behavior and copy. |
| T18 public auth / registration | `CEN-052`, `CEN-069` | `DEFERRED_TO_ROUTE_FAMILY`; preserve registration state, validation and recovery behavior. |
| T20–T27 management / identity | `CEN-031`–`CEN-050`, `CEN-053`–`CEN-055` | `DEFERRED_TO_ROUTE_FAMILY`; keep management hub, directory, CMS, role, access and approval surfaces with their route owners. |
| T28–T31 attendance | `CEN-056`, `CEN-057` | `DEFERRED_TO_ROUTE_FAMILY`; camera and confirmation composition stays with the attendance owners. |

No residual record is silently treated as fixed, and no route-specific debt is
pulled into the T10 foundation. The ordinary `T10/Composition` Stories remain
non-durable demonstrations and are not added to the Screen Catalog or PSN
registry solely for grammar coverage.

## Verification boundary

- `web/.storybook/t10-composition.stories.tsx` directly demonstrates the
  promoted frame/header composition with deterministic content.
- `web/lib/page-frame.test.tsx` and `web/lib/route-header.test.tsx` cover
  public component behavior; `tests/e2e/t10-composition.test.ts` owns W7
  geometry and reachability.
- No additional shared pattern, registry, state framework or route migration
  is introduced by this disposition.
