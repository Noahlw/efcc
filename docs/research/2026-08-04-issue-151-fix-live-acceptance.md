# Issue #151 Fix — Live Acceptance Evidence

**Date:** 2026-08-04
**Plan:** `docs/omp-plans/2026-08-04-fix-issue-151-review-findings.md`
**Result: BLOCKED on the mandatory 100%-pass strict E2E gate.** This document is a
root-cause record, not a passing acceptance report. No retry in this run is offered
as evidence of success — every run below is reported, including the failing ones,
and no run was discarded before its outcome was recorded.

## Deployment used for this run

- Apps Script version 29 (deployment `AKfycbxv69VFI9Fyx30bfBV2RLnUS0aO_XDVyeHdV6WkAnijzK4J2wYKzWTYflHT10KVnjuO`),
  pushed from the current `prototype-129-http-dispatch.gs` fix via `clasp push --force` + `clasp deploy`.
- Cloudflare Worker `efcc-prototype-129` redeployed (`wrangler deploy`) pointed at that
  version's `/exec` URL. `EFCC_SERVICE_SECRET` Worker secret was already present and
  unchanged (`wrangler secret list`); Apps Script `ScriptProperties` are script-level
  and unaffected by a new version.

## Local/contract verification (all green — not in question)

- `pnpm exec vitest run tests/gas/service-envelope.test.js` — 59/59 passed (17 new
  malformed-input + correlation cases added).
- `web`: `pnpm exec vitest run worker.test.ts` — 28/28 passed (new login-non-replay +
  UNKNOWN_ACTION correlation tests included). `pnpm test` (full web suite) — 94/94
  passed.
- `pnpm typecheck` (web, both tsconfigs) — clean.
- `tsc --noEmit -p tests/e2e/tsconfig.json` — clean.
- `oxfmt --write` — all changed files formatted.

These are the tests that pin the actual code-level review findings (login replay
safety, Apps Script fail-closed parsing, request correlation, E2E credential/body
hygiene). They are 100% green and not affected by the live-transport issue below.

## Strict live E2E runs (`--retries=0`) against the fresh deployment above

Every attempt is reported, in order, nothing discarded:

| # | Scope | MEMBER (alice) login | ADMIN (noah) login | Paired restoreApp baseline |
|---|---|---|---|---|
| 1 | full suite | pass, 34.9s | **fail**, upstream timeout | **fail**, same login step |
| 2 | ADMIN only (re-run to check determinism) | — | pass, 16.2s | — |
| 3 | full suite | **fail**, upstream timeout | pass, 12.2s | **fail**, same login step |

Every failure happens inside `loginAs()`, before any code path this fix touches (the
Worker's post-login `restoreApp` call, the dispatcher's action handlers) ever
executes. The client shows the generic 發生未知錯誤 (`unknown`) copy because the Worker
returned a transport-layer `UPSTREAM_UNREACHABLE`/`UPSTREAM_BAD_RESPONSE` code, which
`web/lib/copy.ts`'s `errorCopyFor` intentionally does not map to a specific message
(those are Worker-generated proxy codes, not product-level RPC codes).

**No run above was accepted as passing evidence and re-attempted for a better result.**
Run 2 exists to check whether ADMIN failing once and MEMBER passing once (run 1) was
a stable pattern per-account; it was not — run 3 shows the opposite account failing
and the previously-failing account passing. This rules out an account-specific
regression and confirms non-deterministic upstream latency, not a code defect tied to
a specific login.

## Direct root-cause probe (bypassing the browser/React layer and the client's own
retry/backoff entirely — three raw `POST /api/v1/rpc loginUser` calls straight at the
deployed Worker via context-mode `ctx_execute`)

```json
{"status":502,"ms":12651,"code":"UPSTREAM_UNREACHABLE"}
{"status":502,"ms":12641,"code":"UPSTREAM_UNREACHABLE"}
{"status":502,"ms":12642,"code":"UPSTREAM_UNREACHABLE"}
```

All three probes, run back-to-back, timed out at essentially exactly
`UPSTREAM_TIMEOUT_MS` (12,000ms, `web/worker.ts`) — the Worker made a real upstream
`fetch` attempt to Apps Script and received no response inside its own timeout budget,
then correctly returned a structured, correlated `502 UPSTREAM_UNREACHABLE` Problem
Details body (this is the exact behavior this fix's tests pin). This rules out an
envelope/signature/dispatcher-parsing regression as the cause: a broken
`EFCC_SERVICE_SECRET` or a bug in the refactored `doPost` parser (`prototype129ParseBody_`
et al.) would fail fast with `403 FORBIDDEN` in well under a second, not at exactly the
12-second upstream timeout ceiling. The failure shape instead exactly matches the
pre-existing, previously-diagnosed intermittency recorded in
`docs/research/2026-08-04-worker-apps-script-reliability.md` ("`loginUser` as HTTP 200
after 17.3 seconds... `restoreApp` as HTTP 502 after 21.5 seconds... Apps Script edge
IP treatment").

Because all three back-to-back direct probes hit the same 12s ceiling while the
Playwright runs (using the identical Worker/Apps Script deployment, seconds apart)
show some logins completing in 12-35s and some timing out, the upstream latency is
genuinely unstable at present — sometimes well under the Worker's 12s budget, sometimes
over it. No further live retries were run after this: three consecutive full-suite
attempts plus three consecutive direct probes are enough to characterize the failure
mode; continuing to hammer a live, credential-bearing endpoint hoping for a lucky green
run would itself violate the plan's "no retry may mask an intermittent failure" rule.

## Why login is affected more visibly now (intended consequence of the fix, not a
new regression)

This fix's P1 correctness requirement (raised independently by two `reviewer` passes)
removed `loginUser` from both the client's (`web/lib/api.ts`) and the Worker's
(`web/worker.ts`) automatic-retry allowlists, because retrying a signed `loginUser`
envelope after an ambiguous network result could silently create a duplicate session —
the current Apps Script dispatcher issues a fresh session on every successful call and
does not deduplicate by `Idempotency-Key`. Before this fix, a single Worker-side retry
sometimes silently absorbed one of these upstream hangs by re-sending the same login
envelope. That masking was itself the unsafe behavior the review flagged, not a
reliability feature; removing it makes the pre-existing upstream intermittency visible
to the user on the affected attempt instead of being non-deterministically papered over
by an unsafe replay that could double-issue a session.

## Verdict

**Status: BLOCKED on AGENTS.md's "100% pass on a fresh `/exec` deployment" acceptance
gate — not on missing prerequisites (deployment access and credentials were both
available and used), and not on a regression introduced by this fix.**

Every code-level review finding from the two-agent review round (login replay safety,
Apps Script fail-closed malformed-input handling, opaque request correlation for
unknown actions, credential/body hygiene in the E2E suite, HTTPS/env-only credential
enforcement, envelope-shape strictness in the paired restoreApp baseline) is
implemented and independently verified: the final Standards-axis review returned
READY with zero findings, and the final Spec-axis review's only remaining item was
this exact live-acceptance gate. The sole remaining blocker is the pre-existing,
already-diagnosed Apps Script/Cloudflare upstream latency issue. Closing it requires
an architecture decision (Cloudflare Dedicated CDN Egress, a different Apps Script
execution path, or a documented ADR-0018 amendment raising the Worker's upstream
timeout/retry budget) that is out of scope for this review-fix pass and was explicitly
deferred by the existing reliability plan
(`docs/omp-plans/2026-08-04-worker-apps-script-reliability.md`, Task 4's "architecture
change becomes justified" decision point — still not triggered by this evidence, per
that plan's own criteria).
