# 084 — Shell, Auth Surfaces, Account & Settings

Status: Ready for agent
Scope: Foundational — 5-slot shell, Auth Surfaces, Account, system Settings hub.
Blocks: 085 (Participant Experience), 086 (Course Cockpit + Operations), 087
(Management Hub + Approvals/Permissions + Home CMS) — all three mount inside
this shell and reuse its Account/Settings surfaces.

Design authority: two standalone HTML prototypes — `EFCC Management Workspace
(Standalone).html` and `EFCC Participant Check-in (Standalone).html` — decoded
and verified directly against source. See
`.scratch/prototype-port-2026/GRILLING-DECISIONS.md` for the full decision
record this spec (and its siblings 085–087) are drawn from. This spec
supersedes the retired `ADR-0032`, `docs/specs/083-management-workspace-and-
shell-contract.md`, and `docs/specs/design-tree-efcc-redesign.html` wherever
they conflict with the verified prototype source.

## Problem Statement

The production shell, navigation, and auth surfaces were built against a
design reference that turned out not to match the real prototypes. Concrete,
verified mismatches: the account permissions view only shows the signed-in
actor's own projection instead of a real admin/role matrix; a Care module is
exposed in navigation and Hub routing despite being absent from both
prototypes; there is no offline banner anywhere in the authenticated shell
despite every prototype mutation path guarding against it; the system
Settings hub (帳戶與權限 / 簽到設定 / 時區) does not exist as a routed surface
at all.

## Solution

Rebuild the authenticated shell, every Auth Surface, Account, Account
Settings, and a new system Settings hub to match the two prototypes exactly:
same screens, same states, same copy, same interaction contracts — wired to
real Worker/D1 data and mutations, not mocked. Remove Care entirely (Hub row,
`CareSurface` stub, `/care` redirect) as a clean cutover. Add the offline
detection every prototype mutation path assumes.

## User Stories

### 5-slot shell & navigation

1. As any authenticated account, I want a 5-slot bottom dock on phone
   viewports (<920px) with a central raised Scan button, so that the five
   primary destinations (首頁/課程/〔掃描〕/slot4/帳戶) are always one tap away.
2. As any authenticated account, I want the same 5 destinations rendered as a
   sticky left rail on desktop viewports (≥920px), so that the navigation
   model is consistent across form factors.
3. As a Member with no management capability, I want slot 4 to show 通知
   (Notices), so that my dock reflects what I can actually do.
4. As a Staff, Admin, Department Manager, or Program Leader, I want slot 4 to
   show 管理 (Management), so that management-capable accounts reach the Hub
   directly from the dock.
5. As any authenticated account, I want the current destination visually
   marked (`aria-current="page"`), so that I always know where I am.
6. As a keyboard or screen-reader user, I want a "跳到主要內容" skip link and
   a live route announcement region, so that navigation is fully accessible.
7. As any authenticated account on a slow connection, I want a neutral
   loading skeleton (not a flash of the wrong nav shape) while my bootstrap
   profile loads, so that the shell never visibly flickers between
   capability states.
8. As any authenticated account whose network drops, I want a persistent
   top banner reading "現時沒有網絡。你仍可查看已載入內容；提交前請重新連線。",
   so that I understand why a submit might fail before I try it.
9. As any authenticated account, I want that offline banner to disappear
   automatically the moment connectivity returns, so that I don't have to
   manually dismiss stale state.

### Auth Surfaces (signed-out)

10. As a returning user, I want a login screen with username + password
    fields and a clear submit error ("未能登入。請重新連線後再試。" for
    network failure; a distinct invalid-credentials message), so that I can
    get back into my account.
11. As a user submitting an empty login form, I want an inline validation
    message ("請輸入登入名稱及密碼。"), so that I don't get a confusing
    server round-trip for an obviously incomplete submit.
