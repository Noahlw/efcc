# ADR-0018 — Frontend HTTP Boundary, Authentication, and API Contract

- **Status**: Accepted — decision locked via grilling of issue [#128](https://github.com/Noahlw/efcc/issues/128) and implemented by the CF0/CF1 work. **Amendment (2026-08-15)**: the legacy `/api/v1/rpc` proxy, the Apps Script dispatcher (`src/gas/prototype-129-http-dispatch.gs`), and the upstream `/exec` backend were removed with the GAS retirement. The RFC 9457 problem-details shape, `X-Request-Id` correlation, and error-status mapping described here survive on the Worker/D1 native surfaces (`/api/v1/auth/*`, `/api/v1/programs/*`, `/api/v1/attendance*`).
- **Deciders**: Noah Wong, OMP planner (grilling)
- **Date**: 2026-08-03
- **Related**: [Feature CF0 — Cloudflare Frontend, HTTP API & UX Foundation (#118)](https://github.com/Noahlw/efcc/issues/118), [Map #117](https://github.com/Noahlw/efcc/issues/117), [ADR-0017](0017-frontend-repo-rendering-and-cloudflare-deployment-boundary.md) (same-repo monorepo, Cloudflare Workers + static assets, `/api/*` proxy boundary — this ADR refines its transport contract), [ADR-0003](0003-google-script-run-rpc.md) (the `google.script.run` RPC contract this ADR replaces for the Cloudflare frontend), [ADR-0011](0011-one-active-session-per-member.md) (HMAC session token via `PropertiesService` + `Utilities.computeHmacSha256Signature` — the bearer value carried in `Authorization` here), [ADR-0015](0015-single-lock-mutation-and-audit-contract.md) (single-lock mutation and audit; HTTP retries honor ADR-0015's no-replay-on-ambiguous-network-result rule), [Spec #141](https://github.com/Noahlw/efcc/issues/141) / `docs/specs/074-cloudflare-frontend-shell.md` (the canonical shell spec that consumes this contract), [issue #128](https://github.com/Noahlw/efcc/issues/128) (this decision), [issue #129](https://github.com/Noahlw/efcc/issues/129) (prototype — surfaced the Worker JSON-body-to-outer-status remap addendum), [issue #130](https://github.com/Noahlw/efcc/issues/130) (`docs/specs/073-htmlservice-spec-reconciliation-matrix.md` — classifies every ADR/spec clause PRESERVE/AMEND/SUPERSEDE against this ADR), [issue #131](https://github.com/Noahlw/efcc/issues/131) (CF1 server-side Apps Script HTTP dispatch decision — must implement this contract), [issue #142](https://github.com/Noahlw/efcc/issues/142) (CF0-01 implementation ticket — closes the loop on the throwaway `web/` + `web/worker.ts` files referenced below).

## Context

EFCC's existing production frontend is an HtmlService App Document whose only mechanism for calling the Apps Script backend is `google.script.run` (ADR-0003). The migration map at [#117](https://github.com/Noahlw/efcc/issues/117) and CF0 ([#118](https://github.com/Noahlw/efcc/issues/118)) replace that with a Cloudflare-hosted React/Next.js frontend. ADR-0017 already decided the repository boundary (same-repo monorepo), the runtime topology (Next.js static export served by Cloudflare Workers + the `assets` binding, with `/api/*` routed to the Worker first via `run_worker_first` in `wrangler.jsonc`), and that the proxy is a "dumb pass-through" with no business logic. What ADR-0017 did not decide is the wire contract itself.

Issue [#128](https://github.com/Noahlw/efcc/issues/128) asks the nine remaining transport questions:

1. What is the endpoint URL shape, version, and routing style?
2. How does the session token reach the server?
3. How does a browser with no Google session reach the deployment at all?
4. Where does CORS terminate?
5. What does the HTTP status code and error envelope look like?
6. When does the client retry, and when must it not?
7. How does the client make a mutation safe to retry?
8. How is a request traced from browser log line to server log line?
9. What stops an authenticated session from melting Apps Script's 30-simultaneous-execution quota?

The four inherited constraints that bound the answer space:

- **Google Sheets remains the database and Apps Script remains the backend runtime** (`AGENTS.md`, CF0 inherited decisions). The HTTP boundary is *to* Apps Script, not away from it; the existing `api_*` server functions stay.
- **Auth, capability, mutation, lock, audit, and domain validation remain server-enforced.** The HTTP boundary cannot move authority into the browser; it can only carry verified identity to the server.
- **`ContentService.TextOutput` has no API to set an HTTP status code** (verified against `developers.google.com/apps-script/reference/content/text-output`). `doPost` responses from Apps Script are always transport-level 200 regardless of the JSON body's intended status; the proxy Worker is the only layer that can give the browser a real status code.
- **`ContentService` web apps are cross-origin to any Cloudflare-hosted client** (`developers.google.com/apps-script/guides/content`); cross-origin `fetch` from the browser to Apps Script's `/exec` returns the unauthenticated HTML or a Google sign-in redirect, never JSON. The same-origin Worker proxy terminates CORS.

The prototype at [#129](https://github.com/Noahlw/efcc/issues/129) shipped all three pieces (`web/` Next.js static shell, `web/worker.ts` proxy, `src/gas/prototype-129-http-dispatch.gs` throwaway dispatcher) and proved the round trip live on real Cloudflare + an isolated versioned Apps Script deployment. One real finding surfaced by building it: Apps Script cannot set the outer HTTP status, so the Worker's JSON-body-to-outer-status remap is load-bearing correctness, not a nicety. The CF1 ticket [#131](https://github.com/Noahlw/efcc/issues/131) must implement the same contract server-side so the throwaway dispatcher can be deleted.

## Decision

### 1. Endpoint shape — single versioned `POST /api/v1/rpc`, action-multiplexed

The Cloudflare Worker exposes exactly one RPC endpoint:

- `POST /api/v1/rpc` (relative to the same origin as the static assets)
- Request body: `{"action": "<rpcName>", "params": { ... }}`
- Response body: existing `{success: true, requestId, data}` envelope on success, or RFC 9457 Problem Details on error (see §5).

The version literal `v1` is in the path so a future contract break can ship `/api/v2/rpc` in parallel with a deprecation window. `action` multiplexes the existing `api_*` server functions behind one URL because Apps Script has no native path router (`doPost` receives one script-wide dispatcher); REST-style `/api/v1/loginUser`, `/api/v1/restoreApp`, etc. would require a reverse-router inside `doPost` that just renames the same multiplexing. This stays action-multiplexed all the way through the proxy and the dispatcher.

GET, PUT, PATCH, DELETE on `/api/*` return `405 application/problem+json`. The Worker only handles `POST` (and `OPTIONS` for preflight; see §4). Action names are the existing RPC tokens: `loginUser`, `restoreApp`, `logoutUser`, `authorizedNavigate`, plus the domain actions classified by ADR-0023 / Spec #141 / CF1+ features. The `params` payload is action-specific and validated server-side; the contract here is only the wrapper shape.

The client (`web/lib/api.ts`) is the sole owner of `fetch` to `POST /api/v1/rpc`. Nothing else in the browser makes RPC calls; nothing else knows the URL or the envelope.

### 2. Session transport — `Authorization: Bearer <sessionToken>` + `X-Efcc-Session-Id: <sessionId>`

The session is split into two headers, mirroring the existing code's own secret/non-secret separation (ADR-0011's session token is HMAC-SHA256 over the session ID and is the real authenticator; the session ID is the public lookup key in `PropertiesService`):

- `Authorization: Bearer <sessionToken>` — the secret. Sent only over HTTPS, never logged, never in the URL, and retained only in the one canonical typed `Session` storage object described by Spec 074; client storage is not proof of identity or permission.
- `X-Efcc-Session-Id: <sessionId>` — the public lookup key. Required for `restoreApp`, `logoutUser`, `authorizedNavigate`, and every other protected action. Apps Script `doPost` cannot read browser request headers (verified against `developers.google.com/apps-script/guides/web`), so the Worker must carry the authenticated request across the separate Worker-to-Apps-Script trust boundary.

`loginUser` sends no session headers (anonymous by definition). All other actions send both to the Worker. The Worker does **not** rely on Apps Script seeing those browser headers. Per the locked CF1 transport decision in [#131](https://github.com/Noahlw/efcc/issues/131), it translates the declared action, parameters, session identity, and required bearer into the versioned service-authenticated upstream request that Apps Script can verify. The production dispatcher verifies that service request and then validates the session bearer against the session ID lookup result before delegating to `api_*`; the bearer is never a browser-generated action parameter and is never logged. The exact service-envelope/signature implementation and its deployment proof belong to #131, not to this CF2 decision record.

The HTTP client (`web/lib/api.ts` `callRpc`) builds both browser headers from the typed `Session` object passed in; the Worker (`web/worker.ts`) terminates that browser boundary and applies the #131 service transport; the server-side dispatcher validates the bearer against the session ID lookup result and rejects with `AUTH_REQUIRED` on mismatch. The current throwaway dispatcher in `src/gas/prototype-129-http-dispatch.gs` may use non-secret `userId`/`sessionId` body fields as interim compatibility because Apps Script cannot see request headers; it must never receive or trust `sessionToken` in browser-generated `body.params`. The production dispatcher must derive the actor from the verified session lookup, and the interim path is not acceptance evidence for this ADR.

The current CF0 prototype's `sessionParams` helper in `web/lib/api.ts` currently
serializes `sessionToken` into browser-generated `params`; that path must not be
deployed. Removing the bearer from browser parameters, or translating it only
inside the trusted Worker boundary, is downstream CF0/CF1 implementation work
and is not claimed by this decision record.

### 3. Anonymous Apps Script web-app access — `webapp.access = ANYONE_ANONYMOUS` is already live

The live `src/gas/appsscript.json` already declares `"webapp": { "access": "ANYONE_ANONYMOUS", "executeAs": "USER_DEPLOYING" }`. This is the only setting that lets an anonymous browser `fetch` `/exec` and receive JSON instead of a Google OAuth redirect (verified by the prototype's live cookieless GET against the CI-pinned deployment, #129). PIN auth (ADR-0002) requires it.

A prior research note (`docs/research/2026-07-29-e2e-gas-auth-approaches.md`) flagged `ANYONE_ANONYMOUS` as "ignored on personal Gmail" — that note was about Playwright's browser-automation detection, not general HTTP reachability. The discrepancy it surfaced was in `CONTEXT.md`'s stale summary, not the manifest itself. The manifest is correct; `CONTEXT.md` is the artifact that needs updating.

`webapp.executeAs` stays `USER_DEPLOYING`. All 250 members' traffic counts against the single owner account's per-user Apps Script quotas (per the cost model), which is unchanged by this ADR.

### 4. CORS proxy boundary — same-origin `/api/*` Worker, dumb pass-through, OPTIONS terminator

Inherited from ADR-0017 without modification:

- The Cloudflare Worker serves the Next.js static export via the `ASSETS` binding for every path except `/api/*` (which `run_worker_first` in `web/wrangler.jsonc` routes here first).
- For `/api/*`, the Worker terminates CORS and proxies the upstream `fetch` to `APPS_SCRIPT_EXEC_URL`. The browser never sees an Apps Script origin; the browser only ever sees its own Cloudflare origin.
- `OPTIONS /api/*` returns `204` with `Access-Control-Allow-Methods: POST, OPTIONS`, `Access-Control-Allow-Headers: Content-Type, Authorization, X-Efcc-Session-Id, Idempotency-Key`, and the request's `Origin` echoed back in `Access-Control-Allow-Origin`.
- Per the locked #131 service transport, the Worker sends Apps Script only `Content-Type` and the service-authenticated versioned upstream request; browser `Authorization`, `X-Efcc-Session-Id`, and `Idempotency-Key` are not forwarded as raw upstream headers. The browser `Origin` is **not** forwarded (server-side `fetch` is not subject to CORS, and Apps Script never needs to see a browser `Origin`).
- The proxy owns no business authorization. Every protected RPC still resolves the authenticated user from the verified session and rechecks the current global role / assignment / capability on the server. The browser cannot grant itself authority by editing headers or request shape; the server can only be told who claimed to call.

This is the same boundary ADR-0017 drew; this ADR refines the bytes that flow through it.

### 5. Error envelope — RFC 9457 Problem Details, `application/problem+json`, RPC_CODES carried as extension

Errors return `application/problem+json` per [RFC 9457 — Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457). The body shape:

```
{
  "type": "tag:apps-script/efcc/errors#AUTH_REQUIRED",
  "title": "Unauthorized",
  "status": 401,
  "detail": "工作階段已過期，請重新登入",
  "code": "AUTH_REQUIRED",
  "requestId": "<uuid>"
}
```

- `type` is a `tag:` URI per RFC 9457 §3.1.1 ("about:blank" only applies when there *is* a public spec to point at; this API has no public docs and no externally-meaningful registry, so a `tag:` URI is the RFC-endorsed alternative).
- `title` is a short English label.
- `status` is the outer HTTP status, **identical to the response status code** (RFC 9457 §3.1 §3 — "MUST match"). This is why §6 below is load-bearing.
- `detail` is the existing Traditional Chinese user message from the server's `rpcFailure_(requestId, code, message)` helper (src/gas/rpc-envelope.gs).
- `code` is an RFC 9457 extension member carrying the existing `RPC_CODES` token. This is the only field the client branches on for behavior; everything else is presentation. Mapping is:

| `RPC_CODES` token                              | HTTP status |
| ---------------------------------------------- | ----------- |
| `AUTH_REQUIRED`                                | 401         |
| `FORBIDDEN`                                    | 403         |
| `VALIDATION`                                   | 422 (per RFC 9457 §4.2's own worked example) |
| `NOT_FOUND`, `MEMBER_NOT_FOUND`, `EVENT_NOT_FOUND` | 404     |
| `CONFLICT`, `NOT_ENROLLED`, `MEMBER_INACTIVE`, `EVENT_NOT_ACTIVE` | 409 |
| `UNAVAILABLE`                                  | 503         |
| `INTERNAL_ERROR`                               | 500         |

The success envelope (`{success: true, requestId, data}` from `rpcSuccess_`) is unchanged. Problem Details only replaces the error path. The client (`web/lib/api.ts` `RpcError`) carries the parsed Problem Details plus an optional `retryAfter` (seconds, parsed from the `Retry-After` header); it never exposes the raw response body to callers.

### 6. Status remap — Worker reads JSON body's `status` and sets the outer HTTP response status

Apps Script's `ContentService.TextOutput` has no API to set an HTTP status code. `doPost` web-app responses are always transport-level 200, regardless of the JSON body's intended status. This is verified against `developers.google.com/apps-script/reference/content/text-output` and was empirically surfaced by the [#129](https://github.com/Noahlw/efcc/issues/129) prototype: a `restoreApp` with a garbage session returned the `AUTH_REQUIRED` JSON body at outer-HTTP 200 from Apps Script itself, but the Worker's remap put the real `401` on the wire for the browser.

The Worker (`web/worker.ts` `fetch`) therefore:

1. Reads the upstream response body as text.
2. Parses it as JSON.
3. If `parsed.status` is a number, sets the **outer** response status to `parsed.status` and `Content-Type` to `application/problem+json` when `parsed.status >= 400`, else `application/json`.
4. If parsing fails or `parsed.status` is not a number, falls back to `upstream.status` (typically 200).
5. Extracts `parsed.requestId` (the upstream's UUID) and surfaces it as the `X-Request-Id` header on every response (see §8).

This remap is load-bearing correctness, not a nicety. Without it, every error looks like a success to the browser, every retry policy would be wrong, and the `RpcError` constructor would have no `status` to branch on. The throwaway dispatcher in `src/gas/prototype-129-http-dispatch.gs` already populates `body.status` from `prototype129StatusForCode_(code)`; the [#131](https://github.com/Noahlw/efcc/issues/131) production dispatcher must do the same so the Worker's remap works against the real backend without modification.

### 7. Retries — network/502/503/504 only, max two, backoff+jitter, honor `Retry-After`

The HTTP client (`web/lib/api.ts`) retries only on:

- Network error (fetch threw — DNS, TCP, TLS, abort, timeout) when the action is retry-safe (see below).
- HTTP `502 Bad Gateway`, `503 Service Unavailable`, `504 Gateway Timeout` when the action is retry-safe.

Retry-safe = reads + actions that are already idempotent on the server (i.e., not in `NON_IDEMPOTENT_MUTATIONS`). In the current CF0 client, that set is empty: `loginUser` and `logoutUser` are server-idempotent, carry an `Idempotency-Key`, and may use the same key across the bounded retry attempts for one call. When [#131](https://github.com/Noahlw/efcc/issues/131) classifies more actions as mutating-but-idempotent server-side, those may enter the retry-safe set; genuinely non-idempotent mutations must remain outside it.

Retries never fire on:

- Any `4xx`. A `4xx` is the server telling the client "your request is wrong; do not send it again." That includes `429 Too Many Requests` — the `Retry-After` header is parsed and surfaced on the thrown `RpcError` for the UI to honor, but the client does not auto-retry.
- `500 Internal Server Error`. A `500` is a server bug, not a transport blip; replaying it does not help and can mask the bug from monitoring.
- Any non-idempotent mutation. ADR-0023's "no replay on ambiguous network result" rule applies; an `Idempotency-Key` does not make an unsafe mutation replay-safe. The CF2 Program Leader grant/revoke actions are the explicit no-replay exception described in §8 and ADR-0019. Idempotent mutations such as the current `loginUser` and `logoutUser` may retry only under the network/502/503/504 rules above.

Bounded retry parameters (current values, exported as `MAX_RETRIES` and `BASE_BACKOFF_MS` in `web/lib/api.ts`):

- `MAX_RETRIES = 2` — so up to 3 attempts total (initial + 2).
- Backoff: `BASE_BACKOFF_MS * 2^attempt` with up to ±25% jitter.
- `Retry-After` (RFC 7231, seconds form) is honored when present and becomes the delay for that attempt. Computed backoff is used when the server does not provide it.

### 8. Idempotency — `Idempotency-Key` header on every mutating action

The project-defined `Idempotency-Key` header (a request-key transport, not a claim of standards interoperability) is generalized from the existing bespoke `requestKey` field. The client attaches it automatically for any action in the `MUTATING_ACTIONS` set (`web/lib/api.ts`):

- `loginUser` — one key is generated per call and reused across that call's bounded retry attempts. A caller may provide an explicit key to intentionally reuse it across separate calls; the client does not derive a key from username/timestamp or promise automatic cross-call double-submit deduplication.
- `logoutUser` — one key is generated per call and reused across its bounded retries; the server treats logging out an already-revoked session as a no-op.

Reads do not send an `Idempotency-Key` (they have no effect to dedup).

The client generates the key with `crypto.randomUUID()` (available in all modern browsers and in `workerd`) unless the caller passes one explicitly via `options.idempotencyKey`. The Worker carries the key through the locked #131 service transport; it is not forwarded as an unauthenticated raw header. The server-side behavior on dedup is the [#131](https://github.com/Noahlw/efcc/issues/131) ticket's decision; the wire contract here is only that the browser header is present on mutating calls and absent on reads.

CF2's `grantProgramLeader` / `revokeProgramLeader` are a deliberate documented exception to this rule (ADR-0019 §3): they are mutating but do **not** use a client-supplied `Idempotency-Key` and are never automatically replayed; the natural-key `(targetUserId, programId)` recheck is the deduplication mechanism. These actions are not in the current CF0 action set; the CF2 implementation must keep them out of `MUTATING_ACTIONS` and explicitly classify them as non-retryable.

### 9. Request correlation — `X-Request-Id` header + `requestId` in envelopes, never W3C Trace Context

A single opaque UUID `requestId` threads through every request and response:

- The HTTP client (`web/lib/api.ts`) does not generate the request ID itself. The success envelope carries the server's `requestId` at the top level (`{success, requestId, data}`); the current `callRpc` parser returns only `data` to typed action callers, so it does not expose that success identifier through `data.requestId`. Error responses surface the same value through the `X-Request-Id` response header and Problem Details `requestId` extension.
- The server generates `requestId` once per RPC via `Utilities.getUuid()` in `src/gas/rpc-envelope.gs` (`rpcRequestId_`) and embeds it in both the success envelope (`{success: true, requestId, data}`) and the Problem Details (`requestId` extension member).
- The Worker passes through the upstream's `requestId` as the `X-Request-Id` header on every response (even on transport-level failures where the upstream body was malformed — the Worker falls back to a fresh UUID so every response carries one for log search).
- Cloudflare Workers Logs and Apps Script's Stackdriver / Cloud Logging both already support filtering by this field with no custom-built dashboard needed on either side; the correlation is purely log-side, not a runtime-traced span.

W3C Trace Context (`traceparent` / `tracestate`) was considered and rejected: there is no trace collector in this stack, Apps Script `doPost` cannot propagate spans across the `google.script.run` ↔ HTTP bridge for the existing HtmlService app, and adopting it on only one side of the boundary buys nothing. A future trace-aware system can layer on top of `X-Request-Id` without breaking it.

### 10. Abuse limiting — Cloudflare Workers Rate Limiting binding, keyed on session identity

The Cloudflare Worker Rate Limiting binding (`RPC_RATE_LIMITER` in `web/worker.ts` `Env`) is enabled now and keyed as follows (`web/worker.ts` `rateLimitKeyFor`):

- Authenticated requests: `sess:<sessionId>` from the `X-Efcc-Session-Id` header.
- Anonymous `loginUser` requests: `login:<username>` (the body is peeked without consuming the upstream-readable clone).

Never client IP. Cloudflare's own Rate Limiting docs and the cost model both note that client IP is shared across many users on mobile and carrier-grade NAT; keying on it lets one apartment building or coffee shop's shared egress block every member behind it. Session identity and login username are already on the wire and uniquely identify the actor the client claims to be.

Limits themselves are coarse — a tripwire against Apps Script's 30-simultaneous-execution quota, the one "Watch" item in the cost model. Exact thresholds belong to the CF0 implementation ticket, not this ADR. In production and acceptance deployments, a missing or unavailable binding fails closed with `503 UNAVAILABLE` per the locked #131 transport decision; dev/test must provide an explicit fake or test binding rather than silently skipping the security boundary.

On rejection, the Worker returns `429 application/problem+json` with `code: "RATE_LIMITED"` and a `Retry-After: 60` header. The client's `RpcError` surfaces the `Retry-After` for UI display, but the client does not auto-retry on `429` (§7 above).

## Downstream verification handoff (not #128 implementation)

The following checklist is handed to the CF0 implementation ticket ([#142](https://github.com/Noahlw/efcc/issues/142) for the client + Worker) and the CF1 server-side dispatcher ticket ([#131](https://github.com/Noahlw/efcc/issues/131)). It is not implementation/deployment work or an acceptance claim for #128. Those downstream tickets must prove, locally and against a fresh isolated versioned `/exec` deployment, at minimum:

1. The browser issues `fetch("/api/v1/rpc", {method: "POST"})` only; no other request shape ever appears in the network panel for a `/api/*` path.
2. The request body is `{"action": "<name>", "params": {...}}`; `params` is the only place action-specific fields live.
3. Every request that carries a session sends both `Authorization: Bearer <sessionToken>` and `X-Efcc-Session-Id: <sessionId>`; the bearer is retained only in the canonical session storage object, never in action parameters, the URL, or a `console.log`.
4. Every mutation covered by the client's `MUTATING_ACTIONS` set carries an `Idempotency-Key` header; reads do not. CF2 grant/revoke actions are deliberately excluded, do not carry one, and are never auto-retried.
5. The Worker's `OPTIONS` returns `204` with `Access-Control-Allow-Methods: POST, OPTIONS`, `Access-Control-Allow-Headers: Content-Type, Authorization, X-Efcc-Session-Id, Idempotency-Key`, and the request's `Origin` echoed in `Access-Control-Allow-Origin`. Non-`/api/*` paths are served by the `ASSETS` binding with no Worker involvement.
6. Per the locked #131 service transport, the Worker sends `APPS_SCRIPT_EXEC_URL` only `Content-Type` and the service-authenticated versioned upstream request. Browser `Authorization`, `X-Efcc-Session-Id`, `Idempotency-Key`, and `Origin` are never forwarded as raw upstream headers.
7. Every non-2xx response carries `Content-Type: application/problem+json`, an `X-Request-Id` header equal to the body's `requestId`, and a body whose `status` field equals the outer HTTP status. A malformed-JSON upstream response still returns a valid Problem Details body (the Worker's fallback path), not an HTTP 200 with a raw text payload.
8. The status table in §5 is honored exactly: `AUTH_REQUIRED` → 401, `FORBIDDEN` → 403, `VALIDATION` → 422, `*_NOT_FOUND` → 404, `CONFLICT` / `NOT_ENROLLED` / `MEMBER_INACTIVE` / `EVENT_NOT_ACTIVE` → 409, `UNAVAILABLE` → 503, `INTERNAL_ERROR` → 500.
9. Client retries fire exactly twice (3 attempts total) on network error and on outer-HTTP 502/503/504 only. They never fire on 4xx or 500. They honor `Retry-After` when present and back off with `200 * 2^attempt ± 25%` jitter otherwise.
10. The Rate Limiting binding trips on `sess:<sessionId>` for authenticated traffic and `login:<username>` for `loginUser`; it never trips on IP. A tripped limit returns `429` with `code: "RATE_LIMITED"`, `Retry-After: 60`, and is not auto-retried by the client.
11. `webapp.access = ANYONE_ANONYMOUS` remains set in `src/gas/appsscript.json`. A live cookieless `GET` against the deployed `/exec` returns the existing HtmlService app HTML (not a Google OAuth redirect) — this is what makes the Worker fetch able to reach Apps Script at all.
12. After deployment, the CF1 dispatcher in #131 replaces `src/gas/prototype-129-http-dispatch.gs`. The throwaway dispatcher can be deleted once the CF1 dispatcher's behavior matches the prototype on the smoke-path actions (`loginUser`, `restoreApp`, `logoutUser`, `authorizedNavigate`) and the full `RPC_CODES` → status mapping is in place. The Worker code does not change.
13. No production or operational Google Sheet is mutated by the agent; any required schema/fixture change follows the Sheet-Immutable rules in `AGENTS.md`.

## Considered options

- **REST: one path per action (`/api/v1/loginUser`, `/api/v1/restoreApp`, …) — rejected.** Apps Script has no native path router inside `doPost`; a path-renaming dispatcher inside `doPost` just renames the same action multiplexing, costs a layer, and costs the version path its meaning (the version is the contract, not the action namespace).
- **Session token in URL or body — rejected.** ADR-0011 establishes the session token as the HMAC authenticator; this ADR carries it only in `Authorization` and excludes it from action body parameters, URLs, and query strings. `localStorage` already gives the browser a typed `Session` object from which to build the header. Header transport is the only option that survives a leaked referrer, a shared screenshot, or a future server log.
- **`google.script.run` semantics ported over HTTP — rejected.** `google.script.run` is the iframe bridge; it does not generalize to cross-origin `fetch`, has no headers, has no `fetch`-style status, and is precisely what this ADR replaces.
- **Custom error envelope (`{ok: false, error: {...}}`) instead of RFC 9457 — rejected.** RFC 9457's standard shape is supported by HTTP middleware, browser DevTools, and observability tooling out of the box, gives the existing `RPC_CODES` a natural home as an extension member, and aligns with how the cost model and ADR-0019 already reason about RPC codes as English tokens.
- **`httpCode` field inside the JSON body to set the outer status — accepted as load-bearing necessity, not as a preference.** The body carries `status` because Apps Script cannot set the outer HTTP status. The Worker reads it and remaps. A future move to a non-Apps-Script backend can drop the body field in favor of letting the server set the real status; the contract here is the outer status + body `status` agreement, not the body field itself.
- **Retry on `4xx` (treating any error as transient) — rejected.** Replays a wrong request. The `4xx` range is explicitly "your request is wrong; do not send it again." The `Retry-After` from a `429` is a UI hint, not an auto-retry trigger.
- **Retry on `500` — rejected.** A `500` is a server bug. Auto-replaying it masks the bug from monitoring and does not change the server's state.
- **W3C Trace Context (`traceparent` / `tracestate`) — rejected.** No collector in this stack, Apps Script `doPost` cannot propagate spans, adopting one-sided buys nothing. `X-Request-Id` + log-side filtering is sufficient and matches what Cloudflare Workers Logs and Apps Script Stackdriver already index.
- **Per-IP rate limiting — rejected.** Cloudflare's own guidance: client IP is shared across many users on mobile and CGNAT. Keying on session identity and login username is more accurate and never blocks unrelated members.
- **Cloudflare Turnstile / WAF rules at the edge instead of an application-layer Rate Limit binding — rejected for CF0.** Turnstile belongs to a future hardening pass; the binding is enough to defend the Apps Script quota and lives in code the team already owns.
- **Push all error mapping into the client (the server returns a constant `{ok: false, code}` and the client maps to HTTP status) — rejected.** The client cannot invent an HTTP status the server didn't send; browsers gate caching, redirect handling, and service-worker behavior on the real status. The Worker must remap on the wire.

## Consequences

- React can issue RPCs through one typed surface (`web/lib/api.ts`) and receive one typed error (`RpcError`) whose `code` is the existing `RPC_CODES` token. No business authorization moves into the browser.
- The server can reject requests with the same `RPC_CODES` tokens it already returns; the Worker turns them into the right outer HTTP status without any change to the existing `api_*` functions.
- Cloudflare Workers Logs and Apps Script Cloud Logging can be joined on `requestId` end-to-end; every request has a single opaque correlation token, no trace collector required.
- The retry policy never silently duplicates a mutation. Reads and already-idempotent actions get a bounded safety net; genuinely mutating actions rely on `Idempotency-Key` for dedup and otherwise surface the error to the UI.
- The Rate Limiting binding is a coarse tripwire, not a DoS defense. The CF0 implementation ticket can pick thresholds without revisiting this ADR; the keying contract (session identity or login username, never IP) is the part that's locked.
- The prototype files (`web/`, `web/worker.ts`, `src/gas/prototype-129-http-dispatch.gs`) remain in the repo as throwaway, pointer-commented to [#129](https://github.com/Noahlw/efcc/issues/129), until #131's production dispatcher replaces the throwaway. The Worker code is the same code the production stack will run.
- This ADR is the contract; it is not the implementation. The CF0 implementation ticket [#142](https://github.com/Noahlw/efcc/issues/142) and the CF1 server-side dispatcher [#131](https://github.com/Noahlw/efcc/issues/131) carry the acceptance evidence. This ADR stays `Proposed` until both are accepted per `AGENTS.md`.