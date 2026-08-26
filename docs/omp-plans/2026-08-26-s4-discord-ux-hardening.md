# S4 Discord-Derived UX Hardening Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. <!-- Note: subagent-driven-development and executing-plans skills are not available -->

**Goal:** Harden every S4 management workflow into a Discord-derived,
phone-to-desktop experience while preserving EFCC authorization, Civic Minimal,
atomic mutations, audit evidence, and the existing S4 implementation as the
bottom of a stacked PR chain.

**Architecture:** A throwaway prototype branch answers the visual and interaction
questions first and never joins the production merge stack. The production stack
then adds shared navigation/action primitives, Account Directory pagination,
atomic batch-approval infrastructure, Role-first Permission Policy UI, Approval
queue/detail UI, and a final isolated-D1 responsive gate in dependency order.

**Tech Stack:** Next.js static export, React 19, TypeScript, CSS Modules,
Cloudflare Worker, D1, Vitest/Testing Library, Playwright, `rtk gh`, and
`gh-stack`.

## Global Constraints

- Parent implementation branch: `feat/s4-management-access` at
  `6b93a4c53780172376ee13e64ec4f3eb77f44081`.
- The parent branch is clean and matches `origin/feat/s4-management-access`, but
  no GitHub PR exists as of 2026-08-26. Publish it as the bottom PR before
  submitting child PRs.
- Active GitHub identity must be exactly `Noahlw`; verify through `rtk gh` before
  every publication session.
- Use `rtk gh stack ...` non-interactively: branch names are positional,
  `submit` always uses `--auto`, and `view` always uses `--json`.
- Never merge an OPEN PR or stack without a separate explicit user instruction.
- Preserve fixed global Roles `Admin`, `Staff`, and `Member`, the 13-Capability
  policy, capability authorization, and the rule that all Active Accounts retain
  the non-editable Member Baseline.
- Directly reproduce Discord role-management layout, depth, density, grouped
  permissions, selection, and action grammar. Do not copy Discord source code,
  proprietary assets, colors, brand icons, gaming terminology, or server/channel
  concepts.
- Preserve Civic Minimal: `#f4f5f3`/white surfaces, charcoal ink, restrained
  cinnabar actions, hairline borders, 8px controls, 12px cards, teal 3px focus,
  Cantonese-first copy, and 44×44px minimum targets.
- Account Detail and Assigned Accounts remain read-only. Custom Roles and Account
  Role mutation belong to the S4.1/Wayfinder ticket.
- No dependency additions without a separately proven need.
- Prototype code never enters the production merge stack.
- Every changed behavior starts with a regression test that fails under the
  current implementation.

## File Structure & Changes

Create:

- `docs/specs/457-s4-discord-ux-hardening-amendment.md` — frozen hardening
  contracts; renumber immediately before publication if issue numbering drifts.
- `docs/adr/0040-discord-derived-s4-management-interaction-authority.md` — UX
  authority and fixed Member Baseline.
- `docs/adr/0041-atomic-registration-batch-approval.md` — batch transaction,
  selection, idempotency, and audit rules.
- `web/app/management/management-action-framework.tsx` — shared management header,
  Back, filter-sheet, and sticky-action primitives.
- `web/app/management/management-action-framework.module.css` — shared responsive
  and safe-area geometry.
- `web/migrations/0018_registration_batch_idempotency.sql` — durable batch
  idempotency records. Re-run the Base Branch Gate before implementation and
  renumber only if an accepted lower branch adds migration `0018` first.
- `tests/e2e/s4-management-hardening.test.ts` — authenticated local-D1 functional,
  DOM, responsive, and accessibility proof.
- `tests/e2e/s4-management-hardening.config.ts` — isolated S4 device matrix and
  dedicated output directory.
- `docs/qa/2026-08-26-s4-hardening-gate.md` — final contract/evidence ledger.
- `docs/omp-plans/2026-08-26-s4-1-custom-role-wayfinder.md` — deferred functional
  Discord-role parity brief.

