# Phone-First Shell Navigation for the Apps Script Web App

**Status:** Draft, API-level feasibility verified; deployed smoke test pending
**Date:** 2026-07-28
**Scope:** Architecture and acceptance criteria only. This spec does not implement the feature.

## Decision evidence standard

Starting 2026-07-28, an architecture decision affecting the Apps Script web app
passes through three evidence levels:

1. **Officially supported:** the required API and deployment context are present
   in current official Google Apps Script documentation.
2. **Implementation verified:** a minimal implementation passes deterministic
   local/source-level tests without relying on undocumented browser behavior.
3. **Deployment proven:** the behavior passes its named smoke flow against a
   freshly deployed `/exec` HTML Service IFRAME web app.

Official documentation establishes implementability, not deployed correctness.
A decision remains **Proposed** until all three levels pass. Every decision entry
must identify its official source, minimal proof, deployment flow, observed
result, deployment version, and test date. Failure at any level reopens the
decision instead of adding workarounds around an unproven premise.

For every recommendation touching the Apps Script backend or an Apps Script
browser API, documentation lookup uses Context7 first with the official Google
Apps Script library. If Context7 is unavailable or incomplete, research falls
back to official Google web documentation, then another trustworthy primary
source only when Google does not document the concern. This rule is also
recorded in the repository's `AGENTS.md`.

## Context

EFCC is being rebuilt as a Google Apps Script HTML Service web app. The current
direction uses one authenticated HTML shell and server-rendered HTML fragments
loaded into that shell. The working example in
`src/gas/template-reference/` demonstrates this pattern with a desktop sidebar,
top bar, `loadPage()`, and `init<Page>()` functions.

The reference is useful for composition and page lifecycle, but it is not a
phone-first design and it does not provide browser-history navigation. The EFCC
web app must serve phone users first, with desktop as the secondary layout.

## Users and outcome

- **Users:** authenticated EFCC members, staff, and administrators.
- **Primary outcome:** a user can move among accessible EFCC sections quickly on
  a phone, use the browser or device Back button naturally, and retain the
  current section after an authenticated reload.
- **Secondary outcome:** the same application expands into a desktop side rail
  without maintaining a separate desktop navigation system.

## Canonical terminology

- **App Document:** the one stable top-level HTML Service document returned by
  `doGet()`. This is an architectural term recorded in ADR-0010.
- **Section:** a navigable church-management capability such as Profile,
  Programs, Events, Scanner, or Care. Use Section in product and architecture
  language; existing `.html` filenames remain implementation details.
- **Fragment:** the server-rendered HTML content mounted for one Section.
- **Authentication View:** the unauthenticated state mounted inside the App
  Document; it is not a separate navigation architecture.

## Current state

The following behavior was verified in the repository on 2026-07-28:

| Area | Current behavior | Gap this spec addresses |
|---|---|---|
| Entry | `src/gas/Code.gs` serves the login shell from `doGet()` | Bootstrap must restore the authenticated app route safely |
| Shell | `src/gas/main.html` has desktop sidebar and mobile navigation elements | Phone layout must be the base layout, not a reduced desktop layout |
| Fragment loading | `google.script.run.loadPage()` returns HTML injected into `#main-content` | Navigation needs a single route coordinator and failure handling |
| Fragment startup | Pages expose `init<Page>()` functions | Pages need an explicit mount/unmount lifecycle |
| Authorization | Server and client each expose page-access concepts | Server authorization must remain authoritative for direct calls |
| Login handoff | `login.html:61-72` calls `google.script.run.loadMainShell_()` | The trailing underscore marks the server function private, so the browser cannot invoke this handoff |
| Reference implementation | `template-reference/main.html` uses a 250px sidebar and mobile overlay | Reference should inform behavior, not dictate production layout |
| iOS Safari stale-cache symptom (T00 verified, fixed 2026-07-28) | A user who hit the previous deployment's `/exec` URL on iOS Safari and later opened the new T00 deployment saw the GAS interstitial banner followed by a clean, empty, non-interactive bordered box (no error, no spinner, no broken-image icon). The App Document itself rendered correctly on desktop Chromium and in headless Chromium with iOS Safari UA + mobile viewport emulation. | HtmlService serves the web app from the Apps Script CDN with no public Cache-Control header; iOS Safari aggressively caches cross-origin iframe content (the sandboxed `*.googleusercontent.com` panel). The supported workaround is **Settings → Safari → Clear History and Website Data** (or private-browsing) on the device, which the user confirmed resolves the blank-render. This is a known iOS Safari / GAS iframe caching interaction, not a code defect. A future ticket may add a `?v=<build-id>` cache-buster on static asset URLs, but only after the user explicitly requests it — speculative cache-busting on Google's CDN adds diff without proven effect. |

## Goals

1. Use one top-level authenticated shell for all post-login sections.
2. Use allowlisted HTML fragments for the five current page keys:
   `profile`, `programs`, `events`, `scanner`, and `care`.
3. Make phone layout the default CSS and interaction model.
4. Provide in-session Back and Forward behavior through the Apps Script history
   API.
5. Keep page access and session validation on the server.
6. Make every page transition observable and testable without depending on a
   full document reload.

## Out of scope

- Replacing Apps Script HTML Service with React, Vite, or another runtime.
- Rebuilding the business content of each feature page.
- Offline/PWA behavior, service workers, or push notifications.
- Making an unauthenticated deep link bypass login.
- Treating `localStorage` menu data as an authorization source.
- Copying the reference folder into the deployable source tree. The existing
  `.claspignore` exclusion remains in place.

## Proposed architecture

### Runtime model

The application has one stable top-level document after `doGet()`. It owns the
login view, authenticated shell, page outlet, phone bottom navigation, desktop
side rail, loading state, error state, and route coordinator.

Authentication changes the visible DOM view inside that document. It must not use
`document.open()`, `document.write()`, or `document.close()` to replace the whole
document during login, logout, session restoration, or section navigation. This
is a hard safety boundary: if an RPC fails or returns empty HTML, the current
document must remain visible and show an actionable error.

If a separate server-rendered shell is retained temporarily, its browser-facing
RPC wrapper must be a public function without a trailing underscore and must have
both success and failure handlers. It is a migration bridge, not the target
architecture.

The App Document has an explicit visible state machine:

