# ADR-0005: Role-Based Access Control (RBAC) via PIN Auth

**Status**: Accepted  
**Date**: 2026-07-27  
**Context**: 顯恩堂系統 / EFCC Church Management System  
**Parent Wayfinder Ticket**: #3 — Gmail-based Permission System & Role Hierarchy Architecture

---

## Decision

Implement Role-Based Access Control (RBAC) by adding a `Role` column to the `Users` sheet while preserving 100% of the existing Username + 4-digit PIN authentication flow for all members and staff. Automatic Gmail Single Sign-On (SSO) is deferred to a future enhancement to minimize friction and keep the login experience identical for church members.

---

## Rationale

1. **Member Login Preservation**: Church members are familiar with Username + PIN login. Forcing Google Account authentication or external OAuth logins would create unnecessary friction and onboarding confusion for church members.
2. **Minimal Schema Friction**: Adding a single `Role` column to the existing `Users` spreadsheet allows instantaneous permission checks without introducing new complex credential tables or authentication microservices.
3. **Clear Role Hierarchy**:
   - `ADMIN`: Full access (system administration, role management, program catalog editing, event management, care dashboard, attendance).
   - `STAFF`: Pastoral and administrative access (create/manage events, view inactive member care dashboard, take attendance, search member profiles).
   - `EVENT_LEADER`: Operational access (create/manage events for assigned programs, take attendance).
   - `MEMBER`: Standard member access (view profile, enroll in programs, view check-in QR code).
4. **Backward Compatibility**: Any user record in the `Users` sheet with an empty or missing `Role` cell automatically defaults to `MEMBER`.

---

## Data Model Updates (`Users` Sheet)

| Column Header | Type | Allowed Values | Default | Description |
|---------------|------|----------------|---------|-------------|
| `Role` | String | `ADMIN`, `STAFF`, `EVENT_LEADER`, `MEMBER` | `MEMBER` | Determines UI tabs unlocked and RPC endpoint authorization. |

---

## Backend Authorization Guards

Every administrative Apps Script RPC function (e.g. `api_createEvent`, `api_getCareDashboard`) performs a server-side permission check:

```javascript
function checkPermission_(userId, requiredRole) {
  var user = getUserById_(userId);
  if (!user || !user.role) {
    throw new Error("Unauthorized: Role required");
  }
  var rolesPriority = { "MEMBER": 1, "EVENT_LEADER": 2, "STAFF": 3, "ADMIN": 4 };
  if (rolesPriority[user.role] < rolesPriority[requiredRole]) {
    throw new Error("Forbidden: Insufficient privileges");
  }
}
```

---

## Deferred Scope (Future Enhancement)

- **Gmail Single Sign-On (SSO)**: Optional Google Account matching via `Session.getActiveUser().getEmail()` will be tracked in a separate, deferred ticket for staff convenience in a future phase.

---

## Consequences

- Member login remains 100% unchanged — users log in using Username + 4-digit PIN.
- Staff/Admins use their existing PIN credentials to log in, and their `Role` in the `Users` sheet automatically unlocks staff-only UI tabs (Care Dashboard, Event Creator, Attendance Scanner).
- Role changes are performed by updating the `Role` column in the `Users` spreadsheet or via the Admin UI.
