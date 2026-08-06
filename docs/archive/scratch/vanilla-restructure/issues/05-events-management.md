# 05 — Event management & onEdit trigger
**What to build:** `events.gs` with create/cancel/list RPCs + `onEdit` trigger, and `events.html` for granted users.
**Blocked by:** 02 (needs `auth.gs` role guards; parallel-safe with 03, 04, 07)
**Status:** ready-for-agent

## Data shapes (from reference)
- `api_createEvent({ createdBy, __sessionToken, eventName, eventDate, timeSlot, programId, eventType, recurrence })` → `{ data: { eventId, programId, eventName, eventDate, timeSlot, eventType, recurrence, status, createdBy, createdAt }, success, message }`
  - `eventType`: "REGULAR" or "SPECIAL" (defaults "REGULAR")
  - `recurrence`: "NONE", "WEEKLY", "MONTHLY" (defaults "NONE")
  - Validation: "Event name is required", "Event date is required", "Time slot is required", "Program ID is required"
  - Role gate: "Permission denied. Only granted users can create events."
- `api_cancelEvent({ eventId, cancelledBy, __sessionToken })` → `{ success, message }` — sets status to "Cancelled"
- `api_getGrantedUserEvents(grantedUserId, sessionToken)` → `{ success, data: Event[] }`
- `onEdit(e)` — detects manual edits to Events sheet, triggers `generateMonthlyRecurringEvents`

## Change
1. `src/gas/events.gs` — port verbatim: `onEdit`, `generateMonthlyRecurringEvents`, `api_createEvent`, `api_cancelEvent`, `api_getGrantedUserEvents`
   - **Trigger setup**: after clasp push, open GAS Editor → Triggers → Add Trigger → `generateMonthlyRecurringEvents` → Time-driven → Month timer → 1st of month. Document in a comment at top of `events.gs`. (Per spec 003: monthly auto-generation. `onEdit` is a simple trigger that fires on manual sheet edits; this is the separate installable trigger for scheduled runs.)
2. `src/gas/events.html`:
   - **Role gate**: if `!isGrantedUser()` → show "Access denied" message, hide everything else
   - **Header**: "Event Management" + "Create New Event" button
   - **Event list**: fetch `api_getGrantedUserEvents` on load. Card per event: event name, date, time slot, program name, type badge (REGULAR/Special), status badge. "Cancel" button per active event.
   - **Cancel**: click → confirm dialog ("Cancel this event?") → `api_cancelEvent` → refresh list
   - **Create form** (toggle visibility): 
     - Program dropdown (populated from `api_getProgramsCatalog` initially — load on page)
     - Event name text input
     - Date `<input type="date">`
     - Time slot text input
     - Event type: radio buttons "Regular" / "Special" (default Regular)
     - Recurrence: dropdown NONE/WEEKLY/MONTHLY
     - "Create" + "Cancel" buttons
   - Back link: `?page=profile`

## Acceptance
- [ ] STAFF sees event list + "Create" button; MEMBER sees "Access denied"
- [ ] Create event: fill form → submit → event appears in list with correct data
- [ ] Cancel event: confirm dialog → event status changes, removed from active list
- [ ] Program dropdown shows programs from Programs sheet
- [ ] Date picker uses native `<input type="date">` (mobile-friendly)
- [ ] `onEdit` fires when Events sheet is edited manually (verify in GAS Executions log)

- [ ] Installable monthly time trigger configured for `generateMonthlyRecurringEvents` (verified in GAS Triggers dashboard)