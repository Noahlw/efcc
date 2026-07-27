# Module Specification: Program Enrollment

**Status**: Draft  
**Date**: 2026-07-27  
**Context**: 顯恩堂系統 / EFCC Church Management System

---

## 1. Purpose

Allow members to enroll in church programs and cancel their enrollment. The system prevents time-slot conflicts between programs that share overlapping event schedules.

---

## 2. Data Model (Enrollments Sheet)

| Column | Example | Notes |
|--------|---------|-------|
| Enrollment_ID | `ENR-A1B2C3D4` | Auto-generated UUID (first 8 hex chars), prefixed "ENR-". |
| User_ID | `GC-A1B2-C3D4` | References Users.User_ID. |
| Program_ID | `dd646847` | References Programs.Program_ID. |
| Timestamp | `2026-07-27 15:30:00` | Date object written by `new Date()`. |
| Status | `Active` or `Cancelled` | Soft-delete: "Active" on enroll, changed to "Cancelled" on cancel. |

---

## 3. Enrollment Flow (enrollUser)

**Trigger**: Member clicks "Enroll" on a program in the web app.

1. **Validate inputs** — normalize User_ID and Program_ID. Reject if either is empty.
2. **Fetch user's active enrollments** — builds a lookup of all program IDs the user is currently enrolled in (status = "Active").
3. **Fetch all events** — reads the Events sheet to build two sets:
   - `bookedSlots`: date|time keys of events belonging to the user's already-enrolled programs.
   - `targetEvents`: list of events (name + time slot key) belonging to the target program.
4. **Conflict check** — for each target event, check if its time slot key (date|time) appears in the booked slots. If any match, return error with the conflicting event name.
5. **Create enrollment** — generate `ENR-XXXXXXXX` ID, build a new row with all known columns, set status "Active", write via `appendRow`.
6. Return `{ success: true }`.

### Code Location

`function enrollUser(userId, programId)` at line 219 of `程式碼.js`.

### Conflict Check Logic

```
bookedSlots = [
  "01/08/2026|3:00 PM",    // Youth Worship on Aug 1
  "08/08/2026|3:00 PM",    // Youth Worship on Aug 8
  ...
]

targetEvents = [
  { name: "青崇 - 01/08/2026", key: "01/08/2026|3:00 PM" },  // CONFLICT!
  ...
]
```

The system compares only date + time. Two different programs that happen at the same time on the same date are considered conflicting, even if they are in different rooms or run by different leaders.

### Acceptance Criteria

- [ ] User must provide a valid User_ID and Program_ID.
- [ ] Enrollment creates a row in the Enrollments sheet with Status = "Active".
- [ ] If any event in the target program has the same date+time as an event in an already-enrolled program, enrollment is rejected with a conflict message naming the conflicting event.
- [ ] Multiple enrollments in the same program are allowed (no duplicate check — but a second enrollment is redundant).
- [ ] Enrollment_ID is unique and formatted `ENR-XXXXXXXX`.

---

## 4. Cancellation Flow (cancelEnrollment)

**Trigger**: Member clicks "Cancel Enrollment" on a program in the web app.

1. Find the row in Enrollments where User_ID and Program_ID match AND Status = "Active".
2. Change the Status cell to "Cancelled" (soft delete — row is never removed).
3. Return `{ success: true }`.
4. If no active enrollment found, return `{ success: false, message: "Active enrollment record not found." }`.

### Code Location

`function cancelEnrollment(userId, programId)` at line 307 of `程式碼.js`.

### Acceptance Criteria

- [ ] Only rows with Status = "Active" are cancelled (already-cancelled rows are ignored).
- [ ] The row is soft-deleted (Status → "Cancelled"), not removed.
- [ ] Non-existent enrollment returns an error message.

---

## 5. Supporting Functions

### getUserEnrolledProgramIds(userId)

Returns an array of program IDs the user is actively enrolled in. Thin wrapper around `getUserEnrolledProgramLookup_()`.

### getUserEnrolledProgramLookup_(userId)

Reads the Enrollments sheet and returns an object `{ [programId]: true }` for all active enrollments matching the user. Uses efficient range-limited reads for performance.

### getAvailablePrograms(userId)

Returns the full Programs catalog with an `isEnrolled` boolean per program — used to render the enrollment UI (showing which programs the user is already in).

---

## 6. Edge Cases & Error Handling

| Scenario | Behavior |
|----------|----------|
| Enrollments sheet missing | Returns `{ success: false, message: "System error: Database sheets missing." }` |
| Events sheet missing | Same as above. |
| User_ID format mismatch | Normalized via `normalizeId_()` — lowercased, whitespace stripped. |
| Enrolling without time conflict | Proceeds normally. |
| Enrolling into a program with no events | No events to check against — enrollment proceeds with no conflict check. |
| Cancelling after already cancelled | Returns `"Active enrollment record not found."` |
| Enrollments sheet has extra/missing columns | Column lookup by header name — graceful fallback for optional columns (Timestamp, Status) |
| Two users enrolled in same program | Both rows exist independently — no duplicate-prevention by design. |

---

## 7. Related ADRs

- **ADR-0001**: Google Sheets as Database — Enrollments sheet is a core data store.
- **ADR-0002**: PIN-Based Authentication — Enrollments are keyed by User_ID, the authenticated identity.
- **ADR-0003**: `google.script.run` — `enrollUser` and `cancelEnrollment` are called from the client via this RPC mechanism.
