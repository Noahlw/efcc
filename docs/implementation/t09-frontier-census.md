# EFCC T09.0 frontier census

## Status

`OWNER_DECISION_REQUIRED`

T09.0 is complete at the fixed T08 parent. No shared production presentation
contract, token, Story metadata, or governance contract was changed.

| Field | Evidence |
|---|---|
| Branch | `rescue/t09-surface-feedback-overlays` |
| Parent branch | `rescue/t08-control-contracts` |
| Fixed parent | `6ab0561f9d79b32e2ca5345325a5cb46f01d2e13` |
| Production scope | 184 committed `web/` CSS/JS/TS source files |
| Excluded | tests, Stories, `.storybook`, prototypes, generated output, dependency output, and `test-setup` |
| Complete register | `node scripts/t09-frontier-census.mjs --markdown` |
| Machine register | `node scripts/t09-frontier-census.mjs --json` |

## Reproducible check

Run:

```sh
node scripts/t09-frontier-census.mjs --check
```

The check verifies the fixed parent and merge base, non-empty exact source
records, bounded-debt owners, production-only paths, zero unknown dispositions,
and that the T09.0 diff contains no protected `web/app`, `web/components`, or
`web/lib` production changes.

## Disposition totals

| Disposition | Records |
|---|---:|
| `MIGRATE_NOW` | 94 |
| `VALID_CALLER_LAYOUT` | 8 |
| `BOUNDED_LATER_DEBT` | 257 |
| `NATIVE_EXCEPTION` | 4 |
| `REFERENCE_PRESERVE` | 144 |
| `NOT_T09` | 0 |
| `PROVEN_FALSE_POSITIVE` | 43 |
| **Total** | **550** |

`UNKNOWN` and `UNCLASSIFIED` are not permitted dispositions and both total
zero.

## Evidence highlights

- `Card` has 28 caller records: 27 `MIGRATE_NOW` callers and one nested,
  borderless detail surface bounded to T10. Repeated caller tokens include
  `bg-[var(--surface-raised)]` (25), `border` (22), `p-5` (16), and the shared
  attendance surface grammar (`gap-[1.125rem]`, strong border, radius-md) (12
  callers).
- The `Alert` primitive emits `role="alert"` unconditionally. There are 50
  production `Alert` uses: 49 statically destructive and one dynamic login
  variant. The login page and recovery view are the immediate feedback
  migration cluster.
- There are 209 `announce()` call sites in 34 production files plus the
  feed-presentation ownership marker. The login page, approval queue, and
  recovery view account for 38 immediate announcement records and are the two
  visible/live-owner overlap clusters requiring T09.3 decisions.
- Overlay primitives have six foundation records and one shared
  `--layer-overlay` token. `AlertDialogContent` already has bounded height and
  `overflow-y-auto`; `DialogContent` and `SheetContent` do not have universal
  equivalents. Six caller-owned containment/surface overrides are recorded for
  T09.4/T09.5 review.
- Native exceptions are `OfflineBanner`'s platform status banner and
  `programs-notifications`' non-modal native `<dialog>` popover. Their
  placement, focus, safe-area, and disclosure semantics remain explicit.
- The 43 primitive `...props`/`...rest` spreads are proven false positives:
  they forward the public DOM/Radix API after the owned class and are not
  caller styling escapes.

## Owner packet

The exact evidence-backed D1/D2/D3 proposals, alternatives, preservation
impact, negative proofs, rollback checkpoints, and approval checkboxes are in
`/home/ubuntu/gh-repo/EFCC_T09_AGENT_HANDOFF/04_T09_DECISION_PACKET.md`.

Protected implementation remains blocked until the owner approves or amends
those decisions.
