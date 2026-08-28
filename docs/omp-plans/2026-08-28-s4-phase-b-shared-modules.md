# S4 Phase B — Shared Modules and Identity Definitions Implementation Plan

> **For OMP workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Dispatch each task as a fresh subagent; gate every implementation task with a fresh `reviewer` before the next dependent task starts.

**Goal:** Extend the accepted Phase A stack with Role Definition creation/order authority and the smallest shared UI modules that have real shipped callers, completing #479–#484 without beginning Phase C.

**Architecture:** Phase B extends the existing server-owned identity mutation kernel rather than adding a second authority path. Shared UI modules own repeated lifecycle, header, action-surface, directory, feed, settings, and workspace composition; route adapters retain domain queries, rows, filters, URL vocabulary, validation, permission decisions, and mutations. The Phase B branch is based on the pushed Phase A PR head `3cc674f4e2240abaebb47bb75c6614a8c3d7c624`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, locally owned shadcn/Radix primitives, Vitest/Testing Library, pinned Playwright Chromium, Wrangler Worker, disposable local D1, RFC 9457 Problem Details, OMP delegated worktrees/reviewer gates.

## Global Constraints

- Tickets in this plan: #479, #480, #481, #482, #483, #484 only.
- Grouped PR title: `feat(s4-b): shared UI modules and role definitions`.
- Stack origin: PR #473; immediate base: accepted Phase A PR #496 (`remediate-478`), exact head `3cc674f4e2240abaebb47bb75c6614a8c3d7c624`.
- Verify the GitHub account is `Noahlw` before publication; do not merge, deploy, force-push, reset, or begin Phase C.
- Spec 091 remains backend/domain authority. The Worker recomputes actor identity, capability, position, target, scope, revision, and idempotency; the browser only renders projections.
- Admin remains protected highest and `會友基礎` remains protected automatic lowest. Staff is assignable below Admin; fixed Role Categories remain non-assignable and read-only.
- Role Definitions use stable opaque IDs, globally unique normalized names, explicit single scope when scoped, additive grants, and immutable audit/idempotency records.
- Every privileged mutation uses cookie-only authentication, server-computed canonical request semantics, an idempotency key, an atomic D1 transaction, a request/correlation ID, and RFC 9457 Problem Details on failure.
- New Role Definitions start active with zero grants. Role creation, order, scope, and lifecycle changes must preserve the Phase A mutation/audit invariants.
- Staff creation is scoped-only under an existing permitted category and below Staff. Staff rename/rescope cannot widen authority.
- Reordering is sibling-only inside a fixed category. Drag and `上移`/`下移` use the same mutation result. Stale order requires explicit `保留我的排序` or `採用最新排序`.
- Shared modules are deep but narrow. Domain queries, rows, filters, validation, URLs, permissions, and mutations stay in route/domain adapters. No generic schema-driven Form, DataTable, CRUD, Task, plugin, or authorization framework.
- Local shadcn/Radix primitives are the default where semantic equivalence is proven. Native controls remain only for documented platform, device, or domain semantics. Equivalent obsolete controls, CSS, wrappers, exports, and source-shape tests are deleted after cutover.
- CVA guidance verified through the Context7 CLI (`/joe-bell/cva`): define one semantic `cva` factory with base classes, named variants, only necessary `compoundVariants`, and explicit `defaultVariants`; derive component variant props with `VariantProps<typeof variants>`; use standard TypeScript utility types when a caller needs a required variant; pass caller `className` through the CVA factory/`cn()` merge; keep route-specific behavior out of primitive variants. Tests assert role/state, keyboard, focus, disabled/error/busy, and responsive behavior rather than exact class strings.
- Civic Minimal is preserved: Cantonese-first copy, cinnabar action emphasis, teal focus, light civic surfaces, functional borders, 44px app-facing targets, safe-area clearance, phone-first flow, and the named 800px shell transition.
- Use W7 `320, 390, 600, 799, 800, 1024, 1440` CSS px. Material state widths follow the ticket matrices; no screenshot, image snapshot, or pixel-diff tests.
- Authenticated browser verification uses local `wrangler dev` and disposable `E2E_`/`E2E_DEMO_` D1 only. Never mutate Apps Script, Google Sheets, Cloudflare production, or an unknown/non-disposable database.
- Human keyboard, VoiceOver/NVDA, reduced-motion, forced-colors, zoom/text-spacing, and real-device checks remain manual gates; automated evidence must not claim formal WCAG certification.

## File Structure & Changes

### Authority and acceptance documents

- Create `docs/specs/s4-phase-b-acceptance-trace.md`: ticket-by-ticket observable contract, flow/state matrix, persona/fixture, W7/material widths, test seam, evidence owner, and manual gate. Commit it before any source edit.
- Import the already reviewed authority documents into the active branch because the Phase A stack references them but does not carry the files: `docs/specs/091-stackable-identity-backend.md`, `docs/specs/092-discord-identity-design-system-adoption.md`, `docs/adr/0042-discord-like-stackable-role-model.md`, and `docs/adr/0043-owned-civic-design-system-governance.md`. Preserve their content and provenance; do not rewrite product decisions.
- Create this implementation plan at `docs/omp-plans/2026-08-28-s4-phase-b-shared-modules.md`.
- Phase B evidence will be recorded in `docs/qa/2026-08-28-s4-phase-b-foundation.md` after implementation and verification; it must distinguish the reviewed code head from later documentation-only commits.

