# #589 Programs shell refinement acceptance trace

## Status

`IMPLEMENTED — MACHINE EVIDENCE RECORDED; OWNER GATES OPEN`

This trace started as the ticket-specific acceptance inventory before production
changes and now records the local candidate evidence. It does not claim owner
approval, merge, release, or issue closure.

## Scope and authority

- Ticket: [#589](https://github.com/Noahlw/efcc/issues/589), current refinement
  package dated 2026-09-13.
- Parent authority: [#586](https://github.com/Noahlw/efcc/issues/586), including
  the accepted amendment comment
  [5647159082](https://github.com/Noahlw/efcc/issues/586#issuecomment-5647159082).
- Frozen visual authority:
  `docs/design/programs-screen-foundations-v1/00-screen-foundations.html`.
- Direct requirements: R01, R02, R03; applicable cross-package obligations:
  R24 feature accounting and R25 integrated evidence.
- Exclusions: backend/schema/auth rewrites, prototype-only product logic,
  unrelated route redesign, scope expansion to #590 or other tickets, push,
  merge, release, and issue closure.

## Execution boundary

- Checkout: `/Users/noah.wong/Desktop/code/efcc`.
- Branch: `codex/programs-screen-foundations/wave-3`.
- Starting candidate: `3ab586fe8021f1e20533dc1238d7216249f72aa6`.
- Code verification fixed point: `14ad82aa2c98b6117f411da7b3d76374873c3027`.
- Evidence lineage: `83048427` (documentation-only; later trace wording
  correction is also documentation-only).
- Implementation commits: `02d33718` and `14ad82aa`.
- Required runtime: Node `22.18.0` via `fnm`; pnpm `11.7.0`.
- Existing local correction commits and unrelated dirty paths are preserved;
  only owned #589 files and this trace may be changed.

## Acceptance inventory

| Criterion | Observable expectation | Planned evidence |
|---|---|---|
| R02 / mode control | Brand remains left. Management-capable Programs accounts get exactly one accessible 44×44 top-right control: briefcase in Participant mode and user in Management mode. Participant-only accounts get none. | Shell/component contract tests, real route interaction, 402×874 and 360×800 renders. |
| R02 / destination semantics | Activating the control lands at the other mode's main directory, removes Program/task carryover, and keeps 課程 active in both modes. Exercise a non-root and scrolled state. | Browser URL/history assertions plus rendered route state and focus checks. |
| R03 / shared ownership | Server-projected navigation remains the single nav landmark and scroll owner. Back destinations remain route/origin-aware; focused editors expose one task header/Back and preserve dirty-navigation safeguards. | Focused boundary/foundation tests, Programs browser acceptance, route render inspection. |
| R01/R03 / phone shell | Frozen shell geometry is preserved at 402×874 and 360×800: header/nav placement, 44×44 targets, long Chinese wrapping, safe-area/keyboard clearance, action reachability, and no horizontal overflow. | Production Storybook story review, geometry/browser assertions, responsive/W7 checks. |
| R24/R25 / accounting | Existing server capability, route/history, permission, and mutation owners map to production UI destinations without prototype-only behavior. | Source-to-destination review plus candidate-bound evidence ledger. |

## Verification commands

Run with the pinned runtime and retain exact pass/fail/unrun results:

- focused public-interface/component tests for shell, foundations, Programs
  boundary, and route surface;
- Programs browser acceptance and applicable Worker/D1 contract tests;
- Storybook production baseline, index/build, and owner Storybook spot-check;
- 402×874 and 360×800 rendered route/geometry checks;
- applicable W7/responsive widths 320/375/390/414/799/800/1440;
- `git diff --check`, type/fast verification, and a separate self-review against
  #589/#586 and the frozen HTML.

## Evidence boundary

Component/MSW/Storybook evidence supports presentation and interaction only; it
does not prove real persistence, authorization, audit, camera/device, or
download/print behavior. Machine evidence remains separate from owner L1/L2/L3
approval, merge, release, and issue closure.

## Implementation and evidence

- The focused Settings editor now owns the only visible task header and Back
  control. The outer workspace header is suppressed only after a Settings
  section is opened; returning to the Settings hub restores the root header.
- When the root heading unmounts, the outer workspace wrapper drops its stale
  label and the focused child section remains the single named landmark.
- The route-owned management notification action follows the visible header,
  so the focused editor retains notification reachability without reintroducing
  a duplicate root header. Dirty Save/Discard/conflict behavior and the
  existing route/API contracts were not changed.
- Production files are limited to the workspace header/task handoff, focused
  Settings task, its component/Storybook assertions, and this trace. No
  backend, schema, auth, or other ticket implementation was added.

### Passed

- Focused component suite: 4 files, 165/165 tests.
- Storybook interaction suite: 10 files, 94/94 tests.
- Programs contract: 1/1 test.
- Authenticated local Worker/D1 browser acceptance: 2/2 journeys; latest
  target `http://127.0.0.1:54415`; artifact
  `test-results/programs-browser-acceptance/20260912t180121097z`.
- Programs responsive matrix: 6/6 scenarios; final sequential rerun target
  `http://127.0.0.1:54595`; artifact
  `test-results/programs-responsive/20260912t180207115z`.
- Storybook W7 matrix: final-HEAD rerun exited 0 across 320, 360, 375, 390,
  402, 414, 799, 800, and 1440 widths; the same suite was previously
  enumerated as 126/126 and included Programs R4/R5/R6 material Plays.
- Programs visual fidelity: 22/22 route/viewport rows across 402×874 and
  360×800. Fresh final-HEAD artifact
  `/private/tmp/efcc-t589-visual-20260913-final2`
  recorded one route marker, one shell main, zero busy states, zero horizontal
  or main-content overflow, and minimum visible target 44px at both viewports.
- Web typecheck, Storybook build, Storybook index reconciliation, and
  `git diff --check` passed. The build emitted only the existing non-blocking
  chunk-size warning. Index result: 94 Stories / 36 Screen Catalog obligations
  / 7 control Stories / 14 foundation Stories. Both final commits also passed
  the pinned Node 22 pre-commit verification hook.

### Failed or unrun

- The first post-change responsive run failed 3/6 because hiding the outer
  header also hid `開啟管理通知`; the focused repair above restored the action
  and the rerun passed 6/6.
- A concurrent browser/responsive launch produced a harness-only Next build
  lock failure (`Another next build process is already running`); the
  sequential responsive rerun above passed 6/6.
- Runtime canary was retried twice. Both attempts failed as external Worker /
  Miniflare transport failures (`HTTP 500: Network connection lost`) during an
  enrollment-request decision, with no causal runtime signal; one stopped at
  114 scenarios and the retry at 725. No backend change was made for this UI
  ticket.
- No separate Programs camera/device-proof suite was run; it covers attendance
  camera behavior rather than #589. No real-device camera/download/print proof
  was claimed.
- The two-axis `/code-review` completed read-only. The Spec review's stale
  landmark-label finding was fixed in `14ad82aa`; the Standards review found
  no code-rule violation but flagged that this trace is committed alongside
  the implementation, so the trace-before-edit process point remains an owner
  judgment.
- Human owner Storybook spot-check and L1/L2/L3 approval remain pending. No
  push, merge, release, or issue close was performed.
