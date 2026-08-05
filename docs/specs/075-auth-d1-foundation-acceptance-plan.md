# AUTH-01 / AUTH-02 Acceptance Plan

**Tickets:** AUTH-01 (#159), AUTH-02 (#160)
**Spec authority:** ADR-0020 (locked legacy-PIN-hash migration path, D1 identity boundary)
**Date:** 2026-08-05
**Status:** proposed — locked via grilling and operator authorization; implemented in this branch's commits. AUTH-03 remains deferred under ADR-0021.

## Preconditions

1. The operator manually archives the legacy `Users` tab after the one-time read-only import.
2. The Cloudflare D1 database is provisioned with the `database_id` configured in `web/wrangler.jsonc` (currently placeholder; `wrangler d1 create` + `wrangler d1 migrations apply`).
3. A fresh `/exec?efcc_e2e=1` versioned deployment is supplied through `E2E_TARGET_URL`; never the production deployment.

## Acceptance trace — coverage map

The existing AUTH-01/AUTH-02 fixtures under `web/lib/auth/*.test.ts` and the Worker boundary tests (workerd) cover the following acceptance criteria. Workerd tests exercise the real `Fetch`/`D1`/`Response` runtime; the root vm-harness covers the retained Apps Script RPC behavior.

### AUTH-01 (legacy-PIN hash + brute-force lockout)

| # | Criterion | Fixture |
|---|-----------|---------|
| 1 | Schema applies cleanly (`accounts`, `registration_requests`, `sessions`) and the `user_id` immutability trigger rejects `UPDATE user_id`. | `accounts.test.ts › schema` |
| 2 | Normalized-username uniqueness is enforced transactionally. | `accounts.test.ts › schema` |
| 3 | Legacy import is read-only, deterministic, idempotent; duplicate / malformed non-empty PIN rows fail closed with no partial write, while complete rows without a PIN are skipped as non-legacy. | `accounts.test.ts › legacy import` |
| 4 | The first login must verify the legacy PIN; on success the legacy-PIN hash is cleared and a non-upgrade session is issued. | `accounts.test.ts › forced credential upgrade gate` |
| 5 | `requires_upgrade = 1` blocks session issuance via the `UPGRADE_REQUIRED` gate. | `accounts.test.ts`, `sessions.test.ts` |
| 6 | The 5-failure threshold enters a 5-minute lock; the correct PIN is blocked while the lock is active. | `lockout.test.ts › 5-minute lock` |
| 7 | After the 5-minute lock expires, a fresh round of 5 failures enters a 15-minute lock. | `lockout.test.ts › 15-minute lock` |
| 8 | After the 15-minute lock expires, a fresh round of 5 failures requires Admin/Teacher unlock. | `lockout.test.ts › admin-unlock` |
| 9 | `adminUnlockLegacyUpgrade` clears the lockout without clearing `requires_upgrade` or the legacy-PIN hash. | `lockout.test.ts › admin unlock` |
| 10 | A successful upgrade clears the entire lockout state. | `lockout.test.ts › success clears` |
| 11 | Only non-secret counters/timestamps are persisted — never the PIN. | `lockout.test.ts › non-secret persistence` |

### AUTH-02 (cookie-only transport contract)

| # | Criterion | Fixture |
|---|-----------|---------|
| 12 | Access and refresh are separate `HttpOnly; Secure; SameSite=Strict; Path=/` cookies. | `cookies.test.ts › cookie attributes` |
| 13 | Access cookie max-age matches the 15-minute signed-token TTL. | `cookies.test.ts › access max-age` |
| 14 | Refresh cookie carries the opaque D1 refresh-session key with a 90-day max-age. | `cookies.test.ts › refresh opacity` |
| 15 | Token material is read only from cookies; Authorization header is ignored. | `cookies.test.ts › cookie-only read` |
| 16 | Logout clears both cookies. | `cookies.test.ts › logout clears` |
| 17 | Authorization header is detected and rejected with a secret-free diagnostic. | `cookies.test.ts › header rejection` |
| 18 | Cross-origin requests are detected and rejected. | `cookies.test.ts › cross-origin rejection` |
| 19 | Clean cookie-only same-origin request passes the guard. | `cookies.test.ts › clean pass` |
| 20 | No client-side token storage; token material is only exposed inside HttpOnly cookies. | `cookies.test.ts › no client storage` |
| 21 | The Worker/browser-facing `/api/auth/*` route surface rejects `OPTIONS`, emits no CORS headers, and rejects `Authorization` / `X-Efcc-Session-Id` headers. | `worker.auth.test.ts` (added) |
| 22 | The cookie-only contract is enforced on every `/api/auth/*` method entry; existing `/api/v1/rpc` proxy behavior is preserved. | `worker.auth.test.ts` (added) |

## Forbidden paths

- Cleartext PIN, password, access token, or raw session value in any test, log, response, or RPC body.
- D1 row-level `UPDATE user_id` (the schema trigger rejects it).
- Triggering a `/api/auth/*` route with `Authorization` / `X-Efcc-Session-Id` headers (must be rejected / ignored).
- Sending a CORS preflight (`OPTIONS`) to any `/api/auth/*` route (no CORS handler).
- A run that exposes `err.message` or stack contents to the caller (operator diagnostics only).

## Recovery paths

- **Forced upgrade blocked while locked:** the Worker renders the lockout remaining time; the next allowed attempt is after the 5/15-minute window.
- **Stage-3 (admin unlock):** only an Admin/Teacher can restore via the `adminUnlockLegacyUpgrade` primitive; the upgrade gate (`requires_upgrade`) is preserved.

## Verification boundary

Unit tests use the workerd runtime (real `Fetch`, `D1`, `Response`) and the retained Apps Script vm-harness. The required deployed `/exec` IFRAME smoke test is **blocked**: there is no login landing-page UI this turn (out of scope), and the surrounding pipeline is unavailable (`E2E_TARGET_URL`, role-state `.auth/*.storage.json`, Cloudflare D1 `database_id`, `wrangler`/`CLOUDFLARE_API_TOKEN` absent; `clasp` is authenticated but the pinned `.clasp.json` script id is the shared live one, so a deploy risks production overwrite). The acceptance proof is limited to focused workerd + vm-harness tests in this branch; the deployed smoke pipeline must be re-run when the environment is available before the AUTH-01/02 tickets are marked READY.

## Executed results

Appended after the review-fix pass (2026-08-05). All runs are focused; no formatters, linters, or project-wide suites were executed (per the ticket's verification contract).

### Web (workerd pool, `cd web`)

```text
$ pnpm --dir web test
Test Files  10 passed (10)
Tests       135 passed (135)

$ npx vitest run lib/auth
Test Files  4 passed (4)
Tests       46 passed (46)

$ npx tsc --noEmit -p tsconfig.worker.json
# passed with no output
```

### Root deterministic suite (excluding untouched local CF1-01 files)

```text
$ pnpm exec vitest run tests/gas tests/prototype --exclude '**/service-envelope.test.js'
Test Files  17 passed (17)
Tests       278 passed (278)
```

The mandated `pnpm test` command also discovers four untracked local CF1-01
service-envelope files preserved from unrelated work. That untouched suite
currently fails 22 assertions; its loader reads only `service-envelope.gs`, so
the failures are independent of the removed AUTH-03 mirror files. The tracked
root surface above passes.

Coverage-map rows newly proven in this pass: #21 (auth surface rejects OPTIONS /
Authorization / X-Efcc-Session-Id with no CORS headers) and #22 (cookie-only
contract enforced on every `/api/auth/*` entry, `/api/v1/rpc` preserved). Final pass also asserts auth response bodies
(login/upgrade/refresh) omit `sessionId`/`accessToken`/`refreshToken` and any
nested token/session keys — the opaque refresh key and access token travel only
inside the two httpOnly cookies (`worker.auth.test.ts › assertBodyHasNoTokenKeys`).