### #479 identity creation and order

- Extend `web/lib/identity/types.ts`, `web/lib/identity/index.ts`, `web/lib/identity/mutations.ts`, `web/lib/identity/role-hierarchy.ts`, `web/lib/identity/role-handlers.ts`, and `web/lib/identity/role-hierarchy-api.ts` with the create, order, and scope contracts. Keep the Phase A rename/error vocabulary and actor resolver.
- Add the next migration after `0022_role_identity_immutability.sql` (planned path `web/migrations/0023_role_definition_order.sql`) for any order-revision, category-placement, or scope invariant required by #479. Do not rewrite a production migration or add a runtime dual model.
- Extend `web/lib/identity/seeds.ts`, `web/lib/identity/d1-schema.test.ts`, `web/lib/identity/seeds.test.ts`, `web/lib/identity/role-hierarchy.test.ts`, `web/lib/identity/role-handlers.test.ts`, and `web/lib/identity/role-hierarchy-panel.test.tsx` with zero-grant creation, Staff scoped-only creation, fixed-category placement, sibling move equivalence, stale-order conflict, and no-partial-write cases.
- Extend `web/app/management/role-hierarchy-panel.tsx` and its existing CSS/test seam with the guided create state, scope/category preview, eligible action projection, drag/non-drag movement, and explicit order-conflict recovery. Categories never become draggable or assignable.
- Update `web/worker.ts` only through the existing `/api/v1/identity/*` dispatch. Add thin handlers/clients; never accept actor identity or authority from request bodies.

### #480 settings and lifecycle

- Keep `/profile/settings` as the shipped URL, but make `web/app/profile/account-settings.tsx` the sole richer implementation. Reduce `web/app/profile/settings/page.tsx` to the route adapter or remove only the duplicate `AccountSettingsContent`; delete the obsolete `web/app/profile/settings/settings.module.css` and any no-longer-imported settings implementation CSS.
- Preserve `web/lib/account-settings-copy.ts`, `web/lib/auth/account-settings.ts`, and the auth API contract. Cover validation, unchanged username, success/session revocation, `AUTH_REQUIRED` deep-link handoff, `FORBIDDEN` recovery, network/unavailable retry, conflict/error draft preservation, focus, and one announcement owner in `web/lib/account-settings.test.tsx` and the relevant route tests.
- Deepen the existing `web/lib/programs/use-async-resource.tsx` contract rather than creating a second async framework. It remains generic over route-owned state and data, guards stale requests, handles retry/focus/announcement, and exposes a narrow optional authentication-required handoff without owning domain requests or copy.
- Add or extract the shared Contextual Task Header only if the repeated responsibility is demonstrated by the settings and existing management/Programs callers. The interface must accept `backHref`, `backLabel`, `title`, `lead`, optional status/action slots, and a focus target; Home, sign-in, scanner, guest entry, and not-found remain local.
- `web/lib/copy.ts`, `web/lib/api.ts`, `web/lib/session.ts`, `web/lib/app-shell.tsx`, and `web/lib/shell-header.tsx` are shared integration files owned by #480. Preserve cookie-only auth and the single `LiveRegion`; do not move domain decisions into the lifecycle.
- Prove the shared lifecycle/header through the real `/profile/settings` caller and at least one existing management/Programs caller. Add no placeholder-only module.

### #481 approvals and mutation Action Surface

- Extend the single shared owner `web/app/management/management-action-framework.tsx` and its tests with the frozen `ActionSurface`/mutation action contract. It owns dirty, selection, review, save, busy, failure, and conflict presentation; phone stays in document flow with dock/safe-area clearance; desktop may be denser without changing semantics.
- Migrate `web/lib/approval-queue.tsx` and `web/lib/approval-detail.tsx` to the shared action/header/primitive contracts while keeping registration queries, selection snapshots, confirmation copy, decision mutations, and conflict reconciliation local.
- Replace raw approval checkbox/select/confirmation controls with local shadcn/Radix equivalents where semantics match. Preserve the native `<dialog>` or native control only when its semantic behavior is explicitly justified and tested.
- Delete `LegacyApprovalDetail` and obsolete approval-detail CSS/exports/tests after the active `ApprovalDetail` caller is proven. Keep `approval-queue.module.css`/`approval-detail.module.css` only for domain layout not owned by the shared module; remove duplicate action recipes.
- Update `web/lib/approval-queue.test.tsx`, `web/lib/approval-detail.test.tsx`, `web/lib/management-action-framework.test.tsx`, `web/components/ui/checkbox.tsx`, `web/components/ui/select.tsx`, `web/components/ui/alert-dialog.tsx`, and affected geometry/E2E seams. Cover queue pending/processed/empty/search/selection, detail approve/reject/retry/conflict/read-only, keyboard/mixed checkbox, disabled/busy, focus restoration, and W7/material action bounds.
- `web/app/management/settings-ui.tsx` is owned by #481 if shared back/detail primitives need adjustment; downstream directory work consumes the frozen interface and does not edit this shared file.

