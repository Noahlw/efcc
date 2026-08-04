# Worker → Apps Script Reliability Hardening Plan

> **For OMP workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Dispatch each task as a fresh `task` subagent; gate between tasks with the OMP `reviewer` agent (the `code-review` skill's spec axis).

**Goal:** Confirm the live CF1 transport's actual failure mode and harden the Worker so the strict E2E gate passes without architectural change, unless evidence forces a hand-off.

**Architecture:** Two-phase, evidence-led. Phase A proves the failure class against the live deployment and the configured Apps Script deployment using paired measurements and minimal, metadata-only observability. Phase B adds the smallest possible Worker-side change (`cache: "no-store"` plus metadata-only trace attributes) and re-measures. The existing unamended Worker-side retry is documented and remains until ADR-0018 is amended; it is not extended in this plan.

**Tech Stack:** Cloudflare Workers (workerd, `wrangler`), Cloudflare Workers Traces/Logs, Apps Script web apps, TypeScript (ESM), `vitest`, `tsc --noEmit -p tsconfig.worker.json`, `oxfmt`, GitHub Actions CI per repo defaults, ADR-0018 / ADR-0019.

## Global Constraints

- Cloudflare Workers `fetch()` must be invoked with `cache: "no-store"` against `env.APPS_SCRIPT_EXEC_URL` after Task 3. This is the only upstream fetch change.
- All new logging captures metadata only: attempt number, elapsed time, upstream HTTP status, upstream `Content-Type`, `response.redirected`, final URL hostname (never the path or query string), and caught exception type/message. **Do not log the signed envelope, the upstream response body, the `Authorization` header, the `X-Efcc-Session-Id` header, the `Idempotency-Key` header, or the `script.googleusercontent.com` one-time redirect query string.**
- The Worker-side retry policy in `web/worker.ts:178-301` (two attempts, 12s per-attempt, 250ms delay, idempotent-action allowlist) is **not modified** in this plan. ADR-0018 §7 is the retry contract; this plan adds evidence and observability, not new retry semantics.
- No changes to `web/lib/api.ts` client retry policy in this plan. ADR-0018 §7 remains client-owned.
- No changes to `src/gas/prototype-129-http-dispatch.gs` or any Apps Script code in this plan. The CF1 production dispatcher is downstream of this work.
- No destructive git operations (`git push --force`, `git reset --hard`, branch deletion). No `--no-verify` on any commit.
- Branch: `fix/issue-151-review` (existing, from PR #157). Worktree isolation: the executing agent creates a worktree from this branch via the OMP `using-git-worktrees` skill before any task begins.
- Typecheck: `node_modules/.bin/tsc --noEmit -p tsconfig.worker.json` clean.
- Worker tests: `node_modules/.bin/vitest run worker.test.ts` all green.
- Format: `node_modules/.bin/oxfmt --write <files>` after any source edits.
- Secrets: `EFCC_SERVICE_SECRET` is already provisioned in the Worker secret store and in Apps Script `ScriptProperties`. Never read, log, print, paste, or commit the value.
- Apps Script deployment: the existing versioned `/exec` URL pointed to by `wrangler deploy --var APPS_SCRIPT_EXEC_URL=…` is the single target. No new deployment is created in this plan.

## File Structure & Changes

This plan touches the Worker fetch boundary, the Worker's deployment configuration, an E2E configuration knob, and one new diagnostic script. It does not touch the client, the dispatcher, or the session envelope.

- `web/worker.ts` — modify `forwardToAppsScript` only: add `cache: "no-store"` to the upstream fetch, capture per-attempt metadata into a `Map<string, string>`, and surface the metadata to the Worker Logs payload via a single `console.log` call (Task 3). No behavioral change to the retry loop, the response shape, or the allowlist.
- `web/worker.test.ts` — add three tests for the metadata capture path (Task 3): metadata recorded on transient non-JSON, metadata recorded on success pass-through, no metadata logged on Worker rejection paths before any fetch attempt.
- `web/wrangler.jsonc` — read-only verification only (Task 1). No edits.
- `tests/e2e/worker-transport.config.ts` — extend the existing `E2E_HOST_RESOLVER_RULES`-style auto-detection to read an opt-in `E2E_LOG_METADATA=1` env var and surface captured upstream metadata on test failure artifacts (Task 4).
- `tests/e2e/worker-transport.test.ts` — add one regression test that the same valid signed envelope sent twice in one second (controlled spacing) returns two structured responses when the upstream cooperates; this is the existing happy-path behavior made explicit so the gate has a paired baseline (Task 4).
- `.scratch/transport-pair.mjs` — new throwaway script (gitignored) that issues a paired direct-from-this-machine and via-Worker POST with the same valid envelope, recording status, timing, content type, and (where present) a `cf-ray` header. Used by Task 2 only; deleted at end of Task 2.
- `docs/research/2026-08-04-worker-apps-script-reliability.md` — already committed at `5be7fcc`. The plan reads it as the cited research note; no edits.

## What Already Exists

- `docs/research/2026-08-04-worker-apps-script-reliability.md` (committed at `5be7fcc`) is the cited diagnosis. Its least-invasive order is the basis for this plan.
- `web/worker.ts:178-301` `forwardToAppsScript` — the existing upstream fetch with the 2-attempt, 12s, 250ms, allowlist-gated retry. Reused as-is for Task 3.
- `web/lib/service-envelope.ts` `signServiceEnvelope` / `verifyServiceEnvelope` — used by the new diagnostic script to build a real signed envelope.
- `web/wrangler.jsonc` — `RPC_RATE_LIMITER` binding, `ASSETS` binding, and the `run_worker_first: ["/api/*"]` route. Read for Task 1.
- `tests/e2e/worker-transport.config.ts` and `tests/e2e/worker-transport.test.ts` — the strict E2E harness that PR #157 is gated on. Reused for Task 4.
- `package.json` `pnpm`/`vitest`/`tsc`/`oxfmt` scripts. Reused for verification.
- `.gitignore` already excludes `.scratch/`.

## Not In Scope

- Changing the Worker retry policy (count, delay, timeout, allowlist).
- Changing the client retry policy in `web/lib/api.ts`.
- Touching any Apps Script code (`src/gas/**`).
- Issuing a new Apps Script versioned deployment.
- Issuing a new Worker version beyond the metadata/`no-store` change.
- Adjusting E2E timeouts or `--retries` values to mask failure.
- Adopting Cloudflare Dedicated CDN Egress, Smart Placement, or any other Enterprise Cloudflare product. These are out of scope until Phase A evidence forces them.
- Changing CORS handling, rate limiting, or any non-`/api/*` route.

## ASCII Diagrams

### CF1 transport data flow (current)

```
[Browser]
   | POST /api/v1/rpc {action, params} + Authorization + X-Efcc-Session-Id + Idempotency-Key
   v
[Cloudflare Worker - efcc-prototype-129.efcc-ggc.workers.dev]
   | 1. parseAndValidateBody (web/worker.ts)
   | 2. enforceRateLimit (RPC_RATE_LIMITER)
   | 3. forwardToAppsScript (signed envelope, 2 attempts, 12s, 250ms, allowlist)
   |        |  POST env.APPS_SCRIPT_EXEC_URL
   |        v
   |   [Google Apps Script - /exec deployment @28]
   |        |  doPost -> service-envelope verifier -> api_* dispatch
   |        v
   |   Response (transport 200, body {status, requestId, ...})
   | 4. status remap: body.status -> outer HTTP status
   v
[Browser] consumes Problem Details or success envelope
```

### Phase A measurement data flow (Task 2)

```
[.scratch/transport-pair.mjs]
   | build ONE valid signed envelope via signServiceEnvelope
   | T+0.0s  POST direct -> Apps Script /exec            (rec: status, ms, ctype, sha1, attempt)
   | T+0.5s  POST via Worker -> /api/v1/rpc -> /exec     (rec: status, ms, ctype, cf-ray, X-Request-Id)
   | T+1.0s  ... (8 pairs total, 1.5s gap between pairs)
   | T+18s   end
   v
[console.log] JSON summary {direct, worker, deltas}
```

## Failure Modes & Gaps

- **Intermittent measured failure not yet characterized.** The PR #157 trace shows one 17.3s success and one 21.5s timeout-class 502. Hammer observations (separate run) also recorded non-JSON responses. This plan does not assume the two failure classes have the same cause; the metadata must distinguish them.
- **Local control is not an identical valid request.** The local `wrangler dev` control used a dummy secret. The paired direct-vs-Worker test in Task 2 uses a real signed envelope from this machine, which still does not isolate Cloudflare egress IP as the sole cause. The plan reports measurement results, not a proven root cause.
- **Apps Script deployment state is not yet confirmed.** The repository manifest requests `ANYONE_ANONYMOUS` + `USER_DEPLOYING`, but the live versioned deployment may differ. Task 1 verifies the live deployment via clasp before any Worker change ships.
- **Worker Logs free tier retains 3 days.** Recent Workers Logs are sufficient for this plan; Logpush (paid) is not required.
- **No budget for extending E2E timeouts.** If Task 4 still does not pass on a fresh deployment after Phase A + Task 3, the gate stays BLOCKED and the user is asked whether to schedule an architecture-level review (Enterprise egress, non-Apps-Script backend). The plan does not fabricate a passing test.

## Parallelization / Worktree Strategy

- All tasks run serially. Each task verifies a prior task's deliverable before the next begins; the OMP `reviewer` agent gates between tasks.
- The executing agent must follow the OMP `using-git-worktrees` skill before starting Task 1. A worktree from `fix/issue-151-review` is required.
- Task 1 is verification-only and produces no code change; it can begin before the Worker's source is touched.
- Tasks 2 and 3 are independent in code but Task 2's results are an input to Task 3's design choice. Plan runs them serially.
- Task 4 runs after Task 3 is merged, because the E2E gate must measure the same code that ships.

---

## Task 1: Verify the live Apps Script deployment

**Files:**
- Read-only: `src/gas/appsscript.json`, `web/wrangler.jsonc`, `.clasp.json`
- Use: `npx clasp deployments` (or `clasp deployments`), `npx clasp read-manifest`, and the live `/exec` URL pointed to by `APPS_SCRIPT_EXEC_URL`.

**OMP dispatch:**
- Agent type: `scout` (read-only verification)
- Inputs to subagent: this task block + the Plan Header above + the committed research note path
- Reviewer gate: OMP `reviewer` agent via the `code-review` skill (Spec axis), checking that the verification report cites the clasp output and the manifest values verbatim

**Interfaces:**
- Consumes: `clasp` (already installed in `node_modules/.bin`); the deploy URL from the prior PR comment (`https://script.google.com/macros/s/AKfycbxlcUqJqeZJjrFdx2NrFrB227cZINT-Cp_nRA52c0CeQfawzO63gzKdC-VxqyzeV_HP/exec`)
- Produces: a written verification report at `docs/research/2026-08-04-live-deployment-verification.md` with five rows: target URL, target is versioned `/exec` (not `/dev`), `access` value, `executeAs` value, `doPost` returns `ContentService.TextOutput` (confirmed via a curl POST with a deliberately minimal valid envelope, response body parsed as JSON)

- [ ] **Step 1: Capture the live deployment record**

Run: `npx clasp deployments --json` (from repo root). Expected: a JSON list of deployments, each with `deploymentId`, `description`, `versionNumber`, and `deploymentConfig.webApp.access` / `webApp.executeAs`.
Save the raw output to `docs/research/2026-08-04-live-deployment-verification.md` under a `## clasp deployments` heading. The agent must redact the `scriptId` value before saving.

- [ ] **Step 2: Confirm the live `doPost` returns JSON `TextOutput`**

Issue: a single `POST` to the live `/exec` URL with a JSON body that the deployed dispatcher will treat as an invalid envelope (so the dispatcher responds with a `FORBIDDEN` JSON envelope rather than an HTML page). Use the `restoreApp` action with no session headers, or whichever the deployed dispatcher accepts as a request that fails verification but is shaped like a service envelope.
Run: `curl -sS -i -X POST "$APPS_SCRIPT_EXEC_URL" -H "Content-Type: application/json" -d '{"invalid":true}'` (the exact body shape must match what the live dispatcher's first validation step will reject as malformed).
Expected: HTTP/2 200, `Content-Type: application/json` (or `application/problem+json`), body parses as JSON. The `cf-cache-status` header may be present; note it. If the response is HTML or 302, the deployment is misconfigured and Task 1 must report that as the blocking finding.

- [ ] **Step 3: Write the verification report**

File: `docs/research/2026-08-04-live-deployment-verification.md`. Sections: `## clasp deployments`, `## manifest`, `## live doPost response`, `## verdict`. Verdict must state one of: `READY` (live deployment matches the repository manifest and returns JSON), `MISMATCH` (specific field that differs), or `BLOCKED` (HTML or non-JSON response with the captured headers).

- [ ] **Step 4: Commit and open follow-up if MISMATCH or BLOCKED**

If verdict is `READY`, commit the report with message `docs(151): live deployment verification` (stage only the new report file).
If verdict is `MISMATCH` or `BLOCKED`, do not proceed to Task 2. File a comment on PR #157 (or a new issue per `AGENTS.md` review rules) with the report path and the specific field that must be reconciled, then stop. The user decides whether to reconcile the live deployment, re-run Task 1, or escalate.

## Task 2: Paired direct-vs-Worker measurement with metadata-only logging

**Files:**
- Create: `.scratch/transport-pair.mjs` (gitignored)
- No source code changes yet.

**OMP dispatch:**
- Agent type: `task` (default worker)
- Inputs to subagent: this task block + the Plan Header above + the cited research note path + the live `/exec` URL from PR #157 + the local `EFCC_SERVICE_SECRET` available as a `wrangler secret` value (read at runtime via `npx wrangler secret get EFCC_SERVICE_SECRET` to stdin of the script — the agent MUST NOT log or print the value)
- Reviewer gate: OMP `reviewer` agent via the `code-review` skill (Spec axis), checking that the script captures only metadata and that no secret or response body is logged

**Interfaces:**
- Consumes: `web/lib/service-envelope.ts` `signServiceEnvelope` (ESM import from `web/lib/service-envelope.ts` via a relative path)
- Produces: a one-line JSON summary printed to stdout, shape:
  `{ direct: [{ status, ms, contentType, finalHostname, error? }], worker: [{ status, ms, contentType, finalHostname, cfRay, xRequestId, error? }] }`

- [ ] **Step 1: Write the measurement script**

File: `.scratch/transport-pair.mjs`. Behavior:
- Import `signServiceEnvelope` from `../web/lib/service-envelope.ts` using a TypeScript loader that works under `node` (e.g. `tsx` already in `node_modules/.bin`).
- Read the secret from stdin (first line) so the secret never touches argv or environment.
- Build a single `restoreApp` request with empty params and no session.
- Loop `N = 8` rounds with `GAP_MS = 1500`. Each round:
  - Sign a fresh envelope (new `nonce`, new `attemptGroup`).
  - `t0 = Date.now()`; `direct = await fetch(APPS_SCRIPT_EXEC_URL, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(envelope) })`. Record `status = direct.status`, `ms = Date.now()-t0`, `contentType = direct.headers.get("content-type") ?? ""`, `finalHostname = new URL(direct.url).hostname`. Read the response body to a string and discard immediately (do not log it).
  - `t0 = Date.now()`; `worker = await fetch(WORKER_RPC_URL, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({action:"restoreApp", params:{}}) })`. Record the same fields plus `cfRay = worker.headers.get("cf-ray") ?? ""` and `xRequestId = worker.headers.get("x-request-id") ?? ""`. Read and discard the body.
  - `await sleep(GAP_MS - ms)` if any.
- `console.log(JSON.stringify({ direct, worker }))`.

- [ ] **Step 2: Run the script against the live deployment**

Set `APPS_SCRIPT_EXEC_URL` and `WORKER_RPC_URL` from PR #157. Pipe the secret via stdin from `wrangler secret get EFCC_SERVICE_SECRET`. The agent must capture stdout only; stderr is allowed for timing logs.
Run: `npx wrangler secret get EFCC_SERVICE_SECRET | node --import tsx .scratch/transport-pair.mjs` (the `tsx` loader is already in `node_modules/.bin`).
Save the JSON output to `.scratch/transport-pair.<timestamp>.json` for the reviewer gate.

- [ ] **Step 3: Spot-check the JSON for accidental secret leakage**

Run: `node -e "const d=JSON.parse(require('fs').readFileSync(process.argv[1])); const hasSecret=[...JSON.stringify(d)].map(c=>c).join('').match(/[A-Fa-f0-9]{64}/); console.log('64-hex token present:', Boolean(hasSecret), 'len:', (hasSecret||[])[0]?.length||0)" .scratch/transport-pair.<timestamp>.json`.
Expected: `64-hex token present: false`. If true, the script logged a signature; the script must be edited to drop the signature before the next run.

- [ ] **Step 4: Commit the JSON output and delete the script**

Stage only the JSON file. Commit message: `chore(151): paired direct-vs-worker transport measurement`. Then `rm .scratch/transport-pair.mjs` and `rm .scratch/transport-pair.<timestamp>.json` (the JSON is committed, the script is throwaway).

- [ ] **Step 5: Reviewer gate decision**

The reviewer must answer: (a) Does the JSON show one of: success on both sides, timeout on worker only, non-JSON on worker only, or timeout on both? (b) Is the failure class consistent with the saved E2E trace (timeout-class 502)? If the failure class differs, the reviewer must say so and the user decides whether to add a third failure-class investigation before Task 3.

## Task 3: Add `cache: "no-store"` and metadata-only trace attributes to the upstream fetch

**Files:**
- Modify: `web/worker.ts:178-301` `forwardToAppsScript`
- Modify: `web/worker.test.ts` (add three tests at the end of the existing `describe("Worker: status remap (ADR-0018 §5 load-bearing)", ...)` block)
- No other file changes.

**OMP dispatch:**
- Agent type: `task` (default worker)
- Inputs to subagent: this task block + the Plan Header above + the cited research note path + the Task 2 measurement result path
- Reviewer gate: OMP `reviewer` agent via the `code-review` skill (Spec axis), checking that the new code does not log the envelope, response body, or any of `Authorization` / `X-Efcc-Session-Id` / `Idempotency-Key`, and that `cache: "no-store"` is the only added fetch option

**Interfaces:**
- Consumes: existing `forwardToAppsScript(env: Env, origin: string, envelope: ServiceEnvelope): Promise<Response>` signature
- Produces: same signature; new internal side effect is a single `console.log(JSON.stringify({ event: "apps_script_attempt", attempt, elapsedMs, status, contentType, redirected, finalHostname, errorName, errorMessage }))` per attempt, with `status` and `contentType` only present when a `Response` was received

- [ ] **Step 1: Write three failing tests**

File: `web/worker.test.ts`. Add to the existing status-remap describe block.

Test 1 name: `"upstream fetch uses cache: 'no-store'"`. The test must assert that `globalThis.fetch` is called with `cache: "no-store"` for the upstream POST. Use the existing `captureUpstream` helper; the `respond` callback must be a recorder that returns a valid JSON success body, and the test must inspect the call's `init` argument. The test must fail initially because the current code does not pass `cache`.

Test 2 name: `"emits one metadata log per attempt on transient non-JSON success"`. The test must override `console.log` for the duration of the call, assert that exactly two log calls fire (two attempts), each JSON-parseable with `event === "apps_script_attempt"`, and that the second log has `status: 200` and a numeric `elapsedMs`. Must fail initially because no log is emitted today.

Test 3 name: `"emits no metadata log when the body parse fails before fetch"`. The test must call `parseAndValidateBody` with a malformed request and assert `console.log` was not called with the new event shape. Must pass before the change (it codifies the absence of logging on the validation path).

- [ ] **Step 2: Run the new tests and confirm they fail for the right reason**

Run: `node_modules/.bin/vitest run worker.test.ts -t "upstream fetch uses cache" && node_modules/.bin/vitest run worker.test.ts -t "emits one metadata log"`.
Expected: both fail. The first because `cache` is not in the call's init; the second because no log is emitted.

- [ ] **Step 3: Add `cache: "no-store"` and per-attempt metadata logging**

Location: `web/worker.ts:178-301`. Changes:
- In the `fetch(env.APPS_SCRIPT_EXEC_URL, { ... })` call inside the loop, add the field `cache: "no-store"` to the options literal. No other fetch options change.
- Before the `fetch` call, capture `const t0 = Date.now()` and `const attemptNumber = attempt`.
- In the `catch (error)` branch, before the existing `return problemResponse(...)`, call `console.log(JSON.stringify({ event: "apps_script_attempt", attempt: attemptNumber, elapsedMs: Date.now()-t0, errorName: error?.name ?? "", errorMessage: error?.message ?? "" }))`.
- After `const upstream = await fetch(...)` succeeds (i.e. inside the loop, between the `try` and the `const upstreamBody = await upstream.text()` line), add: `console.log(JSON.stringify({ event: "apps_script_attempt", attempt: attemptNumber, elapsedMs: Date.now()-t0, status: upstream.status, contentType: upstream.headers.get("content-type") ?? "", redirected: upstream.redirected, finalHostname: (()=>{try{return new URL(upstream.url).hostname}catch{return ""}})() }))`.
- Do not change the retry loop, the allowlist, the timeout, the delay, the response shape, or the headers.

- [ ] **Step 4: Run the new tests and confirm they pass**

Run: `node_modules/.bin/vitest run worker.test.ts`.
Expected: all tests pass, including the three new ones. Total count becomes the previous 23 + 3 = 26. If a pre-existing test breaks, the implementer must fix it before continuing; do not modify the existing test to accept the change.

- [ ] **Step 5: Typecheck, format, commit**

Run in order: `node_modules/.bin/tsc --noEmit -p tsconfig.worker.json`, then `node_modules/.bin/oxfmt --write web/worker.ts web/worker.test.ts`, then re-run `node_modules/.bin/vitest run worker.test.ts`.
Stage: `web/worker.ts`, `web/worker.test.ts`. Commit message: `feat(151): no-store upstream cache and per-attempt metadata logging`. Do not include the secret in the commit.

## Task 4: Re-run the strict E2E and record metadata evidence

**Files:**
- Modify: `tests/e2e/worker-transport.config.ts` (single opt-in knob)
- Modify: `tests/e2e/worker-transport.test.ts` (one baseline regression test)
- Use: existing strict E2E harness

**OMP dispatch:**
- Agent type: `task` (default worker)
- Inputs to subagent: this task block + the Plan Header above + the cited research note path + the live Worker URL from PR #157
- Reviewer gate: OMP `reviewer` agent via the `code-review` skill (Spec axis), checking that the test does not assert a passing gate by relaxing timeouts or retries

**Interfaces:**
- Consumes: existing `tests/e2e/worker-transport.config.ts` and `tests/e2e/worker-transport.test.ts` strict-run shape (`--retries=0`)
- Produces: one new test that sends the same valid `restoreApp` request twice with controlled spacing and asserts both responses are structured Problem Details or JSON success; one new config knob `E2E_LOG_METADATA=1` that, when set, attaches a `cf-ray` and `X-Request-Id` capture to the failure artifact

- [ ] **Step 1: Write the paired-call baseline test**

File: `tests/e2e/worker-transport.test.ts`. Add to the existing `describe("CF1-01 Worker transport (#151)", ...)` block. The test must:
- Sign in as `alice` (the existing test credential).
- Issue two `POST /api/v1/rpc` with `action: "restoreApp"` and empty params, 1 second apart, both using the same valid session.
- Assert both responses are parseable JSON with either a `success: true` body or a Problem Details body whose `status` matches the outer HTTP status.
- Must not assert that the call passes against the live Google edge; the assertion is the JSON shape, not the upstream success. This is the paired-call baseline that pairs the metadata log capture.

- [ ] **Step 2: Add the `E2E_LOG_METADATA` knob to the config**

File: `tests/e2e/worker-transport.config.ts`. After the existing `E2E_HOST_RESOLVER_RULES` block, add a `const E2E_LOG_METADATA = process.env.E2E_LOG_METADATA === "1"` flag. When set, the config must wrap the page's `request` listener to capture `cf-ray` and `X-Request-Id` response headers for any `POST /api/v1/rpc` and include them in the test's `extraHTTPHeaders` snapshot under `test.info().annotations`. The capture must redact any header value matching a 64-character hex token (the signature) before writing it.

- [ ] **Step 3: Run the strict E2E with metadata logging**

Run: `E2E_TARGET_URL="https://efcc-prototype-129.efcc-ggc.workers.dev" E2E_LOG_METADATA=1 node_modules/.bin/playwright test --config=tests/e2e/worker-transport.config.ts --reporter=list --retries=0`.
Expected: the new paired-call baseline test runs as part of the suite. The pre-existing strict-run failures may or may not be present depending on the deployment window; the goal of this run is the metadata, not a pass/fail verdict. Capture the trace zip and the failure-context artifacts under `test-results/`.

- [ ] **Step 4: Pull metadata from the run**

Extract: from each `0-trace.network` in `test-results/<run>/`, the `cf-ray` and `X-Request-Id` headers on every `POST /api/v1/rpc` response. Write a summary to `docs/research/2026-08-04-e2e-metadata-run.md` with three sections: `## paired-call baseline`, `## strict run results`, `## cf-ray + X-Request-Id per request`. Use a small script under `.scratch/extract-meta.mjs` (gitignored) to parse the JSONL; delete the script after the report is written.

- [ ] **Step 5: Commit and report**

Stage: `tests/e2e/worker-transport.config.ts`, `tests/e2e/worker-transport.test.ts`, `docs/research/2026-08-04-e2e-metadata-run.md`. Commit message: `test(151): e2e paired-call baseline + metadata capture`. Do not stage `test-results/`.

- [ ] **Step 6: Reviewer gate decision**

The reviewer must answer: (a) Does the metadata confirm the failure class from Task 2 (timeout vs non-JSON)? (b) Does the paired-call baseline test pass? (c) Does any pre-existing test now fail because of a new `cache: "no-store"` interaction? The user reviews the report and decides whether to (i) keep the gate BLOCKED and move to an architecture review, (ii) ship the Worker change and accept retry-bounded intermittency after amending ADR-0018, or (iii) escalate to a different egress/backend.
