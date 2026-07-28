# Stable App Document and Expandable Sections

**Status:** Proposed — official API support verified; deployed proof pending  
**Date:** 2026-07-28  
**Supersedes:** ADR-0008's whole-document login handoff and prohibition on URL history

EFCC will use one stable top-level Apps Script HTML Service document for the
unauthenticated view, authenticated shell, navigation, and recoverable errors.
Login, logout, session restoration, and Section transitions change mounted DOM
content and never replace the browser document with
`document.open()`/`document.write()`/`document.close()`. Each church-management
Section is registered through a stable key and owns a fragment lifecycle,
server service, authorization policy, and serializable RPC contracts, while the
App Document alone owns session state, navigation, history, and shared error
handling. This retains ADR-0008's Apps Script deployment, server-rendered
fragments, phone bottom navigation, and desktop side rail while removing the
blank-document failure boundary and allowing new Sections to be added without
changing authentication or navigation.

Fragments contain markup only. Client behavior lives in separate Apps Script
HTML include files that are evaluated once into the App Document and registered
as Section controllers with `mount(root, context)` and `unmount()` lifecycle
methods. Section transitions never clone or re-execute scripts extracted from
`innerHTML`. Large optional dependencies, including the QR scanner library, use
a shared on-demand asset loader that resolves at most once per App Document.

The browser obtains Section markup through one public
`api_loadSection(sectionKey, userId, sessionToken)` endpoint. That endpoint
normalizes and allowlists the Section key, validates the existing Session,
recalculates the Member's accessible Sections on the server, and only then calls
a private template-rendering helper. It returns the shared serializable RPC
envelope containing the canonical Section key and markup. Browser code never
calls template functions, the legacy `loadPage()`, or an underscore-suffixed
helper directly.

App startup follows an explicit visible state machine. `doGet()` renders the App
Document in `BOOTING`; the client then reaches `SIGNED_OUT`,
`AUTHENTICATING`/`RESTORING`, `LOADING_SECTION`, `READY`, or
`RECOVERABLE_ERROR`. Every asynchronous success, business failure, and thrown
failure terminates in a rendered state. Login and `api_restoreApp(userId,
sessionToken)` return the same authenticated-bootstrap DTO containing the
canonical Session view and accessible Section descriptors, so login and refresh
cannot drift into separate shell-initialization paths.

The first release targets one church rather than multi-tenant operation. Sheet
access stays behind domain-specific server repositories, uses batched operations
and caching where appropriate, and never occurs directly from a fragment. This
keeps a later move of selected repositories to a database possible without
replacing the App Document or Section contracts. Migration will be triggered by
measured execution-time, quota, concurrency, or data-volume pressure rather than
by speculative scale.

Section navigation uses the documented Apps Script History and URL APIs. The
canonical visible form is `/exec#/<section-key>`; history state mirrors the same
allowlisted Section key. An authenticated refresh restores that Section, while
an unauthorized or unknown key produces an explanatory message and falls back
to the first accessible Section. V1 Section Links contain no record identifiers,
QR values, credentials, or session tokens. This decision remains proposed until
Back, Forward, refresh, session-expiry, and denied-Section flows pass against a
deployed `/exec` IFRAME web app.
