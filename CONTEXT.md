# 顯恩堂系統 — EFCC Church Management System

**Church**: Evangelical Free Church of China — Glorious Grace Church (播道會顯恩堂)
**Repository**: `efcc`
**Stack**: Google Apps Script (V8 runtime) + Google Sheets + Tailwind CSS web app
**Runtime**: Google Apps Script (server), Browser (client)

---

## Domain Glossary

| Term (English) | Term (Chinese) | Definition |
|----------------|----------------|------------|
| Member | 會員 | A church member with a User_ID, username, PIN, QR code, role, and status (Active/Pending/Inactive). |
| Program | 課程 / 事工 | A class, activity, or ministry group members can enroll in (e.g. 青崇 Youth Worship). Each program has a `type` field for categorization. |
| Program Enrollment | 報名 | A member signing up for a program. Tracked in the Enrollments sheet with Active/Cancelled status. |
| Event | 聚會 | A specific instance of a program on a given date and time. Generated monthly for recurring programs. |
| Attendance | 出席 | A member checking in at a specific event instance. *(Not yet implemented in this codebase.)* |
| QR Code | QR 碼 | Auto-generated hex string serving as the member's check-in identifier (same value as User_ID by default). |
| PIN | PIN 碼 | 4-digit numeric credential used with username for member login. |

---

## Data Store (Google Sheets)

A single Google Spreadsheet with these named sheets:

| Sheet | Purpose | Key Columns |
|-------|---------|-------------|
| `Users` | Member records | User_ID, Name, Username, PIN_Code, Phone, Role, Status, QR_Code_String |
| `Programs` | Program catalog | Program_ID, Program_Name, Type, Description |
| `Enrollments` | Program membership | Enrollment_ID, User_ID, Program_ID, Timestamp, Status |
| `Events` | Scheduled instances | Event_ID, Program_ID, Event_Date, Time_Slot, Event_Name |

See ADR-0001 for the rationale behind Google Sheets as the database layer.

---

## Architecture Decisions

| # | Title | Status |
|---|-------|--------|
| 0001 | Google Sheets as Database | Accepted |
| 0002 | PIN-Based Authentication | Accepted |
| 0003 | Client-Server RPC via google.script.run | Accepted |
| 0004 | Monthly Recurring Event Generation | Accepted |
