# EFCC UI Control Recovery — Ticket-Driven Implementation Tracker

**Parent authority:** [#505](https://github.com/Noahlw/efcc/issues/505)
**Delivery ADR:** [ADR-0046](../adr/0046-ai-first-ui-playground-delivery.md)
**UI law:** [`ui-control-recovery-governance.md`](ui-control-recovery-governance.md)
**Testing law:** [`TESTING.md`](../../TESTING.md)

This file tracks progress, dependencies, branch/PR boundaries, and evidence. It is not a second architecture specification.

## Current execution state

| Scope | Status | Evidence / next boundary |
| --- | --- | --- |
| T01–T06 / #506–#511 and T05 children | Complete foundation | Historical Phase 0 evidence and preservation/testing records remain authoritative |
| T07 / #512 and T07 children | Complete foundation | Storybook/Playground, Screen Catalog, and workshop assets are grandfathered |
| T08 / #513 | Complete foundation | Controls and contracts are grandfathered; retain their existing approval/evidence history |
| T09 / #514 | Complete foundation | Surface, feedback, and overlay contracts are grandfathered at the completed rescue head |
| Post-T09 authority rewrite | Complete on this planning branch | #505, ADR-0046, governance, TESTING, tracker, future tickets, and PR skill are reconciled before T10 |
| T10–T36 / #515–#541 | Ready in dependency order | Start after this planning authority is accepted and each ticket's dependency edges are satisfied |
| B-003 | Open residual risk | The sustained-runtime canary remains independently reported and is not silently reclassified |

## Delivery rules for future tickets

Every UI ticket follows the AI-first RECON → DIAGNOSE → IMPLEMENT → PLAYGROUND → AI SELF-REVIEW → REPAIR → VERIFY → OWNER SPOT-CHECK loop. Each shipped screen keeps a Screen Catalog entry and representative baseline Story; the baseline passes W7. Additional states are material and risk-driven. Testing uses the cheapest truthful seam, browser engines are risk-proportional, and L2/L3 is escalated by the central governance authority.

Existing T07–T09 Stories, PSNs, controls, contracts, and catalog entries are not migrated. Ordinary new Playground cases need no PSN. SCN is for durable real-app integration, and CTR is for promoted shared/high-risk machine rules.

## Dependency map

The normal implementation frontier is:

```text
T09/#514
  → T10/#515 → T11/#516 → T12/#517
  → T13/#518 → T14/#519 → T15/#520 → T16/#521
  → T17/#522 → T18/#523 → T19/#524
  → T20/#525 → T21/#526 → T22/#527 → T23/#528 → T24/#529
  → T25/#530 → T26/#531 → T27/#532
  → T28/#533 → T29/#534 → T30/#535 → T31/#536
  → T32/#537 → T33/#538 → T34/#539 → T35/#540 → T36/#541
```

The issue body is authoritative for additional logical blockers. T12/#517 is the architecture checkpoint that decides SALVAGE STACK versus SELECTIVE REPLAY using preservation, ownership, composability, regression confidence, code lineage, rollback/reviewability, and evidence. Broad route-family work does not bypass that decision.

## Branch, PR, and evidence rules

- Ordinary tickets use one issue, worktree/branch, owning commit, and PR. T07 remains the grandfathered shared-PR exception.
- A child requires its logical blockers and selected immediate parent in ancestry at `STACK_GREEN` or `MERGED_RESCUE`.
- `STACK_GREEN` requires in-scope implementation, required focused/aggregate checks, current Standards/Spec review, an attributable diff, and a safe child base. It does not mean approved, merged, or complete.
- Human approval remains change-risk based: owner Storybook spot-check for every UI ticket, L2 for design-risk changes, and L3 for real platform/device/assistive-technology truth.
- A changed parent requires descendant restacking, affected verification/review reruns, and revalidation of affected human evidence.
- No production UI implementation is claimed by this planning rewrite. Historical rescue assets and evidence remain in their owning records.

## Phase map

| Phase | Tickets | Outcome | Status |
| --- | --- | --- | --- |
| 0 — Foundation and recovery control | T01–T06 | Preserve post-main S4 value and establish layered testing/governance | Complete |
| 1 — Executable UI foundation | T07–T12 | Playground foundation, controls/surfaces, shell, Programs tracer, rescue-path decision | T07–T09 complete; authority rewrite before T10–T12 |
| 2 — Programs route family | T13–T16 | Participant-management Programs rescue | Blocked by Phase 1 |
| 3 — Member and public surfaces | T17–T19 | Profile/settings, public auth, communications | Blocked by Phase 2 |
| 4 — Management and identity | T20–T27 | Hubs, directories, approvals, CMS, roles, permissions, Account Access | Blocked by Phase 3 |
| 5 — Attendance, scanner, and print | T28–T31 | Guest, self, assisted/operator, attendance, print | Blocked by Phase 4 |
| 6 — Contraction, verification, and promotion | T32–T36 | Styling contraction, machine/human evidence, candidate, closure | Blocked by Phase 5 |

## Update protocol

At session start, read `AGENTS.md`, #505, this tracker, the current governance/testing authorities, and the ticket's issue body. Confirm the branch, immediate parent, logical blockers, and current revision before editing. At session end, record the actual status and evidence in the owning PR/issue and update this progress map when the phase boundary changes.
