# REL-01 (#261): Spec #241 Testing Decisions → observable evidence matrix

Maps every one of Spec #241's 12 "Testing Decisions" (the acceptance-relevant testing
requirements, as distinct from its 38 user stories / 29 implementation decisions, which
are design narrative already covered piecemeal by the dozens of component/unit/E2E
files across #245-#260) to the observable test evidence that proves it. Local-verified
(`wrangler dev` + local D1, per ADR-0029) vs. deployed-would-require is called out
per row.

| # | Testing Decision (Spec #241) | Evidence | Local-verified / Deployed-only |
|---|---|---|---|
| 1 | Highest practical acceptance seam is a real phone/browser journey against an isolated Cloudflare preview + disposable D1, same-origin Worker | `tests/e2e/programs-vertical-proof.test.ts` (30/30, phone+desktop) + `programs-d1.test.ts`, both real-browser Playwright against `wrangler dev` (real Worker + real D1 SQLite, not fixtures) | Local-verified; literal Cloudflare-hosted preview is deployed-only (see release-evidence doc §3) |
| 2 | E2E coverage: participant discovery/enrollment, capability-aware management entry, Program/Event ops, enrollment decisions, self/assisted/guest check-in, direct-link preservation, authorization denial | `programs-vertical-proof.test.ts` P1.1-P4.4 (all 15 features); `programs-d1.test.ts` PUI-01..04, MUI-01/02, AUTH-01, EVT-01/02, NTF-01, CFG-01 | Local-verified |
| 3 | Deployment acceptance uses seeded accounts/scoped grants covering Member, exact-Program Leader, Department Manager, broader administrator, without role-name client authorization | `programs-d1.test.ts` AUTH-01 suites (grant/revoke/scope-inheritance); NEW `programs-capability-matrix-proof.test.ts` (this ticket) adds cross-scope denial + Staff/Admin role-global breadth via **direct API requests**, closing the one prior gap (UI-only proof of scope, not direct-request proof of cross-scope denial) | Local-verified |
| 4 | Real-device/representative mobile-browser smoke: camera permission, capture, manual fallback, mode switching, Event binding, rotation/viewport change, recovery after denial | Manual fallback: `self-check-in-panel.test.tsx` (jsdom mock) + real-browser camera-open path via NEW `programs-device-proof.test.ts`. Mode switching/Event binding: `programs-vertical-proof.test.ts` P4.2. Rotation/viewport: `responsive.test.ts` (fresh-load) + NEW `programs-resilience-proof.test.ts` (mid-flow). **Real physical-device capture and true permission-denial-by-a-human are not reachable by this agent** — see release-evidence doc §4 | Local-verified except physical-device capture (deferred, operator-owned) |
| 5 | Camera/QR decoding behind a narrow adapter contract; deterministic tests cover valid/invalid/ambiguous/repeated/unsupported-device outcomes without replacing device proof | `use-qr-camera.ts` is the narrow adapter; `use-qr-camera.test.tsx` covers all listed outcomes via mocked `BarcodeDetector`/`getUserMedia`. NEW `programs-device-proof.test.ts` adds the real-browser stream-binding proof the mocks cannot provide | Local-verified |
| 6 | Effective-access projection tests: Program/Department scopes show correct controls while direct unauthorized requests still fail server-side | `programs-d1.test.ts` MUI-01/MUI-02 (UI projection + one direct-request denial case); NEW `programs-capability-matrix-proof.test.ts` extends direct-request denial to cross-Program and cross-Department scope specifically | Local-verified |
| 7 | State-transition tests: Program lifecycle, Event availability, cancellation, check-in windows, enrollment decisions, duplicate attendance, corrections, voids | `programs-d1.test.ts` EVT-01/EVT-02/MUI-02; SCN-01..04 suites (duplicate/correction/void) | Local-verified |
| 8 | Worker/persistence contract tests: transactionality, audit evidence, duplicate/idempotent behavior, conflict, validation, rate limiting, stale data, retry-safe failures, request correlation | `attendance-worker.test.ts` (rate limiting, 429), SCN-01..04 (audit `old_value_json`/`new_value_json`, idempotency, `requestId`); D1 chunking fix (this ticket, PR #288) proves transactional batch-write correctness under D1's SQL-variable limit; NEW `programs-resilience-proof.test.ts` adds retry-safe-failure proof (network abort + recovery) | Local-verified |
| 9 | Component/interaction tests: loading, empty, forbidden, unavailable, network failure, optimistic feedback, Undo, confirmation, restored context, focus management, accessible names, non-color status | Pervasive across all suites (every interaction asserted via `getByRole` with accessible names); Undo: `programs-d1.test.ts` EVT-01; NEW `programs-resilience-proof.test.ts` adds network-failure + restored-context-after-mid-flow-expiry, NEW `programs-device-proof.test.ts` adds reduced-motion | Local-verified |
| 10 | Core responsive acceptance targets narrow phone viewport first; larger viewports adapt the same IA | `responsive.test.ts`, dual-viewport projects in `programs-vertical-proof.config.ts` (375x667 phone-first + 1280x720 desktop, same assertions both) | Local-verified |
| 11 | No ticket is production-complete solely on local fixtures/unit/build/prototype; deployed browser/API/persistence evidence required for final vertical acceptance | This is the crux of #261 itself. Local `wrangler dev` + local D1 is real Worker + real SQLite D1 (not fixtures/mocks) per ADR-0029's definition of the READY gate. Literal Cloudflare-hosted evidence remains deployed-only, documented as operator-owned in the release-evidence doc, not fabricated | Local-verified is this repo's READY bar; Cloudflare-hosted is optional/manual per `AGENTS.md` |
| 12 | Cleanup acceptance requires proof that replacement routes/deployments are live, data preserved/reproducibly seeded, rollback documented, obsolete targets have no remaining consumers | Rollback + seeding/recovery documented in release-evidence doc §1-2. Retirement itself explicitly NOT performed — blocked on operator approval per the ticket's own text and Spec #241 Implementation Decision #29 | Not performed (correctly deferred, not a gap) |

## Result counts (filled in after the three new suites ran)

| Suite | Tests | Pass |
|---|---|---|
| `programs-vertical-proof` (PR #288, re-verified) | 30 | 30 |
| `programs-resilience-proof` (NEW, #261) | 8 | 8 |
| `programs-capability-matrix-proof` (NEW, #261) | 3 | 3 |
| `programs-device-proof` (NEW, #261) | 2 | 2 |
| **Total new this ticket** | **13** | **13** |
| **Total including PR #288** | **43** | **43** |

Local `wrangler dev` + local D1, `pnpm typecheck` (root + `web/`) clean, `ultracite
check` clean. Full per-suite breakdown and per-test coverage mapping in
`2026-08-15-rel-01-ticket-261-release-evidence.md` §5.
