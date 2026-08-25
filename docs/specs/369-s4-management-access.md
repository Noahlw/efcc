# S4 — Management Access, Accounts, Approvals, and Permission Policy

**Status:** Approved for ticketing

**Originating issue:** [#369](https://github.com/Noahlw/efcc/issues/369) remains the historical umbrella and is not an executable implementation contract.

**Verified baseline:** `origin/main` at `83fafdb813db62fa530ddd2bddcecf60571763ec`

**Design decision evidence:** `prototype/s4-management-access` at `653a531` (selected composite) and `ecafb4d9` (comparison variants)

**Authority:** this specification and ADR-0038/0039. The 2026-08-18 design export is foundation evidence only. Where presentation details remain relevant, the selected fresh prototype wins over issue #369, Spec 087, and the historical export. Server authorization, domain language, accessibility, production route intent, and shared design tokens outrank prototype literals.

## Problem Statement

Pastors and administrators need one dependable place to find church Accounts, process self-service registrations, and understand or change the global Permission Policy. The current application contains partial versions of those surfaces, but their product and authorization contracts do not agree:

- Account Permissions is read-only and exposes a static role summary instead of the real Role-to-Capability policy.
- Registration Approval is authorized by hard-coded role names rather than an explicit Capability.
- the current member-search surface mixes Account identity with church-member language and has no canonical routable Account Detail;
- the Management Hub can expose destinations through role checks that differ from the destination's server authorization;
- no atomic Permission Policy write, revision conflict, safety invariant, or audit mutation contract exists;
- the historical design proves only one 390px scenario and does not define the complete responsive or recoverable UI.

The result is a management surface that looks partly complete but cannot safely serve as the authority for later Department and Program administration.

## Solution

Deliver four connected S4 capabilities through the existing `/management` experience:

1. a server-projected Management Hub entry;
2. a church-wide Account Directory with a routable, read-only Account Detail;
3. a Registration Approval queue and routable detail with atomic, idempotent decisions;
4. a global Permission Policy viewer/editor with an explicit 13-Capability matrix, staged atomic Save, monotonic revision, conflict recovery, and audit evidence.

Every Active Account retains the Church Member participant baseline. Staff and Admin add management authority rather than replacing member access. Staff represents pastors and core operators and therefore receives normal Department and Program management authority by default. Admin-only authority is limited to changing the authorization system and church-wide Home publishing.

The selected UI system is:

- Account Directory **B — Operational Ledger**;
- Registration Approvals **A — Queue + Detail**;
- Permission Policy **C — Change-set Review**.

## User Stories

1. As an Active Account, I want to retain ordinary Church Member capabilities even when my global Role is Staff or Admin, so that management responsibility does not remove my participant experience.
2. As a management-capable operator, I want the Management Hub to show only destinations authorized by the server, so that the Hub does not promise work I cannot perform.
3. As an operator following a direct Management URL, I want the server to reauthorize the exact destination, so that hidden navigation is never treated as security.
4. As an authorized pastor or administrator, I want to open an Account Directory, so that I can find the login identity connected to a ministry interaction.
5. As an Account Directory user, I want to search by name, login name, or phone number, so that I can find an Account using the information available to me.
6. As an Account Directory user, I want role, status, and Department filters, so that I can narrow a large church-wide result set.
7. As an Account Directory user, I want desktop ledger density and phone-friendly Account rows, so that the same task remains usable in the office and during ministry.
8. As an Account Directory user, I want operational counts derived from the authorized result set, so that I can understand active, elevated, and pending Account volume without a separate report.
9. As an Account Directory user, I want a routable Account Detail, so that refresh, bookmark, back, and origin-aware return behavior are predictable.
10. As an Account Directory user, I want Account Detail to show only identity-and-access facts, so that pastoral Church Member records are not silently exposed through S4.
11. As an Account Directory user, I want Account Detail to be explicitly read-only, so that the screen does not imply unsupported suspension, deletion, credential reset, or Role changes.
12. As a Department Manager without church-wide Account authority, I want to remain limited to scoped participant surfaces, so that my Department grant does not expose every Account.
13. As an unauthorized direct-link visitor, I want a clear forbidden state and a safe return to Management, so that I am not left on an empty or misleading screen.
14. As a Staff or Admin operator, I want a Registration Approval queue ordered by submission time, so that pending requests can be triaged consistently.
15. As an approval operator, I want pending and resolved requests to remain distinguishable, so that the queue communicates what still needs action.
16. As an approval operator, I want a routable Approval Detail with applicant identity and submission facts, so that I can make a decision from a stable context.
17. As an approval operator, I want a final applicant summary before approval, so that I do not create an Account for the wrong request.
18. As an approval operator rejecting a request, I want to provide a required reason and confirm the decision, so that the outcome is accountable.
19. As an approval operator, I want pending feedback during a decision, so that I do not submit the same action twice.
20. As an approval operator working offline, I want the app to state that nothing was submitted or queued for automatic retry, so that I know when to return.
21. As an approval operator whose request was resolved concurrently, I want a neutral latest-result state, so that I do not mistake a safe conflict for a failure.
22. As an approval operator, I want resolved Approval Detail to remain routable and read-only, so that later audit and support work has stable evidence.
23. As an approval operator, I want list filters and scroll position preserved when returning from detail, so that processing a queue does not repeatedly reset my context.
24. As a Staff or Admin operator, I want to read the complete global Permission Policy, so that I can understand which management abilities each Role receives.
25. As a Permission Policy reader, I want the shared participant baseline distinguished from additive management authority, so that Staff and Admin are not misrepresented as non-members.
26. As a Permission Policy reader, I want fixed and editable cells to look and behave differently, so that safety constraints are not false affordances.
27. As a Permission Policy reader on phone, I want grouped Role/Capability controls without a shrunken desktop table, so that every value and explanation remains readable.
28. As a Permission Policy reader on desktop, I want a dense policy overview and persistent change summary, so that broad policy can be reviewed efficiently.
29. As an Admin policy editor, I want changes to stay local until I explicitly Save, so that an accidental toggle is not immediately system-wide.
30. As an Admin policy editor, I want one reviewable change set, so that I understand the combined effect before committing it.
31. As an Admin policy editor, I want the Save to be atomic, so that the system never applies only part of a Role policy.
32. As an Admin policy editor, I want the policy revision checked by the server, so that I cannot overwrite a newer change made by another administrator.
33. As an Admin policy editor receiving a conflict, I want my draft preserved and the newer policy identified, so that I can compare and deliberately reapply changes.
34. As an Admin policy editor, I want the system to preserve Admin Permission Policy read and write authority, so that the authorization system cannot lock out all editors.
35. As a Staff policy reader, I want read-only access without mutation affordances, so that I can understand policy without being able to change the authorization system.
36. As a Member-role Account, I want no Permission Policy or church-wide Account Directory entry, so that management data is not exposed to the participant baseline.
37. As an auditor, I want privileged terminal outcomes to identify actor, request, revision, outcome, and correlation, so that success, conflict, denial, and failure can be reconstructed.
38. As an operator experiencing loading, empty, error, forbidden, busy, success, conflict, or offline states, I want the heading, focus, live-region message, and recovery action to match the current state, so that the workflow remains understandable without relying on color.
39. As a keyboard or assistive-technology user, I want logical focus order, visible teal focus, semantic dialogs, and announced busy/error states, so that every S4 workflow is operable without a pointer.
40. As a phone user, I want every target to be at least 44px, content to clear the bottom dock and safe area, and no horizontal page overflow, so that S4 works in real ministry conditions.
41. As a desktop operator, I want the 800px breakpoint to switch to the management rail and denser layouts, so that heavy administration is not forced into phone presentation.
42. As a release operator, I want observable UI, response, and D1 evidence for every privileged outcome, so that screenshots alone cannot produce a false green gate.

## Implementation Decisions

### 1. Authority and production boundary

- The selected prototype is presentation evidence, not production code.
- Comparison and selected prototype code remains on `prototype/s4-management-access`; no prototype router, in-memory mutation, scenario control, or floating switcher is merged into production.
- Production rebuilds the selected structure through existing EFCC modules, shared tokens, real APIs, and real D1 state.
- Issue #369 remains historical. Spec 087 remains historical for the S4 conflict set.

### 2. Domain language

- `Account Directory` is the identity-and-access surface.
- `Church Member Directory` is a future pastoral/member-record surface and is not an alias for Account Directory.
- `Registration Approval` decides an Account registration; `Enrollment Approval` decides participation in a Program.
- Every Active Account retains the Church Member participant baseline.
- Global Roles are Admin, Staff, and Member. Department Manager and Program Leader remain separate scoped grants.
- Permission Policy contains no per-account overrides.

### 3. Management route intent

- Keep the production `/management` route and canonical query-intent architecture rather than the prototype router.
- Canonical S4 intents are Management Hub, Account Directory, Account Detail, Registration Approvals, Approval Detail, and Permission Policy.
- The existing ambiguous member-directory intent is normalized to Account Directory while preserving a compatibility route during migration.
- Account and Approval detail identity is encoded in the URL. Back navigation is origin-aware and preserves list query/filter context.
- Every direct URL is reauthorized by the server.

### 4. Capability model

The initial global policy is:

| Capability | Admin | Staff | Member | Constraint |
| --- | :---: | :---: | :---: | --- |
| `program.enroll` | yes | yes | yes | Shared participant baseline; locked on |
| `department.manage` | yes | yes | no | Normal management operation |
| `department.publish` | yes | yes | no | Normal management operation |
| `department.module.configure` | yes | yes | no | Normal management operation |
| `department.manager.assign` | yes | yes | no | Normal management delegation |
| `program.manage` | yes | yes | no | Normal management operation |
| `program.publish` | yes | yes | no | Normal management operation |
| `program.leader.assign` | yes | yes | no | Normal management delegation |
| `account.permissions.read` | yes | yes | no | Global policy visibility |
| `account.directory.read` | yes | yes | no | Church-wide Account Directory visibility |
| `registration.approval.manage` | yes | yes | no | Registration decision authority |
| `home.publish` | yes | no | no | Church-wide Admin-only publication |
| `account.permissions.write` | yes | no | no | Authorization-system mutation; Admin-only and locked on |

- `program.enroll` keeps its participant meaning. It is not relabelled as Program approval authority.
- Future Program enrollment decisions may receive a distinct Capability in their owning specification.
- Registration Approval, Account Directory, Management Hub projection, and Permission Policy mutation stop using client or server display-role allowlists where an explicit Capability applies.
- Scoped grants never imply church-wide Account Directory or Permission Policy access.

### 5. Account Directory contract

- Account Directory is owned by the identity/account boundary rather than the Program participant domain.
- The read contract supports bounded search and role/status filters, stable ordering, and real authorized summary counts.
- Account Detail returns login identity, contact detail already owned by the Account registration record, global Role, Account status, and Department associations required for access context.
- It does not return pastoral notes, care records, attendance history, or unsupported lifecycle controls.
- Both list and detail require `account.directory.read`.

### 6. Registration Approval contract

- Existing list/detail and decision behavior is retained but authorization moves to `registration.approval.manage`.
- Approve and reject require an idempotency key.
- Reject requires a non-empty reason.
- A decision performs a Pending compare-and-set in one transaction.
- Same-request replay returns the existing terminal outcome without a duplicate mutation.
- An opposite or concurrent decision returns `409 Conflict` with the current terminal state.
- Resolved requests remain readable through the same detail contract.

### 7. Permission Policy read/write contract

- The existing Account Permissions read resource expands to return elevated Account context, policy revision, the 13-Capability Role matrix, descriptions, applicability/lock metadata, and actor editability.
- Reading requires `account.permissions.read`.
- Updating uses an atomic same-resource write authorized by `account.permissions.write`.
- The request carries an idempotency key, base revision, and explicit Role/Capability changes.
- The server validates the complete resulting policy before mutation and applies all changes or none.
- The response returns the new monotonic revision and authoritative policy projection.
- A stale base revision returns Problem Details `409 Conflict` with the current revision and no partial write.
- The server rejects attempts to disable the shared participant baseline, enable management Capabilities for Member, grant Admin-only Capabilities to Staff/Member, or remove Admin Permission Policy read/write.
- No UI state or disabled control substitutes for those invariants.

### 8. Persistence and audit

- Store one monotonic revision for the global Permission Policy beside the Role/Capability mapping.
- Migration seeds the approved 13-Capability policy without introducing per-account overrides.
- Privileged mutation audit uses the existing immutable audit boundary and request correlation.
- Permission Policy audit captures actor, base/new revision where applicable, changed Role/Capability values, outcome, idempotency key/correlation, and timestamp.
- Registration decisions preserve their existing atomic decision/account-creation evidence and add Capability-based authorization evidence.
- Success, duplicate/replay, conflict, denial, and failure follow the repository Audit Outcome vocabulary.

### 9. Selected Account Directory presentation

- Desktop uses the B operational ledger: authorized metrics, search/filter tools, dense rows, and a synchronized detail region.
- Phone uses full-width Account rows and a routable full-screen detail rather than compressing the desktop columns.
- Search remains visible and is not reset by returning from detail.
- Loading, empty/no-match, error/retry, and forbidden states retain the Account Directory heading and an explicit recovery path.

### 10. Selected Registration Approval presentation

- Use the A queue + detail model.
- Desktop may present list and detail concurrently; phone presents one routable surface at a time.
- Approval confirmation summarizes the applicant before commit.
- Rejection uses a semantic dialog with required reason, cancel, and explicit destructive confirmation.
- Busy disables repeated decisions and announces progress.
- Success returns or advances deliberately; it does not silently disappear.
- Conflict displays the authoritative terminal result as neutral read-only information.
- Offline never reports optimistic success and never schedules automatic retry.

### 11. Selected Permission Policy presentation

- Use the C change-set review model.
- Capabilities are grouped by participant baseline, Department, Program, and Account/System responsibility.
- Desktop combines dense controls with a persistent review summary.
- Phone uses grouped rows/cards and Role labels; it does not rely on a horizontally shrunken 13×3 table.
- Locked cells are semantic non-controls with a visible reason, not disabled-looking checkboxes that imply editability.
- Editable changes create a dirty draft. Save presents the change summary and submits once.
- Pending, success, failure-with-draft-preserved, conflict-with-draft-preserved, read-only Staff, and forbidden states are explicit.

### 12. Responsive, visual, and accessibility contract

- Preserve EFCC Official Civic Minimal: `#f4f5f3` base, white raised surfaces, charcoal ink, hairline borders, 8px controls, 12px cards, restrained cinnabar actions, and teal focus.
- Cantonese Traditional Chinese is primary; use the full church name for new brand presentation.
- Below 800px use phone layout and bottom dock; at 800px and above use desktop rail and management density.
- Required proof widths are 320, 390, 800, and 1440.
- Every interactive target is at least 44×44px.
- No page-level horizontal overflow is allowed. A desktop policy table is not the phone solution.
- Content and actions clear the phone dock and safe-area inset.
- Each route/state owns one focused heading. Dialog focus enters the dialog and returns to the invoking control.
- Busy/status/error messages use appropriate semantic output/live regions without duplicated announcements.
- Color is never the sole signal for status, locked policy, error, or success.

### 13. Implementation-ticket UI quality protocol

- Every ticket that changes an S4 screen cites ADR-0038, this specification, and the selected prototype evidence at `prototype/s4-management-access` commit `653a531` before implementation begins.
- The selected B/A/C structure is the presentation baseline, not a ceiling on craft. Production may improve hierarchy, spacing, typography, long-copy handling, focus treatment, feedback, and responsive composition when the improvement preserves the frozen behavior and Civic Minimal system.
- Each UI ticket invokes the `impeccable` skill for project design context and one bounded production-quality pass. The pass inspects Accessibility, Responsive Design, Theming, Implementation Integrity, and interaction polish; it does not introduce a new palette, speculative feature, or unrelated redesign.
- The implementation sequence is: reproduce the selected prototype structure with real data and real mutations; inspect phone and desktop together; apply one contained polish batch; run at most one confirmation pass; then stop.
- Any deliberate prototype-to-production delta is recorded in the ticket or acceptance trace with the selected prototype state, production observation, reason, and behavioral proof. Silent divergence is not allowed.
- Phone and desktop are one acceptance unit in every UI slice. A ticket is incomplete if either the 320/390 phone layouts or the 800/1440 desktop layouts are missing, deferred, overflowing, inaccessible, or visually unreviewed.
- Each UI ticket captures fresh evidence for its own loading, empty, error, forbidden, pending, success, conflict, offline, or read-only states as applicable. Screenshots demonstrate presentation; DOM, response, and D1 evidence demonstrate behavior.
- Prototype-only fake data, query routers, state switchers, and in-memory mutation controls remain excluded from production even when used as visual references.

## Frozen Contracts

- **S4-F01:** Every Active Account retains the Church Member participant baseline regardless of global Role.
- **S4-F02:** Account Directory and Church Member Directory are distinct domain surfaces.
- **S4-F03:** S4 Account Detail is routable and read-only.
- **S4-F04:** Account lifecycle mutation and pastoral records remain out of scope.
- **S4-F05:** Global Roles remain Admin/Staff/Member; scoped grants remain separate.
- **S4-F06:** Permission Policy has no per-account overrides.
- **S4-F07:** `program.enroll` is a participant Capability enabled for all Roles.
- **S4-F08:** Staff receives normal Department/Program management and delegation authority by default.
- **S4-F09:** `home.publish` and `account.permissions.write` remain Admin-only.
- **S4-F10:** Account Directory and Registration Approval use explicit server Capabilities.
- **S4-F11:** Hidden navigation is presentation only; every direct URL is server-reauthorized.
- **S4-F12:** Registration decisions are idempotent, atomic, conflict-aware, and auditable.
- **S4-F13:** Permission Policy Save is a staged atomic versioned change set.
- **S4-F14:** A stale policy revision returns `409 Conflict` and performs no partial write.
- **S4-F15:** Admin Permission Policy read/write and participant-baseline safety invariants are server-enforced.
- **S4-F16:** Permission Policy mutation emits immutable audit evidence for terminal outcomes.
- **S4-F17:** Directory B, Approvals A, and Permissions C are the selected presentation structures.
- **S4-F18:** Phone Permission Policy is not a shrunken or page-overflowing desktop matrix.
- **S4-F19:** All required S4 states are explicit and recoverable without optimistic offline success.
- **S4-F20:** The 800px shell breakpoint, 44px targets, focus/live-region semantics, dock clearance, and no-horizontal-overflow rule are mandatory.
- **S4-F21:** Prototype code, demo state, fake data, and switchers never enter production implementation.
- **S4-F22:** Screenshots prove presentation only; authorization, persistence, conflict, idempotency, and audit require response/D1 evidence.
- **S4-F23:** Every S4 UI implementation ticket uses the selected prototype as its presentation baseline and runs one bounded `impeccable` production-quality pass.
- **S4-F24:** Phone and desktop are inseparable acceptance targets for every S4 UI slice; neither viewport class may be deferred to a later ticket.

## Testing Decisions

### Test philosophy

- Test observable behavior at the highest stable seam.
- A UI screenshot cannot prove authorization or persistence.
- A handler response alone cannot prove the operator can complete the phone/desktop workflow.
- Every adopted correction must have a regression test that fails against the pre-S4 behavior.
- Test fixtures are disposable `E2E_`/`E2E_DEMO_` D1 records only; no production Sheet or Account is mutated.

### Local Worker/D1 Playwright seam

Exercise real `/management` routes through local `wrangler dev` and isolated D1:

- capability-projected Hub and forbidden direct URLs;
- Account Directory search/filter, routable detail, return context, loading/empty/error states;
- Approval pending, approve, required rejection reason, idempotent replay, concurrent conflict, resolved detail, offline and retry presentation;
- Permission Policy read-only Staff, editable Admin, locked cells, dirty review, pending Save, success, error draft preservation, stale revision conflict, and reload/reapply path;
- 320, 390, 800, and 1440 geometry, focus, dock/rail, and overflow assertions.

### Worker/domain integration seam

Test server authorization and mutation behavior directly:

- every S4 Capability/Role default and scoped-grant non-escalation;
- Account list/detail field projection and 403 behavior;
- Registration Approval Capability authorization, idempotency, compare-and-set conflict, and resolved replay;
- Permission Policy full-result validation, atomicity, revision increment, stale revision, safety invariants, and Problem Details responses;
- audit outcome and correlation for success, replay, conflict, denial, and failure.

### Component seam

Test deterministic presentation behavior without coupling to CSS implementation names:

- state transitions and recovery actions;
- search/filter preservation and origin-aware navigation intent;
- approval dialog labels, reason validation, busy state, focus entry/return, and live announcements;
- Permission Policy locked vs editable semantics, dirty summary, Save busy state, conflict/error draft preservation, and Staff read-only presentation;
- target geometry, dock clearance, and no-overflow assertions where component DOM geometry is the intended contract.

### Direct D1 evidence seam

For privileged terminal outcomes, assert:

- Account status and registration decision rows;
- Permission Policy mapping and monotonic revision;
- absence of partial writes on conflict/failure;
- one authoritative audit trail per outcome and idempotency behavior.

### Required gates

- root and web typecheck;
- relevant component and Worker/D1 tests;
- production build;
- full focused S4 local-D1 Playwright suite;
- responsive/focus geometry suite at all four widths;
- `git diff --check`.

## Out of Scope

- Home CMS implementation or redesign
- Department/Program setup and delegation screen implementation
- Program Enrollment Approval capability design
- attendance correction, void, or guest-correction behavior
- pastoral Church Member records or care workflows
- Account suspension, deactivation, deletion, Role mutation, credential reset, or last-active-Admin lifecycle rules
- per-account Capability overrides
- prototype code in production
- production deployment or live-account mutation

## Further Notes

- Create a separate Wayfinder decision issue for Church Person, Membership, Account, and Account Lifecycle boundaries. It does not block the read-only S4 Account Directory.
- Implementation tickets must be narrow, vertical, demoable slices and declare their blocking edges.
- Each implementation ticket writes an acceptance trace before code and records its exact lower-layer SHA and isolated D1 verification state.
- The final S4 integration ticket is verification-only. It must not silently absorb backend, schema, or UI repairs from incomplete slices.
