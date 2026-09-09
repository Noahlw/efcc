# ADR-0046 — AI-First UI Playground Delivery

- **Status:** Accepted
- **Decider:** Product/release owner
- **Date:** 2026-09-08
- **Related:** #505, T07–T36 / #512–#541, ADR-0045, ADR-0044, `DESIGN.md`, `TESTING.md`

## Context

ADR-0045 established the value of local isolated presentation rendering. T07–T09 confirmed that value through Storybook, deterministic synthetic state, the existing Screen Catalog and PSNs, T08 controls, and T09 surface, feedback, and overlay foundations.

The surrounding delivery architecture nevertheless coupled the development workspace, presentation registries, machine contracts, integration tests, and approval ceremony too tightly. It made routine visual work carry the context and maintenance cost of every possible backend state, while still requiring separate seams for domain, integration, device, and human truth.

## Decision

Keep Storybook as the current renderer, but define its architectural role as a tool-agnostic UI Playground. The Playground renders real production UI with deterministic synthetic state for visual development, isolated interaction, responsive checks, and material presentation states. It is not a second product runtime and does not replace domain or integration authority.

UI delivery follows an AI-first loop: RECON, DIAGNOSE, IMPLEMENT, PLAYGROUND, AI SELF-REVIEW, REPAIR, VERIFY, CANDIDATE READY, and OWNER SPOT-CHECK. Human review follows the candidate; it does not substitute for agent diagnosis and repair.

Every shipped screen retains an existing Screen Catalog entry and a representative baseline Story using production presentation. Every baseline Story passes W7. Additional Stories are added only for material design, layout, interaction, recovery, responsive, regression, or review risk. They are not an enumeration of all backend outcomes.

Existing T07–T09 PSNs, Stories, contracts, catalog entries, and Storybook/Vitest setup are grandfathered. Ordinary new Playground cases do not require PSN identity. A new PSN is promoted only when durable approval, contract, regression, or provenance reference needs it.

SCN/RouteScenario is reserved for durable real-app integration scenarios. UIContract/CTR is reserved for promoted shared, repeated, broad-blast-radius, high-risk, machine-verifiable invariants. Neither is a universal presentation registry.

Real-app Playwright proves selective integration truth: routing, authentication/session, navigation/history, shell integration, Worker/D1 projection, critical mutations, and integration recovery. Worker/domain tests own backend and authorization truth. Camera, touch, safe area, virtual keyboard, assistive technology, and native print use a truthful device/platform or human seam.

Review is change-risk based. L1 is agent delivery plus a mandatory owner Storybook spot-check. L2 is used for a new reusable precedent, consequential workflow redesign, broad presentation blast radius, genuine unresolved design ambiguity, or material task-model/responsive change. L3 is used for real platform, device, or assistive-technology truth. Formal approval is primarily route-family or checkpoint evidence.

## Consequences

- The useful isolated rendering proven by T07–T09 remains available without requiring a custom UI Lab or a universal registry.
- Every shipped screen still has a directly reviewable, responsive baseline.
- Additional presentation work is cheaper and more focused; durable identities and contracts are created only when they earn their maintenance cost.
- Presentation, real-app, domain, platform, and human evidence remain separate and must not be inferred from one another.
- Existing T07–T09 assets remain valid and require no migration.
- Major visual changes should include useful before/after or representative phone, desktop, or risky-state images when available; live Storybook remains the primary visual review surface.

## Alternatives considered

### Keep ADR-0045 unchanged

Rejected. T07–T09 proved the renderer and baseline obligations, but keeping every registry and approval obligation as universal would preserve the coupling and recurring context cost that the rescue exposed.

### Build a custom UI Lab

Rejected. A bespoke workshop would duplicate mature Storybook capabilities and create another runtime, navigation model, fixture boundary, and maintenance surface.

### Remove Storybook entirely

Rejected. The isolated production renderer is valuable for deterministic visual iteration, material-state review, and W7 presentation checks. Removing it would push cheap visual work into expensive integrated environments.

### Retain Storybook as the current renderer and simplify around it

Accepted. This keeps the proven T07–T09 investment while making the Playground role, promotion rules, evidence seams, and review escalation proportional to risk.

## Migration and compatibility

No T07–T09 migration is required. Future tickets update existing catalog entries and PSNs where applicable, establish a baseline Story before implementation is green, and promote additional identities or contracts only when their durable value is demonstrated. ADR-0045 remains historical rationale for the original local renderer decision; this ADR supersedes its delivery architecture.
