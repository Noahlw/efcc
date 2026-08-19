# S1 Profile Settings Link Capability Gate Acceptance Plan

**Feature:** Capability-gate management settings link on Profile page (Issue #377)  
**Authority:** Spec #375, ADR-0025, ADR-0029, ADR-0032  
**Date:** 2026-08-19  
**Status:** accepted — verified clean across component, unit, and Playwright suites against local runtime.

## Scope

In `web/app/profile/page.tsx`, conditionally render the link to `/management?module=settings` based on `isPermitted(bootstrap.sections, "management")`.
- When an account's server-projected `bootstrap.sections` includes `management` (Staff/Admin or active management grant), the management settings row is visible.
- When an account's server-projected `bootstrap.sections` omits `management` (plain Member), the management settings row is not rendered.
- The `/profile/settings` link (account settings — username/password) remains visible to all authenticated users.

## Preconditions

1. Fresh browser profile and local D1 database seeded with `pnpm db:seed:local` providing `E2E_admin` and `E2E_member` fixtures.
2. Local Worker/runtime running via `pnpm dev:local` at `http://127.0.0.1:8787`.
3. Deterministic component and unit tests in `web/` pass with zero failures.

## Acceptance criteria — observable DOM assertions

| # | Criterion | Observable assertion |
|---|---|---|
| L1 | Member profile hides management settings link | When rendered with a Member bootstrap (`sections` lacks `management`), the link to `/management?module=settings` (`COPY.profile.systemSettings`) is not present in the DOM. |
| L2 | Management-capable profile shows management settings link | When rendered with a Staff/Admin bootstrap (`sections` contains `management`), the link to `/management?module=settings` (`COPY.profile.systemSettings`) is present and accessible. |
| L3 | Account settings link remains unconditional | For both Member and Staff/Admin accounts, the link to `/profile/settings` (`COPY.profile.accountSettings`) is present in the DOM. |
| L4 | Client-safe authorization seam | The gate strictly inspects `isPermitted(bootstrap.sections, "management")` on the client-side `bootstrap` object without initiating client D1 queries or auth network calls. |

## Verification plan

1. Extend `web/lib/account-settings.test.ts` (ProfilePage describes) with tests asserting presence and absence of `/management?module=settings` for Staff vs Member bootstraps.
2. Run `pnpm --dir web typecheck` and `pnpm --dir web build`.
3. Run focused tests: `pnpm --dir web test:components` and `pnpm --dir web test`.
4. Append execution evidence to this document.

## Evidence

- `pnpm --dir web typecheck`: passed with zero TypeScript diagnostics (covers `isPermitted(bootstrap.sections,"management")` import in `web/app/profile/page.tsx`).
- `pnpm --dir web build`: passed (Next.js static export with all 17 routes generated).
- `pnpm --dir web test`: worker/unit tests passed (26 files, 443/443 tests).
- `pnpm --dir web test:components`: component tests passed (43 files, 496/496 tests including ProfilePage management-settings gating for Member vs Staff/Admin).
- `pnpm test:shell-responsive`: Playwright suites passed 100% against local `wrangler dev` + local D1 (89 passed, 1 skipped mobile-only).
