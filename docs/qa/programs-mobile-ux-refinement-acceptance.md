# Programs mobile UX refinement acceptance trace

Status: `IN PROGRESS — E0 recorded; implementation underway`

This ledger is the candidate-bound acceptance inventory for the approved local
plan at `docs/design/2026-09-15-programs-mobile-ux-refinement.md`. It is not
owner approval, device approval, merge, release, or a replacement for the
domain/spec authority.

## Candidate and environment

| Field | Value |
| --- | --- |
| Repository | `/Users/noah.wong/Desktop/code/efcc` |
| Branch | `codex/programs-production/ds1` |
| Base | `e46cf616fc690f3d191fa435232ba73609b24f79` (`origin/main`) |
| Initial candidate | `e1339aebee5177f252499a4f98d5defa5ac62b5b` |
| Remote comparison | `origin/main` = `e46cf616…`; PR #607 head = `9ad90d25…` and does not contain this local candidate |
| Runtime required | Node `22.18.0`, pnpm `11.7.0`; verified from this repository before implementation |
| Acceptance profile | `complex` |
| Review risk | `high` — permissions, durable attendance meaning, navigation/recovery, QR artifacts, shared UI and real route seams |
| Review route | Fresh independent Standards/Spec/Acceptance review when delegation is available; otherwise disclose self-review limitation |
| UI authority | `docs/implementation/ui-control-recovery-governance.md`, `DESIGN.md`, local shadcn/Radix primitives and existing Screen Foundations |
| Domain authority | `CONTEXT.md`, Spec 081, accepted Programs UX contract and the approved local plan |
| Context7 record | `2026-09-15`: `/shadcn-ui/ui` and `/joe-bell/cva`; queried Sheet/Dialog/Button/Input/Field controlled APIs, accessibility attributes, and typed CVA variants before UI edits |

## Dirty-work boundary

The following pre-existing dirty documentation/QA files were observed before
E0 and are out of scope. Do not stage, rewrite, discard, or use them to satisfy
the clean-worktree aggregate:

`CONTEXT.md`, `DESIGN.md`,
`docs/adr/0026-programs-module-state-and-scoped-management-ui.md`,
`docs/adr/0028-public-guest-check-in-entry.md`,
`docs/adr/0043-owned-civic-design-system-governance.md`,
`docs/qa/2026-09-11-programs-route-fidelity-correction.md`, and
`docs/superpowers/plans/programs-route-fidelity-recovery/R8-fixed-point-qualification.md`.

The acceptance ledger itself is owned by this delivery and may be updated with
candidate-matching evidence. Generated artifacts belong under the existing
candidate-SHA QA convention and must record their actual paths.

## Evidence levels

- `pending`: no current-candidate proof yet.
- `focused`: deterministic component/Worker/unit proof at its declared seam.
- `route`: real local authenticated route and settled interaction proof.
- `durable`: route or public contract plus authoritative persistence/readback.
- `rendered`: real route or Storybook presentation evidence at named viewport/state.
- `device`: physical camera/touch/keyboard/assistive-tech/native-print proof; not available from ordinary headless checks.
- `unverified`: required evidence could not be obtained; retain the exact blocker.

## Screen acceptance inventory

Each row records the role, starting state, action, expected observable result,
required evidence, and current status. Existing acceptable surfaces still need
an observed disposition; they are not silently skipped.

