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

## #485 evidence rerun — 2026-08-29

**Evidence scope:** rerun of focused checks after the `D1Result` global type fix (`7762bb23 fix(build): expose D1Result global in worker-globals.d.ts`) and the Next TypeScript test-path exclusions for the Permission Editor (`aef36b81c3c493c38395c16f284381a8a51c91db build(web): exclude #485 permission-editor test paths from Next typecheck`). The rerun is evidence-only; it does not edit production code and does not relabel earlier honest blockers as PASS.

### Provenance and runtimes

- **Worktree:** `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/s4-c-485-evidence-rerun`
- **Branch:** `feat/s4-c-485-evidence-rerun`
- **Integrated Phase C coordinator head (current):** `ca55715981b49c25cebee03d70c1e63b775d6392`
- **Permission Editor implementation head under test:** `aef36b81c3c493c38395c16f284381a8a51c91db` (`build(web): exclude #485 permission-editor test paths from Next typecheck`)
- **Phase B base SHA:** `c75c99e84d699d2d1eac44f07d4e013ead4c12a5`
- **Node:** `v22.18.0`
- **pnpm:** `11.7.0`
- **Vitest:** `4.1.10` (web workspace)
- **Wrangler:** `4.127.1` (web lockfile)
- **Miniflare:** `5.20260828.0-alpha` (web lockfile; an alternate `5.20260730.0-alpha` is also present in the pnpm store but is not the test pool)
- **Playwright:** `1.62.1`
- **Pinned Chromium:** Chrome for Testing `151.0.7922.34`, Playwright Chromium revision `v1234` (already installed at `/Users/noah.wong/Library/Caches/ms-playwright/chromium-1234`)

### C-485 criterion-to-check matrix (rerun)

| Criterion | Directly exercised check | Result |
| --- | --- | --- |
| C-485-01 | `GET /api/v1/identity/role-definitions/:id` envelope shape, request ID, and complete catalog projection are exercised by the Worker seam test only; the rerun still cannot reach that test because the cloudflare-pool infrastructure fails before any product assertion. Component seam covers list/detail URL fallback, continuous catalog search, and safe-URL behaviour. | **BLOCKED — focused Worker coverage still does not exercise the criterion (infra); component seam covers URL fallback only.** |
| C-485-02 | Component seam asserts one locked row remains visible with a plain-language reason, local `Switch` with `role="switch"`, `aria-checked`, disabled/`aria-disabled`, and keyboard activation of an editable row. Other lock targets (Admin, baseline, highest/self, archived, out-of-scope, unavailable) and saving/busy semantics are not asserted. | **BLOCKED — only one named lock case and basic switch semantics exercised; remaining lock cases and busy focus unexercised.** |
| C-485-03 | Component seam asserts one toggle becomes dirty, one ordinary Sheet save returns the authoritative revision, a non-conflict `503` keeps the dirty draft, and a `409 ROLE_POLICY_CONFLICT` restart UI is rendered. Saving-lock and explicit `aria-busy` propagation are not directly asserted. | **BLOCKED — saving-lock semantics remain unexercised; other behaviours PASS by assertion.** |
| C-485-04 | Component seam asserts one ordinary change opens the local `Sheet` and one high-risk change opens the dedicated `AlertDialog`. Exact 1/2/3 versus 4-ordinary threshold, viewport/dock geometry, and every high-risk key are not exercised. | **BLOCKED — 4-ordinary threshold and high-risk full set unexercised; sheet/dedicated split PASS by assertion.** |
| C-485-05 | The Worker patch+replay audit path was not reached because the cloudflare-pool infrastructure fails before any product assertion. Component mocks do not prove D1 revision/audit/idempotency atomicity. | **BLOCKED — Cloudflare pool infrastructure failure; 0 product assertions in Worker seam.** |
| C-485-06 | Component conflict UI was exercised. Worker stale-revision, changed-payload idempotency reuse, Member/unauthorized, Admin/baseline, closed-capability, and denial/rejection-audit paths were not executed because the cloudflare-pool infrastructure fails before any product assertion. | **BLOCKED — Worker infrastructure failure; named server outcomes unexercised.** |

The role-hierarchy component suite passed its existing 16 tests again; source/test inspection still finds no direct assertion for the Permission Editor action link. The implementation link is in `web/app/management/role-hierarchy-panel.tsx:1236-1246` and routes to `/management?module=permissions&role=<id>&view=permissions`, the canonical route expected by the panel.

### UI primitive and source inspection (rerun)

**PASS — source contract inspection only (not a manual accessibility claim).** `web/app/management/permission-editor-panel.tsx:3-29` still imports the locally owned `Sheet`, `AlertDialog`, `Button`, `Input`, and `Switch` primitives plus `cva` and `cn`. `web/components/ui/switch.tsx:3-29` still wraps `radix-ui` `SwitchPrimitive.Root`/`Thumb` and composes classes with `cn`; the panel defines `roleButtonVariants` and `permissionRowVariants` with CVA at `:80-104` and applies them through `cn` at `:497-504` and `:607-612`. No unfamiliar library/API behaviour required a Context7 lookup. Human keyboard, AT, reduced-motion, forced-colors, reflow/text-spacing, real-device, and WCAG gates remain manual and unclaimed.

### Focused Worker/domain command (rerun)

Command:

```text
$ pnpm --dir web exec vitest run --config vitest.config.ts \
    lib/identity/permission-editor.test.ts \
    lib/identity/permission-editor-handlers.test.ts
```

Result: **exit 1; infrastructure blocked before assertions.** Vitest caught 2 unhandled errors during the test run. Both `permission-editor.test.ts` and `permission-editor-handlers.test.ts` fail at cloudflare-pool startup with the same cause as the prior evidence section:

```text
Caused by: EvalError: Code generation from strings disallowed for this context
 ❯ getAsyncFunctionDeclarationPaddingLineCount
    node_modules/.pnpm/vite@8.2.0/.../vite/dist/node/module-runner.js:27:35
 ❯ <instance_members_initializer>
    node_modules/.pnpm/vite@8.2.0/.../vite/dist/node/module-runner.js:1008:16
 ❯ new ESModulesEvaluator
    node_modules/.pnpm/vite@8.2.0/.../vite/dist/node/module-runner.js:1007:26
 ❯ new ModuleRunner
    node_modules/.pnpm/vite@8.2.0/.../vite/dist/node/module-runner.js:1111:35
 ❯ createEnvironmentLoader … loadEnvironment … setupBaseEnvironment

Test Files  no tests
     Tests  no tests
    Errors  2 errors
  Start at  14:20:58
  Duration  5.19s (transform 0ms, setup 0ms, import 0ms, tests 0ms, environment 0ms)
```

The two failure stacks are identical save for the file path. No product assertion is reached. The rerun does not relabel this as PASS or FAIL; it is recorded as harness infrastructure with zero product assertions.

### Focused component commands (rerun)

Command:

```text
$ pnpm --dir web exec vitest run --config vitest.components.config.ts \
    lib/permission-editor-panel.test.tsx \
    lib/identity/role-hierarchy-panel.test.tsx
```

Result: **exit 0**

```text
 Test Files  2 passed (2)
      Tests  23 passed (23)
   Start at  14:21:10
   Duration  4.91s (transform 1.35s, setup 809ms, import 2.40s, tests 3.38s, environment 2.58s)
```

Per-file focused results were not re-collected separately in this rerun because the consolidated run already reported the same two files. The seven Permission Editor tests assert: safe role-list fallback + continuous searchable catalog; malformed `role`/`view` URL normalization; locked-row reason plus `role="switch"` / `aria-checked` / `disabled` / `aria-disabled` and keyboard activation of an editable row; ordinary Sheet save and authoritative revision return; non-conflict `503` dirty-draft preservation; high-risk dedicated review and conflict restart UI; and Back/focus restoration. They do not assert source class strings or implementation names. The 16 role-hierarchy component tests are existing H/B tests; none is a direct Permission Editor action-link test.

### Focused typecheck and build (rerun)

Commands and results:

```text
$ pnpm --dir web exec tsc --noEmit -p tsconfig.worker.json
exit 0 (no output)

$ pnpm --dir web exec tsc --noEmit -p tsconfig.json
exit 0 (no output)

$ pnpm --dir web build
▲ Next.js 16.2.12 (Turbopack)
✓ Compiled successfully in 2.3s
  Running TypeScript ...
  Finished TypeScript in 9.3s ...
  Collecting page data using 9 workers ...
  Generating static pages using 9 workers (18/18) in 399ms
Route (app)
┌ ○ / ├ ○ /_not-found ├ ○ /events ├ ○ /guest-check-in ├ ○ /home ├ ○ /management
├ ○ /messages ├ ○ /notices ├ ○ /permissions ├ ○ /profile ├ ○ /profile/settings
├ ○ /programs ├ ○ /prototype ├ ○ /register ├ ○ /registrations └ ○ /scanner
○  (Static)  prerendered as static content
```

The `D1Result` global type fix and the Next TypeScript test-path exclusions for `#485` are reflected in the rerun: `tsc` against `tsconfig.worker.json` and `tsconfig.json` both pass with zero output, and the web `next build` now compiles successfully. The earlier `D1Result` build blocker at `web/lib/auth/registrations.ts:148:15` no longer triggers. No new TS/build error is reported.

### Geometry coverage and result (rerun)

The pinned role-hierarchy harness was re-run after the build unblock:

```text
$ pnpm test:role-hierarchy-geometry
$ playwright test --config=tests/e2e/role-hierarchy-geometry.config.ts
Running 21 tests using 1 worker
  ✓   1 [w-320]  › identity hierarchy panel has no overflow or undersized controls at the pinned width
  ✓   2 [w-320]  › rename detail keeps the affordance visible and in flow at the pinned width
  ✓   3 [w-320]  › B-479-12: create and reorder affordances keep their critical anchors at the pinned width
  … (continues for each viewport: 320, 390, 600, 799, 800, 1024, 1440; 3 scenarios each)
  ✓  21 [w-1440] › B-479-12: create and reorder affordances keep their critical anchors at the pinned width
  21 passed (17.8s)
```

All 21 existing pinned tests now run; the harness webServer starts because the prior `D1Result` build blocker is gone. The Pinned Chromium remains Chrome for Testing `151.0.7922.34` revision `v1234`; the projects `w-320`, `w-390`, `w-600`, `w-799`, `w-800`, `w-1024`, and `w-1440` are reused unchanged. CSS-pixel evidence only; no screenshots or pixel-diff tests are used.

The existing `tests/e2e/role-hierarchy-geometry.test.ts` only matches `role-hierarchy-geometry.test.ts` (`testMatch: /role-hierarchy-geometry\.test\.ts$/u`) and only exercises `/management?module=roles`. The earlier in-session attempt to extend that file with a numeric W7 Permission Editor list test, and the later attempt to add a separate `permission-editor-geometry.{test,config}.ts` pair, were both reverted before the commit per the assignment's coordinator revert: in this evidence-only commit the rerun did **not** mutate `tests/e2e/role-hierarchy-geometry.test.ts`, did **not** introduce a competing `permission-editor-geometry.config.ts`, and did **not** introduce a new `tests/e2e/permission-editor-geometry.test.ts`. The C-485 W7 numeric Permission Editor geometry is therefore **BLOCKED** in this rerun, with the exact reason recorded: the static-export harness and `role-hierarchy-geometry.test.ts` cover `/management?module=roles` only, and the existing pinned config matches only that file. Adding Permission Editor coverage via a separate `tests/e2e` file or a competing config is out of scope for this evidence-only rerun.

**C-485 W7 numeric geometry status:** **BLOCKED — no Permission Editor coverage in `pnpm test:role-hierarchy-geometry`; existing harness webServer now starts (D1Result fix) but the file/config in this commit does not add Permission Editor tests.** The Permission Editor detail, Sheet, AlertDialog, conflict, and Sticky Action Bar surfaces are also not exercised by numeric geometry and remain a manual gate.

### Manual gates and next action (rerun)

`C-485-M1` and `C-485-M2` remain **MANUAL** and unclaimed. This rerun does not claim keyboard-only, screen-reader, reduced-motion, forced-colors, zoom/text-spacing, real-device, remote-CI, or WCAG completion. The Worker infrastructure failure (cloudflare-pool `EvalError: Code generation from strings disallowed for this context`) remains the only active product blocker for C-485-01/05/06; the `D1Result` build blocker is gone, the W7 numeric geometry for the Permission Editor list view is **BLOCKED — not exercised in this evidence-only commit**, and component coverage for C-485-02/03/04 remains partial (only one named lock case; the saving-lock, threshold, and full-high-risk surfaces are still unexercised).

### Files changed in this evidence-only commit

- `docs/specs/s4-phase-c-acceptance-trace.md` (this section appended; no prior section removed or edited)

No production source, schema, migration, seed, fixture, test, or config file was changed in this commit. The temporary `tests/e2e/permission-editor-geometry.test.ts` and `tests/e2e/permission-editor-geometry.config.ts` that were created and verified during the rerun were removed before the commit; their outcome is summarised above as BLOCKED rather than retained as a second harness.

### Permission Editor W7 numeric geometry coverage

Command and result:

```text
$ pnpm test:role-hierarchy-geometry
exit 0
35 passed (33.0s)
```

The shared pinned static-export harness ran the existing 21 role-hierarchy
scenarios plus 14 Permission Editor scenarios (detail and capped Sheet review)
at every W7 width: `320, 390, 600, 799, 800, 1024, 1440` CSS px. No
screenshots, image snapshots, or pixel diffs were used. The Permission Editor
route was exercised as
`/management?module=permissions&role=r-staff&view=permissions` with the
server-shaped identity reads stubbed in-browser.

Numeric selectors and measurements:

- `Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
  - window.innerWidth <= 1` for horizontal overflow.
- `#shell-content > main`, `[aria-label="連續權限清單"]`, and every
  `[data-capability]` rectangle stayed within `[-1px, viewportWidth + 1px]`
  on both horizontal edges.
- The contextual Back link, every permission row, and the
  `[aria-label="權限儲存操作"]` Action Surface measured at least `44px` high.
  On phone widths, the in-flow Action Surface was scrolled into view and its
  bottom edge stayed above the `.nav-phone` dock; `#shell-content` retained
  `84px` bottom padding.
- The named shell transition was measured at `799px`/`800px`:
  `.nav-phone` computed `position` was `fixed` below the breakpoint and
  `sticky` at/above it, while `#shell-content` bottom padding changed from
  `84px` to `0px`.
