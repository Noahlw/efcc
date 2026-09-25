# #646 Acceptance Trace — Shared runtime contracts for every non-Auth API

Parent spec #646, tickets #654–#662. Stack: `codex/646-non-auth-contracts`
(@ `4325ab4`) above `refactor/workspace-organization` (PR #663, OPEN @
`4325ab4`) above PR #644 (OPEN @ `a3da16da`). Auth routes, `auth.*`
grants, and Better Auth migration (#647) are out of scope; the dirty
Better Auth docs worktree is preserved untouched.

Source of route authority: `apps/web/worker.ts` dispatch (exact,
prefix, regex-match, and action-discriminated shapes), read line by
line. Graph counts are not authority. 88 non-Auth method/paths + 13
Auth method/paths (reserved, untouched).

## Schema-library decision (recorded before implementation)

- Pin `zod@4.6.5` exact (npm `version = '4.6.5'`, modified
  2026-09-25). Official docs (zod.dev, version-matched 4.6): Zod 4
  stable, zero external dependencies, runs in Node.js and all modern
  browsers, ~2kb core gzipped, requires TS 5.5+ with `strict`
  (repo: TS 5.9.3, strict on). Pure TypeScript, no Node-only imports
  (verified post-install: no `node:` specifiers in `zod/v4`
  dist) — compatible with the Cloudflare Workers runtime, the Next
  static-export browser bundle, and the workerd test pool.
- Classic `zod` API (`z.object`, `.safeParse`, `z.infer`); no
  framework adapters, no hosted service.
- Validators never transform: `safeParse().success` gates accept /
  reject only. Accepted extra fields keep flowing exactly as today
  (Zod v4 strips unknown keys on parse — we never forward parsed
  output, only the original payload). Rejected inputs keep their
  exact current status/code/order.

## Envelope and error kernel (shared by all slices)

- Success: `{ requestId: string, data: unknown }` + `X-Request-Id`.
- Failure: RFC 9457 Problem Details
  `{ type, title, status, code, detail, requestId }` (+ `X-Request-Id`,
  + endpoint-specific extensions such as CMS `latest` /
  `reloadRequired`, which the schema permits but never requires).
- Malformed 2xx data → `MALFORMED_RESPONSE` (browser), and on the
  Worker → the endpoint's existing 503 `*_UNAVAILABLE` fallback
  (logged, requestId preserved). No new wire codes.
- Malformed non-2xx → existing fallback preserving HTTP status and
  `X-Request-Id` (`UNAVAILABLE` ≥500, `MALFORMED_RESPONSE` <500 on
  the CMS client; `UNAVAILABLE` on the Home client). Never success.
- Mutation with possibly-committed write + malformed/lost
  acknowledgement → unresolved with request/operation/idempotency
  identity preserved; authoritative Audit Outcome or readback
  settles; no auto-replay, no rollback claim (ADR-0047 carried into
  every affected mutation path).

## Route matrix (Worker dispatch = authority)

`A` = actor gate before handler (cookie session → Active account →
capability where listed). Extra-field policy `ignore` = unknown
fields accepted and ignored today; `clamp` = coerced to range;
`strict-N` = Narcissistic exact predicates recorded per route.

### #654 — Home (7)

| Method/path | Handler | Actor | Input policy today | Slice proof |
|---|---|---|---|---|
| GET /api/v1/home | handleGetHome | member+ | no query/body consumed; extras ignored | worker/D1 + Home browser |
| GET /api/v1/home/announcements | handleGetAnnouncements | member+ | same | same |
| GET /api/v1/home/content | handleGetHomeContent | HOME_PUBLISH | same | worker/D1 + CMS browser |
| POST /api/v1/home/draft | handleSaveHomeDraft | HOME_PUBLISH | JSON object (400 INVALID_JSON); snake/camel aliases; unknown keys ignored; expected_version positive-int if present (422); template A\|B, mode immediate\|scheduled, HK start_at, end ordering; 409 CONFLICT w/ latest+reloadRequired | worker/D1 + CMS browser; unresolved-not-retried |
| POST /api/v1/home/publish | handlePublishHome | HOME_PUBLISH | same aliases + required version positive-int (422); scheduled start must be future; writes audit HOME_PUBLISH/SUCCESS | same |
| GET /api/v1/home/audit | handleListHomeAudit | HOME_PUBLISH | `limit` clamped 1..100 default 50 (never 422) | worker/D1 |
| GET /api/v1/home/cms/featured-event/:eventId | handleGetFeaturedEventPreview | HOME_PUBLISH | path segment trimmed; empty → 404 NOT_FOUND (never 500) | worker/D1 |

CMS POSTs carry an `Idempotency-Key` header the Worker ignores
today — recorded, preserved (no Worker enforcement added).

Mismatch #1 (decided in-PR, no owner product change): audit
`version`/`templateType` are nullable on the wire (malformed
historical audit stays visible) but the browser cast claims
non-null. Schema follows the wire (nullable); client type widens
to `number \| null` / `HomeTemplateType \| null`. No runtime change.

### #655 — Identity Role/Grant/Account (13, non-Auth only)

GET /roles → hierarchy; POST /role-definitions → create;
PATCH /roles/order → reorder; GET /accounts → eligible search;
GET|POST /accounts/:id/assignments → read/mutate;
POST /accounts/:id/assignments/revoke → revoke;
GET|POST /role-definitions/:id/lifecycle → preview/transition;
GET /role-definitions/:id → detail;
PATCH /role-definitions/:id/grants → grants;
PATCH /role-definitions/:id/scope → rescope;
PATCH /roles/:id/name → rename.
Malformed path segments → existing 404 ROLE_NOT_FOUND /
ROLE_TARGET_INELIGIBLE (decodePathSegment, never 500). Effective
Permission and assignment history unchanged; unresolved Identity
mutation settles by readback/audit, never blind replay.

### #656 — Programs reads/feed (18)

GET access, hub, management-directory, accounts, accounts/:id,
members, attention, notifications, notices, catalog,
:id/management, :id/attendance-artifact, :id/cockpit,
:id/participant-detail; POST notifications/read, notices,
notices/read-all, :id/attendance-artifact/rotate.
Permission/field-redaction, pagination/query, nullables, and
extra-field policy preserved; malformed 2xx never renders.

### #657 — Department/Program settings (9)

POST|GET departments; GET|PATCH departments/:id;
POST|GET departments/:id/programs;
POST departments/:id/modules/:key/:action(enable|disable);
GET|PATCH programs/:id; GET :id/member-options.
Wrong input fails pre-mutation with current status/code/order;
post-commit output failure → unresolved + readback, no retry.

### #658 — Schedule/Event (13, ADR-0047)

POST|GET :id/schedule-rules; POST :id/schedule-rules/:ruleId/retire;
PATCH :id/schedule-rules/:ruleId;
POST|GET :id/schedule-rules/:ruleId/exceptions;
DELETE :id/schedule-rules/:ruleId/exceptions/:exceptionId;
POST :id/events/preview; POST :id/events/generate;
POST|GET :id/events; GET|PATCH :id/events/:eventId.
Preview/Generate keep Reviewed Schedule Plan fingerprint, Church
Time, permission/audit semantics. Malformed/lost Generate/Event
ack → unresolved until authoritative Audit Outcome; Generate's
Reviewed Plan and guest proof-bound recovery preserved.

### #659 — Enrollment/approval-run (12)

POST|GET :id/enrollment-requests; GET :id/enrollment-snapshot;
POST|GET :id/enrollment-approval-runs;
POST :id/enrollment-approval-runs/:runId/{reconcile,continue,cancel};
POST :id/enrollment-requests/:requestId/{decision,withdraw};
POST|GET :id/enrollments; POST :id/enrollments/:enrollmentId/cancel.
Role scope, idempotency, revision, partial-result, Audit Outcome
preserved; one authoritative outcome, no duplicate enrollment.

### #660 — Attendance authenticated/assisted (11)

GET attendance/events, scanner-events, resolve;
POST attendance/self;
GET events/:eventId/{roster,me,members};
POST events/:eventId/{check-in(materialize? no — assisted),materialize,excused};
POST attendance/:attendanceId/void.
Event lifecycle/window, member permissions, idempotency, secret
redaction, Audit Outcomes unchanged; malformed ack → unresolved +
reconciliation, no blind replay.

### #661 — Guest attendance (3)

POST attendance/guest; POST attendance/guest/reconcile;
PATCH attendance/:attendanceId/guest-correction.
Public/optional-auth preserved; guest never silently becomes
member; lost/malformed ack keeps proof/operation reference +
existing reconciliation; no second check-in.

## TDD seams (pre-agreed)

Red-green per slice inside the existing suites that own the
boundary: `home-worker.test.ts`, `home-cms-worker.test.ts`,
`attendance-worker.test.ts`, `programs-contract.test.ts`,
identity `role-handlers` / `permission-editor-handlers` /
`account-access-handlers` tests (all run under `test:workerd`),
plus browser client tests (`home-api.test.ts`, CMS client tests).
New malformed/alias/extra-field/order cases fail first, then the
schema/guard makes them pass. Full `pnpm verify` once on the final
clean SHA (#662).

## #654 record — package, kernel, Home slice

- `packages/contracts` (`@efcc/contracts` 0.1.0, `zod@4.6.5` exact):
  envelope, Problem Details (+fallbacks), primitives (clampLimit,
  alias coalescing, path segment, HK-timestamp, trim policy), Home
  request/response schemas with aliases, nullables, and nullable
  audit version/templateType. Validators never transform.
- Worker: 2xx shape gates on all 7 Home routes → existing 503
  fallbacks (no new codes); shared atomic request predicates with
  byte-identical 422s; audit `limit` clamp adopted unchanged.
- Browser: 2xx shape gates → `MALFORMED_RESPONSE`; error bodies via
  the shared parser with existing fallbacks (status + requestId
  preserved, 409 extensions intact). Client duplicate interfaces
  replaced by inferred contract types (audit item widened to the
  wire-nullable truth — mismatch #1, no runtime change).
- Fix #2: malformed percent-encoding on the featured-preview dispatch
  is a stable 404 (was a raw workerd 500 without a body).
- D1 STRICT tables + CHECK constraints already enforce integer/enum
  columns (proven by failed sabotage attempts); gates cover the
  reachable holes (blanked TEXT timestamps, JSON audit details).
- Timestamps validated as non-empty strings only (type-shape, not
  ISO format): stricter format checks risk availability regressions
  on real D1; the spec targets missing/wrongly-typed fields.
- CMS `Idempotency-Key` stays sent-but-ignored; no automatic
  mutation replay exists (manual read-retry only) — verified, unchanged.
- Fixture corrections (mock-only, wire was already right): CMS editor
  audit mocks gain the always-sent `contentId` (+ `actorName`).
- Proof: contracts 16, workerd Home 30 (incl. 2 red-then-green
  malformed gates), browser clients 8, editor components 26,
  home/app components 110, typechecks (app/worker/contracts) clean,
  Knip + boundaries clean, static export builds, Home browser
  acceptance passed vs local Worker, CMS editor + publish + preview
  + stale-reject journey passed vs local Worker/disposable D1
  (home-cms config keeps its own `retries: 1`; passed first attempt).

## Proof plan per slice

Worker/D1 contract tests (valid + invalid request/response,
auth order, direct HTTP, D1 effects, Audit Outcomes) →
representative zero-retry Playwright journeys vs local
`wrangler dev` + disposable D1 (Home/CMS, role/account,
discovery/management/feed, settings, schedule/recovery,
approval/reconciliation, scanner/member/Staff, guest) →
affected components only where HTTP cannot show the state.
Storybook/MSW never counts as runtime proof. `packages/contracts`
unit tests cover pure schemas/helpers; compatibility proven by
Worker build, static export, and the consuming suites.
