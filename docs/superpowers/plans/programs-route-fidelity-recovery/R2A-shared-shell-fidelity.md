# R2A — Match the Programs Prototype Bottom Nav

> Load this packet only when the [master tracker](../2026-09-11-programs-route-fidelity-recovery-tracker.md) marks R2A ACTIVE and R2 is COMPLETE. Read the master Global Constraints, Claim and Update Protocol, and Cold Resume Contract first. Mutable task status lives only in the master ledger.

**Outcome:** Below the 800px shell breakpoint, the shared authenticated Bottom Nav faithfully uses the frozen Programs prototype treatment for both member and capable/management destinations while preserving the existing landmark, target, safe-area, scan, history, and desktop rail contracts.

**Frozen authority:** `docs/design/programs-screen-foundations-v1/01-participant-directory-capable.html` and the role-specific frozen screens in the same directory. The prototype Bottom Nav version is preferred: neutral/transparent active item, accent icon/text, and one centered approximately 18px × 2px top indicator.

## Files

- Modify: `web/app/globals.css`
- Modify: `web/lib/shell/shell-breakpoint.test.tsx`
- Modify only if the focused regression requires it: `web/lib/shell/authenticated-shell.test.tsx`, `tests/e2e/shell-geometry.test.ts`
- Update: master tracker and this packet

## Locked contracts

- Keep exactly one `#main-navigation` landmark and `aria-current="page"` ownership.
- Keep role-specific server-projected destinations: member slot four may be `通知`; capable/management slot four may be `管理`.
- Keep scanner in its server-projected slot and make its active state follow the same indicator grammar; do not make it a filled/outlined pill.
- Preserve visible focus, 44px minimum targets, safe-area padding, fixed phone dock geometry, desktop rail declarations, and the single 800px transition.
- Do not change navigation data, URL/history semantics, auth, or production domain state.

## Steps

- [x] **Step 1: Claim R2A and pin the live baseline.** Record start SHA `1c92a346ffa3a42feab546d20d234220f0a266ac`, branch, remote PR state, and the absence of overlapping dirty paths in the tracker checkpoint.

- [x] **Step 2: Add the intentional red regression.** Extend the shell breakpoint contract to require a transparent/neutral active background, no active bottom inset line, and a centered top indicator with `width: 18px`, `height: 2px`, `left: 50%`, and `transform: translateX(-50%)`; require the scan active item to follow the same grammar and retain target/landmark assertions. Run the focused shell test before CSS edits and record the expected failure.

- [x] **Step 3: Implement the smallest CSS correction.** Remove the phone active fill, rounded active tile, and bottom indicator; add the prototype top indicator as a pseudo-element. Preserve hover, focus-visible, desktop rail, safe-area, fixed dock, and role-specific DOM behavior.

- [x] **Step 4: Run focused and packet gates.** Run shell breakpoint/tokens/authenticated-shell tests, `test:shell-responsive`, `test:shell-geometry`, Programs responsive tests, and relevant component gates under Node 22.18.0. Record exact results.

- [x] **Step 5: Inspect both primary viewports.** Render the actual route-backed member and management-capable navigation at `402x874` and `360x800`; compare against the frozen HTML. Confirm active indicator placement, neutral background, scanner grammar, safe-area/dock geometry, target size, and role-specific slot labels.

- [x] **Step 6: Review and close.** Inspect the complete diff against the start SHA, run `git diff --check`, verify no suppression or unrelated file changes, check every checkbox, append the final checkpoint, update the master ledger to `COMPLETE`/`NONE`, and commit exactly once with `fix(shell): match programs prototype navigation treatment`.

## Completion criterion

R2A is complete only when the focused and packet gates pass and inspected `402x874`/`360x800` member and management screenshots agree with the frozen top-indicator treatment without weakening any shell accessibility, geometry, or desktop contracts.

## Checkpoint Log

### Checkpoint — 2026-09-11 17:03 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `1c92a346ffa3a42feab546d20d234220f0a266ac`
- Dirty paths: tracker and this claimed packet only; no unrelated overlap
- Last completed checkbox: `Step 1 — claim R2A and pin the live baseline`
- Last command / result: live git/PR/branch/status preflight plus graph index/coverage check — `PASS; local candidate is clean, PR #607 remains OPEN, remote head unchanged, Storybook is live on 6006`
- Active finding: current phone CSS still uses `background: var(--surface)` with `box-shadow: inset 0 -2px 0 var(--accent)` for active items, contrary to the frozen top indicator treatment.
- Next unchecked checkbox: `Step 2 — add the intentional red regression`

### Checkpoint — 2026-09-11 17:13 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `1c92a346ffa3a42feab546d20d234220f0a266ac`
- Dirty paths: `web/app/globals.css`, `web/lib/shell/shell-breakpoint.test.tsx`, this packet, and the master tracker only
- Last completed checkbox: `Step 5 — inspect both primary viewports`
- Last command / result: focused shell `76/76`; `test:shell-responsive` `92 passed, 1 skipped`; `test:shell-geometry` `35/35`; `test:programs:responsive` `passed` at `test-results/programs-responsive/20260911t090958707z`; full web components `69 files / 1,021 tests`; web typecheck; computed-style and screenshot capture — `PASS`
- Active finding: actual member and management Stories at `402x874` and `360x800` match the frozen Bottom Nav grammar: transparent active background, no inset bottom line, centered red `18px × 2px` top indicator at `top: 3px`; member keeps `通知` and management keeps `管理`; remaining management scope-row difference is the known R3 finding.
- Next unchecked checkbox: `Step 6 — review and close`

### Checkpoint — 2026-09-11 17:15 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `1c92a346ffa3a42feab546d20d234220f0a266ac` (closeout state prepared before the atomic commit)
- Dirty paths: `web/app/globals.css`, `web/lib/shell/shell-breakpoint.test.tsx`, this packet, and the master tracker only
- Last completed checkbox: `Step 6 — review and close` (all packet checkboxes checked; tracker closeout state prepared)
- Last command / result: `git diff --check`, Oxfmt check, full diff/file accounting, source suppression scan, focused shell tests, shell responsive/geometry, Programs responsive, full components, typecheck, and actual/frozen viewport review — `PASS; commit is the next atomic command`
- Active finding: R2A scope is limited to the phone Bottom Nav treatment; desktop rail, role-specific slots, scanner slot, landmark, target, safe-area, and 800px transition remain covered and green. No remote write is authorized.
- Next unchecked checkbox: `none; verify the committed subject and final clean state after commit`
