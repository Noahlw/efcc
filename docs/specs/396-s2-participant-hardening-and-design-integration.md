# Spec: S2 Participant Hardening and Design Integration Addendum

**Status:** Accepted S2 Integration Addendum — GitHub #396
**Parent:** #383 (Spec: S2 participant discovery, programs, messages, notices, events, and enrollment)
**Origin:** #368
**Child ticket:** #396 (https://github.com/Noahlw/efcc/issues/396)
**Proposed base:** `feat/389` at `88b96afa`
**Integration branch:** Continue from the current Phase 391 child line; do not rewrite PRs #390–#395.

## Problem

S2 PRs #390–#395 implement the original buildable spec. Phase 391 then reconciled the live six-Section product against the authoritative participant design export, the shared shell contract, and the actual authorization/data model. The reconciliation produced accepted navigation/recovery fixes, a hardening matrix, and prototypes. Some original #383 presentation clauses now conflict with the accepted domain model.

This addendum is the active implementation authority for that named conflict set. It preserves #383's S2 scope and historical record; it does not silently rewrite #368 or erase the original decisions.

## Relationship and history

- Published as child issue #396 under #383; #368 remains unchanged.
- Build a new child PR on top of the top of the linear S2 stack (`feat/389` / `88b96afa`).
- Preserve the existing Phase 391 commits already on the local child line:
  - `15956de0` — visual parity plan and domain vocabulary;
  - `33b66ffc` — origin-aware detail navigation and recovery hardening;
  - `ee0bd1d2` — Home structural skeleton and hardening matrix.
- Add promotion work as new coherent commits. Do not backport cross-screen seams into #390–#395 or force-update their reviewed ownership boundaries.
- The child PR is merge-ready only when every promoted case below is implemented and the full local gate passes.

## Explicit #383 overrides

| #383 clause / original direction | Active addendum rule | Acceptance IDs |
| --- | --- | --- |
| Program Detail should merge recurrence rules and concrete Events into one data list. | Keep `schedule_rules` and concrete `upcomingEvents` as distinct domain data sources inside one grouped presentation panel. Hide empty groups. | `S2-INT-SCH-01` |
| Program Detail should show a Member `報名記錄` timeline after schedule. | Member detail shows only the latest Participant Enrollment Summary. Full lifecycle history and decision notes remain Manager Workspace concerns. | `S2-INT-ENR-01` |
| Program Detail history rows should match the export timeline/dot treatment. | Participant history-dot timeline is rejected; no Member history rows are rendered. | `S2-INT-ENR-01` |
| Program Detail must use literal export geometry/order as the production contract. | Product Contract Precedence wins: shared tokens, 800px shell, fluid body, auth, state, timezone, and accessibility contracts remain authoritative. | `S2-INT-RESP-01` |
| Withdraw CTA is a new sticky action shape. | Keep the existing single sticky mutation action and explicit enrollment state machine; do not add duplicate inline/sticky controls. | `S2-INT-ENR-02` |
| The original spec has no 4/8 Upcoming Event Set cap. | Active future Events are ordered by `starts_at`; phone-width presentation shows four and desktop-width presentation shows eight. No View All route is added in this addendum. | `S2-INT-SCH-02` |

## Promoted production scope

### Home and Programs long-copy protection

- Add/retain `overflow-wrap: anywhere` on Home card title/description and Programs directory title/secondary content.
- Preserve `min-width: 0`, chevrons, query input behavior, CJK natural line-breaking, and no-clamp information visibility.
- No new copy truncation or full-text disclosure route.

**Acceptance:** `S2-INT-WRAP-01` at 320, 375, 390, 414, 799, 800, and 1440px; long Latin/URL-like tokens do not create horizontal scrolling or displace adjacent controls.

### Programs forbidden escape

- Keep recoverable network errors distinct from forbidden responses.
- Add the prototype's safe `返回首頁` escape for the forbidden directory state.
- Canonical destination is authenticated Home `/home`, not Auth Surface `/` and not a retry loop.
- Preserve query/filter state only for retry; do not expose arbitrary return URLs or alter authorization.