```text
BOOTING
  -> SIGNED_OUT
  -> AUTHENTICATING -> LOADING_SECTION -> READY
  -> RESTORING      -> LOADING_SECTION -> READY
  -> RECOVERABLE_ERROR
```

Every state renders content. No success, business-failure, thrown-failure, empty,
or malformed-response branch may leave the document or outlet blank.

### Route contract

The route is a small logical object, not an arbitrary filename:

```text
Route = {
  section: "profile" | "programs" | "events" | "scanner" | "care"
}
```

Rules:

- The canonical visible URL is `/exec#/<section-key>`, for example
  `/exec#/events`.
- The route coordinator validates `section` against the client copy of the
  known Section keys before requesting a fragment.
- The server validates the same key against an explicit allowlist and the
  authenticated user's access before returning HTML.
- Fragment requests use
  `api_loadSection(sectionKey, userId, sessionToken)` as the only public
  browser-to-server Section-loading endpoint.
- Navigation clicks call `google.script.history.push()` once, then load the
  fragment.
- Before a user-initiated Section click pushes history, the coordinator asks the
  mounted fragment whether it has a dirty Draft. If so, a shell-owned dialog
  offers Stay or Discard; Stay leaves both route and UI unchanged.
- A Back/Forward event loads the route from the event state or hash and must not
  push a second history entry.
- The documented Apps Script change handler is post-change and has no cancellation
  method. Back/Forward therefore saves the current Draft and proceeds instead
  of pretending to block the browser event.
- Initial shell startup uses the URL location/hash when present. If it is absent,
  it loads the first accessible page and replaces the initial history entry.
- A bookmarked route never bypasses authentication. The shell restores the route
  only after the session is accepted.
- V1 hashes contain only the Section key. Member IDs, event IDs, QR values,
  credentials, and session tokens must never be encoded in the URL.
- An unknown or unauthorized Section shows an explanatory message and falls
  back to the authenticated user's first accessible Section.

### Client responsibilities

The shell owns:

- `navigateTo(route, options)` as the only page-transition entry point.
- Current route and active navigation state.
- One loading indicator and one recoverable error state.
- `google.script.history.setChangeHandler()` registration.
- A monotonically increasing request id so a slower, older fragment response
  cannot overwrite a newer selection.
- Fragment script mounting and cleanup.
- A Section-controller registry whose controller code is included once in the
  App Document. Controllers expose `mount(root, context)` and `unmount()`;
  fragments do not carry executable scripts.
- One Draft coordinator for registering dirty state, serializing/restoring
  tab-scoped drafts, confirming user-initiated Section changes, and clearing
  drafts on logout.
- Responsive navigation presentation.
- The App state machine and its transition guards. Only the coordinator can
  change startup/authentication/loading/ready/error states.

Each fragment may expose:

```text
mount<Page>(root, context) -> optional cleanup function
```

The coordinator must call the previous cleanup function before replacing the
outlet. Existing `init<Page>()` functions may be adapted to this contract during
implementation, but fragments must not register duplicate global listeners after
repeated navigation.

The target contract is registry-based rather than global-name discovery:

```text
sectionControllers[sectionKey] = {
  mount(root, context),
  unmount()
}
```

Legacy `init<Page>()` globals are migration inputs only and must not remain the
coordinator's production dispatch mechanism.

All `google.script.run` calls must register both success and failure handlers.
The client must display a recoverable error inside the shell when a fragment
load fails; it must not leave a blank outlet or replace the whole document.
A successful RPC returning an empty string or malformed fragment must be treated
as a failed transition. The previous view remains mounted until the replacement
passes basic validation.

### Page fragment contracts

These are not generic interchangeable pages. Each fragment has its own data,
permissions, mutations, and lifecycle requirements.

| Fragment | Client entry point | Server calls currently used | Access and mechanics | Required contract additions |
|---|---|---|---|---|
| `profile.html` | `initProfile()` | `api_getCurrentSession(userId, token)`, `api_getMyEnrollments(userId, token)` | Fully read-only member identity/contact data, QR value, and active enrollment display; all authenticated roles; changes are spreadsheet-only | Scope all DOM lookups to the fragment root; define empty/error states; return a cleanup function even if currently no listeners are registered; never expose a Profile mutation RPC |
| `programs.html` | `initPrograms()` | `api_getAvailablePrograms`, `api_enrollUser`, `api_cancelEnrollment`, proposed assisted-enrollment RPCs | All authenticated roles manage their own enrollment; STAFF/ADMIN may enroll another active Member into any active Program and an active Program Leader may do so only for a Program they lead | Separate self-service and privileged management modes, disable mutation buttons while pending, protect the final server read/check/write with a minimal script lock, refresh data after mutation, and make the mutation envelope consistent with read calls |
| `events.html` | `initEvents()` | `api_getMyEvents`, `api_getEventsForLeader`, `api_getLeaderProgramOptions`, `api_createEvent`, `api_cancelEvent` | Member read view plus Program Leader/staff/admin management view; create and cancel are server-authorized per Program | Specify the create/cancel payload fields, validation, date/time serialization, informational Recurrence Tag, event-list refresh, Draft registration/restoration, and listener cleanup |
| `scanner.html` | `initScanner()` | `api_getLeaderProgramOptions`, `api_getEventsForLeader`, `api_searchMembers`, `api_checkInMember`, `api_getEventAttendance` | Staff/admin or active program leader; manual member search plus optional camera QR scan; check-in is a protected mutation | Load `html5-qrcode` once over HTTPS before initialization, show a manual-search fallback, stop/destroy the camera on unmount, and specify duplicate check-in results |
| `care.html` | `initCare()` / `window.initCare` | `api_getCareDashboard(thresholdDays, token)`, `api_getUserActivityProfile(userId, token)` | STAFF/ADMIN-only church-wide read dashboard with threshold selector and member detail panel; Program Leader grants never authorize it | Enforce the role on every Care RPC, replace `null` authorization/error responses with the canonical RPC envelope, define detail empty/error states, and remove listeners on unmount |

The implementation must maintain this page matrix as the source of truth. Adding
a navigation item is incomplete until its fragment entry point, server RPCs,
role gate, DTOs, loading/error states, mutation behavior, and lifecycle cleanup
are all specified and tested.

### RPC contract

All browser-callable server functions must use a serializable response envelope:

