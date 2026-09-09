# EFCC UI Control Recovery — UI Governance Authority

**Status:** Active operating authority for app-facing UI work
**Owner:** Product owner / release owner  
**Parent:** [#505](https://github.com/Noahlw/efcc/issues/505)  
**Decision record:** [ADR-0046](../adr/0046-ai-first-ui-playground-delivery.md)
**Companion tracker:** [`ui-control-recovery-plan.md`](ui-control-recovery-plan.md)

This document is current law for UI ownership, styling, delivery, evidence, review, and scope. Domain specifications, active domain ADRs, `CONTEXT.md`, executable contracts, and human decisions retain the authority assigned to them below.

## 1. Authority precedence

1. **Domain authority:** active domain ADRs/specs and [`CONTEXT.md`](../../CONTEXT.md) own domain language, permissions, server authority, mutations, workflow outcomes, and data invariants. UI visibility never overrides them.
2. **Human visual authority:** [`DESIGN.md`](../../DESIGN.md) and accepted design ADRs own Civic Minimal visual intent, product language, hierarchy, density, and balance.
3. **UI governance:** this document owns UI ownership layers, styling policy, contract-change control, waiver policy, review boundaries, and rescue scope discipline.
4. **Global runtime authority:** [`web/app/globals.css`](../../web/app/globals.css) owns runtime tokens and only approved document, shell/platform, reduced-motion, safe-area, and irreducible print rules.
5. **Primitive authority:** [`web/components/ui/`](../../web/components/ui/) owns local shadcn/Radix accessible mechanics and stable semantic APIs.
6. **Pattern authority:** approved EFCC patterns own repeated product geometry, composition, and state presentation without owning domain fetching, permission decisions, or mutations.
7. **Route authority:** routes own domain content, route state, domain-specific arrangement, and calls to domain adapters.
8. **Testing authority:** [`TESTING.md`](../../TESTING.md) and accepted testing ADRs own test-layer boundaries, seam selection, isolation, local/CI routing, failure evidence, and promotion composition.
9. **Executable evidence:** a promoted SCN or CTR owns only the machine-checkable expectation within its declared scope. It cannot silently change a higher authority.

If authorities conflict, stop at the scoped question and obtain an owner-approved decision. A screenshot, prototype, generated report, isolated passing test, or third-party comment cannot override an active authority.

## 2. Canonical styling stack

- Use Tailwind utilities for ordinary route and pattern layout/visual rules.
- Use CVA for typed, repeated semantic axes such as intent, size, state, and emphasis.
- Use local shadcn/Radix primitives for equivalent accessible controls and overlay mechanics.
- Use `cn()` for class composition and caller-provided merging according to the primitive API.
- Use tokens/custom properties for repeated product decisions and runtime values.
- Use narrow layered global CSS only for the Global layer below.
- Use native controls/APIs where platform or domain semantics require them, and record the reason in the owning authority or component inventory.

Do not introduce a parallel styling runtime, permanent compatibility styling, route-wide global selectors, ordinary inline visual declarations, a reintroduced CSS Module island, or `!important` as routine containment.

## 3. Ownership layers

### Global

Global CSS owns tokens, document/base behavior, shell chrome, safe-area/platform behavior, reduced motion, and irreducible print behavior. It does not own route-specific selectors or silently outrank utilities, primitives, or patterns. New global rules require a narrow selector, an owner, a layer rationale, and regression proof.

### Primitive

A primitive owns accessible mechanics and its stable typed API: roles, keyboard behavior, focus, disabled/busy/invalid states, target minimums, overlays, and semantic variants. It does not fetch domain data, decide permissions, parse route URLs, or encode one page's arrangement. Extend an existing primitive/variant before creating an equivalent control.

### EFCC pattern

A pattern owns repeated product geometry and composition: page frames, route headers, section stacks, surfaces, form groups, action groups, status/feedback, list groups/rows, and materially distinct loading/empty/error arrangements. Patterns may receive domain projections and callbacks, but do not own queries, authorization, mutations, or route policy. Repeated meaningful callers must earn a pattern.

### Route

A route owns domain content, route state, domain-specific arrangement, and adapter calls. It composes approved primitives and patterns, and does not patch properties owned by a lower layer merely to win source order. A repeated route override is evidence to promote the real distinction, not permission to add another patch.

The import direction is `global → primitive → EFCC pattern → route`; lower layers never import feature routes or route-owned domain modules.

## 4. Composition and CVA

CVA represents stable semantic axes. Composition represents arrangement.

- A CVA variant requires a named, repeated product distinction with observable semantic value.
- Page grids, route spacing, and one-off breakpoint arrangements remain composition, not blanket CVA variants.
- A one-caller exception remains caller-local until another meaningful caller proves a pattern or semantic variant.
- Caller overrides are contract-discovery evidence. They are not a reason to accumulate source-order overrides.

## 5. Ordinary changes and Contract Changes

An implementation agent may repair behavior within an approved contract. Without owner approval, the agent must not lower an expectation, widen a tolerance, replace a baseline, add a skip/allowlist/suppression, create or extend a waiver, remove coverage, change a token/pattern API, alter a promoted SCN or CTR, change a native-exception reason, or change routes, domain authority, schema/API semantics, permissions, or workflow outcomes to solve presentation.

A **CONTRACT CHANGE** is a proposed change to a token, primitive semantic API, pattern contract, promoted SCN/CTR, tolerance, baseline, coverage disposition, native exception, waiver, or approval requirement. Before implementation it records exact scope, current and proposed expectation, product/domain/design reason, preservation impact and callers, replacement proof, rollback checkpoint, and removal condition where temporary. The owner approval is part of the change record.

Exploratory Playground Stories and synthetic fixtures may evolve freely until referenced by a promoted contract, durable regression, approval, or provenance record. Replacing a referenced PSN or Screen Catalog baseline is a Contract Change.

## 6. Waivers

A waiver is an exact, temporary exception and never a passing result. It names the rule, route/state, viewport/browser, affected file, human owner, expiry, removal condition, follow-up ticket, and preserved failing evidence. An expired, ownerless, broad, or condition-free waiver fails validation. A waiver cannot authorize data access, weaken domain authority, or hide runtime failure.

For `RULE-NO-UNLAYERED-HIGH-BLAST-RADIUS-CSS`, the waiver also names one repo-relative file and the SHA-256 fingerprint of the normalized selector/declaration block. Whitespace-only formatting does not change the fingerprint; a material selector/declaration change does. The temporary T03 global-CSS debt waivers remain owned for removal by T06/#511.

## 7. UI Playground and shipped-screen baseline

The UI Playground is the architectural role for focused presentation work. Storybook is the current renderer. It uses real production presentation code with deterministic synthetic state, HMR/direct locators, and boundary adapters where necessary. It is development/test tooling, not a product route, authorization source, domain source, or second implementation.

Every active meaningful shipped screen has:

- its existing Screen Catalog entry;
- one representative baseline Story using real production UI; and
- a baseline that passes the existing W7 responsive gate.

The catalog is a thin shipped-screen completeness list. It does not enumerate every backend outcome or duplicate Story fixtures, args, contracts, viewport matrices, or approval decisions. Route count is not screen count. A Screen Catalog Gap requires the exact screen, technical cause, disproportionate-cost rationale, impact, owner/follow-up, and reconciliation boundary; a fake replacement Story is not acceptable.

Add a material Story only when separately seeing that state improves design, layout, interaction, recovery, responsive, regression, or human review. Existing T07–T09 Stories, PSNs, controls, contracts, and catalog entries are grandfathered. Ordinary new cases do not require PSN identity; promote one only for durable approval, contract, regression, or provenance reference.

Storybook fixtures are deterministic and synthetic. They contain no production/member-derived records, secrets, auth tokens, API keys, or production identifiers. Production may not import Storybook Stories, fixtures, handlers, or Storybook-only adapters. Historical prototypes remain evidence/provenance and do not become production presentation authority.

## 8. Delivery and review

Each presentation-affecting ticket follows:

1. **RECON:** inspect rendered UI, production paths, authorities, catalog/baseline, and known findings.
2. **DIAGNOSE:** state concrete in-scope defects, preserved behavior, exclusions, and review risk.
3. **IMPLEMENT:** make the smallest coherent production change.
4. **PLAYGROUND:** inspect the production result in the baseline and material states.
5. **AI SELF-REVIEW:** compare against the task and contracts across required widths.
6. **REPAIR:** fix obvious in-scope defects before declaring green.
7. **VERIFY:** run focused and required integrated checks at truthful seams.
8. **CANDIDATE READY:** publish the direct baseline locator, focused evidence, and remaining risk.
9. **OWNER SPOT-CHECK:** the owner checks the live Storybook result for every user-facing UI ticket.

Review escalation is based on the change:

- **L1:** normal agent-owned implementation plus the mandatory owner Storybook spot-check.
- **L2:** a new reusable precedent, consequential workflow redesign, broad presentation blast radius, genuine unresolved design ambiguity, or material task-model/responsive transformation.
- **L3:** real platform/device/assistive-technology truth, including camera, touch, safe area, virtual keyboard, VoiceOver/NVDA, or native print.

Formal approval is primarily route-family or checkpoint evidence and does not replace an individual ticket's owner spot-check. Live Storybook is the primary visual review surface. Major visual changes should strongly prefer useful before/after or representative phone/desktop/risky-state images; minor polish does not require screenshot ceremony.

## 9. Testing and evidence boundaries

- Storybook/Vitest owns isolated deterministic rendering, local interaction, cheap accessibility, baseline Story/W7 checks, material presentation states, and promoted browser/presentation contracts at the cheapest truthful seam.
- Real-app Playwright owns routing, authentication/session, navigation/history, shell integration, Worker/D1 projection, critical mutations, and integration recovery. It does not replay all Playground presentation cases.
- Worker/domain tests own authorization, persistence, validation, mutations, audit/idempotency, and domain projections.
- Device/platform/human checks own truths a renderer cannot provide: camera, touch/safe area, virtual keyboard, assistive technology, preference/zoom, native print, and subjective design judgment.
- Cross-browser scope is risk-proportional: routine focused work uses Chromium; browser-sensitive or broad-blast-radius work adds impacted Firefox/WebKit; family and release checkpoints use their required supported matrix.

Headless DOM geometry cannot claim keyboard-only, screen-reader, real-device, camera, print-preview, reduced-motion, forced-colors, zoom, reflow, or text-spacing approval. Agents cannot claim human/device evidence they did not perform.

## 10. Stacked delivery and blocking

Ordinary tickets use one issue, branch/worktree, owning commit, and PR. A child starts only when its logical blockers and selected immediate parent are present in stack ancestry as `STACK_GREEN` or `MERGED_RESCUE`. `STACK_GREEN` means implementation, required tests, focused Standards/Spec review, ticket-isolated diff, and safe child base are green; it does not mean human approval, merge, or completion.

Use dependency-aware blocking. An unapproved decision blocks only work that inherits it. No global visual-slice quota is used. At a phase boundary, required review/approval and parent-first merge must be complete. When a lower PR changes, fix the earliest owner, restack descendants, rerun affected verification/review, and invalidate affected human approval.

T07/#512 remains the grandfathered shared-PR exception with child issue, commit, evidence, and rollback boundaries; T08–T12 use ordinary ticket-isolated stacking. T12/#517 owns the SALVAGE STACK versus SELECTIVE REPLAY checkpoint before broad route-family work, using preservation, ownership, composability, regression confidence, code lineage, rollback/reviewability, and evidence.

## 11. Rescue scope

Preserve URLs, route intent, domain ownership, permissions, mutations, workflow outcomes, server authority, accessibility semantics, user-facing language, and the post-main S4 lineage recorded by the [Preservation Ledger](ui-control-recovery-preservation-ledger.md), unless a separately audited correctness defect requires change. Presentation, hierarchy, spacing, density, primitive defaults, pattern composition, responsive layout, and state presentation may change within these ownership and review rules.

Do not rebrand, import Discord assets/concepts, create generic Form/DataTable/CRUD/Task/page-builder/authorization/styling frameworks, decide the T12 rescue path outside #517, modify historical S4 PRs, or treat historical prototypes and compatibility paths as shipped-product authority. Do not mix UI rescue with unrelated backend, schema, feature, lint, or data work.

## 12. Change checklist

Before opening a UI PR, record the owning layer, affected routes/states/scenarios, ordinary versus Contract Change classification, preservation/caller impact, truthful focused and aggregate evidence, rollback checkpoint, any exact waiver, and confirmation that no unrelated work is mixed in. The tracker records progress and dependencies; it is not a second architecture specification.
