# 083 — Management Workspace, 5-Slot Phone-First Shell, and Home Content CMS Specification

**Feature:** Management Workspace, 5-Slot Phone-First Shell, Course Cockpit, and Home Content CMS  
**Design Authority:** `DESIGN.md`, `.impeccable/design.json` (Variant A: Official Civic Minimal), `Web-Prototype/phone-first-ux-redesign-plan.md`, `Web-Prototype/plugin-source/skill-plugin-msttnwrd/references/source-2-PRODUCT.md`  
**Architecture Authority:** ADR-0032 (Management Workspace Design Authority: Full Prototype Adoption & 5-Slot Shell), ADR-0017 (Static Export), ADR-0018 (HTTP Boundary), ADR-0020 (D1 Identity), ADR-0025 (Staff Role Boundary), ADR-0026 (Department Modules & Scoped Access), ADR-0027 (Atomic Enrollment Approval), ADR-0029 (Local-First Testing Gate), ADR-0030 (D1 Relational Schema & Generic Audit)  
**Spec Authority:** Spec 000 (Product Truth), Spec 079 (Redesign Acceptance Matrix), Spec 080 (D1 Relational Schema), Spec 082 (Management Notification Read State)  
**Date:** 2026-08-16  
**Status:** **READY FOR IMPLEMENTATION** (Triage: `spec`, `ready-for-agent`)  

---

## Problem Statement

The production application's interface currently mirrors the underlying backend relational schema, forcing operators to navigate nested accordions and complex permission hierarchies. Congregation members encounter placeholder views on key routes (`/home`, `/care`, `/permissions`), while ministry leaders and Sunday door check-in volunteers struggle with fragmented operator tools (`/events`, `/registrations`, `/programs?mode=management`). 

On mobile devices, this structural complexity produces high cognitive load, unguided navigation, and competing actions in the thumb zone. Furthermore, church staff lack an in-app editorial mechanism to publish schedule-aware church announcements, service notices, or featured gatherings without engineering intervention or code deployments.

---

## Solution

A phone-first, task-oriented church operational architecture organized around two primary surfaces and a unified 5-slot navigation shell:

1. **5-Slot Bottom Dock & Responsive Shell:**
   - **Participant Dock:** `首頁` · `課程` · `〔掃描〕` (central raised dock) · `通知` · `帳戶`
   - **Management-Role Dock:** `首頁` · `課程` · `〔掃描〕` (central raised dock) · `管理` · `帳戶`
   - **Desktop Adaptation (≥920px):** Expands the same 5 destinations into a sticky left rail.
2. **Two-Layer Capability-Adaptive Management:**
   - **Program-Level Mode Switch:** Management-capable accounts access the persistent `參與者 ｜ 管理` switch in the `課程` tab. Switching to `管理` with an active program context opens its **Course Cockpit** (`ProgramWorkspace`).
   - **Management Hub (`管理` Dock Tab):** Grouped operational directory (`會員與權限`, `事工營運`, `內容與系統`) providing centralized access to registration approvals, department configuration, member directory, and system settings.
3. **Course Cockpit (`ProgramWorkspace`):**
   - Status-first orientation leading with the **下一聚會** card (showing live check-in progress `已簽到 x/y` and direct roster link), 2-up operational cards (`聚會` with upcoming count and `參與者` with `待審批報名 ×N` badge), followed by quiet rows for course facts, editable basics, and program settings.
4. **Universal Attention Center:**
   - A single topbar bell icon opening a two-tab overlay: **`待處理`** (actionable tasks with count badge and manual priority `高/一般/低`) and **`通知`** (informational announcements with unread dot indicator and 90-day retention).
5. **Home Content CMS:**
   - In-app publishing engine supporting **Template A** (featured upcoming event with church-wide earliest active fallback) and **Template B** (church announcement with title, summary, sanitized Markdown rich body, external validated HTTPS image, and CTA), immediate vs. scheduled HK-time publishing evaluated by a 5-minute Cloudflare cron worker (`*/5 * * * *`), optimistic-concurrency conflict protection, and audit trails.

---

## User Stories

