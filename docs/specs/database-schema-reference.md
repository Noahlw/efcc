# Database Schema — Authoritative Reference

*Renamed from `071-database-schema.md` on 2026-08-06: it is a reference doc parented to issue #70, not issue #71's spec (the `071-` prefix collided with `071-accessibility-acceptance-plan.md`). ADR-0013 remains the canonical version-controlled sheet-schema authority; this file is the production column reference it points to.*

**Source of truth:** `Copy of Church Attendance System.xlsx` (production export)
**Purpose:** Single source of truth for all sheet structures, column names, and data formats. Resolve every "what column is this?" question from this file alone.
**Date:** 2026-07-29
**Parent:** Issue #70 (discovered during login-gate debugging)

---

## 1. Users (`Users`)

### Columns (authoritative, from xlsx row 9 header)

| # | Header | Format / Example | Code field |
|---|--------|-----------------|------------|
| 1 | `User_ID` | `GC-2F02-89EF` | `USER_ID` |
| 2 | `Username` | `alice` | `USERNAME` |
| 3 | `Name` | `Alice` | `NAME` |
| 4 | `Email` | (often empty) | **Not read** |
| 5 | `Phone` | `12341234` | `PHONE` |
| 6 | `Date of Birth` | (often empty) | **Not read** |
| 7 | `Age` | (often empty) | **Not read** |
| 8 | `PIN_Code` | `1461` | `PIN_CODE` |
| 9 | `QR_Code_String` | `GC-C88C-85E1` | `QR_CODE_STRING` |
| 10 | `System_Role` | `Member` | `ROLE` (candidates: `["Role", "System_Role"]`) |
| 11 | `Status` | `Active` | `STATUS` |
| 12 | `Whatsapp Message` | `1` or empty | **Not read** |
| 13 | `青崇？` | empty | **Not read** |
| 14 | (empty header) | empty | **Not read** |

**Total:** 14 columns (header row revealed by `getDataRange().getValues()`)

### Authoritative values

| Field | Valid values | Default |
|-------|-------------|---------|
| `System_Role` | `Admin`, `Teacher`, `Member` (lowercased to `MEMBER` by code) | `MEMBER` |
| `Status` | `Active`, (any non-`active` value blocks login) | (must be set) |
| `User_ID` format | `GC-XXXX-XXXX` (uppercase hex, 4 chars per segment) | — |
| `PIN_Code` | 4-digit numeric string (`1000`–`9999`) | — |

### Conflicts found

| # | Severity | Location | Issue |
|---|----------|----------|-------|
| **C1** | **HIGH** | `program-leaders-repository.gs:77,100` | **Hardcoded column indexes `row[2]` (User_ID) and `row[5]` (Status) instead of header-name resolution.** If the Program_Leaders sheet ever gains or reorders columns, the leader assignments silently misread. Should use `programLeadersResolveColumns_()` just like `usersResolveColumns_()`. |
| **C2** | **HIGH** | `src/gas/users-repository.gs:4-7` (header comment) | **Outdated column order comment.** The comment says `User_ID | Name | Username | PIN_Code | Phone | Role | Status | QR_Code_String` (8 columns, `Role` not `System_Role`). Actual production sheet has 14 columns with `System_Role`. The code itself is correct (header-name resolution), but the comment is dangerously misleading for maintainers. |
| **C3** | **HIGH** | Manual Sheet edits | **Column misalignment when creating users manually.** New rows 99–111 in the production sheet have their data shifted left by up to 2 positions because `Date of Birth` and `Age` (columns 6–7) were omitted. This puts `PIN_Code` one column early (col 7 instead of 8) and `Status` at col 11 instead of 11 — but actually `Status` ends up at the correct column 11 or empty because the missing shift affects everything. *Root cause: manually adding a row with fewer populated cells than the header.* |
| **C4** | **MEDIUM** | `docs/specs/067-role-nav-acceptance-plan.md:125-131` | **Simplified Users schema in test docs.** The acceptance plan says `User_ID, Username, Name, PIN_Code, System_Role, Status, QR_Code_String` (7 columns). This is fine for seed data but a maintainer might mistake it for the full production schema. |
| **C5** | **MEDIUM** | `docs/specs/001-member-registration.md:31` | **Says "Role" not "System_Role".** Section "Enrollment Table" column table lists `Role = "Member"`. The actual production header is `System_Role`. Should say `System_Role = "Member"` or at minimum note the two possible header names. |
| **C6** | **LOW** | `CONTEXT.md:52-54` | **Says 13 columns, omits the 14th** (empty header). The production sheet has 14 columns. The difference is invisible to code (header-name resolution ignores extra columns) but it means the doc is incomplete. |

---

## 2. Programs (`Programs`)

**Source:** xlsx → single data row: `dd646847 | 青崇 | 青少年崇拜 | 逢星期日 3pm-4pm`

### Columns

| # | Header | Example | Candidates |
|---|--------|---------|------------|
| 1 | `Program_ID` | `dd646847` | `program_id`, `program id`, `programid` |
| 2 | `Program_Name` | `青崇` | `program_name`, `program name`, `name` |
| 3 | `Type` | `青少年崇拜` | `type` |
| 4 | `Description` | `逢星期日 3pm-4pm` | `description`, `program_description`, `program description` |

### Status

