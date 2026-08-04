# ADR-0016 - Operational Attendances Sheet Migration

- **Status:** Proposed
- **Date:** 2026-08-01

The QR check-in RPC requires an operational `Attendances` schema, while the current legacy tab has a different historical layout. The operator will manually rename the legacy tab to a dated archive, then run `setupAttendancesSheet_` once from the Apps Script editor to create a clean `Attendances` tab with `Attendance_ID`, `Event_ID`, `User_ID`, `CheckIn_Time`, `CheckIn_Method`, `CheckIn_By`, and `Status`. The setup function refuses to overwrite an existing tab and never deletes or mutates the archive; the application reads only the new operational tab. This remains Proposed until the manual Sheet procedure and a fresh deployed `/exec` check-in smoke test both pass.
