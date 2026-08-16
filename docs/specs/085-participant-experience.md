# 085 — Participant Experience: Home, Programs, Scanner, Notices

Status: Ready for agent
Scope: Participant-mode surfaces only (Home, Programs directory + detail,
Event detail, full Scanner flow, Notices).
Blocked by: 084 (Shell, Auth, Account/Settings) — mounts inside that shell and
reuses its Account/offline-banner infrastructure.

Design authority: `EFCC Participant Check-in (Standalone).html`, verified
directly against source. See `.scratch/prototype-port-2026/GRILLING-DECISIONS.md`
for the full decision record. Supersedes the retired `ADR-0032`,
`docs/specs/083-management-workspace-and-shell-contract.md`, and
`docs/specs/design-tree-efcc-redesign.html` wherever they conflict.

## Problem Statement

Production's participant-mode Home, Programs, and Scanner surfaces exist but
diverge from the real prototype in specific, verified ways: the self
check-in flow has no explicit confirmation step before submitting attendance
(the prototype requires the user to confirm "本人與聚會" before check-in
commits); the multi-event chooser is not prototype-equivalent; the Programs
catalog is missing the viewer-relative filters (可報名/已參加/待審批) the
prototype uses to let a member find their own state at a glance.

## Solution

Rebuild Home, Programs (directory + detail + enrollment actions), Event
detail, the full Scanner flow (camera → manual code → multi-event chooser →
confirmation → result), and Notices to match the prototype's exact screens,
states, and copy — against real D1 enrollment/attendance/event data.

## User Stories

### Home

1. As a Member with an upcoming enrolled event, I want the Home screen to
   lead with a personalized "下一項與你有關的安排" card (program name, event
   title, date, time, location, a 已報名 status tag, and a "查看聚會" CTA),
   so that I immediately see what's next without navigating anywhere.
