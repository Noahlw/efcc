# EFCC UI Control Recovery — Ticket-Driven Implementation Tracker

> **Purpose:** Track execution across separate phase sessions without duplicating the Spec or GitHub tickets.  
> **Source of truth:** Parent Spec [#505](https://github.com/Noahlw/efcc/issues/505) and the current GitHub ticket body/comments.  
> **Update rule:** Every phase session reads this file at the start and updates it before ending.  
> **Intended repo path:** Replace the current content of `docs/implementation/ui-control-recovery-plan.md` with this document.

---

## 1. What this document is — and is not

This document is the **cross-session tracker** for the UI rescue.

It exists so that a new OMP session can answer, quickly:

- Which phase are we in?
- Which ticket is currently eligible?
- What has already merged into the rescue branch?
- What evidence and human approvals already exist?
- What is blocked?
- What is the next safe action?

It is **not**:

- a replacement for the parent Spec;
- a copy of every ticket’s acceptance criteria;
- a second architecture document;
- a place for agents to re-plan or re-slice T01–T36;
- a general repository policy manual.

The GitHub ticket being implemented is always the acceptance-scope authority.

---

## 2. Stable project references

| Item | Reference |
|---|---|
| Repository | `Noahlw/efcc` |
| Parent Spec | [#505](https://github.com/Noahlw/efcc/issues/505) |
| Frozen Phase F source | `feat/s4-f-contraction-release-gate` |
| Frozen Phase F SHA | `6edf28c0f8f7058cf992416e7b517824c3178c8c` |
| Rescue integration branch | `rescue/ui-control-recovery` |
| Historical stack | PRs #457, #458, #469, #470, #471, #472, #473, #496, #497, #501, #502, #503, #504 |
| Rescue decision | Undecided until T12 / [#517](https://github.com/Noahlw/efcc/issues/517): `SALVAGE STACK` or `SELECTIVE REPLAY` |
| Parent Spec execution-model amendment | [#505 comment](https://github.com/Noahlw/efcc/issues/505#issuecomment-5514680835) |

### Stable delivery rules

- Never implement directly on the historical Phase F branch.
- Every implementation ticket gets its own branch/worktree, focused evidence, and ticket-isolated PR.
- Each ticket records its own rollback boundary alongside its reviewed implementation SHA, evidence, and PR state.
- Within a phase, the technical stack is linear: each child branch starts from its immediate stack parent.
- A child ticket may start only when its logical blockers and selected immediate stack parent are present in stack ancestry as `STACK_GREEN` or `MERGED_RESCUE`; it need not wait for parent merge or external review.
- Each PR targets its immediate stack parent so GitHub shows only that ticket's incremental diff.
- Tests and `/code-review` must complete before a ticket is `STACK_GREEN`.
- A visual ticket is not merge-ready until required human approval is recorded.
- Do not weaken tests, contracts, baselines, or tolerances to make implementation pass.
- Do not modify or supersede the historical S4 PRs recorded in the ledger before T35/T36.
- No phase stack crosses a phase boundary; merge the current stack parent-first before starting the next phase.

---

## 3. How each phase session works

### At session start

1. Read root `AGENTS.md`.
2. Read this tracker.
3. Read parent Spec #505 and the owner-approved execution-model amendment.
4. Read the GitHub body and comments for tickets in the current phase.
5. Verify the phase entry gate, rescue integration HEAD, and immediate stack parent.
6. Select the first ticket whose logical blockers and selected immediate stack parent are present in stack ancestry as `STACK_GREEN` or `MERGED_RESCUE`.
7. Create a fresh branch/worktree from the immediate stack parent.
8. Update **Current execution state** and the **Active phase stack** before editing.

### For each ticket

1. Implement only that ticket.
2. Run its focused and aggregate verification.
3. Invoke `/code-review` Standards and Spec axes.
4. Resolve findings without changing the ticket contract.
5. Prepare and publish the ticket-isolated PR with `/pr-description`.
6. Mark the ticket `STACK_GREEN` only after implementation, required tests, local review, PR isolation, and confirmation that no unresolved correctness issue makes the parent unsafe as a child base.
7. A child may then start; do not wait for external review or merge.
8. For visual tickets, use `WAITING_HUMAN` until owner approval, then `MERGE_READY`.
9. Merge only at the phase checkpoint after logical blockers, lower stack parents, review, approval, and refresh gates are complete.
10. Update the ticket row, evidence, reviewed implementation SHA, merge SHA, and both frontiers.

### State model

```text
BLOCKED
  ↓ all logical blockers and selected immediate stack parent are STACK_GREEN or MERGED_RESCUE
FRONTIER
  ↓ ticket branch created
IN_PROGRESS
  ↓ implementation + tests + local code review
STACK_GREEN
  ↓ child implementation may begin
REVIEW_CHANGES
  ↓ parent corrected or stack root changed; descendants require restacking
RESTACK_REQUIRED
  ↓ descendants restacked and affected verification/review are green
STACK_GREEN
  ↓ external/human gates complete
MERGE_READY
  ↓ parent-first merge
MERGED_RESCUE
```

`REVIEW_CHANGES` is entered only when a parent correction invalidates the current stack; ordinary child implementation after `STACK_GREEN` does not enter that state.

`RESTACK_REQUIRED` is a transitional state for an existing reviewed branch whose parent or stack root changed; it returns to `STACK_GREEN` only after restacking and affected evidence is green.

For visual tickets:

```text
STACK_GREEN → WAITING_HUMAN → MERGE_READY
```

For visual phases, each ticket still prepares attributable scenario evidence. The owner may review all ticket scenarios together at the phase checkpoint; approval applies to the final reviewed stack state, and no ticket requiring approval becomes `MERGE_READY` without it. The next phase cannot start before the current phase approval and parent-first merge checkpoint.

`STACK_GREEN` unlocks implementation, not merge.

### At session end

1. Update the current phase table and both frontiers.
2. Update the active phase stack and stack map.
3. Append a ticket execution log entry.
4. Update human approval and blocker records.
5. Update rescue integration HEAD only when a merge actually occurs.
6. Write the phase handoff if the phase is complete.
7. Keep the active phase stack as the handoff state for the next session.

---

## 4. Current execution state

Update this table at the start and end of every implementation session.

| Field | Current value |
|---|---|
| Current phase | **Phase 0 — Foundation & Recovery Control** |
| Phase status | `IN PROGRESS — T03 REVIEW_CHANGES (source-fingerprint correction pending GitHub CI); T05 remains blocked on upstream Wrangler` |
| Rescue integration HEAD | `6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2` — T02 / #545 merged |
| Active phase stack | Amendment → T04 → T03 → T05 → T06 |
| Implementation frontier | T03 / #508 `REVIEW_CHANGES`; T05 / #510 remains `BLOCKED_EXTERNAL_UPSTREAM` until restacked and requalified |
| Merge frontier | Amendment PR #547 → T04 PR #546 → T03 PR #548; parent-first merge remains pending |
| Review pending | T03 source-fingerprint correction and two-axis `/code-review`; then T05 restack and runtime qualification |
| Human approval pending | None for Phase 0 foundation tickets |
| Active blocker | T03 correction is not yet GitHub-verified; T05 also retains the upstream ProxyWorker blocker; T06 remains logically blocked on T05 |
| Next safe action | Run T03 review/gates, push the substantive head, verify its GitHub Actions run, then merge the safe prefix parent-first |
| Last merged rescue SHA | `6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2` |
| Last rollback checkpoint | Frozen Phase F SHA `6edf28c0f8f7058cf992416e7b517824c3178c8` |
| Parent Spec amendment | [Owner-approved comment](https://github.com/Noahlw/efcc/issues/505#issuecomment-5514680835) |
| Entry verification | T01/T02 are merged in rescue; amendment PR #547 and T04 PR #546 are `STACK_GREEN`; T03 PR #548 has a substantive source-fingerprint correction pending push and exact-head GitHub verification |

> T02 / #545 merged at `6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2`. The amendment is documentation-only and changes sequencing, not ticket scope, logical blockers, contracts, preservation, or approval authority.

---

## 5. Phase overview

| Phase | Tickets | Outcome | Entry gate | Exit gate | Status |
|---|---|---|---|---|---|
| **0 — Foundation & Recovery Control** | T01–T06 / #506–#511 | Preserve full post-main S4 value, establish governance/enforcement, restore required Worker tests, stabilize local acceptance runtime, contain global cascade | Parent/tickets published; frozen Phase F SHA and full S4 ancestry verified | #506–#511 merged into rescue; cascade evidence recorded | `IN PROGRESS` |
| **1 — Executable UI Foundation** | T07–T12 / #512–#517 | UI Lab, app-facing contracts, composition grammar, shell, Programs tracer, rescue-path decision | Phase 0 complete | #512–#517 merged; required human approvals recorded; T12 decision recorded | `BLOCKED` |
| **2 — Programs Route Family** | T13–T16 / #518–#521 | Complete participant and management Programs rescue | Phase 1 complete | #518–#521 merged and Programs family approved | `BLOCKED` |
| **3 — Member & Public Surfaces** | T17–T19 / #522–#524 | Profile/settings, public auth, communications rescued | Phase 2 complete | #522–#524 merged and approved | `BLOCKED` |
| **4 — Management & Identity** | T20–T27 / #525–#532 | Management hubs, directories, approvals, CMS, hierarchy, permissions, Account Access rescued | Phase 3 complete | #525–#532 merged and approved | `BLOCKED` |
| **5 — Attendance, Scanner & Print** | T28–T31 / #533–#536 | Guest, Self, assisted/operator, attendance/print rescued | Phase 4 complete | #533–#536 merged; required device/print evidence recorded | `BLOCKED` |
| **6 — Contraction, Verification & Promotion** | T32–T36 / #537–#541 | Remove obsolete paths, run full verification/human matrix, assemble integration candidate, record supersession | All route families complete | Final candidate approved; historical disposition recorded | `BLOCKED` |

---

# 6. Phase 0 — Foundation & Recovery Control

**Goal:** Make later UI work safe and evidence-driven. This phase does not redesign the product.

| Key | Issue | Ticket | Blocked by | Status | PR | Merge SHA | Evidence / notes |
|---|---|---|---|---|---|---|---|
| T01 | [#506](https://github.com/Noahlw/efcc/issues/506) | Freeze A–F and publish Preservation Ledger | None | `MERGED_RESCUE` | [#544](https://github.com/Noahlw/efcc/pull/544) | `6d27fee83a7033af1cf0e896868b3f0e812f0273` | Initial ledger plus full post-main S4 lineage correction merged; final provenance and link checks passed |
| T02 | [#507](https://github.com/Noahlw/efcc/issues/507) | Establish UI governance and agent change control | None | `MERGED_RESCUE` | [#545](https://github.com/Noahlw/efcc/pull/545) | `6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2` | Governance authority merged; stacked-delivery amendment is the next stack root |
| T03 | [#508](https://github.com/Noahlw/efcc/issues/508) | Enforce styling ownership and typed UI contract governance | T02 | `REVIEW_CHANGES` | [#548](https://github.com/Noahlw/efcc/pull/548) | — | Correcting Rule 1 to detect all unlayered broad CSS, require exact source fingerprints/removal owners for high-blast waivers, and own narrow generated-output exclusions; local gates pass, GitHub verification pending |
| T04 | [#509](https://github.com/Noahlw/efcc/issues/509) | Restore excluded normalized Worker suites | T01 | `STACK_GREEN` | [#546](https://github.com/Noahlw/efcc/pull/546) | — | Restacked onto amendment; focused, aggregate, typecheck, precommit, diff-check, and two-axis review gates pass |
| T05 | [#510](https://github.com/Noahlw/efcc/issues/510) | Stabilize full Programs/Worker/D1 runtime | T04 | `BLOCKED_EXTERNAL_UPSTREAM` | — | — | Remote implementation at `8b2529b6`; restack onto the corrected T03 head is required before requalification; current official Wrangler still has the recorded ProxyWorker blocker |
| T06 | [#511](https://github.com/Noahlw/efcc/issues/511) | Contain global CSS cascade | T01, T03, T05 | `BLOCKED` | — | — | Waiting for T05 `STACK_GREEN` |

### Phase 0 exit record

| Field | Value |
|---|---|
| Phase status | `NOT COMPLETE` |
| Tickets merged | T01 / #506 and T02 / #507 |
| Rescue integration SHA | `6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2` |
| Preservation Ledger | Full post-main S4 lineage merged with T01 correction — [`ui-control-recovery-preservation-ledger.md`](ui-control-recovery-preservation-ledger.md) and [`ui-control-recovery-preservation-summary.md`](ui-control-recovery-preservation-summary.md) |
| Governance authority | T02 / #507 merged; stacked-delivery amendment is `STACK_GREEN` |
| Required Worker gate | T04 / #509 is `STACK_GREEN` on its stack branch; merge frontier remains parent-first |
| Programs runtime | Phase F blocker still open — T05 owns it |
| Cascade result | Not run — T06 owns it |
| Open blockers | T03 source-fingerprint correction awaits exact-head GitHub verification; T05 remains `BLOCKED_EXTERNAL_UPSTREAM`; T06 remains blocked on T05 |
| Next phase | Phase 1 after all six Phase 0 tickets merge parent-first |

---

# 7. Phase 1 — Executable UI Foundation

**Goal:** Establish the live human-tuning and machine-contract system, then prove it on Programs.

| Key | Issue | Ticket | Blocked by | Status | PR | Merge SHA | Human gate |
|---|---|---|---|---|---|---|---|
| T07 | [#512](https://github.com/Noahlw/efcc/issues/512) | UI Lab and executable contract tracer | T03, T06 | `BLOCKED` | — | — | Required |
| T08 | [#513](https://github.com/Noahlw/efcc/issues/513) | App-facing control contracts | T07 | `BLOCKED` | — | — | Required |
| T09 | [#514](https://github.com/Noahlw/efcc/issues/514) | Surface, feedback, overlay contracts | T08 | `BLOCKED` | — | — | Required |
| T10 | [#515](https://github.com/Noahlw/efcc/issues/515) | Minimum canonical composition grammar | T09 | `BLOCKED` | — | — | Required |
| T11 | [#516](https://github.com/Noahlw/efcc/issues/516) | Authenticated shell and header boundary | T05, T10 | `BLOCKED` | — | — | Required |
| T12 | [#517](https://github.com/Noahlw/efcc/issues/517) | Programs tracer and preservation-path decision | T01, T06, T11 | `BLOCKED` | — | — | Required + SALVAGE/REPLAY decision |

### Phase 1 exit record

| Field | Value |
|---|---|
| Phase status | `BLOCKED` |
| Tickets merged | — |
| Rescue integration SHA | — |
| Approved patterns | — |
| Approved shell SHA | — |
| Programs tracer approval | — |
| T12 decision | `UNDECIDED` |
| Next phase | Phase 2 |

---

# 8. Phase 2 — Programs Route Family

**Goal:** Complete the Programs family after the tracer proves the architecture.

| Key | Issue | Ticket | Blocked by | Status | PR | Merge SHA | Human gate |
|---|---|---|---|---|---|---|---|
| T13 | [#518](https://github.com/Noahlw/efcc/issues/518) | Participant detail, enrollment, cancellation, event states | T12 | `BLOCKED` | — | — | Required |
| T14 | [#519](https://github.com/Noahlw/efcc/issues/519) | Management directory and program lifecycle entry | T13 | `BLOCKED` | — | — | Required |
| T15 | [#520](https://github.com/Noahlw/efcc/issues/520) | Workspace Events and Participants | T14 | `BLOCKED` | — | — | Required |
| T16 | [#521](https://github.com/Noahlw/efcc/issues/521) | Workspace Settings and Notifications | T15 | `BLOCKED` | — | — | Required |

### Phase 2 exit record

| Field | Value |
|---|---|
| Phase status | `BLOCKED` |
| Tickets merged | — |
| Rescue integration SHA | — |
| Programs coverage report | — |
| Programs approval packages | — |
| Remaining Programs defects | — |
| Next phase | Phase 3 |

---

# 9. Phase 3 — Member & Public Surfaces

**Goal:** Rescue the everyday member/public experience on the approved grammar.

| Key | Issue | Ticket | Blocked by | Status | PR | Merge SHA | Human gate |
|---|---|---|---|---|---|---|---|
| T17 | [#522](https://github.com/Noahlw/efcc/issues/522) | Profile and Account Settings | T16 | `BLOCKED` | — | — | Required |
| T18 | [#523](https://github.com/Noahlw/efcc/issues/523) | Public authentication, registration, recovery | T17 | `BLOCKED` | — | — | Required |
| T19 | [#524](https://github.com/Noahlw/efcc/issues/524) | Home, Notices, Messages | T18 | `BLOCKED` | — | — | Required |

### Phase 3 exit record

| Field | Value |
|---|---|
| Phase status | `BLOCKED` |
| Tickets merged | — |
| Rescue integration SHA | — |
| Approval packages | — |
| Remaining member/public defects | — |
| Next phase | Phase 4 |

---

# 10. Phase 4 — Management & Identity

**Goal:** Rescue operational and high-authority workflows without changing server-owned authority.

| Key | Issue | Ticket | Blocked by | Status | PR | Merge SHA | Human gate |
|---|---|---|---|---|---|---|---|
| T20 | [#525](https://github.com/Noahlw/efcc/issues/525) | Management Hub and Settings Hub | T19 | `BLOCKED` | — | — | Required |
| T21 | [#526](https://github.com/Noahlw/efcc/issues/526) | Account Directory | T20 | `BLOCKED` | — | — | Required |
| T22 | [#527](https://github.com/Noahlw/efcc/issues/527) | Member Directory | T21 | `BLOCKED` | — | — | Required |
| T23 | [#528](https://github.com/Noahlw/efcc/issues/528) | Approval Queue and Detail | T22 | `BLOCKED` | — | — | Required |
| T24 | [#529](https://github.com/Noahlw/efcc/issues/529) | Home Content operations | T23 | `BLOCKED` | — | — | Required |
| T25 | [#530](https://github.com/Noahlw/efcc/issues/530) | Role hierarchy and Role Definition workflows | T24 | `BLOCKED` | — | — | Required |
| T26 | [#531](https://github.com/Noahlw/efcc/issues/531) | Permission Editor | T25 | `BLOCKED` | — | — | Required |
| T27 | [#532](https://github.com/Noahlw/efcc/issues/532) | Account Access and lifecycle impact | T21, T25, T26 | `BLOCKED` | — | — | Required |

### Phase 4 exit record

| Field | Value |
|---|---|
| Phase status | `BLOCKED` |
| Tickets merged | — |
| Rescue integration SHA | — |
| Approval packages | — |
| Preserved identity/permission evidence | — |
| Remaining management/identity defects | — |
| Next phase | Phase 5 |

---

# 11. Phase 5 — Attendance, Scanner & Print

**Goal:** Complete hardware-, safe-area-, short-height-, and print-sensitive workflows.

| Key | Issue | Ticket | Blocked by | Status | PR | Merge SHA | Human gate |
|---|---|---|---|---|---|---|---|
| T28 | [#533](https://github.com/Noahlw/efcc/issues/533) | Guest Check-In and corrected validation feedback | T27 | `BLOCKED` | — | — | Required |
| T29 | [#534](https://github.com/Noahlw/efcc/issues/534) | Authenticated Self scanner | T28 | `BLOCKED` | — | — | Required + iOS/Android |
| T30 | [#535](https://github.com/Noahlw/efcc/issues/535) | Assisted and Operator attendance | T29 | `BLOCKED` | — | — | Required |
| T31 | [#536](https://github.com/Noahlw/efcc/issues/536) | Events, roster, attendance operations, native print | T15, T30 | `BLOCKED` | — | — | Required + native print |

### Phase 5 exit record

| Field | Value |
|---|---|
| Phase status | `BLOCKED` |
| Tickets merged | — |
| Rescue integration SHA | — |
| iOS/Android evidence | — |
| Native print evidence | — |
| Approval packages | — |
| Remaining attendance/scanner defects | — |
| Next phase | Phase 6 |

---

# 12. Phase 6 — Contraction, Verification & Promotion

**Goal:** Remove obsolete paths, prove the whole product, obtain final human evidence, and assemble the sole promotion candidate.

| Key | Issue | Ticket | Blocked by | Status | PR | Merge SHA | Human gate |
|---|---|---|---|---|---|---|---|
| T32 | [#537](https://github.com/Noahlw/efcc/issues/537) | Contract obsolete styling paths and native exceptions | T16–T31 as declared in issue | `BLOCKED` | — | — | N/A |
| T33 | [#538](https://github.com/Noahlw/efcc/issues/538) | Full route/state, cross-browser, historical-finding verification | T05, T32 | `BLOCKED` | — | — | N/A |
| T34 | [#539](https://github.com/Noahlw/efcc/issues/539) | Human visual/device/AT/preference/print approval | T33 | `BLOCKED` | — | — | Required |
| T35 | [#540](https://github.com/Noahlw/efcc/issues/540) | Assemble Rescue Integration promotion candidate | T01, T33, T34 | `BLOCKED` | — | — | Owner release approval |
| T36 | [#541](https://github.com/Noahlw/efcc/issues/541) | Record A–F supersession and #498 disposition | T35 | `BLOCKED` | — | — | Owner approval |

### Phase 6 exit record

| Field | Value |
|---|---|
| Phase status | `BLOCKED` |
| Final rescue candidate SHA | — |
| Full machine gate | — |
| Human matrix | — |
| Rescue Integration PR | — |
| Owner promotion approval | — |
| A–F supersession record | — |
| #498 disposition | — |

---

## 13. Active phase stack

The tracker separates the implementation frontier from the merge frontier. `STACK_GREEN` unlocks child implementation; it does not mean approved or merge-ready.

| Field | Value |
|---|---|
| Phase | Phase 0 — Foundation & Recovery Control |
| Rescue base SHA | `6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2` |
| Stack root | `docs/ui-rescue-stacked-pr-delivery` |
| Stack tip | `rescue/t03-styling-governance` / T03 PR #548 |
| Implementation frontier | T03 / #508 `REVIEW_CHANGES`; T05 / #510 remains `BLOCKED_EXTERNAL_UPSTREAM` pending corrected-T03 restack |
| Merge frontier | Amendment PR #547 → T04 PR #546 → T03 PR #548; parent-first merge remains pending |
| Review pending | T03 correction and two-axis `/code-review`; T05 review/runtime qualification follows the merge/restack |
| Human approval pending | None for Phase 0 foundation tickets |
| Descendants requiring restack | T05 onto the corrected T03 head after #548 is verified and merged |
| Next safe action | Complete T03 review and exact-head CI verification, then merge #547 → #546 → #548 parent-first |

## Stack map

| Pos | Ticket | Logical blockers | Stack parent | Branch | Worktree | PR base | PR | State | Reviewed implementation SHA | Human gate | Rollback boundary |
|---:|---|---|---|---|---|---|---|---|---|---|---|
| 0 | Amendment | None | `rescue/ui-control-recovery` | `docs/ui-rescue-stacked-pr-delivery` | `/home/ubuntu/efcc-rescue-stacked-delivery` | `rescue/ui-control-recovery` | #547 | `STACK_GREEN` | `f39062ffd81746b18322ea6035461179cf669363` | N/A | `6e6fe517` |
| 1 | T04 / #509 | T01 | `docs/ui-rescue-stacked-pr-delivery` | `rescue/t04-worker-suites` | `/home/ubuntu/efcc-rescue-t04-worker-suites` | `docs/ui-rescue-stacked-pr-delivery` | #546 | `STACK_GREEN` | `cdbe4757af51247a78bc3a1c94ade1f11c332a6a` | N/A | `6d27fee` |
| 2 | T03 / #508 | T02 | `rescue/t04-worker-suites` | `rescue/t03-styling-governance` | `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/phase0-t03-20260904` | `rescue/t04-worker-suites` | [#548](https://github.com/Noahlw/efcc/pull/548) | `REVIEW_CHANGES` | pending | N/A | `bcf92fc` |
| 3 | T05 / #510 | T04 | `rescue/t03-styling-governance` | `rescue/t05-runtime-stability` | remote branch only | `rescue/t03-styling-governance` | — | `BLOCKED_EXTERNAL_UPSTREAM` | pending | N/A | pending; waits on corrected T03 and official upstream fix qualification |
| 4 | T06 / #511 | T01, T03, T05 | `rescue/t05-runtime-stability` | `rescue/t06-css-cascade` | planned | `rescue/t05-runtime-stability` | — | `BLOCKED` | — | N/A | pending |

---

## 14. Ticket execution log

Append one compact entry after every ticket. Do not copy the entire issue body.

### Template

#### Txx / #xxx — `<ticket title>`

- **Status:** `FRONTIER / IN_PROGRESS / STACK_GREEN / RESTACK_REQUIRED / REVIEW_CHANGES / WAITING_HUMAN / MERGE_READY / MERGED_RESCUE / BLOCKED`
- **Base rescue SHA:**
- **Reviewed implementation SHA / merge SHA:**
- **Branch / PR:**
- **Worktree:**
- **Rollback boundary:**
- **Delivered outcome:**
- **Tests:**
- **Code review:** `/code-review` result and finding disposition
- **Human approval:** `N/A / PENDING / APPROVED / REJECTED`
- **Preservation impact:** link or short note
- **Open blocker:**
- **Next eligible ticket:**

#### T01 / #506 — Freeze A–F and publish the Preservation Ledger

- **Status:** `MERGED_RESCUE`
- **Base rescue SHA:** `cdb326f206da0bb6ff9de9997124f7bb7b16ff61`
- **Rollback boundary:** `cdb326f`
- **Reviewed implementation SHA / merge SHA:** `1dc5023f4d9bb7fbc02b2855d405e72cf5a9af02` / `d71a7ae807e7bd91795d0d0f6ac514074b3cd7e2`
- **Branch / PR:** `rescue/t01-preservation-ledger` / [#543](https://github.com/Noahlw/efcc/pull/543)
- **Worktree:** `/home/ubuntu/efcc-rescue-t01-ledger`
- **Delivered outcome:** Exact frozen A–F provenance; 17 capability dispositions; 15 shipped route/state rows with exclusions; imported deferred/review/runtime findings; generated frontier summary.
- **Tests:** Documentation integrity check passed; `git diff --check` passed; aggregate runtime not applicable to this documentation-only ticket.
- **Code review:** Two-axis `/code-review` passed after fixing the settings seam, supersession-boundary, authority-chain, tracker-state, deferred-finding, Programs-state, and Phase F SHA findings.
- **Human approval:** `N/A`
- **Preservation impact:** [`ui-control-recovery-preservation-ledger.md`](ui-control-recovery-preservation-ledger.md) and [`ui-control-recovery-preservation-summary.md`](ui-control-recovery-preservation-summary.md)
- **Open blocker:** None; initial T01 ledger merged. The full-S4 provenance correction is recorded below.
- **Next eligible ticket:** T02 / #507 (selected); T04 / #509 after the full-S4 correction merge.

#### T01 / #506 — Extend the Preservation Ledger to the full S4 lineage

- **Status:** `MERGED_RESCUE`
- **Base rescue SHA:** `e68d554e7dd7abb97dfa916ffe861f616b82cc57`
- **Rollback boundary:** `e68d554`
- **Reviewed implementation SHA / merge SHA:** `7e1f4f0fe47c4a095892054e93bb390b6fa08fd9` / `6d27fee83a7033af1cf0e896868b3f0e812f0273`
- **Branch / PR:** `rescue/t01-full-s4-lineage` / [#544](https://github.com/Noahlw/efcc/pull/544)
- **Worktree:** `/home/ubuntu/efcc-rescue-t01-lineage`
- **Delivered outcome:** Verified main→#457→#458→#469→#470→#471→#472→#473→#496→#497→#501→#502→#503→#504 lineage; six pre-#473 capability bridge rows; current Phase F replacement seams; generated summary and synchronized tracker.
- **Tests:** GitHub ancestry/frontier check passed; correction integrity check passed with 13 exact PR OIDs, 23 capability rows, 15 route rows, six bridge rows, 67 local links; `git diff --check` passed; aggregate runtime not applicable.
- **Code review:** Both requested `e68d554...bbb5067` axes passed; actual final `e68d554...7e1f4f0` axes passed with zero findings.
- **Human approval:** `N/A`
- **Workflow note:** Initial T01 implementation and this correction were completed before formal `/implement` invocation; deviation recorded here. T02 onward invokes `/implement` before coding.
- **Preservation impact:** [`ui-control-recovery-preservation-ledger.md`](ui-control-recovery-preservation-ledger.md) and [`ui-control-recovery-preservation-summary.md`](ui-control-recovery-preservation-summary.md)
- **Open blocker:** None; T01 full-lineage correction merged. T02 is selected; T04 is now eligible.
- **Next eligible ticket:** T02 / #507 (selected); T04 / #509

#### T02 / #507 — Establish UI governance and agent change control

- **Status:** `MERGED_RESCUE`
- **Base rescue SHA:** `6d27fee83a7033af1cf0e896868b3f0e812f0273`
- **Rollback boundary:** `6d27fee`
- **Reviewed implementation SHA / merge SHA:** `9c57b71068f3162fbb81b57b7f84339cf592b28d` / `6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2`
- **Branch / PR:** `rescue/t02-ui-governance` / [#545](https://github.com/Noahlw/efcc/pull/545)
- **Worktree:** `/home/ubuntu/efcc-rescue-t02-governance`
- **Delivered outcome:** Persistent UI governance authority defining precedence, canonical styling stack, four ownership layers, semantic CVA/composition boundaries, Contract Change control, exact waivers, approvals, evidence, and rescue scope; concise root guidance pointer.
- **Tests:** Governance integrity check passed with 10 authority sections, full post-main S4 lineage link, canonical stack, four ownership layers, semantic CVA/composition, Contract Change, waiver, approval, scope preservation, and `AGENTS.md` pointers; `git diff --check` passed; Markdown/local links verified; aggregate runtime not applicable.
- **Code review:** Standards and Spec axes passed on `6d27fee...9162f737`; `9c57b71` is the last substantive T02 correction before tracker-only evidence commits `9162f737` and `722050e`; the merged rescue state is `6e6fe51`.
- **Human approval:** `N/A`
- **Workflow:** `/implement` scope applied before editing; the T01 workflow deviation remains recorded above and T02 onward follows this gate.
- **Preservation impact:** [`ui-control-recovery-governance.md`](ui-control-recovery-governance.md) and `AGENTS.md`
- **Open blocker:** None; PR #545 merged into rescue at `6e6fe51`.
- **Next eligible ticket:** Stacked-delivery amendment, then T04 / #509.

#### Amendment — Adopt ticket-isolated stacked PR delivery

- **Status:** `STACK_GREEN`
- **Base rescue SHA:** `6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2`
- **Rollback boundary:** `6e6fe51`
- **Reviewed implementation SHA / merge SHA:** `f39062ffd81746b18322ea6035461179cf669363` / pending
- **Branch / PR:** `docs/ui-rescue-stacked-pr-delivery` / [#547](https://github.com/Noahlw/efcc/pull/547)
- **Worktree:** `/home/ubuntu/efcc-rescue-stacked-delivery`
- **Delivered outcome:** Owner-approved sequencing amendment for ticket-isolated stacked PRs within each phase; `STACK_GREEN` unlocks child implementation without implying approval or merge; parent corrections propagate through descendants by restacking.
- **Tests:** Documentation integrity and local-link checks passed; `git diff --check` passed; two-axis `/code-review` passed with zero actionable findings.
- **Code review:** Standards and Spec axes passed with zero actionable findings.
- **Human approval:** `N/A`
- **Preservation impact:** Sequencing only; ticket acceptance criteria, logical blockers, domain contracts, preservation dispositions, UI contract values, and final Rescue Integration gate unchanged.
- **Open blocker:** None; T04 / #509 may now be restacked.
- **Next eligible ticket:** T03 / #508; create its PR targeting `rescue/t04-worker-suites`.

#### T04 / #509 — Restore excluded normalized Worker suites

- **Status:** `STACK_GREEN`
- **Base rescue SHA:** `6d27fee83a7033af1cf0e896868b3f0e812f0273`
- **Reviewed implementation SHA / merge SHA:** `cdbe4757af51247a78bc3a1c94ade1f11c332a6a` / pending
- **Rollback boundary:** `6d27fee`
- **Branch / PR:** `rescue/t04-worker-suites` / [#546](https://github.com/Noahlw/efcc/pull/546)
- **Worktree:** `/home/ubuntu/efcc-rescue-t04-worker-suites`
- **Delivered outcome:** Restored four normalized Worker suites to the aggregate; corrected retired bootstrap-field assertions, isolated pending-request fixtures, corrected scope/audit expectations, preserved the role-free schema contract, added response-correlated successful `ROLE_DEFINITION_REVOKE` proof, retained GRANT replay count exactly `1`, and made audit ordering deterministic.
- **Tests:** Focused four-suite run passed (4 files / 31 tests); `pnpm test:workerd` passed (43 files / 605 tests); root and web typechecks passed; `pnpm verify:precommit` passed; `git diff --check` passed.
- **Code review:** Standards and Spec axes passed on the restacked incremental diff against amendment `47525a9`, with zero actionable findings.
- **Human approval:** `N/A`
- **Preservation impact:** Normalized identity, permission, audit, idempotency, scope, authorization, and aggregate Worker coverage; no production implementation changed.
- **Open blocker:** None; T04 is `STACK_GREEN`, but parent-first merge remains pending.
- **Next eligible ticket:** T03 / #508; create its branch from `rescue/t04-worker-suites`.


### T04 / #509 — Root-cause evidence matrix

| Hypothesis | Expected observation if true | Diagnostic result | Status |
|---|---|---|---|
| The four suites were excluded because their bootstrap assertions still expect retired fixed-role fields. | `role`/`systemRole` assertions fail with `undefined` versus `null`; the current public projection omits those fields. | `web/lib/auth/handlers.ts` `secretFreeUser` returns identities/capabilities only; contraction tests reject `systemRole`/legacy role fields. Updated both normalized authority suites to assert omission and current identity summaries; both pass. | Confirmed; test contract corrected |
| C-487-02 fixture rows violate the pending enrollment uniqueness contract. | Multiple Pending rows for one `(program_id, member_user_id)` collide with migration `0005`, leaving later request IDs absent and decision calls returning 404. | The fixture inserted all three request IDs for `TARGET_USER`; migration `0005` enforces a unique pending member/program pair. Added three distinct disposable target accounts and bound one request to each; C-487-02 passes. | Confirmed; fixture corrected |
| C-487-04 still probes the retired `accounts.role` column. | `UPDATE accounts SET role` fails with `no such column: role` after migration `0026`. | Current schema intentionally has no `accounts.role`; replaced the mutation with a `PRAGMA table_info(accounts)` absence assertion while retaining normalized management/authorization checks. | Confirmed; assertion corrected |
| The cross-scope permission expectation is too broad. | A department actor targeting a role outside its scope returns `RoleScopeMismatchError`, not a generic capability denial. | Permission editor test now asserts `RoleScopeMismatchError` exactly; focused suite passes. | Confirmed; assertion corrected |
| The audit-count query includes adjacent idempotency-conflict IDs, and replay must not create another audit row. | A prefix `LIKE` query can count the conflict audit; the exact original denial produces one matching audit row. | Replaced prefix matching with `audit_id = ?` and expected count `1`; handler replay audit count corrected from `2` to `1`. Focused suite passes. | Confirmed; assertions corrected |
| Audit ordering remains timestamp-dependent. | Tied timestamps would make result ordering unstable. | GRANT audit query lacked `audit_id DESC`; added deterministic `ORDER BY inserted_at DESC, audit_id DESC` to match REVOKE. Both queries now deterministic. | Confirmed; corrected in implementation commit |
| Aggregate transport diagnostic | Expected result was a complete required aggregate output. | The first context-mode invocation timed out at the transport layer after 30 seconds while its child process continued; no pass/fail was classified from that attempt. The verified supervised rerun completed separately with the 43-file / 605-test result above. | Diagnostic transport failure retained; superseded by supervised evidence |
| Finding 1 — positive REVOKE audit proof | The second PATCH sends `home.publish: false`, so it must emit one successful `ROLE_DEFINITION_REVOKE` audit correlated to that response. | Response-correlated query: `AND correlation_id = ?` bound to `currentBody.requestId`; asserts `outcome === "SUCCESS"`; deterministic `ORDER BY inserted_at DESC, audit_id DESC`; GRANT count retained at exactly `1`. | Verified; focused handler test passes |
| Finding 2 — deterministic GRANT ordering | GRANT audit query used `ORDER BY inserted_at DESC LIMIT 1` without tiebreaker. | Added `audit_id DESC` to GRANT query to match REVOKE deterministic ordering. | Verified; all suites pass |

No production implementation, schema, API, permission, audit, idempotency, scope, or authorization code was changed by T04.

#### T03 / #508 — Enforce styling ownership and typed UI contract governance

- **Status:** `REVIEW_CHANGES`
- **Base rescue SHA:** `bcf92fcd9f443b1ee2f481c5beea1730a99bc840`
- **Reviewed implementation SHA / merge SHA:** pending substantive correction / pending
- **Rollback boundary:** `bcf92fc`
- **Branch / PR:** `rescue/t03-styling-governance` / [#548](https://github.com/Noahlw/efcc/pull/548)
- **Worktree:** `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/phase0-t03-20260904`
- **Delivered outcome:** Added typed route-scenario, UI-contract, approval-package, waiver, preservation-reference, and native-exception registries; strict ISO/calendar and exact metadata validation; structured contract-failure reporting; seven-rule static source audit with source-exact high-blast CSS waivers; fail-closed fast/affected/full/release CLI modes and a dedicated governance workflow.
- **Tests:** Focused governance test: 97 passed; CLI tests: 18 passed (also 18/18 under simulated `GITHUB_BASE_REF`); governance fast/affected/full/release modes passed (affected: 5 files / 0 violations; full: 277 files / 0 active violations / 75 waived; release gate passed); root/web typechecks and `pnpm verify:precommit` passed; formatter check and `git diff --check` passed locally. Exact substantive head still requires GitHub Actions verification.
- **Code review:** Pending two-axis review of the substantive source-fingerprint correction against `rescue/t04-worker-suites`.
- **Human approval:** `N/A`
- **Preservation impact:** Machine-enforces T02 governance without changing production behavior, schema, permissions, routes, or domain contracts; historical debt remains explicit and waiver-backed.
- **Open blocker:** Exact-head GitHub verification is pending; until it is green T03 is not `STACK_GREEN`. T05 remains externally blocked after the corrected head is merged/restacked.
- **Next eligible ticket:** T05 / #510 after T03 reaches `STACK_GREEN` and is merged into rescue.
- **Review follow-ups (deferred, non-blocking):** two-axis reviewers flagged hardening of pre-existing outer-checkout discovery/SHA/REF assertions (vacuous array-only assertions, SHA-selection truthfulness, temp-fixture extraction) — record as follow-up, not a CI blocker; production `getAffectedFiles` remains fail-closed.
---

## 15. Human approval queue

| Ticket | Scenario / surface | SHA | Viewports / browser / device | Status | Owner note | Approval artifact |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — |

Allowed status:
- `PENDING`
- `APPROVED`
- `REJECTED`
- `N/A`

An implementation agent cannot self-approve.

---

## 16. Cross-phase assets

Keep links here so new sessions do not need to rediscover them.

| Asset | Owner ticket | Current reference / status |
|---|---|---|
| Preservation Ledger | T01 / #506 | [`ui-control-recovery-preservation-ledger.md`](ui-control-recovery-preservation-ledger.md) and [`ui-control-recovery-preservation-summary.md`](ui-control-recovery-preservation-summary.md) — full post-main S4 lineage merged with #544 |
| UI governance authority | T02 / #507 | [`ui-control-recovery-governance.md`](ui-control-recovery-governance.md) — created, verified, and merged via PR #545 at `6e6fe51` |
| Stacked PR delivery amendment | Amendment | `AGENTS.md`, [`ui-control-recovery-governance.md`](ui-control-recovery-governance.md), and this tracker — PR #547 `STACK_GREEN` |
| Scenario Registry | T03 / #508 | `web/lib/governance/registries.ts` — created with 16 route scenarios and exact contract references; validated by `governance.test.ts` |
| UI Contract Registry | T03 / #508 | `web/lib/governance/registries.ts` — created with 17 executable contracts/probe definitions; live token, safe-area, navigation, and scanner sources covered |
| UI Lab | T07 / #512 | Not created |
| Approval package index | T03 / #508 | `web/lib/governance/registries.ts` — created with 4 status/owner/baseline/evidence packages; strict approval metadata validation active |
| T12 rescue decision | T12 / #517 | `UNDECIDED` |
| Historical finding reconciliation | T01, route tickets, T33 | Not complete |
| Final full-app verification | T33 / #538 | Not run |
| Final human matrix | T34 / #539 | Not run |
| Rescue Integration candidate | T35 / #540 | Not created |

---

## 17. Blocker and decision log

Only record blockers or decisions that affect more than one ticket or the next phase.

| ID | Type | First seen | Description | Owner ticket / person | Status | Evidence / resolution |
|---|---|---|---|---|---|---|
| B-001 | Governance | Starting state | Existing blanket layout-CVA rule conflicts with approved semantic-CVA/composition ownership | T02 / #507 | `RESOLVED` | Governance authority merged via #545; root guidance delegates composition/layout to patterns/routes |
| B-002 | Verification | Starting state | Four normalized Worker suites are excluded from the required aggregate | T04 / #509 | `RESOLVED` | T04 is `STACK_GREEN` on reviewed implementation `cdbe475`; aggregate passes 43 files / 605 tests with no exclusions on the T04 branch; parent-first merge remains pending |
| B-003 | Runtime | Phase F | Full Programs/Worker/D1 journey is unreliable | T05 / #510 | `OPEN` | — |
| D-001 | Decision | Planning | `SALVAGE STACK` vs `SELECTIVE REPLAY` remains undecided until Programs tracer evidence | T12 / #517 + owner | `PENDING` | — |
| B-004 | Reconciliation | Starting state | Required `rescue/ui-control-recovery` branch and intended tracker path were absent at session entry | Phase 0 / owner | `RESOLVED` | Rescue branch and tracker bootstrap are committed; branch is based on the frozen Phase F SHA |
| D-002 | Decision | 2026-09-03 | Owner approved ticket-isolated stacked PR delivery within each phase; `STACK_GREEN` unlocks child implementation but not approval or merge | Owner / #505 | `ACCEPTED` | [Owner-approved execution-model amendment](https://github.com/Noahlw/efcc/issues/505#issuecomment-5514680835) |

Do not create extra implementation work here. If a blocker needs implementation outside an existing ticket, stop and ask the owner whether the tracker/spec must change.

---

## 18. Phase handoff template

Complete this at the end of each phase so the next phase can start in a fresh session.

### Phase `<number>` handoff

- **Phase:**  
- **Completed tickets:**  
- **Rescue integration SHA:**  
- **What the phase established:**  
- **Machine verification summary:**  
- **Human approvals recorded:**  
- **Preservation changes:**  
- **Contracts/commands introduced or changed:**  
- **Open blockers carried forward:**  
- **Tracker rows updated:**  
- **Next phase:**  
- **First eligible ticket:**  
- **Exact next action:**  
- **Rollback checkpoint:**  

---

## 19. Tracker update boundaries

Agents may update:

- current phase/status;
- ticket status;
- branch, PR, SHA, and evidence links;
- implementation frontier;
- merge frontier;
- active phase stack;
- blocker state;
- human approval status as supplied by the owner;
- cross-phase asset links;
- phase handoff;
- next safe action.

Agents must not silently change:

- parent Spec scope;
- ticket titles, acceptance criteria, or blocker graph;
- phase membership;
- the rule that each ticket gets its own PR;
- human approval authority;
- historical preservation rules;
- contract/baseline expectations.

A requested change to those items is not a tracker update. It is an owner-approved ticket/spec/contract change.

---

## 20. Next safe action

1. Push the substantive T03 correction and verify the exact-head GitHub governance run.
2. Once green, merge #547 → #546 → #548 parent-first into `rescue/ui-control-recovery`, then restack T05.
3. Implement/review T05 / #510 only, preserving the upstream blocker if the official runtime still fails.
4. Keep T06 blocked until T05 is `STACK_GREEN`; do not start Phase 1.