### #482 Account and Member directories

- Create one narrow `web/app/management/directory-frame.tsx` (or reuse an existing proven frame if the reviewer finds one) with typed slots for header/search/filter/list/detail/loading/empty/error/forbidden, focus restoration, selection, and pagination/virtualization hooks. It must not know Account/Member query, row, filter, URL, permission, or mutation vocabulary.
- Migrate `web/app/management/account-directory-panel.tsx` and `web/app/management/member-directory-panel.tsx` to the frame. Keep Account filters (`q`, `role`, `status`, `department`), cursor/load-more/detail queries and permissions local. Keep Member’s two-character search, member row/detail, and permissions local. Preserve safe deep-link redirect and origin-aware Back.
- Delete both obsolete directory CSS Modules and raw duplicate controls only after all callers use the frame; move remaining domain layout to Tailwind or the approved primitive boundary. Preserve required account 800–1023 reflow, 600 filter Sheet, 1024 detail layout, 200+ record behavior, and long-copy containment.
- Extend `web/lib/account-directory-panel.test.tsx`, `web/lib/member-directory-panel.test.tsx`, `web/lib/programs/account-directory.test.ts`, `web/lib/programs/member-directory.test.ts`, `web/lib/management-action-framework.test.tsx`, and `tests/e2e/member-directory.test.ts`/relevant account E2E with observable frame state, focus, filters, selection, load-more/retry, and 200+ record assertions at W7/material widths.
- Do not modify the frozen `management-action-framework.tsx`, `settings-ui.tsx`, `use-async-resource.tsx`, `api.ts`, or `copy.ts`; consume their published interfaces.

### #483 Home and communications feed

- Create one narrow `web/lib/feed-presentation.tsx` (or reuse a proven existing presentation seam) with typed slots for list/detail/loading/error/empty, state/status semantics, focus, and one announcement-owner policy. It must not fetch, mark read, parse route URLs, decide permissions, or perform domain actions.
- Migrate `web/lib/notices-panel.tsx`, `web/lib/messages-panel.tsx`, and the Home announcement presentation in `web/app/home/page.tsx` to the shared presenter. Keep `listNotices`, `markAllNoticesRead`, `listAnnouncements`, Home fallback loading, read state, fetching, `messages-intent.ts`, `buildProgramsHref`, and CTA validation local to adapters.
- Fix Home valid-action/history behavior and preserve separate Notices/Messages read/fetch/URL actions. Delete unreachable Programs Attention code only if a shipped caller is not proven before cutover; existing `programs-notifications.tsx` is a real caller through `programs-boundary.tsx` and must not be deleted.
- Remove `web/lib/notices-panel.module.css`, `web/app/home/home.module.css`, or other CSS only when every production caller has moved to approved shared/Tailwind ownership; do not touch prototype/historical CSS. Remove duplicate implementation-shaped tests and replace them with observable list/detail/error/empty/announcement tests.
- Extend `web/lib/notices-panel.test.tsx`, `web/lib/messages-panel.test.tsx`, `web/lib/home.test.tsx`, `web/lib/messages-intent.test.ts`, and appropriate route/geometry seams for loading, empty, error/retry, detail/back/history, unread/read failure, long copy, CTA action, and one announcement per transition at W7/material widths.
- Do not modify the frozen `use-async-resource.tsx`, `api.ts`, or `copy.ts`; consume published interfaces and request additions through the integration owner.

### #484 Programs Workspace task structure

- Split `web/lib/programs/program-workspace.tsx` by its existing `WorkspaceNavigation`, `WorkspaceOverview`, `EventsTask`, `ParticipantsTask`, `SettingsTask`, and `TaskUnavailable` responsibilities into focused internal modules under `web/lib/programs/` (planned files: `workspace-context.tsx`, `workspace-events-task.tsx`, `workspace-participants-task.tsx`, `workspace-settings-task.tsx`, `workspace-task.tsx`; keep the smallest viable set).
- Preserve the external `ProgramWorkspaceProps` interface, `ProgramsIntent` URL vocabulary, task values (`events`, `participants`, `settings`, `notifications`), event deep links, creation flash, focus, auth redirect, existing data/mutation ownership, and no route split.
- Mount the existing `ProgramsNotifications` as the focused `notifications` task only where the current URL/caller contract makes it a valid shipped task; do not create a generic task registry or framework. Events, Participants, Settings, and Notifications share only workspace context plus approved async/state modules.
- Keep `program-api.ts`, `department-workspace.ts`, recurrence/editor/enrollment state, row renderers, and mutation functions local to their tasks. Do not edit `use-async-resource.tsx`, `copy.ts`, or shared action/header files after their owners freeze them.
- Extend `web/lib/programs/program-workspace.test.tsx`, `web/lib/programs/programs-management-boundary.test.tsx`, `web/lib/programs/programs-notifications.test.tsx`, and existing Programs route/geometry suites to assert task navigation, URL round trips, focus, unavailable modules, loading/error/retry, create/decision/save/attention behavior, and no route/task intent regression.
- Delete only the monolithic duplicate declarations and imports superseded by the focused files. No generic Task abstraction or route split.