- With one ordinary change, `[data-slot="sheet-content"]` and
  `[aria-label="待儲存權限變更"]` stayed horizontally inside the viewport and
  the review item rectangle stayed inside the same bounds after the overlay
  settled.

This adds numeric Permission Editor evidence for C-485-04/C-485-06 while
preserving the prior Worker-pool infrastructure blocker and manual-gate
status recorded above.

## #485 review-correction evidence — 2026-08-29

**Evidence scope:** focused validation of the corrected integrated #485 Permission Editor head. This section is an evidence-only append; it preserves the earlier Worker-pool, incomplete-coverage, and manual-gate findings above. No production source, schema, migration, seed, fixture, deployment, screenshot, snapshot, or pixel-diff file was changed.

### Provenance and runtimes

- **Worktree:** `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/s4-c-485-evidence-final`
- **Branch:** `feat/s4-c-485-evidence-final`
- **Corrected integrated head under test:** `2d8e028423eed2dfd28d0bd6be686e26ae502774` (`fix(identity): close permission editor review blockers`)
- **Phase B base SHA:** `c75c99e84d699d2d1eac44f07d4e013ead4c12a5`
- **Evidence commit:** this trace-only append; the resulting SHA is returned with delivery because a commit cannot contain its own SHA.
- **Runtime/version command:**

```text
$ node --version && pnpm --version && pnpm --dir web exec vitest --version && pnpm --dir web exec wrangler --version && pnpm exec playwright --version && pnpm --dir web exec tsc --version && pnpm --dir web why miniflare --depth 5
v22.18.0
11.7.0
vitest/4.1.10 darwin-arm64 node-v22.18.0
4.127.1
Version 1.62.1
Version 5.9.3
miniflare@5.20260730.0-alpha
├─┬ @cloudflare/vitest-pool-workers@0.20.1
│ └── web@0.1.0 (devDependencies)
└─┬ wrangler@4.118.0
  └── @cloudflare/vitest-pool-workers@0.20.1 [deduped]

miniflare@5.20260828.0-alpha
└─┬ wrangler@4.127.1
  └── web@0.1.0 (devDependencies)

Found 2 versions of miniflare
```

- **Pinned Chromium check:** `$ "$HOME/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" --version` → `Google Chrome for Testing 151.0.7922.34` (Playwright Chromium revision `v1234`).

### Required library/API lookup

The required Context7 CLI lookup was run before validation. The authoritative selections were `/radix-ui/primitives` for the local Radix Switch contract and `/microsoft/playwright` for numeric geometry APIs:

```text
$ npx --yes ctx7@latest library radix-ui "Switch Root checked onCheckedChange disabled keyboard semantics"
Selected authoritative result: /radix-ui/primitives
$ npx --yes ctx7@latest docs /radix-ui/primitives "Switch Root checked onCheckedChange disabled role keyboard behavior"
Switch.Root renders a button with role="switch", aria-checked, disabled/data-disabled state, and onCheckedChange.

$ npx --yes ctx7@latest library playwright "test viewport CSS pixels locator boundingBox webServer"
Selected authoritative result: /microsoft/playwright
$ npx --yes ctx7@latest docs /microsoft/playwright "Locator boundingBox returns element bounding box CSS pixels viewport"
Locator.boundingBox returns the matching element rectangle relative to the main-frame viewport in pixels.
```

### Corrected review-blocker source inspection

**Source inspection only; not a runtime or manual accessibility claim.** The corrected integrated head was inspected at the following seams:

- `web/lib/identity/capability-catalog.ts:9-226` carries the closed per-capability metadata, including Cantonese label/description/group, `risk`, `systemOnly`, and `scopeRequired`.
- `web/lib/identity/role-hierarchy.ts:466-522` resolves active normalized grants, automatic `program.enroll`, Admin all-on, and Global versus exact Department/Program scope. `web/lib/identity/permission-editor.ts:413-499` applies the target's exact scope before the separate `role.permissions.read` and `role.permissions.write` caller projection.
- `web/lib/identity/permission-editor.ts:277-313` keeps Admin, `會友基礎`, archived, highest/self, actor-scope, read/write, system-only, and per-capability actor-grant lock reasons distinct. `web/lib/identity/role-hierarchy.ts:638-739` projects the server `permissions` action only when the target-specific read gate, lower-position, protected, archived, and exact-scope guards pass.
- `web/lib/identity/permission-editor.ts:528-812` and `web/lib/identity/mutations.ts:269-451,459-930` preserve `result_json` for original terminal replay, reserve no-op and stale-conflict terminal idempotency records, and gate one audit row on the same terminal transition. The correction therefore does not re-read current state as the original successful response.
- `web/app/management/role-hierarchy-panel.tsx:1238-1253` renders the server-projected permissions affordance with the local `Button` and canonical `module=permissions&role=<opaque id>&view=permissions` URL.
- `web/app/management/permission-editor-panel.tsx:282-331,448-458` uses the shared async resource and `resource.retry()`; `:278,339-396,416-430,491-530` retains one idempotency key through retryable save failure and clears it only at a new role/authoritative success/restart boundary. `:504-554` leaves success/error/conflict feedback to the visible status/alert owner instead of issuing a duplicate global announcement.
- `web/components/ui/button.tsx:7-64` and `web/components/ui/switch.tsx:16-30` are the local shadcn/Radix primitives composed through `cva`/`cn`; the panel uses CVA variants at `web/app/management/permission-editor-panel.tsx:81-105` and `cn` at `:580-587,727-732`. The panel's `Switch` target class is `min-h-11 min-w-11` at `:765-780`.
- `tests/e2e/role-hierarchy-geometry.config.ts:10-36` is the single shared geometry config and its `testMatch` includes `role-hierarchy-geometry.test.ts` plus `permission-editor-geometry.test.ts`. No competing `permission-editor-geometry.config.ts` exists. The earlier standalone geometry commit `d269525d` is superseded by the corrected integrated head `2d8e028423eed2dfd28d0bd6be686e26ae502774`, which carries the corrected selectors and target measurements.

### Focused Worker/domain checks

Command:

```text
$ pnpm --dir web exec vitest run --config vitest.config.ts lib/identity/permission-editor.test.ts lib/identity/permission-editor-handlers.test.ts
```

Result: **exit 1; external Cloudflare-pool infrastructure blocked before assertions.** Both files failed during pool startup with the exact error below:

```text
Caused by: EvalError: Code generation from strings disallowed for this context
 ❯ getAsyncFunctionDeclarationPaddingLineCount .../vite@8.2.0/.../vite/dist/node/module-runner.js:27:35
 ❯ new ESModulesEvaluator .../vite@8.2.0/.../vite/dist/node/module-runner.js:1007:26
 ❯ new ModuleRunner .../vite@8.2.0/.../vite/dist/node/module-runner.js:1111:35
 ❯ createEnvironmentLoader .../vitest/dist/chunks/init.k9zZ9sLh.js:27:24

 Test Files  no tests
      Tests  no tests
     Errors  2 errors
```

The failure is classified as upstream/workerd + `@cloudflare/vitest-pool-workers` infrastructure, not product code, per `docs/qa/2026-08-29-s4-phase-c-vitest-pool-research.md:306-339`. No unsafe-eval workaround was used or recommended. **Product assertions: 0.** All HTTP/D1 Worker/domain portions of C-485-01 through C-485-06 therefore remain **BLOCKED**; no Worker PASS, D1 mutation, audit, revision, denial, or replay claim is made.

### Focused client/component checks

Combined command:

```text
$ pnpm --dir web exec vitest run --config vitest.components.config.ts lib/permission-editor-panel.test.tsx lib/identity/role-hierarchy-panel.test.tsx

 Test Files  2 passed (2)
      Tests  25 passed (25)
   Start at  17:19:25
   Duration  11.53s (transform 2.25s, setup 1.63s, import 4.31s, tests 10.06s, environment 5.84s)
```

Per-file checks:

```text
$ pnpm --dir web exec vitest run --config vitest.components.config.ts lib/permission-editor-panel.test.tsx
 Test Files  1 passed (1)
      Tests  8 passed (8)
   Duration  10.30s (transform 1.35s, setup 944ms, import 2.62s, tests 3.62s, environment 2.62s)

$ pnpm --dir web exec vitest run --config vitest.components.config.ts lib/identity/role-hierarchy-panel.test.tsx
 Test Files  1 passed (1)
      Tests  17 passed (17)
   Duration  5.94s (transform 677ms, setup 225ms, import 1.28s, tests 3.12s, environment 1.02s)
```

Directly exercised client/component behavior is **PASS**: the eight Permission Editor tests cover safe list/catalog search, malformed URL fallback, one locked reason plus Switch role/checked/disabled/keyboard semantics, ordinary Sheet review and authoritative revision rendering, non-conflict draft preservation with the same `Idempotency-Key` on retry, high-risk dedicated review with conflict restart, Back/focus restoration, and `resource.retry()` focus recovery. The 17 role-hierarchy tests include the server-projected `編輯權限` action, local Button `data-slot`, canonical URL push, and single-owner live-region assertions. These tests do not claim Worker/D1 behavior or formal accessibility conformance.

### Typecheck and web build

```text
$ pnpm --dir web exec tsc --noEmit -p tsconfig.worker.json && pnpm --dir web exec tsc --noEmit -p tsconfig.json
exit 0 (no output)

$ pnpm --dir web build
▲ Next.js 16.2.12 (Turbopack)
✓ Compiled successfully in 8.2s
  Finished TypeScript in 24.7s ...
✓ Generating static pages using 9 workers (18/18) in 702ms
○ 18 static routes prerendered
exit 0
```

The worker and web TypeScript configs and the web production build are directly exercised **PASS**. The Next workspace-root/multiple-lockfile warning is retained as a warning only; it did not fail the build.

### W7 numeric geometry

Command:

```text
$ pnpm test:role-hierarchy-geometry
...
Running 35 tests using 1 worker
...
35 passed (1.8m)
```

The shared pinned static-export harness ran 14 Permission Editor scenarios (detail and capped Sheet review) plus 21 role-hierarchy scenarios at every required W7 width: `320, 390, 600, 799, 800, 1024, 1440` CSS px. The Permission Editor route was `/management?module=permissions&role=r-staff&view=permissions` with server-shaped identity reads stubbed in-browser. Numeric checks passed for no horizontal overflow, main/list/row containment, Back and Action Surface heights, every `[data-capability] [role="switch"]` width and height at least `44px`, phone dock clearance and `84px` shell bottom reserve, the `799px`/`800px` fixed-to-sticky shell transition, and the ordinary-change Sheet/review rectangles. No screenshot, image snapshot, or pixel-diff test was used. The geometry client evidence is **PASS**; it does not certify Worker/D1 or manual AT behavior.

### Corrected review-blocker coverage summary

| Corrected blocker | Direct evidence | Status |
| --- | --- | --- |
| Per-capability `systemOnly` versus actor-grant and exact-scope guards | Corrected source inspection plus domain tests that could not start in the Worker pool | **BLOCKED — Worker seam: 0 product assertions** |
| Separate `role.permissions.read` and `role.permissions.write` gate | Corrected source inspection; write-only fixture is in `permission-editor.test.ts` but did not execute | **BLOCKED — Worker seam: 0 product assertions** |
| `result_json` original terminal replay | Corrected source/kernel inspection and replay regression tests present but not runnable | **BLOCKED — Worker seam: 0 product assertions** |
| No-op/stale terminal idempotency reservation | Corrected mutation-kernel inspection and no-op/stale regression tests present but not runnable | **BLOCKED — Worker seam: 0 product assertions** |
| Server permissions affordance rendered by local `Button` | `role-hierarchy-panel.test.tsx` direct assertion; 17 component tests passed | **PASS — client/component behavior only** |
| `resource.retry` recovery path | `permission-editor-panel.test.tsx` direct retry/focus assertion; 8 component tests passed | **PASS — client/component behavior only** |
| Single live announcement owner | Component assertions require one polite live region and no duplicate Permission Editor success/error/conflict announcements | **PASS — client/component behavior only; no manual AT claim** |
| Persistent idempotency key across non-conflict save retry | Component assertion sends the same key for both `503` attempts; Worker persistence remains unexercised | **PASS — client/component behavior only** |
| Switch target measurement `>=44px` | `permission-editor-geometry.test.ts` measured each Permission Editor switch at all W7 widths; 35 geometry tests passed | **PASS — numeric geometry only** |

### C-485 row mapping

| Row | Directly exercised result | Acceptance status |
| --- | --- | --- |
| C-485-01 | Client safe-list/catalog/search and malformed URL behavior **PASS**; Worker detail envelope, assignment summary, and unauthorized/archived/unknown HTTP outcomes did not execute | **BLOCKED — Worker pool, 0 assertions; criterion incomplete** |
| C-485-02 | Client Switch role/checked/disabled/keyboard behavior **PASS**; numeric `>=44px` targets **PASS**; all named server lock cases, busy/focus behavior, and manual AT review are not complete | **BLOCKED — criterion incomplete** |
| C-485-03 | Client dirty draft, ordinary Sheet, non-conflict draft preservation, and retry-key stability **PASS**; saving-lock assertion and authoritative Worker revision path did not execute | **BLOCKED — Worker pool and missing saving-lock assertion** |
| C-485-04 | Client ordinary Sheet/high-risk dedicated split **PASS**; W7 containment/dock geometry **PASS**; exact 1/2/3 versus 4 ordinary threshold and every high-risk key were not separately exercised | **BLOCKED — criterion incomplete** |
| C-485-05 | No HTTP/D1 grant patch, revision, audit, or replay assertion ran | **BLOCKED — Worker pool, 0 assertions** |
| C-485-06 | Client conflict/restart and safe selection behavior **PASS**; stale HTTP, changed-payload idempotency reuse, Member/unauthorized, protected/closed-capability, and denial-audit outcomes did not execute | **BLOCKED — Worker pool, 0 assertions; criterion incomplete** |

### Manual gates

- `C-485-M1` keyboard-only review at 320/1440, focus order/visibility, target size, dock clearance, and save dialog: **MANUAL — unclaimed**.
- `C-485-M2` screen-reader review of Switches, dirty/saving/success/error/conflict announcements, and high-risk acknowledgement: **MANUAL — unclaimed**.
- No WCAG 2.2 AA, keyboard-only, screen-reader/AT, reduced-motion, forced-colors, zoom/text-spacing, or real-device completion is claimed.

### Scope