Transport final pass (2026-08-05): both cookies now arrive as TWO real
`Set-Cookie` headers (`Headers.append`; the obsolete `Set-Cookie-2` header is
gone from all auth success/logout paths and tests). `cookies.ts ›
setAuthCookieHeaders` builds the pair; `worker.auth.test.ts ›
readAuthCookiesFromResponse` reads both real `Set-Cookie` values via
`Headers.getSetCookie()` and asserts each carries httpOnly Secure
SameSite=Strict. Re-ran the focused auth and Worker suites after the final code change.

Atomicity final pass (2026-08-05): `importLegacyUsers` no longer inserts
rows one-by-one. It preflights the entire source + existing D1 (single
query for `user_id` and `username_normalized` collision) and then writes
every new row in a SINGLE `db.batch(...)` call (one SQLite transaction;
all-or-nothing per the official D1 batch API). Both collision classes now
fail closed BEFORE any DB write, with the DB byte-for-byte unchanged:
(a) incoming `username_normalized` colliding with an existing D1 account,
(b) two incoming rows colliding after normalization. `adminUnlockLegacyUpgrade`
now returns `boolean` (true when a row matched; false for an unknown
user_id); the handler reports 404 NOT_FOUND instead of falsely
`unlocked: true`.

### Deployed `/exec` IFRAME smoke — BLOCKED (environment)