```text
RpcSuccess<T> = { success: true, data: T, message?: string }
RpcFailure<T> = {
  success: false,
  code:
    "AUTH_REQUIRED" |
    "FORBIDDEN" |
    "VALIDATION" |
    "NOT_FOUND" |
    "CONFLICT" |
    "UNAVAILABLE",
  message: string,
  data?: T
}
```

Login and restoration return one shared shape:

```text
AuthenticatedBootstrap = {
  session: {
    userId, name, role, qrCodeString, sessionToken, expiryTimestamp
  },
  sections: Array<{ key, label, capability }>
}
```

`api_loginUser(username, pin)` and
`api_restoreApp(userId, sessionToken)` return this same `data` shape. The shell
must not maintain separate post-login and refresh bootstrap paths.

Rules:

- `data` contains only JSON-safe primitives, arrays, and plain objects.
- `Date`, `Function`, and DOM objects must not cross the `google.script.run`
  boundary. Spreadsheet dates must be converted to a documented string or
  numeric timestamp before returning.
- Church Time is fixed to `Asia/Hong_Kong`. RPC date-only fields use
  `YYYY-MM-DD`, time-only fields use 24-hour `HH:mm`, and exact instants use
  epoch milliseconds. Controllers format exact instants explicitly in the Hong
  Kong timezone rather than inheriting the phone's timezone.
- Sheets may retain native Date cells internally, but repository/DTO functions
  convert every Date before returning. Browser-callable APIs must never return
  raw `Range.getValues()` output.
- Authentication failures use one recognizable failure shape so the shell can
  clear the session and return to the login view without erasing the document.
- Permission failures are distinct from empty successful results.
- `AUTH_REQUIRED` returns to the Authentication View; `FORBIDDEN` renders a
  denied state; `VALIDATION` remains with the form; `NOT_FOUND` explains and
  refreshes; `CONFLICT` reloads authoritative data; and `UNAVAILABLE` preserves
  the current UI with Retry.
- Expected application failures return the envelope through the success handler.
  Unexpected execution exceptions reach `withFailureHandler()` and render a
  generic recoverable error without exposing a raw stack trace.
- Mutations identify whether a repeated request is safe, rejected as duplicate,
  or needs a fresh read. The UI must not guess from a missing `data` property.
- Internal helpers may end in `_`, but browser code must call only public RPC
  functions without that suffix.

### Top-level documents versus fragments

The project must distinguish two HTML formats:

| Format | Files | Required shape |
|---|---|---|
| Top-level HTML Service document | `login.html`, `main.html`, `register.html` during migration | Full document with `<!doctype html>`, `<html>`, `<head>`, viewport metadata, `<base target="_top">`, and server-side includes evaluated before delivery |
| Injected Section fragment | `profile.html`, `programs.html`, `events.html`, `scanner.html`, `care.html` | Markup only; no `<script>`, nested `<html>`, `<head>`, or `<body>`; no independent navigation, lifecycle, or session authority |

`styles.html` is a server-side include, not an independently navigable page.
`app.js.html` must either become the one shared client API/session module or be
removed from the active path; its current `sessionStorage`/`efcc_session` model
must not coexist with the shell's `localStorage`/`efccSession` model.

Each Section controller is a separate `.html` JavaScript include evaluated once
as part of the App Document. Fragment HTML must not contain inline or external
`<script>` tags.

### External assets and IFRAME rules

- Active external assets must use HTTPS. The scanner's current
  `https://unpkg.com/html5-qrcode@2.3.8/...` dependency must have a load-success
  and load-failure path before `initScanner()` uses `Html5Qrcode`.
- External libraries must not be re-added on every fragment transition. The
  shell or a one-time asset loader owns the script promise.
- The deployed app remains an IFRAME HTML Service web app. Browser-history use,
  camera behavior, and external asset loading require a deployed smoke test.
- Any form used inside a fragment must prevent native navigation and submit via a
  controlled `google.script.run` call.

### Expansion contract

New church-management capabilities are added as Sections. A Section is not
complete until it has:

- A stable allowlisted Section key and navigation metadata.
- A fragment mount/unmount lifecycle with loading, empty, error, and denied
  states.
- A domain-specific server service and explicit capability checks.
- JSON-safe request and response DTOs using the shared RPC envelope.
- Server tests, client lifecycle tests, and a deployed phone-width smoke flow.

Sections must not own authentication, session storage, route coordination, or
global error rendering. They must not access Sheets from client code. Server
services access data through domain-specific repository functions so a future
storage migration does not alter client contracts.

The initial deployment is single-church. Multi-tenant organization identifiers,
cross-church administration, and tenant isolation are not introduced without a
separate product decision. Database migration is considered when measured
execution time, Apps Script quotas, concurrent usage, or Sheet volume breaches
an agreed operational threshold; it does not require replacing the App Document.

### Server responsibilities

- `doGet()` remains a narrow bootstrap entry point.
- `api_loginUser(...)` and `api_restoreApp(...)` return the same authenticated
  bootstrap DTO after server-side Session and capability evaluation.
- `api_loadSection(sectionKey, userId, sessionToken)` accepts only the explicit
  Section allowlist.
- `api_loadSection(...)` verifies the Session and Section authorization on the
  server; client menu visibility is only a presentation aid.
- A private underscore-suffixed helper evaluates the allowlisted markup-only
  template only after authentication and authorization succeed.
- The endpoint returns the canonical RPC envelope with
  `data: { section, html }`; denial, unknown key, empty output, and expected
  business failures return structured failure results.
- Menu/page metadata is returned as a serializable DTO with stable page keys.
- Internal helpers that are not intended as browser-callable RPC endpoints use
  the Apps Script underscore convention, for example `loadPage_()`.
- Server-side authorization logic is shared by menu generation and direct page
  loading so those paths cannot drift.

### Responsive layout contract

Phone is the base layout:

- A fixed bottom navigation bar contains the primary accessible sections. It
  must account for `env(safe-area-inset-bottom)`.
- The top bar contains the page title, menu access where needed, and logout or
  account access without relying on a hover state.
- The page outlet scrolls independently and reserves space for the bottom bar.
- Primary controls have a minimum 44px interactive target.
- No page requires horizontal scrolling at a 375px-wide viewport.

Desktop enhancement:

- At the chosen desktop breakpoint, the same navigation model is rendered as a
  side rail or drawer.
- The route state, page keys, authorization, and page lifecycle remain identical
  across breakpoints.
