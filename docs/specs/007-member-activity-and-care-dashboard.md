# Module Specification: Member Activity History & Care Dashboard

**Status**: Draft  
**Date**: 2026-07-27  
**Context**: 顯恩堂系統 / EFCC Church Management System  
**Parent Wayfinder Ticket**: #6 — Activity History Profile & Inactive Member Care Dashboard

---

## 1. Purpose

Provide church staff and administrators (`STAFF`, `ADMIN`) with:

1. **Member Activity Profile**: Detailed historical attendance breakdown per member across all enrolled programs.
2. **Inactive Member Care Dashboard**: Automatic identification of inactive members (enrolled but missing check-ins) to enable timely pastoral care, outreach, and contact.

---

## 2. Inactivity Calculation Logic

An active church member is flagged as **"Needing Care / Inactive"** if they satisfy ALL of the following:

1. `Users.Status` == `"Active"`
2. Member is enrolled in at least 1 active program (`Enrollments.Status` == `"Active"`).
3. Member has **zero check-ins** in the `Attendance` sheet within the configured inactivity window (Default: **30 days**; configurable to 14, 30, 60, or 90 days).

### Coverage assumption

Every active member is expected to have at least one active Program enrollment.
This is already expected for the initial Youth rollout and must remain true as
the system expands to the rest of the church. A member with no active enrollment
is outside the Care calculation and represents a Program-assignment/data-quality
gap, not a separate Care category.

---

## 3. RPC Endpoint Contracts

### 3.1 `api_getUserActivityProfile(payload)`

Returns full activity history for a specific member.

**Payload**:

```json
{
  "userId": "GC-A1B2-C3D4"
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "user": {
      "userId": "GC-A1B2-C3D4",
      "name": "張三",
      "phone": "91234567",
      "status": "Active"
    },
    "summary": {
      "totalCheckIns": 12,
      "attendanceRate": 85.7,
      "lastActiveDate": "2026-07-20"
    },
    "enrolledPrograms": [
      {
        "programId": "dd646847",
        "programName": "青崇",
        "checkInCount": 10,
        "lastCheckIn": "2026-07-20"
      }
    ],
    "recentAttendance": [
      {
        "attendanceId": "ATT-9C8B7A6F",
        "eventName": "青崇 - 20/07/2026",
        "checkInTime": "2026-07-20 15:31:00",
        "method": "QR_SCAN"
      }
    ]
  }
}
```

---

### 3.2 `api_getCareDashboard(payload)`

Returns dashboard summary metrics and the list of inactive members needing pastoral care.

**Payload**:

```json
{
  "userId": "GC-STAFF-001",
  "thresholdDays": 30,
  "programId": "all"
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "metrics": {
      "totalActiveMembers": 120,
      "activeThisMonth": 95,
      "inactiveNeedingCare": 25,
      "inactivityRate": 20.8
    },
    "inactiveMembers": [
      {
        "userId": "GC-B2C3-D4E5",
        "name": "李四",
        "phone": "98765432",
        "enrolledPrograms": ["青崇", "成人主日學"],
        "lastActiveDate": "2026-06-15",
        "daysInactive": 42,
        "whatsappUrl": "https://wa.me/85298765432?text=%E4%BD%A0%E5%A5%BD%EF%BC%8C%E9%A1%AF%E6%81%A9%E5%A0%82%E9%97%9C%E6%87%B7"
      }
    ]
  }
}
```

---

## 4. Staff UI Design (`CareDashboardView.tsx`)

1. **Header Cards — Deferred to a separate Care metrics ticket**:
   - 👥 Total Active Members
   - ✅ Active in Past 30 Days
   - ⚠️ Inactive (Needing Care)
   - These cards are not part of the first functional release. Until the
     denominator and program-filter behavior are specified and deployed-tested,
     the UI must omit them rather than display placeholder, inferred, or
     misleading percentages.
2. **Filters & Controls**:
   - Inactivity Threshold selector (14 Days / 30 Days / 60 Days / 90 Days).
   - Program dropdown filter (All Programs / 青崇 / 主日學).
   - Search box (by Name / Phone).
3. **Actionable Roster Table**:
   - Member Name & Phone.
   - Enrolled Programs badges.
   - Last Check-in Date & Days Inactive badge.
   - **One-click Care Actions**: Direct WhatsApp message link (`wa.me`) or Phone call trigger.
   - Click row → opens full Member Activity Profile modal.

The inactive-member roster and STAFF/ADMIN access boundary remain in scope; only
the aggregate header metrics are deferred.

---

## 5. Related ADRs & Specs

- **ADR-0005**: Role-Based Access Control (`checkPermission_` guards endpoint for `STAFF`/`ADMIN`).
- **Spec 006**: Attendance Tracking System (`Attendance` sheet supplies raw check-in data).
