# 087 — Management Hub, Approvals, Permissions & Home Content CMS

Status: Ready for agent
Scope: Management Hub top-level directory, Registration Approvals (list + own
routable detail), Account Permissions (real multi-account matrix), Member
Directory, Home Content CMS editor.
Blocked by: 084 (Shell, Auth, Account/Settings).

Design authority: `EFCC Management Workspace (Standalone).html`, verified
directly against source. See `.scratch/prototype-port-2026/GRILLING-DECISIONS.md`
for the full decision record. Supersedes the retired `ADR-0032`,
`docs/specs/083-management-workspace-and-shell-contract.md`, and
`docs/specs/design-tree-efcc-redesign.html` wherever they conflict — this spec
also formally supersedes `ADR-0033`'s claim that Registration Approval detail
"forbids a direct URL," which was written against stale source material.

## Problem Statement

Production's Management Hub directory, Registration Approval queue, Member
Directory, and Home CMS editor exist and are largely correct, but two things
are concretely wrong against the verified prototype: Registration Approval
decisions are inline-only with no routable detail screen, while the
prototype has `approval-detail` as its own deep-linkable screen; and Account
Permissions shows only the signed-in actor's own capability projection,
while the prototype shows a real table of admin/staff accounts and their
roles plus a role-definition reference table. Additionally, a Care Hub row
still exists despite Care being absent from both prototypes (removed in spec
084; this spec must not reintroduce it).

## Solution

Rebuild the Management Hub directory, extract Registration Approval detail
into its own routable Task, build a real multi-account Account Permissions
matrix backed by a new endpoint, rebuild Member Directory, and align the Home
Content CMS editor to the prototype's exact single-editor shape — against
real D1 data.

## User Stories

### Management Hub directory

1. As a management-capable account opening the 管理 dock slot, I want a
   grouped directory — 會員與權限 / 事工營運 / 內容與系統 — in that fixed
   order, so that the Hub's information architecture matches the prototype
   exactly and never silently reorders based on what I happen to have
   access to.
2. As a management-capable account with only a subset of Hub capabilities, I
   want ungranted groups/rows omitted entirely (not shown-disabled), so that
   the Hub never implies access I don't have.
3. As a management-capable account, I want each Hub row to show a short
   description alongside its label (e.g. 註冊審批 → "核准或拒絕會員申請"),
   so that unfamiliar admins understand what each row does before opening
   it.

### Registration Approvals — list & routable detail

4. As a Staff/Admin account, I want an Approvals list of pending
   registration requests with submitted-at timestamps, so that I can triage
   in submission order.
5. As a Staff/Admin account, I want to open one request into its own
   routable Approval Detail screen (deep-linkable, back-navigable,
   bookmarkable within a session) showing the applicant's name, submitted
   contact info, and current status (待審批/已核准/已拒絕), so that a
   request under review has a stable, shareable location distinct from the
   list — matching the verified prototype exactly and reversing the prior
   inline-only assumption.
6. As a Staff/Admin account on Approval Detail, I want explicit 核准/拒絕
   actions that commit atomically (approval creates an Active account;
   rejection records a terminal state with a required note, per the
   existing migration `0012` rejection-note contract), so that the decision
   and its record are always consistent.
7. As a Staff/Admin account who has already decided a request, I want
   Approval Detail to still be viewable (read-only, showing the recorded
   outcome) rather than disappearing, so that past decisions remain
   auditable from the same URL.
8. As a Staff/Admin account, I want the Approvals list itself to still
   support quick same-screen review of straightforward cases, with the
   detail screen available for anyone who wants the fuller context, so that
   the new routable detail is additive, not a forced extra click for every
   decision.

### Account Permissions (real matrix)

9. As a Staff/Admin account opening Account Permissions, I want a real table
   of admin-capable accounts with each one's name, role, and department
   context (e.g. "陳小明 · 管理員 · 培育部", "黃家豪 · 同工 · 崇拜部 →
   部門管理者"), so that I can see who actually holds elevated access
   church-wide, not just my own projection.
10. As a Staff/Admin account, I want a role-definitions reference section
    listing exactly the three roles the prototype defines — 管理員 (全部
    範圍), 部門管理者 (所屬部門課程、聚會及出席), 同工 (部門範圍內協助
    工作) — each with its scope description and an assignment-state
    indicator (已設/可指派), so that the meaning of each role is explicit,
    not implied.
11. As a Department Manager (not Staff/Admin), I want Account Permissions to
    remain unavailable to me (server-authorized, not just hidden), so that
    this church-wide visibility stays scoped to the roles the prototype
    grants it to.
12. As a Staff/Admin account, I want the copy explaining this screen's
    consequence ("管理員帳戶可指派角色及部門授權。角色變更會即時反映；部門
    管理者不能自行授予管理者權限。"), so that the boundary between what this
    screen shows and what it can change is explicit.

### Member Directory

13. As an Admin or Staff account, I want church-wide search across Active
    accounts, so that full-scope lookup isn't artificially narrowed.
14. As a Department Manager, I want search results scoped to members
    enrolled in programs under my assigned departments only, so that my
    directory visibility matches my actual authority.
15. As any account with directory access, I want a member's detail (contact,
    role, department memberships) surfaced from a search result, so that
    a search-then-view flow needs no separate commit step.

### Home Content CMS

16. As an Admin (or a Staff account with the dedicated publish capability),
    I want a single editor screen switching between Template A (featured
    upcoming event, falling back to the next-eligible church-wide event) and
    Template B (title/summary/sanitized rich body/CTA/editorial image),
    matching the prototype's single `home-editor` shape exactly (not a
    separate library/editor/preview/audit set of screens).