Prototype branch only; never merge into the production stack:

- `web/app/management/s4-hardening-prototype.tsx`
- `web/app/management/s4-hardening-prototype.module.css`
- `web/app/management/S4-HARDENING-PROTOTYPE.md`
- `docs/qa/screenshots/s4-hardening-prototype/`

Modify:

- `CONTEXT.md` — Member Baseline, Approval Selection, and Registration Batch
  Approval glossary entries plus ADR references.
- `web/app/management/page.tsx` — canonical module routing and shared action
  framework integration.
- `web/app/management/settings-ui.tsx` — safe origin-aware management Back seam.
- `web/app/management/account-directory-panel.tsx` and module CSS — populated
  ledger, progressive pages, filters, scroll restoration, and responsive Detail.
- `web/app/management/permissions-panel.tsx` and module CSS — Discord-style Role
  list, Role Detail, Permission search/groups, Assigned Accounts, and change
  review.
- `web/lib/approval-queue.tsx`, `web/lib/approval-detail.tsx`, and their CSS —
  Pending/Processed views, confirmation, persistent selection, and batch states.
- `web/lib/programs/program-api.ts` — paginated directory and Role-policy DTOs.
- `web/lib/programs/program-handlers.ts` and its owning domain/store seams —
  unfiltered bounded Account pages and read-only assigned-account projection.
- `web/lib/auth/registrations.ts` — status-filtered history and atomic batch
  decision domain operation.
- `web/lib/auth/handlers.ts` and `web/worker.ts` — batch/history HTTP routes,
  authorization, validation, durable idempotency, and response mapping.
- `web/lib/copy.ts` — canonical Cantonese copy for every new state.
- `web/app/registrations/page.tsx` and `web/app/permissions/page.tsx` — canonical
  redirects into `/management`.
- Existing component, Worker, and program-domain test files named in each task.

## What Already Exists

- `AccountDirectoryPanel`, `searchAccountDirectory`,
  `getAccountDirectoryDetail`, and `handleSearchAccountDirectory` already enforce
  capability-gated safe DTOs and origin-aware Detail URLs.
- `PermissionsPanel`, `getAccountPermissions`, and `updateAccountPermissions`
  already provide policy revision, staged changes, atomic Save, conflict
  recovery, and locked-cell semantics.
- `ApprovalQueue`, `ApprovalDetail`, `approveRegistration`, and
  `rejectRegistration` already provide capability authorization, deep links,
  single-request CAS behavior, and applicant-specific rejection notes.
- `SettingsBackLink`, the Shared Shell dock/rail, `rememberDeepLink`, existing
  live-region/focus helpers, `programsFetch`, and the isolated-D1 seed/runtime
  scripts must be reused.
- Existing S4 local code gates are green at the parent SHA. The hardening gate
  extends them; it does not replace them.

## Not In Scope

- S5+ feature work, S7 corrections/voids, unrelated Management interiors,
  Messages interiors, production deployment, or real-account mutations.
- Role creation/deletion/reorder, Role color/style/links, Account Role assignment,
  per-account Capability overrides, Account lifecycle mutations, or bulk reject.
- A generic design-system rewrite or global S1/S2 token changes.
- A permanent full screenshot-regression suite; screenshots are audit evidence.

## ASCII Diagrams

Production stack:

```text
main
  └─ feat/s4-management-access                     existing bottom PR
      └─ feat/s4-07-hardening-contract             docs + action framework
          └─ feat/s4-08-account-directory-ledger   bounded directory
              └─ feat/s4-09-registration-batch     backend/audit
                  └─ feat/s4-10-discord-role-ux    permission UI
                      └─ feat/s4-11-approval-ux     approval UI
                          └─ feat/s4-12-hardening-gate  E2E/evidence
```

Prototype evidence branch:

```text
feat/s4-management-access
  └─ prototype/s4-discord-hardening  (subagent-owned; reviewed; never merged)
```

Batch approval:

