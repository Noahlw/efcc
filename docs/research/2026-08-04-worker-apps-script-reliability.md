# Worker → Apps Script Reliability Research

**Date:** 2026-08-04  
**Question:** Is the CF1 problem a Worker code defect, a large upstream delay, or a reason to change architecture?  
**Status:** Evidence-backed diagnosis; root cause unresolved; architecture change not yet required.

## Executive conclusion

The bug is real as an **intermittent deployed-transport failure**. It is not accurate to describe the Worker as simply unable to call Apps Script, and it is not consistently slow:

- When the deployed path succeeds, the RPC completes and the signed envelope is verified. Earlier traces recorded successful login/restore calls in roughly 1.7–3.8 seconds.
- The strict E2E trace currently on disk recorded `loginUser` as HTTP 200 after 17.3 seconds, then `restoreApp` as HTTP 502 after 21.5 seconds. The exact 502 body is `UPSTREAM_UNREACHABLE` with detail `The operation was aborted due to timeout` (`test-results/.../trace.zip`, extracted body `resources/442a5b445f475aac2eef4b5df51f640b570ad288.dat`). This is timeout evidence, not evidence that this trace received HTML.
- Separate hammer observations recorded both timeout/hang behavior and non-JSON responses on some deployed requests. Those are distinct failure classes and must not be conflated with the saved E2E trace.
- Direct residential-IP measurements were much healthier than deployed-Worker measurements, while the local `wrangler dev` control used an intentionally invalid signature and received immediate JSON `403`s. These controls **strongly support** a deployment-path difference, but they do not prove that Cloudflare egress IP treatment is the sole cause: the local request was not an identical valid envelope and the deployed/edge environments differ.

Therefore: **do not commit to an architectural change yet.** First apply the least-invasive, evidence-producing transport/configuration checks below. Move to a different egress/backend only if those checks fail and a stable 100% acceptance requirement remains.

## What the official documentation says

### Apps Script behavior

1. **ContentService redirects by design.** Google documents that ContentService output is redirected to a one-time `script.googleusercontent.com` URL for security, and an HTTP client returning data to another application must follow redirects:  
   <https://developers.google.com/apps-script/guides/content#redirects>

   The TextOutput reference states the same limitation and documents JSON TextOutput methods:  
   <https://developers.google.com/apps-script/reference/content/text-output>

   Consequently, seeing a redirect in the upstream chain is not itself a bug. The Worker must inspect the final response rather than assuming `/exec` is the final response URL.

2. **Deployment settings matter.** `ANYONE_ANONYMOUS` permits callers without Google login; `ANYONE` requires a logged-in user. `USER_DEPLOYING` executes as the deployer, while `USER_ACCESSING` executes as the caller:  
   <https://developers.google.com/apps-script/manifest/web-app-api-executable>  
   <https://developers.google.com/apps-script/guides/web>

   The repository manifest requests `ANYONE_ANONYMOUS` + `USER_DEPLOYING` (`src/gas/appsscript.json`), but that does not prove the live versioned deployment has the same settings. Verify the deployed configuration directly.

3. **`/exec` versus `/dev`.** Google documents `/dev` as an editor-only test deployment running the latest saved code; public traffic should use a versioned `/exec`:  
   <https://developers.google.com/apps-script/guides/web>  
   <https://developers.google.com/apps-script/concepts/deployments>

4. **Quotas can stop execution, but do not explain the current trace by themselves.** Google documents a six-minute execution limit, 30 simultaneous executions per user, and 1,000 per script. Quota/limit exhaustion throws an exception and stops execution; the execution dashboard is the supported place to inspect running/failed executions:  
   <https://developers.google.com/apps-script/guides/services/quotas>

   The published 50 MB URL Fetch limits are for Apps Script's outbound URL Fetch service, not a documented limit on Worker-to-web-app ingress. Do not use them as an explanation for this incident.

5. **No documented Apps Script setting selects source egress IP or removes the ContentService redirect.** The deployment API exposes the generated web-app URL plus access/execute settings, not a selectable inbound source-IP policy or stable non-redirecting ContentService URL:  
   <https://developers.google.com/apps-script/api/reference/rest/v1/projects.deployments>

### Cloudflare Workers behavior

1. **`fetch()` supports an explicit cache policy.** Cloudflare documents `cache: "no-store"` and `cache: "no-cache"`; both send `Pragma: no-cache` and `Cache-Control: no-cache` to the origin, while `no-store` bypasses Cloudflare caches for non-Cloudflare origins:  
   <https://developers.cloudflare.com/workers/runtime-apis/fetch/>

   This is a safe, narrow test for stale/intermediary caching. It is not documented as a fix for connection reachability or upstream latency.

2. **Redirect behavior is controllable.** Cloudflare documents `redirect: "follow" | "error" | "manual"`. `manual` lets the Worker inspect a 3xx and enforce its own policy. Cloudflare also warns that automatic follow can forward all headers to a different hostname/domain, so the final redirect host and header behavior should be observed carefully:  
   <https://developers.cloudflare.com/workers/runtime-apis/request/>

   Production can continue following the documented Apps Script redirect, but a short-lived diagnostic deployment should capture status, redirect flag, final hostname, and final content type without logging query strings or response bodies.

