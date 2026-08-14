# REL-01 (#261): Prove deployed Programs vertical and retirement gate — Acceptance Trace

Written before implementation per this repo's Headless-Gate rule (`AGENTS.md`).

## 1. What #261 actually asks for, and the constraint it collides with

#261's acceptance criteria assume literal isolated-Cloudflare-preview deployment and
real-device camera proof. This repo's own `AGENTS.md` Headless-Gate rule states the
**local run against `wrangler dev` + local D1 is the required READY gate (ADR-0029)**;
Cloudflare deployment is **optional/manual production-promotion evidence only**, and
physical camera/device smoke is explicitly manual-operator evidence, never fabricated.

Checked before writing this trace:
- `web/wrangler.jsonc` `name` is still `"efcc-prototype-129"` — the exact host the
  Headless-Gate rule forbids redeploying to — with placeholder `database_id` and
  `ratelimits.namespace_id`. Deploying as-is would either fail or, worse, point an
  "isolated preview" at the shared dev D1. Real deployment requires an operator with
  Cloudflare credentials to pick a fresh `efcc-auth-*`/`efcc-dev-*` host and real
  resource ids — not something to fabricate.
- No Cloudflare account access, API token, or `wrangler login` session is available to
  this agent, and deploying to a real cloud account is a consequential external-service
  action requiring explicit operator authorization regardless.

**Scope decision:** implement every acceptance-criterion area that is reachable through
the local `wrangler dev` + local D1 headless path (per ADR-0029, this *is* the
project's production-shaped proof surface), close the specific gaps that remain in that
local proof, and produce the documentation #261 requires (traceability, rollback,
seeding/recovery, deployment ownership, deferred work). Actual Cloudflare execution,
physical-device camera capture, and legacy-artifact retirement are explicitly
out-of-reach for an autonomous agent and are documented as operator-owned follow-up,
not fabricated as done.

## 2. Blocker state (verified via `gh issue view` + `git log origin/main`)

| Ticket | State | Notes |
|---|---|---|
| #248 PUI-04 | Closed, merged to main | |
| #252 EVT-02 | Closed, merged to main (`91753e52`) | |
| #254 CFG-01 | Closed, merged to main | |
| #255 AUTH-01 | Closed, merged to main | |
| #256 NTF-01 | Closed, merged to main (`91753e52`) | |
| #260 SCN-04 | Open — PR #287, stacked, CI green, not merged (fail-closed: never merge) | |

`main@91753e52` is byte-identical to this worktree's stack base. The full vertical
exists as: `main` (245–256) + stacked PRs #284→#285→#286→#287 (257–260) + PR #288
(D1 fix + Prompts-1-4 verification suite, 30/30 passing locally). #261's proof runs
against this stacked head, mirroring how #245–256 already landed and how #257–260 were
verified before their PRs were marked ready — the stack tip is what "deploys" once
merged, so proving it before merge is the correct point to gate on.

## 3. Already-proven (no new work — cited, not rebuilt)

- **Participant discovery/direct-link/enrollment, scoped management, Program/Event
  ops, enrollment decisions, Self/Assisted/Guest/correction/void**: `tests/e2e/programs-vertical-proof.test.ts`
  (30/30 passing, phone+desktop) — PR #288.
- **Program Leader grant/revoke/self-denial, Department Manager
  grant/scope-inheritance/revoke, member direct-mutation denial, staff parity with
  admin directory breadth**: `tests/e2e/programs-d1.test.ts` AUTH-01/MUI-01/MUI-02
  suites (already on `main`).
- **Rate limiting** (guest check-in, `RPC_RATE_LIMITER`, 429 `RATE_LIMITED`):
  `web/lib/attendance-worker.test.ts`.
- **Duplicate/idempotent attendance, audit `old_value_json`/`new_value_json`, request
  correlation (`requestId`)**: SCN-01..04 test suites (already on stack).
- **`prefers-reduced-motion` CSS handling**: present across every animated surface
  (`attendance-panel.module.css`, `programs.module.css`, `auth-shell.module.css`, etc.)
  — product-side support already exists; only the E2E proof is missing.
- **Keyboard operability at management entry points**: `programs-d1.test.ts` MUI-01
  "keeps Directory and Workspace entry points keyboard-operable".
- **Session expiry on a fresh direct link**: `programs-d1.test.ts` PUI-01 "restores a
  direct Programs intent after session expiry and login".

## 4. Genuine gaps closed by this ticket (new test files)

### Slice A — `tests/e2e/programs-device-proof.{config,test}.ts`
Real-browser (not jsdom-mocked) camera capture proof, using Chromium's
`--use-fake-device-for-media-stream` + `--use-fake-ui-for-media-stream` +
`--enable-blink-features=ShapeDetection` launch flags (a synthetic camera device — no
physical hardware, but a real `getUserMedia()` → real `<video>` element binding, unlike
the existing component-level `vi.fn()` mocks). **Verified working end-to-end before
dispatch**: authenticated `/scanner`, clicked "使用相機掃描 QR", confirmed
`video.readyState === 4`, `videoWidth === 640`, `videoHeight === 480`, `paused ===
false` — a real MediaStream is bound and playing.
1. Granted camera permission binds a live, playing stream to the Self Check-In
   `<video>` element (`readyState`, `videoWidth`/`videoHeight` > 0, not `paused`).
