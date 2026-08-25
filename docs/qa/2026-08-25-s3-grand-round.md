# S3 Grand Phone UI & Functional Round Check

**Date:** 2026-08-25  
**Worktree:** `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/stack-base-s3-authority`  
**Branch / HEAD:** `feat/s3-06-integration-gate` / `8009582a`  
**Authority:** `docs/specs/370-s3-participant-guest-check-in.md`, frozen F-01–F-19  
**Verdict:** **S3 AUTOMATION GREEN — RELEASE CONDITIONAL**

The automated S3 participant and guest surfaces are green. The release gate is
not fully READY because no real iPhone-over-LAN camera smoke was executed. No
device evidence is represented as passed.

## Scope and method

Three Luna:MAX lanes audited participant scanner behavior, guest data flow, and
visual/responsive/accessibility quality. Findings were merged before repairs.
Repairs used focused regression tests and were followed by one final capture and
verification pass.

Included:

- `/scanner`: opening, live, stop/fallback, manual, invalid/offline, denied,
  unsupported, chooser, confirmation, busy/retry, success, duplicate, window,
  cancelled, and not-enrolled states.
- `/guest-check-in`: initial, validation, busy, invalid/offline/cancelled,
  chooser, success, duplicate, member handoff, keyboard, long content, and 200%
  zoom.
- F-01–F-19 server/UI evidence, phone geometry, focus, announcements, busy
  states, route invariance, idempotency, and privacy.

Excluded: `/events` roster, S7 correction/void, management, permissions,
prototype, household check-in, torch/zoom, file/photo scan, and parked owner
features.

## Findings and repairs

| Severity | Finding | Resolution |
| --- | --- | --- |
| P1 | Retry submit removed `重試簽到` while pending, so F-09 `aria-busy` could not remain observable. | Retry now remains mounted, disabled, and `aria-busy=true` while pending. |
| P1 | Error state appended `重試簽到` below `確認簽到`; on short phones the recovery action sat behind the fixed dock. | In recovery state, primary `重試簽到` replaces primary `確認簽到`; error and recovery remain visible and D8 phone geometry passes. |
| P1 | At 320×568, recovery `不是這個聚會` and denied fallback `出示會員 QR` extended behind the fixed dock. | Scoped short-height compaction keeps both recovery actions and both fallback methods ≥8px above the dock while preserving ≥44px controls. |
| P2 | Window-opening outcome used local `en-US` 12-hour formatting. | Added shared `hkTime24Label()` and now renders Hong Kong 24-hour time such as `18:30`. |
| P2 | Window outcome icon used undeclared `--warning` with a hard-coded fallback. | Uses the documented `--pending` design token. |
| P2 | Fallback exposed two accessible headings named `其他簽到方式`. | Removed the redundant sr-only heading; the method region uses the existing page `h1`. |
| P2 | Member and guest ambiguous-event pickers duplicated the same radio-group selection implementation. | Both public wrappers now delegate to one shared choice group while preserving ids, radio names, focus, disabled state, copy, and callbacks. |
| P2 | A user-scrolled short-phone chooser could carry a stale shell scroll position into confirmation and clip `重新掃描`. | Chooser selection resets the shell boundary synchronously and focuses the confirmation heading with `preventScroll`; a permanent scrolled-chooser test passes on phone and desktop. |
| P2 | The state-machine prose listed `forbidden` as a terminal outcome even though the approved UI keeps submit authorization failures in confirmation with retry and no frozen outcome copy existed. | Owner-approved amendment records `403 forbidden` as inline server detail + focused retry + no write; F-01–F-19 and Group B literals remain unchanged. |
| P3 | Recovery message followed the retry action in reading order after the primary-action replacement. | Final polish orders error → primary retry → secondary escape. |

The initial manual re-focus experiment alone was not sufficient evidence of a
production transition defect. A later real chooser reproduction with
`#shell-content.scrollTop=55` did reproduce the clip. That case is now a
permanent 320×568 regression: heading focus is preserved, shell scroll resets,
`重新掃描` remains visible, and both confirmation actions clear the dock.

The Impeccable detector's four side-border warnings are also false positives:
they are the frozen camera viewfinder corner brackets, not card accents.

## F-01–F-19 coverage

