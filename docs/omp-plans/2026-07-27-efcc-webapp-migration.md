# TS WebApp Migration Plan (顯恩堂系統)

> **For OMP workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Dispatch each task as a fresh `task` subagent invoking the OMP `implement` skill. Gate between tasks with the OMP `reviewer` agent via `code-review` (Spec axis).

**Goal:** Migrate 顯恩堂系統 (EFCC) from inline Apps Script HTML/JS to a TypeScript React singlefile webapp per Master Spec, preserving 100% of existing member features while implementing RBAC, dynamic events, QR attendance, and pastoral care dashboard.

**Architecture:** Vite + React 19 + TypeScript frontend (`src/frontend/`) bundled into a single `index.html` via `vite-plugin-singlefile` and served by Google Apps Script `HtmlService`. Server RPCs in `程式碼.js` with `LockService` guards. Sheet-as-DB model with a new `Attendance` sheet. Mock RPC layer (`api.ts`) for local dev.

**Tech Stack:** React 19, TypeScript 5.7+, Vite 6+, `vite-plugin-singlefile`, `html5-qrcode`, Google Apps Script (V8), Google Sheets.

**Base Branch:** `feat/webapp-migrate` (created from `main` at HEAD `2e82d58`).

**Global Constraints:**

- Member PIN login flow (Username + 4-digit PIN) must remain 100% unchanged.
- Every backend RPC must verify the `sessionToken` (HMAC) and re-fetch `user.role` server-side from the `Users` sheet; client `localStorage` is **cache only**.
- All check-in RPCs must acquire `LockService.getScriptLock()` (tryLock, 5000ms) for atomic duplicate checks.
- Quick-Enroll must run schedule-conflict verification before checking the member in.
- Build artifact: `npm run build` must produce a single self-contained `index.html` at project root.
- All implementation work happens on branch `feat/webapp-migrate`.

---

## File Structure & Changes

### Created

- `src/frontend/package.json` — Vite/React/TS dependencies & scripts.
- `src/frontend/vite.config.ts` — Vite + `viteSingleFile()` plugin.
- `src/frontend/tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` — TS strict mode.
- `src/frontend/index.html` — Vite HTML template (root mount point).
- `src/frontend/src/main.tsx` — React entry point.
- `src/frontend/src/App.tsx` — Router & view switcher with session restore on launch.
- `src/frontend/src/types.ts` — TypeScript interfaces (`User`, `Program`, `Enrollment`, `Event`, `Attendance`, `Role`, payload types).
- `src/frontend/src/services/api.ts` — `apiService` with `google.script.run` + mock fallback (`typeof google === "undefined"`).
- `src/frontend/src/services/session.ts` — 30-day `localStorage` session manager (`sessionToken`, `userId`, `role`).
- `src/frontend/src/components/QRScanner.tsx` — HTML5 `html5-qrcode` viewfinder with audio/haptic chime on success.
- `src/frontend/src/components/MemberPassModal.tsx` — Full-screen high-contrast QR check-in pass display.
- `src/frontend/src/components/WhistleBanner.tsx` — Reusable Green/Amber/Red feedback banner.
- `src/frontend/src/views/LoginView.tsx` — Username + 4-digit PIN form.
- `src/frontend/src/views/MemberRegistrationView.tsx` — New member registration form.
- `src/frontend/src/views/MyProfileView.tsx` — Member profile + full-screen QR pass modal.
- `src/frontend/src/views/ProgramCatalogView.tsx` — Browse programs.
- `src/frontend/src/views/ProgramEnrollmentView.tsx` — Enroll with schedule-conflict checks.
- `src/frontend/src/views/EventManagementView.tsx` — Staff/leader dynamic event CRUD.
- `src/frontend/src/views/AttendanceScannerView.tsx` — QR + manual search check-in (3-branch UI).
- `src/frontend/src/views/CareDashboardView.tsx` — Inactive member care roster.
- `src/frontend/src/views/MemberActivityProfileModal.tsx` — Full attendance history modal.
- `src/frontend/__tests__/*.test.ts` — Vitest unit tests per module.

### Modified

- `程式碼.js` — New RPC handlers (`api_createEvent`, `api_cancelEvent`, `api_checkInMember`, `api_getEventAttendance`, `api_getUserActivityProfile`, `api_getCareDashboard`, `api_logoutUser`, `api_getCurrentSession`) + `verifySessionToken_` + `checkPermission_` + `enrollUser_` (with schedule-conflict) + `LockService` guards.
- `index.html` — Now a singlefile build artifact (overwritten by `npm run build`).

### Schema (Google Sheets, manual)

- `Users`: add `Role` column (`ADMIN|STAFF|EVENT_LEADER|MEMBER`, default `MEMBER`).
- `Events`: add `Created_By` (User_ID) and `Status` (`Active|Cancelled`).
- `Attendance` (new): `Attendance_ID`, `Event_ID`, `User_ID`, `CheckIn_Time`, `CheckIn_Method`, `CheckIn_By`, `Status`.

---

## What Already Exists (Reuse)

