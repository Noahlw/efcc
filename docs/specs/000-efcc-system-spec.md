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

---

## Solution

Migrate the system to a modern **TypeScript React Web Application** based on the reference architecture in `/Users/noah.wong/Desktop/code/Budget`, preserving 100% of existing member features while serving a single bundled HTML artifact (`index.html`) via Google Apps Script:
- **TypeScript React WebApp (`src/frontend/`)**: Vite + React 19 + TypeScript + `vite-plugin-singlefile` compiled into a single `index.html` served by `HtmlService.createHtmlOutputFromFile('index')`.
- **Client RPC & Mock Layer (`api.ts`)**: Unified RPC service communicating with `google.script.run` in production while providing instant mock data responses in local Vite development (`npm run dev`).
- **Role-Based Access Control (ADR-0005)**: Preserves 100% PIN login for members while adding a `Role` column (`ADMIN`, `STAFF`, `EVENT_LEADER`, `MEMBER`) in the `Users` sheet to unlock administrative capabilities.
- **Dynamic Event Management (Spec 005)**: Grants staff and event leaders UI controls to create and manage events dynamically without script updates.
- **Attendance Tracking System (Spec 006)**: Dual check-in modes (HTML5 WebRTC camera QR scanner + fast name/phone manual search) writing to an `Attendance` spreadsheet with duplicate check-in guards.
- **Member Activity & Care Dashboard (Spec 007)**: Activity profiles and care dashboard identifying inactive members (enrolled but 0 check-ins in past 30 days) with direct WhatsApp outreach links (`wa.me`).

---

## User Stories

1. **As a Church Member**, I want to log in securely using my Username and 4-digit PIN, so that I can access my account without needing a complex password or Google account setup.
2. **As a Church Member**, I want to register for a new church account with my name, phone, and address, so that the church has my updated record.
3. **As a Church Member**, I want to view my unique member QR code on my mobile device, so that staff can quickly scan me in at church events.
4. **As a Church Member**, I want to browse available programs, view their details, and enroll in programs without schedule conflicts, so that I can join church activities seamlessly.
5. **As a Church Member**, I want to cancel my program enrollment if my schedule changes, so that program rosters remain accurate.
6. **As an Event Leader / Staff**, I want to create a new event instance (date, time slot, event title) from the UI, so that I don't need a developer to edit backend scripts.
7. **As an Event Leader / Staff**, I want to use my device camera to scan member QR codes at event entry, so that attendance is recorded instantly with visual and audio feedback.
8. **As an Event Leader / Staff**, I want to search for members by name or phone number and check them in manually, so that members without smartphones can still be checked in quickly.
9. **As a Church Staff / Admin**, I want the system to warn me if a member is scanned twice for the same event, so that duplicate attendance rows are prevented.
10. **As a Church Staff / Admin**, I want to view an inactive member care dashboard highlighting members enrolled in programs who haven't attended in 30+ days, so that our pastoral team knows who to care for and contact.
11. **As a Church Staff / Admin**, I want to click a one-touch WhatsApp link next to an inactive member's profile, so that I can send a friendly outreach message directly.
12. **As a Frontend Developer**, I want to run `npm run dev` in `src/frontend/` with mock data responses, so that I can build and test UI components locally without deploying to Apps Script.

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
            │   └── api.ts      # RPC service & mock layer
            ├── components/     # Shared UI components
            └── views/          # Page views (Login, Programs, Attendance, Care)
```

### Data Store Schema (Google Sheets)

- **`Users`**: `User_ID`, `Name`, `Username`, `PIN_Code`, `Phone`, `Role` (`ADMIN`|`STAFF`|`EVENT_LEADER`|`MEMBER`), `Status`, `QR_Code_String`
- **`Programs`**: `Program_ID`, `Program_Name`, `Type`, `Description`
- **`Enrollments`**: `Enrollment_ID`, `User_ID`, `Program_ID`, `Timestamp`, `Status` (`Active`|`Cancelled`)
- **`Events`**: `Event_ID`, `Program_ID`, `Event_Date`, `Time_Slot`, `Event_Name`, `Created_By`, `Status` (`Active`|`Cancelled`)
- **`Attendance`**: `Attendance_ID`, `Event_ID`, `User_ID`, `CheckIn_Time`, `CheckIn_Method` (`QR_SCAN`|`MANUAL`), `CheckIn_By`, `Status` (`ATTENDED`)

### RPC API Reference (`程式碼.js` & `api.ts`)

| Endpoint | Target Role | Description |
|----------|-------------|-------------|
| `api_loginUser(username, pin)` | `MEMBER`+ | Validates credentials, returns User object + Role. |
| `api_registerUser(payload)` | `MEMBER`+ | Creates new user row with generated User_ID & QR code string. |
| `api_getProgramsCatalog()` | `MEMBER`+ | Returns cached program catalog. |
| `api_getAvailablePrograms(userId)` | `MEMBER`+ | Returns program catalog enriched with member `isEnrolled` status. |
| `api_enrollUser(userId, programId)` | `MEMBER`+ | Enrolls user after checking event schedule time conflicts. |
| `api_cancelEnrollment(userId, programId)` | `MEMBER`+ | Soft-deletes enrollment (Status → `Cancelled`). |
| `api_createEvent(payload)` | `EVENT_LEADER`+ | Creates a new dynamic event row. |
| `api_cancelEvent(payload)` | `EVENT_LEADER`+ | Soft-deletes an event instance. |
| `api_checkInMember(payload)` | `EVENT_LEADER`+ | Records member check-in with duplicate guard. |
| `api_getEventAttendance(eventId)` | `EVENT_LEADER`+ | Returns roster of checked-in members for an event. |
| `api_getUserActivityProfile(userId)` | `STAFF`+ | Aggregates member attendance history and rates. |
| `api_getCareDashboard(thresholdDays)` | `STAFF`+ | Returns inactive member roster and care statistics. |

---

## Testing Decisions

1. **Client RPC Seam (`api.ts` Mock Layer)**: UI views tested in isolation under `npm run dev` with mock data.
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