```text
explicit selected IDs
  → validate active actor + capability + size + canonical hash
  → durable idempotency lookup
      ├─ same key/same hash → stored response
      └─ new key
          → verify every request is still Pending
              ├─ any stale/conflict → zero writes + conflict evidence
              └─ all valid → one D1 transaction
                    ├─ create all Active Accounts
                    ├─ resolve all requests
                    ├─ append one audit outcome per request
                    └─ persist idempotent response summary
```

## Failure Modes & Gaps

- Issue number `457` is provisional until publication-time verification.
- The accepted D1 batch limit requires a measured probe; do not freeze 100 merely
  because it was the planning estimate.
- The current single registration endpoints only presence-check idempotency and
  registration decisions lack generic audit rows. Batch work must not silently
  claim replay/audit safety before the new persistence tests pass.
- At exactly 800px the desktop shell leaves limited content width; do not force a
  two-pane policy matrix there.
- Selection hidden by a new search is a safety risk unless the selected tray and
  confirmation show every retained ID.
- A prototype can prove presentation but never substitutes for response/D1
  evidence.
- Wrangler proxy disconnects are classified only after assertions and server logs
  prove a harness failure; otherwise the run is failed.

## Parallelization / Worktree Strategy

- A fresh subagent owns the prototype in an isolated worktree based on the exact
  parent SHA. It performs no production edits. After its bounded implementation
  pass, one contract reviewer and one visual/responsive reviewer run in parallel.
- Production builders are serial because the stack is linear and the action,
  API, permission, and approval branches share routing/copy/test seams.
- Reviewer pairs may run in parallel after each production builder commits.
- Every builder receives an explicit file allowlist. A lower-layer defect is fixed
  on its owning branch, then `rtk gh stack rebase --upstack` propagates it.
- Use the `using-git-worktrees` skill at execution time. Never reset, stash, or
  overwrite the parent worktree.

---

### Task 0: Freeze authority and establish the stack base

**Branch:** `feat/s4-07-hardening-contract`

**Files:**

- Create/modify the amendment, ADRs, glossary, plan, and Wayfinder brief listed
  above.
- No production source changes before the prototype barrier.

**Interfaces:**

- Consumes: issue #449, parent SHA `6b93a4c5`, ADR-0040/0041.
- Produces: frozen H-01–H-40 acceptance contract for every later branch.

- [ ] **Step 1: Prove the Base Branch Gate**

  Verify exact worktree, clean parent status, local/remote SHA equality, active
  GitHub account `Noahlw`, and absence/presence of a parent PR. Fail closed on any
  mismatch.

- [ ] **Step 2: Publish the existing parent as the bottom PR**

  Use the repo PR-description skill and `rtk gh`; target `main`. Do not merge.

- [ ] **Step 3: Initialize the production stack**

  Preconfigure rerere, adopt the existing parent, and add
  `feat/s4-07-hardening-contract` with positional branch names. Verify through
  `rtk gh stack view --json` before committing.

- [ ] **Step 4: Validate documents**

  Run Markdown/project formatting checks that already exist plus
  `git diff --check`.

- [ ] **Step 5: Commit**

  Commit message: `docs(s4): freeze Discord UX hardening contract`

### Task 1: Build and approve the throwaway responsive prototype

**Branch:** `prototype/s4-discord-hardening` outside the production stack

**Files:** Prototype-only files and evidence directory listed above.

**Interfaces:**

- Consumes: H-01–H-40, Discord reference screenshots and official interaction
  research, real production DTO shapes.
- Produces: accepted layout/state authority and screenshots; no production API.

- [ ] **Step 1: Dispatch one fresh prototype builder subagent**

  Give the subagent the exact worktree, SHA, authority order, viewport/state
  matrix, file allowlist, and instruction to reconstruct Discord Role UI directly
  in Civic Minimal. The coordinator does not implement the prototype inline.

