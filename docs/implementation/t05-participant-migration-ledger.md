# T05.4 Participant Programs Migration Ledger

**Owner:** T05.4 / [#554](https://github.com/Noahlw/efcc/issues/554)
**Historical source:** retired `tests/e2e/programs-d1.test.ts` (removed after parity qualification on 2026-09-25; Git history preserves the source)
**Current Browser Acceptance:** `tests/e2e/programs-participant-acceptance.test.ts` at `phone-360`, `phone-390`, and `phone-402`, `retries: 0`

This ledger counts logical participant behavior, not the historical three viewport executions. The former suite was retired after T05.7 parity qualification. These rows preserve historical IDs and replacement ownership; no behavior is accepted solely because it appeared in the old suite.

## Ownership rules

| Owner | What it proves |
| --- | --- |
| Worker Contract Gate | API, authorization, D1, audit, conflict, idempotency, and projection correctness that does not need a browser |
| Browser Acceptance | Cookie/session behavior, real navigation/history, DOM interaction, multi-step participant workflow, and browser → Worker → D1 → browser round trip |
| Responsive UI Matrix | Deterministic layout, overflow, action visibility, target geometry, dock clearance, composition, and viewport interaction |

## Executable mapping

| Authority | Executable replacement |
| --- | --- |
| Worker Contract Gate | `apps/web/lib/programs/programs-contract.test.ts` |
| Browser Acceptance | `tests/e2e/programs-participant-acceptance.test.ts` |
| Responsive UI Matrix | `tests/e2e/programs-responsive-matrix.test.ts` |

## Scenario inventory

| Logical scenario | Historical execution | New primary owner | Migration disposition |
| --- | --- | --- | --- |
| PUI-01 admin participant entry exposes capability-shaped management affordance | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | API capability remains a Worker contract; one browser boundary is retained for real entry behavior |
| PUI-01 staff participant entry precedes management action | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Server capability stays at Worker seam; browser mode boundary remains covered |
| PUI-01 member entry has no management gateway | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Authorization remains server-owned; browser affordance remains a critical boundary |
| PUI-01 mode switching preserves Program intent and current access landmarks | `programs-d1` × 3 projects | Browser Acceptance | Current gateway links and named page regions replace the historical mode tabs; URL/history intent remains browser-owned |
| PUI-01 malformed direct intent is recoverable | `programs-d1` × 3 projects | Browser Acceptance | URL recovery remains browser-owned |
| PUI-01 session expiry restores direct intent after login | `programs-d1` × 3 projects | Browser Acceptance | Cookie expiry and redirect restoration remain browser-owned |
| PUI-02 listed catalog visibility and viewer status | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Projection visibility stays server-owned; one real catalog arrival remains |
| PUI-02 forbidden catalog is recoverable | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | 403 contract plus in-Programs browser recovery |
| PUI-02 long catalog copy wraps without overflow | `programs-d1` × 3 projects | Responsive UI Matrix | Responsive intent carried to T05.6 |
| PUI-02 scoped management can see Unlisted fixture | `programs-d1` × 3 projects | Worker Contract | Server scope/visibility projection |
| PUI-02 relationship filters | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Relationship state is server-projected; filter interaction remains browser-specific |
| PUI-02 search, clear, and empty recovery | `programs-d1` × 3 projects | Browser Acceptance + Responsive UI Matrix | Interaction remains browser-owned; narrow geometry moves to T05.6 |
| PUI-02 row selection uses canonical Program intent | `programs-d1` × 3 projects | Browser Acceptance | URL handoff needs a browser |
| PUI-03 detail survives refresh and returns to directory | `programs-d1` × 3 projects | Browser Acceptance | Refresh/back behavior remains browser-owned |
| PUI-03 Unlisted detail is privacy-preserving | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | 404/privacy projection is server-owned; unavailable browser state remains |
| PUI-05 event detail opens from Program and deep-links scanner | `programs-d1` × 3 projects | Browser Acceptance + Responsive UI Matrix | Real navigation remains; CTA/geometry intent moves to T05.6 |
| MSG-01 Home opens Messages list | `programs-d1` × 3 projects | Browser Acceptance | Cross-route navigation |
| MSG-01 Messages detail/back preserves row | `programs-d1` × 3 projects | Browser Acceptance | History and selected-row behavior |
| NTC-01 notice list/unread/read-all state | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Read projection/idempotency server-owned; control interaction retained |
| NTC-01 event notice deep-link | `programs-d1` × 3 projects | Browser Acceptance | Cross-route notice origin |
| NTC-01 notice back returns to list | `programs-d1` × 3 projects | Browser Acceptance | History behavior |
| NTC-01 program notice deep-link | `programs-d1` × 3 projects | Browser Acceptance | Cross-route notice origin |
| NTC-01 account notice deep-link | `programs-d1` × 3 projects | Browser Acceptance | Cross-route notice origin |
| PUI-04 request becomes Pending and can be withdrawn | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Request state/audit contract server-owned; member journey remains |
| PUI-04 approved enrollment can exit and re-enroll | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Lifecycle/audit contract server-owned; confirm-dialog journey remains |
| PUI-04 ManagerOnly detail explains participant restriction | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Permission projection server-owned; copy/affordance remains |

## T05.4 proof

The new focused suite creates a unique `E2E_T05P_` department/program through the real Worker API, signs the member in through the browser, submits the request through the browser, approves it through the admin API, reloads the member detail, and exits through the browser confirmation dialog. Independent state is scenario-isolated by the unique fixture; later runs do not rely on the shared demo enrollment state.

Responsive requirements remain in the separate 21-case matrix. Its configured projects cover 320, 360, 390, 402, 600, 799, 800, 1024, and 1440 CSS pixels; only the matching cases run at each width. The five Home-origin long-copy cases separately cover 320, 390, 799, and 800 pixels. The matrices do not repeat enrollment or approval workflows.

The historical Programs UI's `管理模式`/`參與者模式` tab labels and tablist are retired. The current participant entry is a named `課程` region with a capability-shaped `進入管理模式` link; management returns through `返回參與者模式`. Browser Acceptance verifies these current semantics and URL/history behavior rather than asserting a tab widget the product no longer renders.
