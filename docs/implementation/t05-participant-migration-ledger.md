# T05.4 Participant Programs Migration Ledger

**Owner:** T05.4 / [#554](https://github.com/Noahlw/efcc/issues/554)  
**Historical source:** `tests/e2e/programs-d1.test.ts`  
**Current Browser Acceptance:** `tests/e2e/programs-participant-acceptance.test.ts` at `phone-390`, `retries: 0`

This ledger counts logical participant behavior, not the historical three viewport executions. The historical suite remains available during migration and is diagnostic until T05.7 contracts its authority. No row is removed without a replacement owner or an explicit retirement reason.

## Ownership rules

| Owner | What it proves |
| --- | --- |
| Worker Contract Gate | API, authorization, D1, audit, conflict, idempotency, and projection correctness that does not need a browser |
| Browser Acceptance | Cookie/session behavior, real navigation/history, DOM interaction, multi-step participant workflow, and browser → Worker → D1 → browser round trip |
| Responsive UI Matrix | Deterministic layout, overflow, action visibility, target geometry, dock clearance, composition, and viewport interaction |

## Scenario inventory

| Logical scenario | Historical execution | New primary owner | Migration disposition |
| --- | --- | --- | --- |
| PUI-01 admin participant entry exposes capability-shaped management affordance | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | API capability remains a Worker contract; one browser boundary is retained for real entry behavior |
| PUI-01 staff participant entry precedes management action | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Server capability stays at Worker seam; browser mode boundary remains covered |
| PUI-01 member entry has no management gateway | `programs-d1` × 3 projects | Worker Contract + Browser Acceptance | Authorization remains server-owned; browser affordance remains a critical boundary |
| PUI-01 mode switching preserves Program intent and tab semantics | `programs-d1` × 3 projects | Browser Acceptance | Navigation/history behavior needs a browser |
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

The participant rows requiring 320/390/1280 layout, overflow, target, or composition proof are explicitly retained above for T05.6. Pure Worker/D1 variants remain in the existing `web/lib/programs/*.test.ts` contract suites and the focused T05.2 tracer; Browser Acceptance does not delete them.