- Only `docs/specs/s4-phase-c-acceptance-trace.md` was changed by this evidence append; no focused test/config correction was needed because the corrected geometry test is already matched by the single shared `role-hierarchy-geometry.config.ts`.
- The prior `d269525d` geometry work is superseded by corrected integrated head `2d8e028423eed2dfd28d0bd6be686e26ae502774`; no competing geometry config exists.
- The prior Cloudflare-pool infrastructure blocker remains honest and active. No implementation correction was launched, no production/schema/migration/seed/fixture file was edited, and no production or external database write was made.
## #485 final-correction evidence — 2026-08-29

**Evidence scope:** final focused validation of the corrected integrated #485 Permission Editor after the review blockers were corrected. This is one evidence-only append; all earlier evidence and blocker classifications remain intact. No production source, schema, migration, seed, fixture, deployment, screenshot, snapshot, or pixel-diff file was changed.

### Provenance and exact runtimes

- **Worktree:** `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/s4-c-485-evidence-final2`
- **Branch:** `feat/s4-c-485-evidence-final2` (integrated Phase C branch is `feat/s4-c-stackable-identity-integration`)
- **Phase B base SHA:** `c75c99e84d699d2d1eac44f07d4e013ead4c12a5`
- **Final correction commit:** `894d7993e8ca24741f951842aaca3773aa793dea` (`fix(identity): close remaining permission editor blockers`)
- **Integrated head before this evidence:** `957c837d5015ddf0cefdde8e27ddaef15ffce69c` (`fix(identity): close remaining permission editor blockers`; same tree as the final correction commit)
- **Evidence commit:** this trace-only append; its resulting SHA is returned with delivery because a commit cannot contain its own SHA.
- **Node:** `v22.18.0`
- **pnpm:** `11.7.0`
- **Vitest:** `vitest/4.1.10 darwin-arm64 node-v22.18.0`
- **Wrangler:** `4.127.1`
- **Miniflare:** direct pinned web dependency `5.20260828.0-alpha`; the dependency query also reports an older transitive `5.20260730.0-alpha` under `wrangler@4.118.0`/the pool package.
- **Playwright:** `1.62.1`
- **Pinned Chromium:** Chrome for Testing `151.0.7922.34`, Playwright Chromium revision `v1234`, from `$HOME/Library/Caches/ms-playwright/chromium-1234`.
- The runtime command recorded the exact Node, pnpm, Vitest, Wrangler, Playwright, TypeScript, Miniflare dependency graph, and pinned Chromium versions above.

### Required Context7 CLI lookup

The required lookup ran before validation. Selected authoritative sources were `/radix-ui/primitives`, `/joe-bell/cva`, and `/microsoft/playwright`:

```text
$ npx --yes ctx7@latest library radix-ui "Switch Root checked onCheckedChange disabled keyboard semantics"
Selected: /radix-ui/primitives
$ npx --yes ctx7@latest library class-variance-authority "CVA variants composition"
Selected: /joe-bell/cva
$ npx --yes ctx7@latest library playwright "viewport locator boundingBox CSS pixel geometry"
Selected: /microsoft/playwright

$ npx --yes ctx7@latest docs /radix-ui/primitives "Switch Root checked onCheckedChange disabled role keyboard behavior"
Switch.Root renders a button with role="switch", aria-checked, disabled/data-disabled state, and onCheckedChange.
$ npx --yes ctx7@latest docs /joe-bell/cva "type-safe variant composition class variance authority"
CVA documents type-safe cva variants and composed variant props.
$ npx --yes ctx7@latest docs /microsoft/playwright "Locator boundingBox viewport CSS pixels and test viewport"
Locator.boundingBox returns the matching element rectangle relative to the main-frame viewport in pixels.
```

### Corrected review-blocker source audit versus direct execution

Source inspection was completed against the corrected tree at `957c837d` (the exact tree of `894d7993`). The source audit is not substituted for runtime proof:

| Corrected finding | Source-review coverage | Direct execution |
| --- | --- | --- |
| Target-error precedence | `web/lib/identity/permission-editor.ts:538-562,918-968` resolves target existence and keeps protected, archived, highest/self, scope, write, and per-capability checks distinct; `permission-editor.test.ts:689-715` covers protected errors before generic write denial. | Worker/domain test startup was blocked before assertions; no server error result is claimed. |
| Terminal `DENIED`/`REJECTED` reservation and replay | `permission-editor.ts:712-745,790-835,837-895` and `mutations.ts:488-586` reserve one terminal ledger row and audit outcome, then replay by actor/fingerprint/key without a second audit; `permission-editor.test.ts:717-820` covers invalid and authority replay. | Worker/domain test startup was blocked before assertions; source-present regression tests are not counted as executed. |
| `ROLE_NOT_FOUND` mapping | `permission-editor-handlers.ts:123-158` maps closed capabilities and unknown target IDs to the canonical code; `permission-editor-handlers.test.ts:315-361` distinguishes closed capability from malformed change. | Worker/domain test startup was blocked before assertions; no HTTP mapping result is claimed. |
| Nested stale `data.authoritativeRevision` | `permission-editor-handlers.ts:104-112` passes `{ data: { authoritativeRevision } }` through `roleProblem`; `role-handlers.ts:109-151` preserves the RFC 9457 extension under `data`; handler tests at `:218-290` assert first stale response and replay shape. | Worker/domain test startup was blocked before assertions; no stale HTTP result is claimed. |
| Original response request ID/data replay | `permission-editor.ts:790-833,1042-1102` stores and reuses the original response envelope/projection; `mutations.ts:617-641,975-997` persists `result_json`; domain tests `permission-editor.test.ts:414-473` and handler tests `:133-216` assert original revision/data/request ID and no duplicate audit. | Worker/domain test startup was blocked before assertions; no D1 replay or audit result is claimed. |
| Detail action projection | `permission-editor.ts:329-395,605-621` and `role-hierarchy.ts:690-739` project the target-specific `permissions` affordance only after read, position, protection, archive, scope, and capability checks; domain test `permission-editor.test.ts:667-687` covers the projection. | Role-hierarchy component behavior passed 17 tests, including the server-projected `編輯權限` action and canonical URL; Worker projection execution remains blocked. |
| Persistent panel idempotency key | `permission-editor-panel.tsx:277-278,416-429,491-530` retains one key across retryable save failure and clears it only at a new role, authoritative success, or explicit restart; `role-hierarchy-api.ts:121-137` forwards it. | Permission Editor component behavior passed; the retry test observed the same non-empty `Idempotency-Key` on both `503` attempts. |
| Retry focus recovery | `permission-editor-panel.tsx:282-331,448-458` uses the shared resource and `resource.retry()` with `#permission-editor-state` as the focus target; `permission-editor-panel.test.tsx:502-519` asserts the failed-reload retry and focus. | Permission Editor component behavior passed, including retry focus recovery. |
| One live-region owner | `web/lib/live-region.tsx:19-37` owns the single polite `role="status"` region; Permission Editor visible success/error/conflict surfaces at `permission-editor-panel.tsx:688-709` do not add a second live region. `role-hierarchy-panel.test.tsx:348-381` asserts one owner and no duplicate alert. | Role-hierarchy component behavior passed 17 tests, including the one-owner assertion; this is not a manual AT claim. |
| Actual Switch target `>=44px` | The Permission Editor applies `min-h-11 min-w-11` to each local Switch at `permission-editor-panel.tsx:767-780`; numeric selectors and measurements are in `tests/e2e/permission-editor-geometry.test.ts:261-265,338-349`. | Geometry passed at every required W7 width; every rendered Permission Editor Switch measured at least `44px` in both dimensions. |
| Local shadcn/Radix + CVA/cn | `permission-editor-panel.tsx:3-43,81-105,581-589,729-733` uses local `Button`, `Sheet`, `AlertDialog`, `Input`, `Switch`, CVA variants, and `cn`; local primitive composition is in `web/components/ui/button.tsx:1-7,44-64` and `web/components/ui/switch.tsx:1-29`. | Component tests and typechecks passed; Context7 semantics were used for the source audit. No source-class or implementation-name assertion is treated as behavior proof. |

### Focused Worker/domain command

Command:

```text
$ pnpm --dir web exec vitest run --config vitest.config.ts lib/identity/permission-editor.test.ts lib/identity/permission-editor-handlers.test.ts
```

Result: **exit 1; external Cloudflare-pool infrastructure blocked before assertions.** Both files failed while starting the pool with:

```text
Caused by: EvalError: Code generation from strings disallowed for this context
... vite@8.2.0/.../vite/dist/node/module-runner.js
... getAsyncFunctionDeclarationPaddingLineCount
Test Files  no tests
     Tests  no tests
   Errors  2 errors
```

This is classified as upstream/workerd plus `@cloudflare/vitest-pool-workers` infrastructure, per `docs/qa/2026-08-29-s4-phase-c-vitest-pool-research.md:306-339`: workerd disallows string code generation, the pool patches `Function` but not `AsyncFunction`, and the failure occurs before test discovery. No unsafe-eval workaround was used or recommended. **Product assertions: 0.** All Worker-only HTTP/D1/security/idempotency/audit/revision/denial/replay assertions for C-485-01 through C-485-06 are **BLOCKED by external infrastructure**, not product PASS or FAIL.

### Focused client/component command

```text
$ pnpm --dir web exec vitest run --config vitest.components.config.ts lib/permission-editor-panel.test.tsx lib/identity/role-hierarchy-panel.test.tsx

 Test Files  2 passed (2)
      Tests  25 passed (25)
   Duration  7.19s
```

Direct client/component behavior is **PASS**. The focused files cover eight Permission Editor tests and 17 role-hierarchy tests: safe list/catalog search, malformed URL fallback, Switch role/checked/disabled/keyboard behavior, ordinary Sheet review, dirty-draft preservation, persistent retry key, high-risk dedicated review, conflict restart, Back/focus recovery, retry focus, the server-projected `編輯權限` Button action, and the single live-region owner. These tests do not claim Worker/D1 behavior, formal accessibility conformance, or manual AT completion.

### TypeScript and web build commands

```text
$ pnpm --dir web exec tsc --noEmit -p tsconfig.worker.json
exit 0 (no output)

$ pnpm --dir web exec tsc --noEmit -p tsconfig.json
exit 0 (no output)

$ pnpm --dir web build
▲ Next.js 16.2.12 (Turbopack)
✓ Compiled successfully
✓ Generating static pages using 9 workers (18/18)
18 static routes prerendered
exit 0
```

The worker TypeScript check, web TypeScript check, and `pnpm --dir web build` are directly exercised **PASS**. Next's workspace-root/multiple-lockfile warning was retained as a warning only and did not fail the build.

### W7 numeric geometry command

```text
$ pnpm test:role-hierarchy-geometry
$ playwright test --config=tests/e2e/role-hierarchy-geometry.config.ts
Running 35 tests using 1 worker
35 passed (43.1s)
```

The shared config `tests/e2e/role-hierarchy-geometry.config.ts:10-29` matched both geometry files and ran the required W7 widths `320, 390, 600, 799, 800, 1024, 1440` CSS px. The suite directly ran 14 Permission Editor scenarios plus 21 role-hierarchy scenarios. Numeric checks passed for no horizontal overflow, main/list/row containment, Back and Action Surface heights, every Permission Editor Switch at least `44px` wide and high, phone-dock clearance and `84px` shell reserve, the fixed-to-sticky `799px`/`800px` transition, and the ordinary Sheet/review rectangles. No screenshot, image snapshot, or pixel-diff test was used. Geometry is directly exercised **PASS**; it does not certify Worker/D1 behavior or manual AT behavior.

### C-485-01..06 mapping

| Row | Direct result | Acceptance status |
| --- | --- | --- |
| C-485-01 | Client safe-list/catalog/search and malformed URL fallback **PASS**; detail action source projection is covered by source audit and hierarchy component tests. Worker detail envelope, assignment summary, and unknown/archived/unauthorized HTTP outcomes did not execute. | **BLOCKED — external Worker pool, 0 product assertions; criterion incomplete.** |
| C-485-02 | Client Switch role/checked/disabled/keyboard behavior **PASS**; W7 numeric Switch targets `>=44px` **PASS**. Source audit covers the complete lock-reason matrix, but named server lock outcomes and manual focus/AT checks did not execute. | **BLOCKED — criterion incomplete; Worker-only cases blocked and manual gates unclaimed.** |
| C-485-03 | Client dirty draft, ordinary Sheet, non-conflict draft preservation, retry-key stability, and busy source path **PASS by direct component/source evidence**. Worker authoritative revision and atomic write path did not execute; saving-lock behavior is source-reviewed but not separately asserted. | **BLOCKED — external Worker pool, 0 product assertions; criterion incomplete.** |
| C-485-04 | Client ordinary Sheet/high-risk dedicated split **PASS**; W7 containment, dock clearance, and review rectangles **PASS**. Source threshold logic is present, but separate 1/2/3 versus 4 ordinary and every high-risk key were not each directly exercised. | **BLOCKED — criterion incomplete despite direct component/geometry PASS.** |
| C-485-05 | Source audit covers actor-bound fingerprint, D1 terminal result, revision, one audit row, and original response replay. No HTTP/D1 grant patch, revision, audit, or replay assertion ran. | **BLOCKED — external Worker pool, 0 product assertions.** |
| C-485-06 | Client conflict/restart, safe selection, and retry focus **PASS**; nested stale revision shape, closed-capability mapping, protected/denial replay, and changed-payload reuse are source/test-reviewed but did not execute in Worker infrastructure. | **BLOCKED — external Worker pool, 0 product assertions; criterion incomplete.** |

### Corrected outcome classification

- **Security/authority:** corrected target, scope, protected, caller read/write, system-only, and per-capability guards are present in source. No Worker assertion is claimed because the pool stopped before discovery.
- **Idempotency/audit:** corrected terminal `DENIED`/`REJECTED`, stale conflict, no-op, and successful `result_json` reservation/replay paths are present in source and regression tests; only the client retry-key behavior ran directly. D1 mutation/audit proof remains blocked.
- **Transport:** corrected cookie-only actor, `{ requestId, data }`, `X-Request-Id`, nested stale `data.authoritativeRevision`, and canonical `ROLE_NOT_FOUND` mappings are source-reviewed and covered by blocked Worker tests. No HTTP result is claimed.
- **UI:** focused Permission Editor and hierarchy component behavior is **PASS** at 25/25 tests, including corrected action projection, retry/focus, persistent key, and one-owner live-region behavior. No WCAG or manual AT claim is made.
- **Geometry:** shared pinned numeric geometry is **PASS** at 35/35 tests across all W7 widths, including actual Switch measurements `>=44px`; no screenshots or pixel diffs were used.
- **Type/build:** both requested TypeScript projects and the web production build are **PASS** with exit 0.

### Manual gates

