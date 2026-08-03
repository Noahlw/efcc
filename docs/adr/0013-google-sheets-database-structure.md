# DB-001: Google Sheets Database Structure

**Status:** Active
**Date:** 2026-07-30
**Source:** Production spreadsheet "Copy of Church Attendance System.xlsx" (990-row Users sheet, exported for structural reference)
**Supersedes:** `CONTEXT.md § Data Store` — DB-001 is the canonical record; CONTEXT.md is a convenience summary that cross-references here.
**Depends on:** ADR-0001 (Google Sheets as the database layer); ADR-0006 (Admin capability matrix, for the role/assignment concepts this spec encodes).
This document is the **single authoritative record** of the Google Sheets database
structure. Every repository file, test fixture, CONTEXT.md entry, and future schema
change MUST derive from this document. When a column name, order, or sheet tab
changes in production, this document is updated first, then the code follows.

## Sheet inventory (10 tabs)

| Tab # | Sheet Name | Purpose | Code Access |
|-------|-----------|---------|-------------|
| 1 | Programs | Course/program catalog | `programs-repository.gs` |
| 2 | Users | Member/staff/admin accounts | `users-repository.gs` |
| 3 | Users詳細資料 | Extended user details (unused by code) | None |
| 4 | Attendances | Attendance/check-in records | None (future) |
| 5–10 | (various) | Not yet mapped | None |

---

## Sheet 1: Programs

**Sheet name constant:** `PROGRAMS_SHEET_NAME = "Programs"` (`programs-repository.gs:40`)

| # | Header | Type | Required | Description |
|---|--------|------|----------|-------------|
| 1 | Program_ID | string | Yes | Unique ID (e.g. `dd646847`). Rows with empty ID are silently dropped. |
| 2 | Program_Name | string | Yes | Display name (e.g. `青崇`) |
| 3 | Type | string | No | Category (e.g. `青少年崇拜`) |
| 4 | Description | string | No | Free text, may contain line breaks and URLs (safe-rendered client-side) |

**Code contract:**
- DTO: `{id: string, name: string, type: string, description: string}`
- Cache: script-scoped, key `"programs_catalog_v1"`, TTL 300s
- Column resolution: header-name-based, case-insensitive (see `programsResolveColumns_`)
- Missing-column behavior: returns `""` for each missing field (does NOT throw)
- Header candidates per field:
  - ID: `["program_id", "program id", "programid"]`
  - NAME: `["program_name", "program name", "name"]`
  - TYPE: `["type"]`
  - DESCRIPTION: `["description", "program_description", "program description"]`

---

## Sheet 2: Users

**Sheet name constant:** `USERS_SHEET_NAME = "Users"` (`users-repository.gs:22`)

| # | Header | Type | Required | Description |
|---|--------|------|----------|-------------|
| 1 | User_ID | string | Yes | Unique identifier, format `GC-XXXX-XXXX` |
| 2 | Username | string | Yes | Login username (case-insensitive lookup) |
| 3 | Name | string | Yes | Display name |
| 4 | Email | string | No | Unused by code |
| 5 | Phone | string | No | Contact phone |
| 6 | Date of Birth | string | No | Unused by code |
| 7 | Age | string | No | Unused by code |
| 8 | PIN_Code | string | Yes | 4-digit PIN (rightmost 4 digits used by `sessionNormalizePin_`) |
| 9 | QR_Code_String | string | Yes | Typically same as User_ID |
| 10 | System_Role | string | Yes | One of: `Admin`, `Staff`, `Member`. **NB: the header is `System_Role`, NOT `Role`.** |
| 11 | Status | string | Yes | Must be `Active` (case-insensitive) for login to succeed. Empty Status blocks login. |
| 12 | Whatsapp Message | string | No | Binary flag (`1` or empty). Unused by code. |
| 13 | 青崇？ | string | No | Program-specific flag. Unused by code. |
| 14 | (empty header) | string | No | Trailing empty column. Unused by code. |

**Code contract:**
- DTO: `{userId, name, username, phone, role, status, qrCodeString, __sheetRow}`
  - PIN is intentionally omitted from the DTO (read separately via `usersCurrentPinById_`)
  - `role` is uppercased and defaults to `"MEMBER"`
  - `__sheetRow` is diagnostic only, never exposed to the client
- Column resolution: header-name-based, case-insensitive (see `usersResolveColumns_`)
- Throws if any required header is missing
- Header candidates per field:
  - USER_ID: `["User_ID"]`
  - NAME: `["Name"]`
  - USERNAME: `["Username"]`
  - PIN_CODE: `["PIN_Code"]`
  - PHONE: `["Phone"]`
  - ROLE: `["Role", "System_Role"]` (production uses `System_Role`)
  - STATUS: `["Status"]`
  - QR_CODE_STRING: `["QR_Code_String"]`
- Extra columns (Email, DOB, Age, 青崇？, etc.) are silently ignored

---

## Sheet 4: Attendances

**Sheet name:** `Attendances` (not yet accessed by code)

| # | Header | Type | Description |
|---|--------|------|-------------|
| 1 | Attendance_ID | string | Unique ID |
| 2 | Member_Name | string | Display name at time of check-in |
| 3 | Event_Date | number | Excel serial date (e.g. `46215`) |
| 4 | Event_ID | string | References an Events sheet (not yet mapped) |
| 5 | User_ID | string | Foreign key to Users.User_ID |
| 6 | Timestamp | number | Excel serial datetime |
| 7 | Month | string | YYYY-MM formatted month |
| 8 | Age_Group | string | Usually empty |
| 9 | Small_Group | string | Usually `#N/A` |