- Header-name resolution ✅ (implemented in `programs-repository.gs:65-85`)
- No conflicts found

---

## 3. Program_Leaders (`Program_Leaders`)

### Columns (from spec 009, ADR-0006, and `program-leaders-repository.gs` row 0 fallback header)

| # | Header | Example | Code access |
|---|--------|---------|-------------|
| 1 | `Assignment_ID` | `ASSIGN-001` | **Hardcoded index 0** |
| 2 | `Program_ID` | `dd646847` | **Hardcoded index 1** |
| 3 | `User_ID` | `GC-C88C-85E1` | **Hardcoded index 2** |
| 4 | `Assigned_By` | `GC-C436-4943` | **Hardcoded index 3** |
| 5 | `Assigned_Date` | `2026-07-01` | **Hardcoded index 4** |
| 6 | `Status` | `Active` | **Hardcoded index 5** |

### Conflicts found

| # | Severity | Location | Issue |
|---|----------|----------|-------|
| **C1** | **HIGH** | `program-leaders-repository.gs:77,100` | **Hardcoded indexes `row[2]` and `row[5]`.** Same structural risk as C2 but in a different file. Should use header-name matching like every other repository. |

---

## 4. Other sheets (spec-defined only, no code has been written yet)

These sheets are defined in specs but have no repository files or RPC code in `src/gas/`. They are documented here for completeness — the specs ARE the authority until code exists.

### 4a. Enrollments

| Header | Source | Notes |
|--------|--------|-------|
| `Enrollment_ID` | spec 002 | Format `ENR-XXXXXXXX` |
| `User_ID` | spec 002 | FK → Users.User_ID |
| `Program_ID` | spec 002 | FK → Programs.Program_ID |
| `Timestamp` | spec 002 | `new Date()` written |
| `Status` | spec 002 | `Active` or `Cancelled` |

### 4b. Events

| Header | Source | Notes |
|--------|--------|-------|
| `Event_ID` | spec 003/005 | Format `EVT-XXXXXXXX` (003) or `EVT-A1B2C3D4` (005) — **CONFLICT** |
| `Program_ID` | spec 003/005 | FK → Programs.Program_ID |
| `Event_Date` | spec 003/005 | `dd/MM/YYYY` (003) or `YYYY-MM-DD` (005) — **CONFLICT** |
| `Time_Slot` | spec 003/005 | `3:00 PM` (003) or `HH:mm` (005) — **CONFLICT** |
| `Event_Name` | spec 003/005 | `青崇 - 01/08/2026` format |
| `Recurrence_Tag` | spec 005 only | `NONE`, `WEEKLY`, `MONTHLY` |
| `Created_By` | spec 005 only | User_ID of creator |
| `Status` | spec 005 | `Active` or `Cancelled` |

**CONFLICT:** Spec 003 and spec 005 define overlapping Events columns with different formats for `Event_ID`, `Event_Date`, and `Time_Slot`. These must be reconciled before implementation.

### 4c. Attendance

| Header | Source |
|--------|--------|
| `Attendance_ID` | spec 006 |
| `Event_ID` | spec 006 |
| `User_ID` | spec 006 |
| `CheckIn_Time` | spec 006 |
| `CheckIn_Method` | spec 006 |
| `CheckIn_By` | spec 006 |
| `Status` | spec 006 |

### 4d. Audit_Log

| Header | Source |
|--------|--------|
| `Log_ID` | CONTEXT.md |
| `Timestamp` | CONTEXT.md |
| `Actor_User_ID` | CONTEXT.md |
| `Action_Type` | CONTEXT.md |
| `Target_User_ID` | CONTEXT.md |
| `Old_Value` | CONTEXT.md |
| `New_Value` | CONTEXT.md |
| `Reason` | CONTEXT.md |

---

## 5. Global Rule: Header-Name Resolution

All repositories resolving column positions **should** use header-name matching (case-insensitive) like `users-resolveColumns_()` and `programsResolveColumns_()`. This is the project's established pattern.

### Currently compliant

- `users-repository.gs` ✅ (header-name, via `usersResolveColumns_()`)
- `programs-repository.gs` ✅ (header-name, via `programsResolveColumns_()`)

### Currently non-compliant (must fix)

- `program-leaders-repository.gs` ❌ (hardcoded indexes `row[2]`, `row[5]`)

---

## 6. Recommended Fixes

| Priority | Fix | Files touched |
|----------|-----|---------------|
| **P0** | Fix column alignment in Users sheet for rows 99–111 (insert empty cells between Name and PIN_Code) | Google Sheets (manual) |
| **P0** | Add header-name resolution to `program-leaders-repository.gs` (replace `row[2]`/`row[5]` with dynamically resolved column indexes) | `src/gas/program-leaders-repository.gs` |
| **P1** | Update `users-repository.gs` header comment to show the real 14-column production layout | `src/gas/users-repository.gs` (comment lines 4-7) |
| **P1** | Reconcile Events column format between spec 003 and spec 005 before implementing | `docs/specs/003-events-recurring.md`, `docs/specs/005-dynamic-event-management.md` |
| **P2** | Update `docs/specs/001-member-registration.md` to say `System_Role` not `Role` | `docs/specs/001-member-registration.md` |
| **P2** | Update `CONTEXT.md` Users description to mention the 14th column | `CONTEXT.md` |