## What Already Exists

- Phase A already provides the normalized disposable D1 identity records, protected Admin/`會友基礎`, assignable Staff, `applyRoleMutation`, rename authority, Problem Details mapping, idempotency/audit transaction, hierarchy URL state, and numeric role geometry.
- `web/lib/programs/use-async-resource.tsx` is already used by management hub, management directory, Programs Workspace, Programs boundary, and permissions. It is the canonical lifecycle seam.
- `web/app/management/management-action-framework.tsx` already owns `safeManagementReturnHref`, `ManagementPageHeader`, `ManagementStickyActionBar`, and `ManagementFilterSheet`; approvals and account directory already consume part of it.
- `web/app/management/settings-ui.tsx` already owns `SettingsBackLink`, settings rows/detail pieces, and shared Back icon behavior.
- `web/lib/announcement-detail.tsx`, `web/lib/messages-intent.ts`, `web/lib/programs/programs-intent.ts`, `web/lib/live-region.tsx`, `web/lib/session.ts`, `web/lib/api.ts`, and centralized `web/lib/copy.ts` are existing seams to reuse.
- `ApprovalQueue` already owns process-local selection preservation and batch conflict reconciliation. `ApprovalDetail` already has one active export plus a dead legacy declaration to remove.
- Account Directory already owns cursor pagination, URL-preserved filters, detail recovery, and Account-specific query/row models. Member Directory already owns its two-character search and inline detail.
- `ProgramsNotifications` is already a real shipped component through `ProgramsBoundary`; it is not unreachable. `ProgramWorkspace` already exposes task-shaped internal declarations and `ProgramsIntent` already includes `notifications`.
- Existing tests/configs: `web/vitest.components.config.ts`, focused component tests under `web/lib/`, Worker tests under `web/lib/programs/` and `web/lib/identity/`, and pinned local Playwright configs under `tests/e2e/`.
- Authority evidence: `docs/qa/2026-08-27-code-layout-audit/ticket-readiness-contracts.md`, `architecture-matrices.md`, route reports for Account Settings, approvals, accounts, members, Home, Notices, Messages, and Programs Workspace, the sticky-layer audit, component/layout acceptance reports, and Phase A acceptance/evidence.

## Not In Scope

- Phase C #485–#487 Permission Editor, Account Access, normalized bootstrap authorization cutover, or legacy identity removal beyond the completed Phase B callers.
- Phase D–F #488–#495 route waves, whole-product cleanup, final release evidence, deployment, or production promotion.
- Production D1, Apps Script, Google Sheets, Cloudflare, or non-disposable database changes.
- `/prototype`, historical screenshots/comparison HTML, prototype-only styling, or screenshot/image regression tests.
- Generic Form/DataTable/CRUD/Task/plugin/authorization engines, compatibility wrappers, dual runtime models, or speculative dependency additions.
- Multi-account bulk identity assignment, explicit deny grants, production physical identity/audit deletion, Discord branding/colors/vocabulary.
- Rewriting the Phase A accepted PR or touching Tony/reference worktrees.

## ASCII Diagrams

### Shared request/lifecycle boundary

```text
Route adapter
  owns query + copy + URL + domain state + authorization decision
        |
        v
Shared lifecycle/header/action/frame/presenter
  owns finite UI state + focus + announcement + responsive layout
        |
        v
Existing cookie-only API / Worker / D1 seam
  owns actor + capability + scope + revision + idempotency + audit
```

### Role create/order flow

```text
cookie session
  -> resolve Active Account + highest identity + capability
  -> validate global/scoped choice + fixed category + explicit scope
  -> validate lower-target / sibling-only / base order revision
  -> insert PENDING idempotency record
  -> create zero-grant Role Definition or reorder sibling
  -> advance authoritative order revision
  -> append immutable audit + terminal idempotency result
  -> return authoritative tree/revision
```

### Shared module ownership

```text
#480: async lifecycle + Contextual Task Header + settings + shared copy/api/session seam
   |
#481: Action Surface + approval adoption + settings UI seam
   |
#482/#483/#484: frozen-caller fanout (Directory / Feed / Workspace)
```

## Failure Modes & Gaps

- The Phase A PR is open and marked release-conditional; “accepted” means the recorded local reviewer/evidence gate, not a merge or production approval.
- The authority specs/ADRs are absent from the Phase A branch and must be imported into this Phase B branch before implementation workers start; their copied content remains documentation provenance, not new product scope.
- Current identity schema has a single `role_policy_revisions` ledger and Phase A create-shaped mutation code but no complete #479 Worker/API/UI contract; #479 must define order revision semantics without weakening rename/replay/audit races.
- The current shipped `/profile/settings` route is the weaker duplicate while `web/app/profile/account-settings.tsx` is the richer survivor; preserving the URL while deleting the duplicate implementation is required.
- Approval Queue uses raw checkbox/select/native dialog controls and `ApprovalDetail` contains an unreferenced legacy declaration; clean cutover must preserve native semantics where justified and remove only proven dead code.
- Account and Member directories have different query/row/URL contracts; the shared frame must be slot-based, not a domain-shaped table.
- Home, Notices, Messages, and Programs notifications have different fetching/read/routing actions; the feed presenter cannot own them. Home has history-stack and HTTPS CTA edge cases from the audit.
- The W7 geometry baselines are not frozen until the live Phase B target is reviewed. Numeric measurements are evidence; human AT/device gates remain unresolved.
- Root `pnpm build` is a known pre-existing stub-script failure; use the real `pnpm --dir web build` plus root/web/worker/E2E typechecks.