- Desktop styling must not create a second set of route semantics.

### Session and security boundary

- One canonical client session key and expiry format must be used by the shell,
  login page, fragments, and shared client helpers.
- This spec requires a server-validated Session boundary but does not choose
  one-device versus multi-device behavior, token rotation, persistence duration,
  or scanner-device policy. Those decisions belong to a later
  authentication-hardening ticket.
- Shell-navigation implementation must call the existing Session service through
  a narrow validate/restore/logout interface so the later concurrency decision
  does not require rewriting the App Document or Sections.
- Client storage may help restore the UI, but it is not proof of identity or
  permission.
- Every sensitive server RPC revalidates the session and role.
- Dynamic page names, menu labels, and URLs must not be inserted as trusted HTML
  without validation or escaping.
- The implementation must not preserve the reference's unrestricted
  `loadPage(page)` behavior or simple client-only access decision.

### Decision evidence ledger

| Decision | Official support | Minimal implementation proof | Deployed `/exec` proof | Status |
|---|---|---|---|---|
| Stable App Document | HTML Service, `google.script.run`, and IFRAME APIs documented | Pending | Login/logout/failure transition flow pending | Proposed |
| Section hash routing | History `push`/`replace`/`setChangeHandler` and URL `getLocation` documented | Pending | Back/Forward/refresh/denied flow pending | Proposed |
| Session concurrency and hardening | Script Properties and HMAC-SHA256 documented; candidate only | Deferred to authentication-hardening ticket | Deferred | Deferred |

| Dirty-form navigation protection | History API documents pre-navigation `push` and post-change `setChangeHandler`; no cancellation method is documented | Pending: guard, Draft serialization, restore, clear cases | Pending: Section Stay/Discard, Back/Forward, refresh, logout flows | Proposed |
| Markup-only fragments and controller registry | Context7: official HTML best practices document separate JS include files and asynchronous `google.script.run`; browser documentation confirms `innerHTML` scripts do not execute | Pending: registry dispatch, mount/unmount, one-time asset-load tests | Pending: ten transitions per Section with listener and scanner checks | Proposed |
| Authenticated Section loader | Context7: public `google.script.run` functions, legal string/object values, success/failure handlers, private underscore helpers, and HtmlService template evaluation are documented | Pending: allowlist, Session, capability, envelope, and empty-output tests | Pending: allowed, denied, expired, unknown, empty, and thrown-error flows | Proposed |
| Visible App startup state machine | Context7: `doGet()` HTML output, asynchronous `google.script.run`, visible initial content, and success/failure handlers are documented | Pending: transition table and malformed-response tests | Pending: cold load, login, refresh, expiry, thrown error, retry, logout | Proposed |
| Standard RPC failure contract | Context7: normal return values reach success handlers and thrown exceptions reach failure handlers | Pending: parser and UI mapping for six codes plus thrown error | Pending: each code and thrown exception exercised through `/exec` | Proposed |

| Minimal Programs mutation lock | Context7: `getScriptLock`, `tryLock`/`waitLock`, `releaseLock`, and spreadsheet flush-before-release are documented | Pending: lock scope, timeout, release-on-error, duplicate-race tests | Pending: near-simultaneous enroll and cancel calls with direct Sheet verification | Proposed |
| Hong Kong-fixed date/time transport | Context7: `google.script.run` prohibits Date values and the Range reference warns Date values cannot be returned to a web app | Pending: DTO conversion and timezone-format tests across Events, Attendance, Programs, and Care | Pending: create/read/render flows on a device configured outside Hong Kong | Proposed |

| Interactive Event creation | Context7: plain-object RPC payloads and return values are documented; Sheets row writes are supported | Pending: exact-Program capability matrix, one-row creation, Recurrence Tag, and Attendance reference tests | Pending: Program Leader allowed/denied cases plus STAFF/ADMIN and direct Sheet verification | Proposed |

| Event cancellation with Attendance | Context7: related-row reads, status-cell updates, and short script locks are documented | Pending: soft cancel, Attendance conflict, lock scope, and release-on-error tests | Pending: near-simultaneous cancel/check-in with direct Events and Attendance verification | Proposed |

| Quiet duplicate Attendance handling | Context7: a script lock can prevent all users from entering one guarded check/write section simultaneously | Pending: same Event/member QR, manual, retry, and double-tap cases return the existing record without another row | Pending: two devices submit the same Event/member and the Scanner continues without an error/modal or duplicate chime | Proposed |

| Single Attendance critical-section lock | Context7 documents script-wide exclusion, timeout, ownership test, explicit release, and automatic release at termination; it does not document re-entrant acquisition | Pending: no lock-acquiring audit call inside the Attendance lock; status/duplicate check plus Attendance/audit outcome writes share one caller-owned lock | Pending: concurrent scans and cancellation complete without nested-lock timeout, duplicate row, or cancelled-Event check-in | Proposed |

| Attendance enrollment eligibility | Context7: Spreadsheet ranges can be bulk-read into arrays and browser actions invoke server functions asynchronously | Pending: exact Program Active-enrollment check shared by QR and manual paths | Pending: enrolled member allowed; unenrolled, inactive, and different-Program cases denied through direct RPC | Proposed |

| Separate assisted enrollment | Context7: HTML clients can invoke server functions asynchronously; Spreadsheet rows can be read, checked, and written by server code | Pending: Programs-only privileged member search/add flow with exact-Program capability checks and minimal duplicate lock | Pending: STAFF/ADMIN any Program, Leader exact Program, unauthorized cases, then Scanner rescan succeeds | Proposed |

| Limited assisted-enrollment member search | Context7: Sheet grids can be read into arrays and browser-callable functions can return limited plain-object DTOs | Pending: dedicated Program-scoped candidate RPC, Active-only filter, meaningful query, result cap, masked-phone DTO, and direct-call authorization tests | Pending: Leader exact-Program search plus cross-Program denial; STAFF/ADMIN allowed; response inspected for omitted sensitive columns | Proposed |

| Privileged Enrollment soft cancellation | Context7: status cells can be updated, pending Sheet changes can be flushed, and a script lock can guard the final shared-resource update | Pending: exact-Program capability, Active-row recheck, Cancelled status, audit, history preservation, and re-enrollment tests | Pending: STAFF/ADMIN any Program, Leader exact Program, unauthorized denial, then future Scanner denial with prior Attendance unchanged | Proposed |

