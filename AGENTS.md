# EFCC Project Guidance

## Docs-Backed (Apps Script)

- Surface missing official docs as blocking question. Status stays `Proposed` until official docs, the smallest local VM/API check, and any explicitly scoped operator `/exec` smoke are complete; `/exec` is not the default `READY` gate.

## Headless-Gate (Verification)

- Web app changes require an acceptance trace written BEFORE implementation (mechanical edits exempt).
- Authenticated E2E = Playwright versus `wrangler dev` on `127.0.0.1:8787` by default (zero Cloudflare account touched). `pnpm dev:local` builds, migrates, and starts it; `pnpm db:seed:local` seeds the disposable `E2E_` account fixtures and `pnpm db:seed:demo` seeds the `E2E_DEMO_` domain walkthrough. Unauthenticated/CSS checks use Orca `browser` (`Stateless-Wall` blocks Orca on authenticated RPCs).
- The local run is the required `READY` gate (ADR-0029): relevant Playwright suites must pass 100% against local `wrangler dev` + local D1, with every criterion asserted through observable DOM or response state. Cloudflare deployment is optional/manual production-promotion evidence only; if run, use a fresh reserved `efcc-auth-*` or `efcc-dev-*` host, never the stale `efcc-prototype-129` host. Pipeline results append to the ticket plan when an appender command is explicitly run.

## Layered testing authority

- **Current rescue qualification amendment (2026-09-05):** `pnpm verify:programs` is the finite functional aggregate only. It must pass the Worker Contract, real local Worker/D1 Browser Acceptance, Responsive Matrix, and comprehensive local non-browser regression stages with current, complete, zero-retry evidence. The unchanged five-minute `pnpm test:programs:canary` remains an independently reported sustained-runtime diagnostic; B-003 stays `OPEN` residual risk and is not claimed fixed, harmless, or production-safe. A failed finite functional scenario still blocks T05. The machine result `functional-passed` is not `STACK_GREEN`; that state also requires ledger reconciliation, current `/code-review Standards` and `/code-review Spec`, one replacement PR, and the scoped risk record.

- EFCC testing is layered. Read [`TESTING.md`](TESTING.md) before changing test architecture or claiming a T05 gate.
- Worker/D1 correctness belongs to the Workers Vitest Contract Gate; repeated real-HTTP runtime reliability belongs to the `createTestHarness()` Runtime Reliability Canary; critical browser workflows belong to Playwright Browser Acceptance; viewport behavior belongs to the focused Responsive UI Matrix; promotion belongs to the aggregate gate.
- T05 Browser Acceptance uses one representative viewport with zero retries. Responsive proof uses deterministic `320`, `390`, and `1280` scenarios. Heavy qualification is local-first; automatic GitHub CI remains fast-only.
- T05 follows the published `#505` amendment and `#510` routing: `#551 → (#552/#553) → (#554/#555) → #556 → #557`, one owning commit per child on `rescue/t05-layered-testing`, one replacement PR. Historical `201 expected` and five-suite-run evidence remains diagnostic history.

## UI Components and Variants

- All new or changed web UI MUST use the repository's local shadcn-style components and Radix primitives from `web/components/ui` where an equivalent exists. Extend an existing primitive or variant before creating a new control.
- Component state, size, intent, and other stable semantic variants MUST use `class-variance-authority` (`cva`) with the repository's `cn` class-composition helper. Layout and composition belong to approved EFCC patterns/routes and ordinary Tailwind utilities; they are not blanket CVA variants. Keep variant definitions beside the component and preserve the existing shadcn API shape.
- When a library, framework, or component API is unfamiliar, use the Context7 CLI before coding: `npx ctx7@latest library <name> "<specific question>"`, select the authoritative result, then run `npx ctx7@latest docs <library-id> "<single concept>"`. Keep queries free of secrets and use the fetched guidance in the implementation.

## Database Safety

- Local/CI E2E may reset only explicitly disposable `E2E_`/`E2E_DEMO_` D1 fixtures through the checked-in seed scripts. Apps Script and Google Sheets are never mutated by automated tests; the `Users` tab remains immutable.

## UI Control Recovery

- Canonical UI operating authority: [`docs/implementation/ui-control-recovery-governance.md`](docs/implementation/ui-control-recovery-governance.md). Read it before app-facing UI work.
- Use Tailwind for ordinary layout/visual rules, CVA for stable semantic axes, local shadcn/Radix primitives plus `cn()`, tokens, and narrow layered global CSS. Patterns own repeated composition; routes own domain content/state/arrangement.
- Ordinary implementation agents MUST NOT lower expectations, widen tolerances, change baselines, add skips/allowlists/suppressions, remove coverage, extend waivers, or use `!important` as routine containment.
- Any token, primitive/pattern contract, scenario, tolerance, baseline, coverage, native exception, waiver, or approval requirement is a human-approved **CONTRACT CHANGE**.
- Keep at most one unapproved visual **phase stack** in flight. A phase stack may contain multiple ticket-isolated PRs after each parent reaches `STACK_GREEN`; human approval and parent-first merge remain required before the stack enters the next phase.
- A dependent ticket may start from a `STACK_GREEN` parent PR without waiting for that parent to merge. Keep one branch/PR per ticket unless an explicit owner-approved phase exception applies; keep child PR bases pointed at their immediate stack parent so each PR remains an incremental ticket-isolated diff. For T07, follow the scoped shared-PR rule above.
- Do not mix visual rescue with unrelated backend, schema, feature, lint, or data work. Do not treat screenshots or headless geometry as human approval.

### Phase 1 Storybook presentation authority

- For presentation-affecting UI work after T07, work Storybook-first: start or reuse the current worktree's local Storybook, establish or update the relevant deterministic Story early, and report the actual local URL plus direct Story URL before UI iteration.
- Storybook is presentation authority only. Use Storybook/Vitest for isolated deterministic render/state/interaction/cheap-a11y work; use browser presentation contracts for geometry/relational rules; use the real app for routing/auth/session/shell integration; use Worker/D1 tests for backend/domain/permission/mutation truth.
- Every active meaningful shipped screen must have a Screen Catalog entry and a resolvable baseline `PSN-*` Story after T07. A presentation-affecting change is incomplete while relevant Stories are stale.
- `PSN-*` is the stable presentation identity; Storybook-generated slugs/URLs are locators only. Do not create another hand-written presentation-scenario registry.
- Storybook fixtures must be deterministic and synthetic. Never copy production/member-derived records, secrets, tokens, API keys, or production identifiers into Stories or handlers.
- Production code must not import Storybook Stories, fixtures, handlers, or Storybook-only adapters. Storybook may depend on production presentation code; production must not depend on Storybook.
- Do not copy `/prototype` mock shell, mock surfaces, viewport simulator, demo router, or scenario controls into the production Storybook catalog.
- T07/#512 is the one scoped shared-PR exception defined in the tracker and governance authority: T07.1–T07.6 each own one checkpoint commit on one shared branch/PR, and only T07.6 can make the PR `STACK_GREEN`. T08–T12 return to one branch/PR per ticket.
- The generic real-app `READY` gate still requires its required browser and Worker/D1 integration evidence. Isolated presentation work follows `TESTING.md` and ADR-0045; that separation does not waive any required integration test.
- An issue label never authorizes a worktree, `/implement`, or implementation start. T07 children remain blocked until the tracker records the approved planning gate.
- Story existence is not human approval. T07 records workshop-fidelity approval; T08+ design tickets require real design approval before final qualification.
- Failures block the work that owns or causes them. Preserve and report unrelated pre-existing failures rather than silently relabeling them or freezing unrelated roadmap work.
