# 086-05 Participants Tabs + Assisted Enrollment Gating acceptance trace

Authority: issue #317, `docs/specs/086-course-cockpit-and-operations.md` (US 22-25), and the canonical management prototype.

Run against local `wrangler dev`/local D1 with authenticated management-capable fixtures. Assert each step through visible DOM or response state; no fabricated data.

1. Open a program's Participants view.
   - Observe three tabs (待審批/使用中/歷史) with correct scoped counts; each tab has its own honest empty state.
2. Pending tab: inline approve.
   - Observe an atomic Active enrollment creation with no separate detail URL.
3. Pending tab: inline reject.
   - Observe a terminal history entry with the correct rejected status.
4. Active tab: 代報名 (assisted enrollment).
   - Observe the action available whenever the actor holds enrollment/manage capability for the program — regardless of `enrollment_mode` (MemberRequest or ManagerOnly); explicit regression asserting the action now renders on MemberRequest programs where it was previously hidden.
5. Assisted enrollment acknowledgement.
   - Observe the explicit copy that it only creates an enrollment record and does not auto-check-in the member.

Focused proof: participants tab component tests (scoped counts + empty states + inline approve/reject + assisted-enrollment gating + acknowledgement) + worker/API coverage of the gating fix + e2e MUI-02 additions; final proof also requires the repository's local verification gate and `git diff --check` before the ticket branch is submitted.