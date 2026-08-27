# Component contract remediation acceptance trace

**Scope:** follow-up implementation for `outputs/efcc-component-contract-audit-2026-08-27.md`
**Baseline:** `feat/s4-12-shadcn-migration` at `85817f5` plus the existing uncommitted layout remediation changes
**Written before implementation:** 2026-08-27

## Acceptance criteria

1. **Global cascade safety**
   - Tailwind utility padding and margin on shared Button, Input, Textarea, Select, Card, Alert and Tabs render as declared computed styles.
   - The global reset does not override component utility layers; a regression test catches a future reintroduction.

2. **Shared interactive target contract**
   - App-facing default Button, Input, Select, Tabs, Accordion, close action and mobile navigation controls use at least a 44px block/target size; 48px is the preferred touch size.
   - Compact variants are opt-in, documented, and still satisfy WCAG 2.2 AA 24×24 CSS px plus the required spacing exception where applicable.
   - Focus indicators remain visible and are not clipped by a component parent.

3. **Card contract**
   - Card spacing is expressed by approved semantic variants (default, compact, empty or equivalent), not arbitrary page-level padding/gap values.
   - CardHeader/CardContent/CardFooter composition does not double-apply padding.
   - Representative cards at 320, 375, 390, 600, 800, 1024 and 1440px have no clipping or overlap.

4. **Tabs and accordion contract**
   - TabsList owns the target height; TabsTrigger does not overflow its parent.
   - Active indicator and focus ring are visible and not clipped.
   - Accordion triggers expose at least the shared target height and stable content spacing.

5. **Shell transition contract**
   - Changing route or Programs mode resets `#shell-content.scrollTop` to zero, except where explicit back/restore behaviour is intended.
   - After transition, focus lands on a meaningful heading or active tab and remains visible within the viewport.
   - Fixed header, bottom dock and overlay surfaces do not obscure the focused element.

6. **Dialog and Sheet resilience**
   - Long content on 320/375/390px remains scrollable within Dialog and Sheet without body/page overlap.
   - Close hit areas meet the shared target contract; footer actions wrap/stack without covering content.

7. **Responsive and accessibility matrix**
   - Core authenticated routes report no horizontal overflow at 320, 375, 390, 600, 799, 800, 1024 and 1440px.
   - Keyboard focus, disabled/hover/pressed states, error/help/status messaging and reduced-motion behaviour remain observable.
   - Contrast and non-text contrast checks remain within WCAG 2.2 AA expectations.

8. **Verification gate**
   - `pnpm --dir web typecheck` passes.
   - `pnpm --dir web test` passes.
   - `pnpm --dir web build` passes.
   - Relevant authenticated Playwright checks pass 100% against local `wrangler dev` and disposable local D1 fixtures.
- No Apps Script, Google Sheet, Cloudflare production, or non-disposable database is mutated.

## Verification evidence

### Follow-up: management directory card overflow

Written before this follow-up implementation on 2026-08-27 after reproducing
`/programs?mode=management` locally. Each management directory button must let
its multi-line content determine its height, preserve its declared 14px/16px
inset, and align content to the block start instead of inheriting the shared
Button's single-line centering/fixed-height contract. A regression assertion
must prove that rendered directory content stays inside the card bounds at the
management viewport widths.

- `pnpm --dir web typecheck` — pass.
- `pnpm --dir web test` — pass (32 files, 483 tests).
- `pnpm --dir web test:components` — pass (50 files, 576 tests, including shared component contract tests).
- `pnpm --dir web build` — pass (18 static routes).
- `pnpm test:shell-responsive` — pass (92 passed, 1 skipped) across mobile and desktop projects.
- Authenticated local Playwright spot checks against an isolated `wrangler dev` on `127.0.0.1:8790` — pass for Programs mode switching, long-copy overflow at the audited widths, keyboard-operable management entry points, and Home long-copy wrapping (4 passed).
- Browser measurements after the fix: representative Input padding restored to `8px 14px`, Button padding restored to `0 16px`; Programs mode transition leaves `#shell-content.scrollTop = 0` and focuses the active tab inside the viewport.
- Existing `127.0.0.1:8787` process was not stopped or modified; the isolated verification worker used local D1 only.
- Follow-up rebuilt-bundle measurement: management directory cards now expand to `111px` for the three-line demo content, retain `14px 16px` padding, use start alignment, and keep every child inside the card bounds.
- Follow-up component contract test — pass (6 tests).
- Follow-up authenticated local Playwright check at `phone-390` — pass (1 test).

## Deliberate non-goals

- Do not redesign brand, colour palette or information architecture.
- Do not change scanner camera-first behaviour.
- Do not invent dashboard data to fill whitespace.
- Do not claim formal WCAG 2.2 AA certification without manual VoiceOver/NVDA, zoom, text-spacing and forced-colors checks.
