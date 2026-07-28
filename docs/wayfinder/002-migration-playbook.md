# Wayfinder Migration Playbook: TypeScript WebApp & Feature Parity

**Ticket**: #7 — TS WebApp Feature Parity Port & Singlefile Deployment Playbook  
**Date**: 2026-07-27  
**Parent Wayfinder Map**: #1

---

## 1. Overview

This playbook defines the exact, wave-by-wave execution roadmap to port **顯恩堂系統 (EFCC)** to a TypeScript React web application based on the `Budget` reference architecture, ensuring 100% feature parity for existing member workflows while implementing the newly specified staff capabilities (RBAC, dynamic events, QR attendance scanner, and inactive member care dashboard).

---

## 2. Phased Migration Waves

```
┌─────────────────────────────────────────────────────────────┐
│ Wave 1: Scaffolding (Vite + React 19 + TS + Singlefile)     │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ Wave 2: Core Parity (PIN Auth, Registration, Profile)       │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ Wave 3: Catalog & Enrollment Parity (Programs, Enrollment) │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ Wave 4: New Staff Capabilities (Events, Attendance, Care)   │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ Wave 5: GAS RPC Integration & Production Clasp Push         │
└─────────────────────────────────────────────────────────────┘
```

### Wave 1: Scaffolding

- Initialize `src/frontend/` with Vite, React 19, TypeScript, and `vite-plugin-singlefile`.
- Author `src/frontend/src/types.ts` defining all domain entities (`User`, `Program`, `Enrollment`, `Event`, `Attendance`, `Role`).
- Implement `src/frontend/src/services/api.ts` with local mock data fallback (`typeof google === "undefined"`).

### Wave 2: Core Parity

- Build `LoginView.tsx` (Username + 4-digit PIN authentication).
- Build `MemberRegistrationView.tsx` (New member sign-up form with phone & address).
- Build `MyProfileView.tsx` (Member profile view & QR check-in display).

### Wave 3: Catalog & Enrollment Parity

- Build `ProgramCatalogView.tsx` (Browse church programs, view descriptions and schedules).
- Build `ProgramEnrollmentView.tsx` (Enroll in programs with schedule conflict checking, cancel enrollment).

### Wave 4: New Staff Capabilities

- Build `EventManagementView.tsx` (Granted users create and manage events dynamically per Spec 005).
- Build `AttendanceScannerView.tsx` (HTML5 camera QR scanner + fast name/phone manual search per Spec 006).
- Build `CareDashboardView.tsx` (Pastoral care dashboard identifying inactive members with direct WhatsApp outreach links per Spec 007).

### Wave 5: Backend Integration & Deployment

- Update `程式碼.js` with new server-side RPC handlers:
  - `api_createEvent`, `api_cancelEvent`
  - `api_checkInMember`, `api_getEventAttendance`
  - `api_getUserActivityProfile`, `api_getCareDashboard`
- Run `npm run build` inside `src/frontend/` to generate `index.html` at project root.
- Execute `clasp push` and verify production web app deployment.

---

## 3. Verification & Quality Gates

Each wave MUST clear the following gates before graduating:

1. **Type Safety**: `tsc --noEmit` passes with 0 errors.
2. **Local Mock Verification**: View renders cleanly under `npm run dev` with mock data.
3. **Build Purity**: `vite-plugin-singlefile` produces a single HTML file without external JS/CSS dependencies.
4. **Smoke Test**: App runs inside Apps Script web app environment without RPC execution errors.