**Acceptance:** `S2-INT-PROG-ERR-01` asserts a 403 Member response shows forbidden copy plus `/home` escape, while a network/5xx response retains Retry and preserved filters.

### Program Detail enrollment-gated advisory

- Show `加入後可查看聚會詳情` only when all are true:
  - the actor is not already able to open the Event Detail;
  - the Program is requestable for that Member;
  - a visible upcoming Event exists;
  - the Program is not ManagerOnly or archived.
- Do not reveal unauthorized Event facts, IDs, or check-in state.
- Keep the backend `canManage || hasActiveEnrollment` Event Detail gate unchanged.

**Acceptance:** `S2-INT-PERM-01` covers requestable/non-enrolled, active-enrolled, ManagerOnly, archived, and no-upcoming-event variants.

### Grouped schedule and responsive Event cap

- The grouped panel contains `時間規則` and `即將舉行` as separate semantic groups sourced from `schedule_rules` and concrete Event summaries.
- Hide an empty group; if both are empty, show one truthful panel-level empty state.
- Worker returns the actor-authorized active future Event summaries; client sorts by `starts_at` and applies the presentation cap.
- Use `matchMedia('(min-width: 800px)')` for the cap:
  - safe initial/SSR snapshot: 4;
  - after mount at desktop width: expand to 8;
  - resize recalculates 4/8 without duplicate rows or stale ordering;
  - no View All route or hidden keyboard-only fifth row.
- Do not change Event generation, recurrence horizon, authorization, or Domain Backend ownership.

**Acceptance:**

- `S2-INT-SCH-01` — both groups preserve source semantics, headings, and empty behavior.
- `S2-INT-SCH-02` — 4 at 799px and below, 8 at 800px and above after matchMedia mount; hydration has no warning; list remains ordered and overflow-free.

### Member-specific self-check-in availability

- Extend the participant Event summary projection with a server-derived `self_check_in_available` wire field (client mapping may use `selfCheckInAvailable`).
- It is true only when the requesting actor has Active enrollment, the Event is Active, and the Event check-in window is open.
- `PROGRAM_MANAGE` does not bypass this Member self-check-in signal; managers use assisted check-in on Event Detail.
- The projection is evaluated at Program Detail load/refresh time. No client countdown or periodic refresh is added.
- Program Detail may show `可簽到` only when this field is true. Event Detail and the Worker remain authoritative at action time; a stale label must never grant attendance.
- Cancelled/rescheduled lifecycle visibility remains the separate `optional` ticket and is not included here.

**Acceptance:**

- `S2-INT-AVAIL-01` — active enrolled Member + open window returns true and renders visible `可簽到`; non-enrolled Member, closed window, inactive Event, ManagerOnly actor, and manager-only capability do not.
- `S2-INT-AVAIL-02` — direct Event Detail/scanner authorization remains server-enforced; stale or forged client fields cannot grant check-in.

### Program Detail lifecycle dots

- Promote Variant 1 dot rows from the harden prototype.
- Active lifecycle dot uses neutral semantic token; dot is not the sole attendance signal.
- `可簽到` is visible text only when `selfCheckInAvailable` is true.
- No danger/pending cancelled/rescheduled dots in this ticket.

**Acceptance:** `S2-INT-SCH-03` checks visible text/status semantics, no color-only reliance, ordering, 4/8 caps, and mobile overflow.

### Single movable enrollment action

- Keep the current one-button-per-mutation-state `stickyActionBar` implementation.
- Do not add a second inline clone, IntersectionObserver, or new action state.
- Preserve all existing EnrollmentAction precedence, confirm-dialog focus restoration, offline mutation guard, copy, and destructive-action styling.
- ManagerOnly and Archived remain read-only.

**Acceptance:** `S2-INT-ENR-02` covers all lifecycle variants, one action owner per mutation state, no duplicate controls, 44px target, safe-area/dock clearance, and keyboard/focus behavior.