| Non-blocking Event-clash advisory | Context7: Event rows can be read into arrays and formatted in the spreadsheet timezone; browser RPCs can return structured values | Pending: enrollment independent of Events; optional future/Active-only Hong Kong-time warning tests | Pending: overlapping dated Events still permit enrollment, while any warning names the overlap | Proposed |

| Attendance soft void | Context7: rows can be located and status cells updated; a script lock plus flush/release is documented for shared writes | Pending: exact-Program capability, reason, Active-to-Voided status, audit, counts/history, rescan, and no nested lock | Pending: STAFF/ADMIN any Event, Leader exact Program, unauthorized denial, void then rescan, and direct Sheet inspection | Proposed |

| Attendance-aware Event editing | Context7: selected cells of an existing row can be updated; script locks and flush-before-release are documented | Pending: immutable Event/Program IDs, field allowlist, exact-Program pre-Attendance authority, STAFF/ADMIN reason-required correction, audit, and Cancelled read-only tests | Pending: leader allowed/denied cases before/after Attendance plus direct Sheet and audit inspection | Proposed |

| Care Dashboard access boundary | Context7: web-app deployment controls execution identity, while `google.script.run` invokes named server functions; custom church roles remain an application-level server check | Pending: session plus global-role checks on both Care RPCs and canonical `AUTH_REQUIRED`/`FORBIDDEN` envelopes | Pending: direct RPC calls prove MEMBER and Program Leader denied while STAFF and ADMIN are allowed | Proposed |

| Care summary metrics | Context7: bulk Range reads and in-memory array aggregation are documented, but the product denominator and filtering contract remain undecided | Deferred to a separate Care metrics ticket; omit summary cards meanwhile | Deferred | Deferred |

| Web-app member registration | Context7 supports stable-document forms and public/private server functions, but the feature is not required for the current manual workflow | Deferred; expose Login only and no registration RPC or staging-sheet setup | Deferred | Deferred |

## Structural audit and format conformance

The code-memory graph was indexed against `EFCC-dev` on 2026-07-28 and reported
375 nodes and 432 edges. It is useful for repository structure, but its current
parser did not produce function nodes for the active `.gs` backend or the
JavaScript embedded in the HTML pages; only the desktop reference's
`template-reference/Code.js` backend functions were visible in the graph.
Therefore, the graph is evidence of file/module coverage, not a complete call
graph for this application. The page/API matrix above is supplemented by a
direct source audit. Before relying on graph impact analysis during
implementation, enable `.gs` and embedded-HTML parsing or maintain a generated
page/API manifest.

The current source is close to the official HTML Service composition format,
but it is not yet a consistent production format:

| Area | Current finding | Required decision |
|---|---|---|
| Top-level documents | `login.html` and `register.html` include doctype, viewport, and `<base target="_top">`; `main.html` has the base tag but lacks viewport metadata | Add the responsive document metadata to the authenticated shell |
| Server-side includes | `styles.html` is composed with the documented `createTemplateFromFile(...).evaluate()`/`include()` pattern | Retain this for shared server-rendered assets |
| Fragments | The five page files are body fragments with scripts, which is the correct shape for an outlet | Give each fragment one controlled mount/cleanup entry point; do not depend on repeated script-tag cloning |
| Shell handoff | Browser code calls `loadMainShell_()`, `loadLoginShell_()`, and `loadRegisterPage_()` | Remove these browser calls or expose deliberate public wrappers with failure handlers during migration |
| Client/server RPC | Most APIs return `{success, data, message}`, but care APIs can return `null` for errors | Normalize every browser-facing endpoint to the RPC envelope |
| Session helpers | The shell uses `localStorage/efccSession`, while `app.js.html` uses `sessionStorage/efcc_session` | Keep one active session implementation and retire the other |
| Scanner dependency | `html5-qrcode` is loaded over HTTPS, satisfying the active-content restriction | Load it once, await readiness, handle failure, and stop the camera on unmount |
| Deployment | `ANYONE_ANONYMOUS` plus `USER_DEPLOYING` is compatible with an app-level login, but every sensitive RPC must validate the app session | Treat the manifest as a security boundary, not as user authentication |

### Page mechanics required for a functional release

The page matrix is a contract, not merely a list of files. Each page must have
the following tested flow before it is considered functional:

- **Profile:** authenticate, load current-user data and enrollments, render QR
  and empty states, and recover from either read failure. Profile is fully
  read-only in the first release: name, phone, Username, PIN, Role, Status,
  Member ID, and QR value are changed only in the Users spreadsheet. A
  sheet-side PIN change invalidates the old custom Session and transitions the
  stable App Document visibly to Login on the next validation.
- **Programs:** load available programs, disable the clicked action while the
  mutation is pending, handle duplicate/expired enrollment responses, then
  refresh the list from the server after enroll or cancel. Enrollment and
  cancellation retain their existing business-result semantics; they do not add
  an idempotent `UNCHANGED` result in this spec. A separate management mode lets
  STAFF/ADMIN enroll another active Member into any active Program and lets an
  active Program Leader enroll another active Member only into a Program they
  lead. Scanner never invokes this mutation. Assisted enrollment uses a
  dedicated Program-scoped candidate search rather than the broad Scanner search.
  The server checks the caller's capability for the selected Program before
  searching and again before writing. Results include only Member ID, display
  name, and a masked phone ending, are Active-only, query-limited, and capped;
  Programs never returns full phone numbers or an unfiltered roster. The same
  management mode may soft-cancel another member's Active enrollment:
  STAFF/ADMIN for any Program and an active Program Leader only for a Program
  they lead. Cancellation changes status to `Cancelled`, is audited, preserves
  all Attendance and Enrollment history, and never deletes a row. Re-enrollment
  creates a new Active enrollment row. A dated Event clash never blocks Program
  membership. An optional advisory may list future Active overlaps in Hong Kong
  time, but enrollment succeeds and remains functional when Events is empty or
  unavailable.
- **Events:** branch member and leader/staff views from server-authorized data;
  validate program, name, date, time, type, and recurrence; serialize dates
  consistently; refresh after create/cancel; and show mutation failures without
  losing the form state. The create form registers a Draft adapter with the
  shell, restores its tab-scoped Draft after Back/Forward or refresh, and clears
  it after successful creation or explicit discard.

