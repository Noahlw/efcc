# Layout / WCAG 2.2 AA Remediation Acceptance Trace

**Scope:** follow-up implementation for `outputs/efcc-layout-wcag-2.2-aa-audit-2026-08-27.md`
**Baseline:** `feat/s4-12-shadcn-migration` at `85817f5`
**Written before implementation:** 2026-08-27

## Acceptance criteria

1. **Functional control contrast**
   - Enabled input, search, select, checkbox, switch, and other custom control boundaries must reach at least 3:1 against every adjacent background in normal, hover, focus, and invalid states.
   - Decorative dividers remain a separate token and are not darkened unnecessarily.

2. **Touch targets and shared primitives**
   - No enabled interactive target is below 24 × 24 CSS px unless a documented WCAG exception applies.
   - App-facing mobile Button/Input/toggle controls use a 44px minimum block size without relying on per-page patches.
   - Check at 320, 390, 600, 799, 800, 1024, and 1440px.

3. **Permission policy completion on mobile**
   - At 320 × 568 and 390 × 844, changing an early or late permission exposes the dirty count and save action without requiring traversal through all remaining groups.
   - The dirty action surface does not obscure the focused control, validation message, review content, or bottom navigation.
   - Inspect, save, cancel/reset, failed save, and successful save states are observable through DOM/response state.

4. **Responsive reflow**
   - Core authenticated routes have no horizontal overflow at the seven widths above.
   - Desktop management surfaces use available width deliberately while participant reading/form content keeps a readable line length.
   - Filter chips wrap at narrow widths instead of creating a hidden horizontal scroller.
   - The account directory stacks its desktop filter/workspace layout at the narrow desktop breakpoint (800–1023px).

5. **Semantics and copy**
   - Each affected responsive route exposes one meaningful H1 and logical H2/H3 nesting.
   - No unexplained implementation term (`scoped profile`) remains in routine operator UI.
   - A non-interactive role label must not look like a button; if role switching is intended, it must be a real accessible control.

6. **Focus and keyboard**
   - Focus remains visibly indicated with the existing strong teal treatment.
   - Keyboard focus is not fully obscured by sticky/fixed surfaces; focus moves predictably into and out of the mobile permission review affordance.

7. **Verification gate**
   - `pnpm --dir web typecheck` passes.
   - `pnpm --dir web test` passes.
   - `pnpm --dir web build` passes.
   - Relevant authenticated Playwright checks pass 100% against local `wrangler dev` and local disposable D1 fixtures.
   - No Apps Script, Google Sheet, Cloudflare production, or non-disposable database is mutated.

## Deliberate non-goals

- Do not change scanner camera-first behaviour without an explicit product decision; keep it as a documented follow-up.
- Do not invent dashboard data solely to fill desktop whitespace.
- Do not restore the previous tall mobile sticky permissions review panel.
- Do not claim formal WCAG 2.2 AA certification without manual VoiceOver/NVDA, zoom, text-spacing, and forced-colors checks.

## Verification evidence (after implementation)

- `pnpm --dir web typecheck` — pass.
- `pnpm --dir web test` — pass (32 files, 483 tests).
- `pnpm --dir web build` — pass (18 static routes).
- Local authenticated browser smoke against `wrangler dev` — pass at 320, 390, 600, 799, 800, 1024, and 1440px; the audited routes reported no horizontal overflow.
- Additional visual checks: announcement cards wrap on phone widths; mobile nav is opaque over scrolling content; permission dirty actions sit above the bottom dock; the account directory reflows at 800px.
