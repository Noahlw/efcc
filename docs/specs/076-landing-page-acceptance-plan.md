# Landing-Page UI Acceptance Plan

**Feature:** Landing-page UI rework (impeccable Persuade surface; deferred from 075-auth-d1-foundation-acceptance-plan.md "Out of scope")
**Spec authority:** Spec 074 (shell responsive/accessibility baseline), Spec 000 (product truth), Spec 071 (accessibility criteria), ADR-0017 (static export, no server runtime)
**Date:** 2026-08-05
**Status:** proposed — written BEFORE implementation per AGENTS.md Headless-Gate

## Scope

Re-skin the signed-out landing route (`web/app/page.tsx` + `web/app/page.module.css` + landing copy in `web/lib/copy.ts`) into an intentional Persuade surface. Auth/backend behavior is untouched: `web/lib/auth`, D1 migrations, Worker auth routes, Apps Script mirror code, and unrelated domain screens are not modified. The login state machine, session restore, error handling, and every `COPY.login.*` string are preserved verbatim.

## Direction (dealt before code)

- **Mode:** Persuade (the visitor decides and acts; the action is logging in).
- **World:** "The congregation's register" — warm paper ground, deep warm-ink typography, and a committed cinnabar seal-red accent, ruled with hairline ledger rules. Distinctive, editorial, and trustworthy; refuses the SaaS-gradient hero and the spiritual-pastel default.
- **Primary action:** the login form (persistent and prominent). **Secondary action:** anchor to the feature list.
- **Copy:** credible Traditional Chinese product copy drawn from real features (課程與活動 / 聚會管理 / 掃描簽到 / 關懷儀表板 / 權限管理 / 個人檔案). No fake testimonials, fake metrics, or invented security claims.

## Preconditions

1. Dev server (`next dev`) serves the landing route at a local URL.
2. Browser profile has no stored session so the surface renders `SIGNED_OUT`.
3. Focused component contract tests (`web/lib/app.test.tsx`) still pass — the login form's observable contract is preserved.

## Acceptance criteria — observable DOM / accessibility assertions

Unauthenticated flow, verified via Orca `browser` (desktop and mobile viewports) plus the focused component tests.

| # | Criterion | Observable assertion |
|---|---|---|
| L1 | Landing renders with a single top-level `h1` hero headline | `document` has exactly one `h1` (the hero); text is credible product copy |
| L2 | Product identity present | wordmark "顯恩堂" / "顯恩堂系統" visible |
| L3 | Login form present and labeled | `getByLabelText("用戶名稱")` and `getByLabelText("PIN 碼")` inputs exist; one submit button named `登入` |
| L4 | Login panel has a heading `登入` (exactly one heading with that name) | `getByRole("heading", { name: "登入" })` resolves to exactly one element |
| L5 | Primary + secondary CTAs present | a primary action targeting the login form and a secondary action (feature anchor) exist |
| L6 | Feature list present, no inflated claims | the four core capacities (課程與活動 / 聚會管理 / 掃描簽到 / 關懷儀表板) are stated; no fabricated metrics/testimonials |
| L7 | Semantic landmarks | `<header>`, `<main>`, `<footer>` (or equivalent landmark roles) present; nav is a semantic `<nav>` |
| L8 | Keyboard focus visible | `:focus-visible` outline on interactive elements (inherits global `#1565c0` rule) |
| L9 | Reduced motion respected | `prefers-reduced-motion: reduce` disables authored entrance motion |
| L10 | Responsive (375px) no horizontal overflow | `document.documentElement.scrollWidth <= innerWidth` at 375px and at desktop |
| L11 | Touch targets ≥ 44×44 CSS px | primary controls have ≥ 44px height (computed) |
| L12 | Error/notice surface preserved | error path renders `role="alert"` text; component test asserts `COPY.restore.expired` on bad login |
| L13 | Auth contract preserved | `web/lib/app.test.tsx` Login block passes (valid login → `replace("/profile")`, session persisted, invalid login keeps form, valid stored session restores) |

## Forbidden paths

- No modification of `web/lib/auth/*`, D1 migrations, Worker auth routes, `web/lib/service-envelope.ts`, or Apps Script mirror code.
- No `COPY.login.*` string changes (component tests depend on exact values).
- No invented security claims, fake testimonials, or fake metrics.
- No network-dependent font/image runtime failure (system font stack and authored SVG only).

## Verification boundary

Browser verification is desktop + mobile in one batched round (Impeccable ceiling), then one confirmation pass. Focused component tests (`vitest.components.config.ts`: `lib/app.test.tsx`) assert the preserved login contract. No formatters, linters, or project-wide suites are run.

## Executed results

Appended after implementation and browser verification.