## Parallelization / Worktree Strategy

- Coordinator worktree: `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/s4-phase-b`, branch `feat/s4-b-shared-modules-role-definitions`.
- Documentation/authority import and acceptance trace commit must land first, before any production source edit.
- Sequential shared-module gate: #479 implementation → reviewer READY → #480 implementation → reviewer READY → #481 implementation → reviewer READY.
- After #480 is READY, #482/#483/#484 may run in parallel only after the #481 shared Action Surface/settings interfaces and the #480 async/copy/api interfaces are frozen. Each lane owns its new module and route-local files; none edits the other lane’s shared files.
- Shared-file owners: `web/lib/identity/index.ts` and identity authority files → #479; `web/lib/copy.ts`, `web/lib/api.ts`, `web/lib/session.ts`, `web/lib/programs/use-async-resource.tsx`, and any Contextual Task Header → #480; `web/app/management/management-action-framework.tsx` and `web/app/management/settings-ui.tsx` → #481; Directory Frame → #482; Feed Presentation → #483; Workspace focused modules → #484.
- Every implementation lane commits its own reviewed changes. Every reviewer inspects the exact worker commit/range and returns `READY` or `BLOCKED` with named findings. A BLOCKED result sends a fresh correction worker to the owning lane; dependents do not start until READY.
- Testing workers own focused contract additions and evidence commands but never weaken assertions. Evidence workers record exact outputs after all code lanes are integrated. The coordinator runs only the final aggregate checks and publication.

---

### Task 1: Write the Phase B acceptance trace

**Files:**
- Create: `docs/specs/s4-phase-b-acceptance-trace.md`
- Import unchanged: `docs/specs/091-stackable-identity-backend.md`, `docs/specs/092-discord-identity-design-system-adoption.md`, `docs/adr/0042-discord-like-stackable-role-model.md`, `docs/adr/0043-owned-civic-design-system-governance.md`
- Read: `docs/specs/s4-phase-a-acceptance-trace.md`, `docs/qa/2026-08-28-s4-phase-a-foundation.md`, `docs/qa/2026-08-27-code-layout-audit/ticket-readiness-contracts.md`, `docs/qa/2026-08-27-code-layout-audit/architecture-matrices.md`, relevant route reports, issues #475 and #479–#484

**OMP dispatch:**
- Agent type: `task` (documentation/evidence worker)
- Reviewer gate: fresh `reviewer` checks criterion coverage, provenance, and no source edits before Task 2.

**Interfaces:**
- Consumes: exact Phase A head `3cc674f4e2240abaebb47bb75c6614a8c3d7c624`, issue bodies/comments, authority docs, current source/test seams.
- Produces: committed Phase B trace with stable IDs `B-479-*` through `B-484-*`, W7/material matrix, evidence owner, and explicit Phase C–F exclusion.

- [ ] Map each #479–#484 acceptance criterion to observable D1/HTTP/DOM/CSS-pixel outcome, persona/fixture, state/viewport, exact test seam, and evidence owner.
- [ ] Record shared-module contracts and ownership boundaries; state that domain queries, rows, filters, validation, URLs, permissions, and mutations remain local.
- [ ] Record no-screenshot policy, local Worker/disposable D1 gate, manual accessibility gates, no-production-data rule, and no-Phase-C stop boundary.
- [ ] Import missing authority documents with provenance and preserve their content.
- [ ] Commit documentation only before source edits.

**Acceptance:** Trace and authority files are committed; `git diff --check` and clean status hold; no production source/test/schema/fixture file changed.

### Task 2: Implement #479 Role Definition creation and ordering

**Files:**
- Modify: `web/lib/identity/types.ts`, `index.ts`, `mutations.ts`, `role-hierarchy.ts`, `role-handlers.ts`, `role-hierarchy-api.ts`, `seeds.ts`, `web/worker.ts`
- Modify/create: `web/migrations/0023_role_definition_order.sql` if the schema contract requires it
- Modify: `web/app/management/role-hierarchy-panel.tsx` and its CSS
- Test: identity D1/Worker/component tests and focused role geometry/route tests listed above

**OMP dispatch:**
- Agent type: `data` for transactional identity changes plus UI seam edits only where required.
- Reviewer gate: fresh `reviewer` on the exact #479 diff; no #480 source edits until READY.

**Interfaces:**
- Consumes: Phase A `loadRoleHierarchy`, `renameRoleDefinition`, `applyRoleMutation`, protected-key/capability vocabulary, cookie-only Worker handlers.
- Produces: typed `createRoleDefinition`, `reorderRoleDefinition`, and `rescopeRoleDefinition` authority/client seams; server-projected create/move affordances; stable `ROLE_ORDER_CONFLICT`, `ROLE_INVALID_PARENT`, `ROLE_SCOPE_MISMATCH`, `ROLE_IDEMPOTENCY_REUSE`, and validation outcomes.

