# Module Specification: Attendance Tracking System

**Status**: Draft  
**Date**: 2026-07-27  
**Context**: 顯恩堂系統 / EFCC Church Management System  
**Parent Wayfinder Ticket**: #5 — Attendance Tracking Sheet Data Model & Scanner Workflow

---

## 1. Purpose

Provide event attendance taking capabilities for church staff and event leaders (`ADMIN`, `STAFF`, `EVENT_LEADER`) using both camera QR code scanning and fast manual member search, writing check-in records to an `Attendance` spreadsheet.

---

## 2. Sheet Schema (`Attendance` Sheet)

| Column Header | Example | Type | Description |
| --- | --- | --- | --- |
| `Attendance_ID` | `ATT-A1B2C3D4` | String | Auto-generated UUID with "ATT-" prefix. |
| `Event_ID` | `EVT-8F9A1B2C` | String | Foreign key referencing `Events.Event_ID`. |
| `User_ID` | `GC-A1B2-C3D4` | String | Foreign key referencing `Users.User_ID`. |
| `CheckIn_Time` | `2026-07-27 15:30:12` | String (ISO / Local) | Exact check-in timestamp. |
| `CheckIn_Method` | `QR_SCAN` | String | `QR_SCAN` or `MANUAL_SEARCH`. |
| `CheckIn_By` | `GC-STAFF-001` | String | User_ID of the staff/leader performing check-in. |
| `Status` | `Active` | String | `Active` or `Voided`; `Voided` is a retained correction, never a deleted row. |

---

## 3. Check-In Workflows

### Concurrency boundary

Check-in uses one script lock only around the final authoritative Event-status
check, duplicate Event/member check, Attendance append, and audit-outcome append.
Validation, member search, camera work, and ordinary reads remain outside the
lock. Code running inside this critical section must use an internal audit append
helper that does not acquire the script lock again; nested lock acquisition is
forbidden because Apps Script does not document script locks as re-entrant.

The lock is a narrow consistency boundary for duplicate submissions and the
Event-cancellation/check-in race. It is not a page, Scanner, or user-session
lock.

### 3.1 QR Code Scanning Flow

1. Staff/Leader opens event check-in view (`/events/:eventId/checkin`).
2. App opens HTML5 camera video stream via `html5-qrcode` scanner library.
3. Member presents QR code from their mobile web app (value = `User_ID`, e.g., `GC-A1B2-C3D4`).
4. Camera reads QR string → invokes `api_checkInMember({ eventId, userId, checkInBy, method: "QR_SCAN" })`.
5. Server checks duplicate:
   - If the user is already checked in for `eventId`, the request is handled as
     a quiet idempotent outcome: no second row is written, no error/modal or
     additional success chime is shown, and scanning remains ready for the next
     member. The response identifies the existing Attendance record with
     `success: true` and `created: false`.
   - If clean: appends row to `Attendance` sheet and returns `{ success: true, memberName: "張三" }`.
6. UI displays green success toast with audio chime and member name.

---

### 3.2 Fast Manual Search Flow

1. Staff/Leader types member name or phone number into the search bar.
2. App filters enrolled program members locally or via fast RPC lookup.
3. Staff taps **"Check In"** next to the member's name.
4. Invokes `api_checkInMember({ eventId, userId, checkInBy, method: "MANUAL_SEARCH" })`.

### 3.3 Enrollment eligibility

The target member must be Active and have an Active enrollment in the Event's
exact Program. QR scan and manual search use the same server-side rule. Client
filtering is a convenience only. An unenrolled member is not checked in and
receives a clear `NOT_ENROLLED` business result.

Guest attendance and attendance without a Program enrollment are deferred. A
check-in request never creates or changes an Enrollment. When the member is not
enrolled, Scanner returns `NOT_ENROLLED`, identifies the Event's Program, and
remains usable. STAFF/ADMIN or an active Leader of that exact Program may enroll
the member separately in the Programs Section, return to Scanner, and submit a
new scan through the normal check-in path.

### 3.4 Void an incorrect check-in

Scanner's Attendance roster exposes **Void Check-in** for an Active Attendance
record. STAFF/ADMIN may act for any Event; an active Program Leader may act only
for an Event in a Program they lead. A short reason is required.

The server uses one minimal final lock to recheck Session, exact-Program
capability, Event/Attendance identity, and Active status; it then writes
`Voided`, appends the audit outcome through the non-locking internal helper,
flushes, and releases in `finally`. The row remains historical, is excluded from
active Attendance counts, and does not block Event cancellation. A later scan
may create a new Active Attendance record for the same Event/member pair.

---

## 4. RPC Endpoint Contracts

### `api_checkInMember(payload)`

**Payload**:

```json
{
  "eventId": "EVT-8F9A1B2C",
  "qrOrUserId": "GC-A1B2-C3D4",
  "checkInBy": "GC-STAFF-001",
  "method": "QR_SCAN"
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "attendanceId": "ATT-9C8B7A6F",
    "userId": "GC-A1B2-C3D4",
    "memberName": "張三",
    "checkInTime": "2026-07-27 15:30:12",
    "method": "QR_SCAN"
  }
}
```

---

### `api_getEventAttendance(eventId)`

Returns the list of all checked-in members for a specific event instance to display attendance count and roster.

---

## 5. Related ADRs & Specs

- **ADR-0001**: Google Sheets as Database (`Attendance` sheet).
- **ADR-0005**: Role-Based Access Control (`checkPermission_` for staff/leaders).
- **Spec 005**: Dynamic Event Management (Events referenced by `Event_ID`).