### 1. Shared Shell, Navigation & Identity
1. As an authenticated congregation Member, I want a stable 5-slot bottom dock (`首頁 · 課程 · 〔掃描〕 · 通知 · 帳戶`), so that I can navigate core church functions predictably with one hand.
2. As a management-capable user (Staff, Admin, Department Manager, Program Leader), I want the fourth dock slot to display `管理` instead of `通知`, so that I have immediate access to the Management Hub.
3. As a management-capable user, I want the topbar notification bell visible across all screens, so that I can access both my informational notifications and my operational tasks from anywhere in the app.
4. As a mobile phone user, I want the central `掃描` button raised slightly into the thumb zone with at least 44px touch area, so that checking in upon arrival at church is effortless.
5. As a desktop user (≥920px), I want the bottom dock adapted into a sticky left navigation rail, so that I can manage dense operational workflows efficiently on a larger screen.
6. As a user opening the application via a direct link, I want session hydration to render a neutral structural skeleton without flashing the wrong persona dock or showing false 403 Forbidden screens.
7. As a user whose session expires while working, I want to be redirected to login with full `returnTo` query preservation, so that re-authenticating restores my exact task without losing context.
8. As a user on an unstable cellular connection in church halls, I want a persistent top offline banner (`現時沒有網絡。你仍可查看已載入內容；提交前請重新連線。`), so that I am clearly informed when network mutations are paused.
9. As a user who prefers reduced motion, I want modal transitions, dock highlights, and toast animations to respect `prefers-reduced-motion: reduce`, so that the interface remains comfortable and accessible.

### 2. Participant Home & Announcements
10. As a congregation Member opening the app, I want to see the Home page within two seconds with a clear next action, so that I immediately know about upcoming church gatherings.
11. As a Member viewing a Home page configured with Template A, I want to see the featured upcoming gathering with live date, time, and location, followed by an `探索課程` link to browse the full catalog.
12. As a Member viewing a Home page configured with Template B, I want to see the latest church announcement with title, summary, and optional editorial photo, so that I stay informed on pastoral news.
13. As a Member tapping `查看詳情` on a Home announcement, I want a dedicated sanitized detail page rendering structured rich text without external tracking scripts or layout distortion, so that I can read the full pastoral message safely.
14. As a Member encountering an announcement with an external link, I want an explicit `外部連結` chip with secure new-tab opening (`rel="noopener noreferrer"`), so that I know when I am leaving the church application.
15. As a signed-out visitor on the login page, I want an accessible `訪客簽到` entry point, so that I can check into a gathering without first creating an account.

### 3. Participant Programs, Events & Enrollment
16. As a Member browsing `課程`, I want a unified search bar and filter chips (`全部`, `可報名`, `已報名`, `歷史`), so that I can find relevant fellowship or Sunday school programs easily.
17. As an enrolled Member, I want my active and pending program relationships clearly distinguished with status badges, so that I do not mistake a pending application for an active enrollment.
18. As an eligible Member viewing Program Detail, I want an `申請參加` action that clearly explains submission creates a Pending Request requiring approval, so that my expectations are transparent.
19. As a Member with a Pending Enrollment Request, I want the ability to withdraw my application with one confirmation tap and no required reason, so that I retain full personal autonomy.
20. As an enrolled Member who can no longer attend a program, I want the ability to self-cancel my enrollment with consequence confirmation, so that the seat is released for other members.
21. As a Member viewing a Recurring Program, I want its recurring schedule pattern and upcoming gatherings displayed clearly, so that I can plan my weekly attendance.

### 4. Scanner & Check-In
22. As an authenticated Member arriving at church, I want camera-first QR scanning with a live viewfinder, so that I can scan the venue's Program QR code in one step.
23. As a Member on an older mobile browser or with camera access denied, I want an immediate inline fallback to the 6-character Event Manual Code input, so that hardware limitations never block my check-in.
24. As a Member scanning a Program QR code during a time window where multiple gatherings overlap, I want a Multi-Event Chooser dialog, so that I can select my specific fellowship or service unambiguously.
25. As a Member who scans twice accidentally, I want a quiet neutral duplicate confirmation (`已於 10:02 完成簽到`), so that repetitive scans do not produce error alarms or duplicate attendance records.
26. As an un-enrolled Member attempting to check into a closed program, I want an explicit explanation that enrollment is required, so that I am guided to apply rather than left with a cryptic error.

### 5. Universal Attention Center
27. As a ministry leader, I want the topbar Bell badge to display the exact count of unresolved actionable tasks within my authority, so that I know when operational decisions are waiting for me.
28. As an operator opening the Attention Center, I want to see `待處理` tasks grouped by domain module (`會員/審批`, `課程`, `聚會/出席`, `首頁內容`), so that I can process pending work in a structured order.
29. As an Admin managing the shared task queue, I want the ability to adjust a task's priority (`高`, `一般`, `低`), so that time-sensitive applications receive priority handling from co-workers.
30. As a user viewing `通知` in the Attention Center, I want an unread indicator dot and a `全部標示已讀` batch action, so that I can keep my notification feed clean without dismissing pending operational work.
31. As a user tapping any actionable task or notification, I want to deep-link directly into the owning workflow with automatic capability re-validation, so that I can resolve the item immediately.

