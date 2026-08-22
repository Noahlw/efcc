# S2 Warm Community Visual System — Program Detail (V1) Acceptance Plan

**Date:** 2026-08-22
**Status:** proposed — acceptance trace established before implementation integration; this slice is not READY until every criterion below has fresh evidence.
**Parent:** [#422](https://github.com/Noahlw/efcc/issues/422) · ADR-0037 · Evidence: `.scratch/s2-phone-polish-evidence.md`
**Reference render:** `.scratch/s2-style-tiles/pd-v1.html` (recolored to EFCC tokens)

## Scope

Program Detail participant surface restyled per PD-V1 (忠實重排) in the Warm Community layout system on existing tokens: single-layer group cards, pill status badge, calendar-chip schedule rows, unbreakable spoken time chips, quiet back link, enrollment panel container coherence. Shared-shell floating dock is a second commit in the same branch. No data/API/route changes.

## Acceptance Trace

| Step | Action | Expected observable outcome |
|------|--------|------------------------------|
| 1 | Open `/programs?program=<E2E_DEMO_成人查經>&from=programs` as enrolled `E2E_member` at 320/390px | Back affordance renders as quiet text link at content top; one program title; no boxed chip |
| 2 | Inspect header block | Status pill (已參加) solid cinnabar, AA contrast; description on neutral card; no nested card-in-card (Surface Layer Rule: max 2 surfaces) |
| 3 | Inspect next-meeting group card | Rounded white card on `--surface`; label + event title + date/time chip with location; time range `晚上 7:30–8:45` stays on ONE line at 320px |
| 4 | Inspect schedule rows | Each upcoming event row shows calendar-chip date block (day numeral + month·weekday), title, spoken-range chip, location; zero orphaned characters (`節`, `8:45`) |
| 5 | Schedule rules line | Renders spoken format `每週三 晚上 7:30–8:45`, not `19:30–20:45`; same format family as events rows (one format per surface) |
| 6 | Events beyond mobile cap | `顯示全部 N 節` expander row present when truncated; activating reveals remaining rows; keyboard operable |
| 7 | Enrollment panel (Active state) | Container inherits group-card styling; no double borders; actions remain fully static (no sticky overlap regression vs #412/#413) |
| 8 | Bottom clearance | Last interactive element scrollable fully above dock + safe-area at 320 and 390px |
| 9 | Floating dock (commit 2) | Dock renders as rounded translucent pill, scanner as normal tab inside it, active tab accent capsule; no label under a circle; all 5 tabs tappable ≥44px effective target |
| 10 | Regression gate | `pnpm typecheck`, `pnpm --dir web test:components`, Playwright phone suites (`phone-320`, `phone-390`) 100% against local wrangler dev + fresh D1 seeds |
| 11 | Visual proof | Side-by-side screenshot (live vs pd-v1.html reference) posted to the PR |

## Non-goals

Event Detail / other screens (subsequent #422 slices); desktop pass; management surfaces; backend contracts.