- [ ] Add red tests for Admin global/scoped creation, Staff scoped-only creation, existing fixed-category/scope validation, zero grants, normalized unique names, active state, stable opaque ID, order revision, Staff rename/rescope, sibling-only movement, drag/non-drag equivalence, and stale-order recovery.
- [ ] Implement the minimum normalized D1/order revision changes; validate every domain write inside one transaction with immutable audit and terminal idempotency result.
- [ ] Implement thin Worker routes and browser clients under `/api/v1/identity/*`; request actor identity is never trusted.
- [ ] Implement guided UI states and server-projected actions without making categories assignable/movable or adding permission editing/account assignment.
- [ ] Test unauthorized, protected/highest/equal/above-target, wrong-scope, archived, duplicate/replay, changed-payload key reuse, stale revision, invalid parent, and response-loss replay paths.
- [ ] Commit only #479 changes with a focused message.

**Acceptance:** All #479 criteria are observable in identity tests and the real hierarchy caller; no Phase C permission editor/account-access work; reviewer returns READY.

### Task 3: Implement #480 Settings and shared lifecycle

**Files:**
- Modify: `web/app/profile/settings/page.tsx`, `web/app/profile/account-settings.tsx`, `web/lib/programs/use-async-resource.tsx`, `web/lib/app-shell.tsx`, `web/lib/shell-header.tsx`, `web/lib/api.ts`, `web/lib/session.ts`, `web/lib/copy.ts`
- Create/modify only if proven: `web/lib/contextual-task-header.tsx`
- Delete: obsolete duplicate settings CSS/implementation files after imports are migrated
- Test: `web/lib/account-settings.test.tsx`, `web/lib/auth/account-settings.test.ts`, lifecycle/header tests, route/E2E settings seams

**OMP dispatch:**
- Agent type: `ui` for the settings/lifecycle UI and shared interaction behavior.
- Reviewer gate: fresh `reviewer` on the exact #480 diff; no #481 or fanout changes until READY.

**Interfaces:**
- Consumes: Phase A AppShell/session/live-region/API seams, richer `AccountSettings`, existing `useAsyncResource` callers.
- Produces: one shipped `/profile/settings` implementation; narrow lifecycle/header interfaces; preserved route-owned auth/mutation adapters; tested success/unchanged/auth/forbidden/retry/conflict/focus/announcement behavior.

- [ ] Add failing tests for the richer settings flow and every named audit defect before replacing the weaker route content.
- [ ] Make the richer implementation the only shipped implementation while preserving `/profile/settings` and the login flash handoff.
- [ ] Extend the existing async hook/header seam only for repeated responsibilities; keep route data/copy/permissions/mutations local.
- [ ] Ensure one announcement owner and predictable heading/Back/focus behavior; do not duplicate the shell live region.
- [ ] Remove obsolete implementation CSS/tests/exports and update callers.
- [ ] Run focused tests and commit only #480 changes.

**Acceptance:** `/profile/settings` has one canonical implementation, all #480 states pass, shared lifecycle/header has a real shipped caller, and reviewer returns READY.

### Task 4: Implement #481 Approval Action Surface

**Files:**
- Modify: `web/app/management/management-action-framework.tsx`, `web/app/management/settings-ui.tsx`, their tests/CSS
- Modify: `web/lib/approval-queue.tsx`, `web/lib/approval-detail.tsx`, approval CSS/tests
- Modify only as required: local Checkbox/Select/AlertDialog primitive variants and component tests
- Test: approval component and local-D1/Playwright geometry seams

**OMP dispatch:**
- Agent type: `ui` for primitive/action-surface adoption with approval state preservation.
- Reviewer gate: fresh `reviewer` on the exact #481 diff; interfaces freeze before Task 5 fanout.

**Interfaces:**
- Consumes: #480 lifecycle/header/copy/API interfaces and existing approval registration client.
- Produces: frozen Action Surface and settings/back interfaces consumed by #482; migrated active ApprovalQueue/ApprovalDetail; no legacy detail export or duplicate action recipe.

- [ ] Add behavior-first tests for Checkbox checked/unchecked/mixed/disabled/keyboard/name, Select, AlertDialog, Action Surface finite states, focus restore, busy/error/conflict, and in-flow phone geometry.
- [ ] Migrate queue tray and detail decisions without moving selection/registration/decision authority into the shared module.
- [ ] Preserve pending/processed/empty/search/selection and decision/retry/conflict/read-only outcomes.
- [ ] Delete `LegacyApprovalDetail` and only the obsolete CSS/tests/exports proven unused.
- [ ] Commit only #481 changes and run focused approval tests.

**Acceptance:** #481 queue/detail and shared Action Surface criteria pass at W7/material widths; reviewer returns READY; frozen interfaces are documented for downstream lanes.

### Task 5: Implement #482 Directory Frame

**Files:**
- Create: `web/app/management/directory-frame.tsx` (or a reviewer-approved existing-frame reuse)
- Modify: `web/app/management/account-directory-panel.tsx`, `member-directory-panel.tsx`, local tests/CSS
- Test: account/member component + Worker tests and relevant Playwright geometry/route tests

