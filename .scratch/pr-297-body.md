Closes #292

## Summary
- Implements the 5-slot phone-first bottom dock (`首頁 · 課程 · 〔掃描〕 · 通知/管理 · 帳戶`) with the central raised scan button and responsive desktop rail (≥920px).
- Projects capability-adaptive navigation: Participant dock swaps slot 4 to `管理` for Staff, Admin, Department Managers, and Program Leaders.
- Extends design tokens in `web/app/globals.css`, `DESIGN.md`, and `.impeccable/design.json` with `--pending: #8a5b16`, `--pending-surface: #f3eee8`, and `--pending-border: #c1ad95`.
- Creates `web/lib/icons.tsx` providing 1.8px monoline outline SVG icons.
- Adds routes for `/management` and `/notices`, and safely redirects legacy direct routes (`/events`, `/permissions`, `/care`).
- Documents ADR-0032 (`docs/adr/0032-management-workspace-design-authority.md`) and Spec 083 (`docs/specs/083-management-workspace-and-shell-contract.md`).

## Similarity to master (vs master @ f2c55d4)

This is an LLM judgment of the diff, not a measurement.

- **Visual / DOM**: changed by design — 5-slot dock layout, central raised scanner button, and desktop side rail.
- **Navigation projection**: changed by design — server-projected 5-destination navigation tailored to account capability.
- **Design tokens**: 95% — added `--pending` color triad, existing tokens preserved untouched.
- **Backend / Auth**: unchanged (100%) — existing cookie auth and session verification preserved.

Similarity is an LLM assessment of the diff, not a CI gate or measurement.

## Test plan
- [x] `pnpm typecheck && pnpm --dir web typecheck` (passes with 0 errors)
- [x] `pnpm test` (passes 100%)
- [x] `pnpm --dir web test` (19 test files, 379 tests pass)
- [x] `pnpm --dir web test:components` (34 test files, 369 tests pass)
- [x] `git diff --check` (clean)

## QA Test Steps
1. Open mobile viewport (<920px) on `/home`: verify 5-slot bottom dock with raised `掃描` button.
2. Sign in as Member: verify slot 4 displays `通知`.
3. Sign in as Admin/Staff: verify slot 4 displays `管理`.
4. Open desktop viewport (≥920px): verify 5 destinations render in the sticky left navigation rail.
5. Direct link to `/events`: verify capability-gated redirection into management context.
