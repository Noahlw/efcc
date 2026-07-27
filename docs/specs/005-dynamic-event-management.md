# Module Specification: Dynamic Event Management

**Status**: Draft  
**Date**: 2026-07-27  
**Context**: 顯恩堂系統 / EFCC Church Management System  
**Parent Wayfinder Ticket**: #4 — Granted User Dynamic Event Creation UI & RPC Backend

---

## 1. Purpose

Enable authorized staff and event leaders (`ADMIN`, `STAFF`, `EVENT_LEADER`) to create, view, and manage events directly from the web application without editing Google Apps Script source code or requiring backend developer intervention.

---

## 2. Sheet Schema (`Events` Sheet Updates)

| Column Header | Example | Type | Description |
|---------------|---------|------|-------------|
| `Event_ID` | `EVT-A1B2C3D4` | String | Auto-generated UUID with "EVT-" prefix. |
| `Program_ID` | `dd646847` | String | Foreign key referencing `Programs.Program_ID`. |
| `Event_Date` | `01/08/2026` | String (dd/MM/YYYY) | Date of the event instance. |
| `Time_Slot` | `15:00 - 17:00` | String | Start and end time slot. |
| `Event_Name` | `青崇 特別專題聚會` | String | Display name for the event. |
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
  "eventDate": "01/08/2026",
  "timeSlot": "15:00 - 17:00",
  "eventName": "青崇 特別專題聚會"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "eventId": "EVT-8F9A1B2C",
    "programId": "dd646847",
    "eventDate": "01/08/2026",
    "timeSlot": "15:00 - 17:00",
    "eventName": "青崇 特別專題聚會",
    "status": "Active"
  }
}
```

**Server Guard Logic**:
```javascript
function api_createEvent(payload) {
  checkPermission_(payload.userId, "EVENT_LEADER");
  
  var eventId = "EVT-" + Utilities.getUuid().substring(0, 8).toUpperCase();
  var sheet = getSheetByName_("Events");
  sheet.appendRow([
    eventId,
    payload.programId,
    payload.eventDate,
    payload.timeSlot,
    payload.eventName,
    payload.userId,
    "Active"
  ]);
  return { success: true, data: { eventId: eventId, ...payload } };
}
```

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

**Response**:
```json
{
  "success": true,
  "message": "Event successfully cancelled."
}
```

---

## 4. Frontend UI Component Prototype (`EventManagementView.tsx`)

In the React TypeScript web app (`src/frontend/src/views/EventManagementView.tsx`), granted users see an **"Create Event"** button:

- Open modal with Program selector, Date picker, Time slot inputs, and Event title.
- Calls `apiService.createEvent(payload)`.
- Updates event list reactively.

---

## 5. Related ADRs & Specs

- **ADR-0004**: Monthly Recurring Event Generation (complemented by dynamic user event creation).
- **ADR-0005**: Role-Based Access Control (RBAC) via PIN Auth (`checkPermission_`).
- **Spec 003**: Events & Recurring Generation.