- `/Users/noah.wong/Desktop/code/Budget/src/frontend` — Reference architecture for Vite + React 19 + TypeScript + `vite-plugin-singlefile`. Reuse `package.json` shape, `tsconfig` shape, `vite.config.ts`, and `services/api.ts` mock-fallback pattern verbatim.
- `EFCC-dev/程式碼.js` — Existing server-side functions: `loginUser`, `registerUser`, `getProgramsCatalog`, `enrollUser`, `cancelEnrollment`, `getUserEnrolledProgramIds`, `generateMonthlyRecurringEvents`, plus shared helpers `findHeaderIndex_`, `normalizeId_`, `getSheetByName_`. Extend, do not rewrite.
- Existing `Users`, `Programs`, `Enrollments`, `Events` sheets — keep header structure. Reuse for `Role` extension.
- ADRs 0001-0005, Specs 001-007, Wayfinder Map #1 — All decisions are locked.

---

## Not In Scope

- SQL/relational DB migration.
- External OAuth2/social login for members.
- Hardware RFID badge integration.
- Full CRM workflow / automated SMS triggers.
- Gmail SSO for staff (deferred to a future ticket).

---

## ASCII Diagram: Runtime Data Flow

```
┌──────────────────────────┐       ┌────────────────────────────┐
│  Browser (Mobile/Desktop)│       │  Apps Script (V8 runtime)  │
│  ┌────────────────────┐  │       │  ┌──────────────────────┐  │
│  │ React Components   │  │       │  │ api_*.js handlers    │  │
│  │ Views & Modals     │  │       │  │ verifySessionToken_ │  │
│  │ apiService         │  │       │  │ checkPermission_    │  │
│  │ session.ts         │  │       │  │ LockService         │  │
│  └─────────┬──────────┘  │       │  └────────┬─────────────┘  │
│            │ google.script.run │          │                  │
│            │  (or mock fallback) │       │  SpreadsheetApp │  │
│            │ localStorage cache │       └────────┬─────────┘  │
└────────────┼─────────────┘                     │
             │                ┌────────────────────▼──────┐
             └───────────────►│ Google Sheets (DB)         │
                              │ Users | Programs | Enroll.  │
                              │ Events | Attendance         │
                              └─────────────────────────────┘
```

---

## Failure Modes & Gaps

- **`google.script.run` timeout** (e.g. long-running RPC) — Surface friendly busy banner; do not crash view.
- **Camera permission denied** in scanner — Fall back to manual search input.
- **Local clock vs server clock skew** for inactivity badges — Compute `daysInactive` server-side; return timestamp, not days.
- **LockService busy** at event entry — Return `success: false, message: "System busy"`; client shows amber cooldown banner.
- **Sheet column drift** — `findHeaderIndex_` already handles missing optional columns; new columns must follow the same pattern.
- **Singlefile HTML size cap** — `viteSingleFile` should be under 5MB; if it approaches limit, defer `html5-qrcode` to lazy import.

---

## Parallelization / Worktree Strategy

Tickets 02-06 share `src/frontend/src/services/api.ts` and `程式碼.js` modifications. **Strict serialization is required** for the branch `feat/webapp-migrate`:

1. Task 1 (scaffolding) must complete first; it creates the `api.ts` contract that later tasks depend on.
2. Tasks 2-6 must run in order; each merges before the next starts, so `apiService` signatures stay consistent.

Implementation will be dispatched via the OMP `implement` skill which handles TDD and `code-review` gating per task.

---

## Tasks

### Task 1: Scaffold TS WebApp Architecture & Mock RPC Layer

**Files:**

- Create: `src/frontend/package.json`, `src/frontend/vite.config.ts`, `src/frontend/tsconfig.json`, `src/frontend/tsconfig.app.json`, `src/frontend/tsconfig.node.json`, `src/frontend/index.html`
- Create: `src/frontend/src/main.tsx`, `src/frontend/src/App.tsx`, `src/frontend/src/types.ts`
- Create: `src/frontend/src/services/api.ts`, `src/frontend/src/services/session.ts`

**OMP dispatch:**

- Agent: `task` invoking `/skill:implement`
- Inputs: this task block + Plan Header + spec pointer (`docs/specs/000-efcc-system-spec.md`)
- Reviewer gate: OMP `reviewer` via `code-review` (Spec axis) before marking complete

**Interfaces (defined here, consumed by Tasks 2-6):**

- `apiService.loginUser(username: string, pin: string): Promise<LoginResponse>` — Returns `{ success, data: { userId, name, role, sessionToken, qrCodeString } }`.
- `apiService.registerUser(payload): Promise<RegisterResponse>`
- `apiService.getProgramsCatalog(): Promise<Program[]>`
- `apiService.getAvailablePrograms(userId): Promise<ProgramWithEnrollment[]>`
- `apiService.enrollUser(userId, programId): Promise<{ success, message? }>`
- `apiService.cancelEnrollment(userId, programId): Promise<{ success, message? }>`
- `apiService.createEvent(payload): Promise<Event>`
- `apiService.cancelEvent(payload): Promise<{ success, message? }>`
- `apiService.checkInMember(payload): Promise<{ success, data?: { checkInTime }, duplicate?: boolean, message? }>`
- `apiService.getEventAttendance(eventId): Promise<AttendanceEntry[]>`
- `apiService.getUserActivityProfile(userId): Promise<ActivityProfile>`
- `apiService.getCareDashboard(thresholdDays): Promise<CareDashboardData>`
- `apiService.logoutUser(): Promise<{ success }>`