- `C-485-M1` keyboard-only review at 320/1440, focus order/visibility, target size, dock clearance, and save dialog: **MANUAL — unclaimed**.
- `C-485-M2` screen-reader review of Switches, dirty/saving/success/error/conflict announcements, and high-risk acknowledgement: **MANUAL — unclaimed**.
- No WCAG 2.2 AA, keyboard-only, screen-reader/AT, reduced-motion, forced-colors, zoom/text-spacing, real-device, remote-CI, or production-promotion completion is claimed.

### Scope and next state

- Only `docs/specs/s4-phase-c-acceptance-trace.md` is changed by this append. No focused test/config correction was needed; the corrected Permission Editor geometry test is already matched by the single shared `role-hierarchy-geometry.config.ts`.
- No correction worker was launched, no production/schema/migration/seed/fixture file was edited, and no Apps Script, Google Sheets, Cloudflare production, or external database write was made.
- The final correction commit remains `894d7993e8ca24741f951842aaca3773aa793dea`; the integrated head before this evidence remains `957c837d5015ddf0cefdde8e27ddaef15ffce69c`. Phase C remains stopped before Phase D.

## #486 final focused evidence — 2026-08-29

**Evidence scope:** final focused validation of the integrated #486 Account Access and identity-lifecycle implementation. This is an evidence-only append. No production source, schema, migration, seed, fixture, test, geometry config, deployment, screenshot, snapshot, or pixel-diff file was changed.

### Provenance and exact runtimes

- **Worktree:** `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/s4-phase-c`
- **Branch:** `feat/s4-c-stackable-identity-integration`
- **Base SHA:** `c75c99e84d699d2d1eac44f07d4e013ead4c12a5`
- **#486 implementation SHA:** `8e066dc7f791249e79696c331372d919ce188833`
- **Integrated head under test:** `69762b8368913ef63c521d08f430478779a05f71`
- **Evidence commit:** this trace-only append; its resulting SHA is returned with delivery because a commit cannot contain its own SHA.

The exact runtime/version command was run before the focused checks:

```text
$ node --version && pnpm --version && pnpm --dir web exec vitest --version && pnpm --dir web exec wrangler --version && pnpm exec playwright --version && pnpm --dir web exec tsc --version && pnpm --dir web why miniflare --depth 5 && "$HOME/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" --version
v22.18.0
11.7.0
vitest/4.1.10 darwin-arm64 node-v22.18.0
4.127.1
Version 1.62.1
Version 5.9.3
miniflare@5.20260730.0-alpha
├─┬ @cloudflare/vitest-pool-workers@0.20.1
│ └── web@0.1.0 (devDependencies)
└─┬ wrangler@4.118.0
  └── @cloudflare/vitest-pool-workers@0.20.1 [deduped]

miniflare@5.20260828.0-alpha
└── wrangler@4.127.1
    └── web@0.1.0 (devDependencies)

Found 2 versions of miniflare
Google Chrome for Testing 151.0.7922.34
```

The direct web dependency is Miniflare `5.20260828.0-alpha`; the older `5.20260730.0-alpha` is a transitive dependency reported by the exact query. The pinned Chromium is Playwright revision `v1234`.

### Required Context7 CLI library and docs lookup

These lookups ran before validation and were used for the source audit:

```text
$ npx --yes ctx7@latest library radix-ui "Switch Root checked onCheckedChange disabled keyboard semantics"
Selected authoritative result: /radix-ui/primitives
$ npx --yes ctx7@latest docs /radix-ui/primitives "Switch Root checked onCheckedChange disabled role keyboard behavior"
Switch.Root renders a button with role="switch", aria-checked, disabled/data-disabled state, and onCheckedChange.

$ npx --yes ctx7@latest library class-variance-authority "CVA variants composition type-safe class names"
Selected authoritative result: /joe-bell/cva
$ npx --yes ctx7@latest docs /joe-bell/cva "type-safe cva variants composition class variance authority"
CVA documents type-safe cva variants and composed variant props.

$ npx --yes ctx7@latest library playwright "viewport CSS pixels locator boundingBox webServer"
Selected authoritative result: /microsoft/playwright
$ npx --yes ctx7@latest docs /microsoft/playwright "Locator boundingBox viewport CSS pixels and test viewport webServer"
Locator.boundingBox returns the matching element rectangle relative to the main-frame viewport in pixels.

$ npx --yes ctx7@latest library "Cloudflare Workers" "D1Database batch transaction prepared statements"
Selected authoritative result: /cloudflare/workers-sdk
$ npx --yes ctx7@latest docs /cloudflare/workers-sdk "D1Database batch prepared statements transaction atomic"
D1 batch transactions use prepared statements collected into an array and passed to db.batch().
```

The initial unquoted multiword Cloudflare resolver invocation was rejected by the CLI argument parser; the quoted invocation above is the successful lookup used. Context7 confirms the local Radix Switch semantics, CVA variant composition, Playwright CSS-pixel bounding boxes/viewports, and Cloudflare D1 prepared-statement batch pattern.

### #486 source and contract audit

The required authority material was re-read before validation: issue #486, issue #475, Spec 091, Spec 092, ADR-0042, ADR-0043, the approved `local://s4-phase-c-identity-integration-plan.md`, and the full current acceptance trace. The following integrated-head seams were then inspected:

- `web/lib/identity/account-access.ts` owns the safe `AccountAccessView`, active/revoked assignment projections, assignment history, `Global`/`Department`/`Program` effective-access groups, grant provenance, revision, and server-projected actions. `assertEligibleAccount` enforces Active/non-Admin/non-self targets; `assertRoleManageable` enforces protected Admin/baseline, archived, highest-position, exact-scope, and capability guards.
- `mutateAccountAssignments` validates every requested identity before staging any write, de-duplicates active assignments, creates a fresh `crypto.randomUUID()` assignment ID for each addition, and sends the batch through `applyRoleMutation`. `revokeAccountAssignments` stages immutable revocation history and computes lost/retained impact. `mutateRoleDefinitionLifecycle` computes archive impact and sends `archive_role_definition`/`restore_role_definition` through the same mutation kernel; restore does not stage assignments.
- `replayIfTerminal`, `deny`, `duplicateResult`, and the mutation-kernel reservations bind actor, canonical request fingerprint, idempotency key, revision, request/correlation ID, terminal result, and audit outcome. The implementation preserves the original terminal projection for replay.
- `web/lib/identity/account-access-handlers.ts` uses cookie-only `requireActor`, strict JSON/body validation, required actor-bound `Idempotency-Key`, `{ requestId, data }` success envelopes, RFC 9457 Problem Details, and `X-Request-Id`/correlation mapping. `web/lib/identity/account-access-api.ts` URL-encodes path IDs, sends the exact assignment/lifecycle bodies, and does not send an `Authorization` header.
- `web/worker.ts:1083-1176` dispatches `GET /api/v1/identity/accounts`, account assignment GET/POST/revoke, and lifecycle POST routes behind the identity cookie/auth guard.
- `web/app/management/account-access-panel.tsx` consumes `DirectoryFrame`, the shared async resource, Account Access API methods, and local `Button`, `Input`, `Switch`, `Sheet`, `Dialog`, and `AlertDialog` primitives. It uses `cva` for panel variants and `cn` for composed classes; assignment review, revoke impact, scope groups, provenance, history, lifecycle copy, retry/error/focus state, and safe Back are route-local.
- `web/app/management/directory-frame.tsx` remains a domain-neutral responsive frame with list/detail/state slots, retry/detail focus refs, pagination hooks, `min-[800px]` composition, and no Account Access query vocabulary.
- Entry links converge on the canonical `module=accounts&account=<opaque id>&view=access` route: Account Directory (`account-directory-panel.tsx:708`), Role Hierarchy identity-first detail (`role-hierarchy-panel.tsx:1262`), Department Settings (`programs/department-settings-panel.tsx:385`), and Programs Leaders (`programs/programs-leaders-panel.tsx:177`). Department/Programs keep their surrounding task context; no new navigation section was added.
- `web/components/ui/button.tsx` is the local shadcn/CVA/`cn` Button and `web/components/ui/switch.tsx` is the local Radix Switch wrapper composed with `cn`. The Account Access panel applies `min-h-11 min-w-11` to assignment Switches.

### Focused commands and exact results

#### Worker/domain/D1

```text
$ pnpm --dir web exec vitest run --config vitest.config.ts lib/identity/account-access.test.ts lib/identity/account-access-handlers.test.ts lib/identity/d1-schema.test.ts lib/identity/role-hierarchy.test.ts

 Test Files  4 passed (4)
      Tests  73 passed (73)
   Start at  21:06:49
   Duration  3.23s (transform 278ms, setup 0ms, import 871ms, tests 1.21s, environment 0ms)
```

**Result: exit 0; 73/73 assertions passed.** This is the direct Worker/domain/D1 evidence run. It used disposable local D1 test bootstrap/seed paths only; no remote, Apps Script, Google Sheets, Cloudflare production, or other external database write was made.

#### Account Access, Account Directory, and Role Hierarchy components

```text
$ pnpm --dir web exec vitest run --config vitest.components.config.ts lib/account-access-panel.test.tsx lib/account-access-api.test.ts lib/account-directory-panel.test.tsx lib/identity/role-hierarchy-panel.test.tsx

 Test Files  4 passed (4)
      Tests  39 passed (39)
   Start at  21:07:07
   Duration  3.48s (transform 873ms, setup 662ms, import 1.53s, tests 3.48s, environment 2.19s)
```

**Result: exit 0; 39/39 assertions passed.** The direct client evidence covers selected-account rendering, scope-group headings, assignment review, canonical Account Access navigation from Account Directory and Role Hierarchy, API path/body/idempotency-key encoding, Account Directory Back/deep-link behavior, and existing Role Hierarchy URL/focus/live-region contracts.

#### Directly affected Department/Programs convergence tests

```text
$ pnpm --dir web exec vitest run --config vitest.components.config.ts lib/programs/department-settings-panel.test.tsx lib/programs/programs-leaders-panel.test.tsx

 Test Files  2 passed (2)
      Tests  18 passed (18)
   Start at  21:07:15
   Duration  1.45s (transform 421ms, setup 159ms, import 785ms, tests 837ms, environment 694ms)
```

**Result: exit 0; 18/18 assertions passed.** These suites directly exercise the affected Department Settings and Programs Leaders surfaces and their existing loading, scope, mutation, error, and member/operator states. Their current assertions do not themselves prove the Account Access link destination; the destination was source-audited at the exact links above.

#### Worker/web TypeScript configs

```text
$ pnpm --dir web exec tsc --noEmit -p tsconfig.worker.json && pnpm --dir web exec tsc --noEmit -p tsconfig.json
(no output)
```

**Result: exit 0.** Both requested Worker and web TypeScript configs passed.

#### Web production build

```text
$ pnpm --dir web build
▲ Next.js 16.2.12 (Turbopack)
✓ Compiled successfully
  Finished TypeScript in 4.7s ...
✓ Generating static pages using 9 workers (18/18) in 189ms
...
○  (Static)  prerendered as static content
```

**Result: exit 0; 18 static routes prerendered.** Next emitted the existing workspace-root/multiple-lockfile warning and no-cache warning; neither failed the build.

#### Shared W7 numeric geometry

```text
$ pnpm test:role-hierarchy-geometry
$ playwright test --config=tests/e2e/role-hierarchy-geometry.config.ts
Running 49 tests using 1 worker
...
49 passed (26.3s)
```

The single shared `tests/e2e/role-hierarchy-geometry.config.ts` matched `role-hierarchy-geometry.test.ts`, `permission-editor-geometry.test.ts`, and `account-access-geometry.test.ts` at every required width: `320, 390, 600, 799, 800, 1024, 1440` CSS px. Account Access contributed 2 scenarios per width, **14/14 Account Access geometry tests passed**; Permission Editor contributed 14 and Role Hierarchy 21, for **49/49 total**. Direct numeric checks covered no horizontal overflow, in-bounds main/content/action rectangles, rendered Button heights, Switch width/height `>=44px`, phone dock clearance, `84px` phone bottom reserve, and the fixed-to-sticky dock transition at `799px`/`800px`. The add-review Sheet stayed within the viewport at all W7 widths. No screenshot, image snapshot, or pixel-diff test was used. The geometry harness stubs browser API responses and is not an authenticated end-to-end journey.

### Safe/private-data audit

**PASS — Account Access projection is privacy-safe for the exercised contract.** The account-access SQL selects only `user_id`, `name`, `username`, and `account_status`; the eligible-account query requires `Active`, excludes the actor, excludes active Admin assignments, and emits only safe identity IDs/labels/scope labels. `AccountAccessPanel` renders the safe account projection, assignment IDs/timestamps, scope-grouped capability metadata, and source labels; it does not read or return credential, token, phone, attendance, or pastoral fields. The domain test asserts no `credential_hash`/`phone` fields in search results and no `credential_hash`/`phone` strings in the Account Access projection; the handler test asserts the safe response does not contain `credential`, `phone`, `attendance`, or `pastoral`. This is source/test evidence for the Account Access surface, not a claim about unrelated Account Directory detail fields.

### Assignment, revoke/re-add, lifecycle, idempotency, and audit outcomes

- **Assignment batch — PASS (directly exercised):** the Worker/domain test adds Department and Program identities to one account in one `mutateAccountAssignments` call, returns `idempotent: false`, and projects both scope groups. The handler test adds through the canonical route and verifies the request ID/envelope.
- **Active duplicate — PASS (directly exercised):** an already-active identity is reported in `duplicateRoleDefinitionIds`, creates no second active assignment, and replaying the same actor/key/fingerprint returns `idempotent: true` with exactly one audit row for the duplicate-key sequence.
- **Invalid batch rollback — PASS (directly exercised for an unknown identity):** a batch containing one valid identity and `unknown-role-definition` rejects before any assignment-count change. The complete Pending/Suspended/Inactive/Admin/self/out-of-scope/above-highest matrix was not run in this focused command.
- **Revoke and re-add — PASS (directly exercised):** revoke removes the identity from active projection and retains it in revoked history; re-add gets a fresh `assignmentId` while the prior revoked event remains. The handler test also verifies explicit revoke route envelopes. A same-key revoke replay was not separately exercised.
- **Archive and restore — PASS (directly exercised for state/history):** archive returns `isArchived: true`, removes the live assignment from the Account Access projection, and writes a correlated `ROLE_DEFINITION_ARCHIVE` `SUCCESS` audit in the domain test; restore returns `isArchived: false` and does not recreate the assignment. The handler test verifies revision-bound archive/restore success envelopes and matching `X-Request-Id`. A post-archive assignment rejection and exact terminal idempotency-row audit count were not separately exercised.
- **Successful response-loss replay — PASS (directly exercised):** replay returns the original revision and active-assignment projection rather than a newly recomputed response. The mutation-kernel source audit and D1 suite cover terminal reservations; no broader authenticated response-loss journey is claimed.