17. As a CMS editor, I want to save a draft independently of publishing, so
    that in-progress content never accidentally goes live.
18. As a CMS editor, I want to publish immediately or schedule a future HK-
    time publish, so that time-sensitive announcements can be queued ahead.
19. As a CMS editor, I want a phone/desktop preview toggle before publishing,
    so that I can verify the content's real rendered shape on the primary
    viewport before it goes live.
20. As a CMS editor whose save conflicts with a newer version already
    published by someone else, I want an explicit conflict state requiring
    me to reload the latest version (never a silent overwrite), so that
    concurrent edits can never destroy each other.
21. As a CMS editor, I want a visible audit trail of who published what and
    when, so that accountability for church-wide content is never opaque.

### Care (must not regress)

22. As any account, I want no Care row anywhere in the Management Hub — this
    spec must not reintroduce what spec 084 already removed.

## Implementation Decisions

- **Reuse the existing Hub grouping, Approvals mutation logic, Member
  Directory search, and Home Content CMS persistence/cron untouched** where
  they're already correct — `ApprovalQueue`, `searchManagementMembers`, and
  `home-content.ts`'s Template A/B sanitizer + conflict/audit logic (already
  on `main` in spirit, though the CMS UI file itself needs porting per spec's
  scope) are not being redesigned, only the two named gaps are closed.
- **Registration Approval Task extraction**: add a routable
  `programs-intent`-style task param (or an equivalent Hub-scoped URL param,
  consistent with the existing `?module=approvals&request=<id>` pattern
  already used elsewhere in this Hub) that opens Approval Detail directly,
  with the list remaining the default view when no request id is present.
  This reverses the closed `ADR-0033`'s "forbids a direct URL" claim for
  this one case — do not apply that same reversal to any other still-inline
  decision (Enrollment Request detail, program-scoped participant
  decisions) unless a future spec finds equivalent verified evidence.
- **Account Permissions matrix requires a new read endpoint** projecting
  every account holding an elevated role (Admin/Staff-with-DM-grant/Staff)
  plus their department context, authorized to Admin/Staff only — server-
  side capability check, not a client-side role branch. This is new backend
  work, not a UI-only port; design the endpoint's response shape around
  exactly the two-section content verified in the prototype (account list +
  role-definition table), not a speculative generic "permissions" API
  surface.
- **Home CMS**: if migration `0010_home_content_cms.sql` (currently only on
  the abandoned `feat/083-02-attention-center` branch, not on `main`) is
  still schema-correct against this spec's requirements, port it forward as
  a fresh migration on top of `main`'s current migration `0009` — verify
  field-by-field against the prototype's `home-editor` fields
  (`msgTitleRef`/`msgSummaryRef`/`msgBodyRef`/`msgCtaRef`, template
  A/B switch, publish-now/schedule) before reusing it verbatim.
- **`task_priorities`** (bundled with the now-dead `account_subscriptions`
  table in the old migration `0011`) is still needed — it backs the
  Attention Center's Admin-only priority reorder, which is verified real in
  the prototype (`cyclePriority` handler). Write a fresh migration creating
  only `task_priorities`, not `account_subscriptions`.

## Testing Decisions

- **Seam**: component tests for Hub grouping/row visibility per capability
  fixture, Approval Detail rendering + approve/reject + read-only-after-
  decision state, Account Permissions matrix rendering per role fixture, and
  Home CMS editor state transitions (draft/preview/publish/schedule/
  conflict) — existing pattern
  (`management-hub.test.tsx`, `approval-queue.test.tsx`,
  `home-content.test.tsx`/`home-content-ui.tsx` tests), extend it.
- **Regression test required** for the Approval Detail extraction: assert
  a request opened via direct URL renders the same data as opening it from
  the list, and that back-navigation returns to the list with its prior
  scroll/filter state intact.
- **Regression test required** for Account Permissions: assert a
  Department-Manager-role fixture is denied server-side (403/FORBIDDEN), not
  just hidden client-side.
- **Seam**: worker integration tests for the new Account Permissions
  endpoint's authorization boundary (`web/*.test.ts` pattern, e.g.
  `worker.auth.test.ts`'s existing per-role assertion style).
- **Seam**: Playwright E2E against local `wrangler dev` + D1
  (`tests/e2e/programs-d1.test.ts`, `tests/e2e/live-ui.test.ts`) for the full
  Hub → Approvals → Approval Detail → decide path, and for Admin viewing the
  real Account Permissions matrix — existing pattern (ADR-0029), extend it.
- Test observable behavior only: rendered states, submitted requests, audit
  rows written — not internal component state shape.

## Out of Scope

- Any change to the underlying capability/authorization model
  (`CapabilityAuthorizer`, role_capabilities table structure) beyond the one
  new read endpoint this spec requires.
- Course Cockpit, Program Events, Attendance Roster, Departments — covered
  by spec 086.
- Participant-facing surfaces — covered by spec 085.
- Subscription-preference UI — confirmed absent from prototype; not built.
- Rebuilding Care in any form — removed in spec 084, stays removed.

## Further Notes

The Account Permissions matrix's exact two admin-account rows and
three-role reference table shown in the prototype are illustrative mock
data (陳小明/黃家豪), not a literal fixture to hardcode — the real endpoint
must project actual D1 account/role/department state in that same shape.
