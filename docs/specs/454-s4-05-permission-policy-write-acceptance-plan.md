# S4-05 Permission Policy write acceptance trace

**Ticket:** #454
**Parent authority:** #449, `docs/specs/369-s4-management-access.md`, ADR-0038, ADR-0039
**Presentation authority:** `prototype/s4-management-access` at `653a531` — Permissions C, Change-set Review
**Status:** Acceptance trace written before implementation

## Contract under test

The authenticated `/api/v1/programs/account-permissions` resource accepts one
Admin-authorized, versioned Permission Policy change set. The browser stages
changes locally; the Worker validates the complete resulting 13-Capability
policy and D1 commits role rows, revision, idempotency record, and audit outcome
atomically. Staff remains read-only. A stale base revision never changes policy.

## Acceptance trace

| ID | Given | When | Observable result |
| --- | --- | --- | --- |
| API-01 | Active Admin has `account.permissions.write` and a current revision | POST the resource with an Idempotency-Key, base revision, and explicit changes | `200` returns the authoritative policy with revision + 1; every requested change is present; one SUCCESS audit identifies actor, base/new revision, changes, and key. |
| API-02 | The same key and equivalent change set is submitted again | Replay the POST | `200` is idempotent, returns the committed policy, does not duplicate role rows or advance revision; a DUPLICATE audit is allowed/identifiable. |
| API-03 | An Idempotency-Key already belongs to a different change set | Submit a different body with that key | `409` Problem Details; no policy/revision mutation. |
| API-04 | Staff or Member submits a valid change set | POST the resource | `403 FORBIDDEN`; no role/revision mutation and a DENIED audit for the attempted privileged action. |
| API-05 | The submitted base revision is older than the authoritative singleton | POST the resource | `409` conflict includes the current revision; no role row, revision, or partial change is written; one CONFLICT audit is emitted. |
| API-06 | A change would disable `program.enroll`, grant management to Member, grant Admin-only capability to Staff/Member, or remove Admin policy read/write | POST the resource | Validation/safety rejection; no role/revision mutation and no partial policy. |
| API-07 | Two different current-revision changes race | POST both changes | Exactly one succeeds; the other receives `409`; revision advances once and only the winner's complete set is present. |
| UI-01 | Admin reads the real projection | Toggle editable cells, then inspect the review region | Changes remain local, one reviewable change summary appears, locked cells stay semantic non-controls, and Save is enabled only when dirty. |
| UI-02 | Admin saves a dirty draft | Activate Save once | Busy state disables repeated submission and announces progress; success shows the new revision and clears the draft only after the authoritative response. |
| UI-03 | Save fails or conflicts | Receive a recoverable error or `409` | No optimistic policy is shown as saved; the complete draft remains visible; conflict identifies the newer revision and exposes reload/reapply recovery. |
| UI-04 | Staff receives the projection | Render Permission Policy C | Full policy is readable with explicit read-only copy; no editable control or Save action exists. |
| UI-05 | Policy is rendered at 320, 390, 800, and 1440px | Inspect DOM geometry and screenshots | Phone uses grouped Role/Capability cards, desktop uses dense policy + persistent summary, no page horizontal overflow, focus is visible, and content clears the bottom dock/safe area. |

## Test seams and gates

- Worker/D1 seam: `web/lib/programs/account-permissions.test.ts` exercises
  authorization, atomic role/revision writes, idempotency, stale conflict,
  safety invariants, and audit outcomes through the real Worker.
- Component seam: `web/lib/permissions-panel.test.tsx` exercises draft toggles,
  locked vs editable semantics, Save busy/success/error/conflict states,
  Staff read-only behavior, and recovery without coupling to CSS class names.
- Local Worker/D1 Playwright is the final authenticated proof at 320, 390, 800,
  and 1440px; response/D1 assertions prove persistence and authorization.
- Required gates: root and web typecheck, focused Worker/component tests,
  production build, responsive/focus geometry suite, and `git diff --check`.
