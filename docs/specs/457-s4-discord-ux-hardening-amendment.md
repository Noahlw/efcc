# S4 UX Hardening Amendment — Discord-Derived Management Workflows

**Status:** Proposed; owner decisions frozen, not yet published to GitHub

**Parent:** GitHub issue #449 and implementation branch
`feat/s4-management-access` at `6b93a4c5`

**Publication note:** `457` is the next verified issue number as of 2026-08-26.
Re-check immediately before publication and rename this file if another issue
claims that number first.

## Authority

This amendment preserves #449's authorization, domain, safety, and mutation
contracts except where it explicitly adds Account Directory default listing,
Registration Approval history, durable Registration audit/idempotency, and
Registration Batch Approval.

Presentation authority is, in order:

1. this amendment and ADR-0040/0041;
2. the accepted hardening prototype produced from this amendment;
3. Discord's role-management information architecture and interaction grammar;
4. Variant A Civic Minimal, shared EFCC tokens, Cantonese-first copy, and the
   existing Shared Shell.

Discord is copied structurally, not as a brand or code source. Do not import
Discord colors, proprietary assets, source code, icons, gaming vocabulary,
server/channel concepts, custom-role behavior, or platform limitations.

## Scope

In scope:

- Management Hub navigation and consistent depth/action framework;
- populated Account Directory, compact filters, dense rows, progressive loading,
  and read-only Account Detail;
- role-first Account & Permissions experience using the fixed Admin/Staff/Member
  policy and non-editable Member Baseline;
- Pending and Processed Registration Approval queues, routable Detail,
  confirmation, persistent explicit selection, and atomic batch approval;
- canonical redirects from legacy `/registrations` and `/permissions` routes;
- responsive, keyboard, focus, live-region, safe-area, long-content, and local-D1
  proof from 320px through 1920px.

Out of scope:

- custom Role creation, deletion, renaming, color, style, reorder, or hierarchy;
- changing an Account's Role or assigning/removing Accounts from a Role;
- per-account Capability overrides;
- bulk rejection;
- Account suspension, deactivation, deletion, credential reset, or last-Admin
  lifecycle mutations;
- Discord branding, copied code/assets, `@everyone` terminology, server/channel
  permissions, or 2FA imitation;
- production deployment.

## Frozen Hardening Contracts

### Shared hierarchy and action framework

- **H-01:** Every S4 depth has a visible, origin-aware Back action. Direct-link
  fallback is `/management`.
- **H-02:** First-level management Sections use one header grammar: Back, title,
  explanatory lead, and an optional contextual action.
- **H-03:** Phone action bars sit above the Shared Shell dock with at least 8px
  clearance plus `env(safe-area-inset-bottom)`.
- **H-04:** Interactive targets are at least 44×44px; focus uses the existing 3px
  teal treatment.
- **H-05:** `/registrations` redirects to `/management?module=approvals` and
  `/permissions` redirects to `/management?module=permissions`, preserving safe
  internal return context only.

### Account Directory

- **H-06:** Opening Account Directory immediately renders authorized Accounts;
  search or filters are not an entry prerequisite.
- **H-07:** The browser receives bounded pages and progressively loads subsequent
  pages; it never requests the complete directory as one unbounded response.
- **H-08:** The compact summary communicates total, Active, elevated, and Pending
  counts without large metric cards.
- **H-09:** Phone keeps Search visible and opens Role/Status/Department filters in
  a bottom sheet with an active-filter count and Clear action.
- **H-10:** Desktop uses a compact inline filter toolbar.
- **H-11:** Dense Account rows mirror Discord's member-row hierarchy: generated
  initials, display name, login identifier, Role/Status chips, and a clear Detail
  affordance. No new photo field is introduced.
- **H-12:** Phone Account Detail is a full-depth view; returning restores query,
  filters, loaded pages, selected row, and scroll position.
- **H-13:** Desktop may show list/detail together only at widths that leave both
  panes readable. Account Detail remains read-only.

### Role Policy

- **H-14:** Account & Permissions opens on a Discord-style Role list, not a long
  combined account/definition/matrix page.