- [ ] **Step 2: Add a development-only prototype route**

  Use the existing `/management` development-only prototype gate. In-memory data
  must cover minimum, typical, maximum, long CJK/Latin, every material state, and
  the complete phone/desktop depth model. Production builds must not expose it.

- [ ] **Step 3: Run a bounded Impeccable pass**

  Inspect all target widths once, batch all corrections, confirm once, then stop.

- [ ] **Step 4: Review in parallel**

  A contract reviewer checks H-01–H-40 and a visual reviewer checks Discord
  structural fidelity, Civic Minimal, responsive geometry, focus, and dock
  clearance. Any `NOT_CAPTURED` state fails the barrier.

- [ ] **Step 5: Record selection evidence**

  Write prototype notes and screenshots. Do not merge or stack this branch.

### Task 2: Implement the shared navigation and action framework

**Branch:** `feat/s4-07-hardening-contract`

**Files:**

- Create shared action framework TSX/CSS.
- Modify `page.tsx`, `settings-ui.tsx`, `copy.ts`, legacy routes, and focused tests.

**Interfaces:**

- Produces `ManagementPageHeader`, `ManagementFilterSheet`,
  `ManagementStickyActionBar`, and a safe internal management-return resolver.
- Later Directory, Permission, and Approval branches consume these components.

- [ ] **Step 1: Write failing component/route tests**

  Prove origin-aware Back, direct-link fallback, 44px controls, safe-area action
  clearance, focus movement, sheet dialog semantics, and canonical legacy
  redirects. Current hard-coded Permissions→Settings and legacy screens must fail.

- [ ] **Step 2: Implement only the shared framework**

  Reuse `SettingsBackLink` behavior and existing focus/live-region tokens. Do not
  migrate unrelated Management modules.

- [ ] **Step 3: Run focused tests, component suite, typecheck, and diff check**

- [ ] **Step 4: Commit**

  Commit message: `feat(s4): unify management navigation and actions`

### Task 3: Deliver the populated Discord-style Account Directory

**Branch:** `feat/s4-08-account-directory-ledger`

**Files:** Account Directory component/CSS/API/handler/domain tests and copy.

**Interfaces:**

- Extend `AccountDirectoryView` with bounded page metadata and authorized summary
  counts.
- Extend `searchAccountDirectory` to accept optional query, filters, cursor, and
  bounded limit while preserving current safe DTOs and detail endpoint.

- [ ] **Step 1: Write failing handler/domain tests**

  Cover empty-query default pages, deterministic ordering, cursor continuation,
  filter/count correctness, wildcard escaping, limit validation, authorization,
  no secret fields, and stable continuation under realistic data volume.

- [ ] **Step 2: Write failing UI tests**

  Cover populated entry, progressive append without duplication, compact summary,
  search/filter sheet, active count, initials, long content, empty/error/retry,
  Detail/back, query/filter/page/scroll restoration, and phone/desktop layouts.

- [ ] **Step 3: Implement the smallest handler/API change**

  Reuse current capability guard and DTO mapping. Do not create a second directory
  endpoint or return unbounded data.

- [ ] **Step 4: Rebuild Directory B from the accepted prototype**

  Match Discord row hierarchy directly while retaining EFCC tokens and read-only
  Detail.

- [ ] **Step 5: Verify focused tests, full Worker/components, typecheck, build**

- [ ] **Step 6: Commit**

  Commit message: `feat(s4): harden the account directory ledger`

### Task 4: Add atomic, audited Registration Batch Approval and history

**Branch:** `feat/s4-09-registration-batch`

**Files:** migration, `registrations.ts`, auth handlers/routes/API tests, and copy
DTOs only; no Approval UI redesign yet.

**Interfaces:**

- Add a status-filtered safe Registration list operation for Pending/Processed.
- Add one batch-approval domain operation consuming actor ID, canonical request
  IDs, and idempotency identity and returning a deterministic outcome summary.
- Add `POST /api/v1/auth/registrations/approve-batch` while preserving single
  endpoints.