### Interactive Event creation contract

An interactively created Event is one concrete attendance occurrence. Its payload
contains `programId`, `eventName`, Hong Kong `eventDate` (`YYYY-MM-DD`),
`timeSlot` (`HH:mm`), `eventType`, and `recurrenceTag` (`NONE`, `WEEKLY`, or
`MONTHLY`) plus the existing Session credentials.

The server creates the Event only when the authenticated actor is STAFF, ADMIN,
or has an active Program Leader grant for that exact Program. Client menu or
form visibility is not authorization. The resulting Event belongs to that
Program, has its own Event ID and status, and is the Event ID used by Attendance.

The Recurrence Tag is informational metadata only. Interactive creation always
writes one Event row; the tag does not generate a series, invoke the monthly
generator, link occurrences, or change cancellation scope. Any future recurrence
automation or series management requires a separate specification and deployment
proof.

### Event editing contract

`Event_ID` and `Program_ID` never change. Before an Active Event has active
Attendance, STAFF/ADMIN or an active Program Leader for its exact Program may
edit name, Hong Kong date/time, type, and Recurrence Tag. Once active Attendance
exists, only STAFF/ADMIN may correct those fields and must provide a reason.
Cancelled Events are read-only. Every update rechecks Event status, Attendance,
and capability under the minimal final lock and audits old/new values, actor,
and reason. No edit propagates to another Event through Recurrence Tag.

### Event cancellation and Attendance integrity

Cancellation is a soft Event status change and never deletes Event or Attendance
rows. STAFF, ADMIN, or an active Program Leader for the Event's exact Program
may request cancellation. If active Attendance references the Event, cancellation
returns `CONFLICT` and leaves the Event active.

Cancellation and check-in share one minimal script lock around only the final
authoritative Event-status/Attendance recheck and status/write operation. Normal
validation and display reads happen outside the lock. If cancellation wins, the
locked check-in recheck rejects the cancelled Event; if check-in wins, the locked
cancellation recheck detects Attendance and rejects cancellation. The lock is a
safety boundary for double taps, retries, or accidental overlap, not a general
transaction framework.
- **Scanner:** load event choices, support manual search even when camera access
  is denied, prevent duplicate check-ins, show attendance refresh results, and
  stop camera/timer/listener resources whenever the fragment unmounts. A repeat
  of the same Event/member pair is a quiet successful no-change outcome: return
  the existing Attendance identity, write no second row, show no error/modal or
  extra success chime, and remain ready for the next scan. The audit log may
  retain the duplicate attempt for traceability. `NOT_ENROLLED` names the
  required Program and suggests using Programs; it does not enroll, redirect,
  or write Attendance. After a separate assisted enrollment, a new scan follows
  the normal check-in path. The active roster also supports a reason-required
  **Void Check-in** action: STAFF/ADMIN for any Event and an active Program
  Leader only for an Event in a Program they lead. It changes status to
  `Voided`, audits the correction, preserves history, removes it from active
  counts, and permits a later new scan; it never deletes the row.
- **Care:** load the thresholded dashboard, distinguish an empty dashboard from
  an authorization or data error, open/close a member detail view, and clean up
  selector, row, and close-button listeners on unmount. Both Care RPCs validate
  the Session and global Role on the server. Only STAFF and ADMIN are allowed;
  a Program Leader grant, including one for a member shown in the result, never
  grants Care access. Navigation visibility is only a presentation convenience.
  Care considers active members with at least one active Program enrollment.
  The rollout assumes every active member is eventually assigned to a Program;
  no-enrollment records are data-coverage gaps rather than a second Care queue.
  Aggregate summary cards and rates are deferred to a separate Care metrics
  ticket and must be omitted meanwhile; the inactive-member roster remains in
  scope.

The release checklist must exercise each flow at phone width and repeat every
transition at least ten times to expose duplicate listeners, stale responses,
and leaked camera resources.

### Minimal Programs mutation lock

`api_enrollUser` and `api_cancelEnrollment` use
`LockService.getScriptLock()` only around the final authoritative enrollment
re-read, duplicate/conflict decision, and append/update. Validation and unrelated
data preparation occur before acquisition. The lock is released in `finally`,
with pending spreadsheet writes flushed first. A lock-acquisition timeout returns
`UNAVAILABLE`; existing success, duplicate/conflict, and not-found semantics are
otherwise unchanged.

Locking only `appendRow()` or `setValue()` is insufficient because two requests
could both make a stale decision before entering the serialized write. The
deployed proof sends near-simultaneous requests and verifies the resulting Sheet
rows directly.

## Implementation sequence

1. **Stabilize the document boundary:** stop browser calls to private shell
   functions and remove whole-document replacement from login/logout/session
   transitions. Prove that a failed RPC leaves a visible recovery state.
2. **Unify the client runtime:** choose one session key/expiry format and one
   `google.script.run` wrapper that always supplies success/failure handling,
   timeout/retry policy, and authentication-failure handling.
3. **Close the authorization boundary:** make `loadPage(page)` validate the
   session and accessible-page policy on the server, independently of menu
   visibility.
4. **Build the shell coordinator:** centralize route state, fragment loading,
   request-id protection, mount/unmount cleanup, and safe error rendering.
5. **Migrate pages in dependency order:** profile, programs, events, scanner,
   then care. Complete each page's mechanics checklist and RPC DTO contract
   before exposing its navigation item.
6. **Fix asset and responsive behavior:** add viewport metadata to `main.html`,
   implement phone bottom navigation and safe-area spacing, then retain the
   desktop rail as a responsive presentation of the same routes. Add a one-time
   scanner asset loader and camera teardown.
7. **Add history navigation:** only after ordinary login, reload, logout, and
   fragment transitions pass; then verify push/replace/pop behavior in the
   deployed IFRAME web app.
8. **Run release verification:** server, client, integration, phone/desktop,
   and deployed smoke tests from the testing plan, including direct denied-page
   calls and repeated navigation.

## Acceptance criteria

1. At a 375px-wide viewport, the authenticated shell shows phone navigation,
   keeps the outlet usable above it, and produces no horizontal scrollbar.
2. At the selected desktop breakpoint, the same page keys are available through
   a side rail/drawer without changing route or authorization behavior.
3. Navigating through all five page keys updates the outlet without replacing the
   top-level document.