### C-486-01..07 focused mapping

| Row | Directly exercised result | Acceptance status |
| --- | --- | --- |
| C-486-01 | **PASS — focused behavior:** eligible Active/non-Admin search, safe account/detail projection, no private fields, canonical Account Directory entry, and Account Access candidate navigation were exercised. | **PARTIAL —** the full live identity-detail/shared-projection journey and every self-target/private-data fixture combination were not separately run. |
| C-486-02 | **PASS —** one-account multi-identity add, Department/Program projection, active duplicate no-op, and duplicate replay behavior were exercised through the domain seam; the handler add envelope also passed. | **PASS for the directly exercised contract.** No multi-account bulk behavior was added or claimed. |
| C-486-03 | **PASS — focused behavior:** one invalid unknown identity rejected the batch with no assignment-count change; strict empty-body/empty-list validation also ran at the handler seam. | **PARTIAL —** Pending/Suspended/Inactive/Admin/self/out-of-scope/above-highest cases were not all directly exercised in this run. |
| C-486-04 | **PASS —** revoke-to-history and fresh re-add assignment event were exercised, including preservation of the revoked row; duplicate replay no-second-audit was directly exercised for the active-duplicate path. | **PARTIAL —** same-key revoke replay and every normalized audit/replay variant were not separately exercised. |
| C-486-05 | **PASS — focused behavior:** effective-access scope buckets, baseline presence, grant source shape in the domain projection, and revoke lost/retained impact copy in the component were exercised. | **PARTIAL —** complete provenance assertions across all scopes and archive-impact UI grouping were not separately exercised. |
| C-486-06 | **PASS — focused behavior:** archive/revoked-state/restore/no-reassignment and lifecycle request-ID envelopes were exercised; the archive audit action/outcome/correlation was asserted. | **PARTIAL —** post-archive assignment rejection, preserved-grant assertion, and exact lifecycle idempotency replay/audit counts were not separately exercised. |
| C-486-07 | **PASS — focused behavior:** Account Directory and Role Hierarchy canonical access links, Account Access component states, and 14 Account Access numeric geometry scenarios passed at all W7 widths. | **PARTIAL —** no authenticated browser journey proved focus restoration, reload/history, or every Department/Programs link; human focus/feedback and AT gates remain manual. |

No unrun authenticated journey, full private-data matrix, formal WCAG conformance, or manual accessibility outcome is converted into PASS.

### Manual gates and infrastructure classification

- `C-486-M1` keyboard-only review of both identity-first and account-first entry links at 320/1440, focus order/visibility, target size, Back/history, and dock clearance: **MANUAL — unclaimed**.
- `C-486-M2` screen-reader review of Effective Permission scope groups, grant provenance, archive impact, and revoke/re-add announcements: **MANUAL — unclaimed**.
- Reduced-motion, forced-colors, 200% zoom/text-spacing, real-device dock/safe-area, remote-CI, and production-promotion gates remain **MANUAL — unclaimed**. No WCAG 2.2 AA certification is claimed.
- All focused commands in this section exited 0. The only infrastructure warnings observed were the existing Next workspace-root/multiple-lockfile warning, no-cache warning, and Playwright `NO_COLOR`/`FORCE_COLOR` notices; none changed a product result or was classified as a failure.

### Evidence-only scope

- Only `docs/specs/s4-phase-c-acceptance-trace.md` is changed by this append. The base `c75c99e84d699d2d1eac44f07d4e013ead4c12a5`, #486 implementation `8e066dc7f791249e79696c331372d919ce188833`, and integrated head `69762b8368913ef63c521d08f430478779a05f71` are recorded exactly above.
- No correction worker was launched; no source/schema/migration/seed/fixture/test/config file was edited; no production or external database write was made. The branch remains stopped before Phase D.

### Source-audit blocker (not directly executed)

- **BLOCKED — authority/privacy guard gap identified by source audit:** `web/lib/identity/account-access.ts:615-650` (`assertEligibleAccount`) validates only actor/target account status, self-target, and Admin-target eligibility; it does not establish `role.assign`, `role.revoke`, or Account Access read authority. In `mutateAccountAssignments:1312-1325`, an active duplicate is recorded and skipped before `assertRoleManageable`; the path then returns `readProjection`/`duplicateResult` around `:1381-1387`. In `revokeAccountAssignments:1508-1518`, an existing role with no active assignment is likewise treated as a no-op before `assertRoleManageable`, then returns the projection through `duplicateResult` around `:1580-1588`. **[INFERENCE]** An Active Member or other unauthorized actor could therefore submit a duplicate-only add or absent-assignment revoke for an eligible target and receive that target's Account Access projection instead of `ROLE_FORBIDDEN`. The focused tests exercised authorized mutations only; they did not execute these rejection paths. No correction or source edit was launched in this evidence-only task.

## #486 corrected focused evidence — 2026-08-29

**Evidence scope:** fresh focused revalidation of corrected #486 Account Access and identity lifecycle at integrated HEAD `ffb2999acfbda35a62cb2fed37202f785927a79e`. This is an evidence-only append. No production source, schema, migration, seed, fixture, test, geometry config, deployment, screenshot, snapshot, or pixel-diff file was changed by this evidence commit.

### Authority reread

Before validation, the implementation ticket `issue://486`, parent `issue://475`, authoritative Specs `docs/specs/091-stackable-identity-backend.md` and `docs/specs/092-discord-identity-design-system-adoption.md`, approved plan `local://s4-phase-c-identity-integration-plan.md`, the full current `docs/specs/s4-phase-c-acceptance-trace.md`, and ADRs `docs/adr/0042-discord-like-stackable-role-model.md` and `docs/adr/0043-owned-civic-design-system-governance.md` were reread. The checks below target only corrected #486 paths.

### Provenance and exact runtimes

- **Worktree / branch:** `.worktrees/s4-c-486-evidence`, `evidence/s4-c-486`
- **Phase B base:** `c75c99e84d699d2d1eac44f07d4e013ead4c12a5`
- **#486 implementation:** `69762b8368913ef63c521d08f430478779a05f71`
- **Corrected integrated HEAD:** `ffb2999acfbda35a62cb2fed37202f785927a79e`
- **Runtime:** Node `v22.18.0`; pnpm `11.7.0`; Vitest `4.1.10`; Wrangler `4.127.1`; Playwright `1.62.1`; TypeScript `5.9.3`
- **Miniflare:** direct web dependency `5.20260828.0-alpha`; the version query also reports transitive `5.20260730.0-alpha` under `wrangler@4.118.0` / `@cloudflare/vitest-pool-workers@0.20.1`
- **Pinned Chromium:** Chrome for Testing `151.0.7922.34`, Playwright revision `v1234`

### Required Context7 CLI lookup

The required CLI lookups ran before validation. Selected library IDs and useful sections were:

```text
$ npx --yes ctx7@latest library radix-ui "Switch Root checked onCheckedChange disabled keyboard focus semantics"
Selected: /radix-ui/primitives
$ npx --yes ctx7@latest docs /radix-ui/primitives "Switch Root checked onCheckedChange disabled role keyboard focus behavior"
Useful section: Switch Root renders a button with role="switch", aria-checked,
disabled/data-disabled state, data-state, and click/onCheckedChange behavior.

$ npx --yes ctx7@latest library class-variance-authority "CVA variants composition type-safe class names"
Selected: /joe-bell/cva
$ npx --yes ctx7@latest docs /joe-bell/cva "type-safe cva variants composition class variance authority"
Useful section: cva base classes, variants, defaults, compound variants, and
type-safe composition.

$ npx --yes ctx7@latest library playwright "viewport CSS pixels locator boundingBox focus webServer"
Selected: /microsoft/playwright
$ npx --yes ctx7@latest docs /microsoft/playwright "Locator boundingBox CSS pixels viewport focus keyboard press"
Useful sections: Locator.boundingBox returns viewport-relative CSS-pixel
rectangles; Locator.press focuses before key input; toBeFocused asserts focus.

$ npx --yes ctx7@latest library "Cloudflare Workers" "D1Database prepared statements batch transactions"
Selected: /cloudflare/workers-sdk
$ npx --yes ctx7@latest docs /cloudflare/workers-sdk "D1Database prepare bind batch transaction atomic"
Useful section: prepare/bind statements are collected and passed to db.batch()
for atomic D1 transactions.
```

### Focused Worker/domain checks

```text
$ pnpm --dir web exec vitest run --config vitest.config.ts \
    lib/identity/account-access.test.ts \
    lib/identity/account-access-handlers.test.ts \
    lib/identity/d1-schema.test.ts \
    lib/identity/role-hierarchy.test.ts

 Test Files  4 passed (4)
      Tests  77 passed (77)
   Duration  3.26s
exit 0
```

**PASS — 77/77 assertions.** The disposable local D1 run directly exercised eligible-account/private-field filtering, automatic baseline and exact scope provenance, unauthorized active-duplicate and absent-revoke rejection before projection, immutable assignment scope history after role rescope, atomic multi-identity add, operation-specific duplicate audit outcomes, invalid-batch rollback, revoke/re-add with a fresh assignment event, lifecycle impact/provenance plus archive/restore with no assignment recreation, successful response-loss replay, D1 protected-schema constraints, and changed-intent idempotency rejection. No remote, Apps Script, Google Sheets, Cloudflare production, or other external database write was made.

### Focused client/component checks

```text
$ pnpm --dir web exec vitest run --config vitest.components.config.ts \
    lib/account-access-panel.test.tsx \
    lib/account-access-api.test.ts \
    lib/account-directory-panel.test.tsx \
    lib/identity/role-hierarchy-panel.test.tsx \
    lib/programs/department-settings-panel.test.tsx \
    lib/programs/programs-leaders-panel.test.tsx

 Test Files  6 passed (6)
      Tests  62 passed (62)
   Duration  8.66s
exit 0
```

**PASS — 62/62 assertions.** The direct component checks cover Account Access scope groups, atomic add/revoke review, authorized per-role lifecycle controls and impact, Account Access API path/body/idempotency-key encoding, Account Directory and shared DirectoryFrame retry/focus recovery, identity-first entry including a zero-assignment role, canonical Account Access navigation, and affected Department Settings / Programs Leaders states. The geometry run below directly measures the 44px Account Access search Input and app-facing controls.

### TypeScript and web production build

```text
$ pnpm --dir web exec tsc --noEmit -p tsconfig.worker.json && \
    pnpm --dir web exec tsc --noEmit -p tsconfig.json
exit 0 (no output)

$ pnpm --dir web build
▲ Next.js 16.2.12 (Turbopack)
✓ Compiled successfully
✓ Generating static pages using 9 workers (18/18)
○ 18 static routes prerendered
exit 0
```

The visible build route table was `/`, `/_not-found`, `/events`, `/guest-check-in`, `/home`, `/management`, `/messages`, `/notices`, `/permissions`, `/profile`, `/profile/settings`, `/programs`, `/prototype`, `/register`, `/registrations`, and `/scanner`; Next reported 18 static routes. Its existing workspace-root/multiple-lockfile and no-cache warnings did not fail the build.

### Shared W7 numeric geometry

```text
$ pnpm test:role-hierarchy-geometry
$ playwright test --config=tests/e2e/role-hierarchy-geometry.config.ts
Running 49 tests using 1 worker
49 passed (29.2s)
exit 0
```

The single shared config ran the Account Access, Permission Editor, and Role Hierarchy geometry files at every required W7 width: `320, 390, 600, 799, 800, 1024, 1440` CSS px. Account Access contributed 2 scenarios per width (**14/14 passed**), for **49/49 total** with 14 Permission Editor and 21 Role Hierarchy scenarios. Numeric checks included no horizontal overflow, in-bounds content/actions, the Account Access search Input (`#account-access-search`) at least `44px` high, Button and Switch targets (Switch width/height at least `44px`), phone dock clearance, `84px` phone reserve, the `799px`/`800px` fixed-to-sticky transition, and the Account Access add-review Sheet staying inside the viewport. No screenshot, image snapshot, or pixel-diff test was used.

### Corrected-review coverage and classification

- **PASS — authority/privacy correction:** Worker tests directly reject unauthorized active-duplicate and absent-revoke no-ops before returning Account Access, while authorized duplicate behavior remains an operation-specific audited no-op.
- **PASS — immutable scope history:** rescoping an assigned identity changes the active projection scope but the revoked history retains its original assignment scope snapshot.
- **PASS — lifecycle/effective-access correction:** direct domain and component checks cover per-role lifecycle controls, lost/retained impact, scope-grouped effective access, grant provenance, archive revocation, preserved revoked history, and restore without assignment recreation.
- **PASS — entry/recovery correction:** zero-assignment identity-first entry, canonical account-first/identity-first URLs, DirectoryFrame retry/focus, and affected Department Settings / Programs Leaders component states were exercised.
- **PASS — idempotency correction:** D1 changed-intent key reuse is rejected without a second write; grant/revoke duplicate outcomes use their operation-specific audit actions.

The historical #485 Permission Editor Worker `EvalError: Code generation from strings disallowed for this context` remains a separate upstream Cloudflare-pool failure recorded in the earlier #485 evidence sections; it occurred before assertions and is not part of this #486 run. No unsafe-eval bypass was used. No #486 focused blocker occurred.

### Manual gates and evidence scope

`C-486-M1` and `C-486-M2`, plus reduced-motion, forced-colors, zoom/text-spacing, real-device, remote-CI, and production-promotion checks, remain **MANUAL — unclaimed**. No manual accessibility, WCAG, screenshot, image, or pixel-diff claim is made.

Only `docs/specs/s4-phase-c-acceptance-trace.md` is changed by this evidence append. No source, test, migration, schema, fixture, config, deployment, or **#487 path** was changed by this evidence commit; the branch remains stopped before Phase D.
## #486 final corrected revalidation — 2026-08-30

**Evidence scope:** fresh focused revalidation of the corrected #486 Account Access and identity-lifecycle implementation at coordinator HEAD `32829092668e16a5c46a92f13e6c0354450de0a9`. This is one evidence-only append; all prior rows and evidence, including the historical `## #486 corrected focused evidence — 2026-08-29` section at `ffb2999…`, remain unchanged. No source, test, migration, schema, fixture, geometry config, deployment, screenshot, snapshot, or pixel-diff file was changed.

### Authority reread

