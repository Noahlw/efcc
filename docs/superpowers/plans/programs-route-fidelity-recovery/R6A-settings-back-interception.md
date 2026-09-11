# R6A — Restore Focused Settings Back Interception

> Load this bounded child packet only while the master tracker marks R6A ACTIVE. R6 remains BLOCKED until this packet is complete. Mutable task status lives only in the master ledger.

**Outcome:** Focused Programs Settings returns to the Settings Hub when its shared Back link is activated through the production Next Link and Radix Slot composition, while preserving the canonical `href`, modified-click semantics, and every other ScreenHeader caller.

## Why this child packet exists

The R6 route-backed Plays expose a production interaction defect: the focused Settings editor renders the correct Back link and `href`, but a normal Chromium activation leaves `SettingsTask` mounted in the focused editor. This prevents the required dirty-state discard return and conflict recovery re-entry. The fixture is not responsible for the failure; the same Back seam fails for both dirty and 409-conflict Plays.

## Files

- Modify: `web/lib/screen-foundations.tsx`
- Modify: `web/lib/screen-foundations.test.tsx`
- Verify: `web/.storybook/programs-material-states.stories.tsx`
- Update: R6 packet and master tracker

## Steps

- [x] **Step 1: Record the production red.** Preserve the exact R6 Chromium failures: `Workspace Settings Dirty` and `Workspace Settings Conflict` both fail after activating `返回設定`; the focused editor remains visible instead of `課程設定`. Complete when the failure is attributed to the shared ScreenHeader/Next Link seam, not MSW or fixture setup.
- [x] **Step 2: Add the bounded ScreenHeader regression.** Add a focused component assertion for the Back interception contract, including the capture-phase path and preservation of the canonical link destination. Complete when the new assertion fails against the current event ordering for the affected composition or is backed by the recorded R6 browser red where the unit harness cannot reproduce Next's delegated handler.
- [x] **Step 3: Repair the smallest responsible layer.** Run the existing caller interception before delegated Next Link navigation for Back links that provide `onBack`, without changing modified-click behavior or the no-callback route-header contract.
- [x] **Step 4: Run focused green evidence.** Run the Screen Foundations focused test, both R6 Settings Plays, and the R6 targeted contract inventory. Complete when the Settings dirty flow returns with the draft discarded and the conflict flow re-enters and succeeds on the second PATCH.
- [x] **Step 5: Review and close child packet.** Inspect the bounded diff, run `git diff --check`, update R6 and R6A checkpoints/ledger, and commit exactly once with `fix(programs): restore settings back interception`. Complete when exactly one matching commit exists after the Start SHA and R6A is `COMPLETE` with R6 reactivated.

## Checkpoint Log

- 2026-09-11 child packet created after R6 targeted Chromium red; next unchecked item is Step 1.

### Checkpoint — 2026-09-11 19:55 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `f32f5082f1628c0ba7f74b10f14bd4d99cd1b03e`
- Dirty paths: master tracker, R6 packet, this packet, `web/.storybook/programs-fixtures.ts`, `web/.storybook/programs-material-states.stories.tsx`, `web/.storybook/programs-presentation-contract.test.ts`, `web/lib/screen-foundations.tsx`, and `web/lib/screen-foundations.test.tsx`
- Last completed checkbox: `Step 4 — run focused green evidence`
- Last command / result: T07 contract, targeted Settings/Notifications Plays, and Screen Foundations component test — `PASS; 18 contract tests, 4 R6 Plays, 9 Screen Foundations tests`
- Active finding: Capture-phase interception lets Settings `onBack` prevent delegated Next Link navigation while preserving the canonical `href`; dirty discard returns to the hub and conflict re-entry succeeds on the second PATCH.
- Next unchecked checkbox: `Step 5 — review, update ledgers, and commit the bounded child packet`

### Checkpoint — 2026-09-11 19:58 HKT
- Branch / HEAD: `codex/programs-screen-foundations/wave-3` / `f32f5082f1628c0ba7f74b10f14bd4d99cd1b03e`
- Dirty paths: master tracker, R6 packet, this packet, the three R6 Story/fixture/contract files, and the two Screen Foundations production/test files
- Last completed checkbox: `Step 5 — review, update ledgers, and commit the bounded child packet`
- Last command / result: bounded R6A diff review plus `git diff --check` — `PASS; only ScreenHeader Back interception, its focused regression, and packet/ledger closeout are in the child scope`
- Active finding: R6A is ready to close with one unique `fix(programs): restore settings back interception` commit; R6 is reactivated for its remaining full gates and commit.
- Next unchecked checkbox: `none; R6A is COMPLETE`
