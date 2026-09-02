# EFCC UI Control Recovery — UI Governance Authority

**Status:** Active operating authority for the UI rescue  
**Owner:** Product owner / release owner  
**Parent:** [#505](https://github.com/Noahlw/efcc/issues/505)  
**Introduced by:** T02 / [#507](https://github.com/Noahlw/efcc/issues/507)  
**Companion tracker:** [`ui-control-recovery-plan.md`](ui-control-recovery-plan.md)

This document is the persistent operating law for app-facing UI work during and after the EFCC UI Control Recovery. It governs ownership, change control, evidence, and scope. It does not replace domain specifications, accepted ADRs, executable contracts, or owner visual approval, and it does not alter production behavior.

## 1. Authority precedence

A document or artifact owns only the decisions assigned to it below:

1. **Domain authority:** active domain ADRs/specs and [`CONTEXT.md`](../../CONTEXT.md) own domain language, permissions, server authority, mutations, workflow outcomes, and data invariants. UI visibility or labels never override them.
2. **UI governance:** this document owns UI ownership layers, styling syntax policy, contract-change control, waiver policy, approval boundaries, and rescue scope discipline.
3. **Human visual authority:** [`DESIGN.md`](../../DESIGN.md) and accepted design ADRs own Civic Minimal visual intent, product language, hierarchy, density, and balance.
4. **Runtime token/global boundary:** [`web/app/globals.css`](../../web/app/globals.css) owns runtime token values and only the approved document, shell/platform, reduced-motion, safe-area, and irreducible print rules.
5. **Primitive authority:** [`web/components/ui/`](../../web/components/ui/) owns local shadcn/Radix accessible mechanics and its typed semantic API.
6. **Product-pattern authority:** approved EFCC patterns own repeated product geometry, composition, and state presentation without owning domain fetching, permission decisions, or mutations.
7. **Route authority:** routes own domain content, route state, domain-specific arrangement, and calls to domain adapters. Routes do not redefine shared primitive or pattern ownership.
8. **Executable contract authority:** approved Scenario and UI Contract registries, once introduced by T03+, own machine-checkable expectations within their declared scope. They cannot silently change this governance or a domain/design authority.
9. **Inventory/evidence authority:** [`web/COMPONENT_INVENTORY.md`](../../web/COMPONENT_INVENTORY.md) records adoption and documented native exceptions; approval packages and human evidence record owner decisions, not implementation-agent decisions.

If two authorities appear to contradict, the lower authority does not guess or silently override the higher one. The implementation stops at a scoped contract question, records the conflict, and obtains an owner-approved decision. A screenshot, prototype, audit, generated metadata file, issue comment from a third party, or passing isolated test is not permission to override an active authority.

## 2. Canonical styling stack

Use one product styling stack:

- **Tailwind utilities** for ordinary route and pattern layout/visual rules.
- **CVA** for typed, repeated semantic axes such as intent, size, state, emphasis, or other real product distinctions.
- **Local shadcn/Radix primitives** for equivalent accessible controls and overlay mechanics.
- **`cn()`** for class composition and caller-provided class merging according to the primitive API.
- **Tokens/custom properties** for repeated product decisions and runtime values.
- **Narrow layered global CSS** only for the Global ownership layer in §3.
- **Documented native controls/APIs** only where platform, device, or domain semantics require them; the reason belongs in the component inventory or owning authority.

Do not introduce a parallel styling runtime, permanent compatibility styling, a route-wide global selector, ordinary inline visual declarations, a reintroduced CSS Module island, or `!important` as routine containment.

## 3. Four ownership layers

### Global

Global CSS may own tokens, document/base behavior, shell chrome, safe-area/platform behavior, reduced motion, and irreducible print behavior. It must not own route-specific selectors or silently outrank utilities, primitives, or patterns. New global rules require an explicit owner, narrow selector boundary, layer rationale, and regression proof.

### Primitive

A primitive owns accessible mechanics and its stable typed API: roles, keyboard behavior, focus, disabled/busy/invalid states, target minimums, overlays, and semantic variants. A primitive does not fetch domain data, decide permissions, parse route URLs, or encode one caller's page arrangement. Extend an existing primitive/variant before creating an equivalent control.

### EFCC pattern

A pattern owns repeated product geometry and composition: page frames, route headers, section stacks, surfaces, form groups, action groups, status/feedback, list groups/rows, loading/empty/error states, and related repeated arrangements. Patterns may receive domain projections and callbacks, but do not own domain queries, authorization, mutations, or route-specific policy. A pattern must earn its existence through repeated meaningful callers.

### Route

A route owns domain content, route state, domain-specific arrangement, and adapter calls. It may compose approved primitives and patterns. It must not patch properties owned by a primitive/pattern/global layer merely to win source order. A repeated route override is a design-system signal: promote the real distinction into an approved pattern or semantic contract rather than adding another local patch.

The import direction is `global → primitive → EFCC pattern → route`. Lower layers never import feature routes or route-owned domain modules.

## 4. CVA and composition rules

CVA owns stable semantic axes. Composition owns arrangement.

- A CVA variant requires a real, named, repeated product distinction with observable semantic value.
- `intent`, `size`, `state`, and `emphasis` are examples of semantic axes; they are not a license to encode arbitrary page grids, route spacing, or one-off breakpoint arrangements.
- Patterns and routes compose primitives and patterns with Tailwind utilities for ordinary layout.
- A one-caller layout exception remains caller-local until a second meaningful caller proves a pattern or semantic variant is warranted.
- Do not add a blanket rule that every layout variant must use CVA. That rule is rejected by this authority.
- Caller overrides of an owned property are evidence for contract discovery and review, not an invitation to accumulate overrides.

## 5. Ordinary implementation change control

An ordinary implementation agent may repair behavior within an approved contract, but may not lower the contract to make the repair pass. Without a prior owner-approved Contract Change, an implementation agent must not:

- lower an approved expectation or widen a tolerance;
- update, replace, or delete a baseline;
- add a skip, allowlist, or broad suppression;
- create, extend, or renew a waiver;
- remove coverage, scenarios, probes, or failure artifacts;
- change a contract, scenario disposition, token, pattern API, or native exception reason;
- use `!important`, source-order tricks, or a broad local override as routine containment;
- change the route graph, domain authority, schema/API semantics, permissions, or workflow outcome to solve a presentation problem.

A failing contract is a signal to correct the owning layer or raise a Contract Change. Test edits must make the intended observable behavior more truthful; they must not conceal a product or infrastructure failure.

## 6. Contract Change

A **CONTRACT CHANGE** is any proposed change to a token, pattern, primitive semantic API, UI contract, Scenario Registry entry, tolerance, baseline, coverage disposition, native exception, waiver, or approval requirement. It is not ordinary implementation work.

Before implementation, a Contract Change requires explicit owner approval recorded with:

1. the exact scope and affected routes/states/viewports/browsers;
2. the current expectation and proposed expectation;
3. the product/domain/design reason;
4. the preservation impact and migration callers;
5. the replacement proof and rollback checkpoint;
6. the removal condition when the change is temporary.

The approval artifact is part of the change. A code review, passing test, screenshot, or agent assertion cannot substitute for owner approval. Contract changes must be kept separate from unrelated feature, backend, schema, lint, or data work.

## 7. Waivers

A waiver is an explicit temporary exception, not a passing result. Every waiver must be:

- exact-scope, naming the rule, route/state, viewport/browser, and affected files;
- owned by a named human owner;
- time-bounded with an expiry;
- linked to a removal condition and follow-up ticket;
- recorded alongside the preserved failing evidence.

An expired, missing-owner, over-broad, or condition-free waiver fails validation. A critical release blocker cannot be converted into a passing outcome by waiver. A waiver cannot authorize production data access, weaken domain authority, or conceal a Worker/runtime failure.

## 8. Approval and evidence discipline

- At most **one unapproved visual slice** may be in flight across the rescue.
- A visual rescue PR changes only its declared UI slice and its required evidence; unrelated backend, schema, feature, lint-cleanup, or data work is out of scope.
- Screenshots, prototypes, HTML audits, numeric geometry, and generated reports are evidence inputs. They do not become approved visual baselines without owner approval tied to a commit, scenario, viewport, browser, and artifact.
- Headless DOM geometry does not claim keyboard-only, screen-reader, real-device, camera, native print-preview, reduced-motion, forced-colors, zoom, reflow, or text-spacing approval.
- An implementation agent cannot self-approve a human visual, accessibility, device, or contract gate.
- Failures must retain the first causal result and relevant route/state/viewport/browser context; later clean retries do not erase stale-fixture or infrastructure failures.

## 9. Rescue scope and preservation

The rescue preserves URLs, route intent, domain ownership, permissions, mutations, workflow outcomes, server authority, accessibility semantics, and the full post-main S4 implementation lineage recorded by the [Preservation Ledger](ui-control-recovery-preservation-ledger.md) — including pre-#473 S4 implementation/hardening and the later #473 + Phase A–F evolution (#457 → #458 → #469 → #470 → #471 → #472 → #473 → #496 → #497 → #501 → #502 → #503 → #504 → frozen Phase F) — unless a separately audited correctness defect requires change. Presentation, hierarchy, spacing, density, primitive defaults, pattern composition, responsive layout, and state presentation may change only through the ownership and approval rules above.

Do not:

- redesign routes or information architecture under a styling ticket;
- import Discord branding, colors, proprietary assets, or domain concepts;
- create a generic Form, DataTable, CRUD, Task, page-builder, plugin, authorization, or styling framework;
- decide `SALVAGE STACK` versus `SELECTIVE REPLAY` (T12 / #517 owns that decision);
- modify historical S4 PRs or declare them superseded before the approved promotion/supersession gate;
- treat the UI Lab, prototype, historical evidence, or a temporary compatibility path as shipped product.

## 10. Change checklist

Before opening a UI PR, the agent records:

- owning layer and existing owner searched;
- affected route/state/scenario scope;
- whether the change is ordinary implementation or a CONTRACT CHANGE;
- preservation impact and caller migration;
- required focused/aggregate evidence and truthful status labels;
- rollback checkpoint and any exact-scope waiver;
- confirmation that no unrelated backend/schema/feature/lint work is mixed in.

The tracker records the active ticket and evidence. T03+ machine enforcement validates registries and source rules; it does not grant permission to weaken this authority.
