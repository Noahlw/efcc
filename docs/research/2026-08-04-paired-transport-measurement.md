# CF1 Paired Transport Measurement

**Date:** 2026-08-04  
**Plan reference:** `docs/omp-plans/2026-08-04-worker-apps-script-reliability.md` Task 2

## Method

Two probe shapes were run from this machine against the same live Apps Script deployment (verified healthy in `docs/research/2026-08-04-live-deployment-verification.md`):

1. **Direct signed envelope** — signed with `EFCC_SERVICE_SECRET` (read from `wrangler secret get`); `action: "restoreApp"`, `params: {}`. POSTed to the live `/exec` URL.
2. **Browser-shape to the deployed Worker** — `{action: "restoreApp", params: {}}` (no session). The path the browser takes: the Worker signs the envelope, forwards to `/exec`, and remaps the response.

Two experiments were run, each capturing metadata only: `status`, elapsed `ms`, `content-type`, `redirected`, final hostname, `cf-ray`, `X-Request-Id`, caught exception. **No response bodies, no signatures, no secrets were written to disk.**

## Experiment A — separate direct vs. separate browser-shape (sequential, not interleaved)

This was the initial measurement; its results are in `.scratch/transport-pair.20260804-215606.json` and `.scratch/transport-repro.20260804-215928.json`.

- Direct signed envelope, 8 rounds at 1.5s gap: **8/8 HTTP 200 in 1.4–3.8s** with structured `application/json; charset=utf-8` and a unique `cf-ray`/`X-Request-Id` per request.
- Browser-shape to the Worker, 8 rounds at 2s gap: **5/8 HTTP 401 in 1.5–1.8s** (upstream success → dispatcher returned `AUTH_REQUIRED`), **1/8 HTTP 502 in 18.7s** (`UPSTREAM_BAD_RESPONSE`, non-JSON from upstream), **1/8 HTTP 401 in 14.4s** (likely a retry after a slow upstream attempt).

This run reproduces the failure on demand but **does not isolate the cause** — the direct successes and the Worker failures were captured minutes apart, and Apps Script's failure windows are documented to last minutes.

## Experiment B — interleaved direct vs. browser-shape (per round)

To rule out the "Apps Script is in a bad window right now" hypothesis, each round fired the direct probe and the browser-shape Worker probe within ~200 ms of each other, then waited 2 s before the next round. If both probes fail in the same round, the upstream is having a problem; if direct succeeds and Worker fails, the failure is on the Worker's egress path specifically.

| Round | Direct status | Direct ms | Worker status | Worker ms |
|---|---|---|---|---|
| 0 | 200 (ok) | 3293 | timeout | 25003 |
| 1 | 200 (ok) | 2563 | 401 (ok, no session) | 2522 |
| 2 | 200 (ok) | 3134 | 401 (ok, no session) | 2214 |
| 3 | 200 (ok) | 2475 | 401 (ok, no session) | 2466 |
| 4 | 200 (ok) | 2680 | 401 (ok, no session) | 6990 |
| 5 | 200 (ok) | 10508 | 401 (ok, no session) | 17182 |
| 6 | 200 (ok) | 24540 | 401 (ok, no session) | 1853 |
| 7 | 200 (ok) | 7515 | timeout | 25002 |
| 8 | 200 (ok) | 2929 | 401 (ok, no session) | 14761 |
| 9 | timeout | 24993 | 401 (ok, no session) | 14184 |

Summary:

| Outcome | Count |
|---|---|
| Direct ok, Worker ok | 7 |
| Direct ok, Worker fail | 2 (rounds 0 and 7) |
| Direct fail, Worker ok | 1 (round 9) |
| Both fail | 0 |

Saved output: `.scratch/transport-interleave.20260804-220123.json`.

**Direct and Worker failures do not correlate.** In rounds 0 and 7, the direct probe returned HTTP 200 from the live Apps Script deployment in 3.3s and 7.5s while the Worker's upstream fetch to the same deployment timed out at 25s. In round 9, the direct probe timed out while the Worker returned a structured 401 in 14s. This pattern is **not consistent with a shared upstream failure window** affecting both probes simultaneously.

The interleaved evidence strongly supports the hypothesis that the deployed Worker's upstream hop to Apps Script is the failing component. The direct path from this machine reaches the same deployment successfully even while the Worker is timing out.

## Verdict

The deployed Worker's upstream hop to Apps Script is intermittently failing on demand with both:

- **Timeout** — `UPSTREAM_UNREACHABLE` after ~12s (Worker's `AbortSignal.timeout(12000)`) or ~25s (after the Worker's 2-attempt retry).
- **Non-JSON response** — `UPSTREAM_BAD_RESPONSE` after the Worker's retry budget.

The direct path to the same deployment from this machine does not exhibit these failures during the Worker's failure windows. The Worker's own request-body validator (which returned 400 to envelope-shape probes) is healthy; the failure is downstream of the validator, inside the upstream fetch.

The next in-repo step (Task 3 of the plan) is to add `cache: "no-store"` to the Worker fetch and per-attempt metadata-only logging so future strict E2E runs can classify the failure class from Workers Logs without leaking the envelope or response body, and so subsequent paired measurements can be cross-referenced with Workers Traces (e.g. the `cf-ray` column) for any future architecture decision.
