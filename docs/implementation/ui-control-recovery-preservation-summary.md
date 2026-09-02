# EFCC UI Control Recovery — Generated Full-Lineage Preservation Summary

**Generated for:** T01 / [#506](https://github.com/Noahlw/efcc/issues/506)  
**Generated:** 2026-09-02  
**Source ledger:** [`ui-control-recovery-preservation-ledger.md`](ui-control-recovery-preservation-ledger.md)  
**Frozen source SHA:** `6edf28c0f8f7058cf992416e7b517824c3178c8c`  
**Rescue base SHA:** `e68d554e7dd7abb97dfa916ffe861f616b82cc57`

## Immediate answer for the next agent

The full post-main S4 lineage is frozen as an immutable input for Phase 0 and pre-supersession rescue work. T01 / #506 is active only for this provenance correction; T02 / #507 remains independently eligible, and T04 / #509 must wait for the correction PR to merge. No historical S4 PR has been modified, merged, closed, rebased, force-pushed, or marked superseded before the owner-approved T35/T36 promotion and supersession gate.

The next dependency frontier is fixed:

```text
#506 + #507
      #507 → #508
      #506 → #509 → #510
#506 + #508 + #510 → #511
```
## Newly explicit pre-#473 provenance

The corrected ledger now traces the meaningful capabilities introduced before the shadcn migration:

- **#457:** additive role/capability model and Member Baseline; Management Hub projection; Account Directory; Registration Approval; Permission Policy; Worker/D1 management, mutations, audit, and conflict behavior.
- **#458:** Discord-derived interaction authority; role-first management; explicit selection; origin-aware navigation/action framework; responsive H-01…H-40 contract; batch-approval authority; custom-role deferral.
- **#469:** bounded initial Account Directory page; deterministic cursor pagination; summary counts; unique append; search/filter context; Account Detail return context; responsive behavior.
- **#470:** actor-scoped idempotency; all-or-nothing Pending validation; immutable per-request audit; stale/conflict behavior; bounded D1 batch operations.
- **#471:** role-first Permission workspace; staged review; CAS-safe save; Pending/Processed approval workflow; explicit selection; confirmation/rejection reason; processed read-only detail; responsive action surfaces.
- **#472:** isolated local-D1 management gate; geometry, focus, safe-area, and dock checks; loading/empty/error/forbidden/conflict/read-only states; historical S4 verification evidence.

Each capability is mapped through #473 and Phase A–F to its current Phase F seam in the [full-lineage ledger](ui-control-recovery-preservation-ledger.md). No obsolete pre-#473 file is required to survive when its capability has a verified replacement.


## What is preserved

- Worker/D1 remains the authority for normalized 身份組, explicit scope, capability resolution, protected `Admin`/`會友基礎`, assignable `Staff`, additive effective permissions, audit, idempotency, revisions, and registration approval.
- Existing route URLs, shell transition, safe deep links, origin-aware Back, Programs/enrollment/workspace, management/identity operations, scanner/attendance/guest flows, Events, and recovery states remain preservation targets.
- Civic Minimal, Cantonese-first language, local shadcn/Radix primitives, Tailwind/token styling, documented native exceptions, accessibility mechanics, numeric evidence, and local disposable verification remain the active implementation inputs.
- Historical A–F phase traces, the pre-#473 S4 gate records, QA records, screenshots, HTML audits, JSON reports, review findings, and rollback checkpoints remain provenance and must not be silently discarded.
- Phase B deferred findings (`account-settings.md` F-09…F-15, `synthesis.md` C-03/C-05, and `workspace-settings.md` WS-01…WS-12) are explicitly imported into the ledger rather than presented as silently fixed.

## What is not approved

- Current broken screenshots and numeric reports are diagnostic evidence, not approved visual baselines.
- The committed `367 total / 282 passed / 85 intentional skips / 0 failed` numeric report and prior isolated `24/24` Programs geometry run do not override failed required reruns.
- Headless geometry does not claim human keyboard, screen-reader, real-device, camera, native print-preview, reduced-motion, forced-colors, zoom, reflow, or text-spacing approval.
- The Phase F aggregate is still `BLOCKED`: the required single-process Programs D1 run loses the arm64 loopback Worker, fresh `pnpm test:workerd` has the PUI-02 timeout, and 12 human rows are `UNCLAIMED`.
- T01 does not choose `SALVAGE STACK` versus `SELECTIVE REPLAY`; that decision belongs to T12 / #517 after the prescribed evidence.

## Proof required before historical supersession

Before the frozen A–F PRs can be reconsidered, the rescue must prove:

1. normalized identity and scope/capability authority remain present;
2. D1 migrations, automatic member baseline, audit/idempotency atomicity, and mutation outcomes remain present;
3. shipped route behavior and important loading/empty/error/forbidden/conflict/success/recovery states remain present;
4. primitive, pattern, route, and global styling ownership is explicit and the cascade is deterministic;
5. all four normalized Worker suites execute in the required aggregate without skips or broad suppressions;
6. the complete single-process Programs/Worker/D1 journey passes after clean disposable reset/seed and retains first-cause failure artifacts;
7. historical review/deferred findings are reconciled and evidence labels remain truthful;
8. applicable human approvals are separately supplied by the owner rather than inferred by an implementation agent.

The complete capability ledger, 15-route inventory, exact PR/base/head SHAs, imported findings, evidence links, and per-capability dispositions are in the [A–F Preservation Ledger](ui-control-recovery-preservation-ledger.md).
