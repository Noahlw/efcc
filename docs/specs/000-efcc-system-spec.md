# Specification: 顯恩堂系統 — EFCC Church Management System (TypeScript WebApp)

**Status**: Published (ready-for-agent)  
**Date**: 2026-07-27  
**Context**: 顯恩堂系統 (Evangelical Free Church of China — Glorious Grace Church)  
**Parent Wayfinder Map**: #1

---

## Problem Statement

The current 顯恩堂 (EFCC) church management system is implemented using inline vanilla HTML/JS inside Google Apps Script (`index.html` and `程式碼.js`). While functional for basic PIN login, member registration, program catalog, program enrollment, and recurring event generation, the system faces critical limitations:

1. **Developer Experience & Maintainability**: Monolithic inline HTML/JS in Apps Script lacks modern TypeScript type safety, component modularity, and fast local hot-reloading.
2. **Lack of Attendance Tracking**: Church staff currently have no digital system to check in members at events via QR code scanning or manual search.
3. **Manual Event Management**: Creating new event instances requires developer script updates or static hardcoded recurring rules rather than dynamic staff UI creation.
4. **No Pastoral Care Insight**: Church staff cannot easily identify inactive members (enrolled members missing attendances) to provide timely pastoral care and contact.
5. **Session Friction**: Members must re-authenticate on every visit, creating friction during weekly Sunday check-in queues.

---

## Solution

Migrate the system to a modern **TypeScript React Web Application** based on the reference architecture in `/Users/noah.wong/Desktop/code/Budget`, preserving 100% of existing member features while serving a single bundled HTML artifact (`index.html`) via Google Apps Script:

- **TypeScript React WebApp (`src/frontend/`)**: Vite + React 19 + TypeScript + `vite-plugin-singlefile` compiled into a single `index.html` served by `HtmlService.createHtmlOutputFromFile('index')`.
- **Persistent Session & "Remember Me" UX**: Stores authenticated session tokens in browser `localStorage`. When members reopen the web app weekly, it automatically bypasses login and opens directly to their Member QR Pass.
- **Client RPC & Mock Layer (`api.ts`)**: Unified RPC service communicating with `google.script.run` in production while providing instant mock data responses in local Vite development (`npm run dev`).
- **Role-Based Access Control (ADR-0005)**: Preserves 100% PIN login for members while adding a `Role` column (`ADMIN`, `STAFF`, `EVENT_LEADER`, `MEMBER`) in the `Users` sheet to unlock administrative capabilities.
- **Dynamic Event Management (Spec 005)**: Grants staff and event leaders UI controls to create and manage events dynamically without script updates.
- **Attendance Tracking System (Spec 006)**: Dual check-in modes (HTML5 WebRTC camera QR scanner with live viewfinder HUD & audio/haptic chimes + fast name/phone manual search) writing to an `Attendance` spreadsheet with duplicate check-in guards.
- **Member Activity & Care Dashboard (Spec 007)**: Activity profiles and care dashboard identifying inactive members (enrolled but 0 check-ins in past 30 days) with color-coded inactivity badges (14d/30d/60d+) and direct 1-tap WhatsApp outreach links (`wa.me`).

---

## User Stories

1. **As a Church Member**, I want to log in securely using my Username and 4-digit PIN, so that I can access my account without needing a complex password or Google account setup.
2. **As a Church Member**, I want to register for a new church account with my name, phone, and address, so that the church has my updated record.
3. **As a Church Member**, I want the app to remember my login session across weekly visits, so that I don't have to re-enter my PIN every Sunday.
4. **As a Church Member**, I want to view a full-screen, high-contrast digital QR pass on my mobile device, so that staff can quickly scan me in at church events.
5. **As a Church Member**, I want to browse available programs, view their details, and enroll in programs without schedule conflicts, so that I can join church activities seamlessly.
6. **As a Church Member**, I want to cancel my program enrollment if my schedule changes, so that program rosters remain accurate.
7. **As an Event Leader / Staff**, I want to create a new event instance (date, time slot, event title) from the UI, so that I don't need a developer to edit backend scripts.
8. **As an Event Leader / Staff**, I want to use my device camera with a live HUD and audio/haptic feedback to scan member QR codes at event entry, so that check-ins are recorded instantly.
9. **As an Event Leader / Staff**, I want to search for members by name or phone number with instant typeahead filter and check them in manually, so that members without smartphones can still be checked in quickly.
10. **As a Church Staff / Admin**, I want the system to warn me if a member is scanned twice for the same event, so that duplicate attendance rows are prevented.
11. **As a Church Staff / Admin**, I want to view an inactive member care dashboard highlighting members enrolled in programs who haven't attended in 30+ days, so that our pastoral team knows who to care for and contact.
12. **As a Church Staff / Admin**, I want to click a one-touch WhatsApp link pre-populated with a friendly care message, so that I can reach out to inactive members directly.
13. **As a Frontend Developer**, I want to run `npm run dev` in `src/frontend/` with mock data responses, so that I can build and test UI components locally without deploying to Apps Script.

