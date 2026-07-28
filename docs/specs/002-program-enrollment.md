# Module Specification: Program Enrollment

**Status**: Draft  
**Date**: 2026-07-27  
**Context**: 顯恩堂系統 / EFCC Church Management System

---

## 1. Purpose

Allow members to enroll in church Programs and soft-cancel their own enrollment,
and allow authorized STAFF, ADMIN, and Program Leaders to manage enrollment for
another active Member within their capability scope. A dated Event clash may be
reported as an advisory warning but never blocks Program enrollment.

---

## 2. Data Model (Enrollments Sheet)

| Column | Example | Notes |
| --- | --- | --- |
| Enrollment_ID | `ENR-A1B2C3D4` | Auto-generated UUID (first 8 hex chars), prefixed "ENR-". |
| User_ID | `GC-A1B2-C3D4` | References Users.User_ID. |
| Program_ID | `dd646847` | References Programs.Program_ID. |
| Timestamp | `2026-07-27 15:30:00` | Date object written by `new Date()`. |
| Status | `Active` or `Cancelled` | Soft-delete: "Active" on enroll, changed to "Cancelled" on cancel. |

---

## 3. Enrollment Flow (enrollUser)

**Trigger**: Member clicks "Enroll" on a program in the web app.

1. **Validate inputs** — normalize User_ID and Program_ID. Reject if either is empty.
2. **Validate actor and target** — self-service requires the target to be the
   authenticated Member. Assisted enrollment requires STAFF/ADMIN, or an active
   Program Leader grant for the exact target Program. The target Member and
   Program must both be Active.
3. **Optional conflict warning** — dated, future, Active Events may be compared
   in Hong Kong church time. Any clash is advisory and cannot reject enrollment;
   past and Cancelled Events are ignored. Enrollment does not require an Events
   sheet.
4. **Minimal critical section** — acquire one short script lock, re-read the
   exact Member/Program Active-enrollment state, and reject a duplicate before
   writing.
5. **Create enrollment** — generate `ENR-XXXXXXXX` ID, append one Active row,
   flush, and release the lock in `finally`.
6. Return the canonical RPC envelope and any advisory warning.

### Code Location

`function enrollUser(userId, programId)` at line 219 of `程式碼.js`.

### Event clash advisory

```
bookedSlots = [
  "01/08/2026|3:00 PM",    // Youth Worship on Aug 1
  "08/08/2026|3:00 PM",    // Youth Worship on Aug 8
  ...
]

targetEvents = [
  { name: "青崇 - 01/08/2026", key: "01/08/2026|3:00 PM" },  // WARNING
  ...
]
```

If implemented, the system compares date and time in Hong Kong church time and
returns the overlapping Event information as a warning. The user may still
enroll. This advisory is optional for the first release.

### Acceptance Criteria

- [ ] User must provide a valid User_ID and Program_ID.
- [ ] Enrollment creates a row in the Enrollments sheet with Status = "Active".
- [ ] A dated Event overlap never rejects Program enrollment; any warning is non-blocking.
- [ ] At most one Active enrollment exists for the same Member and Program.
- [ ] Enrollment_ID is unique and formatted `ENR-XXXXXXXX`.
- [ ] Assisted enrollment is authorized server-side: STAFF/ADMIN for any Active
      Program and an active Program Leader only for an exact Program they lead.

---

## 4. Cancellation Flow (cancelEnrollment)

**Trigger**: Member clicks "Cancel Enrollment" on a program in the web app.

1. Find the row in Enrollments where User_ID and Program_ID match AND Status = "Active".
2. Change the Status cell to "Cancelled" (soft delete — row is never removed).
3. Return `{ success: true }`.
4. If no active enrollment found, return `{ success: false, message: "Active enrollment record not found." }`.

For privileged cancellation of another Member, STAFF/ADMIN may act in any
Program and an active Program Leader may act only in a Program they lead. The
mutation is audited, uses the same minimal final recheck/write lock, preserves
past Attendance, and never runs from Scanner.

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
| --- | --- |
| Enrollments sheet missing | Returns `{ success: false, message: "System error: Database sheets missing." }` |
| Events sheet missing | Enrollment still works; an optional clash advisory is omitted. |
| User_ID format mismatch | Normalized via `normalizeId_()` — lowercased, whitespace stripped. |
| Enrolling with a dated Event conflict | Enrollment proceeds; an implemented advisory may identify the overlap. |
| Enrolling into a program with no events | Enrollment proceeds normally. |
| Cancelling after already cancelled | Returns `"Active enrollment record not found."` |
| Enrollments sheet has extra/missing columns | Column lookup by header name — graceful fallback for optional columns (Timestamp, Status) |
| Same Member enrolled twice in same Program | Minimal final lock/recheck prevents a second Active row. |
| Two different Members enrolled in same Program | Both rows exist independently. |

---

## 7. Related ADRs

- **ADR-0001**: Google Sheets as Database — Enrollments sheet is a core data store.
- **ADR-0002**: PIN-Based Authentication — Enrollments are keyed by User_ID, the authenticated identity.
- **ADR-0003**: `google.script.run` — `enrollUser` and `cancelEnrollment` are called from the client via this RPC mechanism.
