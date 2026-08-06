# ADR-0017 — Frontend Repository, Rendering, and Cloudflare Deployment Boundary

- **Status**: Proposed — decision locked via grilling on issue #127, then revised at the user's direction to the same-repository monorepo. Per `AGENTS.md`'s headless/browser gate and the repository's deployed-proof policy, this ADR remains `Proposed` until a fresh deployed Cloudflare Workers + static-assets build, the same-origin `/api/*` proxy round trip, and the preview/promotion/rollback story are all proven against real infrastructure. The ADR below is the decision record; deployed proof is downstream CF0 implementation evidence, not a claim this ADR makes.
- **Deciders**: Noah Wong, OMP planner (grill-with-docs)
- **Date**: 2026-08-01
- **Related**: issue [#127](https://github.com/Noahlw/efcc/issues/127) (grilling ticket, decision then revised to same-repository monorepo), issue [#118](https://github.com/Noahlw/efcc/issues/118) (Feature CF0 manifest), issue [#128](https://github.com/Noahlw/efcc/issues/128) (HTTP boundary/auth/API contract — ADR-0018), issue [#129](https://github.com/Noahlw/efcc/issues/129) (prototype, live round trip proven on real Cloudflare + isolated Apps Script infra), issue [#141](https://github.com/Noahlw/efcc/issues/141) (CF0 canonical spec, `docs/specs/074-cloudflare-frontend-shell.md`), ADR-0007 (this ADR supersedes the frontend portion of ADR-0007 — the multi-page `HtmlService` architecture — without reopening the Sheets or Apps Script backend decisions).
- **Supersedes (frontend portion only)**: ADR-0007 (vanilla multi-page HTML Service architecture). The backend, Sheets, and Apps Script decisions from ADR-0007 and the rest of the EFCC ADR corpus are unchanged.
- **Grill session**: issue #127 (Feature CF0, decision ticket under Map #117).

## Context

Issue #127 asked how the new React/Next.js frontend should be housed, rendered, and deployed on Cloudflare so that the choice is sustainable for two maintainers: which repository boundary (separate frontend repo vs. monorepo), which rendering target (static export vs. SSR/edge), which Cloudflare product (Pages vs. Workers), and what ownership, preview, promotion, rollback, and free-tier rules make the choice durable.

The original resolution of #127 chose a separate `efcc-web` repository. The follow-up revision reversed that: the frontend remains in this `EFCC-dev` repository as a monorepo, with the existing Apps Script backend, Sheets database, and audit semantics untouched. The separate `efcc-web` repository is not the canonical source. The rest of the decision — Next.js static export, Cloudflare Workers with static assets (not Pages), shared ownership, automatic previews on non-production branches, manual smoke-gated `main` promotion, Cloudflare's built-in instant rollback, and passive free-tier monitoring — stands as recorded.

The transport (HTTP boundary, session headers, error envelope, retries, idempotency, correlation, abuse limits) is decided separately in ADR-0018. This ADR is the boundary, not the wire format.

## Decision

### 1. Repository boundary — same-repository monorepo

The Next.js frontend lives in this `EFCC-dev` repository as a monorepo, alongside the existing Apps Script backend and the shared tooling/configs already shipped here. The repository-local API contract is the single source of truth shared by frontend and backend. Frontend and backend keep their own build and CI commands within the repository, but they share one PR history, one issue tracker, and one review surface. The previously proposed separate `efcc-web` repository is **superseded** — it is not the canonical source and is not part of the deployment story.

This decision is reversible to a multi-repo split later if the monorepo's coupling produces real friction, but it is not reversible to "the canonical EFCC is now over there" without renaming/redirection overhead. The follow-up revision at the user's direction is the resolved choice; the original resolution of #127 is recorded only for traceability.

### 2. Rendering — Next.js static export

Next.js is configured with `output: 'export'` (static export). All page traffic lives in Cloudflare's free unlimited static-asset pool. There is no SSR/edge requirement for this PIN-gated application: the EFCC app is auth-gated, content is fetched from the Apps Script backend over the documented HTTP contract, and the cost model shows ample free-tier headroom with static-only traffic. SSR/edge rendering was considered and rejected: it costs additional execution time on every request, makes preview/promotion/rollback more stateful, and brings no user-visible benefit for this app's shape.

### 3. Cloudflare product — Workers with static assets (not Pages)

The hosting surface is **Cloudflare Workers with static assets**, not Cloudflare Pages. Two reasons:

1. **Workers has rollback/preview parity with better observability** than Pages for this workload. The built-in rollback and versioned preview URLs are available on Workers, while deployment logs/analytics remain in the same product; preview URLs are a live smoke-test surface and do not imply preview-log availability.
2. **One Worker serves both static assets and the mandatory `/api/*` CORS proxy.** A single Worker binding handles the static-asset routing for the SPA shell and the same-origin proxy from the browser to the Apps Script backend. Pages would require a separate Workers route for the proxy, doubling the surface area and the deploy coupling.

### 4. Ownership — shared from day one

Both maintainers get repository write/admin access and Cloudflare account membership from day one. There is no "one person owns deploy" model. Promotion to production, rollback, and free-tier monitoring are shared responsibilities with documented access, not a single point of failure.

### 5. Preview — automatic on all non-production branches through CI

The deployment pipeline uploads a Worker version for every non-production branch and publishes a reachable versioned preview URL, with a human-readable branch alias where the pipeline assigns one. Cloudflare provides versioned preview URLs for Worker versions; the branch-to-alias mapping is CI behavior, not a native branch deployment primitive. Preview share-links are the review surface for non-`main` work; reviewers do not need to clone or build locally to verify a change.

### 6. Promotion — `main` auto-deploys, gated by manual preview smoke test

`main` auto-deploys to production. The promotion gate is a **manual preview-URL smoke test** against the preview URL of the merging change before the `main` deploy lands. The Cloudflare instant rollback (next section) is the deliberate safety net for the case where the smoke test under-sampled a real production path; the gate is intended to catch the typical regression, not to be a substitute for the rollback story.

### 7. Rollback — Cloudflare's built-in instant rollback

Rollback uses Cloudflare's built-in rollback on the Worker. There is no custom rollback pipeline. Selecting a prior Worker version creates a new deployment serving that version across the deployed routes and domains; the version's static assets and Worker code therefore return together. Cloudflare does not change connected resources during rollback, so binding or storage schema compatibility remains an operational constraint.

### 8. Free-tier guardrail — passive dashboard check only

Monitoring is **passive**: a glance at the Cloudflare dashboard, on demand. The cost model shows approximately 84x headroom on the worst-modeled day, so free-tier exhaustion is not a credible near-term risk. Raising monitoring to active alerts (or leaving the free tier for a paid plan) is a future decision if usage actually approaches the ceiling; nothing in this ADR forecloses it.

## Relationship to ADR-0007

ADR-0007 chose a vanilla multi-page HTML Service architecture served via `HtmlService`. This ADR **supersedes the frontend portion of ADR-0007** for the new CF0 frontend. The transition is:

- ADR-0007's `HtmlService` / `doGet` / `google.script.run` frontend model is **replaced** for the new frontend by the Next.js static-export + Cloudflare Workers + `/api/*` proxy model described here.
- ADR-0007's backend posture (Google Sheets as the database, Apps Script as the backend runtime, server-enforced auth/capability/mutation/lock/audit) is **not reopened**. The new frontend's HTTP contract (ADR-0018) terminates at the Apps Script backend exactly as ADR-0007's frontend did.
- Specs and code that documented ADR-0007's frontend model (the `?page=` routing, the multi-page shell, the `google.script.run` envelope) are superseded for the new frontend by the CF0 spec (`docs/specs/074-cloudflare-frontend-shell.md`) and the reconciliation matrix (`docs/specs/073-htmlservice-spec-reconciliation-matrix.md`).

In short: ADR-0007 governs the now-legacy EFCC frontend shell; this ADR governs the new CF0 frontend boundary. The backend is shared and unchanged.

## Relationship to ADR-0018

ADR-0018 governs the HTTP wire protocol between the new frontend and the Apps Script backend: the single versioned `POST /api/v1/rpc` action-multiplexed endpoint, `Authorization` / `X-Efcc-Session-Id` header session transport, RFC 9457 Problem Details error envelope, retries limited to reads/idempotent actions on network/5xx, the `Idempotency-Key` header adoption, `X-Request-Id` correlation, and Cloudflare Rate Limiting binding keyed on session identity (never IP). This ADR is the **boundary** — repository, rendering, hosting product, ownership, preview, promotion, rollback, free-tier posture — and does not restate the wire format. The two ADRs are companion records: this ADR decides where the frontend runs and how it is owned; ADR-0018 decides how it talks to the backend.

## Non-goals

- **Backend, Sheets, or Apps Script runtime changes.** Google Sheets remains the database and Apps Script remains the backend runtime. The Domain Source of Truth (Map #77) is unchanged. No backend ADRs are reopened by this ADR.
- **Domain mutation implementations.** This ADR is the boundary; it does not implement domain features, Sheet schema changes, or QR business authority. Those live in CF1–CF8 and the domain feature work.
- **Multi-tenant or SaaS deployment.** The first release targets one church, not multi-tenant operation. The Cloudflare account and Worker configuration are single-tenant.
- **SSR/edge rendering.** Static export is the chosen rendering target. SSR/edge is not on the roadmap for this app's shape.
- **Cloudflare Pages.** Pages is not the hosting product; Workers with static assets is. A later migration to Pages would need its own ADR.
- **Active monitoring / billing alerts.** Monitoring is passive (dashboard check); the cost model shows ~84x free-tier headroom on the worst-modeled day. Active alerts are a future decision if usage actually approaches the ceiling.
- **DNS, custom domain, or CDN configuration beyond the default Cloudflare-managed routing.** Those are operational follow-ups, not part of this decision.
- **Production cutover.** The decision is the boundary; the cutover from the legacy `HtmlService` frontend is a separate ticket and a separate ADR (or a follow-up to this one once deployed proof exists).

## Consequences

- **Positive**: the new frontend shares one PR/issue history with the backend it talks to, one code-review surface, and one set of repository-level tooling/tooling-configs. The repository-local API contract is the single source of truth shared by both sides.
- **Positive**: all page traffic lives in Cloudflare's free unlimited static-asset pool; SSR/edge costs are not incurred.
- **Positive**: one Worker serves both static assets and the `/api/*` proxy, halving the deploy surface area and the coupling between them.
- **Positive**: previews on every branch, manual smoke-gated `main` promotion, and Cloudflare's built-in instant rollback give a complete deploy story with no custom pipeline.
- **Positive**: shared ownership from day one means no single-point-of-failure for deployment, rollback, or monitoring.
- **Negative**: the monorepo's frontend and backend share build/CI orchestration complexity that a separate-repo split would isolate. If the coupling produces real friction, splitting is reversible but not free.
- **Negative**: the "passive dashboard check" free-tier guardrail relies on maintainers noticing drift. Adequate at ~84x headroom; insufficient if usage changes the calculus.
- **Risk**: the decision to keep `main` auto-deploy with a manual smoke-gate depends on the maintainers actually running the smoke test. Cloudflare instant rollback is the explicit safety net for the case where the gate under-samples; both layers are required to keep the rollback posture honest.

## Downstream verification handoff (not #127 implementation)

The following checklist is handed to the CF0 implementation tickets graduating from Spec #141. It is not implementation/deployment work or an acceptance claim for issue #127. Those downstream tickets must prove, locally and against a fresh Cloudflare Workers + static-assets deployment, at minimum:

1. Static export builds produce a deployable bundle that the Worker serves at the same origin as the `/api/*` proxy.
2. The same-origin `/api/*` proxy round trip works end-to-end (login, session restore, one domain read) against a fresh isolated Apps Script `/exec` deployment, with the proxy remapping HTTP status from the Apps Script `TextOutput` body.
3. A non-production branch push produces a reachable preview URL with the static shell and the proxy.
4. `main` deploys to production only after a manual preview-URL smoke test, and the deployed production URL serves the same static shell + proxy.
5. Cloudflare's instant rollback restores the previous deployment in one operation and the rolled-back URL is reachable.
6. Passive dashboard check confirms the deployed Worker is comfortably under the free-tier ceiling on the worst-modeled traffic day.

Only after the official platform claims used by this ADR are verified, a minimal implementation test passes, a headless acceptance trace passes, and a fresh deployed `/exec` IFRAME or Cloudflare preview smoke test passes may the six infrastructure steps move this ADR from `Proposed` to `Accepted`. The deployment URL, version, date, test evidence, headless trace, and observed result must be appended here. Until every gate passes against real infrastructure, the ADR remains `Proposed` per the repository's deployed-proof policy.

## Considered options (informational)

- **Separate `efcc-web` repository, then monorepo.** The original resolution of #127 chose a separate repository; the follow-up revision reversed that at the user's direction. The separate-repo option is recorded for traceability only and is not the chosen path.
- **Static export vs. SSR/edge.** Static export chosen. SSR/edge rejected: costs additional execution time on every request, makes preview/promotion/rollback more stateful, and brings no user-visible benefit for this PIN-gated, content-fetched app.
- **Cloudflare Pages vs. Workers with static assets.** Workers with static assets chosen. Pages rejected: would require a separate Workers route for the mandatory `/api/*` CORS proxy, doubling the deploy surface area and the deploy coupling.
- **Active monitoring vs. passive dashboard check.** Passive dashboard check chosen for now. Active alerting rejected at this scale (~84x free-tier headroom); a future ADR may reopen when the cost model changes.

## Cross-references

| Reference | Relationship |
| --- | --- |
| ADR-0007 | Supersedes the frontend portion only (the multi-page `HtmlService` architecture); backend posture unchanged. |
| ADR-0018 | Companion record: HTTP wire protocol, session/auth headers, error envelope, retries, idempotency, correlation, rate limiting. |
| ADR-0023 (single-lock) | Unchanged; governs every mutating RPC the new frontend invokes |
| ADR-0015 (camera) | Unchanged; the external camera page is a separate origin outside this boundary. |
| ADR-0013 | Unchanged; canonical Sheet schema record. |
| Spec #141 / `docs/specs/074-cloudflare-frontend-shell.md` | The CF0 canonical spec that synthesizes this ADR + ADR-0018 + Spec 073 + Prototype #129 into an implementable shell contract. |
| Spec #130 / `docs/specs/073-htmlservice-spec-reconciliation-matrix.md` | Classifies every ADR/spec clause against ADR-0017 and ADR-0018. |
| Prototype #129 | Live round trip proven on real Cloudflare + isolated Apps Script infra; informed this ADR's boundary. |
| Issue #127 | Grilling ticket; resolved as ADR-0017 (separate repo), then revised to same-repository monorepo at the user's direction. |
| Issue #118 | Feature CF0 manifest; this ADR is the boundary sub-decision. |
| Map #117 | Parent map for the EFCC Cloudflare React/Next.js frontend migration and feature ownership. |

## Official platform references

The platform-specific claims in this ADR are grounded in the following primary
documentation:

- [Next.js static export](https://nextjs.org/docs/app/guides/static-exports) — `output: 'export'` emits an `out` directory with route HTML and static assets that can be served by any web server.
- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) — Worker code and the configured assets directory deploy as one unit; `run_worker_first` and the assets binding allow the Worker to own `/api/*` while assets serve the shell.
- [Static asset billing and limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) — static-asset requests are free and unlimited, while Worker-invoked requests are billed against the Worker plan.
- [Workers Preview URLs](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/) — each uploaded version can have a versioned preview URL, and CI may assign an alias for a branch.
- [Workers Rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/) — rollback creates a new deployment from a selected prior version and does not change connected resources.

## Revision history

- **2026-08-01**: Initial decision as ADR-0017. The original resolution of issue #127 chose a separate `efcc-web` repository.
- **2026-08-01 (follow-up)**: Revised at the user's direction. The frontend remains in this `EFCC-dev` repository as a monorepo. The separate `efcc-web` repository is superseded and is not the canonical source. The rest of the decision (Next.js static export, Cloudflare Workers with static assets, shared ownership, non-production previews, `main` promotion gate, Cloudflare instant rollback, passive free-tier monitoring) stands as originally resolved.
