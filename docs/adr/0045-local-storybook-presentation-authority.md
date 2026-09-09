# ADR-0045 — Local Storybook Presentation Authority

- **Status:** Accepted
- **Decider:** Product/release owner
- **Date:** 2026-09-05
- **Related:** #505, T07–T12 / #512–#517, ADR-0043, ADR-0044, `DESIGN.md`, `TESTING.md`

## Context

EFCC needs a direct, deterministic way to inspect and tune production UI without starting the full Worker/D1 application, authenticating, and navigating to every target state.

The original UI Control Recovery plan proposed a custom development/test-only UI Lab plus typed presentation scenarios. That would solve the immediate visibility problem, but it would also make EFCC responsible for maintaining a custom component workshop, scenario-navigation system, and presentation-state runtime.

The repository already has separate long-lived authorities for domain behavior, design-system ownership, RouteScenario browser integration, UI contracts, approval packages, Worker/D1 behavior, and human visual approval. Presentation tooling must complement those authorities rather than replace or duplicate them.

## Decision

EFCC adopts **local-only Storybook** as the canonical presentation workshop and full production presentation catalog.

A Storybook Story owns one deterministic presentation state.

A stable repo-owned `PSN-*` identifier names a presentation state independently of Storybook's generated URL/slug.

A thin governance-owned Screen Catalog records which meaningful shipped screens require a baseline Story. It does not duplicate Story args, fixtures, contracts, browser/viewport matrices, or approval decisions.

`RouteScenario` / `SCN-*` remains real-app/browser integration authority.

`UIContract` / `CTR-*` remains machine-rule authority.

`ApprovalPackage` / `APV-*` remains human approval authority and is extended additively where Story/PSN references are useful.

Storybook is a dev/test dependency only. Production runtime code never imports Storybook Stories, fixtures, handlers, or adapters.

Storybook uses production styling, tokens, fonts, local shadcn/Radix presentation, and real production presentation seams. Runtime-only dependencies may be adapted at the system boundary with deterministic synthetic fixtures, MSW, and routing/provider adapters.

Production/member-derived records, secrets, API keys, auth tokens, and production identifiers are prohibited in Storybook fixtures.

Presentation-affecting work is Storybook-first. Relevant deterministic Stories are established or updated early, then production integration and machine qualification continue.

The testing split is:

- Storybook + Vitest — isolated render, deterministic state, interaction, cheap accessibility;
- Playwright against Storybook — browser semantic/geometry/relational/responsive presentation contracts;
- real-app Playwright — routing, authentication/session, shell integration, selected critical journeys;
- Worker/D1 contracts — domain/backend behavior, authorization, persistence, mutation, audit/idempotency.

Broad deterministic presentation coverage does not require replaying every Story through real Worker/D1.

Human review is representative rather than a full Story × viewport cross-product. Routine Storybook review uses `390`, `799`, `800`, and `1440`; existing W7 machine authority remains intact.

Screenshot evidence is not universal machine authority. Pixel visual-regression baselines are promoted selectively when a surface is stable, deterministic, high-blast-radius, and costly to regress.

The historical `/prototype` and standalone prototype artifacts remain evidence and provenance. Their demo shell/runtime is not copied into Storybook and does not override current `DESIGN.md` / accepted-current-design authority.

## Consequences

- EFCC gains a mature local presentation workshop without building and maintaining a custom UI Lab runtime.
- Every meaningful shipped screen becomes directly reviewable through at least one deterministic baseline Story after T07.
- Storybook introduces another development dependency, but not another production UI runtime.
- Presentation truth and integration truth remain separate; contributors must understand why both Story/PSN and RouteScenario exist.
- Some production screens may require small behavior-preserving presentation seams before they can render deterministically.
- The repository must validate Screen Catalog → PSN → Story completeness.
- ApprovalPackage and governance validation require backward-compatible extension rather than a second Storybook-specific governance subsystem.
- New meaningful screens carry a baseline-Story completion obligation.
- The local workflow requires safe worktree-aware Storybook process handling.
- Cloud-hosted Storybook/Chromatic-style review is not part of the default architecture.

## Alternatives considered

### Custom EFCC UI Lab

Rejected as the canonical workshop because EFCC would own a bespoke presentation runtime, navigation/catalog experience, interaction harness, and long-term maintenance surface that duplicates mature Storybook capabilities.

### Hosted visual-review platform as the default

Rejected because the current requirement is local-first deterministic development and owner review, not another hosted deployment/promotion system. Selective hosted tooling may be reconsidered separately if a real collaboration need emerges.

### Real application only

Rejected because requiring full Worker/D1 startup, authentication, navigation, and backend fixtures for every presentation iteration makes UI tuning unnecessarily slow and couples presentation work to unrelated runtime failure classes.

### Storybook as the only test or product authority

Rejected because isolated presentation cannot prove real authentication, routing, permission enforcement, Worker/D1 state, hardware behavior, or production integration.
