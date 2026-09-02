# EFCC UI Control Recovery — A–F Preservation Ledger

**Ticket:** T01 / [#506](https://github.com/Noahlw/efcc/issues/506)  
**Ledger status:** Active rescue input; published with the T01 implementation branch  
**Frozen source:** `feat/s4-f-contraction-release-gate` at `6edf28c0f8f7058cf992416e7b517824c3178c8c`  
**Rescue base:** `rescue/ui-control-recovery` at finalized tracker bootstrap `cdb326f206da0bb6ff9de9997124f7bb7b16ff61`  
**Prepared:** 2026-09-02

This ledger is the capability-level preservation record required before route rescue. It separates domain authority, presentation, test infrastructure, and historical evidence. It does not approve a visual baseline, choose `SALVAGE STACK` versus `SELECTIVE REPLAY`, or supersede any historical PR.

## 1. Authority and evidence rules

The authority order is:

1. Active domain ADRs/specs and [`CONTEXT.md`](../../CONTEXT.md) own domain truth, permissions, mutations, and server authority.
2. This ledger records preservation dispositions and provenance; it does not change those contracts.
3. [`DESIGN.md`](../../DESIGN.md) owns the human Civic Minimal visual contract.
4. [`docs/adr/0043-owned-civic-design-system-governance.md`](../adr/0043-owned-civic-design-system-governance.md) owns the product design-system boundary.
5. [`web/app/globals.css`](../../web/app/globals.css) owns runtime token values, base/document behavior, shell/platform rules, and the narrow global CSS boundary.
6. [`web/components/ui/`](../../web/components/ui/) owns local shadcn/Radix primitive implementations; [`web/COMPONENT_INVENTORY.md`](../../web/COMPONENT_INVENTORY.md) records adoption status and documented native exceptions.
7. `.impeccable/design.json` is derived metadata, not a source of authority.
8. Phase acceptance traces and QA records own the historical automated/manual evidence classification.
9. Screenshots, prototypes, audits, HTML reports, and numeric reports are commit-pinned evidence inputs only. They are not approved visual baselines unless a later owner approval explicitly says so.

The source stack is immutable for Phase 0 and all pre-supersession rescue work. Before T35/T36 and an approved rescue head, no historical PR in the table below may be merged, closed, force-pushed, rebased, or marked superseded. T35/T36 own final promotion and supersession after proof; T01 does not perform that decision. A rescue change must identify the retained capability and its new proof seam before the old source can be reconsidered.

### Disposition vocabulary

| Disposition | Meaning in this ledger |
|---|---|
| `PRESERVE` | Keep the current domain/contract capability and its authoritative seam; visual implementation may still change around it. |
| `PRESERVE_AND_AUDIT` | Keep the capability, but require explicit re-verification because evidence is conditional, manual, historical, or exposed to a known defect. |
| `REWORK_PRESENTATION` | Keep behavior and authority; change shared presentation, geometry, ownership, or visual implementation through later governed tickets. |
| `REPLAY` | Reimplement only after evidence shows preservation cannot be achieved safely. No retained shipped capability receives this disposition in Phase 0; the global rescue decision belongs to T12 / #517. |
| `RETIRE` | Remove an obsolete compatibility or historical implementation path while retaining the current replacement and provenance. |

## 2. Frozen source stack

The exact GitHub PR metadata below was verified with `gh pr view <number> --json number,headRefName,headRefOid,baseRefName,baseRefOid,state,mergedAt` on 2026-09-02. Every historical PR was `OPEN` with `mergedAt: null` at the freeze check. The OIDs are the PR head facts; a QA report's named implementation/review commit is retained as evidence but is not substituted for the PR head.

| Stack stage | PR / scope | Base branch and exact base SHA | Head branch and exact head SHA | State at freeze | Primary evidence |
|---|---|---|---|---|---|
| Migration origin | #473 — whole-app shadcn migration and S4 polish | `feat/s4-11-integration-gate` / `b5a99d7b4a802e3279c06a6f3baa29e2f60ac51e` | `feat/s4-12-shadcn-migration` / `85817f563a801e891bfbf758e3174ea0bdea9544` | `OPEN`, unmerged | [`pr/473`](https://github.com/Noahlw/efcc/pull/473), [`s4-phase-a-acceptance-trace.md`](../specs/s4-phase-a-acceptance-trace.md) |
| Phase A | #496 — identity and UI foundations (#476–#478) | `feat/s4-12-shadcn-migration` / `85817f563a801e891bfbf758e3174ea0bdea9544` | `remediate-478` / `3cc674f4e2240abaebb47bb75c6614a8c3d7c624` | `OPEN`, unmerged | [`pr/496`](https://github.com/Noahlw/efcc/pull/496), [`Phase A QA`](../qa/2026-08-28-s4-phase-a-foundation.md) |
| Phase B | #497 — shared modules and role definitions (#479–#484) | `remediate-478` / `3cc674f4e2240abaebb47bb75c6614a8c3d7c624` | `feat/s4-b-shared-modules-role-definitions` / `c75c99e84d699d2d1eac44f07d4e013ead4c12a5` | `OPEN`, unmerged | [`pr/497`](https://github.com/Noahlw/efcc/pull/497), [`Phase B QA`](../qa/2026-08-28-s4-phase-b-foundation.md) |
| Phase C | #501 — stackable identity integration (#485–#487) | `feat/s4-b-shared-modules-role-definitions` / `c75c99e84d699d2d1eac44f07d4e013ead4c12a5` | `feat/s4-c-stackable-identity-integration` / `f914de96df329f0e455890865f98e80143d7c27e` | `OPEN`, unmerged | [`pr/501`](https://github.com/Noahlw/efcc/pull/501), [`Phase C QA`](../qa/2026-08-29-s4-phase-c-foundation.md) |
| Phase D | #502 — member/public route polish (#488–#490) | `feat/s4-c-stackable-identity-integration` / `f914de96df329f0e455890865f98e80143d7c27e` | `feat/s4-d-member-public-route-polish` / `7547fbf8ee6ed8b441d173135550081a487b1f72` | `OPEN`, unmerged | [`pr/502`](https://github.com/Noahlw/efcc/pull/502), [`Phase D QA`](../qa/2026-08-31-s4-phase-d-foundation.md) |
| Phase E | #503 — operations route polish (#491–#493) | `feat/s4-d-member-public-route-polish` / `7547fbf8ee6ed8b441d173135550081a487b1f72` | `feat/s4-e-operations-route-polish` / `c06f9fc0921830a237a7334f1009a7867663a784` | `OPEN`, unmerged | [`pr/503`](https://github.com/Noahlw/efcc/pull/503), [`Phase E QA`](../qa/2026-09-01-s4-phase-e-foundation.md) |
| Phase F | #504 — contraction and release gate (#494–#495) | `feat/s4-e-operations-route-polish` / `c06f9fc0921830a237a7334f1009a7867663a784` | `feat/s4-f-contraction-release-gate` / `6edf28c0f8f7058cf992416e7b517824c3178c8` | `OPEN`, unmerged | [`pr/504`](https://github.com/Noahlw/efcc/pull/504), [`Phase F trace`](../specs/s4-phase-f-acceptance-trace.md) |

### Historical rollback checkpoints

The migration-origin PR records one atomic checkpoint per wave: `09251463` (Wave 0), `6b24ebe3` (Wave 1), `ee1cb96d` (Wave 2), `3fa8bbe4` (Wave 3), `22d12563` (Wave 4), `e892b4bd` (Wave 5), and `7fdde402` / `d97af438` (follow-up audit evidence). These are historical rollback references, not new rescue heads. Phase A–F QA reports also retain their implementation/review commits and are linked above.

## 3. Capability preservation ledger

Each row has one primary disposition. `Known defect / condition` is intentionally not a second disposition: it records the proof still required or the historical issue that must remain visible.

| ID | Class | Capability and current implementation seam | Origin / authority | Proving tests and evidence | Known defect / condition | Disposition |
|---|---|---|---|---|---|---|
| C-01 | Domain authority | Stackable 身份組 hierarchy: fixed non-assignable categories; protected `Admin` top anchor; protected automatic `會友基礎` bottom anchor; assignable `Staff`; explicit position and scope. Seams: `web/lib/identity/types.ts`, `role-hierarchy.ts`, `role-handlers.ts`, `mutations.ts`. | Spec 091; ADR-0042; `CONTEXT.md` | `web/lib/identity/role-hierarchy.test.ts`, `role-handlers.test.ts`, `d1-schema.test.ts`; Phase A/C/E identity evidence | The normalized authority tests are part of the four suites excluded from the aggregate and are a T04 gate. | `PRESERVE` |
| C-02 | Domain authority | Closed capability catalog and server-owned authorization. Browser labels, hidden navigation, and projected affordances never grant authority. Seams: `web/lib/identity/capability-catalog.ts`, `web/lib/identity/role-hierarchy.ts`, `web/worker.ts`. | Spec 091 §§3–6; ADR-0042; `CONTEXT.md` | `pnpm verify:identity`; Phase C capability cutover trace; Phase E identity QA | Preserve scope-before-capability error taxonomy and server projections while correcting test expectations in T04. | `PRESERVE` |
| C-03 | D1 / schema | Normalized identity schema and contraction: `role_categories`, `role_definitions`, `role_definition_grants`, `role_assignments`, `role_policy_revisions`, `role_policy_mutations`, `role_audit_events`; legacy `accounts.role` and `registration_requests.role` removed by migration `0026`. | Migrations `0019`–`0026`; Spec 080/091; ADR-0042 | `web/lib/identity/d1-schema.test.ts`, `seeds.test.ts`; Phase F contraction evidence F-494-04; `verify:contraction` | Stale-schema refusal and disposable reset behavior must remain fail-closed; no production reset or schema mutation is in scope. | `PRESERVE` |
| C-04 | Audit / idempotency | Atomic privileged mutations, actor-bound `Idempotency-Key`, immutable audit/idempotency history, revision conflicts, and distinguishable `SUCCESS`, `DUPLICATE`, `CONFLICT`, `DENIED`, `REJECTED`, and `FAILED` outcomes. Seams: identity mutation handlers and registration approval handlers. | ADR-0023/0027/0041; Spec 091; `CONTEXT.md` | Identity Worker suites; auth/registration suites; Phase F F-494-01 and contraction evidence | Historical test defects around audit ordering/counts and grant/revoke expectations remain imported below; production authority is not classified as broken. | `PRESERVE` |
| C-05 | Domain lifecycle | Programs, enrollment, events, attendance, cancellation, correction, and notification behavior. Seams: `web/lib/programs/*`, `web/lib/attendance*.ts*`, `web/worker.ts`. | Specs 002/004/006/081/086; ADR-0026/0028 | Phase D Programs and route QA; Phase E attendance/management QA; Phase F release trace | Full single-process Programs D1 journey is blocked by local arm64 Worker death; isolated geometry passes do not replace it. | `PRESERVE_AND_AUDIT` |
| C-06 | Route behavior | Authenticated shell, session restore, safe same-origin deep links, origin-aware Back, server-projected navigation, `/permissions` canonical redirect, and 799/800 shell transition. Seams: `web/lib/app-shell.tsx`, `shell-header.tsx`, `nav-bar.tsx`, `web/lib/session.ts`, `web/app/page.tsx`. | Specs 009/089; ADR-0029/0035; Spec 092 | Shell responsive/geometry suites; auth-D1/live-UI evidence; Phase A–F traces | Keyboard/AT, real-device, reduced-motion, forced-colors, zoom, and text-spacing rows remain human/unclaimed. | `PRESERVE_AND_AUDIT` |
| C-07 | Route behavior | Programs catalog, detail, enrollment, search/filter/no-result, manager entry, and workspace task boundary. Seam: `web/app/programs/page.tsx` and `web/lib/programs/*`. | Specs 004/086; Phase D trace; Spec 092 | `programs-d1.config.ts`, Phase D Programs geometry, Phase F numeric report | The 201-test single-process Programs D1 run is the immediate Phase 0 runtime blocker; no test may turn it into a skip. | `PRESERVE_AND_AUDIT` |
| C-08 | Route behavior | Management Hub, settings, Home Content, Account/Member directories, approvals, Role Hierarchy, Permission Editor, and Account Access lifecycles. Seams: `web/app/management/*`, `web/lib/approval-*.tsx`, identity panels. | Specs 082/087/091/092; ADR-0026/0042 | Phase E 15-row QA, management hardening, identity/component suites; Phase F audit dispositions | Phase F Worker death caused downstream management rerun failures; previously passing evidence remains historical and the causal failure stays recorded. | `PRESERVE_AND_AUDIT` |
| C-09 | Route behavior | Scanner Self camera-first flow, Guest no-camera flow, Assisted/Operator entry, Event detail, check-in windows, duplicate/offline/retry/correction outcomes. Seams: `web/lib/attendance-scanner-ui.tsx`, `attendance-panel.tsx`, `use-qr-camera.ts`, `web/app/scanner/page.tsx`, `guest-check-in/page.tsx`, `events/page.tsx`. | Specs 006/072/081; Phase E trace; ADR-0015/0028 | Attendance component/Worker suites, `attendance-d1`, Phase E geometry and F-494 evidence | Real iOS/Android camera, native print preview, safe-area, and touch rows remain unclaimed; the camera test has an imported blind-pass defect. | `PRESERVE_AND_AUDIT` |
| C-10 | Accessibility behavior | 44px minimum targets, visible focus, one navigation landmark, focus restoration, live-region ownership, safe-area/dock clearance, keyboard traversal, and reflow contracts. | Spec 071; ADR-0036/0040; DESIGN.md; Spec 092 | Shell/public/management/identity/attendance numeric geometry and component tests; `web/COMPONENT_INVENTORY.md` | Headless geometry is not human WCAG/AT evidence. The 12 Phase F manual rows stay `UNCLAIMED`. | `PRESERVE_AND_AUDIT` |
| C-11 | Shared presentation | Local shadcn/Radix primitives, `cn()` composition, Tailwind/token bridge, and existing EFCC seams such as `DirectoryFrame`, `ActionSurface`, `ManagementPageHeader`, `ManagementFilterSheet`, and `useAsyncResource`. | ADR-0043; `web/components/ui/`; `web/COMPONENT_INVENTORY.md`; PR #473 | Phase A/B component suites; Phase D/E shared-module and component evidence; Phase F contraction scanner | Ownership and composition are incomplete; unlayered global CSS and local patches can defeat utilities. Later T02/T03/T06 govern the correction. | `REWORK_PRESENTATION` |
| C-12 | Visual implementation | Civic Minimal tokens, Cantonese-first copy, restrained cinnabar accent, teal focus, neutral surfaces, 44px controls, and the 800px shell breakpoint. | `DESIGN.md`; ADR-0043; `web/app/globals.css`; Spec 092 | Token/shell tests, geometry reports, Phase A–F QA | Current screenshots and numeric reports are historical diagnostic evidence; they are not approved visual baselines. The universal spacing reset is the T06 cascade target. | `REWORK_PRESENTATION` |
| C-13 | Test infrastructure | Disposable local Worker/D1 reset/seed path, Playwright projects, Vitest/Worker suites, numeric evidence attachment, release renderer, and contraction scanner. Seams: `tests/e2e/*`, `web/lib/*test*`, `package.json`, `web/package.json`. | ADR-0029/0031; Phase A–F traces; PR #504 | `verify:identity`, `verify:contraction`, component/geometry suites, Phase F release evidence | Four normalized Worker suites are excluded; fresh `test:workerd` has PUI-02 timeout; full Programs D1 loses the Worker. T04/T05 own repair, not exclusion. | `PRESERVE_AND_AUDIT` |
| C-14 | Historical evidence | Phase A–F traces, QA records, screenshots, HTML audits, JSON numeric reports, rollback commits, and review comments. | Phase A–F evidence records; #505/#506 | [`docs/qa/`](../qa/), [`docs/specs/s4-phase-*-acceptance-trace.md`](../specs/) and linked PRs | Evidence remains provenance. The 367 total / 282 passed / 85 intentional skips report and prior 24/24 Programs geometry input cannot be promoted to current `READY` after failed reruns. | `PRESERVE_AND_AUDIT` |
| C-15 | Historical findings | Active P1/lower-severity audit dispositions and unresolved review findings. Seam: [`2026-09-01-s4-phase-f-audit-dispositions.md`](../qa/2026-09-01-s4-phase-f-audit-dispositions.md). | Phase F polish/sticky-overlay audits; PR #503 review; #505 | P1 rows are linked to owning tests/evidence; release gate retains blocked/unclaimed rows | P1 and touched-route lower-severity implementation findings are recorded `Fixed`; this does not close runtime blockers or human gates. | `PRESERVE_AND_AUDIT` |
| C-16 | Legacy compatibility | Fixed global Account-role vocabulary, obsolete role columns/tables, shipped CSS Module paths, and compatibility selectors eliminated by the normalized cutover/contraction. | ADR-0042 Phase F disposition; migration `0026`; PR #504 | `tests/e2e/verify-phase-f-contraction.ts`, `pnpm verify:contraction`, Phase F contraction evidence | Preserve migration history and the normalized replacement; do not restore fixed-role branches, aliases, or parallel CSS paths. | `RETIRE` |
| C-17 | Platform/semantic exceptions | Native camera/video, print, select/date inputs, attendance radio chooser, navigation anchors, and domain-row actions retained only for documented platform or semantic reasons. | ADR-0043; `DESIGN.md`; `web/COMPONENT_INVENTORY.md` | Native-exception registry; attendance, directory, and print-media tests | Human camera, print-preview, touch, and AT outcomes remain unclaimed; native shape is not a general styling escape hatch. | `PRESERVE_AND_AUDIT` |

### Capability facts that must not be lost

- Authorization remains Worker/D1-owned and scope-aware. Display labels, browser visibility, and fixed role names are never authority.
- `Admin` and `會友基礎` remain protected anchors; `Staff` remains assignable and below Admin.
- Active Accounts may hold multiple assignable identities; effective permissions are additive and scope is explicit.
- Registration approval creates one Active Account with automatic `會友基礎`; it does not silently grant a management identity.
- Programs, Events, Enrollment, Attendance, and corrections retain their existing domain relationships and audited outcomes.
- Safe return/deep-link state, route URLs, shell transition, and workflow outcomes remain preserved unless a separately audited correctness defect is proven.
- Historical evidence labels remain truthful: `READY`, `BLOCKED`, `CONDITIONAL`, `UNCLAIMED`, and `MANUAL — unclaimed` are not interchangeable.

## 4. Shipped route and reachable-state inventory

The shipped app-facing inventory is the following 15 route families/surfaces. State names are the material states that later route tickets must preserve or explicitly re-prove. Source files are the current implementation seams, not permission to redesign them in T01.

| Route / surface | Current seam | Reachable states and important transitions |
|---|---|---|
| `/` | `web/app/page.tsx` | Signed-out login; restoring session; authenticating/legacy upgrade; validation/error; session expired; recovery; registration/guest links; safe remembered deep-link return. |
| `/register` | `web/app/register/page.tsx` | Blank form; field validation/focus; duplicate username with draft recovery; busy submission; success; safe return destination. |
| `/registrations` | `web/app/registrations/page.tsx` | PIN/lookup form; pending; approved; rejected; invalid credentials; recoverable error. |
| `/home` | `web/app/home/page.tsx` and feed modules | Loading; announcements/events ready; empty feed; retry/error; unread/read and navigation actions. |
| `/notices` | `web/app/notices/page.tsx` and `notices-panel.tsx` | Loading; notices list; unread indicator; empty; recoverable error/retry; read action. |
| `/messages` | `web/app/messages/page.tsx` and `messages-panel.tsx` | Loading; messages list; read tracking; empty; recoverable error/retry; Back/navigation. |
| `/profile` | `web/app/profile/page.tsx` | Profile summary; member QR render; QR absent fallback; identity summary; scanner return; Account Settings link; sign-out. |
| `/profile/settings` | `web/app/profile/settings/page.tsx` and `web/app/profile/account-settings.tsx` | Username edit; password change; validation with draft preservation; busy; success; unchanged; authentication expiry/session revocation; conflict/error recovery. |
| `/programs` | `web/app/programs/page.tsx`, `web/lib/programs/*` | Catalog loading/ready/empty/forbidden/auth-expired; search/filter/no-result; error/retry; Program detail active/pending/rejected/withdrawn/cancelled/archived/manager-only/draft/unavailable; enrollment success/refetch, duplicate/conflict, offline/retry, withdrawal/cancel; management entry; workspace Events/Participants/Settings/Notifications tasks. |
| `/events` | `web/app/events/page.tsx`, event/attendance modules | Event open/closed/cancelled; attendance-aware action guard; scanner link; printable roster/check-in sheet; recovery. |
| `/guest-check-in` | `web/app/guest-check-in/page.tsx`, `web/lib/attendance-panel.tsx` | Guest form; name/phone validation; busy; success; duplicate; error/retry; corrected-field feedback. |
| `/scanner` | `web/app/scanner/page.tsx`, scanner/QR modules | Self camera-first live; denied/unsupported/unavailable/ended fallback; manual PIN; Guest no-camera; member chooser; duplicate/cancelled/success; retry/stop/cleanup. |
| `/management` | `web/app/management/page.tsx` and management modules | Hub capability cards/forbidden/error-retry; Settings; Home Content draft/published/template/preview/schedule/conflict; Account/Member directories query/filter/list/detail/Back; Approvals queue/selection/review/conflict; Role Hierarchy; Permission Editor; Account Access grant/revoke/archive/restore/effective permissions. |
| `/permissions` | `web/app/permissions/page.tsx` | Legacy canonical redirect to `/management?module=permissions`; malformed/unknown route fallback remains safe. |
| `not-found` | `web/app/not-found.tsx` | 404 Page Frame; return navigation; no domain mutation. |

### Explicitly excluded from shipped inventory

- `/prototype` (`web/app/prototype/page.tsx` and its development-only styling) is historical/development-only, not product readiness.
- Historical comparison HTML, screenshots, and audit pages under `docs/qa/` are provenance, not shipped surfaces.
- Development-only harnesses and the future UI Lab are excluded until their dedicated tickets.
- Retired frontends and legacy sources (`src/gas/`, `程式碼.js`, `src/frontend/`) remain historical provenance only.
- Unimplemented future routes/features are not silently counted as shipped capability.

## 5. Historical findings and open conditions

### 5.1 Findings imported from PR #503 review

These findings remain visible in the ledger even where a later ticket is expected to repair them:

| Finding | Evidence | Preservation treatment |
|---|---|---|
| `web/lib/attendance-panel.tsx:136`: `clearFormStatus` clears `validationError` but leaves `flow.status`, allowing stale error status after field correction. | PR #503 review; parent Spec #505 implementation decisions | Preserve the attendance state machine; repair the stale status at its owning seam in a scoped ticket, without changing attendance outcomes. |
| `web/lib/use-qr-camera.test.tsx:395`: the test mentions `phoneOnly: true` without passing it to `useQrCamera` and only asserts that no `<video>` rendered. | PR #503 review; Phase E scanner evidence | Preserve camera lifecycle/fallback behavior; strengthen the proof later. A no-video assertion is not camera availability evidence. |
| `web/app/management/account-access-panel.tsx:1935`: a status element combines `role="alert"` with `aria-live="polite"`. | PR #503 review; parent Spec #505 | Preserve Account Access feedback and audit semantics; repair announcement ownership so error and polite status semantics do not conflict. |

### 5.2 Phase C test-side defects imported for T04

| File / location | Defect | Required treatment |
|---|---|---|
| `web/lib/auth/normalized-authority-c487.test.ts` | Duplicate pending-enrollment fixture rows collide with the migration `0005` uniqueness contract, so the intended request is absent and the test receives 404 instead of 200. | Correct the fixture so each asserted request exists; do not weaken the uniqueness contract. |
| `web/lib/identity/permission-editor.test.ts:394` | Expected `RoleCapabilityDeniedError` for a cross-department scoped target; authoritative result is `RoleScopeMismatchError`. | Align the test with scope-before-capability taxonomy. |
| `web/lib/identity/permission-editor.test.ts:472` | Audit ordering uses tied timestamps and unspecified SQLite tie order. | Add a deterministic secondary order/key; do not rely on timestamp ties. |
| `web/lib/identity/permission-editor.test.ts:907` | Broad `LIKE 'permission-editor-audit-denied-invalid%'` counts an adjacent idempotency-reuse audit. | Narrow the match to the intended audit outcome. |
| `web/lib/identity/permission-editor-handlers.test.ts:216` | Expected two grant audits although the second patch performs a revoke. | Assert the mutation actually performed. |

These are test/fixture/assertion corrections recorded by Phase C/D QA. T04 must distinguish them from any production defect discovered when the four suites execute.

### 5.3 Phase F release conditions that remain open

The authoritative current disposition is [`2026-09-01-s4-phase-f-release-gate.md`](../qa/2026-09-01-s4-phase-f-release-gate.md):

- F-495-01 and F-495-03 are `BLOCKED` because the required 201-test single-process Programs D1 run loses the local arm64 Worker, producing `kj::async-io-unix.c++:186 disconnected`, `Broken pipe`, `Network connection lost`, deadlock, or `ERR_CONNECTION_REFUSED` cascades.
- F-495-02 is blocked for the current gate after the required Programs geometry rerun lost the Worker. The committed 367-item numeric artifact (282 passed, 85 intentional skips, 0 failed) and prior 24/24 isolated Programs geometry evidence remain historical inputs only.
- A fresh `pnpm test:workerd` rerun recorded 39 files, 573 passed, and the existing `web/lib/programs/programs.test.ts` PUI-02 timeout at `programs.test.ts:7454` under the default 30-second budget. The earlier 574-test pass remains historical.
- F-495-04 has 12 human rows `UNCLAIMED`: iOS camera, Android camera, native print preview, keyboard-only management, keyboard-only identity, VoiceOver, NVDA, reduced motion, forced colors, zoom/reflow, text spacing, and touch/safe area.
- The clean-fixture live UI retry passed 32/32, but the preceding stale-fixture failure (30 expected, 2 unexpected approval-empty assertions) remains recorded rather than erased.
- All runtime evidence is loopback-only with disposable `E2E_`, `E2E_DEMO_`, and `E2E_DISPOSABLE_` data. Production D1, Cloudflare deployment, Apps Script, Google Sheets, and non-disposable accounts are outside the evidence boundary.

### 5.4 Active P1/lower-severity audit dispositions

[`2026-09-01-s4-phase-f-audit-dispositions.md`](../qa/2026-09-01-s4-phase-f-audit-dispositions.md) records the active shipped P1 and lower-severity rows as `Fixed` at their owning seams, including context-aware Back, forbidden/auth-required separation, Account Directory round-trip, 800px one-pane geometry, dock/action clearance, readable rows, filter-sheet semantics, permission review containment, approval tray, and permission review panel. This is an implementation disposition, not a release approval. Prototype overflow, historical screenshot comparison, and native platform/semantic exceptions remain preserved as explicitly scoped provenance.

### 5.5 Phase B deferred findings imported

The Phase B trace's `Spec 092 audit disposition map` is imported here rather than collapsed into the later Phase F `Fixed` summary. These lower-risk or intentionally deferred rows remain visible until their owning later route-family or identity ticket supplies fresh evidence.

| Historical finding | Phase B disposition / owner | Preservation treatment |
|---|---|---|
| `account-settings.md` F-09…F-12 and F-14…F-15: asymmetry, current-copy whitespace/radius/token polish, and stale trace information. | `Preserve / Defer`; #480 / later route-family gate | Preserve the canonical Account Settings domain and draft/recovery behavior; re-audit the presentation details later. Do not claim these rows fixed from the Phase B shared-module result. |
| `synthesis.md` C-03: raw Checkbox/Button/Card adoption gap remaining in the permissions-panel remainder. | `Covered by Shared Migration / Defer`; #480 / #481 / Phase C | Preserve the permission contract; later identity/presentation work owns the remaining control adoption. |
| `synthesis.md` C-05: stale `--line-strong` fallbacks remaining on permission surfaces. | `Covered by Shared Migration / Defer`; #481 / Phase C | Preserve the token contract; later cascade/presentation work must prove the remaining fallback ownership. |
| `workspace-settings.md` WS-01…WS-12: settings domain form and geometry findings intentionally left local. | `Preserve`; #484 | Preserve recurrence, attendance semantics, validation, and domain forms; the Phase B structural split did not generalize or rewrite them. |

The Phase B trace also explicitly defers `/prototype`, historical screenshots/comparison HTML, and Discord colors/assets/vocabulary as out of scope. They remain in the exclusion/provenance sections above and are not shipped capabilities.

### 5.6 Deferred syntax debt


Issue [#498](https://github.com/Noahlw/efcc/issues/498) remains an independent deferred styling/syntax track. Phase D/F records a repository-wide Ultracite baseline in the range of 1,823–1,965 diagnostics across roughly 295 files. T01 does not suppress, relabel, or make that historical debt a visual-rescue release pass. Changed files must not add new diagnostics under the existing discipline; #498 may be revisited only under its own approved scope after the A–F release evidence is stable.

## 6. Immediate rescue frontier and supersession gate

The immediate frontier is:

1. **T01 / #506** — freeze this ledger and its generated summary. The implementation branch is the only active Phase 0 ticket.
2. **T02 / #507** — independently unblocked, establishes persistent UI governance. It may start only in its own worktree/PR; it does not change production behavior.
3. **T03 / #508** — blocked until #507 merges; machine enforcement must consume the governance authority.
4. **T04 / #509** — blocked until #506 merges; restores the four excluded normalized Worker suites.
5. **T05 / #510** — blocked until #509 merges; repairs the full local Programs/Worker/D1 prerequisite.
6. **T06 / #511** — blocked until #506, #508, and #510 merge; contains the global cascade and records before/after diagnostic evidence.

Before any historical A–F PR may be superseded, the rescue must prove at minimum:

- normalized identity, explicit scope, capability authorization, protected anchors, and additive effective permissions;
- normalized D1 schema/migrations, registration baseline, audit/idempotency atomicity, and preserved mutation outcomes;
- route URLs, safe return/deep-link behavior, shell transition, Programs/management/attendance workflows, and state recovery;
- accessibility mechanics at their owning primitive/pattern seams plus the required human rows, without inferring AT/device/print results from headless evidence;
- shared primitive/pattern ownership and deterministic cascade after T02/T03/T06;
- all four normalized Worker suites included and green in the required aggregate;
- the complete single-process Programs D1 run green after clean disposable reset/seed, with first-cause runtime artifacts retained;
- historical findings reconciled and every evidence label kept truthful.

No one Phase 0 ticket, screenshot set, numeric report, isolated test subset, or local retry can satisfy this supersession gate alone.

## 7. Ledger provenance index

| Evidence / authority | What it proves or preserves |
|---|---|
| [`docs/specs/s4-phase-a-acceptance-trace.md`](../specs/s4-phase-a-acceptance-trace.md) and [`2026-08-28-s4-phase-a-foundation.md`](../qa/2026-08-28-s4-phase-a-foundation.md) | Origin, identity/D1, Civic Minimal/shell, role hierarchy, local evidence, and manual caveats. |
| [`docs/specs/s4-phase-b-acceptance-trace.md`](../specs/s4-phase-b-acceptance-trace.md) and [`2026-08-28-s4-phase-b-foundation.md`](../qa/2026-08-28-s4-phase-b-foundation.md) | Shared module contracts, role definitions, lifecycle, directories, feeds, Programs workspace, and Phase B runtime evidence. |
| [`docs/specs/s4-phase-c-acceptance-trace.md`](../specs/s4-phase-c-acceptance-trace.md) and [`2026-08-29-s4-phase-c-foundation.md`](../qa/2026-08-29-s4-phase-c-foundation.md) | Permission Editor, Account Access, normalized authority cutover, excluded Worker suites, and manual gates. |
| [`docs/specs/s4-phase-d-acceptance-trace.md`](../specs/s4-phase-d-acceptance-trace.md) and [`2026-08-31-s4-phase-d-foundation.md`](../qa/2026-08-31-s4-phase-d-foundation.md) | Public/auth/account, participant Programs, workspace routes, geometry, local runtime, and four-suite exclusion. |
| [`docs/specs/s4-phase-e-acceptance-trace.md`](../specs/s4-phase-e-acceptance-trace.md) and [`2026-09-01-s4-phase-e-foundation.md`](../qa/2026-09-01-s4-phase-e-foundation.md) | Scanner, attendance, management, identity operations, local disposable evidence, intentional skips, and unclaimed manual rows. |
| [`docs/specs/s4-phase-f-acceptance-trace.md`](../specs/s4-phase-f-acceptance-trace.md), [`contraction-evidence.md`](../qa/2026-09-01-s4-phase-f-contraction-evidence.md), [`release-gate.md`](../qa/2026-09-01-s4-phase-f-release-gate.md), and [`audit-dispositions.md`](../qa/2026-09-01-s4-phase-f-audit-dispositions.md) | Frozen contraction, evidence semantics, current blocked verdict, human-gate status, and historical finding dispositions. |
| [`CONTEXT.md`](../../CONTEXT.md), [`Spec 091`](../specs/091-stackable-identity-backend.md), [`ADR-0042`](../adr/0042-discord-like-stackable-role-model.md) | Domain vocabulary, identity/permission invariants, scope, protected anchors, and audit authority. |
| [`Spec 092`](../specs/092-discord-identity-design-system-adoption.md), [`DESIGN.md`](../../DESIGN.md), [`ADR-0043`](../adr/0043-owned-civic-design-system-governance.md), and [`web/COMPONENT_INVENTORY.md`](../../web/COMPONENT_INVENTORY.md) | Whole-product UI scope, Civic Minimal design, primitive ownership, native exceptions, and presentation boundary. |
| Parent [#505](https://github.com/Noahlw/efcc/issues/505), T01 [#506](https://github.com/Noahlw/efcc/issues/506), and deferred [#498](https://github.com/Noahlw/efcc/issues/498) | Rescue scope, T01 acceptance authority, and separate historical syntax-debt track. |

**T01 boundary:** This ledger records what must be preserved and what evidence is missing. It does not alter production code, D1, Worker behavior, route behavior, historical PRs, release verdicts, or human approval status.