3. **Timeouts are application-owned.** Workers exposes `AbortSignal` for cancellation; Cloudflare does not prescribe a default per-subrequest timeout. The current 12-second `AbortSignal.timeout()` is therefore a local policy, not a platform-mandated value:  
   <https://developers.cloudflare.com/workers/runtime-apis/web-standards/>  
   <https://developers.cloudflare.com/workers/platform/limits/#duration>

4. **Cloudflare documents observability sufficient to classify the failure.** Workers Traces capture outbound fetch timing/status/request metadata, and Workers Logs capture request/response metadata, errors, and custom logs:  
   <https://developers.cloudflare.com/workers/observability/traces/>  
   <https://developers.cloudflare.com/workers/observability/logs/workers-logs/>

   Instrumenting timing, response status, `redirected`, final hostname, content type, and caught exception type/message can distinguish: connection exception, delayed HTTP response, final HTTP error, and non-JSON response.

5. **Default outbound IP is not documented as selectable per Worker.** Cloudflare documents a large shared egress pool and a separate Dedicated CDN Egress product for Enterprise customers. Placement can change execution location/latency but is not documented as pinning a stable source IP:  
   <https://developers.cloudflare.com/smart-shield/configuration/dedicated-egress-ips/>  
   <https://developers.cloudflare.com/smart-shield/configuration/dedicated-egress-ips/how-it-works/egress-ips/>  
   <https://developers.cloudflare.com/workers/configuration/smart-placement/>

   This makes dedicated egress a possible later architecture/product option, not the first fix to try.

## Least-invasive fix and verification order

### 1. Verify the live Apps Script deployment

Confirm through Manage deployments/API, not only the manifest:

- Worker target is the versioned `/exec` URL.
- Access is `ANYONE_ANONYMOUS`.
- Execute as is `USER_DEPLOYING`.
- The deployed code's `doPost` returns JSON `TextOutput`, not `HtmlOutput`.
- Apps Script execution history has no quota, authorization, or runtime failures during a bad window.

### 2. Add `cache: "no-store"` to the Worker upstream fetch

This is the smallest supported change and directly rules out stale/intermediary caching as a contributor. It should be tested with a fresh deployment and paired measurements. It is not a claim that caching is the root cause.

### 3. Add bounded metadata-only transport observability

For each upstream attempt, record only non-sensitive metadata in Workers Logs/Traces:

- attempt number and elapsed milliseconds;
- caught exception name/message, if `fetch` rejects;
- upstream status and content type, if a response arrives;
- `response.redirected` and final hostname, with query strings removed;
- Cloudflare colo/trace metadata when available.

Never log the signed envelope, authorization/session values, one-time redirect query strings, or response bodies.

### 4. Run a synchronized paired test

At the same time window, send the same valid envelope directly from a controlled residential client and through the deployed Worker. Record status/timing/content type and correlate the Worker request ID with Workers Logs and Apps Script execution history. Repeat across good and bad windows. This is needed before attributing the failure to IP reputation, bot handling, redirect caching, deployment state, or Google transient infrastructure.

### 5. Reconsider the Worker retry policy

ADR-0018 §7 currently defines **client-owned** retries: retry-safe network/502/503/504 failures, up to three total attempts, with backoff/jitter. The Worker-side two-attempt/12-second retry is an unamended mitigation layered on top of that contract (`docs/adr/0018-frontend-http-boundary-auth-and-api-contract.md:133-152`). It may absorb one transient failure but can consume the E2E time budget before the client retry begins. Do not tune retry counts or extend test timeouts until the failure class is measured.

If retained, formally amend ADR-0018 and keep the explicit four-action allowlist; otherwise, prefer restoring the single upstream attempt and letting the existing client policy own retries.

## When architecture change becomes justified

An architecture/product change is justified only if all of the following are true:

1. Live deployment settings and Apps Script execution history are clean.
2. `cache: "no-store"` and redirect-aware metadata show the failure is not stale caching or an incorrect redirect/final response.
3. Synchronized valid-envelope tests repeatedly show the deployed Worker path failing while a healthy direct path succeeds.
4. A stable 100% acceptance requirement is non-negotiable.

At that point the evidence supports evaluating Dedicated CDN Egress (an Enterprise Cloudflare product) or moving the backend endpoint off Apps Script. Neither is required by the current evidence alone, and neither is a documented Apps Script configuration toggle.

## Local evidence index

- Current upstream implementation and retry allowlist: `web/worker.ts:178-301`.
- Current client retry contract: `web/lib/api.ts:113-413`.
- ADR-0018 client-owned retry policy: `docs/adr/0018-frontend-http-boundary-auth-and-api-contract.md:133-165`.
- Strict E2E trace: `test-results/worker-transport-CF1-01-Wo-cb43d-as-many-nav-items-as-MEMBER-chrome/trace.zip`.
- Exact trace 502 body after extraction: `{"code":"UPSTREAM_UNREACHABLE","detail":"The operation was aborted due to timeout"}`.
- PR #157 deployment and hammer observations: <https://github.com/Noahlw/efcc/pull/157#issuecomment-5178660244>.
