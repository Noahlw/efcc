# S4-06 Management Access Integration Gate

**Date:** 2026-08-26
**Base:** `origin/main` `83fafdb8`
**Coordinator branch:** `feat/s4-management-access`
**Prototype authority:** `prototype/s4-management-access` `653a5318`
**Spec:** [#449](https://github.com/Noahlw/efcc/issues/449)

## Implemented commits

| Ticket | Commit | Result |
| --- | --- | --- |
| #450 S4-01 additive Role policy | `b7ad4fe` | integrated |
| #451 S4-02 Account Directory | `2e92f14` | integrated |
| #452 S4-03 capability-backed Registration Approval | `151d3f6` | integrated |
| #453 S4-04 Permission Policy read | `aab7ea53` | integrated |
| #454 S4-05 atomic Permission Policy write | `600c8387` | integrated |
| #455 S4-06 integration/readiness | `c18cb0c` | integrated conditionally |

The post-review repair commits `c45bdff2`, `a134f4f8`, `c18cb0c`, `04fcde4`,
and `c112c9f` close the bounded Account Directory, role-gate, policy-summary,
idempotency-audit, responsive-layout, filter-only, direct-detail recovery,
retry-focus, and static-runtime navigation findings.

## Deterministic gate results

- Web typecheck: PASS
- Component suite: PASS — 47 files / 554 tests
- Focused S4 Worker evidence: PASS — 71 tests across 5 files
- Focused S4 component evidence: PASS — 27 tests across 3 files
- Production build: PASS — 18 static routes
- Final Impeccable detector: PASS — zero findings on Account Directory, Hub, and Permission Policy targets
- `git diff --check`: PASS on the final clean tree

## Full Worker suite

`pnpm --dir web test`: **474/475 tests passed** across 30 passing files.

The remaining failure is not S4 behavior: the existing EVT-02.1 recurring preview assertion expects a `CANCEL` skip reason but receives `null` (`web/lib/programs/programs.test.ts:3308`).

The old Admin-without-`program.enroll` assertion was contradicted by approved S4-F01. It was updated to assert the new Admin participant baseline and now passes.

The remaining EVT-02.1 failure predates S4 and is outside #450–#455 scope; it must not be silently changed in this gate.

## Frozen contract ledger

| Contract | Result | Evidence |
| --- | --- | --- |
| S4-F01 | PASS | #450 policy unit/D1 seed + updated Program enrollment assertion |
| S4-F02 | PASS | #451 distinct Account Directory route/projection |
| S4-F03 | PASS | #451 routable read-only Account Detail context |
| S4-F04 | PASS | no lifecycle/pastoral mutation added |
| S4-F05 | PASS | global roles/scoped grants preserved |
| S4-F06 | PASS | #453/#454 global policy only; no per-account overrides |
| S4-F07 | PASS | Admin/Staff/Member `program.enroll` baseline |
| S4-F08 | PASS | Staff Department/Program defaults |
| S4-F09 | PASS | Home publish and policy write Admin-only |
| S4-F10 | PASS | Account Directory and Approval capability gates |
| S4-F11 | PASS | Hub/direct route server seams preserved |
| S4-F12 | PASS | Registration idempotency/CAS/conflict tests |
| S4-F13 | PASS | staged atomic policy write |
| S4-F14 | PASS | revision mismatch returns 409 with no partial write |
| S4-F15 | PASS | Admin policy safety invariants |
| S4-F16 | PASS | immutable policy audit outcomes |
| S4-F17 | PASS | Directory B / Approvals A / Permissions C integrated |
| S4-F18 | PASS | Permissions C phone grouping; no shrunken table |
| S4-F19 | PASS | explicit read/error/busy/success/conflict states in focused UI tests |
| S4-F20 | PASS | type/CSS contracts and Impeccable inspection |
| S4-F21 | PASS | prototype router/fake data not imported into production |
| S4-F22 | PASS | focused response/D1 evidence accompanies screenshots/DOM |
| S4-F23 | PASS | each UI slice used selected prototype + bounded Impeccable pass |
| S4-F24 | PASS | local-D1 Management browser matrix at 320/390/800/1440 plus functional mutation probes |

## Responsive and runtime evidence

The selected prototype proved 80/80 states across 320px, 390px, 800px, and 1440px. Integrated production surfaces have component geometry, semantic state, and Impeccable detector evidence. The bounded local Worker/D1 Management matrix is green; the broader existing HUB/PERM suite remains subject to the Wrangler proxy instability documented below, so this report does not claim complete S4 release readiness.

## Local D1 Playwright verification

- Runtime: isolated `wrangler dev` + D1 persistence `/tmp/s4-management-playwright-3`, port `8794`, disposable `E2E_`/`E2E_DEMO_` seed.
- Direct Management probes: PASS at `320×844`, `390×844`, `800×844`, and `1440×844`; all surfaces had no horizontal overflow, minimum visible interactive target `44px`, and Account Detail/Permission Policy breakpoint behavior matched the contract.
- Functional mutation probe: PASS at `390×844`; Admin saved a Permission Policy change (authoritative revision advanced to `3`), then approved and rejected two disposable registrations through the real UI and D1-backed Worker.
- Existing approval acceptance test: PASS — 1 test at `phone-320`.
- A broader HUB/PERM grep run reached 10 passing tests before Wrangler 4.118 emitted `Network connection lost` and terminated the local proxy; the resulting connection-refused cases are harness/runtime instability, not assertion failures. No product P0/P1 was inferred from that run.

## P0–P3 ledger

- P0: none found.
- P1: none found in focused S4 seams.
- P2: one inherited EVT-02.1 preview failure; outside S4 scope and requires its owning ticket. No S4 P2 remains in the bounded repair scope.
- P3: none recorded after the bounded Impeccable pass.

## Verdict

**S4 IMPLEMENTED — INTEGRATION CONDITIONAL**

The S4 implementation chain is present and deterministic local code gates are green. The final gate remains conditional until a dedicated local Worker/D1 Management Playwright matrix covers Account Directory B, Approvals A, and Permission Policy C at 320/390/800/1440. No production readiness claim is made from this report.
