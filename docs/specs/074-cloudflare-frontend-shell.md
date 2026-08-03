# Spec 074 — Cloudflare Frontend Shell (CF0 canonical specification)

**Feature:** [CF0 — Cloudflare Frontend, HTTP API & UX Foundation](https://github.com/Noahlw/efcc/issues/118)
**Map:** [Map: EFCC Cloudflare React/Next.js Frontend Migration](https://github.com/Noahlw/efcc/issues/117)
**Authority consumed:** [ADR-0017](../adr/0017-frontend-repo-rendering-and-cloudflare-deployment-boundary.md) (repo/rendering/deploy topology), [ADR-0018](../adr/0018-frontend-http-boundary-auth-and-api-contract.md) (HTTP contract), [Spec 073](073-htmlservice-spec-reconciliation-matrix.md) (which prior clauses PRESERVE/AMEND/SUPERSEDE)
**Prototype evidence (not acceptance):** [Prototype #129](https://github.com/Noahlw/efcc/issues/129) — a narrow live round trip on real infrastructure; it does not prove this shell specification's state machine, routes, accessibility, retries, or deployment gates.
**Date:** 2026-08-03

## Problem Statement

ADR-0017 and ADR-0018 decided *where* the frontend lives and *how* it talks to Apps Script, and Prototype #129 supplied narrow transport round-trip evidence on real infrastructure. It did not accept this shell contract. Nothing yet describes **the shell to actually build**: the authenticated application frame that every later Feature (CF2–CF7) mounts its Sections into.

The existing shell contract lives in [Spec #50](https://github.com/Noahlw/efcc/issues/50) and [`docs/specs/009-phone-first-shell-navigation.md`](009-phone-first-shell-navigation.md), both written for the HtmlService App Document. Spec 073 classified their clauses: the UX, state-machine, routing, security, and accessibility requirements are **PRESERVE**; only the HtmlService/iframe/`google.script.run` mechanisms are **SUPERSEDE**. Nobody has yet restated the preserved half as an implementable contract for the React/Cloudflare stack.

Without this spec, CF2–CF7 have no shell to build into, and the prototype's throwaway page is the only frontend that exists.

## Solution

Build the production application shell as a Next.js static export served from the Cloudflare Worker (ADR-0017), talking to Apps Script exclusively through `POST /api/v1/rpc` on the same origin (ADR-0018).

The shell owns: the authenticated application frame, the visible state machine, Section routing and the server-authorized Section allowlist, session persistence and restore, the HTTP client with its error/retry/idempotency contract, the recoverable-error surface, and the responsive/accessible baseline. It does **not** own any Section's domain content beyond Profile — those belong to CF2–CF7.

Every preserved requirement from Spec #50 and spec 009 carries forward unchanged in *intent*; only the mechanism is restated. Specifically preserved verbatim: the visible state machine, the "no naked document" invariant (a failed RPC never blanks the view), Section-key-only routing with no secrets in the URL, server-authoritative Section authorization, the bootstrap DTO contract, Traditional Chinese copy, and the responsive/accessibility baseline (44px targets, safe-area insets, 375px no-horizontal-scroll, 768px breakpoint).

## User Stories

**Authentication and session**
1. As a signed-out member, I want to open the app URL and see the Login view, so that I am never met with a blank page.
2. As a member, I want to sign in with my existing username and 4-digit PIN, so that no new credential is required by the platform change.
3. As a member with a stored session, I want the app to restore me directly into the authenticated shell on reload, so that I do not re-enter my PIN every visit.
4. As a member whose PIN or status changed in the spreadsheet, I want to be visibly returned to Login with a clear Traditional Chinese explanation, so that a stale session fails safely and understandably.
5. As a member, I want to sign out and have my stored session cleared locally and revoked server-side, so that the next visitor to this browser is not signed in as me.
6. As a member whose session expires mid-action, I want the app to surface a re-login path without losing the shell, so that I am not stranded.

**Navigation and authorization**
7. As a member, I want to see only the Sections my role permits, so that I am not offered actions I cannot perform.
8. As a phone user, I want a bottom navigation bar reachable with one thumb, so that the app is usable one-handed.
9. As a desktop user, I want the same Sections in a side rail, so that the wider screen is used well without a separate navigation model.
10. As a user, I want the active Section clearly marked in a way that does not rely on color alone, so that the current location is unambiguous.
11. As a user who deep-links or reloads on a Section URL, I want to land back on that Section after authentication, so that bookmarks and refreshes behave naturally.
12. As a user pressing the browser Back button, I want to move between Sections as expected, so that the app respects normal browser behavior.
13. As a direct API caller, I want the server to reject a Section I am not permitted to load, so that hiding a nav item is never the only protection.
14. As a user who reaches an unauthorized or unknown Section, I want a Traditional Chinese explanation and a route back to my nearest permitted Section, so that I recover without a dead end.

**Profile**
15. As a member, I want to see my name, username, phone, role, status, and QR code in Profile, so that I can confirm my own record.
16. As a member, I want Profile to be read-only, so that credential and master-data edits stay in the spreadsheet per the inherited decision.

**Errors and resilience**
17. As a user hitting a network failure, I want the shell to stay mounted with an inline, retryable error, so that I never see a blank document.
18. As a user, I want distinct Traditional Chinese messages for network failure, session expiry, forbidden, and server error, so that I can tell what actually went wrong.
19. As a user, I want a retry action that repeats only the failed operation, so that recovery is cheap and predictable.
20. As a user on a slow connection, I want a visible loading state for every async transition, so that the app never appears frozen.
21. As a user, I want a late response from a Section I have already navigated away from to be discarded, so that stale data cannot overwrite my current view.
22. As a user tapping a nav item repeatedly, I want the duplicate requests coalesced, so that impatient taps do not multiply server load.

**Accessibility and responsiveness**
23. As a phone user, I want every primary control to be at least 44×44 CSS pixels, so that targets are reliably tappable.
24. As a phone user with a notched device, I want fixed navigation to respect safe-area insets, so that controls are never cut off or obscured.
25. As a user at 375px width, I want no horizontal scrolling of core actions, so that the app works on the smallest supported phone.
26. As a keyboard user, I want to reach, activate, and leave every control in a predictable order, so that the app is usable without a pointer.
27. As a screen-reader user, I want loading, success, and error states announced through a polite live region, so that async changes are perceivable without sight.
28. As a screen-reader user, I want the current nav item exposed via `aria-current="page"`, so that my location is announced.
29. As a user, I want all shell copy in Traditional Chinese from a single copy source, so that language is consistent and maintainable.

**Platform and operations**
30. As a maintainer, I want the frontend to build as a static export with no server runtime, so that page traffic stays in Cloudflare's free unlimited static-asset pool per ADR-0017.
31. As a maintainer, I want every branch to get a preview deployment, so that changes are reviewable on real infrastructure before merge.
32. As a maintainer, I want an instant rollback path, so that a bad production deploy is reversible in seconds.
33. As a maintainer, I want the browser to reach Apps Script only through the same-origin `/api/*` proxy, so that the CORS constraint stays solved in exactly one place.

## Implementation Decisions

### Module structure (`web/`)

| Module | Responsibility |
|---|---|
| `web/app/layout.tsx` | Root layout: shell frame, single `role="status"` live region, responsive nav container. |
| `web/app/page.tsx` | Entry route. Boots the state machine, restores session or renders Login. |
| `web/app/<section>/page.tsx` | One real route per Section key (`profile`, `programs`, `events`, `scanner`, `care`, `permissions`). Static export emits real per-route HTML. |
| `web/lib/api.ts` | HTTP client implementing ADR-0018's contract. Sole owner of `fetch` to `/api/v1/rpc`. |
| `web/lib/session.ts` | Session persistence + the app state machine as a pure reducer. |
| `web/lib/sections.ts` | Section model derived from the server's bootstrap `sections[]`; label/order/visibility rules. |
| `web/lib/copy.ts` | Single Traditional Chinese copy source (user story 29). |
| `web/worker.ts` | Same-origin proxy: static assets + `/api/*` → Apps Script, CORS, status remap. |

### State machine

Preserved verbatim from Spec #50 / spec 009, implemented as a pure reducer in `web/lib/session.ts`:

`BOOTING → SIGNED_OUT | RESTORING`, `SIGNED_OUT → AUTHENTICATING`, `AUTHENTICATING → READY | SIGNED_OUT`, `RESTORING → READY | SIGNED_OUT`, `READY → LOADING_SECTION → READY`, and any state → `RECOVERABLE_ERROR` → (retry) previous state.

**Every state renders content.** No transition may leave the frame blank — this is the single most cross-cutting invariant carried from spec 009.

### Routing

Real Next.js routes, one per Section key (`/profile`, `/programs`, …), not hash routing — static export emits a real HTML file per route, so deep-linking and Back/Forward work natively. This **resolves the open question** Spec 073 flagged (whether Sections get real URLs now that the platform allows it): they do.

Preserved from spec 009: the URL contains **only** the Section key. Never member IDs, event IDs, QR values, credentials, or session tokens. A direct visit to a Section route while unauthenticated renders Login, then returns to the requested Section after successful auth. An unknown or unauthorized key renders the recoverable-error view with a route to the first permitted Section.

Section *visibility* comes exclusively from the server's bootstrap `sections[]`; the client never hardcodes a role→Section map. The server independently re-authorizes every Section-scoped call — client-side hiding is presentation only (user story 13).

### HTTP client (`web/lib/api.ts`)

Implements ADR-0018 exactly:

- `POST /api/v1/rpc`, body `{action, params}`, action dispatched server-side via allowlist.
- Auth: `Authorization: Bearer <sessionToken>` + `X-Efcc-Session-Id: <sessionId>`.
- `Idempotency-Key` header on every mutation covered by ADR-0018's `MUTATING_ACTIONS` set; CF2 `grantProgramLeader` / `revokeProgramLeader` are the explicit ADR-0019 exception and use natural-key deduplication with no automatic replay.
- Success responses parse the existing `{success, requestId, data}` envelope unchanged.
- Error responses parse RFC 9457 Problem Details (`application/problem+json`), branching on the `code` extension member (the existing `RPC_CODES` token), not on `type` or `detail`.
- Retries: reads and already-idempotent actions only, on network error or 502/503/504 only — never 4xx, never 500. Max 2 retries, exponential backoff with jitter, honoring `Retry-After`.
- `X-Request-Id` surfaced for cross-dashboard correlation.

Status→code mapping (ADR-0018 §5) that the client branches on: 401 `AUTH_REQUIRED`, 403 `FORBIDDEN`, 422 `VALIDATION`, 404 `*_NOT_FOUND`, 409 `CONFLICT`/`NOT_ENROLLED`/`MEMBER_INACTIVE`/`EVENT_NOT_ACTIVE`, 503 `UNAVAILABLE`, 500 `INTERNAL_ERROR`.

### Session persistence

One canonical `localStorage` key holding `{userId, sessionId, sessionToken}`. The HMAC session model itself (ADR-0011) is unchanged — only its transport moves to headers. Client storage is **never** treated as proof of identity or permission; every protected call re-verifies server-side. Restore-on-load calls `restoreApp`; any `AUTH_REQUIRED` clears local state and renders Login.

### Worker (`web/worker.ts`)

Defines the shell's production integration against ADR-0018's full contract; Prototype #129 supplies only narrow transport evidence:
- Static assets via the `ASSETS` binding; `run_worker_first: ["/api/*"]` so page navigation never invokes the Worker script (keeps traffic in the free static pool).
- `OPTIONS` preflight handling (required: `Authorization` is a non-simple header).
- **Status remap** — reads the JSON body's `status` and sets the outer HTTP status. Required because `ContentService.TextOutput` cannot set status codes; see ADR-0018's revision note. This is load-bearing correctness, not a nicety.
- **Browser-boundary termination** — the Worker reads `Authorization`, `X-Efcc-Session-Id`, and `Idempotency-Key` at the same-origin edge, then applies the locked #131 service-authenticated upstream transport; those browser headers are not forwarded as raw Apps Script headers. It surfaces `X-Request-Id`.
- Rate Limiting binding keyed on session identity (never IP, per Cloudflare's own guidance).

### Responsive and accessibility baseline

Preserved verbatim from spec 009 and `071-accessibility-acceptance-plan.md`: phone-first below 768px with bottom nav, desktop side rail at ≥768px, ≥44×44px interactive targets, `env(safe-area-inset-bottom)` on fixed nav, no horizontal overflow at 375px, semantic `<nav>` with `aria-label`, `aria-current="page"` on the active item, one polite `role="status"` live region for all async feedback, non-color state cues, and Traditional Chinese copy from `web/lib/copy.ts`.

### Deployment

Per ADR-0017: `main` auto-deploys to production; every non-production branch gets a preview URL; merge is gated on a manual smoke test of the preview; rollback via Cloudflare's built-in instant rollback.

## Testing Decisions

**A good test here asserts observable behavior** — rendered output, ARIA state, which Sections appear for which role, and the shape of requests leaving the client. Not React internals, not component structure, not private module state.

Four seams, chosen after checking current practice against Next.js's official testing guide, Cloudflare's official Workers testing guide, and Testing Library's philosophy:

**1. Component/integration — Vitest + React Testing Library + MSW (primary seam).**
Render the shell; MSW intercepts `/api/v1/rpc` at the network boundary so the *real* `api.ts` path runs (real header construction, real Problem Details parsing). Assert user-visible outcomes: login renders Profile; a garbage session renders the recoverable error **with the shell still mounted**; nav shows only server-permitted Sections; a 403 renders the forbidden view with a route back. MSW is chosen over hand-stubbing `fetch` deliberately — stubbing `fetch` largely tests the stub.

**2. Worker — `@cloudflare/vitest-pool-workers` (Cloudflare's official integration).**
Runs inside the real `workerd` runtime. Covers the status remap (the ADR-0018 correctness fix, currently unprotected), `OPTIONS` preflight, CORS headers, and auth-header forwarding. This seam exists because the prototype *discovered* the status-remap requirement; it must not silently regress.

**3. E2E — Playwright against a deployed preview URL (ADR-0012 pattern, reused).**
Role matrix (alice/MEMBER, bob/STAFF, noah/ADMIN) at 375×812 and 1280×800. Per Spec 073's finding, the old headless-auth blocker is structurally gone — auth now travels as ordinary headers, no Google sign-in iframe wall — so storage-state capture should be materially simpler than the HtmlService era.

**4. Narrow direct unit tests — concurrency invariants only.**
Reserved for logic that cannot be reliably driven through rendered UI: spec 069's stale-response generation guard (user story 21) and duplicate-navigation coalescing (user story 22). These are race conditions, not user-visible flows; driving them by simulated clicking would be non-deterministic. A pure reducer is a module's public API, so testing it directly here is legitimate — but it stays the exception, not the default.

**Prior art to reuse:** `tests/gas/` vm-harness conventions (deterministic, no network, no Sheet mutation); `tests/e2e/` acceptance-registry, role fixtures, and plan-doc appender; Prototype #129's five-check smoke sequence as the deployed-proof template.

**Explicitly not required:** snapshot tests (brittle against refactors for no behavioral guarantee), and unit tests of presentational components with no logic.

## Out of Scope

- Section domain content beyond Profile — Programs, Events, Scanner, Care, and Permissions render authorized placeholders here; their behavior belongs to CF2–CF7.
- The production Apps Script HTTP dispatcher — CF1 (#131) owns it. This spec consumes the ADR-0018 contract; it does not implement the server side.
- The QR scanner's inline-vs-popup decision — CF5 (#136), flagged as pending in Spec 073.
- Production cutover and retirement of the HtmlService app — CF8 (#126).
- Any Google Sheet schema change, and any change to `api_*` business logic.
- Member registration/approval UI — still deferred per spec 001.
- One-active-device session enforcement — still deferred per ADR-0011.

## Further Notes

**Interim backend dependency.** CF0's shell needs a `doPost` endpoint before CF1 (#131) ships the production dispatcher. Per the Map, CF1 depends on CF0's decisions, not the reverse, so CF0 may proceed in parallel against the throwaway dispatcher for a narrow non-production smoke path. That dispatcher is explicitly interim and non-conforming for the final session transport: it carries compatibility fields in `body.params`, while #131 supplies the service-authenticated Worker-to-Apps-Script transport. Replacing it is a backend and transport integration change, and the prototype run is not acceptance evidence for ADR-0018 or this spec.

**Glossary.** Uses `CONTEXT.md` vocabulary throughout: Member, Role, Section, Session, Program, Event, Attendance, Church Time. "Section" remains the canonical term for a navigable capability — not "page" or "screen" — even though Sections are now real Next.js routes.

**Relationship to prior specs.** This spec is the React/Cloudflare successor to the preserved half of Spec #50 and spec 009. Per Spec 073, those two remain readable as domain/UX authority for their PRESERVE clauses; their HtmlService mechanism clauses are superseded here. This spec does not restate domain rules owned by specs 001–007.

**Deferred implementation choice.** Nested-task navigation (spec 068's model) is preserved as a requirement but its URL representation is left to the implementing ticket — now that Sections have real routes, nested tasks *could* also get routes. Spec 073 flagged this as an open choice; it does not block the shell.