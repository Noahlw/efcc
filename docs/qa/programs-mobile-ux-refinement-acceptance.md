# Programs mobile UX refinement acceptance trace

Status: `MACHINE QUALIFIED — finite functional gates passed; B-003 canary remains open; human/device/owner gates remain`

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
| Implementation candidate | `51ca2871f7019a2906f9474539c38fd44eeb081b` |
| Remote comparison | `origin/main` = `e46cf616…`; PR #607 head = `9ad90d25…` and does not contain this local candidate |
| Runtime required | Node `22.18.0`, pnpm `11.7.0`; verified from this repository before implementation |
| Acceptance profile | `complex` |
| Review risk | `high` — permissions, durable attendance meaning, navigation/recovery, QR artifacts, shared UI and real route seams |
| Review route | Fresh independent Standards/Spec/Acceptance review dispatched for implementation candidate `51ca2871…`; result remains a separate gate |
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
| S01 | Member; signed in at Participant Directory | Search/filter Programs; only Active+Listed and authorized relationship/direct-context rows appear; clear search recovers results | Authenticated route, data-backed counts and filtered-empty recovery | `51ca2871…` / route (browser fixture covers catalog search; broader relationship matrix remains unverified) |
| S02 | Member/nonmember; selected Program | Open detail; enrollment state is truthful; eligible apply persists; next Event opens named detail; withdrawal preserves consequence/history | Authenticated route plus durable enrollment/readback | `51ca2871…` / durable (browser fixture) |
| S03 | Member; selected Event A before/inside/after window | View Program/Event identity and own attendance; `掃碼簽到` preserves Event A; closed/cancelled/ineligible/already-present states are distinct | Real route, role matrix, settled own-state readback | `51ca2871…` / focused (own-state/cancelled seams; real scanner route remains unverified) |
| S04 | Member; scanner opened for Event A | Scan/manual code; matching credential reaches one confirmation and persists; Event B mismatch says `呢個碼對應聚會 B`, offers rescan, never switches/writes | Real UI + Worker/D1 negative and positive proof | `51ca2871…` / focused (Worker/component mismatch proof; real persisted scanner journey remains unverified) |
| S05 | Guest/member; selected Event and optional login handoff | Submit guest or authenticate; Event context survives revalidation; success remains until Done/Return; duplicate/closed/cancelled outcomes stay explicit | Real guest/login route and durable identity/attendance readback | `51ca2871…` / focused (guest outcome/handoff component proof; browser login handoff remains unverified) |
| S06 | Authorized manager; Management Directory | Search/open authorized Programs; create CTA remains usable on phone; Draft+Unlisted save opens Overview; no unauthorized create | Real route at 360/402 and permission matrix | `51ca2871…` / route (management browser fixture; create/permission edge matrix remains unverified) |
| S07 | Authorized leader; Workspace Overview with next Event | Select attendance entry; opens exact Event-scoped focused roster, not enrollment Participants; identity/counts remain truthful | Authenticated real-browser Overview → roster route | `51ca2871…` / focused (exact Event URL component proof; real Overview-to-roster journey remains unverified) |
| S08 | Authorized manager; Events collection | Upcoming/past/cancelled/today rows show true facts/status; name/detail, direct attendance, More edit/reschedule/cancel preserve list context | Real route navigation/readback at phone widths | `51ca2871…` / focused |
| S09 | Authorized manager; new and existing Event editor | New end defaults start+1h until manual edit; existing end is preserved; invalid interval blocks save inline; Save/Discard are normal-flow end actions | Component + real route persistence/failure proof, keyboard-open rendered check | `51ca2871…` / focused |
| S10 | Authorized manager; Event Detail | View lifecycle, attendance and `Event QR code`; cancellation explains reason/consequences and respects guards; cancelled Event does not materialize roster | Real route plus Worker/D1 cancellation/materialization proof | `51ca2871…` / durable (Worker/component; full route cancellation journey remains unverified) |
| S11 | Authorized manager; Schedule rules | Edit relevant weekly/monthly controls and bounded lifetime; save/reload exact rule; no-end/retirement/provenance semantics remain intact | Worker/D1 durable rule and route reload proof | `51ca2871…` / durable (Worker/D1; route reload remains unverified) |
| S12 | Authorized manager; Schedule Preview with candidates | Rows show date/time and new/existing/skipped/rescheduled truth; `調整` Sheet shows original/replacement/warning; open/close does not save draft | Real route/Sheet interaction and reload of saved exception | `51ca2871…` / focused |
| S13 | Authorized manager; partial/completed generation result | Counts are authoritative; unresolved-first details explain reasons; stale/unknown outcomes reconcile before retry; completed result stays until explicit `查看聚會` | Worker/D1 generation + real route settled outcome/retry proof | `51ca2871…` / durable (Worker/D1 + component recovery; full route retry remains unverified) |
| S14 | Authorized manager; Participants with pending/active/history | Pending-first truthful counts, search/selection; batch confirmation keeps per-person progress/results, success/attention totals and unresolved reasons in place | ~30-person mixed batch durable reload/reconcile proof | `51ca2871…` / focused (mixed component outcomes; 30-person durable route remains unverified) |
| S15 | Authorized manager/member; add or cancel enrollment | Search existing account with authorized hints; explicit add/cancel reason/confirmation; duplicate/denial handled; attendance history retained | Public contract and real route durable history proof | `51ca2871…` / durable (Worker/browser enrollment paths) |
| S16 | Authorized leader/manager; focused roster | Rows expose authorized namesake info/state; detail Sheet returns focus/context; Excused presets/required Other reason; assisted check-in confirms once, updates counts/list; offline/stale read-only and polling no-overlap | Real local route with 30 Chinese names, Sheet/focus, offline/reconnect and Worker readback | `51ca2871…` / focused (component/Worker; 30-person offline/reconnect route remains unverified) |
| S17 | Authorized actor; Settings hub/focused/Department | Grouped values are real; focused Back is single-owned; labels/hints/errors and dirty end actions preserve drafts; save/discard/conflict/retry show actual outcome | Real route at 360/402 with keyboard/long-form rendered proof | `51ca2871…` / rendered (responsive + visual candidate proof; keyboard/device behavior remains unverified) |
| S18 | Authorized actor; Program QR and Event Detail | Program QR remains permanent; Event Detail `Event QR code` contains current Event facts, Program QR and Manual Code; download/print are complete; rotation is scoped/confirmed | Worker/route artifact inspection and QR decode; native print/device separately | `51ca2871…` / focused (download/print facts test; QR decode/native print/device remain unverified) |
| S19 | Member/manager; Notifications open/closed/read-failure | Panel opening does not mark read; individual/Mark All persist; target navigation is correct; read failure preserves unread/retry | Component + real route navigation/readback proof | `51ca2871…` / focused |

