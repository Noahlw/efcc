# S2 Integration Gate — participant stack readiness

**Ticket:** #405
**Authority:** `docs/specs/396-s2-participant-hardening-and-design-integration.md`
**Stack head before gate:** `feat/404-home-long-copy`
**Status:** Gate trace written before execution

## Contract under test

The child branch is the current linear S2 stack above the reviewed #390–#395
history and preserves the accepted Phase 391 baseline plus ticket layers #401–#404.
The real loopback Worker/D1 application serves the current export with fresh
`E2E_*` and `E2E_DEMO_*` fixtures. Promoted availability, Program Detail schedule,
advisory/action, Programs recovery/wrapping, and Home wrapping/skeleton behavior
are verified through observable response/DOM contracts without Apps Script,
Sheets, `/exec`, or Cloudflare access.

## Gate evidence

| ID | Evidence | Required result |
| --- | --- | --- |
| INT-01 | Stack metadata and branch ancestry | #405 is based on #404, which is based on #403 → #402 → #401 → `feat/389` at `88b96afa`; Phase 391 baseline remains in the child line. |
| INT-02 | Local disposable D1 Worker | `wrangler dev` serves `127.0.0.1:8787`; only checked-in disposable seed scripts mutate local `E2E_*`/`E2E_DEMO_*` fixtures. |
| INT-03 | Typecheck/unit/component gate | Root prototype, Worker/API, component, and changed-contract suites pass. |
| INT-04 | Responsive/browser gate | Programs/Home local Playwright covers 320×812, 375×844, 390×844, 414×844, 799×900, 800×900, and 1440×900 with DOM/response, overflow, controls, focus, and authorization assertions. |
| INT-05 | Remote stack gate | PR layers #406, #407, #409, and #410 have required remote checks green; deployed auth smoke remains manual-only. |
| INT-06 | Scope and safety | No rejected/optional/deferred Wayfinder work enters the diff; no Apps Script/Sheets/deployed `/exec`/Cloudflare mutation occurs. |

## Stop rule

Do not mark the integration child ready until each evidence row is observed and
recorded. A failed required remote check stops the stack; do not repair/retry in
the same layer without explicit authorization.

## Executed results

- Stack ancestry observed: `feat/405-s2-integration-gate` is based on `feat/404-home-long-copy`, whose lower chain is #403 → #402 → #401 → `feat/389-s2-05-program-detail` at `88b96afa`.
- Loopback Worker/D1 was seeded with `pnpm db:seed:local` and `pnpm db:seed:demo`; no Apps Script, Sheets, `/exec`, or Cloudflare resource was touched.
- `pnpm typecheck`, 38 root prototype tests, 455 Worker tests, 527 component tests, and 92/93 shell-responsive tests passed; the single skip is the existing desktop profile viewport case.
- Promoted local Playwright gate passed 23/23 at each of phone-320, phone-390, and desktop (69/69 total), including the seven required long-copy widths/heights and the PUI-01–PUI-05 recovery, schedule, enrollment, Event Detail, and Home-origin flows.
- Required remote checks on PRs #406, #407, #409, and #410 passed; deployed D1 auth smoke remained manual-only/skipped.
- A separate full `programs-d1.test.ts` phone-320 stress run reached 62/66 and exposed four unrelated stateful management/permissions assertions outside the promoted #401–#404 gate; the scoped 69/69 promoted rerun passed with fresh fixtures per viewport.