2. As a Member with no upcoming enrolled events, I want an honest empty state
   ("暫時沒有與你有關的聚會 / 你未有已報名的聚會。探索課程，尋找合適的參加
   機會。") with an "探索課程" CTA, so that Home never implies a fake
   commitment.
3. As any Member, I want a 教會消息 (church announcement) card on Home
   sourced from real published Home Content (Template B), so that
   church-wide announcements reach every member on first screen.
4. As any Member, I want a 探索 card surfacing one currently-open-for-
   enrollment program, so that Home also nudges discovery, not just status.
5. As any Member, I want an "全部課程" link from Home directly into the
   Programs directory, so that Home is a launch point, not a dead end.
6. As a Member on a stale Home content load, I want Template A's featured
   event to automatically fall back to the church's next-eligible future
   Active event if the featured event itself is no longer valid, never a
   fabricated placeholder.

### Church announcement detail

7. As a Member tapping a church-message card, I want a detail screen with
   venue/arrival information and location rows (e.g. 崇拜及主要聚會場地,
   親子室, 訪客接待), so that first-time and regular attendees both find
   what they need.
8. As a Member on the announcement detail screen, I want any external venue
   link clearly labeled "外部連結" and opened in a new, safe tab, so that I
   know I'm leaving the app.

### Programs directory & detail

9. As a Member, I want to search Programs by name/text, so that I can find a
   specific program quickly.
10. As a Member, I want to filter Programs by 全部/可報名/已參加/待審批, so
    that I can see only the programs relevant to my current relationship
    with them.
11. As a Member, I want a loading skeleton while the catalog fetches
    ("正在載入課程"), so that the screen never looks broken during the
    fetch.
12. As a Member whose catalog fetch fails, I want an explicit load-error
    state ("未能載入課程…重新載入") that preserves my search/filter
    selection across retry, so that I don't lose my search context.
13. As a Member whose search/filter yields nothing, I want an empty-match
    state with a "清除篩選" action, so that I can recover without retyping.
14. As a Member opening a program, I want a detail screen with purpose text,
    a next-event card (date/time/location + "查看聚會詳情"), a schedule
    table, and my own enrollment history for that program, so that I have
    everything needed to decide whether to enroll.
15. As a Member viewing a `ManagerOnly` program, I want an explicit read-only
    note ("此課程由同工安排參加"), so that I understand why there's no
    self-enroll action.
16. As a Member viewing an `Archived` program, I want an explicit note that
    the program is archived, so that I don't attempt to interact with dead
    content.
17. As a Member with a pending schedule conflict against another program I'm
    also engaged with, I want a non-blocking conflict note surfaced on the
    detail screen, so that I'm informed but never prevented from acting.

### Enrollment actions

18. As an eligible Member, I want a single "報名" action that submits my
    request and updates my status to 待審批 with a toast confirmation, so
    that requesting is a one-tap action.
19. As a Member with a pending request, I want a "取消申請" action gated by
    an explicit confirm dialog ("取消報名申請？你仍可在課程接受報名期間重新
    提交。"), so that withdrawal is deliberate, not accidental.
20. As an actively-enrolled Member, I want a "退出課程" action gated by an
    explicit confirm dialog ("退出課程？退出後如需再參加，需重新報名。"), so
    that leaving a program is deliberate.
21. As a Member whose prior request was withdrawn, cancelled, or rejected, I
    want a "重新報名" action that re-submits a fresh pending request, so
    that I'm never permanently locked out after backing away once.
22. As a Member attempting any enrollment action while offline, I want an
    inline error ("未能提交。請重新連線後再試。") and no local state change,
    so that I never see a false-success enrollment status.

### Event detail

23. As a Member viewing an event I can check into, I want a "可簽到" badge,
    the event's title/program/when/where, brief check-in instructions, and a
    "前往掃描" CTA that pre-selects this exact event, so that going from
    "I see the meeting" to "I'm checked in" is one tap.
24. As a Member navigating to Event detail from different entry points (Home,
    Program detail, Notices, Scanner), I want the back action to return me
    to wherever I actually came from, so that back-navigation never
    surprises me.

### Scanner — camera & manual code

25. As a Member starting a self check-in, I want a camera viewfinder that
    only requests camera permission when I tap "開始掃描" (never on page
    load), so that the permission prompt is expected and contextual.
26. As a Member whose device has no camera or permission is denied, I want an
    automatic, first-class fallback to a 6-digit manual event code input
    (numeric keypad, `maxLength=6`), always visible even when the camera
    works, so that manual entry is never a hidden escape hatch.
27. As a Member entering a manual code, I want inline validation rejecting
    anything that isn't exactly 6 digits ("請輸入六位數聚會代碼。"), so that
    obviously malformed input is caught before a server round-trip.

### Scanner — resolution outcomes

28. As a Member scanning a code that resolves to exactly one open event, I
    want to proceed directly to a confirmation step, so that a single valid
    scan needs no extra decision.
29. As a Member scanning a code that resolves to multiple simultaneously-open
    events, I want an explicit event chooser listing each candidate, so that
    I pick the right one instead of guessing.
30. As a Member scanning a code for an event whose check-in window hasn't
    opened yet, I want an explicit outcome screen stating when it opens
    (e.g. "簽到尚未開放…此聚會的簽到時段將於 7:00 PM 開始（聚會開始前 30
    分鐘）。開放後可以重新掃描或輸入代碼簽到。"), so that I know exactly when
    to come back.
31. As a Member scanning a code for a cancelled event, I want an explicit
    outcome screen stating cancellation, not a generic error, so that I
    understand the meeting isn't happening rather than assuming I did
    something wrong.
32. As a Member scanning a code for an event I'm not enrolled in, I want an
    explicit outcome screen with a "查看課程詳情" CTA into that program, so
    that a denial converts into a path forward, not a dead end.
33. As a Member scanning an invalid/unrecognized code, I want an inline error
    ("找不到此代碼對應的聚會，請確認後重試。") that lets me retry
    immediately, so that a typo doesn't require restarting the whole flow.
34. As a Member scanning while offline, I want an inline error ("現時沒有
    網絡，未能核實聚會資料。請重新連線後再試一次。") rather than a hang or a
    false resolution, so that the failure mode is honest.

### Scanner — confirmation & result

35. As a Member who has resolved to exactly one event (directly or via the
    chooser), I want an explicit confirmation step showing that event's
    identity before check-in commits, so that I positively confirm "this is
    my meeting" before the attendance record is written.
36. As a Member confirming check-in, I want a "不是這個聚會" escape that
    returns me to re-resolve (chooser or scanner), so that a
    wrong-event confirmation is trivially reversible before commit.
37. As a Member whose check-in submission succeeds, I want a clear success
    result ("簽到完成" + program/event identity) with "返回首頁" and "再次
    簽到" actions, so that the outcome is unambiguous and I have an obvious
    next step.
38. As a Member who has already checked into this exact event, I want a
    quiet, neutral duplicate result (not an error) — "已完成簽到" / "你已在
    此聚會簽到，無需重複。" — so that re-scanning never looks like a failure.
39. As a Member whose check-in submission fails on the server, I want an
    inline error ("未能完成簽到，請重試一次。") with an explicit retry
    action, so that a transient failure never silently drops my attendance.
40. As a Member confirming check-in while offline, I want an inline error
    ("未能提交簽到。請重新連線後再次確認；系統不會自動重試。") and zero
    local state change, so that offline never fabricates a check-in.

### Notices

41. As any Member, I want a Notices screen listing meeting/enrollment/
    account-related messages with an unread indicator per item and a
    relative or dated timestamp, so that I can scan what's new at a glance.
42. As any Member, I want a "全部標示已讀" action that clears every unread
    indicator at once with a toast confirmation, so that bulk triage is one
    tap.
43. As any Member with zero notices, I want an honest empty state ("暫時沒有
    通知") rather than an empty list with no explanation.
44. As any Member opening a notice, I want it to route me to the right
    destination based on its subject (event detail, program detail, or
    account), so that a notice is always actionable, not just informational.
45. As any Member, I want read notices retained (not deleted) for a bounded
    period, so that I can still find something I already read without it
    accumulating forever.

## Implementation Decisions

- **Reuse the existing enrollment/attendance/event D1 domain untouched.**
  `web/lib/programs/participant-*.tsx`, `program-api.ts`, `attendance.ts`
  already implement the correct server-side rules (capability checks,
  check-in window derivation, enrollment state machine) — this spec is about
  making the client screens and interaction contract match the prototype
  exactly, not re-deriving domain rules.
- **Scanner confirmation step**: per the existing Task-granularity rule
  (independent multi-step state earns its own URL-addressable step; a
  single-record yes/no decision stays inline) — the scan → resolve → confirm
  → result sequence is already one continuous multi-step flow living under
  `/scanner`; the confirmation step is an in-flow state, not a new top-level
  route. Model it as an explicit state within the existing scanner
  component tree, not a new page.
- **Multi-event chooser**: build a real participant-facing chooser component
  (distinct from the existing operator-side chooser in
  `attendance-operator-panel.tsx`) that lists each currently-open event for
  the scanned Program Check-In Token, matching the prototype's `scan-chooser`
  screen exactly — row selection carries the chosen event into the
  confirmation step.
- **Programs catalog viewer-relative filters** (可報名/已參加/待審批) require
  the catalog endpoint to return the viewer's own enrollment state per
  program alongside the existing lifecycle/discoverability fields — extend
  the existing catalog response shape rather than adding a second endpoint.
- **Camera permission timing**: request `getUserMedia` only inside the
  "開始掃描" click handler, never in a mount effect — matches the prototype's
  `cameraUnavailable = !navigator.mediaDevices` check plus lazy permission
  request exactly.

## Testing Decisions

- **Seam**: component tests for Home/Programs/Event-detail/Notices rendering,
  filter/search behavior, and enrollment-action state transitions
  (`web/lib/programs/participant-*.test.tsx`, `web/lib/home-content*.test.*`)
  — existing pattern, extend it.
- **Seam**: a dedicated component/unit seam for the scanner resolution state
  machine (normal / multi-event / window-not-open / cancelled / not-enrolled
  / invalid-code / offline / submit-failure / duplicate) — one test per
  branch, matching `use-qr-camera.test.tsx` / `scanner-intent.test.ts`'s
  existing pattern of isolating pure resolution logic from camera I/O.
- **Seam**: Playwright E2E against local `wrangler dev` + D1
  (`tests/e2e/attendance-d1.test.ts`, `tests/e2e/programs-d1.test.ts`) for the
  full self-check-in path end to end, including the real camera-denied →
  manual-code fallback and the duplicate-checkin neutral result — existing
  pattern (ADR-0029 local-first gate), extend it.
- Regression test required wherever this spec changes existing behavior
  (e.g. adding the confirm step to a flow that previously submitted
  directly) — assert the old direct-submit path no longer occurs.
- Test observable behavior only: rendered states, submitted requests, and
  announced text — not internal component state shape.

## Out of Scope

- Any change to check-in window derivation, enrollment approval rules, or
  the Program Check-In Token/Event Manual Code mechanisms themselves —
  already correct on `main`.
- Guest Check-In (public, unauthenticated) — already implemented and
  verified against the prototype's guest flow in a prior cycle; not
  re-touched here unless a defect is found during this spec's execution.
- Assisted/operator-side check-in — covered by spec 086.
- Subscription-preference UI — confirmed absent from prototype; not built.

## Further Notes

The 8 demo scan scenarios in the prototype (`SCAN_SCENARIOS`: normal, multi,
window, cancelled, invalid, notenrolled, offline, fail) are dev-only fixture
switches in the mock — they map to the 8 real server-driven outcomes listed
in the User Stories above, not to a UI toggle. Do not port the scenario
switcher itself.
