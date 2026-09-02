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

### Stable delivery rules

- Never implement directly on the historical Phase F branch.
- Every implementation ticket gets its own branch/worktree and focused PR.
- Every ticket PR targets `rescue/ui-control-recovery`.
- The GitHub issue body and comments define the ticket scope.
- A blocker must be merged into the rescue branch before its dependent ticket starts.
- Tests and `/code-review` must complete before a PR is considered ready.
- A visual ticket is not complete until the required human approval is recorded.
- Do not weaken tests, contracts, baselines, or tolerances to make implementation pass.
- Do not modify or supersede the historical S4 PRs recorded in the ledger before T35/T36.
- Do not use a single phase session to combine several tickets into one PR.

---

## 3. How each phase session works

### At session start

1. Read root `AGENTS.md`.
2. Read this tracker.
3. Read parent Spec #505.
4. Read the GitHub body and comments for the tickets in the current phase.
5. Verify the phase entry gate and rescue integration HEAD.
6. Select only the first genuinely unblocked ticket.
7. Create a fresh branch/worktree from the latest approved rescue integration HEAD.
8. Update **Current execution state** before editing.

### For each ticket

1. Implement only that ticket.
2. Run its focused and aggregate verification.
3. Invoke `/code-review`.
4. Resolve findings without changing the ticket contract.
5. Prepare the PR with `/pr-description`.
6. For visual tickets, stop at `WAITING_HUMAN` until the owner approves.
7. Merge only after all required gates.
8. Update the ticket row, evidence, merge SHA, and next frontier.

### At session end

1. Update the current phase table.
2. Append a ticket execution log entry.
3. Update human approval and blocker records.
4. Update rescue integration HEAD.
5. Write the phase handoff if the phase is complete.
6. Clear the active ticket fields.
7. Stop. The next phase starts in a new session.

---

## 4. Current execution state

Update this table at the start and end of every implementation session.

