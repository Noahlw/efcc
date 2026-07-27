# Module Specification: Events & Recurring Generation

**Status**: Draft  
**Date**: 2026-07-27  
**Context**: 顯恩堂系統 / EFCC Church Management System

---

## 1. Purpose

Generate individual event instances for recurring programs (e.g. weekly youth worship services) on a monthly basis. Events serve as the concrete schedule that feeds enrollment conflict checking and will later power attendance tracking.

---

## 2. Data Model (Events Sheet)

| Column | Example | Notes |
|--------|---------|-------|
| Event_ID | `A1B2C3D4` | First 8 hex chars of `Utilities.getUuid()`, uppercased. |
| Program_ID | `dd646847` | References Programs.Program_ID. |
| Event_Date | `01/08/2026` | Formatted as `dd/MM/YYYY` using the script's timezone. |
| Time_Slot | `3:00 PM` | Free-text time string, currently only start time. |
| Event_Name | `青崇 - 01/08/2026` | `namePrefix + " - " + dateString` — used to identify the event in conflict messages. |

---

## 3. Event Generation Flow (generateMonthlyRecurringEvents)

**Trigger**: Time-driven trigger (recommended: monthly) or manual execution via script editor.

1. **Define recurring programs** — currently a hardcoded array in the function body:
   ```javascript
   var recurringPrograms = [
     { programId: "dd646847", dayOfWeek: 0, startTime: "3:00 PM", namePrefix: "青崇" }
   ];
   ```
   - `dayOfWeek`: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
   - `startTime`: display-only free text
   - `namePrefix`: used to build the event name

2. **Calculate target month** — next month from today.
   - If current month is November (month index 10 → target 11 = December OK)
   - If current month is December (month index 11), target rolls to January of next year.

3. **Generate events** — iterate each day of the target month:
   - If the day's day-of-week matches a recurring program's dayOfWeek, create an event row.
   - Format date as `dd/MM/YYYY` in script timezone.
   - Generate Event_ID via `Utilities.getUuid().substring(0, 8).toUpperCase()`.

4. **Bulk write** — collect all events into an array and write at once via `setValues` starting at `lastRow + 1`.

### Code Location

`function generateMonthlyRecurringEvents()` at line 452 of `程式碼.js`.

### Current Recurring Programs (Hardcoded)

| Program_ID | Day | Time | Name Prefix |
|-----------|-----|------|-------------|
| `dd646847` | Sunday (0) | 3:00 PM | 青崇 (Youth Worship) |

Additional programs can be added by uncommenting and customizing entries in the `recurringPrograms` array.

---

## 4. Time Trigger Configuration

The function is designed to run on a **monthly time trigger**. To configure:

1. Open the Apps Script editor (`Extensions > Apps Script`).
2. Go to **Triggers** (clock icon).
3. Add a trigger:
   - **Function**: `generateMonthlyRecurringEvents`
   - **Event source**: Time-driven
   - **Type**: Month timer
   - **Day of month**: 1 (run on the 1st of each month to pre-generate next month's events)
   - **Time of day**: Midnight–1am (or any low-traffic window)

---

## 5. Edge Cases & Error Handling

| Scenario | Behavior |
|----------|----------|
| Events sheet is missing | Function returns early — no events generated. |
| Events sheet has extra columns | `setValues` writes only the defined columns. Extra columns in the sheet remain empty for new rows. |
| Program_ID in `recurringPrograms` doesn't match any Programs catalog entry | Events are still generated — Program_ID is a foreign key by convention only, no referential check is performed. |
| Run multiple times for the same month | Duplicate events are created — no dedup logic exists. Should be mitigated by running once per month via trigger. |
| December → January rollover | Correctly handled: if `targetMonth > 11`, resets to 0 (January) and increments year. |
| Timezone | Uses `Session.getScriptTimeZone()` — events are date-aligned to the spreadsheet's configured timezone. |

---

## 6. Future Considerations

- **Attendance integration**: Once attendance tracking is implemented, events will be the target of check-in operations.
- **Dedup before insert**: A guard against duplicate event generation (check if events already exist for the target month before generating).
- **Config-driven recurring programs**: Move `recurringPrograms` from hardcoded to a sheet or script property for admin editing without code changes.
- **End time support**: Currently `endTime` is commented out in the code. If added, it should be included in the event row and used in conflict checking.
- **Calendar integration**: Events could eventually sync to Google Calendar for member visibility.

---

## 7. Related ADRs

- **ADR-0001**: Google Sheets as Database — Events sheet is a core data store.
- **ADR-0003**: `google.script.run` — Event data is read client-side for enrollment conflict checking.
