# Prototype Port — Grilling Session Decisions (source of truth for spec-writing)

## Design authority

The binding design source is two standalone HTML prototype files (NOT the retired
`design-tree-efcc-redesign.html`, NOT `ADR-0032`/`ADR-0033` as previously written):

- `EFCC Management Workspace (Standalone).html` — 顯恩堂 · 管理工作原型. 30 real rendered
  screens (of 34 declared; 4 are dead JS-only route names with zero view markup:
  `program-notifications`, `participant-approval-detail`, `assisted-enrollment` as a
  screen, `program-settings` as a screen).
- `EFCC Participant Check-in (Standalone).html` — 顯恩堂 · 會員及簽到原型. 21 real
  rendered screens (of 22 declared; `guest-scan` is dead — its trigger actually
  navigates to `guest-checkin`).

Both are Bolt-bundled single-file React artifacts (gzip-compressed manifest +
JSON-escaped template + inline `text/x-dc` logic script). Decoded and inspected
directly against source — every fact below is verified against the literal
template/script text, not inferred.

## Settled decisions (Q1–Q12, grilling rounds 1–4)

1. **Design authority**: these two files are binding, superseding `ADR-0032`'s prior
   `design_handoff_efcc_redesign` reference and `design-tree-efcc-redesign.html`.
2. **Port strategy**: rebuild every prototype screen's DOM, CSS, copy, states, and
   interactions inside the existing Next.js/Worker/D1 architecture, wired to real
   data and real mutations. Do NOT copy the bundle. Do NOT style-only patch.
3. **State scope**: every rendered prototype state ships (loading/empty/error/success/
   confirm/offline). Demo-only scaffolding (示範資料 toggles, scenario switches,
   cross-prototype persona hard-links via `window.location.href`) is stripped.
4. **URL architecture**: keep production's existing scheme (`/home`, `/programs`,
   `/scanner`, `/management`, `programs-intent.ts` task params). Map prototype
   screens onto it; do NOT adopt the prototype's own `?screen=` demo router.
5. **Backend completeness**: build every missing Worker/D1 contract needed by a
   prototype-visible mutation. No fake success states, no mocked persistence.
6. **Schedule Rule / recurrence generation**: KEEP the existing rule-based bulk
   event generator (already on `main`) as an ADDITIVE capability. The prototype's
   Course Edit screen has no schedule-rule UI at all — events are created one at a
   time via a manual form (date/time/name/type + a purely informational recurrence
   tag; verified copy: "「重複標記」只作顯示參考，不會自動生成其他聚會" — the tag
   never auto-generates). Production's manual `createEvent` already exists and
   should become the prototype-matched primary path; the bulk generator stays as a
   secondary/advanced capability, not removed.
7. **Assisted enrollment gating**: DROP the current `ManagerOnly`-only restriction.
   Verified: the prototype's 代報名 button renders unconditionally on the
   participants "active" tab for ANY managed program, regardless of
   `enrollment_mode`. Gate on capability (manage/approve), not on program mode.
8. **Account Permissions (M-26)**: BUILD a real multi-account permissions
   projection — new backend endpoint required. Verified prototype content: a table
   of admin/staff accounts and their role+department, e.g. "陳小明 · 管理員 ·
   培育部 → 管理員" / "黃家豪 · 同工 · 崇拜部 → 部門管理者", followed by a role
   definitions table with exactly 3 roles: 管理員 (全部範圍, 已設),
   部門管理者 (所屬部門課程、聚會及出席, 已設), 同工 (部門範圍內協助工作, 可指派).
   No Program Leader row. This replaces production's current actor-only
   `PermissionsProjection`.
9. **Care**: REMOVE entirely — the Hub row, `CareSurface` stub, and `/care` legacy
   redirect. Verified: Care has zero screens and zero nav-dock slots in either
   prototype (participant dock: 首頁/課程/掃描/通知/帳戶; management dock:
   首頁/課程/掃描/管理/帳戶). Clean cutover, no shim.
10. **Prototype custody**: commit both raw HTML files into the repo under
    `design/` for provenance. Write a new distilled, accurate screen-by-screen spec
    doc replacing `design-tree-efcc-redesign.html`. New ADR retires the stale
    `ADR-0032`/`ADR-0033` screen-count and approval-routing claims.
11. **Registration Approval detail routing**: EXTRACT into its own routable Task.
    Verified: the prototype's `approval-detail` screen is a full deep-linkable
    screen (`?screen=approval-detail`, back button, status badge, approve/reject
    buttons) — NOT inline in the queue list. This reverses `ADR-0033`'s claim that
    "the prototype's own rule ... forbids a direct URL," which was written against
    stale source material.