12. As a legacy-PIN account holder, I want to be routed to a dedicated
    upgrade screen after a successful PIN verification, prompting for a new
    password (≥8 characters, confirmed twice), so that I can move off the PIN
    credential without losing my identity proof.
13. As a legacy-PIN account holder completing the upgrade, I want to land
    signed in immediately on success (toast: "新密碼已設定"), so that the
    upgrade doesn't require a second login.
14. As a prospective member, I want a registration form (Chinese name, phone,
    username, password ≥8 characters) that submits to a pending-review state,
    so that I can request an account without staff having to pre-provision it.
15. As a newly-registered user, I want an explicit result screen explaining
    "教會同工核對後會通知你。帳戶啟用前仍可使用訪客簽到。", so that I know my
    account isn't active yet but I'm not locked out of check-in.
16. As any user (signed in or not), I want a public Guest Check-In entry
    reachable from the signed-out surface, so that I can check into a meeting
    without an account.
17. As any authenticated account whose session silently expires, I want a
    dedicated "工作階段已過期" screen explaining idle timeout, with a
    re-login action that returns me to the exact page I was on, so that I
    never lose my place.
18. As any user who reaches a URL that doesn't resolve (bad screen name,
    missing resource, revoked scope), I want a "找不到此內容" screen with a
    clear way back, so that I'm never stuck on a blank or broken page.

### Account & Account Settings

19. As any authenticated account, I want an Account screen showing my display
    name, role/department context, active status, and personal QR code (for
    Assisted Check-In), so that I can present my identity to a leader.
20. As any authenticated account, I want an Account Settings screen to change
    my login username (validated non-empty, error surfaced inline, success
    toast "登入名稱已更新"), so that I can rename my login identity without
    losing my account.
