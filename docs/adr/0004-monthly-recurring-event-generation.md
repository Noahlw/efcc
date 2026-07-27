# ADR-0004: Monthly Recurring Event Generation

**Status**: Accepted  
**Date**: 2026-07-27  
**Context**: 顯恩堂系統 / EFCC Church Management System

## Decision

Generate recurring program events (e.g. weekly Sunday youth worship) via a server-side function that creates individual event instances for the next month. The recurring program definitions are hardcoded in the function body and the function runs on a monthly time-driven trigger.

## Rationale

- **Simple, predictable schedule** — Recurring events follow a fixed weekly pattern. A one-shot monthly batch is easier to reason about than per-instance generation.
- **No external calendar dependency** — Events live in the Google Sheet alongside all other data. No Google Calendar API, no webhook, no cron service.
- **Bulk write for performance** — All events for the month are collected and written in a single `setValues` call rather than row-by-row.
- **Idempotent per-month** — Running the function multiple times for the same month creates duplicates, but the monthly trigger cadence (first of each month) makes this unlikely.

## Constraints

- **Hardcoded program list** — To add or change a recurring program, the code must be edited and redeployed. No admin UI for this configuration.
- **No dedup guard** — If the trigger fires twice for the same month (e.g. after a deployment), duplicate event rows are created.
- **No past-event cleanup** — Events are never archived or deleted. The Events sheet grows linearly over time.
- **No calendar sync** — Events exist only in the sheet. Members cannot see them on a personal calendar.

## Recurring Program Configuration

```javascript
var recurringPrograms = [
  {
    programId: "dd646847",  // References Programs.Program_ID
    dayOfWeek: 0,            // 0 = Sunday, 1 = Monday, ...
    startTime: "3:00 PM",    // Display-only time string
    namePrefix: "青崇"       // Used to build Event_Name
  }
];
```

## Event Generation Rules

1. Target = next calendar month from today.
2. For each day in the target month: if its day-of-week matches a recurring program's `dayOfWeek`, create an event.
3. Event_ID = `Utilities.getUuid().substring(0, 8).toUpperCase()`.
4. Event_Date formatted as `dd/MM/YYYY` in the script's configured timezone.
5. Event_Name = `namePrefix + " - " + dateString`.

## Alternatives Considered

- **Google Calendar API** — Rejected. Adds an external dependency and OAuth scope. Events would not be visible alongside spreadsheet data for conflict checking.
- **Per-instance trigger** — Rejected. A time-driven trigger for each event instance is unscalable and harder to debug.
- **Dynamic recurrence via sheet config** — Rejected for initial implementation. The hardcoded list is simpler; a config sheet could replace it later.

## Consequences

- The Events sheet must exist before the function runs, or it silently exits.
- If the script timezone changes, existing event dates remain in their original format — only newly generated events reflect the new timezone.
- Event names are human-readable and include the date (e.g. "青崇 - 01/08/2026"), which makes them clear in conflict error messages shown to members.
- A future improvement should add a dedup check: skip dates that already have events for the same Program_ID.
