# 425 — Program Detail `<h1>` Acceptance Plan

**Date:** 2026-08-22
**Status:** proposed — acceptance trace established before implementation; not READY until every criterion has fresh evidence.
**Parent:** [#425](https://github.com/Noahlw/efcc/issues/425) · Contracts: Warm Community single-title rule, ADR-0029 Headless-Gate

## Scope

Promote the participant Program Detail title from `h2.boundaryTitle` to `h1` (keeping `id="program-detail-title"`, `className`, `tabIndex={-1}`, and the load-effect focus target). No visual change (all styling is class-driven). No backend changes.

## Acceptance Trace

| Step | Action | Expected observable outcome |
|------|--------|------------------------------|
| 1 | Component test: ready render, assert `getByRole("heading", { level: 1, name: <program name> })` | PASS (fails under the old h2 — regression guard) |
| 2 | Component suite full run | 529+1 passed, no heading-name assertion regressions (all existing queries are name-based, level-free — verified by sweep) |
| 3 | Heading hierarchy on ready render | Exactly one `h1` per page; pre-existing `h3` section headings unchanged (gap accepted for this ticket, deeper outline refactor separate) |
| 4 | Focus behavior | Load-effect focus lands on the (now h1) title; no visible focus ring for pointer/programmatic focus (`:focus-visible` discipline already in place) |
| 5 | programs-d1 Playwright gate vs local wrangler dev + fresh seeds | 0 failed across phone-320/phone-390/desktop (retry per documented flake class) |
| 6 | typecheck + oxlint on touched files | Clean |