### Home structural skeleton

Already implemented by the child baseline and covered by:

- `docs/specs/393-s2-home-structural-skeleton-acceptance-plan.md`
- `HOME-SKEL-01` through `HOME-SKEL-05`

The child PR must retain this behavior while adding the promoted design work.

## Explicit non-scope

- `Event Lifecycle Visibility` (`optional`): cancelled/rescheduled participant rows, copy, and lifecycle colors require a separate ticket.
- Notices offline-disable: Notices read state remains server-canonical with client optimistic presentation and reactive failure. Do not remove `POST /api/v1/programs/notices/read-all`, add a local-only read model, or add an offline retry queue.
- Member enrollment history timeline or decision-note display.
- View All / Expand More Event route.
- Literal 680px body migration, export radius/border/hover values, 78px dock, or global token rewrites.
- Elapsed-time loading hints or new loading timers.
- Scanner/attendance mutation redesign, guest check-in, CMS authoring, management-mode redesign, or new tables.

## Acceptance gate

The child PR uses the local-first READY gate:

1. Build the current worktree export and start `wrangler dev` on `127.0.0.1:8787`.
2. Reset and seed disposable `E2E_*` / `E2E_DEMO_*` fixtures only.
3. Run focused component/API tests for the new projection, cap, advisory, escape, wrapping, and action contracts.
4. Run relevant Playwright suites at `320x844`, `375x844`, `390x844`, `414x844`, `799x900`, `800x900`, and `1440x900`.
5. Assert observable DOM/response state, `scrollWidth <= innerWidth`, 44px targets, focus/keyboard behavior, and shell dock/rail clearance.
6. Keep reconnaissance and visual comparison read-only; do not submit, withdraw, cancel, approve, or mutate Apps Script/Google Sheets as part of this gate.
7. Do not require deployed `/exec` smoke or a Cloudflare account for READY.

## Proposed implementation order

1. Add the participant `self_check_in_available` server projection and its contract tests.
2. Add the shared client cap/hydration seam and grouped Program Detail schedule rendering.
3. Add lifecycle dots, conditional attendance label, and requestable gated advisory.
4. Retain/verify the existing single sticky enrollment action and add long-copy/Forbidden Home escape coverage.
5. Run the complete local gate and append results to the child PR/spec.

## Stop condition

Stop when every promoted production case and every acceptance ID above is implemented, the #383 override table is fully covered, the local-first gate is green, and optional/deferred/rejected work remains out of the child diff.

## Wayfinder follow-ups

Deferred cross-cutting questions live under the existing root map [#366](https://github.com/Noahlw/efcc/issues/366), not in the promoted production scope:

- [#397](https://github.com/Noahlw/efcc/issues/397) — Event Lifecycle Visibility (`wayfinder:grilling`, `type:optional`).
- [#398](https://github.com/Noahlw/efcc/issues/398) — Event Detail pre-window guidance prototype (`wayfinder:prototype`, blocked for production by #370).
- [#399](https://github.com/Noahlw/efcc/issues/399) — Data-driven announcement venue contract (`wayfinder:grilling`, depends on #373).
- [#400](https://github.com/Noahlw/efcc/issues/400) — Management Messages contextual shell contract (`wayfinder:grilling`, depends on #369).

## Implementation tickets

The approved tracer-bullet implementation set is published under this spec:

- [#401](https://github.com/Noahlw/efcc/issues/401) — Member-specific self-check-in availability projection.
- [#402](https://github.com/Noahlw/efcc/issues/402) — Program Detail schedule and enrollment affordances; blocked by #401.
- [#403](https://github.com/Noahlw/efcc/issues/403) — Programs forbidden recovery and long-copy hardening.
- [#404](https://github.com/Noahlw/efcc/issues/404) — Home long-copy rendering.
- [#405](https://github.com/Noahlw/efcc/issues/405) — S2 participant integration gate; blocked by #401–#404.