**Acceptance:**

- [ ] `npm run dev` runs locally with mock fallback (mock data returns after 300ms delay).
- [ ] `npm run build` outputs a single `index.html` at project root.
- [ ] `tsc --noEmit` passes with 0 errors.
- [ ] `session.ts` saves/reads/clears `localStorage` session payload.

---

### Task 2: Member PIN Auth, Persistent Session & Profile Pass View

**Files:**

- Create: `src/frontend/src/views/LoginView.tsx`, `MemberRegistrationView.tsx`, `MyProfileView.tsx`
- Create: `src/frontend/src/components/MemberPassModal.tsx`
- Modify: `程式碼.js` (extend `loginUser` to return `sessionToken` HMAC, add `api_logoutUser`, `api_getCurrentSession`, `verifySessionToken_`)

**OMP dispatch:** `task` invoking `/skill:implement`; reviewer gate via `code-review`

**Acceptance:**

- [ ] PIN login succeeds; persists `sessionToken` in `localStorage` (30 days).
- [ ] On app launch, valid session bypasses login and shows `MyProfileView`.
- [ ] Logout clears `localStorage` and returns to login.
- [ ] `MemberPassModal` shows full-screen high-contrast QR code.

---

### Task 3: Program Catalog & Schedule-Conflict Enrollment View

**Files:**

- Create: `src/frontend/src/views/ProgramCatalogView.tsx`, `ProgramEnrollmentView.tsx`
- Modify: `程式碼.js` (port existing `getProgramsCatalog`, `enrollUser`, `cancelEnrollment`; wrap RPC as `api_*`)

**OMP dispatch:** `task` invoking `/skill:implement`; reviewer gate via `code-review`

**Acceptance:**

- [ ] Catalog renders all programs with `isEnrolled` badges.
- [ ] Enroll rejects time-slot conflicts with explicit error message.
- [ ] Cancel soft-deletes enrollment (Status → `Cancelled`).

---

### Task 4: Granted User Dynamic Event Creation & Management

**Files:**

- Create: `src/frontend/src/views/EventManagementView.tsx` (with embedded `CreateEventModal`)
- Modify: `程式碼.js` (add `api_createEvent`, `api_cancelEvent`; guard with `checkPermission_(userId, "EVENT_LEADER")`)

**OMP dispatch:** `task` invoking `/skill:implement`; reviewer gate via `code-review`

**Acceptance:**

- [ ] Tab visible only to `ADMIN` / `STAFF` / `EVENT_LEADER`.
- [ ] Create event writes row with `Created_By` and `Status=Active`.
- [ ] Soft-cancel sets `Status=Cancelled`.

---

### Task 5: Event Attendance Camera QR Scanner & Manual Search

**Files:**

- Create: `src/frontend/src/components/QRScanner.tsx`, `src/frontend/src/views/AttendanceScannerView.tsx`
- Create: `src/frontend/src/components/WhistleBanner.tsx`
- Modify: `程式碼.js` (add `api_checkInMember` with `LockService` + event/enrollment validation; `api_getEventAttendance`)

**OMP dispatch:** `task` invoking `/skill:implement`; reviewer gate via `code-review`

**Acceptance:**

- [ ] HTML5 camera scans member QR codes.
- [ ] Manual search filters by name/phone with 1-tap check-in.
- [ ] LockService tryLock(5000) prevents duplicate race.
- [ ] Server validates event active + member enrolled.
- [ ] UI shows 3 explicit states: 🟢 Success, 🟡 Duplicate, 🔴 Not Enrolled.
- [ ] Quick-Enroll still runs `enrollUser_` schedule-conflict check.

---

### Task 6: Inactive Member Pastoral Care Dashboard

**Files:**

- Create: `src/frontend/src/views/CareDashboardView.tsx`, `MemberActivityProfileModal.tsx`
- Modify: `程式碼.js` (add `api_getCareDashboard`, `api_getUserActivityProfile`)

**OMP dispatch:** `task` invoking `/skill:implement`; reviewer gate via `code-review`

**Acceptance:**

- [ ] Tab visible to `STAFF` / `ADMIN`.
- [ ] Inactivity threshold filter (14/30/60/90 days).
- [ ] Color-coded inactivity badges.
- [ ] 1-click WhatsApp link with pre-populated care message.
- [ ] Click row opens `MemberActivityProfileModal` with attendance history.

---

## Execution Handoff

After branch creation, dispatch each Task 1 → 6 sequentially via the OMP `task` tool with `agent: "task"`. Each task's subagent must invoke `/skill:implement` to run TDD at pre-agreed seams. Between tasks, dispatch `reviewer` via `/skill:code-review` (Spec axis). Acceptance is `READY` from the reviewer before the next task starts.