21. As any authenticated account, I want to change my password (current +
    new ≥8 chars + confirm-match, with explicit copy warning "更改密碼後，你
    需要在所有裝置重新登入。"), so that I can rotate my credential securely.
22. As any account whose password change succeeds, I want to be signed out
    of every device and required to log in again, so that the new credential
    is the only valid one everywhere.
23. As any authenticated account attempting a username/password change while
    offline, I want an inline error ("未能更新。請重新連線後再試。") rather
    than a silent failure or false success, so that I never believe an
    offline mutation went through.

### System Settings hub

24. As a management-capable account, I want a Settings hub reachable from
    Account, listing 帳戶與權限 (Account Permissions), 簽到設定 (Check-in
    Settings), and 時區 (Timezone) as three navigable rows, so that
    system-level configuration has one discoverable home.
25. As a management-capable account, I want a Check-in Settings screen
    showing which check-in methods are enabled (member QR, event code,
    assisted check-in) and the configured check-in window durations (e.g.
    "聚會開始前 30 分鐘" / "聚會結束後 X"), so that I can see the system's
    check-in configuration in one place.
26. As any account viewing Timezone settings, I want a read-only display of
    "香港時間（GMT+8）" with the explanation "聚會、報名及發佈時間均以香港時間
    顯示。", so that I understand every timestamp in the system uses one
    fixed timezone (Asia/Hong_Kong), matching the existing Church Time domain
    rule — no timezone is configurable.

### Care removal

27. As any account, I want no Care entry anywhere in navigation (dock,
    Management Hub, direct URL), so that the product surface matches exactly
    what the two prototypes define — neither prototype has a Care screen or
    nav slot.
28. As a user with an old bookmark to `/care`, I want that route removed with
    no redirect shim (pre-production system, no real bookmarks to protect),
    consistent with the existing `/events` clean-cutover precedent.

## Implementation Decisions

- **Reuse, don't rebuild, the identity/session layer.** Cookie-only auth
  (`ADR-0018`/`ADR-0020`), the `{requestId, data}` RPC envelope, RFC 9457
  problem responses, and Idempotency-Key handling on mutations are unchanged
  and already correct — this spec only touches the shell/nav/auth *UI* layer
  and the two small new Settings sub-screens.
- **Navigation is a server projection, never a browser role branch.** The
  existing `sections.ts` capability-projection pattern stays; slot 4's
  通知-vs-管理 swap is driven by the server-provided navigation array, exactly
  as today — no new client-side role logic.
- **Offline detection**: use `navigator.onLine` plus `window online`/`offline`
  event listeners at the shell root (matches the prototype's own mechanism
  exactly — `this._onOnline`/`this._onOffline` in both prototype scripts).
  Client-only network status, not a resilience/retry feature. Every mutating
  form in Auth/Account (login, upgrade, register, username/password change)
  must check this flag before submit and short-circuit with the prototype's
  exact copy pattern ("未能…請重新連線後再試。") rather than attempting the
  request and failing server-side.
- **Check-in Settings and Timezone screens are read-only informational
  displays**, not new configurable features — no new mutation endpoints
  required for this spec. They may read from existing Program/Event
  check-in-window configuration (already modeled on `main`) and a hardcoded
  Asia/Hong_Kong constant for the Timezone row. If a future spec needs true
  per-department check-in-window configuration, that is out of scope here.
- **Care removal is a full deletion**, not a feature flag: remove the Hub
  row wiring, the `CareSurface` component, the `/care` route and its legacy
  redirect entry, and the `careUnavailable`/`careOperations` copy keys. Grep
  for every reference before removing (`lsp references` on the removed
  exports) to catch any remaining caller.
- **Skeleton hydration**: the existing neutral-skeleton-while-loading pattern
  (already partially built) stays; verify it against the prototype's
  `viewportWidth` boot logic (`componentDidMount` reads `window.innerWidth`
  and `navigator.onLine` before first paint) rather than rebuilding from
  scratch.

## Testing Decisions

- **Seam**: component tests (`web/lib/*.test.tsx`, Vitest) for shell/nav/
  auth-form rendering, validation, and state transitions — the existing
  pattern in this codebase (`app-shell.tsx` + `app.test.tsx`, `nav-bar.tsx` +
  companion tests). Prefer this seam over E2E wherever a test doesn't need a
  real server round-trip.
- **Seam**: worker integration tests (`web/worker.auth.test.ts`) for any
  auth-adjacent endpoint behavior touched (none expected to change — this
  spec is UI-layer only against existing endpoints).
- **Seam**: Playwright E2E against local `wrangler dev` + local D1
  (`tests/e2e/auth-d1.test.ts`, `tests/e2e/live-ui.test.ts`) for full-stack
  login/register/upgrade/session-expiry flows and the 5-slot dock's
  capability-driven slot-4 swap across Member/Staff/Admin fixtures — this is
  the existing, already-proven pattern in this repo (ADR-0029 local-first
  gate).
- Test the offline banner by toggling `navigator.onLine`/dispatching
  `online`/`offline` events in a component test — do not attempt to simulate
  real network loss in E2E.
- Regression test required for Care removal: assert `/care` returns a
  not-found/forbidden state (whichever the removal lands on) and that no Hub
  group renders a Care row for any fixture role.
- Test only external behavior (rendered DOM, announced text, submitted
  requests) — not internal component state shape.

## Out of Scope

- Any change to the identity/session/credential Worker endpoints themselves.
- True configurable check-in-window editing UI (Check-in Settings here is
  read-only display only).
- Any timezone other than Asia/Hong_Kong — the system has exactly one, by
  design (Church Time domain rule).
- Rebuilding Programs/Events/Attendance/Departments domain logic — untouched,
  already correct on `main`.
- Subscription-preference UI — confirmed absent from both prototypes; do not
  build (see `GRILLING-DECISIONS.md`).

## Further Notes

Commit both raw prototype HTML files into `design/` as part of this spec's
delivery (provenance for the whole four-spec effort), and add a new ADR that
retires `ADR-0032`/`ADR-0033`'s stale screen-count and approval-routing
claims, naming these two files as sole design authority. This housekeeping
belongs in this spec because it is foundational and lands first.