2. `page.emulateMedia({ reducedMotion: "reduce" })` — a transition-bearing control
   (Event availability Undo, per `programs.module.css` `.actionButton`) still functions
   and the CSS-suppressed transition is honored.

**Explicitly out of scope, with a verified reason (not a guess):**
- **Real permission-denial recovery.** Probed before dispatch: with
  `--use-fake-ui-for-media-stream` (required for the fake device to resolve at all —
  without it `getUserMedia` rejects `NotSupportedError` regardless of granted
  permission), Chromium auto-accepts the camera prompt unconditionally; Playwright's
  `context.grantPermissions` has no effect either way. There is no flag combination in
  this headless environment that produces a genuine `NotAllowedError` while keeping the
  fake device usable. The existing jsdom-mocked test
  (`self-check-in-panel.test.tsx` "focuses the manual fallback when camera is
  unavailable") remains the correct, and only reachable, proof for that path — cited,
  not rebuilt.
- **Decoding an actual QR code from a synthetic video feed.** `BarcodeDetector` is a
  thin wrapper around a browser built-in with no custom decode logic to validate, the
  full permission/stream/generation-guard state machine is already covered by
  `use-qr-camera.test.tsx`, and the manual-code-entry path already proves the same
  server-side resolution E2E (`programs-vertical-proof.test.ts` P4.1/P4.2). Building a
  synthetic Y4M video with an embedded QR pattern is real engineering effort for
  marginal incremental confidence — flagged as an optional follow-up in §7, not built
  here.

### Slice B — `tests/e2e/programs-capability-matrix-proof.{config,test}.ts`
Cross-scope denial and Staff/Admin breadth, via **direct API requests**, not just UI
visibility (per `capability-authorizer.ts`: `hasCapability(role, …)` is role-global and
checked before any scope grant; `hasProgramLeadership`/`hasDepartmentManagement` are
scope-specific):
1. Program Leader of Program A directly `PATCH`es Program B (same fresh test
   Department) → 403, both via direct `fetch` and via the management UI reaching an
   unavailable/forbidden state rather than showing edit controls.
2. Department Manager of Department X directly mutates a Department-Y-scoped resource
   → 403; positive control confirms the same actor *can* mutate within Department X.
3. Staff and Admin each directly manage a fresh Program/Department they were never
   explicitly granted leader/manager rights on → 200, proving role-global breadth
   (`hasCapability`) independent of scope grants, contrasted with Member's baseline
   denial (already covered).

### Slice C — `tests/e2e/programs-resilience-proof.{config,test}.ts`
1. Network failure + recovery: abort the first enrollment-request mutation
   (`page.route(...).abort()`), assert the existing `transportAmbiguous`/
   `programTransportAmbiguous` retry copy appears and the object/task context is
   preserved, then restore the route and confirm the retry succeeds.
2. `context.setOffline(true)` mid-flow on the scanner, assert a graceful failure state
   (not a blank crash), then `setOffline(false)` and confirm recovery.
3. Viewport/orientation change (375×667 → 667×375) **mid-flow**, after partial input
   (e.g. a partially filled guest check-in form), asserting entered state survives the
   resize and the primary action stays reachable — not just fresh-load responsiveness
   (already covered by `responsive.test.ts`).
4. Session expiry **during an active mutation** (not a fresh direct link, which
   `programs-d1.test.ts` PUI-01 already covers): clear the session cookie mid-flow,
   submit a protected mutation, assert a clean 401 → login redirect that preserves and
   restores the in-progress object/task.

## 5. D1 evidence, correlation, rate limiting — consolidation, not new tests

AC5 ("D1 evidence proves required migrations, transactionality, duplicate/idempotent
behavior, audit outcomes, request correlation, rate limiting, and no mutation of
production data") is satisfied by evidence that already exists across the SCN-01..04
suites and `attendance-worker.test.ts`, plus the structural invariant that every suite
in this repo runs against a local, disposable, `E2E_`-prefixed D1 database per the
repo's Database Safety rule — never production data. §6 documents this with citations;
no new test file needed here beyond what Slices A–C add incidentally.

## 6. Documentation deliverables (this ticket's AC6/AC7)

Written after the gap-closing suites land and pass, so results are accurate:
- Traceability matrix mapping Spec #241's 12 Testing Decisions to observable
  test/result evidence (file + test name), distinguishing local-verified from
  deployed-would-require.
- Rollback plan (Worker redeploy-previous-version + migration reversibility check).
- Data seeding/recovery (`pnpm db:seed:local` / `db:seed:demo`, already-established
  flow, written down formally for this ticket).
- Deployment ownership: who executes an actual Cloudflare preview deploy, and the
  exact `wrangler.jsonc` placeholders (`name`, `d1_databases[0].database_id`,
  `ratelimits[0].namespace_id`) an operator must replace first.
- Deferred/optional work: Cloudflare preview deploy execution, physical-device camera
  capture, synthetic-video QR decode (optional, narrow), legacy/prototype-artifact
  retirement (blocked on explicit operator approval per the ticket's own text and
  Spec #241 Implementation Decision #29).

## 7. What this ticket will NOT do

- Will not run `wrangler deploy` against any real Cloudflare account.
- Will not delete or retire any legacy deployment, route, or prototype artifact.
- Will not merge any PR (session-wide constraint, stack skill fail-closed rule).
- Will not fabricate physical-device camera evidence or a synthetic QR-decode proof.