| ID | Role / initial state | Action and expected result | Required evidence | Candidate / status |
| --- | --- | --- | --- | --- |
| S01 | Member; signed in at Participant Directory | Search/filter Programs; only Active+Listed and authorized relationship/direct-context rows appear; clear search recovers results | Authenticated route, data-backed counts and filtered-empty recovery | `e1339aeb…` / pending |
| S02 | Member/nonmember; selected Program | Open detail; enrollment state is truthful; eligible apply persists; next Event opens named detail; withdrawal preserves consequence/history | Authenticated route plus durable enrollment/readback | `e1339aeb…` / pending |
| S03 | Member; selected Event A before/inside/after window | View Program/Event identity and own attendance; `掃碼簽到` preserves Event A; closed/cancelled/ineligible/already-present states are distinct | Real route, role matrix, settled own-state readback | `e1339aeb…` / pending |
| S04 | Member; scanner opened for Event A | Scan/manual code; matching credential reaches one confirmation and persists; Event B mismatch says `呢個碼對應聚會 B`, offers rescan, never switches/writes | Real UI + Worker/D1 negative and positive proof | `e1339aeb…` / pending |
| S05 | Guest/member; selected Event and optional login handoff | Submit guest or authenticate; Event context survives revalidation; success remains until Done/Return; duplicate/closed/cancelled outcomes stay explicit | Real guest/login route and durable identity/attendance readback | `e1339aeb…` / pending |
| S06 | Authorized manager; Management Directory | Search/open authorized Programs; create CTA remains usable on phone; Draft+Unlisted save opens Overview; no unauthorized create | Real route at 360/402 and permission matrix | `e1339aeb…` / pending |
| S07 | Authorized leader; Workspace Overview with next Event | Select attendance entry; opens exact Event-scoped focused roster, not enrollment Participants; identity/counts remain truthful | Authenticated real-browser Overview → roster route | `e1339aeb…` / pending |
| S08 | Authorized manager; Events collection | Upcoming/past/cancelled/today rows show true facts/status; name/detail, direct attendance, More edit/reschedule/cancel preserve list context | Real route navigation/readback at phone widths | `e1339aeb…` / pending |
| S09 | Authorized manager; new and existing Event editor | New end defaults start+1h until manual edit; existing end is preserved; invalid interval blocks save inline; Save/Discard are normal-flow end actions | Component + real route persistence/failure proof, keyboard-open rendered check | `e1339aeb…` / pending |
| S10 | Authorized manager; Event Detail | View lifecycle, attendance and `Event QR code`; cancellation explains reason/consequences and respects guards; cancelled Event does not materialize roster | Real route plus Worker/D1 cancellation/materialization proof | `e1339aeb…` / pending |
| S11 | Authorized manager; Schedule rules | Edit relevant weekly/monthly controls and bounded lifetime; save/reload exact rule; no-end/retirement/provenance semantics remain intact | Worker/D1 durable rule and route reload proof | `e1339aeb…` / pending |
| S12 | Authorized manager; Schedule Preview with candidates | Rows show date/time and new/existing/skipped/rescheduled truth; `調整` Sheet shows original/replacement/warning; open/close does not save draft | Real route/Sheet interaction and reload of saved exception | `e1339aeb…` / pending |
| S13 | Authorized manager; partial/completed generation result | Counts are authoritative; unresolved-first details explain reasons; stale/unknown outcomes reconcile before retry; completed result stays until explicit `查看聚會` | Worker/D1 generation + real route settled outcome/retry proof | `e1339aeb…` / pending |
| S14 | Authorized manager; Participants with pending/active/history | Pending-first truthful counts, search/selection; batch confirmation keeps per-person progress/results, success/attention totals and unresolved reasons in place | ~30-person mixed batch durable reload/reconcile proof | `e1339aeb…` / pending |
| S15 | Authorized manager/member; add or cancel enrollment | Search existing account with authorized hints; explicit add/cancel reason/confirmation; duplicate/denial handled; attendance history retained | Public contract and real route durable history proof | `e1339aeb…` / pending |
| S16 | Authorized leader/manager; focused roster | Rows expose authorized namesake info/state; detail Sheet returns focus/context; Excused presets/required Other reason; assisted check-in confirms once, updates counts/list; offline/stale read-only and polling no-overlap | Real local route with 30 Chinese names, Sheet/focus, offline/reconnect and Worker readback | `e1339aeb…` / pending |
| S17 | Authorized actor; Settings hub/focused/Department | Grouped values are real; focused Back is single-owned; labels/hints/errors and dirty end actions preserve drafts; save/discard/conflict/retry show actual outcome | Real route at 360/402 with keyboard/long-form rendered proof | `e1339aeb…` / pending |
| S18 | Authorized actor; Program QR and Event Detail | Program QR remains permanent; Event Detail `Event QR code` contains current Event facts, Program QR and Manual Code; download/print are complete; rotation is scoped/confirmed | Worker/route artifact inspection and QR decode; native print/device separately | `e1339aeb…` / pending |
| S19 | Member/manager; Notifications open/closed/read-failure | Panel opening does not mark read; individual/Mark All persist; target navigation is correct; read failure preserves unread/retry | Component + real route navigation/readback proof | `e1339aeb…` / pending |

