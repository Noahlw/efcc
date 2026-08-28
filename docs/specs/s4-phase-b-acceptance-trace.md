# S4 Phase B — Shared Modules and Identity Definitions acceptance trace

**Phase:** Stack PR B — second child stacked on the accepted Phase A PR
**Stack origin:** PR #473 (`feat/s4-12-shadcn-migration`)
**Immediate base:** accepted Phase A PR #496 (`remediate-478`), exact head `3cc674f4e2240abaebb47bb75c6614a8c3d7c624`
**Tickets:** #479 (S5-B01 Role Definition creation/scope/order), #480 (S5-B02 shared lifecycle + Account Settings), #481 (S5-B03 approvals + mutation Action Surface), #482 (S5-B04 Account/Member Directory Frame), #483 (S5-B05 Home/communications Feed Presentation), #484 (S5-B06 Programs Workspace focused tasks)
**Parent authority:** issue #475, Spec 091, Spec 092, ADR-0042, ADR-0043
**Grouped PR title:** `feat(s4-b): shared UI modules and role definitions`
**Phase base:** `3cc674f4e2240abaebb47bb75c6614a8c3d7c624` (Phase A PR #496 `remediate-478` head)
**Status:** Planning-only acceptance trace; no production code, schema, migration, fixture, deployment, or data change is authorized by this document

> This acceptance trace records the observable contract that Phase B (#479, #480, #481, #482, #483, #484) must satisfy. It maps every ticket acceptance criterion to a verifiable outcome, persona/fixture, surface, width/state, test seam, and evidence owner. It does not modify production code, schema, fixtures, or CSS. Phase C (#485–#487), Phase D (#488–#490), Phase E (#491–#493), and Phase F (#494–#495) are explicitly excluded and out of scope for this trace.

## Phase B scope boundary

**In scope (this trace only):**

- #479 — Role Definition creation (global for Admin, scoped-only for Staff), Staff rename/rescope staying inside authority, and sibling-only reorder over the Phase A mutation kernel, with fixed Role Categories remaining read-only.
- #480 — the richer Account Settings flow as the sole shipped implementation of `/profile/settings`, and the shared async lifecycle / Contextual Task Header / Settings Structure seams with a real shipped caller.
- #481 — Approval Queue/Detail polish through one shared responsive Action Surface, replacing equivalent raw selection, choice, and confirmation controls with local shadcn/Radix primitives.
- #482 — one Directory Frame proven through Account and Member directories, sharing responsive search/filter/list/detail composition, focus restoration, and pagination/virtualization hooks while domain rows/filters/URLs/permissions/mutations stay local.
- #483 — one Feed Presentation proven through Home, Notices, and Messages, with separate data/read/routing/action ownership, and Home navigation/announcement defects fixed.
- #484 — the Programs Workspace split into focused Events/Participants/Settings/Notifications internal modules behind one unchanged workspace interface.

**Out of scope (excluded from this trace; not in Phase B):**

- Phase C — stackable identity integration (#485–#487: Permission Editor, Account Access, normalized bootstrap authorization cutover, legacy identity removal beyond completed Phase B callers).
- Phase D — member/public route wave (#488–#490).
- Phase E — operations route wave (#491–#493).
- Phase F — contract and release evidence (#494–#495).
- Production D1, Apps Script, Google Sheets, Cloudflare, or non-disposable database changes.
- Multi-account bulk 身份組 assignment, explicit deny grants, production physical deletion of identities/assignments/grants/audit history.
- `/prototype`, historical screenshots/comparison HTML, prototype-only styling, or screenshot/image regression tests.
- Generic schema-driven Form, DataTable, CRUD, Task, plugin, or authorization frameworks; compatibility wrappers; dual runtime models; speculative dependency additions.
- Discord colors, assets, gaming vocabulary, server/channel concepts, or branding.
- Rewriting the accepted Phase A PR or touching Tony/reference worktrees.
- The unreachable `ProgramsAttention` component unless a shipped caller is proven before the #483 cutover.

## Phase B global constraints

- Tickets in this plan: #479, #480, #481, #482, #483, #484 only. Grouped PR title: `feat(s4-b): shared UI modules and role definitions`.
- Stack origin PR #473; immediate base is the accepted Phase A PR #496 (`remediate-478`) at exact head `3cc674f4e2240abaebb47bb75c6614a8c3d7c624`. GitHub account `Noahlw` before publication; no merge, deploy, force-push, reset, or Phase C start.
- Spec 091 remains backend/domain authority. The Worker recomputes actor identity, capability, position, target, scope, revision, and idempotency; the browser only renders projections.
- Admin remains protected highest and `會友基礎` remains protected automatic lowest. Staff is assignable below Admin; fixed Role Categories remain non-assignable and read-only.
- Role Definitions use stable opaque IDs, globally unique normalized names, explicit single scope when scoped, additive grants, and immutable audit/idempotency records. Every privileged mutation uses cookie-only authentication, server-computed canonical request semantics, an idempotency key, an atomic D1 transaction, a request/correlation ID, and RFC 9457 Problem Details on failure.
- New Role Definitions start active with zero grants. Role creation, order, scope, and lifecycle changes preserve the Phase A mutation/audit invariants. Staff creation is scoped-only under an existing permitted category and below Staff. Staff rename/rescope cannot widen authority.
- Reordering is sibling-only inside a fixed category. Drag and `上移`/`下移` use the same mutation result. Stale order requires explicit `保留我的排序` or `採用最新排序` recovery.
- Shared modules are deep but narrow. Domain queries, rows, filters, validation, URLs, permissions, and mutations stay in route/domain adapters. No generic schema-driven Form, DataTable, CRUD, Task, plugin, or authorization framework.
- Local shadcn/Radix primitives are the default where semantic equivalence is proven. Native controls remain only for documented platform, device, or domain semantics. Equivalent obsolete controls, CSS, wrappers, exports, and source-shape tests are deleted after cutover.
- Civic Minimal is preserved: Cantonese-first copy, cinnabar action emphasis, teal focus, light civic surfaces, functional borders, 44px app-facing targets, safe-area clearance, phone-first flow, and the named 800px shell transition.
- Use W7 `320, 390, 600, 799, 800, 1024, 1440` CSS px. Material state widths follow the ticket matrices below; both 799 and 800 are mandatory for shell/action-sensitive states. No screenshot, image snapshot, or pixel-diff tests: geometry is numeric CSS-pixel evidence from pinned local Playwright Chromium.
- Authenticated browser verification uses local `wrangler dev` and disposable `E2E_`/`E2E_DEMO_` D1 only. Never mutate Apps Script, Google Sheets, Cloudflare production, or an unknown/non-disposable database.
- Human keyboard, VoiceOver/NVDA, reduced-motion, forced-colors, zoom/text-spacing, and real-device checks remain manual gates; automated evidence must not claim formal WCAG certification.
- Root `pnpm build` is a known pre-existing stub-script failure; the real production build gate is `pnpm --dir web build` plus root/web/worker/E2E typechecks.
- Authority docs (`docs/specs/091-stackable-identity-backend.md`, `docs/specs/092-discord-identity-design-system-adoption.md`, `docs/adr/0042-discord-like-stackable-role-model.md`, `docs/adr/0043-owned-civic-design-system-governance.md`) are imported unchanged into this branch so referenced authority is auditable; copied content is documentation provenance, not new product scope.

---

## Shared-module contracts and ownership

Phase B proves every shared module through a real shipped caller. Each module owns only repeated lifecycle/header/action/directory/feed/settings/workspace composition; domain behavior stays in the route/domain adapters named below. No module may fetch domain data, mutate domain state, decide permissions, or parse route URLs for a caller.

| Shared module | Owns (finite UI state, focus, announcement, responsive composition) | Explicitly remains local (route/domain adapter) | Real shipped caller(s) | Owner lane |
| --- | --- | --- | --- | --- |
| Async lifecycle (`web/lib/programs/use-async-resource.tsx` extended) | load/retry state machine, request staleness, focus-on-retry, canonical announcement, narrow auth-required deep-link handoff | domain requests, result models, copy, authorization decisions, AUTH_REQUIRED redirect destination | management hub, management directory, Programs Workspace, Programs boundary, permissions, settings/lifecycle routes | #480 |
| Contextual Task Header (`web/lib/contextual-task-header.tsx` or proven existing seam) | Back, title, lead, status/action slots, focus target, responsive spacing | route-specific content and action semantics | management/settings/approvals and Programs task/detail surfaces | #480 |
| Settings Structure (`web/app/profile/account-settings.tsx` as the sole shipped implementation; `web/app/management/settings-ui.tsx`) | settings rows, detail facts, Back, fields, success/unchanged/retry/forbidden/auth-expiry/conflict feedback, flash, focus | setting-specific validation and mutations (`authChangeUsername`/`authChangePassword` through `web/lib/api.ts`) | `/profile/settings` (canonical), management settings hub/detail screens | #480 / #481 |
| Action Surface (`web/app/management/management-action-framework.tsx` frozen `ActionSurface` contract) | dirty, selection, review, save, busy, failure, conflict presentation; phone in-flow with dock/safe-area clearance; denser approved desktop placement | consequence copy and mutation handlers (approval batch/decision client, registration queue/detail state) | Approval Queue/Detail, Account Directory filter Sheet, settings UI seam | #481 |
| Directory Frame (`web/app/management/directory-frame.tsx` or reviewer-approved existing frame) | search/filter/list/detail/loading/empty/error/forbidden state slots, focus restoration, selection, pagination/virtualization hooks | Account/Member query, row, filter, URL vocabulary, permission projection, mutation | Account Directory (`/management?module=accounts`), Member Directory (`/management?module=members`) | #482 |
| Feed Presentation (`web/lib/feed-presentation.tsx` or proven existing seam) | list/detail/loading/error/empty composition, state/status semantics, focus, one announcement owner | fetching, read state, route URLs/intent, domain actions (Notices `markAllNoticesRead`, Messages/Home read-only projection, Programs notifications mark-read) | Home, Notices, Messages; `ProgramsNotifications` already shipped via `ProgramsBoundary` | #483 |
| Programs Workspace focused tasks (`web/lib/programs/workspace-*.tsx` focused modules) | task mount, shared workspace context, focused Events/Participants/Settings/Notifications implementations | task-domain queries, rows, forms, recurrence, enrollment, attention, mutations | `/programs?mode=management&program=<id>&task=<task>` via unchanged `ProgramWorkspaceProps`/`ProgramsIntent` | #484 |

**Domain-ownership invariant (all tickets):** domain queries, rows, filters, validation, URLs, permissions, and mutations remain local to route/domain adapters. The Worker/HTTP/D1 authority seam (`web/worker.ts` identity mount, `web/lib/identity/role-handlers.ts`, cookie-only `web/lib/api.ts`/`program-api.ts` transport) is never duplicated inside a shared UI module.

## Dispatch and dependency gates

```text
#479 implementation  → fresh reviewer → READY
   → #480 implementation → fresh reviewer → READY
      → #481 implementation → fresh reviewer → READY (shared interfaces frozen)
         → #482 / #483 / #484 in parallel, with frozen shared-file ownership
   → focused Phase B checks → aggregate typecheck/build → evidence → grouped PR → stop
```

- The documentation/authority import and this acceptance trace commit first, before any production source edit (Task 1 gate).
- #479 → READY review → #480 → READY review → #481 → READY review; a BLOCKED result sends a fresh correction worker to the owning lane and dependents do not start until READY.
- After #480 and #481 are READY and their shared interfaces are frozen, #482/#483/#484 may run in parallel only with explicit ownership of shared modules, primitives, copy, and tests. None of the parallel lanes edits another lane's shared files.
- Shared-file owners: `web/lib/identity/*` → #479; `web/lib/copy.ts`, `web/lib/api.ts`, `web/lib/session.ts`, `web/lib/programs/use-async-resource.tsx`, and any Contextual Task Header → #480; `web/app/management/management-action-framework.tsx` and `web/app/management/settings-ui.tsx` → #481; Directory Frame → #482; Feed Presentation → #483; Workspace focused modules → #484.
- The grouped Phase B PR is opened only after the evidence report records actual base/head SHAs, delegated agents, reviewer READY results, exact command outputs, and manual gates. It is not merged; Phase C is not begun.

---

## Ticket #479 — S5-B01 Role Definition creation, scope, and order

**Backend authority:** Spec 091 §§ 4.2, 5.1, 5.2, 6, 7.4, 9.2, 9.3, 13; ADR-0042 (role-tree semantics, locked interaction rules)
**Stack position:** First Phase B child on the accepted Phase A PR #496 head; no upstream blocker within Phase B

### Contract under test

Role Definition creation and ordering extend the Phase A server-owned mutation kernel (`applyRoleMutation`, revision/idempotency/audit transaction) rather than adding a second authority path. Admin can create global or scoped Role Definitions under an existing fixed category; Staff can create only scoped child Role Definitions under an existing permitted category and below Staff. New Role Definitions start active with zero grants, a globally unique normalized name, one explicit scope when scoped, and an authoritative order revision. Staff rename/rescope stays below Staff and inside authority; a scope change atomically reparents the Role Definition under the fixed category for the new explicit scope. Drag and `上移`/`下移` produce the same sibling-only mutation result inside a fixed category and never move a Category, change grants, or widen scope. A stale order revision exposes both the authoritative and local order and requires an explicit `保留我的排序` or `採用最新排序` choice before retry. Fixed Role Categories remain non-assignable and read-only for every actor, including Admin.

### Acceptance trace

| ID | Given | When | Observable result |
| --- | --- | --- | --- |
| B-479-01 | Disposable D1 seeded (`pnpm db:seed:disposable`; `E2E_DISPOSABLE_ADMIN` actor) and an existing fixed Category is present | Admin submits `POST /api/v1/identity/role-definitions` with a global or scoped body, an idempotency key, and a valid base order revision | `200` returns the new Role Definition under the chosen fixed Category with a stable opaque ID, `Active` lifecycle, zero grant rows, one explicit scope when scoped (`Global` with null scope or exactly one Department/Program scope), and the authoritative new order revision; one SUCCESS audit row and one terminal idempotency row are committed atomically. |
| B-479-02 | Disposable D1 seeded (`E2E_DISPOSABLE_STAFF` actor) | Staff submits role-definition creation with a Global scope or without a permitted parent Category | `403 ROLE_FORBIDDEN` / `ROLE_INVALID_PARENT` Problem Details; no row is written; Staff sees only scoped creation affordances under an existing permitted category (projection) and the Worker rejects a tampered Global attempt (UI is never the authority). |
| B-479-03 | Admin or Staff starts a new Role Definition | Inspect the created definition | The definition is `Active` with zero grants, a globally unique normalized display name (unique after trim/Unicode NFC/case folding), exactly one valid scope when scoped, and a position strictly below the creator's highest identity; no capability grant is inherited from the creator. |
| B-479-04 | A creation name collides with an existing Role Definition name, or a scoped definition is submitted without an explicit scope | Submit the creation | `409 ROLE_NAME_TAKEN` (no mutation, no disclosure of the other identity) or `422`/D1 constraint rejection for a scoped row without `scope_id`; no revision advances; a REJECTED audit row is recorded when the call reached the Worker. |
| B-479-05 | Staff holds `role.name.write`/`role.scope.write` and targets a lower identity | Staff renames a lower Role Definition or submits a scope change | Rename preserves stable ID, assignments, order position, scope, and grants and advances the policy revision by one (Phase A invariant). A scope change is accepted only inside Staff authority, atomically reparents the definition under the fixed Category for the new explicit scope, and never widens Staff's effective authority; both commit audit + terminal idempotency atomically. |
| B-479-06 | Staff attempts to rename/rescope its own highest identity, a target at or above its highest position, or a target outside its scope | Submit the mutation | `403 ROLE_HIGHEST_PROTECTED` / `ROLE_SCOPE_MISMATCH` Problem Details; no mutation; a DENIED audit row is recorded. |
| B-479-07 | An authorized operator reorders sibling Role Definitions inside one fixed Category by drag | Complete the drag | `PATCH` order mutation commits a sibling-only position change; parent Category, grants, scope, and all assignments are unchanged; the authoritative order revision advances by one; audit + idempotency are terminal. |
| B-479-08 | The same operator reorders the same siblings with `上移`/`下移` | Complete the keyboard/non-drag move | The mutation result is identical to the drag result for the same before/after sibling positions (same endpoint semantics, same revision advance, same audit shape); `上移`/`下移` never move a Category and never change grants or scope. |
| B-479-09 | An operator attempts to reorder across Categories, move Admin/`會友基礎`, or move a Role Definition above its parent/actor constraint | Submit the order mutation | `403`/`422` Problem Details (`ROLE_INVALID_PARENT`, protected/highest/scope guards); no mutation; a DENIED/REJECTED audit row is recorded; fixed Categories remain read-only for every actor. |
| B-479-10 | The operator's base order revision is stale (another actor committed a sibling order first) | Submit the order mutation | `409 ROLE_ORDER_CONFLICT` Problem Details returning the authoritative tree/revision; no partial reorder is applied; the client exposes the authoritative and local orders with an explicit `保留我的排序` or `採用最新排序` choice and retries only after the operator chooses. |
| B-479-11 | The same idempotency key is replayed with the same creation/reorder payload | Replay the mutation | `200` idempotently with the original result; no duplicate Role Definition/order rows; no duplicate audit row; a DUPLICATE replay audit row may be emitted but is identifiable. |
| B-479-12 | The hierarchy panel renders for an Admin and for a Staff actor | Render `/management?module=roles` (Phase A panel extended with create/order affordances) at W7 `320, 390, 600, 799, 800, 1024, 1440` CSS px | Admin sees global-or-scoped creation affordances and reorder controls on eligible lower siblings; Staff sees scoped-only creation under an existing permitted category; no horizontal overflow, 44px minimum app-facing targets, focus visible, and the create/order affordance clears the phone dock/safe-area reserve. |
| B-479-13 | A Direct Worker call tampers with the request (fake actor, scope, or revision) | Submit the tampered request | The Worker recomputes actor/capability/position/target/scope/revision from D1 and returns `403`/`409` Problem Details with no mutation; the UI projection was not the authority. |

### Test seams and gates

- **Worker/D1 seam:** `web/lib/identity/d1-schema.test.ts`, `web/lib/identity/role-hierarchy.test.ts`, and `web/lib/identity/role-handlers.test.ts` exercise creation (global/scoped, zero-grant, unique-name, scope cardinality), sibling-only reorder via the same mutation kernel, rename/rescope authority, stale-order conflict with authoritative revision, idempotent replay, protected/highest/scope/invalid-parent guards, and atomic domain/audit/idempotency commit under disposable D1; `web/worker.ts` mounts the new routes under the cookie-only transport guard.
- **Client seam:** `web/lib/identity/role-hierarchy-api.ts` extends the thin cookie-only fetch wrapper; `web/lib/identity/role-hierarchy-panel.test.tsx` and the panel in `web/app/management/role-hierarchy-panel.tsx` exercise create/order affordance projection, `保留我的排序`/`採用最新排序` recovery, URL/focus/announcement behavior, and single-owner Cantonese feedback.
- **Geometry seam:** pinned Chromium Playwright (`tests/e2e/role-hierarchy-geometry.test.ts` extended) at W7 CSS px asserts hierarchy/create/order critical anchors with no overflow, no undersized controls, and dock/safe-area clearance; numeric CSS-pixel evidence only, no screenshots.
- **Required gates for #479:** root and `web/` typecheck, focused identity suite (`pnpm verify:identity`), pinned geometry suite, `git diff --check`, reviewer READY, no production/non-disposable data touched.

### Ticket acceptance criteria mapping

| Ticket criterion | Trace rows |
| --- | --- |
| Admin can create global or scoped Role Definitions; Staff sees and can complete scoped-only creation under an existing permitted category. | B-479-01, B-479-02, B-479-12 |
| New Role Definitions start active with zero grants, globally unique names, one valid scope when scoped, and an authoritative order revision. | B-479-01, B-479-03, B-479-04 |
| Staff rename/rescope stays below Staff and inside authority; scope change atomically places the Role Definition under the corresponding fixed category. | B-479-05, B-479-06 |
| Drag and 上移/下移 produce the same sibling-only result and never move a Category, change grants, or widen scope. | B-479-07, B-479-08, B-479-09 |
| Stale order conflicts expose authoritative and local order for explicit 保留我的排序 or 採用最新排序 recovery. | B-479-10, B-479-11, B-479-13 |

---

## Ticket #480 — S5-B02 shared task lifecycle and Account Settings

**Design authority:** Spec 092 (deep EFCC task modules, async lifecycle, settings structure, announcement ownership), ADR-0043, the approved Civic Minimal contract, `docs/qa/2026-08-27-code-layout-audit/account-settings.md` (F-01…F-04, F-06, F-07) and `shared-contracts.md`
**Stack position:** Stacked on #479 READY; blocks #481 (interfaces) and the #482/#483/#484 fanout

### Contract under test

The richer Account Settings flow (`web/app/profile/account-settings.tsx`) becomes the sole shipped implementation of `/profile/settings`, preserving the route, validation, and mutation contracts while adding correct success, unchanged, retry, forbidden, authentication-expired, and conflict behavior. Authentication expiry remembers a safe deep link and returns through the canonical sign-in flow. Loading, error, retry, heading focus, Back, flash, and one announcement owner are reusable through a narrow route adapter. The weaker parallel settings implementation and its obsolete styling/tests are removed. Canonical settings ready and risk states pass the relevant W7 geometry without screenshot evidence.

### Acceptance trace

| ID | Given | When | Observable result |
| --- | --- | --- | --- |
| B-480-01 | An authenticated Member/Staff/Admin loads `/profile/settings` | Render the canonical route | One implementation renders: labeled username and password forms with validation hints, contextual Back to `/profile`, and no duplicate parallel settings content; the weaker `AccountSettingsContent` duplicate is gone from `web/app/profile/settings/page.tsx` and `web/app/profile/account-settings.tsx` is the single shipped owner. |
| B-480-02 | The operator submits a valid username change | Submit the username form | Success behavior follows the API contract `{ username, sessionRevoked }`: `sessionRevoked: true` shows the success state + one-time flash (`efcc_account_updated`) and routes through the canonical sign-in; `sessionRevoked: false` (unchanged value) shows the `unchanged` notice and keeps the session live; duplicate username returns the 409 `CONFLICT` field copy with no mutation. |
| B-480-03 | The operator submits a valid password change | Submit the password form | `200` with `sessionRevoked: true` clears the auth hint, writes the one-time flash, and routes to the login surface; wrong current password is the documented 422 `VALIDATION` field copy (not 401); short/mismatched passwords are client-blocked with field copy and no request. |
| B-480-04 | The session expires mid-form (server returns `AUTH_REQUIRED`) | Submit either form | The route announces the session-expired message, clears the auth hint, and redirects to the canonical sign-in; the safe deep link (`rememberDeepLink` of the current same-origin path/query/hash) is honored after a fresh login so the operator returns to `/profile/settings`; no inline error survives the navigation. |
| B-480-05 | The server returns `FORBIDDEN` (Active-status gate) | Submit either form | The canonical `ForbiddenView` renders with a safe exit to `/profile`; no form survives; the field is never retryable. |
| B-480-06 | The server is unavailable or the network drops (`NETWORK_ERROR`/`UNAVAILABLE`) | Submit either form | A retryable error block with an `autoFocus` `重試連接` control renders; activating it re-submits the same form via `requestSubmit()`; the draft values are preserved. |
| B-480-07 | A load or mutation state changes on the canonical settings route | Observe the transition | Heading focus moves predictably (loading → heading/error target), Back returns to `/profile`, the success flash is announced once, and the visible status and the global live region do not announce the same transition twice (one announcement owner). |
| B-480-08 | A maintainer audits the settings surface | Inspect the route, component, CSS, and tests | The weaker parallel implementation, its `settings.module.css` (or no-longer-imported settings implementation CSS), obsolete exports, and source-shape tests are deleted after all callers migrate; only the canonical `AccountSettings` + its CSS remain; `web/lib/account-settings-copy.ts` is the single copy source. |
| B-480-09 | The canonical settings surface renders ready and risk states | Run pinned Chromium geometry at W7 `320, 390, 600, 799, 800, 1024, 1440` CSS px plus material states (success, unchanged, forbidden, auth-expired redirect, retryable error, conflict) where composition changes | No horizontal overflow, 44px minimum app-facing targets, focus visible and not obscured, phone dock/safe-area clearance, both 799 and 800 pass for shell-sensitive states; numeric CSS-pixel evidence only, no screenshots. |
| B-480-10 | A route needs the shared lifecycle/header behavior | Mount the narrow route adapter | Loading, error, retry, heading focus, Back, flash, and one announcement owner are consumed through a narrow adapter that keeps domain requests, copy, result models, and authorization decisions local; the shared seam has at least one real shipped caller beyond settings (existing `useAsyncResource` callers: management hub, management directory, Programs Workspace, Programs boundary, permissions). |

### Test seams and gates

- **Component seam:** `web/lib/account-settings.test.tsx` (extended) asserts labeled inputs, helper text, Back href, unchanged-vs-success distinction, 409 conflict copy, 422 password copy, offline/network/unavailable retry, `ForbiddenView`, `AUTH_REQUIRED` redirect + deep-link preservation, focus, and one-announcement-owner discipline via MSW at `/api/v1/auth/username` and `/api/v1/auth/password`.
- **Worker seam:** `web/lib/auth/account-settings.test.ts` asserts the server contracts the UI depends on (200 with `sessionRevoked`, value-idempotent no-op, 409 duplicate, 422 current-password, session revocation, cookie clearing) under disposable D1.
- **Lifecycle/header seam:** `web/lib/programs/use-async-resource.tsx` (extended) and any Contextual Task Header ship with focused tests for request staleness, retry-focus, canonical announce, and the narrow auth-required deep-link handoff; existing callers' tests stay green.
- **Geometry seam:** pinned Chromium Playwright (shell-geometry config or an added settings route project) at W7 CSS px asserts settings critical anchors; numeric CSS-pixel evidence only, no screenshots.
- **Required gates for #480:** root and `web/` typecheck, focused settings/lifecycle/header tests, `/profile/settings` route smoke under local Wrangler/disposable D1, pinned geometry suite, `git diff --check`, reviewer READY before #481 and the fanout.

### Ticket acceptance criteria mapping

| Ticket criterion | Trace rows |
| --- | --- |
| The shipped settings route preserves validation and mutations while adding correct success, unchanged, retry, forbidden, authentication-expired, and conflict behavior. | B-480-01, B-480-02, B-480-03, B-480-04, B-480-05, B-480-06 |
| Authentication expiry remembers a safe deep link and returns through the canonical sign-in flow. | B-480-04 |
| Loading, error, retry, heading focus, Back, flash, and one announcement owner are reusable through a narrow route adapter. | B-480-07, B-480-10 |
| The weaker parallel settings implementation and its obsolete styling/tests are removed. | B-480-01, B-480-08 |
| Canonical settings ready and risk states pass relevant W7 geometry without screenshot evidence. | B-480-09 |

---

## Ticket #481 — S5-B03 unify approvals and mutation actions

**Design authority:** Spec 092 (Action Surface, primitive adoption), ADR-0042 (raw approval checkboxes become adoption targets; behavior over native shape), ADR-0043, `docs/qa/2026-08-27-code-layout-audit/management-approvals.md` (F-01, F-02), `management-approval-detail.md` (dead legacy declaration, retry gap, busy copy), `synthesis.md` (C-03, C-05)
**Stack position:** Stacked on #480 READY; freezes the Action Surface/settings interfaces consumed by #482/#483/#484

### Contract under test

Approval Queue/Detail are polished through one shared responsive Action Surface while proving the local Checkbox, Select, and AlertDialog primitive contracts. Checkbox supports checked, unchecked, mixed, disabled, keyboard, and accessible-name behavior; Select and AlertDialog preserve user outcomes. Dirty/selection/review/save/busy/failure/conflict actions remain in flow on phone, clear the dock/safe-area reserve, and use the approved desktop composition. Queue pending/processed/empty/search/selection and detail decision/retry/conflict paths remain complete and recoverable. Dead approval-detail code, equivalent raw controls, duplicate action recipes, obsolete CSS, and source-shape tests are removed. Behavior and critical-anchor geometry pass at W7 and the material 320/600/799/800/1024 states.

### Acceptance trace

| ID | Given | When | Observable result |
| --- | --- | --- | --- |
| B-481-01 | The Approval Queue renders pending registrations | Inspect the selection controls | Checkbox exposes checked, unchecked, and `mixed`/`indeterminate` states with correct `aria-checked`, disabled state while busy, keyboard activation, and an accessible name per row (`選取 <name>`); the select-all control reflects all/some/none of the visible filtered results. |
| B-481-02 | The operator filters the queue by role or searches | Use the Select and search controls | Select preserves the chosen role filter and search preserves the query; filtering does not clear the selection tray; the `已選 N 位` review surface stays accurate (selection survives search/filter/route transitions via the process-local selection map). |
| B-481-03 | The operator starts a batch approve or a single decision | Confirm the mutation | AlertDialog/confirm dialog preserves user outcomes: cancel restores focus to the trigger and changes nothing; confirm commits with an idempotency key; busy disables controls and sets `aria-busy`; success reloads to the terminal state (empty queue / read-only detail). |
| B-481-04 | A mutation fails with a stale/conflict result | Submit the batch or decision | `409 CONFLICT` shows the conflict copy, keeps the original selection (batch) or the Pending ready state with controls available (detail), and reconciles the queue from the server (`staleIds` visible in the tray); no automatic retry replaces the operator's choice. |
| B-481-05 | A load or decision fails transiently on the detail | Trigger the error state | The detail error block exposes a `重試連接` control (or the documented retry path), focus moves to a logical target, and the polite live region announces once; the read-only decided state remains viewable at the same URL. |
| B-481-06 | A non-Admin/Staff caller opens the queue or detail | Render the route | The S13 forbidden state renders with the safe back link to `/management?module=approvals`; no queue/detail data is fetched into a visible surface. |
| B-481-07 | The phone layout shows the action/tray surface | Render at 320/390/600 CSS px with the queue tray or detail decision buttons | The Action Surface stays in document flow (no overlay over content), clears the phone dock and safe-area reserve, and the last content anchor remains reachable; critical anchors (tray, confirm dialog, decision buttons) have no overflow and meet 44px minimums. |
| B-481-08 | The desktop layout shows the action/tray surface | Render at 799/800/1024/1440 CSS px | Both 799 (phone shell) and 800 (desktop shell) pass; the approved desktop composition may be denser without changing semantics; the queue tray/detail actions remain reachable and un-obscured; 1024 uses the approved layout. |
| B-481-09 | A maintainer audits the approval surface after cutover | Inspect code, CSS, and tests | `LegacyApprovalDetail` and any unreferenced legacy declaration are deleted; equivalent raw checkbox/select/dialog controls, duplicate action recipes, obsolete CSS, and source-shape tests are removed after every caller migrates; the frozen Action Surface contract is documented for downstream lanes; behavior tests assert roles/names/keyboard/mixed state rather than native element shape. |
| B-481-10 | The queue/detail behavior and geometry are verified | Run focused approval component tests and the pinned geometry suite | Queue pending/processed/empty/search/selection and detail decision/retry/conflict/read-only outcomes all pass at W7 plus the material 320/600/799/800/1024 states; numeric CSS-pixel evidence only, no screenshots. |

### Test seams and gates

- **Component seam:** `web/lib/approval-queue.test.tsx` and `web/lib/approval-detail.test.tsx` (extended) assert checkbox checked/unchecked/mixed/disabled/keyboard/name, Select and AlertDialog outcome preservation, selection survival, stale conflict reconciliation, busy/disabled/`aria-busy`, retry on the detail error, focus restore, and one-announcement-owner discipline via MSW at `GET /api/v1/auth/registrations`, batch approve, and `POST /api/v1/auth/registrations/:id/{approve|reject}`.
- **Primitive seam:** local `web/components/ui/checkbox.tsx`, `select.tsx`, and `alert-dialog.tsx` (extended only as required) ship behavior-first tests for role/state, keyboard, focus, disabled, and accessible name; `web/lib/components-contract.test.tsx` conventions apply.
- **Action Surface seam:** `web/app/management/management-action-framework.tsx` + `settings-ui.tsx` tests cover the frozen `ActionSurface` finite states (dirty/selection/review/save/busy/failure/conflict), focus restore, and in-flow phone geometry.
- **Geometry seam:** pinned Chromium Playwright (management hardening/approval material config) at W7 plus material 320/600/799/800/1024 states asserts queue/tray/dialog/detail critical anchors; numeric CSS-pixel evidence only, no screenshots.
- **Required gates for #481:** root and `web/` typecheck, focused approval/primitive/action tests, pinned geometry suite, `git diff --check`, reviewer READY, frozen interfaces documented before the #482/#483/#484 fanout.

### Ticket acceptance criteria mapping

| Ticket criterion | Trace rows |
| --- | --- |
| Checkbox supports checked, unchecked, mixed, disabled, keyboard, and accessible-name behavior; Select and AlertDialog preserve user outcomes. | B-481-01, B-481-02, B-481-03 |
| Dirty/selection/review/save/busy/failure/conflict actions remain in flow on phone, clear the dock/safe area, and use the approved desktop composition. | B-481-03, B-481-04, B-481-07, B-481-08 |
| Queue pending/processed/empty/search/selection and detail decision/retry/conflict paths remain complete and recoverable. | B-481-02, B-481-04, B-481-05, B-481-06, B-481-10 |
| Dead approval-detail code, equivalent raw controls, duplicate action recipes, obsolete CSS, and source-shape tests are removed. | B-481-09 |
| Behavior and critical-anchor geometry pass at W7 and material 320/600/799/800/1024 states. | B-481-07, B-481-08, B-481-10 |

---

## Ticket #482 — S5-B04 unify Account and Member directories

**Design authority:** Spec 092 (Directory Frame deep module), `docs/qa/2026-08-27-code-layout-audit/management-accounts.md` (header/description/aria/filter findings, 800–1023 reflow), `management-members.md` (detail username, idle hint, `--line-strong`), `architecture-matrices.md` (directory frame module), `ticket-readiness-contracts.md` (management hub/directories matrix)
**Stack position:** Runs in parallel with #483/#484 only after #480/#481 READY and shared interfaces are frozen; frozen shared-file ownership

### Contract under test

One Directory Frame is proven through Account and Member directories, sharing responsive search/filter/list/detail composition, state slots, focus restoration, selection, and pagination/virtualization hooks while each directory retains its own domain rows, filters, URLs, permission projections, and mutations. Account description semantics and the detail/load-more recovery defects are fixed. Equivalent raw controls and both directory CSS Modules are removed after all callers migrate. Geometry covers W7 plus the 600 filter Sheet, 799/800 shell transition, 800–1023 reflow, and 1024 detail layout.

### Acceptance trace

| ID | Given | When | Observable result |
| --- | --- | --- | --- |
| B-482-01 | Admin/Staff render `/management?module=accounts` | Render through the shared frame | Account Directory keeps its distinct filters (role/status/department), rows (avatar, username, role/status pills), URL vocabulary (`q`, `role`, `status`, `department`, `account`, `return`), server permission projection, and detail mutation/read-only semantics; the frame owns only the shared slots. |
| B-482-02 | Admin/Staff render `/management?module=members` | Render through the same frame | Member Directory keeps its distinct 2-character minimum search, row model (name, contact, role, department memberships), client-only query state, inline detail without a commit step, and server projection; the frame is the same module with Account/Member adapters. |
| B-482-03 | The operator searches, filters, and paginates either directory | Use the shared frame controls | Search, filter Sheet (600 CSS px material state), list/detail, `載入更多` load-more with bounded page append, retry, selection, and scroll/focus restoration are observable; 200+ record behavior renders without horizontal overflow and without replacing existing rows. |
| B-482-04 | A directory load or detail load fails | Trigger the error path | The recoverable error state with `重試連接` re-fetches and restores focus to a logical target; the Account detail error and load-more recovery defects are fixed (visible recovery, focus, no duplicate rows, no lost filter/URL state). |
| B-482-05 | The operator opens an Account detail | Select a row or load a bookmarked `account=` URL | The detail restores query, filters, loaded pages, selected row, and scroll from the URL; the read-only facts use the correct Account description semantics (labeled role/status/contact/departments, `唯讀資料` note); detail error and not-found states are recoverable and focused. |
| B-482-06 | The operator crosses the shell breakpoint or the directory reflow widths | Render at W7 `320, 390, 600, 799, 800, 1024, 1440` CSS px | 799 shows the phone shell and 800 the desktop shell; the 600 filter Sheet and 800–1023 single-column reflow pass; ≥1024 uses the two-zone layout with sticky detail; no horizontal overflow, 44px minimum targets, focus visible, dock/safe-area clearance; numeric CSS-pixel evidence only, no screenshots. |
| B-482-07 | A maintainer audits the directory surface after cutover | Inspect code, CSS, and tests | Equivalent raw controls (search inputs, selects, filter dialog) are migrated to local primitives; both `account-directory-panel.module.css` and `member-directory-panel.module.css` (and any no-longer-imported directory CSS) are removed after all callers migrate; no domain vocabulary leaks into the frame (no Account/Member query, row, filter, URL, permission, or mutation types inside `directory-frame.tsx`). |

### Test seams and gates

- **Component seam:** `web/lib/account-directory-panel.test.tsx` and `web/lib/member-directory-panel.test.tsx` (extended) assert frame slots, focus restoration, selection, retry/load-more recovery, filter Sheet behavior, long copy, and 200+ record appends via MSW at `GET /api/v1/programs/accounts`, `GET /api/v1/programs/accounts/:id`, and `GET /api/v1/programs/members`.
- **Frame seam:** `web/app/management/directory-frame.tsx` ships typed slots (header/search/filter/list/detail/loading/empty/error/forbidden, focus restoration, selection, pagination/virtualization hooks) with frame-level finite-state/slot/focus tests that never import Account/Member domain types.
- **Worker seam:** `web/lib/programs/account-directory.test.ts` (and member-directory worker tests where applicable) pin the server projections the frame renders.
- **Geometry seam:** pinned Chromium Playwright at W7 plus the 600 filter Sheet, 799/800 shell transition, 800–1023 reflow, and 1024 detail layout asserts directory critical anchors; numeric CSS-pixel evidence only, no screenshots.
- **Required gates for #482:** root and `web/` typecheck, focused frame/directory tests, pinned geometry suite, `git diff --check`, reviewer READY, no shared-file edits outside #482 ownership.

### Ticket acceptance criteria mapping

| Ticket criterion | Trace rows |
| --- | --- |
| Account and Member directories preserve distinct filters, rows, URLs, permission projections, and mutations behind the shared frame. | B-482-01, B-482-02, B-482-07 |
| Search, filter Sheet, list/detail, load-more, retry, selection, scroll/focus restoration, and 200+ record behavior are observable. | B-482-03, B-482-04 |
| Account description semantics and detail/load-more recovery defects are fixed. | B-482-04, B-482-05 |
| Equivalent raw controls and both directory CSS Modules are removed after all callers migrate. | B-482-07 |
| Geometry covers W7 plus the 600 Sheet, 799/800 shell transition, 800–1023 reflow, and 1024 detail layout. | B-482-06 |

---

## Ticket #483 — S5-B05 unify Home and communications presentation

**Design authority:** Spec 092 (Feed Presentation deep module, announcement ownership), `docs/qa/2026-08-27-code-layout-audit/home.md` (history-stack growth P2, HTTPS CTA), `notices.md` (P2-02 read-failure test gap, duplicate landmark label), `messages.md` (F-02 back semantics), `workspace-notifications.md` (F-N08 unreachable `ProgramsAttention`, F-N04 read-failure surfacing), `synthesis.md` (C-01, C-10)
**Stack position:** Runs in parallel with #482/#484 only after #480/#481 READY and shared interfaces are frozen; frozen shared-file ownership

### Contract under test

Home, Notices, and Messages are polished through one Feed Presentation seam while preserving their separate data/read actions. Home no longer drops valid actions silently and preserves correct browser history/Back behavior. Notices and Messages share list/detail/loading/error/empty presentation while retaining local read state, fetching, URLs, and actions. Each state transition has one announcement owner; optimistic/read failure exposes visible recovery. Unreachable parallel Programs Attention code is deleted unless a shipped caller is proven before cutover. Home/communications CSS Modules are removed and W7/long-copy/overlay geometry passes without screenshots.

### Acceptance trace

| ID | Given | When | Observable result |
| --- | --- | --- | --- |
| B-483-01 | An authenticated reader loads `/home` | Render the Home route through the Feed Presentation | Home renders next-event, announcement, and explore sections without silently dropping valid actions (every rendered CTA has a working destination and visible affordance); browser history/Back behavior is correct (announcement overlay opens with `history.pushState`, Back closes it without a duplicate history entry or lost state). |
| B-483-02 | The reader opens and closes the Home announcement | Activate the announcement card, then Back/in-card close | The detail renders from the same presentation seam as Notices/Messages detail; Back (browser or in-card) returns to the Home list with a single correct history transition; external CTA keeps the HTTPS-only validation and the documented fallback semantics; no valid action is dropped. |
| B-483-03 | The reader loads `/notices` and `/messages` | Render both routes through the Feed Presentation | Both share list/detail/loading/error/empty composition and announcement discipline; Notices retains local `listNotices`/`markAllNoticesRead` read state and per-kind deep links (`buildProgramsHref` origins, `/profile` for account notices); Messages retains `listAnnouncements` read-only projection and `parseMessagesIntent`/`buildMessagesHref` URL handling. |
| B-483-04 | A load or read action fails on any feed surface | Trigger the error/read-failure path | Each feed renders a visible recovery affordance (retry for load failure; visible error + re-enabled control for mark-read failure) and announces once through the single announcement owner; optimistic read state that fails exposes visible recovery and does not silently stay applied. |
| B-483-05 | A state transition occurs on any feed surface | Observe the transition | Exactly one announcement owner announces each transition (visible status and the global polite live region never announce the same event twice); no duplicate live-region announcements from panel-level and page-level shapes. |
| B-483-06 | A maintainer audits the feed surface after cutover | Inspect code, CSS, and tests | `ProgramsNotifications` is retained because `ProgramsBoundary` is a real shipped caller; the unreachable `ProgramsAttention` component and its `programs-attention.test.tsx` (or its shipped-caller proof) are removed unless a shipped caller is proven before cutover; obsolete Home/communications CSS Modules and duplicate tests are removed after every caller migrates; the presenter never fetches, marks read, parses route URLs, decides permissions, or performs domain actions. |
| B-483-07 | The feed surfaces render at W7 and long-copy/overlay states | Render at `320, 390, 600, 799, 800, 1024, 1440` CSS px with long CJK/Latin/unbroken copy and the announcement overlay | No horizontal overflow, long copy wraps and stays contained, the announcement overlay is fully inside the viewport with 44px targets, both 799 and 800 pass for shell-sensitive states; numeric CSS-pixel evidence only, no screenshots. |

### Test seams and gates

- **Component seam:** `web/lib/notices-panel.test.tsx`, `web/lib/messages-panel.test.tsx`, and `web/lib/home.test.tsx` (extended) assert list/detail/loading/error/empty states, read-failure recovery, one-announcement-owner discipline, valid-action/history behavior, and intent round-trips via MSW/mocks at `listNotices`, `markAllNoticesRead`, `listAnnouncements`, and `GET /api/v1/home`.
- **Presenter seam:** `web/lib/feed-presentation.tsx` ships typed list/detail/loading/error/empty slots with presenter-level tests that never fetch, mark read, route, or decide permissions; `AnnouncementDetail`, `messages-intent`, and `programs-intent` remain adapter-owned.
- **Route/geometry seam:** pinned Chromium Playwright (home/notices/messages route projects and `tests/e2e/pui-05-home-origin.test.ts` long-copy/overlay probes) at W7 CSS px asserts feed critical anchors, history/Back outcomes, and overlay containment; numeric CSS-pixel evidence only, no screenshots.
- **Required gates for #483:** root and `web/` typecheck, focused feed/Home/Notices/Messages tests, pinned geometry suite, `git diff --check`, reviewer READY, no shared-file edits outside #483 ownership.

### Ticket acceptance criteria mapping

| Ticket criterion | Trace rows |
| --- | --- |
| Home no longer drops valid actions silently and preserves correct browser history/Back behavior. | B-483-01, B-483-02 |
| Notices and Messages share list/detail/loading/error/empty presentation while retaining local read state, fetching, URLs, and actions. | B-483-03 |
| Each state transition has one announcement owner; optimistic/read failure exposes visible recovery. | B-483-04, B-483-05 |
| Unreachable parallel Programs Attention code is deleted unless a shipped caller is proven before cutover. | B-483-06 |
| Home/communications CSS Modules are removed and W7/long-copy/overlay geometry passes without screenshots. | B-483-06, B-483-07 |

---

## Ticket #484 — S5-B06 split Programs Workspace into focused tasks

**Design authority:** Spec 092 (Programs Workspace deep module), `docs/qa/2026-08-27-code-layout-audit/program-workspace.md` (W-06 monolith split candidate), `workspace-events.md`, `workspace-participants.md`, `workspace-settings.md`, `workspace-notifications.md` (F-N02 task label, F-N04 read-failure), `architecture-matrices.md` (workspace module)
**Stack position:** Runs in parallel with #482/#483 only after #480/#481 READY and shared interfaces are frozen; frozen shared-file ownership

### Contract under test

The Programs Workspace route and task intent stay unchanged while Events, Participants, Settings, and Notifications are separated into focused internal modules behind one workspace interface. Existing workspace URL intent, task navigation, focus, data ownership, and mutations preserve observable behavior. The four tasks have local implementations and share only workspace context plus approved async/state modules. No generic Task framework or route split is introduced. The structural cut leaves existing focused component and route contracts green and creates clear ownership for later Tailwind/domain migrations.

### Acceptance trace

| ID | Given | When | Observable result |
| --- | --- | --- | --- |
| B-484-01 | An operator loads `/programs?mode=management&program=<id>` (overview) or `&task=events\|participants\|settings` | Render the workspace | The URL intent, task navigation (`WorkspaceNavigation` links, boundary `onTaskChange`), heading/focus behavior, and creation flash all behave exactly as before the split; the route, `ProgramWorkspaceProps`, and `ProgramsIntent` are unchanged. |
| B-484-02 | The operator opens the Events task | Render `task=events` (with optional `event=<id>` deep link) | Events behavior is unchanged: `EventsTask` loads/retries its own domain data, renders the management create entry point, honors the event deep link, and routes back through `onEventChange`; the focused module owns only Events presentation and shares only workspace context plus approved async/state modules. |
| B-484-03 | The operator opens the Participants task | Render `task=participants` | Participants behavior is unchanged: pending/active/history tabs, decision queue with optimistic-concurrency version, stale/conflict/duplicate recovery, assisted enrollment, and attention counts all preserve observable behavior; domain queries, rows, forms, and mutations stay local to the focused module. |
| B-484-04 | The operator opens the Settings task | Render `task=settings` | Settings behavior is unchanged: the four group surface (Basics/Enrollment/Schedule/Attendance) preserves local validation and save semantics; `ProgramSettings` remains the domain-owned implementation mounted by the focused Settings module. |
| B-484-05 | The operator opens the Notifications task or the compact bell | Render `task=notifications` or the management header bell | `ProgramsNotifications` remains a shipped caller through `ProgramsBoundary` with unchanged mark-read/optimistic/recovery behavior; the focused module mounts it only under the existing valid shipped intent; the workspace task label no longer mislabels notifications. |
| B-484-06 | A task's module is disabled or the operator lacks scope | Render a task without its module or with revoked access | `TaskUnavailable` (or the documented unavailable branch) renders without fetching protected data; forbidden/unavailable/recoverable/auth-expired paths preserve the existing focus, announcement, and retry behavior. |
| B-484-07 | A maintainer audits the workspace after the split | Inspect `web/lib/programs/` modules, the workspace file, and tests | The monolithic duplicate declarations and imports superseded by the focused files are deleted; no generic Task framework, plugin, or route split is introduced; each focused task module has a real shipped caller; existing `program-workspace.test.tsx`, `programs-management-boundary.test.tsx`, `programs-notifications.test.tsx`, and Programs route/geometry tests stay green; ownership for later Tailwind/domain migrations is clear. |
| B-484-08 | The workspace renders at W7 | Run pinned Chromium geometry at `320, 390, 600, 799, 800, 1024, 1440` CSS px across the overview and task states | No horizontal overflow, 44px minimum targets, focus visible, phone dock/safe-area clearance, 799/800 shell transition and 800–1024 reflow pass; numeric CSS-pixel evidence only, no screenshots. |

### Test seams and gates

- **Component seam:** `web/lib/programs/program-workspace.test.tsx`, `programs-management-boundary.test.tsx`, and `programs-notifications.test.tsx` (extended) assert each focused task's URL/task/event round trips, focus, unavailable modules, auth retry paths, decision/conflict recovery, and mark-read behavior through the existing mocks at `getManagementProgram`, `listEvents`, `listEnrollmentSnapshot`, `decideEnrollmentRequest`, `getManagementNotifications`, and `markManagementNotificationsRead`.
- **Intent seam:** `web/lib/programs/programs-intent.ts` (unchanged) remains the single URL-owned task/mode/event contract; `web/lib/programs/programs-boundary.tsx` mount points change only where task mounting requires it.
- **Geometry seam:** pinned Chromium Playwright (Programs route/geometry projects, `tests/e2e/programs-*.config.ts`) at W7 CSS px asserts workspace critical anchors across overview and task states; numeric CSS-pixel evidence only, no screenshots.
- **Required gates for #484:** root and `web/` typecheck, focused workspace/boundary/notification tests, pinned geometry suite, `git diff --check`, reviewer READY, no shared-file edits outside #484 ownership.

### Ticket acceptance criteria mapping

| Ticket criterion | Trace rows |
| --- | --- |
| Existing workspace URL intent, task navigation, focus, data ownership, and mutations preserve observable behavior. | B-484-01, B-484-02, B-484-03, B-484-04, B-484-05 |
| Events, Participants, Settings, and Notifications have local implementations and share only workspace context plus approved async/state modules. | B-484-02, B-484-03, B-484-04, B-484-05 |
| No generic Task framework or route split is introduced. | B-484-07 |
| The structural cut leaves existing focused component and route contracts green and creates clear ownership for later Tailwind/domain migrations. | B-484-06, B-484-07, B-484-08 |

---

## Obsolete implementations to remove within Phase B scope

Removal happens only after every caller migrates and only for implementations proven superseded by a completed Phase B caller. Each removal is evidenced by a focused test still green and the deleted file/export absent from the tree:

- **#480:** the weaker duplicate `AccountSettingsContent` in `web/app/profile/settings/page.tsx` (reduced to a route adapter or removed), `web/app/profile/settings/settings.module.css` and any no-longer-imported settings implementation CSS, and obsolete settings tests/exports.
- **#481:** `LegacyApprovalDetail` and any unreferenced legacy declaration in `web/lib/approval-detail.tsx`; equivalent raw approval checkbox/select/native-dialog controls and duplicate action recipes; obsolete approval CSS and source-shape tests; stale `var(--line-strong, #aeb8bc)` fallbacks where the approval surface is cut over.
- **#482:** equivalent raw directory controls (search inputs, selects, custom filter dialog) and both `account-directory-panel.module.css` and `member-directory-panel.module.css` after all callers migrate.
- **#483:** obsolete Home/communications CSS Modules and duplicate feed tests; the unreachable `ProgramsAttention` component and its test file unless a shipped caller is proven before cutover (`ProgramsNotifications` is retained — it has a real `ProgramsBoundary` caller).
- **#484:** the monolithic duplicate `WorkspaceNavigation`/`WorkspaceOverview`/`EventsTask`/`ParticipantsTask`/`SettingsTask`/`TaskUnavailable` declarations and imports superseded by the focused `web/lib/programs/workspace-*.tsx` modules.

No generic Form/DataTable/CRUD/Task/plugin/authorization framework is introduced by any removal; every obsolete path is deleted, not wrapped or aliased.

## Phase B provenance

- **Base SHA:** `3cc674f4e2240abaebb47bb75c6614a8c3d7c624` (Phase A PR #496 `remediate-478` head; the Phase B branch `feat/s4-b-shared-modules-role-definitions` tracks `origin/remediate-478` at this exact commit).
- **Stack origin:** PR #473 (`feat/s4-12-shadcn-migration`, base `85817f563a801e891bfbf758e3174ea0bdea9544`) — Phase A was its first child; Phase B is its second child via the accepted Phase A head.
- **Grouped PR title:** `feat(s4-b): shared UI modules and role definitions`.
- **Worktree:** `.worktrees/s4-phase-b` on branch `feat/s4-b-shared-modules-role-definitions`.
- **Trace path:** `docs/specs/s4-phase-b-acceptance-trace.md`.
- **Parent authority (imported unchanged into this branch):** `docs/specs/091-stackable-identity-backend.md`, `docs/specs/092-discord-identity-design-system-adoption.md`, `docs/adr/0042-discord-like-stackable-role-model.md`, `docs/adr/0043-owned-civic-design-system-governance.md`, issue #475. The four files were imported byte-for-byte from the reviewed Phase A planning worktree's current files at trace preparation; those files include current planning deltas relative to committed `f1b77c0e`, and the copied content is documentation provenance, not new product scope.
- **Planning inputs:** `docs/omp-plans/2026-08-28-s4-phase-b-shared-modules.md`, `docs/omp-plans/2026-08-28-s4-phase-handoff-prompts.md`, `docs/specs/s4-phase-a-acceptance-trace.md`, `docs/qa/2026-08-28-s4-phase-a-foundation.md`, `docs/qa/2026-08-27-code-layout-audit/` (ticket-readiness-contracts, architecture-matrices, shared-contracts, synthesis, and route reports for Account Settings, approvals, approval detail, accounts, members, Home, Notices, Messages, Programs Workspace, workspace events/participants/settings/notifications), and the issue bodies/comments of #479–#484.
- **Tickets covered:** #479, #480, #481, #482, #483, #484.
- **Tickets explicitly excluded (not Phase B):** #485–#495 (Phases C–F).
- **Convention:** modeled on `docs/specs/s4-phase-a-acceptance-trace.md`; planning-only, no production code, schema, migration, fixture, deployment, or data change authorized.

## Phase B no-Phase-C clause

This trace records the Phase B acceptance contract only. It does not authorize, scope, schedule, or describe Phase C (stackable identity integration, #485–#487: Permission Editor, Account Access, normalized bootstrap authorization cutover, legacy identity removal beyond the completed Phase B callers), Phase D (member/public route wave, #488–#490), Phase E (operations route wave, #491–#493), or Phase F (contract and evidence, #494–#495). Those phases require their own acceptance traces, their own review gates, and their own grouped PRs. Phase B stops after the grouped Phase B PR is opened on the reviewed Phase A head; it is not merged, no production promotion is made, and Phase C source work is not begun.
