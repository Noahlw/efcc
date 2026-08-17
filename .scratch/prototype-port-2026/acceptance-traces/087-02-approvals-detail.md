# 087-02 Registration Approvals List + Routable Detail acceptance trace

Authority: issue #319, `docs/specs/087-management-hub-approvals-home-cms.md` (US 4-7), and the canonical management prototype.

Run against local `wrangler dev`/local D1 with authenticated Staff/Admin fixtures. Assert each step through visible DOM or response state; no fabricated data.

1. Approvals list shows pending registration requests in submission order.
2. Open a request.
   - Observe navigation to its own URL-addressable Approval Detail screen; the URL is bookmarkable/reload-safe within the session.
3. Detail shows applicant name, contact info, and current status (待審批 / 已核准 / 已拒絕).
4. Approve (核准).
   - Observe atomic Active account creation with the decision.
5. Reject (拒絕).
   - Observe the required-note contract; rejection records a terminal state atomically with the decision.
6. A previously-decided request.
   - Observe it remains viewable (read-only, showing the recorded outcome) at the same URL — not removed from view.
7. Back-navigation from Approval Detail.
   - Observe return to the list with its prior state intact.

Focused proof: list component tests (submission order) + detail component tests (status, approve atomic, reject+note atomic, read-only after decide, deep-link + back-nav, list prior state) + e2e; final proof also requires the repository's local verification gate and `git diff --check` before the ticket branch is submitted.