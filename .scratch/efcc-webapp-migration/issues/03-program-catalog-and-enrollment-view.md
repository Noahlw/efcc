# 03 — Program Catalog & Schedule-Conflict Enrollment View

**What to build:** Port program browsing and enrollment workflows to React TypeScript (`ProgramCatalogView.tsx`, `ProgramEnrollmentView.tsx`). Members can view program details, enroll in programs with automatic date/time schedule conflict checks against enrolled events, and soft-cancel existing enrollments.

**Blocked by:** 02 — Member PIN Authentication, Persistent Session & Profile Pass View  
**Status:** ready-for-agent

- [ ] `ProgramCatalogView.tsx` lists all church programs from cached `apiService.getProgramsCatalog()`.
- [ ] `ProgramEnrollmentView.tsx` shows `isEnrolled` badges per program for the authenticated member.
- [ ] Tapping "Enroll" invokes `apiService.enrollUser(userId, programId)` which checks event date/time slot overlaps.
- [ ] Conflicting schedules return explicit error messages naming the conflicting event.
- [ ] Tapping "Cancel Enrollment" invokes `apiService.cancelEnrollment(userId, programId)` (soft-delete).
