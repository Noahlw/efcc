# Fix Issue #151 Review Findings

## Goal
Close the concrete correctness and acceptance gaps found in the CF1 Worker-to-Apps Script review without changing the production HtmlService path or inventing server-side login deduplication.

## Scope

1. **Retry safety and correlation (`docs/adr/0018-frontend-http-boundary-auth-and-api-contract.md`, `web/lib/api.ts`, `web/worker.ts`, tests)**
   - Keep `Idempotency-Key` on `loginUser` for observability/future server deduplication, but classify login as non-retryable in both `web/lib/api.ts` and the Worker until Apps Script actually deduplicates it.
   - Remove `loginUser` from the Worker's retry allowlist so one signed login envelope is sent per browser attempt, and add a client fetch-count test proving the same.
   - Keep retries for `restoreApp`/`logoutUser`/`authorizedNavigate` only, with bounded non-JSON handling and an opaque `requestId` on every Worker-generated problem response.
   - Amend ADR-0018 to record the current exception: login remains keyed but is not automatically replayed until server-side deduplication exists.
   - Ensure unknown-action responses from the Apps Script dispatcher include a requestId that the Worker copies to `X-Request-Id`; tests must assert body/header equality.

2. **Apps Script fail-closed parsing (`src/gas/prototype-129-http-dispatch.gs`, `tests/gas/service-envelope.test.js`)
   - Treat missing `e/postData`, missing or empty `contents`, malformed JSON, `null`, arrays, and primitive JSON as invalid service envelopes.
   - Return the existing 403 `FORBIDDEN` problem shape with a fresh opaque `requestId`; tests must prove each case has no dispatch, no parser detail, and a fresh correlation ID.
   - Preserve existing signed-envelope verification and action dispatch behavior.

3. **Worker E2E acceptance hygiene (`tests/e2e/worker-transport.config.ts`, `tests/e2e/worker-transport.test.ts`)
   - Require an HTTPS `E2E_TARGET_URL`, with a config-load test rejecting `http:`.
   - Read all Worker test usernames/PINs from exact environment variables `E2E_MEMBER_USERNAME`, `E2E_MEMBER_PIN`, `E2E_ADMIN_USERNAME`, and `E2E_ADMIN_PIN`; validate them before tests and never hardcode or attach them.
   - Make RPC capture metadata-only and opt-in via `E2E_LOG_METADATA=1`; do not read request post data or response bodies. Disable Playwright traces for this credential-bearing transport suite.
   - Split the ADMIN flow into an independent single-login test and add the plan-mandated paired `restoreApp` baseline using the existing authenticated browser session. The baseline may inspect status/content type and parse JSON only in memory, requiring either a success envelope or Problem Details whose numeric `status` matches the outer status; it must not return, log, or attach response bodies/tokens.
   - Keep Playwright traces and screenshots disabled for this credential-bearing suite, and keep the strict `--retries=0` command as the final acceptance run; no retry may mask an intermittent failure.

## Verification
- Run focused GAS envelope tests, Worker tests, client API tests, and Worker E2E config/type checks.
- Run project typecheck and formatter/linter validation from the repository's supported commands.
- Publish a fresh approved Apps Script `/exec` deployment, point the Worker at it, and run the authenticated Worker E2E suite against that fresh target with `--retries=0`; require 100% pass plus the mandated IFRAME smoke before READY. If live deployment access or credentials are unavailable, stop at the exact missing prerequisite rather than claiming completion.