---

## Implementation Decisions

### Architecture & Folder Structure

```
EFCC-dev/
├── appsscript.json             # Apps Script configuration
├── 程式碼.js                    # GAS server RPC entry point
├── index.html                  # Singlefile build output (production bundle)
├── CONTEXT.md
├── docs/
│   ├── adr/
│   └── specs/
└── src/
    └── frontend/               # React + TypeScript source
        ├── package.json
        ├── vite.config.ts
        ├── tsconfig.json
        ├── tsconfig.app.json
        ├── index.html          # Vite template
        └── src/
            ├── main.tsx
            ├── App.tsx
            ├── types.ts        # Shared TypeScript interfaces
            ├── services/
            │   ├── api.ts      # RPC service & mock layer
            │   └── session.ts  # Persistent localStorage session manager
            ├── components/     # Shared UI components (QRScanner, MemberPassModal)
            └── views/          # Page views (Login, Programs, Attendance, Care)
```

### Session Management (`session.ts`)

- Session payload stored in `localStorage.setItem('efcc_session', JSON.stringify(sessionData))`.
- Contains `userId`, `name`, `role`, `sessionToken` (server-verified SHA-256 HMAC of `userId + pin_hash + salt`), `qrCodeString`, and `expiryTimestamp` (30 days rolling).
- On app launch, `session.ts` validates session expiry. If valid, restores active user state without prompting for PIN.
- Calling `api_logoutUser()` clears `localStorage` immediately and invalidates the session on the server.

### Security & Concurrency Guardrails

1. **Server-Authoritative Role & HMAC Token Verification**: `localStorage` only caches role for client UI tab rendering. Every Apps Script backend RPC handler verifies `sessionToken` (`verifySessionToken_(userId, sessionToken)`) against the server HMAC and re-fetches `user.role` directly from the `Users` spreadsheet, ignoring any client-provided role parameters.
2. **LockService Atomic Attendance Writing**: All check-in RPCs (`api_checkInMember`) acquire `LockService.getScriptLock()` for up to 5000ms. If lock acquisition times out under heavy contention, the server returns `{ success: false, message: "System busy. Please rescan in a moment." }` without crashing or writing incomplete rows.
3. **Quick-Enroll Conflict & Consent Check**: Quick-Enroll from the staff scanner still executes the mandatory schedule-conflict verification (`enrollUser_`) to ensure a member is never enrolled into a program with overlapping event time slots.
4. **Safe Role Priority Fallback**: `checkPermission_` sanitizes `user.role` with `rolesPriority[role] || 1` to ensure invalid or unknown role strings safely default to standard `MEMBER` priority (1).
5. **Validation & Attendance UI Branches**: `api_checkInMember` validates (a) `User_ID` exists, (b) `Event_ID` is active, and (c) member is enrolled in the event's program. `AttendanceScannerView` presents 3 explicit UI branches:
   - 🟢 **Success**: Green banner + success chime + member name.
   - 🟡 **Duplicate**: Amber banner (`"⚠️ Already checked in at 15:30:12"`).
   - 🔴 **Not Enrolled**: Red warning banner + 1-tap `"Quick Enroll & Check In"` button (with schedule conflict validation).

---

## Testing Decisions

1. **Client RPC Seam (`api.ts` Mock Layer & `session.ts`)**: Session persistence and UI views tested in isolation under `npm run dev`.
2. **Backend Server Endpoint Seam (`程式碼.js`)**: GAS RPC handlers unit-tested against mock spreadsheet objects.
3. **Singlefile Bundle Seam (`vite-plugin-singlefile`)**: Production build verification ensuring `npm run build` outputs a single self-contained `index.html` file.

---

## Out of Scope

- SQL / relational database migrations (Google Sheets remains database per requirement).
- External OAuth2 / social login integration for church members.
- Hardware RFID badge scanner integration (standard browser camera WebRTC QR scanner used instead).
- Full CRM workflow engine with automated SMS triggers.

---

## Further Notes

- **ADRs**: See `docs/adr/0001` through `0005` for locked architectural decision records.
- **Module Specs**: See `docs/specs/001` through `007` for individual deep-dive specs.
