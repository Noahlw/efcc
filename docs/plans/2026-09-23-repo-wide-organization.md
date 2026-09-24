# EFCC repo-wide organization — implementation plan and agent handoff

**Status:** Implementation in progress; single-workspace, prototype retirement, Auth PIN-import retirement, local D1 baseline, and the bounded Drizzle stop/adopt trial are complete; full local verification, Programs parity, and external governance gates remain open<br>
**Plan branch:** refactor/repo-wide-organization<br>
**Audited base:** main at b18828d42b6e152f2d29ed1f63df9c1681e59046, 2026-09-23<br>
**Goal:** reduce maintained code, coding-agent context, and rework while preserving church user journeys, permission results, audit outcomes, and explicit security requirements.

## Outcome, authority, and boundaries

This plan consolidates the owner decisions reached during the 2026-09-23 grilling and resolves the actionable CEO-review findings. It governs the approved local implementation on `refactor/repo-wide-organization-implementation`. The user authorized local source, test, configuration, and documentation changes, including rebuilding this worktree's disposable local D1. It does not authorize unknown remote database changes, deployment, push, merge, or release.

Accepted decisions:

- Production architecture remains a Next.js static export served by Cloudflare Workers Static Assets, with Worker API routes and D1. D1 remains the only product database for this plan.
- Consolidate root and web into one pnpm workspace while keeping the web application under web/. Do not add Turbo without a measured task-graph or cache need.
- Remove GitHub Actions and use a lean local pnpm verify aggregate. Keep fast formatting/static checks at pre-commit and affected checks during iteration. Preserve separate human, device, independent-review, and deployment evidence.
- Development/test D1 targets may be rebuilt, including shared/manual targets, after the target inventory and clean schema baseline are verified. There is no production D1 data. Do not reset any database as part of writing this plan.
- The external Apps Script scanner flow and Google Sheets Users/PIN import and forced-upgrade path are retired; there are no legacy accounts to migrate. Keep the current Worker scanner and ZXing fallback.
- Keep /prototype available only through internal design-preview material; exclude it from the production static export.
- Retire redundant tests only after behavior parity. The old Programs browser suite stays until its still-valid cases have executable replacement evidence.
- Trial Drizzle only for the published-announcement read, and adopt it only if measured net maintenance cost falls and type safety improves. Keep Wrangler as the D1 migration ledger.
- Auth provider/library migration is deferred to the open [#639 Auth Backend and Session Authority map](https://github.com/Noahlw/efcc/issues/639). Keep authentication/session separate from the editable scoped Role Definition/Grant product model; Q16 remains deferred and the current editable role model stays.
- Optimize first for maintained code and coding-agent context. Do not claim a performance or token reduction without a comparable measurement.

### Security outcome that remains open

The accepted security requirement is that emergency credential or all-session revocation denies the next protected API request; ordinary account or role/grant changes may take about 15 minutes. The current code does not meet the emergency requirement: access-token verification is stateless, and a revoked session's outstanding access token can remain valid until expiry. The current session test explicitly demonstrates that behavior.

Auth implementation remains outside this repository-cleanup plan. Therefore:

- Do not claim this plan makes the emergency-revocation requirement pass.
- Track it as a pre-production blocker in the deferred Auth work. The #639 map and #642 decision child do not themselves implement it.
- Before production, a separate implementation slice must prove that a token issued before emergency revocation is denied on the next protected Worker request. Keep the ordinary-change delay contract distinct.
- The repository cleanup may proceed without Auth-library changes, but it cannot be described as production-ready while this blocker remains.

The removed lockout state machine only guarded the legacy four-digit PIN forced-upgrade path. The existing username/password login did not use per-account lockout or a login rate-limit binding. The cleanup retires that PIN-only state because there are no legacy accounts to import; it does not add a replacement mechanism. Before production, the deferred Auth work must explicitly assess password-login brute-force protection and prove the selected rate-limit/lockout behavior alongside emergency revocation.

Current source evidence: web/lib/auth/sessions.ts:121-162, 349-360; web/lib/auth/handlers.ts:257-277; web/lib/auth/sessions.test.ts:395-420.

## Current implementation branch

The implementation branch is refactor/repo-wide-organization-implementation, based at 2de9f81f2898c22885e60d04cc1807cb856e5460. Local implementation remains in progress; no changes have been pushed, merged, deployed, or made to a remote D1 or ruleset.

Completed slices include the single pnpm workspace and lockfile, local-only D1 baseline/reset path, retired prototype/scanner and Google Users/PIN runtime, Home-origin Browser source, removal of the old credential-upgrade Storybook fixture, module ownership cleanup, current documentation/ADR updates, and the bounded Drizzle trial (not adopted). The current production build excludes /prototype while preserving /scanner; frozen root install passed. The full Storybook interaction suite passed 95/95, the ProgramWorkspace component suite passed 86/86, and the new Member Program PATCH regression passed against local Worker/D1. These are dirty-candidate results, not clean-candidate qualification.

The Programs Browser gate now contains 16 scenario definitions across three phone projects (48 discovered items). It grew from the original 12 scenarios/36 items to cover offline Department save, parity #55 generation-to-visible-Events refresh, #38 discoverability confirmation, and #25 pending-request withdrawal; #26 re-enrollment extends the existing participant flow. `verify-programs.ts` and its unit test use 48. The old 63-case Programs suite remains active until each valid row has candidate-bound replacement evidence; the source audit found 10 exact, 53 partial, and no obsolete requirement. Focused #44 Worker/D1 denial evidence passed. The latest 48-case run reported 45 passed and three failures from one stale #38 assertion that expected the sticky save action to disappear; the assertion is removed, while the required zero-PATCH-before-confirmation check remains. Rerun the full gate on the clean candidate.

## Repository basis recorded at plan review

The checkout is on refactor/repo-wide-organization at HEAD b18828d42b6e152f2d29ed1f63df9c1681e59046; no tracked or staged changes were present at review. Git config sets status.showUntrackedFiles=no, so default status hides untracked paths. A full status scan shows numerous untracked artifacts, including generated files and this plan; their ownership has not been reviewed. Preserve them and recheck before cleanup. Local origin/main points to the same commit. Firecrawl's [public main commit feed](https://github.com/Noahlw/efcc/commits/main.atom) reported b18828d42b6e152f2d29ed1f63df9c1681e59046 at 2026-09-23 04:29:31 UTC. Recheck the remote before implementation because refs can change.

The app's web/next.config.ts selects output: export, which creates web/out/ and has no Next.js production server. web/wrangler.jsonc serves that directory through the Worker ASSETS binding and routes /api/* to web/worker.ts. This is a static-export-plus-Worker architecture, not Next.js SSR on Workers. The plan-review branch, current implementation worktree, and indexing generations are distinct; use direct checkout evidence for current claims.

The repository currently has two pnpm install roots and lockfiles. Root postinstall installs Playwright Chromium; root bootstrap performs two installs; web/package.json still has next start despite static export. Three GitHub Actions workflows exist. Root AGENTS.md currently limits D1 reset commands to E2E_ and E2E_DEMO_ fixtures, documents the existing local verification gates, and says never to deploy the stale efcc-prototype-129 Worker name.

The Codebase Memory project efcc-current-main is moderate and was generated on 2026-09-14. Its graph excludes docs, scripts, tests/e2e, web/migrations, and Storybook test files; web/worker.ts and the async-resource file have changed metadata. Use graph results only for covered source paths and directly inspect excluded or stale paths. The audit bundle contains the full tracked-file inventory, relationship map, test ledger, cleanup candidates, and uncertainty register.

## Plan to execute

### 0. Revalidate the candidate and record the acceptance trace

Before edits, read root AGENTS.md, TESTING.md, CONTEXT.md, and the relevant accepted ADRs. Confirm branch, base SHA, worktree state, package manager, and the current GitHub ruleset. Record the acceptance trace before web-app changes as required by AGENTS.md.

Create an implementation target inventory before touching Cloudflare config or D1. It must identify each Worker name, route, D1 database name and ID, rate-limit namespace, environment, and whether the D1 target is development/test or production. Do not infer identity from a placeholder comment or a familiar-looking ID. The observed local and unverified deployment values are recorded in [the target inventory](../implementation/repo-wide-organization-target-inventory.md).

The checked-in web/wrangler.jsonc currently names efcc-prototype-129, has compatibility date 2026-08-02, and contains comments that call configured-looking D1 and rate-limit values placeholders. Root AGENTS.md forbids using that stale Worker host and allows only confirmed efcc-auth-* or efcc-dev-* targets. After account inventory confirms the intended target, update the config name, date, bindings, and comments so source and operator truth agree. If account evidence is unavailable or ambiguous, leave those values unchanged, mark deployment configuration unverified, and stop before any deployment. Never use a guessed ID.

Inventory all local, shared, and manual development/test D1 targets and classify them by environment before reset. User authorization to rebuild applies only after a target is verified as development/test. Production or unknown targets are out of scope.

### 1. Consolidate pnpm installation without adding Turbo

Make the root pnpm-workspace.yaml the sole workspace manifest with packages: [web] as its package list and web/ as its application package. Keep one root pnpm-lock.yaml; remove web/pnpm-workspace.yaml and web/pnpm-lock.yaml only after reconciling package versions and policies.

Merge the effective install policy at the root. pnpm 11 uses `allowBuilds` for permitted and denied dependency lifecycle scripts; allow the required `esbuild`, `sharp`, and `workerd` scripts, and deny `msw` and `unrs-resolver`. The existing `msw.workerDirectory` causes MSW postinstall to rewrite a tracked Storybook worker on every install; remove that automatic sync and expose an explicit `storybook:update-worker` command for intentional updates. No active `minimumReleaseAge` is configured, so do not add a cooldown; remove obsolete release-age exclusions that have no active policy to constrain. Rehome web scripts behind root workspace commands; preserve an easy command for Next development, local Worker/D1 development, typechecking, tests, and Storybook. Remove the unsupported web `next start` script. Replace the Playwright postinstall download with one explicit local browser-install command.

Do not add Turbo. The repository has one deployable application, no internal shared packages or Dockerfile, and no measured repeated-task cache bottleneck. Official Turbo docs say turbo prune creates a partial monorepo for a target package; Docker is a common use, not the only use. That does not establish a current need here.

Acceptance:
- In a clean checkout, pnpm install --frozen-lockfile works from the root with no nested install or lockfile.
- Root commands reach the web build, typecheck, Worker/D1 suites, and Storybook.
- The production build emits the expected static export; local Wrangler serves assets and /api routes.
- Native/build dependencies work from a clean install without silent postinstall browser downloads.

### 2. Establish a safe D1 baseline before pruning fixtures

Keep Wrangler SQL migrations as the only migration ledger. Build a new development baseline from the current schema end state; preserve required tables, indexes, triggers, constraints, role seeds, audit immutability, and application behavior. Do not regenerate a Drizzle migration ledger.

First apply the proposed baseline to an empty disposable local D1 using Wrangler's local mode and the verified database name. Compare its schema to the audited end state and run representative auth, editable-role, Programs, attendance, and audit checks. Keep the historical migrations in Git until this passes. Once the baseline and seed process pass, rebuild only the exact development/test D1 targets in the verified inventory; do not run a remote migration against a production or unknown target.

Update AGENTS.md and TESTING.md to replace the current E2E_-only reset instructions with an explicit verified allowlist of disposable development/test targets. Keep the rule that production and unknown targets are never reset. Preserve the no-Google-Sheets-mutation rule only where it still represents a real external boundary; remove obsolete GAS importer instructions when the importer is retired.

Acceptance:
- An empty local D1 reaches the declared schema and seeds using the new baseline.
- Representative D1 behavior and audit immutability match the intended product outcome.
- Every reset command names an inventory-approved dev/test database; no generic command can select an unknown or production database.
- All shared/manual dev/test targets are reset only after the local baseline passes and the target identity is confirmed.

### 3. Replace Actions with one truthful local readiness gate

Before deleting workflow files, remove workflow-YAML coupling from scripts/verify-programs.test.ts, scripts/testing-authority.test.ts, scripts/audit-governance.ts, and any current policy/docs that parse them.

Define one canonical pnpm verify aggregate. It must run the curated local readiness suite, including:
- Typecheck and fast static checks.
- Worker/D1 contract tests.
- Real local Wrangler + D1 browser journeys.
- The existing Programs acceptance and responsive coverage.
- The five-case Home acceptance slice from step 5.
- The necessary non-browser regression and current component acceptance.
- Shell geometry as a separate presentation check, not a substitute for Worker/D1 behavior.

Pre-commit stays limited to formatting and fast static checks. During iteration, run affected checks. Keep the five-minute runtime canary separately labeled as diagnostic; an open canary is not evidence of a passing functional gate and does not become release approval.

Only after the local aggregate is reproducible on a clean candidate, remove .github/workflows/fast-ci.yml, ui-governance.yml, and e2e.yml. In the same implementation window, reread the live main ruleset and remove the Fast CI required status. Preserve review, conversation-resolution, owner, independent-review, device, and deployment gates. Do not alter unrelated protections.

Acceptance:
- pnpm verify from a clean candidate reaches every required local stage, reports exact stage results, and has zero retries for the required browser stage.
- A deliberate failure in each critical stage makes the aggregate fail.
- A fresh ruleset read shows no required check supplied by a deleted workflow; other protections remain.
- Documentation names local evidence accurately and never calls it Cloudflare deployment qualification.

### 4. Retire obsolete entry points after replacement evidence

External scanner:
- Retire prototype/scanner's Apps Script opener, standalone hosted camera flow, vendor copies, tests, scripts, aliases, and formatter exceptions as one slice.
- Keep web/app/scanner, web/lib/use-qr-camera.ts, barcode-detector, and the current ZXing WASM fallback.
- Trace external URLs and error-tag consumers before changing public identifiers.

Prototype route:
- Remove web/app/prototype/page.tsx and its CSS from the production export.
- Keep design review internal through existing Storybook/design material. Do not create another preview framework or ship mock login, account-upgrade forms, or prototype routes with production assets.
- Verify the built web/out has no /prototype route or mock login asset; separately confirm the existing Storybook material remains usable internally.

Google Sheets account import:
- Remove the one-time Users/PIN import and forced-upgrade branches plus their fixtures; there are no legacy accounts to migrate.
- Preserve ordinary username/password registration, account approval, role results, and audit outcomes for new accounts. The removed lockout covered only the retired legacy-PIN upgrade path; password-login brute-force protection remains a pre-production Auth requirement under #639.
- Search and update routes, tests, seed helpers, package scripts, README, AGENTS, and historical links. Preserve historical rationale where it explains past behavior; mark it retired instead of deleting decision history.
- Review web/worker.ts's old Apps Script error tag only after checking consumers; do not rename a public error identifier by assumption.

Acceptance:
- The current scanner completes its supported local Worker/D1 journey and the ZXing fallback still loads.
- Production static output has no /prototype route; internal Storybook/design review remains available.
- New-account signup, Pending-account denial, normal credential handling, editable role behavior, and relevant audit outcomes pass without old Sheets fixtures. The retired PIN-only lockout is not represented as a new-account guarantee.
- No test or script contacts or mutates Google Sheets.

### 5. Prove parity, then simplify the test slice

Remove the duplicated pre-commit invocation of the Programs contract suite only after its canonical owner remains in pnpm verify. For the seven pure suites (49 tests) currently selected by both jsdom and Worker/Node projects, retain the environment owner that proves the required behavior and remove only duplicate selection. Confirm test discovery counts after the change.

Keep the 68 old browser cases until every still-required behavior has executable replacement evidence: 63 programs-d1 cases plus five PUI-05 Home-origin cases. The 68-case CSV is a static mapping aid, not runtime acceptance. A non-empty ledger row or a Storybook story cannot prove parity.

Add the five Home cases described in the audit packet:
1. Home announcement and detail long-copy geometry.
2. Native browser Back closes only the announcement overlay and restores correct history.
3. Notices/Messages long-copy geometry.
4. Home to the selected Event detail, check-in, and back to Home.
5. Home Explore to the selected Program detail and back to Home.

Use 320, 390, 799, and 800 CSS pixels for both long-copy cases. Keep existing shell geometry separate. For Notices/Messages, seed through local Worker/D1 when proving transport or persistence; if a case uses synthetic route fulfillment, label it presentation-only and do not count it as Worker/D1 evidence.

Create tests/e2e/programs-home-acceptance.test.ts and tests/e2e/programs-home-acceptance.config.ts. Add a test:programs:home runner that emits a candidate-pinned JSON report with zero retries. Give the five behavior tests stable names corresponding to the old PUI-05 IDs. Use an isolated disposable createTestHarness and seeded member-visible content. Wire a home-browser-acceptance stage with expectedTests: 5 into scripts/verify-programs.ts and the canonical pnpm verify aggregate. Require zero retries and an exact old-ID to replacement-test mapping in the promotion manifest and verifier; reject missing, duplicated, or unrecognized mappings. Implementation amendment (2026-09-24): the original Browser stage discovered 12 scenario definitions in three phone projects (36 items). Offline Department-save recovery and parity #55 expanded it to 14 scenarios/42 items; parity #38 and #25 add two more scenarios, yielding 16 scenarios x 3 projects = 48. #26 extends the existing participant scenario. The verifier expects 48 Browser items; all retain zero retries.

Replace legacy account-import fixtures before removing that importer. After every old case is either covered by a named executable check or explicitly proven obsolete against current product authority, run the complete local aggregate against a clean candidate. Only then remove the programs-d1 suite/config and obsolete duplicate test inputs.

Acceptance:
- Each old valid case maps one-to-one to a named current test or a documented removed product requirement.
- The aggregate cannot pass if the five Home tests or a mapping is absent.
- The five named Home scenarios pass against local Worker/D1 and browser routes at zero retries; presentation-only evidence stays separately labeled.
- The historical suite is deleted only after candidate-bound parity evidence is recorded.

### 6. Remove dead dependency weight and correct module ownership

- Inspect the post-consolidation package graph with pnpm why. Only @vitest/browser and @vitest/browser-playwright remain direct browser adapters; Storybook's Vitest integration requires both, so keep them. Align root/web on Vitest 4.1.10 and TypeScript 5.9.3; pnpm why now reports one version each for Vitest, Vite, and TypeScript, and pnpm peers check reports no issues.
- Rehome web/lib/programs/use-async-resource.tsx only after checking all current callers. The current audit found seven direct non-Programs callers; verify against the implementation candidate before moving it.
- Remove default Next starter SVGs only after URL, manifest, CSS, and static-export checks.
- Remove dead scripts and aliases only after call-site and documentation search.
- Prefer domain modules under web/lib/<domain> and route composition under web/app. Do not add a factory, interface, package, or dependency for one owner/consumer.

Acceptance:
- Frozen install, typechecks, relevant Worker/browser checks, and exact import/URL searches pass.
- No command, consumer, or current route depends on a removed script, asset, or module.

### 7. Update current docs and prune history with provenance

Update README.md, CONTRIBUTING.md, TESTING.md, and AGENTS.md in the same implementation window as workspace and Actions changes. Keep current-state text truthful until the corresponding change lands. Document the static Next export plus Worker/D1 architecture, one workspace, pnpm verify, local setup, database reset allowlist, and the distinction between local, human/device, independent review, and deployment evidence. Keep CONTEXT.md as the single domain glossary and docs/adr/ as durable decisions. Add the Matt Pocock repository skill references under docs/agents/ and root AGENTS.md as separately approved documentation setup.

Add ADR-0056 for the accepted decision to remove GitHub Actions and use local-only verification. Verify the highest ADR number immediately before creating it. Keep ADR-0029's local Worker/D1 boundary; do not rewrite old ADRs or applied migration SQL.

Before deleting QA, delivery, design, or scratch artifacts, use the SHA/reference index. The audit packet covers 828 tracked artifacts: 340 with detected local references and 488 without a detected local text reference. The latter are candidates only; check current baselines, GitHub PRs/approvals, and external consumers first. Do not bulk-delete .scratch, docs/qa, .delivery, or .impeccable.

Acceptance:
- Current README/CONTRIBUTING/TESTING/AGENTS commands and status statements match the checked-in scripts and workflows.
- ADR numbers and links are valid.
- Every deleted generated artifact has a recorded SHA and reference disposition; externally referenced or current-baseline artifacts remain.

### 8. Run a bounded Drizzle-on-D1 trial only after Phase 1

Trial only the published-announcement read and DTO mapping in web/lib/home-handlers.ts:331-370. This is a read-only experiment; do not migrate writes, D1 batches, CAS, audit, or Wrangler migrations.

Preserve:
- Template B and Published rows only.
- Immediate publish or start_at at/before request time; end_at absent or later than request time.
- version descending then published_at descending.
- Home projection limit 1; announcements endpoint limit 20.
- Current null defaults and published_at-to-updated_at fallback.
- Existing route, auth, response, and error contracts.

The Worker/D1 test `keeps Home and Messages announcement windows, ordering, defaults, and limits` establishes the publish window, version/publish-time ordering, DTO defaults, Home projection result, and the 20-row announcements limit across 21 eligible rows. Use the D1 binding in the Worker and a typed schema for the trial query; keep Wrangler SQL migrations as the single ledger.

Adopt only if the complete first-party maintenance surface falls after counting schema, adapter, dependency, setup, test, and documentation costs; compile-time column/field safety improves; and behavior parity passes. Compare the authoritative files an agent must read for a field/filter change. Revert if setup and schema costs exceed the query/mapping saved. Do not claim performance improvement without a comparable Worker/D1 benchmark.

**Trial result (2026-09-24): not adopted.** A temporary `drizzle-orm@0.45.3` read adapter and query-only `home_content` schema passed all 14 `home-worker.test.ts` tests and `pnpm --filter web typecheck`. The source file grew by a net 24 lines and the trial added one production dependency; the typed schema remained a second handwritten mirror of the Wrangler SQL baseline, so it did not reduce the maintenance surface or establish generated schema safety. The existing Worker/D1 test already proves the query behavior. The adapter, schema, and dependency were removed, and the native prepared SQL query remains. No performance claim was made. Official documentation reviewed with Firecrawl because Context7 quota was exhausted: [Cloudflare D1 adapter](https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1), [SQLite select](https://orm.drizzle.team/docs/sqlite/select), [filter operators](https://orm.drizzle.team/docs/operators), and [Drizzle releases](https://github.com/drizzle-team/drizzle-orm/releases).

## Acceptance and review

For every candidate, record base and candidate SHA, exact command, result, runtime, and reviewer mode. New commits invalidate evidence tied to the prior candidate.

- During development, run affected checks.
- Before marking the implementation ready, run the one full local pnpm verify aggregate from a clean candidate.
- For UI changes, retain current Storybook owner spot-check and approved visual/interaction contracts. A Story or geometry check proves only presentation.
- Keep owner approval, independent review, real-device checks, Cloudflare configuration evidence, and deployment evidence distinct.
- Because this change crosses database reset rules, security behavior, test deletion, and deployment configuration, implementation slices require high-risk review at their named boundaries. If independent review is unavailable, record that limitation; do not lower acceptance.
- Compare four fixed coding-agent tasks before and after: one Programs behavior change, one UI change, one deployment/config change, and one query/field change. Keep prompt, model, and task outcome comparable. Record actual context/token telemetry when available, unique authoritative files opened, repeated instruction content, source/test/docs maintained, and rework turns. File/line counts are proxies only; report token savings only when measured.

### Local Worker test concurrency diagnosis (2026-09-24)

The first clean-candidate `pnpm verify` on `432b36c6f7aa2a88d08cbcb468de69afded30960` reached `pnpm test:workerd` after earlier stages passed, then reported 36 files / 507 tests and nine unhandled `Timeout starting cloudflare-pool runner` errors. Systematic diagnosis found host `availableParallelism() = 10`, making Vitest's default nine file workers the leading cause. The same complete Worker/D1 suite passed with `--maxWorkers=2` (45 files / 656 tests); after setting only `web/package.json`'s Worker `test` script to `vitest run --maxWorkers=2`, `pnpm test:workerd` again passed 45 / 656. This caps pool concurrency without skipping tests or changing component/Storybook concurrency.

Official Context7 documentation was queried on 2026-09-24: `/vitest-dev/vitest/v4.1.6` for `maxWorkers` and file parallelism defaults; `/cloudflare/workers-sdk` for the Vitest Workers pool startup behavior and supported pool options. The documented generic Vitest worker limit is the available control; no undocumented Cloudflare `singleWorker` or `isolatedStorage` option was added. The complete `pnpm verify` must be rerun on the committed candidate.

### PUI-05 Home report path diagnosis (2026-09-24)

On candidate `ec57e35c5822dd1a8cae09db95ec1b46681d7067`, the Worker Contract and 48-item Programs Browser stages passed. The Home Browser runner itself also passed all 5 mapped tests with zero retries, but promotion validation rejected case 64 because it compared Playwright's `programs-home-acceptance.test.ts` against a repository-relative `tests/e2e/programs-home-acceptance.test.ts`. The report records `config.rootDir` as the checkout's `tests/e2e` directory.

Context7 was queried on 2026-09-24: `/websites/playwright_dev` documents `FullConfig.rootDir` as the base for reporter-relative paths; `/microsoft/playwright` documents that the JSON reporter computes `file` with `path.relative(rootDir, absolutePath)`. The validator now checks the expected `tests/e2e` root, resolves reported paths against it, and keeps exact repository-file mapping and root-escape rejection. A fixture using the actual JSON shape failed before the fix and passed after; `pnpm test:programs:promotion` passes 15/15. Rerun the full aggregate on the committed fix.

### Recovery focus test synchronization (2026-09-24)

The full aggregate on `b4d80ec98b975945f1e948740a50dd67e3998054` stopped in the component suite: 62 files / 1,183 tests passed, and the single failure was `authenticated-shell.test.tsx` asserting `document.activeElement` immediately after the Retry button appeared. `RecoveryView` moves focus in a React `useEffect`; the same test passes when isolated, and the 2026-09-14 salvage record also notes this recovery-focus failure passed in isolation. Existing async focus tests use Testing Library `waitFor`.

The assertion now waits for the same `<main>` element to become active, retaining the focus requirement while allowing the effect to settle. The focused test passes; rerun the full aggregate on the committed candidate.

### Browser access-load interruption (2026-09-24)

The full aggregate on `a83be70d462fddb0190f51d4cbb29dbe02ef4491` passed the Worker Contract stage, then the 48-item Browser stage reported 47/48: #26 failed at phone-360 while the page remained at “checking management access.” The trace shows the `GET /api/v1/programs/access` request had no response before Playwright closed the failed context; #26 passed at phone-390 and phone-402. This is an unresolved local runtime/test-stage interruption, not evidence that the program projection returned an incorrect row.

The repository's official `pnpm test:programs:browser` runner was rerun on the same SHA with a fresh disposable local Worker/D1 harness: **48/48 passed**, zero skips/retries/flakes; #26 passed at 360, 390, and 402px. No product or test assertion was changed. The failure is not yet reproduced; rerun the full aggregate on the clean candidate and retain the failure trace if it recurs.


### Shell-responsive server port diagnosis (2026-09-24)

The full aggregate on `6614fcac37d7f80f5c3a9df0d4a0d1f3154e7c9e` passed its earlier stages and then timed out waiting for the shell-responsive server on port 4173, which was owned by another workspace. A module-level random-port attempt was also invalid: the web-server report selected 61876 while Playwright tests navigated to 63139 because the config was loaded in separate processes.

The canonical command now runs `scripts/run-shell-responsive.mjs`. It builds the static export first, asks Node's `node:net` server for one OS-assigned port, then passes the port as `RESPONSIVE_TEST_PORT` to Playwright. The config uses that same value for `baseURL`, metadata, server readiness, and the static server's `PORT`; the server does not reuse an unrelated process. Context7 returned the official configuration example for `/microsoft/playwright.dev` on 2026-09-24, showing environment-backed `use.baseURL` and separately configured `webServer.port`. Its follow-up about dynamic allocation was blocked by the monthly quota. Firecrawl then checked the pinned official Node.js v22.18.0 `net` docs on 2026-09-24: `listen(0)` requests an OS-assigned unused port and `server.address().port` is available after listening.

With HEAD `4dd1d258426086eb4fb3487e10d44e0d1c865ac9` and the runner/config changes in the working tree, `pnpm test:shell-responsive` passed **92 tests**, with the existing mobile-only profile case skipped in the desktop project; zero failures, 18.7 seconds in Playwright. The JSON report records shared URL `http://127.0.0.1:50759`; a post-run listener check found no process on that port. This focused pass does not replace the final clean-candidate `pnpm verify`.

## Manual prerequisites and blockers

- Cloudflare API GET on 2026-09-24 returned zero D1 databases and zero Worker scripts in its connected account; Wrangler `whoami` reported that the local token had expired. This does not establish that EFCC has no resources under another account. Worker, route, D1, and rate-limit identities remain unverified; no deployment identity was changed and no remote D1 was touched.
- The current worktree's Wrangler-local D1 was empty, was rebuilt from `0000_baseline.sql`, and was seeded successfully. No shared or manual development/test target was inventoried or reset. Verify each exact target before a remote reset.
- GitHub ruleset `20586715` was read again on 2026-09-24 and still requires `Fast CI`. The GitHub connector exposes GET-only ruleset access, local `gh auth status` reports an expired token, and desktop browser control timed out before a UI session could be inspected. The workflow/ruleset removal remains blocked. `.github/CI-SECRETS.md` is now a retirement notice because the still-present manual workflow referenced the deleted credential runbook; it contains no target or secret values. Re-read before any later ruleset change; do not claim the main-branch gate has been removed.
- **Runtime URL/error-tag search completed (2026-09-24):** no Apps Script `/exec` URL or `APPS_SCRIPT_EXEC_URL` remains under `web/`, `tests/`, or `scripts/`; the Worker and current API handlers still emit `tag:apps-script/efcc/errors#…` as the RFC 9457 `type`. Keep that response identifier stable in this cleanup and consider a rename only as a separately reviewed API-contract change. Historical ADR/spec references remain historical evidence.
- Auth emergency-revocation and password-login brute-force/rate-limit policy remain pre-production blockers for the deferred #639 work; neither is closed by a library comparison or decision map.
- GitHub CLI authentication is invalid in this local shell. The three missing triage labels were created and read back through the authenticated GitHub web UI on 2026-09-23; reauthenticate before future CLI writes.
- The external audit packet is stored outside Git at /Users/noah.wong/.codex/.chatgpt-projects/g-p-6a6864559f34819191b9adf15a4279da/efcc-main-audit-2026-09-23/. Key files: inventory.csv, knowledge-map.html, cleanup-plan.md, uncertain-items.md, artifact-reference-index.csv, programs-d1-test-level-parity.csv, programs-home-parity.md, ponytail-audit-2026-09-23.md, auth-options.md, and wayfinder-auth/map.md. Recheck the audited SHA before reuse.

## Official documentation checked 2026-09-24

Context7 (library resolution for Vitest was blocked by the monthly quota on 2026-09-24; no Context7 Vitest ID was returned, so the official versioned Firecrawl docs below were used):
- /pnpm/pnpm.io — workspace package globs, shared root lockfile, and workspace-wide installs.
- /cloudflare/cloudflare-docs — D1 migrations, d1_migrations history, and explicit local versus remote apply.
- /drizzle-team/drizzle-orm-docs — drizzle(env.DB) and schema-backed typed D1 queries.
- /drizzle-team/drizzle-orm-docs — Cloudflare D1 driver import, `sqliteTable` schema, and typed `.select().from(...).all()` query.
- /llmstxt/developers_cloudflare_workers_llms-full_txt — Wrangler D1 migrations use explicit `--local` or `--remote`; local persistence options are available only with `--local`.
- /vercel/turborepo — target-package pruning creates a partial monorepo; Docker is a common use rather than the only use.
- /microsoft/playwright.dev — Playwright Test configuration example uses an environment variable for `use.baseURL` and configures `webServer.port`; Context7 query on 2026-09-24.

Firecrawl, official docs:
- [pnpm Workspaces](https://pnpm.io/workspaces)
- [Next.js static export](https://nextjs.org/docs/app/guides/static-exports)
- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Playwright best practices](https://playwright.dev/docs/best-practices)
- [GitHub ruleset rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)
- [Dependabot options reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference) — `directory`/`directories` select manifest locations; the reference does not specify pnpm workspace discovery. EFCC now has one root pnpm lockfile and workspace manifest, so Dependabot keeps one root npm-ecosystem entry.
- [Vitest 4 migration guide](https://v4.vitest.dev/guide/migration) and [Vitest 3 migration guide](https://v3.vitest.dev/guide/migration) — official versioned guides used for the root/web test-runner alignment.
- [Node.js v22.18.0 `net` API](https://nodejs.org/download/release/v22.18.0/docs/api/net.html#serverlistenport-host-backlog-callback) — Firecrawl checked ephemeral-port assignment and `server.address()` behavior on 2026-09-24.

## Agent handoff

The approved local implementation is active on refactor/repo-wide-organization-implementation. The canonical plan and dated audit packet remain the requirements source. The single workspace, local D1 baseline, retired prototype/import paths, Home Browser slice, docs, and selected test reductions are implemented in the dirty candidate. The Drizzle trial was rejected under the agreed stop rule, so raw SQL and Wrangler migrations remain. The full Programs old suite is retained. The original source audit found 10 exact, 53 partial, and 0 obsolete; focused #44 Worker/D1 proof passed, and the 48-item Browser run reached 45 passes. Its only failing scenario was #38's assertion that the save action disappears, which no longer matches the sticky settings footer; the source now asserts zero PATCH requests before confirmation instead. #25 and #26 run in the 48-item suite. Do not remove programs-d1 until every valid row has candidate-bound replacement evidence.

Frozen install, root/e2e typecheck, formatting, and the 15-test Programs promotion unit suite passed. The static production build omitted /prototype; Storybook 95/95, ProgramWorkspace 86/86, and focused Worker/D1 PATCH evidence passed earlier on the dirty candidate. Rerun the complete Browser stage and `pnpm verify` on a clean committed candidate, then obtain independent review. Keep Auth library/provider work deferred and do not claim production readiness while emergency revocation or password-login rate limiting remains open.

No push, merge, deployment, remote D1 mutation, or GitHub ruleset write has occurred. The connected Cloudflare account still returned no D1/Worker resources, and main still requires Fast CI; do not delete the three workflows or change remote resource identity until those exact external prerequisites are available.
