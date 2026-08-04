# CF1 E2E Strict-Run Metadata Evidence

**Date:** 2026-08-04  
**Plan reference:** `docs/omp-plans/2026-08-04-worker-apps-script-reliability.md` Task 4  
**Worker version:** `4892e90f-a902-4acd-9c2e-4972334bb664` (with `cache: "no-store"` and per-attempt metadata logging)

## What was run

`tests/e2e/worker-transport.config.ts` strict run (`--retries=0`) against `https://efcc-prototype-129.efcc-ggc.workers.dev`.

The Playwright capture now records `cf-ray` and `X-Request-Id` for every `POST /api/v1/rpc` and redacts any 64-character hex token (envelope signature) before persisting.

## Per-RPC timeline

| RPC | Time | ms | Status | `cf-ray` | `X-Request-Id` | Content-Type |
|---|---|---|---|---|---|---|
| 1 (noah login) | T+2347ms | 23560 | 200 | `a25e222b6901e377-NRT` | `74947f5d-e22a-4a55-8217-6da6483686c2` | `application/json` |
| 2 (alice re-login restoreApp) | T+26458ms | 20584 | 200 | `a25e22c20e12e377-NRT` | `d450f5f1-92e9-4ad4-a1f2-5a2e4c593aa3` | `application/json` |

Both calls returned HTTP 200 with `application/json` bodies (the success envelope the dispatcher embeds `{success, requestId, data}`). Neither call returned `UPSTREAM_UNREACHABLE` or `UPSTREAM_BAD_RESPONSE`. The Worker now correctly forwards the upstream `requestId` into `X-Request-Id`, which can be cross-referenced with Workers Logs (the per-attempt `console.log` is enabled by this deploy).

The two calls together took **44.1s**. Each call alone is 20-23s, dominated by the upstream Apps Script round-trip. The 60s test budget is consumed by the calls themselves, and the test fails because it does not have headroom for two 20s+ logins.

## Test outcome

```
1 failed
1 passed (58.9s)
```

The MEMBER test passed (one login → one restoreApp, single 20-23s upstream call, the 60s budget covers it). The ADMIN test failed at the second `loginAs(alice)` after noah logout: both upstream calls were 20s+ HTTP 200, the 45s `APP_READY_TIMEOUT` per login ran out, the page state captured at failure was `正在還原工作階段…` (restoring session — the app was still waiting for the second `restoreApp`'s response to render the nav bar).

The failure is **upstream latency, not a Worker code defect**:
- the envelope is verified (a 200 success body proves it);
- the response is remapped correctly (status 200, `X-Request-Id` from the upstream `requestId`);
- the failure class is "calls take 20-23s," not "calls fail" or "calls return HTML."

This matches the previous E2E runs in failure pattern: same page state, same `APP_READY_TIMEOUT` exhaustion. The earlier PR #157 trace saw a single 21.5s `UPSTREAM_UNREACHABLE`; this run saw two 20s+ `HTTP 200` successes. The 60s budget cannot accommodate two such slow calls.

## Next-step recommendation

- **Do not extend E2E timeouts.** Doing so would mask the underlying latency and move the goalposts. The pre-existing `APP_READY_TIMEOUT = 45_000` already grants one slow login; the test fails because it needs two slow logins plus logout, which exceeds the 60s per-test budget.
- **The fix path requires a faster upstream hop, not Worker code.** Options documented in `docs/research/2026-08-04-worker-apps-script-reliability.md` are Cloudflare Dedicated CDN Egress (Enterprise) and moving the upstream off anonymous Apps Script. Both are out of scope for this plan.
- **The Worker-side mitigation in this PR (commit `4f619dd`) is the right local fix and is now in production at version `4892e90f`.** Hangs are eliminated and per-attempt failure class is now logged for Workers Logs correlation. The strict E2E gate remains blocked by upstream latency, not by code.