| Field | Current value |
|---|---|
| Current phase | **Phase 0 — Foundation & Recovery Control** |
| Phase status | `IN PROGRESS — T02` |
| Rescue integration HEAD | `6d27fee83a7033af1cf0e896868b3f0e812f0273` — T01 full-lineage correction merged |
| Active ticket | T02 / [#507](https://github.com/Noahlw/efcc/issues/507) |
| Active branch/worktree | `rescue/t02-ui-governance` / `/home/ubuntu/efcc-rescue-t02-governance` |
| Active PR | [#545](https://github.com/Noahlw/efcc/pull/545) |
| Current frontier | T02 [#507](https://github.com/Noahlw/efcc/issues/507) active; T04 [#509](https://github.com/Noahlw/efcc/issues/509) now `FRONTIER`; T03/T05/T06 remain blocked by declared edges |
| Pending human approval | None |
| Active blocker | None |
| Next safe action | Await review and merge of T02 PR #545; keep T04 frontier unstarted in this one-ticket worktree |
| Last merged rescue SHA | `6d27fee83a7033af1cf0e896868b3f0e812f0273` |
| Last rollback checkpoint | Frozen Phase F SHA `6edf28c0f8f7058cf992416e7b517824c3178c8` |
| Entry verification | Frozen Phase F ancestry and rescue base verified; T01 initial ledger and full-lineage correction merged; tracker is on this fresh T02 worktree; T04 is eligible but not selected |

> The T01 full-lineage correction merged via #544; T04 is now eligible and must use the corrected ledger. Do not merge the historical S4 stack into `main` merely to move this document.

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
| T02 | [#507](https://github.com/Noahlw/efcc/issues/507) | Establish UI governance and agent change control | None | `PR_READY` | [#545](https://github.com/Noahlw/efcc/pull/545) | — | Governance authority and concise `AGENTS.md` pointer verified; two-axis `/code-review` passed; awaiting review/merge |
| T03 | [#508](https://github.com/Noahlw/efcc/issues/508) | Enforce styling ownership and typed UI contract governance | T02 | `BLOCKED` | — | — | — |
| T04 | [#509](https://github.com/Noahlw/efcc/issues/509) | Restore excluded normalized Worker suites | T01 | `FRONTIER` | — | — | T01 correction merged; eligible, not selected while T02 is active |
| T05 | [#510](https://github.com/Noahlw/efcc/issues/510) | Stabilize full Programs/Worker/D1 runtime | T04 | `BLOCKED` | — | — | — |
| T06 | [#511](https://github.com/Noahlw/efcc/issues/511) | Contain global CSS cascade | T01, T03, T05 | `BLOCKED` | — | — | Diagnostic comparison, not final visual baseline |

### Phase 0 exit record

| Field | Value |
|---|---|
| Phase status | `NOT COMPLETE` |
| Tickets merged | T01 / #506 initial ledger and full-S4 provenance correction |
| Rescue integration SHA | `6d27fee83a7033af1cf0e896868b3f0e812f0273` |
| Preservation Ledger | Full post-main S4 lineage merged with T01 correction — [`ui-control-recovery-preservation-ledger.md`](ui-control-recovery-preservation-ledger.md) and [`ui-control-recovery-preservation-summary.md`](ui-control-recovery-preservation-summary.md) |
| Governance authority | Not created — T02 owns it |
| Required Worker gate | Still excludes four suites — T04 owns it |
| Programs runtime | Phase F blocker still open — T05 owns it |
| Cascade result | Not run — T06 owns it |
| Open blockers | — |
| Next phase | Phase 1 after all six tickets merge |

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

## 13. Active ticket record

Only one active implementation ticket should normally appear here.

| Field | Value |
|---|---|
| Ticket / issue | T02 / [#507](https://github.com/Noahlw/efcc/issues/507) |
| Phase | Phase 0 — Foundation & Recovery Control |
| Goal | Establish the UI governance and agent change-control authority |
| Base rescue SHA | `6d27fee83a7033af1cf0e896868b3f0e812f0273` |
| Branch / worktree | `rescue/t02-ui-governance` / `/home/ubuntu/efcc-rescue-t02-governance` |
| PR | [#545](https://github.com/Noahlw/efcc/pull/545) |
| Required skills | `/using-git-worktrees`, `/implement`, `/code-review`, `/pr-description` |
| Focused tests | Governance integrity check: 9 authority sections, canonical stack, four ownership layers, semantic CVA/composition, Contract Change, waiver, approval, scope, pointer, tracker, and 64 local links passed |
| Aggregate tests | N/A — documentation-only authority ticket |
| Human gate | N/A |
| Current status | `PR_READY` |
| Blocker | Awaiting review/merge of PR #545; T04 remains unstarted |
| Next action | Await review/merge of PR #545 before starting another ticket |

---

## 14. Ticket execution log

Append one compact entry after every ticket. Do not copy the entire issue body.

### Template

#### Txx / #xxx — `<ticket title>`

- **Status:** `PR_READY / WAITING_HUMAN / MERGED_RESCUE / BLOCKED`
- **Base rescue SHA:**
- **Head / merge SHA:**
- **Branch / PR:**
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
- **Head / merge SHA:** `1dc5023f4d9bb7fbc02b2855d405e72cf5a9af02` / `d71a7ae807e7bd91795d0d0f6ac514074b3cd7e2`
- **Branch / PR:** `rescue/t01-preservation-ledger` / [#543](https://github.com/Noahlw/efcc/pull/543)
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
- **Head / merge SHA:** `7e1f4f0fe47c4a095892054e93bb390b6fa08fd9` / `6d27fee83a7033af1cf0e896868b3f0e812f0273`
- **Branch / PR:** `rescue/t01-full-s4-lineage` / [#544](https://github.com/Noahlw/efcc/pull/544)
- **Delivered outcome:** Verified main→#457→#458→#469→#470→#471→#472→#473→#496→#497→#501→#502→#503→#504 lineage; six pre-#473 capability bridge rows; current Phase F replacement seams; generated summary and synchronized tracker.
- **Tests:** GitHub ancestry/frontier check passed; correction integrity check passed with 13 exact PR OIDs, 23 capability rows, 15 route rows, six bridge rows, 67 local links; `git diff --check` passed; aggregate runtime not applicable.
- **Code review:** Both requested `e68d554...bbb5067` axes passed; actual final `e68d554...7e1f4f0` axes passed with zero findings.
- **Human approval:** `N/A`
- **Workflow note:** Initial T01 implementation and this correction were completed before formal `/implement` invocation; deviation recorded here. T02 onward invokes `/implement` before coding.
- **Preservation impact:** [`ui-control-recovery-preservation-ledger.md`](ui-control-recovery-preservation-ledger.md) and [`ui-control-recovery-preservation-summary.md`](ui-control-recovery-preservation-summary.md)
- **Open blocker:** None; T01 full-lineage correction merged. T02 is selected; T04 is now eligible.
- **Next eligible ticket:** T02 / #507 (selected); T04 / #509

#### T02 / #507 — Establish UI governance and agent change control

- **Status:** `PR_READY`
- **Base rescue SHA:** `6d27fee83a7033af1cf0e896868b3f0e812f0273`
- **Head / merge SHA:** `358adbd85ea2d7416eb53933744a29325676f3c9` / pending
- **Branch / PR:** `rescue/t02-ui-governance` / [#545](https://github.com/Noahlw/efcc/pull/545)
- **Delivered outcome:** Persistent UI governance authority defining precedence, canonical styling stack, four ownership layers, semantic CVA/composition boundaries, Contract Change control, exact waivers, approvals, evidence, and rescue scope; concise root guidance pointer.
- **Tests:** Governance integrity check passed with 9 authority sections and 64 local links; `git diff --check` passed; aggregate runtime not applicable.
- **Code review:** Standards and Spec axes passed with zero findings.
- **Human approval:** `N/A`
- **Workflow:** `/implement` scope applied before editing; the T01 workflow deviation remains recorded above and T02 onward follows this gate.
- **Preservation impact:** [`ui-control-recovery-governance.md`](ui-control-recovery-governance.md) and `AGENTS.md`
- **Open blocker:** PR #545 review/merge; T04 / #509 remains unstarted.
- **Next eligible ticket:** T04 / #509 is `FRONTIER`; T03 / #508 unlocks after T02 merge.

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
| UI governance authority | T02 / #507 | [`ui-control-recovery-governance.md`](ui-control-recovery-governance.md) — created and verified; PR #545 |
| Scenario Registry | T03+ | Not created |
| UI Contract Registry | T03+ | Not created |
| UI Lab | T07 / #512 | Not created |
| Approval package index | T07+ | Not created |
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
| B-001 | Governance | Starting state | Existing blanket layout-CVA rule conflicts with approved semantic-CVA/composition ownership | T02 / #507 | `OPEN` | — |
| B-002 | Verification | Starting state | Four normalized Worker suites are excluded from the required aggregate | T04 / #509 | `OPEN` | — |
| B-003 | Runtime | Phase F | Full Programs/Worker/D1 journey is unreliable | T05 / #510 | `OPEN` | — |
| D-001 | Decision | Planning | `SALVAGE STACK` vs `SELECTIVE REPLAY` remains undecided until Programs tracer evidence | T12 / #517 + owner | `PENDING` | — |
| B-004 | Reconciliation | Starting state | Required `rescue/ui-control-recovery` branch and intended tracker path were absent at session entry | Phase 0 / owner | `RESOLVED` | Rescue branch and tracker bootstrap are committed; branch is based on the frozen Phase F SHA |

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
- current frontier;
- active ticket;
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

1. Replace the old overgrown living-plan content with this ticket-driven tracker.
2. Ensure the tracker commit exists on `rescue/ui-control-recovery`.
3. Verify `rescue/ui-control-recovery` is based on frozen Phase F SHA.
4. Start a new **Phase 0** OMP session using the Phase 0 kickoff prompt.
5. Implement the first unblocked ticket only.
