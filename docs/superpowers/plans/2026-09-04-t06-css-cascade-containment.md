# T06 CSS Cascade Containment Implementation Plan

> **Current execution status (2026-09-05):** T05 replacement PR #565 is now merged into `rescue/ui-control-recovery` at `199b54e086bfae5faff1cd4fabd42c09353087da`. The earlier provisional T05-blocked wording below is historical procedure; T06 may now complete its own finite validation. B-003 remains an open, separately reported rescue-development risk and is not a claim that the runtime fault is fixed. T06 still requires its own CSS, browser, governance, source, and review gates, and this plan does not authorize T07, production release, or a merge to `main`.

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. <!-- Note: subagent-driven-development and executing-plans skills are not available -->

**Goal:** Remove the universal global spacing collision, assign every remaining broad base rule explicit Tailwind cascade ownership, and prove the preserved EFCC surfaces retain usable geometry.

**Architecture:** Keep `web/app/globals.css` as the shell/document token owner, but place document-wide base selectors in Tailwind's `base` layer so utilities can compose above them. Remove the temporary T03 waivers for those six rules and keep governance as the static regression guard. Add numeric computed-style canaries to the existing real-browser `live-ui` suite so the same disposable fixtures cover Programs, Management Hub, Profile, and Account Settings at mobile and desktop widths.

**Tech Stack:** Tailwind CSS v4, Next.js static export, React, TypeScript, Playwright, Vitest, and the existing EFCC governance registries.

The same-fixture before/after record is [`docs/qa/2026-09-05-t06-cascade-before-after.json`](../../docs/qa/2026-09-05-t06-cascade-before-after.json): baseline `199b54e0` measured zero route/surface/input/search padding and only `38.953125px` phone scroll tail; T06 implementation `774ea020` measured positive values, Programs center delta `0`, and `115.640625px` phone scroll tail. The live-ui report remains at `tests/e2e/test-results/live-ui-results.json`.

## Qualification trace

- **Authority read before qualification:** #511 acceptance criteria, #505 owner-approved T05 qualification amendment, current #510 routing, `AGENTS.md`, `TESTING.md`, and this plan were read before the current T06 correction/review cycle.
- **Candidate boundary:** T06 implementation/evidence candidate `774ea0208412f4367ce1242169a686a37a1d4e04`; tracker/QA readback candidate `1ac80d4f479c4a8c4785f09fa76df45bc3fa6beb`.
- **Required evidence:** real Worker/D1 `live-ui` `2/2`; same-fixture before/after artifact; responsive `92`, shell geometry `28`, role-hierarchy geometry `49`; focused governance `105/105`; full/release governance, typecheck, precommit, and diff-check.
- **Review boundary:** final independent Standards/Spec review must pass before `STACK_GREEN`, ready status, or merge. Numeric browser evidence is not human visual approval.
- **Provenance note:** the original T06 plan and implementation history are preserved; this trace records the current qualification state and does not rewrite earlier commits.

## Global Constraints

- This is T06 / #511 containment only; do not start T07 or Phase 1.
- Preserve domain behavior, route contracts, token values, shell breakpoint behavior, overflow behavior, target sizes, focus behavior, and existing fixtures.
- Do not add `!important`, route-owned global selectors, broad local overrides, new production data behavior, or a CSS redesign.
- Remove the six active `WVR-T03-GLOBAL-*` waivers; an equivalent unlayered reset must fail governance.
- T05 / #565 is `MERGED_RESCUE` at `199b54e086bfae5faff1cd4fabd42c09353087da`; B-003 remains an independently reported open rescue-development risk. T06 cannot be `STACK_GREEN` or merged until its own CSS, browser, governance, source, and review gates pass.
- Use Tailwind v4's explicit `@layer base` ownership and rely on Tailwind Preflight where it already supplies the reset.

## File Structure & Changes

