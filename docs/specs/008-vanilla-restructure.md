# Spec 008 — Vanilla Multi-Page Restructure

**Date**: 2026-07-28
**Parent**: Wayfinder Map #18
**ADR**: 0007 — Vanilla Multi-Page HTML Service Architecture

---

## Target Structure

```
src/gas/
├── appsscript.json          ← webapp config (unchanged)
├── Code.gs                  ← doGet(?page=) routing + include()
├── auth.gs                  ← login/logout/session + role guards
├── members.gs               ← member registration / search / profile update
├── events.gs                ← event create / cancel / list
├── programs.gs              ← program catalog + enrollment RPCs
├── attendance.gs            ← check-in + attendance RPCs
├── dashboard.gs             ← care dashboard RPCs
├── index.html               ← Login page      (?page=login)
├── register.html            ← Registration    (?page=register)
├── profile.html             ← My Profile      (?page=profile)
├── programs.html            ← Programs        (?page=programs)
├── events.html              ← Events          (?page=events)
├── scanner.html             ← Attendance      (?page=scanner)
├── dashboard.html           ← Care Dashboard  (?page=dashboard)
├── styles.html              ← Shared CSS      (<style>...</style>)
└── app.js.html              ← Shared JS: session, api, navigation  (<script>...</script>)
```

---

## File Responsibilities

### Server-side (.gs)

| File | Contains | From 程式碼.js |
|------|----------|-----------------|
| `Code.gs` | `doGet(e)`, `include()`, `normalizeHeader_`, `findHeaderIndex_`, `normalizeId_`, `isActiveStatus_` | L1–135 |
| `auth.gs` | `verifyLogin`, `api_loginUser`, `api_registerUser`, `api_getCurrentSession`, `api_logoutUser`, `api_updateCredentials`, `verifySessionToken_`, `checkRoleAtLeast_`, `checkIsGrantedUser_`, `resolveSessionUser_` | L92–985 (auth), L1125–1169 (guards), L1930–1963 (session resolve) |
| `members.gs` | `registerNewMember`, `api_searchMembers` | L515–604, L1507–1565 |
| `events.gs` | `generateMonthlyRecurringEvents`, `api_createEvent`, `api_cancelEvent`, `api_getGrantedUserEvents`, `onEdit` (simple trigger for auto-generating monthly events) | L606–640, L643–1498 |
| `programs.gs` | `getProgramsCatalog`, `getUserEnrolledProgramIds`, `getAvailablePrograms`, `enrollUser`, `cancelEnrollment`, `api_getProgramsCatalog`, `api_getAvailablePrograms`, `api_enrollUser`, `api_cancelEnrollment`, `api_staffEnrollMember` | L137–269, L271–476, L1073–1118 |
| `attendance.gs` | `api_checkInMember`, `api_getEventAttendance` | L1567–1919 |
| `dashboard.gs` | `api_getUserActivityProfile`, `api_getCareDashboard` | L1965–2269 |

### Client-side (.html)

Every page follows this template:

```html
<!DOCTYPE html>
<html lang="zh-HK">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <base target="_top">
  <title>...</title>
  <?!= include('styles') ?>
</head>
<body>
  ...page-specific markup...
  <?!= include('app.js') ?>
</body>
</html>
```

| File | Content | Reference |
|------|---------|-----------|
| `index.html` | Username + PIN form, error display, redirect on success | `LoginView.tsx` |
| `register.html` | Name + phone form, success/error display | `MemberRegistrationView.tsx` |
| `profile.html` | Member info card, role badge, QR pass modal, pin/username update form | `MyProfileView.tsx`, `MemberPassModal.tsx` |
| `programs.html` | Two-section page (catalog tab + my enrollments tab) with enrollment toggle buttons | `ProgramCatalogView.tsx`, `ProgramEnrollmentView.tsx` |
| `events.html` | Granted-user event list, create event form, cancel action | `EventManagementView.tsx`, `CreateEventForm.tsx` |
| `scanner.html` | QR camera scanner + manual name/phone search + check-in confirmation | `AttendanceScannerView.tsx`, `ManualSearchInput.tsx` |
| `dashboard.html` | Inactive member list, activity stats, pastoral action links | `CareDashboardView.tsx` |

### Shared assets

