# 07 — Registration + Member Approval

**What to build:** A new visitor self-registers and lands in `Pending` status (per ADR-0006/CONTEXT.md — cannot log in until approved). A Staff/Admin user approves or rejects a pending member.

**Blocked by:** 00 (scaffold) — independent of Slice 01, since a visitor has no session yet.

**Status:** ready-for-agent

- [ ] `register.html`: a second unauthenticated top-level page (alongside `login.html`), reached via a link from the login page; uses the same DOM-swap pattern (`document.open/write/close`) rather than the authenticated shell's fragment-injection pattern, since the visitor has no session to gate on.
- [ ] Server registration function reimplemented from `程式碼.js` (creates a `Users` row with `Status = 'Pending'`, not hardcoded `'Active'` — this was an identified defect in the pre-rebuild code per Wayfinder Map #18's findings; the rebuild must not reproduce it).
- [ ] A pending-member approval/rejection surface for Staff/Admin — decide in this ticket's implementation whether this lives inside the Dashboard fragment (Slice 05) as a sub-section, or as its own chrome entry; state the choice in the PR description.
- [ ] Approval/rejection are privileged mutations — wrapped in the two-phase audit pattern (ADR-0009).
- [ ] Smoke test: register a new test visitor → verify `Status = 'Pending'` in the `Users` sheet → attempt login as that visitor → verify login is rejected while Pending → Staff approves → verify `Status = 'Active'` → visitor can now log in.

---

Blocked by #41 (T00 scaffold) only \u2014 independent of T01, no session needed for registration.
