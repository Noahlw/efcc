# Research: Programs and Enrollment Migration Constraints

**Date:** 2026-08-06
**Status:** Research complete — fact-backed constraint summary for the D1 Programs/Enrollment decision ticket ([#184](https://github.com/Noahlw/efcc/issues/184)). No code, schema, Sheets, or issue bodies changed.
**Ticket:** [Issue #183 — Research: Programs and Enrollment migration constraints](https://github.com/Noahlw/efcc/issues/183)
**Parent map:** [#158 — Map: EFCC Cloudflare D1 Identity, Login & Registration Foundation](https://github.com/Noahlw/efcc/issues/158)

---

## TL;DR

The smallest safe first D1 ownership boundary for Programs/Enrollment is the **read-only Programs catalog browse with a per-user `isEnrolled` join** (the dependency root of the whole F3 graph, `#109`). It depends only on the identity boundary D1 already owns (session, `accounts.role`), carries zero mutation risk (no ADR-0023 lock, no audit, no Sheet write), and is the only slice that is not blocked by a manual Sheet-schema step. Every write path (self-service/assisted enrollment, catalog administration) is a larger slice because it pulls in the single-lock + `Audit_Log` contract (ADR-0023) and, for assisted operations, the Program Leader scope that still lives only in the Sheets `Program_Leaders` tab. The critical open proofs before any D1 write slice: the real Enrollments sheeth headers (unverified), the Program Leader data source (not present in the production export), and the role-vocabulary drift between D1 (`Admin|Teacher|Member`) and the legacy/CF ADR vocabulary (`ADMIN|STAFF|MEMBER`).

---

## 1. Current ownership boundary (what D1 owns today)

- **D1 owns identity only.** `web/migrations/0000_init.sql` creates exactly three tables — `accounts`, `registration_requests`, `sessions` — and its header comment states Church/domain records (Programs, Enrollments, Events, Attendances, Program_Leaders, Audit_Log) **stay in Google Sheets**. No Programs/Enrollment table exists in D1. ([0000_init.sql](../../web/migrations/0000_init.sql), [ADR-0020](../../docs/adr/0020-cloudflare-d1-identity-session-and-auth-boundary.md))
- **ADR-0022**: the Worker/D1 platform migrates capability by capability; Apps Script + Google Sheets remains the transitional Domain Backend for programs, events, attendance, enrollments "until each replacement has implementation and acceptance proof." ([ADR-0022](../../docs/adr/0022-staged-worker-d1-platform-migration.md))
- **ADR-0024**: the repository has "restarted on D1"; the Apps Script/Sheets backend is historical but remains the live transitional domain backend for not-yet-migrated capabilities. D1-era ADRs (0017–0023) and specs under `docs/specs/074`–`078` are the starting point for new work. ([ADR-0024](../../docs/adr/0024-d1-platform-restart-relationship-to-apps-script.md))
- **README feature roadmap**: Programs is `Transitional`, target owner Worker + D1, next milestone "Define Worker/D1 read and mutation contracts"; Enrollments is folded into the Programs row. ([README.md](../../README.md) §Feature State)
- **Worker route surface**: `web/worker.ts` handles only `/api/v1/auth/*` (cookie-only auth) and forwards `/api/v1/rpc` as a same-origin proxy to the Apps Script domain backend. There is no D1 Programs/Enrollment route today. ([web/worker.ts](../../web/worker.ts))

## 2. Current Programs/Enrollment contracts (data shapes)

**Programs sheet** — canonical reference [ADR-0013](../../docs/adr/0013-google-sheets-database-structure.md) §Sheet 1; design [spec 004](../../docs/specs/004-programs-catalog.md):
- Columns `Program_ID | Program_Name | Type | Description`; DTO `{id, name, type, description}`. Header-name resolution, order-independent, extra-column tolerant (`programsResolveColumns_` in [programs-repository.gs](../../src/gas/programs-repository.gs)).
- Script cache `programs_catalog_v1`, 300s TTL.
- **Enrollment sheet is NOT yet mapped in ADR-0013** — only Programs, Users, and Attendances were verified against the production export; Enrollments is listed as "not yet mapped." `#109` explicitly requires verifying the real headers against the production export and recording an ADR-0013 addendum before finalizing the schema. ([ADR-0013](../../docs/adr/0013-google-sheets-database-structure.md), [#109](https://github.com/Noahlw/efcc/issues/109))
- **Enrollments sheet assumed schema** (from legacy `程式碼.js`, [spec 002](../../docs/specs/002-program-enrollment.md) §2, [enrollments-repository.gs](../../src/gas/enrollments-repository.gs)): `Enrollment_ID (ENR-XXXXXXXX) | User_ID | Program_ID | Timestamp | Status (Active|Cancelled)`. Reads are fresh per call (no cache) so the check-in/duplicate critical section re-reads state under the lock.

**Current browse RPC** — `api_getPrograms` ([Code.gs:436](../../src/gas/Code.gs)) is the #69 minimal **READ-ONLY** Programs RPC: session-verifies, checks active user, returns `programsList_()` (full catalog, no `Status` filter, no `isEnrolled`). ([spec 069](../../docs/specs/069-async-recovery-acceptance-plan.md), [programs-repository.gs](../../src/gas/programs-repository.gs) scope note)
- The legacy bare-array `getAvailablePrograms(userId)` contract (spec 004 §4) is **SUPERSEDED** — it predates and conflicts with the #53 authorization model; spec 069 builds the different READ-ONLY RPC instead. ([reconciliation matrix](../../docs/specs/073-htmlservice-spec-reconciliation-matrix.md) §11.2, [spec 069](../../docs/specs/069-async-recovery-acceptance-plan.md))

**Program_Leaders** — additive sheet, does NOT exist in the production xlsx; repository returns `[]` when missing. Six columns incl. `Status` (`Active`|`Revoked`); only `Active` rows authorize per-Program access. ([ADR-0013](../../docs/adr/0013-google-sheets-database-structure.md) proposed sheet, [ADR-0019](../../docs/adr/0019-permissions-and-program-leadership-http-contract.md) §3)

**Audit_Log** — 12-column schema, 5-value `Outcome` (`SUCCESS|DUPLICATE|CONFLICT|DENIED|FAILED`), single caller-owned lock (`withScriptLock_`); helpers never call `LockService` directly (grep-enforced). ([ADR-0023](../../docs/adr/0023-single-lock-mutation-and-audit-contract.md))

## 3. Smallest safe first D1 ownership boundary

Candidate: **read-only Programs catalog browse with server-side active-only filter + per-user `isEnrolled` join.** Reasoning:

- **It is the dependency root.** `#108`'s dependency graph: `#109` (read-only Enrollments repo + `isEnrolled`) is the only immediately-run slice; `#111` (self-service) blocks on `#109`; `#112` (assisted) blocks on `#111`; `#110`/`#113`/`#114` block on the manual `Status`+`Usual_Schedule` column step. ([#108](https://github.com/Noahlw/efcc/issues/108), [#109](https://github.com/Noahlw/efcc/issues/109), [#111](https://github.com/Noahlw/efcc/issues/111))
- **It is read-only.** No ADR-0023 lock, no `Audit_Log` write, no Sheet mutation — the lowest-risk surface and the only one with no transitional write-adapter burden.
- **It depends only on what D1 already owns.** The actor identity and global role come from the verified D1 session/`accounts` row; no Program Leader authorization is needed for member-facing browse (that is a write-path / assisted-operation concern).
- **It removes the highest-frequency read from the shared Apps Script 30-simultaneous-execution ceiling** — the cost model's stated scaling constraint and the reason identity was moved to D1. ([ADR-0020](../../docs/adr/0020-cloudflare-d1-identity-session-and-auth-boundary.md) Context, [cost model](../../docs/research/2026-08-01-cost-model-cloudflare-frontend-migration.md))

Boundary statement: **D1 owns the Programs/Enrollment read model and browse authorization; the Sheets/Apps Script backend stays the authoritative write owner (and the Sheet stays immutable to agents) until a write slice separately migrates.** Writes (self-service `#111`, assisted `#112`, catalog admin `#113/#114`) are deferred to later slices and are NOT part of the first boundary.

## 4. Transitional adapter responsibilities

- **Sheets stays authoritative and immutable to agents.** `AGENTS.md`: "Google Sheet DB is read-only for agents. State exact sheet/columns/rows; ask user to edit manually." E2E exception only: CI may reset `E2E_`-prefixed `Programs`/`Program_Leaders` rows via the Sheets API; `Users` is strictly immutable. ([AGENTS.md](../../AGENTS.md))
- **Any D1 Programs/Enrollment table is a read-only mirror, never a write-back** to the Sheet. The Sheet owner performs all manual schema changes (e.g. the `Status`/`Usual_Schedule` columns, `#107`/`#108`); no agent adds columns via the Sheets/Apps Script API. ([#107](https://github.com/Noahlw/efcc/issues/107) §Blocking prerequisite, [#110](https://github.com/Noahlw/efcc/issues/110))
- **Actor is server-derived, never client-supplied.** If the browse slice or any later write slice reads through the `/api/v1/rpc` proxy, the actor must be derived from the verified session, not accepted as a request field; the `Authorization`/`X-Efcc-Session-Id`/`Idempotency-Key` headers and the Apps-Script body-status remap are load-bearing correctness on the proxy. ([ADR-0018](../../docs/adr/0018-frontend-http-boundary-auth-and-api-contract.md) §2/§6, [web/worker.ts](../../web/worker.ts))
- **Active-only filtering happens after the cache read, not baked into the cached payload** — so a `Status` change never requires a cache-key bump. ([#110](https://github.com/Noahlw/efcc/issues/110) Acceptance)
- **For future write slices:** each mutating RPC must route its domain write + audit append through the single `withScriptLock_`; helpers never take nested locks. ([ADR-0023](../../docs/adr/0023-single-lock-mutation-and-audit-contract.md) §1)

## 5. Authorization and Program Leader dependencies

- **Global roles on D1:** `Admin | Teacher | Member` (`accounts.role`, `0000_init.sql`; ADR-0020). Legacy `Users.System_Role` production values are `Admin | Teacher | Member` ([CONTEXT.md](../../CONTEXT.md) glossary `Role`).
- **Vocabulary drift is a decision the D1 contract must resolve.** Legacy/CF ADRs and tickets use `ADMIN | STAFF | MEMBER` (ADR-0006, ADR-0019, spec #53, CF3 `#121`); D1 uses `Admin | Teacher | Member`. `CONTEXT.md` glossary states `STAFF` "is a legacy placeholder from earlier ADRs that does not (yet) correspond to a production value." The D1 Programs/Enrollment contract must map `Teacher` → the STAFF-equivalent capability or lock a canonical role set before writing authorization.
- **Program Leader scope is per-Program, not a global role** (ADR-0006, ADR-0019 §1/§3, spec #53). Assisted enrollment/cancel for another member requires: STAFF/ADMIN (or Teacher/Admin) global for any active Program, or the exact active Program Leader for that Program; the target member and Program must both be `Active`. ([spec 002](../../docs/specs/002-program-enrollment.md) §3/§4, [#53](https://github.com/Noahlw/efcc/issues/53))
- **Program Leader data lives only in Sheets** (`Program_Leaders`), which is NOT in the production export and has no D1 table. Any D1 write slice needing Program Leader scope must read it from Sheets transitionally (or mirror it read-only) until CF2/Permissions migrates. CF3's delivery explicitly depends on CF2 for assisted operations. ([#121](https://github.com/Noahlw/efcc/issues/121) Dependencies)
- **Self-service enrollment needs no extra authorization** — the authenticated member is the target; the client cannot supply another member ID. ([#53](https://github.com/Noahlw/efcc/issues/53) Implementation Decisions)
- **Scanner never creates enrollment.** A scanner operator hitting an unenrolled member receives `NOT_ENROLLED`; no enrollment row is ever created by scanning. Must be preserved in any D1 contract. ([#53](https://github.com/Noahlw/efcc/issues/53), [ADR-0023](../../docs/adr/0023-single-lock-mutation-and-audit-contract.md) §3 `DENIED`)

## 6. Immutable-sheet safeguards

- Read-only-for-agents rule and manual-change protocol: [AGENTS.md](../../AGENTS.md), [CONTEXT.md](../../CONTEXT.md) §Platform Ownership.
- ADR-0020 §4 legacy import is read-only against the Sheet (consumes `usersReadAll_` shape, never writes). ([ADR-0020](../../docs/adr/0020-cloudflare-d1-identity-session-and-auth-boundary.md) §4)
- `Program_ID` is immutable and there is no hard delete in the app; deactivate (`Status → Inactive`) is the only removal mechanism, and it does not cascade into existing enrollments/Events/leaders. ([#107](https://github.com/Noahlw/efcc/issues/107), spec #53)
- The `Status`/`Usual_Schedule` columns are added manually by the spreadsheet owner before any read/write child can start; the four existing Programs columns stay unchanged in name, order, and semantics. ([#107](https://github.com/Noahlw/efcc/issues/107), [#110](https://github.com/Noahlw/efcc/issues/110))
- Enrollments column headers must be verified and recorded as an ADR-0013 addendum before any code depends on them — no agent invents the schema. ([#109](https://github.com/Noahlw/efcc/issues/109))

## 7. Proof gaps (must be resolved before/before-write)

1. **Enrollments sheet schema unverified.** ADR-0013 does not map it; `#109` requires a production-export header verification + dated ADR-0013 addendum before the read-only repo is trustworthy. ([ADR-0013](../../docs/adr/0013-google-sheets-database-structure.md), [#109](https://github.com/Noahlw/efcc/issues/109))
2. **Program Leader data source unverified.** `Program_Leaders` is additive, absent from the production xlsx; D1 has no table for it. Assisted-operation authorization depends on it. ([ADR-0013](../../docs/adr/0013-google-sheets-database-structure.md), [#121](https://github.com/Noahlw/efcc/issues/121))
3. **Role-vocabulary drift.** `Admin|Teacher|Member` (D1) vs `ADMIN|STAFF|MEMBER` (legacy/CF, `STAFF` with no production value). Must be resolved before the D1 write authorization contract. ([CONTEXT.md](../../CONTEXT.md) glossary, ADR-0020, ADR-0006)
4. **`Status`/`Usual_Schedule` columns do not yet exist** on the sheet; the active-only Program contract depends on them. Manual step pending. ([#107](https://github.com/Noahlw/efcc/issues/107), [#108](https://github.com/Noahlw/efcc/issues/108), [#110](https://github.com/Noahlw/efcc/issues/110))
5. **No D1 Programs/Enrollment table or data-source decision.** The read boundary needs a decision: mirror into D1 (read-only import) vs. read through the `/api/v1/rpc` proxy. This is the core open question for the `#184` decision.
6. **Several governing ADRs are still `Proposed`** pending deployed proof per the `AGENTS.md` evidence gate: ADR-0018 (HTTP boundary), ADR-0019 (Permissions/Program Leadership), ADR-0020 (D1 identity), ADR-0023 (single-lock). The D1 Programs/Enrollment contract must not assume accepted status. ([ADR-0018](../../docs/adr/0018-frontend-http-boundary-auth-and-api-contract.md), [ADR-0019](../../docs/adr/0019-permissions-and-program-leadership-http-contract.md), [ADR-0020](../../docs/adr/0020-cloudflare-d1-identity-session-and-auth-boundary.md), [ADR-0023](../../docs/adr/0023-single-lock-mutation-and-audit-contract.md))
7. **Superseded contract must not be re-adopted.** The bare-array `getAvailablePrograms`/`getProgramsCatalog` contract is superseded by the spec-069 READ-ONLY RPC; the D1 read contract must be defined fresh. ([reconciliation matrix](../../docs/specs/073-htmlservice-spec-reconciliation-matrix.md) §11.2, [spec 069](../../docs/specs/069-async-recovery-acceptance-plan.md))
8. **Write-slice concurrency semantics** (duplicate/conflict detection, `isEnrolled` re-read under the lock, soft-cancel + re-enroll-creates-new-row) are only specified against Apps Script; they must be re-proven (or intentionally re-derived) for any D1 write slice. ([ADR-0023](../../docs/adr/0023-single-lock-mutation-and-audit-contract.md), [spec 002](../../docs/specs/002-program-enrollment.md), [#53](https://github.com/Noahlw/efcc/issues/53))

## 8. Recommendation for the decision ticket (#184)

1. **First D1 slice = read-only Programs browse with active-only filter + `isEnrolled` join** (mirrors `#109`), sourced read-only from Sheets/Apps Script (via the proxy or a one-way mirror) — never writing the Sheet.
2. **Defer all write paths** (self-service `#111`, assisted `#112`, catalog admin `#113/#114`) to later slices; each is gated by ADR-0023 lock/audit, and assisted ones by the unresolved Program Leader data source.
3. **Resolve the role-vocabulary mapping (`Teacher` ↔ `STAFF` capability) before writing any authorization contract.**
4. **Verify the real Enrollments headers and record an ADR-0013 addendum** as part of the first slice (per `#109`).
5. **Do not re-introduce `getAvailablePrograms`**; define the D1 read contract fresh from spec 069.

---

## Sources

Primary sources read directly (paths are repo-relative; issues are GitHub links):
- `CONTEXT.md` (glossary, Platform Ownership, Data Store)
- `docs/adr/0022`, `0024`, `0020`, `0023`, `0018`, `0019`, `0013`, `0006`
- `docs/specs/002-program-enrollment.md`, `004-programs-catalog.md`, `069-async-recovery-acceptance-plan.md`, `073-htmlservice-spec-reconciliation-matrix.md`
- `src/gas/programs-repository.gs`, `enrollments-repository.gs`, `Code.gs` (`api_getPrograms`)
- `web/migrations/0000_init.sql`, `web/worker.ts`
- `README.md`, `AGENTS.md`
- Issues: [#183](https://github.com/Noahlw/efcc/issues/183), [#184](https://github.com/Noahlw/efcc/issues/184), [#108](https://github.com/Noahlw/efcc/issues/108), [#109](https://github.com/Noahlw/efcc/issues/109), [#110](https://github.com/Noahlw/efcc/issues/110), [#111](https://github.com/Noahlw/efcc/issues/111), [#112](https://github.com/Noahlw/efcc/issues/112), [#113](https://github.com/Noahlw/efcc/issues/113), [#114](https://github.com/Noahlw/efcc/issues/114), [#121](https://github.com/Noahlw/efcc/issues/121), [#134](https://github.com/Noahlw/efcc/issues/134), [#53](https://github.com/Noahlw/efcc/issues/53), [#107](https://github.com/Noahlw/efcc/issues/107), [#158](https://github.com/Noahlw/efcc/issues/158)

*This research note is scoped to Programs and Enrollment only; Events, Attendance, Scanner, Care, and Permissions are out of scope per the ticket. Free-tier usage evidence was not required and was not gathered.*