**OMP dispatch:**
- Agent type: `ui`; run in parallel with Tasks 7 and 9 only after #480/#481 READY and shared interfaces are frozen.
- Reviewer gate: fresh `reviewer` for #482 exact diff.

**Interfaces:**
- Consumes: #480 async/header and #481 Action Surface/settings UI interfaces.
- Produces: typed frame slots for state/list/detail/search/filter/selection/pagination/focus; Account and Member adapters retaining local domain models and URLs.

- [ ] Add frame finite-state/slot/focus tests first.
- [ ] Migrate both callers and preserve distinct filters, rows, permissions, queries, URLs, and mutations.
- [ ] Cover 600 filter Sheet, 799/800 shell transition, 800–1023 reflow, 1024 detail, retry/load-more, selection, long copy, and 200+ records.
- [ ] Delete obsolete directory CSS/raw controls only after all callers migrate; commit only #482 changes.

**Acceptance:** Both directories prove the same frame through real callers without domain leakage; reviewer returns READY.

### Task 6: Review #482 Directory Frame

**Files:**
- Read: exact #482 worker diff, `directory-frame.tsx`, Account/Member callers/tests, readiness/audit matrix

**OMP dispatch:**
- Agent type: `reviewer`

- [ ] Confirm shared frame is narrow and typed; no generic table/query/permission/mutation engine.
- [ ] Confirm Account/Member domain differences and URLs remain local, obsolete code is removed, and W7/material behavior is covered.
- [ ] Return `READY` or `BLOCKED` with exact findings; do not edit.

### Task 7: Implement #483 Feed Presentation

**Files:**
- Create: `web/lib/feed-presentation.tsx` (or reviewer-approved existing seam)
- Modify: `web/lib/notices-panel.tsx`, `messages-panel.tsx`, `web/app/home/page.tsx`, local feed/home tests/CSS
- Test: Notices/Messages/Home component, intent, route, and geometry tests

**OMP dispatch:**
- Agent type: `ui`; parallel with #482 and #484 after shared interfaces freeze.
- Reviewer gate: fresh `reviewer` for #483 exact diff.

**Interfaces:**
- Consumes: #480 lifecycle/header/copy/API interfaces and `AnnouncementDetail`, `messages-intent`, `programs-intent`.
- Produces: typed list/detail/loading/error/empty presenter with one announcement-owner policy; route adapters keep fetch/read/routing/actions local.

- [ ] Add presenter tests for loading/ready/empty/error/detail/status/focus/announcement states.
- [ ] Migrate Notices, Messages, and Home while preserving separate data/read/URL/action behavior.
- [ ] Fix Home valid-action and history/back defects; preserve HTTPS CTA validation and fallback semantics.
- [ ] Keep ProgramsNotifications because it has a shipped ProgramsBoundary caller; remove only proven unreachable Attention code.
- [ ] Remove obsolete CSS/duplicate tests only after every caller migrates; commit only #483 changes.

**Acceptance:** One Feed Presentation is proved by all three real callers, no domain leakage or duplicate announcements, W7/material/long-copy states pass; reviewer returns READY.

### Task 8: Review #483 Feed Presentation

**Files:**
- Read: exact #483 worker diff, presenter, Home/Notices/Messages callers/tests, audit matrix

**OMP dispatch:**
- Agent type: `reviewer`

- [ ] Confirm presenter owns only presentation/lifecycle/focus/announcement policy and does not fetch, mutate read state, route, or decide permissions.
- [ ] Confirm valid actions/history, retry/read failure, long-copy/overlay geometry, one announcement owner, and obsolete-path removal.
- [ ] Return `READY` or `BLOCKED` with exact findings; do not edit.

### Task 9: Implement #484 Programs Workspace focused tasks

**Files:**
- Create focused modules under `web/lib/programs/` only as needed by existing task declarations
- Modify: `web/lib/programs/program-workspace.tsx`, `programs-boundary.tsx` only where task mounting requires it, local Programs tests
- Test: `program-workspace.test.tsx`, `programs-management-boundary.test.tsx`, `programs-notifications.test.tsx`, existing Programs route/geometry tests

**OMP dispatch:**
- Agent type: `task`; parallel with #482/#483 after #480/#481 READY and shared interfaces freeze.
- Reviewer gate: fresh `reviewer` for #484 exact diff.

**Interfaces:**
- Consumes: unchanged `ProgramWorkspaceProps`, `ProgramsIntent`, #480 async/header, existing `ProgramsNotifications`, and #481 action interfaces where applicable.
- Produces: focused Events/Participants/Settings/Notifications task modules behind the existing workspace route/task interface; no generic Task framework.

- [ ] Add structural/behavior tests for each existing task, URL/task/event round trips, focus, unavailable modules, and auth retry paths.
- [ ] Extract existing declarations without changing domain queries, rows, forms, recurrence, enrollment, attention, or mutation ownership.
- [ ] Mount `notifications` only under the existing valid shipped intent; preserve one external workspace route and all task navigation.
- [ ] Delete monolithic duplicate declarations/imports after extraction; commit only #484 changes.