| File | Content |
|------|---------|
| `styles.html` | CSS custom properties (design tokens), base reset, typography, layout utilities, component classes. Wrapped in `<style>` tags. |
| `app.js.html` | Session token management, `apiCall()` wrapper for `google.script.run`, navigation helper `navigate(page)`, role-based UI gating utilities. Wrapped in `<script>` tags. |

---

## Shared JS (`app.js.html`) Contract

```javascript
// Session management
sessionManager.getToken();       // from sessionStorage
sessionManager.set(token, user); // write to sessionStorage
sessionManager.clear();          // logout
sessionManager.getUser();        // cached user object

// API wrapper — wraps google.script.run with promise-like ergonomics
api.call('api_getCurrentSession', userId, token).then(onSuccess).catch(onError);
// Underneath: google.script.run.withSuccessHandler().withFailureHandler().api_*(...)

// Navigation
navigate('events');  // window.location = '?page=events'

// Role check (client-side convenience — server is authoritative)
isGrantedUser();     // true for STAFF, ADMIN, EVENT_LEADER
isStaff();           // true for STAFF, ADMIN

// Reads current user from sessionStorage
```

---

## Shared CSS (`styles.html`) Token Set

```css
:root {
  /* Color palette */
  --color-surface: #fff;
  --color-surface-muted: #f1f5f9;
  --color-text: #0f172a;
  --color-text-muted: #64748b;
  --color-accent: #2563eb;
  --color-accent-hover: #1d4ed8;
  --color-danger: #b91c1c;
  --color-success: #0f766e;

  /* Role badges */
  --color-role-admin: #b91c1c;
  --color-role-staff: #1d4ed8;
  --color-role-event-leader: #7c3aed;
  --color-role-member: #0f766e;

  /* Typography */
  --font-family: system-ui, -apple-system, sans-serif;
  --text-base: 1rem;
  --text-sm: 0.875rem;
  --text-lg: 1.25rem;
  --text-xl: 1.5rem;

  /* Spacing */
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2rem;

  /* Radii */
  --radius-sm: 0.5rem;
  --radius-md: 0.75rem;
  --radius-full: 999px;

  /* Shadows */
  --shadow-card: 0 8px 24px rgba(15, 23, 42, 0.08);
}
```

---

## Clasp Configuration

`.clasp.json`:
```json
{
  "scriptId": "11FXWYDvyLxxa6K01tEZeWn9g8JYOdyXoWJWmWFmo2LMXjjrKYmpCSXIK",
  "rootDir": "src/gas",
  "scriptExtensions": [".js", ".gs"],
  "htmlExtensions": [".html"],
  "jsonExtensions": [".json"]
}
```

`.claspignore`:
```
**/**
!**/*.gs
!**/*.html
!appsscript.json
```

---

## Migration Approach

1. **Create `src/gas/` directory** with `appsscript.json` and `.clasp.json` at root pointing to it
2. **Port server functions** from `程式碼.js` into domain `.gs` files — copy functions verbatim, do not refactor
3. **Create `styles.html`** with the token set above as baseline
4. **Create `app.js.html`** with session manager, api wrapper, navigation utilities
5. **Port each view** from React `*.tsx` to vanilla `*.html`:
   - Extract layout structure (JSX → plain HTML)
   - Replace inline style objects with CSS classes from `styles.html`
   - Replace `apiService.*` calls with `api.call('*', ...)`
   - Replace React state management with DOM manipulation + closure state
   - Replace `onBack` prop with `navigate()`
6. **Smoke test** each page via clasp deployment

---

## Acceptance Criteria

1. **[ ]** All 8 `.gs` files push cleanly via clasp and GAS Editor shows them as separate files
2. **[ ]** `doGet(?page=login)` renders Login page with shared styles and JS
3. **[ ]** All 7 pages render without errors when navigated via `?page=...`
4. **[ ]** `google.script.run` calls succeed for every RPC function (auth, members, programs, events, attendance, dashboard)
5. **[ ]** Session persists across page navigation (sessionStorage)
6. **[ ]** Role-based UI gating works — STAFF sees event/scanner/dashboard links, MEMBER does not
7. **[ ]** `styles.html` shared CSS renders identically across all 7 pages
8. **[ ]** Original `程式碼.js` and `index.html` are untouched (archive)
9. **[ ]** `src/frontend/` remains untouched (retired)
