# S2 Participant Visual Parity Implementation Plan

> **For OMP workers:** The first phase is read-only reconnaissance. No production UI edit is allowed until the consolidated direction is reviewed and approved. Steps use checkbox syntax for tracking.

**Goal:** Make the six S2 participant Sections production-ready by comparing the live implementation against the authoritative participant design exports, then applying only approved, evidence-backed visual and interaction changes.

**Architecture:** Keep the current `88b96af` application behavior, Worker/D1 contracts, Shared Shell, and existing design tokens as the baseline. Treat each exported participant HTML file as visual truth for its corresponding Section, but preserve live React data binding, authorization, and route contracts. Resolve cross-screen navigation as a separate interaction contract rather than hiding it inside CSS polish.

**Tech Stack:** Next.js client components, CSS Modules, existing `globals.css` tokens, local Cloudflare `wrangler dev`, local D1 E2E fixtures, Playwright/browser screenshots, static participant HTML exports.

## Global Constraints

- Baseline is commit `88b96afa`; polish work is isolated on `feat/391-polish-on-88b96af`.
- `design_export/participant/*.html` is the visual authority; `AUTHORITY-AND-PROVENANCE.md` and `design_export/README.md` govern provenance and exclusions.
- The product is Cantonese-first. Use the existing EFCC ubiquitous language: Section, Shared Shell, Home, Program/課程, Program Detail/課程詳情, Event/聚會, Enrollment/報名, Enrollment Request/報名申請, Notices Section/通知功能區.
- Preserve server authorization. UI visibility is an affordance only; it must not become a new authorization rule.
- Reuse existing semantic tokens in `web/app/globals.css`; add a token only when a missing semantic value is demonstrated. Do not introduce literal color/spacing drift.
- Phone-first breakpoint is `800px`; verify `320x844`, `375x844`, `390x844`, and `414x844`. Also smoke `800x900` and `1440x900` for Shared Shell regressions.
- Every interactive target remains at least `44x44px`; action groups must not create ugly accidental wrapping. Prefer one-row intrinsic sizing, overflow scrolling, or deliberate stacked layout with a designed breakpoint.
- Acceptance includes `document.documentElement.scrollWidth <= window.innerWidth` on phone captures.
- Do not copy prototype-only `示範資料`, scenario switchers, offline simulation toggles, persona links, or dead-route screens.
- Review artifacts must record exact live URL/query, fixture state, viewport, repro steps, source file/line, severity, and a concrete fix direction.
- Read-only review agents must not submit, withdraw, cancel, approve, mutate enrollment, or alter D1 state.

## File Structure & Changes

### Review targets (first pass; no production edits)

- `web/app/home/page.tsx` + `web/app/home/home.module.css` — Home Section and Home Explore/featured Program entry point; compare with `participant/home.html`.
- `web/app/programs/page.tsx`, `web/lib/programs/programs-boundary.tsx`, `web/lib/programs/participant-directory.tsx`, `web/app/programs/programs.module.css` — Programs catalog; compare with `participant/programs.html`.
- `web/lib/programs/participant-program-detail.tsx`, `web/lib/programs/participant-enrollment.tsx`, `web/app/programs/programs.module.css` — Program Detail and Enrollment states; compare with `participant/program-detail.html`.
- `web/lib/programs/participant-event-detail-page.tsx`, `web/lib/programs/event-detail.tsx`, `web/app/programs/programs.module.css` — Event Detail; compare with `participant/event-detail.html`.
- `web/app/notices/page.tsx`, `web/lib/notices-panel.tsx`, `web/lib/notices-panel.module.css` — Notices Section; compare with `participant/notices.html`.
- `web/app/messages/page.tsx`, `web/lib/messages-panel.tsx`, `web/lib/notices-panel.module.css` — Messages list and Message Detail; compare with `participant/messages.html` and `participant/message-detail.html`.
- Cross-cutting candidates: `web/lib/app-shell.tsx`, `web/lib/shell-header.tsx`, `web/lib/nav-bar.tsx`, `web/app/globals.css`, and shared copy only when a finding demonstrates a cross-Section defect.

### Durable artifacts

- `.impeccable/phase-391/reviews/<screen>.md` — one evidence-backed review per Section.
- `.impeccable/phase-391/harden/<screen>-<state>.html` — check-only side-by-side harden prototypes for proposed edge states; these are review artifacts, not production implementation.
- `.impeccable/phase-391/consolidated-direction.md` — prioritized design direction and decision gate before implementation.
- `CONTEXT.md` — add the approved ubiquitous-language entries for **Home Explore** and **Origin-aware Back Navigation** only after the consolidated route decision is written.
- `docs/adr/00xx-origin-aware-detail-navigation.md` — add only after the existing production URL/state contract is checked against the implementation and the decision is confirmed in the consolidated direction.

## What Already Exists

- S2 behavior and tests are already implemented on `88b96afa`; this phase is not a greenfield feature build.
- The Shared Shell owns responsive navigation and active Section indication; do not create a second shell per screen.
- `participant/*.html` exports are self-contained, generated from the accepted prototype logic, rendered at `390px`, and include their own Shared Shell markup and exact inline visual values.
- Existing `.impeccable/critique/` reports and `audit-s2-participant.md` are historical inputs, not a substitute for a fresh live-server comparison on the frozen baseline.
- Local verification uses `wrangler dev` on `127.0.0.1:8787` with disposable `E2E_`/`E2E_DEMO_` fixtures only.

## Not In Scope