## Review-gap inventory

| Gap | Required disposition and proof | Candidate / status |
| --- | --- | --- |
| G01 | Overview attendance action opens exact Event roster; authenticated real-browser proof | `51ca2871…` / focused; real Overview-to-roster route proof remains unverified |
| G02 | Event → credential scanner/manual code completes through persisted Attendance; no credential-free path; wrong Event has no write | `51ca2871…` / focused; Worker/component negative proof, full route persistence remains unverified |
| G03 | Archived lifecycle guard covers resolution and Self/Guest writes; Worker negative cases/readback | `51ca2871…` / durable |
| G04 | Cancelled materialization rejects/no-ops without snapshot/expected rows; misleading required flag removed | `51ca2871…` / durable |
| G05 | Mixed Active→Archived PATCH is atomically guarded for metadata and blockers; audit proof | `51ca2871…` / durable |
| G06 | Participant visibility, enrollment/history and own attendance projection are authorized and non-leaking | `51ca2871…` / durable (Worker + component; full role matrix route remains unverified) |
| G07 | Pre-start cancellation and Excused audit-only rule reconciled; early real Attendance preserved | `51ca2871…` / durable |
| G08 | Canonical Schedule create caller and retry identity preserve idempotency/provenance; same-key/conflict/lost-response proof | `51ca2871…` / durable |
| G09 | Open-window assisted success and closed-window denial follow accepted rule; no unapproved recovery feature | `51ca2871…` / durable |
| G10 | Concurrent void returns truthful winner/already-voided result with audit | `51ca2871…` / durable |
| G11 | Guest login preserves/revalidates Event and distinguishes closed/cancelled outcomes | `51ca2871…` / focused; signed-out UI proof, full login handoff route remains unverified |
| G12 | Full Event QR code image/download/print uses current facts and Manual Code; QR decodes; native print separate | `51ca2871…` / focused; facts test passes, QR decode/native print remain unverified |
| G13 | Materialization failure is structured/retryable/audited without false success | `51ca2871…` / durable |
| G14 | Status CVA/provenance migration invariant is verified and repaired if confirmed; no route reachability overclaim | `51ca2871…` / durable (migration/Worker proof; reachability remains unverified) |
| G15 | Promotion validator matches actual required responsive coverage without lowering expectations | `51ca2871…` / durable (aggregate validator/report contract pass) |
| G16 | Shallow batch/Schedule/roster/rotation evidence is replaced with complete current-candidate local journeys and review disposition | `51ca2871…` / partial; aggregate/browser/visual pass, 30-person/offline/device/review gaps remain |