4. A sequence such as `profile -> programs -> events`, followed by Back twice,
   displays `programs` and then `profile`; Forward restores the later pages.
5. Initial route state is restored after an authenticated reload when the route
   is present in the URL location/hash. An unauthenticated request still reaches
   login first.
6. A direct server call for an allowlisted but unauthorized page is rejected,
   even if the client manually requests it.
7. A request for a page outside the allowlist is rejected without evaluating a
   template supplied by the caller.
8. A failed fragment request leaves the shell mounted, shows a recoverable error,
   and permits a retry or another navigation.
9. A failed login, logout, session-restore, or shell-load RPC never produces a
   blank document; the existing view remains visible with an actionable error.
10. No browser code calls an Apps Script function whose name ends with `_`.
11. Repeating navigation between the same two pages at least ten times does not
   multiply page-level event handlers or duplicate visible content.
12. A slower response for an older navigation cannot overwrite the latest route.
13. Login, shell, fragments, and shared client helpers use the same session key
   and expiry representation.
14. The template-reference directory remains reference-only and is not deployed.
15. Leaving a dirty Event form through a Section control shows a shell-owned
    Stay/Discard dialog before history changes; Stay preserves the form and URL.
16. Back/Forward or refresh while the Event form is dirty restores its Draft on
    return. Successful submission, explicit discard, and logout clear it so a
    later user of the same browser tab cannot see the prior Draft.
17. Production fragment responses contain no `<script>` tags. All five Section
    controllers are registered once by the App Document and remain callable
    after at least ten mount/unmount cycles without duplicate listeners.
18. The QR scanner dependency is requested at most once per App Document,
    reports load failure inside the shell, and releases camera resources whenever
    Scanner unmounts.
19. Cold load, login, restoration, Section loading, expiry, logout, malformed
    response, and thrown RPC failure always leave one visible App state. No test
    observes an empty body or an empty unlabelled outlet.
20. Login and Session restoration consume the same authenticated-bootstrap DTO
    and produce the same accessible Sections and initial-route behavior.
21. Every expected failure returned by a browser-callable API uses one of the six
    documented codes and reaches the correct visible shell or form state. A
    thrown exception uses the failure handler and exposes no raw stack trace.
22. Two near-simultaneous enrollment requests cannot create two active rows for
    the same Member and Program. The lock covers the final read/check/write,
    releases on every branch, and a timeout produces a recoverable
    `UNAVAILABLE` result.
23. No browser-callable API returns a raw Date. Date-only and time-only values
    follow the Church Time convention, and exact instants render in Hong Kong
    time even when the test device uses another timezone.
24. Interactive creation writes exactly one Event under the selected Program.
    STAFF, ADMIN, or an active Program Leader for that Program may create it;
    another Member or a leader of a different Program is denied. Its Recurrence
    Tag creates no additional rows, and Attendance can target its Event ID.
25. Event Cancellation never deletes rows and is rejected with `CONFLICT` when
    active Attendance exists. A near-simultaneous cancellation/check-in produces
    either a cancelled Event with no new Attendance or an active Event with the
    new Attendance, never both a cancelled Event and a newly accepted check-in.
26. Both Care APIs validate the Session and global Role server-side. Invalid or
    expired Sessions return `AUTH_REQUIRED`; MEMBER and Program Leader callers
    return `FORBIDDEN`; STAFF and ADMIN callers may receive Care data. These
    outcomes use the standard envelope rather than `null`, including when a
    caller invokes either RPC directly instead of navigating through the menu.
27. QR scan, manual check-in, retry, double tap, and two-device submissions for
    the same Event/member pair produce at most one active Attendance row. A
    duplicate returns the existing record as `success: true` with
    `data.created: false`; Scanner shows no error/modal or extra success chime
    and remains ready. Two different members may be scanned concurrently, with
    only each final lock-protected check/write section serialized.
28. Attendance accepts only an Active member with an Active enrollment in the
    Event's exact Program. QR and manual paths enforce the same server rule;
    an unenrolled member receives `NOT_ENROLLED` and no Attendance row. Client
    search filtering alone never authorizes the mutation.
29. Scanner never creates or changes Enrollment. `NOT_ENROLLED` identifies the
    Event's Program without writing Attendance. In Programs, STAFF/ADMIN may
    enroll another Active member into any Active Program and an active Program
    Leader may do so only for a Program they lead. After enrollment, a new scan
    succeeds normally; direct unauthorized assisted-enrollment RPC calls are
    rejected server-side.
30. Assisted-enrollment candidate search requires a selected Program and a
    meaningful query. The server verifies exact-Program capability before
    searching and returns a capped Active-member DTO containing only Member ID,
    display name, and masked phone ending. A Program Leader cannot search through
    a Program they do not lead; no Programs response exposes full phone numbers
    or an unfiltered church roster.
31. Privileged Enrollment cancellation is available only in Programs.
    STAFF/ADMIN may cancel an Active enrollment in any Program; an active
    Program Leader may cancel only in a Program they lead. It writes
    `Cancelled` under a minimal final lock, writes an audit outcome, never
    deletes history, leaves past Attendance unchanged, and causes future
    check-in to return `NOT_ENROLLED` until a new Active enrollment is created.
32. A same-date/time Event overlap never rejects Program enrollment. If the
    optional advisory is implemented, it considers only future Active Events in
    Hong Kong time and names the overlap; enrollment still succeeds. Missing or
    empty Events data cannot prevent enrollment.
33. An authorized actor may void an Active Attendance record with a required
    reason: STAFF/ADMIN for any Event and an active Program Leader only for an
    Event in a Program they lead. The minimal final lock changes status to
    `Voided` and writes the audit outcome without nested lock acquisition. The
    row remains in history, is excluded from active counts and Event-cancellation
    conflicts, and a later scan can create one new Active Attendance row.
34. Event editing preserves `Event_ID` and `Program_ID`. Before active Attendance,
    STAFF/ADMIN or an active exact-Program Leader may edit only name, Hong Kong
    date/time, type, and Recurrence Tag. After active Attendance, only
    STAFF/ADMIN with a reason may correct those fields. Cancelled Events reject
    edits, all changes are audited, and no Recurrence Tag edit affects another
    Event.
35. Profile is fully read-only and exposes no browser-callable mutation for
    name, phone, Username, PIN, Role, Status, Member ID, or QR value. After an
    administrator changes PIN in the Users sheet, the old Session returns
    `AUTH_REQUIRED` and the existing App Document shows Login without a white or
    empty page.
