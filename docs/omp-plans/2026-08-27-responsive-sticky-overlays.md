# Responsive Sticky Overlays Implementation Plan — 2026-08-27

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the systemic bottom-anchored overlay bug that makes `/management?module=permissions`'s dirty review/save panel and `/management?module=approvals`'s selection tray cover the page on every phone width (user's 748×1366 photo is ground truth). Restore a single shared policy for all in-page bottom action surfaces so every shipped route clears the dock and remains scrollable at 320/375/390/414/600/748/799/800/1024/1440/1920.

**Architecture:** Minimal static-flow fix. On phone/tablet widths <800px, complex in-page action surfaces (`.reviewPanel` and `.stickyBar`) become `position: static` in document flow — no viewport-bottom anchoring, no artificial bottom reserve. Fixed app dock (`.nav-phone` + 84px safe-area reserve) is preserved. Desktop ≥800 keeps current behavior (stickyBar compact floating, reviewPanel static 800-1023 and sticky-top ≥1024). Inner expandable lists (`.changeSummary ul`, `.trayItems`) are capped with internal scroll only if needed so cards remain manageable. No prototype branch; direct fix on `feat/s4-12-shadcn-migration`.

**Tech Stack:** Next.js 16 static export, React 19, TypeScript, CSS Modules, `globals.css` tokens, Cloudflare Worker + D1 (stubbed Playwright), Playwright `chromium` for the responsive gate.

## Global Constraints

- Branch: `feat/s4-12-shadcn-migration` at `d97af43` (do not move base).
- Do not edit `main`, prototype, or existing audit artifacts; only the two new docs + evidence dir and the production fix files below.
- Local `wrangler dev` on `127.0.0.1:8797` is the READY gate (ADR-0029). `pnpm --dir web build` must pass; new responsive gate must be green before PR.
- No new runtime dependency. Use only installed `radix-ui`, `shadcn`, `clsx`, `tailwind-merge` if needed (no `toast` added).
- Preserve Civic Minimal tokens (`--surface`, `--line`, `--accent`, etc.) from `DESIGN.md` / `.impeccable/design.json`.
- The 748×1366 case is the regression anchor — it must be a first-class viewport in the new gate.

## File Structure & Changes

**Create:**
- `docs/qa/2026-08-27-responsive-sticky-overlays-evidence.json` — measurements JSON (already created by the audit runner: viewport/rect/occlusion per route)
- `docs/qa/screenshots/2026-08-27-responsive-sticky-overlays/` — 240+ PNGs (already created)

**Already created (do not recreate):**
- `docs/qa/2026-08-27-responsive-sticky-overlays-audit.md` (audit)
- `docs/qa/2026-08-27-sticky-layer-inventory.md` (inventory)

**Modify (exact files/symbols):**

1. `web/app/globals.css` — **no change** (preserve `--surface` tokens and `.shell-content:361` `padding-bottom: calc(84px + env(safe-area-inset-bottom,0px))` dock reserve). No new token needed; static-flow makes the extra reserve unnecessary.

2. `web/app/management/management-action-framework.module.css`
   - `52:.stickyBar` — **change base** from `position: fixed; z-index:25; right:0.75rem; bottom:calc(5.1rem+env(safe-area)); left:0.75rem;` to `position: static;` (keep `display:flex; min-height:58px; gap; padding; border; radius; background; box-shadow` for in-flow card). Remove `z-index` and viewport anchoring on phone/tablet.
   - `116-123:@media (min-width: 800px)` — **restore fixed floating desktop**: `position:fixed; z-index:25; right:1rem; bottom:1rem; left:auto; min-width:360px;` (already present, now explicitly re-adds `position:fixed; z-index:25` since base is static). This preserves desktop compact floating action.

3. `web/app/management/permissions-panel.module.css`
   - `648:.reviewPanel` — **change base** from `position: sticky; bottom:calc(5.1rem+env(safe-area)); z-index:2;` to `position: static;` (keep `display:grid; gap; padding; border; radius; background; box-shadow`). Remove viewport anchoring on phone/tablet.
   - `851:@media(max-width:599px) .reviewPanel {position:sticky}` — **delete** (was redundant sticky on narrowest phones; now static everywhere <800).
   - `889-894:@media(max-width:799px) .policyLayout` — **remove** the `padding-bottom: calc(12rem + env(safe-area))` and `scroll-padding-bottom` — replace with `padding-bottom: 1rem;` (normal spacing). The 84px dock reserve on `.shell-content` is sufficient; the 12rem artificial reserve was only needed for the fixed/sticky stacks and now would create 192px of dead whitespace under a static flow panel.
   - `689-708:.changeSummary ul` — **cap internal list**: add `max-height: 14rem; overflow-y: auto;` so with 8+ changes the card itself stays manageable without creating a full-panel nested scroll. Keep `display:grid; gap; list-style:none`.

4. `web/lib/approval-queue.module.css`
   - `.trayItems` (`485-496`) — **already capped**: `max-height: 8rem; overflow-y: auto; border-top` exists from prior S4 fix — keep as-is (manageable). No change needed; verify `position: static` parent (`.stickyBar`) now contains it in-flow, so tray expansion pushes content down rather than overlaying.

5. `web/app/management/permissions-panel.tsx`
   - `526:aside.reviewPanel` — if using `composes`, no TSX change; otherwise add `className={`${styles.reviewPanel} bottom-action-surface`}` or rely on CSS inheritance. Ensure `dirty` → `reviewOpen` state (405-413) still works but panel is scrollable when tall.

6. `web/lib/approval-queue.tsx`
   - `768:ManagementStickyActionBar` — if stickyBar now consumes shared class, no TSX change; ensure `selectedIds.length>0` still gates mount (`767`), and `trayOpen` (802) still toggles `trayItems` but that list is now capped.

7. `tests/e2e/s4-management-hardening.test.ts` or new `tests/e2e/responsive-sticky.test.ts`:
   - Add **viewport projects** for `748x1366` and `390x844` (plus existing 320/375/390/414/600/799/800/1024/1440/1920). This is the regression gate for the user's photo.
   - **New acceptance: zero mobile fixed/sticky in-page occlusion beyond the dock.** For phone/tablet <800 widths:
     - `reviewPanel` and `stickyBar` must be `position: static` (computedStyle.position === "static") — not fixed/sticky
     - `bottomCover` (fixed bottom occlusion) must equal dock only (≈72px) — no extra 5.1rem stack
     - `combinedBottomOcclusion` must equal dock-only (≈10–13% at 320, ≈5% at 748) — not 50%+ with panel
     - Last `policyRow` and last approval row must be reachable via `scrollIntoView` / not covered by `elementFromPoint` (fixed overlay test)
     - `horizontalOverflow <=1`, controls ≥44px (existing)
   - Keep desktop ≥800 assertions: `stickyBar` fixed floating (right:1rem bottom:1rem) and `reviewPanel` static 800-1023 then sticky-top 1024 — unchanged.

**Do not modify:**
- `web/app/globals.css:147:.nav-phone` (dock stays `position:fixed; z-index:100;` — out of scope)
- `web/app/globals.css:283:.nav-desktop` (rail)
- `web/lib/auth-shell.module.css:50:.header` (header)
- `web/components/ui/dialog.tsx` / `sheet.tsx` (modals)
- `web/lib/attendance-panel.module.css:258:.cameraStage` (already correct)
- No new `toast` system.

## What Already Exists

- Dock + outlet reserve are correct in isolation (`globals.css:147,356` + `tests/e2e/responsive.test.ts:185-222` `Emulation.setSafeAreaInsetsOverride`).
- Scanner camera reserve is correct (`attendance-panel.module.css:258`).
- Management hub/accounts/members/home-content/attendance/settings have **no** bottom action surface and are PASS — no change.
- Two buggy surfaces: `ManagementStickyActionBar` (approvals tray) and `.reviewPanel` (permissions dirty) — both lack max-height/overflow and duplicate `5.1rem`.

## Not In Scope

- New toast system, new navigation design, new role assignment UI (S4.1), S7 correction/void, prototype (`/prototype`) styling.
- Changing dock visual design (pill 62px + blur) or side rail.
- Adding new bottom surfaces beyond fixing the two callers.

## Failure Modes & Gaps

- **If `--dock-reserve` token changes**, both surfaces must follow — grep `5.1rem` after fix must return zero in `web/app` (except comment).
- **If `reviewPanel` is collapsed but `policyLayout` pad is still short**, expanded-state test will fail — pad must cover expanded 598px, not just collapsed 238px.
- **If `trayItems` not capped**, approvals expanded at 320×568 still exceeds 48dvh (238px bar > 273px 48dvh at 568) — cap needed.
- **If stub shape regresses**, Playwright gate will show `reviewPanel` null (as in audit's early runner) — use the corrected `VIEW` shape from `web/lib/permissions-panel.test.tsx:50-166` for `GET /api/v1/programs/account-permissions` (accounts with `role:"admin|department-manager|staff"` + `departments`, roles with `assignmentState`, `policy.actor:{canRead,canEdit}`).

## Test Strategy

- **Unit / component (Vitest):** No new unit tests needed (behavior is layout). Existing `permissions-panel.test.tsx` (dirty→reviewOpen) and `approval-queue.test.tsx` still pass — run `pnpm --dir web test:components`.
- **Type & build:** `pnpm --dir web typecheck` + `pnpm --dir web build` must pass (18 static routes).
- **Playwright responsive gate (local D1):**
  1. `PROGRAMS_TARGET_URL=http://127.0.0.1:8797 pnpm exec playwright test --config=tests/e2e/s4-management-hardening.config.ts` **with new viewports** 748×1366 + 390×844 added to `projects` (or new `responsive-sticky.config.ts` replicating `s4-management-hardening` but with `testMatch: ["**/s4-management-hardening.test.ts"]` filtered to geometry + tray/review dirty/expanded cases).
  2. New assertions: `reviewPanel:visible && reviewPanel.height < 0.48*viewport.height`, `stickyBar:visible && stickyBar.height < 0.48*vh`, `combinedBottomOcclusion < 0.65`, `scrollPaddingBottom >= reviewPanel.height`, `no horizontal overflow`, `controls >=44px` (existing `assertResponsiveGeometry` extended).
  3. **Dirty/expanded evidence:** at 320×568, 390×844, 748×1366 — toggle 2 and 8 permissions (staff editable), assert review panel scrollable and save button reachable via `elementFromPoint` + `scrollIntoView`; for approvals, select 2 and expand tray.
  4. Screenshot matrix at those 3 widths for `management-permissions` dirty collapsed/expanded + `management-approvals` tray collapsed/expanded (to `docs/qa/screenshots/...` if re-run).
- **No Cloudflare deploy** required for READY; local gate is sufficient (ADR-0029).

## Parallelization / Worktree Strategy

- Single worktree `feat/s4-12-shadcn-migration`; no sub-agents needed (3 files changed). If parallel, one agent owns `globals.css` + `management-action-framework.module.css` + `permissions-panel.module.css` + `approval-queue.module.css` (they touch no shared file beyond `globals.css` — serialize on `globals.css`).

---

### Task 0: Verify dock reserve is preserved (5 min)

**Branch:** `feat/s4-12-shadcn-migration`

**Files:** `web/app/globals.css` (no edit — verify)

- [ ] Confirm `.shell-content:361` still `padding-bottom: calc(84px + env(safe-area-inset-bottom,0px))` on <800 and `0` on ≥800, and `.nav-phone:147` still `position:fixed; z-index:100; height:62px; bottom:calc(0.625rem+env(safe-area))`.
- [ ] Confirm no new token needed; static-flow removes need for extra reserve.

**Acceptance:** Dock + outlet reserve unchanged; no new token introduced.

### Task 1: Fix ManagementStickyActionBar — static on phone (20 min)

**Files:** `web/app/management/management-action-framework.module.css:52,116`

- [ ] Change base `.stickyBar` from `position:fixed; bottom:5.1rem; z-index:25; right/left:0.75rem` to `position:static;` (in-flow card). Remove viewport anchoring for <800.
- [ ] Keep `@media(min-width:800px)` as `position:fixed; z-index:25; right:1rem; bottom:1rem; left:auto; min-width:360px;` for desktop floating.
- [ ] Verify `.trayItems` already capped at 8rem overflow-y:auto — no change.
- [ ] Confirm no `5.1rem` remains in this file.

**Acceptance:** At 320×568 and 748×1366, `.stickyBar` is static in flow, `bottomCover` = dock only (72px), tray expansion pushes content down and is not a fixed overlay; desktop ≥800 still floats at corner.

### Task 2: Fix permissions reviewPanel + policyLayout reserve — static on phone (25 min)

**Files:** `web/app/management/permissions-panel.module.css:648,689,851,889`

- [ ] Change base `.reviewPanel` from `position:sticky; bottom:5.1rem; z-index:2` to `position:static;` (in-flow card).
- [ ] Delete `@media(max-width:599px) .reviewPanel {position:sticky}`.
- [ ] Change `@media(max-width:799px) .policyLayout` from `padding-bottom:calc(12rem+env(safe-area)); scroll-padding-bottom:calc(12rem+env(safe-area))` to `padding-bottom:1rem;` (normal spacing — dock reserve on `.shell-content` suffices; 12rem was artificial).
- [ ] Add to `.changeSummary ul` `max-height:14rem; overflow-y:auto;` so expanded dirty list (8 changes) is internally scrollable and card stays manageable (~238px collapsed, ~380px with 14rem list cap).

**Acceptance:** At 320×568 dirty expanded (8 changes) `.reviewPanel` is static in flow, height limited by 14rem internal list, last `.policyRow` fully reachable; phone `combinedBottomOcclusion` = dock only. Desktop 800-1023 static, 1024+ sticky-top preserved.

### Task 3: Add 748×1366 regression gate — zero mobile in-page occlusion (40 min)

**Files:** `tests/e2e/s4-management-hardening.config.ts` (or new `tests/e2e/responsive-sticky.config.ts`) + `tests/e2e/s4-management-hardening.test.ts`

- [ ] Add projects: `phone-390x844`, `phone-748x1366` plus 320/375/390/414/600/799/800/1024/1440/1920 (12 total).
- [ ] New phone (<800) assertions: `reviewPanel` and `stickyBar` computedStyle.position === "static", `bottomCover` == dock only (≈72px), `combinedBottomOcclusion` == dock only, last row not covered by `elementFromPoint`.
- [ ] Dirty flows: permissions toggle 2 & 8 staff caps, approvals select 2 + expand tray, at 320×568, 390×844, 748×1366; verify last policy/approval rows reachable.
- [ ] Ensure stub for `GET /api/v1/programs/account-permissions` uses `VIEW` shape from `web/lib/permissions-panel.test.tsx:50-166`.

**Acceptance:** Gate passes with 748×1366; evidence shows no fixed/sticky in-page occlusion beyond dock.

### Task 4: Verify & document (15 min)

- [ ] `pnpm --dir web typecheck` PASS
- [ ] `pnpm --dir web test:components` PASS (existing 571 tests)
- [ ] `pnpm --dir web build` PASS
- [ ] `git diff --check` PASS
- [ ] Append verification table to this plan (commands → PASS) and ensure `docs/qa/2026-08-27-responsive-sticky-overlays-audit.md` remains the audit (not the fix).
- [ ] No `5.1rem` literals remain in `web/app/management` (grep 0), no `toast` added, no prototype edits.

## Self-Review Checklist

- [ ] 748×1366 photo is a permanent viewport in the gate
- [ ] Shared token (`--dock-reserve` / `--bottom-action-offset`) used by both surfaces, no duplicate `5.1rem`
- [ ] Both surfaces have `max-height: min(48dvh, 420px)` and `overflow-y: auto`
- [ ] Scroll reserves cover worst-case expanded heights (policyLayout pad, trayItems cap)
- [ ] All 12 widths (320/375/390/414/600/748/799/800/1024/1440/1920 plus 799/800 boundary) have evidence or are asserted in the gate
- [ ] No production code beyond the 4 files listed