- [ ] **Step 1: Probe D1 batch limits**

  Use isolated D1 with realistic Account/request/audit statements. Record the
  measured safe cap; make validation and UI contract use that value.

- [ ] **Step 2: Write the migration test first**

  Prove actor/endpoint/key uniqueness, canonical request hash, stored response,
  and no credential material.

- [ ] **Step 3: Write failing domain/Worker tests**

  Cover success, replay, same-key/different-hash conflict, duplicate IDs,
  malformed/empty/over-limit/unknown IDs, inactive/unauthorized actor, single vs
  batch race, batch vs batch race, rollback on one stale request, per-request
  audit evidence, and zero partial Accounts/status/audits.

- [ ] **Step 4: Implement transaction and HTTP boundary**

  Use one D1 transaction/batch boundary and existing problem/audit vocabulary.
  Never orchestrate bulk approval through sequential browser calls.

- [ ] **Step 5: Add Processed history projection tests**

  Return safe, bounded, ordered resolved rows with decision metadata but no
  credentials or immutable identity secrets.

- [ ] **Step 6: Run focused/full Worker tests, typecheck, build, diff check**

- [ ] **Step 7: Commit**

  Commit message: `feat(s4): add atomic registration batch approval`

### Task 5: Rebuild Account & Permissions as Discord-style Role management

**Branch:** `feat/s4-10-discord-role-ux`

**Files:** Permissions component/CSS/API projection/copy/tests.

**Interfaces:**

- Preserve `getAccountPermissions` and `updateAccountPermissions` revision/CAS
  semantics while presenting fixed Roles one at a time.
- Add read-only assigned-account counts/lists to the projection without adding
  Role mutation.

- [ ] **Step 1: Write failing projection tests**

  Prove exactly three global Roles, separate fixed Member Baseline, read-only
  assigned Accounts, Admin/Staff/Member edit constraints, and no scoped profile
  misrepresented as a global Role.

- [ ] **Step 2: Write failing Role-list/Detail tests**

  Cover phone drill-down and Back chain, desktop list/detail, fixed-baseline
  semantics, Role summaries/counts, Assigned Accounts read-only behavior, direct
  links, forbidden/loading/error/retry, and absence of Discord-only affordances.

- [ ] **Step 3: Write failing Permission editor tests**

  Cover sticky search, grouped disclosure, automatic match expansion, aligned
  toggles, locked status rows, staged unsaved count, before/after review, atomic
  Save, busy/success/conflict recovery, and Staff read-only behavior.

- [ ] **Step 4: Implement from the accepted prototype**

  Directly reproduce Discord hierarchy and control placement in Civic Minimal.
  Remove the current long mixed page rather than layering another navigation
  block above it.

- [ ] **Step 5: Run focused/full component and Worker tests, typecheck, build**

- [ ] **Step 6: Commit**

  Commit message: `feat(s4): adopt Discord-style role policy UX`

### Task 6: Rebuild Registration Approvals with persistent bulk selection

**Branch:** `feat/s4-11-approval-ux`

**Files:** Approval queue/detail TSX/CSS/API client/copy/tests.

**Interfaces:**

- Consume the status-filtered queue and atomic batch endpoint from Task 4.
- Preserve `ApprovalDetail({ requestId })`, single approve/reject endpoints, and
  read-only resolved Detail.

- [ ] **Step 1: Write failing queue tests**

  Cover Pending/Processed views, Discord-style dense rows, checkbox semantics,
  explicit selected-ID set, selection accumulation across scroll/search/filter,
  Detail-return preservation, hidden selected count, review tray, individual
  removal, Clear, loaded-filter Select All, and lifecycle clearing.

- [ ] **Step 2: Write failing confirmation and recovery tests**

  Cover applicant-name summary, `+N`, Active Account consequence copy,
  all-or-nothing busy/success, replay, conflict with preserved selection, stale
  item identification/removal, validation cap, offline/no-submit, and no automatic
  retry.