### 6. Course Cockpit (`ProgramWorkspace`)
32. As a Program Leader or Department Manager entering a program's Management mode, I want a status-first Course Cockpit layout, so that the most urgent operational tasks are presented first.
33. As a Sunday gathering leader viewing the Course Cockpit for a Recurring Program, I want the `下一聚會` block to display live check-in progress (`已簽到 24/48`), so that I can monitor arrival numbers at a glance.
34. As a door volunteer, I want a single tap on `前往管理名單` from the Cockpit to open the live Attendance Roster, so that I can start assisted check-in without navigating sub-menus.
35. As a Program manager, I want the 2-up operational cards (`聚會` showing upcoming event count, `參與者` showing pending approval badge `待審批報名 ×N`), so that weekly operational tasks are immediately actionable.
36. As a Program manager, I want low-frequency actions (`課程資料`, `編輯課程`, `聚會時間表`, `負責人設定`) relegated to quiet secondary rows, so that they do not distract from active gathering management.

### 7. Program Events & Roster Operations
37. As an Event manager, I want an Event list organized by `即將舉行` and `歷史` sections, so that past completed events do not clutter current operational views.
38. As a Recurring Program manager, I want a Schedule Rule editor and a Generate Events preview tool, so that monthly gatherings can be generated with audited idempotency.
39. As an attendance operator on Sunday morning, I want an Assisted Check-In mode (`代為簽到`) allowing me to scan a member's personal QR or search by name/phone, so that I can check in members whose cameras or phones fail.
40. As an attendance operator, I want assisted check-in to enforce enrollment preconditions and show an explicit error popup if the member is not enrolled, so that non-enrolled individuals are not mistakenly checked in.
41. As an authorized leader correcting an accidental check-in, I want to void the attendance record with a mandatory explanation reason, so that the action is accountable and logged in audit history.
42. As an authorized leader correcting a guest's misspelled name or phone number, I want to update the record in-place with a logged reason, so that the check-in timestamp and event binding remain intact.
43. As an Event manager preparing for physical door operations, I want to generate a printable PDF/paper check-in sheet with masked phone numbers (`9123****`), so that attendee privacy is protected at the venue.
44. As an Event manager, I want Event Cancellation strictly blocked while active attendance records exist, so that historical attendance data cannot be orphaned by a cancelled event.

### 8. Program Participants & Approvals
45. As an approver viewing the Course Cockpit's `參與者` module, I want a dedicated `待審批` tab ordered oldest-first, so that long-waiting applicants are reviewed promptly.
46. As an approver, I want to review an applicant's name, submission date, and details with one-tap `核准` or `拒絕` (with mandatory reason note), atomically creating an active enrollment upon approval.
47. As an enrollment manager on the `活躍` tab, I want an assisted enrollment (`代報名`) search picker to enroll an active member directly, so that church elders or offline applicants can be registered without fabricating requests.
48. As an enrollment manager cancelling a member's enrollment, I want a mandatory reason prompt and consequence explanation, so that the cancellation is transparent and audited.

