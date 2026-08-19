# S1 Shell Rebuild Acceptance Plan

**Feature:** Shared shell, authentication, account, top bar, and navigation reconciliation (Issue #376)  
**Authority:** Spec #375, ADR-0025, ADR-0029, ADR-0032, `.scratch/efcc-redesign-handoff-2026-08-18/`  
**Date:** 2026-08-19  
**Status:** accepted — verified clean across component, unit, and Playwright suites against local runtime.

## Scope

Reconcile the production shell into the extracted design from `.scratch/efcc-redesign-handoff-2026-08-18/`:
1. Mobile (<800px): fixed 5-slot bottom dock with center circular raised 簽到 (scan) FAB.
2. Desktop (≥800px): sticky icon+label side rail (`top:64px`) with active shadow-card treatment.
3. Top bar: management-capable accounts see `顯恩堂` + display name + role label (會員/同工/管理員) + bell icon button with count badge opening the Attention panel; Member-only accounts see a simple title/mark top bar without identity or bell.
4. Visibility exclusions: top bar alone is suppressed on `/scanner` while dock/rail remains visible; both top bar and dock/rail are suppressed on all unauthenticated `AUTH_SCREENS`.
5. Attention panel: dialog container with 待處理 and 通知 tabs, empty states, close button, focus trap, Escape handler, and focus restoration to the bell button. Wired to typed empty data seam (`pendingItems: []`, `notices: []`).
6. Sign-out placement: identity block is static text; sign-out remains on `/profile`.

## Preconditions

1. Fresh browser profile and local D1 database seeded with `pnpm db:seed:local` providing `E2E_admin` (Staff/Admin management-capable fixture) and `E2E_member` (Member fixture).
2. Local Worker/runtime running via `pnpm dev:local` at `http://127.0.0.1:8787`.
3. Deterministic component and unit tests in `web/` pass with zero failures.

## Acceptance criteria — observable DOM / network / layout assertions

| # | Criterion | Observable assertion |
|---|---|---|
| S1 | Mobile 5-slot bottom dock with raised FAB | At viewport widths <800px (e.g. 320px, 375px, 390px), `.nav-phone` renders 5 slots, center `簽到` slot has raised circular styling (`margin-top: -22px`), and page has no horizontal overflow (`scrollWidth <= innerWidth`). |
| S2 | Desktop sticky side rail | At viewport widths ≥800px (e.g. 800px, 1280px, 1440px), `.nav-desktop` renders as a vertical sticky rail (`top: 64px`), `.nav-phone` is hidden (`display: none`), and active item receives shadow-card styling. |
| S3 | Persona-aware nav slots | `E2E_admin` (management-capable) receives slots `首頁`, `課程與活動`, `簽到`, `管理`, `帳戶`; `E2E_member` receives slots `首頁`, `課程與活動`, `簽到`, `通知`, `帳戶`. |
| S4 | Top bar persona distinction | `E2E_admin` renders the management top bar containing `顯恩堂`, display name, role label, and the bell button with badge `0`; `E2E_member` renders only the section title or short mark without identity block or bell. |
| S5 | Attention panel modal behavior | Clicking the bell button opens `dialog[aria-label="注意事項"]` with tabs `待處理` and `通知`, empty-state copy, close button, Escape-key dismissal, focus trapping inside the dialog, and focus restoration to the bell on close. |
| S6 | Attention panel data isolation | Attention panel displays only the typed empty state ("目前沒有待處理事項", "目前沒有新通知") and badge `0`; zero real approval, course, or attendance records are queried or rendered. |
| S7 | Scanner screen selective suppression | On `/scanner`, the top bar is absent from the DOM, but the authenticated dock/rail navigation remains mounted and accessible. |
| S8 | Auth screens full shell suppression | On unauthenticated auth-flow screens (`/`, `/register`, `/guest-check-in`), both the top bar and the dock/rail are absent from the DOM. |
| S9 | Inert identity and stable sign-out | Top bar identity block has no popup or dropdown behavior; sign-out remains operable exclusively via `帳戶` → `/profile` → `登出` button. |
| S10 | Preserved error and deep-link recovery | `ForbiddenView`, `RecoveryView`, empty states, offline banner, and deep-link restoration after session re-auth operate unregressed. |
| S11 | Component and unit test suite coverage | Extended unit tests in `web/lib/app.test.tsx`, `web/lib/management-hub.test.tsx`, `web/lib/sections.test.ts`, and new `web/lib/attention-panel.test.tsx` pass. |
| S12 | Automated Playwright verification | Playwright responsive and accessibility suites pass 100% against local `wrangler dev` + local D1 at 320px, 390px, and desktop widths. |

## Verification plan

1. Run `pnpm --dir web typecheck` and `pnpm --dir web build` to verify clean static export and TypeScript compilation.
2. Run focused component/unit tests: `pnpm --dir web test:components` and `pnpm --dir web test`.
3. Run Playwright responsive and shell tests: `pnpm test:shell-responsive` and `pnpm test:shell-nav` against local `wrangler dev` + local D1.
4. Append execution evidence via `pnpm exec tsx tests/e2e/plan-doc-appender.ts --plan docs/specs/089-s1-shell-acceptance-plan.md --heading "## Executed results" --target-url http://127.0.0.1:8787`.

## Evidence

- `pnpm --dir web typecheck`: passed with zero TypeScript diagnostics.
- `pnpm --dir web build`: passed (Next.js static export with all 17 routes generated).
- `pnpm test`: prototype scanner tests passed (38/38).
- `pnpm --dir web test`: worker auth and unit test suite passed (26 files, 443/443 tests).
- `pnpm --dir web test:components`: component test suite passed (43 files, 495/495 tests including `attention-panel.test.tsx` and updated `app.test.tsx`).
- `pnpm test:shell-responsive` (Playwright responsive & shell nav suites across mobile-375x812, mobile-375x667, and desktop-1280x800): passed (89 passed, 1 skipped mobile-only).