---

## Sheet (proposed): Program_Leaders

**Sheet name constant:** `PROGRAM_LEADERS_SHEET_NAME = "Program_Leaders"` (`program-leaders-repository.gs:21`)

**Note:** This sheet does NOT exist in the production xlsx. It is additive — the
repository returns empty results when the sheet is missing.

| # | Header | Type | Required | Description |
|---|--------|------|----------|-------------|
| 1 | Assignment_ID | string | Yes | Unique assignment ID |
| 2 | Program_ID | string | Yes | Foreign key to Programs.Program_ID |
| 3 | User_ID | string | Yes | Foreign key to Users.User_ID |
| 4 | Assigned_By | string | No | Who created the assignment |
| 5 | Assigned_Date | string | No | Assignment date |
| 6 | Status | string | Yes | Must be `Active` |

---

## Sheet (proposed): Audit_Log

**Note:** This sheet does NOT exist in the production xlsx. It is additive. Schema
settled by ADR-0015, reconciling drift across ADR-0006, ADR-0009, and spec #63 —
see ADR-0015 for full rationale per column.

| # | Header | Type | Required | Description |
|---|--------|------|----------|-------------|
| 1 | Log_ID | string | Yes | `Utilities.getUuid()`, row PK |
| 2 | Timestamp | date | Yes | `new Date()`, sheet-native |
| 3 | Actor_User_ID | string | Yes | Authenticated EFCC session's `User_ID` |
| 4 | Action_Type | string | Yes | `PROGRAM_LEADER_GRANT`, `PROGRAM_LEADER_REVOKE`, `ENROLLMENT_ASSISTED_ADD`, `ENROLLMENT_ASSISTED_CANCEL`, `EVENT_CREATE`, `EVENT_CANCEL`, `EVENT_EDIT`, `ATTENDANCE_CHECKIN`, `ATTENDANCE_VOID`, `ROLE_CHANGE` (defined, currently unreachable — role changes are spreadsheet-only per spec #63) |
| 5 | Target_User_ID | string | No | Member acted upon |
| 6 | Target_Program_ID | string | No | Blank when not applicable |
| 7 | Target_Event_ID | string | No | Blank when not applicable |
| 8 | Old_Value | string | No | — |
| 9 | New_Value | string | No | — |
| 10 | Reason | string | No | Optional |
| 11 | Outcome | string | Yes | `SUCCESS`\|`DUPLICATE`\|`CONFLICT`\|`DENIED`\|`FAILED` — see ADR-0015 §3 |
| 12 | Correlation_ID | string | Yes | The RPC's own `requestId` from `rpcRequestId_()` (`rpc-envelope.gs`) — joins to `rpcLog_` Cloud Logging diagnostics |

---

## Code-to-DB coupling map

| Code File | Sheet(s) | Column Access Method | Hardcoded Indexes? |
|-----------|----------|---------------------|--------------------|
| `users-repository.gs` | Users | `USERS_COL.<FIELD>` (resolved) | No |
| `programs-repository.gs` | Programs | `cols.<field>` (resolved) | No |
| `program-leaders-repository.gs` | Program_Leaders | `PROGRAM_LEADERS_COL_` (resolved) | No (as of `6816607`) |
| `session.js.gs` | Users | Via `usersCurrentPinById_()` / `usersStatusById_()` | Inherits repository |
| `Code.gs` | None directly | Via `usersFindById_()` / `programsList_()` | Inherits repository |

## Known issues

| # | Severity | Issue | Status |
|---|----------|-------|--------|
| 1 | HIGH | `users-repository.gs` header comment (lines 5-6) documents the column order as `(0) User_ID, (1) Name, (2) Username`. The actual production order is `(0) User_ID, (1) Username, (2) Name`. The header-name resolver handles this correctly at runtime, but the doc is misleading. | Open — doc fix only, no code change needed |
| 2 | MEDIUM | Test fixtures use a simplified 8-column Users header (via `makeUsersSheet` helpers in `tests/gas/*.test.js`); only `login-and-bootstrap.test.js` exercises the real 14-column production layout. A future column addition to the production sheet would not be caught by most unit tests. | Open — add a "shape parity" test that compares each fixture header to the ADR-0013 column list |
| 3 | MEDIUM | `programLeadersReadAll_()` sheet-missing path returns `[]` directly without populating `PROGRAM_LEADERS_CACHE_`, so subsequent calls re-run `SpreadsheetApp.getActiveSpreadsheet()` and `getSheetByName()` instead of short-circuiting. Functionally harmless but a caching regression. | Open — set `PROGRAM_LEADERS_CACHE_ = []` in the missing-sheet path, not `null` |
| 4 | LOW | Header-candidate list for `ROLE` in `USERS_COL_CANDIDATES_` accepts `["Role", "System_Role"]`. The second is production-canonical; the first is a legacy fallback for older sheets. Once the production Sheet is guaranteed to use `System_Role` exclusively, the `Role` candidate could be removed. | Open — coordinate with user before removing |

## Resolved issues (logged for traceability)

| # | Issue | Fixed in | Note |
|---|-------|----------|------|
| 1 | `program-leaders-repository.gs` used hardcoded numeric indexes (`row[1]`, `row[2]`, `row[5]`) instead of `PROGRAM_LEADERS_COL_` lookups. | `6816607` (commit on `feat/issue-70-form-protection`) | Any column reorder in Program_Leaders would have silently corrupted leader lookups. Replaced all six hardcoded indices with `PROGRAM_LEADERS_COL_.<FIELD>` references. Verified by 150/150 Vitest tests passing. |
