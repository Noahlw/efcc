# 顯恩堂系統 — EFCC Church Management System

**Church**: Evangelical Free Church of China — Glorious Grace Church (播道會顯恩堂) **Repository**: `efcc` **Stack**: Google Apps Script (V8 runtime) + Google Sheets + vanilla HTML/CSS/JS multi-page web app served via HtmlService (styling stack under review — see [wayfinder D3 #21](https://github.com/Noahlw/efcc/issues/21)) **Frontend archive**: `程式碼.js` (reference) and `src/frontend/` (retired React SPA) **Runtime**: Google Apps Script (server), Browser (client)

---

## Domain Glossary

| Term (English) | Term (Chinese) | Definition |
| --- | --- | --- |
| Member | 會員 | A church member with a User_ID, username, PIN, QR code, role, and status (`Active`/`Pending`/`Inactive`). `Pending` members cannot log in until a `STAFF`/`ADMIN` approves them — see ADR-0006. |
| Role | 角色權限 | Global user permission level (`ADMIN`, `STAFF`, `MEMBER`) stored in `Users` sheet. Defaults to `MEMBER`. As of ADR-0006, `STAFF` has near-full parity with `ADMIN` except role-assignment involving an existing `STAFF` account. `ADMIN` is granted only via direct spreadsheet edit. See also **Program Leader** below — a separate, per-program permission, not a `Role` value. |
| Program | 課程 / 事工 | A class, activity, or ministry group members can enroll in (e.g. 青崇 Youth Worship). Each program has a `type` field for categorization. |
| Program Enrollment | 報名 | A member signing up for a program. Tracked in the Enrollments sheet with Active/Cancelled status. |
| Program Leader | 事工負責人 *(proposed — confirm translation)* | A member granted `STAFF`-equivalent event-management power (create/cancel/edit events, take attendance, view attendance) scoped to one or more specific programs, tracked in the `Program_Leaders` sheet. Independent of the member's global `Role`. Replaces the retired global `EVENT_LEADER` role (ADR-0006). |
| Event | 聚會 | A specific instance of a program on a given date and time. Generated monthly or dynamically by granted users. |
| Attendance | 出席 | A member checking in at a specific event instance via QR scan or manual search. |
| QR Code | QR 碼 | Auto-generated hex string serving as the member's check-in identifier (same value as User_ID by default). |
| PIN | PIN 碼 | 4-digit numeric credential used with username for member login. |

---

## Data Store (Google Sheets)

A single Google Spreadsheet with these named sheets:

| Sheet | Purpose | Key Columns |
| --- | --- | --- |
| `Users` | Member & Staff records | User_ID, Name, Username, PIN_Code, Phone, Role, Status, QR_Code_String |
| `Programs` | Program catalog | Program_ID, Program_Name, Type, Description |
| `Enrollments` | Program membership | Enrollment_ID, User_ID, Program_ID, Timestamp, Status |
| `Events` | Scheduled instances | Event_ID, Program_ID, Event_Date, Time_Slot, Event_Name |
| `Attendance` | Check-in records | Attendance_ID, Event_ID, User_ID, CheckIn_Time, CheckIn_Method, CheckIn_By |
| `Program_Leaders` | Per-program leader assignments (ADR-0006) | Assignment_ID, Program_ID, User_ID, Assigned_By, Assigned_Date, Status |
| `Audit_Log` | Admin action audit trail (ADR-0006) | Log_ID, Timestamp, Actor_User_ID, Action_Type, Target_User_ID, Old_Value, New_Value, Reason |

See ADR-0001 for the rationale behind Google Sheets as the database layer.

---

## Architecture Decisions

| #    | Title                                         | Status   |
| ---- | --------------------------------------------- | -------- |
| 0001 | Google Sheets as Database                     | Accepted |
| 0002 | PIN-Based Authentication                      | Accepted |
| 0003 | Client-Server RPC via google.script.run       | Accepted |
| 0004 | Monthly Recurring Event Generation            | Accepted |
| 0005 | Role-Based Access Control (RBAC) via PIN Auth           | Accepted — Amended by 0006 |
| 0006 | Admin Capability Matrix, Program Leader Model & Approval Flow | Accepted |
| 0007 | Vanilla Multi-Page HTML Service Architecture  | Accepted |
| 0008 | Schema-Driven Restart from GAS Template (Grills 1.1–1.5 locked) | Accepted |
| 0009 | Audit Log Write Pattern (LockService + Extended Schema) | Accepted |

---

## Known Tooling Issues

| Date | Issue | Impact | Workaround |
| --- | --- | --- | --- |
| 2026-07-28 | Context7 MCP rejects the configured API key (`ctx7sk-34b9ad88-...` in `~/.omp/agent/mcp.json`) with "Invalid API key" despite the key format being correct and matching `~/.config/context7/credentials.json`. Confirmed via `ctx_doctor` that context-mode itself is healthy — this is an upstream Context7 auth issue, not a local config error. | Cannot query Context7 for library/API docs. | Fall back to `web_search` + `librarian` subagent against primary sources (official docs, OWASP, etc.) until the key is regenerated at context7.com. |
