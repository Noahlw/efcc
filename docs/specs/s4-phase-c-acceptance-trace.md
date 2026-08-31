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
| C-486-02 | One account can receive several lower identities in one atomic `applyRoleMutation` batch; all additions commit or none; duplicate active assignments are no-ops without duplicate rows/events. | `POST /api/v1/identity/accounts/:userId/assignments` with `{ base_revision, role_definition_ids: [<id1>, <id2>, <id3>] }` where one of the IDs is already active for that account. | Staff with `role.assign` and the Staff fixture `E2E_DISPOSABLE_STAFF` as the target on disposable D1. | HTTP `200` returns `AccountAccessView` with `data.idempotent: false`, `duplicateRoleDefinitionIds: [<alreadyActiveId>]`; D1 shows one new active row per added identity and no duplicate row for the already-active identity; the already-active identity is treated as an idempotent no-op under the canonical Spec 091 §9.3 `ROLE_ASSIGNMENT_DUPLICATE` code (the projection reports it in `duplicateRoleDefinitionIds` and the Worker does not write a second assignment row, a second `assignment_id`, or a second audit event for it); one atomic SUCCESS audit row + one terminal idempotency result for the whole batch; the new `assignment_id` is fresh for every re-add; no partial state on any failure; `X-Request-Id` matches `body.requestId`; a same actor/key/fingerprint replay returns the stored terminal response with `data.idempotent: true`. | Server state; atomic-batch state; duplicate no-op state; replay state. | Worker/D1 seam `web/lib/identity/account-access.test.ts` (multi-identity atomic success, `ROLE_ASSIGNMENT_DUPLICATE` no-op, fresh assignment_id, no duplicate row/event) + handler seam `web/lib/identity/account-access-handlers.test.ts`. | #486 Worker/D1 lane | Human reviewer — manual gate pending where applicable; automation PENDING |
| C-486-03 | Pending/Suspended/Inactive/Admin/self/out-of-scope/above-highest/unknown targets are rejected server-side; one invalid identity rejects the whole batch; no assignment or revision partially changes. | Send one batch with one valid lower identity and one invalid identity (Pending/Suspended/Inactive/Admin target, out-of-scope Department, above-highest position, or unknown `role_definition_id`); also send a self-target (`account_user_id === actor_user_id`). | Staff with `role.assign` and lower-position Staff fixture; Admin `E2E_DISPOSABLE_ADMIN`; suspended/inactive fixtures; above-highest fixed Role Definition. | All invalid-batch attempts return the named 403/422 Problem Details (`ROLE_TARGET_INELIGIBLE` for Pending/Suspended/Inactive; `ROLE_ADMIN_PROTECTED` for Admin target; `ROLE_HIGHEST_PROTECTED` when the self-target is the actor's highest/protected identity and `ROLE_FORBIDDEN` for any other self-target — no separate self code is invented; `ROLE_SCOPE_MISMATCH` for out-of-scope Department; `ROLE_HIGHEST_PROTECTED` for above-highest position; `ROLE_NOT_FOUND` for an unknown `role_definition_id`; `ROLE_ARCHIVED` for an assignment to an archived identity); no assignment or revision row is written; one REJECTED audit row. | Server state; one-invalid-rejects-all state. | Worker/D1 seam `web/lib/identity/account-access.test.ts` (target filtering, batch rollback) + `web/lib/identity/role-hierarchy.test.ts` (typed error vocabulary) + handler seam `web/lib/identity/account-access-handlers.test.ts`. | #486 Worker/D1 lane | Human reviewer — manual gate pending where applicable; automation PENDING |
| C-486-04 | Revoke writes immutable assignment history rather than deleting; re-adding after revoke inserts a new assignment event, preserves the old revoked row, and records normalized audit/replay behavior. | Revoke an active assignment via the same assignments endpoint with `role_definition_ids: []` (or the dedicated revoke path); then re-add the same identity; then replay the same revoke idempotency key. | Staff with `role.revoke` and the Staff fixture `E2E_DISPOSABLE_STAFF` as the target on disposable D1. | Revoke inserts one immutable `role_assignments_history` row (or normalized equivalent) with `revoked_at`, `revoked_by`, `revoked_reason`; the original assignment row is preserved (or tombed with `is_active = 0`); re-add inserts a new `assignment_id`; the revoked history row remains; one SUCCESS audit row per state change; the first revoke response exposes `data.idempotent: false`, and the same actor/key/fingerprint replay exposes `data.idempotent: true` with the stored revoke result and no second audit. | Server state; revoke state; re-add state; replay state. | Worker/D1 seam `web/lib/identity/account-access.test.ts` (immutable revoke history, re-add new event) + `web/lib/identity/mutations.test.ts` (assignment audit + idempotency). | #486 Worker/D1 lane | Human reviewer — manual gate pending where applicable; automation PENDING |
| C-486-05 | Revoke/archive review groups lost and retained Effective Permission by Global/Department/Program scope and identifies grant provenance without leaking credentials or unrelated accounts. | Render Account Access for a target that holds a Global identity, a Department identity (成區), and a Program identity (青少年查經); revoke one identity at a time and observe the impact; archive one of the holder Role Definitions (authorized by `role.delete`). | Staff with `role.revoke`/`role.delete` and the Staff fixture `E2E_DISPOSABLE_STAFF`; Department/Program fixtures; archive candidate from #486. | `AccountAccessView.effectiveAccess` is grouped by `Global`, `Department`, `Program`; each effective grant lists every contributing identity label and `sources` (which Role Definitions grant it); automatic baseline (`program.enroll`) is always present; archive impact clearly groups lost and retained grants by scope, and the archived identity is labelled with `ROLE_ARCHIVED` in the impact view; no credential, token, phone, attendance, or pastoral data and no other account's assignments are shown. | W7 `320, 390, 600, 799, 800, 1024, 1440` CSS px; multi-scope view, revoke impact, archive impact. | Component seam `web/app/management/account-access-panel.test.tsx` (scope groups, provenance, archive impact) + Worker/D1 seam `web/lib/identity/account-access.test.ts` (effective access projection). | #486 client lane + #486 Worker/D1 lane | Human reviewer — manual gate pending where applicable; automation PENDING |
| C-486-06 | Archive atomically sets `is_archived`, revokes all live assignments, blocks new assignments, preserves grants/history, and records the authoritative lifecycle outcome; restore reactivates the definition and grants but no assignment. | `POST /api/v1/identity/role-definitions/:id/lifecycle` with `{ action: "archive", base_revision, reason }`; then try to assign it (expect rejection); then `{ action: "restore", base_revision, reason }`; then list assignments. | Staff with `role.delete` (the canonical archive/restore authority per Spec 091 §7.1) and the Staff fixture `E2E_DISPOSABLE_STAFF` as the target on disposable D1. | Archive: HTTP `200` returns the updated Role Definition with `is_archived = 1`; every active assignment for that definition is revoked in the same D1 transaction; new assignment attempts return `403 ROLE_ARCHIVED` (the canonical Spec 091 §9.3 code, not a noncanonical `ROLE_DEFINITION_ARCHIVED`); grants and revoked assignment history are preserved. Restore: HTTP `200` returns the restored definition with `is_archived = 0`; no assignment is recreated (assignments table count is unchanged from post-archive); grants are preserved. The restore is implemented as the lifecycle `restore` action under `role.delete`; it never recreates assignments. Each lifecycle call records one SUCCESS audit row and one terminal idempotency row; first calls expose `data.idempotent: false`, and same actor/key/fingerprint replays expose `data.idempotent: true` with the stored terminal response. | Server state; archive state; post-archive assignment attempt; restore state; replay state. | Worker/D1 seam `web/lib/identity/mutations.test.ts` (archive + restore via `applyRoleMutation` under `role.delete`) + `web/lib/identity/account-access.test.ts` (lifecycle HTTP, archive-blocked new assignments return `ROLE_ARCHIVED`) + handler seam `web/lib/identity/account-access-handlers.test.ts`. | #486 Worker/D1 lane | Human reviewer — manual gate pending where applicable; automation PENDING |
| C-486-07 | Identity-first and account-first entry links preserve focus, feedback, Back/history, safe URL state, 44px targets, dock clearance, and W7 geometry. | Navigate from `RoleHierarchyPanel` (identity-first) and `AccountDirectoryPanel` (account-first) into Account Access; use Back; reload the page; toggle dock. | Admin/Staff with `role.assign` and disposable fixtures including the Staff fixture. | Both entry links open `?module=accounts&account=<id>&view=access`; the source's focus is restored on Back; URL state is safe (unknown `account` or `view=access` falls back to the directory without an unintended selection); 44px app-facing targets, dock clearance, no horizontal overflow at W7 `320, 390, 600, 799, 800, 1024, 1440`; no 800px shell transition regression. | W7 `320, 390, 600, 799, 800, 1024, 1440` CSS px; identity-first entry, account-first entry, Back, reload. | Component seam `web/app/management/account-access-panel.test.tsx` (entry-link focus, Back, URL fallback) + `web/app/management/page.tsx` integration seam + geometry seam pinned Chromium Playwright (extend `tests/e2e/role-hierarchy-geometry.config.ts` if a new file is needed). | #486 client lane + #486 geometry lane | Human reviewer — manual gate pending where applicable; automation PENDING |

**Per-row #486 transport invariant:** Every Worker mutation row above (C-486-01 through C-486-06) asserts a request ID on success or Problem Details failure; successful responses use `{ requestId, data }`; `data.idempotent` is `false` for the first terminal result and `true` for a same actor/key/fingerprint replay; `X-Request-Id` matches the body request ID; `responseRequestId` remains transport-only and is not exposed inside `data`; every mutation that reaches the audit boundary records the same request ID in `role_audit_events.correlation_id`. Replays return the existing terminal result without a second audit event. The `POST /api/v1/identity/accounts/:userId/assignments` request body is exactly `{ base_revision: number, role_definition_ids: string[] }`; the `POST /api/v1/identity/role-definitions/:id/lifecycle` request body is exactly `{ action: "archive" | "restore", base_revision: number, reason?: string }`; the `account_user_id` and `role_definition_id` always come from the URL path; the actor identity is taken only from the cookie/session via `requireActor` and is never accepted from the request body. Canonical Spec 091 §9.3 codes are the only error vocabulary: `ROLE_ASSIGNMENT_DUPLICATE` (already-active identity, idempotent no-op), `ROLE_TARGET_INELIGIBLE` (Pending/Suspended/Inactive), `ROLE_ADMIN_PROTECTED` (Admin target), `ROLE_HIGHEST_PROTECTED` (self-targeting highest or above-highest), `ROLE_SCOPE_MISMATCH` (out-of-scope Department/Program), `ROLE_NOT_FOUND` (unknown role/capability), `ROLE_ARCHIVED` (assignment to archived identity), `ROLE_INVALID_TARGET` (empty target), `ROLE_INVALID_PARENT` (parent/category violates the tree), and `ROLE_FORBIDDEN` for the residual self-target case; no invented codes.

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
## #487 focused evidence — current head `4f1c7572`

**Evidence scope:** fresh focused evidence for #487 at coordinator HEAD
`4f1c7572b3296f29ea41aa321e1f259ff58f01ae`
(`test(#487): cover normalized authority cutover`). The child was created
from that exact coordinator commit as
`.worktrees/s4-c-487-evidence-authority` on branch
`evidence/s4-c-487-authority`; the coordinator worktree remained untouched.
This is a documentation-only append. No source, test, schema, migration,
seed, fixture, config, deployment, or #488/#489/Phase D path was changed.

### Authority reread before checks
**Ordering disclosure:** The authority reread and Context7 CLI commands did run
before the first validation commands, but the explicit authority/Context7 report
was emitted after those two commands in the session transcript. The
`normalized-authority-c487.test.ts` BLOCKED result and `sections.test.ts` 5/5
result are retained as out-of-order evidence; no subsequent claim relies on
that report sequencing, and both results remain classified exactly as observed.


Before Context7 or validation, I reread implementation ticket `issue://487`,
parent ticket `issue://475`, authoritative Specs
`docs/specs/091-stackable-identity-backend.md` and
`docs/specs/092-discord-identity-design-system-adoption.md`, approved
`local://s4-phase-c-identity-integration-plan.md` including Task 4 and its
exact obsolete-caller audit, the full current
`docs/specs/s4-phase-c-acceptance-trace.md`, ADRs
`docs/adr/0042-discord-like-stackable-role-model.md` and
`docs/adr/0043-owned-civic-design-system-governance.md`, the Phase B trace
`docs/specs/s4-phase-b-acceptance-trace.md`, Phase B evidence
`docs/qa/2026-08-28-s4-phase-b-foundation.md`, and
`agent://TestAuthority487`. The test worker report independently records the
same implementation/spec reread set and the prior #487 test commit.

### Runtime and required Context7 CLI lookup

Observed runtime: Node `v22.18.0`, pnpm `11.7.0`, Vitest `4.1.10`,
Wrangler `4.127.1`, Playwright `1.62.1`, TypeScript `5.9.3`, direct web
Miniflare `5.20260828.0-alpha` (the dependency graph also reports transitive
`5.20260730.0-alpha` under Wrangler `4.118.0` and
`@cloudflare/vitest-pool-workers@0.20.1`), and pinned Chrome for Testing
`151.0.7922.34` (Playwright Chromium revision `v1234`).

The required lookups used the Context7 CLI (`npx --yes ctx7@latest`), not MCP
Context7, before validation:

- `/cloudflare/workers-sdk` — `D1 batch transactions with prepared
  statements`, `D1 prepared statements + db.batch() user-facing pattern`,
  and `D1 binding, prepared statements, and query methods`: prepared
  `bind()` statements are collected into an atomic `db.batch()`.
- `/vitest-dev/vitest` — `Run Vitest with Specific File` and
  `expect(actual, message?)` / `expect.requireAssertions`: specific-file
  execution and explicit assertion APIs.
- `/microsoft/playwright` — `Locator.boundingBox([options])` and
  `Page.setViewportSize`: viewport-relative CSS-pixel rectangles and explicit
  CSS-pixel viewport sizing.

### Focused checks and exact results

| Check | Exact command / result |
| --- | --- |
| New normalized-authority Worker seam | `pnpm --dir web exec vitest run --config vitest.config.ts lib/auth/normalized-authority-c487.test.ts` — **exit 1, BLOCKED before assertions**; Cloudflare-pool startup raised `EvalError: Code generation from strings disallowed for this context`; `Test Files no tests`, `Tests no tests`, `Errors 1`, product assertions `0`. No unsafe-eval bypass. |
| Capability-driven sections component seam | `pnpm --dir web exec vitest run --config vitest.components.config.ts lib/sections.test.ts` — **exit 0**, 1 file, 5 tests passed. |
| Identity schema/seeds/hierarchy/handlers | `pnpm verify:identity` — **exit 0**, 4 files, 88 tests passed. This includes normalized seed invariants, protected anchors, preflight stale-schema/manual-reset detection, D1 constraints, and role-handler HTTP contracts. |
| Normalized identity resolver regression | `pnpm --dir web exec vitest run --config vitest.config.ts lib/identity/normalized-authority.test.ts` — **exit 1, BLOCKED before assertions** with the same external Cloudflare-pool `EvalError`; `Test Files no tests`, `Tests no tests`, `Errors 1`. |
| Programs Worker/domain seams | `pnpm --dir web exec vitest run --config vitest.config.ts lib/programs/programs.test.ts lib/programs/capabilities.test.ts lib/programs/account-directory.test.ts lib/programs/member-directory.test.ts lib/programs/hub-directory.test.ts` — **exit 0**, 5 files, 145 tests passed. |
| Attendance Worker seam | `pnpm --dir web exec vitest run --config vitest.config.ts lib/attendance-worker.test.ts` — **exit 0**, 1 file, 42 tests passed. |
| Auth Worker seam | `pnpm --dir web exec vitest run --config vitest.config.ts worker.auth.test.ts` — **exit 0**, 1 file, 47 tests passed. |
| Home/CMS Worker seams | `pnpm --dir web exec vitest run --config vitest.config.ts lib/home-worker.test.ts lib/home-cms-worker.test.ts` — **exit 0**, 2 files, 21 tests passed. |
| Bootstrap/management/directory components | Focused component invocation covering sections, Home, Management Hub, Account/Member Directory panels, app/profile settings, shell, Programs management boundary, and Event detail — **exit 0**, 10 files, 185 tests passed. |
| Programs components | Focused Programs component invocation across Events, enrollment, picker, boundary, directories, forms/settings, workspace, notifications, and participant surfaces — **exit 0**, 14 files, 204 tests passed. |
| Attendance/scanner components | Focused attendance/scanner component invocation — **exit 0**, 8 files, 76 tests passed. |
| Worker/web TypeScript | `pnpm --dir web exec tsc --noEmit -p tsconfig.worker.json && pnpm --dir web exec tsc --noEmit -p tsconfig.json` — **exit 0**, no output. |
| Web build | `pnpm --dir web build` — **exit 0**; Next generated `18/18` static pages. The emitted route table contained 16 visible routes: `/`, `/_not-found`, `/events`, `/guest-check-in`, `/home`, `/management`, `/messages`, `/notices`, `/permissions`, `/profile`, `/profile/settings`, `/programs`, `/prototype`, `/register`, `/registrations`, `/scanner`. Existing workspace-root/multiple-lockfile, no-cache, telemetry, and color notices did not fail the build. |
| W7 numeric geometry | `pnpm test:role-hierarchy-geometry` — **exit 0**, 49 tests passed, comprising 14 Account Access + 14 Permission Editor + 21 Role Hierarchy scenarios across `320, 390, 600, 799, 800, 1024, 1440` CSS px. Numeric evidence only; no screenshots, image snapshots, or pixel diffs. |

The component commands behind the grouped results were:

```text
$ pnpm --dir web exec vitest run --config vitest.components.config.ts \
    lib/sections.test.ts lib/home.test.tsx lib/management-hub.test.tsx \
    lib/account-directory-panel.test.tsx lib/member-directory-panel.test.tsx \
    lib/programs/programs-management-boundary.test.tsx \
    lib/programs/event-detail.test.tsx lib/shell/authenticated-shell.test.tsx \
    lib/account-settings.test.tsx lib/app.test.tsx
Test Files  10 passed (10); Tests 185 passed (185)

$ pnpm --dir web exec vitest run --config vitest.components.config.ts \
    lib/programs/programs-events-panel.test.tsx \
    lib/programs/programs-enrollment-panel.test.tsx \
    lib/programs/member-picker.test.tsx lib/programs/programs-boundary.test.tsx \
    lib/programs/participant-directory.test.tsx \
    lib/programs/management-directory.test.tsx lib/programs/program-form.test.tsx \
    lib/programs/program-settings.test.tsx lib/programs/program-workspace.test.tsx \
    lib/programs/programs-management-boundary.test.tsx \
    lib/programs/event-detail.test.tsx lib/programs/programs-notifications.test.tsx \
    lib/programs/participant-program-detail.test.tsx \
    lib/programs/participant-enrollment.test.tsx
Test Files  14 passed (14); Tests 204 passed (204)

$ pnpm --dir web exec vitest run --config vitest.components.config.ts \
    lib/attendance-panel.test.tsx lib/attendance-operator-panel.test.tsx \
    lib/attendance-roster.test.tsx lib/self-check-in-panel.test.tsx \
    lib/use-qr-camera.test.tsx lib/assisted-scanner-panel.test.tsx \
    lib/scanner-boundary.test.tsx lib/scanner-intent.test.ts
Test Files  8 passed (8); Tests 76 passed (76)
```

### Fresh local D1 migration, seed, and query proof

`pnpm --dir web exec wrangler d1 migrations apply efcc-identity --local`
applied all 25 versioned migrations successfully to the fresh child-local
D1. `pnpm db:seed:disposable` then completed its 6 seed commands
successfully. Queries against that same local database returned:

- `d1_migrations`: **25** applied migrations.
- E2E disposable accounts: **5**; seeded role definitions: **5**;
  normalized role grants: **39**; active disposable assignments: **4**.
- Role order/protection: `admin` position `0`, protected; `staff` position
  `1`; Department identity position `10` with its exact Department scope;
  Program identity position `20` with its exact Program scope; `member`
  position `999`, protected.
- The normalized table inventory contained all 7 expected identity tables
  (`role_categories`, `role_definitions`, `role_definition_grants`,
  `role_assignments`, `role_policy_revisions`, `role_policy_mutations`,
  `role_audit_events`); the legacy-table query returned **0 rows** for
  `role_capabilities`, `department_managers`, `program_leaders`,
  `permission_policy_state`, and `permission_policy_mutations`.
- `verify:identity` directly passed the preflight test that flags any retired
  authority table and never auto-drops it, plus seed idempotency/protected
  baseline assertions. No remote, Apps Script, Google Sheets, Cloudflare
  production, or other external database was written.

### Exact obsolete-token/symbol audit

The direct clean-tree search for
`role_capabilities|department_managers|program_leaders|permission_policy_state|permission_policy_mutations`
was scoped to `web/lib`, `web/app`, `web/worker.ts`, `web/migrations`, and
`tests`. No executable production authority hit remains. The only allowed
legacy-token exceptions are:

- `web/lib/identity/preflight.ts:16-21` — explicit stale-table names used by
  manual-reset detection;
- `web/lib/identity/d1-schema.test.ts:146-172` — stale-schema/no-auto-drop
  test;
- `web/lib/auth/normalized-authority-c487.test.ts:756-830` —
  stale-schema/route-absence test (not executed because of the external pool
  startup failure).

The secondary search for `RolePolicyStore`, `hasActiveManagementGrant`,
`ctx.actorRole`, `sectionsForRole`, `stableNavigationSections`,
`ROLE_CAPABILITY_DEFAULTS`, `PermissionPolicy*`, `DepartmentManager*`, and
`ProgramLeader*` returned **no matches** in those executable scopes. The
full-tree search also found only historical/planning references in Specs
079/080/087/091 and this acceptance trace. Remaining `account.role` values
are credential/import or display projections; directory filters and authority
queries use normalized role-definition/assignment records, and no
`accounts.role` SQL authority read was found.

Separate retired-route search found the allowed route-absence assertions in
`web/lib/identity/normalized-authority.test.ts:170-174`, but also found a
residual executable test fixture in
`tests/e2e/s4-management-hardening.test.ts:819-853` that still intercepts
`/api/v1/programs/account-permissions` for old Permission loading/error
states. This is not a preflight/manual-reset or route-absence exception;
because evidence workers may not edit tests, it remains an explicit
`C-487-06` blocker.

### C-487-01..07 status matrix

| Row | Current status | Exact evidence and remaining gap |
| --- | --- | --- |
| C-487-01 | **BLOCKED** | Sections component projection passed 5/5 and bootstrap-adjacent components passed, but the new normalized-authority Worker test reached 0 assertions; no `/api/v1/auth/me` persona matrix or Worker privacy-safe projection result is claimed. |
| C-487-02 | **BLOCKED** | Programs Worker/domain 145/145 and Programs components 204/204 passed; the dedicated Staff/DM/PL/custom exact-scope/cross-scope C-487 Worker matrix remained blocked before assertions. |
| C-487-03 | **BLOCKED** | Attendance Worker 42/42 and attendance/scanner components 76/76 passed; the dedicated normalized scope/auth-expiry C-487 Worker matrix and local authenticated route smoke were not executed. |
| C-487-04 | **BLOCKED** | Auth Worker 47/47, Home/CMS Worker 21/21, management/bootstrap components 185/185, and directory/Programs seams passed; the dedicated C-487 management/tamper matrix remained blocked before assertions. |
| C-487-05 | **PARTIAL — direct D1/preflight subset** | All 25 migrations applied, normalized seed/query invariants and zero legacy tables were proven, and identity schema/seed tests passed 88/88 including stale-table preflight/manual-reset behavior. The dedicated c487 Worker test remains externally blocked; its Admin all-on/bootstrap assertion is not counted, so this criterion is not complete. |
| C-487-06 | **BLOCKED** | Production executable legacy-token hits are zero and secondary obsolete symbols are absent, but the residual old-route test fixture at `tests/e2e/s4-management-hardening.test.ts:819-853` is unclassified by the allowed exceptions; old-route HTTP smoke was also blocked. |
| C-487-07 | **BLOCKED** | W7 numeric geometry passed 49/49 across all required widths; full local authenticated Programs/live UI journeys were not run because the supervised local Worker could not start, so no full-journey or CI/manual parity claim is made. |

### External Worker limitation, manual gates, and scope

The new normalized-authority Worker test is explicitly **BLOCKED before
assertions (0 tests)** by the external Cloudflare-pool/Vite
`EvalError: Code generation from strings disallowed for this context`.
No unsafe-eval bypass was used. A separate supervised local Wrangler route
smoke also failed before readiness: the `pnpm` launch resolved Node
`v20.19.0` and logged `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`; the direct
Wrangler attempt then logged `Missing entry-point to Worker script or to
assets directory` from the repository root. No further Worker retries were
made, and no old-route HTTP result is claimed.

`C-487-M1`, `C-487-M2`, `C-487-M3`, and `C-487-M4` remain **MANUAL —
unclaimed**, including reduced-motion, forced-colors, zoom/text-spacing,
real-device dock/safe-area, remote-CI, and production-promotion gates. No
manual accessibility, WCAG, screenshot, image, or pixel-diff claim is made.

Only `docs/specs/s4-phase-c-acceptance-trace.md` is changed by this append.
The child was clean before the append; no source/test/config/migration/schema/
fixture or **#487 path** was edited. The branch remains stopped before Phase D.

## #487 post-legacy-route-fix evidence — current `9cddf362`

**Evidence scope:** fresh focused evidence for #487 after the residual legacy
permission-route test fix at exact current coordinator HEAD
`9cddf362aaf79fd5966f2328c4d22ae35d3e2f60`
(`test(#487): intercept normalized permission routes`). The fresh child was
created from that exact commit as
`.worktrees/s4-c-487-evidence-rerun` on branch
`evidence/s4-c-487-rerun`; the coordinator worktree was not edited. This is a
documentation-only append. No source, test, schema, migration, seed, fixture,
config, deployment, #488/#489, or Phase D path was changed.

### Authority reread before checks

Before Context7 or any validation command, I reread implementation ticket
`issue://487`, parent ticket `issue://475`, authoritative Specs
`docs/specs/091-stackable-identity-backend.md` and
`docs/specs/092-discord-identity-design-system-adoption.md`, approved
`local://s4-phase-c-identity-integration-plan.md` including Task 4 and its
exact obsolete-caller audit, the full current
`docs/specs/s4-phase-c-acceptance-trace.md`, ADRs
`docs/adr/0042-discord-like-stackable-role-model.md` and
`docs/adr/0043-owned-civic-design-system-governance.md`, the Phase B trace
`docs/specs/s4-phase-b-acceptance-trace.md`, Phase B evidence
`docs/qa/2026-08-28-s4-phase-b-foundation.md`, and full prior reports
`agent://TestAuthority487`, `agent://EvidenceAuthority487`, and
`agent://FixLegacyPermissionTest`. The implementation and spec tickets were
read before Context7 and validation.

### Runtime and required Context7 CLI lookup

Observed runtime: Node `v22.18.0`, pnpm `11.7.0`, Vitest `4.1.10`,
Wrangler `4.127.1`, Playwright `1.62.1`, TypeScript `5.9.3`, direct web
Miniflare `5.20260828.0-alpha` (the dependency graph also reports
transitive `5.20260730.0-alpha` under Wrangler `4.118.0` and
`@cloudflare/vitest-pool-workers@0.20.1`), and pinned Chrome for Testing
`151.0.7922.34` (Playwright Chromium revision `v1234`).

The required lookups used the Context7 CLI (`npx --yes ctx7@latest`), not
MCP Context7, before validation:

- Cloudflare library command
  `npx --yes ctx7@latest library "Cloudflare Workers" "D1Database prepared statements batch transactions"`
  selected `/cloudflare/workers-sdk`. Docs command
  `npx --yes ctx7@latest docs /cloudflare/workers-sdk "D1Database prepare bind batch transaction atomic"`
  returned `D1 batch transactions with prepared statements`, `D1 prepared
  statements + db.batch() user-facing pattern`, and `D1 binding, prepared
  statements, and query methods`.
- Vitest library command
  `npx --yes ctx7@latest library vitest "Run Vitest with Specific File expect requireAssertions"`
  selected `/vitest-dev/vitest`. Docs command
  `npx --yes ctx7@latest docs /vitest-dev/vitest "Run Vitest with Specific File expect requireAssertions"`
  returned `Run Vitest with Specific File`, `Running Vitest Tests for a
  Specific File`, and `expect > expect.requireAssertions`.
- Playwright library command
  `npx --yes ctx7@latest library playwright "viewport CSS pixels locator boundingBox webServer"`
  selected `/microsoft/playwright`. Docs command
  `npx --yes ctx7@latest docs /microsoft/playwright "Locator boundingBox CSS pixels viewport setViewportSize webServer"`
  returned `Locator.boundingBox([options])` and `Page.setViewportSize`, which
  define viewport-relative CSS-pixel rectangles and explicit viewport sizing.

### Focused checks and exact results

| Check | Exact command / result |
| --- | --- |
| Dedicated normalized-authority Worker seam | `pnpm --dir web exec vitest run --config vitest.config.ts lib/auth/normalized-authority-c487.test.ts` — **exit 1, BLOCKED before assertions**; Cloudflare-pool/Vite raised `EvalError: Code generation from strings disallowed for this context`; `Test Files no tests`, `Tests no tests`, `Errors 1`; product assertions `0`. No unsafe-eval bypass. |
| Capability-driven sections component seam | `pnpm --dir web exec vitest run --config vitest.components.config.ts lib/sections.test.ts` — **exit 0**, 1 file, **5/5 tests passed**. |
| Identity schema/seeds/hierarchy/handlers | `pnpm verify:identity` — **exit 0**, 4 files, **88/88 tests passed**. Includes normalized seed invariants, protected anchors, stale-schema/manual-reset preflight, D1 constraints, and role-handler HTTP contracts. |
| Normalized identity regression seam | `pnpm --dir web exec vitest run --config vitest.config.ts lib/identity/normalized-authority.test.ts` — **exit 1, BLOCKED before assertions** with the same external Cloudflare-pool `EvalError`; `Test Files no tests`, `Tests no tests`, `Errors 1`. |
| Programs Worker/domain | `pnpm --dir web exec vitest run --config vitest.config.ts lib/programs/programs.test.ts lib/programs/capabilities.test.ts lib/programs/account-directory.test.ts lib/programs/member-directory.test.ts lib/programs/hub-directory.test.ts` — **exit 0**, 5 files, **145/145 tests passed**. |
| Attendance Worker | `pnpm --dir web exec vitest run --config vitest.config.ts lib/attendance-worker.test.ts` — **exit 0**, 1 file, **42/42 tests passed**. |
| Auth Worker | `pnpm --dir web exec vitest run --config vitest.config.ts worker.auth.test.ts` — **exit 0**, 1 file, **47/47 tests passed**. |
| Home/CMS Worker | `pnpm --dir web exec vitest run --config vitest.config.ts lib/home-worker.test.ts lib/home-cms-worker.test.ts` — **exit 0**, 2 files, **21/21 tests passed**. |
| Management/directories component seam | `pnpm --dir web exec vitest run --config vitest.components.config.ts lib/sections.test.ts lib/home.test.tsx lib/management-hub.test.tsx lib/account-directory-panel.test.tsx lib/member-directory-panel.test.tsx lib/programs/programs-management-boundary.test.tsx lib/programs/event-detail.test.tsx lib/shell/authenticated-shell.test.tsx lib/account-settings.test.tsx lib/app.test.tsx` — **exit 0**, 10 files, **185/185 tests passed**. |
| Programs component seam | `pnpm --dir web exec vitest run --config vitest.components.config.ts lib/programs/programs-events-panel.test.tsx lib/programs/programs-enrollment-panel.test.tsx lib/programs/member-picker.test.tsx lib/programs/programs-boundary.test.tsx lib/programs/participant-directory.test.tsx lib/programs/management-directory.test.tsx lib/programs/program-form.test.tsx lib/programs/program-settings.test.tsx lib/programs/program-workspace.test.tsx lib/programs/programs-management-boundary.test.tsx lib/programs/event-detail.test.tsx lib/programs/programs-notifications.test.tsx lib/programs/participant-program-detail.test.tsx lib/programs/participant-enrollment.test.tsx` — **exit 0**, 14 files, **204/204 tests passed**. |
| Attendance/scanner component seam | `pnpm --dir web exec vitest run --config vitest.components.config.ts lib/attendance-panel.test.tsx lib/attendance-operator-panel.test.tsx lib/attendance-roster.test.tsx lib/self-check-in-panel.test.tsx lib/use-qr-camera.test.tsx lib/assisted-scanner-panel.test.tsx lib/scanner-boundary.test.tsx lib/scanner-intent.test.ts` — **exit 0**, 8 files, **76/76 tests passed**; jsdom `scrollTo()` notices did not fail tests. |
| Identity access/role/directory component regression | `pnpm --dir web exec vitest run --config vitest.components.config.ts lib/account-access-panel.test.tsx lib/account-access-api.test.ts lib/account-directory-panel.test.tsx lib/identity/role-hierarchy-panel.test.tsx lib/programs/department-settings-panel.test.tsx lib/programs/programs-leaders-panel.test.tsx` — **exit 0**, 4 included files, **69/69 tests passed**; the component config excludes the two named Department/Programs Leaders files. |
| Role hierarchy component | `pnpm --dir web exec vitest run --config vitest.components.config.ts lib/identity/role-hierarchy-panel.test.tsx` — **exit 0**, 1 file, **19/19 tests passed**. |
| Home CMS component | `pnpm --dir web exec vitest run --config vitest.components.config.ts app/management/home-cms-editor.test.tsx` — **exit 0**, 1 file, **7/7 tests passed**. |
| Management action/redirect components | `pnpm --dir web exec vitest run --config vitest.components.config.ts lib/management-action-framework.test.tsx lib/management-route-redirects.test.tsx` — **exit 0**, 2 files, **13/13 tests passed**. |
| Worker/web TypeScript | `pnpm --dir web exec tsc --noEmit -p tsconfig.worker.json && pnpm --dir web exec tsc --noEmit -p tsconfig.json` — **exit 0**, no output. |
| Web production build | `pnpm --dir web build` — **exit 0**; Next generated **18/18 static pages**. The emitted route table contained **16 route rows**: `/`, `/_not-found`, `/events`, `/guest-check-in`, `/home`, `/management`, `/messages`, `/notices`, `/permissions`, `/profile`, `/profile/settings`, `/programs`, `/prototype`, `/register`, `/registrations`, and `/scanner`. Existing multiple-lockfile, no-cache, telemetry, and color notices did not fail the build. |
| W7 numeric geometry | `pnpm test:role-hierarchy-geometry` — **exit 0**, **49/49 numeric tests passed**: 14 Account Access + 14 Permission Editor + 21 Role Hierarchy scenarios across `320, 390, 600, 799, 800, 1024, 1440` CSS px. Numeric evidence only; no screenshots, image snapshots, or pixel diffs. |

### Fresh local D1 migration, seed, and query proof

`pnpm --dir web exec wrangler d1 migrations apply efcc-identity --local`
applied all **25 versioned migrations** to the fresh child-local D1. The
`0007`, `0013`, `0015`, `0016`, and `0017` files are retired `SELECT 1`
migrations; they do not create the obsolete authority tables.
`pnpm db:seed:disposable` completed **6/6 commands successfully**.
Queries against that same local binding returned:

- `d1_migrations`: **25** applied migrations.
- E2E disposable accounts: **5**; seeded Role Definitions: **5**;
  normalized grants: **39**; active disposable assignments: **4**.
- Role order/protection: `admin` position `0`, protected; `staff` position
  `1`; Department identity position `10` with its exact Department scope;
  Program identity position `20` with its exact Program scope; `member`
  position `999`, protected.
- The identity inventory contained all 7 expected normalized tables
  (`role_categories`, `role_definitions`, `role_definition_grants`,
  `role_assignments`, `role_policy_revisions`, `role_policy_mutations`,
  `role_audit_events`); the legacy-table query returned **0 rows** for
  `role_capabilities`, `department_managers`, `program_leaders`,
  `permission_policy_state`, and `permission_policy_mutations`.
- `pnpm verify:identity` directly passed the stale-table preflight/no-auto-drop
  test plus seed idempotency/protected-baseline assertions. No remote,
  Apps Script, Google Sheets, Cloudflare production, or other external
  database write was made.

### Exact obsolete-token/symbol and route audit

The direct clean-tree primary-token search over the executable scopes
`web/lib`, `web/app`, `web/worker.ts`, `web/migrations`, and `tests` returned
only the allowed stale-schema/manual-reset checks:

- `web/lib/identity/preflight.ts:17-21` — explicit legacy table names for
  read-only stale-schema detection and manual reset instructions.
- `web/lib/identity/d1-schema.test.ts:147-151,168-169` — stale-schema
  detection and no-auto-drop test.
- `web/lib/auth/normalized-authority-c487.test.ts:757-761,811,820,824,
  827,829-830` — fresh-schema absence and stale-schema/no-auto-drop test.

The full-tree primary search additionally found historical/planning
references in Specs 079/080/087/091 and prior/current acceptance evidence;
these are documentation provenance, not executable authority. No production
DDL/seed writer or authority code hit remains.

The secondary executable-scope search returned **no matches** for
`RolePolicyStore`, `hasActiveManagementGrant`, `ctx.actorRole`,
`sectionsForRole`, `stableNavigationSections`, `ROLE_CAPABILITY_DEFAULTS`,
`PermissionPolicy*`, `DepartmentManager*`, or `ProgramLeader*`. Full-tree
historical/planning vocabulary remains classified as documentation only.
Retained `accounts.role` occurrences are login/credential/import or display
projections; no authority/navigation/scope SQL read was found.

The direct `/api/v1/programs/account-permissions` search over those executable
scopes found exactly one reference:
`web/lib/identity/normalized-authority.test.ts:171`, inside the explicit
removed-route assertion that expects `404`/`NOT_FOUND`. The repaired
`tests/e2e/s4-management-hardening.test.ts` contains no old
`account-permissions` test reference.

The removed Manager/Leader route-family search found the allowed route-absence
assertions at `web/lib/identity/normalized-authority.test.ts:172-173`, plus a
separate unallowed executable stale fixture:
`tests/e2e/member-directory.test.ts:154-177` still POSTs
`/api/v1/programs/departments/:id/managers` and
`/api/v1/programs/departments/:id/managers/:user/revoke` through
`grantManager`/`revokeManager`. This is not a route-absence test and remains
an explicit C-487-06 blocker. No old Manager/Leader production dispatch or
writer was found.

### C-487-01..07 status matrix

| Row | Current status | Exact evidence and remaining gap |
| --- | --- | --- |
| C-487-01 | **BLOCKED** | Sections projection passed 5/5 and bootstrap-adjacent component suites passed, but `normalized-authority-c487.test.ts` stopped at Cloudflare-pool startup with 0 assertions; no `/api/v1/auth/me` persona matrix or Worker privacy-safe projection result is claimed. |
| C-487-02 | **BLOCKED** | Programs Worker/domain passed 145/145 and Programs components passed 204/204, but the dedicated Staff/DM/PL/custom exact-scope, cross-scope, equal/higher, and Member Worker matrix remained blocked before assertions; local Worker route smoke was unavailable. |
| C-487-03 | **BLOCKED** | Attendance Worker passed 42/42 and attendance/scanner components passed 76/76, but the dedicated normalized Program/Department scope and auth-expiry Worker matrix was blocked before assertions; no local authenticated Worker route result is claimed. |
| C-487-04 | **BLOCKED** | Auth Worker passed 47/47, Home/CMS Worker passed 21/21, and management/directory components passed 185/185 plus Home CMS 7/7, but the dedicated management/tamper Worker matrix was blocked before assertions. |
| C-487-05 | **PARTIAL — direct D1/preflight subset** | All 25 migrations applied; disposable seed/query proved 5 accounts, 5 definitions, 39 grants, 4 assignments, protected order, 7 normalized identity tables, and zero legacy tables; identity schema/seed/hierarchy/handler tests passed 88/88. The dedicated Admin all-on/bootstrap Worker assertion remains blocked. |
| C-487-06 | **BLOCKED** | Executable primary legacy-table token hits are limited to allowed preflight/stale-schema tests; secondary authority symbols are absent; `/api/v1/programs/account-permissions` remains only in the explicit route-absence test. However, `tests/e2e/member-directory.test.ts:154-177` still exercises removed Manager routes, and old-route HTTP smoke could not run because the local Worker failed before readiness. |
| C-487-07 | **BLOCKED** | W7 numeric geometry passed 49/49 across all required widths; full local authenticated Programs/live UI journeys and HTTP route-absence checks were not run because the supervised local Worker could not start. No full-journey or CI/manual parity claim is made. |

### External Worker limitation, manual gates, and scope

The new normalized-authority Worker seam is explicitly **BLOCKED before
assertions (0 tests)** by the external Cloudflare-pool/Vite
`EvalError: Code generation from strings disallowed for this context`.
No unsafe-eval bypass was used. The required supervised
`pnpm --dir web dev:local` launch also failed before `127.0.0.1:8787`
readiness: the process manager resolved Node `v20.19.0` and logged
`ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`; Wrangler also logged
`Missing entry-point to Worker script or to assets directory`. An explicit
Node 22 path attempt still resolved the process-manager Node 20 runtime.
No old-route HTTP result is claimed and no further workaround was used.

`C-487-M1` reduced-motion/forced-colors/200% zoom/text-spacing,
`C-487-M2` real-device dock/safe-area, `C-487-M3` remote-CI, and
`C-487-M4` production-promotion dry-run remain **MANUAL — unclaimed**.
No manual accessibility, WCAG, screenshot, image, or pixel-diff claim is
made.

Only `docs/specs/s4-phase-c-acceptance-trace.md` is changed by this append.
The child was clean before the append; no source/test/config/migration/schema/
fixture or **#487 path** was edited. The branch remains stopped before Phase D.
## #487 final post-fixture evidence — current `54eb96e0`

**Evidence scope:** fresh #487 evidence after the normalized Permission route
and Member Directory fixture corrections, at exact coordinator/current child
HEAD `54eb96e096ca9ff2e233640035848c58786545cf`
(`test(#487): migrate member directory identity fixture`). The fresh child was
created from that exact SHA as
`.worktrees/s4-c-487-evidence-final` on branch
`feat/s4-c-487-evidence-final`; the coordinator worktree was not edited. This
append is documentation-only. No source, test, schema, migration, fixture,
configuration, deployment, #488/#489, or Phase D path was changed.

### Authority reread before checks

Before Context7 or validation, I reread implementation ticket `issue://487`,
parent ticket `issue://475`, authoritative Specs
`docs/specs/091-stackable-identity-backend.md` and
`docs/specs/092-discord-identity-design-system-adoption.md`, approved
`local://s4-phase-c-identity-integration-plan.md` including Task 4 and the
exact obsolete-caller audit, the full current
`docs/specs/s4-phase-c-acceptance-trace.md` (2,159 lines), ADRs
`docs/adr/0042-discord-like-stackable-role-model.md` and
`docs/adr/0043-owned-civic-design-system-governance.md`, the Phase B trace
`docs/specs/s4-phase-b-acceptance-trace.md`, Phase B evidence
`docs/qa/2026-08-28-s4-phase-b-foundation.md`, and prior reports
`agent://TestAuthority487`, `agent://EvidenceAuthority487`,
`agent://EvidenceAuthority487B`, `agent://FixLegacyPermissionTest`, and
`agent://FixManagerFixture487`. The implementation and parent/spec tickets
were read before checks. The FixManager report records commit
`c091743a233ddc0ddb5ab52e8ec89644f9f9059e`, test-only
`tests/e2e/member-directory.test.ts`, E2E TypeScript pass, one-test
collection, focused account-access handler `8/8`, and the normalized
assignment/revoke replacement.

### Runtime and required Context7 CLI lookups

Fresh observed versions: Node `v22.18.0`, pnpm `11.7.0`, Vitest `4.1.10`,
Wrangler `4.127.1`, Playwright `1.62.1`, root TypeScript `7.0.2`, and web
TypeScript `5.9.3`. The pinned geometry run used the local Chromium harness
with numeric CSS-pixel assertions only.

The required lookups used the Context7 CLI (`npx --yes ctx7@latest`), not MCP
Context7, before validation:

- Cloudflare library command
  `npx --yes ctx7@latest library "Cloudflare Workers" "D1Database prepared statements batch transactions"` selected `/cloudflare/workers-sdk`.
  Docs command
  `npx --yes ctx7@latest docs /cloudflare/workers-sdk "D1Database prepare bind batch transaction atomic"`
  returned `D1 batch transactions with prepared statements`, `D1 prepared
  statements + db.batch() user-facing pattern`, and `D1 binding, prepared
  statements, and query methods`.
- Vitest library command
  `npx --yes ctx7@latest library vitest "Run Vitest with Specific File expect requireAssertions"`
  selected `/vitest-dev/vitest`. Docs command
  `npx --yes ctx7@latest docs /vitest-dev/vitest "Run Vitest with Specific File expect requireAssertions"`
  returned `Run Vitest with Specific File`, `Running Vitest Tests for a
  Specific File`, and `expect(actual, message?)` / `expect.requireAssertions`.
- Playwright library command
  `npx --yes ctx7@latest library playwright "viewport CSS pixels locator boundingBox webServer"`
  selected `/microsoft/playwright`. Docs command
  `npx --yes ctx7@latest docs /microsoft/playwright "Locator boundingBox CSS pixels viewport setViewportSize webServer"`
  returned `Locator.boundingBox([options])` and `Page.setViewportSize`.

### Fresh focused checks and exact results

| Check | Exact command / result |
| --- | --- |
| Dedicated normalized-authority Worker seam | `pnpm --dir web exec vitest run --config vitest.config.ts lib/auth/normalized-authority-c487.test.ts` — **exit 1, BLOCKED before assertions**; Cloudflare-pool/Vite raised `EvalError: Code generation from strings disallowed for this context`; `Test Files no tests`, `Tests no tests`, `Errors 1`, product assertions `0`. No unsafe-eval bypass. |
| Normalized identity regression seam | `pnpm --dir web exec vitest run --config vitest.config.ts lib/identity/normalized-authority.test.ts` — **exit 1, BLOCKED before assertions** with the same external pool `EvalError`; `Test Files no tests`, `Tests no tests`, `Errors 1`. |
| Capability-driven sections | `pnpm --dir web exec vitest run --config vitest.components.config.ts lib/sections.test.ts` — **exit 0**, 1 file, **5/5 passed**. |
| Identity schema/seeds/hierarchy/handlers | `pnpm verify:identity` — **exit 0**, 4 files, **88/88 passed**, including normalized seed invariants, protected anchors, stale-schema/no-auto-drop preflight, D1 constraints, and role-handler HTTP contracts. |
| Programs Worker/domain | `pnpm --dir web exec vitest run --config vitest.config.ts lib/programs/programs.test.ts lib/programs/capabilities.test.ts lib/programs/account-directory.test.ts lib/programs/member-directory.test.ts lib/programs/hub-directory.test.ts` — **exit 0**, 5 files, **145/145 passed**. |
| Attendance Worker | `pnpm --dir web exec vitest run --config vitest.config.ts lib/attendance-worker.test.ts` — **exit 0**, 1 file, **42/42 passed**. |
| Auth Worker | `pnpm --dir web exec vitest run --config vitest.config.ts worker.auth.test.ts` — **exit 0**, 1 file, **47/47 passed**. |
| Home/CMS Worker | `pnpm --dir web exec vitest run --config vitest.config.ts lib/home-worker.test.ts lib/home-cms-worker.test.ts` — **exit 0**, 2 files, **21/21 passed**. |
| Account Access Worker handler | `pnpm --dir web exec vitest run --config vitest.config.ts lib/identity/account-access-handlers.test.ts` — **exit 0**, 1 file, **8/8 passed**. |
| Management/bootstrap/directory components | Focused component invocation over sections, Home, Management Hub, Account/Member Directory panels, settings, shell, Programs boundary/Event detail, and app — **exit 0**, 10 files, **185/185 passed**. |
| Programs components | Focused Programs Events/enrollment/picker/boundary/directories/forms/settings/workspace/notifications/participant surfaces — **exit 0**, 14 files, **204/204 passed**. |
| Attendance/scanner components | Focused attendance/scanner component invocation — **exit 0**, 8 files, **76/76 passed**; jsdom `scrollTo()` notices did not fail tests. |
| Identity/account/directory components | `lib/directory-frame.test.tsx lib/account-access-panel.test.tsx lib/account-access-api.test.ts lib/identity/role-hierarchy-panel.test.tsx lib/account-directory-panel.test.tsx lib/member-directory-panel.test.tsx` — **exit 0**, 6 files, **85/85 passed**. |
| Permission Editor component | `pnpm --dir web exec vitest run --config vitest.components.config.ts lib/permission-editor-panel.test.tsx` — **exit 0**, 1 file, **8/8 passed**. |
| Home CMS and management actions | `app/management/home-cms-editor.test.tsx lib/management-action-framework.test.tsx lib/management-route-redirects.test.tsx` — **exit 0**, 3 files, **20/20 passed**. |
| Root/E2E TypeScript | `pnpm typecheck` — **exit 0**; root and E2E configs. |
| Worker/web TypeScript | `pnpm --dir web exec tsc --noEmit -p tsconfig.worker.json && pnpm --dir web exec tsc --noEmit -p tsconfig.json` — **exit 0**, no output. |
| Web production build | `pnpm --dir web build` — **exit 0**; Next generated **18/18 static pages** and emitted **16 visible route rows** (`/`, `/_not-found`, `/events`, `/guest-check-in`, `/home`, `/management`, `/messages`, `/notices`, `/permissions`, `/profile`, `/profile/settings`, `/programs`, `/prototype`, `/register`, `/registrations`, `/scanner`). |
| W7 identity geometry | `pnpm test:role-hierarchy-geometry` — **exit 0**, **49/49 numeric tests passed**: 14 Account Access + 14 Permission Editor + 21 Role Hierarchy across `320, 390, 600, 799, 800, 1024, 1440` CSS px. |
| Shell responsive geometry | `pnpm test:shell-responsive` — **exit 0**, **92 passed, 1 skipped**; `pnpm test:shell-geometry` — **exit 0**, **28/28 passed**. |
| Permission/management route collection | `PROGRAMS_TARGET_URL=http://127.0.0.1:8797 pnpm exec playwright test --config=tests/e2e/s4-management-hardening.config.ts --project=phone-390 --list` — **10 tests listed**. |

### Fresh disposable D1 migration, seeds, and query proof

`pnpm --dir web exec wrangler d1 migrations apply efcc-identity --local`
applied all **25 versioned migrations** to the fresh child-local D1. The
legacy-named `0007_department_managers.sql`,
`0013_account_permissions_capability.sql`, and
`0015_s4_additive_role_capabilities.sql` migrations contain retired `SELECT 1`
only; they do not create retired authority tables.

`pnpm db:seed:disposable` completed **6/6 underlying SQL commands** with exit
0. `pnpm db:seed:local` completed with exit 0: the development reset applied
19 SQL commands, the legacy fixture reset applied 11, and the final disposable
seed applied 6. The current local D1 query after that complete reset returned:

- `d1_migrations`: **25**; accounts: **9**; Role Definitions: **5**;
  normalized grants: **39**; active assignments: **6**.
- Role order/protection: `admin` position `0`, protected; `staff` position
  `1`; Department identity position `10` with exact Department scope
  `018f3b8a-0000-7000-8000-000000000002`; Program identity position `20` with
  exact Program scope `018f3b8a-0000-7000-8000-300000000001`; `member`
  position `999`, protected.
- The identity inventory contained all 7 expected normalized tables
  (`role_categories`, `role_definitions`, `role_definition_grants`,
  `role_assignments`, `role_policy_revisions`, `role_policy_mutations`,
  `role_audit_events`); the legacy-table query returned **0 rows** for
  `role_capabilities`, `department_managers`, `program_leaders`,
  `permission_policy_state`, and `permission_policy_mutations`.
- `pnpm verify:identity` passed the stale-table/no-auto-drop preflight,
  seed-idempotency, and protected-baseline assertions. No remote, Apps Script,
  Google Sheets, Cloudflare production, or other external database was written.

### Local Worker HTTP smoke and live E2E classification

The required supervised `pnpm --dir web dev:local` launch could not start
under the process manager: it resolved Node `v20.19.0` and logged
`ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`. No config file was created and no
unsafe test bypass was used. A supervised explicit Node `v22.18.0` Wrangler
launch with a process-only local `--var` secret did reach
`http://127.0.0.1:8797`; this was used only for HTTP smoke and was stopped
after evidence.

HTTP-only `/api/v1/auth/me` smoke on that disposable Worker returned `200` for
the seeded dev Admin, Staff, and Member accounts. Admin projected
`systemRole=Admin`, `系統管理員`/Global, sections
`home,programs,scanner,management,profile,events`, navigation
`home,programs,scanner,management,profile`, and 24 true capabilities. Staff
projected `systemRole=Staff`, `同工`/Global, the same sections/navigation,
and 22 true capabilities. Member projected `systemRole=null`, no identity
summary, sections/navigation `home,programs,scanner,notices,profile`, and
automatic baseline capability count 1. No manual accessibility or WCAG
claim is made.

Authenticated HTTP requests to the removed
`/api/v1/programs/account-permissions`,
`/api/v1/programs/<program>/leaders`, and
`/api/v1/programs/departments/<department>/managers` routes each returned
`404 NOT_FOUND`. Admin `GET /api/v1/programs/accounts` returned `200`;
Member returned `403 FORBIDDEN`. The corrected executable route audit below
also found no old route fixture.

The full local command
`PROGRAMS_TARGET_URL=http://127.0.0.1:8797 pnpm exec playwright test --config=tests/e2e/programs-d1.config.ts`
scheduled **195 tests** but remained in progress after the focused evidence
window and was cancelled at the parent instruction; no pass count or
full-journey claim is made. The fresh corrected
`member-directory.config.ts` run scheduled one test and failed on both attempts
before its identity assertions because the test expects heading `課程與活動`
while the current live route renders `課程` (`COPY.programs.pageTitle`).
`db:seed:local` itself passed, login reached the live shell, and the failure is
therefore classified as a stale live-test copy contract, not fixture ordering;
the test was not edited in this evidence child. The full `live-ui.config.ts`
journey was not run after the cancelled Programs run. These live-E2E gaps
remain blockers for C-487-07.

### Exact obsolete-token, symbol, filename, and route audit

The direct clean-tree primary-token search over executable scopes
`web/lib`, `web/app`, `web/worker.ts`, `web/migrations`, and `tests` returned
only the allowed stale-schema/manual-reset checks:

- `web/lib/identity/preflight.ts:17-21` — explicit legacy table names for
  read-only stale-schema detection and manual reset instructions.
- `web/lib/identity/d1-schema.test.ts:147-151,168-169` — stale-schema
  detection and no-auto-drop test.
- `web/lib/auth/normalized-authority-c487.test.ts:757-761,811,820,824,827,829-830`
  — fresh-schema absence and stale-schema/no-auto-drop test.

No executable production token hit exists in `web/lib/**`, `web/app/**`,
`web/worker.ts`, or migration DDL/seed writers. The full-tree primary search
also found historical/planning references in Specs 079/080/087/091 and the
current/prior acceptance evidence; those are documentation provenance, not
authority. The three legacy-named migration filenames above are retired
`SELECT 1` history, not writers.

The secondary executable-scope search returned **no matches** for
`RolePolicyStore`, `hasActiveManagementGrant`, `ctx.actorRole`,
`sectionsForRole`, `stableNavigationSections`, `ROLE_CAPABILITY_DEFAULTS`,
`PermissionPolicy*`, `DepartmentManager*`, or `ProgramLeader*`. Full-tree
matches are archived audits/specs/plans and prior/current evidence only.
Retained `accounts.role` values are limited to login/import or display
projection paths (`web/lib/auth/handlers.ts:547,587` and seed/display
fixtures); no authority, navigation, scope, or directory SQL read was found.

The direct removed-route search found exactly the three route strings in
`web/lib/identity/normalized-authority.test.ts:170-173`, the explicit
`404`/`NOT_FOUND` route-absence assertion. The corrected
`tests/e2e/member-directory.test.ts` contains no `grantManager`,
`revokeManager`, `/managers`, `/leaders`, or `account-permissions` reference.
No old Manager/Leader production dispatch or writer remains.

### C-487-01..07 final status matrix

| Row | Current status | Exact evidence and remaining gap |
| --- | --- | --- |
| C-487-01 | **BLOCKED** | Local HTTP bootstrap smoke passed for Admin/Staff/Member (3/5 personas) with the normalized sections/navigation and safe identity projections recorded above; sections component passed 5/5. The dedicated `normalized-authority-c487.test.ts` stopped before assertions (0 tests), so DM/PL and the complete Worker persona matrix are not claimed. |
| C-487-02 | **BLOCKED** | Programs Worker/domain passed 145/145 and Programs components passed 204/204; local Admin/Staff/Member access smoke was available. The dedicated exact-scope/cross-scope/equal-higher/Member Worker matrix was blocked before assertions, and the 195-test local Programs journey was cancelled before completion. |
| C-487-03 | **BLOCKED** | Attendance Worker passed 42/42 and attendance/scanner components passed 76/76. The dedicated normalized Program/Department scope/auth-expiry Worker matrix was blocked before assertions; the cancelled local Programs run does not prove the full authenticated attendance journey. |
| C-487-04 | **BLOCKED** | Auth Worker passed 47/47, Home/CMS Worker 21/21, management/bootstrap/directory components 185/185, directory/account smoke returned Admin `200` and Member `403 FORBIDDEN`, and old route smoke returned `404 NOT_FOUND`. The dedicated management/tamper Worker matrix and full live UI journey were not completed. |
| C-487-05 | **PARTIAL — direct D1/preflight subset** | Fresh 25-migration local D1, both seed commands, 9 accounts, 5 definitions, 39 grants, 6 active assignments, 7 normalized identity tables, zero legacy tables, protected order/scope, and `verify:identity` 88/88 including stale-table/no-auto-drop behavior all passed. The dedicated Admin-all-on/bootstrap Worker assertion remains blocked. |
| C-487-06 | **PASS — executable audit and route absence** | Primary legacy-table token hits are only the three allowed preflight/stale-schema test locations; secondary obsolete symbols are absent; the corrected Member Directory fixture has no old Manager/Leader calls; authenticated HTTP smoke returned `404 NOT_FOUND` for account-permissions, Leader, and Manager route families. Full-tree docs/plans/old migration filenames are classified provenance/history only. |
| C-487-07 | **BLOCKED** | W7 identity geometry passed 49/49 and shell responsive/geometry passed 92/1 skipped and 28/28; management route collection listed 10 tests. The 195-test Programs journey was cancelled, the full live UI journey was not run, and corrected Member Directory E2E failed on stale `課程與活動` versus current `課程` copy, so no full-journey/CI parity claim is made. |

### External limitations, manual gates, and scope

The normalized-authority Worker seam remains **BLOCKED before assertions
(0 tests)** by the external Cloudflare-pool/Vite
`EvalError: Code generation from strings disallowed for this context`.
No unsafe-eval bypass, source workaround, or test suppression was used. The
process-manager Node 20 `node:sqlite` startup failure and the cancelled
long-running Programs journey are recorded above; no unobserved pass count is
invented.

`C-487-M1` reduced-motion/forced-colors/200% zoom/text-spacing,
`C-487-M2` real-device dock/safe-area, `C-487-M3` remote-CI, and
`C-487-M4` production-promotion dry-run remain **MANUAL — unclaimed**.
No manual accessibility, WCAG, screenshot, image, or pixel-diff claim is
made.

Only `docs/specs/s4-phase-c-acceptance-trace.md` is changed by this append.
The child was clean before the append; no source/test/config/migration/schema/
fixture or **#487 path** was edited. This child remains stopped before
Phase D.

## #487 post-correction revalidation — current `9ffaa15d`

**Evidence scope:** Fresh isolated child `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/s4-c-487-evidence-post-correction` on branch `evidence/s4-c-487-post-correction`, created from the coordinator's exact `9ffaa15dc2095f1b90dbe48ef5b01f17025c85c1` (`feat/s4-c-stackable-identity-integration`). This is a documentation-only append after the #487 review-correction commit. No source, test, configuration, migration, schema, fixture, #488/#489, Phase D, deployment, or production-data path was changed.

### Authority reread before checks

Before Context7 or validation, I reread implementation ticket `issue://487`, parent ticket `issue://475`, authoritative Specs `docs/specs/091-stackable-identity-backend.md` and `docs/specs/092-discord-identity-design-system-adoption.md`, approved `local://s4-phase-c-identity-integration-plan.md` including Task 4 and the exact obsolete-caller audit, the full current `docs/specs/s4-phase-c-acceptance-trace.md`, ADRs `docs/adr/0042-discord-like-stackable-role-model.md` and `docs/adr/0043-owned-civic-design-system-governance.md`, the Phase B trace `docs/specs/s4-phase-b-acceptance-trace.md`, and Phase B evidence `docs/qa/2026-08-28-s4-phase-b-foundation.md`.

The prior #487 reports reread before checks were `agent://TestAuthority487`, `agent://EvidenceAuthority487`, `agent://EvidenceAuthority487B`, `agent://EvidenceFinalAuthority487`, `agent://ReviewAuthority487`, `agent://FixAuthority487Review`, `agent://FixLegacyPermissionTest`, and `agent://FixManagerFixture487`. The implementation and parent/spec tickets were read before the first check. Historical counts and blockers in earlier sections remain historical; the matrix below records only this `9ffaa15d` revalidation.

### Runtime and required Context7 CLI lookups

Fresh observed versions were Node `v22.18.0`, pnpm `11.7.0`, Vitest `4.1.10`, Wrangler `4.127.1`, Playwright `1.62.1`, and web TypeScript `5.9.3`. The geometry runs used the pinned local Chromium harness with numeric CSS-pixel assertions only.

The required lookups used the Context7 CLI (`npx --yes ctx7@latest`), not MCP Context7:

- `npx --yes ctx7@latest library "Cloudflare Workers" "D1Database prepared statements batch transactions schema migrations"` selected library ID `/cloudflare/workers-sdk`.
- `npx --yes ctx7@latest docs /cloudflare/workers-sdk "D1Database prepare bind batch transaction atomic migrations PRAGMA table_info"` returned `D1 batch transactions with prepared statements` and `D1 binding, prepared statements, and query methods`.
- `npx --yes ctx7@latest library vitest "Run Vitest with Specific File expect requireAssertions async assertions"` selected library ID `/vitest-dev/vitest`.
- `npx --yes ctx7@latest docs /vitest-dev/vitest "Run Vitest with Specific File expect(actual, message?) expect.requireAssertions async test assertions"` returned `expect(actual, message?)`, `Verify assertion count with expect.assertions in TypeScript`, and `Async/Await with .resolves and .rejects`.
- `npx --yes ctx7@latest library playwright "viewport CSS pixels locator boundingBox route navigation webServer"` selected library ID `/microsoft/playwright`.
- `npx --yes ctx7@latest docs /microsoft/playwright "Locator.boundingBox CSS pixels Page.setViewportSize route navigation webServer"` returned `Page.setViewportSize`.

### Fresh focused Worker/domain checks

| Check | Exact command / current result |
| --- | --- |
| Dedicated normalized-authority #487 seam | `pnpm --dir web exec vitest run --config vitest.config.ts lib/auth/normalized-authority-c487.test.ts` — **exit 1, BLOCKED before assertions**; external Cloudflare-pool/Vite `EvalError: Code generation from strings disallowed for this context`; `Test Files no tests`, `Tests no tests`, `Errors 1`, product assertions `0`. No unsafe-eval bypass, source workaround, or suppression was used. |
| Normalized identity regression seam | `pnpm --dir web exec vitest run --config vitest.config.ts lib/identity/normalized-authority.test.ts` — **exit 1, BLOCKED before assertions** with the same external pool `EvalError`; `Test Files no tests`, `Tests no tests`, `Errors 1`. |
| Permission Editor Worker/domain seams (#485 pool kept separate) | `pnpm --dir web exec vitest run --config vitest.config.ts lib/identity/permission-editor.test.ts lib/identity/permission-editor-handlers.test.ts` — **exit 1, BLOCKED before assertions**; both files failed to start in the same external pool, `Test Files no tests`, `Tests no tests`, `Errors 2`. |
| Identity schema/seeds/hierarchy/handlers | `pnpm verify:identity` — **exit 0**, 4 files, **91/91 passed**. This is the current corrected count; earlier `83`/`88` counts remain historical. |
| Account Access/lifecycle Worker | `pnpm --dir web exec vitest run --config vitest.config.ts lib/identity/account-access.test.ts lib/identity/account-access-handlers.test.ts` — **exit 0**, 2 files, **36/36 passed**. |
| Programs Worker/domain | `pnpm --dir web exec vitest run --config vitest.config.ts lib/programs/programs.test.ts lib/programs/capabilities.test.ts lib/programs/account-directory.test.ts lib/programs/member-directory.test.ts lib/programs/hub-directory.test.ts` — **exit 0**, 5 files, **145/145 passed**. |
| Attendance Worker | `pnpm --dir web exec vitest run --config vitest.config.ts lib/attendance-worker.test.ts` — **exit 0**, 1 file, **43/43 passed**. |
| Auth Worker | `pnpm --dir web exec vitest run --config vitest.config.ts worker.auth.test.ts` — **exit 0**, 1 file, **47/47 passed**. |
| Home/CMS Worker | `pnpm --dir web exec vitest run --config vitest.config.ts lib/home-worker.test.ts lib/home-cms-worker.test.ts` — **exit 0**, 2 files, **21/21 passed**. |
| New corrected #487 Worker/domain tests as one overlap group | `pnpm --dir web exec vitest run --config vitest.config.ts lib/identity/d1-schema.test.ts lib/identity/account-access.test.ts lib/identity/account-access-handlers.test.ts lib/identity/role-hierarchy.test.ts lib/programs/member-directory.test.ts lib/attendance-worker.test.ts` — **exit 0**, 6 files, **153/153 passed**. This aggregate overlaps the rows above and is not added to their counts. |

### Fresh focused component checks

| Surface group | Exact files and current result |
| --- | --- |
| Sections, Account Access, Directory/DirectoryFrame, and role hierarchy | `lib/sections.test.ts lib/account-access-panel.test.tsx lib/account-access-api.test.ts lib/directory-frame.test.tsx lib/account-directory-panel.test.tsx lib/member-directory-panel.test.tsx lib/identity/role-hierarchy-panel.test.tsx` under `vitest.components.config.ts` — **exit 0**, 7 files, **94/94 passed**. |
| Programs workspace, boundaries, and Department Settings | 15 focused files (`department-settings-panel`, `program-workspace`, `programs-boundary`, `programs-management-boundary`, Events, enrollment, picker, notifications, participant/management directories, forms, settings, event detail, participant detail/enrollment) — **exit 0**, 15 files, **210/210 passed**. jsdom emitted only `Not implemented: navigation to another Document`; no test failed. |
| Attendance/scanner | `lib/attendance-panel.test.tsx lib/attendance-operator-panel.test.tsx lib/attendance-roster.test.tsx lib/self-check-in-panel.test.tsx lib/use-qr-camera.test.tsx lib/scanner-intent.test.ts lib/assisted-scanner-panel.test.tsx lib/scanner-boundary.test.tsx` — **exit 0**, 8 files, **76/76 passed**. jsdom `Window.scrollTo()` notices did not fail tests. |
| Home/CMS | `lib/home.test.tsx app/management/home-cms-editor.test.tsx` — **exit 0**, 2 files, **22/22 passed**. |
| Management actions | `lib/management-action-framework.test.tsx lib/management-route-redirects.test.tsx lib/management-hub.test.tsx` — **exit 0**, 3 files, **26/26 passed**. |
| Permission Editor | `lib/permission-editor-panel.test.tsx` — **exit 0**, 1 file, **8/8 passed**. |

### Fresh TypeScript, build, and geometry checks

| Check | Exact command / current result |
| --- | --- |

| Root/E2E, Worker, and web TypeScript | `pnpm typecheck && pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json && pnpm --dir web exec tsc --noEmit -p tsconfig.worker.json && pnpm --dir web exec tsc --noEmit -p tsconfig.json` — **exit 0**, no diagnostics. |
| Web production build | `pnpm --dir web build` — **exit 0**; Next generated **18/18** static pages and emitted these 16 visible route rows: `/`, `/_not-found`, `/events`, `/guest-check-in`, `/home`, `/management`, `/messages`, `/notices`, `/permissions`, `/profile`, `/profile/settings`, `/programs`, `/prototype`, `/register`, `/registrations`, `/scanner`. |
| W7 identity geometry | `pnpm test:role-hierarchy-geometry` — **exit 0**, **49/49** numeric tests across `320, 390, 600, 799, 800, 1024, 1440` CSS px: Account Access 14, Permission Editor 14, Role Hierarchy 21. |
| Shell responsive/geometry | `pnpm test:shell-responsive` — **exit 0**, **92 passed, 1 skipped**; `pnpm test:shell-geometry` — **exit 0**, **28/28 passed**. |

The already-run root `pnpm typecheck` and explicit E2E TypeScript check were relevant type checks only; no project-wide test, formatter, or linter suite was run, and no tracked file was changed by them.

No screenshot, image snapshot, pixel-diff, manual accessibility, or WCAG conformance claim is made.

### Fresh disposable D1 migrations, seeds, and normalized queries

`pnpm --dir web exec wrangler d1 migrations apply efcc-identity --local` ran against a new child-local D1 and applied all **25 versioned migrations**. The legacy-named migrations `0007_department_managers.sql`, `0013_account_permissions_capability.sql`, and `0015_s4_additive_role_capabilities.sql` each contain only retired `SELECT 1`; none creates a retired authority table.

`pnpm db:seed:disposable` completed with exit 0 and **6/6** SQL commands. `pnpm db:seed:local` completed with exit 0: the development reset ran **19** commands, the legacy fixture reset ran **11**, and its final disposable seed ran **6** commands. A post-reset normalized query returned:

- `d1_migrations`: **25**; accounts: **9**; Role Definitions: **5**; normalized grants: **39**; active assignments: **6**.
- Role order/protection: `admin` position `0` protected; `staff` position `1`; `department.manager.adult` position `10` with exact Department scope `018f3b8a-0000-7000-8000-000000000002`; `program.leader.youth-bible-study` position `20` with exact Program scope `018f3b8a-0000-7000-8000-300000000001`; `member` position `999` protected.
- The identity inventory contained exactly the 7 normalized tables `role_assignments`, `role_audit_events`, `role_categories`, `role_definition_grants`, `role_definitions`, `role_policy_mutations`, and `role_policy_revisions`.
- The legacy-table query returned **zero rows** for `role_capabilities`, `department_managers`, `program_leaders`, `permission_policy_state`, and `permission_policy_mutations`.
- The live schema query confirmed `role_policy_mutations.result_json` and `role_assignments.scope_kind`/`scope_id` are present.

The first correctly seeded E2E setup used the local-only `DEMO_TARGET_URL=http://127.0.0.1:8797 pnpm db:seed:demo` command, which completed with exit 0 and created `E2E_DEMO_MINISTRY`, four demo Programs, **13** recurring events for `E2E_DEMO_成人查經`, the disabled-module fixture, participant notices, and demo Home content. After the mutating Programs journey, I reran `pnpm db:seed:local` (exit 0; **19 + 11 + 6** commands) and then reran the demo seed (exit 0) before the clean live-ui revalidation, removing the prior disposable approval-request state. No remote, Apps Script, Google Sheets, Cloudflare production, or other external database was written.

### Local Worker HTTP smoke and live E2E

The required supervised `pnpm --dir web dev:local` launch was attempted first. It exited before readiness because the process manager resolved Node `v20.19.0` and raised `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`. This is separate from the Cloudflare-pool `EvalError`; no unsafe bypass was used.

For local-only smoke/E2E, an explicit Node `v22.18.0` Wrangler process with a process-only secret variable reached `http://127.0.0.1:8797` and was stopped with exit `143` after evidence. Cookie login plus `/api/v1/auth/me` returned `200` for all three development personas:

- Admin projected `systemRole=Admin`, one safe `系統管理員`/Global identity, sections `home,programs,scanner,management,profile,events`, navigation `home,programs,scanner,management,profile`, and **24** true capabilities.
- Staff projected `systemRole=Staff`, one safe `同工`/Global identity, the same sections/navigation, and **22** true capabilities.
- Member projected `systemRole=null`, no identity summary, sections/navigation `home,programs,scanner,notices,profile`, and automatic baseline capability count **1**.

Authenticated smoke also returned `200` for Admin and `403 FORBIDDEN` for Member on `/api/v1/programs/accounts`. Each removed route returned `404` with RFC Problem Details type `tag:apps-script/efcc/errors#NOT_FOUND`: `/api/v1/programs/account-permissions`, `/api/v1/programs/<program>/leaders`, and `/api/v1/programs/departments/<department>/managers`.

An initial unseeded Programs probe was stopped at `18/195` after E2E_DEMO fixture misses; it is not used as current live evidence. After the required demo seed, `PROGRAMS_TARGET_URL=http://127.0.0.1:8797 pnpm exec playwright test --config=tests/e2e/programs-d1.config.ts` completed **195/195 passed** in 4.1 minutes with one worker.

The first live-ui run after that Programs journey scheduled **28** tests and showed **20 passed / 8 failed**; its Admin approval failure was contaminated by the preceding mutating journey (the artifact showed `待審批 32` and `E2E_HUB_SCROLL_...` requests), so that result is not used as current approval evidence. After the documented `db:seed:local` reset and demo reseed, `AUTH_UI_TARGET_URL=http://127.0.0.1:8797 pnpm exec playwright test --config=tests/e2e/live-ui.config.ts` scheduled **28** tests and completed **22 passed / 6 failed** (three test contracts failed at both phone `375x667` and desktop `1280x720`):

- Staff Profile identity expects a unique exact `同工`, but the current DOM exposes the same safe label in two visible nodes, producing Playwright strict-mode failure.
- Member Profile expects the old raw `Member` role string, which is not rendered by the normalized privacy-safe identity projection.
- The Settings hub trace expects heading `帳戶與權限`, which was absent from the current role-first management surface.

The clean rerun had no Admin approval-empty failure; the six remaining results are stale live-ui copy/selector contracts against the current normalized/role-first surface. No test or source correction was made in this evidence child. The full corrected Programs journey is a PASS; the clean live-ui journey is not a PASS and no CI parity claim is made.

### Review-correction coverage

| Review correction | Current proof |
| --- | --- |
| Same-Department actors may manage Program-scoped targets without widening scope | Corrected same-Department Program scope cases in `web/lib/identity/role-hierarchy.test.ts` passed within the 6-file **153/153** Worker/domain group; no cross-Department widening was introduced. |
| Scoped identity links route to an authorized Account Access destination and preserve Programs context | `department-settings-panel`, `program-workspace`, `programs-boundary`, `programs-management-boundary`, and management-action component suites passed within **210/210** Programs and **26/26** management component assertions. |
| Member Directory redacts identities outside authorized Departments | `web/lib/programs/member-directory.test.ts` passed in the **153/153** Worker/domain group and Account/Member Directory component coverage passed in the **94/94** group. |
| Preflight rejects normalized schemas missing Phase C columns | `d1-schema.test.ts` and `pnpm verify:identity` passed; the live query confirmed `result_json`, `scope_kind`, and `scope_id`. |
| Attendance filters authorized events before applying its result limit | `attendance-worker.test.ts` passed **43/43**, including corrected normalized event-scope cases. |
| Assignment/revoke/lifecycle reservation replay returns stored terminal outcomes | Account Access domain/handler suites passed **36/36**, including corrected replay/race paths. |
| Scoped role hierarchy removes out-of-scope definition metadata | Corrected hierarchy redaction passed in `role-hierarchy.test.ts`; the full identity verification group passed **91/91**. |
| Assignment `role_definition_ids` has a bounded maximum | Corrected handler validation passed in the Account Access **36/36** group, rejecting oversized input before mutation dispatch. |
| Legacy executable routes/symbols remain removed | Full direct audit and authenticated `404 NOT_FOUND` smoke below passed; no compatibility alias or dual authority path was added. |

### Exact obsolete-token, symbol, filename, and route audit

The direct full-tree search over executable `web` and `tests` scopes found only these allowed primary legacy-token references:

- `web/lib/identity/preflight.ts:17-21` — the explicit legacy table-name list used for read-only stale-schema detection and manual reset instructions.
- `web/lib/identity/d1-schema.test.ts:185-211` — stale-schema detection and no-auto-drop test setup/cleanup.
- `web/lib/auth/normalized-authority-c487.test.ts:817-892` — fresh-schema absence and stale-schema/no-auto-drop test setup/cleanup.

The same full `web` + `tests` search returned **no matches** for `RolePolicyStore`, `hasActiveManagementGrant`, `ctx.actorRole`, `sectionsForRole`, `stableNavigationSections`, `ROLE_CAPABILITY_DEFAULTS`, `PermissionPolicy*`, `DepartmentManager*`, `ProgramLeader*`, `assignDepartmentManager`, `revokeDepartmentManager`, `assignProgramLeader`, or `revokeProgramLeader`.

The removed-route search found exactly the three route strings in `web/lib/identity/normalized-authority.test.ts:170-176`, where they are explicit `404`/`NOT_FOUND` route-absence assertions. No executable Manager, Leader, or account-permissions route/writer remains. The only legacy-named migration files are the retired `SELECT 1` histories listed above; they are not DDL/seed writers.

### C-487-01..07 current status matrix

| Row | Current status | Exact current evidence and remaining gap |
| --- | --- | --- |
| C-487-01 | **BLOCKED** | HTTP bootstrap smoke passed for Admin/Staff/Member (3 personas) with normalized sections/navigation and safe projections; identity verification passed **91/91** and sections passed in the focused component group. The dedicated `normalized-authority-c487.test.ts` and normalized identity Worker seams stopped before assertions (`0` tests), so the complete DM/PL and tamper persona matrix is not claimed. |
| C-487-02 | **BLOCKED** | Programs Worker/domain passed **145/145**, Programs components passed **210/210**, and the correctly seeded local Programs/Home journey passed **195/195**. The dedicated exact-scope/cross-scope/equal-higher/Member normalized Worker matrix remained blocked before assertions, so this row is not promoted to PASS. |
| C-487-03 | **BLOCKED** | Attendance Worker passed **43/43** and attendance/scanner components passed **76/76**; the corrected full Programs journey passed **195/195**. The dedicated normalized Program/Department scope and authentication-expiry Worker seam was blocked before assertions, so the complete attendance authority matrix is not claimed. |
| C-487-04 | **BLOCKED** | Auth Worker passed **47/47**, Home/CMS Worker **21/21**, management/action/directory component groups passed, and HTTP smoke proved Admin `200`, Member `403 FORBIDDEN`, and removed-route `404 NOT_FOUND`. The dedicated management/tamper Worker seam was blocked and clean live-ui had **6** stale copy/selector failures, so management completion is not claimed. |
| C-487-05 | **PARTIAL — direct D1/preflight subset** | Fresh 25-migration local D1, `db:seed:disposable` **6/6**, `db:seed:local` **19 + 11 + 6** commands, 9 accounts, 5 definitions, 39 grants, 6 active assignments, 7 normalized tables, zero legacy tables, required Phase C columns, protected order/scope, and `verify:identity` **91/91** passed. The dedicated Admin-all-on/bootstrap Worker assertion remains blocked before assertions. |
| C-487-06 | **PASS — executable audit and route absence** | Full `web` + `tests` primary/secondary audit has only the three allowed preflight/stale-schema locations and one explicit removed-route test location; all obsolete symbols and writers are absent. Authenticated HTTP smoke returned `404 NOT_FOUND` for account-permissions, Leader, and Manager route families. |
| C-487-07 | **BLOCKED** | W7 identity geometry passed **49/49**, shell responsive **92 passed/1 skipped**, shell geometry **28/28**, and seeded Programs E2E **195/195**. Clean live-ui completed **22/28** with 6 stale copy/selector failures, and no remote-CI parity claim is made. |

### External blockers, live gaps, manual owners, and scope

- The #487 normalized-authority and normalized-identity Worker files, plus the #485 Permission Editor Worker files, remain **BLOCKED before assertions** by the external Cloudflare-pool/Vite `EvalError`. Product assertions are `0`; no unsafe-eval bypass, source workaround, or test suppression was used. This is kept separate from the process-manager runtime failure.
- The required supervised `pnpm --dir web dev:local` path remains blocked by process-manager Node `v20.19.0` and `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`; explicit Node `v22.18.0` local Wrangler was used only with disposable local D1 and was stopped after evidence.
- The correctly seeded full Programs E2E is green at **195/195**. After resetting/reseeding the disposable D1 to remove the preceding journey's request state, the clean live-ui run is **22/28**, with the three exact contracts above failing at both configured viewports; no live-ui PASS or CI parity claim is made.
- `C-487-M1` Accessibility owner — keyboard-only Permission Editor at 320/1440, screen-reader Switch/provenance/bootstrap, reduced-motion, forced-colors, 200% zoom, and text-spacing checks — **MANUAL, unclaimed**.
- `C-487-M2` Device QA owner — real-device dock/safe-area behavior — **MANUAL, unclaimed**.
- `C-487-M3` CI owner — remote-CI parity — **MANUAL, unclaimed**.
- `C-487-M4` Release owner — production-promotion dry-run — **MANUAL, unclaimed**.
- No manual keyboard/AT, reduced-motion, forced-colors, zoom/text-spacing, real-device, remote-CI, production-promotion, WCAG, screenshot, image, or pixel-diff claim is made.

Only `docs/specs/s4-phase-c-acceptance-trace.md` is changed by this append. The child was clean before the append; no source/test/config/migration/schema/fixture or `#487` path was edited. The Phase C branch remains stopped before Phase D.
## #487 final authority correction revalidation — current cb7d303d

**Evidence scope:** Fresh isolated child `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/s4-c-487-evidence-latest` on branch `feat/s4-c-487-evidence-latest`, created from and verified at coordinator HEAD `cb7d303dc87ff36bb3b16fc75d2f3bbf6f210d85` (`feat/s4-c-stackable-identity-integration`). This is a documentation-only append after the final #487 authority correction. No source, test, configuration, migration, schema, fixture, #488/#489, Phase D, deployment, or production-data path was changed.

### Authority reread before checks

Before the first validation command, I reread implementation ticket `issue://487`, parent ticket `issue://475`, authoritative Specs `docs/specs/091-stackable-identity-backend.md` and `docs/specs/092-discord-identity-design-system-adoption.md`, the approved `local://s4-phase-c-identity-integration-plan.md` including Task 4 and the verbatim exact obsolete-caller audit, the full current `docs/specs/s4-phase-c-acceptance-trace.md` (2,539 lines; all historical sections and the prior current section), ADRs `docs/adr/0042-discord-like-stackable-role-model.md` and `docs/adr/0043-owned-civic-design-system-governance.md`, the Phase B trace `docs/specs/s4-phase-b-acceptance-trace.md`, and Phase B evidence `docs/qa/2026-08-28-s4-phase-b-foundation.md`.

The prior #487 reports reread were `agent://ReviewAuthority487`, `agent://ReviewCorrected487` (including its schema-invalid structured payload and complete transcript), `agent://FixAuthority487Review`, `agent://EvidenceCorrected487`, `agent://EvidenceFinalAuthority487`, `agent://TestAuthority487`, `agent://FixLegacyPermissionTest`, `agent://FixManagerFixture487`, and current `agent://FixFinalAuthority487`. The additional historical reports `agent://EvidenceAuthority487` and `agent://EvidenceAuthority487B` were also reread. No prior `READY` or historical PASS was promoted without checking the current child.

### Required Context7 CLI library and documentation lookup

The required lookups used `npx --yes ctx7@latest` before validation, not MCP Context7:

- Cloudflare Workers/D1: `npx --yes ctx7@latest library "Cloudflare Workers" "D1Database prepared statements batch transactions schema migrations"` selected `/cloudflare/workers-sdk`; docs selected `D1 batch transactions with prepared statements`, `D1 prepared statements + db.batch() user-facing pattern`, and `D1 binding, prepared statements, and query methods`.
- Vitest: `npx --yes ctx7@latest library vitest "run specific file expect requireAssertions async assertions"` selected `/vitest-dev/vitest`; docs selected `Run Vitest with Specific File`, `expect(actual, message?)`, `Async/Await with .resolves and .rejects`, and `expect.requireAssertions`.
- Playwright: `npx --yes ctx7@latest library playwright "viewport CSS pixels locator boundingBox route navigation webServer"` selected `/microsoft/playwright`; docs selected `Page.setViewportSize` and `Locator.boundingBox([options])`.
- Next Link: `npx --yes ctx7@latest library "Next.js" "App Router Link href URL object query parameters navigation"` selected `/vercel/next.js`; docs selected `Pass URL object to Link href in App Router`.
- Radix/CVA: library lookup selected `/radix-ui/primitives` and `/joe-bell/cva`; Radix docs selected `Switch Root renders button with data-state` and `Primitive asChild Dispatch (button → Slot)`, while CVA docs selected `Implement component variants with cva` and `VariantProps Type`.

### Provenance and runtime

- Coordinator reference: `.worktrees/s4-phase-c`, branch `feat/s4-c-stackable-identity-integration`, exact HEAD `cb7d303dc87ff36bb3b16fc75d2f3bbf6f210d85`.
- Fresh child: `/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/s4-c-487-evidence-latest`, exact HEAD `cb7d303dc87ff36bb3b16fc75d2f3bbf6f210d85`; the child was clean before this append.
- Node `v22.18.0`; pnpm `11.7.0`; web Vitest `4.1.10`; Wrangler `4.127.1`; web TypeScript `5.9.3`; Playwright `1.62.1`; pinned Chromium `151.0.7922.34` / revision `v1234`.
- The supervised `pnpm --dir web dev:local` attempt resolved process-manager Node `v20.19.0` and failed with `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`. Direct Node `v22.18.0` Wrangler was used only with disposable local D1 and a process-only test secret variable for local smoke/E2E.

### Fresh focused Worker/domain checks

| Check | Exact current result |
| --- | --- |
| `pnpm verify:identity` | **PASS — 4 files, 93/93** |
| `pnpm --dir web exec vitest run --config vitest.config.ts lib/auth/normalized-authority-c487.test.ts` | **BLOCKED before assertions — exit 1; Test Files no tests, Tests no tests, Errors 1; external `@cloudflare/vitest-pool-workers`/Vite `EvalError: Code generation from strings disallowed for this context`; product assertions 0** |
| `pnpm --dir web exec vitest run --config vitest.config.ts lib/identity/normalized-authority.test.ts` | **BLOCKED before assertions — exit 1; same external EvalError; product assertions 0** |
| `pnpm --dir web exec vitest run --config vitest.config.ts lib/identity/permission-editor.test.ts lib/identity/permission-editor-handlers.test.ts` | **BLOCKED before assertions — exit 1; Test Files no tests, Tests no tests, Errors 2; same external EvalError; product assertions 0** |
| Account Access/lifecycle: `lib/identity/account-access.test.ts lib/identity/account-access-handlers.test.ts` | **PASS — 2 files, 36/36** |
| Historical Program-scope assignment: `lib/identity/account-access-history.test.ts` | **PASS — 1 file, 1/1** on isolated disposable Worker D1 |
| Programs: `lib/programs/programs.test.ts lib/programs/capabilities.test.ts lib/programs/account-directory.test.ts lib/programs/member-directory.test.ts lib/programs/hub-directory.test.ts` | **PASS — 5 files, 146/146** |
| Attendance: `lib/attendance-worker.test.ts` | **PASS — 1 file, 43/43** |
| Auth: `worker.auth.test.ts` | **PASS — 1 file, 47/47** |
| Home/CMS: `lib/home-worker.test.ts lib/home-cms-worker.test.ts` | **PASS — 2 files, 21/21** |

The three pool-blocked runs were kept separate from the passing identity/domain checks and from the #485 pool classification. No unsafe-eval bypass, source workaround, test suppression, or assertion weakening was used.

### Fresh focused component checks

| Surface group | Exact current result |
| --- | --- |
| Sections, Account Access/API, Directory/DirectoryFrame, Account/Member Directory, Role Hierarchy | **PASS — 7 files, 94/94** |
| Programs Workspace, Events, Participants, Notifications, Settings, Department, and related management modules | **PASS — 15 files, 210/210**; jsdom emitted only `Not implemented: navigation to another Document` |
| Attendance/scanner/operator/roster/self-check-in | **PASS — 8 files, 76/76**; jsdom emitted only `Not implemented: Window's scrollTo() method` notices |
| Home/CMS | **PASS — 2 files, 22/22** |
| Management actions, redirects, and hub | **PASS — 3 files, 26/26** |
| Permission Editor | **PASS — 1 file, 8/8** |

### Fresh TypeScript, build, and numeric geometry checks

| Check | Exact current result |
| --- | --- |
| `pnpm typecheck` | **PASS — root and `tests/e2e` TypeScript** |
| `pnpm --dir web typecheck` | **PASS — web and Worker TypeScript** |
| `pnpm --dir web build` | **PASS — 18/18 generated static pages; 16 visible route rows**: `/`, `/_not-found`, `/events`, `/guest-check-in`, `/home`, `/management`, `/messages`, `/notices`, `/permissions`, `/profile`, `/profile/settings`, `/programs`, `/prototype`, `/register`, `/registrations`, `/scanner` |
| `pnpm test:role-hierarchy-geometry` | **PASS — 49/49 numeric tests** across `320, 390, 600, 799, 800, 1024, 1440` CSS px (Account Access 14, Permission Editor 14, Role Hierarchy 21) |
| `pnpm test:shell-responsive` | **PASS — 92 passed, 1 skipped; exit 0** |
| `pnpm test:shell-geometry` | **PASS — 28/28** |

These are numeric CSS-pixel checks only. No screenshot, image snapshot, pixel-diff, manual accessibility, or WCAG conformance claim is made.

### Red/fix coverage

The current HEAD includes the final correction worker's red/fix coverage. Before those fixes, the added regression cases failed for Program-parent scope during same-Department reorder, comma-containing opaque account IDs, revoked assignment history resolving its original Program scope, and scoped Management Hub discoverability. Current focused coverage passed for:

- correlated Program parent Department resolution in same-Department reorder, with cross-Department denial retained;
- JSON-preserved opaque account IDs in hierarchy assignment projections;
- immutable revoked assignment scope snapshots and parent-Department authorization filtering (`account-access-history.test.ts`, 1/1);
- scoped Hub permission/read/assign/revoke projection and Account Access/Permission Editor destinations;
- live-ui normalized identity copy, current permission title/lead/list labels, and Member Directory heading contracts;
- bounded assignment ID validation, preflight required-column detection, Member Directory scope redaction, attendance filter-before-limit, and terminal reservation replay.

The dedicated normalized C-487 Worker cases remain unavailable because the pool failed before assertions; these passing correction regressions do not promote the blocked rows to full PASS.

### Fresh disposable D1 migrations, seeds, and normalized queries

- The required default local commands succeeded before the long E2E runs: `pnpm --dir web exec wrangler d1 migrations apply efcc-identity --local` applied **25 migrations**; `pnpm db:seed:disposable` completed **6/6** commands; `pnpm db:seed:local` completed **19 + 11 + 6** commands; and `DEMO_TARGET_URL=http://127.0.0.1:8797 pnpm db:seed:demo` completed with the four demo Programs, 13 recurring events, module-gate fixture, participant notices, and Home content.
- After the long E2E mutation history, a later attempt to run `pnpm db:seed:local` against the already-mutated shared default local D1 failed at `role_assignments: terminal assignment rows are immutable: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_TRIGGER)`. This is recorded rather than presented as a clean reset.
- Fresh temporary D1 proof used Wrangler `--persist-to /tmp/efcc-c487-final-d1-20260830`: **25 migrations** applied; disposable seed **6/6**; query returned **5 accounts, 5 Role Definitions, 39 grants, 4 active assignments**; exactly the seven normalized identity tables (`role_assignments`, `role_audit_events`, `role_categories`, `role_definition_grants`, `role_definitions`, `role_policy_mutations`, `role_policy_revisions`); **zero** rows for all five legacy tables; protected order `admin=0`, `member=999`; exact Department/Program scopes; `role_policy_mutations.result_json`; and `role_assignments.scope_kind/scope_id`.
- A separate fresh temporary D1 with generated dev-account and disposable seeds was used for the clean Member Directory run below. No remote, Apps Script, Google Sheets, Cloudflare production, or other external database was written.

### Local Worker HTTP smoke

With the direct Node 22 Wrangler process and disposable local D1, cookie login plus `/api/v1/auth/me` returned `200` for the three dev fixtures:

- Admin: `systemRole=Admin`, safe `系統管理員` Global identity, sections `home,programs,scanner,management,profile,events`, navigation `home,programs,scanner,management,profile`, 24 true capabilities.
- Staff: `systemRole=Staff`, safe `同工` Global identity, the same normalized management/event sections and navigation, 22 true capabilities.
- Member: `systemRole=null`, no identity summary, sections/navigation `home,programs,scanner,notices,profile`, automatic baseline capability count 1.

The Admin request to `/api/v1/programs/accounts` returned `200`; the Member request returned `403 FORBIDDEN`. Authenticated requests to `/api/v1/programs/account-permissions`, `/api/v1/programs/<program>/leaders`, and `/api/v1/programs/departments/<department>/managers` each returned `404 NOT_FOUND` with RFC Problem Details and matching request correlation.

### Full Programs, live-ui, and Member Directory E2E

- `PROGRAMS_TARGET_URL=http://127.0.0.1:8797 pnpm exec playwright test --config=tests/e2e/programs-d1.config.ts` was run twice against cleanly reseeded local fixtures. Attempt 1 scheduled **195** tests and ended **175 passed, 17 failed, 2 flaky, 1 did not run**. Attempt 2 scheduled **195** and ended **114 passed, 79 failed, 1 flaky, 1 did not run**. In both attempts the explicit Node 22 Wrangler Worker died during the long run with an external Miniflare/Wrangler `ProxyController` error; the later failures were `ERR_CONNECTION_REFUSED` cascades. No full Programs PASS is claimed.
- After a clean reset/reseed, `AUTH_UI_TARGET_URL=http://127.0.0.1:8797 pnpm exec playwright test --config=tests/e2e/live-ui.config.ts` scheduled **28** and completed **28/28 passed** at phone `375x667` and desktop `1280x720`.
- The first Member Directory attempt on the already-mutated shared D1 failed on both original and retry runs at `tests/e2e/member-directory.test.ts:299`, missing `getByRole('button', { name: 'E2E Staff', exact: true })`; it is not used as clean-fixture evidence. A fresh temporary D1 with complete generated dev + disposable seeds and `--live-reload=false` Worker was then used: `PROGRAMS_TARGET_URL=http://127.0.0.1:8798 pnpm exec playwright test --config=tests/e2e/member-directory.config.ts` completed **1/1 passed** on desktop.

### Exact obsolete-token, symbol, filename, and route audit

The direct clean-tree search over executable `web/lib`, `web/app`, `web/worker.ts`, `web/migrations`, and `tests` scopes found only these primary legacy-token references:

- `web/lib/identity/preflight.ts:17-21` — the explicit five-name legacy table list for read-only stale-schema detection and manual reset instructions.
- `web/lib/identity/d1-schema.test.ts:185-211` — stale-schema/no-auto-drop test setup and cleanup.
- `web/lib/auth/normalized-authority-c487.test.ts:817-892` — fresh-schema absence and stale-schema/no-auto-drop test setup and cleanup.

The same search returned **no matches** for `RolePolicyStore`, `hasActiveManagementGrant`, `ctx.actorRole`, `sectionsForRole`, `stableNavigationSections`, `ROLE_CAPABILITY_DEFAULTS`, `PermissionPolicy*`, `DepartmentManager*`, `ProgramLeader*`, `assignDepartmentManager`, `revokeDepartmentManager`, `assignProgramLeader`, or `revokeProgramLeader`.

The removed-route search found only `web/lib/identity/normalized-authority.test.ts:170-176`, explicit `404`/`NOT_FOUND` assertions for the three removed paths. `tests/e2e/programs-d1.test.ts:5-6` contains only a historical comment naming the former Leaders manager scenario; it is not a route call. The legacy-named migration files are retired `SELECT 1` histories, not DDL/seed writers. The supplementary `accounts.role` hits are compatibility/import fields, fixture/tamper-test setup, or UI role-filter input mapped to normalized `role_definitions.stable_key`; no authority decision reads `accounts.role`.

### C-487-01..07 current status matrix

| Row | Current status | Exact current evidence and remaining gap |
| --- | --- | --- |
| C-487-01 | **BLOCKED** | Direct normalized HTTP smoke passed for Admin/Staff/Member (`auth/me` 200) with capability-driven sections/navigation and safe projections; identity verification passed **93/93**; component sections passed in the 94/94 group. The dedicated `normalized-authority-c487.test.ts` and `normalized-authority.test.ts` stopped before assertions (`0`), so DM/PL, custom, and tamper persona proof is incomplete. |
| C-487-02 | **BLOCKED** | Programs Worker/domain **146/146**, Programs/Department components **210/210**, and correction regressions passed. Both full local Programs runs died in the external Worker process (`175/195` then `114/195` completed before connection-refused cascades), so the complete exact-scope/cross-scope/equal-higher/Member matrix is not claimed. |
| C-487-03 | **BLOCKED** | Attendance Worker **43/43** and attendance/scanner components **76/76** passed; normalized attendance corrections passed in the available domain tests. The dedicated normalized scope/auth-expiry Worker seam was blocked before assertions, and full Programs E2E was externally interrupted. |
| C-487-04 | **BLOCKED** | Auth Worker **47/47**, Home/CMS Worker **21/21**, management components **26/26**, and local HTTP smoke (Admin 200, Member 403, removed routes 404) passed. The dedicated normalized management/tamper Worker seam was blocked before assertions; no complete management acceptance claim is made despite live-ui **28/28**. |
| C-487-05 | **PARTIAL — direct D1/preflight subset** | Fresh temporary D1 proved 25 migrations, normalized seed counts, seven identity tables, zero legacy tables, protected order/scopes, and required columns; default `db:seed:disposable`/`db:seed:local`/`db:seed:demo` commands had successful runs. The post-E2E shared-D1 reset hit the immutable terminal-assignment trigger, and dedicated Admin-all-on bootstrap assertions were blocked before Worker assertions. |
| C-487-06 | **PASS — executable audit and route absence** | Primary legacy tokens have only the three allowed preflight/stale-schema test locations; secondary authority symbols and old writers are absent; authenticated smoke returned `404 NOT_FOUND` for account-permissions, Leader, and Manager routes. |
| C-487-07 | **BLOCKED** | Identity W7 **49/49**, shell responsive **92 passed/1 skipped**, shell geometry **28/28**, live-ui **28/28**, and clean Member Directory **1/1** passed. Full Programs D1 remained externally interrupted in both runs; no remote-CI parity claim is made. |

### External blockers, manual owners, and scope

- The normalized-authority, normalized-identity, and #485 Permission Editor Worker files remain **BLOCKED before assertions** by the external Cloudflare-pool/Vite `EvalError: Code generation from strings disallowed for this context`; product assertions are **0** for each blocked run. No unsafe-eval bypass, source workaround, or test suppression was used.
- The supervised `pnpm --dir web dev:local` path remains blocked by process-manager Node `v20.19.0` / `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`. Direct Node `v22.18.0` Wrangler was local-only and used disposable D1.
- Full Programs D1 E2E remains blocked by the external Miniflare/Wrangler `ProxyController` process death and connection-refused cascades; the exact partial counts above are retained. The clean live-ui and clean temporary-D1 Member Directory results are separate and are not used to imply a full Programs PASS.
- `C-487-M1` Accessibility owner — keyboard-only and screen-reader review of Permission Editor, Account Access, bootstrap/management, plus reduced-motion, forced-colors, 200% zoom, and text-spacing — **MANUAL, unclaimed**.
- `C-487-M2` Device QA owner — iOS/Android real-device dock and safe-area behavior at 320/390 — **MANUAL, unclaimed**.
- `C-487-M3` CI owner — remote-CI parity — **MANUAL, unclaimed**.
- `C-487-M4` Release owner — production-promotion dry-run — **MANUAL, unclaimed**.
- No manual keyboard/AT, WCAG, reduced-motion, forced-colors, zoom/text-spacing, real-device, remote-CI, production-promotion, screenshot, image, or pixel-diff claim is made.

Only `docs/specs/s4-phase-c-acceptance-trace.md` is changed by this append. No source, test, configuration, migration, schema, fixture, `#487` path, `#488/#489`, Phase D, deployment, or external database file was edited. The child remains stopped before Phase D.

## #487 final audit/reset revalidation — current `dfba15d1`

**Evidence scope:** Fresh isolated child
`/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/s4-c-487-final-revalidation`
on branch `evidence/s4-c-487-final-revalidation`, created from and verified at
the coordinator's exact HEAD
`dfba15d11366e4b13b706567227a1e40603c095c`
(`feat/s4-c-stackable-identity-integration`). The child was clean before this
append. This section is documentation-only. No source, test, configuration,
migration, schema, fixture, deployment, `#488/#489`, Phase D, remote, or
production-data path was changed.

### Authority reread before checks

Before the first validation command, I reread implementation ticket
`issue://487`, parent ticket `issue://475`, Specs
`docs/specs/091-stackable-identity-backend.md` and
`docs/specs/092-discord-identity-design-system-adoption.md`, the approved
`local://s4-phase-c-identity-integration-plan.md` including Task 4 and the
verbatim exact obsolete-caller audit, the complete current
`docs/specs/s4-phase-c-acceptance-trace.md` (all 2,680 lines and historical
sections), ADRs
`docs/adr/0042-discord-like-stackable-role-model.md` and
`docs/adr/0043-owned-civic-design-system-governance.md`, the Phase B trace
`docs/specs/s4-phase-b-acceptance-trace.md`, and Phase B evidence
`docs/qa/2026-08-28-s4-phase-b-foundation.md`.

The complete prior #487 report set reread before checks was
`agent://ReviewFinalAuthority`, `agent://ReviewCorrected487` (including its
schema-invalid structured payload and complete transcript),
`agent://FixAliasesAndReset487`, `agent://FixFinalAuthority487`,
`agent://EvidenceLatest487`, `agent://ReviewAuthority487`,
`agent://FixAuthority487Review`, `agent://EvidenceAuthority487`,
`agent://EvidenceAuthority487B`, `agent://EvidenceFinalAuthority487`,
`agent://EvidenceCorrected487`, `agent://TestAuthority487`,
`agent://FixLegacyPermissionTest`, and `agent://FixManagerFixture487`.
Implementation and parent/spec tickets were read before validation.

### Runtime and required Context7 CLI lookups

Observed runtime: Node `v22.18.0`, pnpm `11.7.0`, web Vitest `4.1.10`,
Wrangler `4.127.1`, Playwright CLI `1.61.0`, root TypeScript `7.0.2`, and
web TypeScript `5.9.3`. The required lookups used the Context7 CLI
(`npx --yes ctx7@latest`), not MCP Context7, before validation:

- Cloudflare/D1 library command
  `npx --yes ctx7@latest library "Cloudflare Workers" "D1Database prepared statements batch transactions schema migrations"`
  selected `/cloudflare/workers-sdk` (result artifact `8767`).
  Docs command
  `npx --yes ctx7@latest docs /cloudflare/workers-sdk "D1Database prepare bind batch transaction atomic migrations PRAGMA table_info"`
  returned `D1 batch transactions with prepared statements` and
  `D1 binding, prepared statements, and query methods` (artifact `8769`).
- Vitest library command
  `npx --yes ctx7@latest library vitest "Run Vitest with Specific File expect requireAssertions async assertions"`
  selected `/vitest-dev/vitest` (artifact `8771`). Docs command
  `npx --yes ctx7@latest docs /vitest-dev/vitest "Run Vitest with Specific File expect(actual, message?) expect.requireAssertions async test assertions"`
  returned `expect(actual, message?)`, `Verify assertion count with
  expect.assertions in TypeScript`, and concurrent-test assertion guidance
  (artifact `8773`).
- Playwright library command
  `npx --yes ctx7@latest library playwright "viewport CSS pixels locator boundingBox route navigation webServer"`
  selected `/microsoft/playwright` (artifact `8775`). Docs command
  `npx --yes ctx7@latest docs /microsoft/playwright "Locator.boundingBox CSS pixels Page.setViewportSize route navigation webServer"`
  returned `Locator.boundingBox([options])` and `Page.setViewportSize`
  (artifact `8777`).
- Next library command
  `npx --yes ctx7@latest library "Next.js" "App Router Link href URL object query parameters navigation"`
  selected `/vercel/next.js` (artifact `8779`). Docs command
  `npx --yes ctx7@latest docs /vercel/next.js "Pass URL object to Link in App Router query parameters navigation"`
  returned `Pass URL object to Link in App Router` and `Pass a URL Object to
  Link` (artifact `8781`).
- Radix library command
  `npx --yes ctx7@latest library "Radix UI" "Switch Root asChild Slot accessible semantics"`
  included `/radix-ui/primitives` (artifact `8783`). Docs commands
  `npx --yes ctx7@latest docs /radix-ui/primitives "Switch Root renders button role switch aria-checked data-state checked disabled keyboard"`
  and `npx --yes ctx7@latest docs /radix-ui/primitives "Switch Root role aria-checked disabled keyboard Primitive asChild Slot composition"`
  returned `Switch Root renders button with data-state`, Switch props/ref
  forwarding, Primitive `asChild`/Slot dispatch, and Checkbox accessibility
  sections (artifacts `8788` and `8786`).
- CVA library command
  `npx --yes ctx7@latest library "CVA class variance authority" "cva variants VariantProps compoundVariants"`
  selected `/joe-bell/cva`. Docs command
  `npx --yes ctx7@latest docs /joe-bell/cva "Implement component variants with cva VariantProps Type compoundVariants defaultVariants"`
  returned `Implement component variants with cva` and `Validate Types at
  Compile-Time` (artifact `8790`).

### Fresh focused Worker/domain checks

| Check | Exact current result |
| --- | --- |
| `pnpm verify:identity` | **PASS — 4 files, 93/93** |
| Dedicated #487 Worker: `pnpm --dir web exec vitest run --config vitest.config.ts lib/auth/normalized-authority-c487.test.ts` | **BLOCKED before assertions — exit 1; Test Files no tests, Tests no tests, Errors 1; external `@cloudflare/vitest-pool-workers`/Vite `EvalError: Code generation from strings disallowed for this context`; product assertions 0** |
| Normalized identity: `pnpm --dir web exec vitest run --config vitest.config.ts lib/identity/normalized-authority.test.ts` | **BLOCKED before assertions — exit 1; Test Files no tests, Tests no tests, Errors 1; same external EvalError; product assertions 0** |
| Permission Editor Worker pair: `pnpm --dir web exec vitest run --config vitest.config.ts lib/identity/permission-editor.test.ts lib/identity/permission-editor-handlers.test.ts` | **BLOCKED before assertions — exit 1; Test Files no tests, Tests no tests, Errors 2; same external EvalError; product assertions 0** |
| Account Access/lifecycle: `pnpm --dir web exec vitest run --config vitest.config.ts lib/identity/account-access.test.ts lib/identity/account-access-handlers.test.ts` | **PASS — 2 files, 36/36** |
| Immutable assignment history: `pnpm --dir web exec vitest run --config vitest.config.ts lib/identity/account-access-history.test.ts` | **PASS — 1 file, 1/1** |
| Programs Worker/domain: `pnpm --dir web exec vitest run --config vitest.config.ts lib/programs/programs.test.ts lib/programs/capabilities.test.ts lib/programs/account-directory.test.ts lib/programs/member-directory.test.ts lib/programs/hub-directory.test.ts` | **PASS — 5 files, 146/146** |
| Attendance Worker: `pnpm --dir web exec vitest run --config vitest.config.ts lib/attendance-worker.test.ts` | **PASS — 1 file, 43/43** |
| Auth Worker: `pnpm --dir web exec vitest run --config vitest.config.ts worker.auth.test.ts` | **PASS — 1 file, 47/47** |
| Home/CMS Worker: `pnpm --dir web exec vitest run --config vitest.config.ts lib/home-worker.test.ts lib/home-cms-worker.test.ts` | **PASS — 2 files, 21/21** |
| Alias regression: `pnpm --dir web exec vitest run --config vitest.components.config.ts lib/account-access-api.test.ts` | **PASS — 1 file, 2/2** |
| Reset SQL regression: `pnpm exec vitest run tests/e2e/seed-dev-accounts.test.ts` | **PASS — 1 file, 1/1**; generated assignment deletes require `revoked_at IS NULL` |

### Fresh focused component checks

| Surface group | Exact current result |
| --- | --- |
| Sections, Account Access/API, Directory/DirectoryFrame, Account/Member Directory, Role Hierarchy | **PASS — 7 files, 95/95** |
| Programs Workspace, Events, Participants, Notifications, Settings, Department, and related management modules | **PASS — 15 files, 210/210**; jsdom emitted only `Not implemented: navigation to another Document` |
| Attendance/scanner/operator/roster/self-check-in | **PASS — 8 files, 76/76**; jsdom emitted only `Not implemented: Window's scrollTo() method` notices |
| Home/CMS | **PASS — 2 files, 22/22** |
| Management actions, redirects, and hub | **PASS — 3 files, 26/26** |
| Permission Editor | **PASS — 1 file, 8/8** |

### Fresh TypeScript, build, and numeric geometry checks

| Check | Exact current result |
| --- | --- |
| Root/E2E/Worker/web TypeScript | `pnpm typecheck && pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json && pnpm --dir web exec tsc --noEmit -p tsconfig.worker.json && pnpm --dir web exec tsc --noEmit -p tsconfig.json` — **PASS, exit 0, no diagnostics** |
| Web production build | `pnpm --dir web build` — **PASS; 18/18 static pages; 16 visible route rows**: `/`, `/_not-found`, `/events`, `/guest-check-in`, `/home`, `/management`, `/messages`, `/notices`, `/permissions`, `/profile`, `/profile/settings`, `/programs`, `/prototype`, `/register`, `/registrations`, `/scanner` |
| W7 identity geometry | `pnpm test:role-hierarchy-geometry` — **PASS, 49/49 numeric tests** across `320, 390, 600, 799, 800, 1024, 1440` CSS px: Account Access 14, Permission Editor 14, Role Hierarchy 21 |
| Shell responsive geometry | `pnpm test:shell-responsive` — **PASS, 92 passed, 1 skipped, exit 0** |
| Shell geometry | `pnpm test:shell-geometry` — **PASS, 28/28** |

These are numeric CSS-pixel checks only. No screenshot, image snapshot,
pixel-diff, manual accessibility, or WCAG conformance claim is made.

### Fresh disposable D1 migration, seed, reset, and query proof

The default child-local D1 was freshly migrated with
`pnpm --dir web exec wrangler d1 migrations apply efcc-identity --local`:
all **25 versioned migrations** applied. The initial
`pnpm db:seed:disposable` completed **6/6** commands, and the initial
`pnpm db:seed:local` completed **19 + 11 + 6** commands. The direct
`DEMO_TARGET_URL=http://127.0.0.1:8797 pnpm db:seed:demo` run completed with
the four demo Programs, 13 recurring events, the module-gate fixture,
participant notices, and Home content.

Using the local-only Node 22 Wrangler Worker, Admin added the seeded
Department identity to `U-E2E-STAFF`, revoked that assignment, and archived
`department.manager.adult`; each API mutation returned `200`. Before reset,
the normalized query showed the new revoked assignment plus the archived
role (`is_archived=1`) and **2** terminal assignments total. Running
`pnpm db:seed:local` after this revoke/archive sequence completed
**19 + 11 + 6** commands successfully. The post-reset query retained the
revoked assignment's immutable ID, timestamp, Department `scope_kind`, and
`scope_id`; it reported **0** active duplicate pairs and preserved
**2** terminal assignments. A second `pnpm db:seed:local` repeat also
completed **19 + 11 + 6** commands; its query returned **25** migrations,
**9** accounts, **5** Role Definitions, **39** grants, **5** active
assignments, **2** terminal assignments, and **0** duplicate active pairs,
with the same revoked assignment still present. The final
`DEMO_TARGET_URL=http://127.0.0.1:8797 pnpm db:seed:demo` repeat completed
successfully (`Demo home content already present`).

The final normalized query returned:

- exactly **7** expected identity tables:
  `role_assignments`, `role_audit_events`, `role_categories`,
  `role_definition_grants`, `role_definitions`, `role_policy_mutations`, and
  `role_policy_revisions`;
- **zero** rows/tables for each retired authority table:
  `role_capabilities`, `department_managers`, `program_leaders`,
  `permission_policy_state`, and `permission_policy_mutations`;
- protected order `admin=0`, `member=999`; Staff at `1`; Department identity
  at `10` with exact scope
  `018f3b8a-0000-7000-8000-000000000002`; Program identity at `20` with
  exact scope
  `018f3b8a-0000-7000-8000-300000000001`;
- `role_policy_mutations.result_json` and
  `role_assignments.scope_kind`/`scope_id` present by `PRAGMA table_info`.

No remote, Apps Script, Google Sheets, Cloudflare production, or other
external database was written.

### Local Worker HTTP smoke

The required supervised `pnpm --dir web dev:local` attempt was made first
through the process manager and exited before readiness: it resolved Node
`v20.19.0` and raised
`ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` from the pnpm launcher. A direct
Node `v22.18.0` Wrangler process with only the local
`EFCC_ACCESS_TOKEN_SECRET` variable then served `http://127.0.0.1:8797` for
HTTP smoke and the demo seed; it was stopped after evidence.

Cookie login plus `/api/v1/auth/me` returned `200` for all three dev
personas:

- Admin: `systemRole=Admin`, one safe `系統管理員`/Global identity,
  sections `home,programs,scanner,management,profile,events`, navigation
  `home,programs,scanner,management,profile`, **24** true capabilities.
- Staff: `systemRole=Staff`, one safe `同工`/Global identity, the same
  sections/navigation, **22** true capabilities.
- Member: `systemRole=null`, no identity summary, sections/navigation
  `home,programs,scanner,notices,profile`, automatic baseline **1** true
  capability.

Authenticated smoke returned `200` for Admin
`GET /api/v1/programs/accounts` and `403 FORBIDDEN` for Member. Each removed
route returned `404 NOT_FOUND` with RFC Problem Details:
`/api/v1/programs/account-permissions`,
`/api/v1/programs/<program>/leaders`, and
`/api/v1/programs/departments/<department>/managers`.

### Clean-fixture full E2E status

A separate clean temporary local D1 was created under
`/tmp/efcc-c487-final-e2e-d1-20260830`; direct Node 22 Wrangler applied
25 migrations and the generated disposable/dev seeds plus demo seed. The
full command
`PROGRAMS_TARGET_URL=http://127.0.0.1:8798 pnpm exec playwright test --config=tests/e2e/programs-d1.config.ts`
scheduled **195** tests and ended **98 passed, 95 failed, 2 did not run**,
exit 1. The first product failure was the revoked/unknown direct management
link expecting `課程管理範圍已失效` at
`tests/e2e/programs-d1.test.ts:2636`; the Worker then exited with Wrangler
`✘ [ERROR]` and subsequent attempts cascaded as
`net::ERR_CONNECTION_REFUSED`. This is not a full Programs PASS and no
process-death or partial count is promoted to a pass claim.

After a fresh reset/reseed of a separate clean temporary local D1, the full
command
`AUTH_UI_TARGET_URL=http://127.0.0.1:8798 pnpm exec playwright test --config=tests/e2e/live-ui.config.ts`
scheduled **28** and completed **28/28 passed** at phone `375x667` and
desktop `1280x720`. After another clean reset/reseed of that temporary D1,
`PROGRAMS_TARGET_URL=http://127.0.0.1:8798 pnpm exec playwright test --config=tests/e2e/member-directory.config.ts --project=desktop`
completed **1/1 passed**. These successful live runs are separate from the
interrupted 195-test Programs process and do not imply a full Programs pass.

### Exact obsolete-token, symbol, alias, filename, and route audit

The direct executable-scope audit covered `web/lib`, `web/app`,
`web/worker.ts`, `web/migrations`, and `tests`. A full tracked-file scan
reported:

| Audit | Tracked hits | Executable-scope hits | Docs/history hits | Classification |
| --- | ---: | ---: | ---: | --- |
| Primary retired table tokens | 52 | 22 | 30 | All 22 executable hits are the explicit five-name `preflight.ts` manual-reset list and the stale-schema/no-auto-drop setup/cleanup in `d1-schema.test.ts` and `normalized-authority-c487.test.ts`; no production authority writer/read remains. |
| Secondary retired symbols | 28 | 0 | 28 | No executable match for `RolePolicyStore`, `hasActiveManagementGrant`, `ctx.actorRole`, `sectionsForRole`, `stableNavigationSections`, `ROLE_CAPABILITY_DEFAULTS`, `PermissionPolicy*`, `DepartmentManager*`, `ProgramLeader*`, or the old Manager/Leader writer names. |
| Removed route strings | 43 | 3 | 39 | The only executable hits are `web/lib/identity/normalized-authority.test.ts:171-173`, explicit `404`/`NOT_FOUND` route-absence assertions for account-permissions, Leader, and Manager paths. |

The alias-specific scan found **21** related lines, all classified as either
the canonical `updateRoleDefinitionLifecycle` client function used by the
Account Access UI/tests or the intentional negative assertions in
`web/lib/account-access-api.test.ts:24-42`; no forbidden
`getEligibleAccounts`, `getAccountAssignments`,
`handleGetEligibleAccounts`, `handlePostRoleDefinitionLifecycle`,
`handleGetAccountAssignments`, `handlePostAccountAssignments`, or
`handleLifecycle` export remains. The three legacy-named migration files are
retired `SELECT 1` histories, not DDL/seed writers. Retained `accounts.role`
fields are login/import/display compatibility data only; no authority,
navigation, scope, or directory SQL read was found.

### C-487-01..07 current status matrix

| Row | Current status | Exact current evidence and remaining gap |
| --- | --- | --- |
| C-487-01 | **BLOCKED** | Local HTTP bootstrap smoke passed for Admin/Staff/Member (`auth/me` 200) with capability-driven sections/navigation and safe projections; `verify:identity` passed **93/93**, sections were included in the **95/95** component group, and alias/reset regressions passed. The dedicated `normalized-authority-c487.test.ts` stopped before assertions (`0`), so DM/PL/custom and complete tamper/persona Worker proof is not claimed. |
| C-487-02 | **BLOCKED** | Programs Worker/domain passed **146/146** and Programs components **210/210**. The clean full Programs E2E scheduled **195** but ended **98 passed, 95 failed, 2 did not run** after a product failure followed by Worker process death and connection-refused cascades; the dedicated exact-scope/cross-scope/equal-higher/Member Worker matrix remains blocked before assertions. |
| C-487-03 | **BLOCKED** | Attendance Worker passed **43/43** and attendance/scanner components **76/76**; full live-ui passed **28/28** and member-directory passed **1/1** on clean fixtures. The dedicated normalized Program/Department scope and authentication-expiry Worker seam remained blocked before assertions, and the full Programs E2E was interrupted. |
| C-487-04 | **BLOCKED** | Auth Worker **47/47**, Home/CMS Worker **21/21**, management components **26/26**, alias/reset regressions **2/2** and **1/1**, HTTP Admin `200`, Member `403 FORBIDDEN`, and removed-route `404 NOT_FOUND` smoke all passed. The dedicated normalized management/tamper Worker seam remained blocked before assertions; no complete management acceptance claim is made. |
| C-487-05 | **PARTIAL — direct D1/preflight/reset subset** | Fresh 25-migration D1, disposable seed **6/6**, local reset/reseed **19 + 11 + 6** repeated after revoke/archive, demo seed repeats, normalized counts/columns/protected order, zero retired tables, immutable terminal-history retention, and `verify:identity` **93/93** plus reset regression **1/1** passed. The dedicated Admin-all-on/bootstrap Worker assertion remains blocked before assertions. |
| C-487-06 | **PASS — executable audit and route absence** | Full tracked audit has 22 primary executable hits, all allowed preflight/stale-schema test references; secondary retired symbols are zero; removed route strings are only the three explicit absence assertions; alias regression passed **2/2**; authenticated smoke returned `404 NOT_FOUND` for account-permissions, Leader, and Manager routes. |
| C-487-07 | **BLOCKED** | W7 identity geometry **49/49**, shell responsive **92 passed/1 skipped**, shell geometry **28/28**, clean live-ui **28/28**, and clean member-directory **1/1** passed. Full Programs E2E ended **98/195 passed, 95 failed, 2 did not run** after Worker process death; no remote-CI parity claim is made. |

### External blockers, manual owners, and scope

- The #487 normalized-authority and normalized-identity Worker files plus the
  #485 Permission Editor Worker files remain **BLOCKED before assertions**
  by the external Cloudflare-pool/Vite
  `EvalError: Code generation from strings disallowed for this context`;
  each blocked run reported product assertions **0**. No unsafe-eval bypass,
  source workaround, test suppression, or assertion weakening was used.
- The required supervised `pnpm --dir web dev:local` path remains blocked
  before readiness by process-manager Node `v20.19.0` and
  `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`. Direct Node `v22.18.0` Wrangler
  was local-only and used disposable D1. The clean Programs E2E Worker also
  exited during the long run; the exact **98/95/2** result and subsequent
  `ERR_CONNECTION_REFUSED` cascade are retained without a pass claim.
- `C-487-M1` Accessibility owner — keyboard-only and screen-reader review of
  Permission Editor, Account Access, bootstrap/management, plus
  reduced-motion, forced-colors, 200% zoom, and text-spacing — **MANUAL,
  unclaimed**.
- `C-487-M2` Device QA owner — iOS/Android real-device dock and safe-area
  behavior at 320/390 — **MANUAL, unclaimed**.
- `C-487-M3` CI owner — remote-CI parity — **MANUAL, unclaimed**.
- `C-487-M4` Release owner — production-promotion dry-run — **MANUAL,
  unclaimed**.
- No manual keyboard/AT, WCAG, reduced-motion, forced-colors, zoom/text-
  spacing, real-device, remote-CI, production-promotion, screenshot, image,
  or pixel-diff claim is made.

Only `docs/specs/s4-phase-c-acceptance-trace.md` is changed by this append.
The child remains stopped before Phase D.
## #487 terminal replay/reset revalidation — current `b2e30044`

**Evidence scope:** Fresh isolated child
`/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/s4-c-487-terminal-replay-reset`
on branch `evidence/s4-c-487-terminal-replay-reset`, created from and verified
at the coordinator's exact HEAD
`b2e300445a21771e2b89b4748a36fa850cdf2ef7`
(`feat/s4-c-stackable-identity-integration`). The child was clean before this
append. This section is documentation-only. No source, test, configuration,
migration, schema, fixture, `#488/#489`, Phase D, deployment, remote, or
production-data file was changed. Disposable local D1 was used only for the
listed smoke and lifecycle checks and was reset after the mutations.

### Authority reread before checks

Before the first validation command, I reread implementation ticket
`issue://487`, parent ticket `issue://475`, Specs
`docs/specs/091-stackable-identity-backend.md` and
`docs/specs/092-discord-identity-design-system-adoption.md`, the approved
`local://s4-phase-c-identity-integration-plan.md` including Task 4 and the
verbatim exact obsolete-caller audit, the complete current
`docs/specs/s4-phase-c-acceptance-trace.md` (all **2,973** lines and all
historical sections), ADRs
`docs/adr/0042-discord-like-stackable-role-model.md` and
`docs/adr/0043-owned-civic-design-system-governance.md`, the complete Phase B
trace `docs/specs/s4-phase-b-acceptance-trace.md`, and Phase B evidence
`docs/qa/2026-08-28-s4-phase-b-foundation.md`.

The complete prior #487 report set reread before checks was
`agent://ReviewTree487`, `agent://ReviewFinalAuthority`,
`agent://ReviewCorrected487` (including its schema-invalid structured payload
and complete transcript), `agent://FixFinalAuthority487`,
`agent://FixAliasesAndReset487`, `agent://FixAuthorityReplaySeed`,
`agent://EvidenceAuditReset487`, `agent://EvidenceLatest487`,
`agent://ReviewAuthority487`, `agent://FixAuthority487Review`,
`agent://EvidenceAuthority487`, `agent://EvidenceAuthority487B`,
`agent://EvidenceFinalAuthority487`, `agent://EvidenceCorrected487`,
`agent://TestAuthority487`, `agent://FixLegacyPermissionTest`, and
`agent://FixManagerFixture487`. Implementation and parent/spec tickets were
read before validation. Historical counts remain historical; only the matrix
below reports this `b2e30044` child.

### Runtime and required Context7 CLI lookups

Observed runtime was Node `v22.18.0`, pnpm `11.7.0`, web Vitest `4.1.10`,
Wrangler `4.127.1`, Playwright CLI `1.62.1`, root TypeScript `7.0.2`, and web
TypeScript `5.9.3`. The required Context7 CLI commands were attempted before
validation with `npx --yes ctx7@latest` (not MCP Context7):

| Library/docs pair | Current CLI result | Previously selected authoritative IDs/sections |
| --- | --- | --- |
| Cloudflare Workers/D1 | Both `library` and `docs` commands exited 1: **Monthly quota exceeded** | `/cloudflare/workers-sdk`; D1 batch transactions with prepared statements, D1 prepared statements + `db.batch()` user-facing pattern, and D1 binding/prepared statements/query methods |
| Vitest | Both commands exited 1: **Monthly quota exceeded** | `/vitest-dev/vitest`; Run Vitest with Specific File, `expect(actual, message?)`, `expect.requireAssertions`, and async `resolves`/`rejects` |
| Playwright | Both commands exited 1: **Monthly quota exceeded** | `/microsoft/playwright`; `Locator.boundingBox`, `Page.setViewportSize`, locator focus/press, route navigation, and `test.webServer` |
| Next.js | Both commands exited 1: **Monthly quota exceeded** | `/vercel/next.js`; App Router `Link` URL objects and query-parameter navigation |
| Radix UI | Both commands exited 1: **Monthly quota exceeded** | `/radix-ui/primitives`; Switch Root role/`aria-checked`/disabled/keyboard/data-state and Primitive `asChild`/Slot composition |
| CVA | Both commands exited 1: **Monthly quota exceeded** | `/joe-bell/cva`; `cva`, variants, `VariantProps`, compound variants, and type-safe composition |

The exact attempted commands were:

```text
npx --yes ctx7@latest library "Cloudflare Workers" "D1Database prepared statements batch transactions schema migrations"
npx --yes ctx7@latest docs /cloudflare/workers-sdk "D1Database prepare bind batch transaction atomic migrations PRAGMA table_info"
npx --yes ctx7@latest library vitest "Run Vitest with Specific File expect requireAssertions async assertions"
npx --yes ctx7@latest docs /vitest-dev/vitest "Run Vitest with Specific File expect(actual, message?) expect.requireAssertions async test assertions"
npx --yes ctx7@latest library playwright "viewport CSS pixels locator boundingBox route navigation webServer"
npx --yes ctx7@latest docs /microsoft/playwright "Locator.boundingBox CSS pixels Page.setViewportSize route navigation webServer"
npx --yes ctx7@latest library "Next.js" "App Router Link href URL object query parameters navigation"
npx --yes ctx7@latest docs /vercel/next.js "Pass URL object to Link in App Router query parameters navigation"
npx --yes ctx7@latest library "Radix UI" "Switch Root asChild Slot accessible semantics"
npx --yes ctx7@latest docs /radix-ui/primitives "Switch Root renders button role switch aria-checked data-state checked disabled keyboard Primitive asChild Slot composition"
npx --yes ctx7@latest library "CVA class variance authority" "cva variants VariantProps compoundVariants"
npx --yes ctx7@latest docs /joe-bell/cva "Implement component variants with cva VariantProps Type compoundVariants defaultVariants"
```

The quota-blocked lookup is recorded honestly. The IDs and sections in the
right-hand column were selected successfully by the reread prior reports and
are not represented as a fresh successful request in this child.

### Focused Worker/domain checks

| Check | Exact current result |
| --- | --- |
| `pnpm verify:identity` | **PASS — 4 files, 94/94** |
| Dedicated #487 Worker `lib/auth/normalized-authority-c487.test.ts` | **BLOCKED before assertions — exit 1; Test Files no tests, Tests no tests, Errors 1; external `@cloudflare/vitest-pool-workers`/Vite `EvalError: Code generation from strings disallowed for this context`; product assertions 0** |
| Normalized identity `lib/identity/normalized-authority.test.ts` | **BLOCKED before assertions — exit 1; Test Files no tests, Tests no tests, Errors 1; same external EvalError; product assertions 0** |
| Permission Editor Worker pair `lib/identity/permission-editor.test.ts` and `lib/identity/permission-editor-handlers.test.ts` | **BLOCKED before assertions — exit 1; Test Files no tests, Tests no tests, Errors 2; same external EvalError; product assertions 0** |
| Account Access, handlers, immutable history | **PASS — 3 files, 39/39** |
| Programs Worker/domain (`programs`, `capabilities`, account/member/hub directory) | **PASS — 5 files, 146/146** |
| Attendance Worker | **PASS — 1 file, 43/43** |
| Auth Worker | **PASS — 1 file, 47/47** |
| Home/CMS Worker | **PASS — 2 files, 21/21** |

The three pool-blocked runs are separate from the passing identity, Account
Access, Programs, attendance, auth, and Home/CMS runs. No unsafe-eval bypass,
source workaround, test suppression, or assertion weakening was used.

### Focused component checks

| Surface group | Exact current result |
| --- | --- |
| Identity/access/management/Home/CMS (`sections`, Account Access/API, Directory/DirectoryFrame, Account/Member Directory, Role Hierarchy, Permission Editor, management actions/redirects/hub, Home, Home CMS) | **PASS — 13 files, 151/151** |
| Programs Workspace, Events, Participants, Notifications, Settings, Department, and related management modules | **PASS — 15 files, 210/210**; jsdom emitted only `Not implemented: navigation to another Document` |
| Attendance/scanner/operator/roster/self-check-in | **PASS — 8 files, 76/76**; jsdom emitted only `Not implemented: Window's scrollTo() method` notices |

### TypeScript, build, and geometry checks

| Check | Exact current result |
| --- | --- |
| Root/E2E/Worker/web TypeScript | `pnpm typecheck && pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json && pnpm --dir web exec tsc --noEmit -p tsconfig.worker.json && pnpm --dir web exec tsc --noEmit -p tsconfig.json` — **PASS, exit 0, no diagnostics** |
| Web production build | `pnpm --dir web build` — **PASS; 18/18 static pages; 16 visible route rows**: `/`, `/_not-found`, `/events`, `/guest-check-in`, `/home`, `/management`, `/messages`, `/notices`, `/permissions`, `/profile`, `/profile/settings`, `/programs`, `/prototype`, `/register`, `/registrations`, `/scanner` |
| W7 identity geometry | `pnpm test:role-hierarchy-geometry` — **PASS, 49/49 numeric tests** across `320, 390, 600, 799, 800, 1024, 1440` CSS px: Account Access 14, Permission Editor 14, Role Hierarchy 21 |
| Shell responsive geometry | `pnpm test:shell-responsive` — **PASS, 92 passed, 1 skipped, exit 0** |
| Shell geometry | `pnpm test:shell-geometry` — **PASS, 28/28** |

All geometry evidence is numeric CSS-pixel evidence from the pinned local
Chromium harness. No screenshot, image snapshot, pixel-diff, manual
accessibility, or WCAG conformance claim is made. The repository-wide test,
formatter, linter, and `pnpm check` suites were not run; this was the requested
focused verification scope.

### Concrete replay, stale-revision, assignment, and lifecycle proof

The local-only Node 22 Wrangler Worker served `http://127.0.0.1:8797`. The
following checks used cookie sessions and disposable local D1 only.

1. **Grant and original replay envelope.** Admin patched
   `program.publish=true` on Role Definition
   `018f3b8a-0000-7000-8000-100000000002` with key
   `c487-terminal-grant-replay-20260830`. First response: `200`, revision
   `2`, request ID/header
   `5d4a416a-d7c4-4c3a-820a-f034a07e4e95`. Same-key replay: `200`, revision
   `2`, the exact same request ID/header and `sameData=true`. D1 contained
   exactly one terminal mutation row (`SUCCESS`, `resulting_revision=2`,
   `applied=1`, `audit_written=1`) and one `ROLE_DEFINITION_GRANT` `SUCCESS`
   audit with the original correlation ID. The normalized grant row was
   present once for `program.publish`, granted by `U-E2E-ADMIN`.
2. **Stale revision with no stale grant.** A second PATCH used
   `base_revision=1` after the authoritative revision was `2`. It returned
   `409 ROLE_POLICY_CONFLICT`, request ID/header
   `34fa77dd-1c7d-4dd2-bb84-e44b504bc979`, and
   `data.authoritativeRevision=2`. The role revision stayed `2`, the attempted
   `home.publish` grant stayed absent before and after, and D1 contained one
   `CONFLICT` terminal row (`applied=0`, `audit_written=1`) plus one correlated
   conflict audit.
3. **Changed-key `REJECTED` audit.** Reusing the original grant key with a
   changed canonical payload (`program.publish=false`) returned
   `409 ROLE_IDEMPOTENCY_REUSE`, request ID/header
   `6333197d-a35d-4a27-b33f-561b451a9f0f`. D1 retained the original `SUCCESS`
   mutation and grant, and added exactly one correlated
   `ROLE_DEFINITION_POLICY_UPDATE` audit with `outcome=REJECTED` and
   `reason=ROLE_IDEMPOTENCY_REUSE`; no policy grant was removed.
4. **Atomic two-identity assignment.** Admin added Department role
   `018f3b8a-0000-7000-8000-100000000001` and Program role
   `018f3b8a-0000-7000-8000-100000000002` to `U-E2E-STAFF` in one request
   (`base_revision=2`). The response was `200`, revision `3`, request
   ID/header `995f9f15-78f4-46fb-89a6-f9f49e728d7f`; both new active
   assignments were returned, with no duplicate IDs. D1 reported two added
   active rows, one terminal mutation, one `ROLE_ASSIGNMENT_GRANT` `SUCCESS`
   audit, and zero duplicate active pairs.
5. **Revoke/re-add immutable history.** Revoking the Department role returned
   `200`, revision `4`, request ID/header
   `51cea767-732d-4cf7-833a-822890050331`, and terminal assignment ID
   `d397c74a-4fea-40c9-a905-9771f1e1d16c`. Re-adding it returned `200`,
   revision `5`, request ID/header
   `1c499fcc-6493-4979-af14-984995976bd5`, and fresh active assignment ID
   `6397b3fb-839f-4ccd-b27c-adf6b29909b7`. D1 showed exactly one active and
   one revoked row for that Account/Role pair; the revoked row retained its
   immutable ID, timestamp, `Department` `scope_kind`, exact scope ID, actor,
   and `account_access_revoke` reason. The two mutations each had one
   correlated `SUCCESS` audit (`ROLE_ASSIGNMENT_REVOKE` and
   `ROLE_ASSIGNMENT_GRANT`).
6. **Archive, archived-target rejection, and restore.** Archive preview
   identified `E2E_DISPOSABLE_PL` and `U-E2E-STAFF` as affected. Archive
   returned `200`, `isArchived=true`, revision `6`, request ID/header
   `234cab89-03d6-44d7-8048-0d4212f04b49`; the live Program assignment for
   `U-E2E-STAFF` disappeared and its history remained. A new assignment
   attempt returned `403 ROLE_ARCHIVED`, request ID/header
   `00931022-d704-4e12-8233-c4f6f0faf463`, with one correlated `REJECTED`
   audit. Restore returned `200`, `isArchived=false`, revision `7`, request
   ID/header `7f8cce38-5dcf-41c4-951c-d36f9467fbd5`; no Program assignment
   was recreated and the `program.publish` grant remained present. The
   Program role had zero active and two terminal assignments after archive;
   lifecycle audits were one `ROLE_DEFINITION_ARCHIVE` `SUCCESS` and one
   `ROLE_DEFINITION_RESTORE` `SUCCESS`.

### Normalized scope and Member baseline proof

Disposable DM/PL credentials were enabled only in the local disposable D1
with generated PBKDF2 hashes; no tracked file was changed. With matching
modules and a temporary disposable cross-scope Program prepared locally:

| Actor/request | Matching scope | Other scope | Observable result |
| --- | --- | --- | --- |
| DM `E2E_DISPOSABLE_DM` Department detail | Department `...0002` (`成區`) → `200` with data | Department `...0001` (`青區`) → `404 NOT_FOUND`, no data | Exact Department scope is enforced; the privacy-preserving route maps out-of-scope to `404` |
| PL `E2E_DISPOSABLE_PL` Program management | Program `...300000000001` → `200` with data | Temporary Program `650edeba-4cf3-49ef-8884-27ef566ccf80` → `404 NOT_FOUND`, no data | Exact Program scope is enforced; the temporary cross-scope row was removed by the subsequent local reset |

DM `/api/v1/auth/me` returned `200` with only
`成人部門管理者/Department/成區`; PL returned `200` with only
`青少年查經帶領/Program/E2E_DISPOSABLE_青少年查經`. Member baseline
`/api/v1/auth/me` returned `200`, `systemRole=null`, no identity summary,
one automatic `program.enroll` capability, and sections/navigation
`home,programs,scanner,notices,profile`. Member
`/api/v1/programs/access` returned `200` with
`hasManagementCapability=false`; the hub returned `groups=0` and
`entryCard=null`; the management directory returned empty
`departments`/`programs`. The baseline could not enter management.

### Fresh local D1 migration, seeds, reset, and terminal-history proof

The fresh child-local database applied all **25** versioned migrations.
`pnpm db:seed:disposable` completed **6/6** commands. The first and repeated
`pnpm db:seed:local` runs completed **19 + 11 + 6** commands. After the
grant/assignment/revoke/archive/restore sequence, a post-archive reset
completed **19 + 11 + 6** commands, and the immediate repeated reset also
completed **19 + 11 + 6** commands. After the full Programs, live-ui, and
Member Directory journeys, a final cleanup reset again completed
**19 + 11 + 6** commands. `DEMO_TARGET_URL=http://127.0.0.1:8797 pnpm
db:seed:demo` completed successfully before and after the live runs; the
repeat reported `Demo home content already present`.

The post-archive reset query (before the long E2E journeys) returned
**25 migrations, 9 accounts, 5 Role Definitions, 40 grants, 6 active
assignments, 3 terminal assignments, and 0 duplicate active pairs**. The
terminal rows retained the original revoked assignment IDs and scope
snapshots. The final cleanup reset query returned **25 migrations, 18
accounts, 5 Role Definitions, 39 grants, 6 active assignments, 4 terminal
assignments, and 0 duplicate active pairs**; the higher account count is
expected local E2E registration/test data, not a new seed fixture. For
`U-E2E-STAFF`, the final terminal-history query returned:

```text
Staff role:       active=1, terminal=0,
  assignment_id=dev-assignment-staff-118dc6ad-52d3-4bf7-af94-f9b13d2338c7
Department role:  active=0, terminal=1,
  assignment_id=d397c74a-4fea-40c9-a905-9771f1e1d16c
Program role:     active=0, terminal=1,
  assignment_id=9857aab6-7c4e-4fef-bc00-4ac3d7d8c7f3
```

The final database contained exactly **7** expected normalized identity
tables (`role_assignments`, `role_audit_events`, `role_categories`,
`role_definition_grants`, `role_definitions`, `role_policy_mutations`, and
`role_policy_revisions`) and **0** retired authority tables. Required columns
`role_policy_mutations.result_json` and
`role_assignments.scope_kind`/`scope_id` were present. Protected order and
scope remained `admin=0`, `staff=1`, Department `10` with scope
`018f3b8a-0000-7000-8000-000000000002`, Program `20` with scope
`018f3b8a-0000-7000-8000-300000000001`, and `member=999`. No remote,
Apps Script, Google Sheets, Cloudflare production, or other external database
was written.

### Local Worker and full E2E results

The required supervised `pnpm --dir web dev:local` attempt exited before
readiness because the process manager resolved Node `v20.19.0` and raised
`ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`. A direct Node `v22.18.0` Wrangler
process, using only a local process variable for the signing secret, served
`http://127.0.0.1:8797`; it was stopped with exit `143` after evidence.

Cookie login plus `/api/v1/auth/me` returned `200` for all three dev
personas:

| Persona | Projection |
| --- | --- |
| Admin | `systemRole=Admin`, `系統管理員/Global`, sections `home,programs,scanner,management,profile,events`, navigation `home,programs,scanner,management,profile`, 24 true capabilities |
| Staff | `systemRole=Staff`, `同工/Global`, the same sections/navigation, 22 true capabilities |
| Member | `systemRole=null`, no identity summary, sections/navigation `home,programs,scanner,notices,profile`, 1 automatic baseline capability |

Authenticated smoke returned Admin `GET /api/v1/programs/accounts` `200`,
Member `403 FORBIDDEN`, and matching body/header request IDs on every smoke
response. The removed account-permissions, Program Leader, and Department
Manager routes each returned `404 NOT_FOUND` with RFC Problem Details:

```text
/api/v1/programs/account-permissions
/api/v1/programs/018f3b8a-0000-7000-8000-300000000001/leaders
/api/v1/programs/departments/018f3b8a-0000-7000-8000-000000000001/managers
```

After the required local seed/demo setup, the full
`PROGRAMS_TARGET_URL=http://127.0.0.1:8797 pnpm exec playwright test
--config=tests/e2e/programs-d1.config.ts` run completed **195/195 passed**
with one worker in **5.5 minutes**. After reset/reseed, the full
`AUTH_UI_TARGET_URL=http://127.0.0.1:8797 pnpm exec playwright test
--config=tests/e2e/live-ui.config.ts` run completed **28/28 passed** at
phone `375x667` and desktop `1280x720` in **10.3 seconds**. The normalized
Member Directory command completed **1/1 passed** at desktop
`PROGRAMS_TARGET_URL=http://127.0.0.1:8797`. No Worker death,
`ProxyController`, or connection-refused cascade occurred in these current
full runs.

### Exact obsolete-token, symbol, alias, filename, and route audit

The full tracked child scan covered **1,260** tracked files. Primary retired
table tokens totaled **93** lines across 8 files: **22 executable-scope lines**
across exactly these allowed locations and **71 documentation/history lines**:

- `web/lib/identity/preflight.ts:17-21` — the five-name read-only stale-table
  list and manual reset instruction;
- `web/lib/identity/d1-schema.test.ts:186-190,207-208` — stale-schema and
  no-auto-drop test setup/cleanup;
- `web/lib/auth/normalized-authority-c487.test.ts:818-822,874,883,887,890,892`
  — fresh-schema absence and stale-schema/no-auto-drop test setup/cleanup.

The secondary retired-symbol scan totaled **102** documentation/history lines
across 9 files and **0 executable-scope lines** for
`RolePolicyStore`, `hasActiveManagementGrant`, `ctx.actorRole`,
`sectionsForRole`, `stableNavigationSections`, `ROLE_CAPABILITY_DEFAULTS`,
`PermissionPolicy*`, `DepartmentManager*`, `ProgramLeader*`, or the old
Manager/Leader writer names. The removed-route scan totaled **46** lines
across 11 files: **3 executable lines**, only
`web/lib/identity/normalized-authority.test.ts:171-173`, the explicit
`404`/`NOT_FOUND` assertions; the other **43** are documentation/history.
The legacy-named migration files `0007_department_managers.sql`,
`0013_account_permissions_capability.sql`, and
`0015_s4_additive_role_capabilities.sql` contain retired `SELECT 1` history,
not DDL or seed writers.

The alias regression test at
`web/lib/account-access-api.test.ts:25-42` confirms no forbidden legacy
handler/client/domain exports (including the five old handler names,
`getEligibleAccounts`, `getAccountAssignments`, and
`updateRoleDefinitionLifecycle`); no forbidden alias export remains. The
retained `accounts.role` values are login/import/display compatibility data;
the only explicit production projection is `web/lib/auth/handlers.ts:547,587`,
and no authority, navigation, scope, or directory SQL read uses it.

### C-487-01..07 current status matrix

| Row | Current status | Exact current evidence and remaining gap |
| --- | --- | --- |
| C-487-01 | **BLOCKED** | Admin/Staff/Member bootstrap HTTP smoke passed (`200`) with capability-driven sections/navigation and safe summaries; DM/PL identity summaries and Sections/components also passed. The dedicated normalized-authority Worker seam stopped before assertions (`0`), so the complete DM/PL/custom/tamper persona matrix is not claimed. |
| C-487-02 | **BLOCKED** | Programs Worker/domain `146/146`, Programs components `210/210`, full Programs E2E `195/195`, and direct DM/PL matching-vs-other scope smoke passed. The dedicated normalized exact-scope/cross-scope/equal-higher/Member Worker matrix stopped before assertions (`0`), so the criterion remains blocked. |
| C-487-03 | **BLOCKED** | Attendance Worker `43/43`, attendance/scanner components `76/76`, and full local Programs E2E `195/195` passed. The dedicated normalized Program/Department scope and authentication-expiry Worker seam stopped before assertions (`0`), so complete attendance authority proof is not claimed. |
| C-487-04 | **BLOCKED** | Auth Worker `47/47`, Home/CMS Worker `21/21`, identity/access/management components `151/151`, Member baseline management projection, and Admin/Member/removed-route HTTP smoke passed. The dedicated normalized management/tamper Worker seam stopped before assertions (`0`), so complete management acceptance is not claimed. |
| C-487-05 | **PARTIAL — direct D1/preflight/reset subset** | Fresh 25-migration D1, disposable `6/6`, repeated local reset `19 + 11 + 6`, post-archive terminal-history retention, exact 7-table/zero-retired-table schema, required columns, protected order/scope, and `verify:identity 94/94` passed. The dedicated Admin-all-on/bootstrap Worker assertion remains blocked before assertions. |
| C-487-06 | **PASS — executable audit and route absence** | Full tracked primary/secondary/route audit has only the allowed preflight/stale-schema/route-absence exceptions; secondary executable symbols and old writers are zero; alias regression passes; authenticated old account-permissions/Leader/Manager routes return `404 NOT_FOUND`. |
| C-487-07 | **PASS — current local journey and geometry** | Full Programs `195/195`, full live-ui `28/28`, Member Directory `1/1`, W7 identity geometry `49/49`, shell responsive `92 passed/1 skipped`, and shell geometry `28/28` passed. Remote-CI and human accessibility gates remain separately unclaimed. |

### External blockers, manual owners, and scope

- The normalized #487 Worker, normalized identity Worker, and #485 Permission
  Editor Worker runs remain **BLOCKED before assertions** by the external
  Cloudflare-pool/Vite `EvalError: Code generation from strings disallowed
  for this context`; product assertions are **0** for each blocked run. No
  unsafe-eval bypass, source workaround, test suppression, or assertion
  weakening was used.
- The required supervised `pnpm --dir web dev:local` path remains blocked
  before readiness by process-manager Node `v20.19.0` /
  `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`. Direct Node 22 Wrangler was
  local-only, bound to disposable D1, and stopped after evidence.
- `C-487-M1` Accessibility owner — keyboard-only Permission Editor at
  320/1440, screen-reader Switch/provenance/bootstrap, reduced-motion,
  forced-colors, 200% zoom, and text-spacing — **MANUAL, unclaimed**.
- `C-487-M2` Device QA owner — iOS/Android real-device dock/safe-area at
  320/390 — **MANUAL, unclaimed**.
- `C-487-M3` CI owner — remote-CI parity — **MANUAL, unclaimed**.
- `C-487-M4` Release owner — production-promotion dry-run — **MANUAL,
  unclaimed**.
- No manual keyboard/AT, WCAG, reduced-motion, forced-colors, zoom/text-
  spacing, real-device, remote-CI, production-promotion, screenshot, image,
  or pixel-diff claim is made.

Only `docs/specs/s4-phase-c-acceptance-trace.md` is changed by this append.
No source, test, configuration, migration, schema, fixture, `#487` path,
`#488/#489`, Phase D, deployment, or external database file was edited. The
child remains stopped before Phase D.

## #487 final anchor/attendance revalidation — current `07928aed`

**Evidence scope:** Fresh isolated child
`/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/s4-c-487-final-evidence-07928`
on branch `evidence/s4-c-487-final-evidence-07928`, created from and verified at
the coordinator's exact HEAD
`07928aedc2871cd1133c21801af07dcf1097c670`
(`feat/s4-c-stackable-identity-integration`). The child was clean before this
append. This section is documentation-only. No tracked source, test,
configuration, migration, schema, fixture, deployment, `#488/#489`, Phase D,
remote, production-data, or external-database path was changed.

### Authority reread before checks

Before the first validation command, I explicitly reread implementation ticket
`issue://487`, parent ticket `issue://475`, Specs
`docs/specs/091-stackable-identity-backend.md` and
`docs/specs/092-discord-identity-design-system-adoption.md`, the approved
`local://s4-phase-c-identity-integration-plan.md` including Task 4 and the
verbatim exact obsolete-caller audit, the complete current
`docs/specs/s4-phase-c-acceptance-trace.md` (all **3,341** pre-append lines and
all historical sections), ADRs
`docs/adr/0042-discord-like-stackable-role-model.md` and
`docs/adr/0043-owned-civic-design-system-governance.md`, the complete Phase B
trace `docs/specs/s4-phase-b-acceptance-trace.md`, and Phase B evidence
`docs/qa/2026-08-28-s4-phase-b-foundation.md`.

The prior #487 report set reread before checks was
`agent://ReviewTerminal487`, `agent://FixAttendanceAnchors487`,
`agent://ReviewTree487`, `agent://FixAuthorityReplaySeed`,
`agent://EvidenceReplayReset487`, `agent://FixAliasesAndReset487`,
`agent://FixFinalAuthority487`, `agent://ReviewFinalAuthority`,
`agent://EvidenceAuditReset487`, `agent://EvidenceLatest487`,
`agent://ReviewAuthority487`, `agent://FixAuthority487Review`,
`agent://EvidenceAuthority487`, `agent://EvidenceAuthority487B`,
`agent://EvidenceFinalAuthority487`, `agent://EvidenceCorrected487`,
`agent://TestAuthority487`, `agent://FixLegacyPermissionTest`,
`agent://FixManagerFixture487`, and `agent://ReviewCorrected487` including its
schema-invalid structured payload and available transcript. The implementation
and parent/spec tickets were read before validation.

### Runtime and required Context7 CLI lookups

Observed runtime was Node `v22.18.0`, pnpm `11.7.0`, web Vitest `4.1.10`,
Wrangler `4.127.1`, Playwright CLI `1.62.1`, root TypeScript `7.0.2`, and web
TypeScript `5.9.3`. All required lookups were attempted before validation with
the Context7 CLI (`npx --yes ctx7@latest`), not MCP Context7. Every one of the
12 commands exited `1` with the exact result:

```text
✖ Monthly quota exceeded. Create a free API key at https://context7.com/dashboard for more requests.
```

The attempted commands were:

```text
npx --yes ctx7@latest library "Cloudflare Workers" "D1Database prepared statements batch transactions schema migrations"
npx --yes ctx7@latest docs /cloudflare/workers-sdk "D1Database prepare bind batch transaction atomic migrations PRAGMA table_info"
npx --yes ctx7@latest library vitest "Run Vitest with Specific File expect requireAssertions async assertions"
npx --yes ctx7@latest docs /vitest-dev/vitest "Run Vitest with Specific File expect(actual, message?) expect.requireAssertions async test assertions"
npx --yes ctx7@latest library playwright "viewport CSS pixels locator boundingBox route navigation webServer"
npx --yes ctx7@latest docs /microsoft/playwright "Locator.boundingBox CSS pixels Page.setViewportSize route navigation webServer"
npx --yes ctx7@latest library "Next.js" "App Router Link href URL object query parameters navigation"
npx --yes ctx7@latest docs /vercel/next.js "Pass URL object to Link in App Router query parameters navigation"
npx --yes ctx7@latest library "Radix UI" "Switch Root asChild Slot accessible semantics"
npx --yes ctx7@latest docs /radix-ui/primitives "Switch Root renders button role switch aria-checked data-state checked disabled keyboard Primitive asChild Slot composition"
npx --yes ctx7@latest library "CVA class variance authority" "cva variants VariantProps compoundVariants"
npx --yes ctx7@latest docs /joe-bell/cva "Implement component variants with cva VariantProps Type compoundVariants defaultVariants"
```

The previously selected authoritative IDs/sections are retained as prior
evidence, not represented as fresh successful requests in this child:

| Library | Prior authoritative ID and sections |
| --- | --- |
| Cloudflare/D1 | `/cloudflare/workers-sdk`: D1 batch transactions with prepared statements; D1 prepared statements plus `db.batch()`; D1 binding/prepared statements/query methods; artifacts `8767`, `8769` |
| Vitest | `/vitest-dev/vitest`: Run Vitest with Specific File; `expect(actual, message?)`; `expect.requireAssertions`; async `resolves`/`rejects`; artifacts `8771`, `8773` |
| Playwright | `/microsoft/playwright`: `Locator.boundingBox`; `Page.setViewportSize`; locator focus/press; route navigation and `test.webServer`; artifacts `8775`, `8777` |
| Next.js | `/vercel/next.js`: App Router `Link` URL objects and query-parameter navigation; artifacts `8779`, `8781` |
| Radix UI | `/radix-ui/primitives`: Switch role/`aria-checked`/disabled/keyboard/data-state; Primitive `asChild`/Slot and Checkbox accessibility; artifacts `8783`, `8786`, `8788` |
| CVA | `/joe-bell/cva`: `cva`, variants, `VariantProps`, compound variants, and type-safe composition; artifact `8790` |

### Fresh focused Worker/domain checks

| Check | Exact current result |
| --- | --- |
| `pnpm verify:identity` | **PASS — 4 files, 94/94** |
| Dedicated #487 Worker `lib/auth/normalized-authority-c487.test.ts` | **BLOCKED before assertions — exit 1; Test Files no tests, Tests no tests, Errors 1; external `@cloudflare/vitest-pool-workers`/Vite `EvalError: Code generation from strings disallowed for this context`; product assertions 0** |
| Normalized identity `lib/identity/normalized-authority.test.ts` | **BLOCKED before assertions — exit 1; Test Files no tests, Tests no tests, Errors 1; same external EvalError; product assertions 0** |
| Permission Editor Worker pair `lib/identity/permission-editor.test.ts` and `lib/identity/permission-editor-handlers.test.ts` | **BLOCKED before assertions — exit 1; Test Files no tests, Tests no tests, Errors 2; same external EvalError; product assertions 0** |
| Account Access/replay/history `lib/identity/account-access.test.ts`, `account-access-handlers.test.ts`, `account-access-history.test.ts` | **PASS — 3 files, 39/39** |
| Programs Worker/domain (`programs`, `capabilities`, account/member/hub directory) | **PASS — 5 files, 146/146** |
| Attendance Worker `lib/attendance-worker.test.ts` | **PASS — 1 file, 45/45** |
| Auth Worker `worker.auth.test.ts` | **PASS — 1 file, 47/47** |
| Home/CMS Worker | **PASS — 2 files, 21/21** |
| D1 schema/preflight `lib/identity/d1-schema.test.ts` | **PASS — 1 file, 25/25**; includes missing-column detection, retired-table rejection without auto-drop, protected anchors, immutable terminal history, idempotency, and archive audit |
| Normalized seeds and role handlers | **PASS — 2 files, 27/27**; includes re-seeding with revoked history and archived-role handling |
| Alias regression `lib/account-access-api.test.ts` | **PASS — 1 file, 2/2** |
| Reset SQL regression `tests/e2e/seed-dev-accounts.test.ts` | **PASS — 1 file, 1/1**; fixture assignment deletes require `revoked_at IS NULL` |

The three pool-blocked invocations are classified as external
pre-discovery failures. No unsafe-eval bypass, source workaround, test
suppression, assertion weakening, or pool/config change was used.

### Anchor and denial coverage

The current attendance run passed the explicit revalidation cases
`operator chooser and scanner deny a member without operator capability`,
`operator chooser and scanner reject an operator whose scope is outside active
Programs`, `authorized operator receives an empty chooser and scanner result
when no events exist`, `operator chooser honors an active Program Leader scope`,
`operator chooser honors an active Department Manager scope`, `operator chooser
filters authorization before applying result limit`, and `scanner projection
denies revoked scoped grants`. The full file result was **45/45**.

The current hierarchy run passed the protected-anchor and scoped-redaction cases
`H-01/H-03: authorized read shows fixed categories, ordered summaries, anchors,
scope, counts, protected state, and server-projected actions`, `scoped role.read
preserves protected anchors and redacts unrelated definitions`, `Department
role.reorder permits same-department Program siblings and rejects cross-scope
targets`, and `preserves opaque assigned account IDs containing commas`. The
full file result was **42/42**. `account-access-history.test.ts` additionally
passed the immutable revoked-history/original-Department-scope case **1/1**.

### Focused component checks

| Surface group | Exact current result |
| --- | --- |
| Sections, Account Access/API, Directory/DirectoryFrame, Account/Member Directory, Role Hierarchy | **PASS — 7 files, 95/95** |
| Programs Workspace, Events, Participants, Notifications, Settings, Department, and related management modules | **PASS — 15 files, 210/210**; jsdom emitted only `Not implemented: navigation to another Document` |
| Attendance/scanner/operator/roster/self-check-in | **PASS — 8 files, 76/76**; jsdom emitted only `Not implemented: Window's scrollTo() method` notices |
| Home/CMS | **PASS — 2 files, 22/22** |
| Management actions, redirects, and hub | **PASS — 3 files, 26/26** |
| Permission Editor | **PASS — 1 file, 8/8** |

### TypeScript, build, and numeric geometry checks

| Check | Exact current result |
| --- | --- |
| Root/E2E/Worker/web TypeScript | `pnpm typecheck && pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json && pnpm --dir web exec tsc --noEmit -p tsconfig.worker.json && pnpm --dir web exec tsc --noEmit -p tsconfig.json` — **PASS, exit 0, no diagnostics** |
| Web production build | `pnpm --dir web build` — **PASS; 18/18 static pages; 16 visible route rows** |
| W7 identity geometry | `pnpm test:role-hierarchy-geometry` — **PASS, 49/49 numeric tests** across `320, 390, 600, 799, 800, 1024, 1440` CSS px: Account Access 14, Permission Editor 14, Role Hierarchy 21 |
| Shell responsive geometry | `pnpm test:shell-responsive` — **PASS, 92 passed, 1 skipped, exit 0** |
| Shell geometry | `pnpm test:shell-geometry` — **PASS, 28/28** |

These are numeric CSS-pixel checks from the pinned local Chromium harness.
No screenshot, image snapshot, pixel-diff, manual accessibility, or WCAG
conformance claim is made. The repository-wide test, formatter, linter, and
`pnpm check` suites were not run; this was the requested focused scope.

### Fresh disposable D1 migrations, seeds, reset, and archive history

`pnpm --dir web exec wrangler d1 migrations apply efcc-identity --local`
applied all **25** versioned migrations. `pnpm db:seed:disposable` completed
**6/6** commands. Five `pnpm db:seed:local` reset portions completed
**19 + 11 + 6** commands each, including repeated resets after both full
Programs attempts and after mutation history. One compound pre-retry command
reported a later `db:seed:demo` fetch failure only because its Worker had
already been stopped; the reset portion itself passed, and a standalone demo
seed passed after the fresh Worker restarted. Standalone demo seeds also passed
before the first Programs attempt and before the live-ui run.

After the final reset, the local D1 query returned **19 accounts, 5 Role
Definitions, 39 grants, 6 active assignments, 3 terminal assignments, 6 role
audit rows, and 6 policy mutations**. The schema contained exactly the seven
normalized identity tables
`role_assignments`, `role_audit_events`, `role_categories`,
`role_definition_grants`, `role_definitions`, `role_policy_mutations`, and
`role_policy_revisions`; the five retired authority tables were absent. The
required `role_policy_mutations.result_json` and
`role_assignments.scope_kind`/`scope_id` columns were present. Protected
positions/scopes remained `admin=0`, `staff=1`, Department `10` at
`018f3b8a-0000-7000-8000-000000000002`, Program `20` at
`018f3b8a-0000-7000-8000-300000000001`, and `member=999`. The active-pair
query returned **0 duplicate active pairs**.

The current local-only Node 22 Worker archive sequence used the Program role
`018f3b8a-0000-7000-8000-100000000002` and `U-E2E-STAFF` on disposable D1:

1. Admin login returned `200`; Account Access revision was `3` and the target
   had no Program assignment.
2. Atomic assignment returned `200`, revision `4`, and the target had the
   Program assignment.
3. Archive returned `200`, revision `5`, `isArchived=true`; afterward the target
   had no active assignment and did have revoked history.
4. A new assignment attempt returned `403 ROLE_ARCHIVED`.
5. Restore returned `200`, revision `6`, `isArchived=false`; afterward the
   target still had no active assignment and retained revoked history.

Every sequence response had matching body/header request IDs. D1 showed
`ROLE_DEFINITION_ARCHIVE` and `ROLE_DEFINITION_RESTORE` `SUCCESS` audit rows,
and the terminal assignment retained its Program scope snapshot with
`revoke_reason=role_archived`. No remote, Apps Script, Google Sheets,
Cloudflare production, or other external database was written.

### Local Worker HTTP smoke

The required supervised `pnpm --dir web dev:local` attempt was made first
through the process manager and exited before readiness because it resolved
Node `v20.19.0` and raised
`ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`. Direct `fnm exec --using
v22.18.0 ... wrangler dev --local --port 8797` Workers were local-only and
used disposable D1.

The final clean direct Worker smoke returned matching body/header request IDs
for every response:

| Persona/request | Exact current result |
| --- | --- |
| Admin `/api/v1/auth/me` | `200`; `systemRole=Admin`; identity `系統管理員/Global`; sections `home,programs,scanner,management,profile,events`; navigation `home,programs,scanner,management,profile`; **24** true capabilities |
| Staff `/api/v1/auth/me` | `200`; `systemRole=Staff`; identity `同工/Global`; same management/event sections and navigation; **22** true capabilities |
| Member `/api/v1/auth/me` | `200`; `systemRole=null`; no identity summary; sections/navigation `home,programs,scanner,notices,profile`; **1** automatic baseline capability |
| Admin `GET /api/v1/programs/accounts?q=E2E` | `200`, 19 rows |
| Member `GET /api/v1/programs/accounts?q=E2E` | `403 FORBIDDEN` |
| Removed account-permissions, Program Leader, and Department Manager routes | Each `404 NOT_FOUND` with RFC Problem Details |

The removed paths exercised were
`/api/v1/programs/account-permissions`,
`/api/v1/programs/018f3b8a-0000-7000-8000-300000000001/leaders`, and
`/api/v1/programs/departments/018f3b8a-0000-7000-8000-000000000001/managers`.

### Full Programs, live-ui, and Member Directory E2E

The full clean-fixture
`PROGRAMS_TARGET_URL=http://127.0.0.1:8797 pnpm exec playwright test
--config=tests/e2e/programs-d1.config.ts` was rerun twice with a fresh local
Worker and disposable resets:

- Attempt 1 scheduled **195** and ended **180 passed, 13 failed, 2 flaky**.
  The direct Worker exited during the run; subsequent connection-refused
  failures were infrastructure cascades. No full Programs pass is claimed.
- Attempt 2 scheduled **195** and ended **47 passed, 145 failed, 3 did not
  run**. It stopped when the direct Worker exited without an exit code at the
  same long-run boundary, followed by `ERR_CONNECTION_REFUSED` cascades. No
  full Programs pass is claimed.

After a clean reset/reseed and a clean direct Worker,
`AUTH_UI_TARGET_URL=http://127.0.0.1:8797 pnpm exec playwright test
--config=tests/e2e/live-ui.config.ts` completed **28/28 passed** at phone
`375x667` and desktop `1280x720`. The clean
`PROGRAMS_TARGET_URL=http://127.0.0.1:8797 pnpm exec playwright test
--config=tests/e2e/member-directory.config.ts --project=desktop` completed
**1/1 passed**. These passing runs are separate from the interrupted full
Programs runs.

### Exact obsolete-token, symbol, alias, filename, and route audit

The direct current tracked-tree audit covered **1,260** files. Primary retired
table tokens totaled **95** lines across 8 files: **22 executable-scope lines**
and **73 documentation/history lines**. All 22 executable lines were the
explicit five-name `preflight.ts` stale-schema/manual-reset list plus
stale-schema/no-auto-drop setup and cleanup in
`web/lib/identity/d1-schema.test.ts` and
`web/lib/auth/normalized-authority-c487.test.ts`; no production authority
writer/read remained.

The secondary retired-symbol scan totaled **110** lines across 9 files and
**0 executable-scope lines** for `RolePolicyStore`,
`hasActiveManagementGrant`, `ctx.actorRole`, `sectionsForRole`,
`stableNavigationSections`, `ROLE_CAPABILITY_DEFAULTS`, `PermissionPolicy*`,
`DepartmentManager*`, `ProgramLeader*`, or old Manager/Leader writer names.
The removed-route scan totaled **38** lines across 9 files: **3 executable
lines**, only `web/lib/identity/normalized-authority.test.ts:171-173`,
the explicit `404`/`NOT_FOUND` assertions for the three removed paths.

The alias scan's **33** lines across 5 files were either canonical
`updateRoleDefinitionLifecycle` use or intentional negative assertions in
`web/lib/account-access-api.test.ts`; no forbidden
`getEligibleAccounts`, `getAccountAssignments`,
`handleGetEligibleAccounts`, `handlePostRoleDefinitionLifecycle`,
`handleGetAccountAssignments`, `handlePostAccountAssignments`, or
`handleLifecycle` export remained. The three legacy-named migration files are
retired `SELECT 1` histories, not DDL/seed writers. Retained `accounts.role`
values are login/import/display compatibility data; no authority, navigation,
scope, or directory SQL read uses that field.

### C-487-01..07 current status matrix

| Row | Current status | Exact current evidence and remaining gap |
| --- | --- | --- |
| C-487-01 | **BLOCKED** | Admin/Staff/Member bootstrap HTTP smoke passed with capability-driven sections/navigation and safe identity summaries; identity verification passed **94/94**, and identity/access/directory components passed **95/95**. Dedicated normalized #487 and normalized-identity Worker seams each stopped before assertions (`0`), so DM/PL/custom/tamper persona proof is incomplete. |
| C-487-02 | **BLOCKED** | Programs Worker/domain passed **146/146** and Programs components passed **210/210**. Both clean full Programs E2E attempts were interrupted (`180/13/2` and `47/145/3`), and the dedicated normalized exact-scope/equal-higher/Member Worker seam had `0` assertions. |
| C-487-03 | **BLOCKED** | Attendance Worker passed **45/45**, including unauthorized/no-event, scoped PL/DM, filter-before-limit, and revoked-grant cases; attendance/scanner components passed **76/76**. The dedicated normalized scope/auth-expiry Worker seam stopped before assertions (`0`), and full Programs E2E was interrupted. |
| C-487-04 | **BLOCKED** | Auth Worker passed **47/47**, Home/CMS Worker **21/21**, management components **26/26**, and direct smoke returned Admin `200`, Member `403 FORBIDDEN`, and removed routes `404 NOT_FOUND`. The dedicated normalized management/tamper Worker seam stopped before assertions (`0`); no complete management acceptance claim is made. |
| C-487-05 | **PARTIAL — direct D1/preflight/reset/archive subset** | Fresh 25-migration D1, disposable seed **6/6**, repeated local reset **19 + 11 + 6**, exact normalized-table/zero-retired-table query, required columns, protected order/scope, duplicate-pair check, immutable archive history, and `d1-schema` **25/25** passed. The dedicated Admin-all-on/bootstrap Worker assertion remains blocked before assertions. |
| C-487-06 | **PASS — executable audit, aliases, and route absence** | Full current tracked audit has 22 allowed primary executable lines, 0 secondary executable lines, and only the three explicit route-absence assertions; alias regression passed **2/2**; authenticated smoke returned `404 NOT_FOUND` for account-permissions, Leader, and Manager routes. |
| C-487-07 | **BLOCKED** | W7 identity geometry **49/49**, shell responsive **92 passed/1 skipped**, shell geometry **28/28**, live-ui **28/28**, and Member Directory **1/1** passed. Full Programs E2E remains interrupted on both reruns; remote-CI parity is not claimed. |

### External blockers, manual owners, and scope

- The normalized #487 Worker, normalized identity Worker, and #485 Permission
  Editor Worker runs remain **BLOCKED before assertions** by the external
  Cloudflare-pool/Vite `EvalError: Code generation from strings disallowed
  for this context`; product assertions are **0** for each blocked run. No
  unsafe-eval bypass, source workaround, test suppression, or assertion
  weakening was used.
- The required supervised `pnpm --dir web dev:local` path remains blocked
  before readiness by process-manager Node `v20.19.0` /
  `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`. Direct Node 22 Wrangler was
  local-only and used disposable D1.
- Full Programs D1 E2E remains blocked by direct Worker process termination
  followed by connection-refused cascades; the exact `180/13/2` and
  `47/145/3` results above are retained without a pass claim.
- `C-487-M1` Accessibility owner — keyboard-only and screen-reader review of
  Permission Editor, Account Access, bootstrap/management, plus reduced-motion,
  forced-colors, 200% zoom, and text-spacing — **MANUAL, unclaimed**.
- `C-487-M2` Device QA owner — iOS/Android real-device dock and safe-area
  behavior at 320/390 — **MANUAL, unclaimed**.
- `C-487-M3` CI owner — remote-CI parity — **MANUAL, unclaimed**.
- `C-487-M4` Release owner — production-promotion dry-run — **MANUAL,
  unclaimed**.
- No manual keyboard/AT, WCAG, reduced-motion, forced-colors, zoom/text-
  spacing, real-device, remote-CI, production-promotion, screenshot, image,
  or pixel-diff claim is made.

Only `docs/specs/s4-phase-c-acceptance-trace.md` is changed by this append.
No tracked source, test, configuration, migration, schema, fixture,
`#487` implementation path, `#488/#489`, Phase D, deployment, or external
database file was edited. The child remains stopped before Phase D.
## #487 final test-correction revalidation — current `e2c1e919`

**Evidence scope:** Fresh isolated child
`/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/s4-c-487-final-current`
on branch `evidence/s4-c-487-final-current`, created from and verified at the
coordinator's exact HEAD `e2c1e919380efbef8dd3865116087d2e2981c852`
(`feat/s4-c-stackable-identity-integration`). This section is
documentation-only and records the corrected Member attendance expectation
plus the current focused results. No tracked source, test, configuration,
migration, schema, fixture, deployment, `#488/#489`, Phase D, remote,
production-data, or external-database path was changed.

### Authority reread before checks

Before validation I explicitly reread implementation ticket `issue://487`,
parent ticket `issue://475`, Specs `docs/specs/091-stackable-identity-backend.md`
and `docs/specs/092-discord-identity-design-system-adoption.md`, the approved
`local://s4-phase-c-identity-integration-plan.md` including Task 4 and the
verbatim exact obsolete-caller audit, the complete current
`docs/specs/s4-phase-c-acceptance-trace.md` (all **3,661** pre-append lines and
all historical sections), ADRs
`docs/adr/0042-discord-like-stackable-role-model.md` and
`docs/adr/0043-owned-civic-design-system-governance.md`, the complete Phase B
trace `docs/specs/s4-phase-b-acceptance-trace.md`, and Phase B evidence
`docs/qa/2026-08-28-s4-phase-b-foundation.md`.

The prior #487 report set reread before checks was
`agent://ReviewTerminal487`, `agent://FixAttendanceAnchors487`,
`agent://FixC487AttendanceTest`, `agent://FixScopedPermissionTest`,
`agent://EvidenceReplayReset487`, `agent://EvidenceAnchor487Final`,
`agent://ReviewTree487`, `agent://ReviewFinalAuthority`,
`agent://FixAuthorityReplaySeed`, `agent://FixAliasesAndReset487`, and
`agent://FixFinalAuthority487`. The implementation and parent/spec tickets
were read before validation.

### Runtime and required Context7 CLI lookups

Observed runtime was Node `v22.18.0`, pnpm `11.7.0`, web Vitest `4.1.10`,
Wrangler `4.127.1`, Playwright CLI `1.62.1`, root TypeScript `7.0.2`, and web
TypeScript `5.9.3`. All required lookups were attempted before validation with
the Context7 CLI (`npx --yes ctx7@latest`), not MCP Context7. Every one of the
12 commands exited `1` with the exact result:

```text
✖ Monthly quota exceeded. Create a free API key at https://context7.com/dashboard for more requests.
```

The attempted commands covered Cloudflare/D1 (`library "Cloudflare Workers"` /
`docs /cloudflare/workers-sdk`), Vitest (`library vitest` /
`docs /vitest-dev/vitest`), Playwright (`library playwright` /
`docs /microsoft/playwright`), Next.js (`library "Next.js"` /
`docs /vercel/next.js`), Radix UI (`library "Radix UI"` /
`docs /radix-ui/primitives`), and CVA (`library "class-variance-authority"` /
`docs /joe-bell/cva`). The previously selected authoritative IDs/sections
remain as recorded prior evidence (`/cloudflare/workers-sdk` D1 batch/
prepared statements, `/vitest-dev/vitest` specific-file runs and assertion
counts, `/microsoft/playwright` `Locator.boundingBox`/`Page.setViewportSize`,
`/vercel/next.js` App Router Link URL objects, `/radix-ui/primitives` Switch
role/aria-checked/keyboard and Primitive asChild/Slot, `/joe-bell/cva`
variants/`VariantProps`), not represented as fresh successful requests in this
child.

### Corrected Member attendance expectation

`web/lib/auth/normalized-authority-c487.test.ts:649-650` now asserts
`await problem(memberEvents, 403, "ROLE_FORBIDDEN")` for the Member operator
chooser request, replacing the stale `200` empty-list expectation, matching
C-487-03's named `ROLE_FORBIDDEN` outcome. This is the one-line test
correction at HEAD; no production source changed.

### Current focused Worker/domain results

| Check | Exact current result |
| --- | --- |
| `pnpm verify:identity` | **PASS — 4 files, 94/94** |
| Dedicated #487 Worker `lib/auth/normalized-authority-c487.test.ts` (with corrected Member 403) | **BLOCKED before assertions — exit 1; Test Files no tests, Tests no tests, Errors 1; external `@cloudflare/vitest-pool-workers`/Vite `EvalError: Code generation from strings disallowed for this context`; product assertions 0** |
| Normalized identity `lib/identity/normalized-authority.test.ts` | **BLOCKED before assertions — exit 1; same external EvalError; product assertions 0** |
| Permission Editor Worker pair `lib/identity/permission-editor.test.ts`, `permission-editor-handlers.test.ts` | **BLOCKED before assertions — exit 1; Errors 2; same external EvalError; product assertions 0** |
| Account Access/replay/history | **PASS — 3 files, 39/39** |
| Programs Worker/domain | **PASS — 5 files, 146/146** |
| Attendance Worker `lib/attendance-worker.test.ts` | **PASS — 1 file, 45/45** (includes the explicit unauthorized-member, out-of-scope operator, empty-result, active PL scope, active DM scope, filter-before-limit, and revoked-grant cases) |
| Hierarchy `lib/identity/role-hierarchy.test.ts` | **PASS — 1 file, 42/42** (protected anchors, scoped redaction, same-department Program sibling reorder with cross-scope rejection, opaque comma IDs) |
| Auth Worker `worker.auth.test.ts` | **PASS — 1 file, 47/47** |
| Home/CMS Worker | **PASS — 2 files, 21/21** |
| D1 schema/preflight `lib/identity/d1-schema.test.ts` | **PASS — 1 file, 25/25** |
| Seeds/handlers | **PASS — 2 files, 27/27** (re-seed with revoked history and archived-role handling) |
| Alias regression `lib/account-access-api.test.ts` | **PASS — 1 file, 2/2** |
| Reset SQL regression `tests/e2e/seed-dev-accounts.test.ts` | **PASS — 1 file, 1/1** |

The three pool-blocked invocations remain classified as external
pre-discovery failures; no unsafe-eval bypass, source workaround, test
suppression, assertion weakening, or pool/config change was used.

### Current focused component results

| Surface group | Exact current result |
| --- | --- |
| Sections, Account Access/API, Directory/DirectoryFrame, Account/Member Directory, Role Hierarchy | **PASS — 7 files, 95/95** |
| Programs Workspace, Events, Participants, Notifications, Settings, Department, and related management modules | **PASS — 15 files, 210/210**; jsdom emitted only `Not implemented: navigation to another Document` |
| Attendance/scanner/operator/roster/self-check-in | **PASS — 8 files, 76/76**; jsdom emitted only `Not implemented: Window's scrollTo() method` notices |
| Home/CMS | **PASS — 2 files, 22/22** |
| Management actions, redirects, and hub | **PASS — 3 files, 26/26** |
| Permission Editor | **PASS — 1 file, 8/8** |

### Current TypeScript, build, and numeric geometry results

| Check | Exact current result |
| --- | --- |
| Root/E2E/Worker/web TypeScript | `pnpm typecheck && pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json && pnpm --dir web exec tsc --noEmit -p tsconfig.worker.json && pnpm --dir web exec tsc --noEmit -p tsconfig.json` — **PASS, exit 0, no diagnostics** |
| Web production build | `pnpm --dir web build` — **PASS; 18/18 static pages; 16 visible route rows** |
| W7 identity geometry | `pnpm test:role-hierarchy-geometry` — **PASS, 49/49 numeric tests** across `320, 390, 600, 799, 800, 1024, 1440` CSS px |
| Shell responsive geometry | `pnpm test:shell-responsive` — **PASS, 92 passed, 1 skipped, exit 0** |

These are numeric CSS-pixel checks from the pinned local Chromium harness. No
screenshot, image snapshot, pixel-diff, manual accessibility, or WCAG
conformance claim is made. The repository-wide test, formatter, linter, and
`pnpm check` suites were not run; full Programs/live-ui E2E was not rerun in
this child (existing exact `07928aed`/`b2e30044` evidence retained).

### C-487-01..07 current status matrix

| Row | Current status | Exact current evidence and remaining gap |
| --- | --- | --- |
| C-487-01 | **BLOCKED** | Bootstrap HTTP smoke passed historically with capability-driven sections/navigation; identity verification **94/94** and identity/access/directory components **95/95** pass currently. Dedicated normalized #487 and normalized-identity Worker seams still stop before assertions (`0`), so DM/PL/custom/tamper persona proof remains incomplete. |
| C-487-02 | **BLOCKED** | Programs Worker/domain **146/146** and Programs components **210/210** pass currently. The dedicated normalized exact-scope/equal-higher/Member Worker seam still has `0` assertions; full Programs E2E interruption history is retained without a pass claim. |
| C-487-03 | **BLOCKED** | Attendance Worker **45/45** (corrected Member `403 ROLE_FORBIDDEN` expectation now present at `normalized-authority-c487.test.ts:650`) and attendance/scanner components **76/76** pass currently. The dedicated normalized scope/auth-expiry Worker seam still stops before assertions (`0`); the corrected one-line expectation is unexecuted in this environment. |
| C-487-04 | **BLOCKED** | Auth Worker **47/47**, Home/CMS Worker **21/21**, management components **26/26** pass currently; historical direct smoke returned Admin `200`, Member `403 FORBIDDEN`, removed routes `404 NOT_FOUND`. The dedicated normalized management/tamper Worker seam still stops before assertions (`0`). |
| C-487-05 | **PARTIAL — direct D1/preflight/reset/archive subset** | Current D1 schema **25/25**, seeds/handlers **27/27**, and reset regression **1/1** pass; historical fresh 25-migration/seed/reset proofs retained. The dedicated Admin-all-on/bootstrap Worker assertion remains blocked before assertions. |
| C-487-06 | **PASS — executable audit, aliases, and route absence** | Historical full tracked audit (22 allowed primary executable lines, 0 secondary executable lines, 3 explicit route-absence assertions) retained; alias regression **2/2** passes currently; authenticated smoke returned `404 NOT_FOUND` for removed routes. |
| C-487-07 | **BLOCKED** | W7 identity geometry **49/49**, shell responsive **92 passed/1 skipped**, and web build **18/18** pass currently; live-ui **28/28** and Member Directory **1/1** retained from the exact `07928aed` child. Full Programs E2E remains interrupted historically; remote-CI parity is not claimed. |

### External blockers, manual owners, and scope

- The normalized #487 Worker, normalized identity Worker, and #485 Permission
  Editor Worker runs remain **BLOCKED before assertions** by the external
  Cloudflare-pool/Vite `EvalError: Code generation from strings disallowed
  for this context`; product assertions are **0** for each blocked run,
  including the corrected Member 403 expectation at
  `web/lib/auth/normalized-authority-c487.test.ts:650`. No unsafe-eval
  bypass, source workaround, test suppression, or assertion weakening was
  used.
- Full Programs D1 E2E and live-ui were not rerun in this child; the exact
  `07928aed`/`b2e30044` evidence is retained without new pass claims.
- `C-487-M1` (keyboard/screen-reader/reduced-motion/forced-colors/zoom/text-
  spacing), `C-487-M2` (iOS/Android device dock/safe-area), `C-487-M3`
  (remote-CI parity), and `C-487-M4` (production-promotion dry-run) remain
  **MANUAL, unclaimed**.
- No manual keyboard/AT, WCAG, reduced-motion, forced-colors, zoom/text-
  spacing, real-device, remote-CI, production-promotion, screenshot, image,
  or pixel-diff claim is made.

Only `docs/specs/s4-phase-c-acceptance-trace.md` is changed by this append.
No tracked source, test, configuration, migration, schema, fixture,
`#487` implementation path, `#488/#489`, Phase D, deployment, or external
database file was edited. The child remains stopped before Phase D.
## #487 post-fix focused evidence — current `127076bf` — 2026-08-31

**Evidence scope:** Fresh isolated child
`/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/s4-phase-c` on
`feat/s4-c-stackable-identity-integration`, created from and verified at
coordinator HEAD `127076bfcd2d42b4b9f6ff1d090961d75eb94c99`. The child was
clean before this append. This section is documentation-only. No production
source, test, configuration, migration, schema, fixture, deployment, remote,
production-data, Apps Script, Google Sheets, non-disposable database, `#488/#489`,
or Phase D path was changed.

### Authority reread before checks

Before validation I explicitly reread implementation ticket `issue://487`,
parent ticket `issue://475`, Specs
`docs/specs/091-stackable-identity-backend.md` and
`docs/specs/092-discord-identity-design-system-adoption.md`,
`local://s4-phase-c-identity-integration-plan.md` (including the Task 4
obsolete-caller audit and evidence-owner instructions), the complete current
`docs/specs/s4-phase-c-acceptance-trace.md` through all **3,817** pre-append
lines, ADRs
`docs/adr/0040-discord-derived-s4-management-interaction-authority.md`,
`docs/adr/0041-atomic-registration-batch-approval.md`,
`docs/adr/0042-discord-like-stackable-role-model.md`, and
`docs/adr/0043-owned-civic-design-system-governance.md`, and the latest review
report `agent://ReviewAuthorityFinal`.

`ReviewAuthorityFinal` remained **BLOCKED/incorrect** at its reviewed
coordinator HEAD. Its P1 findings were stale Permission Editor list/heading and
role-first management E2E contracts; missing assignment summaries for
`role.read`-only callers; global registration approval scope widening; required
normalized Worker suites stopping before assertions; missing post-anchor full
Programs E2E; the supervised Worker launch's Node 20 `node:sqlite` failure; and
unclaimed manual M1–M4 gates. This rerun specifically measures the corrected
role-read source path, the corrected global-approval source path where the
Worker seam can start, and the migrated management E2E without converting
unexecuted or manual gates into PASS.

### Runtime and required Context7 CLI lookups

Observed runtime was Node `v22.18.0`, pnpm `11.7.0`, web Vitest `4.1.10`,
Wrangler `4.127.1`, Playwright CLI `1.62.1`, root TypeScript `7.0.2`, and web
TypeScript `5.9.3`. All required lookups were attempted before validation with
the Context7 CLI (`npx --yes ctx7@latest`), not MCP Context7. All **12**
commands exited `1` with this exact quota output:

```text
✖ Monthly quota exceeded. Create a free API key at https://context7.com/dashboard for more requests.
```

The exact attempted commands were:

```text
npx --yes ctx7@latest library "Cloudflare Workers" "D1Database prepared statements batch transactions schema migrations"
npx --yes ctx7@latest docs /cloudflare/workers-sdk "D1Database prepare bind batch transaction atomic migrations PRAGMA table_info"
npx --yes ctx7@latest library vitest "Run Vitest with Specific File expect requireAssertions async assertions"
npx --yes ctx7@latest docs /vitest-dev/vitest "Run Vitest with Specific File expect(actual, message?) expect.requireAssertions async test assertions"
npx --yes ctx7@latest library playwright "viewport CSS pixels locator boundingBox route navigation webServer"
npx --yes ctx7@latest docs /microsoft/playwright "Locator.boundingBox CSS pixels Page.setViewportSize route navigation webServer"
npx --yes ctx7@latest library "Next.js" "App Router Link href URL object query parameters navigation"
npx --yes ctx7@latest docs /vercel/next.js "Pass URL object to Link in App Router query parameters navigation"
npx --yes ctx7@latest library "Radix UI" "Switch Root asChild Slot accessible semantics"
npx --yes ctx7@latest docs /radix-ui/primitives "Switch Root renders button role switch aria-checked data-state checked disabled keyboard Primitive asChild Slot composition"
npx --yes ctx7@latest library "CVA class variance authority" "cva variants VariantProps compoundVariants"
npx --yes ctx7@latest docs /joe-bell/cva "Implement component variants with cva VariantProps Type compoundVariants defaultVariants"
```

Previously selected authoritative IDs/sections in historical evidence remain
prior evidence only; no fresh Context7 success is claimed for this child.

### Focused Worker/domain checks

| Command / check | Exact current result |
| --- | --- |
| `pnpm --dir web exec vitest run --config vitest.config.ts lib/identity/role-hierarchy.test.ts lib/auth/normalized-authority-c487.test.ts` | **Exit 1.** `role-hierarchy.test.ts`: **1 file, 42/42 passed**. `normalized-authority-c487.test.ts`: Cloudflare-pool startup **before assertions**, one unhandled `EvalError: Code generation from strings disallowed for this context`; consolidated runner reported **1 passed file, 42 passed tests, 1 error**, and **0 product assertions** for the blocked file. |
| `pnpm --dir web exec vitest run --config vitest.config.ts worker.auth.test.ts` | **PASS — exit 0, 1 file, 47/47**. This existing auth/registration handler seam covers registration queue, detail, single approve/reject, idempotent decisions, and authorization guards. |
| Additional nearby `lib/auth/registration-batch.test.ts` included in the first combined focused invocation | **Exit 1 — 1 file, 6 tests; 1 passed, 5 failed**. The five failures reached assertions with actual `403` where the legacy batch fixture expected `200`/`422`; this is not counted as a C-487 PASS and is separate from the normalized `EvalError` startup failure. |

The dedicated normalized test file contains the corrected C-487-01 bootstrap,
C-487-02 Programs, C-487-03 attendance, C-487-04 management, and five-surface
registration approval test (queue/detail/approve/reject/batch). That file did
not reach any assertion in this environment. The passing hierarchy file does
execute the corrected `role.read`-only contract: same-scope assignment count
and opaque assigned account IDs are projected while assignment actions are
empty, and unrelated scoped definitions are redacted.

The normalized test failure is classified as an external
`@cloudflare/vitest-pool-workers`/Vite pre-discovery infrastructure failure.
No unsafe-eval bypass, source workaround, test suppression, assertion
weakening, or pool/config change was used.

### Focused component checks

```text
pnpm --dir web exec vitest run --config vitest.components.config.ts lib/permission-editor-panel.test.tsx lib/identity/role-hierarchy-panel.test.tsx lib/account-access-panel.test.tsx lib/management-hub.test.tsx lib/management-route-redirects.test.tsx lib/management-action-framework.test.tsx
```

**PASS — exit 0, 6 files, 89/89 tests.** This covers the Permission Editor,
role hierarchy panel, Account Access identity picker/detail, management hub,
safe management redirects, and shared management action framework. No
manual accessibility or WCAG claim is made.

### W7 identity geometry

```text
pnpm test:role-hierarchy-geometry
```

**PASS — exit 0, 49/49 numeric CSS-pixel tests** across configured
`320, 390, 600, 799, 800, 1024, 1440` widths. The run exercised
`account-access-geometry.test.ts`, `permission-editor-geometry.test.ts`, and
`role-hierarchy-geometry.test.ts` through the existing
`tests/e2e/role-hierarchy-geometry.config.ts`. No screenshot, image snapshot,
pixel-diff, manual keyboard/AT, reduced-motion, forced-colors, zoom/text-spacing,
real-device, or WCAG conformance claim is made.

### Local Worker launch, disposable D1, and seed lifecycle

The prescribed supervised launch was attempted first:

```text
pnpm --dir web dev:local
```

It exited before readiness because the supervised launcher resolved Node
`v20.19.0`, with the exact warning and failure:

```text
warn: This version of pnpm requires at least Node.js v22.13
warn: The current version of Node.js is v20.19.0
Error [ERR_UNKNOWN_BUILTIN_MODULE]: No such built-in module: node:sqlite
Node.js v20.19.0
```

No unsafe-eval or Node 20 workaround was used. A separate direct Node 22 local
Worker was then started only on loopback:

```text
fnm exec --using v22.18.0 pnpm --dir web exec wrangler dev --local --ip 127.0.0.1 --port 8797 --var EFCC_ACCESS_TOKEN_SECRET:local-s4c-evidence-secret
```

Wrangler `4.127.1` reported local `env.DB`, local `env.RPC_RATE_LIMITER`,
local `env.ASSETS`, and `Ready on http://127.0.0.1:8797`. The first
secretless seed-demo probe correctly failed closed with
`HTTP 503 ... AUTH_NOT_CONFIGURED`; after restarting with the disposable
secret, `DEMO_TARGET_URL=http://127.0.0.1:8797 pnpm db:seed:demo` passed and
reported the four demo Programs, 13 generated events, the module-gate
department, notices, and demo Home content.

Local D1 was migrated with `pnpm --dir web exec wrangler d1 migrations apply
efcc-identity --local` (**25 migrations**). The checked-in
`pnpm db:seed:local` script completed its **19 + 11 + 6** local commands, and
the checked-in `pnpm db:seed:disposable` portion completed **6** commands.
After the interrupted management run, the same checked-in local reset plus
demo seed sequence completed again. No remote or production D1 was used.

### Full targeted Programs D1 E2E

The clean-fixture command was:

```text
PROGRAMS_TARGET_URL=http://127.0.0.1:8797 fnm exec --using v22.18.0 pnpm exec playwright test --config=tests/e2e/programs-d1.config.ts
```

The config scheduled **195 tests** with one worker and exited `1` after
**4.3 minutes**: **192 passed, 1 failed, 2 flaky**. The exact unresolved
results were:

- `[desktop] tests/e2e/programs-d1.test.ts:2642` — MUI-01 workspace geometry:
  `workspaceScrollWidth` expected `<= 263`, received `309`; the retry was
  recorded as flaky.
- `[desktop] tests/e2e/pui-05-home-origin.test.ts:586` — Home next-event:
  `programId` was empty; the retry remained failed.
- `[desktop] tests/e2e/pui-05-home-origin.test.ts:650` — Home Explore:
  `getByTestId('explore-card')` was not found; the retry was recorded as flaky.

No Worker death or connection-refused cascade was reported in this run. This
is a measured partial result, not a `195/195` claim; the earlier full pass at
an older commit remains historical and is not relabeled as current.

### Normalized management hardening E2E

After a checked-in local reset and demo seed, the all-project command was
started as:

```text
PROGRAMS_TARGET_URL=http://127.0.0.1:8797 S4_E2E_OUTPUT_DIR=/tmp/s4c-management-hardening-127076bf S4_E2E_RESULTS_FILE=/tmp/s4c-management-hardening-127076bf-results.json fnm exec --using v22.18.0 pnpm exec playwright test --config=tests/e2e/s4-management-hardening.config.ts
```

The config scheduled **110 tests** across all **11 configured projects** with
one worker. It produced no final result JSON and was interrupted through the
background-job handle `bg_2` after the bounded run exceeded six minutes while
the Worker-backed assertions made no complete progress. The observed partial
output included an initial navigation failure and retry, skipped dependent
tests, a failed management-landmark assertion and retry, one passing legacy
redirect test, and a failed mobile action-surface assertion and retry. The
runner was stopped cleanly; the verified process handle had no remaining PID.
Because the run was interrupted, **no aggregate management pass/fail count or
management readiness claim is made**. The migrated hardening E2E therefore
remains an explicit blocker rather than being silently treated as historical
evidence.

The existing live UI and Member Directory configs were not started after the
management runner interruption; no live-ui or Member Directory PASS is claimed
in this section. Their earlier exact results remain historical only.

### C-487 corrected-path status

| Contract | Current evidence at `127076bf` | Status |
| --- | --- | --- |
| `role.read`-only hierarchy assignment counts/opaque IDs, no assign/revoke actions, out-of-scope redaction | `lib/identity/role-hierarchy.test.ts` | **PASS — 42/42** |
| Five registration approval surfaces reject scoped-only `registration.approval.manage` and accept global Staff grant | Dedicated `lib/auth/normalized-authority-c487.test.ts` contains the contract, but Cloudflare-pool startup stopped before assertions | **BLOCKED — 0 assertions** |
| Permission Editor normalized heading/list/loading/direct-detail/switch/Sheet contracts | Six-file component run and W7 geometry | **PASS — components 89/89; geometry 49/49** |
| Programs/attendance/bootstrap/reset/legacy route behavior | Programs E2E **192/195**; auth handler **47/47**; normalized C-487 Worker **0 assertions**; local migrations/seeds pass | **PARTIAL/BLOCKED — no full C-487 readiness claim** |

`C-487-M1` (keyboard/screen-reader/reduced-motion/forced-colors/zoom/
text-spacing), `C-487-M2` (iOS/Android dock and safe-area), `C-487-M3`
(remote-CI parity), and `C-487-M4` (production-promotion dry run) remain
**MANUAL, unclaimed**. No manual accessibility, WCAG, real-device, remote-CI,
production-promotion, screenshot, image, or pixel-diff claim is made.

The established Phase C QA file
`docs/qa/2026-08-29-s4-phase-c-foundation.md` is absent at this HEAD, so no new
QA file was created. Only this acceptance trace was appended; all historical
trace sections remain unchanged. The child remains stopped before Phase D.

## #487 final local verification — current `4d1f648b` — 2026-08-31

**Evidence scope:** The coordinator tree
`/Users/noah.wong/Desktop/code/EFCC-dev/.worktrees/s4-phase-c` on
`feat/s4-c-stackable-identity-integration` was clean at `4d1f648b` before
this append. The final source corrections enforce target-scoped `role.read`
assignment summaries, global-only registration approval authorization, 44px
management hit targets, deterministic review focus restoration, and local
disposable registration cleanup. The final test corrections seed normalized
Admin identities in legacy Worker fixtures, bound Member Directory searches,
and preserve the normalized Permission Editor DOM contract.

### Required reread and documentation status

Before this verification pass, the implementation ticket `issue://487`, parent
`issue://475`, Specs 091 and 092, the approved
`local://s4-phase-c-identity-integration-plan.md`, the complete historical
acceptance trace through line 4,042, ADRs 0040/0041/0042/0043, and the
review/evidence reports for #485/#486/#487 were reread. Context7 CLI was
attempted for the required Worker/D1, Vitest, Playwright, Next.js, Radix, and
CVA references; every attempted lookup returned exit 1 with:

```text
✖ Monthly quota exceeded. Create a free API key at https://context7.com/dashboard for more requests.
```

No fresh documentation result or library identifier is claimed.

### Source and focused test checks

| Check | Exact result |
| --- | --- |
| `pnpm typecheck` | **PASS**, root and E2E TypeScript, exit 0 |
| `pnpm --dir web typecheck` | **PASS**, web and Worker TypeScript, exit 0 |
| `pnpm --dir web build` | **PASS**, 18/18 static pages and 16 visible route rows |
| `pnpm verify:identity` | **PASS**, 4 files, 94/94 |
| Repaired normalized Worker fixtures (`programs-250`, `notices-worker`, `registration-batch`) | **PASS**, 3 files, 23/23 |
| `pnpm --dir web exec vitest run --config vitest.config.ts worker.auth.test.ts` | **PASS**, 1 file, 47/47 |
| `pnpm --dir web exec vitest run --config vitest.config.ts lib/identity/role-hierarchy.test.ts` | **PASS**, 1 file, 42/42; includes role.read-only assignment summary and redaction |
| `pnpm --dir web test:components` | **PASS**, 59 files, 688/688; jsdom emitted only existing `scrollTo`/navigation notices |
| `pnpm test` | **PASS**, 1 file, 38/38 |
| `pnpm test:role-hierarchy-geometry` | **PASS**, 49/49 across 320, 390, 600, 799, 800, 1024, and 1440 CSS px |
| `pnpm test:shell-responsive` | **PASS**, 92 passed, 1 intentional skip |
| `pnpm test:shell-geometry` | **PASS**, 28/28 |
| `pnpm check` | **FAIL**, repository-wide pre-existing lint baseline findings; no new lint-clean claim is made |
| `git diff --check` | **PASS**, no whitespace errors |

The aggregate web Worker command
`pnpm --dir web test` ran 37 passing test files with no assertion failures,
but exited 1 after four normalized Worker files aborted before assertions in
the Cloudflare pool with `EvalError: Code generation from strings disallowed
for this context`: `lib/auth/normalized-authority-c487.test.ts`,
`lib/identity/permission-editor.test.ts`,
`lib/identity/permission-editor-handlers.test.ts`, and
`lib/identity/normalized-authority.test.ts`. The blocked files contributed
zero product assertions. Research
`docs/qa/2026-08-29-s4-phase-c-vitest-pool-research.md` records the upstream
Vite/workerd cause and the decision not to add unsafe-eval, `NODE_OPTIONS`,
pool downgrades, or assertion suppression.

### Local disposable runtime and end-to-end checks

The prescribed `pnpm --dir web dev:local` attempt still fails before readiness
under the supervised Node `v20.19.0` launcher with
`ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`. No workaround or production
endpoint was used. A separate direct Node `v22.18.0` Wrangler process was
started only on `http://127.0.0.1:8797`; it reported local D1/assets/rate-limit
bindings and readiness. The checked-in local reset applied 20 commands and
the demo seed completed with four demo Programs, 13 generated events, module
gate data, notices, and Home content. A post-reset D1 query returned
`pending: 0` and `legacy_s4: 0` for the managed registration prefixes.

All browser checks below used the loopback Worker and disposable local D1:

| Check | Exact result |
| --- | --- |
| `programs-d1.config.ts` | **PASS**, 195/195 with one worker after clean reset/demo seed |
| `s4-management-hardening.config.ts` | **PASS**, 45 passed and 65 intentional `onlyProjects` skips; 110 scheduled, zero failures |
| `live-ui.config.ts` | **PASS**, 28/28 at phone and desktop projects |
| `member-directory.config.ts` | **PASS**, 1/1; Admin/Staff global visibility, Department Manager scope exclusion, and inline read-only detail |
| Representative management rerun (`phone-390`, `desktop-1024`) | **PASS**, 14/14 executed and 6 intentional skips |

The final management run covers the normalized Permission Editor heading/list,
loading output, direct role detail, Radix Switch review, bounded Sheet,
control hit targets, restored focus, account-directory geometry, safe Back
origins, and legacy route redirects. No screenshots, pixel diffs, WCAG
conformance, screen-reader, real-device, remote-CI, or production-promotion
claim is made.

### Current acceptance status and remaining gates

The corrected source and local automation now pass the reachable C-487
authority, Programs, attendance, management, reset, identity, and UI
contracts. The following remain explicit release gates rather than hidden
failures:

- Normalized Worker files cannot start in the installed
  `@cloudflare/vitest-pool-workers`/Vite/workerd context, producing zero
  assertions before product code executes.
- The supervised `pnpm --dir web dev:local` launcher is unavailable under
  Node 20; direct Node 22 Wrangler evidence is local-only and is not relabeled
  as the supervised gate.
- `C-487-M1` keyboard/screen-reader plus reduced-motion/forced-colors/
  zoom/text-spacing, `C-487-M2` real iOS/Android dock and safe-area,
  `C-487-M3` remote-CI parity, and `C-487-M4` production-promotion dry run
  remain **MANUAL, unclaimed**. The user explicitly requested no production
  action.

Only this acceptance trace is changed by this append. No remote or
production database, Apps Script, Google Sheet, deployment, `#488/#489`, or
Phase D path was touched. The local Worker was stopped after verification.

## #487 final Phase C verification — current `189eb78b` — 2026-08-30

### Required reread and documentation status

All implementation and review delegations were instructed to reread tickets
`#485`, `#486`, and `#487`, parent `#475`, Specs 091/092, this plan, and this
trace before acting. They were also instructed to use Context7 CLI for
unfamiliar APIs and report the exact result. The CLI returned:

`✖ Monthly quota exceeded. Create a free API key at https://context7.com/dashboard for more requests.`

No fresh documentation identifier or unsupported API claim is recorded.

### Source and focused checks

| Check | Exact result |
| --- | --- |
| `pnpm typecheck` | **PASS**, root and E2E TypeScript |
| `pnpm --dir web typecheck` | **PASS**, web and Worker TypeScript |
| `pnpm --dir web build` | **PASS**, 18/18 static routes generated |
| `pnpm --dir web test:components` | **PASS**, 59 files, 690/690 |
| `pnpm verify:identity` | **PASS**, 4 files, 94/94 |
| `pnpm test` | **PASS**, 1 file, 38/38 |
| Focused management identity components | **PASS**, 4 files, 62/62 |
| `pnpm test:shell-responsive` | **PASS**, 92 passed, 1 intentional skip |
| `pnpm test:shell-geometry` | **PASS**, 28/28 |
| `pnpm test:role-hierarchy-geometry` | **PASS**, 49/49 across 320, 390, 600, 799, 800, 1024, and 1440 CSS px |
| `pnpm check` | **FAIL**, repository-wide Ultracite baseline: 1,782 errors and 0 warnings |
| `git diff --check` | **PASS**, no whitespace errors |

Component output contained only existing jsdom `scrollTo()` and navigation
notices. No component assertion failed.

### Local disposable runtime and browser checks

The prescribed `pnpm --dir web dev:local` launcher still fails under the
supervised Node `v20.19.0` runtime with
`ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`. A separate direct Node `v22.18.0`
Wrangler process was started only on `http://127.0.0.1:8797`, with the auth
secret supplied through Wrangler `--var`; it was stopped after verification.
The local reset completed 20 D1 commands. The demo seed completed with four
`E2E_DEMO_` Programs, 13 generated events, module-gate data, notices, and Home
content.

| Check | Exact result |
| --- | --- |
| `programs-d1.config.ts` | **PASS**, 195/195 with one worker after reset and demo seed |
| `s4-management-hardening.config.ts` | **PASS**, 45 passed and 65 intentional `onlyProjects` skips; 110 scheduled, zero failures |
| `live-ui.config.ts` | **PASS**, 28/28 across phone and desktop projects after a clean fixture reset |
| `member-directory.config.ts` | **PASS**, 1/1; global Admin/Staff visibility, scoped Department Manager exclusion, and inline detail |

The first live-ui attempt used the wrong environment variable and is not
counted; the corrected `AUTH_UI_TARGET_URL=http://127.0.0.1:8797` invocation
passed 28/28.

### Aggregate Worker and remaining gates

`pnpm --dir web test` exited 1 after 37 passing files and 555 passing
assertions because four normalized Worker files aborted before assertions in
the installed Cloudflare pool with
`EvalError: Code generation from strings disallowed for this context`:

- `web/lib/auth/normalized-authority-c487.test.ts`
- `web/lib/identity/permission-editor.test.ts`
- `web/lib/identity/permission-editor-handlers.test.ts`
- `web/lib/identity/normalized-authority.test.ts`

The upstream evaluator cause and the decision not to add unsafe-eval,
`NODE_OPTIONS`, pool downgrades, or assertion suppression are recorded in
`docs/qa/2026-08-29-s4-phase-c-vitest-pool-research.md`. Required QA evidence
is recorded in `docs/qa/2026-08-29-s4-phase-c-foundation.md`.

`C-487-M1` keyboard/screen-reader plus reduced-motion/forced-colors/
zoom/text-spacing, `C-487-M2` real iOS/Android dock and safe-area,
`C-487-M3` remote-CI parity, and `C-487-M4` production-promotion dry run
remain **MANUAL, unclaimed**. No screenshot, pixel-diff, WCAG conformance,
screen-reader, real-device, remote-CI, production-promotion, deployment,
remote database, Apps Script, or Google Sheet claim is made.

The local Worker was stopped after verification. No Phase D path or `#488/#489`
was touched.

## #485–#487 final corrected verification — current `6c93b8d0` — 2026-08-31

### Corrections since the preceding review

- Active and revoked assignment projections now use immutable
  `role_assignments.scope_kind/scope_id` snapshots for display and
  authorization. Role Definition labels, grants, positions, and lifecycle
  metadata remain current; new assignments still copy the current definition
  scope. Programs directory scope predicates use the same assignment snapshot.
- Management status and permission-row state classes now route through local
  CVA variants and `cn`.
- The Programs management workspace's two-column directory tiles now use
  `minmax(0, 1fr)` tracks and `min-w-0 whitespace-normal` buttons, preserving
  the 320px geometry contract.

### Final source and test evidence

| Check | Exact result |
| --- | --- |
| `pnpm typecheck` | **PASS**, root and E2E TypeScript |
| `pnpm --dir web typecheck` | **PASS**, web and Worker TypeScript |
| `pnpm --dir web build` | **PASS**, 18/18 static routes generated |
| `pnpm --dir web test:components` | **PASS**, 59 files, 690/690 |
| `pnpm verify:identity` | **PASS**, 4 files, 94/94 |
| Account Access scope regressions | **PASS**, 2 files, 29/29 |
| `pnpm test` | **PASS**, 1 file, 38/38 |
| `pnpm test:shell-responsive` | **PASS**, 92 passed, 1 intentional skip |
| `pnpm test:shell-geometry` | **PASS**, 28/28 |
| `pnpm test:role-hierarchy-geometry` | **PASS**, 49/49 across 320, 390, 600, 799, 800, 1024, and 1440 CSS px |
| `programs-d1.config.ts` | **PASS**, 195/195 after clean reset/demo seed |
| `s4-management-hardening.config.ts` | **PASS**, 45 passed and 65 intentional `onlyProjects` skips; 110 scheduled |
| `live-ui.config.ts` | **PASS**, 28/28 |
| `member-directory.config.ts` | **PASS**, 1/1 |
| Registration fixture hygiene query | **PASS**, `pending: 0`, `legacy_s4: 0` |
| `git diff --check` | **PASS** |
| `pnpm check` | **FAIL**, repository-wide Ultracite baseline: 1,813 errors and 0 warnings |

The aggregate `pnpm --dir web test` invocation remains **BLOCKED** by the
known environment failure: 37 files and 555 assertions passed, while four
normalized Worker files abort before assertions with
`EvalError: Code generation from strings disallowed for this context` in the
installed Cloudflare pool/Vite evaluator. The research note records the
upstream cause and rejected unsafe-eval, `NODE_OPTIONS`, downgrade, and
suppression workarounds.

All authenticated browser checks used disposable local D1 and the direct
Node `v22.18.0` Wrangler process at `http://127.0.0.1:8797`; the Worker was
stopped after verification. The supervised Node 20 `dev:local` launcher still
fails with `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite` and is not relabeled as
passed. `C-487-M1` through `C-487-M4` remain **MANUAL, unclaimed**. No
production, remote, Apps Script, Google Sheet, deployment, screenshot,
pixel-diff, WCAG, screen-reader, real-device, or Phase D claim is made.

## #485–#487 final summary-scope verification — current `c0905b2e` — 2026-08-31

The final review correction applies one shared immutable-assignment-scope
predicate to Role Tree assignment counts/IDs and Permission Editor assigned
accounts. A scoped caller now receives only Global, same-Department (including
Program descendants), or same-Program assignment summaries; Admin/global
callers retain the complete projection. The role definition remains the source
for current label, grant, position, and lifecycle metadata. QA provenance now
points to the repository Specs 091/092 and the approved local plan artifact.

| Check | Exact result |
| --- | --- |
| `pnpm typecheck` | **PASS** |
| `pnpm --dir web typecheck` | **PASS** |
| `pnpm --dir web build` | **PASS**, 18/18 static routes generated |
| `pnpm --dir web test:components` | **PASS**, 59 files, 690/690 |
| Scoped-summary component subset | **PASS**, 5 files, 113/113 |
| `pnpm verify:identity` | **PASS**, 4 files, 95/95 |
| Account Access and history tests | **PASS**, 2 files, 29/29 |
| `pnpm test` | **PASS**, 1 file, 38/38 |
| `pnpm test:shell-responsive` | **PASS**, 92 passed, 1 intentional skip |
| `pnpm test:shell-geometry` | **PASS**, 28/28 |
| `pnpm test:role-hierarchy-geometry` | **PASS**, 49/49 |
| `programs-d1.config.ts` | **PASS**, 195/195 after the workspace tile correction |
| `s4-management-hardening.config.ts` | **PASS**, 45 passed and 65 intentional `onlyProjects` skips; 110 scheduled |
| `live-ui.config.ts` | **PASS**, 28/28 |
| `member-directory.config.ts` | **PASS**, 1/1 |
| Local registration hygiene query | **PASS**, `pending: 0`, `legacy_s4: 0` |
| `git diff --check` | **PASS** |
| `pnpm check` | **FAIL**, repository-wide Ultracite baseline: 1,813 errors and 0 warnings |

The aggregate `pnpm --dir web test` remains **BLOCKED** by four normalized
Worker files aborting before assertions with the known Cloudflare-pool/Vite
`EvalError`; the full command still recorded 37 passing files and 555 passing
assertions. Manual `C-487-M1` through `C-487-M4` remain **unclaimed**. No
remote or production resource, Apps Script, Google Sheet, deployment,
screenshot, pixel-diff, WCAG, screen-reader, real-device, or Phase D path was
touched.

## #485–#487 final affordance verification — current `4773b63d` — 2026-08-31

The identity-first Role Tree now renders the Account Access entry only when
the server projects `role.assign` or `role.revoke` assignment actions. A
read-only `role.read` viewer with assigned identities receives the summary but
not a dead-end mutation link. The component regression preserves both that
case and the zero-assignment assignment-action path.

| Check | Exact result |
| --- | --- |
| `pnpm --dir web test:components` | **PASS**, 59 files, 691/691 |
| `pnpm verify:identity` | **PASS**, 4 files, 95/95 |
| `pnpm typecheck` | **PASS** |
| `pnpm --dir web typecheck` | **PASS** |
| `pnpm --dir web build` | **PASS**, 18/18 static routes generated |
| `pnpm test:shell-responsive` | **PASS**, 92 passed, 1 intentional skip |
| `pnpm test:shell-geometry` | **PASS**, 28/28 |
| `pnpm test:role-hierarchy-geometry` | **PASS**, 49/49 |
| `programs-d1.config.ts` | **PASS**, 195/195 after the 320px workspace tile correction |
| `s4-management-hardening.config.ts` | **PASS**, 45 passed and 65 intentional `onlyProjects` skips; 110 scheduled |
| `live-ui.config.ts` | **PASS**, 28/28 |
| `member-directory.config.ts` | **PASS**, 1/1 |
| Account Access and history tests | **PASS**, 2 files, 29/29 |
| `pnpm --dir web test` | **BLOCKED**, 37 files and 556 assertions pass; 4 normalized Worker files abort before assertions with the known Cloudflare-pool/Vite EvalError |
| `pnpm check` | **FAIL**, repository-wide Ultracite baseline: 1,813 errors and 0 warnings |

All local browser checks used disposable D1 on loopback with direct Node 22
Wrangler; the Worker was stopped after verification. Manual M1–M4 remain
unclaimed. No remote/production, Apps Script, Sheet, deployment, screenshot,
pixel-diff, WCAG, screen-reader, real-device, or Phase D claim is made.

## Final pre-publication verification — source `f3cf4e1db292426d5ba4dc93a1dcadbe0f71c262` — 2026-08-31

This section is the final source-SHA classification. `PASS` means the
observable contract was exercised by the listed local seam. `INFRA-BLOCKED`
means the required Worker test seam could not start; component or source
evidence is not promoted to a Worker PASS. Manual rows remain
`MANUAL — unclaimed`. No blanket READY status is assigned.

**Source and environment:** branch
`feat/s4-c-stackable-identity-integration`; accepted Phase B base and
merge-base `c75c99e84d699d2d1eac44f07d4e013ead4c12a5`; Node `v22.18.0`; pnpm
`11.7.0`; Vitest `4.1.10`; workspace Vite `5.4.21` (the Cloudflare-pool
startup stack reports Vite `8.2.0`); Wrangler `4.127.1`; Playwright `1.62.1`;
local Worker `http://127.0.0.1:8797` with
`EFCC_ACCESS_TOKEN_SECRET=phase-c-local-only-secret`; disposable local D1 only.
Every mutating browser suite was preceded by `db:seed:local` and
`db:seed:demo`. The Worker was stopped after the final registration-residue
query.

### Final criterion status

| Criterion | Status | Direct evidence at this source SHA |
| --- | --- | --- |
| C-485-01 | **INFRA-BLOCKED** | Component list/detail and safe URL behavior passed; the required Permission Editor Worker detail seam could not start because `permission-editor.test.ts` aborted at Cloudflare-pool startup before assertions. |
| C-485-02 | **INFRA-BLOCKED** | Component Switch semantics and W7 numeric geometry passed; the Worker lock matrix and manual keyboard/AT review remain unavailable or unclaimed. |
| C-485-03 | **INFRA-BLOCKED** | Component dirty-draft, Sheet review, retry-key, and conflict behavior passed; the Worker atomic grant/revision/audit path was blocked before assertions. |
| C-485-04 | **INFRA-BLOCKED** | Component ordinary/high-risk review split and W7 geometry passed; exact Worker threshold/audit coverage was blocked before assertions. |
| C-485-05 | **INFRA-BLOCKED** | `permission-editor-handlers.test.ts` and the Permission Editor domain seam both failed before assertions with the Cloudflare-pool EvalError; no HTTP/D1 grant PASS is claimed. |
| C-485-06 | **INFRA-BLOCKED** | Component conflict/recovery behavior passed; Worker stale-revision, denial, protected-target, and idempotency-reuse assertions were blocked before assertions. |
| C-485-M1 | **MANUAL — unclaimed** | Keyboard-only Permission Editor review at 320/1440, focus visibility, target size, dock clearance, and review surfaces. |
| C-485-M2 | **MANUAL — unclaimed** | Screen-reader Switch, dirty/saving/success/error/conflict, and high-risk acknowledgement review. |
| C-486-01 | **PASS** | Local Worker/domain, Account Access handler, Account Directory, Account Access component, Programs D1, and member-directory seams passed safe Active/non-Admin filtering, self suppression, and private-field exclusions. |
| C-486-02 | **PASS** | Local account-access domain and handler tests passed multi-identity atomic add, duplicate IDs, fresh assignment behavior, and first/replayed idempotency (`false`/`true`). |
| C-486-03 | **PASS** | Local account-access and handler seams passed invalid-batch rollback, self/target guards, and canonical error handling; the final browser and focused runs were clean. |
| C-486-04 | **PASS** | Local domain/history and handler seams passed revoke history, fresh re-add, duplicate replay, and explicit revoke/lifecycle response envelopes. |
| C-486-05 | **PASS** | Local Account Access component/domain seams passed scope-grouped Effective Permission, provenance, lost/retained impact, archive impact, and ordinary-read privacy projection. |
| C-486-06 | **PASS** | Local lifecycle domain/handler and browser seams passed archive, bulk revoke, preserved grants/history, blocked assignment, restore, and first/replayed idempotency behavior. |
| C-486-07 | **PASS** | Account Access, live UI, member directory, shell, and identity geometry runs passed canonical links, responsive containment, and W7 widths; manual focus/AT rows remain separate. |
| C-486-M1 | **MANUAL — unclaimed** | Keyboard-only identity-first/account-first Account Access entry, Back/history, focus, target-size, and dock review. |
| C-486-M2 | **MANUAL — unclaimed** | Screen-reader Effective Permission groups, provenance, archive impact, and revoke/re-add announcement review. |
| C-487-01 | **PASS** | Programs D1/live UI local journeys and identity bootstrap checks passed normalized capability-derived sections/navigation and privacy-safe summaries; the separate normalized-authority Worker file is included in the documented pool blocker. |
| C-487-02 | **PASS** | Programs D1 local Worker journeys passed normalized scope behavior across Programs management, directory, workspace, enrollment, and module actions. |
| C-487-03 | **PASS** | Programs D1/local attendance journeys passed normalized Department/Program operator scope and member/out-of-scope denial behavior. |
| C-487-04 | **PASS** | Programs D1, live UI, Account Directory, Management Hub, and focused Hub seams passed normalized management gates, including self/Admin/inactive access suppression and corrected role-link destinations. |
| C-487-05 | **PASS** | `verify:identity` passed 4 files/96 assertions; migration 0025 active-assignment immutability passed; the disposable seed wrapper failed closed on a retired table, printed a manual local DROP command, wrote no seed row, then succeeded after only the probe table was manually removed. |
| C-487-06 | **PASS** | The exact legacy-token audit found only preflight, seed-wrapper, and stale-schema-test references; no executable production authority path remains outside those guards. |
| C-487-07 | **PASS** | Programs D1 195/195, management hardening 45/45 with 65 intentional skips, live UI 28/28, member directory 1/1, responsive 92 plus 1 intentional skip, shell geometry 28/28, and identity geometry 49/49 passed. |
| C-487-M1 | **MANUAL — unclaimed** | Reduced-motion, forced-colors, 200% zoom, and text-spacing review across Permission Editor, Account Access, bootstrap, and management. |
| C-487-M2 | **MANUAL — unclaimed** | Real iOS/Android dock and safe-area review at 320/390. |
| C-487-M3 | **MANUAL — unclaimed** | Remote-CI verification; local evidence does not claim CI parity. |
| C-487-M4 | **MANUAL — unclaimed** | Production-promotion dry run; no production, Apps Script, Sheets, or remote Cloudflare write was attempted. |

### Final command and infrastructure record

| Command or check | Result |
| --- | --- |
| `pnpm typecheck` | **PASS**, root and E2E TypeScript |
| `pnpm --dir web typecheck` | **PASS**, web and Worker TypeScript |
| `pnpm --dir web build` | **PASS**, 18 static routes |
| `pnpm test` | **PASS**, 38/38 |
| `pnpm verify:identity` | **PASS**, 4 files/96 assertions |
| `pnpm --dir web test:components` | **PASS**, 59 files/692 assertions |
| Focused identity/account/Hub/attendance runner | **PASS**, 6 files/107 assertions |
| `pnpm --dir web test` | **INFRA-BLOCKED**, exit 1; 37 files/559 assertions passed; `lib/auth/normalized-authority-c487.test.ts`, `lib/identity/permission-editor.test.ts`, `lib/identity/permission-editor-handlers.test.ts`, and `lib/identity/normalized-authority.test.ts` aborted before assertions with `EvalError: Code generation from strings disallowed for this context` |
| Final `pnpm check` baseline | **FAIL**, 295 files, 1,824 diagnostics, 0 warnings, 557 rules; zero diagnostics were introduced on Phase C added lines |
| Context7 CLI | Quota response: `✖ Monthly quota exceeded. Create a free API key at https://context7.com/dashboard for more requests.` No fresh documentation claim is made. |
| Prescribed `pnpm dev:local` launcher | **INFRA-BLOCKED**, Node 20 reports `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`; direct Node 22 was used only for loopback verification |

All evidence is local/disposable and CSS-pixel based. No screenshot,
pixel-diff, WCAG-conformance, screen-reader, real-device, remote-CI,
production-promotion, Apps Script, Google Sheet, remote-D1, deployment, merge,
or Phase D claim is made.

## Fresh-review correction verification — source `be4aff4f3a0c5ceca2edc7276e23a89f6fbaf912` — 2026-08-31

The first complete two-axis review reported two concrete Standards P2s and
one Spec blocker, plus a reserved-route collision risk. The correction source
now:

- renders the Account Directory → Account Access CTA with local `Button
  asChild` + semantic `Link`, preserving the encoded return URL, `min-h-11`,
  and focus-restoration ref;
- applies `min-h-11` to Permission Editor conflict-recovery, save, and retry
  controls;
- exposes `data.idempotent` on successful Permission Editor PATCH responses
  (`false` for the first terminal result, `true` for a same
  actor/key/fingerprint replay) while keeping `responseRequestId` transport
  only;
- records broad `role.permissions.read` denials through the terminal
  denial/audit reservation before returning `RoleCapabilityDeniedError`; and
- reserves `/api/v1/programs/account-permissions` before the generic program
  ID route, with a normalized-authority collision regression.

| Correction verification | Result |
| --- | --- |
| `pnpm typecheck` and `pnpm --dir web typecheck` | **PASS** |
| `pnpm --dir web build` | **PASS**, 18/18 static routes |
| `pnpm --dir web test:components` | **PASS**, 59 files/692 assertions |
| `pnpm test:role-hierarchy-geometry` | **PASS**, 49/49 |
| `s4-management-hardening.config.ts` | **PASS**, 45 passed, 65 intentional skips, 110 scheduled |
| Account Directory + Permission Editor component subset | **PASS**, 25/25 |
| Authenticated retired-route collision smoke | **PASS**, local dev Admin login returned 200 and the reserved path returned `404 NOT_FOUND` even with a disposable `programs.program_id = 'account-permissions'` row; the row was deleted |
| `normalized-authority.test.ts` collision regression | **INFRA-BLOCKED**, exit 1 before assertions with the known Cloudflare-pool `EvalError`; no product assertion is claimed from that file |
| Final Ultracite baseline | **FAIL**, 295 files, 1,823 diagnostics, 0 warnings, 557 rules; no new diagnostics occurred on the correction lines |
| Final disposable registration residue | **PASS**, `pending: 0`, `legacy_s4: 0`; the Worker was stopped |

The earlier final source classification remains valid for the untouched
criteria. The Cloudflare-pool blocker continues to affect
`lib/auth/normalized-authority-c487.test.ts`,
`lib/identity/permission-editor.test.ts`,
`lib/identity/permission-editor-handlers.test.ts`, and
`lib/identity/normalized-authority.test.ts`; the blocked tests reached zero
product assertions. `C-485-M1/M2`, `C-486-M1/M2`, and `C-487-M1..M4` remain
`MANUAL — unclaimed`. No screenshot, pixel-diff, WCAG, screen-reader,
real-device, remote-CI, production-promotion, remote-D1, deployment, merge,
or Phase D claim is made.

## Final hardening verification — source `1ccbb0120eb9d5c288f3e385f7194b9cfd59853f` — 2026-08-31

The final hardening pass addressed the remaining review edge cases:

- dynamic Permission Editor, Account Access, Account Directory, Member
  Directory, and Role Hierarchy rows now use `h-auto whitespace-normal`,
  `min-w-0`, and wrapped secondary content where long identity labels can
  otherwise inherit the local Button primitive's `h-8`/`whitespace-nowrap`;
- both disposable-table guards normalize sqlite table names case-insensitively;
- migration 0024 uses SQLite `IS NOT` for nullable scope snapshot equality,
  rejecting a literal `<NULL>` scope ID for a Global Role Definition; and
- `assertSelfTarget` was rechecked: its final capability-denied throw makes
  every actor-self grant/revoke target fail, including lower roles.

| Hardening criterion | Status | Evidence |
| --- | --- | --- |
| C-485-01 through C-485-06 | **INFRA-BLOCKED** | No Permission Editor Worker test assertion is available because the four documented Cloudflare-pool files abort before assertions; component/geometry results remain as recorded above. |
| C-486-01 through C-486-07 | **PASS** | Account Access domain/handler/component, self-target, scope, lifecycle, idempotency, and local browser evidence remains green. |
| C-487-01 through C-487-07 | **PASS** | Normalized identity, route guard, case-insensitive seed preflight, sentinel scope trigger, Programs/management/local browser, and W7 evidence are green; only the separate normalized Worker test file is infrastructure-blocked. |
| C-485-M1/M2, C-486-M1/M2, C-487-M1..M4 | **MANUAL — unclaimed** | No human keyboard, screen-reader, reduced-motion, forced-colors, zoom/text-spacing, real-device, remote-CI, or production-promotion review was performed. |

At this source SHA: `pnpm verify:identity` passed 4 files/98 assertions;
`pnpm --dir web test:components` passed 59 files/692 assertions;
`pnpm test` passed 38/38; `pnpm test:role-hierarchy-geometry` passed 49/49;
the local Management Hardening gate passed 45 with 65 intentional skips; and
the final Ultracite baseline remained 1,823 diagnostics/0 warnings across 295
files with no new hardening-line diagnostics. The uppercase wrapper probe and
the authenticated reserved-route collision smoke both passed after local
cleanup. Final registration residue is `pending: 0`, `legacy_s4: 0`, and the
Worker is stopped.

No screenshot, pixel-diff, WCAG-conformance, screen-reader, real-device,
remote-CI, production-promotion, remote-D1, deployment, merge, Apps Script,
Google Sheet, or Phase D claim is made.

## Lifecycle-only CTA correction — source `de16607a9a3230d2fc7cd67b0267c7ace0a834d1` — 2026-08-31

The final Spec review found that a Role Hierarchy actor with only lifecycle
authority (`role.delete`) had no identity-first path to the Account Access
lifecycle controls. The CTA condition now accepts either non-empty
`assignmentActions` or non-empty `lifecycleActions`, while protected roles and
viewers with neither remain hidden.

| Correction | Status | Evidence |
| --- | --- | --- |
| Lifecycle-only Role Hierarchy CTA | **PASS** | `role-hierarchy-panel.test.tsx` passes 21/21, including lifecycle-only and no-action viewers. |
| W7 containment after CTA change | **PASS** | `pnpm test:role-hierarchy-geometry` passes 49/49 at all W7 widths. |
| Source type/build safety | **PASS** | `pnpm typecheck`, `pnpm --dir web typecheck`, and `pnpm --dir web build` pass; build emits 18 static routes. |
| Remaining release status | **MANUAL / INFRA** | Permission Editor Worker tests remain Cloudflare-pool `EvalError` infrastructure-blocked; all M1/M2/M3/M4 rows remain `MANUAL — unclaimed`. |

The source correction introduces no new data path or authority path. No
screenshot, pixel-diff, WCAG-conformance, screen-reader, real-device,
remote-CI, production-promotion, remote-D1, deployment, merge, Apps Script,
Google Sheet, or Phase D claim is made.

## Scope-first row wrapping correction — source `30079e6f257c17d95d1f1dc67bc6f91dfc29bce7` — 2026-08-31

The final Standards review found one remaining dynamic identity-definition
picker link that still inherited the local Button primitive's fixed height and
nowrap behavior. The scope-first Account Access links now use
`h-auto min-h-11 min-w-0 whitespace-normal`, matching the assigned-account and
candidate-account links.

| Correction | Status | Evidence |
| --- | --- | --- |
| Scope-first long-label containment | **PASS** | Account Access component navigation remains green and the link has explicit auto-height, minimum target size, minimum width, and normal wrapping. |
| W7 geometry | **PASS** | `pnpm test:role-hierarchy-geometry` passes 49/49 at `320, 390, 600, 799, 800, 1024, 1440`. |
| Release classification | **MANUAL / INFRA** | Manual rows remain unclaimed; Permission Editor Worker tests retain the documented Cloudflare-pool `EvalError`. |

No new data or authority path was introduced. No screenshot, pixel-diff,
WCAG-conformance, screen-reader, real-device, remote-CI,
production-promotion, remote-D1, deployment, merge, Apps Script, Google Sheet,
or Phase D claim is made.

## Final dynamic-label and dialog containment — source `0fb16ff0a401f5e653640b68c9a81314f36cb997` — 2026-08-31

The final Standards review checked dynamic role labels beyond the list rows.
The Permission Editor detail heading/description and shared
`ManagementPageHeader` now use `min-w-0`/`wrap-anywhere`; Account Access
lifecycle actions use `h-auto min-h-11 min-w-0 max-w-full shrink
whitespace-normal wrap-anywhere`; and the shared Dialog close Button has
`min-h-11 min-w-11` despite its icon size variant.

| Correction | Status | Evidence |
| --- | --- | --- |
| Dynamic Permission Editor detail/header containment | **PASS** | Component source and the Permission Editor component/geometry seams pass with wrapped labels. |
| Account Access lifecycle action containment | **PASS** | Account Access component and W7 geometry seams pass with shrinkable, auto-height, anywhere-wrapping actions. |
| Dialog close hit target | **PASS** | Account Access component test asserts `min-h-11` and `min-w-11` on the shared Dialog close control. |
| Source and component checks | **PASS** | `pnpm typecheck`, `pnpm --dir web typecheck`, `pnpm --dir web build`, and `pnpm --dir web test:components` (59 files/693 assertions) pass. |
| Geometry check | **PASS** | `pnpm test:role-hierarchy-geometry` passes 49/49 across W7. |
| Remaining release classification | **MANUAL / INFRA** | Four Worker files remain blocked before assertions by the known Cloudflare-pool EvalError; manual rows remain unclaimed. |

No authority or persistence path changed. No screenshot, pixel-diff,
WCAG-conformance, screen-reader, real-device, remote-CI,
production-promotion, remote-D1, deployment, merge, Apps Script, Google Sheet,
or Phase D claim is made.

## Final publication verification — source `b59d13d4f893281801cc4c31a033d4ca1cd7801f` — 2026-08-31

The final source commit closes the remaining concrete review gap in
`C-486-05`: revoke confirmation now renders lost and retained Effective
Permission groups for Global, Department, and Program scopes, with grant
descriptions, scope labels, and source provenance. The same source preserves
validated outer return URLs through nested role/account navigation, carries the
selected role context through account-first candidate links, and makes
portalled Select items shrinkable and anywhere-wrappable.

### Final criterion classification

| Criterion | Status | Final evidence |
| --- | --- | --- |
| C-485-01 through C-485-06 | **INFRA-BLOCKED** | Component behavior, source audit, and W7 geometry pass; the four normalized Worker files still abort before product assertions in the installed Cloudflare pool with the documented Vite `EvalError`. |
| C-485-M1/M2 | **MANUAL — unclaimed** | Keyboard/focus and screen-reader Switch/review verification was not performed. |
| C-486-01 through C-486-07 | **PASS** | Account Access domain/handler/component coverage, explicit revoke impact/provenance regression, nested return URL regression, local browser journeys, member directory, and W7 geometry pass. |
| C-486-M1/M2 | **MANUAL — unclaimed** | Human keyboard/focus/history and screen-reader Effective Permission review was not performed. |
| C-487-01 through C-487-07 | **PASS** | Normalized identity/route/seed safety, Programs D1, Management Hardening, live UI, shell, identity geometry, and obsolete-caller audit pass; the separate normalized Worker test remains an infrastructure blocker only. |
| C-487-M1/M2/M3/M4 | **MANUAL — unclaimed** | Reduced-motion/forced-colors/zoom/text-spacing, real-device, remote-CI, and production-promotion checks were not performed. |

### Final command record

| Command or check | Result |
| --- | --- |
| `pnpm typecheck` | **PASS**, root and E2E TypeScript |
| `pnpm --dir web typecheck` | **PASS**, web and Worker TypeScript |
| `pnpm --dir web build` | **PASS**, 18 static routes |
| `pnpm test` | **PASS**, 38/38 |
| `pnpm verify:identity` | **PASS**, 4 files/98 assertions |
| `pnpm --dir web test:components` | **PASS**, 59 files/693 assertions |
| `pnpm --dir web test` | **INFRA-BLOCKED**, 37 files/561 assertions passed; four normalized Worker files abort before assertions with the known Cloudflare-pool/Vite `EvalError` |
| `pnpm test:shell-responsive` | **PASS**, 92 passed, 1 intentional skip |
| `pnpm test:shell-geometry` | **PASS**, 28/28 |
| `pnpm test:role-hierarchy-geometry` | **PASS**, 49/49 across W7 `320, 390, 600, 799, 800, 1024, 1440` |
| `programs-d1.config.ts` | **PASS**, 195/195 |
| `s4-management-hardening.config.ts` | **PASS**, 45 passed and 65 intentional `onlyProjects` skips; 110 scheduled |
| `live-ui.config.ts` | **PASS**, 28/28 |
| `member-directory.config.ts` | **PASS**, 1/1 |
| Registration residue query | **PASS**, `pending: 0`, `legacy_s4: 0` |
| Final Ultracite baseline | **BASELINE-FAILED**, exit 2; 295 files, 1,823 diagnostics, 0 warnings, 557 rules; zero diagnostics on Phase C changed lines |
| `git diff --check` | **PASS** |
| Standards review | **PASS**, exact HEAD `b59d13d4f893281801cc4c31a033d4ca1cd7801f`; P0=0, P1=0, P2=0, P3=0 |
| Spec review | **PASS**, exact HEAD `b59d13d4f893281801cc4c31a033d4ca1cd7801f`; P0=0, P1=0, P2=0, P3=0 |

The browser gates used a direct Node `v22.18.0` Wrangler process on loopback
port 8797, the local-only auth secret, and disposable local D1. The prescribed
Node 20 `pnpm dev:local` launcher remains infrastructure-blocked by
`ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`; no workaround was relabeled as that
gate. Context7 CLI remained quota-blocked with the documented
`Monthly quota exceeded` response, so no unsupported documentation claim is
made.

No screenshot, pixel-diff, WCAG-conformance, screen-reader, real-device,
remote-CI, production-promotion, remote-D1, deployment, merge, Apps Script,
Google Sheet, or Phase D claim is made. Phase D tickets #488–#490 remain
excluded.
