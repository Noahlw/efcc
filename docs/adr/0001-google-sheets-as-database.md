# ADR-0001: Google Sheets as Database

**Status**: Accepted  
**Date**: 2026-07-27  
**Context**: 顯恩堂系統 / EFCC Church Management System

## Decision

Use Google Sheets (via `SpreadsheetApp` in Google Apps Script) as the primary data store for all application data, with each logical entity stored in a named sheet within a single spreadsheet.

## Rationale

- **Zero infrastructure** — No external database server, no credentials to manage, no hosting cost. The spreadsheet is part of the Google Apps Script project's own Google Drive context.
- **Shared administration** — Church administrators can view and edit member data directly in the spreadsheet without a custom admin panel. This was a key requirement.
- **Adequate scale** — The expected data volume (hundreds of members, dozens of programs, thousands of events) is well within Google Sheets' limits.
- **Built-in caching** — `CacheService` (ScriptCache) is used for frequently accessed but slowly changing data (program catalog), reducing spreadsheet read calls.
- **Rapid iteration** — No schema migrations, no deploy pipeline for schema changes. Add a column to the sheet, and the code adapts via header-name lookup.

## Constraints

- **No relational integrity** — Enforced in application code. There are no foreign keys, cascading deletes, or transaction isolation.
- **No real-time queries** — `SpreadsheetApp` is synchronous and not designed for concurrent writes. Write contention is avoided by the single-user/admin operational model.
- **Row limits** — Google Sheets caps at 10M cells. With ~10 columns per sheet, that's ~1M rows per sheet — far beyond projected needs.
- **Performance on large data** — `getDataRange().getValues()` loads the entire sheet into memory. For sheets projected to grow beyond thousands of rows, pagination or range-limited reads will be needed.

## Alternatives Considered

- **Firebase / Firestore** — Rejected due to additional cost, authentication setup, and losing the "shared admin spreadsheet" workflow.
- **SQLite via JDBC** — Rejected because it requires an external database host and the Google Sheets admin interface was preferred.
- **Google Cloud SQL** — Rejected as excessive for the data volume and operational complexity.

## Consequences

- All business logic reads and writes through named header indexes — adding/renaming columns in the sheet is safe as long as the code's header-name fallback chains cover the variations.
- The `Enrollments` sheet uses a soft-delete pattern (Status: Active → Cancelled) rather than row deletion.
- A deployment consists of pushing updated script code via `clasp push` — the spreadsheet schema is versioned only by convention.