**Acceptance:** Existing workspace route/task intent and focused component/route contracts remain green; reviewer returns READY.

### Task 10: Review #484 Workspace structure

**Files:**
- Read: exact #484 worker diff, focused task modules, workspace/boundary callers/tests, readiness matrix

**OMP dispatch:**
- Agent type: `reviewer`

- [ ] Confirm no route split or generic Task framework, and each task retains local domain authority.
- [ ] Confirm Events/Participants/Settings/Notifications have real shipped callers, shared context only, focus/auth/error behavior, and obsolete monolith code removed.
- [ ] Return `READY` or `BLOCKED` with exact findings; do not edit.

### Task 11: Run focused Phase B checks

**Files:**
- Read/execute: focused identity, settings/lifecycle, approval, directory, feed, and Programs tests; relevant Playwright local-D1 projects
- Write: temporary evidence output only under the ignored local evidence directory; final evidence is Task 13

**OMP dispatch:**
- Agent type: `task` (testing worker)
- Reviewer gate: coordinator checks exact command output; no assertion weakening or test deletion to make a run green.

- [ ] Run focused #479 identity D1/Worker/component tests and role geometry.
- [ ] Run focused #480 settings/lifecycle/header tests and `/profile/settings` route smoke.
- [ ] Run focused #481 approval/action/primitive tests and approval material geometry.
- [ ] Run focused #482 Account/Member frame tests and directory material geometry.
- [ ] Run focused #483 feed/Home/Notices/Messages tests and history/long-copy probes.
- [ ] Run focused #484 workspace task/boundary/notification tests and route geometry.
- [ ] Use local Wrangler/disposable D1 for authenticated probes; record exact pass/skip/failure output and classify any pre-existing or harness issue.

**Acceptance:** All affected focused contracts pass; no production/non-disposable data touched; exact outputs are available for the evidence worker.

### Task 12: Run aggregate typecheck and build checks

**Files:**
- Read/execute repository scripts only; no source edits

**OMP dispatch:**
- Agent type: `task` (testing worker)

- [ ] Run root, web, Worker, and E2E TypeScript checks.
- [ ] Run `pnpm --dir web test`, `pnpm --dir web test:components`, and relevant full route suites.
- [ ] Run `pnpm --dir web build` and report static route count.
- [ ] Run `git diff --check`, package/workflow parsing, and clean-status checks.
- [ ] Do not use the known failing root `pnpm build` stub as the real production build gate; record it only if touched/relevant.

**Acceptance:** Aggregate commands pass or every unavoidably pre-existing/manual condition is explicitly recorded; no assertion was weakened.

### Task 13: Record Phase B evidence

**Files:**
- Create: `docs/qa/2026-08-28-s4-phase-b-foundation.md`
- Read: Phase B trace, all worker/reviewer outputs, focused/aggregate command logs, PR/base refs

**OMP dispatch:**
- Agent type: `task` (evidence worker)
- Reviewer gate: fresh `reviewer` verifies provenance, exact counts, scope, and no unsupported readiness claim.

- [ ] Record actual base/head SHAs, grouped PR title, ticket criteria/results, delegated agents, reviewer READY results, exact command outputs, W7/material geometry, local D1 provenance, obsolete-path removals, and manual gates.
- [ ] Distinguish implementation code head from later documentation-only evidence commits; do not claim production readiness.
- [ ] Record any known root-build stub/manual WCAG/device/remote-CI caveats truthfully.
- [ ] Commit documentation only after code and checks are complete.

**Acceptance:** Evidence report is reviewable, truthful, and committed; reviewer returns READY.

### Task 14: Open the grouped Phase B PR

**Files:**
- Read: actual Phase A PR #496 base/head, current Phase B branch, evidence report, issue states
- Publish: one PR titled `feat(s4-b): shared UI modules and role definitions`

**OMP dispatch:**
- Agent type: `task` (publication worker)
- Preconditions: `gh api user --jq .login` exactly `Noahlw`; branch pushed; worktree clean; evidence reviewer READY.

- [ ] Push `feat/s4-b-shared-modules-role-definitions` without force.
- [ ] Open one grouped PR against the actual Phase A PR #496 head/branch, identify PR #473 as stack origin, and close only #479–#484.
- [ ] Include acceptance trace/evidence links, delegated workers/reviewer results, exact checks, known manual gates, and explicit no-merge/no-Phase-C boundary.
- [ ] Verify PR state, base, head, and URL after creation. Do not merge.

**Acceptance:** One open, unmerged grouped Phase B PR exists on the reviewed Phase A head with correct title/base/head and ticket closure list.

### Task 15: Stop after Phase B

**Files:**
- Read: final branch/PR/evidence state

**OMP dispatch:**
- Agent type: `task` (coordinator closeout)

- [ ] Confirm worktree and remote branch are clean/current.
- [ ] Confirm all #479–#484 acceptance criteria and shared-caller proof are recorded.
- [ ] Confirm no Phase C source work was started and no merge/deploy occurred.
- [ ] Report the actual base/head, PR URL, agent/reviewer outcomes, trace/evidence paths, exact validations, and remaining manual gates.

**Acceptance:** Phase B is complete and explicitly stopped; Phase C remains untouched.