- Backend/API/schema changes, authorization-policy changes, or production Google Sheets/Apps Script mutation.
- Rebuilding the prototype router or adopting its `?screen=&mode=&program=` query contract.
- Broad redesign of management Sections, Scanner, Profile, Auth Surfaces, or pre-existing badge-color drift accepted under ADR-0033.
- Automatically implementing every harden suggestion. Harden is review-only until the user selects the cases.
- Pixel-perfect copying that breaks live data binding, accessibility, route semantics, or responsive behavior.

## Navigation Contract Under Review

Current prototype edge: Program Detail `課程` back returns to Programs. User-approved product direction: Detail back must be **origin-aware** across supported entry paths (Home Explore, Programs catalog, Notices → Program, Messages → Program, and other valid deep links), with a safe Programs fallback when origin is unavailable or invalid. The review must first identify the current production route mechanism and all callers before proposing the smallest implementation seam.

```text
Home Explore ─┐
Programs ─────┼─> Program Detail ──> Event Detail
Notices ──────┤          │                 │
Messages ─────┘          └─ action/state    └─ origin-aware return
                                      
Unknown/malformed origin ───────────────> Programs fallback
```

## Review Data and Verification Design

Each screen review must cover:

1. Live page at `390x844`, with a fresh browser context and a named local fixture state.
2. Authoritative export opened through a local static server or browser-safe URL; do not use an unsupported `file://` assumption.
3. Side-by-side or paired screenshots with visible viewport dimensions.
4. Exact repro steps for behavior defects, including the Home Explore → Program Detail → return example.
5. DOM/source evidence: component, symbol, and line range; no “looks wrong” without a location.
6. Responsive table for `320/375/390/414`; record action-group behavior, `scrollWidth`, clipping, and safe-area overlap.
7. Harden check-only candidates for empty, loading, error, permission, long-copy, and offline states relevant to that Section. Each candidate gets a separate static HTML comparison artifact and a recommendation, not an implementation.
8. Severity: P0 blocking, P1 release risk, P2 next pass, P3 polish.

## Parallelization / Worktree Strategy

- The implementation branch is isolated from `main` and the frozen S2 stack.
- Reconnaissance runs in two waves to avoid same-user session thrash and shared-D1 contamination:
  - **Wave 1:** Home, Programs catalog, Notices. Read-only, fresh browser contexts.
  - **Wave 2:** Program Detail, Event Detail, Messages. Reseed local fixtures between waves; no mutation actions.
- Agents may inspect in parallel within a wave but must not edit production files, run formatters, or run project-wide validation. A lead synthesis reviews all six reports before any implementation task.
- After user approval of the consolidated direction, implementation tasks are split by true file ownership and gated by a reviewer before the next task. The final verification runs once against the changed paths and the relevant local Playwright acceptance traces.

---

## Reconnaissance Tasks

### Task 1: Home Section review

**Reference:** `participant/home.html`

**Live targets:** `web/app/home/page.tsx`, `web/app/home/home.module.css`, Shared Shell only where evidence requires it.

**Acceptance:** Report the Home hierarchy, Home Explore card entry behavior, responsive action/button wrapping at four phone widths, and all P0–P3 findings with repro/source evidence. Include a harden candidate for empty/failed Home projection if the live implementation has no user-recoverable state.

### Task 2: Programs catalog review

**Reference:** `participant/programs.html`

**Live targets:** `web/app/programs/page.tsx`, `web/lib/programs/programs-boundary.tsx`, `web/lib/programs/participant-directory.tsx`, `web/app/programs/programs.module.css`.

**Acceptance:** Report catalog hierarchy, search/filter behavior, card/list density, empty/no-result state, and button/chip behavior at four phone widths. Identify whether the current Programs fallback is safe for invalid detail origins.

### Task 3: Program Detail review

**Reference:** `participant/program-detail.html`

**Live targets:** `web/lib/programs/participant-program-detail.tsx`, `web/lib/programs/participant-enrollment.tsx`, `web/app/programs/programs.module.css`.

**Acceptance:** Cover eligible, Pending, Active, cancelled/re-enrollment, and manager-only affordances without mutating data. Reproduce the origin-aware back defect from Home Explore if the live route allows it. Record sticky action bar behavior, schedule rows, CTA wrapping, and harden candidates.

### Task 4: Event Detail review

**Reference:** `participant/event-detail.html`

**Live targets:** `web/lib/programs/participant-event-detail-page.tsx`, `web/lib/programs/event-detail.tsx`, `web/app/programs/programs.module.css`.

**Acceptance:** Cover open and closed Event states, enrollment/management visibility, return targets, CTA hierarchy, instruction copy, and phone-width overflow. Include harden candidates for unavailable Event, stale deep link, and offline fetch.

### Task 5: Notices Section review

**Reference:** `participant/notices.html`

**Live targets:** `web/app/notices/page.tsx`, `web/lib/notices-panel.tsx`, `web/lib/notices-panel.module.css`.

**Acceptance:** Cover unread/read hierarchy, relative timestamp wrapping, deep-link origin propagation, empty/loading/error states, and four-width behavior. Confirm notice-driven Program/Event return context is explicit and recoverable.

### Task 6: Messages Section review

**References:** `participant/messages.html`, `participant/message-detail.html`

**Live targets:** `web/app/messages/page.tsx`, `web/lib/messages-panel.tsx`, `web/lib/notices-panel.module.css`, Shared Shell only where needed.

**Acceptance:** Cover list/detail hierarchy, row affordance, long title/body, empty/error/loading states, return behavior, and four-width button/action layout. Flag the known distinction between Messages visual reference and the prototype's originally absent source.

## Implementation Gate

Do not start implementation when a review only says “polish it.” The consolidated direction must name the selected findings, target files/symbols, visual rule to preserve, responsive rule, route/state contract, and the observable acceptance check for each change. After approval, implementation uses the smallest existing seam and leaves a regression test only for a new observable behavior (such as origin-aware back navigation).