The AGENTS.md Headless-Gate requires a fresh deployed `/exec` IFRAME smoke test
with observable DOM assertions before READY. This session cannot satisfy the
gate:

- `E2E_TARGET_URL` is not set; `tests/e2e/playwright.config.ts` requires a
  `^https://script.google.com/macros/s/(?<deploymentId>AK…)/exec$` URL.
- `clasp` IS authenticated (token for `attendance@efcc-ggc.org` in
  `~/.clasprc.json`; `.clasp.json` pins script id `1NvyYC…` with rootDir
  `src/gas`). But deploying would target that LIVE script id (shared with the
  CF1-01 service-envelope work), which carries production-overwrite risk that
  the environment-availability instruction says to avoid.
- No Cloudflare deploy credentials: `CLOUDFLARE_API_TOKEN` / account id are
  absent; `wrangler` is not on PATH and there is no D1 `database_id` (the
  wrangler.jsonc value is a placeholder).
- No role-state files: `.auth/alice.storage.json`, `.auth/bob.storage.json`,
  `.auth/noah.storage.json` are absent.

Beyond the missing environment, the HEADLESS-GATE does not have a deployable
UI artifact this turn: the login landing page is explicitly out of scope (no
IFRAME to render). So no legitimate IFRAME smoke exists to run.

The pipeline rework (2026-08-05, this branch) makes this explicit in CI:
`.github/workflows/e2e.yml` is a deploy-closed acceptance gate that fails red
(never green) when `E2E_TARGET_URL` or the ALICE/BOB/NOAH storage-state secrets
are missing, and `.github/workflows/precheck.yml` is the deterministic PR gate
(typecheck + unit/component + static-shell responsive tests) that needs no
deployment. The deterministic
precheck is green on this branch; the deployed acceptance gate is red/blocked
until the environment below is provisioned.

Required to unblock: operator supplies `E2E_TARGET_URL` pointing at a fresh
versioned `/exec` deployment, authenticates `clasp` (or provides a CLASPRC),
and provisions the Cloudflare D1 database + API token. Until then, this
acceptance is limited to the focused workerd + vm-harness proof above, and the
AUTH-01/02 tickets must NOT be marked READY.

## Out of scope

- Landing-page UI (deferred to a separate impeccable design run).
- AUTH-03 D1 → Sheets identity-metadata review mirror (deferred under ADR-0021; no implementation is authorized in this change).
- The full AUTH-04 HTTP login flow (login/refresh/logout endpoints with real session issuance against D1); the auth route surface is wired in worker.ts with the cookie-only contract, but the complete HTTP endpoints land in AUTH-04.
- The CF1-01 `/exec` round-trip deployment smoke (unrelated ticket,#151).