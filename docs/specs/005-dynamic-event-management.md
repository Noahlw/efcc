# Module Specification: Dynamic Event Management

**Status**: Draft  
**Date**: 2026-07-27  
**Context**: 顯恩堂系統 / EFCC Church Management System  
**Parent Wayfinder Ticket**: #4 — Granted User Dynamic Event Creation UI & RPC Backend

---

## 1. Purpose

Enable `STAFF`, `ADMIN`, and active Program Leaders to create, view, edit, and
soft-cancel concrete dated Events from the web application. Program Leader
authority is scoped to an exact Program; there is no global `EVENT_LEADER` role.

---

## 2. Sheet Schema (`Events` Sheet Updates)

| Column Header | Example | Type | Description |
| --- | --- | --- | --- |
| `Event_ID` | `EVT-A1B2C3D4` | String | Auto-generated UUID with "EVT-" prefix. |
| `Program_ID` | `dd646847` | String | Foreign key referencing `Programs.Program_ID`. |
| `Event_Date` | `2026-08-01` | String (`YYYY-MM-DD`) | Date-only value interpreted in Hong Kong church time. |
| `Time_Slot` | `15:00` | String (`HH:mm`) | Event time interpreted in Hong Kong church time. |
| `Event_Name` | `青崇 特別專題聚會` | String | Display name for the event. |
| `Event_Type` | `WORSHIP` | String | Event classification. |
| `Recurrence_Tag` | `NONE` | String | Informational `NONE`, `WEEKLY`, or `MONTHLY`; never creates or links Events. |
| `Created_By` | `GC-A1B2-C3D4` | String | User_ID of the staff/leader who created the event. |
| `Status` | `Active` | String | `Active` or `Cancelled` (soft delete). |

---

## 3. RPC Endpoint Contracts

### `api_createEvent(payload)`

Creates a new event instance in the `Events` sheet.

**Payload**:

```json
{
  "userId": "GC-STAFF-001",
  "programId": "dd646847",
  "eventDate": "2026-08-01",
  "timeSlot": "15:00",
  "eventName": "青崇 特別專題聚會",
  "eventType": "WORSHIP",
  "recurrenceTag": "NONE"
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "eventId": "EVT-8F9A1B2C",
    "programId": "dd646847",
    "eventDate": "2026-08-01",
    "timeSlot": "15:00",
    "eventName": "青崇 特別專題聚會",
    "status": "Active"
  }
}
```

The server validates Session, payload, Active Program, and exact-Program
capability. Interactive creation writes exactly one Event row. It never invokes
the monthly generator or creates a recurrence series.

---

### `api_cancelEvent(payload)`

Soft-deletes an existing event.

**Payload**:

```json
{
  "userId": "GC-STAFF-001",
  "eventId": "EVT-8F9A1B2C"
}
```

Cancellation is a soft `Active` to `Cancelled` transition. It is rejected with
`CONFLICT` while active Attendance exists, and shares the minimal final
Event-status/Attendance recheck lock with check-in.

---

### `api_updateEvent(payload)`

Updates one Active Event while preserving `Event_ID` and `Program_ID`.

- Before active Attendance exists, STAFF/ADMIN or an active Leader of the exact
  Program may update Event name, Hong Kong date/time, type, and Recurrence Tag.
- After active Attendance exists, only STAFF/ADMIN may correct those fields and
  a reason is required.
- Cancelled Events are read-only.
- Old/new values, actor, and reason are audited.
- The final Event status and active-Attendance recheck uses one minimal lock;
  nested lock acquisition is forbidden.
- Editing one Event never changes any other Event with the same Recurrence Tag.

**Response**:

```json
{
  "success": true,
  "message": "Event successfully cancelled."
}
```

---

## 4. Phone-first Events Section

In the Apps Script HTML Service Events Section, granted users see a **Create
Event** action and permitted edit/cancel actions:

- Open a phone-first form with Program selector, date, time, name, type, and
  informational Recurrence Tag.
- Preserve a tab-scoped Draft across Back/Forward or refresh.
- Call the canonical browser-facing RPC and show structured failures without
  blanking or replacing the App Document.
- Refresh the Event list after successful create, edit, or cancellation.

---

## 5. Related ADRs & Specs

- **ADR-0004**: Monthly Recurring Event Generation (complemented by dynamic user event creation).
- **ADR-0005**: Role-Based Access Control (RBAC) via PIN Auth (`checkPermission_`).
- **Spec 003**: Events & Recurring Generation.
