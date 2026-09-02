# EFCC UI Control Recovery — Living Implementation Plan

> **Document type:** Goal-driven implementation control plane
> **Authority level:** Execution state; subordinate to the approved parent Spec and GitHub ticket bodies
> **Mutation model:** Owner-controlled invariants + agent-maintained execution state
> **Read requirement:** Every implementation session MUST read this document before editing and MUST update it before ending

---

## Materialization record (agent-maintained)

- Materialized target: `docs/implementation/ui-control-recovery-plan.md`.
- Documentation branch: `docs/ui-control-recovery-plan`, based on clean `main @ 83fafdb813db62fa530ddd2bddcecf60571763ec`; the requested dirty local checkout is explicitly ignored.
- Frozen Phase F checkpoint: `feat/s4-f-contraction-release-gate @ 6edf28c0f8f7058cf992416e7b517824c3178c8c`; matching remote ref was verified.
- Parent Spec: [#505](https://github.com/Noahlw/efcc/issues/505); all 36 implementation issues are linked in §9 and were read back before materialization.
- The parent Spec remains product/architecture authority; each linked ticket body and later comments remain acceptance-scope authority.

---

# 1. North-star goal — OWNER CONTROLLED

Restore the EFCC UI to a state where:

> a human defines and approves the product standard once, implementation agents can execute against explicit contracts, and future UI changes have predictable ownership, evidence, blast radius, and rollback.

The rescue is successful only when the whole shipped product is coherent **and** the process that keeps it coherent is enforceable.

This is not merely a visual cleanup.

The recovery must preserve valuable Phase A–F domain implementation while repairing the presentation architecture, test authority, human approval loop, and delivery discipline that allowed visually broken work to propagate.

---

# 2. Non-goals — OWNER CONTROLLED

Do not use this recovery to:

- rebrand EFCC;
- replace Civic Minimal;
- rewrite normalized identity or authorization without a separately approved correctness requirement;
- change routes, APIs, D1 schema, permissions, or mutations for UI convenience;
- introduce a new UI framework or second component system;
- invent generic Form/DataTable/Task/CRUD/authorization frameworks;
- clean the entire historical Ultracite backlog inside visual tickets;
- merge the historical A–F stack directly to main as the rescue;
- allow an agent to redefine an approved contract in order to make its implementation green.

---

# 3. Authority chain — OWNER CONTROLLED

When sources disagree, stop and resolve the conflict rather than choosing silently.

1. **Domain/data authority**
   - normalized identity/backend Specs and ADRs
   - database/data-safety contracts
   - permission/audit/idempotency authority

2. **UI recovery product/architecture authority**
   - approved UI Control Recovery parent Spec

3. **Ticket scope authority**
   - current GitHub implementation ticket body + comments
   - blockers and acceptance criteria

4. **UI governance authority**
   - styling ownership
   - canonical syntax
   - contract mutation rules
   - waiver rules
   - human approval rules

5. **Executable authority**
   - Scenario Registry
   - UI Contract Registry
   - source enforcement
   - tests

6. **Execution state**
   - this living implementation plan

7. **Evidence**
   - approval packages
   - test artifacts
   - QA reports
   - screenshots/traces
   - historical A–F evidence

Historical screenshots, LLM scores, or numeric reports are evidence. They are not allowed to override the active Spec/ticket/contracts.

---

# 4. Known starting state — AGENT MAINTAINED

Work mode must fill this section from the live repo before implementation.

| Field | Current value |
|---|---|
| Repository | `Noahlw/efcc` |
| Frozen source stack | `feat/s4-f-contraction-release-gate` @ `6edf28c0f8f7058cf992416e7b517824c3178c8c` (Phase A–F cumulative) |
| Frozen Phase F branch | `feat/s4-f-contraction-release-gate` |
| Frozen Phase F HEAD | `6edf28c0f8f7058cf992416e7b517824c3178c8c` |
| Frozen checkpoint/tag/ref | `refs/heads/feat/s4-f-contraction-release-gate` and matching `refs/remotes/origin` ref at `6edf28c0f8f7058cf992416e7b517824c3178c8c` |
| Rescue integration branch | `rescue/ui-control-recovery` (not yet created) |
| Rescue integration HEAD | Not created at materialization |
| Parent Spec issue | [#505](https://github.com/Noahlw/efcc/issues/505) |
| Current phase | `Foundation & Recovery Control` |
| Current frontier | T01 [#506](https://github.com/Noahlw/efcc/issues/506) and T02 [#507](https://github.com/Noahlw/efcc/issues/507) are `FRONTIER`; T03–T36 are `BLOCKED` |
| Active visual PR | `None` |
| Rescue path | Undecided until T12 evidence: `SALVAGE STACK` or `SELECTIVE REPLAY` |
| Last owner-approved visual SHA | None — no rescue visual approval recorded |
| Next human approval gate | T02 governance owner review; later T07 visual foundation approval |

---

# 5. Current repository rules — READ BEFORE EVERY SESSION

### Live authority read set at materialization (2026-09-02)

Read before writing: `AGENTS.md`, `web/AGENTS.md`, `web/CLAUDE.md`, `DESIGN.md`, and `web/COMPONENT_INVENTORY.md`; normalized identity/domain sources `docs/specs/091-stackable-identity-backend.md`, `docs/specs/092-discord-identity-design-system-adoption.md`, ADRs 0020, 0023, 0027, 0029, 0030, 0031, 0035, 0036, 0040, 0042, and 0043; Phase A–F acceptance traces; and `docs/qa/2026-09-01-s4-phase-f-contraction-evidence.md`, `release-gate.md`, `release-evidence.json`, `release-evidence.html`, and `audit-dispositions.md`.

Observed Phase F: F-494-01 through F-494-04 are `READY`; aggregate release remains `BLOCKED` by the reproducible full Programs D1 loopback Worker failure on arm64. This plan records that evidence and does not promote isolated passing geometry to release readiness.

The Phase F root `AGENTS.md` currently requires:

- web app changes to have an acceptance trace before implementation, except mechanical edits;
- authenticated E2E through Playwright against local `wrangler dev` and disposable local D1;
- local execution as the READY seam rather than production Cloudflare deployment;
- local shadcn/Radix primitives where equivalents exist;
- Context7 when an unfamiliar library/framework/component API is used;
- automated tests to touch only explicitly disposable `E2E_` / `E2E_DEMO_` D1 data;
- no Apps Script or Google Sheets mutation from automated tests.

## Known governance conflict to resolve in T02

Phase F `AGENTS.md` also says state, size, intent, **and layout** variants must use CVA.

The approved rescue changes this rule:

- **CVA:** stable semantic axes such as intent, size, tone, state, emphasis, density, orientation.
- **Patterns/routes:** composition and layout.

Until T02 lands:
- do not expand the old blanket layout-CVA rule into new rescue architecture;
- do not silently edit `AGENTS.md` outside T02;
- mark any conflict as governed by the approved parent Spec/T02 target.

---

# 6. Current verification baseline — AGENT MAINTAINED

At Phase F start, root scripts include:

| Purpose | Current command |
|---|---|
| Bootstrap | `pnpm bootstrap` |
| Local app | `pnpm dev:local` |
| Reset/seed local D1 | `pnpm db:seed:local` |
| Disposable identity seed | `pnpm db:seed:disposable` |
| Demo seed | `pnpm db:seed:demo` |
| Fast verification | `pnpm verify:fast` |
| Precommit aggregate | `pnpm verify:precommit` |
| Aggregate verify | `pnpm verify` |
| Identity | `pnpm verify:identity` |
| Worker | `pnpm test:workerd` |
| Components | `pnpm --dir web test:components` |
| Shell responsive | `pnpm test:shell-responsive` |
| Shell geometry | `pnpm test:shell-geometry` |
| Role hierarchy geometry | `pnpm test:role-hierarchy-geometry` |
| Web build | `pnpm --dir web build` |
| Ultracite | `pnpm check` |
| Contraction evidence | `pnpm verify:contraction` |

### Committed Phase F command inventory (source: `6edf28c0f8f7058cf992416e7b517824c3178c8c`)

These are exact committed script definitions; current Hermes PATH readiness is tracked in §7.

**Root `package.json`**

- `pnpm prepare` — `husky`
- `pnpm postinstall` — `playwright install chromium`
- `pnpm bootstrap` — `pnpm install --frozen-lockfile && pnpm --dir web install --frozen-lockfile`
- `pnpm dev:local` — `pnpm --dir web dev:local`
- `pnpm db:seed:local` — `tsx tests/e2e/seed-dev-accounts.ts --reset > /tmp/efcc-reset-local.sql && pnpm --dir web exec wrangler d1 execute efcc-identity --local --file=/tmp/efcc-reset-local.sql && tsx tests/e2e/seed-dev-accounts.ts --reset-legacy > /tmp/efcc-seed-local.sql && pnpm --dir web exec wrangler d1 execute efcc-identity --local --file=/tmp/efcc-seed-local.sql && pnpm db:seed:disposable`
- `pnpm db:seed:disposable` — `node --experimental-strip-types tests/e2e/seed-disposable-identity.ts`
- `pnpm db:seed:demo` — `tsx tests/e2e/seed-demo.ts`
- `pnpm verify:contraction` — `node --experimental-strip-types tests/e2e/verify-phase-f-contraction.ts`
- `pnpm verify:identity` — `pnpm --dir web exec vitest run --config vitest.config.ts lib/identity/d1-schema.test.ts lib/identity/seeds.test.ts lib/identity/role-hierarchy.test.ts lib/identity/role-handlers.test.ts`
- `pnpm typecheck` — `tsc --noEmit -p tsconfig.json && tsc --noEmit -p tests/e2e/tsconfig.json`
- `pnpm test` — `vitest run tests/prototype`
- `pnpm test:prototype` — `vitest run tests/prototype`
- `pnpm test:workerd` — `pnpm --dir web exec vitest run --config vitest.config.ts --exclude 'lib/auth/normalized-authority-c487.test.ts' --exclude 'lib/identity/permission-editor.test.ts' --exclude 'lib/identity/permission-editor-handlers.test.ts' --exclude 'lib/identity/normalized-authority.test.ts'`
- `pnpm verify:fast` — `pnpm typecheck && pnpm --dir web typecheck`
- `pnpm verify:precommit` — `pnpm verify:fast && pnpm test && pnpm verify:identity && pnpm test:workerd && pnpm --dir web test:components`
- `pnpm verify` — `pnpm verify:precommit && pnpm test:shell-responsive && pnpm test:shell-geometry && pnpm test:role-hierarchy-geometry`
- `pnpm test:shell-responsive` — `playwright test --config=tests/e2e/responsive.config.ts`
- `pnpm test:shell-geometry` — `playwright test --config=tests/e2e/shell-geometry.config.ts`
- `pnpm test:role-hierarchy-geometry` — `playwright test --config=tests/e2e/role-hierarchy-geometry.config.ts`
- `pnpm build` — `echo No root build step; the web app is built and served by the Worker (see web/)`
- `pnpm check` — `ultracite check`
- `pnpm fix` — `ultracite fix`

**`web/package.json`**

- `pnpm --dir web dev` — `next dev`
- `pnpm --dir web dev:local` — `next build && pnpm db:migrate:local && wrangler dev`
- `pnpm --dir web db:migrate:local` — `wrangler d1 migrations apply efcc-identity --local`
- `pnpm --dir web build` — `next build`
- `pnpm --dir web start` — `next start`
- `pnpm --dir web typecheck` — `tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.worker.json`
- `pnpm --dir web test` — `vitest run`
- `pnpm --dir web test:components` — `vitest run --config vitest.components.config.ts`

**CI workflows at the same ref**

- `.github/workflows/fast-ci.yml`: frozen root install, frozen web install, then `pnpm verify:fast`; non-browser suites remain local.
- `.github/workflows/e2e.yml`: frozen web install, `pnpm --dir web typecheck`, `pnpm --dir web exec vitest run worker.auth.test.ts lib/auth`, frozen root install, `pnpm exec playwright install --with-deps chromium`, and `pnpm exec playwright test --config=tests/e2e/auth-d1.config.ts`.

## Known verification debt owned by T04

The current `pnpm test:workerd` explicitly excludes:

- normalized authority C487 Worker suite;
- Permission Editor domain suite;
- Permission Editor handler suite;
- normalized identity authority suite.

T04 must replace this exclusion-based state with a genuine required test gate.

When T04 lands:
1. update this section;
2. record old command;
3. record new command;
4. link exact evidence;
5. never silently delete the historical fact that the suites used to be excluded.

---

# 7. Skill Invocation Registry — WORK MODE MUST MATERIALIZE EXACT NAMES

**Rule:** future agents must never guess skill syntax. Work mode fills this table from the actual available environment before T01 begins.

| Skill / workflow | Exact invocation | When MUST run | When MUST NOT run | Evidence / output | Gate |
|---|---|---|---|---|---|
| Code review | `/code-review` | After required tests pass, before any ticket PR is called `PR_READY` | Never skip because tests are green | Fixed point is the immediate lower approved rescue HEAD; run `git diff <fixed-point>...HEAD` and `git log <fixed-point>..HEAD --oneline`; record separate `Standards` and `Spec` reports with dispositions | HARD |
| Context7 docs lookup | `/find-docs`; then `npx ctx7@latest library <name> "<specific query>"` and `npx ctx7@latest docs <libraryId> "<specific query>"` | Before coding against an unfamiliar library/framework/component API | Do not guess an API or replace known local-domain evidence | Library ID, docs result, and decision recorded in ticket evidence; maximum three commands per question | CONDITIONAL HARD |
| Single-ticket implementation | `/implement` | Only after blockers and session bootstrap are proven | Not during plan materialization; never start a blocked ticket | Focused implementation, tests, commit, then review | HARD |
| Dependency-ordered stack | `/implement-ticket-stack` | Only when owner explicitly requests an approved stack and Hermes `gh stack` is available | Never silently switch ordinary ticket work into a stack; never merge | Deterministic order, one branch/PR per ticket, base/head readback | HARD when selected |
| GH stack orchestration | `/gh-stack` | Only when the remote `gh stack` capability is installed and the owner selects stacked PR delivery | Do not treat the skill link as proof that the CLI works; never merge or enable auto-merge | Stack base/head/PR membership readback | PRE-T01 BLOCKER while Hermes CLI is unavailable |
| Unattended ticket loop | `/implement-ticket-stack-loop` | Only after owner Goal Gate, fresh workers, green baseline, and stack support | Never invoke autonomously for ordinary implementation; never merge | Resumable run state, independent review, CI fingerprints, PR map | HARD when selected |
| TDD / failure diagnosis | `/tdd` / `/systematic-debugging` | TDD at an agreed behavioral seam; debugging on failure/unexpected behavior | Do not invent scope or patch around a failure | Failing regression, hypothesis/reproduction/root cause/retest | HARD where applicable |
| Worktree isolation | `/using-git-worktrees` | Before each implementation ticket branch/worktree | Do not implement on historical Phase F or another active ticket branch | Exact base SHA, branch, worktree, clean-state proof | HARD |
| PR body | `/pr-description` | Whenever a PR body is created or edited | Docs-only plan PR must not close parent Spec #505 | Explicit base SHA, Similarity to master, test plan, QA steps | HARD |
| Visual diagnostic | `/impeccable` | Only to prepare human approval evidence when relevant | Cannot self-approve or replace the human gate | Diagnostic output linked to scenario/package | ADVISORY / HUMAN GATE |
| Owner-gated scope/design | `/grilling`; `/to-spec`; `/to-tickets` | Only after owner opens a contract or scope-change decision | Never during ordinary T01–T36 execution | Owner decision/spec/ticket readback | OWNER-GATED |
| Tracker setup | `/setup-matt-pocock-skills` | Before code review while `docs/agents/issue-tracker.md` is missing | Do not run silently during ordinary ticket execution | Review workflow file and tracker evidence | PRE-T01 BLOCKER |
| Ultracite | Direct repo command `pnpm check` | When source/static gate requires it | Do not claim `/ultracite` is active on Hermes until restored | Exact `pnpm check` output | HARD where applicable |
| Completion verification | No `/verification-before-completion` found in inspected registry | Resolve it or obtain owner approval for an exact equivalent before T01 | Do not silently substitute a different skill name | Registry/install readback and exact command | PRE-T01 BLOCKER |

**Code-review protocol:** `/code-review` requires a resolved, explicit fixed point and a non-empty three-dot diff. The Standards and Spec axes run as separate parallel reviewer passes; report them under separate headings. Record each finding against its file/hunk, cite the applicable repo rule or ticket/spec requirement, and record its disposition in the ticket and this plan. Do not invent a second severity taxonomy: unresolved documented-standard or spec gaps, missing review, or stale base/head proof keep the ticket out of `PR_READY`; heuristic smell observations remain labelled judgement calls.

### Hermes OMP execution environment (live readback 2026-09-02)

- Implementation host: SSH `ubuntu@hermes`; repo: `/home/ubuntu/efcc`; remote checkout clean on `main @ 83fafdb813db62fa530ddd2bddcecf60571763ec`.
- Active OMP links: `/home/ubuntu/.omp/agent/skills` (48 entries), source registry `/home/ubuntu/.dotfiles/ai/agents/skills` (47 `SKILL.md` files); MCP keys include `context-mode` and `codebase-memory-mcp`.
- Runtime: Node v22.23.2, npm 10.9.8, corepack 0.34.6, gh 2.97.0; `pnpm`, global `wrangler`, `omp`, `codebase-memory-mcp`, and `context-mode` are absent from non-interactive PATH. Phase F pins `pnpm@11.7.0`.
- Remote `gh api user` is `noahwong-hue`; `gh stack --help` currently fails. Recheck write access and stack support in the actual OMP session.
- `apply-omp.sh` is a mutating sync/backup script, not a launcher/help probe. Record the actual OMP launch command/profile before T01.

**Pre-T01 gate:** establish the OMP launch/profile; activate `pnpm@11.7.0`; make `pnpm --dir web exec wrangler --version` work; make `gh stack --help` work or owner-approve a normal per-ticket workflow; provide `docs/agents/issue-tracker.md`; and resolve completion-verification skill availability. Record proof before implementation.

## Skill invocation record

Every ticket adds a row here or links a ticket-specific log.

| Date | Ticket | Skill | Why invoked | Input/base | Result | Evidence |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — |

---

# 8. Branch, worktree, and PR topology — OWNER CONTROLLED

```text
Frozen Phase F tip
      │
      ├── durable archive/checkpoint
      │
      └── rescue/ui-control-recovery
               │
               ├── ticket worktree / branch
               │       └── PR → rescue/ui-control-recovery
               │
               ├── ticket worktree / branch
               │       └── PR → rescue/ui-control-recovery
               │
               └── ...
                       ↓
              final Rescue Integration PR
                       ↓
                      main
```

Rules:

Materialized refs:

- Documentation branch: `docs/ui-control-recovery-plan` from clean `main @ 83fafdb813db62fa530ddd2bddcecf60571763ec`; its PR contains this plan file only.
- Frozen Phase F branch: `feat/s4-f-contraction-release-gate @ 6edf28c0f8f7058cf992416e7b517824c3178c8c`; never implement directly on it.
- Future integration branch: `rescue/ui-control-recovery`, created from the frozen Phase F SHA after the pre-T01 gate.
- Future implementation location: SSH Hermes `/home/ubuntu/efcc`; each ticket gets a fresh worktree/branch and PR targeting the rescue integration branch.


- Never implement directly on the historical Phase F branch.
- Every ticket starts from the latest **approved and merged** rescue integration HEAD.
- One ticket normally equals one short-lived branch/worktree and one focused PR.
- Ticket PR target = `rescue/ui-control-recovery`.
- Final integration PR target = main.
- Do not merge old #473/#496/#497/#501/#502/#503/#504 as promotion steps.
- Do not mark historical PRs superseded until T35/T36 owner gates.

---

# 9. Ticket execution state — AGENT MAINTAINED

Read current state from GitHub before each session. T-keys remain stable; linked issue bodies and comments are acceptance authority. This is a coordination map, not a second copy of ticket criteria.

## Published ticket control map

Readback on 2026-09-02: [#505](https://github.com/Noahlw/efcc/issues/505) through [#541](https://github.com/Noahlw/efcc/issues/541) were fetched with bodies and comments; all 37 bodies matched the approved publication source, all carried `ready-for-agent`, and there were 0 comments at readback. Acceptance-scope changes follow the owner-controlled contract/spec workflow.

| Key | Exact GitHub title | Issue | Parent | Blocked by / dependency edge | Status | Acceptance authority |
|---|---|---|---|---|---|---|
| T01 | prefactor(ui-rescue): freeze the A–F source stack and publish the Preservation Ledger | [#506](https://github.com/Noahlw/efcc/issues/506) | [#505](https://github.com/Noahlw/efcc/issues/505) | None — can start immediately | FRONTIER | exact body of [#506](https://github.com/Noahlw/efcc/issues/506) |
| T02 | docs(ui-rescue): establish the UI governance and agent change-control authority | [#507](https://github.com/Noahlw/efcc/issues/507) | [#505](https://github.com/Noahlw/efcc/issues/505) | None — can start immediately | FRONTIER | exact body of [#507](https://github.com/Noahlw/efcc/issues/507) |
| T03 | test(ui-rescue): enforce styling ownership and typed UI contract governance | [#508](https://github.com/Noahlw/efcc/issues/508) | [#505](https://github.com/Noahlw/efcc/issues/505) | T02 [#507](https://github.com/Noahlw/efcc/issues/507) | BLOCKED | exact body of [#508](https://github.com/Noahlw/efcc/issues/508) |
| T04 | test(identity): restore the excluded normalized Worker suites to the required gate | [#509](https://github.com/Noahlw/efcc/issues/509) | [#505](https://github.com/Noahlw/efcc/issues/505) | T01 [#506](https://github.com/Noahlw/efcc/issues/506) | BLOCKED | exact body of [#509](https://github.com/Noahlw/efcc/issues/509) |
| T05 | test(programs): stabilize the full local Programs, Worker, and D1 acceptance runtime | [#510](https://github.com/Noahlw/efcc/issues/510) | [#505](https://github.com/Noahlw/efcc/issues/505) | T04 [#509](https://github.com/Noahlw/efcc/issues/509) | BLOCKED | exact body of [#510](https://github.com/Noahlw/efcc/issues/510) |
| T06 | fix(ui): contain the global CSS cascade and prove restored composition geometry | [#511](https://github.com/Noahlw/efcc/issues/511) | [#505](https://github.com/Noahlw/efcc/issues/505) | T01 [#506](https://github.com/Noahlw/efcc/issues/506), T03 [#508](https://github.com/Noahlw/efcc/issues/508), T05 [#510](https://github.com/Noahlw/efcc/issues/510) | BLOCKED | exact body of [#511](https://github.com/Noahlw/efcc/issues/511) |
| T07 | feat(ui-lab): add the deterministic UI Lab and executable contract tracer | [#512](https://github.com/Noahlw/efcc/issues/512) | [#505](https://github.com/Noahlw/efcc/issues/505) | T03 [#508](https://github.com/Noahlw/efcc/issues/508), T06 [#511](https://github.com/Noahlw/efcc/issues/511) | BLOCKED | exact body of [#512](https://github.com/Noahlw/efcc/issues/512) |
| T08 | refactor(ui): expand EFCC app-facing control contracts | [#513](https://github.com/Noahlw/efcc/issues/513) | [#505](https://github.com/Noahlw/efcc/issues/505) | T07 [#512](https://github.com/Noahlw/efcc/issues/512) | BLOCKED | exact body of [#513](https://github.com/Noahlw/efcc/issues/513) |
| T09 | refactor(ui): expand EFCC surface, feedback, and overlay contracts | [#514](https://github.com/Noahlw/efcc/issues/514) | [#505](https://github.com/Noahlw/efcc/issues/505) | T08 [#513](https://github.com/Noahlw/efcc/issues/513) | BLOCKED | exact body of [#514](https://github.com/Noahlw/efcc/issues/514) |
| T10 | refactor(ui): establish the minimum canonical composition grammar | [#515](https://github.com/Noahlw/efcc/issues/515) | [#505](https://github.com/Noahlw/efcc/issues/505) | T09 [#514](https://github.com/Noahlw/efcc/issues/514) | BLOCKED | exact body of [#515](https://github.com/Noahlw/efcc/issues/515) |
| T11 | fix(shell): stabilize the authenticated shell, navigation, and page-header boundary | [#516](https://github.com/Noahlw/efcc/issues/516) | [#505](https://github.com/Noahlw/efcc/issues/505) | T05 [#510](https://github.com/Noahlw/efcc/issues/510), T10 [#515](https://github.com/Noahlw/efcc/issues/515) | BLOCKED | exact body of [#516](https://github.com/Noahlw/efcc/issues/516) |
| T12 | feat(programs): deliver the thin complete Programs rescue tracer and decide the preservation path | [#517](https://github.com/Noahlw/efcc/issues/517) | [#505](https://github.com/Noahlw/efcc/issues/505) | T01 [#506](https://github.com/Noahlw/efcc/issues/506), T06 [#511](https://github.com/Noahlw/efcc/issues/511), T11 [#516](https://github.com/Noahlw/efcc/issues/516) | BLOCKED | exact body of [#517](https://github.com/Noahlw/efcc/issues/517) |
| T13 | fix(programs): rescue participant detail, enrollment, cancellation, and event states | [#518](https://github.com/Noahlw/efcc/issues/518) | [#505](https://github.com/Noahlw/efcc/issues/505) | T12 [#517](https://github.com/Noahlw/efcc/issues/517) | BLOCKED | exact body of [#518](https://github.com/Noahlw/efcc/issues/518) |
| T14 | fix(programs): rescue the management directory and program lifecycle entry | [#519](https://github.com/Noahlw/efcc/issues/519) | [#505](https://github.com/Noahlw/efcc/issues/505) | T13 [#518](https://github.com/Noahlw/efcc/issues/518) | BLOCKED | exact body of [#519](https://github.com/Noahlw/efcc/issues/519) |
| T15 | fix(programs): rescue Programs workspace Events and Participants tasks | [#520](https://github.com/Noahlw/efcc/issues/520) | [#505](https://github.com/Noahlw/efcc/issues/505) | T14 [#519](https://github.com/Noahlw/efcc/issues/519) | BLOCKED | exact body of [#520](https://github.com/Noahlw/efcc/issues/520) |
| T16 | fix(programs): rescue Programs workspace Settings and Notifications tasks | [#521](https://github.com/Noahlw/efcc/issues/521) | [#505](https://github.com/Noahlw/efcc/issues/505) | T15 [#520](https://github.com/Noahlw/efcc/issues/520) | BLOCKED | exact body of [#521](https://github.com/Noahlw/efcc/issues/521) |
| T17 | fix(profile): rescue Profile and Account Settings | [#522](https://github.com/Noahlw/efcc/issues/522) | [#505](https://github.com/Noahlw/efcc/issues/505) | T16 [#521](https://github.com/Noahlw/efcc/issues/521) | BLOCKED | exact body of [#522](https://github.com/Noahlw/efcc/issues/522) |
| T18 | fix(auth): rescue public authentication, registration, and recovery surfaces | [#523](https://github.com/Noahlw/efcc/issues/523) | [#505](https://github.com/Noahlw/efcc/issues/505) | T17 [#522](https://github.com/Noahlw/efcc/issues/522) | BLOCKED | exact body of [#523](https://github.com/Noahlw/efcc/issues/523) |
| T19 | fix(communications): rescue Home, Notices, and Messages | [#524](https://github.com/Noahlw/efcc/issues/524) | [#505](https://github.com/Noahlw/efcc/issues/505) | T18 [#523](https://github.com/Noahlw/efcc/issues/523) | BLOCKED | exact body of [#524](https://github.com/Noahlw/efcc/issues/524) |
| T20 | fix(management): rescue Management Hub and Settings Hub | [#525](https://github.com/Noahlw/efcc/issues/525) | [#505](https://github.com/Noahlw/efcc/issues/505) | T19 [#524](https://github.com/Noahlw/efcc/issues/524) | BLOCKED | exact body of [#525](https://github.com/Noahlw/efcc/issues/525) |
| T21 | fix(management): rescue Account Directory | [#526](https://github.com/Noahlw/efcc/issues/526) | [#505](https://github.com/Noahlw/efcc/issues/505) | T20 [#525](https://github.com/Noahlw/efcc/issues/525) | BLOCKED | exact body of [#526](https://github.com/Noahlw/efcc/issues/526) |
| T22 | fix(management): rescue Member Directory | [#527](https://github.com/Noahlw/efcc/issues/527) | [#505](https://github.com/Noahlw/efcc/issues/505) | T21 [#526](https://github.com/Noahlw/efcc/issues/526) | BLOCKED | exact body of [#527](https://github.com/Noahlw/efcc/issues/527) |
| T23 | fix(management): rescue Approval Queue and Approval Detail | [#528](https://github.com/Noahlw/efcc/issues/528) | [#505](https://github.com/Noahlw/efcc/issues/505) | T22 [#527](https://github.com/Noahlw/efcc/issues/527) | BLOCKED | exact body of [#528](https://github.com/Noahlw/efcc/issues/528) |
| T24 | fix(management): rescue Home Content operations | [#529](https://github.com/Noahlw/efcc/issues/529) | [#505](https://github.com/Noahlw/efcc/issues/505) | T23 [#528](https://github.com/Noahlw/efcc/issues/528) | BLOCKED | exact body of [#529](https://github.com/Noahlw/efcc/issues/529) |
| T25 | fix(identity): rescue Role hierarchy and Role Definition workflows | [#530](https://github.com/Noahlw/efcc/issues/530) | [#505](https://github.com/Noahlw/efcc/issues/505) | T24 [#529](https://github.com/Noahlw/efcc/issues/529) | BLOCKED | exact body of [#530](https://github.com/Noahlw/efcc/issues/530) |
| T26 | fix(identity): rescue the Permission Editor | [#531](https://github.com/Noahlw/efcc/issues/531) | [#505](https://github.com/Noahlw/efcc/issues/505) | T25 [#530](https://github.com/Noahlw/efcc/issues/530) | BLOCKED | exact body of [#531](https://github.com/Noahlw/efcc/issues/531) |
| T27 | fix(identity): rescue Account Access and lifecycle impact | [#532](https://github.com/Noahlw/efcc/issues/532) | [#505](https://github.com/Noahlw/efcc/issues/505) | T21 [#526](https://github.com/Noahlw/efcc/issues/526), T25 [#530](https://github.com/Noahlw/efcc/issues/530), T26 [#531](https://github.com/Noahlw/efcc/issues/531) | BLOCKED | exact body of [#532](https://github.com/Noahlw/efcc/issues/532) |
| T28 | fix(attendance): rescue Guest Check-In and corrected validation feedback | [#533](https://github.com/Noahlw/efcc/issues/533) | [#505](https://github.com/Noahlw/efcc/issues/505) | T27 [#532](https://github.com/Noahlw/efcc/issues/532) | BLOCKED | exact body of [#533](https://github.com/Noahlw/efcc/issues/533) |
| T29 | fix(scanner): rescue the authenticated Self scanner journey | [#534](https://github.com/Noahlw/efcc/issues/534) | [#505](https://github.com/Noahlw/efcc/issues/505) | T28 [#533](https://github.com/Noahlw/efcc/issues/533) | BLOCKED | exact body of [#534](https://github.com/Noahlw/efcc/issues/534) |
| T30 | fix(scanner): rescue Assisted and Operator attendance journeys | [#535](https://github.com/Noahlw/efcc/issues/535) | [#505](https://github.com/Noahlw/efcc/issues/505) | T29 [#534](https://github.com/Noahlw/efcc/issues/534) | BLOCKED | exact body of [#535](https://github.com/Noahlw/efcc/issues/535) |
| T31 | fix(attendance): rescue Events, roster, attendance operations, and native print | [#536](https://github.com/Noahlw/efcc/issues/536) | [#505](https://github.com/Noahlw/efcc/issues/505) | T15 [#520](https://github.com/Noahlw/efcc/issues/520), T30 [#535](https://github.com/Noahlw/efcc/issues/535) | BLOCKED | exact body of [#536](https://github.com/Noahlw/efcc/issues/536) |
| T32 | refactor(ui): contract obsolete styling paths and reconcile native exceptions | [#537](https://github.com/Noahlw/efcc/issues/537) | [#505](https://github.com/Noahlw/efcc/issues/505) | T16 [#521](https://github.com/Noahlw/efcc/issues/521), T17 [#522](https://github.com/Noahlw/efcc/issues/522), T18 [#523](https://github.com/Noahlw/efcc/issues/523), T19 [#524](https://github.com/Noahlw/efcc/issues/524), T20 [#525](https://github.com/Noahlw/efcc/issues/525), T21 [#526](https://github.com/Noahlw/efcc/issues/526), T22 [#527](https://github.com/Noahlw/efcc/issues/527), T23 [#528](https://github.com/Noahlw/efcc/issues/528), T24 [#529](https://github.com/Noahlw/efcc/issues/529), T25 [#530](https://github.com/Noahlw/efcc/issues/530), T26 [#531](https://github.com/Noahlw/efcc/issues/531), T27 [#532](https://github.com/Noahlw/efcc/issues/532), T28 [#533](https://github.com/Noahlw/efcc/issues/533), T29 [#534](https://github.com/Noahlw/efcc/issues/534), T30 [#535](https://github.com/Noahlw/efcc/issues/535), T31 [#536](https://github.com/Noahlw/efcc/issues/536) | BLOCKED | exact body of [#537](https://github.com/Noahlw/efcc/issues/537) |
| T33 | test(ui): complete full route/state, cross-browser, and historical-finding verification | [#538](https://github.com/Noahlw/efcc/issues/538) | [#505](https://github.com/Noahlw/efcc/issues/505) | T05 [#510](https://github.com/Noahlw/efcc/issues/510), T32 [#537](https://github.com/Noahlw/efcc/issues/537) | BLOCKED | exact body of [#538](https://github.com/Noahlw/efcc/issues/538) |
| T34 | qa(ui): complete human visual, device, assistive-technology, preference, and print approval | [#539](https://github.com/Noahlw/efcc/issues/539) | [#505](https://github.com/Noahlw/efcc/issues/505) | T33 [#538](https://github.com/Noahlw/efcc/issues/538) | BLOCKED | exact body of [#539](https://github.com/Noahlw/efcc/issues/539) |
| T35 | chore(ui-rescue): assemble and verify the Rescue Integration promotion candidate | [#540](https://github.com/Noahlw/efcc/issues/540) | [#505](https://github.com/Noahlw/efcc/issues/505) | T01 [#506](https://github.com/Noahlw/efcc/issues/506), T33 [#538](https://github.com/Noahlw/efcc/issues/538), T34 [#539](https://github.com/Noahlw/efcc/issues/539) | BLOCKED | exact body of [#540](https://github.com/Noahlw/efcc/issues/540) |
| T36 | chore(ui-rescue): record final A–F supersession and #498 disposition after owner approval | [#541](https://github.com/Noahlw/efcc/issues/541) | [#505](https://github.com/Noahlw/efcc/issues/505) | T35 [#540](https://github.com/Noahlw/efcc/issues/540) | BLOCKED | exact body of [#541](https://github.com/Noahlw/efcc/issues/541) |

Statuses are execution states, not GitHub open/closed states: `BLOCKED` requires an unmerged dependency; `FRONTIER` requires all dependencies `MERGED_RESCUE`; open PRs never count as completed.

---

# 10. Frontier algorithm — AGENT CONTROLLED, GRAPH OWNER CONTROLLED

At the start and end of each session:

1. Read ticket states from GitHub.
2. Mark any ticket whose blockers are all `MERGED_RESCUE` as `FRONTIER`.
3. Do not choose a blocked ticket because it is interesting.
4. Do not reorder visual tickets around human gates.
5. If multiple non-visual tickets are frontier, parallel work is allowed only when:
   - file ownership is disjoint,
   - no acceptance contract is shared,
   - each gets an independent branch/worktree/PR,
   - the plan records both active sessions.
6. At most one unapproved **visual** PR may exist.

## Current frontier

T01 [#506](https://github.com/Noahlw/efcc/issues/506) and T02 [#507](https://github.com/Noahlw/efcc/issues/507) are the current `FRONTIER`; T03–T36 remain `BLOCKED` by the published graph. No Active Session is recorded. Hermes pre-T01 gates are open.

---

# 11. Session bootstrap protocol — EVERY IMPLEMENTATION AGENT

Before editing:

1. Read root `AGENTS.md`.
2. Read this living plan.
3. Read the parent Spec.
4. Read the full current ticket + comments.
5. Verify all blockers are `MERGED_RESCUE`.
6. Read relevant domain/design/QA authorities only.
7. Verify current rescue integration base SHA.
8. Create fresh ticket worktree/branch.
9. Invoke mandatory pre-implementation skill(s), including Context7 if required.
10. Fill `Active Session`.

Do not start implementation if any source of authority conflicts materially.

---

# 12. Active Session — AGENT MAINTAINED

Only active work is recorded here.

| Field | Value |
|---|---|
| Ticket | `None` |
| GitHub issue | `None` |
| Agent/session | `None` |
| Base rescue SHA | `None` |
| Worktree | `None` |
| Branch | `None` |
| PR | `None` |
| Goal | `None` |
| Allowed ownership surface | `None` |
| Explicit non-changes | `None` |
| Highest testing seam | `None` |
| Mandatory skills | `None` |
| Human gate this ticket | `None` |
| Stop conditions | See §17 + ticket-specific |
| Started | `None` |

---

# 13. Ticket execution loop — EVERY TICKET

## A. Goal lock

Before editing, write in Active Session:

- user-visible/system outcome this ticket delivers;
- what must not change;
- current blocker proof;
- highest observable testing seam;
- skills to invoke.

## B. Inspect

- understand current implementation;
- inspect existing tests and evidence;
- identify preservation-sensitive behavior;
- do not use broad refactor as discovery.

## C. Implement

- smallest complete path that satisfies the ticket;
- stay within ownership;
- no contract weakening;
- no unrelated cleanup;
- no silent new abstraction.

## D. Verify

Run:
1. focused tests;
2. ticket-required aggregate tests;
3. local browser/D1 seam where applicable;
4. source/static gates;
5. build where applicable.

Record exact commands + result.

## E. Invoke code review

After implementation tests are green:
- invoke the exact code-review skill from §7;
- review the diff against the ticket base;
- record findings and dispositions;
- fix findings;
- rerun affected tests.

Tests green is not a substitute for code review.

## F. Human gate

If ticket is visual/manual:
- prepare exact scenario;
- exact local URL;
- exact SHA;
- viewports/browser;
- what changed;
- what is intentionally unchanged;
- approval evidence.

Status becomes `WAITING_HUMAN`.

The implementation agent cannot self-approve.

## G. PR-ready

PR summary must map:
- every acceptance criterion → evidence;
- review findings → disposition;
- preservation changes;
- contract changes (normally none);
- manual gates;
- rollback SHA.

## H. End session

Before ending:
- update this plan;
- update ticket state;
- update evidence;
- update Skill Invocation Log;
- update Preservation Ledger link/status;
- update Human Approval Queue;
- update Decision Log if needed;
- clear Active Session;
- compute next frontier;
- STOP.

Do not automatically grab another ticket.

---

# 14. Human Approval Queue — AGENT PREPARES, OWNER DECIDES

| Ticket | Scenario | SHA | Viewports/browser/device | Status | Owner observation | Approval package |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — |

Status:
- `PENDING`
- `APPROVED`
- `REJECTED`
- `N/A`

Rules:
- approval is exact to shown scenarios/viewports/SHA;
- approval is not inherited by unshown states;
- screenshot similarity is not approval;
- agent cannot change baseline to manufacture approval.

---

# 15. Preservation state — AGENT MAINTAINED, VOCAB OWNER CONTROLLED

Allowed dispositions:

- `PRESERVE`
- `PRESERVE_AND_AUDIT`
- `REWORK_PRESENTATION`
- `REPLAY`
- `RETIRE`

Preservation Ledger location:

`docs/implementation/ui-control-recovery-preservation-ledger.md` (not yet created; T01 owns creation)

Summary:

| Disposition | Open | Proven in rescue | Notes |
|---|---:|---:|---|
| PRESERVE | — | — | — |
| PRESERVE_AND_AUDIT | — | — | — |
| REWORK_PRESENTATION | — | — | — |
| REPLAY | — | — | — |
| RETIRE | — | — | — |

Do not mark historical A–F PRs superseded until T35/T36 owner gates.

---

# 16. Contract-change protocol — OWNER CONTROLLED

An implementation defect is solved by changing implementation.

A **CONTRACT CHANGE** changes success itself.

Examples:
- token value;
- product-pattern contract;
- expected geometry;
- tolerance;
- baseline;
- scenario applicability;
- waiver;
- contract severity/disposition;
- route/state coverage expectation.

If implementation appears to require a contract change:

1. STOP implementation.
2. Record:
   - current approved rule;
   - evidence it is wrong/insufficient;
   - affected routes/patterns;
   - proposed before/after;
   - migration impact.
3. Ask owner.
4. Do not invoke grilling autonomously.
5. If owner opens design exploration, invoke the exact grilling skill from §7.
6. If approved change alters parent scope, owner decides whether to-spec/to-tickets must reopen.

No contract change is hidden inside an implementation PR.

---

# 17. Global stop conditions — OWNER CONTROLLED

STOP rather than improvise if:

- a ticket appears to require domain/API/schema/permission behavior outside scope;
- implementation needs `!important` as routine containment;
- an approved contract must be weakened;
- test exclusion or skip is proposed to restore green;
- tolerance/baseline must be broadened;
- a visual decision is missing from approved authority;
- another active ticket owns the required files;
- local Worker/D1 runtime invalidates required evidence;
- Git history/base does not match the plan;
- production D1/Apps Script/Google Sheets access would be required;
- an agent wants to “clean up all related code” beyond acceptance criteria;
- a generic framework is proposed to solve a local migration problem;
- a reviewer finding is dismissed only because tests pass.

When stopped, update `Blockers & Risks` and leave the branch at the last known-green state.

---

# 18. Blockers & Risks — AGENT MAINTAINED

| ID | Ticket | Blocker/risk | First observed | Owner | Required resolution | Status |
|---|---|---|---|---|---|---|
| R-001 | T02 | Phase F AGENTS blanket layout-CVA rule conflicts with approved recovery ownership | Starting state | T02 | Reconcile governance | OPEN |
| R-002 | T04 | `test:workerd` excludes four normalized Worker suites | Starting state | T04 | Restore to genuine gate | OPEN |
| R-003 | T05 | Phase F Programs/workerd reliability failure | Starting state | T05 | Reproducible stable full journey | OPEN |
| R-004 | — | Hermes OMP launcher/profile is unresolved; `omp` is absent from non-interactive PATH | Materialization | Environment/operator | Record the actual OMP launch/profile before T01 | OPEN |
| R-005 | — | Hermes lacks `pnpm`, global `wrangler`, and `gh stack`; Phase F pins `pnpm@11.7.0` | Materialization | Environment/operator | Resolve and verify commands in `/home/ubuntu/efcc` | OPEN |
| R-006 | — | `docs/agents/issue-tracker.md` and `/verification-before-completion` are missing | Materialization | OMP/repo tooling owner | Restore the review workflow and an exact completion-verification equivalent | OPEN |

Add, never silently delete. Close with evidence.

---

# 19. Decision log — AGENT WRITES FACTS, OWNER CONTROLS PRODUCT DECISIONS

| ID | Date | Ticket | Decision | Decision owner | Evidence | Contract change? |
|---|---|---|---|---|---|---|
| D-001 | Starting state | T12 future | Rescue path remains undecided until Programs tracer evidence | Owner/Spec | Parent Spec | No |
| D-002 | 2026-09-02 | Plan materialization | Future implementation runs from SSH Hermes OMP; local dirty checkout is ignored and the Phase F ref is frozen | Owner/environment | Hermes and Git readback | No |

Important future decision:
- T12 records `SALVAGE STACK` or `SELECTIVE REPLAY`.

Do not preselect it for convenience.

---

# 20. Evidence ledger — AGENT MAINTAINED

| Ticket | Base SHA | Head SHA | Focused tests | Aggregate tests | Browser evidence | Code review | Human approval | Rollback |
|---|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | — | — |

Exact failed runs remain part of provenance.
A later clean retry does not erase the earlier failure; note applicability.

---

# 21. Plan update protocol — EVERY SESSION

This file is intentionally changed during implementation.

## Agent MAY update without owner approval

- starting/current SHA;
- branch/worktree/PR;
- issue number links;
- ticket status;
- frontier;
- exact command results;
- skill invocation logs;
- evidence links;
- review findings;
- human gate status as PENDING / owner-provided result;
- blocker records;
- decision evidence;
- Preservation Ledger counts/links;
- rollback SHA;
- next safe action.

## Agent MUST NOT silently update

- north-star goal;
- non-goals;
- authority ordering;
- ownership model;
- dependency graph;
- contract-change definition;
- allowed preservation vocabulary;
- human approval authority;
- global stop conditions.

If one of these is wrong, use the contract/spec change process.

---

# 22. End-of-ticket state transition

A ticket only advances:

```text
BLOCKED
  ↓ blockers merged
FRONTIER
  ↓ session starts
IN_PROGRESS
  ↓ implementation + machine gates + code review
PR_READY
  ↓ if human gate required
WAITING_HUMAN
  ↓ owner approves
APPROVED
  ↓ PR merged to rescue integration
MERGED_RESCUE
```

If human rejects:
`WAITING_HUMAN → IN_PROGRESS`

If review/test fails:
`PR_READY → IN_PROGRESS`

Do not represent an open PR as completed.

---

# 23. End-of-phase checkpoint

At the final ticket of each phase, update:

- rescue integration HEAD;
- completed tickets;
- unresolved blockers;
- preservation progress;
- skill invocation anomalies;
- approved visual baselines;
- test command evolution;
- next frontier;
- rollback checkpoint.

Create a short phase checkpoint entry:

## Phase checkpoint template

**Phase:**
**Rescue integration SHA:**
**Tickets merged:**
**Machine gates:**
**Human approvals:**
**Preservation state:**
**Open blockers:**
**Authority/contract changes:**
**Next frontier:**
**Rollback checkpoint:**

Do not invent a new implementation roadmap at phase boundaries; the tracker graph remains the roadmap.

---

# 24. Current next safe action — AGENT MAINTAINED

`RESOLVE_HERMES_PRE_T01_GATES_THEN_START_T01_OR_T02`

Resolve R-004 through R-006 in the Hermes OMP session and record proof. Once green, create `rescue/ui-control-recovery` from the frozen Phase F SHA; then the owner may start T01 or T02.

Do not start T01 implementation inside this documentation change.

---

# 25. Definition of recovery completion — OWNER CONTROLLED

The rescue is not complete merely because every ticket has code.

Completion requires:

- Preservation Ledger fully dispositioned;
- reliable local Worker/D1 acceptance;
- UI governance and machine enforcement live;
- cascade deterministic;
- app-facing primitives and patterns human-approved;
- shell approved;
- all shipped route/state inventory dispositioned and rescued;
- no undocumented styling islands;
- complete route/state contracts green;
- required Firefox/WebKit coverage green;
- required device/AT/preference/print human evidence recorded;
- historical deferred/review findings reconciled;
- final Rescue Integration candidate proven at one exact SHA;
- owner approval;
- historical A–F supersession recorded only afterwards.

The permanent success condition is not “all pages currently look good.”

It is:

> **EFCC has a controlled UI system in which humans own product decisions and agents are constrained to implement and preserve them.**