## Integrated journeys

| Journey | Required path | Evidence target | Status |
| --- | --- | --- | --- |
| J1 | Member discovery → Program/Event → credential scan/manual code → one confirmation → own Attendance readback | Real local authenticated browser + Worker/D1 | `51ca2871…` / partial: participant browser journey + Worker/component seams; scanner/readback route remains unverified |
| J2 | Leader create/schedule → generated Event → exact Event roster → ~30-person phone roster actions | Real route, durable state, rendered 360×800/402×874 | `51ca2871…` / partial: aggregate/responsive/visual pass; 30-person roster actions remain unverified |
| J3 | Enrollment batch → mixed per-person results → reload/reconcile → unresolved-only retry | Real route, durable state, no automatic tab switch | `51ca2871…` / focused: component recovery proof; durable real-route batch remains unverified |
| J4 | Guest/QR → selected Event/login → current Event QR download/print/rotation behavior | Real route/artifact inspection; device/native print separate | `51ca2871…` / focused: artifact facts + guest outcomes; login/rotation/device/native print remain unverified |

## Required command/evidence record

Run commands from the effective repository directory with the verified runtime.
Stateful browser/responsive suites are sequential. The finite aggregate must use
a clean tracked disposable checkout or remain `unverified` with that exact
precondition; the seven dirty documentation files are not to be staged or
discarded for this purpose.

## Current-candidate machine evidence

The implementation candidate is `51ca2871f7019a2906f9474539c38fd44eeb081b`.
The aggregate was run in a clean detached worktree at that candidate with the
local-only `web/.dev.vars` copied into the disposable target. The governance
comparison against `origin/main` hits the repository's existing `git`
`ENOBUFS` limit in this unusually large local history, so the aggregate's
non-browser stage was run with `GITHUB_BASE_SHA=HEAD`; the unverified official
base-comparison claim is kept separate below.

| Command / layer | Result | Evidence |
| --- | --- | --- |
| `pnpm verify:fast` | pass | Root, E2E and Worker TypeScript checks completed without errors. |
| `pnpm test:workerd` | pass: 44 files / 625 tests | Full Worker/D1 suite, including lifecycle, attendance, enrollment, generation and provenance paths. |
| `pnpm --dir web test:components` | pass: 69 files / 1,073 tests | Full component suite, including Event QR artifact, guest outcomes, roster Sheet and generation recovery. |
| `pnpm test:programs:contract` | pass: 1/1 | Worker Programs contract seam. |
| `pnpm test:programs:runners:unit` | pass: 5/5 | Browser/responsive runner contracts. |
| `pnpm test:programs:promotion` | pass: 9/9 | Promotion manifest, report-count and B-003 contract tests. |
| `pnpm test:programs:canary:unit` | pass: 5/5 | Sustained-canary runner unit contract only. |
| `GITHUB_BASE_SHA=HEAD pnpm test:governance` | pass: 19/19; full scan 0 active violations | Full governance harness under the self-base workaround; 413 files scanned, 68 historical waivers. Official `origin/main` diff comparison remains unverified because of `ENOBUFS`. |
| `GITHUB_BASE_SHA=HEAD pnpm verify:programs` | `functional-passed` | Clean detached worktree aggregate; Worker contract pass, browser report 4/4, responsive report 18/18, non-browser precommit pass. Artifact: `test-results/programs-promotion/20260915t062433731z/`. |
| `PROGRAMS_CANDIDATE_SHA=51ca2871… pnpm test:programs:visual` | pass: 2/2 | Storybook visual harness at 402×874 and 360×800. Artifact: `test-results/programs-visual/20260915t0615/`. |
| `pnpm test:programs:canary` | failed diagnostic | Final candidate reached 244 scenarios, then local Miniflare returned HTTP 500 `Network connection lost` without `X-Request-Id`; artifact: `test-results/programs-runtime-canary/20260915t061416976z/`. This is B-003 residual risk, not a functional-pass failure. |

The independent reviewer is a separate gate. A fresh read-only verifier was
attempted against the implementation candidate, but did not return a report
after bounded waits and was shut down; independent acceptance remains
unverified. Real-route gaps still include the full scanner write/readback
journey, Overview-to-roster navigation, the approximately 30-person
offline/reconnect roster, mixed batch durability, signed-out guest login
revalidation, and rotation readback. Physical camera permission/decoder,
downloaded QR rescan, touch/safe-area, virtual keyboard, assistive technology,
and native print remain `device`/human gates. Owner approval, push, PR merge,
deployment, and release are not granted by these machine results.

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
