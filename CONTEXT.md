# 顯恩堂系統 — EFCC Church Management System

**Church**: Evangelical Free Church of China — Glorious Grace Church (播道會顯恩堂) **Repository**: `efcc` **Stack**: staged migration from Google Apps Script + Google Sheets to Cloudflare Worker + D1. The Worker/D1 stack is the eventual platform owner; Apps Script/Sheets remains the transitional domain backend while programs, events, attendance, enrollments, and related operations migrate. **Platform status**: the repository restarted on D1 (ADR-0024) — D1 owns identity, credentials, sessions, login, registration, and approval today; the Apps Script/Sheets backend is historical and remains only as the transitional domain backend. **Frontend archive**: retired frontends — `程式碼.js` (reference), the React SPA (`src/frontend/`), and the T00–T07 `gas-vertical-slice-v1` attempt (issues #41–48, superseded by ADR-0010) — are no longer in the tree; their content lives in git history **Runtime**: Cloudflare Worker + D1 (identity/auth), Apps Script + Google Sheets (transitional domain backend), Browser (client)

---

## Domain Glossary

Terms marked **(legacy)** or **(retired)** describe the historical Apps Script/Sheets surface that the Worker/D1 platform replaced; they are retained for domain rationale and reading old records, not as current implementation targets.

| Term (English) | Term (Chinese) | Definition |
| --- | --- | --- |
| Member (legacy) | 會員 | A church member with an immutable User_ID, mutable unique login username, PIN/password credential, QR code, role, and status (`Active`/`Pending`/`Inactive`). `Pending` members cannot log in until a `Staff`/`Admin` approves them — see ADR-0006. On D1, identity is in the `accounts` table; the `Users` sheet remains the member-record source while transitional. |
| Role | 角色權限 | Global user permission level stored in the `System_Role` column of the `Users` sheet (legacy) or the D1 `accounts` global role. The canonical values are **`Admin`**, **`Staff`**, and **`Member`** (default when empty). One account has exactly one global Role. The D1 schema and auth/API contract currently contain the older `Teacher` spelling and require a migration before deployment; `STAFF` is the normalized code representation of the canonical `Staff` value. **Program Leader** and **Department Manager** are scoped effective-access profiles, not global Role values. |
| Department | 事工區 / 部門 | A user-extensible ministry area that groups Programs and their scoped capabilities. Initial records are `青區` (`Active`), `成區` (`PendingDevelopment`), and `兒區` (`PendingDevelopment`); permitted users may create additional Departments and configure their details without changing global Roles. |
| Department Modules | 部門模組 | The complete approved set of product-owned modules for a Department, such as Program Catalog, Enrollment, Events, Attendance, and future Custom Forms. Each module has an explicit enabled or disabled state, seeded disabled at Department creation; disabling preserves records and history while hiding or blocking new module operations. Permitted users may compose existing modules; they cannot create executable modules, arbitrary D1 tables, or new authorization rules from the UI. |
| Active Account | 生效帳戶 | An account with `account_status` `Active` — the only accounts that may log in, be selected in member search, or be granted scoped authority such as Program Leader. `Pending` and `Suspended` accounts are excluded and their assignment is rejected with a validation error. |
| Enrollment Approval | 核准報名 | The decision that turns a Pending Enrollment Request into an active Program Enrollment. It is one atomic action: request decision and enrollment creation commit together, and the Enrollment row — not the request status — is the terminal evidence of approval. The two halves never split apart, so an Approved request without an Enrollment cannot exist. |
| Audit Outcome | 稽核結果 | The recorded result of a privileged mutation: `SUCCESS`, `DUPLICATE` (same-actor repeat reaching a terminal state — quiet no-op), `CONFLICT` (a different actor reached the terminal state first), `DENIED`, or `FAILED`. Every terminal outcome writes one audit row. The D1 programs domain uses the same vocabulary as the legacy backend (ADR-0023). |
| Schedule Rule | 時間表規則 | An editable recurrence pattern owned by a Recurring Program that produces its Events, kept as an additive/secondary bulk-generation capability alongside manual one-at-a-time Event creation (the prototype-primary path, ADR-0032). Generating Events from rules is an audited run with created/skipped counts; generating when no rule exists is invalid. |
| Activity Category | 活動類別 | A user-configurable descriptive category for a Program, such as Worship, Bible Study, Fellowship, Youth Ministry, Children’s Ministry, Outreach, Retreat/Camp, Seasonal Activity, or Pastoral Group. Categories do not change authorization or scheduling behavior. |
| Program | 課程 / 事工 | A modular activity container under one Department that Members can discover and enroll in (e.g. 青崇). A Program has a descriptive Activity Category, a behavior type of `Recurring` or `OneOff`, lifecycle state (`Draft`, `Active`, `Archived`) with the valid progression `Draft` → `Active` → `Archived`, independent discoverability (`Listed`, `Unlisted`), and enrollment mode (`MemberRequest`, `ManagerOnly`). `MemberRequest` creates a Pending request requiring approval; `ManagerOnly` permits only authorized managers to add Members directly. Enrollment-mode changes govern future submissions and do not rewrite request or enrollment history. Permitted users may add and edit Programs within their effective scope. The distinct vocabulary for a time-bounded yearly/seasonal run remains open in history research #189 so long-term records do not become ambiguous. |
| Program Detail | 課程詳情 | The management surface for one Program and its scoped relationships: active Program Leaders, enrollment requests and decisions, enrollments, related Events, and Program-scoped capabilities. A scoped Program Leader may manage the content and operations of that Program, including enrollment decisions, but cannot configure its Department or delegate authority. Program management approval is required before a Member self-enrollment becomes active. It does not edit global account Roles or the global Role Permission Policy. |
| Enrollment Request | 報名申請 | A Member's request to join a Program. It is a separate historical record with `Pending`, `Approved`, `Rejected`, or `Withdrawn` state. Approval creates an Active Enrollment; direct ManagerOnly enrollment creates an Enrollment without a fake request. |
| Program Enrollment | 報名 | The active or historically cancelled Member–Program relationship created by approval or authorized direct enrollment. It is separate from an Enrollment Request; cancellation is soft, audited, and re-enrollment creates a new relationship record. Discoverability controls catalogue visibility, not authorization. Legacy Enrollments rows retain the transitional Active/Cancelled shape until migration. |
| Assisted Enrollment (legacy) | 代為報名 | The current Apps Script path for a privileged enrollment change performed in the Programs Section for another active Member; it currently adds an Active row directly. Under the reopened #184 decision, approval authority is capability-based: any active actor whose effective policy grants the required management/approval capability for that specific Program may approve or perform the permitted enrollment action. Staff/Admin broad grants and Program Leader scoped grants are examples, not a hard-coded allowlist. Scanner never changes enrollment. |
| Program Leader | 事工負責人 | A member granted `program.manage` and `program.publish` for one or more specific Programs, tracked in the `Program_Leaders` relationship under the Program domain. A Program Leader may manage that Program's content, schedules, events, enrollment decisions, and publishing, but cannot configure the Department, assign or revoke leaders, or widen their own scope unless separately granted. A Program Leader is always an Active Account at assignment time. Independent of the member's global `Role`; it belongs in the Program detail/management model, not the account Role column. The frontend identifies this profile only through server-projected effective access and scope. |
| Department Manager | 事工區管理者 | A scoped effective-access profile for an Active Account with management authority over one or more Departments. A Department Manager may operate the permitted Programs and enabled modules within that Department, but cannot act outside the returned Department scope or widen its own authority unless separately granted. It is not a global `Role`; the server projects its effective capabilities and scope to the browser. |
| Program Delegation | 事工權限委派 | The explicit capability-gated assignment or revocation of Department managers, Program managers, or Program Leaders. Content management does not imply delegation; every delegation change is scoped, server-authorized, and audited. |
| Programs Entry Boundary | 課程入口邊界 | The first authenticated Programs experience: every account starts in Participant mode, while an account with relevant scoped management capability may deliberately enter a minimal Management boundary. This boundary exposes no operational management data; the Directory and Management Workspace are separate downstream experiences. |
| Custom Application Form | 自訂申請表 | A future modular form definition that a permitted user can create, version, publish, and attach to a Department, Program, or activity. It is roadmap scope only; its schema, permissions, responses, and integrations require a separate research and specification ticket. |
| Event | 聚會 | One dated occurrence belonging to exactly one Program. Both `Recurring` and `OneOff` Programs may own Events. Recurring Events are produced from editable schedule rules with per-occurrence exceptions; OneOff Events are manually added by permitted users. Attendance records target this concrete Event. Once active Attendance exists, its schedule cannot be rescheduled; a new Event preserves the original attendance history. |
| Recurrence Tag | 重複標記 | Informational Event metadata (`NONE`, `WEEKLY`, or `MONTHLY`) describing an expected schedule pattern. It does not create, link, update, or cancel any other Event. |
| Event Cancellation | 聚會取消 | A soft status change from Active to Cancelled. It never deletes the Event or Attendance history and is rejected once active Attendance exists. |
| Attendance | 出席 | A member or visitor checking in at a specific Event instance. Recorded via **Self Check-In** (logged-in user scans or types the check-in token), **Assisted Check-In** (authorized leader scans or searches for a member), or **Guest Check-In** (an unlinked guest attendance, optionally submitted by an authenticated actor). |
| Attendance Void | 出席作廢 | A correction that changes an active Attendance record to `Voided` without deleting it. It requires an authorized actor and reason, is audited, leaves history intact, and permits a later new member or guest check-in for the same Event. |
| Guest Attendance Correction | 訪客出席更正 | A correction by Admin/Staff or the active Program Leader for that Event's Program to a guest Attendance's name or phone. It preserves the attendance row, records old/new values and a reason in audit history, and does not change the Event or check-in time. |
| Self Check-In | 自助簽到 | Any logged-in user opens the Check-In page, scans the Program Check-In QR with the app scanner, or types the Event Manual Check-In Code. The server resolves the token to the Program's current Event and records attendance only if the user is actively enrolled and the Event Check-In Window is open. |
| Assisted Check-In | 協助簽到 | An authorized actor (Staff, Admin, or active Program Leader) recording attendance for a member from the Event detail page by scanning the Member's QR or using manual search. The scanner is scoped to one specific Event. |
| Guest Check-In | 訪客簽到 | A visitor, or an account holder explicitly choosing guest mode, checks in through the public Guest Check-In Entry by scanning the Program QR or typing the Event Manual Code, then enters a name and required phone number. The attendance record is not linked to an `accounts` row; an authenticated actor may still be retained in `checked_in_by` and audit history. A normalized phone may create at most one active guest attendance for the same Event. Full guest contact details are visible only to Admin/Staff and the relevant Program Leader. |
| Guest Check-In Entry | 訪客簽到入口 | The public attendance entry available from the signed-out login surface or a Program Check-In QR deep link. It does not issue a Session. An authenticated account may explicitly choose this mode, but a later authenticated Self Check-In remains a separate attendance record; the system never auto-merges the two records. |
| Program Check-In Token | 課程簽到令牌 | A permanent, public, program-scoped token assigned to an Active Program. It is used to build the Program Check-In QR URL and the Check-In page deep link. It is never the opaque D1 `program_id`. |
| Program Check-In QR | 課程簽到 QR 碼 | A printable/downloadable QR code containing the Program Check-In Token URL. It is stable for the life of the Program and may be printed as the permanent venue marker. At scan time it resolves directly when one Event Check-In Window is open; if multiple Events are open, it presents an Event chooser. It is not a secret. |
| Event Manual Check-In Code | 聚會手動簽到碼 | A short, globally unique, never-reused code assigned to one Event (e.g. `A7B9C2`) and shown digitally by the Event page or leader device rather than treated as permanent printed material. Members or guests can type it into the Check-In page when scanning fails. It resolves to exactly that Event but is valid only while that Event's Check-In Window is open; cancellation invalidates it immediately, while rescheduling the same Event keeps the code and moves the window. |
| Event Check-In Sheet | 聚會簽到單 | A fresh printable/downloadable Event-specific sheet containing the permanent Program Check-In QR and the current Event Manual Check-In Code. Program/Event managers may generate it; it must not be treated as reusable after the Event is cancelled or its schedule changes. |
| Event Check-In Window | 聚會簽到時段 | The time interval during which Self Check-In and Guest Check-In are accepted for an Event. Derived from the Program's window configuration and the Event's `starts_at`/`ends_at`. No check-in is accepted when no active Event has an open window. |
| Current Event (for check-in) | 當前簽到聚會 | An active, non-cancelled Event of a Program whose Event Check-In Window includes the current time. The Program Check-In Token resolves directly when exactly one exists; when multiple exist, the Program QR presents those Events for explicit selection. |
| QR Code (Member QR) | 會員 QR 碼 | The member's personal check-in identifier, historically the same value as `User_ID` by default. It is displayed on the member's phone (usually in the Profile or a dedicated "My QR" view) for leaders to scan during Assisted Check-In. It is not a secret — identity and authorization are resolved server-side. |
| Login Username | 登入用戶名稱 | The mutable login identifier displayed to and chosen by an account holder. It may change without changing the established User_ID or QR identity. D1 stores the display value plus a trimmed, lowercased `username_normalized` key; that normalized key is unique across active accounts and registration reservations, including concurrent changes. A username change revokes all refresh sessions and requires sign-in again. |
| Password Credential | 密碼憑證 | The current user-selected login secret after legacy upgrade or new registration. Only a salted PBKDF2 hash is stored. A normal self-service password change requires the current password, revokes all refresh sessions, requires sign-in again, and never changes User_ID. |
| PIN (legacy) | PIN 碼 | 4-digit numeric credential used with username for member login on the legacy Apps Script surface; in D1 it survives only as the one-time migration proof. |
| Legacy-PIN upgrade | 舊 PIN 升級 | A one-time identity-proof step for an imported D1 account using a strictly four-digit source PIN and username: five failed verifications trigger a 5-minute lock, five more trigger a 15-minute lock, and the next failure requires Admin/Staff unlock; successful upgrade replaces it with an 8-character-minimum password and clears the legacy proof before a Session is issued. Users without a legacy PIN are not forced through this transition; new registrations and password accounts do not require a PIN. |
| Section | 功能區 | A navigable church-management capability available after authentication, currently Profile, Home, Programs, Notices, Messages, 掃描 (self check-in), Account, and management surfaces reached from the 管理 dock. The D1 `/scanner` surface is available to every authenticated account; server enrollment and event-window checks authorize the mutation, while assisted check-in lives on the Event detail page. Use **Section** instead of the ambiguous product terms “page” or “screen”; legacy implementation files may still use `.html` fragment names. |
| Origin-aware Back Navigation | 按來源返回 | A detail Section's return action restores the valid Section that opened it (such as Home, Programs, Notices, or Messages) and falls back to Programs when the origin is unavailable or invalid; it must not assume a fixed tab. |
| Notices Section | 通知功能區 | The authenticated `/notices` surface listing meeting, enrollment, and account-related messages with read-state persistence and deep links into Program detail, Event detail, or Account. |
| Management Hub | 管理工作中心 | The capability-filtered management directory opened from the 管理 dock slot, grouping church-wide admin tasks such as registration approvals, permissions, member directory, and home content editing. |
| Home Content CMS | 首頁內容管理 | The church-wide Home Content editor where authorized staff configure Template A featured events or Template B announcements before explicit publish or scheduled HK-time release. |
| Home Explore | 首頁探索 | The authenticated Home Section at `/home` that presents discoverable Programs and links Members into the Programs Section to inspect or join a Program. |
| Participant Responsive Contract | 參與者響應契約 | The visual and interaction contract that keeps participant Sections usable from narrow phones through desktop: the Shared Shell has one established mobile/desktop transition, while Section content adapts fluidly without device-specific layouts or export-only geometry overriding accessibility and operational clarity. |
| Visual Hardening Matrix | 視覺強化矩陣 | The complete inventory of visual and state hardening proposals, each classified as Implemented, Selected for prototype exploration, Deferred, Rejected, or Evidence-blocked with a reason and observable acceptance condition. Independent tags such as `optional` record scope without changing status. Classification records product intent; it does not by itself authorize production implementation. |
| S2 Integration Addendum | S2 整合附錄 | A child spec under the accepted S2 buildable spec that supersedes conflicting participant presentation rules while preserving the parent scope and historical decision record. It is the active implementation authority for the named conflict set. |
| Presentation Contract | 呈現契約 | The observable participant rule for content grouping, visibility, ordering, responsive limits, labels, and actions. A presentation contract must not weaken server authorization or silently change Domain Backend ownership. |
| Product Contract Precedence | 產品契約優先 | The decision rule that authentication, authorization, route/state behavior, accessibility, responsive usability, and shared design tokens outrank literal values copied from a static design export when the two conflict. |
| Participant Enrollment Summary | 參與者報名摘要 | The Member-facing Program Detail signal for the latest enrollment/request state and date. It is intentionally a summary rather than a full lifecycle timeline; complete member-by-member enrollment history, including decision notes, belongs to the Manager Workspace. |
| Upcoming Event Set | 未來聚會集合 | The Program Detail participant view of active, future Events ordered by start time, capped at four on phone-width layouts and eight on desktop-width layouts. It is distinct from the single Event Detail surface and excludes historical, cancelled, or past Events in the current product contract. |
| Self Check-In Availability | 自助簽到可用 | The load-time, server-derived signal that an actively enrolled Member may self-check in to an Active Event whose check-in window is open. It excludes management capability and is only a participant affordance; Event Detail and the Worker remain authoritative at action time. |
| Event Lifecycle Visibility | 聚會生命週期顯示 | An optional future participant feature for exposing cancelled or rescheduled Events in the Upcoming Event Set with explicit lifecycle copy and status treatment. It is a separate ticket, not part of the current active-only participant contract. |
| Event Availability Projection | 聚會可用狀態投影 | The server-authoritative participant signal that an Event can currently accept attendance. It may be shown as a compact `可簽到` label; it does not change the Event lifecycle or expose cancelled/rescheduled Events. |
| Responsive Upcoming Event Cap | 響應式未來聚會上限 | The participant presentation limit of four active future Events on phone-width layouts and eight on desktop-width layouts. It limits what is shown, not what the Domain Backend generates or authorizes. |
| Single Movable Enrollment Action | 單一可移動報名操作 | The one Member enrollment mutation control for the current lifecycle state. Its presentation may remain inline or use the existing sticky action bar, but the product exposes one control and one state/focus owner. |
| Enrollment-gated Event Advisory | 報名限制聚會提示 | A Member-facing explanation shown only when a requestable Program has a visible Event whose detail is gated by enrollment; it never reveals unauthorized Event facts or promises access for ManagerOnly or archived Programs. |
| Auth Surface | 身份驗證介面 | A signed-out or identity-transition area that handles Login, Legacy-PIN upgrade, self-service Registration, or Approval. An Auth Surface is not a Section because it does not represent an authenticated church-management capability. |
| Shared Shell | 共用外殼 | The single authenticated application layout and navigation that surrounds every Section for every account — it never swaps to a second, role-selected shell (ADR-0033). It owns shared header, responsive navigation, active Section indication, focus behavior, and recoverable shell states. Only specific components vary by capability within this one shell: the dock/rail's slot 4 (`通知` vs `管理`, per server-projected `bootstrap.navigation`) and the header's actor+role+Notices-bell (management-capable accounts only, bell omitted if Notices is unauthorized). The Management Hub and its downstream screens (Course Cockpit, Approvals, Departments, Home CMS, Permissions, Settings) are a separate downstream experience reached by navigating into the Hub, not a parallel top-level shell; leaving the Hub returns to this same shell. It is not itself a Section. |
| Minimal Product Design | 極簡產品設計 | The shared frontend design contract for EFCC's Auth Surfaces, Shared Shell, and Sections: official church identity, direct operational clarity, Cantonese-first copy, phone-first ministry workflows, desktop management density, and restrained civic visual language. |
| Permission Policy | 權限政策 | The configurable mapping from a global Role (`Admin`, `Staff`, or `Member`) and any scoped Program Leader grant to the effective capabilities and Sections that actor may see or use. Policy editing follows the hierarchy `Admin > Staff > Member`: Admin may edit Admin, Staff, and Member policies; Staff may edit Member policy; Member may edit none. Admin-policy edits must preserve at least one Admin policy editor. Within a Department/Program scope, `program.manage` includes `enrollment.approve` for that same scope unless a narrower policy explicitly governs the action. The browser may use server-projected effective capabilities to shape affordances, but server authorization remains authoritative. A lower Role cannot edit its own or a higher Role's policy, and policy changes must not bypass server authorization or silently change an account's global Role. |
| Scanner Section | 掃描功能區 | The D1 self-check-in surface at `/scanner`, labelled **掃描** in the dock and page header, where any authenticated account resolves its enrolled-event attendance by camera scan or by typing an Event Manual Check-In Code. The Worker owns enrollment and check-in-window authorization; assisted check-in lives on the Event detail page. Camera capture and QR decode run in-page on the application's own origin — there is no external scanner window. |
| QR Decode Capability | QR 解碼能力 | The guarantee that camera QR scanning is available on every supported browser. Where the platform provides a native Barcode Detection API the app uses it directly; where it does not — WebKit and Firefox, and therefore every iOS device — the app lazily loads a same-origin WebAssembly decoder instead. The decoder is never fetched from a third-party origin, and it is never downloaded by a browser with native support. Typing an Event Manual Check-In Code remains an equal peer to scanning, not a fallback. |
| Guest Completion State | 訪客簽到完成狀態 | The terminal confirmation a visitor sees after a successful or duplicate Guest Check-In: an explicit completion screen, not only a live-region announcement. It is an in-flow state of the public Guest Check-In Entry, never a separately addressable route, and it exposes no attendance identifier. |
| Section Link (legacy) | 功能區連結 | A bookmarkable URL hash that restores one Section after authentication. In v1 it identifies only the Section and never exposes member IDs, event IDs, QR values, credentials, or session tokens. |
| Session | 登入工作階段 | A server-validated authenticated period for one Member. A Member may hold multiple independent Sessions across devices; revoking one Session does not revoke the others. On D1 each login creates an independent Session row (ADR-0020). |
| Local Demo Session | 本機示範工作階段 | A development-only walkthrough session created from the local E2E/demo fixtures. It has a real server-issued credential only inside local D1, has no production authority, and must never be presented as a production account. |
| Production Session | 生產工作階段 | A Worker/D1 cookie-validated authenticated session with server-issued identity and authorization. It is the only session type accepted by the deployed application. Avoid calling it a demo account or local login. |
| Merge-ready | 可合併 | A branch state whose scoped implementation, review findings, deterministic checks, and acceptance evidence are complete enough for the declared stacked merge order. It is not deployment readiness. |
| Release-ready | 可發布 | A merge-ready state that additionally passes the relevant local `wrangler dev` + D1 E2E gate. An optional operator-run deployed smoke records infrastructure evidence but is not required for repository `READY`. |
| Draft (legacy) | 草稿 | Unsaved form input preserved temporarily within the current browser tab. A Draft is not a submitted Event or server record and is cleared after successful submission, explicit discard, logout, or expiry of its owning tab. |
| Church Time | 教會時間 | All EFCC schedules and user-facing timestamps are interpreted and displayed in `Asia/Hong_Kong`. Date-only values use the Hong Kong calendar and times use the 24-hour clock. |
| Storage State (retired) | 儲存狀態 | Historical Playwright snapshot of a signed-in Google/Apps Script browser session from ADR-0012. The deployed `/exec` suite and its storage-state capture flow are retired; retained documents describe the historical mechanism only. |
| Identity Authority | 身份權威 | The system that owns member identity, credentials, sessions, and authentication decisions. During the staged migration, Cloudflare D1 is the Identity Authority (ADR-0020). |
| Domain Backend (legacy) | 領域後端 | The system that owns church-management records and business operations such as Programs, Events, Attendance, and Enrollments. Apps Script + Google Sheets is the transitional Domain Backend. |
| Staged Migration | 分階段遷移 | The selected migration strategy: move ownership capability by capability to the Worker/D1 platform while keeping the existing Apps Script/Sheets Domain Backend operational until each capability has a replacement and acceptance proof. |
| Feature State | 功能狀態 | The current delivery state of a capability: Complete, In progress, Planned, or Transitional. Feature State describes what is true now, not the intended future architecture. |
| Target Owner | 目標擁有者 | The platform that is intended to own a capability after the staged migration: Worker + D1 or Apps Script + Google Sheets while the capability remains transitional. |
| dev-testing worker |  | Standing optional Cloudflare Worker (`efcc-dev-testing.efcc-ggc.workers.dev`, D1 `efcc-dev-testing`) serving the current stack; local `wrangler dev` is the default E2E target. |
| E2E acceptance |  | Required Playwright run against local `wrangler dev` + local D1 asserting observable DOM state and same-origin server responses. A reserved deployed Worker run is optional operational evidence. |
| Demo seed | 示範種子資料 | Idempotent local-only `E2E_DEMO_` department/program dataset created by `pnpm db:seed:demo`; it includes one recurring program with generated events and never writes a production database. |
| Audit Event | 審計記錄 | One immutable, append-only relational record of a domain mutation on D1: actor, action, entity type and id, old/new value snapshots, reason, outcome, and correlation id. It is the D1 successor to the legacy Sheet `Audit_Log` (ADR-0023) but rebuilt generically: one stream covers Department, Program, Enrollment, Event, and Attendance actions, with no per-entity columns. Rows can never be updated or deleted. |
| Department Lifecycle | 部門狀態 | The editorial state of a Department, distinct from Program lifecycle: `Draft`, `PendingDevelopment`, `Active`, or `Archived`. Publishing a Department to `Active` is a separate capability-gated action. |

---

## Data Store (Google Sheets)

**Legacy reference:** [ADR-0013: Google Sheets Database Structure](docs/adr/0013-google-sheets-database-structure.md) —
this document remains the canonical, version-controlled description of the legacy
Sheet tabs, column names, column positions, and valid values. The summary below is
for reference; ADR-0013 governs when they conflict. Under the reopened Issue #184
decision, the new D1 Programs/Enrollment domain starts from an empty baseline with
no legacy domain import. The Sheet is out-of-band historical reference only; it is
not a D1 adapter or dual-write target for the new domain.

A single Google Spreadsheet with these named sheets:

| Sheet | Purpose | Key Columns |
| --- | --- | --- |
| `Users` | Member & Staff records | See [Users sheet structure](#users-sheet) below — 13 columns, resolved by header name |
| `Programs` | Program catalog | Program_ID, Program_Name, Type, Description |
| `Enrollments` | Program membership | Enrollment_ID, User_ID, Program_ID, Timestamp, Status |
| `Events` | Scheduled instances | Event_ID, Program_ID, Event_Date, Time_Slot, Event_Name |
| `Attendances` | Check-in records | Attendance_ID, Event_ID, User_ID, CheckIn_Time, CheckIn_Method, CheckIn_By, Status |
| `Program_Leaders` | Per-program leader assignments (ADR-0006) | Assignment_ID, Program_ID, User_ID, Assigned_By, Assigned_Date, Status |
| `Audit_Log` | Privileged-mutation and attendance audit trail (ADR-0023, additive, not yet in production xlsx) | Log_ID, Timestamp, Actor_User_ID, Action_Type, Target_User_ID, Target_Program_ID, Target_Event_ID, Old_Value, New_Value, Reason, Outcome, Correlation_ID |

### Users sheet

The production `Users` sheet (as exported from the church spreadsheet) has the following header row, in this order:

```
User_ID | Username | Name | Email | Phone | Date of Birth | Age | PIN_Code | QR_Code_String | System_Role | Status | Whatsapp Message | 青崇？
```

**Key implementation notes:**

- The role column is named **`System_Role`**, not `Role`. The repository handles both (`["Role", "System_Role"]` candidates in `users-repository.gs`), but the canonical production header is `System_Role`.
 - **Canonical `System_Role` values**: `Admin`, `Staff`, `Member`. Existing D1 SQL/auth code still uses the older `Teacher` spelling and must migrate it to `Staff` before deployment. When empty or unrecognized, the transitional import defaults to `MEMBER`.
- Extra columns (`Email`, `Date of Birth`, `Age`, `Whatsapp Message`, `青崇？`) exist in the production sheet but are **not read** by the application. They do not interfere — `usersResolveColumns_` matches only the 8 logical fields by header name.
- When `Status` is empty, the user **cannot log in** — the login flow requires `String(status).toLowerCase() === "active"`.
- Column order is **not fixed** — `usersResolveColumns_` matches by header name (case-insensitive). Adding, removing, or reordering columns does not break the resolver as long as the 8 logical field headers are present.
- `QR_Code_String` defaults to the `User_ID` when empty (the QR code is the same as the user ID).

See ADR-0001 for the rationale behind Google Sheets as the database layer.

---

## D1 Relational Schema

The authoritative D1 relational schema (identity, authorization, Departments,
Programs, Events, EnrollmentRequests, Enrollments, Program Leaders, Attendances,
and the rebuilt audit stream) is defined in
[`docs/specs/080-d1-relational-schema.md`](docs/specs/080-d1-relational-schema.md),
parented to Spec #190. It supersedes the identity-tables portion of
`web/migrations/0000_init.sql` going forward and is the source that PRG-01 turns
into the next D1 migration.

- **Development database**: the same D1 database is used for development as for
  production unless a concrete need to split appears. The new Programs/Enrollment
  domain starts **fresh from the latest `main` branch database** — no xlsx import,
  no legacy Sheet adapter, no dual-write path.
- **Timestamps**: ISO-8601 UTC TEXT for all new domain tables. The existing
  identity tables (`0000_init.sql`) still use epoch-millis INTEGER; converting them
  is a separate table-rebuild migration, so a dual-format transitional state
  exists until then. Dates display in `Asia/Hong_Kong` (see Church Time).
- **Foreign keys**: `ON DELETE RESTRICT` everywhere. D1 enforces foreign keys by
  default (equivalent to `PRAGMA foreign_keys = on` per transaction) — no
  per-connection pragma is required.
- **Constrained values**: every closed vocabulary (lifecycle, status, mode,
  outcome, recurrence) is enforced with a CHECK constraint.

---

## Codebase Extensibility

The expandable Department model is implemented through deep modules, not a generic runtime plugin engine.

- `DepartmentWorkspace` is the domain module with a small Interface for inspection and command execution. Its Implementation owns Department/Program/module lifecycle, scope checks, enrollment approval, direct-active assisted enrollment, audit, and transaction invariants.
- `CapabilityAuthorizer` is the authorization seam. Every protected operation resolves the actor's effective global-role policy and Department/Program scope through this Interface; browser visibility is never authority.
- `WorkspaceStore` is the persistence seam. Production uses a D1 Adapter; tests use an in-memory or test-D1 Adapter. The new domain has no Sheet Adapter and no dual-write path.
- A code-owned module registry defines approved modules such as Program Catalog, Enrollment, Events, Attendance, and future Custom Forms. Permitted users configure existing modules; they cannot create executable modules, arbitrary D1 tables, or new authorization rules from the UI.
- Worker HTTP routes and browser pages remain thin Adapters around the domain module. Tests cross the same Interfaces as production callers for leverage and locality.

## Platform Ownership

The staged migration completed: the repository runs on Worker/D1.

- **Cloudflare Worker + D1** is the Identity Authority and the Domain Backend. PR #166 established the identity/auth boundary and the authenticated static web shell; since ADR-0024 the repository restarted on D1. Programs, Events, Attendance, and Enrollments are Worker/D1-native (`/api/v1/programs/*`, `/api/v1/attendance*`), with no legacy Sheet adapter and no dual-write path.
- **Apps Script + Google Sheets** is **retired**. `src/gas/`, `tests/gas/`, the clasp configuration, and the transitional `/api/v1/rpc` proxy were removed; the browser talks only to Worker/D1.

The feature roadmap in [`README.md`](README.md#feature-roadmap) records the current Feature State and Target Owner for each capability.

---

## Retired Apps Script Architecture (`src/gas/`)

The Apps Script + Google Sheets backend is **retired**. `src/gas/`, its
VM-harness tests (`tests/gas/`), the clasp configuration (`.clasp.json`,
`.claspignore`), and the Worker's transitional `/api/v1/rpc` proxy were
removed once every capability had a Worker/D1 replacement and no live caller
remained. Git history retains the legacy source; the D1-era ADRs
(0017–0031) and the Apps Script-era ADRs (0001–0016, read for rationale and
surviving domain rules) document the decisions that replaced it.

### Testing & deployment quick reference

- `pnpm typecheck` — Runs TypeScript compiler (`tsc --noEmit`) sequentially across root `tsconfig.json` and `tests/e2e/tsconfig.json` (ADR-0014).
- `pnpm test` — Vitest over `tests/prototype`.
- `pnpm --dir web test` — Vitest in the real Cloudflare workerd pool for the D1 cookie-only Worker/auth boundary, D1 migrations, sessions, lockout, programs, attendance, and client contracts.
- `pnpm dev:local` — builds the Next static export, applies local D1 migrations, and starts `wrangler dev` on `127.0.0.1:8787`.
- `pnpm db:seed:local` — seeds disposable local `E2E_` accounts, including the resettable legacy-PIN auth fixture.
- `pnpm db:seed:demo` — seeds the local `E2E_DEMO_` department, programs, and generated recurring events.
- `pnpm exec playwright test -c tests/e2e/<relevant-config>.ts` — required local browser acceptance run for the changed capability.
- `pnpm exec playwright test -c tests/e2e/auth-d1.config.ts` — local cookie/auth smoke by default; set the five `AUTH_*` values only when targeting an optional deployed Worker.
- `.husky/pre-commit` — Runs `lint-staged` (formatting/linting) followed by `pnpm typecheck` on every commit (ADR-0014).
- GitHub Actions (`.github/workflows/`) — `precheck.yml` is the deterministic typecheck/unit/component/static-shell gate; `e2e.yml` runs the rebuilt D1 auth contract on pushes/PRs and exposes optional deployed D1 Playwright smoke only through `workflow_dispatch` (ADR-0029).
- Full step-by-step workflow: [`CONTRIBUTING.md`](CONTRIBUTING.md) for clone/install/branching, plus `README.md` sections "Build and run the web Worker locally" and "Deploy the isolated Worker".

---

## Architecture Decisions

The repository restarted on D1 (ADR-0024) and the staged migration completed (ADR-0022 phase 4). The table is grouped into two eras: the **D1 era** (current platform, 0017–0031) and the **Apps Script era** (historical, 0001–0016). Per-ADR status records what each decision still means — a decision can be a *live domain basis* (its rule survives, its Apps Script mechanism superseded) or *superseded* (mechanism gone).

### D1 era (current)

| #    | Title                                         | Status   |
| ---- | --------------------------------------------- | -------- |
| 0017 | Frontend Repository, Rendering, and Cloudflare Deployment Boundary | Proposed — decision locked via grilling on #127; local implementation checks are the default gate under ADR-0029, while deployed Cloudflare proof remains optional infrastructure evidence |
| 0018 | Frontend HTTP Boundary, Authentication, and API Contract | Accepted — implemented; the legacy `/api/v1/rpc` Apps Script proxy it described was removed with the GAS retirement |
| 0019 | Permissions and Program Leadership HTTP Contract (CF2 / #133) | Proposed — decision locked via grilling; downstream verification belongs to CF2 implementation |
| 0020 | Cloudflare D1 Identity, Session, and Auth Boundary (Map #158) | Accepted — local/preview proof in AUTH-01/AUTH-02, optional deployed smoke remains operational evidence for the map goal |
| 0021 | D1 → Sheets Identity-Metadata Review Mirror (AUTH-03 / #161) | Deferred — optional and not authorized for the current PR; revisit only after separate operator confirmation |
| 0022 | Staged Worker/D1 Platform Migration | Accepted — complete; the legacy Apps Script domain backend, `/api/v1/rpc` proxy, and clasp config were removed |
| 0023 | Single-Lock Mutation and Audit Contract | Accepted — superseded on the D1 side by ADR-0030's generic `audit_events` stream (renumbered from 0015, 2026-08-06) |
| 0024 | D1 Platform Restart: Relationship to the Apps Script/Google Sheets Backend | Accepted |
| 0025 | Staff Role Vocabulary and Frontend Specification Boundary | Accepted — domain decision; implementation migration pending (`Teacher`→`Staff` migration handled in current PR stack) |
| 0026 | Programs Module State and Scoped Management UI | Proposed |
| 0027 | D1 Programs Domain: Audit Outcomes and Atomic Approval | Proposed |
| 0028 | Public Guest Check-In Entry | Proposed — decision locked via grilling; public entry, authenticated handoff, and guest identity rules require implementation and acceptance proof |
| 0029 | Local-First Testing and Readiness Gate | Accepted |
| 0030 | D1 Domain Schema, Generic Audit, and Development-Database Directive | Accepted |
| 0031 | Dev-Testing Worker and E2E Deliverable | Accepted |
| 0032 | Prototype Design Authority for the EFCC Webapp Redesign | Accepted |

### Apps Script era (historical)

| #    | Title                                         | Status   |
| ---- | --------------------------------------------- | -------- |
| 0001 | Google Sheets as Database | Historical — Sheets remains the canonical reference for member/domain records, but the running system is D1; the Apps Script mechanism is retired |
| 0002 | PIN-Based Authentication | Superseded by ADR-0020 — D1 owns credentials; PIN survives only as the legacy-PIN upgrade path |
| 0003 | Client-Server RPC via google.script.run | Superseded by ADR-0018 — browser talks to the Worker over the HTTP boundary |
| 0004 | Monthly Recurring Event Generation | Superseded — Events and recurrence run on D1 (schedule rules + generation) |
| 0005 | Role-Based Access Control (RBAC) via PIN Auth | Accepted — Amended by 0006; role model carries into D1 (ADR-0020 global role) |
| 0006 | Admin Capability Matrix, Program Leader Model & Approval Flow | Live domain basis — capability matrix and Program Leader model carry into D1/CF2 |
| 0007 | Vanilla Multi-Page HTML Service Architecture | Superseded by ADR-0017 — frontend moved to Next.js static export on Cloudflare |
| 0008 | Schema-Driven Restart from GAS Template (Grills 1.1–1.5 locked) | Historical — the GAS template restart it describes is no longer the path (ADR-0024 restart is on D1) |
| 0009 | Audit Log Write Pattern (LockService + Extended Schema) | Superseded by ADR-0023 — write-pattern shape and schema; non-repudiation principle carried forward |
| 0010 | Stable App Document and Expandable Sections | Superseded by ADR-0017/ADR-0020 — no HtmlService App Document on the D1 platform |
| 0011 | One Active Session per Member | Superseded by ADR-0020 — multi-device sessions implemented (PR #166) |
| 0012 | E2E Testing Strategy (Playwright Storage-State Pattern) | Superseded — deployed `/exec` storage-state suite retired; deterministic local Playwright/D1 suites replace it |
| 0013 | Google Sheets Database Structure | Historical — canonical sheet reference for the retired Sheets side; the running schema is D1 (spec 080) |
| 0014 | GitHub Merge Precheck & Pre-commit Typecheck Standardization | Accepted — tooling, unchanged by the restart |
| 0015 | Camera QR Capture (External HTTPS Origin) | Superseded by the D1 scanner surface — trust-boundary rules carry forward |
| 0016 | Operational Attendances Sheet Migration | Superseded on D1 by the Attendance migration (ADR-0022) |

---

## Known Tooling Issues

_None currently tracked._