- [ ] **Step 3: Rewrite Detail mutation actions**

  Queue rows locate/select only. Detail uses applicant-summary confirmation;
  rejection reason appears only in the destructive reject flow.

- [ ] **Step 4: Implement phone/desktop action geometry**

  Use the shared sticky action framework above the dock and list/detail panes only
  at the approved widths. Remove horizontal phone-table scrolling.

- [ ] **Step 5: Run focused/full components, Worker regression, typecheck, build**

- [ ] **Step 6: Commit**

  Commit message: `feat(s4): harden approval queue and bulk actions`

### Task 7: Run the complete S4 hardening gate

**Branch:** `feat/s4-12-hardening-gate`

**Files:** New Playwright spec/config, QA report, and fresh screenshot evidence.

**Interfaces:**

- Consumes H-01–H-40 and every lower stack branch.
- Produces one deterministic local-D1 readiness ledger; no feature repairs are
  absorbed silently into this branch.

- [ ] **Step 1: Add the permanent high-value Playwright assertions**

  Cover direct/legacy routes, origin-aware Back, default populated Directory,
  progressive pages, phone filter sheet, scroll restoration, fixed Member
  Baseline, Role drill-down, permission search/review/Save, selection persistence,
  batch success/replay/conflict/rollback/audit, focus/live regions, 44px targets,
  dock clearance, and zero horizontal overflow.

- [ ] **Step 2: Run fresh isolated-D1 functional proof**

  Use a fresh `/tmp/s4-hardening-verify-*` persistence directory and an unused port
  `8794+`; never touch `8787`, `8791`, or `8792` if occupied.

- [ ] **Step 3: Run the full viewport/content matrix**

  Widths: 320, 375, 390, 414, 600, 799, 800, 1024, 1440, 1920. Include 200% text,
  keyboard-only operation, long CJK/Latin, minimum/typical/maximum data, safe area,
  and reduced motion.

- [ ] **Step 4: Run final code gates**

  Commands: web typecheck, component tests, build, full Worker tests, focused
  hardening Playwright, relevant existing Management/Programs E2E, Impeccable
  detector on changed UI targets, and `git diff --check`.

- [ ] **Step 5: Write the final report**

  Include H-01–H-40 coverage, P0–P3 ledger, exact commands/results, screenshots,
  response/D1/audit evidence, known harness failures, original parent SHA, and
  verdict vocabulary from the amendment.

- [ ] **Step 6: Commit**

  Commit message: `test(s4): prove Discord UX hardening gate`

### Task 8: Publish and verify the stack without merging

**Files:** GitHub issue/PR metadata only; no source edits unless review finds a
bounded defect on its owning branch.

- [ ] **Step 1: Publish the amendment and implementation tickets**

  Re-check issue numbering, use `rtk gh` under `Noahlw`, create dependency edges,
  and add the custom-role ticket as an S4.1/Wayfinder child of #456.

- [ ] **Step 2: Submit the production stack**

  Use `rtk gh stack submit --auto --open`, then the PR-description skill to apply
  complete repo-native bodies and closing links.

- [ ] **Step 3: Verify the exact chain**

  Use `rtk gh stack view --json`; confirm each PR base is the previous branch and
  the bottom PR targets `main`.

- [ ] **Step 4: Stop**

  Report URLs, gates, remaining decisions, and merge order. Do not merge until the
  user explicitly asks.

## Self-Review Checklist

- [ ] Every owner answer from the grilling session appears as a frozen contract.
- [ ] Discord structural fidelity and EFCC visual/domain boundaries are both
  explicit.
- [ ] Prototype subagent ownership and non-merge status are explicit.
- [ ] The current missing parent PR is not misreported as existing.
- [ ] Every task names files, interfaces, failing-test intent, verification, and a
  commit boundary.
- [ ] Backend batch work precedes the Approval UI that consumes it.
- [ ] No task smuggles custom Roles or Account Role mutation into S4.
- [ ] Final verification proves DOM, response, D1 state, audit, and responsive
  geometry rather than screenshots alone.
