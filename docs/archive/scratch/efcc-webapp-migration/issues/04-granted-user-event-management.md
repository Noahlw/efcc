# 04 — Granted User Dynamic Event Creation & Management

**What to build:** Implement staff/leader UI controls and server RPC handlers (`api_createEvent`, `api_cancelEvent`) allowing granted users (`ADMIN`, `STAFF`, `EVENT_LEADER`) to create and manage events dynamically from the frontend UI (Spec 005) without modifying Apps Script backend code.

**Blocked by:** 02 — Member PIN Authentication, Persistent Session & Profile Pass View  
**Status:** ready-for-agent

- [ ] UI unlocks "Manage Events" tab only for users with `user.role` in `["ADMIN", "STAFF", "EVENT_LEADER"]`.
- [ ] `EventManagementView.tsx` renders event list grouped by program and date.
- [ ] `CreateEventModal.tsx` allows staff/leaders to pick program, date (`dd/MM/YYYY`), time slot, and event title.
- [ ] Submitting form invokes `apiService.createEvent(payload)` guarded by server-side `checkPermission_(userId, "EVENT_LEADER")`.
- [ ] Staff can soft-cancel an event instance via `apiService.cancelEvent(payload)`.
- [ ] `Events` sheet stores `Created_By` User_ID and `Status` (`Active` / `Cancelled`).