- **H-15:** Member Baseline (`會友基礎`) is presented separately with the copy
  `適用於所有生效帳戶 · 系統固定`; it has no toggle, edit, delete, reorder, or
  assignment affordance.
- **H-16:** Global Roles remain exactly Admin, Staff, and Member.
- **H-17:** Phone navigation is Role list → Role Detail → Permissions or Assigned
  Accounts. Each transition has an explicit Back action.
- **H-18:** Role Detail contains only Role summary, Permissions, Assigned Accounts,
  and safety constraints. Discord Role Style, Color, Links, Mention, and Reorder
  sections do not render.
- **H-19:** Assigned Accounts is read-only in S4.
- **H-20:** Permissions has sticky search, grouped labeled descriptions,
  consistently aligned toggles, and locked status rows rather than disabled fake
  toggles.
- **H-21:** On phone, capability groups use accordions; search automatically
  reveals matching groups. Desktop may keep groups expanded.
- **H-22:** Changes form a staged draft. A persistent bar reports the unsaved
  count and opens a before/after review before one atomic Save.
- **H-23:** High-risk changes identify safety consequences during review without
  inventing new Capability semantics.

### Registration Approvals

- **H-24:** The queue has Pending and Processed views. Only Pending rows can be
  selected or mutated; Processed Detail is read-only and routable.
- **H-25:** Queue rows locate/select work; single-request approve/reject mutations
  happen from Detail after applicant-summary confirmation.
- **H-26:** Rejection requires an applicant-specific reason and explicit
  destructive confirmation.
- **H-27:** An Approval Selection is an explicit set of request IDs. It persists
  across scroll, search, filters, and a Detail round trip, but not reload, logout,
  or module exit.
- **H-28:** Hidden selections remain visible through `已選 N 位`, `檢視所選`,
  individual removal, and `清除` controls.
- **H-29:** Select All selects currently loaded filtered Pending rows only. It
  never selects hidden server results.
- **H-30:** The bulk action is `核准所選`; bulk rejection does not exist.
- **H-31:** Confirmation lists applicant names, truncates safely with `+N`, and
  states that N Active Accounts will be created.
- **H-32:** Registration Batch Approval is all-or-nothing. One stale, missing,
  resolved, or conflicting request produces no writes for any selected request.
- **H-33:** A batch conflict preserves selection, identifies stale entries, and
  offers review/removal; it never retries automatically.
- **H-34:** Durable actor-scoped idempotency returns the original response on
  replay and rejects same-key/different-selection reuse.
- **H-35:** Each successful request produces one credential-free immutable audit
  outcome in the same transaction as Account creation and request resolution.
- **H-36:** The accepted batch-size limit is fixed by an isolated-D1 probe before
  implementation is frozen; validation preserves the user's selection.

### Responsive and evidence contract

- **H-37:** Layout doctrine is: 320–599 phone single pane; 600–799 large-phone
  single pane with higher density; 800–1023 desktop shell with one primary
  content pane; 1024–1439 two-pane where useful; 1440+ may use Role/editor/review
  three-pane.
- **H-38:** Required evidence widths are 320, 375, 390, 414, 600, 799, 800,
  1024, 1440, and 1920px, including minimum, typical, and maximum content.
- **H-39:** Every material loading, empty, error, offline, forbidden, busy,
  success, conflict, read-only, selection, confirmation, and review state receives
  fresh DOM and screenshot evidence.
- **H-40:** No horizontal page overflow, clipped CJK/Latin identifiers, dock
  collision, inaccessible primary action, missing focus movement, or false
  affordance may remain.

## Prototype Contract

One fresh subagent implements the cohesive hardening prototype in an isolated
worktree/branch based on `feat/s4-management-access`. It directly reconstructs
the supplied Discord layouts and interactions using EFCC tokens and domain copy.
The prototype uses realistic in-memory data only, has no production mutations,
and remains outside the production merge stack. Contract and visual reviewers
must approve it before production tickets start.

## Readiness Vocabulary

- All deterministic and isolated-D1 criteria pass: **S4 HARDENING AUTOMATION GREEN**.
- Any missing state evidence, P0/P1, partial batch write, or audit gap:
  **S4 HARDENING NOT READY**.
- Production readiness remains a separate promotion decision.