12. **Delivery sequencing**: one spec per subsystem area (this document supports
    all four), each producing independently testable, mergeable software. Each
    subsystem spec goes through `to-spec` → `to-tickets` (with a REQUIRED user
    quiz/approval of the ticket breakdown before publishing) → `implement-ticket-
    stack`, based fresh off `main` (see below — NOT off the abandoned
    `feat/083-02-attention-center` branch or closed PR #297).

## Additional verified facts (not decisions — direct source extraction)

- **Subscription-preferences UI is genuinely absent from both prototypes.**
  Checked participant `account-settings` (username/password change only, no
  topic toggles) and `notices` (list + mark-all-read only). Per decision #3,
  this is OUT OF SCOPE — do not build subscription-preference UI. The existing
  `account_subscriptions` D1 table (migration `0011`, only on the abandoned
  branch, not on `main`) is dead weight; do not port it forward. Note:
  migration `0011` also created `task_priorities`, which IS still needed (see
  next point) — the migration will need to be split/rewritten, not ported whole.
- **Attention Center priority reordering is real** (verified via
  `cyclePriority` handler + Admin-only priority chips in the 待處理 tab of the
  Attention overlay in the management prototype). Needs a `task_priorities`-
  equivalent table and an audit trail on priority changes.
- **`checkin-settings` and `timezone-settings`** are two small, mostly-static
  informational screens under a system Settings hub (帳戶 → 管理員身份 → 設定 →
  簽到設定 / 時區). Verified content: check-in method status badges, all
  read-only "已啟用" (member QR / event code / assisted check-in), fixed
  check-in window durations (e.g. "聚會開始前 30 分鐘"), and a read-only
  "香港時間（GMT+8）" timezone display. No editable form fields found anywhere
  in either screen — lightweight builds, not new configurable features.
  `Settings` hub itself has exactly 3 rows: 帳戶與權限, 簽到設定, 時區.
- **Hub-level `攻意務／出席` entry (`attendance-chooser`)** is a real, separate
  cross-program event-picker screen (reached directly from the Management Hub,
  not from within a Course Cockpit): "選擇一個開放簽到的聚會，處理出席點名及
  代簽。" Production currently exposes this only as a raw event-ID input box —
  needs a real picker.
- **Home CMS is a single `home-editor` screen** in the prototype (Template A/B
  switch, msgTitle/msgSummary/msgBody/msgCta fields, publish now/schedule,
  simulated conflict demo) — matches production's already-merged single-page
  `HomeContentEditor` shape. Migrations `0010_home_content_cms.sql` (only on
  the abandoned branch) look reusable as reference schema.
- **Department module toggles**: prototype's `DEPARTMENTS_INIT` has exactly 5
  fields — `catalog`, `enrollment`, `events`, `attendance`, `customForms` — an
  exact match for production's already-existing 5-module-toggle
  `DepartmentSettingsPanel` (on `main`). No change needed there beyond copy/UI
  fidelity.
- **Create Program** is department-scoped in the prototype (`submitCreateProgram`
  reads `this.state.currentDeptKey`), matching production's existing
  department-scoped `ProgramForm` flow (on `main`). Prototype form fields are
  just name + purpose (richer production fields — category, behavior_type,
  discoverability, enrollment_mode — are not contradicted, just not shown in
  this particular screen; keep them, verify against Course Facts/Edit screens
  during spec execution).

## Branch/PR state (resolved 2026-08-16)

- `main` @ `f2c55d4e` already has the full reusable domain/backend foundation:
  `program-workspace.tsx`, `department-workspace.ts`, `attendance.ts`,
  `attendance-operator-panel.tsx`, `WorkspaceStore`, `CapabilityAuthorizer`,
  migrations `0000`–`0009` (identity, Programs, Departments, Attendance, event
  operations, notification reads).
- `main` does NOT have: `management-hub.tsx`, `home-content.ts`, migrations
  `0010`–`0012`, `ADR-0032`, `docs/specs/083-*.md`,
  `docs/specs/design-tree-efcc-redesign.html`.
- The old stack (issues #291–#296, PR #297, branch `feat/083-02-attention-center`)
  is CLOSED/superseded — see decisions above. PR #297 was additionally stale
  against its own ticket (missing commit `dae0255a`'s code-review fixes).
  `feat/083-02-attention-center` is left unmerged as historical reference only;
  do not build on it.
- **New ticket stacks for all four subsystem specs start fresh from `main`**
  via `gh stack init --base main <bottom-branch>`.

## Subsystem breakdown for the four specs

1. **Shell + Auth + Account/Settings** (foundational — blocks the other three):
   5-slot bottom dock + desktop rail, auth surfaces (login, legacy-PIN upgrade,
   register, registration-result, guest-checkin, guest-result, session-expired,
   not-available), Account (QR, details) + Account Settings (username/password),
   system Settings hub (帳戶與權限 entry point, 簽到設定, 時區), offline banner.
2. **Participant Experience**: Home (Template A/B teaser + empty state),
   message-detail (church announcement), Programs directory + filters + program
   detail + enrollment actions, event-detail, full scanner flow (camera →
   manual code → chooser → confirm → result, with all 8 demo scenarios' REAL
   equivalents: normal/multi-event/window-closed/cancelled/invalid-code/
   not-enrolled/offline/submit-failed), Notices (list, mark-all-read, 90-day
   retention framing).
3. **Course Cockpit + Program/Department Operations**: Management directory →
   Course Cockpit (next-meeting card, 已簽到 x/y, 2-up tiles), Course Facts/Edit
   (quiet rows), Program Events (manual create/edit, cancel-with-guard),
   Attendance Roster (void-with-reason, guest correction, print sheet),
   Hub-level Attendance Chooser (cross-program open-event picker), Participants
   tab (pending/active/history) with capability-gated Assisted Enrollment
   (decision #7), Departments directory + Department Detail (5 module toggles +
   manager picker) + Create Program.
4. **Management Hub + Approvals/Permissions + Home CMS**: Management Hub
   directory (3 groups), Registration Approvals list + own-URL detail
   (decision #11), Account Permissions real matrix (decision #8), Member
   Directory, Home Content CMS editor (Template A/B, schedule, conflict,
   audit).

Each spec must use `docs/specs/NNN-*.md` numbering continuing from the highest
existing spec number in the repo, reference this document, and be published as
a GitHub issue with `spec` + `ready-for-agent` labels per repo convention
(matching closed issue #291's label shape).
