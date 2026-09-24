# EFCC Testing Authority

This document owns testing-layer boundaries, canonical local commands, fixture isolation, and evidence language. Domain behavior remains owned by [CONTEXT.md](CONTEXT.md), active specs, and accepted ADRs. UI control contracts remain governed by [ui-control-recovery-governance.md](docs/implementation/ui-control-recovery-governance.md).

## Readiness model

`pnpm verify` is the complete local machine aggregate. It is the implementation readiness command for a candidate revision after affected checks have passed. It does not prove a Cloudflare deployment, a real device, assistive technology, owner approval, or independent review.

During iteration, run the smallest affected command. Before a ready handoff, run `pnpm verify` from a clean candidate and record the exact revision, command, result, runtime, and limitations. A new commit invalidates evidence tied to the previous revision.

The five-minute Programs runtime canary is a separate diagnostic. It may expose runtime reliability risk, but it cannot waive a finite failure or turn a local result into deployment approval.

## Test seams

| Seam | Owns | Command |
| --- | --- | --- |
| Fast type/static gate | Root and web typechecking used by pre-commit | `pnpm verify:fast` / `pnpm verify:precommit` |
| Worker/D1 runtime | Worker routes, authorization, D1 state, validation, audit, and projections | `pnpm test:workerd` |
| Identity | Role definitions, assignments, grants, hierarchy, seeds, constraints, and audit immutability | `pnpm verify:identity` |
| Programs contract | Programs domain request/response and persistence contract | `pnpm test:programs:contract` |
| Components | React component behavior in the component environment | `pnpm test:components` |
| Storybook scope/index | Affected story scope and catalog obligations | `pnpm test:storybook:scope` and `pnpm storybook:verify-index` |
| Governance | CVA/control and repository governance rules | `pnpm test:governance` and `pnpm verify:governance` |
| Programs browser | Critical local Worker/D1 Programs journeys | `pnpm test:programs:browser` |
| Home browser | The five current Home-origin parity journeys | `pnpm test:programs:home` |
| Responsive browser | Programs responsive behavior and viewport contracts | `pnpm test:programs:responsive` |
| Shell geometry | Static-export shell and role hierarchy geometry | `pnpm test:shell-responsive`, `pnpm test:shell-geometry`, `pnpm test:role-hierarchy-geometry` |
| Full promotion composition | Programs stages, evidence, and parity manifest | `pnpm verify:programs` |

Each behavior has one primary seam. Higher-level checks retain only the cross-boundary proof that a cheaper seam cannot provide. A duplicate test selection is removed after its environment owner is confirmed.

## Local Worker/D1 execution

```sh
# Optional: stop the local Worker, then rebuild only this worktree's D1.
pnpm db:reset:local

# Start local development and add optional walkthrough content.
pnpm dev:local
pnpm db:seed:demo
```

The local Worker serves on `http://127.0.0.1:8787` by default. `pnpm db:reset:local` deletes only this worktree's `.wrangler/state/v3/d1`, then applies the current local migration baseline and seeds disposable account/role fixtures. Run it before starting the local Worker. To refresh fixture rows without rebuilding the database, use `pnpm db:seed:local`; `pnpm db:seed:demo` adds walkthrough content. The rebuild boundary is [ADR-0057](docs/adr/0057-rebuildable-development-d1.md). Use a target override only when a suite explicitly accepts it, for example:

```sh
PROGRAMS_TARGET_URL=http://127.0.0.1:8787 pnpm test:programs:browser
```

Reset only a verified disposable development/test target. Do not use production or unknown D1 resources, and do not use remote Wrangler commands until the target inventory confirms account, Worker, route, D1, environment, and rate-limit identity. Local empty-D1 baseline and seed checks precede any approved development reset.

## Browser rules

Playwright is the real-app boundary for routes, auth/session transport, navigation/history, Worker/D1 projections, and critical mutations. The Programs and Home acceptance runners use one worker and zero retries for the required functional journeys. A retry, skipped case, synthetic route fulfillment, or reduced fallback run is reported separately and cannot be relabelled as full acceptance.

Responsive checks use explicit representative widths. The current repo-wide plan keeps `320`, `390`, `799`, and `800` CSS pixels for Home long-copy cases while shell geometry remains its own contract. A presentation-only synthetic fixture is labelled presentation-only and does not count as Worker/D1 evidence.

Storybook uses production presentation code with deterministic synthetic data. It proves rendering, interaction, and cheap accessibility states; it does not prove Worker authorization, D1 persistence, production auth/session, routing/history, camera hardware, native print, real-device behavior, or assistive-technology outcomes.

## Failure evidence

Preserve the first causal failure, the logical scenario, layer, revision, route/state/viewport, and downstream symptoms. A clean retry does not erase an earlier failure. Keep pre-existing failures visible and identify their owner. Do not weaken a contract, widen a tolerance, add a skip, or extend a waiver to make the aggregate green without recording an approved contract change.

## Local-only governance

The repository’s machine gate is local by design; see [ADR-0056](docs/adr/0056-local-only-verification.md) and [ADR-0029](docs/adr/0029-local-first-testing-and-readiness-gate.md). Review, owner approval, independent review, human/device checks, and deployment evidence remain separate. No GitHub workflow result is required to call the local gate; do not claim that local verification is Cloudflare deployment qualification.

## Optional checks

`pnpm check` runs the repository-wide Ultracite lint scan. It remains optional while the known syntax backlog is reduced. `pnpm test:programs:canary` is a runtime diagnostic, not a substitute for the finite local aggregate. Run both only when the change or review requires them and report their result honestly.
