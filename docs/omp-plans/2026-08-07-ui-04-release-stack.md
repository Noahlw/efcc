# UI-04 Release Stack and Live UI Implementation Plan

> **For OMP workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Dispatch each task as a fresh `task` subagent; gate between tasks with the OMP `reviewer` agent (the code-review skill's Spec axis).

**Goal:** Move the approved current live-UI redesign from the dirty downstream checkout into the existing `ui-04-196` stacked branch, make PR #205 reviewable with complete evidence, and stage the separate deployed `/exec` acceptance gate without shipping a production credential backdoor.

**Architecture:** Preserve the existing PR stack and apply the user-selected broad UI scope to PR #205's head branch in the existing isolated `ui-04-196` worktree. Reuse the current Next.js static frontend, cookie-auth API boundary, shared session/bootstrap helpers, SectionView, AccountSettings, ApprovalQueue, and established Traditional-Chinese copy modules; do not add a second auth system. The `noah/6883` path is a development-only local demo session, while online authentication remains D1-backed cookie auth.

**Tech Stack:** Next.js 16.2.12, React 19, TypeScript, Cloudflare Worker + D1, Vitest/workerd, Testing Library, Playwright, Wrangler, pnpm 11.7.0.

## Global Constraints

- Target worktree: `~/.omp/wt/ui-04-196`, branch `ui-04-196`; current dirty source worktree: `~/orca/workspaces/EFCC-dev/main`, branch `prg-05-201`.
- PR #205 is open with head `f6f535d`/`ui-04-196`, base `ui-03-195`/PR #204, and is the fourth link in the stack `#202 → #203 → #204 → #205 → #207 → #208 → #209 → #210 → #211`.
- User explicitly selected scope **5B**: transplant all current UI changes, not only the UI-04 account-settings delta. Preserve that decision; do not silently split or discard the landing, Profile, settings, registration, approval, prototype, shell, copy, or test changes.
- Downstream PRs #207–#211 own the Programs domain. Exclude `web/lib/programs/`, `web/app/programs/`, `web/migrations/0002_d1_program_domain.sql`, `tests/e2e/programs-d1.*`, `.github/workflows/e2e.yml`, `.github/CI-SECRETS.md`, and any later Programs route/copy/config hunks from this transplant. Retain the earlier UI-04-owned `web/migrations/0002_retire_teacher.sql` role-retirement migration. In shared files, keep only the selected UI hunks and do not pull downstream `/api/v1/programs/*` routes or PRG role-renames.
- Keep `.codex/`, `.cursor/`, `.impeccable/config.json`, `.impeccable/config.local.json`, and `local/` out of the PR. They are local tooling/user artifacts, not the selected UI change set. Include the selected untracked UI/E2E paths: `web/app/profile/settings/`, `web/lib/approval-queue.module.css`, and the new `tests/e2e/live-ui.*` gate files.
- `noah/6883` MUST remain development-only (`process.env.NODE_ENV !== "production"`) in both the live login and the exported prototype gallery; production login continues through `/api/v1/auth/login` and `/api/v1/auth/me`. Never seed or expose a hard-coded online Staff backdoor.
- Identity, credentials, sessions, and login decisions remain owned by Worker + D1. Do not edit the Google Sheet or Users tab.
- Use canonical roles `Admin`, `Staff`, and `Member`; use `Section`, not page/screen, in user-facing domain language. Preserve zh-Hant copy and existing accessibility contracts.
- Preserve the existing cookie-only auth boundary: no browser token/session storage, no auth headers, and no production fallback session.
- Web UI changes require a written acceptance trace before transplanting them into the target branch. This plan is that pre-transplant trace; append observed verification results after execution.
- `READY` requires both the mandatory fresh `/exec` UI acceptance trace and a fresh deployed isolated Worker target with 100% pass of the dispatched authenticated D1 Playwright gate. The `/exec` browser trace and D1 API smoke are separate proofs; local checks alone can establish merge evidence, not release readiness.
- Force-push is destructive. The target worktree is 23 commits ahead of `origin/ui-04-196`; updating PR #205 from its remote head requires explicit user approval for `git push --force-with-lease` after local review.

## File Structure & Changes

### Current UI change set to transplant

- Modify `web/app/page.tsx`: Variant A landing/login composition, local development credential branch, legacy upgrade flow preservation, and real API login path.
- Modify `web/app/page.module.css`: minimal civic landing/login layout, responsive phone-first form behavior, focus/reduced-motion treatment, and no marketing hero.
- Modify `web/lib/session.ts`: development-only demo-auth flag/bootstrap plus normal cookie-session restoration; clear both flags on auth exit.
- Modify `web/lib/app-shell.tsx`: stable mount guard under development Strict Mode while preserving restore/error/forbidden behavior.
- Modify `web/lib/app.test.tsx`: live login, local demo login, shell restoration, and route-state regression coverage.
- Modify `web/app/profile/page.tsx` and `web/app/profile/profile.module.css`: Profile identity/QR surface and Account Settings navigation/layout.
- Modify `web/app/profile/account-settings.tsx` and `web/app/profile/account-settings.module.css`: real API-backed username/password forms, validation, recovery, success, and responsive layout.
- Create `web/app/profile/settings/page.tsx` and `web/app/profile/settings/settings.module.css`: dedicated Account Settings route that reuses the existing component and its scoped layout.
- Modify `web/app/registrations/page.tsx`, `web/lib/approval-queue.tsx`, `web/lib/registration-copy.ts`, and `web/lib/copy.ts`: approval queue composition, guarded RPC behavior, canonical Staff/Admin copy, Church Time formatting, and state/error handling.
- Create `web/lib/approval-queue.module.css`: scoped Variant A queue styles and responsive table behavior.
- Modify `web/app/prototype/page.tsx` and `web/app/prototype/prototype.module.css`: expanded all-surface prototype with local gallery login and the selected visual contract.
- Modify `tests/e2e/README.md` and `tests/e2e/plan-doc-appender.ts`: document the isolated `efcc-auth-*` host, role fixtures, Next UI gate, and non-overwriting evidence sections.
- Modify `CONTEXT.md`: add the resolved distinction between a development-only Local Demo Session and a production D1 Session without recording implementation details as domain language.
- Create `docs/omp-plans/2026-08-07-ui-04-release-stack.md`: this acceptance trace, migration plan, and appended verification record.

### Explicitly excluded local artifacts

- `.codex/`, `.cursor/`, `.impeccable/config.json`, `.impeccable/config.local.json`, and `local/` remain in the source worktree and are not staged.

### Explicitly excluded downstream ticket scope

- `web/lib/programs/`, `web/app/programs/`, `web/migrations/0002_d1_program_domain.sql`, `tests/e2e/programs-d1.*`, `.github/workflows/e2e.yml`, and `.github/CI-SECRETS.md` remain owned by PRs #207–#211 and are not staged in PR #205. The earlier UI-04-owned `web/migrations/0002_retire_teacher.sql` remains in this branch.
- Shared `web/lib/copy.ts`, `web/worker.ts`, `web/lib/auth/handlers.ts`, and `web/vitest.components.config.ts` receive only the UI-04-owned hunks; later Programs routes, role migrations, and Programs test registrations stay downstream.

## What Already Exists

- `web/lib/api.ts` already owns the cookie-only auth client, including `authLogin`, `authMe`, `authUpgrade`, and Account Settings mutations.
- `web/lib/session.ts` already owns the non-secret presence hint and cookie-verified `Bootstrap` restoration; the local demo branch is an explicitly bounded development exception.
- `web/lib/sections.ts` already provides the canonical six-section baseline used to construct a local demo bootstrap.
- `web/lib/app-shell.tsx` already owns authenticated shell restoration, recoverable errors, forbidden state, logout, and deep-link return.
- `web/app/profile/account-settings.tsx` already owns the Account Settings mutation state machine and calls the Worker endpoints established by UI-04.
- `web/lib/approval-queue.tsx` already owns registration list/reject behavior; the transplant changes its presentation and state rendering without replacing its RPC contract.
- `web/app/_sections/section-view.tsx` already owns honest placeholder Sections for Events, Scanner, Care, and Permissions. Do not invent missing RPC behavior.
- `docs/omp-plans/2026-08-06-ui-04-ticket-196.md` is the original UI-04 backend/account-settings acceptance trace and remains the authority for the API contract.
- `docs/specs/079-minimal-product-redesign-contract.md` is the visual/all-surface acceptance authority.

## Not In Scope

- Making `noah/6883` work against the online Worker or adding an online demo Staff account.
- Changing the Worker authentication contract, D1 schema, credential policy, session cookies, or rate limiting to support the local fixture.
- Editing the Google Sheet, `Users` tab, or production Apps Script data.
- Rewriting downstream Programs PRs (#207–#211) or merging the entire chain in one destructive operation.
- Adding domain RPCs for Events, Scanner, Care, or Permissions; those surfaces remain honest placeholders until their specifications and handlers exist.
- Deploying a target before the target host, D1 database, migrations, secrets, and acceptance accounts are provisioned.
- Force-pushing `ui-04-196` without explicit user approval.

## Acceptance Trace

The following criteria must be asserted against observable DOM/state before the branch is called merge-ready. Authenticated browser assertions use the project Playwright pipeline; unauthenticated/CSS checks use the local browser or static responsive suite.

| ID | Criterion | Evidence method |
|---|---|---|
| L1 | Signed-out landing uses the approved minimal civic Variant A composition, with no SaaS hero or invented claims. | Desktop and 375px browser screenshots plus DOM heading/form inventory. |
| L2 | Login inputs, submit button, upgrade fields, error states, recovery states, registration link, focus ring, and 44px controls remain accessible. | `web/lib/app.test.tsx`, responsive Playwright, keyboard/focus assertions. |
| L3 | `noah`/`6883` accepts only in development, writes only non-secret local demo state, and routes to `/profile` without `/api/v1/auth/login` or `/api/v1/auth/me`. | Component regression test plus localhost browser flow. |
| L4 | Any other development credential and every production credential follow the existing Worker API path; invalid credentials keep the existing safe error behavior. | Existing auth component/API tests and production-build inspection of the guard. |
| L5 | Local demo restoration produces a Staff bootstrap with Profile, Programs, Events, Scanner, Care, and Permissions sections; logout clears the demo state. | `restoreBootstrap`/shell component tests and `/profile` browser DOM. |
| L6 | AppShell does not remain in `正在還原工作階段…` under Next.js development Strict Mode; ready, error, forbidden, retry, and deep-link transitions remain intact. | AppShell component tests and live `/profile` browser reload. |
| P1 | Profile renders Noah identity/status/QR data from the bootstrap and exposes a real Account Settings link. | Authenticated browser DOM assertion and Profile component tests. |
| P2 | `/profile/settings` renders both username/password forms, required fields, validation, inline errors, success, network recovery, focus handoff, and back-to-Profile navigation. | Account Settings component tests and authenticated browser DOM assertions. |
| A1 | Registration approval renders loading, empty, error, refresh, success/reject notices, accessible heading/table/action names, and real RPC behavior. | Approval queue component tests and authenticated browser DOM assertions. |
| S1 | Events, Scanner, Care, and Permissions render named Section headings and honest `內容建置中` states without fake RPC calls. | Section component tests and authenticated DOM checks. |
| V1 | Prototype gallery covers the agreed all-surface design states, includes Admin/Staff/Member role simulation, and keeps local gallery login development-only. | Prototype tests, typecheck, production guard assertion, and local browser surface sweep. |
| V2 | Approval is visible only for Admin/Staff in the prototype role simulation; Member sees the forbidden state or no approval action. | Role-specific DOM assertions for all three canonical roles. |
| R1 | Root/web typechecks, root tests, web worker tests, component tests, responsive Playwright, the Impeccable detector, and production build pass. | Fresh command output appended below. |
| R2 | Both the policy-required fresh `/exec` trace and an executable browser trace against the rebuilt Next frontend pass. The Next trace targets the deployed web root (or `/exec` only if that deployment actually exposes the Next frontend there) and asserts login, registration-form rendering, shell, Profile, Account Settings, approval, authorized/forbidden states, safe invalid-login error, and responsive DOM state at 375x667. Network recovery remains covered by the deterministic component contract; the live trace does not induce failures or mutate registration/approval rows. | Legacy `/exec` Playwright artifact plus the new `tests/e2e/live-ui.test.ts` artifact and separately headed plan-appender sections; all are required before `READY`. |
| R3 | Fresh deployed Worker target passes the complete dispatched D1 auth acceptance suite with all acceptance accounts and secrets supplied out-of-band. | GitHub Actions `deployed-auth` artifact and `auth-d1-results.json`; separate from R2 and also required before `READY`. |

## Data Flow

```text
Signed-out Login
      |
      +-- development && (username,password) == (noah,6883)
      |       -> local demo flag + presence hint
      |       -> Staff Bootstrap (no token/cookie)
      |       -> /profile
      |
      +-- otherwise -> POST /api/v1/auth/login
              |
              +-- mustSetNewCredential -> one-time Legacy-PIN upgrade form
              |
              +-- normal success -> cookie session -> GET /api/v1/auth/me
                                      -> Bootstrap -> first authorized Section

Authenticated route
      -> AppShell.restoreBootstrap()
      +-- local demo flag (development only) -> local Staff Bootstrap
      +-- cookie hint -> /me, refresh if required -> server Bootstrap
      +-- no/expired auth -> signed-out route with deep-link preservation
```

## Stack and Worktree Strategy

- Work only in the existing isolated `~/.omp/wt/ui-04-196` worktree for target-branch edits.
- Preserve the current `prg-05-201` source worktree and exclude its tooling artifacts.
- Apply the tracked diff and the two intended untracked code paths to `ui-04-196`; do not hand-copy unrelated downstream commit history.
- Keep the existing 23 local review-fix commits on `ui-04-196`; do not reset them. The branch currently points at `dd3cb67`, while `origin/ui-04-196` points at `f6f535d`.
- Commit in coherent slices on top of the target branch. Do not merge #204 or downstream PRs from this worktree.
- Run the deterministic checks before any push. A reviewer must inspect the final diff against the PR's intended scope and the acceptance trace.
- Updating PR #205 requires force-with-lease because the local target branch is ahead of its remote head. Stop before that push until the user explicitly authorizes the destructive operation.

## Failure Modes & Gaps

- **Online auth remains unresolved:** the local fixture is intentionally disabled in production. The remote D1 acceptance target needs real disposable accounts and the five `AUTH_*` secrets; a public `noah/6883` fallback is prohibited.
- **Fresh `/exec` gate unavailable:** local tests cannot substitute for the deployed Worker acceptance trace. Until the dispatched gate passes 100%, status is merge evidence only, not `READY`.
- **PR body is stale:** PR #205 currently reports earlier test counts and only the original UI-04 scope. Update it after the final test counts are known, using the repository PR-description format and retaining `Closes #196`.
- **Stack dependency:** #205 is based on #204. It may be reviewed now but cannot merge directly to `main` until its base stack is merged or the stack is deliberately restacked.
- **Broad ticket scope:** user explicitly chose 5B, so the final PR will combine the account-settings slice with the live UI/prototype rebuild. The PR description must state this intentionally rather than presenting it as only UI-04.
- **Prototype/demo state is not production identity:** localStorage flags are convenience state only; they must never be accepted by a production build or Worker.

---

## Execution Tasks

### Task 1: Record domain terms and acceptance trace

**Files:**
- Modify: `CONTEXT.md`
- Create/modify: `docs/omp-plans/2026-08-07-ui-04-release-stack.md`

**OMP dispatch:**
- Agent type: `task` (default worker), operating only in `~/.omp/wt/ui-04-196`.
- Reviewer gate: `reviewer` checks that glossary terms are domain-only and the acceptance criteria are observable, complete, and consistent with ADR-0020/ADR-0012.

**Interfaces:**
- Produces the canonical terms **Local Demo Session**, **Production Session**, **Merge-ready**, and **Release-ready** for later tasks; no implementation detail belongs in the glossary.

- [ ] Add the glossary distinction: a Local Demo Session is a development-only walk-through identity with no server-issued credential; a Production Session is a Worker/D1 cookie-validated session. Use `_Avoid_` lines for ambiguous “demo account”/“real login” language.
- [ ] Keep this release plan as the pre-transplant acceptance trace; do not rewrite the original UI-04 API trace.
- [ ] Reviewer verifies every criterion has an observable assertion method and no criterion assumes a click succeeded without DOM evidence.
- [ ] Commit message: `docs: define local demo and release readiness boundaries`.

### Task 2: Transplant landing, local auth, and shared shell

**Files:**
- Modify: `web/app/page.tsx`
- Modify: `web/app/page.module.css`
- Modify: `web/lib/session.ts`
- Modify: `web/lib/app-shell.tsx`
- Modify: `web/lib/app.test.tsx`

**OMP dispatch:**
- Agent type: `task`.
- Reviewer gate: `reviewer` checks the local/prod auth boundary and that normal auth behavior is unchanged.

**Interfaces:**
- Consumes: `Bootstrap`, `PublicUser`, `defaultSections()`, `authLogin`, `authMe`, `authUpgrade`, and existing `AppShell` contracts.
- Produces: `isLocalDemoCredentials(username: string, password: string): boolean`, `setLocalDemoAuth(): void`, `buildLocalDemoBootstrap(): Bootstrap`, and a restorable local demo state consumed by `restoreBootstrap()`.

- [ ] Apply only the intended landing/session/shell diff from the current source worktree; preserve the existing normal API login, forced-upgrade, expiry, forbidden, recovery, deep-link, and logout branches.
- [ ] Keep `noah/6883` behind the development guard; production builds must fall through to `authLogin`.
- [ ] Assert the local fixture never calls auth endpoints and sets no token/session identifier; assert wrong credentials still render the existing safe error.
- [ ] Assert a development shell reload resolves to the local Staff bootstrap and that logout clears both presence/demo flags.
- [ ] Run `pnpm --dir web exec vitest run --config vitest.components.config.ts lib/app.test.tsx`.
- [ ] Commit message: `feat(web): align live landing and local shell demo`.

### Task 3: Transplant Profile and Account Settings surfaces

**Files:**
- Modify: `web/app/profile/page.tsx`
- Modify: `web/app/profile/profile.module.css`
- Modify: `web/app/profile/account-settings.tsx`
- Modify: `web/app/profile/account-settings.module.css`
- Create: `web/app/profile/settings/page.tsx`
- Create: `web/app/profile/settings/settings.module.css`

**OMP dispatch:**
- Agent type: `task`.
- Reviewer gate: `reviewer` checks that the forms remain API-backed and no auth/session contract was duplicated.

**Interfaces:**
- Consumes: `useApp().bootstrap`, `AccountSettings`, `COPY.profile`, `COPY.accountSettings`, and existing username/password RPC wrappers.
- Produces: a Profile surface with a real `/profile/settings` navigation boundary and a responsive, accessible Account Settings sub-surface.

- [ ] Preserve Profile identity, status, QR, empty state, and role display while adding the settings action and responsive layout.
- [ ] Preserve both API-backed forms, all existing validation/error/recovery/success branches, session revocation behavior, and `efcc_account_updated` handoff.
- [ ] Ensure the dedicated route is reachable from Profile and returns to Profile without exposing credentials in URL/storage.
- [ ] Run the existing Account Settings and Profile component tests plus a DOM route check.
- [ ] Commit message: `feat(web): complete profile and account settings surfaces`.

### Task 4: Transplant approval queue and remaining Section surfaces

**Files:**
- Modify: `web/app/registrations/page.tsx`
- Modify: `web/lib/approval-queue.tsx`
- Create: `web/lib/approval-queue.module.css`
- Modify: `web/lib/copy.ts`
- Preserve/verify: `web/app/_sections/section-view.tsx` and its module CSS

**OMP dispatch:**
- Agent type: `task`.
- Reviewer gate: `reviewer` checks real RPC ownership, role gating, accessible table/action semantics, and honest placeholder boundaries.

**Interfaces:**
- Consumes: `fetchPendingRegistrations`, `ApprovalQueue`, `SectionView`, canonical copy, and the existing Staff/Admin guard.
- Produces: Variant A approval presentation and unchanged Events/Scanner/Care/Permissions placeholder Sections.

- [ ] Keep approval fetch/reject/refresh handlers and guarded routes unchanged; only move presentation/state/copy/styles to the scoped module boundaries.
- [ ] Keep direct 401/403 access on the shared forbidden state with a safe Profile action; format submitted timestamps in `Asia/Hong_Kong`; retain loading/live announcements and canonical `Staff`/`Admin` copy.
- [ ] Assert loading, empty, error, success, reject, and refresh states through observable DOM text and roles.
- [ ] Keep all four unimplemented Sections honest; do not add fake data or client-only authority.
- [ ] Run approval queue, SectionView, registrations, and role-gating tests.
- [ ] Commit message: `feat(web): align approval and section surfaces`.

### Task 5: Transplant and verify the expanded prototype gallery

**Files:**
- Modify: `web/app/prototype/page.tsx`
- Modify: `web/app/prototype/prototype.module.css`
- Modify: `web/lib/app.test.tsx` only if prototype assertions require shared test updates

**OMP dispatch:**
- Agent type: `task`.
- Reviewer gate: `designer` checks the approved Variant A visual world and `reviewer` checks prototype-only boundaries.

**Interfaces:**
- Consumes: `Surface`, `AuthorizedRole`, `SECTION_ITEMS`, existing mock surface renderers, and the local gallery-only credential path.
- Produces: a self-contained design/prototype gallery that cannot mutate production auth state.

- [ ] Preserve the gallery controls and all-surface states while aligning login, Profile, Account Settings, approval, loading, empty, error, forbidden, recovery, and role-gated views with Spec 079.
- [ ] Expand `AuthorizedRole` and the role selector to canonical `Admin`, `Staff`, and `Member`; Admin and Staff expose all six Sections, Member exposes Profile and Programs, and Approval is forbidden or absent for Member.
- [ ] Keep `noah/6883` in the gallery as a mock-only navigation convenience only when `NODE_ENV !== "production"`; it must not call the Worker or write the production session flag, and the production build must not leave an unconditional credential comparison.
- [ ] Verify desktop/mobile composition, no overflow, focus-visible rings, reduced motion, and no AI-slop visual patterns.
- [ ] Run prototype tests and local browser screenshots at desktop and 375px.
- [ ] Commit message: `feat(prototype): expand the current minimal surface contract`.

### Task 6: Run deterministic verification and append evidence

**Files:**
- Modify: `docs/omp-plans/2026-08-07-ui-04-release-stack.md`
- Modify: `docs/omp-plans/2026-08-06-ui-04-ticket-196.md` only if its final verification section needs the new observed counts; do not alter its pre-implementation criteria.

**OMP dispatch:**
- Agent type: `task` for commands/evidence; no formatter or project-wide validation inside the worker before the task's explicit commands.
- Reviewer gate: `reviewer` checks the results against R1/L1–V2 and rejects any claim not backed by command output or DOM evidence.

- [ ] Run `pnpm typecheck` from the repository root.
- [ ] Run `pnpm --dir web typecheck` and require zero diagnostics in both the Next app and Worker TypeScript configs.
- [ ] Run `pnpm test` from the repository root.
- [ ] Run `pnpm --dir web test` for Worker/auth contracts.
- [ ] Run `pnpm --dir web test:components` for all UI component contracts.
- [ ] Run `pnpm test:shell-responsive` for 375px and desktop shell accessibility/overflow.
- [ ] Run `node /Users/noah.wong/.omp/agent/skills/impeccable/scripts/detect.mjs --json --scope type,layout web/app/page.tsx web/app/page.module.css web/app/profile web/app/registrations web/lib/approval-queue.module.css web/app/prototype`; require zero counted findings.
- [ ] Run `pnpm --dir web build` and confirm all expected static routes, including `/profile/settings` and `/prototype`, emit successfully.
- [ ] Drive localhost with the browser: clear storage, enter `noah`/`6883`, assert URL `/profile`, assert visible `Noah`, `Staff`, and navigation labels; reload `/profile`, assert `工作階段已還原` then the Profile DOM; sign out and assert `/`.
- [ ] Append exact counts, route evidence, and known warnings to this plan. Do not call the result `READY` yet.
- [ ] Commit message: `test: record release stack verification evidence`.

### Task 7: Review and prepare PR #205 for merge

**Files:**
- Modify: PR #205 body through `gh pr edit` only after the final diff and counts are known.
- Modify: `docs/omp-plans/2026-08-07-ui-04-release-stack.md` with review findings and disposition.

**OMP dispatch:**
- Agent type: `reviewer` for Standards and Spec axes against the final target-branch diff.
- Reviewer gate: final reviewer must report no unresolved P1/P2 spec or security findings.

- [ ] Compare the target branch against `origin/ui-04-196` and inspect every selected file; ensure excluded local artifacts are absent.
- [ ] Confirm the PR body states the intentional 5B broad scope, keeps `Closes #196`, links the release plan, lists exact fresh test counts, and distinguishes merge-ready from deployed READY.
- [ ] Run the repository code-review skill's Standards and Spec reviews; resolve findings before push.
- [ ] Prepare, but do not execute, `git push --force-with-lease origin ui-04-196` until the user explicitly approves the destructive push.
- [ ] Confirm #204 is the base dependency and list the correct merge order; do not claim #205 can merge directly to `main` while the base remains open.

### Task 8: Deploy and run the online acceptance gate

**Files/config:**
- Deploy-time only: `web/wrangler.jsonc` placeholder D1 ID/rate-limit values; do not commit deployment-only replacements.
- Modify: `tests/e2e/README.md` to replace the stale `efcc-prototype-129` operator flow with the reserved `efcc-auth-*` namespace and document the separate Next UI gate.
- Modify: `tests/e2e/plan-doc-appender.ts` to support explicit headed sections and target URLs without overwriting prior evidence.
- Create: `tests/e2e/live-ui.config.ts` and `tests/e2e/live-ui.test.ts` for the deployed Next frontend browser trace.
- Legacy `/exec` UI inputs: the fresh isolated Apps Script `/exec` URL and role storage states required by `tests/e2e/playwright.config.ts`; do not reuse a stale production deployment.
- Rebuilt Next UI gate: target `AUTH_UI_TARGET_URL` (the deployed frontend root, not the legacy iframe suite) with Playwright browser actions and DOM assertions. If the release deployment exposes the Next frontend at `/exec`, use that path and record it; otherwise record the deployed root URL alongside the policy `/exec` result.
- Rebuilt Next UI role inputs: reuse the existing `PROGRAMS_ADMIN_USERNAME`, `PROGRAMS_ADMIN_CREDENTIAL`, `PROGRAMS_STAFF_USERNAME`, `PROGRAMS_STAFF_CREDENTIAL`, `PROGRAMS_MEMBER_USERNAME`, and `PROGRAMS_MEMBER_CREDENTIAL` out-of-band fixtures; fail closed when any is missing, malformed, duplicated, or not mapped to the claimed canonical role.
- D1 CI inputs: `.github/CI-SECRETS.md`, repository `AUTH_TARGET_URL` variable, and five `AUTH_*` secrets.
- Evidence: separately headed `/exec` and Next UI Playwright appender sections plus the GitHub Actions `deployed-auth` artifact and `tests/e2e/auth-d1-results.json`.

**OMP dispatch:**
- Agent type: `task` only after the target branch is pushed and the user provides/points to the out-of-band secrets.
- Reviewer gate: final `reviewer` checks the fresh target URL, migration state, 100% Playwright results, and plan append.

- [ ] Add the executable `tests/e2e/live-ui.config.ts`/`tests/e2e/live-ui.test.ts` trace before deployment; it must drive the rebuilt Next frontend in a real browser, fail closed unless all six existing `PROGRAMS_*` role-fixture variables are present, use only out-of-band acceptance credentials, and assert login, registration-form rendering, shell, Profile, Account Settings, role-gated approval, safe invalid-login error, and responsive DOM states at 375x667. Do not submit registrations, decide approvals, or induce backend failures; component contracts cover those mutation/recovery branches. A request-context D1 test or local static-shell run is not a substitute.
- [ ] Provision a fresh isolated `/exec` deployment and run the policy-required legacy browser trace with `E2E_TARGET_URL`; keep its result separate because `tests/e2e/playwright.config.ts` targets the Apps Script iframe, not the rebuilt Next UI.
- [ ] Set `AUTH_UI_TARGET_URL` to the fresh deployed Next frontend and run `pnpm exec playwright test --config=tests/e2e/live-ui.config.ts`; assert every criterion through observable DOM state.
- [ ] Extend `tests/e2e/plan-doc-appender.ts` with explicit `--heading` and `--target-url` options, then append the legacy and Next results to this release plan under distinct headings (for example `## Executed results — Legacy /exec` and `## Executed results — Next UI`) so one run cannot overwrite the other; pass `--plan`, `--results`, `--heading`, and `--target-url` explicitly for each artifact.
- [ ] Provision or select a separate fresh isolated Worker/D1 target whose hostname matches `efcc-auth-*.efcc-ggc.workers.dev`; never use the existing `efcc-prototype-129` host for the gated acceptance run unless the workflow namespace rule is changed and reviewed.
- [ ] Apply migrations to the isolated D1 database; do not mutate Google Sheets.
- [ ] Seed exactly the disposable acceptance accounts required by the D1 auth smoke through the approved D1 fixture path; do not print or commit credentials.
- [ ] Deploy with the real D1 binding and required Worker secrets; keep the committed placeholder config unchanged.
- [ ] Set `AUTH_TARGET_URL` and run the manual `deployed-auth` workflow. Require every auth test to pass and retain the artifact.
- [ ] Append the `/exec` URL, Next UI target URL, D1 workflow run, test counts, and artifact references to the plan; never append secret values. The role fixture names may be recorded, but their values must never be recorded.
- [ ] Only then change disposition from merge-ready to `READY` for the release scope.

## Verification Record

**Observed:** 2026-08-07, target worktree `~/.omp/wt/ui-04-196`. The acceptance trace is committed before implementation (`ddbf7b1`), followed by implementation (`eec79f7`), verification evidence (`809539e`), and migration-scope clarification (`097ed54`).

| Check | Result |
|---|---|
| `pnpm typecheck` | PASS — root TypeScript and `tests/e2e/tsconfig.json` emit no diagnostics. |
| `pnpm --dir web typecheck` | PASS — Next app and Worker TypeScript configs emit no diagnostics. |
| `pnpm test` | PASS — 17 files, 278 tests. |
| `pnpm --dir web test` | PASS — 10 files, 170 tests. |
| `pnpm --dir web test:components` | PASS — 9 files, 139 tests. |
| `pnpm test:shell-responsive` | PASS — 25 passed, 1 expected desktop-only skip. |
| Impeccable detector (`--scope type,layout`) | PASS — `[]` findings for the selected landing, Profile, registration, approval, and prototype paths. |
| `pnpm --dir web build` | PASS — 14 static routes generated, including `/profile/settings` and `/prototype`. |
| Local browser smoke | PASS — cleared storage, `noah`/`6883` reached `/profile` with visible `Noah`, `Staff`, and all six navigation labels; reloading `/profile` announced `工作階段已還原。`; logout returned `/` and showed the safe local-session-clear notice. |
| Acceptance appender redaction smoke | PASS — `https://example.test/exec?token=secret#frag` recorded as `https://example.test/exec` with no secret. |

Known non-failing output: root recovery tests intentionally log simulated render errors; Next reports the repository's multiple-lockfile workspace-root warning during build/responsive runs. No deployed `/exec`, Next UI, or D1 acceptance gate was run; those remain operator-gated by fresh targets, role fixtures, and out-of-band credentials. Disposition remains **merge-ready locally**, not `READY`.

## Plan Self-Review

- **Spec coverage:** L1–L6 cover the minimal landing and shared-shell acceptance; P1–P2 cover Profile/Account Settings; A1 covers approval; S1 covers remaining placeholder Sections; V1–V2 cover the prototype roles and production guard; R1 covers deterministic/visual verification; R2 covers both policy `/exec` acceptance and executable Next UI acceptance; R3 covers fresh D1 auth acceptance.
- **Instruction clarity:** every task names exact files, existing contracts, test commands, expected state, and commit boundaries. No task asks an implementer to invent an API or error behavior.
- **Type consistency:** all bootstrap producers return the existing `Bootstrap` shape; local demo restore and normal cookie restore feed the same `AppShell` interface; all UI consumers continue using `useApp().bootstrap`.
- **Boring by default:** the plan copies the existing dirty diff into the target worktree and reuses existing modules; it adds no service, dependency, storage backend, or auth abstraction.
- **Reversibility:** each transplant task is a separate commit; the target branch is isolated; deployment substitutions are ephemeral; the force-push remains an explicit user gate.
- **Known gap:** fresh `/exec` deployment state, the six existing `PROGRAMS_*` role fixtures, and online D1 acceptance accounts/secrets are not available in this plan's authoring environment, so Task 8 remains blocked until the operator provisions both targets and supplies all role fixtures out-of-band.