Before validation, I reread `issue://486`, parent `issue://475`, `docs/specs/091-stackable-identity-backend.md`, `docs/specs/092-discord-identity-design-system-adoption.md`, approved `local://s4-phase-c-identity-integration-plan.md`, the full current `docs/specs/s4-phase-c-acceptance-trace.md`, `docs/adr/0042-discord-like-stackable-role-model.md`, and `docs/adr/0043-owned-civic-design-system-governance.md`. The checks below target only the final corrected #486 paths.

### Provenance and exact runtimes

- **Fresh child:** `/private/tmp/efcc-t486-evidence-final-corrected`, branch `evidence/486-final-corrected`, created with `git worktree add ... 32829092`; `git show` verified `32829092668e16a5c46a92f13e6c0354450de0a9` (`fix(identity): close remaining account access review findings`).
- **Coordinator reference:** `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/s4-phase-c`, branch `feat/s4-c-stackable-identity-integration`, exact HEAD `32829092668e16a5c46a92f13e6c0354450de0a9`.
- **Runtime command:** `node --version && pnpm --version && pnpm --dir web exec vitest --version && pnpm --dir web exec wrangler --version && pnpm exec playwright --version && pnpm --dir web exec tsc --version && pnpm --dir web why miniflare --depth 5 && "$HOME/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" --version`
- **Observed:** Node `v22.18.0`; pnpm `11.7.0`; Vitest `4.1.10`; Wrangler `4.127.1`; Playwright `1.62.1`; TypeScript `5.9.3`; direct web Miniflare `5.20260828.0-alpha`; transitive Miniflare `5.20260730.0-alpha` under `wrangler@4.118.0` / `@cloudflare/vitest-pool-workers@0.20.1`; pinned Chrome for Testing `151.0.7922.34` (Playwright revision `v1234`).

### Required Context7 CLI library and docs lookups

The required lookups used the Context7 CLI (`npx --yes ctx7@latest`), not MCP Context7:

```text
$ npx --yes ctx7@latest library radix-ui "Switch Root checked onCheckedChange disabled keyboard focus semantics"
Library result used: /radix-ui/primitives
$ npx --yes ctx7@latest docs /radix-ui/primitives "Switch Root checked onCheckedChange disabled role keyboard focus behavior"
Useful section: Switch Root renders a button with role="switch", aria-checked,
disabled/data-disabled state, data-state, and click/onCheckedChange behavior.

$ npx --yes ctx7@latest library class-variance-authority "CVA variants composition type-safe class names"
Library result used: /joe-bell/cva
$ npx --yes ctx7@latest docs /joe-bell/cva "type-safe cva variants composition class variance authority"
Useful section: cva base classes, variants, defaults, compound variants, and
type-safe composition.

$ npx --yes ctx7@latest library playwright "viewport CSS pixels locator boundingBox focus webServer"
Library result used: /microsoft/playwright
$ npx --yes ctx7@latest docs /microsoft/playwright "Locator boundingBox CSS pixels viewport focus keyboard press"
Useful sections: Locator.boundingBox returns viewport-relative CSS-pixel
rectangles; Locator.press focuses before key input; toBeFocused asserts focus.

$ npx --yes ctx7@latest library "Cloudflare Workers" "D1Database prepared statements batch transactions"
Library result used: /cloudflare/workers-sdk
$ npx --yes ctx7@latest docs /cloudflare/workers-sdk "D1Database prepare bind batch transaction atomic"
Useful section: prepare/bind statements are collected and passed to db.batch()
for atomic D1 transactions.
```

### Focused checks and exact results

#### Worker identity Account Access, handlers, schema, and role hierarchy

```text
$ pnpm --dir web exec vitest run --config vitest.config.ts \
    lib/identity/account-access.test.ts \
    lib/identity/account-access-handlers.test.ts \
    lib/identity/d1-schema.test.ts \
    lib/identity/role-hierarchy.test.ts

 RUN  v4.1.10 /private/tmp/efcc-t486-evidence-final-corrected/web
 Test Files  4 passed (4)
      Tests  84 passed (84)
   Start at  00:48:43
   Duration  7.65s (transform 860ms, setup 0ms, import 2.73s, tests 5.05s, environment 0ms)
exit 0
```

This disposable local D1 run directly exercised eligible-account/private-field filtering, authorization before target disclosure, canonical self/forbidden outcomes, automatic baseline and scope provenance, atomic multi-identity assignment, authorized picker output, active duplicates, invalid-batch rollback, immutable revoke/re-add history, authoritative revoke/lifecycle impact, archive/restore without assignment recreation, terminal response replay, audit reasons/correlation, protected-schema constraints, duplicate assignment IDs, and changed-intent idempotency rejection. No remote, Apps Script, Google Sheets, Cloudflare production, or other external database write was made.

#### Account Access/API/directory/role-hierarchy/Department/Programs components

```text
$ pnpm --dir web exec vitest run --config vitest.components.config.ts \
    lib/account-access-panel.test.tsx \
    lib/account-access-api.test.ts \
    lib/account-directory-panel.test.tsx \
    lib/identity/role-hierarchy-panel.test.tsx \
    lib/programs/department-settings-panel.test.tsx \
    lib/programs/programs-leaders-panel.test.tsx

 RUN  v4.1.10 /private/tmp/efcc-t486-evidence-final-corrected/web
 Test Files  6 passed (6)
      Tests  71 passed (71)
   Start at  00:48:45
   Duration  7.71s (transform 2.72s, setup 1.89s, import 5.59s, tests 13.66s, environment 5.58s)
exit 0
```

The direct component checks exercised Account Access scope groups, role-first and account-first entry, zero-assignment role assignment, authorized picker projection, atomic add/revoke review, authoritative revoke-preview refresh, lifecycle impact review, canonical URLs, route-state reset, DirectoryFrame retry/focus recovery, one visible live-region owner, persistent retry idempotency keys, concrete scope labels/history IDs, Account Directory behavior, Role Hierarchy focus/live-region behavior, and affected Department Settings / Programs Leaders states.

#### Worker/web TypeScript

```text
$ pnpm --dir web exec tsc --noEmit -p tsconfig.worker.json && pnpm --dir web exec tsc --noEmit -p tsconfig.json
(no output)
exit 0
```

#### Web production build

```text
$ pnpm --dir web build
▲ Next.js 16.2.12 (Turbopack)
✓ Compiled successfully in 1887ms
✓ Generating static pages using 9 workers (18/18) in 190ms
○  (Static)  prerendered as static content
exit 0
```

The visible route table was `/`, `/_not-found`, `/events`, `/guest-check-in`, `/home`, `/management`, `/messages`, `/notices`, `/permissions`, `/profile`, `/profile/settings`, `/programs`, `/prototype`, `/register`, `/registrations`, and `/scanner`; Next reported 18 static routes. The existing workspace-root/multiple-lockfile, no-cache, and telemetry notices did not fail the build.

#### Shared W7 numeric geometry

```text
$ pnpm test:role-hierarchy-geometry
Running 49 tests using 1 worker
49 passed (42.4s)
exit 0

$ pnpm exec playwright test --config=tests/e2e/role-hierarchy-geometry.config.ts
Running 49 tests using 1 worker
49 passed (35.8s)
exit 0
```

The shared config matched `account-access-geometry.test.ts`, `permission-editor-geometry.test.ts`, and `role-hierarchy-geometry.test.ts` at W7 `320, 390, 600, 799, 800, 1024, 1440` CSS px. Account Access contributed 2 scenarios per width (**14/14 passed**), for **49/49 total** with 14 Permission Editor and 21 Role Hierarchy scenarios. Numeric checks covered no horizontal overflow, in-bounds content/actions, the Account Access search Input at least `44px` high, Button and Switch targets (Switch width/height at least `44px`), phone-dock clearance, `84px` phone reserve, the fixed-to-sticky `799px`/`800px` transition, and the Account Access add-review Sheet within the viewport. No screenshot, image snapshot, or pixel-diff test was used.

### Corrected-review coverage

The following source audit was checked against the exact corrected HEAD; source inspection is not substituted for the passing runtime checks:

| Reviewer fix | Direct evidence |
| --- | --- |
| Auth-before-target and no private-data leakage | Worker/domain tests `authorizes Account Access and lifecycle before target disclosure` and unauthorized active-duplicate/absent-revoke cases; handler test `authorizes before revealing unknown targets or lifecycle state`; safe projection tests reject credential/phone/attendance/pastoral fields. Source seams: `account-access.ts:1080-1129,1343-1462,1500-1531,1741-1773`. |
| Terminal response snapshot and immutable history | Worker `replays the original successful projection after response loss`, revoke/re-add fresh-event and scope-snapshot tests, D1 terminal-history tests; source seams: `account-access.ts:1196-1244,1297-1335,1891-1926,2271-2295`, `mutations.ts:383-385,495-500,1010-1071`. |
| UI route state, focus, and live-region ownership | Component tests `clears account-scoped selection and dialogs when the route account changes`, `retries through the shared resource and focuses the settled state`, `keeps Account Access mutation feedback in one visible live region`, plus Role Hierarchy focus/live-region tests; source seams: `account-access-panel.tsx:320-587,784-815,1457-1490`, `directory-frame.tsx:242-268`. |
| Role-first assignment/impact, zero-assignment role, and retry | Component tests `opens an identity-first role entry with every assigned account`, `identity-first entry offers assignment for a zero-assignment role`, `focuses identity-first detail and exposes retryable hierarchy errors`, and `loads authoritative lifecycle impact before identity-first archive`; identity-first lifecycle and assignment source seams: `account-access-panel.tsx:824-1055`. |
| Authorized picker | Worker `returns a server-authorized assignment picker and lifecycle impact preview` and component `uses server-authorized account assignment options without loading role.read hierarchy`; source seam: `account-access.ts:945-1021`. |
| Canonical 403/self errors | Handler `returns ROLE_FORBIDDEN for self-targeting a lower identity` and `authorizes before revealing unknown targets or lifecycle state`; canonical mappings are in `account-access-handlers.ts:56-175`. |
| Authoritative revoke preview | Component `refreshes revoke preview before confirmation and uses its revision`; handler `previews lifecycle impact through the identity route`; source seams: `account-access-panel.tsx:642-678`, `account-access.ts:2023-2086`. |
| Idempotency and duplicate IDs | Worker duplicate/no-second-audit, successful response-loss replay, D1 changed-intent key rejection, and fresh `assignmentId` after revoke/re-add; component same-key retryable-5xx test; source seams: `account-access.ts:1132-1147,1474-1485,1550-1576,1716-1727`, `mutations.ts:6-16,876-918`. |
| Scope labels/history and audit reason | Worker scope snapshot preservation and `account_access_revoke` audit-reason assertions; component `renders concrete scope labels and unique dialog heading IDs`; source seams: `account-access.ts:581-616,1032-1063,1909-1932,2275-2287`. |

### Manual gates, upstream separation, and scope

- `C-486-M1` keyboard-only review and `C-486-M2` screen-reader review remain **MANUAL — unclaimed**, as do reduced-motion, forced-colors, 200% zoom/text-spacing, real-device dock/safe-area, remote-CI, and production-promotion checks. No manual accessibility, WCAG, screenshot, image, or pixel-diff claim is made.
- The historical #485 Cloudflare-pool `EvalError: Code generation from strings disallowed for this context` remains the separate upstream infrastructure failure recorded in earlier #485 sections; it is not part of this #486 run, and no unsafe-eval bypass was used.
- **Changed path:** `docs/specs/s4-phase-c-acceptance-trace.md` only. No #487 path, source, test, migration, schema, fixture, geometry config, deployment, or external database write changed. No #486 focused blocker occurred; the branch remains stopped before Phase D. The doc-only evidence commit SHA is returned with delivery.

## #486 final revalidation — 2026-08-30

**Evidence scope:** fresh focused revalidation of #486 at corrected coordinator
HEAD `69cc1f0d4f9bc8bce8f9cef48814fbd0e14f6d0c`
(`fix(identity): close final account access review findings`). The child was
created from that commit, not from any coordinator working-tree changes. This
is one evidence-only append; all earlier sections remain unchanged.

### Authority reread before checks

Before running Context7 or any validation command, I reread implementation
ticket `issue://486`, parent `issue://475`, Specs
`docs/specs/091-stackable-identity-backend.md` and
`docs/specs/092-discord-identity-design-system-adoption.md`, approved
`local://s4-phase-c-identity-integration-plan.md`, the full current
`docs/specs/s4-phase-c-acceptance-trace.md`, and ADRs
`docs/adr/0042-discord-like-stackable-role-model.md` and
`docs/adr/0043-owned-civic-design-system-governance.md`.

### Provenance and runtimes

- **Fresh child:** `/private/tmp/efcc-t486-final-revalidation`, branch
  `evidence/486-final-revalidation`, created from exact HEAD
  `69cc1f0d4f9bc8bce8f9cef48814fbd0e14f6d0c`.
- **Coordinator reference:** `.worktrees/s4-phase-c`, branch
  `feat/s4-c-stackable-identity-integration`, exact HEAD
  `69cc1f0d4f9bc8bce8f9cef48814fbd0e14f6d0c`.
- **Observed runtime:** Node `v22.18.0`; pnpm `11.7.0`; Vitest `4.1.10`;
  Wrangler `4.127.1`; Playwright `1.62.1`; TypeScript `5.9.3`; direct web
  Miniflare `5.20260828.0-alpha`; transitive Miniflare
  `5.20260730.0-alpha` under Wrangler `4.118.0` /
  `@cloudflare/vitest-pool-workers@0.20.1`; pinned Chrome for Testing
  `151.0.7922.34` (Playwright Chromium revision `v1234`).

### Required Context7 CLI lookups

The required lookups used the Context7 CLI (`npx --yes ctx7@latest`), not MCP
Context7, before validation:

- `/radix-ui/primitives` — Switch Root source section: button with
  `role="switch"`, `aria-checked`, `disabled`/`data-disabled`, `data-state`,
  and click/`onCheckedChange` behavior.
- `/joe-bell/cva` — cva API and variant-configuration sections: base classes,
  variants, defaults, compound variants, composition, and type-safe props.
- `/microsoft/playwright` — `Locator.boundingBox`, locator focus/press, and
  `test.webServer` sections: viewport-relative CSS-pixel rectangles and
  keyboard/focus assertions.
- `/cloudflare/workers-sdk` — D1 prepared statements and `db.batch()` section:
  `prepare`/`bind` statements collected into an atomic batch.

### Focused checks and exact current results

#### Worker identity Account Access, handlers, schema, and role hierarchy

