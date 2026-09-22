# Programs route-fidelity correction qualification

## Status

`NOT_ROUTE_GREEN — CHANGES_REQUIRED — WAITING_OWNER_L2_NOT_REACHED`

This is a machine qualification record for the Task 5 candidate on PR #607.
The candidate is not ready for owner-L2 handoff because the real responsive
matrix and frozen-HTML visual comparison are not green. No owner approval,
merge, release, issue closure, or `gap: null` claim is made here.

## Immutable scope and provenance

- Execution-start SHA for this qualification: `326e4d4ab20dd2aaadb7625c9cac7e400e7b8e5c`.
- Branch: `codex/programs-screen-foundations/wave-3`.
- Remote branch at recheck: `9ad90d253bfd50bf2bbcea85f39c18c1587b1f88`.
- PR: [#607](https://github.com/Noahlw/efcc/pull/607), open, base
  `codex/programs-screen-foundations/wave-2` at
  `e5a05a833410fdd7e48c8bfc238667adf4ed1ba1`; no remote status checks were
  present at recheck.
- `origin/main` at recheck:
  `e46cf616fc690f3d191fa435232ba73609b24f79`.
- Runtime: Node `22.18.0` through `fnm`.
- The first qualification commit created from this evidence was
  `12a784e43484de74c4ffd5050e45562d2b7a59ca`; the post-commit promotion
  rerun is recorded below. If this evidence is amended, the final status/log
  guard must record the resulting amended SHA.

## Candidate changes

- Added a 20-row, route-backed material-state matrix and supporting MSW
  scenarios in `web/.storybook/programs-fixtures.ts`.
- Added non-cataloged `T07.3/Programs Material States` Stories in
  `web/.storybook/programs-material-states.stories.tsx`.
- Pinned the ten retained Programs baseline intents in
  `web/.storybook/presentation-catalog.test.ts`.
- Added matrix inventory assertions in
  `web/.storybook/programs-presentation-contract.test.ts`.
- Added the ten-baseline production route-frame/settled-content loop to
  `tests/e2e/t11-storybook.test.ts`.

The retained baseline IDs remain:

`t07-3-programs--participant-directory`,
`t07-3-programs--participant-program-detail`,
`t07-3-programs--participant-event-detail`,
`t07-3-programs--management-directory`,
`t07-3-programs--workspace-overview`,
`t07-3-programs--workspace-events`,
`t07-3-programs--workspace-participants`,
`t07-3-programs--workspace-settings`,
`t07-3-programs--workspace-schedule`,
`t07-3-programs--workspace-notifications`.

The matrix names are:

`participant-directory-member`, `participant-directory-capable`,
`participant-program-detail-active`, `participant-program-detail-pending`,
`participant-program-detail-rejected`, `participant-event-detail-closed`,
`participant-event-detail-open`, `participant-event-detail-ineligible`,
`management-directory-mixed`, `workspace-overview-populated`,
`workspace-overview-zero`, `workspace-events-mixed`,
`workspace-participants-pending`, `workspace-settings-dirty`,
`workspace-settings-conflict`, `workspace-schedule-focused`,
`workspace-schedule-stale`, `workspace-schedule-partial-resume`,
`notifications-unread`, `notifications-empty-recoverable`.

## Gate results

| Gate | Result | Evidence / limitation |
|---|---|---|
| `pnpm --dir web test:t07:foundation` | PASS — 10 files / 50 tests | Rerun after the CSF fix. |
| `pnpm --dir web test:storybook` | PASS — 10 files / 93 tests | Initial run caught the missing CSF default export; `export default meta` was added and the rerun passed. |
| `pnpm --dir web storybook:build` | PASS | Build completed; Vite emitted only the existing large-chunk warning. Generated `web/storybook-static` was moved to `/tmp/efcc-storybook-static-task5` and is not part of the candidate. |
| `pnpm --dir web storybook:verify-index` | PASS | 93 Stories / 36 Screen Catalog obligations / 7 control Stories / 14 foundation Stories; all declarations and baselines resolvable. |
| `pnpm test:t08:controls` | PASS — 20 tests | W7 control geometry/semantics. |
| `pnpm test:t09:foundations` | FAIL — 37 passed / 11 failed | All failures are existing `foundations--sheet-*` content-bottom geometry at W7 widths; no T05.7 Task 5 file changes touch the foundation implementation. Kept as an unrelated blocker, not repaired here. |
| `pnpm test:t11:storybook` | PASS — 90 tests | Ten retained Programs baselines passed the settled production route loop across 320, 360, 375, 390, 402, 414, 799, 800, and 1440px. |
| `pnpm --dir web test:components` | PASS — 69 files / 1,019 tests | Full component layer. |
| `pnpm test:programs:contract` | PASS — 1 test | Programs contract. |
| `pnpm verify:fast` | PASS | Root and web TypeScript checks. |
| `pnpm test:programs:browser` | PASS | Isolated Worker/D1 browser acceptance; artifact target was `test-results/programs-browser-acceptance/20260911t060651065z`. |
| `pnpm test:programs:responsive` | FAIL — 1 of 3 matrix specs failed | Participant catalog/detail passed; management settings failed at all three projects because `getByRole('navigation', { name: '管理工作' })` was absent at `programs-responsive-matrix.test.ts:361`. The failure is outside the Task 5 file set; it remains unresolved and prevents route-green status. |
| `pnpm verify:programs` | FAIL after clean commit | Worker contract and browser acceptance passed; the promotion responsive matrix failed on the same management-settings `管理工作` navigation assertion. Runner revision `12a784e4`; artifact directory `test-results/programs-promotion/20260911t062231948z`. |
| `pnpm test:shell-responsive` | PASS — 92 passed / 1 intended skip | Shared shell responsive acceptance. |
| `pnpm test:shell-geometry` | PASS — 35 tests | Shared shell W7 geometry. |
| `pnpm test:role-hierarchy-geometry` | FAIL — 42 passed / 7 failed | All failures are unchanged Permission Editor detail geometry (`geometry.main` null) across W7 widths. No Task 5 file changes touch that surface. |

## Visual comparison

Captured every retained baseline at both primary viewports and compared it
against its matching frozen HTML file under
`docs/design/programs-screen-foundations-v1/`:

- 20 actual captures and 20 frozen-reference captures are in
  `/tmp/efcc-task5-visual/`.
- `manifest.json` records the route and geometry metrics for all 20 actual
  captures.
- Contact sheets are `402x874-actual-contact.png`,
  `402x874-frozen-contact.png`, `360x800-actual-contact.png`, and
  `360x800-frozen-contact.png` in that directory.
- All 20 actual captures had one Programs route marker and one shell main,
  zero horizontal overflow, zero main-content overflow, no `aria-busy=true`,
  and a minimum visible interactive target of 44px.

The route hierarchy and shell/dock treatment are directionally aligned, but
the visual comparison is not a pass: the baseline fixtures remain sparse and
synthetic (often one row, English labels, and year-2099 dates) while the frozen
HTML uses Cantonese content, mixed statuses, and materially denser rows/cards.
This is an actionable presentation-fidelity gap, not owner-L2 approval.

## Review and known limitations

- Fixed-point review was performed against `326e4d4a`: catalog identities and
  intents remain unchanged, all ten baselines still carry `ISSUE-#601`, and
  material Stories are not added to the Screen Catalog baseline manifest.
- One behavior-seam Play assertion was added for focused Schedule → New Rule.
  The remaining material scenarios currently have route/readiness assertions
  but not dedicated Play coverage for every planned Back, enrollment, event
  CTA, settings conflict, stale/partial schedule, and notification retry
  seam; this is additional `CHANGES_REQUIRED` work.
- The T09 foundation and role-hierarchy failures were not silently converted
  to green or fixed outside scope. Their base reproduction was not rerun in a
  separate clean checkout during this qualification, so they are recorded as
  unrelated-to-Task-5 file-scope failures rather than claimed historical
  baseline proof.
- Machine Storybook/Worker evidence does not substitute for owner-L2 visual
  comparison. No owner comparison has been received at 402x874 or 360x800.

## Handoff state

Keep all ten Programs presentation obligations and baseline Stories linked to
`ISSUE-#601`. Do not set `gap: null`, call the stack green, push/update PR #607,
merge, close issues, or claim owner approval until the responsive blocker,
fixture-density/frozen-HTML mismatch, missing material Play coverage, and
unrelated gate disposition are resolved with fresh evidence.