| Contract | Result | Evidence summary |
| --- | --- | --- |
| F-01 | PASS | Member and normalized-phone guest natural-key dedup; duplicate UI and D1 rows. |
| F-02 | PASS | SUCCESS, DUPLICATE, ACTIVE_ENROLLMENT_REQUIRED, and EVENT_CANCELLED audit outcomes observed in isolated D1. |
| F-03 | PASS | Enrollment, event status, and dynamic window gates exercised through Worker + UI. |
| F-04 | PASS | Authenticated member and public guest paths remain distinct; no operator-path collapse. |
| F-05 | PASS | Not-enrolled CTA uses the resolved `program_id`. |
| F-06 | PASS | Chooser, confirmation, result, outcome, fallback, retry, and guest result heading focus verified. |
| F-07 | PASS | Traditional Chinese live announcements verified across opening/live/fallback, validation, confirmation, result, and outcome transitions. |
| F-08 | PASS | Fallback methods are one full-width control per row across the seven-width matrix. |
| F-09 | PASS | Manual, confirmation, guest, and retry submits retain disabled + `aria-busy=true`. |
| F-10 | PASS | Six-digit pattern, numeric mode, max length, stripping, and invalid input verified. |
| F-11 | PASS | Dedicated retry remains focused, visible, and re-attempts the same event. |
| F-12 | PASS | Guest duplicate is neutral and exposes no attendance identifier. |
| F-13 | PASS | Member and guest ambiguous resolution require explicit unselected choice; no write before selection. |
| F-14 | PASS | Guest credential survives login, is consumed once, and resolves on `/scanner`. |
| F-15 | PASS | Confirmation, results, and outcomes remain in-flow on `/scanner`; POST `FORBIDDEN` stays in confirmation with focused retry and no write; no terminal routes. |
| F-16 | PASS | 30-minute and non-30-minute windows use derived Hong Kong 24-hour time and conditional copy. |
| F-17 | PASS | Plain phone `/scanner` is camera-first; event/program/manual deep links make zero camera calls. |
| F-18 | PASS | Live dark stage, one hint/frame/stop action, hidden fallback, track cleanup, and dock clearance pass. |
| F-19 | PASS | Denied has retry→live; unsupported has no retry promise; track-ended reaches fallback. |

## Visual evidence

Fresh current-source evidence is stored in:

`docs/qa/screenshots/s3-grand-round/`

- **32 scanner PNGs:** 16 states at `320×568` and `375×667`.
- **42 guest PNGs:** initial, validation, chooser, busy, success, duplicate,
  cancelled, invalid/offline, long-content, keyboard, and 200%-zoom states across
  `320×568`, `375×667`, `375×844`, and `414×896` where applicable.
- Scanner DOM metrics: 32/32 states had no actionable horizontal overflow,
  sub-44px target, focused-control dock overlap, or page error. Final repaired
  320×568 measurements place denied fallback controls at bottoms 343/417 and
  retry/escape controls at bottoms 438/487 against dock top 496.
- Frozen camera/boundary sweep: `320×844`, `375×844`, `390×844`, `414×844`,
  `799×900`, `800×900`, and `1440×900`.

Representative files:

- `scanner-live-320x568.png`
- `scanner-confirmation-320x568.png`
- `scanner-confirmation-retry-320x568.png`
- `scanner-window-not-open-320x568.png`
- `ambiguous-chooser-320x568.png`
- `success-trim-320x568.png`
- `duplicate-neutral-320x568.png`
- `zoom-200-320x568.png`

## Final gates

| Gate | Result |
| --- | --- |
| `pnpm --dir web typecheck` | PASS |
| `pnpm --dir web test:components` | **46 files / 544 tests PASS** |
| `pnpm --dir web build` | PASS — **18 static routes** |
| Full attendance D1 Playwright | **52/52 PASS** — phone `375×667` + desktop `1280×720` |
| Seven-width camera/device proof | **29 PASS / 6 intentional desktop skips** |
| Fresh scanner capture | **32 states / 0 actionable metric failures** |
| Fresh guest capture | **42 screenshots / 0 overflow or camera violations** |
| `git diff --check` | PASS |

Expected non-failing harness noise remains documented: jsdom `scrollTo()` is not
implemented, several broad shell tests log unhandled MSW requests, and Next.js
warns that multiple lockfiles make its inferred workspace root ambiguous.

## Impeccable score

| Dimension | Score |
| --- | ---: |
| Accessibility | 4/4 |
| Performance | 4/4 |
| Responsive Design | 4/4 |
| Theming | 4/4 |
| Implementation Integrity | 4/4 |
| **Automated total** | **20/20** |

This automated score does not substitute for VoiceOver or physical-iPhone
camera behavior.

## Preservation and remaining gate

- Original intentional state was backed up at
  `/tmp/s3-grand-round-baseline-myDm0Y` as a binary tracked patch, untracked-file
  archive, status manifest, and checksums.
- No reset, stash, checkout, or main-worktree operation was performed.
- No backend endpoint, API, migration, schema, or frozen Group B literal was
  changed.
- The real iPhone-over-LAN smoke remains required: `/scanner`, permission
  prompt, live camera, `停止掃描`, manual completion, denial, and retry; record
  device model, iOS, browser, LAN host/network, and result.

Until that manual evidence exists, the only valid final status is:

**S3 AUTOMATION GREEN — RELEASE CONDITIONAL**
