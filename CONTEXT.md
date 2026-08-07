# 顯恩堂系統 — EFCC Church Management System

**Church**: Evangelical Free Church of China — Glorious Grace Church (播道會顯恩堂) **Repository**: `efcc` **Stack**: staged migration from Google Apps Script + Google Sheets to Cloudflare Worker + D1. The Worker/D1 stack is the eventual platform owner; Apps Script/Sheets remains the transitional domain backend while programs, events, attendance, enrollments, and related operations migrate. **Platform status**: the repository restarted on D1 (ADR-0024) — D1 owns identity, credentials, sessions, login, registration, and approval today; the Apps Script/Sheets backend is historical and remains only as the transitional domain backend. **Frontend archive**: retired frontends — `程式碼.js` (reference), the React SPA (`src/frontend/`), and the T00–T07 `gas-vertical-slice-v1` attempt (issues #41–48, superseded by ADR-0010) — are no longer in the tree; their content lives in git history **Runtime**: Cloudflare Worker + D1 (identity/auth), Apps Script + Google Sheets (transitional domain backend), Browser (client)

---

## Domain Glossary

Terms marked **(legacy)** describe the retained transitional Apps Script/Sheets surface; the D1 platform is the current target unless a term is marked legacy.

| Term (English) | Term (Chinese) | Definition |
| --- | --- | --- |
| Member (legacy) | 會員 | A church member with an immutable User_ID, mutable unique login username, PIN/password credential, QR code, role, and status (`Active`/`Pending`/`Inactive`). `Pending` members cannot log in until a `Staff`/`Admin` approves them — see ADR-0006. On D1, identity is in the `accounts` table; the `Users` sheet remains the member-record source while transitional. |
| Role | 角色權限 | Global user permission level stored in the `System_Role` column of the `Users` sheet (legacy) or the D1 `accounts` global role. The canonical values are **`Admin`**, **`Staff`**, and **`Member`** (default when empty). One account has exactly one global Role. The D1 schema and auth/API contract currently contain the older `Teacher` spelling and require a migration before deployment; `STAFF` is the normalized code representation of the canonical `Staff` value. See also **Program Leader** — a separate, per-program permission, not a `Role` value. |
| Department | 事工區 / 部門 | A user-extensible ministry area that groups Programs and their scoped capabilities. Initial records are `青區` (`Active`), `成區` (`PendingDevelopment`), and `兒區` (`PendingDevelopment`); permitted users may create additional Departments and configure their details without changing global Roles. |
| Department Modules | 部門模組 | The set of product-owned modules enabled for a Department, such as Program Catalog, Enrollment, Events, Attendance, and future Custom Forms. Permitted users may compose existing modules; they cannot create executable modules, arbitrary D1 tables, or new authorization rules from the UI. |
| Activity Category | 活動類別 | A user-configurable descriptive category for a Program, such as Worship, Bible Study, Fellowship, Youth Ministry, Children’s Ministry, Outreach, Retreat/Camp, Seasonal Activity, or Pastoral Group. Categories do not change authorization or scheduling behavior. |
| Program | 課程 / 事工 | A modular activity container under one Department that Members can discover and enroll in (e.g. 青崇). A Program has a descriptive Activity Category, a behavior type of `Recurring` or `OneOff`, lifecycle state (`Draft`, `Active`, `Archived`), independent discoverability (`Listed`, `Unlisted`), and enrollment mode (`MemberRequest`, `ManagerOnly`). `MemberRequest` creates a Pending request requiring approval; `ManagerOnly` permits only authorized managers to add Members directly. Permitted users may add and edit Programs within their effective Department-management scope. The distinct vocabulary for a time-bounded yearly/seasonal run remains open in history research #189 so long-term records do not become ambiguous. |
| Program Detail | 課程詳情 | The management surface for one Program and its scoped relationships: active Program Leaders, enrollment requests and decisions, enrollments, related Events, and Program-scoped capabilities. Program management approval is required before a Member self-enrollment becomes active. It does not edit global account Roles or the global Role Permission Policy. |
| Enrollment Request | 報名申請 | A Member's request to join a Program. It is a separate historical record with `Pending`, `Approved`, `Rejected`, or `Withdrawn` state. Approval creates an Active Enrollment; direct ManagerOnly enrollment creates an Enrollment without a fake request. |
| Program Enrollment | 報名 | The active or historically cancelled Member–Program relationship created by approval or authorized direct enrollment. It is separate from an Enrollment Request; cancellation is soft, audited, and re-enrollment creates a new relationship record. Discoverability controls catalogue visibility, not authorization. Legacy Enrollments rows retain the transitional Active/Cancelled shape until migration. |
| Assisted Enrollment (legacy) | 代為報名 | The current Apps Script path for a privileged enrollment change performed in the Programs Section for another active Member; it currently adds an Active row directly. Under the reopened #184 decision, approval authority is capability-based: any active actor whose effective policy grants the required management/approval capability for that specific Program may approve or perform the permitted enrollment action. Staff/Admin broad grants and Program Leader scoped grants are examples, not a hard-coded allowlist. Scanner never changes enrollment. |
| Program Leader | 事工負責人 *(proposed — confirm translation)* | A member granted event-management power (create/cancel/edit events, take attendance, view attendance) scoped to one or more specific Programs, tracked in the `Program_Leaders` relationship under the Program domain. A Program Leader may approve enrollment when their effective scoped capability permits Program management, but cannot delegate authority or widen their own scope unless separately granted. Independent of the member's global `Role`; it belongs in the Program detail/management model, not the account Role column. |
| Program Delegation | 事工權限委派 | The explicit capability-gated assignment or revocation of Department managers, Program managers, or Program Leaders. Content management does not imply delegation; every delegation change is scoped, server-authorized, and audited. |
| Custom Application Form | 自訂申請表 | A future modular form definition that a permitted user can create, version, publish, and attach to a Department, Program, or activity. It is roadmap scope only; its schema, permissions, responses, and integrations require a separate research and specification ticket. |
| Event | 聚會 | One dated occurrence belonging to exactly one Program. Both `Recurring` and `OneOff` Programs may own Events. Recurring Events are produced from editable schedule rules with per-occurrence exceptions; OneOff Events are manually added by permitted users. Attendance records target this concrete Event. |
| Recurrence Tag | 重複標記 | Informational Event metadata (`NONE`, `WEEKLY`, or `MONTHLY`) describing an expected schedule pattern. It does not create, link, update, or cancel any other Event. |
| Event Cancellation | 聚會取消 | A soft status change from Active to Cancelled. It never deletes the Event or Attendance history and is rejected once active Attendance exists. |
| Attendance | 出席 | A member checking in at a specific event instance via QR scan or manual search. |
| Attendance Void | 出席作廢 | A correction that changes an active Attendance record to `Voided` without deleting it. It requires an authorized actor and reason, is audited, leaves history intact, and permits a later new check-in. |
| Care Dashboard | 關懷儀表板 | A church-wide Staff/Admin-only view of member inactivity, contact details, program participation, attendance-derived activity, and pastoral follow-up context. Program Leader grants do not provide access. |
| QR Code | QR 碼 | Auto-generated hex string serving as the member's check-in identifier (same value as User_ID by default). |
| Login Username | 登入用戶名稱 | The mutable login identifier displayed to and chosen by an account holder. It may change without changing the established User_ID or QR identity. D1 stores the display value plus a trimmed, lowercased `username_normalized` key; that normalized key is unique across active accounts and registration reservations, including concurrent changes. A username change revokes all refresh sessions and requires sign-in again. |
| Password Credential | 密碼憑證 | The current user-selected login secret after legacy upgrade or new registration. Only a salted PBKDF2 hash is stored. A normal self-service password change requires the current password, revokes all refresh sessions, requires sign-in again, and never changes User_ID. |
| PIN (legacy) | PIN 碼 | 4-digit numeric credential used with username for member login on the legacy Apps Script surface; in D1 it survives only as the one-time migration proof. |
| Legacy-PIN upgrade | 舊 PIN 升級 | A one-time identity-proof step for an imported D1 account using a strictly four-digit source PIN and username: five failed verifications trigger a 5-minute lock, five more trigger a 15-minute lock, and the next failure requires Admin/Staff unlock; successful upgrade replaces it with an 8-character-minimum password and clears the legacy proof before a Session is issued. Users without a legacy PIN are not forced through this transition; new registrations and password accounts do not require a PIN. |
| Section | 功能區 | A navigable church-management capability available after authentication, currently Profile, Programs, Events, Scanner, Care, and Permissions. Use **Section** instead of the ambiguous product terms “page” or “screen”; legacy implementation files may still use `.html` fragment names. |
| Auth Surface | 身份驗證介面 | A signed-out or identity-transition area that handles Login, Legacy-PIN upgrade, self-service Registration, or Approval. An Auth Surface is not a Section because it does not represent an authenticated church-management capability. |
| Shared Shell | 共用外殼 | The authenticated application layout and navigation that surrounds Sections. It owns shared header, responsive navigation, active Section indication, focus behavior, and recoverable shell states; it is not itself a Section. |
| Minimal Product Design | 極簡產品設計 | The shared frontend design contract for EFCC's Auth Surfaces, Shared Shell, and Sections: official church identity, direct operational clarity, Cantonese-first copy, phone-first ministry workflows, desktop management density, and restrained civic visual language. |
| Permission Policy | 權限政策 | The configurable mapping from a global Role (`Admin`, `Staff`, or `Member`) and any scoped Program Leader grant to the capabilities and Sections that role may see or use. Policy editing follows the hierarchy `Admin > Staff > Member`: Admin may edit Admin, Staff, and Member policies; Staff may edit Member policy; Member may edit none. Admin-policy edits must preserve at least one Admin policy editor. Within a Department/Program scope, `program.manage` includes `enrollment.approve` for that same scope unless a narrower policy explicitly governs the action. A lower Role cannot edit its own or a higher Role's policy, and policy changes must not bypass server authorization or silently change an account's global Role. |
| Scanner Section (legacy) | 掃描功能區 | The App Document Section (phone-only in the nav) that owns permitted Event selection, opens the external Scanner Window, and runs the check-in RPC. It does NOT run the camera or render per-scan success/error history; it only shows compact recoverable connection/session errors. |
| Scanner Window (legacy) | 掃描視窗 | The external HTTPS origin page (`noahwong-hue.github.io/efcc-scanner`) opened via `window.open` that runs the rear camera + QR decode (getUserMedia is blocked in the Apps Script IFRAME - ADR-0015). It decodes an opaque scannedCode, posts it to the Scanner Section, and is the single visual owner of camera/bridge loading, per-scan progress, success, duplicate, validation/error, and retry feedback. Successful and duplicate check-ins briefly show their result, with duplicates remaining neutral and quiet, then return to ready-to-scan without another operator action. |
| scannedCode (legacy) | 掃描碼 | The opaque, trimmed QR string that crosses the Scanner Window -> Scanner Section bridge via `postMessage`. It is the stable, non-secret `QR_Code_String`; the Scanner Section never grants authority - identity is resolved server-side by `api_qrCheckIn`. |
| Section Link (legacy) | 功能區連結 | A bookmarkable URL hash that restores one Section after authentication. In v1 it identifies only the Section and never exposes member IDs, event IDs, QR values, credentials, or session tokens. |
| Session | 登入工作階段 | A server-validated authenticated period for one Member. A Member may hold multiple independent Sessions across devices; revoking one Session does not revoke the others. On D1 each login creates an independent Session row (ADR-0020). |
| Local Demo Session | 本機示範工作階段 | A development-only walk-through identity with no server-issued credential or production authority. It exists to inspect the local UI shell and must never be presented as a real account. Avoid calling it a demo account or real login. |
| Production Session | 生產工作階段 | A Worker/D1 cookie-validated authenticated session with server-issued identity and authorization. It is the only session type accepted by the deployed application. Avoid calling it a demo account or local login. |
| Merge-ready | 可合併 | A branch state whose scoped implementation, review findings, deterministic checks, and acceptance evidence are complete enough for the declared stacked merge order. It is not deployment readiness. |
| Release-ready | 可發布 | A merge-ready state that additionally passes the required fresh deployed UI and Worker/D1 acceptance gates for the intended release target. |
| Draft (legacy) | 草稿 | Unsaved form input preserved temporarily within the current browser tab. A Draft is not a submitted Event or server record and is cleared after successful submission, explicit discard, logout, or expiry of its owning tab. |
| Church Time | 教會時間 | All EFCC schedules and user-facing timestamps are interpreted and displayed in `Asia/Hong_Kong`. Date-only values use the Hong Kong calendar and times use the 24-hour clock. |
| Storage State (legacy) | 儲存狀態 | A Playwright-captured snapshot of a signed-in browser session (cookies + `localStorage`) for one E2E test role. Persisted to `.auth/<role>.storage.json` (gitignored locally, base64-encoded GitHub secret in CI). See ADR-0012. |
| Identity Authority | 身份權威 | The system that owns member identity, credentials, sessions, and authentication decisions. During the staged migration, Cloudflare D1 is the Identity Authority (ADR-0020). |
| Domain Backend (legacy) | 領域後端 | The system that owns church-management records and business operations such as Programs, Events, Attendance, and Enrollments. Apps Script + Google Sheets is the transitional Domain Backend. |
| Staged Migration | 分階段遷移 | The selected migration strategy: move ownership capability by capability to the Worker/D1 platform while keeping the existing Apps Script/Sheets Domain Backend operational until each capability has a replacement and acceptance proof. |
| Feature State | 功能狀態 | The current delivery state of a capability: Complete, In progress, Planned, or Transitional. Feature State describes what is true now, not the intended future architecture. |
| Target Owner | 目標擁有者 | The platform that is intended to own a capability after the staged migration: Worker + D1 or Apps Script + Google Sheets while the capability remains transitional. |

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

## Codebase Extensibility

The expandable Department model is implemented through deep modules, not a generic runtime plugin engine.

- `DepartmentWorkspace` is the domain module with a small Interface for inspection and command execution. Its Implementation owns Department/Program/module lifecycle, scope checks, enrollment approval, direct-active assisted enrollment, audit, and transaction invariants.
- `CapabilityAuthorizer` is the authorization seam. Every protected operation resolves the actor's effective global-role policy and Department/Program scope through this Interface; browser visibility is never authority.
- `WorkspaceStore` is the persistence seam. Production uses a D1 Adapter; tests use an in-memory or test-D1 Adapter. The new domain has no Sheet Adapter and no dual-write path.
- A code-owned module registry defines approved modules such as Program Catalog, Enrollment, Events, Attendance, and future Custom Forms. Permitted users configure existing modules; they cannot create executable modules, arbitrary D1 tables, or new authorization rules from the UI.
- Worker HTTP routes and browser pages remain thin Adapters around the domain module. Tests cross the same Interfaces as production callers for leverage and locality.

## Platform Ownership

The staged migration has two concurrent platform boundaries:

- **Cloudflare Worker + D1** is the Identity Authority and the target owner for every migrated capability. PR #166 establishes the identity/auth boundary and the authenticated static web shell. Since ADR-0024 the repository is treated as **restarting on D1**. Issue #184 conditionally establishes D1 as the canonical owner for a new, empty Programs/Enrollment domain; legacy Sheet domain data is not imported and no dual-write path exists.
- **Apps Script + Google Sheets** is the transitional Domain Backend. Its existing Programs, Events, Attendance, Enrollments, and related RPCs remain operational until each capability has a Worker/D1 replacement and fresh acceptance proof.

The feature roadmap in [`README.md`](README.md#feature-roadmap) records both the current Feature State and the Target Owner. A capability implemented in the legacy backend is not automatically Complete for the new website.

---

## Transitional Apps Script Architecture (`src/gas/`)

Read this section before opening `src/gas/` source files cold — it is the
file map and contract cheat sheet a fresh session otherwise has to
reconstruct by reading every file's header comment. This is the **legacy**
backend surface; new capability work targets D1 (see the D1-era ADRs 0017–0023).

### File map

| File | Responsibility |
| --- | --- |
| `Code.gs` | Server entry point. `doGet()` (data-free, per ADR-0010 — must not read Sheets or validate sessions). `SECTION_KEYS` const + `bootstrapSectionsForRole_(role, userId)` (the single source of truth for which Sections a role sees). Public RPCs: `api_loginUser`, `api_restoreApp`, `api_logoutUser`, all returning the `AuthenticatedBootstrap` DTO. |
| `rpc-envelope.gs` | Shared `RpcSuccess`/`RpcFailure` envelope builders (`rpcSuccess_`, `rpcFailure_`), `RPC_CODES` (`AUTH_REQUIRED`, `FORBIDDEN`, `VALIDATION`, `NOT_FOUND`, `CONFLICT`, `BUSY`, `UNAVAILABLE`, …), and `rpcLog_`/`rpcRequestId_` structured diagnostics (no PII). |
| `session.js.gs` | Session issue/verify/revoke against `PropertiesService`, HMAC-signed tokens, PIN normalization. Non-expiring sessions until revoked (issue #73). |
| `users-repository.gs` | `Users` sheet resolver — header-name matched, tolerant of extra/reordered columns (see [Users sheet](#users-sheet)). |
| `program-leaders-repository.gs` | `Program_Leaders` sheet — active-assignment lookup used to grant Scanner access to Program Leaders. |
| `appsscript.json` | Manifest: V8 runtime, `webapp.access = ANYONE`, `webapp.executeAs = USER_DEPLOYING`. |
| `App.html` | The one stable HTML Service document (ADR-0010). Shell skeleton (`#app`, `#app-content` outlet, `#app-nav-phone`/`#app-nav-desktop`), server-includes `styles.html` + `view-login.html` (initial SSR), then `shell.js.html` and `shell-session.js.html` in that order. |
| `shell.js.html` | Flips `data-app-state` to `SIGNED_OUT` on load. The static-shell contract (issue #65, enforced by `tests/gas/app-shell.contract.test.js`) forbids RPC calls in this file. |
| `shell-session.js.html` | The live client controller: the `data-app-state` machine (`BOOTING → SIGNED_OUT → AUTHENTICATING/RESTORING → LOADING_SECTION → READY`, plus `RECOVERABLE_ERROR`), the `efccSession` `localStorage` key, login/logout wiring, bootstrap-on-load, and root-Section navigation (`navigateTo_`/`renderSection_`) rendering phone bottom nav + desktop side rail from the server-authorized `sections_` list. |
| `form-guard.js.html` | Form state machine, safe rendering, and discard-confirmation module (issue #70). Included in App.html before shell-session.js.html. |
| `view-login.html` | Markup-only Login fragment (SSR'd once by `doGet()`; `shell-session.js.html` rebuilds the same DOM client-side after logout/expiry — IDs must stay in sync between the two). |
| `styles.html` | Single stylesheet, mobile-first with a 768px desktop breakpoint. |

### Client/server contracts

- **RPC envelope**: `{success:true, requestId, data}` or `{success:false, requestId, error:{code, message}}`. Every `google.script.run` call MUST register both a success and a failure handler (contract-tested).
- **`AuthenticatedBootstrap` DTO** (returned identically by `api_loginUser` and `api_restoreApp`): `{session:{userId,name,role,qrCodeString,sessionId,sessionToken}, sections:[{key,label,capability}], profile:{userId,name,username,phone,role,status,qrCodeString}}`.
- **`SECTION_KEYS`**: `profile`, `programs`, `events`, `scanner`, `care`, `permissions`. Defined independently in `Code.gs` (server) and `shell-session.js.html` (client) — the two JS realms cannot share a binding, so the strings are intentionally duplicated; drift is caught by `tests/gas/role-navigation.test.js`.
- **Current Section content status**: Profile is fully wired to real bootstrap data. Programs/Events/Scanner/Care/Permissions render placeholder text only — their read RPCs (`api_getPrograms`, `api_getEvents`, `api_getScannerEvents`, `api_getCareData`, `api_getPermissionsData`) do not exist yet (see `docs/specs/067-follow-up-section-rpcs.md`, not yet filed as a tracked issue).
- **Navigation model**: in-memory client router per issue #64's Implementation Decisions — no browser URL hash routing, no `google.script.history` sync in Day 1 (this supersedes the older `/exec#/<section-key>` sketch in `docs/specs/009-phone-first-shell-navigation.md`'s Route Contract, which predates that decision).
- **Demo form RPC**: `api_submitDemoTaskForm(userId, sessionId, sessionToken, requestKey, fieldValue)` — returns `{echoedValue, submittedAt, idempotent}` on success. Idempotency enforced server-side via CacheService using the requestKey. Added in issue #70. |

### Testing & deployment quick reference

- `pnpm typecheck` — Runs TypeScript compiler (`tsc --noEmit`) sequentially across root `tsconfig.json` and `tests/e2e/tsconfig.json` (ADR-0014).
- `pnpm test:gas` — Vitest over `tests/gas/*.test.js`. Each file loads real `.gs`/`.html` source into a `node:vm` context against a purpose-built fake DOM / Sheet / `PropertiesService` — no live Apps Script or network calls. Fast, deterministic unit layer.
- `pnpm --dir web test` — Vitest in the real Cloudflare workerd pool for the rebuilt D1 cookie-only Worker/auth boundary, D1 migrations, sessions, lockout, and client contracts.
- `pnpm test:e2e` — retained/manual Playwright suite against the legacy deployed Apps Script `/exec` URL using per-role storage states in `.auth/` (ADR-0012). It is not the rebuilt D1 login gate.
- `pnpm exec playwright test --config=tests/e2e/auth-d1.config.ts` — manual Playwright request-context smoke against an isolated deployed D1 Worker; requires `AUTH_TARGET_URL` and five disposable acceptance-account secrets. It never uses Google storage state.
- `.husky/pre-commit` — Runs `lint-staged` (formatting/linting) followed by `pnpm typecheck` on every commit (ADR-0014).
- GitHub Actions (`.github/workflows/`) — `precheck.yml` is the deterministic typecheck/unit/component/static-shell gate; `e2e.yml` runs the rebuilt D1 auth contract on pushes/PRs and exposes the deployed D1 Playwright smoke only through `workflow_dispatch` (ADR-0014).
- `clasp push && clasp deploy` — pushes `src/gas/` and cuts a new versioned legacy Apps Script deployment; update `E2E_TARGET_URL` only when running the retained `/exec` suite. The rebuilt D1 gate uses `AUTH_TARGET_URL` and a separate Worker deployment. Never targets the production Sheet/project (see the "Google Sheet database — no automatic mutation" rule in `AGENTS.md`).
- Full step-by-step workflow: [`CONTRIBUTING.md`](CONTRIBUTING.md) for clone/install/branching, plus `README.md` sections "Build and run the web Worker locally" and "Deploy the transitional Apps Script backend".

---

## Architecture Decisions

The repository restarted on D1 (ADR-0024). The table is grouped into two eras: the **D1 era** (current platform, 0017–0023) and the **Apps Script era** (historical, 0001–0016). Per-ADR status records what each decision still means — a decision can be a *live domain basis* (its rule survives, its Apps Script mechanism superseded) or *superseded* (mechanism gone).

### D1 era (current)

| #    | Title                                         | Status   |
| ---- | --------------------------------------------- | -------- |
| 0017 | Frontend Repository, Rendering, and Cloudflare Deployment Boundary | Proposed — decision locked via grilling on #127 (monorepo, Next.js static export, Workers + static assets); deployed Cloudflare proof pending |
| 0018 | Frontend HTTP Boundary, Authentication, and API Contract | Proposed — decision locked via grilling on #128; CF0/CF1 implementation evidence pending |
| 0019 | Permissions and Program Leadership HTTP Contract (CF2 / #133) | Proposed — decision locked via grilling; downstream verification belongs to CF2 implementation |
| 0020 | Cloudflare D1 Identity, Session, and Auth Boundary (Map #158) | Proposed — decision locked via grilling; local/preview proof in AUTH-01/AUTH-02, deployed proof pending |
| 0021 | D1 → Sheets Identity-Metadata Review Mirror (AUTH-03 / #161) | Deferred — optional and not authorized for the current PR; revisit only after separate operator confirmation |
| 0022 | Staged Worker/D1 Platform Migration | Accepted |
| 0023 | Single-Lock Mutation and Audit Contract | Proposed — official Apps Script API support verified; deployed `/exec` proof pending (renumbered from 0015, 2026-08-06) |
| 0024 | D1 Platform Restart: Relationship to the Apps Script/Google Sheets Backend | Accepted |

### Apps Script era (historical)

| #    | Title                                         | Status   |
| ---- | --------------------------------------------- | -------- |
| 0001 | Google Sheets as Database | Live domain basis — Sheets remains the church-domain database; mechanism runs in Apps Script until each capability migrates (ADR-0022) |
| 0002 | PIN-Based Authentication | Superseded by ADR-0020 — D1 owns credentials; PIN survives only as the legacy-PIN upgrade path |
| 0003 | Client-Server RPC via google.script.run | Superseded by ADR-0018 — browser talks to the Worker over the HTTP boundary |
| 0004 | Monthly Recurring Event Generation | Live domain basis — mechanism remains in Apps Script until Events migrate to D1 |
| 0005 | Role-Based Access Control (RBAC) via PIN Auth | Accepted — Amended by 0006; role model carries into D1 (ADR-0020 global role) |
| 0006 | Admin Capability Matrix, Program Leader Model & Approval Flow | Live domain basis — capability matrix and Program Leader model carry into D1/CF2 |
| 0007 | Vanilla Multi-Page HTML Service Architecture | Superseded by ADR-0017 — frontend moved to Next.js static export on Cloudflare |
| 0008 | Schema-Driven Restart from GAS Template (Grills 1.1–1.5 locked) | Historical — the GAS template restart it describes is no longer the path (ADR-0024 restart is on D1) |
| 0009 | Audit Log Write Pattern (LockService + Extended Schema) | Superseded by ADR-0023 — write-pattern shape and schema; non-repudiation principle carried forward |
| 0010 | Stable App Document and Expandable Sections | Superseded by ADR-0017/ADR-0020 — no HtmlService App Document on the D1 platform |
| 0011 | One Active Session per Member | Superseded by ADR-0020 — multi-device sessions implemented (PR #166) |
| 0012 | E2E Testing Strategy (Playwright Storage-State Pattern) | Accepted — historical tooling; storage-state retained only for the legacy `/exec` suite |
| 0013 | Google Sheets Database Structure | Live domain basis — canonical sheet reference; governs the Sheets side of the migration |
| 0014 | GitHub Merge Precheck & Pre-commit Typecheck Standardization | Accepted — tooling, unchanged by the restart |
| 0015 | Camera QR Capture (External HTTPS Origin) | Proposed — mechanism flagged for replacement pending #136; trust-boundary rules carry forward |
| 0016 | Operational Attendances Sheet Migration | Proposed — Apps Script mechanism; superseded on D1 by the Attendance migration (ADR-0022) |

---

## Known Tooling Issues

_None currently tracked._