```text
$ pnpm --dir web exec vitest run --config vitest.config.ts \
    lib/identity/account-access.test.ts \
    lib/identity/account-access-handlers.test.ts \
    lib/identity/d1-schema.test.ts \
    lib/identity/role-hierarchy.test.ts

Test Files  4 passed (4)
Tests       86 passed (86)
exit 0
```

**PASS — 86/86 assertions.** This disposable local D1 run covered eligible
Active/non-Admin filtering, safe/private-field projection, mixed-scope
privacy, baseline access, atomic multi-identity assignment, invalid-batch
rollback, active duplicate no-op/replay, immutable revoke/re-add history,
archive/restore without assignment recreation, effective-access provenance,
authorization before target disclosure, response-loss replay, audit
correlation/reasons, schema constraints, and changed-intent idempotency
rejection. No remote, Apps Script, Google Sheets, Cloudflare production, or
other external database write was made.

#### Account Access/API/directory/role-hierarchy/Department/Programs components

```text
$ pnpm --dir web exec vitest run --config vitest.components.config.ts \
    lib/account-access-panel.test.tsx \
    lib/account-access-api.test.ts \
    lib/account-directory-panel.test.tsx \
    lib/identity/role-hierarchy-panel.test.tsx \
    lib/programs/department-settings-panel.test.tsx \
    lib/programs/programs-leaders-panel.test.tsx

Test Files  6 passed (6)
Tests       74 passed (74)
exit 0
```

**PASS — 74/74 assertions.** The direct component run covered Account Access
scope-group rendering, role-first and account-first links, zero-assignment
role entry, server-authorized picker output, add/revoke review, canonical
URLs, route-state reset, DirectoryFrame retry/focus recovery, one live-region
owner, persistent retry idempotency keys, concrete scope/history labels,
Account Directory behavior, Role Hierarchy behavior, and affected Department
Settings / Programs Leaders states.

#### Worker/web TypeScript

```text
$ pnpm --dir web exec tsc --noEmit -p tsconfig.worker.json && \
    pnpm --dir web exec tsc --noEmit -p tsconfig.json
(no output)
exit 0
```

**PASS —** both requested TypeScript projects exited 0.

#### Web production build and route count

```text
$ pnpm --dir web build
✓ Compiled successfully
✓ Generating static pages using 9 workers (18/18)
○ (Static) prerendered as static content
exit 0
```

**PASS — 18 static routes.** The emitted visible route table contained `/`,
`/_not-found`, `/events`, `/guest-check-in`, `/home`, `/management`,
`/messages`, `/notices`, `/permissions`, `/profile`, `/profile/settings`,
`/programs`, `/prototype`, `/register`, `/registrations`, and `/scanner`.
Existing workspace-root/multiple-lockfile, no-cache, telemetry, and
`NO_COLOR`/`FORCE_COLOR` notices did not fail the build.

#### Shared W7 numeric geometry

```text
$ pnpm test:role-hierarchy-geometry
Running 49 tests using 1 worker
49 passed (47.8s)
exit 0
```

**PASS — 49/49 numeric tests.** The shared config matched Account Access,
Permission Editor, and Role Hierarchy geometry at W7
`320, 390, 600, 799, 800, 1024, 1440` CSS px. Account Access contributed
14/14 tests; the total was 14 Permission Editor + 14 Account Access + 21
Role Hierarchy. Numeric checks covered containment/no horizontal overflow,
44px app-facing Button/Switch targets, phone-dock clearance, the 84px phone
reserve, the fixed-to-sticky 799px/800px transition, and the Account Access
add-review surface. No screenshot, image snapshot, or pixel-diff test was
used.

### Required #486 regression coverage

- **Mixed-scope privacy:** Worker tests
  `keeps mixed-scope targets eligible while filtering out-of-scope access`
  and `keeps targets with only out-of-scope assignments eligible with baseline
  access` keep eligible targets visible while excluding unauthorized
  Department/Program assignments and labels from the projection.
- **Role route refetch:** component test
  `refetches hierarchy and clears the previous role when role definition
  changes` refetches the hierarchy, removes the old role detail, and renders
  the new role.
- **Route-generation guards:** `AccountAccessPanel` source uses a route key
  and generation guard for hierarchy/search, add/revoke mutations, lifecycle
  previews, and post-lifecycle refreshes. Component tests
  `ignores an in-flight add response after the account route changes` and
  `clears account-scoped selection and dialogs when the account route changes`
  directly exercise stale-route suppression.
- **Grant audit reason:** the Worker assertion reads the grant audit row and
  requires `reason = "account_access_grant"`; the existing revoke assertion
  requires `reason = "account_access_revoke"`.
- **Lifecycle refresh failure:** component test
  `preserves lifecycle success when the follow-up account refresh fails`
  exercises a successful archive followed by a failed refresh and verifies
  that the lifecycle success remains visible without leaking the raw refresh
  error. The source path exposes a generic refresh retry action.
- Prior #486 contracts remain covered by the current runs: eligible picker,
  atomic one-account multi-identity add, invalid whole-batch rejection,
  duplicate no-op, revoke/history/re-add, lost/retained scoped access and
  provenance, archive revocation, restore with preserved history/grants but
  no assignment recreation, request/envelope/correlation behavior, and
  identity-first/account-first navigation.

### Historical-count distinction, manual gates, and scope

The earlier `## #486 corrected focused evidence — 2026-08-29` section at
`ffb2999acfbda35a62cb2fed37202f785927a79e` remains **historical** and reported
77/77 Worker assertions and 62/62 component assertions. The earlier
`## #486 final corrected revalidation — 2026-08-30` section at
`32829092668e16a5c46a92f13e6c0354450de0a9` remains **historical** and reported
84/84 Worker assertions and 71/71 component assertions. Neither historical
count is reused for this current `69cc1f0d` result.

`C-486-M1` keyboard-only and `C-486-M2` screen-reader review remain
**MANUAL — unclaimed**, as do reduced-motion, forced-colors, 200% zoom/
text-spacing, real-device dock/safe-area, remote-CI, and
production-promotion checks. No manual accessibility, WCAG, screenshot,
image, or pixel-diff claim is made. The historical #485 Permission Editor
Cloudflare-pool `EvalError: Code generation from strings disallowed for this
context` remains external/separate; it is not part of this #486 run, and no
unsafe-eval bypass was used.

Only `docs/specs/s4-phase-c-acceptance-trace.md` is changed by this append.
No source, test, migration, schema, fixture, geometry config, deployment,
external database, or **#487 path** changed. The branch remains stopped before
Phase D.

## #486 post-additional-correction revalidation — 2026-08-30

**Evidence scope:** fresh focused revalidation of the additional #486 Account Access and identity-lifecycle corrections at coordinator HEAD `6e854fd671c16701642e5b114545d18396470a51` (`fix(identity): close remaining account access review findings`). The child was created from that exact commit, not from coordinator working-tree changes. This is one evidence-only append; every earlier trace row and evidence section remains unchanged.

### Authority reread before checks

Before running Context7 or any validation command, I reread implementation ticket `issue://486`, parent `issue://475`, authoritative Specs `docs/specs/091-stackable-identity-backend.md` and `docs/specs/092-discord-identity-design-system-adoption.md`, approved `local://s4-phase-c-identity-integration-plan.md`, the full current `docs/specs/s4-phase-c-acceptance-trace.md`, ADR `docs/adr/0042-discord-like-stackable-role-model.md`, ADR `docs/adr/0043-owned-civic-design-system-governance.md`, and prior full reports `agent://ReviewLast486` and `agent://ReviewFinal486B`. The implementation and spec tickets were read before validation. The prior reports supplied the additional correction targets; no source or test change was made in this evidence child.

### Provenance and exact runtimes

- **Fresh child:** `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/s4-c-486-revalidation-final`, branch `evidence/s4-c-486-revalidation-final`, created from exact coordinator HEAD `6e854fd6`.
- **Coordinator reference:** `.worktrees/s4-phase-c`, branch `feat/s4-c-stackable-identity-integration`, exact HEAD `6e854fd671c16701642e5b114545d18396470a51`.
- **Observed runtime:** Node `v22.18.0`; pnpm `11.7.0`; Vitest `4.1.10`; Wrangler `4.127.1`; Playwright `1.62.1`; TypeScript `5.9.3`; direct web Miniflare `5.20260828.0-alpha`; transitive Miniflare `5.20260730.0-alpha` under `@cloudflare/vitest-pool-workers@0.20.1` / Wrangler `4.118.0`; pinned Chrome for Testing `151.0.7922.34` (Playwright Chromium revision `v1234`).

### Required Context7 CLI library and docs lookups

The required lookups used the Context7 CLI (`npx --yes ctx7@latest`), not MCP Context7, before validation:

- `/radix-ui/primitives` — Switch Root source sections, including “Switch Root renders button with data-state” and “Switch.Root props and ref forwarding”: `role="switch"`, `aria-checked`, `disabled`/`data-disabled`, `data-state`, and click/`onCheckedChange` behavior.
- `/joe-bell/cva` — “Component composition pattern”, “Implement component variants with cva”, and “Validate Types at Compile-Time”: base classes, variants/defaults/compound variants, composition, and type-safe props.
- `/microsoft/playwright` — `Locator.boundingBox([options])`, `Page.setViewportSize`, locator focus/press, and `test.webServer`: viewport-relative CSS-pixel rectangles and keyboard/focus assertions.
- `/cloudflare/workers-sdk` — “D1 batch transactions with prepared statements” and “D1 prepared statements + db.batch() user-facing pattern”: prepared `bind()` statements collected into an atomic `db.batch()` call.

### Focused checks and exact current results

#### Worker identity Account Access, handlers, schema, and role hierarchy

```text
$ pnpm --dir web exec vitest run --config vitest.config.ts lib/identity/account-access.test.ts lib/identity/account-access-handlers.test.ts lib/identity/d1-schema.test.ts lib/identity/role-hierarchy.test.ts

Test Files  4 passed (4)
Tests       89 passed (89)
exit 0
```

**PASS — 89/89 assertions.** The disposable local D1 run covered eligible Active/non-Admin filtering, safe/private-field projection, mixed-scope privacy, automatic baseline access, atomic multi-identity assignment, invalid-batch rollback, active duplicate no-op/replay, immutable revoke/re-add history, archive/restore without assignment recreation, effective-access provenance, authorization before target disclosure, response-loss replay, complete audit summaries and reasons/correlation, `DENIED` outcomes, protected-schema constraints, and changed-intent idempotency rejection. No remote, Apps Script, Google Sheets, Cloudflare production, or other external database write was made.

#### Account Access/API/directory/role-hierarchy/Department/Programs components

```text
$ pnpm --dir web exec vitest run --config vitest.components.config.ts lib/account-access-panel.test.tsx lib/account-access-api.test.ts lib/account-directory-panel.test.tsx lib/identity/role-hierarchy-panel.test.tsx lib/programs/department-settings-panel.test.tsx lib/programs/programs-leaders-panel.test.tsx

Test Files  6 passed (6)
Tests       78 passed (78)
exit 0
```

**PASS — 78/78 assertions.** The direct component run covered Account Access scope groups, role-first and account-first links, zero-assignment role entry, server-authorized picker output, atomic add/revoke review, authoritative revoke-preview refresh, lifecycle impact review, canonical URLs, route-state reset, DirectoryFrame retry/focus recovery, one visible live-region owner, persistent retry idempotency keys, concrete scope/history labels, Account Directory behavior, Role Hierarchy behavior, and affected Department Settings / Programs Leaders states.

#### Worker/web TypeScript

```text
$ pnpm --dir web exec tsc --noEmit -p tsconfig.worker.json && pnpm --dir web exec tsc --noEmit -p tsconfig.json
(no output)
exit 0
```

**PASS —** both requested TypeScript projects exited 0.

#### Web production build and route count

```text
$ pnpm --dir web build
✓ Compiled successfully
✓ Generating static pages using 9 workers (18/18)
○ (Static) prerendered as static content
exit 0
```

**PASS — 18 static routes.** The emitted visible route table contained `/`, `/_not-found`, `/events`, `/guest-check-in`, `/home`, `/management`, `/messages`, `/notices`, `/permissions`, `/profile`, `/profile/settings`, `/programs`, `/prototype`, `/register`, `/registrations`, and `/scanner`. Existing workspace-root/multiple-lockfile, no-cache, telemetry, and `NO_COLOR`/`FORCE_COLOR` notices did not fail the build.

#### Shared W7 numeric geometry

```text
$ pnpm test:role-hierarchy-geometry
$ playwright test --config=tests/e2e/role-hierarchy-geometry.config.ts
Running 49 tests using 1 worker
49 passed (32.4s)
exit 0
```

**PASS — 49/49 numeric tests.** This fresh full run exited 0; the prior correction worker’s partial timeout after 8/49 is not reused. The shared config matched Account Access, Permission Editor, and Role Hierarchy geometry at W7 `320, 390, 600, 799, 800, 1024, 1440` CSS px. Account Access contributed 14/14 tests; the total was 14 Permission Editor + 14 Account Access + 21 Role Hierarchy. Numeric checks covered containment/no horizontal overflow, 44px app-facing Button/Switch targets, phone-dock clearance, the 84px phone reserve, the fixed-to-sticky `799px`/`800px` transition, and the Account Access add-review surface. No screenshot, image snapshot, or pixel-diff test was used. No current geometry blocker occurred.

### Additional-correction regression coverage