- Modify `web/app/globals.css`: layer document/base/focus rules, remove the authored universal margin/padding reset, and leave shell/platform ownership intact.
- Modify `web/lib/governance/registries.ts`: delete the six T03 global CSS waiver entries and leave all unrelated historical waivers unchanged.
- Modify `web/lib/governance/governance.test.ts`: assert the live stylesheet has no unlayered broad base debt and that the canonical registry cannot suppress a reintroduced equivalent reset.
- Modify `tests/e2e/live-ui.test.ts`: add numeric computed-style canaries using the existing authenticated fixtures, routes, and `phone-375x667` / `desktop-1280x720` projects.
- Modify `docs/implementation/ui-control-recovery-plan.md`: record the T06 implementation SHA, removed waiver IDs, before/after numeric evidence, and the T05-gated validation status.
- Create `docs/superpowers/plans/2026-09-04-t06-css-cascade-containment.md`: this execution plan and acceptance trace.

## What Already Exists

- Tailwind v4 is imported in `web/app/globals.css`; its documented order is `theme`, `base`, `components`, then `utilities`, so an explicit `@layer base` is the existing framework seam.
- T03 already detects unlayered broad selectors with exact source fingerprints and has tests for whitespace normalization, material changes, unrelated same-file rules, generic file waivers, and fail-closed affected mode.
- The six active global waivers are ledger-backed and each names T06 / #511 as removal owner.
- `tests/e2e/live-ui.test.ts` already authenticates with disposable Admin fixtures and runs real Worker-backed Profile and Account Settings flows at representative mobile and desktop widths.
- `tests/e2e/s4-management-hardening.test.ts` already proves Management Hub and shell geometry at pinned widths; reuse its selectors/contract vocabulary rather than duplicating management behavior.
- The existing Programs entry surface exposes `section[aria-labelledby="programs-title"]`; Management Hub exposes `section[aria-labelledby="management-hub-title"]`; Profile exposes `article[aria-labelledby="profile-qr-title"]`; Account Settings exposes forms labelled by `account-settings-username-title` and `account-settings-password-title`.

## Not In Scope

- No redesign of Programs, Management Hub, Profile, or Account Settings composition.
- No component migration, token change, spacing-scale change, route behavior change, API/Worker change, database change, or speculative ProxyWorker optimization.
- No replacement of the T05 shell-supervised runtime with a new test harness.
- No screenshots or visual approval claim; evidence is numeric computed-style/browser evidence only.

## ASCII Diagrams

CSS cascade:

```text
globals.css document/base rules
          │
          ├── @layer base  ───────────────┐
          │                               │ lower precedence
Tailwind Preflight / base                 │
          │                               ▼
component and route class utilities ── @layer utilities
          │
          ▼
computed padding/margin/alignment remains composable
```

Browser evidence flow:

```text
disposable Admin fixture
        │ real login/session
        ▼
Programs → Management Hub → Profile → Account Settings
        │             │          │              │
        └─────────────┴──────────┴──────────────┘
             computed-style + bounding-box canaries
             at 375×667 and 1280×720
```

## Failure Modes & Gaps

- If moving a rule into `@layer base` changes shell geometry, keep the narrowest explicit base ownership and use the existing shell classes for shell behavior; do not restore an unlayered broad selector.
- If Tailwind Preflight already owns a reset, delete the duplicate authored declaration rather than maintaining two competing resets.
- If the real Worker runtime cannot complete the browser suite because of B-003, retain the canary implementation and record final browser validation as T05-pending; do not weaken assertions or mark T06 green.
- Existing historical prototype and non-global waivers remain outside T06 scope; only the six `WVR-T03-GLOBAL-*` entries are removable in this ticket.

## Parallelization / Worktree Strategy

Run sequentially in `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/phase0-t06-20260904`. Governance tests and the stylesheet must move together because deleting waivers before assigning cascade ownership makes the repository intentionally fail. Browser canaries follow the CSS change so their red state is attributable to the universal reset and their green state is attributable to the containment. Tracker updates follow local verification and the two-axis review. T05 is merged; merge this branch only after its own gates and review pass.

