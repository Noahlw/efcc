# T05.5 Management Programs Migration Ledger

**Owner:** T05.5 / [#555](https://github.com/Noahlw/efcc/issues/555)  
**Historical source:** `tests/e2e/programs-d1.test.ts`  
**Current Browser Acceptance:** `tests/e2e/programs-management-acceptance.test.ts` at `phone-390`, `retries: 0`

This ledger assigns management-facing logical behavior to the narrowest useful seam. The historical three-project Programs suite remains available during migration; its repeated viewport execution is not the authority for domain coverage.

## Scenario inventory

| Logical scenario | Historical execution | New primary owner | Disposition |
| --- | --- | --- | --- |
| MUI-01 management directory and status-first cockpit | `programs-d1` × 3 projects | Browser Acceptance | Keep one real directory → Program arrival; Worker Contract owns projection/authorization |
| MUI-01 Course Facts read-only projection | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Server projection is contract-owned; browser arrival remains a critical workflow |
| MUI-01 management Program edit persists name/purpose | `programs-d1` × 3 projects | Browser Acceptance | Covered by the focused T05.5 mutation/read-back journey |
| MUI-01 Participants queue scopes counts and decisions | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Permission/count/decision/audit cases use Worker contracts; one real approval journey remains |
| MUI-01 Directory and Workspace keyboard entry | `programs-d1` × 3 projects | Browser Acceptance | Focus and keyboard behavior needs a browser |
| MUI-01 member direct management access is denied | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Server denial is primary; generic browser recovery remains |
| MUI-01 staff capability-shaped directory | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Capability projection is server-owned; directory interaction remains |
| MUI-01 revoked/unknown management intent stays generic | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Privacy-preserving denial plus browser route recovery |
| MUI-01 workspace geometry and focus target | `programs-d1` × 3 projects | Responsive UI Matrix | Participant and management geometry moves to T05.6 |
| CFG-01 settings groups and OneOff schedule rules | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Module/behavior contract server-owned; settings composition remains |
| CFG-01 disabled module unavailable state | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Module gate server-owned; browser copy/controls remain |
| CFG-01 discoverability confirmation | `programs-d1` × 3 projects | Browser Acceptance | Consequential confirmation is browser-specific; mutation contract is Worker-owned |
| 086-06 department directory authorization | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Scoped projection server-owned; directory arrival remains |
| 086-06 department module toggles | `programs-d1` × 3 projects | Worker Contract | Capability, mutation, audit, and module state |
| 086-06 department save failure | `programs-d1` × 3 projects | Browser Acceptance | Inline transport/error recovery |
| 086-06 create Program lands in cockpit | `programs-d1` × 3 projects | Browser Acceptance | Multi-step management navigation |
| MUI-02 scoped Program create/update/archive | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Lifecycle/conflict/authorization contract server-owned; one browser mutation remains |
| MUI-02 member direct Program mutation denied | `programs-d1` × 3 projects | Worker Contract | Authorization is not a browser affordance |
| MUI-02 assisted enrollment | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Mutation/audit/idempotency contract server-owned; critical operator action remains |
| MUI-02 ParticipantsTask cancellation preserves history | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Durable outcome/audit contract server-owned; confirm interaction remains |
| EVT-01 event detail role-shaped projection | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Projection/privacy contract server-owned; operator navigation remains |
| EVT-01 event update and duplicate conflict | `programs-d1` × 3 projects | Worker Contract | API validation, D1 mutation, conflict, and audit |
| EVT-01 event availability confirmation/deactivation | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Confirmation UI remains; impact calculation and audit are server contracts |
| EVT-01 event cancellation retires controls | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | State/audit contract plus visible control transition |
| EVT-01 Program-wide enrollment does not gate unrelated Event | `programs-d1` × 3 projects | Worker Contract | Domain invariant and authorization |
| EVT-01 open check-in window requires confirmation | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Impact decision server-owned; confirmation remains |
| NTF-01 scoped attention zero state | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Empty projection server-owned; dialog interaction remains |
| NTF-01 attention sources, task links, counts, refresh | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Notification/attention projection and read state server-owned; task routing remains |
| EVT-02 preview is deterministic and non-mutating | `programs-d1` × 3 projects | Worker Contract | D1 write boundary and audit disposition |
| EVT-02 generation is idempotent and audited | `programs-d1` × 3 projects | Worker Contract | Generation contract and conflict semantics |
| EVT-02 stale plan fails before writes | `programs-d1` × 3 projects | Worker Contract | Optimistic concurrency and audit |
| EVT-02 generation controls require capability | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Server authorization primary; visibility remains |
| HUB-01 Management Hub grouping and rows | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Capability-filtered projection plus navigation |
| HUB-01 staff omits ungranted content/system rows | `programs-d1` × 3 projects | Worker Contract | Server capability projection |
| HUB-01 attendance chooser and roster entry | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Availability projection plus route interaction |
| HUB-01 registration approval detail/decision | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Atomic approval/audit contract plus critical UI flow |
| HUB-01 approval detail back-navigation preserves scroll | `programs-d1` × 3 projects | Browser Acceptance | Browser history/scroll state |

## T05.5 proof

The focused suite signs an admin in through the browser, creates a unique `E2E_T05M_` department and Program through same-origin Worker calls, enters it through the real management directory, updates the Program name and description in the settings UI, reloads, and verifies server persistence before restoring the fixture. This proves a real Browser → Worker → D1 → Browser round trip without sharing participant state.

Permission, capability, D1 mutation, audit, conflict, notification, and idempotency variants remain in `web/lib/programs/*.test.ts` Worker Contract coverage. Responsive intent for workspace, settings, attention, and task geometry is explicitly reserved for T05.6.