- **`role.delete`-only lifecycle impact:** Worker test `computes lifecycle impact for a role.delete-only actor` directly verifies lost Department access and retained Global `會友基礎` access before archive. The lifecycle action therefore uses the authoritative impact projection rather than an assignment-management projection.
- **Identity-first auth/error focus:** component tests `focuses identity-first alert after initial and retry failures` and `focuses identity-first detail and exposes retryable hierarchy errors` verify the initial and retry error state focus target. Test `hands identity-first AUTH_REQUIRED through the shared deep-link redirect` verifies authentication failure leaves the retry surface and calls the deep-link handoff.
- **Exact scope/position search and projections:** Worker tests `keeps mixed-scope targets eligible while filtering out-of-scope access`, `searches identity metadata within exact lower role scope`, and `keeps targets with only out-of-scope assignments eligible with baseline access` verify lower-position, exact-scope identity metadata and effective-access filtering. The mixed fixture assigns the scoped actor Department position `10` and the target both that equal-position Department identity and a Program position `20`; both equal/highest and above-highest identities are absent from the scoped projection and picker while the target remains eligible with baseline access.
- **Refresh sequencing and route generations:** component tests `ignores an older lifecycle refresh on the same route`, `ignores an in-flight add response after the account route changes`, and `clears account-scoped selection and dialogs when the account route changes` verify superseded refreshes and stale mutation responses cannot overwrite a newer account/role route. `preserves lifecycle success when the follow-up account refresh fails` keeps a committed lifecycle result successful while exposing generic refresh recovery.
- **Complete audit state and `DENIED` outcomes:** Worker test `records complete authoritative assignment summaries` compares full authoritative assignment IDs in grant/revoke `old_value_json`/`new_value_json`, including hidden assignments. Unauthorized absent-revoke and active-duplicate tests require `ROLE_FORBIDDEN` and `role_audit_events.outcome = "DENIED"`; invalid input remains `REJECTED`, active duplicate no-op remains `DUPLICATE`, and successful grant/revoke reasons are `account_access_grant` / `account_access_revoke`.
- **Archived-only restore:** Worker test `preserves assignment scope snapshot after role rescope and revoke history` confirms an active role with revoked assignment history is not offered in `restoreRoleDefinitionIds`; handler/lifecycle tests confirm assignment to an archived role returns `ROLE_ARCHIVED`, archive revokes live assignments, and restore preserves history/grants without recreating assignments.
- **Above-highest hiding:** The mixed-scope projection and exact-lower-scope picker assertions above directly exclude the actor’s equal-position Department identity and the target’s position-20 Program identity, while retaining the lower-position in-scope identity and automatic baseline.
- **Auth deep-link:** Account Access and identity-first component tests `remembers the Account Access deep link before auth redirect` and `hands identity-first AUTH_REQUIRED through the shared deep-link redirect` verify the exact pathname/query/hash is remembered before replacing the route with `/`.
- **Prior #486 contracts:** The current Worker and component runs continue to cover the eligible-account picker, Active/non-Admin/self/protected target rules, atomic one-account multi-identity add, whole-batch invalid rollback, duplicate no-op and replay, revoke/history/re-add, lost/retained effective access grouped by Global/Department/Program with grant provenance, archive revocation, restore with preserved history/grants but no assignment recreation, exact request/body/envelope/`X-Request-Id`/correlation and actor-bound idempotency semantics, privacy-safe projections, and identity-first/account-first navigation.

### Historical-count distinction, manual gates, upstream separation, and scope

The earlier `## #486 corrected focused evidence — 2026-08-29` section at `ffb2999acfbda35a62cb2fed37202f785927a79e` remains **historical** and reported 77/77 Worker assertions and 62/62 component assertions. The earlier `## #486 final corrected revalidation — 2026-08-30` section at `32829092668e16a5c46a92f13e6c0354450de0a9` remains **historical** and reported 84/84 Worker assertions and 71/71 component assertions. The earlier `## #486 final revalidation — 2026-08-30` section at `69cc1f0d4f9bc8bce8f9cef48814fbd0e14f6d0c` remains **historical** and reported 86/86 Worker assertions and 74/74 component assertions. None of those historical counts is reused for this current `6e854fd6` result.

`C-486-M1` keyboard-only and `C-486-M2` screen-reader review remain **MANUAL — unclaimed**, as do reduced-motion, forced-colors, 200% zoom/text-spacing, real-device dock/safe-area, remote-CI, and production-promotion checks. No manual accessibility, WCAG, screenshot, image, or pixel-diff claim is made. The historical #485 Permission Editor Cloudflare-pool `EvalError: Code generation from strings disallowed for this context` remains external/separate; it is not part of this #486 run, and no unsafe-eval bypass was used.

Only `docs/specs/s4-phase-c-acceptance-trace.md` is changed by this append. No source, test, migration, schema, fixture, geometry config, deployment, external database, or **#487 path** changed. This child remains stopped before Phase D. The doc-only evidence commit SHA is returned with delivery.
## #486 final post-cache/recovery revalidation — 2026-08-30

**Evidence scope:** fresh focused revalidation of the corrected #486 Account Access and identity-lifecycle implementation at exact coordinator HEAD `b6fbe45bebdba8fcb8c97e1fd44cb5adc556801c` (`fix(identity): close final account access findings`). The child was created from that exact commit, not from coordinator working-tree changes. This is one evidence-only append; every earlier trace row and evidence section remains unchanged.

### Authority reread before checks

Before running Context7 or any validation command, I reread implementation ticket `issue://486`, parent `issue://475`, authoritative Specs `docs/specs/091-stackable-identity-backend.md` and `docs/specs/092-discord-identity-design-system-adoption.md`, approved `local://s4-phase-c-identity-integration-plan.md`, the full current `docs/specs/s4-phase-c-acceptance-trace.md`, ADR `docs/adr/0042-discord-like-stackable-role-model.md`, ADR `docs/adr/0043-owned-civic-design-system-governance.md`, and full prior reports `agent://ReviewAdd486` and `agent://ReviewLast486`. The implementation and both spec tickets were read before validation.

### Provenance and exact runtimes

- **Fresh child:** `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/s4-c-486-final-cache-revalidation`, branch `evidence/s4-c-486-final-cache-revalidation`, created from exact coordinator HEAD `b6fbe45b`.
- **Coordinator reference:** `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/s4-phase-c`, branch `feat/s4-c-stackable-identity-integration`, exact HEAD `b6fbe45bebdba8fcb8c97e1fd44cb5adc556801c`.
- **Observed runtime:** Node `v22.18.0`; pnpm `11.7.0`; Vitest `4.1.10`; Wrangler `4.127.1`; Playwright `1.62.1`; TypeScript `5.9.3`; `@cloudflare/vitest-pool-workers` `0.20.1`; direct web Miniflare package `5.20260828.0-alpha`; pinned Chrome for Testing `151.0.7922.34` (Playwright Chromium revision `v1234`).

### Required Context7 CLI library and docs lookups

The required lookups used the Context7 CLI (`npx --yes ctx7@latest`), not MCP Context7, before validation:

- `/radix-ui/primitives` — `Switch Root renders button with data-state`: `role="switch"`, `aria-checked`, `disabled`/`data-disabled`, `data-state`, and click/`onCheckedChange` behavior.
- `/joe-bell/cva` — `Component composition pattern`, `Implement component variants with cva`, and `Validate Types at Compile-Time`: base classes, variants/defaults/compound variants, composition, and type-safe props.
- `/microsoft/playwright` — `Locator.boundingBox([options])` and `Page.setViewportSize`: viewport-relative CSS-pixel rectangles and explicit CSS-pixel viewport sizing.
- `/cloudflare/workers-sdk` — `D1 batch transactions with prepared statements` and `D1 prepared statements + db.batch() user-facing pattern`: prepared `bind()` statements collected into an atomic `db.batch()` call.
- `/llmstxt/developers_cloudflare_d1_llms-full_txt` — `D1Database::batch()` and `Batch D1 Statements`: prepared statements execute sequentially within one transaction/batch.

### Focused checks and exact current results

#### Worker identity Account Access, handlers, schema, and role hierarchy

```text
$ pnpm --dir web exec vitest run --config vitest.config.ts lib/identity/account-access.test.ts lib/identity/account-access-handlers.test.ts lib/identity/d1-schema.test.ts lib/identity/role-hierarchy.test.ts

Test Files  4 passed (4)
Tests       90 passed (90)
exit 0
```

**PASS — 90/90 assertions.** This disposable local D1 run covered eligible Active/non-Admin filtering, safe/private-field projection, mixed-scope privacy, automatic baseline access, atomic multi-identity assignment, invalid-batch rollback, active duplicate no-op/replay, immutable revoke/re-add history, archive/restore without assignment recreation, effective-access provenance, authorization before target disclosure, response-loss replay, complete duplicate and authoritative assignment summaries, audit reasons/correlation and `DENIED` outcomes, protected-schema constraints, and changed-intent idempotency rejection. No remote, Apps Script, Google Sheets, Cloudflare production, or other external database write was made.

#### Account Access/API/directory/DirectoryFrame/role-hierarchy/Department/Programs components

```text
$ pnpm --dir web exec vitest run --config vitest.components.config.ts lib/account-access-panel.test.tsx lib/account-access-api.test.ts lib/account-directory-panel.test.tsx lib/directory-frame.test.tsx lib/identity/role-hierarchy-panel.test.tsx lib/programs/department-settings-panel.test.tsx lib/programs/programs-leaders-panel.test.tsx

Test Files  7 passed (7)
Tests       93 passed (93)
exit 0
```

**PASS — 93/93 assertions.** The required direct component run covered Account Access scope groups, role-first and account-first links, zero-assignment role entry, server-authorized picker output, atomic add/revoke review, authoritative revoke-preview refresh, lifecycle impact review, canonical URLs, route-state reset, DirectoryFrame retry/focus recovery, one visible live-region owner, persistent retry idempotency keys, concrete scope/history labels, Account Directory behavior, Role Hierarchy behavior, and affected Department Settings / Programs Leaders states.

#### Worker/web TypeScript

```text
$ pnpm --dir web exec tsc --noEmit -p tsconfig.worker.json && pnpm --dir web exec tsc --noEmit -p tsconfig.json
(no output)
exit 0
```

**PASS —** both requested TypeScript projects exited 0.

#### Web production build and route count

```text
$ pnpm --dir web build
✓ Compiled successfully
✓ Generating static pages using 9 workers (18/18)
○ (Static) prerendered as static content
exit 0
```

**PASS — 18 generated static pages (16 visible app routes).** The emitted visible route table contained `/`, `/_not-found`, `/events`, `/guest-check-in`, `/home`, `/management`, `/messages`, `/notices`, `/permissions`, `/profile`, `/profile/settings`, `/programs`, `/prototype`, `/register`, `/registrations`, and `/scanner`; the remaining generated pages are the Next global-error and favicon entries. Existing workspace-root/multiple-lockfile, no-cache, telemetry, and `NO_COLOR`/`FORCE_COLOR` notices did not fail the build.

#### Shared W7 numeric geometry

```text
$ pnpm test:role-hierarchy-geometry
$ playwright test --config=tests/e2e/role-hierarchy-geometry.config.ts
Running 49 tests using 1 worker
49 passed (33.0s)
exit 0
```

**PASS — 49/49 numeric tests.** The shared config matched Account Access, Permission Editor, and Role Hierarchy geometry at W7 `320, 390, 600, 799, 800, 1024, 1440` CSS px. Account Access contributed 14/14 tests; the total was 14 Permission Editor + 14 Account Access + 21 Role Hierarchy. Numeric checks covered containment/no horizontal overflow, 44px app-facing Button/Switch targets, phone-dock clearance, the 84px phone reserve, the fixed-to-sticky `799px`/`800px` transition, and the Account Access add-review surface. No screenshot, image snapshot, or pixel-diff test was used.

### Final correction coverage

- **Actor-specific no-store GETs:** `accountFetch` applies `cache: "no-store"` to every GET, and `roleFetch` applies the same policy to role-hierarchy GETs. `account-access-api.test.ts` directly asserts the account search GET and role-hierarchy GET request options, while the shared transport covers account detail, lifecycle preview, and all other Account Access GETs.
- **All Account Access auth-expiry deep-link branches:** component tests cover initial account load, identity-first hierarchy load, eligible-account search, revoke preview, lifecycle preview, add mutation, revoke mutation, lifecycle mutation, and lifecycle refresh. Each remembers the exact pathname/query/hash through the shared deep-link seam before replacing the route with `/`. Account Directory list/detail auth-expiry tests cover the adjacent directory entry path.
- **Complete duplicate audit summaries:** Worker tests `records complete state for duplicate assignment audits` and `records complete authoritative assignment summaries` compare complete authoritative assignment-ID sets in both `old_value_json` and `new_value_json`, including assignments hidden from a scoped returned projection. Authorized duplicate no-ops retain `DUPLICATE`; unauthorized duplicate/absent-revoke attempts retain canonical `ROLE_FORBIDDEN` with `DENIED`; invalid input remains `REJECTED`.
- **Archived-role restore deduplication:** the component test `renders one restore action per archived role definition` supplies repeated revoked history and asserts exactly one restore action. Worker coverage also confirms an active Role Definition with revoked history is not offered as restorable, while archive/restore preserves grants/history and recreates no assignment.
- **Account Directory Back focus:** `account-directory-panel.test.tsx` test `restores focus to the Account Access source action on Back` asserts the originating `查看帳戶權限與身份組` control is focused after returning to the directory route.
- **Prior #486 contracts:** the current runs continue to cover eligible Active/non-Admin/self/protected target rules, atomic one-account multi-identity add, whole-batch invalid rollback, duplicate no-op and replay, revoke/history/re-add, lost/retained Effective Permission grouped by Global/Department/Program with grant provenance, archive revocation, restore with preserved history/grants but no assignment recreation, exact request/body/envelope/`X-Request-Id`/correlation and actor-bound idempotency semantics, privacy-safe projections, and identity-first/account-first navigation.

### Historical-count distinction, manual gates, upstream separation, and scope

The earlier `## #486 corrected focused evidence — 2026-08-29` section at `ffb2999acfbda35a62cb2fed37202f785927a79e` remains **historical** and reported 77/77 Worker assertions and 62/62 component assertions. The earlier `## #486 final corrected revalidation — 2026-08-30` section at `32829092668e16a5c46a92f13e6c0354450de0a9` remains **historical** and reported 84/84 Worker assertions and 71/71 component assertions. The earlier `## #486 final revalidation — 2026-08-30` section at `69cc1f0d4f9bc8bce8f9cef48814fbd0e14f6d0c` remains **historical** and reported 86/86 Worker assertions and 74/74 component assertions. The earlier `## #486 post-additional-correction revalidation — 2026-08-30` section at `6e854fd671c16701642e5b114545d18396470a51` remains **historical** and reported 89/89 Worker assertions and 78/78 component assertions. None of those historical counts is reused for this current `b6fbe45b` result; the current component count includes the explicitly required `directory-frame.test.tsx`.

`C-486-M1` keyboard-only and `C-486-M2` screen-reader review remain **MANUAL — unclaimed**, as do reduced-motion, forced-colors, 200% zoom/text-spacing, real-device dock/safe-area, remote-CI, and production-promotion checks. No manual accessibility, WCAG, screenshot, image, or pixel-diff claim is made. The historical #485 Permission Editor Cloudflare-pool `EvalError: Code generation from strings disallowed for this context` remains external/separate; it is not part of this #486 run, and no unsafe-eval bypass was used.

Only `docs/specs/s4-phase-c-acceptance-trace.md` is changed by this append. No source, test, migration, schema, fixture, geometry config, deployment, external database, or **#487 path** changed. This child remains stopped before Phase D.