36. The first release exposes Login only while unauthenticated: no Register
    button/view, browser-callable registration mutation, `Registration_Requests`
    sheet, or registration setup script is deployed. Existing manual Users-sheet
    member creation remains outside this web-app scope.

## Testing plan

| Layer | Coverage | Minimum evidence |
|---|---|---:|
| Server unit | Page allowlist, session check, role/page denial, DTO shape | 8 cases |
| Client unit | Route parsing, push vs pop behavior, stale response guard, cleanup | 10 cases |
| Integration | Login, shell bootstrap, fragment load, RPC failure, logout | 5 flows |
| Browser smoke | Phone viewport, desktop viewport, Back/Forward, reload, denied page | 5 flows |
| Deployment smoke | Deployed Apps Script web app with IFRAME HTML Service | 1 authenticated run |

The deployed smoke test is required because local JavaScript tests cannot prove
that `google.script.history`, `google.script.run`, and the deployed HTML Service
iframe behave together.

The routing deployment gate must exercise login followed by
`profile -> programs -> events`, Back twice, Forward twice, refresh at
`/exec#/events`, session expiry while a Section hash is present, and direct
entry with both an unknown and unauthorized Section key.

## Files reference

| File | Expected responsibility |
|---|---|
| `src/gas/Code.gs` | Narrow web-app bootstrap, public authenticated Section endpoint, and private template renderer |
| `src/gas/auth.gs` | Canonical session, role, and accessible-page validation |
| `src/gas/main.html` | Authenticated shell, responsive navigation, route coordinator |
| `src/gas/app.js.html` | Consolidated client API/session helpers; remove conflicting legacy behavior |
| `src/gas/*-controller.html` | One-time Section controller includes with explicit mount/unmount lifecycle |
| `src/gas/profile.html` | Page fragment plus lifecycle entry point |
| `src/gas/programs.html` | Page fragment plus lifecycle entry point |
| `src/gas/events.html` | Page fragment plus lifecycle entry point |
| `src/gas/scanner.html` | Page fragment plus lifecycle entry point |
| `src/gas/care.html` | Page fragment plus lifecycle entry point |
| `src/gas/template-reference/*` | Read-only desktop reference; never a production dependency |
| `docs/adr/0008-restart-from-template-1rl1o1ngg.md` | Historical template-derived decision; shell-handoff and no-history clauses superseded by ADR-0010 |
| `docs/adr/0010-stable-app-document-and-expandable-sections.md` | Stable App Document, Section expansion, and storage-migration boundary |

## Rollback plan

This specification makes no runtime changes. If implementation is later started
and fails deployment smoke tests, revert the shell/coordinator changes as one
commit and retain the existing fragment implementation. Do not delete the
template reference; it remains a read-only comparison fixture.

## Context7 verification

Verified against the official Google Apps Script documentation retrieved through
Context7 on 2026-07-28:

| Requirement | Result | Evidence and remaining condition |
|---|---|---|
| Push a logical page into browser history | **Supported** | `google.script.history.push(state, params, hash)` is documented for IFRAME web apps |
| Replace the initial route entry | **Supported** | `google.script.history.replace(state, params, hash)` is documented |
| React to Back/Forward | **Supported** | `google.script.history.setChangeHandler()` receives `state` and `location` |
| Restore route hash/parameters on shell boot | **Supported** | `google.script.url.getLocation()` exposes `hash`, `parameter`, and `parameters` |
| Load HTML fragments from Apps Script | **Supported** | `google.script.run` invokes server functions asynchronously and can return values to success handlers |
| Keep the shell alive on RPC failure | **Supported** | Official communication guidance provides `withFailureHandler()` |
| Compose shared HTML with server-side includes | **Supported** | Official templated-HTML guidance documents `createTemplateFromFile(...).evaluate()` and an `include()` helper |
| Use `<base target="_top">` in top-level HTML Service documents | **Required format** | Official HTML Service guidance uses the base target so links and form navigation do not remain trapped in the iframe |
| Pass page DTOs through `google.script.run` | **Supported with constraints** | Parameters and return values must be JSON-safe; `Date`, `Function`, and DOM objects are not valid RPC values |
| Load active external content | **Supported with constraints** | IFRAME restrictions require HTTPS for active external content; scanner loading still needs an application-level readiness and failure path |
| Deploy as an anonymous web app with app-level auth | **Supported with constraints** | The web-app manifest supports `ANYONE_ANONYMOUS` and `USER_DEPLOYING`; every sensitive function must enforce the app session and role |
| Prevent an older response from winning a race | **Application responsibility** | Apps Script calls are asynchronous; the route coordinator must add request-id protection |
| Use the history API in this project | **Conditionally supported** | The deployed web app must remain an IFRAME HTML Service web app; the API is not for add-on sidebars/dialogs |
| Guarantee reload/deep-link behavior | **Not proven by documentation alone** | Requires a deployed browser smoke test with an authenticated session and a preserved hash |
| Invoke server functions ending in `_` from the browser | **Unsupported** | Official communication guidance treats trailing-underscore functions as private; the current `loadMainShell_()`, `loadLoginShell_()`, and `loadRegisterPage_()` calls are a confirmed source-level blocker |

Primary references:

- [Google Apps Script history API](https://developers.google.com/apps-script/guides/html/reference/history)
- [Google Apps Script URL API](https://developers.google.com/apps-script/guides/html/reference/url)
- [Google Apps Script client/server communication](https://developers.google.com/apps-script/guides/html/communication)
- [Google Apps Script HTML Service best practices](https://developers.google.com/apps-script/guides/html/best-practices)
- [Google Apps Script templated HTML](https://developers.google.com/apps-script/guides/html/templates)
- [Google Apps Script HTML restrictions](https://developers.google.com/apps-script/guides/html/restrictions)
- [Web app manifest settings](https://developers.google.com/apps-script/manifest/web-app-api-executable)

Conclusion: fragment navigation and history are implementable with the current
Apps Script platform, but the current whole-document login handoff is not safe to
extend. The first implementation milestone must remove the private-RPC mismatch
and establish a stable document boundary before adding Back/Forward behavior.
The deployed `appsscript.json`/HTML Service configuration and the browser smoke
tests above remain required before the architecture is treated as production-ready.