## Review-gap inventory

| Gap | Required disposition and proof | Candidate / status |
| --- | --- | --- |
| G01 | Overview attendance action opens exact Event roster; authenticated real-browser proof | `e1339aeb…` / pending |
| G02 | Event → credential scanner/manual code completes through persisted Attendance; no credential-free path; wrong Event has no write | `e1339aeb…` / pending |
| G03 | Archived lifecycle guard covers resolution and Self/Guest writes; Worker negative cases/readback | `e1339aeb…` / pending |
| G04 | Cancelled materialization rejects/no-ops without snapshot/expected rows; misleading required flag removed | `e1339aeb…` / pending |
| G05 | Mixed Active→Archived PATCH is atomically guarded for metadata and blockers; audit proof | `e1339aeb…` / pending |
| G06 | Participant visibility, enrollment/history and own attendance projection are authorized and non-leaking | `e1339aeb…` / pending |
| G07 | Pre-start cancellation and Excused audit-only rule reconciled; early real Attendance preserved | `e1339aeb…` / pending |
| G08 | Canonical Schedule create caller and retry identity preserve idempotency/provenance; same-key/conflict/lost-response proof | `e1339aeb…` / pending |
| G09 | Open-window assisted success and closed-window denial follow accepted rule; no unapproved recovery feature | `e1339aeb…` / pending |
| G10 | Concurrent void returns truthful winner/already-voided result with audit | `e1339aeb…` / pending |
| G11 | Guest login preserves/revalidates Event and distinguishes closed/cancelled outcomes | `e1339aeb…` / pending |
| G12 | Full Event QR code image/download/print uses current facts and Manual Code; QR decodes; native print separate | `e1339aeb…` / pending |
| G13 | Materialization failure is structured/retryable/audited without false success | `e1339aeb…` / pending |
| G14 | Status CVA/provenance migration invariant is verified and repaired if confirmed; no route reachability overclaim | `e1339aeb…` / pending |
| G15 | Promotion validator matches actual required responsive coverage without lowering expectations | `e1339aeb…` / pending |
| G16 | Shallow batch/Schedule/roster/rotation evidence is replaced with complete current-candidate local journeys and review disposition | `e1339aeb…` / pending |

## Integrated journeys

| Journey | Required path | Evidence target | Status |
| --- | --- | --- | --- |
| J1 | Member discovery → Program/Event → credential scan/manual code → one confirmation → own Attendance readback | Real local authenticated browser + Worker/D1 | pending |
| J2 | Leader create/schedule → generated Event → exact Event roster → ~30-person phone roster actions | Real route, durable state, rendered 360×800/402×874 | pending |
| J3 | Enrollment batch → mixed per-person results → reload/reconcile → unresolved-only retry | Real route, durable state, no automatic tab switch | pending |
| J4 | Guest/QR → selected Event/login → current Event QR download/print/rotation behavior | Real route/artifact inspection; device/native print separate | pending |

## Required command/evidence record

Run commands from the effective repository directory with the verified runtime.
Stateful browser/responsive suites are sequential. The finite aggregate must use
a clean tracked disposable checkout or remain `unverified` with that exact
precondition; the seven dirty documentation files are not to be staged or
discarded for this purpose.

Required command inventory: `pnpm verify:fast`, focused Worker/component tests,
`pnpm test:programs:contract`, `pnpm test:programs:runners:unit`,
`pnpm test:programs:promotion`, `pnpm test:programs:browser`,
`pnpm test:programs:responsive`, `pnpm test:programs:visual`,
`pnpm verify:programs`, and the separately reported
`pnpm test:programs:canary`. Record actual result, role, route/fixture/state,
artifact path, and candidate SHA after each run.

Physical camera permission/decoder, downloaded QR rescan, touch/safe-area,
virtual keyboard, assistive technology, and native print remain separate
`device`/human gates. Owner approval, push/PR/merge, deployment and release are
not implied by any machine result.
