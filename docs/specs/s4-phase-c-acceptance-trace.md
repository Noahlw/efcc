# S4 Phase C — Stackable Identity Integration acceptance trace

**Phase:** Stack PR C — third child stacked on the accepted Phase B PR #497
**Stack origin:** PR #473 (`feat/s4-12-shadcn-migration`)
**Immediate base:** accepted Phase B PR #497 (`feat/s4-b-shared-modules-role-definitions`), exact head `c75c99e84d699d2d1eac44f07d4e013ead4c12a5`
**Tickets:** #485 (S5-C01 Permission Editor), #486 (S5-C02 Account Access and identity lifecycle), #487 (S5-C03 normalized bootstrap/Programs/attendance/management authorization cutover, with full legacy identity removal)
**Parent authority:** issue #475, Spec 091, Spec 092, ADR-0042, ADR-0043
**Grouped PR title:** `feat(s4-c): stackable identity integration`
**Phase base:** `c75c99e84d699d2d1eac44f07d4e013ead4c12a5` (Phase B PR #497 `feat/s4-b-shared-modules-role-definitions` head)
**Status:** Planning-only acceptance trace; no production code, schema, migration, fixture, deployment, or data change is authorized by this document

> This acceptance trace records the observable contract that Phase C (#485, #486, #487) must satisfy. It maps every ticket acceptance criterion to a verifiable outcome, persona/fixture, surface, width/state, test seam, evidence owner, and manual owner/status. It does not modify production code, schema, fixtures, or CSS. Phase D (#488–#490), Phase E (#491–#493), and Phase F (#494–#495) are explicitly excluded and out of scope for this trace. All automation rows start as PENDING; manual-only rows are MANUAL.

## Phase C scope boundary

**In scope (this trace only):**

- #485 — Permission Editor replacing the fixed-role Permission Editor: per-capability Radix Switch toggles grouped by capability group, role-detail read PATCH, sticky `<= 3` ordinary Sheet review, high-risk/`> 3` dedicated review, atomic grant/revoke patches through `applyRoleMutation` with full revision, idempotency, audit, denial, and conflict semantics.
- #486 — Account Access view and identity lifecycle: eligible-account search, multi-identity atomic grant, revoke-with-history, re-add as a new assignment event, archive with bulk assignment revocation, restore that preserves grants/history but no assignments, and full Effective Permission projection by Global/Department/Program with grant provenance.
- #487 — Normalized bootstrap, Programs/attendance/management authorization cutover, and full removal of `role_capabilities`, `department_managers`, `program_leaders`, `permission_policy_state`, `permission_policy_mutations` from executable production code, migration DDL/seed writers, and tests. Fresh disposable D1 must contain only normalized identity tables; preflight detects any legacy table and emits a manual reset instruction without issuing `DROP`. Old `/api/v1/programs/account-permissions` returns `404 NOT_FOUND`; old Manager/Leader route families are absent.

**Out of scope (excluded from this trace; not in Phase C):**

- Phase D — member/public route wave (#488–#490).
- Phase E — operations route wave (#491–#493).
- Phase F — contract and release evidence (#494–#495).
- Production D1, Apps Script, Google Sheets, Cloudflare production, or non-disposable database changes.
- Generic Form/DataTable/Task/authorization framework, plugin layer, or repository-wide styling rewrite.
- Runtime dual identity model, compatibility endpoint, legacy policy writer, or legacy Manager/Leader authority read.
- Screenshot assertions, image snapshots, or pixel-diff tests.
- Discord colors, assets, gaming vocabulary, server/channel concepts, or branding.
- The credential/import history field on `accounts.role` (may remain only for non-authoritative storage).
- WCAG conformance claim (manual gates are recorded but never auto-claim formal certification).

## Phase C global constraints

- Tickets in this plan: #485, #486, #487 only. Grouped PR title: `feat(s4-c): stackable identity integration`.
- Stack origin PR #473; immediate base is the accepted Phase B PR #497 (`feat/s4-b-shared-modules-role-definitions`) at exact head `c75c99e84d699d2d1eac44f07d4e013ead4c12a5`. GitHub account `Noahlw` before publication; no merge, deploy, force-push, reset, or Phase D start.
- Spec 091 and ADR-0042 own domain/authorization truth. The Worker recomputes actor, active assignments, highest position, capability, target, scope, revision, idempotency, and audit state from D1. The browser receives affordance projections only.
- `Admin` is protected highest, exclusive, all-on, and locked. `會友基礎` is automatic lowest, locked, and non-assignable. Fixed Role Categories are read-only and grant no authority. Staff and scoped identities are ordinary normalized assignments subject to lower-position and scope rules.
- Use cookie-only authentication, `{ requestId, data }` response envelope, `X-Request-Id` correlation, RFC 9457 Problem Details, actor-bound `Idempotency-Key`, atomic D1 mutation plus audit plus terminal idempotency result, and the named failure taxonomy from ticket-readiness contracts.
- Capability catalog lives in `web/lib/identity/capability-catalog.ts`; every closed capability carries Cantonese label, description, group, risk (`normal` or `high`), system-only flag, and scope requirement. `PERMISSION_POLICY_DEFINITIONS` and `ROLE_CAPABILITY_DEFAULTS` are deleted after every caller is migrated.
- New mutation kinds: `restore_role_definition`, `ROLE_DEFINITION_POLICY_UPDATE`, `ROLE_DEFINITION_RESTORE`. Homogeneous grant patches use `ROLE_DEFINITION_GRANT` or `ROLE_DEFINITION_REVOKE`; mixed patches use `ROLE_DEFINITION_POLICY_UPDATE`. `archive_role_definition` atomically sets archive state and revokes active assignments; `restore_role_definition` preserves grants/history and recreates no assignments.
- Civic Minimal is preserved: Cantonese-first copy, cinnabar action emphasis, teal focus, light civic surfaces, functional borders, 44px app-facing targets, safe-area clearance, phone-first flow, and the named 800px shell transition.
- Use W7 `320, 390, 600, 799, 800, 1024, 1440` CSS px. Material state widths follow the ticket matrices below; both 799 and 800 are mandatory for shell/action-sensitive states. No screenshot, image snapshot, or pixel-diff tests: geometry is numeric CSS-pixel evidence from pinned local Playwright Chromium.
- Authenticated browser verification uses local `wrangler dev` and disposable `E2E_`/`E2E_DEMO_` D1 only. Never mutate Apps Script, Google Sheets, Cloudflare production, or an unknown/non-disposable database.
- Human keyboard, VoiceOver/NVDA, reduced-motion, forced-colors, zoom/text-spacing, and real-device checks remain manual gates; automated evidence must not claim formal WCAG certification.
- Root `pnpm build` is a known pre-existing stub-script failure; the real production build gate is `pnpm --dir web build` plus root/web/worker/E2E typechecks.
- Authority docs (`docs/specs/091-stackable-identity-backend.md`, `docs/specs/092-discord-identity-design-system-adoption.md`, `docs/adr/0042-discord-like-stackable-role-model.md`, `docs/adr/0043-owned-civic-design-system-governance.md`) are imported unchanged into this branch so referenced authority is auditable; copied content is documentation provenance, not new product scope.

---

## Identity request authority shape

The Worker is the only authority. The browser renders projections. Every privileged mutation routes through one named normalized shape:

```text
cookie session
  -> Active Account
  -> active Role Assignments + Role Definitions
  -> highest position + explicit scope
  -> closed capability catalog / effective grants
  -> target + protected/highest/self/scope checks
  -> revision + actor-bound idempotency key
  -> one D1 mutation + audit + terminal idempotency record
  -> authoritative projection + request/correlation ID
```

## Capability cutover contract

- `resolveActorCapabilities(db, actorUserId, scope?)` reads active normalized assignments/grants, gives `Admin` every closed capability (`role.*`, `account.permissions.write`, `registration.approval.manage`, `home.publish`, etc.), gives every Active Account automatic `program.enroll`, and applies Global versus exact Department/Program scope without widening.
- `resolveProgramAccess(db, actorUserId, programId)` loads the Program's Department, calls the normalized identity resolver, and performs no cache or legacy query. `D1CapabilityAuthorizer.can(ctx, capability, scope)` calls this named normalized seam for Program-scoped checks and the same normalized capability function for non-Program checks.
- `loadBootstrapIdentity(db, actorUserId)` is the only source for `/api/v1/auth/me`. Its projection is `{ systemRole, identities[], capabilities }` with safe labels/scopes; no credential, token, phone, attendance, or pastoral data.
- `sectionsForRole` / `stableNavigationSections` are replaced with capability-driven projection. Member-baseline-only gets Home/Programs/Scanner/Notices/Profile; any normalized management capability gets Management in the stable slot; normalized event-management capability gets Events. The server and browser never branch on `accounts.role`.

## Phase C dependency graph

```text
Phase B head c75c99e8
        |
        v
C acceptance trace commit
        |
        v
#485 Permission Editor -> focused tests -> reviewer READY
        |
        v
#486 Account Access/lifecycle -> focused tests -> reviewer READY
        |
        v
#487 bootstrap/Programs/attendance/management cutover
        |
        v
focused aggregate verification -> evidence -> grouped PR -> stop before Phase D
```

## Permission draft workflow

```text
clean --toggle--> dirty --review--> sheet (<= 3 normal changes)
                         |            dedicated review (> 3 or any high-risk change)
                         v
                    saving (controls locked)
                   /       \
          success/clean     non-conflict error/dirty
                   \
             stale revision -> authoritative refetch + explicit restart
```

## Account Access / lifecycle workflows

```text
Account Directory / Identity Detail
        | open
        v
eligible-account search (Active non-Admin, no self)
        | select
        v
Account Access (assigned, revoked, scope groups, provenance, lifecycle)
        |  add identities (atomic)
        |  revoke (history preserved)
        |  archive role (assignments revoked, grants preserved)
        |  restore role (assignments NOT recreated)
        v
revision + idempotency + audit + authoritative projection
```

---

## Acceptance trace rows

The columns are: **ID**, **Criterion**, **Exact input / action**, **Persona / fixture**, **Observable DOM / HTTP / D1 / audit result**, **Viewport / state**, **Test seam**, **Evidence owner**, **Manual owner / status**. All rows start as PENDING except manual-only rows which are MANUAL.

### Ticket #485 — S5-C01 Permission Editor

**Backend authority:** Spec 091 §§ 4.2, 5.1, 5.2, 6, 7.4, 9.2, 9.3, 13; ADR-0042 (role-tree semantics, locked interaction rules, Admin all-on, automatic 會友基礎)
**Stack position:** First Phase C child on the accepted Phase B PR #497 head; no upstream blocker within Phase C
**Exact HTTP surface:** `GET /api/v1/identity/role-definitions/:id` and `PATCH /api/v1/identity/role-definitions/:id/grants`

| ID | Criterion | Exact input / action | Persona / fixture | Observable DOM / HTTP / D1 / audit result | Viewport / state | Test seam | Evidence owner | Manual owner / status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-485-01 | `GET` Role Definition detail returns one selected identity, continuous catalog groups, Cantonese labels/descriptions, lock state/reasons, assignment summary, policy revision, and server actions; malformed/unknown URL state falls back safely. | Open `?module=permissions&role=<opaque id>&view=permissions` with a valid selected Role Definition; also exercise malformed (`role=`), unknown (`role=00000000-0000-0000-0000-000000000000`), archived, and unauthorized Role IDs. | Admin `E2E_DISPOSABLE_ADMIN` (and a Staff `E2E_DISPOSABLE_STAFF` with `role.permissions.read` only) on disposable D1 seeded by `pnpm db:seed:disposable` (normalized `tests/e2e/seed-disposable-identity.sql` + `tests/e2e/seed-dev-accounts.ts`). | HTTP `200` returns `{ requestId, data: RoleDefinitionDetailView }` where `RoleDefinitionDetailView` contains exactly the selected `RoleHierarchyDefinition` (opaque `id`, normalized display `label`, fixed `category` reference, current `position`, computed `scopeKind` + `scopeLabel`, `is_archived` flag, and a one-line plain-language `lockReason` when the definition itself is locked), a `permissions` array that lists every closed capability from `CAPABILITY_CATALOG` in continuous groups with Cantonese `label` + `description`, `group`, `risk` (`normal`/`high`), `scopeRequired`, `value`, `editable`, `locked`, and nullable `lockReason` per row, an `assignedAccounts` summary that is safe (no credential, phone, attendance, or pastoral data), the current `revision`, and a server-projected `actions` list; a top-level `caller: { userId, canRead, canWrite }` projection identifies the cookie-session actor and the read/write capabilities the Worker authorized for this detail; `X-Request-Id` matches `body.requestId`; Admin gets `value: true` on every capability; every Active Account has automatic `program.enroll`. Malformed/unknown/archived Role ID falls back to the safe role list; unauthorized Role ID returns `403 ROLE_FORBIDDEN` (per Spec 091 §9.3, unknown identity/category/capability is `ROLE_NOT_FOUND`, empty target is `ROLE_INVALID_TARGET`); no unintended role is ever selected. No `accounts.role` is read for any decision. | W7 `320, 390, 600, 799, 800, 1024, 1440` CSS px; selected-role ready state, malformed-URL fallback, unknown-URL fallback, archived-URL fallback, unauthorized-URL fallback. | Worker/D1 seam `web/lib/identity/permission-editor.test.ts` + `web/lib/identity/permission-editor-handlers.test.ts` (detail authorization, full catalog/lock projection, Admin all-on, automatic baseline, safe assignment/grant data, `caller` projection); component seam `web/app/management/permission-editor-panel.test.tsx` (URL fallback, lock reasons, group continuity). | #485 Worker/D1 lane + #485 client lane | Human reviewer — manual gate pending where applicable; automation PENDING |
| C-485-02 | Editable permissions use the local Radix Switch with `role=switch`, `aria-checked`, keyboard activation, visible/non-obscured focus, controlled state, and disabled/busy semantics; Admin, baseline, highest/self, archived, out-of-scope, and unavailable cells are visible but locked with a plain-language reason. | Toggle one eligible Switch row; activate it via keyboard (`Space`/`Enter`) and pointer; submit a draft with one of every lock reason present in the same role. | Admin (`E2E_DISPOSABLE_ADMIN`) and Staff with `role.permissions.write` (e.g. `E2E_DISPOSABLE_STAFF`) on disposable D1 with a normal-capability Role Definition, a high-risk-capability Role Definition, the Admin protected role, the 會友基礎 automatic baseline, a self-targeted highest, an archived role, an out-of-scope role, and an unavailable capability. | Each permission cell renders the local Radix Switch with `role="switch"`, `aria-checked`, an accessible name, controlled state, focus ring not obscured, keyboard activation parity with pointer, and `aria-disabled`/`disabled` when locked; locked cells render a plain-language Cantonese `lockReason` (e.g. "最高層級身份已鎖定", "已封存，無法編輯", "不在你的編輯範圍", "系統能力，不開放"); Admin/baseline/highest-self/archived/out-of-scope/unavailable cells are visible but never toggle; `busy` state locks all controls during save. | W7 `320, 390, 600, 799, 800, 1024, 1440` CSS px; dirty state, locked-cells render, busy state. | Component seam `web/app/management/permission-editor-panel.test.tsx` (Switch `role=switch` + `aria-checked` + keyboard + focus + busy/locked semantics) + Radix contract test on `web/components/ui/switch.tsx`; geometry seam pinned Chromium Playwright (extend `tests/e2e/role-hierarchy-geometry.config.ts` if a new file is needed). | #485 client lane + #485 geometry lane | Human reviewer — manual gate pending where applicable; automation PENDING |
| C-485-03 | One toggle produces a revision-bound dirty draft; non-conflict save failure leaves the draft intact; saving locks controls and returns the authoritative grant set/revision. | Toggle one capability from `false` to `true` (or `true` to `false`); save; then simulate a non-conflict save failure (e.g. a transient worker error returning `502`/`503`) and confirm the draft survives. | Admin `E2E_DISPOSABLE_ADMIN` and a Staff fixture with `role.permissions.write` on disposable D1. | First toggle sets a dirty draft with the current `baseRevision`; Save locks every control with `busy` and `aria-busy`; success returns `{ requestId, data: { ...RoleDefinitionDetailView, revision: newRevision } }` with the authoritative grant set and incremented revision; a non-conflict error keeps the draft, the controls unlocked, and the error message announced; no second audit row is written. | W7 `320, 390, 600, 799, 800, 1024, 1440` CSS px; dirty state, saving state, error state. | Component seam `web/app/management/permission-editor-panel.test.tsx` (dirty/saving/success/error transitions) + Worker/D1 seam `web/lib/identity/permission-editor.test.ts` (no double audit on non-conflict error). | #485 client lane + #485 Worker/D1 lane | Human reviewer — manual gate pending where applicable; automation PENDING |
| C-485-04 | At most three ordinary changed grants use a capped Sheet; more than three or any high-risk capability (`role.*`, `account.permissions.write`, `registration.approval.manage`, `home.publish`) uses a dedicated review view. Neither view blocks the phone dock or viewport. | Submit a draft of 1, 2, 3 ordinary changes (capped Sheet), 4 ordinary changes (dedicated review), and 1 high-risk change (dedicated review). | Admin/Staff with `role.permissions.write` on disposable D1; targets include a normal Role Definition and a Role Definition that already holds `role.*` or `account.permissions.write`. | `<= 3` ordinary changes open a `Sheet` (or equivalent local surface) listing only the changed grants with a single confirm control; `> 3` or any high-risk change opens a dedicated review view that calls out every high-risk capability by Cantonese label and requires explicit acknowledgement; both views clear the phone dock and viewport safe-area, never cover dock icons, and pass the relevant W7 widths (320/390/600/799/800/1024/1440). Admin/baseline/highest/archived/out-of-scope targets never become editable to bypass the threshold. | W7 `320, 390, 600, 799, 800, 1024, 1440` CSS px; capped-Sheet state, dedicated-review state, phone-dock clearance. | Component seam `web/app/management/permission-editor-panel.test.tsx` (Sheet/Dialog/AlertDialog primitives, threshold logic, dock clearance) + geometry seam pinned Chromium Playwright (320/390/600/799/800/1024/1440). | #485 client lane + #485 geometry lane | Human reviewer — manual gate pending where applicable; automation PENDING |
| C-485-05 | A successful grant patch atomically advances `role_policy_revisions`, writes the normalized grant rows, returns `{requestId,data}` plus `X-Request-Id`, and writes one immutable success audit. Replaying the same actor/key/request hash returns the original result without another audit. | Save one grant patch with idempotency key `K`; replay the same PATCH with the same actor/key/payload; replay again after a dropped response (response-loss). | Admin/Staff with `role.permissions.write` on disposable D1 with one normal Role Definition. | HTTP `200` returns the new authoritative view with incremented `revision`; D1 contains the new `role_definition_grants` rows; `role_policy_revisions` advanced by one; one immutable SUCCESS audit row with `correlation_id` = `requestId`; one terminal idempotency row; `X-Request-Id` matches `body.requestId`. Replay returns the original `data` envelope (same `requestId`/audit/idempotency), no duplicate `role_definition_grants` rows, no duplicate `role_policy_revisions` advance, no second audit. Homogeneous grant patches audit `ROLE_DEFINITION_GRANT` or `ROLE_DEFINITION_REVOKE`; mixed patches audit `ROLE_DEFINITION_POLICY_UPDATE`. | Server state; replay state; response-loss replay state. | Worker/D1 seam `web/lib/identity/permission-editor.test.ts` (atomic advance, replay, response-loss replay) + `web/lib/identity/d1-schema.test.ts` (no duplicate grant rows, no duplicate audit) + handler seam `web/lib/identity/permission-editor-handlers.test.ts` (envelope + correlation). | #485 Worker/D1 lane | Human reviewer — manual gate pending where applicable; automation PENDING |
| C-485-06 | Stale revision returns `409 ROLE_POLICY_CONFLICT` and authoritative revision; changed idempotency payload returns `409 ROLE_IDEMPOTENCY_REUSE`; Member/unauthorized, Admin, baseline, and closed-capability attempts return the named 403/422 outcome with no grant/revision mutation and the required denial/rejection audit. After a stale `409 ROLE_POLICY_CONFLICT`, the client refetches the authoritative grant set and revision, preserves the user's dirty draft and selection, and offers an explicit `discard and restart` action before retry. | (1) Submit with a stale `base_revision`; (2) reuse the same idempotency key with a different canonical payload; (3) submit as Member (`E2E_DISPOSABLE_MEMBER`) with no `role.permissions.write`; (4) target Admin/baseline; (5) try to toggle a closed capability; (6) after (1) returns `409 ROLE_POLICY_CONFLICT`, confirm the client refetches the authoritative view, keeps the draft and selected toggles, and exposes an explicit `discard and restart` affordance before retry. | Admin/Staff with `role.permissions.write` and Member without; Admin protected role; 會友基礎 automatic baseline; closed capabilities from `CAPABILITY_CATALOG`. | Stale revision: `409 ROLE_POLICY_CONFLICT` RFC 9457 Problem Details with the authoritative revision in `data.authoritativeRevision`; no grant/revision mutation; one CONFLICT audit row. Client conflict recovery: after the `409`, the panel triggers `GET /api/v1/identity/role-definitions/:id` to refetch the authoritative grant set and `revision`, renders the refetched authoritative state alongside the user's preserved dirty draft and selection, and shows an explicit `discard and restart` action (plus `keep draft` to remain on the existing draft until the user chooses); the panel does not silently overwrite the draft, does not auto-retry, and does not drop the user's selection. Changed-payload reuse: `409 ROLE_IDEMPOTENCY_REUSE` Problem Details; no mutation; one REJECTED audit row with reason `ROLE_IDEMPOTENCY_REUSE`. Member: `403 ROLE_FORBIDDEN`; no mutation; one DENIED audit row. Admin target: `403 ROLE_ADMIN_PROTECTED`; no mutation; one DENIED audit row. Baseline target: `403 ROLE_BASELINE_PROTECTED`; no mutation; one DENIED audit row. Closed-capability attempt: `422 ROLE_NOT_FOUND` (the closed catalog rejects unknown/closed capability keys as `ROLE_NOT_FOUND`; it is not a separate `ROLE_CAPABILITY_CLOSED` code); no mutation; one REJECTED audit row. All failure responses use `{ requestId }` + matching `X-Request-Id`. | Server state; targeted server-state attempts; client conflict-recovery state. | Worker/D1 seam `web/lib/identity/permission-editor.test.ts` + `web/lib/identity/role-hierarchy.test.ts` (typed error vocabulary) + handler seam `web/lib/identity/permission-editor-handlers.test.ts` (Problem Details mapping); component seam `web/app/management/permission-editor-panel.test.tsx` (refetch on `409 ROLE_POLICY_CONFLICT`, preserved draft/selection, explicit `discard and restart` affordance, no silent overwrite). | #485 Worker/D1 lane + #485 client lane | Human reviewer — manual gate pending where applicable; automation PENDING |

**Per-row #485 transport invariant:** Every Worker mutation row above (C-485-01 through C-485-06) asserts a request ID on success or Problem Details failure; successful responses use `{ requestId, data }`; `X-Request-Id` matches the body request ID; and every mutation that reaches the audit boundary records the same request ID in `role_audit_events.correlation_id`. Replays return the existing terminal result without a second audit event. The `PATCH /api/v1/identity/role-definitions/:id/grants` request body is exactly `{ base_revision: number, changes: { capability: string, value: boolean }[] }`; the actor identity is taken only from the cookie/session via `requireActor` and is never accepted from the request body. The `Idempotency-Key` header is bound to the cookie-session actor; the canonical payload (actor + role id + base revision + change set) is hashed server-side for replay detection. The `GET` response envelope and the `PATCH` success/error envelopes both use `{ requestId, data }` (or `{ requestId }` + Problem Details) and always set `X-Request-Id` to the same value. An unknown role id returns `404 ROLE_NOT_FOUND`; an empty target returns `422 ROLE_INVALID_TARGET`; a parent/category relationship that violates the tree returns `422 ROLE_INVALID_PARENT` — all canonical Spec 091 §9.3 codes, no invented names.

### Ticket #486 — S5-C02 Account Access and identity lifecycle

**Backend authority:** Spec 091 §§ 4.2, 5.1, 5.2, 6, 7.4, 9.2, 9.3, 13; ADR-0042 (role-tree semantics, locked interaction rules, Admin all-on, automatic 會友基礎)
**Stack position:** Stacked on #485 READY; serial because #485 and #486 share identity mutation/types/Worker files
**Exact HTTP surface:** `GET /api/v1/identity/accounts`, `GET /api/v1/identity/accounts/:userId/assignments`, `POST /api/v1/identity/accounts/:userId/assignments`, `POST /api/v1/identity/role-definitions/:id/lifecycle` (action `archive`/`restore`)

| ID | Criterion | Exact input / action | Persona / fixture | Observable DOM / HTTP / D1 / audit result | Viewport / state | Test seam | Evidence owner | Manual owner / status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-486-01 | Eligible-account search returns only Active non-Admin candidates; Account Access and identity detail consume the same assignment/effective-access projection, with no self target or private credential data. | `GET /api/v1/identity/accounts?q=<name>` with seed fixtures including a Suspended account, an Inactive account, an Admin account, the actor's own account, and a credentialed Member; open Account Access for each. | Admin `E2E_DISPOSABLE_ADMIN` and Staff with `role.assign`/`role.revoke` on disposable D1 with `E2E_DISPOSABLE_STAFF`, `E2E_DISPOSABLE_DM`, `E2E_DISPOSABLE_PL`, `E2E_DISPOSABLE_MEMBER`, plus seeded Suspended/Inactive fixtures. | Search returns only Active non-Admin candidates; the actor's own userId is excluded; Suspended/Inactive/Admin are filtered; each row carries `userId`, `name`, `username`, and `identities[]` with `roleDefinitionId`, Cantonese `label`, and `scopeLabel`; no credential, token, phone, attendance, or pastoral data is exposed. `AccountAccessView` and identity detail consume the same `loadAccountAccess` projection. | W7 `320, 390, 600, 799, 800, 1024, 1440` CSS px; search results, Account Access view, identity detail view. | Worker/D1 seam `web/lib/identity/account-access.test.ts` (eligible-account filtering) + `web/lib/identity/account-access-handlers.test.ts` (HTTP envelope) + component seam `web/app/management/account-access-panel.test.tsx` (no self target, no credential leakage, shared projection). | #486 Worker/D1 lane + #486 client lane | Human reviewer — manual gate pending where applicable; automation PENDING |
| C-486-02 | One account can receive several lower identities in one atomic `applyRoleMutation` batch; all additions commit or none; duplicate active assignments are no-ops without duplicate rows/events. | `POST /api/v1/identity/accounts/:userId/assignments` with `{ base_revision, role_definition_ids: [<id1>, <id2>, <id3>] }` where one of the IDs is already active for that account. | Staff with `role.assign` and the Staff fixture `E2E_DISPOSABLE_STAFF` as the target on disposable D1. | HTTP `200` returns `AccountAccessView` with `idempotent: false`, `duplicateRoleDefinitionIds: [<alreadyActiveId>]`; D1 shows one new active row per added identity and no duplicate row for the already-active identity; the already-active identity is treated as an idempotent no-op under the canonical Spec 091 §9.3 `ROLE_ASSIGNMENT_DUPLICATE` code (the projection reports it in `duplicateRoleDefinitionIds` and the Worker does not write a second assignment row, a second `assignment_id`, or a second audit event for it); one atomic SUCCESS audit row + one terminal idempotency result for the whole batch; the new `assignment_id` is fresh for every re-add; no partial state on any failure; `X-Request-Id` matches `body.requestId`. | Server state; atomic-batch state; duplicate no-op state. | Worker/D1 seam `web/lib/identity/account-access.test.ts` (multi-identity atomic success, `ROLE_ASSIGNMENT_DUPLICATE` no-op, fresh assignment_id, no duplicate row/event) + handler seam `web/lib/identity/account-access-handlers.test.ts`. | #486 Worker/D1 lane | Human reviewer — manual gate pending where applicable; automation PENDING |
| C-486-03 | Pending/Suspended/Inactive/Admin/self/out-of-scope/above-highest/unknown targets are rejected server-side; one invalid identity rejects the whole batch; no assignment or revision partially changes. | Send one batch with one valid lower identity and one invalid identity (Pending/Suspended/Inactive/Admin target, out-of-scope Department, above-highest position, or unknown `role_definition_id`); also send a self-target (`account_user_id === actor_user_id`). | Staff with `role.assign` and lower-position Staff fixture; Admin `E2E_DISPOSABLE_ADMIN`; suspended/inactive fixtures; above-highest fixed Role Definition. | All invalid-batch attempts return the named 403/422 Problem Details (`ROLE_TARGET_INELIGIBLE` for Pending/Suspended/Inactive; `ROLE_ADMIN_PROTECTED` for Admin target; `ROLE_HIGHEST_PROTECTED` when the self-target is the actor's highest/protected identity and `ROLE_FORBIDDEN` for any other self-target — no separate self code is invented; `ROLE_SCOPE_MISMATCH` for out-of-scope Department; `ROLE_HIGHEST_PROTECTED` for above-highest position; `ROLE_NOT_FOUND` for an unknown `role_definition_id`; `ROLE_ARCHIVED` for an assignment to an archived identity); no assignment or revision row is written; one REJECTED audit row. | Server state; one-invalid-rejects-all state. | Worker/D1 seam `web/lib/identity/account-access.test.ts` (target filtering, batch rollback) + `web/lib/identity/role-hierarchy.test.ts` (typed error vocabulary) + handler seam `web/lib/identity/account-access-handlers.test.ts`. | #486 Worker/D1 lane | Human reviewer — manual gate pending where applicable; automation PENDING |
| C-486-04 | Revoke writes immutable assignment history rather than deleting; re-adding after revoke inserts a new assignment event, preserves the old revoked row, and records normalized audit/replay behavior. | Revoke an active assignment via the same assignments endpoint with `role_definition_ids: []` (or the dedicated revoke path); then re-add the same identity; then replay the same revoke idempotency key. | Staff with `role.revoke` and the Staff fixture `E2E_DISPOSABLE_STAFF` as the target on disposable D1. | Revoke inserts one immutable `role_assignments_history` row (or normalized equivalent) with `revoked_at`, `revoked_by`, `revoked_reason`; the original assignment row is preserved (or tombed with `is_active = 0`); re-add inserts a new `assignment_id`; the revoked history row remains; one SUCCESS audit row per state change; replay returns the original revoke result with no second audit. | Server state; revoke state; re-add state; replay state. | Worker/D1 seam `web/lib/identity/account-access.test.ts` (immutable revoke history, re-add new event) + `web/lib/identity/mutations.test.ts` (assignment audit + idempotency). | #486 Worker/D1 lane | Human reviewer — manual gate pending where applicable; automation PENDING |
| C-486-05 | Revoke/archive review groups lost and retained Effective Permission by Global/Department/Program scope and identifies grant provenance without leaking credentials or unrelated accounts. | Render Account Access for a target that holds a Global identity, a Department identity (成區), and a Program identity (青少年查經); revoke one identity at a time and observe the impact; archive one of the holder Role Definitions (authorized by `role.delete`). | Staff with `role.revoke`/`role.delete` and the Staff fixture `E2E_DISPOSABLE_STAFF`; Department/Program fixtures; archive candidate from #486. | `AccountAccessView.effectiveAccess` is grouped by `Global`, `Department`, `Program`; each effective grant lists every contributing identity label and `sources` (which Role Definitions grant it); automatic baseline (`program.enroll`) is always present; archive impact clearly groups lost and retained grants by scope, and the archived identity is labelled with `ROLE_ARCHIVED` in the impact view; no credential, token, phone, attendance, or pastoral data and no other account's assignments are shown. | W7 `320, 390, 600, 799, 800, 1024, 1440` CSS px; multi-scope view, revoke impact, archive impact. | Component seam `web/app/management/account-access-panel.test.tsx` (scope groups, provenance, archive impact) + Worker/D1 seam `web/lib/identity/account-access.test.ts` (effective access projection). | #486 client lane + #486 Worker/D1 lane | Human reviewer — manual gate pending where applicable; automation PENDING |
| C-486-06 | Archive atomically sets `is_archived`, revokes all live assignments, blocks new assignments, preserves grants/history, and records the authoritative lifecycle outcome; restore reactivates the definition and grants but no assignment. | `POST /api/v1/identity/role-definitions/:id/lifecycle` with `{ action: "archive", base_revision, reason }`; then try to assign it (expect rejection); then `{ action: "restore", base_revision, reason }`; then list assignments. | Staff with `role.delete` (the canonical archive/restore authority per Spec 091 §7.1) and the Staff fixture `E2E_DISPOSABLE_STAFF` as the target on disposable D1. | Archive: HTTP `200` returns the updated Role Definition with `is_archived = 1`; every active assignment for that definition is revoked in the same D1 transaction; new assignment attempts return `403 ROLE_ARCHIVED` (the canonical Spec 091 §9.3 code, not a noncanonical `ROLE_DEFINITION_ARCHIVED`); grants and revoked assignment history are preserved. Restore: HTTP `200` returns the restored definition with `is_archived = 0`; no assignment is recreated (assignments table count is unchanged from post-archive); grants are preserved. The restore is implemented as the lifecycle `restore` action under `role.delete`; it never recreates assignments. Each lifecycle call records one SUCCESS audit row and one terminal idempotency row. | Server state; archive state; post-archive assignment attempt; restore state. | Worker/D1 seam `web/lib/identity/mutations.test.ts` (archive + restore via `applyRoleMutation` under `role.delete`) + `web/lib/identity/account-access.test.ts` (lifecycle HTTP, archive-blocked new assignments return `ROLE_ARCHIVED`) + handler seam `web/lib/identity/account-access-handlers.test.ts`. | #486 Worker/D1 lane | Human reviewer — manual gate pending where applicable; automation PENDING |
| C-486-07 | Identity-first and account-first entry links preserve focus, feedback, Back/history, safe URL state, 44px targets, dock clearance, and W7 geometry. | Navigate from `RoleHierarchyPanel` (identity-first) and `AccountDirectoryPanel` (account-first) into Account Access; use Back; reload the page; toggle dock. | Admin/Staff with `role.assign` and disposable fixtures including the Staff fixture. | Both entry links open `?module=accounts&account=<id>&view=access`; the source's focus is restored on Back; URL state is safe (unknown `account` or `view=access` falls back to the directory without an unintended selection); 44px app-facing targets, dock clearance, no horizontal overflow at W7 `320, 390, 600, 799, 800, 1024, 1440`; no 800px shell transition regression. | W7 `320, 390, 600, 799, 800, 1024, 1440` CSS px; identity-first entry, account-first entry, Back, reload. | Component seam `web/app/management/account-access-panel.test.tsx` (entry-link focus, Back, URL fallback) + `web/app/management/page.tsx` integration seam + geometry seam pinned Chromium Playwright (extend `tests/e2e/role-hierarchy-geometry.config.ts` if a new file is needed). | #486 client lane + #486 geometry lane | Human reviewer — manual gate pending where applicable; automation PENDING |

**Per-row #486 transport invariant:** Every Worker mutation row above (C-486-01 through C-486-06) asserts a request ID on success or Problem Details failure; successful responses use `{ requestId, data }`; `X-Request-Id` matches the body request ID; and every mutation that reaches the audit boundary records the same request ID in `role_audit_events.correlation_id`. Replays return the existing terminal result without a second audit event. The `POST /api/v1/identity/accounts/:userId/assignments` request body is exactly `{ base_revision: number, role_definition_ids: string[] }`; the `POST /api/v1/identity/role-definitions/:id/lifecycle` request body is exactly `{ action: "archive" | "restore", base_revision: number, reason?: string }`; the `account_user_id` and `role_definition_id` always come from the URL path; the actor identity is taken only from the cookie/session via `requireActor` and is never accepted from the request body. Canonical Spec 091 §9.3 codes are the only error vocabulary: `ROLE_ASSIGNMENT_DUPLICATE` (already-active identity, idempotent no-op), `ROLE_TARGET_INELIGIBLE` (Pending/Suspended/Inactive), `ROLE_ADMIN_PROTECTED` (Admin target), `ROLE_HIGHEST_PROTECTED` (self-targeting highest or above-highest), `ROLE_SCOPE_MISMATCH` (out-of-scope Department/Program), `ROLE_NOT_FOUND` (unknown role/capability), `ROLE_ARCHIVED` (assignment to archived identity), `ROLE_INVALID_TARGET` (empty target), `ROLE_INVALID_PARENT` (parent/category violates the tree), and `ROLE_FORBIDDEN` for the residual self-target case; no invented codes.

### Ticket #487 — S5-C03 normalized bootstrap and domain-authority cutover

**Backend authority:** Spec 091 §§ 4.2, 5.1, 5.2, 6, 7.4, 9.2, 9.3, 13; ADR-0042 (role-tree semantics, locked interaction rules, Admin all-on, automatic 會友基礎)
**Stack position:** Stacked on #485 and #486 both READY; the only task allowed to remove the old authority paths
**Exact HTTP surface:** existing `GET /api/v1/auth/me` bootstrap, existing Programs/attendance/management read endpoints, removed `/api/v1/programs/account-permissions`, removed Manager/Leader route families

| ID | Criterion | Exact input / action | Persona / fixture | Observable DOM / HTTP / D1 / audit result | Viewport / state | Test seam | Evidence owner | Manual owner / status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-487-01 | `/api/v1/auth/me` bootstrap sections/navigation and privacy-safe identity summary derive from normalized capabilities/assignments; Member baseline alone is safe, scoped management identities receive only their projected sections, Admin is all-on, and no browser branch uses `accounts.role`. | Call `/api/v1/auth/me` as Member, Staff fixture, DM fixture, PL fixture, and Admin; inspect sections/navigation and the identity summary. | Member `E2E_DISPOSABLE_MEMBER`, Staff `E2E_DISPOSABLE_STAFF`, DM `E2E_DISPOSABLE_DM`, PL `E2E_DISPOSABLE_PL`, Admin `E2E_DISPOSABLE_ADMIN` on disposable D1. | Member: `systemRole = null`; `identities = []`; sections = Home/Programs/Scanner/Notices/Profile; automatic `program.enroll` is true; safe identity summary. Scoped management fixtures: `systemRole` reflects Admin/Staff as needed; `identities` carry Cantonese label + scopeKind + scopeLabel; only the projected sections appear; Management in the stable slot when any normalized management capability is true; Events when the normalized event-management capability is true; the response never reads `accounts.role`. Admin: every closed capability is `true`; all sections are present. | W7 `320, 390, 600, 799, 800, 1024, 1440` CSS px; bootstrap response, navigation render. | Worker/D1 seam `web/lib/identity/role-hierarchy.test.ts` (`loadBootstrapIdentity` projection) + `web/lib/auth/handlers.test.ts` (`handleMe`) + component seam management-hub + home navigation; obsolete-caller audit `accounts.role` is zero. | #487 Worker/D1 lane + #487 client lane + #487 legacy-audit lane | Human reviewer — manual gate pending where applicable; automation PENDING |
| C-487-02 | Programs management, directory, workspace, enrollment decision, and module actions use one normalized capability/scope resolver; Staff/DM/PL/custom scoped identities work only in exact scope, while cross-scope/equal-higher/Member cases deny. | Hit Programs management, directory, workspace, and enrollment decision endpoints as Staff fixture (in-scope), DM (matching Department), PL (matching Program), and Member; also try cross-scope and equal-higher calls. | Staff `E2E_DISPOSABLE_STAFF`, DM `E2E_DISPOSABLE_DM`, PL `E2E_DISPOSABLE_PL`, Member `E2E_DISPOSABLE_MEMBER`, and a custom scoped fixture on disposable D1. | All Programs decisions route through `resolveActorCapabilities`/`resolveProgramAccess`; in-scope and exact-scope calls return `200`; cross-scope, equal-higher, and Member calls return the named 403 (`ROLE_FORBIDDEN`, `ROLE_SCOPE_MISMATCH`, `ROLE_HIGHEST_PROTECTED`); no `role_capabilities`/`accounts.role`/`department_managers`/`program_leaders`/`permission_policy_*` read; enrollment decision preserves the ManagerOnly domain behavior (it is not an authorization identity). | W7 `320, 390, 600, 799, 800, 1024, 1440` CSS px; in-scope, cross-scope, equal-higher, Member. | Worker/D1 seam `web/lib/programs/program-resolver.test.ts` (program-scoped capability) + `web/lib/programs/capability-authorizer.test.ts` (single normalized resolver) + `web/lib/programs/department-workspace.test.ts` (every ManagerOnly enrollment behavior preserved) + obsolete-caller audit. | #487 Worker/D1 lane + #487 legacy-audit lane | Human reviewer — manual gate pending where applicable; automation PENDING |
| C-487-03 | Attendance operator chooser, scanner events, and event mutations use normalized Program/Department scope; matching PL/DM/Admin cases allow, Member/out-of-scope/auth-expired cases deny safely. | Use the attendance operator chooser, submit a scanner event, and mutate an event as PL (matching Program), DM (matching Department), Admin, Member, an out-of-scope scoped fixture, and an auth-expired fixture. | PL `E2E_DISPOSABLE_PL`, DM `E2E_DISPOSABLE_DM`, Admin `E2E_DISPOSABLE_ADMIN`, Member `E2E_DISPOSABLE_MEMBER`, and an auth-expired fixture on disposable D1. | Matching PL/DM/Admin return `200`; Member/out-of-scope return `403 ROLE_SCOPE_MISMATCH`/`ROLE_FORBIDDEN`; auth-expired returns `401 AUTH_REQUIRED`; no `permittedOperator`/legacy capability map read; no `permission_policy_*` read; event mutations use the normalized capability resolver. | W7 `320, 390, 600, 799, 800, 1024, 1440` CSS px; matching, out-of-scope, auth-expired. | Worker/D1 seam `web/lib/attendance.test.ts` + `web/lib/programs/program-resolver.test.ts` + obsolete-caller audit (no legacy attendance authority). | #487 Worker/D1 lane + #487 legacy-audit lane | Human reviewer — manual gate pending where applicable; automation PENDING |
| C-487-04 | Auth approval, Home CMS, Management Hub, Account/Member directories, and all `DepartmentWorkspace` gates use normalized capability decisions; role-string and legacy Manager/Leader joins cannot authorize. | Submit registration approval, publish a Home CMS item, open Management Hub as Member, open Account/Member directories, and exercise every `DepartmentWorkspace` gate as Member, Staff fixture, and Admin. | Member, Staff fixture, Admin on disposable D1. | Registration approval, Home CMS publish, and Management Hub use the normalized capability resolver; Member gets the named 403; Account/Member directories and every `DepartmentWorkspace` gate use normalized identity projections (never `accounts.role` or legacy Manager/Leader joins); no executable `hasActiveManagementGrant` / `sectionsForRole` / `stableNavigationSections` / `RolePolicyStore` / `AuthorizationContext.actorRole` reference remains. | W7 `320, 390, 600, 799, 800, 1024, 1440` CSS px; auth approval, Home CMS, management hub, directories, DepartmentWorkspace. | Worker/D1 seam `web/lib/auth/handlers.test.ts` + `web/lib/home-cms-handlers.test.ts` + `web/lib/programs/department-workspace.test.ts` (every gate) + component seam management-hub + home + obsolete-caller audit. | #487 Worker/D1 lane + #487 legacy-audit lane | Human reviewer — manual gate pending where applicable; automation PENDING |
| C-487-05 | Fresh disposable migrations/seeds contain normalized tables only; preflight rejects any legacy table and never drops it; baseline/Admin/Staff protected invariants and audit/idempotency/revision contracts remain proven. | Run `pnpm db:seed:disposable` against a fresh local D1; run `preflightDisposableSchema`; then corrupt the DB by adding a legacy table; re-run preflight. | Disposable D1 created from clean `applyMigrations()` + normalized seed chain. | Fresh DB contains only the normalized identity tables (no `role_capabilities`, `department_managers`, `program_leaders`, `permission_policy_state`, `permission_policy_mutations`); baseline is automatic for every Active Account; Admin is exclusive and all-on; Staff fixture has Staff only; DM/PL fixtures have only their scoped identity; Member has no assignable identity; preflight on a clean DB passes; preflight on a DB with any of the five legacy tables returns the explicit manual reset instruction for all five without issuing `DROP`; audit/idempotency/revision contracts continue to pass. | Server state; preflight clean state; preflight legacy-table state. | Migration/seed seam `web/lib/identity/seeds.test.ts` + `web/lib/identity/preflight.test.ts` + `web/lib/identity/d1-schema.test.ts` (normalized only) + disposable seed E2E; preflight unit test for legacy-table detection/manual reset. | #487 Worker/D1 lane + #487 legacy-audit lane | Human reviewer — manual gate pending where applicable; automation PENDING |
| C-487-06 | Exact obsolete-caller audit returns no executable production reference to `role_capabilities`, `department_managers`, `program_leaders`, `permission_policy_state`, or `permission_policy_mutations` outside the explicit preflight/manual-reset checks; old route handlers, clients, UI, store methods, and tests are removed or replaced. | Search the clean Phase C tree for each legacy token; classify every hit; verify old `/api/v1/programs/account-permissions` returns `404 NOT_FOUND`; verify old Manager/Leader routes are absent. | Clean Phase C branch head. | The token search returns only the explicit legacy-name list and manual reset behavior in `web/lib/identity/preflight.ts` and the tests that prove stale-schema detection / route absence; executable production references in `web/lib/**`, `web/app/**`, `web/worker.ts`, and migration DDL/seed writers are zero. The audit also confirms `RolePolicyStore`, old handler/client exports, `hasActiveManagementGrant`, `ctx.actorRole`, `sectionsForRole`, `stableNavigationSections`, `ROLE_CAPABILITY_DEFAULTS`, `PermissionPolicy*`, `DepartmentManager*`, `ProgramLeader*` are removed from authority code. `GET/POST/PATCH /api/v1/programs/account-permissions` returns `404 NOT_FOUND`; Manager/Leader route families are absent. | Server state; route absence; schema absence. | Legacy-audit seam `docs/qa/2026-08-29-s4-phase-c-foundation.md` (exact token search + classification); route-absence test against local Worker/D1. | #487 legacy-audit lane | Human reviewer — manual gate pending where applicable; automation PENDING |
| C-487-07 | Full local authenticated Programs/identity/attendance journeys and W7/material geometry remain green after the cutover; no screenshots or image comparisons are used. | Run pinned `tests/e2e/programs-d1.config.ts` and `tests/e2e/live-ui.config.ts` against local Worker/D1; run the W7 geometry suite for Permission Editor, Account Access, bootstrap/management, and existing role hierarchy. | Disposable D1 + local Wrangler. | Programs D1 suite passes (or matches the documented Phase B baseline with exact pass counts recorded); live UI suite passes; W7 geometry for Permission Editor, Account Access, bootstrap/management, and role hierarchy passes at `320, 390, 600, 799, 800, 1024, 1440` CSS px; numeric CSS-pixel evidence only, no screenshots. | W7 `320, 390, 600, 799, 800, 1024, 1440` CSS px; full local journey. | E2E seams `tests/e2e/programs-d1.config.ts` + `tests/e2e/live-ui.config.ts`; geometry seams (extend `tests/e2e/role-hierarchy-geometry.config.ts` if a new file is needed). | #487 E2E lane + #487 geometry lane | Human reviewer — manual gate pending where applicable; automation PENDING |

**Per-row #487 transport invariant:** Every Worker mutation row above (C-487-01 through C-487-04) asserts a request ID on success or Problem Details failure; successful responses use `{ requestId, data }`; `X-Request-Id` matches the body request ID; and every mutation that reaches the audit boundary records the same request ID in `role_audit_events.correlation_id`. Replays return the existing terminal result without a second audit event. The cutover must not introduce a compatibility endpoint, dual identity model, or legacy policy writer.

### Manual-only rows (no automation claim)

The rows below are tracked manually. They are not auto-claimed. Automated evidence must not certify them.

| ID | Criterion | Manual owner | Manual status |
| --- | --- | --- | --- |
| C-485-M1 | Keyboard-only review of Permission Editor at 320 and 1440 (focus order, visible focus, 44px targets, dock clearance, save dialog). | Human reviewer | MANUAL |
| C-485-M2 | Screen-reader review of Switch toggles, dirty/saving/success/error/conflict announcements, and high-risk review acknowledgement. | Human reviewer | MANUAL |
| C-486-M1 | Keyboard-only review of Account Access entry from both identity-first and account-first links at 320 and 1440. | Human reviewer | MANUAL |
| C-486-M2 | Screen-reader review of Effective Permission scope groups, grant provenance, archive impact, and revoke/re-add announcements. | Human reviewer | MANUAL |
| C-487-M1 | Reduced-motion, forced-colors, and 200%/text-spacing verification for Permission Editor, Account Access, and bootstrap/management surfaces. | Human reviewer | MANUAL |
| C-487-M2 | Real-device dock/safe-area verification on iOS and Android at 320 and 390. | Human reviewer | MANUAL |
| C-487-M3 | Remote-CI verification (local evidence and Worker death classification only; not auto-claiming CI parity). | Human reviewer | MANUAL |
| C-487-M4 | Production-promotion dry-run (no production write, no Apps Script/Sheets/Cloudflare production access; preflight is local D1 only). | Human reviewer | MANUAL |

### Ticket acceptance criteria mapping

| Ticket criterion | Trace rows |
| --- | --- |
| #485 Permission Editor: per-capability Radix Switch, capped Sheet review, high-risk dedicated review, atomic grant/revoke, full revision/idempotency/audit/denial/conflict. | C-485-01, C-485-02, C-485-03, C-485-04, C-485-05, C-485-06, C-485-M1, C-485-M2 |
| #486 Account Access and identity lifecycle: eligible-account search, atomic multi-identity grant, revoke history, re-add new event, archive/restore, Effective Permission by scope with provenance. | C-486-01, C-486-02, C-486-03, C-486-04, C-486-05, C-486-06, C-486-07, C-486-M1, C-486-M2 |
| #487 bootstrap/Programs/attendance/management normalized cutover: `/auth/me` from capabilities, single resolver, fresh schema with no legacy tables, preflight manual reset, old route 404, legacy token removal, full local journey + W7 geometry. | C-487-01, C-487-02, C-487-03, C-487-04, C-487-05, C-487-06, C-487-07, C-487-M1, C-487-M2, C-487-M3, C-487-M4 |

---

## Evidence index (to be appended after verification)

This trace is paired with `docs/qa/2026-08-29-s4-phase-c-foundation.md`, which is created by the Phase C verification evidence worker after the implementation/test/review cycle. The evidence file MUST record, at minimum:

- **Worker/runtime versions:** exact Node `v22.x` and pnpm `11.7.0`, pinned Wrangler `4.127.1`, Miniflare `5.20260828.0-alpha`, Playwright Chromium pin.
- **Branch / commit SHAs:** the exact Phase C branch head, every delegated implementation/test/review/evidence commit SHA, the integrated head before publication, and the final published head. Local-only base `c75c99e84d699d2d1eac44f07d4e013ead4c12a5`.
- **Focused commands and outputs:** ticket-focused Worker tests (`permission-editor-handlers`, `account-access-handlers`, `program-resolver`, bootstrap/identity authority, attendance, legacy-retire contracts); focused component tests (Permission Editor, Account Access, role hierarchy, directory, relevant shell surfaces); the W7 numeric geometry files for Permission Editor, Account Access, bootstrap/management, and existing role hierarchy; aggregate gates `pnpm typecheck`, `pnpm --dir web typecheck`, `pnpm verify:identity`, `pnpm --dir web test`, `pnpm --dir web test:components`, `pnpm test:shell-responsive`, `pnpm test:shell-geometry`, `pnpm test:role-hierarchy-geometry`, `pnpm --dir web build`, `git diff --check`, `pnpm check`; Programs D1 suite and live UI suite against local Worker/D1.
- **Concrete new-behavior checks:** Admin grants one capability and replays the same key; stale permission revision is rejected without a stale grant; one account receives two lower identities atomically; revoke/re-add yields one active plus one immutable revoked event; archive revokes live assignments and restore preserves grants but no assignments; DM/PL scope works only on the matching Department/Program; Member baseline cannot enter management; old routes return 404; fresh schema has no legacy authority tables.
- **Review outcomes:** the exact `READY`/`BLOCKED` result of every delegated reviewer against the exact commit or diff. A `BLOCKED` triggers a fresh correction worker; dependent work does not start until `READY`.
- **Obsolete-caller audit:** the exact token search results for `role_capabilities`, `department_managers`, `program_leaders`, `permission_policy_state`, `permission_policy_mutations` plus the secondary tokens `RolePolicyStore`, `hasActiveManagementGrant`, `ctx.actorRole`, `sectionsForRole`, `stableNavigationSections`, `ROLE_CAPABILITY_DEFAULTS`, `PermissionPolicy*`, `DepartmentManager*`, `ProgramLeader*`, with path and reason for every remaining exception (only preflight/manual-reset and stale-schema/route-absence tests are allowed).
- **Manual gates:** keyboard-only Permission Editor at 320/1440, screen-reader Switch/provenance/bootstrap review, reduced-motion/forced-colors/text-spacing, real-device dock/safe-area, remote-CI, production-promotion dry-run.
- **PR state:** actual `feat/s4-c-stackable-identity-integration` PR base/head/state (`OPEN`, non-draft), exact pushed head SHA, `gh api user --jq .login` = `Noahlw`, and the explicit stop before Phase D. Also record the published base `feat/s4-b-shared-modules-role-definitions` at `c75c99e84d699d2d1eac44f07d4e013ead4c12a5`, the actual title `feat(s4-c): stackable identity integration`, the immutable local base SHA, and the confirmation that no merge, deploy, force-push, or production write was made.

## Phase C provenance

- **Base SHA:** `c75c99e84d699d2d1eac44f07d4e013ead4c12a5` (Phase B PR #497 `feat/s4-b-shared-modules-role-definitions` head; the Phase C branch `feat/s4-c-stackable-identity-integration` tracks `origin/feat/s4-b-shared-modules-role-definitions` at this exact commit).
- **Stack origin:** PR #473 (`feat/s4-12-shadcn-migration`, base `85817f563a801e891bfbf758e3174ea0bdea9544`) — Phase A was its first child (`remediate-478`); Phase B was its second child via the accepted Phase A head; Phase C is its third child via the accepted Phase B head.
- **Grouped PR title:** `feat(s4-c): stackable identity integration`.
- **Worktree:** `.worktrees/s4-phase-c` on branch `feat/s4-c-stackable-identity-integration`.
- **Trace path:** `docs/specs/s4-phase-c-acceptance-trace.md`.
- **Evidence path (to be appended):** `docs/qa/2026-08-29-s4-phase-c-foundation.md`.
- **Parent authority (imported unchanged into this branch):** `docs/specs/091-stackable-identity-backend.md`, `docs/specs/092-discord-identity-design-system-adoption.md`, `docs/adr/0042-discord-like-stackable-role-model.md`, `docs/adr/0043-owned-civic-design-system-governance.md`, issue #475, plus issues #485, #486, #487. The four files were imported byte-for-byte from the reviewed Phase A planning worktree's current files at trace preparation; those files include current planning deltas relative to committed `f1b77c0e`, and the copied content is documentation provenance, not new product scope.
- **Planning inputs:** `docs/omp-plans/2026-08-28-s4-phase-c-stackable-identity-integration.md`, `docs/specs/s4-phase-b-acceptance-trace.md`, `docs/qa/2026-08-28-s4-phase-b-foundation.md`, and the issue bodies/comments of #485, #486, #487.
- **Tickets covered:** #485, #486, #487.
- **Tickets explicitly excluded (not Phase C):** #488–#495 (Phases D–F).
- **Convention:** modeled on `docs/specs/s4-phase-b-acceptance-trace.md`; planning-only, no production code, schema, migration, fixture, deployment, or data change authorized.

## Phase C no-Phase-D clause

This trace records the Phase C acceptance contract only. It does not authorize, scope, schedule, or describe Phase D (member/public route wave, #488–#490), Phase E (operations route wave, #491–#493), or Phase F (contract and evidence, #494–#495). Those phases require their own acceptance traces, their own review gates, and their own grouped PRs. Phase C stops after the grouped Phase C PR is opened on the reviewed Phase B head; it is not merged, no production promotion is made, and Phase D source work is not begun.

## #485 focused evidence — 2026-08-29

**Evidence scope:** focused validation of the integrated Permission Editor at the Phase C implementation head. This section is evidence-only; it does not change the pending status of the contract rows above until the missing checks are completed. No production source, schema, migration, seed, fixture, or deployment file was changed.

### Provenance and runtimes

- **Worktree:** `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/s4-c-485-test-evidence`
- **Branch:** `feat/s4-c-485-test-evidence` (the checked integrated head is also `feat/s4-c-stackable-identity-integration`)
- **Phase B base SHA:** `c75c99e84d699d2d1eac44f07d4e013ead4c12a5`
- **Integrated Permission Editor head under test:** `28b6d94cb62f9ffe0c7f045d2868f2151d7e4ca2` (`feat(identity): deliver permission editor`)
- **Evidence commit:** the single evidence-only commit containing this section is reported with its exact resulting SHA in delivery.
- **Node:** `v22.18.0`
- **pnpm:** `11.7.0`
- **Vitest:** `v4.1.10` (web workspace)
- **Wrangler:** `4.127.1`
- **Miniflare:** `5.20260828.0-alpha` (web lockfile)
- **Playwright:** `1.62.1`
- **Pinned Chromium:** Chrome for Testing `151.0.7922.34`, Playwright Chromium revision `v1234`

### C-485 criterion-to-check matrix

| Criterion | Directly exercised check | Result |
| --- | --- | --- |
| C-485-01 | Component list/detail seam covers safe list fallback, continuous catalog grouping, searchable labels, and malformed `role`/`view` URL normalization; handler/domain execution was blocked before assertions. Assignment summary/server actions and unknown/archived/unauthorized URL cases are not asserted. | **BLOCKED — focused coverage does not exercise the complete criterion.** |
| C-485-02 | Component seam asserts one locked row remains visible with a plain-language reason, local switch `role`, `aria-checked`, disabled/`aria-disabled`, and keyboard activation of an editable row. It does not cover every named lock target, visible/non-obscured focus, or saving/busy semantics. | **BLOCKED — named lock/focus/busy cases remain unexercised.** |
| C-485-03 | Component seam asserts dirty state after one toggle, one ordinary Sheet save with returned revision, preservation of a dirty draft after `503`, and conflict recovery/restart UI. It does not directly assert that every switch is locked while saving. | **BLOCKED — saving-lock assertion remains unexercised.** |
| C-485-04 | Component seam asserts one ordinary change opens the local Sheet and one high-risk change opens the dedicated review surface. Exact 1/2/3 versus 4 ordinary threshold, viewport/dock geometry, and all high-risk keys are not exercised. | **BLOCKED — threshold and geometry cases remain unexercised.** |
| C-485-05 | The Worker/domain checks were invoked with the intended Cloudflare pool configuration but failed during pool startup before any product assertion. Component mocks do not prove D1 revision/audit/idempotency atomicity. | **BLOCKED — Cloudflare pool infrastructure failure; 0 product assertions.** |
| C-485-06 | Component conflict UI was exercised, but Worker stale-revision, changed-payload idempotency reuse, Member/unauthorized, Admin/baseline, closed-capability, and denial/rejection-audit paths were not executed. | **BLOCKED — Worker infrastructure failure and named server outcomes unexercised.** |

The role-hierarchy component suite passed its existing 16 tests, but source/test inspection found no direct assertion for the Permission Editor action link; the implementation link is in `web/app/management/role-hierarchy-panel.tsx:1236-1246`.

### UI primitive and source inspection

**PASS — source contract inspection only (not a manual accessibility claim).** `web/app/management/permission-editor-panel.tsx:3-29` imports the locally owned `Sheet`, `AlertDialog`, `Button`, `Input`, and `Switch` primitives, plus `cva` and `cn`. `web/components/ui/switch.tsx:3-29` wraps `radix-ui` `SwitchPrimitive.Root`/`Thumb` and composes classes with `cn`; the panel defines `roleButtonVariants` and `permissionRowVariants` with CVA at `:80-104` and applies them through `cn` at `:497-504` and `:607-612`. No unfamiliar library/API behavior required a Context7 lookup. Human keyboard, AT, reduced-motion, forced-colors, reflow/text-spacing, real-device, and WCAG gates remain manual and unclaimed.

### Focused Worker/domain command

Command:

```text
$ pnpm --dir web exec vitest run --config vitest.config.ts lib/identity/permission-editor.test.ts lib/identity/permission-editor-handlers.test.ts
```

Result: **exit 1; infrastructure blocked before assertions.** Vitest reported both files as Cloudflare-pool startup failures with the exact cause `EvalError: Code generation from strings disallowed for this context` from Vite's `getAsyncFunctionDeclarationPaddingLineCount`/`ESModulesEvaluator`. The consolidated result was:

```text
Test Files  no tests
Tests       no tests
Errors      2 errors
```

No product assertion count is claimed. The failure is classified as harness infrastructure, not product PASS or FAIL.

### Focused component commands

Command:

```text
$ pnpm --dir web exec vitest run --config vitest.components.config.ts lib/permission-editor-panel.test.tsx lib/identity/role-hierarchy-panel.test.tsx
```

Result: **exit 0**

```text
Test Files  2 passed (2)
Tests       23 passed (23)
Duration    1.90s (transform 522ms, setup 261ms, import 1.02s, tests 1.37s, environment 958ms)
```

Per-file focused results:

```text
$ pnpm --dir web exec vitest run --config vitest.components.config.ts lib/permission-editor-panel.test.tsx
Test Files  1 passed (1)
Tests       7 passed (7)
Duration    1.95s (transform 277ms, setup 104ms, import 580ms, tests 686ms, environment 503ms)

$ pnpm --dir web exec vitest run --config vitest.components.config.ts lib/identity/role-hierarchy-panel.test.tsx
Test Files  1 passed (1)
Tests       16 passed (16)
Duration    1.44s (transform 211ms, setup 72ms, import 307ms, tests 660ms, environment 298ms)
```

The seven Permission Editor tests assert observable list fallback/catalog search, malformed URL normalization, locked-row reason plus `role="switch"`/`aria-checked`/keyboard behavior, ordinary Sheet save and authoritative revision, non-conflict draft preservation, high-risk dedicated review and conflict restart, and Back/focus restoration. They do not assert source class strings or implementation names. The role-hierarchy tests are existing H/B tests; none is a direct Permission Editor action-link test.

### Geometry coverage and result

The existing pinned command was run:

```text
$ pnpm test:role-hierarchy-geometry
```

Result: **exit 1 before Playwright tests.** The static web server's `next build` failed at `web/lib/auth/registrations.ts:148:15` with `Type error: Cannot find name 'D1Result'`; Playwright reported `Error: Process from config.webServer was not able to start. Exit code: 1`. No geometry assertion ran. This is a product typecheck/build failure in an unrelated production file and is reported to the correction owner; it is not converted into a geometry PASS.

The config/test inspection and `--list` command:

```text
$ pnpm exec playwright test --config=tests/e2e/role-hierarchy-geometry.config.ts --list
Total: 21 tests in 1 file
```

The 21 tests are the existing three role-hierarchy scenarios multiplied across W7 `320, 390, 600, 799, 800, 1024, 1440` CSS px (`w-320`, `w-390`, `w-600`, `w-799`, `w-800`, `w-1024`, `w-1440`). `tests/e2e/role-hierarchy-geometry.config.ts:12` matches only `role-hierarchy-geometry.test.ts`; no Permission Editor route or detail/review geometry is covered. No geometry test/config extension was added because the static harness cannot currently build/start due the exact `D1Result` production type error. C-485 W7 numeric geometry is therefore **BLOCKED — no Permission Editor coverage and harness webServer cannot start**. No screenshot, image snapshot, or pixel-diff test was used.

### Focused typecheck

```text
$ (cwd=web) pnpm exec tsc --noEmit -p tsconfig.worker.json
exit 0 (no output)
```

No dedicated component-only TypeScript config/command exists; the full web `tsconfig.json` was not run because this assignment requires focused checks rather than a project-wide suite. Component behavior is covered by the passing component Vitest commands above.

### Manual gates and next action

`C-485-M1` and `C-485-M2` remain **MANUAL** and unclaimed. This evidence does not claim keyboard-only, screen-reader, reduced-motion, forced-colors, zoom/text-spacing, real-device, remote-CI, or WCAG completion. The Worker infrastructure failure, missing Permission Editor geometry coverage, and `D1Result` build/typecheck failure remain explicit blockers for the coordinator/correction owner.