---

### Task 1: Establish the T06 regression proof

**Files:**
- Modify: `web/lib/governance/governance.test.ts` in the existing `Exact CSS Source Fingerprint Waivers` / live-audit sections.
- Test data: the existing `historicalUniversalReset` fixture and canonical `WAIVER_REGISTRY`.

**Interfaces:**
- Consumes: `auditFileContent`, `auditSourceCode`, `WAIVER_REGISTRY`, and `HIGH_BLAST_CSS_RULE`.
- Produces: a failing regression assertion proving the live `globals.css` contains no active broad-rule debt and that a reintroduced equivalent reset is not waived by the canonical registry.

- [ ] **Step 1: Write failing governance tests.** Assert that `WAIVER_REGISTRY` contains zero IDs beginning with `WVR-T03-GLOBAL-`; audit a temporary `web/app/globals.css` containing the historical universal reset with the canonical registry and require one active `RULE-NO-UNLAYERED-HIGH-BLAST-RADIUS-CSS` violation; read the live stylesheet and require its broad audit result to contain zero active violations and zero T03 global waivers after containment.
- [ ] **Step 2: Run the focused tests to verify the red state.** Run `fnm exec --using 22.18.0 pnpm test:governance -- web/lib/governance/governance.test.ts` from the T06 worktree. Expected: FAIL because the baseline still has six active T03 global waivers and the unlayered reset.
- [ ] **Step 3: Commit the red-proof test only.** Commit message: `test(t06): prove global cascade debt must be removed`. Stage only `web/lib/governance/governance.test.ts`.

### Task 2: Assign explicit base ownership and remove T03 debt

**Files:**
- Modify: `web/app/globals.css` document/base/focus rules around the current `html`, `body`, universal reset, anchor, and focus selectors.
- Modify: `web/lib/governance/registries.ts` six `WVR-T03-GLOBAL-*` entries.

**Interfaces:**
- Consumes: Tailwind v4's `@layer base` cascade and the T03 exact-fingerprint policy.
- Produces: a stylesheet whose document/base behavior is explicit and whose canonical registry has no temporary T03 global waivers.

- [ ] **Step 1: Move legitimate broad rules into `@layer base`.** Give `html`, the `html, body` overflow boundary, `body`, `a`, and the focus-visible rule set explicit base-layer ownership. Preserve every current value and selector behavior except the competing universal spacing reset.
- [ ] **Step 2: Remove the universal authored margin/padding collision.** Delete the authored `* { padding: 0; margin: 0; }` reset; retain only behavior not already supplied by Tailwind Preflight if a computed-style check demonstrates it is necessary, and keep box-sizing behavior in explicit base ownership only when required.
- [ ] **Step 3: Delete only the six T03 global waivers.** Remove `WVR-T03-GLOBAL-HTML-HEIGHT`, `WVR-T03-GLOBAL-HTML-BODY-OVERFLOW`, `WVR-T03-GLOBAL-BODY-FLEX`, `WVR-T03-GLOBAL-UNIVERSAL-RESET`, `WVR-T03-GLOBAL-ANCHOR-BASE`, and `WVR-T03-GLOBAL-FOCUS-RINGS`. Do not touch prototype, native-control, CVA, or other historical waivers.
- [ ] **Step 4: Run focused governance tests and audit.** Run `fnm exec --using 22.18.0 pnpm test:governance`, `fnm exec --using 22.18.0 pnpm verify:governance:fast`, and `fnm exec --using 22.18.0 pnpm verify:governance:affected`. Expected: PASS with zero active broad global CSS violations, zero T03 global waivers, and the reintroduced-reset fixture failing closed.
- [ ] **Step 5: Commit the containment.** Commit message: `fix(t06): contain global CSS cascade`. Stage only `web/app/globals.css`, `web/lib/governance/registries.ts`, and the focused governance test if it was not committed in Task 1.

