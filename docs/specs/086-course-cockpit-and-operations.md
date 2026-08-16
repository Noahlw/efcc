# 086 — Course Cockpit & Program/Department Operations

Status: Ready for agent
Scope: Management-mode Course Cockpit, Program Events, Attendance Roster, Hub
Attendance Chooser, Participants (pending/active/history), Assisted
Enrollment, Departments directory + Department Detail + Create Program.
Blocked by: 084 (Shell, Auth, Account/Settings).

Design authority: `EFCC Management Workspace (Standalone).html`, verified
directly against source. See `.scratch/prototype-port-2026/GRILLING-DECISIONS.md`
for the full decision record. Supersedes the retired `ADR-0032`,
`docs/specs/083-management-workspace-and-shell-contract.md`, and
`docs/specs/design-tree-efcc-redesign.html` wherever they conflict.

## Problem Statement

Production's Course Cockpit, event operations, attendance roster, and
department administration exist and are largely correct, but three concrete
things are wrong against the verified prototype: assisted enrollment is
restricted to `ManagerOnly` programs when the prototype allows it on any
managed program's active roster; the Hub-level "聚會／出席" entry point is a
raw event-ID input box instead of a real cross-program open-event picker; and
the manual per-event creation form's fields/copy need alignment as the
prototype's *primary* event-creation path (the existing rule-based bulk
generator stays as a secondary capability, per the earlier grilling
decision).

## Solution

Rebuild the Course Cockpit, Program Events, Attendance Roster, the
Hub-level Attendance Chooser, Participants tabs with capability-gated
Assisted Enrollment, and Department administration (directory, detail with 5
module toggles + manager picker, department-scoped Create Program) to match
the prototype's exact screens and copy — against real D1 data — while
correcting the three items above.

## User Stories

### Management directory & Course Cockpit entry

1. As a management-capable account, I want a searchable list of Programs
   within my authorized scope (department/program grants only — never
   inferred from a role label), so that I only ever see what I'm actually
   allowed to manage.
2. As a management-capable account with zero scope, I want an honest empty
   state, not a hidden or crashed screen.
3. As a management-capable account whose grant is revoked mid-session, I want
   the directory to reflect the loss of scope on next load, not show stale
   authority.
4. As a management-capable account, I want to switch from participant mode
   into management mode for the same program directly from Program detail
   (mode carries over the current program), so that switching context
   doesn't lose my place.

### Course Cockpit (status-first)

5. As a management-capable account opening a program's Cockpit, I want a
   status-first layout, not tabs: a next-meeting card first (with live
   已簽到 x/y check-in progress for recurring programs), then 2-up
   operational tiles (聚會 / 參與者) each carrying a pending-count badge,
   then quiet low-frequency rows (facts, edit, settings, notifications), so
   that the Cockpit always leads with "what needs attention now."
6. As a management-capable account whose program has no upcoming meeting, I
   want the next-meeting block omitted entirely (not an empty placeholder),
   with the 2-up operational tiles still present.
