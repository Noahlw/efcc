# Spec 073 — HtmlService Specification Reconciliation Matrix

**Status:** Proposed — decision matrix for inherited ADR/spec set against
ADR-0017 (repo/rendering/Cloudflare topology) and ADR-0018 (HTTP contract).
**Date:** 2026-08-03
**Authoritative source for classifications:** issue [#130](https://github.com/Noahlw/efcc/issues/130) resolved comment (full body and headline summary).
**Per-source read status:** every `docs/adr/*.md` and `docs/specs/*.md` path listed
below was read in full for this restoration. Specs that exist only as GitHub
issues (not as files in `docs/specs/`) are explicitly marked **Issue-only** and
their classification was drawn from issue references in the inherited ADR/spec
set, not from a local file read.

> Note on ADR-0017 and ADR-0018: these are the successor authority documents
> restored at `docs/adr/0017-*` and `docs/adr/0018-*`. They are excluded from
> the inherited-source rows below; the classifications use their resolved
> decisions from issues [#127](https://github.com/Noahlw/efcc/issues/127) and
> [#128](https://github.com/Noahlw/efcc/issues/128). This matrix does not
> supersede or substitute for either ADR.

---

## 1. Scope of this matrix

Inherited sources inventoried in the repository on the `feat/qr-scan` branch:

- `docs/adr/0001` … `docs/adr/0016` — 17 ADR entries (the two ADR-0015 files are separate records).
- `docs/specs/000` … `docs/specs/009` — 10 domain specs.
- `docs/specs/067` … `docs/specs/072` — 8 acceptance-plan files (the `067`
  and `071` numbers each have two files: `067-follow-up-section-rpcs.md`,
  `067-role-nav-acceptance-plan.md`, `068-…`, `069-…`, `070-…`,
  `071-accessibility-…`, `071-database-schema.md`, `072-…`).
- Issue-only sources referenced by the inherited ADR/spec set and by
  issue #130: issue [#50](https://github.com/Noahlw/efcc/issues/50) and
  issue [#93](https://github.com/Noahlw/efcc/issues/93). Neither exists as
  a `docs/specs/050-…md` or `docs/specs/093-…md` file in this checkout;
  their classifications rely on the cross-references in
  ADR-0015 (`spec #93`), spec 070 (`#53`, `#43`), and the issue #130
  resolved comment (which lists `#93` as one of the two GitHub-issue specs).

The matrix excludes ADR-0017/ADR-0018 because they are successor authority
documents, and excludes ADR-0019 because it is the downstream CF2 decision
produced after this matrix. ADR-0019 may consume this matrix, but this matrix
does not classify or validate it. Any other ADR/spec file that does not exist
in `docs/adr/` or `docs/specs/` is excluded except for the explicitly
identified issue-only sources.

---

## 2. Classification rubric

| Code | Meaning |
|---|---|
| **PRESERVE** | The clause(s) carry forward unchanged into the React/Cloudflare era because they describe backend/domain authority, data, or transport-agnostic mechanics. |
| **AMEND** | Mixed: some clauses PRESERVE (domain substrate, capability, eligibility), others SUPERSEDE (transport, rendering, UI chrome). The rationale names which is which. |
| **SUPERSEDE** | Wholesale replaced by ADR-0017 / ADR-0018 (or by another restored decision such as #136). Rationale identifies the successor. |
| **SUPERSEDE-flagged pending #136** | The mechanism is contingent on issue [#136](https://github.com/Noahlw/efcc/issues/136) (scanner inline/popup, Feature CF5). This matrix flags the dependency but does not decide #136. |

A document is classified at the **document** level for navigation; clauses
that survive migration are then enumerated under **Carry-forward clauses**
so reviewers do not have to re-read the source file to confirm the
domain substrate is intact.

---

## 3. ADRs (inherited)

| ADR | Path | Class | Rationale |
|---|---|---|---|
| ADR-0001 | `docs/adr/0001-google-sheets-as-database.md` | **PRESERVE** | Database choice (Google Sheets, header-name lookup, soft-delete pattern, single spreadsheet, `CacheService`) is transport-agnostic. ADR-0018's HTTP envelope forwards DTOs; it does not move Sheets off Apps Script. |
| ADR-0002 | `docs/adr/0002-pin-based-authentication.md` | **PRESERVE** | Username + 4-digit PIN, account-status lifecycle, ambiguous-error discipline, and `normalizePin_` semantics are backend domain authority. Only the client-side "session-less" note (`google.script.run` runs as the deployer) is replaced by ADR-0018's session-token transport — the rest of the document carries forward. |
| ADR-0003 | `docs/adr/0003-google-script-run-rpc.md` | **SUPERSEDE** | The entire `google.script.run` / `withSuccessHandler` / `withFailureHandler` transport is replaced by ADR-0018's `POST /api/v1/rpc` plus RFC 9457 Problem Details. The "Proposed amendment" structured-codes clause in this ADR (`AUTH_REQUIRED`, `FORBIDDEN`, `VALIDATION`, `NOT_FOUND`, `CONFLICT`, `UNAVAILABLE`) is the **direct precedent** for ADR-0018's `RPC_CODES` carry-forward on the `code` extension — same vocabulary, same six codes, now carrying over verbatim. |
| ADR-0004 | `docs/adr/0004-monthly-recurring-event-generation.md` | **PRESERVE** | Recurring event generation, hardcoded program list, monthly time-driven trigger, `setValues` bulk write, and Event_ID format are server-only mechanics. UI presentation (and any per-month config) changes, but the ADR's contract carries forward. |
| ADR-0005 | `docs/adr/0005-role-based-access-control-and-pin-auth.md` | **PRESERVE** | ADR-0005 remains a clean inherited authority record for PIN/RBAC semantics; ADR-0006's later role-model amendment is already part of the repository's decision history. The React migration does not reclassify either document or move its domain authority into the browser. |
| ADR-0006 | `docs/adr/0006-admin-capability-matrix.md` | **PRESERVE** | The 3-tier role hierarchy, the capability matrix, the Program Leader model, the `Program_Leaders` join-sheet, the `Pending` member-approval flow, and the original 8-column `Audit_Log` shape are all server/domain authority. ADR-0019 amends the `Program_Leaders` schema lock-step with ADR-0013. Audit_Log schema is superseded by ADR-0015-lock, not by ADR-0006's role model. |
| ADR-0007 | `docs/adr/0007-vanilla-multipage-html-service.md` | **AMEND** | The principle that "no framework is required for EFCC's web app" survives as an architectural preference (ADR-0017 picks React for maintainability, not because vanilla was wrong for EFCC's scope). The clause "5 MB GAS project limit" and "single inlined HTML file via `HtmlService`" are superseded by ADR-0017's Next.js static export on Cloudflare. The "Apps Script native surface" / "official-docs vanilla-first" rationale is moot under React. |
| ADR-0008 | `docs/adr/0008-restart-from-template-1rl1o1ngg.md` | **SUPERSEDE** | The template-derived SPA shell + `document.open()` / `document.write()` / `document.close()` document handoff is replaced by ADR-0017's Cloudflare-hosted Next.js + same-origin Worker proxy. The bulletproof-baseline exit criteria and the cherry-pick expansion list lose their target (no `src/gas/` under the new architecture). The login-flow pattern (Username + PIN, RBAC-filtered chrome, server-rendered fragments) re-emerges in spec 074's shell contract rather than this ADR. |
| ADR-0009 | `docs/adr/0009-audit-log-write-pattern.md` | **PRESERVE** | ADR-0009's own supersession note points to ADR-0015-lock for the current single-lock audit contract. Its non-repudiation principle and the rule that audit failures must not be silently swallowed remain preserved through that successor; the React migration does not alter this authority chain. |
| ADR-0010 | `docs/adr/0010-stable-app-document-and-expandable-sections.md` | **AMEND** | The "one stable top-level document" model is replaced by ADR-0017's Cloudflare-hosted Next.js shell (one stable document per Next.js page, not one HtmlService document). The Section-registry concept (stable key, capability-gated, server-rendered fragments) is the **direct precedent** for spec 074's section model — same shape, different transport. The clause "Large optional dependencies, including the QR scanner library, use a shared on-demand asset loader" is superseded for camera by ADR-0015-camera's external-origin flow. |
| ADR-0011 | `docs/adr/0011-one-active-session-per-member.md` | **PRESERVE** (as deferred) | The ADR is `Deferred — not part of the shell-navigation baseline` and is unaffected by the React migration. Session durability, HMAC, `EFCC_SESSION_SALT`, and replacement-on-login semantics are transport-agnostic. ADR-0018's header-based session transport (`Authorization: Bearer <sessionToken>` + `X-Efcc-Session-Id`) is compatible with this model; it is the wire format, not the concurrency policy. |
| ADR-0012 | `docs/adr/0012-e2e-testing-strategy.md` | **AMEND** | The Playwright storage-state pipeline is transport-agnostic and PRESERVES. The headless-browser auth blocker it documents — `google.script.run` failing in a headless context because the iframe routes RPC through a Google sign-in wall — **does not exist** under ADR-0018: a headless HTTP client can set `Authorization` and `X-Efcc-Session-Id` directly, no iframe sign-in required. Storage-state secrets remain useful for any browser-driven smoke flow that does require a Google account (none currently identified). |
| ADR-0013 | `docs/adr/0013-google-sheets-database-structure.md` | **PRESERVE** | The canonical Sheet inventory, column-by-column definitions, code-to-DB coupling map, and the `Audit_Log` reconciliation pointer to ADR-0015-lock are all server-side authority. This ADR is the source of truth for what header names exist on every tab; React reads through the same Apps Script RPCs and gets the same DTO shapes. |
| ADR-0014 | `docs/adr/0014-precheck-and-precommit-workflow.md` | **PRESERVE** | The pre-commit typecheck, multi-config `tsc`, and split `precheck.yml` + `e2e.yml` workflows are transport-agnostic dev-process mechanics. The new `web/` TypeScript surface inherits the same gate. |
| ADR-0015 (camera) | `docs/adr/0015-external-camera-origin-for-qr-scanner.md` | **SUPERSEDE-flagged pending #136** | The external-HTTPS-origin + `getUserMedia` + `postMessage` mechanism exists solely because HtmlService's IFRAME blocks `getUserMedia()`. A Cloudflare-hosted page has no such restriction. The trust-boundary clauses — opaque `scannedCode`, server-side resolution in `api_qrCheckIn`, `event.origin === "https://noahwong-hue.github.io"` allowlist — carry forward regardless of #136's outcome. The mechanism itself (popup+postMessage bridge) is **flagged for replacement** by issue [#136](https://github.com/Noahlw/efcc/issues/136); this matrix does not decide #136. |
| ADR-0015 (lock) | `docs/adr/0015-single-lock-mutation-and-audit-contract.md` | **PRESERVE** | `withScriptLock_`, the five-value `Outcome` vocabulary (`SUCCESS`/`DUPLICATE`/`CONFLICT`/`DENIED`/`FAILED`), the natural-key idempotency rule, the partial-failure posture (Cloud Logging breadcrumb before `Audit_Log.appendRow`), and the final `Audit_Log` schema are backend authority. ADR-0019 carries these into CF2 verbatim. Status: `Proposed` until deployed `/exec` proof, unchanged by the React migration. |
| ADR-0016 | `docs/adr/0016-operational-attendances-sheet-migration.md` | **PRESERVE** | The manual archive + `setupAttendancesSheet_` procedure and the seven operational column headers (`Attendance_ID`/`Event_ID`/`User_ID`/`CheckIn_Time`/`CheckIn_Method`/`CheckIn_By`/`Status`) are backend authority. The application reads only the new tab. |

### ADRs — carry-forward clauses (high-confidence domain substrate)

These clauses are explicitly preserved regardless of any UI/transport change:

- **Database & schema:** Sheets as primary store, header-name lookup, soft-delete, sheet constants in repository files, `Audit_Log` per ADR-0015-lock (0001, 0013).
- **Auth:** Username + 4-digit PIN, `normalizePin_`, ambiguous-error discipline, account-status lifecycle (0002).
- **RBAC & Program Leader:** 3-tier `ADMIN`/`STAFF`/`MEMBER` model, capability matrix, Program Leader scoped to `(user, program)` pair, `Must be Active` predicate on `Program_Leaders` row (0005, 0006, 0019).
- **Recurring events:** monthly time-driven generator, hardcoded program list, Event_ID format, bulk `setValues` (0004).
- **Audit:** `withScriptLock_` lifecycle, five-value `Outcome` vocabulary, natural-key idempotency, Cloud Logging breadcrumb before audit append (0015-lock).
- **Permissions mutations:** query-driven reads, `grantProgramLeader` / `revokeProgramLeader` actions, six-column `Program_Leaders` schema preserved (0019).
- **Session:** HMAC token, `EFCC_SESSION_SALT` deployment secret, replacement-on-login semantics (0011, deferred but compatible).
- **CI/precheck:** multi-config `tsc`, Playwright storage-state pipeline (0012, 0014).

---

## 4. Domain specs (inherited)

| Spec | Path | Class | Rationale |
|---|---|---|---|
| Spec 000 | `docs/specs/000-efcc-system-spec.md` | **AMEND** | The user stories and migration narrative (`TypeScript React WebApp`, Vite + React 19 + `vite-plugin-singlefile`, single bundled `index.html` via `HtmlService.createHtmlOutputFromFile('index')`) are **superseded** — React survives but the bundling target moves from Apps Script `HtmlService` to ADR-0017's Cloudflare-hosted Next.js static export. The architectural commitments (`localStorage.setItem('efcc_session', …)`, server-authoritative role + HMAC token verification, `vite-plugin-singlefile` singlefile) are **AMEND** — the localStorage session shape and server-authoritative verification are preserved per ADR-0018, but the single-file bundle and the `HtmlService.createHtmlOutputFromFile` delivery are gone. |
| Spec 001 | `docs/specs/001-member-registration.md` | **PRESERVE** (already `Deferred`) | Already deferred; the manual Users-sheet process continues. No browser-callable registration RPC exists, and the React shell ships no Register view. Carries forward unchanged. |
| Spec 002 | `docs/specs/002-program-enrollment.md` | **PRESERVE** | Domain content (`enrollUser`, `cancelEnrollment`, `getUserEnrolledProgramIds`, soft-delete pattern, advisory Event-clash warning, capability-gated privileged cancellation). The trigger and UI surface change; the server contract carries forward. |
| Spec 003 | `docs/specs/003-events-recurring.md` | **PRESERVE** | Recurring event generation, monthly trigger, Event sheet columns, `generateMonthlyRecurringEvents` reference. The Events-sheet column conflict with spec 005 is flagged below (open thread #2). |
| Spec 004 | `docs/specs/004-programs-catalog.md` | **PRESERVE** | Programs catalog, `CacheService` cache layer, header-name column resolution, `getAvailablePrograms(userId)`. The `getAvailablePrograms` bare-array contract predates the #53 Programs/Enrollment spec and is itself acknowledged in spec 069 to conflict with #53 — flagged below (open thread). The `CacheService` decision and `findHeaderIndex_` pattern remain authoritative. |
| Spec 005 | `docs/specs/005-dynamic-event-management.md` | **PRESERVE** | Interactive Event create/cancel/edit, exact-Program capability, soft cancel with `CONFLICT` on active Attendance, share-the-lock with check-in, one-row-per-interactive-creation rule. The Events-sheet column conflict with spec 003 is flagged below. |
| Spec 006 | `docs/specs/006-attendance-tracking.md` | **AMEND** | The concurrency boundary (one caller-owned minimal script lock around final authoritative checks and write), the `NOT_ENROLLED` business result, the audit and void semantics carry forward. **§3.1 "QR Code Scanning Flow"** — in particular "HTML5 camera video stream via `html5-qrcode`" — is **superseded for F5** by ADR-0015-camera's external-origin flow (per the cross-reference table in ADR-0015-camera and the resolution recorded in #130). The §3.1 step "open event check-in view (`/events/:eventId/checkin`)" assumes an Apps Script shell URL pattern; the React/Cloudflare path is owned by spec 074. |
| Spec 007 | `docs/specs/007-member-activity-and-care-dashboard.md` | **PRESERVE** | Inactivity calculation rules, exact-Program-active-enrollment predicate, `api_getUserActivityProfile` and `api_getCareDashboard` contracts, STAFF/ADMIN access boundary. The header cards are already deferred to a separate Care metrics ticket — that deferral is unchanged. |
| Spec 008 | `docs/specs/008-vanilla-restructure.md` | **SUPERSEDE** | The vanilla multi-page architecture (`?page=` query-string routing, `.gs` server modules + `.html` client pages, `app.js.html` shared module, `styles.html` include, clasp `src/gas/` push) is wholesale replaced by ADR-0017's Next.js monorepo on Cloudflare. No `src/gas/` directory survives in the new architecture. The file responsibilities, shared JS contract, CSS token set, clasp configuration, and migration approach in this spec lose their target. |
| Spec 009 | `docs/specs/009-phone-first-shell-navigation.md` | **AMEND** | The architecture (one stable top-level document, App Document state machine, route contract, `navigateTo`, fragment registry, RPC envelope, phone-first responsive layout, decision evidence standard, the ledger of in-flight decisions) is the **direct precedent** for spec 074's shell contract — same vocabulary, same state machine, same envelope shape, different transport (Next.js + Cloudflare Worker instead of HtmlService App Document). **The `google.script.run` transport**, the **`allow-popups-to-escape-sandbox`** IFRAME rules, and the **App-Document-loaded `html5-qrcode` clause** are superseded by ADR-0017/ADR-0018 and ADR-0015-camera's external origin respectively. Domain clauses (capability, RBAC, single-lock around final authoritative checks, the "Hong Kong-fixed date/time transport" rule, dirty-form protection, failure envelope codes) carry forward. |
| Spec 071 (accessibility) | `docs/specs/071-accessibility-acceptance-plan.md` | **PRESERVE** | The 13 acceptance criteria (touch targets, safe-area insets, semantic nav, keyboard traversal, focus management, `aria-live` status, non-color cues, badge labels, Traditional Chinese copy, automated + manual checks, versioned isolated `/exec`) are transport-agnostic UX contracts. The acceptance trace steps that say "open `/exec`" assume an Apps Script deployment URL; under ADR-0017 the equivalent flow runs against the Cloudflare-hosted URL. The mechanical criteria are unchanged. |
| Spec 071 (database schema) | `docs/specs/071-database-schema.md` | **PRESERVE** | The authoritative Users/Programs/Program_Leaders columns and the header-name resolution rule are domain authority. The "Conflicts found" subsection (Events column conflict between spec 003/005) is flagged below as an open thread. |

### Domain specs — carry-forward clauses

- **Recurring + interactive Event generation:** monthly trigger (spec 003); interactive create/cancel/edit (spec 005); soft cancel with `CONFLICT` on active Attendance; Event_ID and Program_ID immutability; Recurrence Tag informational only.
- **Program Leader authority:** exact-Program scope, `Must be Active` predicate, six-column `Program_Leaders` schema (spec 005; ADR-0019).
- **Enrollment:** self-enrollment, soft cancel, advisory Event-clash warning, capability-gated privileged cancellation, audit (spec 002).
- **Attendance:** exact-Program enrollment check shared by QR and manual paths, `NOT_ENROLLED` business result, soft void, audit, single-lock critical section, same-code re-scan is `DUPLICATE` not an error (spec 006).
- **Care:** inactivity predicate (`Users.Status == "Active"` AND no recent enrollment AND `coverage assumption`), STAFF/ADMIN access boundary, header metrics deferred (spec 007).
- **Auth envelope:** `data` contains only JSON-safe primitives, arrays, plain objects — no Date, no Range. The `requestId` correlation id. Six canonical RPC codes (spec 009).
- **Accessibility:** 44×44 touch targets, safe-area insets, no horizontal overflow, semantic nav with `aria-current`, intentional focus management, `aria-live` status, non-color cues (spec 071).
- **Header-name resolution:** the project's established pattern; `program-leaders-repository.gs` non-compliance flagged in spec 071 as a code-side fix independent of this matrix (spec 071).

### Domain specs — superseded clauses

- **Spec 006 §3.1 QR Code Scanning Flow** — in-App-Document `html5-qrcode` live-stream (see ADR-0015-camera cross-reference table and #130 resolved comment).
- **Spec 008** in entirety — vanilla multi-page architecture.
- **Spec 009 IFRAME / `google.script.run` / `google.script.history` / in-document `html5-qrcode`** — replaced by ADR-0017 + ADR-0018 + ADR-0015-camera.
- **Spec 000 singlefile bundling + `HtmlService.createHtmlOutputFromFile('index')`** — replaced by ADR-0017's Next.js static export.

---

## 5. Acceptance-plan specs (inherited)

| Spec | Path | Class | Rationale |
|---|---|---|---|
| Spec 067 (follow-up) | `docs/specs/067-follow-up-section-rpcs.md` | **AMEND** | The five capability-gated RPCs (`api_getPrograms`, `api_getEvents`, `api_getScannerEvents`, `api_getCareData`, `api_getPermissionsData`) and the `sessionHasCapability_` shared helper are server-side authority and **carry forward** into CF0. The `google.script.run` trigger and the "client-side `renderSection_` calls the matching RPC" wiring are replaced by ADR-0018's `POST /api/v1/rpc` action-multiplexed JSON body and the React shell's section loader. The vm-harness unit-test approach (`tests/gas/role-navigation.test.js`) carries forward; the **Playwright storage-state acceptance run is structurally unblocked** under ADR-0018 (headless client sets auth headers directly). |
| Spec 067 (role nav) | `docs/specs/067-role-nav-acceptance-plan.md` | **AMEND** | The role matrix, viewport traces (375×812 phone, 1280×800 desktop), forbidden-route trace, recovery trace, and the 13 AC disposition are UX contracts and **carry forward**. The documented blocker — "`google.script.run` callbacks fail with TRANSPORT in the headless browser because the iframe routes RPC calls through a sign-in wall" — **does not exist** under ADR-0018. The `/exec` URL target becomes the Cloudflare-hosted Next.js deployment URL. The login-gated Playwright storage-state pipeline (ADR-0012) remains useful for any browser-driven smoke flow requiring a Google account; the unblocking is in the headless-client-with-headers path, not in the storage-state path. |
| Spec 068 | `docs/specs/068-nested-task-navigation-acceptance-plan.md` | **AMEND** | The navigation model (root Section + optional nested task, active parent, loading/error state, recoverable per-Section view context, demo detail + demo edit tasks) and the role matrix are **carry-forward**. The "client-only extension of `shell-session.js.html`" framing is replaced by spec 074's React/Next.js section model. The Playwright acceptance run is structurally unblocked (headless client sets auth headers). |
| Spec 069 | `docs/specs/069-async-recovery-acceptance-plan.md` | **AMEND** | The READ-ONLY Programs list, the `programs-repository.gs` header-name resolution, the `navGeneration_` monotonic counter, and the recovery flows (forbidden / session-expired) are **carry-forward** UX contracts. The "`google.script.run` transport" trigger is replaced by ADR-0018's HTTP envelope. The 108/108 unit-test pass + `pnpm check` clean + `pnpm typecheck` clean baseline carries forward to the React-era equivalents. |
| Spec 070 | `docs/specs/070-form-protection-acceptance-plan.md` | **AMEND** (with explicit idempotency precedent) | The form state machine (`PRISTINE` → `DIRTY` → `SUBMITTING` → `SUCCEEDED` / `FAILED`), `confirmDiscard` modal semantics, dirty-form guard in `navigateTo_` / `closeTask_` / `handleLogoutClick_`, and `renderMultilineText` / `buildSafeLink` safe-rendering utilities are **carry-forward** UX contracts. **Idempotency precedent (explicit):** the demo form's `requestKey` + `CacheService.getScriptCache()` + 60-second TTL pattern (`api_submitDemoTaskForm`) is the **direct precedent** ADR-0018 generalized into the project-defined `Idempotency-Key` HTTP header; no external standards semantics are implied. The mechanism shape (key derivation, server-side dedup envelope, `idempotent: true` on repeat) survives verbatim; the wire format moves from an Apps Script function argument to a header. The `RPC_CODES.VALIDATION` and `RPC_CODES.INTERNAL_ERROR` carry forward verbatim. The "Cloudflare Workers can set HTTP response headers, unlike Apps Script" implication (open thread #3 below) does not affect this matrix's classification. |
| Spec 072 | `docs/specs/072-scanner-acceptance-plan.md` | **SUPERSEDE-flagged pending #136** | The runtime ownership split (Scanner Section in App Document + Scanner Window on external origin), the role matrix, the recovery paths, and the trust-boundary rules (server-authoritative `api_qrCheckIn`, opaque `scannedCode`) are **carry-forward**. The external-origin mechanism itself is **flagged for replacement** by issue [#136](https://github.com/Noahlw/efcc/issues/136): under ADR-0017 a Cloudflare-hosted page has no IFRAME restriction on `getUserMedia`, so the popup+postMessage bridge may not be required. This matrix does not decide #136. The verification boundary (unit tests + deployed phone run) and the `Attendances` operational header set (ADR-0016) carry forward regardless. |

### Acceptance-plan specs — carry-forward clauses

- **Capability-gating:** `sessionHasCapability_` helper, exact-Program scope, the five section RPCs, eight vm-harness unit tests per RPC (spec 067 follow-up).
- **Role matrix:** MEMBER/STAFF/ADMIN/Program Leader capability filters applied at chrome render + fragment load + RPC server gate (spec 067 role nav, spec 068).
- **Recovery UI:** forbidden-route → nearest permitted, session-expired → `AUTH_REQUIRED` clears state, error → retry without spam (spec 067 role nav, spec 069).
- **Form protection:** five-state machine, dirty-form guard on navigation/close/logout, `confirmDiscard` modal, safe-render utilities (spec 070).
- **Scanner trust boundary:** opaque `scannedCode`, server-side Member resolution in `api_qrCheckIn`, `event.origin` allowlist (spec 072, ADR-0015-camera).
- **Idempotency mechanism shape:** client-generated key on `markDirty()`, server-side `CacheService`-backed dedup, `idempotent: true` on repeat (spec 070 → ADR-0018).

### Acceptance-plan specs — superseded clauses

- **All `google.script.run` invocations and `withSuccessHandler`/`withFailureHandler` wiring** in every acceptance-plan spec — replaced by ADR-0018's `POST /api/v1/rpc` + Problem Details.
- **All "headless browser storage-state auth is the only path past the iframe sign-in wall" blockers** — replaced by ADR-0018's header-based session transport; a headless HTTP client sets auth headers directly.
- **Spec 072 external-origin mechanism** — flagged for replacement by #136.

---

## 6. Issue-only sources

The matrix identifies the following as **Issue-only** sources that the
classification rests on, with no local `docs/specs/<n>-…md` file in this
checkout. Their classifications were derived from cross-references in the
inherited ADR/spec set and from the issue #130 resolved comment, not from a
direct local read.

| Source | Path | Class | Rationale |
|---|---|---|---|
| Issue #50 | issue://50 — not present as a docs file | **AMEND** | Issue #50 is the stable App Document, Login, Profile, and phone-first Section-navigation contract. Its state machine, bootstrap/session behavior, server-authorized Sections, read-only Profile, recovery, security, and accessibility intent are preserved; its HtmlService App Document, hash routing, and `google.script.run` mechanisms are replaced by ADR-0017/ADR-0018 and Spec 074. |
| Issue #93 | issue://93 — not present as a docs file | **SUPERSEDE-flagged pending #136** | Referenced by issue #130 as one of the two GitHub-issue specs. ADR-0015-camera cross-reference table names #93 as "Focused QR Scanner spec; Seam 4 device probe now validates the external-origin flow." Spec 072 is the acceptance-plan child of #93. The external-origin mechanism is flagged for replacement by issue [#136](https://github.com/Noahlw/efcc/issues/136); the trust-boundary and server-authority clauses PRESERVE. |

> **Honesty note (per the matrix's "do not silently claim unavailable source documents were read" rule):** #50 and #93 are issue-only sources, not local `docs/specs/050-…` or `docs/specs/093-…` files. Their classifications are grounded in issue #130, the issue records, and inherited cross-references; they are not treated as local repository documents.

---

## 7. RPC_CODES and idempotency carry-forward (explicit)

These two cross-document carry-forwards were highlighted in issue #130's
headline findings and are recorded here so reviewers do not have to re-derive
them from the source files.

### 7.1 RPC_CODES carry-forward

ADR-0003's "Proposed amendment" clause (the structured-codes envelope:
`AUTH_REQUIRED`, `FORBIDDEN`, `VALIDATION`, `NOT_FOUND`, `CONFLICT`,
`UNAVAILABLE`) is the **direct precedent** for ADR-0018's `code` extension
on the RFC 9457 Problem Details envelope. The codes are augmented, not
replaced:

| Code | Status mapping (ADR-0018) | Source |
|---|---|---|
| `AUTH_REQUIRED` | 401 | ADR-0003 amendment + ADR-0018 |
| `FORBIDDEN` | 403 | ADR-0003 amendment + ADR-0018 |
| `VALIDATION` | 422 | ADR-0003 amendment + ADR-0018 |
| `*_NOT_FOUND` | 404 | ADR-0018 |
| `CONFLICT` | 409 | ADR-0015-lock + ADR-0018 |
| `NOT_ENROLLED` | 409 | spec 006 + ADR-0018 |
| `MEMBER_INACTIVE` | 409 | ADR-0018 |
| `EVENT_NOT_ACTIVE` | 409 | ADR-0018 |
| `UNAVAILABLE` | 503 | ADR-0003 amendment + ADR-0018 |
| `INTERNAL_ERROR` | 500 | ADR-0018 |
| `DUPLICATE` | (success, idempotent flag) | ADR-0015-lock |

ADR-0015-lock's `DENIED` and `FAILED` outcomes are not HTTP status codes;
they are audit-log `Outcome` values that ride alongside the HTTP envelope.

### 7.2 Idempotency precedent and wire carry-forward

Spec 070's `api_submitDemoTaskForm` introduced the `requestKey` +
`CacheService.getScriptCache()` + 60-second TTL pattern:

1. Client generates a key on state transition (in spec 070, on `markDirty()`).
2. Server keys dedup state on `"demoform_" + requestKey`.
3. Repeat submit returns the cached envelope with `idempotent: true`.
4. Cache TTL bounds the dedup window (60 seconds in spec 070).

Issue #130 identifies this as the precedent that ADR-0018 generalized into the
project-defined `Idempotency-Key` HTTP header. The precedent does not mandate
that the React/Apps Script implementation retain Spec 070's exact cache or
envelope mechanism:

- **Wire format:** HTTP header instead of an Apps Script function argument.
- **Scope:** applies to mutation actions that opt in (ADR-0019 deliberately
  excepts Program Leader grant/revoke — the natural-key recheck is their
  deduplication rule, per ADR-0019 §3).
- **Mechanism boundary:** the header is the carry-forward wire contract.
  Server-side deduplication, replay, cache storage, and response-envelope
  behavior remain the ADR-0018 / CF1 (#131) implementation decision; this
  matrix does not require `CacheService` or cached-envelope-on-repeat.

---

## 8. ADR-0018 headless-auth consequence (explicit)

ADR-0012 documents the headless-browser auth blocker: "`google.script.run`
calls returned TRANSPORT failures because the Apps Script iframe routes RPC
calls through a Google sign-in wall the headless browser session cannot
pass." This is a structural Apps Script limitation — the iframe is gated by
a Google cookie the headless browser does not have.

Under ADR-0018, the iframe sign-in wall is gone:

1. The browser speaks to a same-origin Cloudflare Worker over `fetch` with
   `Authorization: Bearer <sessionToken>` and `X-Efcc-Session-Id: <sessionId>`.
2. The Worker is a dumb pass-through to Apps Script's `/exec` (same
   deployment access as today, `webapp.access = ANYONE_ANONYMOUS`,
   `executeAs = USER_DEPLOYING`).
3. A headless HTTP client (Playwright `request` fixture, `curl`, Vitest
   with `fetch` mock) can set those headers directly, with no Google
   cookie, no Playwright storage state.

Implications for the acceptance-plan specs:

- Spec 067 role nav, spec 068, spec 069, spec 070 — the documented
  "blocked on headless-browser authentication" status unblocks. The
  Playwright storage-state pipeline (ADR-0012) remains useful for
  browser-driven smoke flows that need a Google account, but it is no
  longer the only path to a passing login-gated acceptance run.
- The "manual real-account credential" gate remains for any flow that
  specifically exercises Google-Sign-In UX, but no acceptance-plan spec
  in this matrix requires that.

This consequence is **not** a claim that the existing storage-state
pipeline is removed; it is a claim that the blocker it was created to
work around no longer exists.

---

## 9. Open (non-blocking) threads

These threads were flagged in issue #130's resolved comment as
"non-blocking" and are recorded here so the next reviewer does not have
to re-derive them. None of them blocks CF0.

| # | Thread | Source | Status |
|---|---|---|---|
| 1 | Scanner inline/popup — is the popup+postMessage bridge still required under ADR-0017's Cloudflare-hosted page? | issue [#136](https://github.com/Noahlw/efcc/issues/136) | SUPERSEDE-flagged pending #136 in this matrix; not decided here. |
| 2 | Events-schema conflict between spec 003 (Recurring) and spec 005 (Dynamic). Overlapping Events columns with different formats for `Event_ID`, `Event_Date`, `Time_Slot`. | spec 071-database-schema §4b "CONFLICT" note | Pre-existing data-model issue unrelated to this migration. Resolution is owned by an Events-sheet reconciliation ticket, not by CF0. |
| 3 | Now-moot non-goal in spec 070 — Cloudflare Workers can set HTTP response headers, unlike Apps Script. | spec 070 consequences | Recorded here so future cleanup can remove the non-goal; no action required for CF0. |
| 4 | Nested-task views (spec 068) — do they get real Next.js routes (`/programs/[id]`) or remain client-side state under the section? | spec 068 + spec 074 | Owned by spec 074's section-model decision. Not decided by this matrix. |

---

## 10. Conventions

- Source links in this matrix point to GitHub URLs for ADRs and specs where
  the corresponding file exists; issue-only sources are explicitly labeled.
- "ADR-0017" and "ADR-0018" throughout this matrix refer to the restored
  successor decisions in `docs/adr/0017-*` and `docs/adr/0018-*`, grounded in
  issues [#127](https://github.com/Noahlw/efcc/issues/127) and
  [#128](https://github.com/Noahlw/efcc/issues/128) respectively.
- Classification basis: every PRESERVE/AMEND/SUPERSEDE assignment is
  grounded in (a) the resolved comment on issue
  [#130](https://github.com/Noahlw/efcc/issues/130), (b) the inherited
  ADR/spec text, and (c) the resolved comments on issues
  [#127](https://github.com/Noahlw/efcc/issues/127) and
  [#128](https://github.com/Noahlw/efcc/issues/128). No new domain
  decision is introduced by this matrix.