### Task 3: Add computed-style and geometry canaries

**Files:**
- Modify: `tests/e2e/live-ui.test.ts` near the existing authenticated Profile and Account Settings tests.

**Interfaces:**
- Consumes: existing `loginAs`, disposable Admin fixture, `Page`, `TestInfo`, current route selectors, and the two existing live-ui projects.
- Produces: numeric browser evidence and hard assertions for page gutter, surface/card padding, input/search leading clearance, Programs centering, and final-action clearance from the mobile shell dock.

- [ ] **Step 1: Write the canary test.** Authenticate once through the existing helper, visit `/programs`, `/management`, `/profile`, and `/profile/settings` with the same real Worker/session semantics, and use `getComputedStyle` plus `getBoundingClientRect` to assert: the route root has positive inline gutter; the identified Programs, Management Hub, Profile, and Account Settings surfaces have positive padding; the Account Settings input and any Management account search input have positive inline-start padding; the Programs surface is centered within one CSS pixel; and the final Profile action retains at least the existing mobile dock reserve below it on phone widths. Attach only numeric JSON evidence through `testInfo`.
- [ ] **Step 2: Run the canary against the configured local target.** Run `PROGRAMS_TARGET_URL=http://127.0.0.1:8788 AUTH_UI_TARGET_URL=http://127.0.0.1:8788 fnm exec --using 22.18.0 pnpm exec playwright test -c tests/e2e/live-ui.config.ts --grep "cascade|computed|geometry"` only when a disposable Worker is ready. Expected before the CSS fix: at least the surface/input padding assertion fails because the unlayered reset wins; do not treat a T05 ProxyWorker failure as a canary pass.
- [ ] **Step 3: Rerun after containment.** Expected: numeric canaries pass at both 375×667 and 1280×720 without changing route copy or domain state. If the Worker dies, preserve the report as pending T05 evidence.
- [ ] **Step 4: Commit the canaries.** Commit message: `test(t06): add cascade geometry canaries`. Stage `tests/e2e/live-ui.test.ts` and any numeric evidence helper changes only if strictly necessary; reuse existing helpers first.

### Task 4: Complete T06 gates and handoff

**Files:**
- Modify: `docs/implementation/ui-control-recovery-plan.md` T06 row, detailed ticket state, blocker ledger reference, and next-safe-action section.

**Interfaces:**
- Consumes: the final CSS diff, governance output, browser canary report, T05 blocker state, and exact commit SHAs.
- Produces: an internally consistent provisional T06 record that explicitly removes the waiver, records before/after numeric evidence, and records T05 as merged and leaves T06 final validation/merge gated by its own evidence.

- [ ] **Step 1: Run repository verification.** Run `fnm exec --using 22.18.0 pnpm verify:governance:full`, `fnm exec --using 22.18.0 pnpm verify:governance:release`, `fnm exec --using 22.18.0 pnpm typecheck`, `fnm exec --using 22.18.0 pnpm --dir web typecheck`, `fnm exec --using 22.18.0 pnpm verify:precommit`, and `git diff --check`. Run the focused live-ui canary when the required disposable Worker is available.
- [ ] **Step 2: Verify T06 scope and forbidden patterns.** Confirm no `!important` was added, no route-owned selector was added to `globals.css`, no unrelated waiver changed, all existing overflow/target-size/focus/shell tests remain green, and the production/domain diff is CSS ownership plus test evidence only.
- [ ] **Step 3: Run two-axis `/code-review` on the T06 incremental diff.** Review Standards and Spec against #511 and this plan. Fix actionable findings before handoff; call T06 `STACK_GREEN` only after T05 is `MERGED_RESCUE` and T06 gates pass.
- [ ] **Step 4: Update the tracker and stop.** Record the exact implementation SHA, removed waiver IDs, canary viewport/report paths, any T05-backed pending browser evidence, and the the current T06 qualification and merge status. Do not start T07 or Phase 1.

---