7. As a management-capable account, I want a direct "前往管理名單" path from
   the next-meeting card straight into that meeting's Attendance Roster, so
   that the single most common action (checking who's arrived) is one tap
   from the Cockpit's first screen.

### Course Facts & Edit

8. As a management-capable account, I want a read-only Course Facts view
   (name, department, purpose, lifecycle, discoverability, enrollment mode)
   reachable as a quiet row off the Cockpit, so that reference information
   doesn't compete with operational tiles for primary attention.
9. As a management-capable account, I want a Course Edit form (name +
   purpose, minimum) that validates both fields non-empty before saving,
   with a success toast and return to Course Facts, so that editing core
   program identity is a simple, low-risk action.

### Program Events (manual creation — primary path)

10. As a management-capable account, I want a Meetings list scoped to my
    program, each row showing name/date/time/type and an explicit
    "重複：<tag>" label that is purely informational, so that I understand
    at a glance that the tag never auto-generates other meetings.
11. As a management-capable account, I want a "建立聚會" action that opens a
    form (date, time, name, type, recurrence tag) validating date/time/name
    all required before submit ("請輸入日期、時間及聚會名稱。"), so that
    creating one meeting at a time is the primary, always-available path —
    matching the prototype exactly.
12. As a management-capable account editing an existing meeting that already
    has attendance records, I want the edit to succeed and be recorded with
    an explicit "已有出席記錄，變更已記錄原因與時間" acknowledgement, rather
    than being silently blocked, so that correcting a mistake never requires
    deleting history.
13. As a management-capable account attempting to cancel a meeting that
    already has attendance records, I want the cancel action explicitly
    refused ("此聚會已有出席記錄，不能取消；如需更正請使用出席名單的作廢功
    能。"), so that cancellation can never silently destroy check-in history.
14. As a management-capable account cancelling a meeting with no attendance
    yet, I want an explicit confirm dialog ("取消此聚會？取消後此聚會不再
    開放簽到，記錄會保留為「已取消」。"), so that cancellation is always a
    deliberate, confirmed action.
15. As a management-capable account, I want the existing rule-based
    recurring-schedule bulk generator to remain available as a secondary
    capability alongside manual creation (not removed), so that a program
    meeting every week doesn't require re-entering the same meeting by hand
    indefinitely.

### Attendance Roster & operations

16. As a management-capable account opening a meeting's roster, I want the
    meeting's status badge, title, and live check-in counts up front, so
    that I immediately see whether check-in is currently open.
17. As a management-capable account, I want to void an active attendance
    record with a required reason ("作廢簽到" → "作廢原因"), preserving the
    record but excluding it from the check-in count, so that mistaken
    check-ins can be corrected without deleting evidence.
18. As a management-capable account, I want to correct a guest attendance
    record's name or phone with a required reason ("修正訪客資料" → "姓名或
    電話"), preserving old/new values in an audit trail, so that guest data
    entry mistakes are fixable without losing the correction history.
19. As a management-capable account, I want to print/export a check-in sheet
    for a meeting with member phone numbers masked (e.g. `9123****`) except
    for the last visible digits, so that a physical printout at the venue
    doesn't expose full personal data.

### Hub-level Attendance Chooser

20. As a management-capable account entering "聚會／出席" from the
    Management Hub (not from a specific program's Cockpit), I want a real
    cross-program picker listing every currently-open-for-check-in meeting
    across my authorized scope, so that I can jump straight to the meeting
    I need without first navigating into its program.
21. As a management-capable account with zero open meetings right now, I
    want an honest empty state on this chooser, not a blank list.

### Participants

22. As a management-capable account, I want a Participants view with three
    tabs — 待審批 (pending) / 使用中 (active) / 歷史 (history) — each showing
    a scoped count, so that I can triage requests separately from viewing
    who's already in.
23. As a management-capable account on the pending tab, I want to approve or
    reject each request inline (no separate detail screen/URL — a
    single-record decision), with approval creating an active Enrollment
    atomically and rejection recording a terminal history entry, so that the
    common decision path stays fast.
24. As a management-capable account with `enrollment.approve` or equivalent
    program-management capability, I want a "代報名" (assisted enrollment)
    action available on the active tab for ANY managed program — not
    restricted to `ManagerOnly` programs — matching the verified prototype
    exactly, so that a leader can enroll a member directly regardless of the
    program's normal self-service enrollment mode.
25. As a management-capable account performing assisted enrollment, I want
    an explicit acknowledgement that this only creates an enrollment record
    and does not auto-check-in the member ("代報名只會建立報名記錄，不會自動
    簽到。"), so that the distinction between enrollment and attendance
    stays clear.
26. As a management-capable account on the active tab with zero enrolled
    members, I want an honest empty state ("目前沒有活躍名單。"), not an
    empty table with no explanation.

### Departments & Create Program

27. As a management-capable account, I want a Departments directory scoped
    to my authorization, so that department administration follows the same
    scope discipline as everything else.
28. As a management-capable account opening Department Detail, I want
    exactly 5 module toggles — Program Catalog / Enrollment / Events /
    Attendance / Custom Forms — each independently on/off, matching the
    prototype's `DEPARTMENTS_INIT` shape exactly, so that department
    capability composition matches the verified design.
29. As a management-capable account, I want to assign or revoke a Department
    Manager via a member picker from Department Detail, with an inline
    success notice (not an auto-navigate-away), so that consecutive manager
    changes don't require re-opening the department each time.
30. As a management-capable account, I want to create a new Program from
    within a specific Department's detail screen (department-scoped, not a
    free-floating global "create" action), with name + purpose validated
    non-empty before save, landing me on the new program's Cockpit on
    success ("課程已建立（草稿狀態）"), so that every new program starts
    with an unambiguous department owner.
31. As a management-capable account attempting a department save while
    offline, I want an inline error ("未能儲存。請重新連線後再試。") and no
    local state change.

## Implementation Decisions

- **Reuse the existing D1 domain layer untouched.** `DepartmentWorkspace`,
  `WorkspaceStore`, `CapabilityAuthorizer`, and the existing
  `program-workspace.tsx`/`department-workspace.ts`/`attendance.ts`/
  `attendance-operator-panel.tsx` (all already on `main`) implement the
  correct authorization, module-toggle, and attendance-void/correction
  rules — this spec corrects three specific UI/authorization surfaces
  (assisted-enrollment gating, Hub attendance chooser, manual-event-creation
  primacy) and otherwise ports copy/layout fidelity.
- **Assisted enrollment gating fix**: change the capability check from
  `enrollment_mode === "ManagerOnly"` to a pure capability check (actor holds
  `program.manage` or an equivalent enrollment-approval capability for that
  program's scope), independent of the program's enrollment mode. This
  matches Issue #184's capability-based reframing already recorded in
  `CONTEXT.md`'s domain glossary — the UI restriction being removed was
  never a real domain rule, just an over-tight implementation gate.
- **Hub Attendance Chooser** is a new component distinct from any
  program-scoped roster view: it queries across the actor's full authorized
  scope for meetings whose check-in window is currently open, and each row
  navigates directly into that meeting's existing Roster component. No new
  domain concept — a cross-scope query against the existing Event/check-in-
  window model.
- **Manual event creation as primary path**: the existing `createEvent`
  Worker/D1 call (already on `main`, already used by the current EventsTask)
  becomes the form the Cockpit surfaces first; align its fields/copy
  (date/time/name/type/recurrence-tag-as-informational) to the prototype
  exactly. The existing rule-based bulk generator (`ScheduleTask`,
  `createScheduleRule`/preview/generate) remains reachable as a secondary,
  clearly-labeled advanced action — not removed, not hidden, just no longer
  the *first* thing a manager sees when they want to add one meeting.
- **Assisted enrollment stays a member-picker overlay flow**, not a
  dedicated routed screen — the prototype has no view markup for
  `assisted-enrollment` as a screen; the real interaction is an inline
  member-search overlay triggered from the Participants active tab. If
  production's existing `AssistedEnrollmentTask` URL-based extraction
  (from the now-superseded prior stack) conflicts with this, collapse it
  back into an inline overlay to match the verified prototype.

## Testing Decisions

- **Seam**: component tests for Cockpit layout/state transitions, Program
  Events CRUD + cancel-guard, Roster void/correction/print, Participants
  tabs + assisted-enrollment gating, and Department Detail module toggles +
  manager picker (`web/lib/programs/program-workspace.test.tsx`,
  `event-detail.test.tsx`, `attendance-operator-panel.test.tsx`,
  `department-settings-panel.test.tsx`, `department-manager.test.ts`) —
  existing pattern, extend it.
- **Regression test required** for the assisted-enrollment gating fix: a
  `MemberRequest`-mode program with an active management grant must now
  show the 代報名 action where it was previously hidden — this must be an
  explicit new assertion (not just "still passes"), since it directly
  reverses prior behavior.
- **Seam**: worker integration tests for the Hub Attendance Chooser's
  cross-scope query and for the capability check change on assisted
  enrollment (`web/*.test.ts` pattern already used for `program-handlers.ts`).
- **Seam**: Playwright E2E against local `wrangler dev` + D1
  (`tests/e2e/programs-d1.test.ts`, `tests/e2e/attendance-d1.test.ts`) for
  full Cockpit → create meeting → roster → void/print, and for
  Department Manager grant → scoped visibility — existing pattern
  (ADR-0029), extend it.
- Test observable behavior only: rendered states, submitted requests, audit
  rows written — not internal component state shape.

## Out of Scope

- Any change to the rule-based recurrence engine's own logic (preview/
  generate/exceptions) — stays exactly as-is, only its UI prominence changes
  relative to manual creation.
- Self/Guest check-in (participant-facing) — covered by spec 085.
- Management Hub top-level directory, Registration Approvals, Account
  Permissions, Member Directory, Home Content CMS — covered by spec 087.
- Care — removed entirely in spec 084; no Care-adjacent work here.

## Further Notes

The prototype's `PROGRAMS_INIT` mock data encodes the exact shape of every
program state this spec must render (`active`/`pending`/`eligible`/
`managerOnly`/`withdrawn`/`cancelled`/`rejected`/`archived`) via `STATE_TAG`
and `STATE_ACTION` — cross-reference these directly when implementing
Participants-tab and Course Cockpit state rendering to avoid inventing a
ninth state or a different label set.