### 9. Management Hub: Departments, Approvals & Directory
49. As a Staff/Admin accessing the `管理` dock tab, I want a clean Management Directory grouped into `會員與權限`, `事工營運`, and `內容與系統`, so that all high-level administration is easily accessible.
50. As an Admin in Department Settings, I want to view and toggle the 5 product modules (`課程目錄`, `報名`, `聚會`, `出席`, `自訂表單`), so that department capabilities can be composed without altering historical data.
51. As an Admin, I want to assign or revoke Department Managers using an active member search picker, so that management authority is delegated securely.
52. As an Admin or Department Manager inside Department Detail, I want a `建立課程` entry form capturing Name, Purpose, and Behavior Type (`Recurring` vs `OneOff`), so that programs are always parented under an authorized department.
53. As an Admin archiving a Department, I want the system to strictly block archival if any child Program is in `Draft` or `Active` status, so that active programs are never orphaned.
54. As a Staff or Admin in `註冊審批`, I want a queue of pending account applications with one-tap `核准` (creating an Active account with the default Member role) or `拒絕`, so that new members can be onboarded quickly.
55. As an operator searching the `會員名冊` (Member Directory), I want search results capability-scoped (Admin/Staff search church-wide; Department Managers search only members in their department's programs), so that member privacy is strictly enforced.
56. As an Admin in `帳戶與權限`, I want a read-only projection of active admin accounts and role capabilities, so that permission assignments can be audited safely.

### 10. Home Content CMS
57. As an authorized Home Content editor (`Admin` or `Staff` with `home.publish` grant), I want an in-app editor under `首頁內容` allowing me to choose between Template A (`近期聚會優先`) and Template B (`教會消息優先`).
58. As an editor creating a Template B announcement, I want to enter a Title, Summary, Markdown body, CTA button label, destination URL, and validated external HTTPS photo URL, so that the message renders with high visual fidelity.
59. As an editor, I want an exact mobile phone preview (`首頁預覽`) before publishing, so that I can verify formatting and layout on mobile viewports.
60. As an editor, I want the choice to publish immediately (`立即發佈`) or schedule a publication window with start and end timestamps in Hong Kong time (`排程發佈`).
61. As a system administrator, I want scheduled publication and expiry evaluated automatically every 5 minutes by a Cloudflare cron trigger, with the read path enforcing time invariants directly in SQL, so that visitors never see expired or premature announcements.
62. As an editor attempting to publish when another administrator has committed a newer version, I want an explicit 409 Conflict banner preserving my unsaved inputs and requiring me to reload the latest version, so that concurrent edits never overwrite each other silently.
63. As an Admin inspecting publishing history, I want an immutable audit log displaying the editor name, timestamp, version number, and template type for all past publishes, so that editorial changes are fully accountable.

---

## Implementation Decisions

### 1. Unified 5-Slot Shell & Dynamic Dock Topology
- **Route Topology:** Built within the existing static-export Next.js App Router (`output: 'export'`) served by Cloudflare Worker + D1 (ADR-0017, ADR-0018).
- **Navigation State:** The client `AppShell` evaluates server-projected capabilities from `/auth/me` on startup.
  - While session restoration is in progress (`isRestoring: true`), slot 4 renders a neutral geometric skeleton matching exact 44px dock dimensions to eliminate visual layout shift.
  - When capabilities resolve:
    - Normal Member accounts render the **Participant Dock**: `[首頁]`, `[課程]`, `[〔掃描〕]`, `[通知]`, `[帳戶]`.
    - Capability-bearing accounts (Admin, Staff, Department Manager, Program Leader) render the **Management-Role Dock**: `[首頁]`, `[課程]`, `[〔掃描〕]`, `[管理]`, `[帳戶]`.
- **Legacy Route Redirection & Folding:**
  - Direct URL access to `/events` redirects permitted operators to the Management Hub attendance console (`/management?module=events`) and members to `/programs`.
  - Direct URL access to `/permissions` redirects Admins to Management Hub account permissions (`/management?module=permissions`) and unauthorized accounts to `/home`.
  - Direct URL access to `/care` redirects pastoral staff to the secondary Care dashboard under Management Hub.
- **Top Bar Integration:**
  - Full official church title `中國基督教播道會顯恩堂` and squar-cut `SealSlot` anchor the header.
  - The universal top-right Bell button is present on all authenticated screens.

### 2. Universal Attention Center Architecture
- **Single Component Overlay:** Replaces separate legacy attention popovers with a unified top-right Bell dialog (`programs-attention-center.tsx`).
- **Badge Semantics:**
  - When actionable tasks exist (count > 0), the bell displays a solid cinnabar red badge (`--accent: #9c302c`) with the exact numeric count.
  - When actionable tasks = 0 but unread informational announcements exist, the bell displays a compact red unread indicator dot.
- **Tabbed Internal Structure:**
  - **`待處理` (Actionable Work):**
    - Grouped strictly by owning module sequence: `會員與權限` → `課程` → `聚會/出席` → `首頁內容`.
    - Displays task name, submission time, warning state, and manual priority chip (`高` / `一般` / `低`).
    - Only `Admin` role can mutate task priority; changes write to `task_priorities` with an audit event.
    - Tasks are server-projected workflow states; they cannot be cleared or dismissed without resolving the underlying workflow.
  - **`通知` (Informational Messages):**
    - Chronological list of past operational notifications (e.g. approved enrollment, rescheduled event).
    - Features a `全部標示已讀` batch action that updates read state in `program_notification_reads` without mutating `待處理` items.
    - 90-day retention window.

### 3. Course Cockpit (`ProgramWorkspace`)
- **Status-First Operational Hierarchy:**
  - Replaces nested accordion layouts with a progressive disclosure command center.
  - **`下一聚會` Hero Card (Recurring Programs only):** Displays next active gathering date/time, schedule source tag (`自動排程` vs `手動新增`), live arrival progress (`已簽到 x/y`), and a full-width `前往管理名單` CTA deep-linking to the active attendance roster. (Cleanly omitted when all events are completed or for OneOff programs).
  - **`營運` (2-Up Operational Tiles):**
    - `聚會` Card: Shows upcoming active event count, opening the chronologically sorted meeting management view.
    - `參與者` Card: Shows active enrollment count plus an amber pending count badge (`待審批報名 ×N`), opening the participant management view on the `待審批` tab.
  - **`其他` (Quiet Secondary Rows):**
    - `課程資料` (M-03 read-only facts), `編輯課程` (M-04 name/purpose form), `聚會時間表` / `課程設定` (M-14), and `課程消息` (M-15).

### 4. Department Management & Program Creation
- **Module Toggle Invariant:**
  - Department Detail exposes 5 explicit checkboxes: `program_catalog`, `enrollment`, `events`, `attendance`, `custom_forms` mapped to `department_modules`.
  - Toggling a module on/off is capability-gated (`department.module.toggle`) and audited; disabling a module hides operational UI but never deletes or alters historical records.
- **Department Manager Delegation:**
  - Managed via `department_managers` table with partial unique index `department_managers_active_idx WHERE revoked_at IS NULL`.
  - Added/removed using an active member search picker. Department Managers dynamically inherit program management capabilities within their department, but cannot self-grant or re-delegate Department Manager status.
- **Program Creation Boundary:**
  - `建立課程` form lives exclusively inside Department Detail (`M-05`).
  - Inputs: Name, Purpose, Behavior Type (`Recurring` vs `OneOff`). Creating a program persists an initial `Draft` + `Unlisted` record parented under that department.
- **Department Archival Guardrail:**
  - Server strictly aborts archival of a department if any child Program has status `Draft` or `Active`.
- **Program Archival Invariant & Admin Reversibility:**
  - Archiving a Program (`Draft` or `Active` → `Archived`) is rejected while any future Scheduled Event exists, any Check-In Window is open, or any Enrollment Request is Pending.
  - Program archival closes all operational and enrollment commitments while permanently preserving historical records read-only.
  - Archival is reversible exclusively by an `Admin` with a recorded audit reason, which transitions the program back to `Active` status.

### 5. Program Events, Attendance & Physical Sheet
- **Event Cancellation Guardrail:**
  - Cancelling an event sets `status = 'Cancelled'`, invalidates manual check-in codes, and logs `EVENT_CANCEL`.
  - Strictly rejected with HTTP 422 if any `Active` attendance record exists for that event. Operators must first void all active attendance rows with reasons before cancellation is unlocked.
- **Guest Attendance Correction:**
  - Authorized leaders can correct a guest's name or phone directly on the live roster.
  - Mutation performs an in-place update on the `attendances` table and writes an immutable `GUEST_ATTENDANCE_CORRECTED` row to `audit_events` with old/new values, actor ID, and explanation note.
- **Printable Check-in Sheet (M-22):**
  - Clean printable stylesheet with Program QR, Event Manual Code, date, time, and attendee rows.
  - Phone numbers are masked on paper (`9123****`) to safeguard member personal data at physical venues.

### 6. Program Participants & Assisted Enrollment
- **Participant Tabs:**
  - **`待審批`:** Oldest-first queue. `核准` atomically records decision, creates `Active` enrollment, and emits notification intent (ADR-0027). `拒絕` requires mandatory reason note.
  - **`活躍`:** Roster of enrolled members with `代報名` action.
  - **`歷史`:** Cancelled and withdrawn relationship history.
- **Assisted Enrollment (`代報名`):**
  - Member search picker over `Active` accounts.
  - Directly creates an `Active` enrollment without fabricating a request.
  - If member is already enrolled, inactive, or restricted, displays an explicit modal popup explaining the condition (`會員已在名單中` / `無效會員`).
- **Cancellation Policy:**
  - Member self-cancellation: Confirmation dialog with consequences; no mandatory reason text required.
  - Manager-initiated cancellation: Mandatory reason string required, written to audit log.

### 7. Registration Approvals & Member Directory
- **Registration Approval Queue (`M-24`, `M-25`):**
  - Accessible via Management Hub (`會員與權限`) and Attention Center (`待處理`).
  - `核准` calls `handleApproveRegistration`, creating an `Active` account with the canonical default `Member` role.
  - `拒絕` calls `handleRejectRegistration` with reason note.
- **Member Directory (`M-27`):**
  - Search input with debounce over Name, Username, Phone.
  - Scoped by capability: Admin/Staff search church-wide; Department Managers search only members enrolled in programs under their department.
  - Member Detail sheet displays identity, role, department, and contact info (read-only in this pass; credential reset deferred to #227).

### 8. Home Content CMS Architecture
- **D1 Schema (`web/migrations/0010_home_content_cms.sql`):**
  ```sql
  CREATE TABLE home_content (
    content_id    TEXT PRIMARY KEY,
    version       INTEGER NOT NULL,
    template_type TEXT NOT NULL CHECK (template_type IN ('A', 'B')),
    status        TEXT NOT NULL CHECK (status IN ('Draft', 'Published', 'Archived')),
    publish_mode  TEXT NOT NULL CHECK (publish_mode IN ('immediate', 'scheduled')),
    featured_event_id TEXT,
    title         TEXT,
    summary       TEXT,
    body_markdown TEXT,
    image_url     TEXT,
    cta_label     TEXT,
    cta_url       TEXT,
    start_at      TEXT,
    end_at        TEXT,
    created_by    TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    published_by  TEXT,
    published_at  TEXT,
    FOREIGN KEY (featured_event_id) REFERENCES events(event_id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES accounts(user_id) ON DELETE RESTRICT,
    FOREIGN KEY (published_by) REFERENCES accounts(user_id) ON DELETE RESTRICT
  ) STRICT;

  CREATE UNIQUE INDEX home_content_version_idx ON home_content(version);
  CREATE INDEX home_content_status_idx ON home_content(status, publish_mode, start_at, end_at);
  ```
- **Editorial Subscriptions Schema (`web/migrations/0011_account_subscriptions.sql`):**
  ```sql
  CREATE TABLE account_subscriptions (
    user_id       TEXT NOT NULL,
    topic_key     TEXT NOT NULL,
    is_subscribed INTEGER NOT NULL DEFAULT 1 CHECK (is_subscribed IN (0, 1)),
    updated_at    TEXT NOT NULL,
    PRIMARY KEY (user_id, topic_key),
    FOREIGN KEY (user_id) REFERENCES accounts(user_id) ON DELETE CASCADE
  ) STRICT;
  ```
- **Time-Authoritative Read Path (`GET /api/v1/home`):**
  - Evaluates current `now` timestamp directly in SQL:
    ```sql
    SELECT * FROM home_content
    WHERE status = 'Published'
      AND (publish_mode = 'immediate' OR start_at <= :now)
      AND (end_at IS NULL OR end_at > :now)
    ORDER BY version DESC LIMIT 1;
    ```
  - If 0 rows return (or on schedule expiry), automatically serves the default System Home (Template A with the church-wide earliest active event join).
- **Template A Fallback Resolution:**
  - If `featured_event_id` is null, past, or cancelled, SQL executes a single indexed join to find the earliest upcoming `Active` event across all `Active Listed` programs.
- **Template B Sanitizer & Image Protocol:**
  - Markdown parsed on Worker through strict allowlist: `<h2>`, `<h3>`, `<p>`, `<ul>`, `<ol>`, `<li>`, `<strong>`, `<em>`, `<a>` (with `rel="noopener noreferrer"` and `https://` or relative links).
  - External image URLs validated: must start with `https://` with valid image extension or host, and must include non-empty `alt` text.
- **5-Minute Cron Trigger:**
  - `wrangler.toml` configured with `[triggers] crons = ["*/5 * * * *"]`.
  - `scheduled()` handler scans for expired published versions (`end_at <= :now`), transitions status to `Archived`, and writes `HOME_CONTENT_EXPIRED` audit rows.
- **Concurrency Conflict Protection:**
  - `POST /api/v1/home/publish` requires `base_version`. If latest database `version != base_version`, returns HTTP 409 Conflict with `{ code: 'HOME_CONTENT_CONFLICT' }`. Client preserves draft state in inputs and displays top conflict banner.

### 9. Design Tokens & Impeccable Quality Standards
- **Color Suite (`web/app/globals.css`, `DESIGN.md`, `.impeccable/design.json`):**
  - Neutral Base: `--surface: #f4f5f3`, `--surface-raised: #ffffff`, `--line: #d6dcde`, `--line-strong: #aeb8bc`.
  - Typography: `--ink: #171a1d`, `--ink-muted: #59636a`.
  - Action Accent: `--accent: #9c302c`, `--accent-deep: #76231f` (hover/active only).
  - Focus Ring: `--focus: #176a87` (3px teal outline on `:focus-visible`).
  - Status Triad:
    - Positive / Enrolled: `--success: #2e6b37`, `--success-surface: #eef4ef`, `--success-border: #b9cfbe`.
    - Pending / Actionable: `--pending: #8a5b16`, `--pending-surface: #f3eee8`, `--pending-border: #c1ad95`.
    - Destructive / Error: `--error: #b3261e`, `--error-surface: #fbeeed`, `--error-border: #e5b4b0`.
- **Touch Targets & Geometry:**
  - Primary buttons: min-height 48px, border-radius 8px (`--radius-sm`).
  - All interactive controls: min-height/min-width ≥44px.
  - Zero color-only signaling: all status chips combine background tint + border + explicit Chinese text label.

### 10. API Contracts, Idempotency & Error Envelopes
- **Response Envelope:** All successful API endpoints return `{ requestId: string, data: T }` where `requestId` is a unique UUID/correlation string generated at the Worker boundary.
- **RFC 9457 Error Contract:** All error responses return RFC 9457 JSON payloads:
  ```json
  {
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "error": {
      "status": 409,
      "code": "HOME_CONTENT_CONFLICT",
      "message": "已有其他管理員發佈了較新版本。"
    }
  }
  ```
- **Idempotency & In-Flight Locks:**
  - All mutating `POST` and `PUT` requests require a client-generated `Idempotency-Key` header (`uuidv4()`).
  - Server-side deduplication checks the key to ensure duplicate network transmissions (e.g. cellular timeout retries) resolve as idempotent no-ops (`DUPLICATE`) rather than repeated mutations.
  - Interactive action buttons enter an immediate disabled state (`disabled`, `aria-busy="true"`) upon first tap to prevent double-tap submissions.
- **Observability & Logging:** Cloudflare Worker logs structured JSON payloads `{ requestId, path, error, actorId }` on unexpected errors without exposing internal stack traces in HTTP responses.

### 11. Component Architecture & Asset System
- **Decomposed Shared Primitives (`web/lib/management/`):**
  - `ManagementScreenHeader`: Standard header with back navigation, page title, and optional secondary action slots.
  - `StatusBadge`: Accessible status chip implementing the 3-way status triad (`--success*`, `--pending*`, `--error*`) with explicit high-contrast Chinese text.
  - `ConfirmReasonModal`: Reusable modal capturing mandatory audit explanation text with validation for attendance voids, cancellations, and guest corrections.
  - `SearchFilterBar`: Debounced search input paired with horizontal filter chips and an explicit empty-state fallback.
  - `ActionCluster`: Responsive action group (stacked buttons on phone <800px, horizontal row on desktop ≥800px).
- **Icon & Asset System:**
  - All icons are rendered via an inlined SVG `<symbol>` sprite system referenced via `<svg><use href="#i-..."/></svg>`.
  - Utilizes 1.8px monoline outline icons with zero external icon font downloads (0 KB network overhead on mobile connections).

---

## Testing Decisions

### 1. Verification Seams & Test Pyramid
- **Highest Primary Seam:** Playwright E2E test suite running against local `wrangler dev` on `127.0.0.1:8787` backed by disposable local D1 fixtures (`pnpm dev:local` + `pnpm db:seed:local` / `pnpm db:seed:demo`).
- **Secondary Seams:**
  - Cloudflare Worker integration tests (`web/test/`): Validates D1 migrations, SQL query plans, cron triggers, Markdown sanitizers, and HTTP status codes (200, 400, 401, 403, 404, 409, 422).
  - Component Unit Tests (`pnpm --dir web test:components`): Verifies isolated UI logic, A/B template switching, form validation, and copy constants.

### 2. Multi-Persona E2E Test Matrix
1. **Persona 1: Regular Member (`alice`):**
   - Renders 5-slot Participant Dock (`首頁 · 課程 · 掃描 · 通知 · 帳戶`).
   - Reads Home announcement, applies for a program, receives Pending state.
   - Performs self check-in via QR scan and manual code fallback.
   - Cannot see or invoke `管理` dock slot; direct access to `/management` returns 403 Forbidden.
2. **Persona 2: Program Leader / Door Volunteer (`bob`):**
   - Renders 5-slot Management Dock (`管理` in slot 4).
   - Enters Course Cockpit, views live check-in progress (`已簽到 x/y`), navigates to live Roster.
   - Performs assisted check-in (`代為簽到`) and attendance void with reason.
   - Approves pending enrollment requests for assigned program.
3. **Persona 3: Department Manager (`carol`):**
   - Renders Management Hub with department scope.
   - Manages Department Settings and module toggles.
   - Searches Member Directory (results scoped to department members only).
   - Creates new Draft programs parented under assigned department.
4. **Persona 4: System Administrator (`admin`):**
   - Full church-wide management authority.
   - Processes registration approvals queue (`M-24`, `M-25`), creating Active Member accounts.
   - Accesses Home Content CMS (`M-28` to `M-31`), authors Template A and B drafts, publishes immediate and scheduled announcements.
   - Verifies optimistic-concurrency conflict handling on simultaneous publish.

### 3. Responsive & Accessibility Assertions
- **Viewport Stress Testing:** Verified at 320px, 390px, and 1280px widths:
  - `scrollWidth <= innerWidth` asserted on every screen (zero horizontal overflow).
  - Fixed dock clearances asserted on phone viewports.
- **Accessibility:** Labeled inputs (`htmlFor`/`id`), ARIA attributes (`aria-current="page"`, `aria-busy="true"`, `role="dialog"`, `role="alert"`), keyboard `:focus-visible` outlines, and `prefers-reduced-motion` compliance.

---

## Out of Scope

1. **Custom Application Form Builder:** Dynamic custom form creation and schema generation remains roadmap scope under research issue `#188`.
2. **Admin-Initiated Password Reset in Member Directory:** Generating temporary passwords or resetting member credentials from the directory is deferred to dedicated issue `#227`.
3. **External Notification Delivery:** Email, SMS, WhatsApp, or mobile push notification delivery systems remain separate follow-up infrastructure projects.
4. **Arbitrary Dynamic Database Tables or Client Role Branching:** The client never branches permissions from string role names; server-side capability projection remains authoritative.
5. **Marketing Carousels or Commercial SaaS Fluff:** Decorative pastel gradients, hero image carousels, and commercial pricing tables are permanently excluded.

---

## Further Notes

### Relationship to Existing Repository Authority
- **Replaces & Supersedes:** Spec 079's transitional placeholders and Issue #228's unbuilt five-tab restructuring.
- **Builds Upon:** D1 Relational Schema (Spec 080), Staff Role Boundary (ADR-0025), Department Modules (ADR-0026), Atomic Approval (ADR-0027), and Local-First E2E Testing (ADR-0029).

### Stacked PR Decomposition Plan
To ensure low-risk, deterministic delivery, implementation is decomposed into 5 reviewable stacked PRs:

```
PR 1: Shell & Tokens Foundation
├── globals.css tokens (--pending triad)
├── 5-slot bottom dock (Participant vs Management personas)
├── Desktop side rail (≥920px)
└── AppShell neutral skeleton hydration & legacy route redirects

PR 2: Universal Attention Center & Notifications
├── programs-attention-center.tsx (待處理 + 通知)
├── Actionable count badge & manual priority chip UI
├── Notification read-state batch sync
└── Account Subscriptions D1 table (0011_account_subscriptions.sql)

PR 3: Course Cockpit & Operational Roster
├── ProgramWorkspace status-first layout (下一聚會 card, 2-up tiles)
├── Live check-in progress (已簽到 x/y) & attendance roster
├── Assisted check-in modal & attendance void/correction with reason
└── Printable check-in sheet (M-22, masked phone numbers)

PR 4: Management Hub & Department Operations
├── ManagementHub directory (會員與權限, 事工營運, 內容與系統)
├── Department Settings panel (5 module toggles, DM picker, 建立課程)
├── Registration Approvals queue (M-24, M-25)
└── Scoped Member Directory (M-27) & Account Permissions read-only view (M-26)

PR 5: Home Content CMS & Cron Worker
├── D1 schema migration (0010_home_content_cms.sql)
├── Cloudflare 5-min scheduled cron handler (*/5 * * * *)
├── Home editor (Templates A & B, Markdown sanitizer, external image validation)
├── Phone preview (M-30), publish scheduling, conflict banner, & audit log (M-31)
└── Final Impeccable UI polish pass & multi-persona Playwright E2E suite
```
