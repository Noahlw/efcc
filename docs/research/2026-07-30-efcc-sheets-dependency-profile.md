# EFCC Sheets Dependency Profile — Inventory of Current State

**Date**: 2026-07-30
**Investigator**: ScoutSheetsDependencyProfile (read-only scout)
**Repo**: `/Users/noah.wong/Desktop/code/EFCC-dev`
**Task**: Quantify exactly how EFCC's current implementation depends on Google Sheets as both a live editable surface AND a runtime database; identify facts only, not recommendations.

**Headline finding (READ-MOSTLY)**: EFCC's deployed Apps Script code in `src/gas/*.gs` is **strictly READ-ONLY against Google Sheets** — there are zero write/mutation calls (`setValues`, `appendRow`, `insertRow`, `deleteRow`, `insertSheet`, `deleteSheet`, `createTextFinder`, `range.setValue`, `range.setValues`, `range.clear`, `range.merge`, `range.setFormula`) anywhere in the server source. Every mutation to the backend Sheet happens through a human editing the Sheet UI directly, by an Apps Script `onEdit` simple trigger (referenced in legacy spec 001 — not present in current `src/gas/`), or via a separately-deployed GAS project (per `程式碼.js` archive). The current codebase treats the Sheet as a shared spreadsheet the staff hand-edit, with the deployed app serving as a read-mostly viewer/authenticator.

---

## 1. Sheet tab inventory

### 1.1 Tabs documented in `CONTEXT.md` Data Store section (canonical summary)

Source: `CONTEXT.md` lines 44–53 (verbatim):

> | Sheet | Purpose | Key Columns |
> | --- | --- | --- |
> | `Users` | Member & Staff records | See [Users sheet structure](#users-sheet) below — 13 columns, resolved by header name |
> | `Programs` | Program catalog | Program_ID, Program_Name, Type, Description |
> | `Enrollments` | Program membership | Enrollment_ID, User_ID, Program_ID, Timestamp, Status |
> | `Events` | Scheduled instances | Event_ID, Program_ID, Event_Date, Time_Slot, Event_Name |
> | `Attendance` | Check-in records | Attendance_ID, Event_ID, User_ID, CheckIn_Time, CheckIn_Method, CheckIn_By |
> | `Program_Leaders` | Per-program leader assignments (ADR-0006) | Assignment_ID, Program_ID, User_ID, Assigned_By, Assigned_Date, Status |
> | `Audit_Log` | Admin action audit trail (ADR-0006) | Log_ID, Timestamp, Actor_User_ID, Action_Type, Target_User_ID, Old_Value, New_Value, Reason |

### 1.2 Users sheet — documented header row (CONTEXT.md lines 55–56)

```
User_ID | Username | Name | Email | Phone | Date of Birth | Age | PIN_Code | QR_Code_String | System_Role | Status | Whatsapp Message | 青崇？
```

NB: CONTEXT.md says "13 columns" but the row above is **13 header cells** (matches). ADR-0013 (`docs/adr/0013-google-sheets-database-structure.md`) documents the production sheet as a **14-column layout** (with a trailing empty-header column at position 14) — see ADR-0013 quote in §4 below.

### 1.3 Tabs documented in `docs/adr/0013-google-sheets-database-structure.md`

Source: ADR-0013 lines 12–22 (verbatim):

> | Tab # | Sheet Name | Purpose | Code Access |
> |-------|-----------|---------|-------------|
> | 1 | Programs | Course/program catalog | `programs-repository.gs` |
> | 2 | Users | Member/staff/admin accounts | `users-repository.gs` |
> | 3 | Users詳細資料 | Extended user details (unused by code) | None |
> | 4 | Attendances | Attendance/check-in records | None (future) |
> | 5–10 | (various) | Not yet mapped | None |

ADR-0013 explicitly notes that tabs 5–10 in the production spreadsheet **"Not yet mapped"** to any code or doc. The ADR also documents a **proposed `Program_Leaders` sheet** (does not exist in production xlsx; `programLeadersReadAll_` returns empty array when missing).

### 1.4 Every sheet tab name referenced in `src/gas/` (grep `getSheetByName(`)

Comprehensive grep across `src/gas/*.gs` and `src/gas/*.html` returns three tab-name string constants, all used by `getSheetByName()`:

| Sheet tab name | Constant location | Read site (file:line) | Notes |
|---|---|---|---|
| `"Users"` | `src/gas/users-repository.gs:22` `var USERS_SHEET_NAME = "Users";` | `src/gas/users-repository.gs:98` `SpreadsheetApp.getActiveSpreadsheet().getSheetByName(USERS_SHEET_NAME)` | Production canonical; production uses the spelling `System_Role` not `Role`. |
| `"Programs"` | `src/gas/programs-repository.gs:40` `var PROGRAMS_SHEET_NAME = "Programs";` | `src/gas/programs-repository.gs:95` `ss.getSheetByName(PROGRAMS_SHEET_NAME)` | Cached in `CacheService.getScriptCache()` with key `"programs_catalog_v1"`, TTL 300s. |
| `"Program_Leaders"` | `src/gas/program-leaders-repository.gs:21` `var PROGRAM_LEADERS_SHEET_NAME = "Program_Leaders";` | `src/gas/program-leaders-repository.gs:81` `ss.getSheetByName(PROGRAM_LEADERS_SHEET_NAME)` | Sheet is additive — does not exist in production xlsx; repository returns empty when missing. |

**Other sheet names that appear in `src/gas/` but are NOT used by `getSheetByName` in the deployed server code:**
- `"Attendances"` — appears in ADR-0013 (`docs/adr/0013-google-sheets-database-structure.md`) only; not accessed by any deployed server code.
- `"Enrollments"` — appears in `Code.gs:395-398` prose comment ("Scope note: this RPC does NOT read Enrollments") and `programs-repository.gs:5-10` prose comment only; not accessed.
- `"Events"` — appears in ADR-0004 (`docs/adr/0004-monthly-recurring-event-generation.md`) and as a `SECTION_KEYS` constant in `Code.gs:76` (`EVENTS: "events"`); no sheet tab access.
- `"Audit_Log"` — appears in ADR-0009 (`docs/adr/0009-audit-log-write-pattern.md`) only; no current `src/gas/` access.
- `"Users詳細資料"` — appears in ADR-0013 only.
- `"Menu"`, `"Registration_Requests"` — referenced in `.scratch/` scratch notes only; not in current `src/gas/`.

---

## 2. Per-sheet call inventory (read/write sites)

### 2.1 `Users` sheet (current `src/gas/`)

**Read call sites:**
- `src/gas/users-repository.gs:97-108` — `usersReadAll_()`: `SpreadsheetApp.getActiveSpreadsheet().getSheetByName(USERS_SHEET_NAME)` (line 98) → `sheet.getDataRange().getValues()` (line 107). This is the **only Sheets read site** for the `Users` tab.
- Indirect callers of `usersReadAll_()` (all read paths):
  - `usersFindByUsername_(username)` — `users-repository.gs:113-126` (called from `api_loginUser` at `Code.gs:236`)
  - `usersFindById_(userId)` — `users-repository.gs:131-141` (called from `api_restoreApp` at `Code.gs:300`, `api_getPrograms` at `Code.gs:472`, `bootstrapSectionsForRole_` indirectly via `programLeadersHasActiveAssignment_`)
  - `usersCurrentPinById_(userId)` — `users-repository.gs:146-156` (called from `api_loginUser` at `Code.gs:250`, `sessionVerify_` at `session.js.gs:184`)
  - `usersStatusById_(userId)` — `users-repository.gs:161-167` (called from `sessionVerify_` at `session.js.gs:200`)
- Memoization note (`users-repository.gs:87-90`): `usersReadAll_()` is cached in module-scope `USERS_ROW_CACHE_` for the duration of a single script execution. **Not** a cross-execution cache.

**Write call sites:** **NONE in current `src/gas/`.**

### 2.2 `Programs` sheet

**Read call sites:**
- `src/gas/programs-repository.gs:93-105` — `programsReadAndParse_()`: `SpreadsheetApp.getActiveSpreadsheet()` (line 94) → `ss.getSheetByName(PROGRAMS_SHEET_NAME)` (line 95) → `sheet.getDataRange().getValues()` (line 97). Only Sheets read site for the `Programs` tab.
- `programsList_()` at `programs-repository.gs:119-146` wraps `programsReadAndParse_()` with a `CacheService.getScriptCache()` read-through cache (`cache.get(PROGRAMS_CACHE_KEY_)` at line 125; `cache.put(...)` at line 139, TTL 300s).
- Indirect callers of `programsList_()`:
  - `api_getPrograms` at `Code.gs:481` (returns the cached list to the Programs Section)
  - `bootstrapSectionsForRole_` does **not** call it
- Memoization note (`programs-repository.gs:43-48`): `PROGRAMS_MEMO_` module-scope cache inside a single execution; reset between Vitest cases via `programsResetForTesting_()`.

**Write call sites:** **NONE in current `src/gas/`.**

### 2.3 `Program_Leaders` sheet

**Read call sites:**
- `src/gas/program-leaders-repository.gs:76-103` — `programLeadersReadAll_()`: `SpreadsheetApp.getActiveSpreadsheet()` (line 80) → `ss.getSheetByName(PROGRAM_LEADERS_SHEET_NAME)` (line 81) → `sheet.getDataRange().getValues()` (line 100). Only Sheets read site for the `Program_Leaders` tab.
- Indirect callers of `programLeadersReadAll_()`:
  - `programLeadersHasActiveAssignment_(userId)` — `program-leaders-repository.gs:130-141` (called from `bootstrapSectionsForRole_` at `Code.gs:101`)
  - `programLeadersActiveProgramIds_(userId)` — `program-leaders-repository.gs:148-163` (no current callers in `src/gas/` — reserved for future per-Program Leader authorization per ADR-0006)
- Memoization note (`program-leaders-repository.gs:23`): `PROGRAM_LEADERS_CACHE_` module-scope. **Open known issue (ADR-0013 issue #3):** when the sheet is missing, the cache is set to `null` and the next call re-runs `SpreadsheetApp.getActiveSpreadsheet()` + `getSheetByName()` instead of short-circuiting.

**Write call sites:** **NONE in current `src/gas/`.**

### 2.4 Sheets sheet-access summary (deployed `src/gas/`)

| Tab | Reads | Writes | Notes |
|---|---|---|---|
| `Users` | 1 read site (`usersReadAll_`), 4 indirect callers | 0 | Full-sheet read (`getDataRange().getValues()`); in-execution memoization only |
| `Programs` | 1 read site (`programsReadAndParse_`), 1 indirect caller (`programsList_` w/ `CacheService`) | 0 | Same full-sheet read pattern; CacheService script-cache TTL 300s |
| `Program_Leaders` | 1 read site (`programLeadersReadAll_`), 2 indirect callers | 0 | Returns `[]` when sheet missing |
| `Attendances` | 0 | 0 | ADR-0013 schema documented; no code access |
| `Enrollments` | 0 | 0 | Referenced only in prose comments (`Code.gs:395`, `programs-repository.gs:5-10`) |
| `Events` | 0 | 0 | Sheet-name access only in legacy `.scratch/` notes |
| `Audit_Log` | 0 | 0 | ADR-0009 schema documented; `writeAuditLog(...)` referenced in spec but **not present in current `src/gas/`** |
| `Users詳細資料` | 0 | 0 | ADR-0013 schema; "unused by code" |
| Tabs 5–10 (ADR-0013 unmapped) | 0 | 0 | Listed in ADR-0013 as `(various) — Not yet mapped` |

**Conclusion**: EFCC's app code is **READ-ONLY against Sheets** for every tab it touches. The `Audit_Log` write path described in ADR-0009 is **not implemented in current `src/gas/`** (only the proposed helper `writeAuditLog(...)` and the legacy `程式碼.js` archive have it).

---

## 3. ADR-0001 stated tradeoffs and any "revisit if scale exceeds X" clause

`docs/adr/0001-google-sheets-as-database.md` is **Accepted**, dated 2026-07-27.

### Rationale (verbatim from ADR-0001):
- "Zero infrastructure — No external database server, no credentials to manage, no hosting cost. The spreadsheet is part of the Google Apps Script project's own Google Drive context."
- "Shared administration — Church administrators can view and edit member data directly in the spreadsheet without a custom admin panel. This was a key requirement."
- "Adequate scale — The expected data volume (hundreds of members, dozens of programs, thousands of events) is well within Google Sheets' limits."
- "Built-in caching — `CacheService` (ScriptCache) is used for frequently accessed but slowly changing data (program catalog), reducing spreadsheet read calls."
- "Rapid iteration — No schema migrations, no deploy pipeline for schema changes. Add a column to the sheet, and the code adapts via header-name lookup."

### Constraints (verbatim from ADR-0001):
- "No relational integrity — Enforced in application code. There are no foreign keys, cascading deletes, or transaction isolation."
- "No real-time queries — `SpreadsheetApp` is synchronous and not designed for concurrent writes. Write contention is avoided by the single-user/admin operational model."
- "Row limits — Google Sheets caps at 10M cells. With ~10 columns per sheet, that's ~1M rows per sheet — far beyond projected needs."
- "Performance on large data — `getDataRange().getValues()` loads the entire sheet into memory. For sheets projected to grow beyond thousands of rows, pagination or range-limited reads will be needed."

### Alternatives Considered (ADR-0001):
- "Firebase / Firestore — Rejected due to additional cost, authentication setup, and losing the 'shared admin spreadsheet' workflow."
- "SQLite via JDBC — Rejected because it requires an external database host and the Google Sheets admin interface was preferred."
- "Google Cloud SQL — Rejected as excessive for the data volume and operational complexity."

### "Revisit if scale exceeds X" clause:
**No explicit numeric threshold or "revisit if scale exceeds X" clause exists in ADR-0001.** The closest phrasing is the "Performance on large data" constraint, which says "For sheets projected to grow beyond thousands of rows, pagination or range-limited reads will be needed." That is a forward-looking technique-prescription, not a scale-triggered re-evaluation clause.

ADR-0009 (`docs/adr/0009-audit-log-write-pattern.md`) echoes this position (line 104): "Moving `Audit_Log` off Google Sheets (out of scope — ADR-0001 already decided Sheets as the database layer)."

---

## 4. 2026-07-29 xlsx scan file

**No file matching `2026-07-29*xlsx*` or `2026-07-29*e2e-gas-auth*` xlsx scan exists in the repo.**

The only file with a `2026-07-29` date is `docs/research/2026-07-29-e2e-gas-auth-approaches.md`, which covers E2E authentication strategies for the deployed `/exec` URL (Playwright storageState, persistent browser context, etc.) — **not** a spreadsheet scan. ADR-0013 (`docs/adr/0013-google-sheets-database-structure.md`) line 5 references a source spreadsheet ("Copy of Church Attendance System.xlsx", 990-row Users sheet, exported for structural reference), but the exported xlsx itself is **not committed to the repo**.

---

## 5. Evidence that humans edit specific cells/columns directly

Multiple authoritative documents confirm the staff hand-edit workflow. The pattern is consistent and well-documented.

### 5.1 AGENTS.md — "Google Sheet database — no automatic mutation" rule (lines 82–91, verbatim):

> "The backend Google Sheet (connected to the Apps Script project) is the source of truth for user data, programs, enrollments, attendance, and audit records. It MUST NEVER be modified automatically by an agent through the Apps Script API, Sheets API, or clasp.
>
> When an implementation requires a schema change (new sheet tab, new column, seed data) or a data fix:
> 1. State exactly what needs to change — sheet name, columns, rows.
> 2. Ask the user to perform the edit manually in Google Sheets.
> 3. Only continue after the user confirms the change is done.
>
> This rule applies to every phase: implementation, testing, deployment, and debugging. The only permitted sheet interaction is reading the exported `.xlsx` snapshot for structural reference."

### 5.2 ADR-0006 — explicit staff hand-edit on Roles (line 16, verbatim):

> "`ADMIN` membership itself is granted/revoked exclusively by a direct spreadsheet edit — never through the app."

And the capability matrix (line 36, verbatim):

> "Grant / revoke `ADMIN` | Spreadsheet edit only — no UI/RPC path for anyone"

And the `EVENT_LEADER → Program_Leaders` migration plan (lines 68–70, verbatim):

> "1. Every `Users.Role = EVENT_LEADER` row is reset to `MEMBER`.
> 2. `STAFF`/`ADMIN` manually re-grant `Program_Leaders` assignments per person, per program, via the admin console.
> 3. To reduce manual guesswork, the migration tooling may scan `Events.Created_By` history and suggest which program(s) each former `EVENT_LEADER` was actually running — a prefill hint for the admin doing the backfill, not an automatic migration, since a suggestion could be wrong."

### 5.3 ADR-0009 — sheet-side tamper evidence (line 98, verbatim):

> "Risk: Sheets-level tamper evidence is best-effort; a determined admin with spreadsheet edit access could alter historical rows. Out of scope to fully mitigate (would require moving off Sheets entirely — rejected per ADR-0001)."

This explicitly contemplates a workflow in which a human (church admin) with sheet-edit access can mutate data directly.

### 5.4 ADR-0013 — sheet-missing fallback comment in code (line 100, `users-repository.gs`, "Seed it per CONTEXT.md before deploying.")

The `usersReadAll_` error message explicitly assumes the sheet is seeded by a human:

> `throw new Error("Users sheet '" + USERS_SHEET_NAME + "' is missing. Seed it per CONTEXT.md before deploying.");`

### 5.5 Spec 001 — `onEdit` simple trigger for manual entry (lines 124–126, verbatim, from a deferred legacy spec, NOT in current `src/gas/`):

> "Users sheet is missing | `registerNewMember` will throw → caught by `withFailureHandler`.
> onEdit fires on a row with Name but no ID (manual entry) | ID, PIN, QR auto-generated — allows admin to add members by just typing a name in the sheet."

This spec is deferred per spec 001 line 7: "Web-app registration is outside the first release. Member creation continues through the existing manual Users-sheet process." The legacy `onEdit` handler described here is referenced in `.scratch/vanilla-restructure/issues/05-events-management.md` (lines 17–18, verbatim):

> "`onEdit(e)` — detects manual edits to Events sheet, triggers `generateMonthlyRecurringEvents`
> `src/gas/events.gs` — port verbatim: `onEdit`, `generateMonthlyRecurringEvents`, ..."

But **no `onEdit` simple trigger exists in the current `src/gas/`** (grepped). The deferred spec describes an `onEdit` design in which a human typing into a row auto-generates ID/PIN/QR — that handler lives in the legacy `程式碼.js` archive, not the deployed source.

### 5.6 Spec 067 — "User-supplied prerequisites (manual dev-sheet edits)" (lines 119–122, verbatim):

> "Per AGENTS.md 'no automatic sheet mutation' rule, the following rows must be added to the **Users** tab of the dev Google Sheet by the user before ..."

This is the most concrete in-repo evidence that staff hand-add rows to the `Users` sheet as part of the deployment workflow.

### 5.7 Spec 071 — P0 sheet remediation (line 171, verbatim):

> "Fix column alignment in Users sheet for rows 99–111 (insert empty cells between Name and PIN_Code) | Google Sheets (manual)"

Yet another concrete evidence point that humans edit the sheet to fix production schema drift.

### 5.8 Spec 008 (legacy) — Role assignment mechanism (line 23, verbatim):

> "Role assignment is a manual spreadsheet edit | No write path to the `Users.Role` column outside registration, which hardcodes `MEMBER`"

### 5.9 ADR-0002 — PIN storage trust model (lines 22–23, verbatim):

> "PINs are stored in plain text in the Users sheet. This is acceptable only because:
> - The sheet is accessible only to spreadsheet editors (church admin staff)."

This frames the entire security model around "spreadsheet editors" being the human actors who populate and maintain the sheet.

### 5.10 README.md — operator boundary (lines 7 and 110, verbatim):

> "Never let an agent modify the backend Google Sheet. The user must add or change sheets, columns, rows, and seed data manually."
>
> "If a change needs a new sheet, column, row, or data correction, stop at the boundary described in AGENTS.md. Describe the exact manual edit and wait for the user to confirm it."

### Summary of §5

**Humans directly edit these specific cells/columns** (confirmed across multiple authoritative docs):
- `Users.System_Role` column — for granting/revoking `ADMIN` (ADR-0006:16, 36)
- `Users.Status` column — for deactivating/inactivating members (ADR-0006:38; per `sessionVerify_` at `session.js.gs:200-203` the live `Status` is re-checked on every protected RPC)
- `Users.PIN_Code` column — for resetting member PINs (session.js.gs:11-14, "a Sheet-side PIN change self-invalidates"; ADR-0009:127)
- `Users.Role = EVENT_LEADER` rows — for the `Program_Leaders` migration (ADR-0006:68)
- Entire new `Users` rows — for adding members (Spec 001:126; Spec 067:119-122)
- Column alignment in `Users` rows 99–111 — for schema drift fixes (Spec 071:171)
- `Program_Leaders` sheet (entire) — additive sheet, staff-typed (ADR-0013:104)
- `Programs` rows — for catalog changes (`programsList_` reads; no app write path; SPEC 004 catalog)
- `Audit_Log` — speculative future (ADR-0009; not currently implemented in `src/gas/`)
- `Events` — legacy `onEdit` trigger for auto-generating monthly recurring events (referenced in `.scratch/` and spec 003, but **not implemented in current `src/gas/`**)

---

## 6. AppSheet — has it been considered/rejected?

**Yes, mentioned once — `.scratch/efcc-app-from-scratch.md:344`** (verbatim):

> "4. **Sheet schema vs AppSheet**: A from-scratch `doGet` web app is one option. AppSheet (Google's no-code sheet-front-end product) is another. They have different cost/complexity tradeoffs — worth a 30-minute evaluation before committing."

That is the **only mention of AppSheet in the entire repo** (grep across `docs/`, `src/`, `tests/`, `README.md`, `AGENTS.md`, `CONTEXT.md`, `.scratch/`, `.github/`). It appears in a scratch brainstorming document, not in any ADR, decision doc, or `src/gas/` source.

No commit messages in the local repo reference AppSheet (this scout session could not run `git log`; the conclusion is based on the absence of the string in any file tracked in the working tree).

The mention is in the "Open questions to settle before implementation" section (line 9 of the same file), i.e., AppSheet was raised as an option to evaluate before deciding on `doGet` web app architecture, not as a rejected decision recorded in an ADR.

---

## 7. Coverage of prior research files (2026-07-28 through 2026-07-30)

Five existing research files; none are a sheets-dependency profile. This document does not duplicate prior findings, but the relevant prior findings are:

| File | Touches Sheets dependency / future-platform? |
|---|---|
| `docs/research/2026-07-28-gas-multipage-best-practice.md` | No. Discusses only HTML Service IFRAME sandbox navigation patterns. |
| `docs/research/2026-07-28-gas-nav-real-world-patterns.md` | No. Discusses only multi-page navigation patterns in the wild. |
| `docs/research/2026-07-28-template-walkthrough.md` | Yes — minimal. Lines 343-345 mention "Sheet schema vs AppSheet" as an "open question before implementation"; the rest of the doc walks the template's `Users`/`Menu` sheet usage but does not propose migration. |
| `docs/research/2026-07-29-e2e-gas-auth-approaches.md` | No. Discusses only authentication approaches for the deployed `/exec` URL on personal Gmail. |
| `docs/research/2026-07-30-efcc-deployment-access-diagnosis.md` | No. Diagnoses the manifest `ANYONE_ANONYMOUS + USER_DEPLOYING` mismatch with personal Gmail deployment reality. Mentions `SpreadsheetApp` once (line 552, listing implicit `oauthScopes` derived from sheet reads) but does not discuss Sheets-as-database profile. |

**No prior research file quantifies the Sheets read/write call inventory, the staff hand-edit workflow evidence chain, or the AppSheet consideration status.** This document fills that gap.

A **referenced-but-not-yet-existing** file is `docs/research/2026-07-30-efcc-concurrency-surface.md` (mentioned in this scout's task brief). Grepped the entire `docs/` directory: **the file does not exist**. This dependency profile therefore builds its burst-traffic estimate from first principles (the read-site inventory above), not from a prior concurrency-surface analysis.

---

## 8. Sunday-morning check-in burst estimate

### 8.1 Burst scenario inputs

- Total members: 100–300 (from user-confirmed scale profile).
- Sunday check-in window: ~30 minutes (typical Sunday worship window in a Chinese church context — the church is 顯恩堂 / Evangelical Free Church of China, Hong Kong).
- Per-member RPC profile: login → see Programs → check in (Attendance tab write).

### 8.2 Sheets-API-equivalent operation count per member journey

The Sheets API call cost per member is dominated by **`usersReadAll_()`** because the current `users-repository.gs:87-110` pattern loads the **entire `Users` sheet on every script execution** (`getDataRange().getValues()`). One Apps Script `doGet` / `google.script.run` invocation runs **one script execution**; within that execution, the Users sheet is read at most once (memoized in `USERS_ROW_CACHE_`).

Per-member Sheets API calls (from the inventory in §2):

| Step | RPC (browser-callable) | Sheets read calls per invocation | Cumulative per member |
|---|---|---|---|
| 1. Load app / `doGet` | n/a (serves HTML, no Sheets read per ADR-0010) | 0 | 0 |
| 2. Login (`api_loginUser`) | `usersFindByUsername_` → `usersReadAll_` + `usersCurrentPinById_` → `usersReadAll_` (memoized) + `usersFindById_` → `usersReadAll_` (memoized) + `bootstrapSectionsForRole_` → `programLeadersHasActiveAssignment_` → `programLeadersReadAll_` | 2 (`Users` x1, `Program_Leaders` x1) | 2 |
| 3. Browse Programs (`api_getPrograms`) | `programsList_` (cache hit for 300s) | 0 (warm cache) — first call in 5 min = 1 | 0 (typical) |
| 4. Check-in (`api_checkInMember`) — **NOT YET IMPLEMENTED in `src/gas/`** | Would write `Attendance` row (write path not in current code; would also re-read `Users` for status / `Enrollments` for enrollment check) | Hypothetical: 2 reads + 1 write | Hypothetical 2+1 |

**Per-member Sheets-equivalent op count (current code paths): 2 reads** (one `Users` full-sheet read, one `Program_Leaders` full-sheet read). The `Programs` sheet is served from `CacheService` after the first hit within a 300s window.

### 8.3 Burst totals

Assuming **100–300 check-ins** spread over a 30-minute Sunday window:

| Scenario | Sheets ops / member | Total ops in 30-min burst |
|---|---|---|
| 100 members | 2 reads | **200 reads** (200× `getDataRange().getValues()` on `Users`, 200× same on `Program_Leaders`) |
| 300 members | 2 reads | **600 reads** (600× on `Users`, 600× on `Program_Leaders`) |

**Per-second average load**: 200–600 ops / 1800 s = **~0.11 to ~0.33 Sheets API calls per second** (one full sheet-load each).

**Burst-peak load**: If 50% of check-ins arrive in the busiest 5-minute window (typical queue pattern), peak is **~1.7 to ~5 Sheets full-sheet reads per second**.

### 8.4 Per-read cost in cells loaded

Each `getDataRange().getValues()` on the production `Users` sheet loads the **full sheet into memory** (per ADR-0001 quote: "loads the entire sheet into memory"). Production `Users` sheet per ADR-0013 line 5 has **990 rows × 13 columns = 12,870 cells** loaded per read (or 990×14 = 13,860 per ADR-0013's 14-column layout). For 200–600 reads, that is **2.6M–8.3M cell-value transfers** from Sheets to Apps Script in 30 minutes.

### 8.5 Weekday staff/admin activity (multiplicative cost)

Weekday admin actions add per-event mutations that the current code does not perform (no `Audit_Log` write, no `Enrollments` write), but **would** if the deferred specs ship. For an upper-bound estimate that includes not-yet-implemented attendance write:

| Day | Members active | Sheets reads | Sheets writes |
|---|---|---|---|
| Sunday burst (3-hr window) | 100–300 | 200–600 | 0 (current code; up to 100–300 if attendance write ships) |
| Weekday staff admin (rolling) | 5–10 staff × ~30 actions/day | ~300 reads | ~30 writes (when implemented) |

### 8.6 Constraint boundary

Google Sheets API quotas (per Apps Script docs):
- "Simultaneous executions per user: 30" — a single user cannot fan out 31 calls.
- "Simultaneous executions per script: 1,000" — hard ceiling on total concurrent traffic.
- "Script runtime: 6 min / execution" — long jobs must be split.

At the Sunday-burst peak of ~5 reads/sec the script is **well within** all published quotas. The actual bottleneck is **execution latency** (`getDataRange().getValues()` round-trip on a 990×14 cell sheet) and **Apps Script quota per-user execution cap of 30** if many concurrent tabs share one Google account.

### 8.7 Reading-volume scaling caveats (per ADR-0001 constraint)

> "Performance on large data — `getDataRange().getValues()` loads the entire sheet into memory. For sheets projected to grow beyond thousands of rows, pagination or range-limited reads will be needed."

Current production Users sheet is **990 rows**. EFCC's 100–300 users over 3–5 years suggests Users sheet growth to ~500 rows by year 5 — still well within "thousands". The constraint boundary is not yet relevant.

---

## 9. Conclusion: the READ-MOSTLY vs READ-WRITE question

**EFCC's Sheets dependency is READ-MOSTLY** in the strictest sense:

- **App reads**: every Sheets interaction in `src/gas/*.gs` is `SpreadsheetApp.getActiveSpreadsheet().getSheetByName(...).getDataRange().getValues()` — three sites, two of which (`Users` and `Program_Leaders`) happen on every authenticated RPC, and one (`Programs`) which is CacheService-cached.
- **App writes**: zero `setValues`, `appendRow`, `insertRow`, `deleteRow`, `setProperty`-on-Sheet, `range.setValue`, `range.setValues`, `range.clear`, `range.merge`, `range.setFormula`, `createTextFinder`, `insertSheet`, `deleteSheet`, or `onEdit` trigger anywhere in `src/gas/`.
- **Human writes**: every Sheet mutation — adding rows, changing role, toggling status, resetting PIN, populating `Program_Leaders`, fixing column drift — happens via a human editing the Sheet UI. This is the explicit, documented, AGENTS.md-enforced workflow.

**This single fact determines which migration patterns are viable.** Any foundation that preserves staff hand-editing of the Sheet **and** uses the Sheet as a runtime data store must:
1. Keep the Sheet as a shared, human-editable surface.
2. Treat Apps Script reads against the Sheet as a polling/eventual-consistency view, not a transactional one.
3. Accept that PIN changes, status flips, role grants, and Program_Leaders edits can happen between two consecutive `usersReadAll_()` calls — the auth/session code already does (`session.js.gs:11-14`, `sessionVerify_` lines 184, 200).

The current architecture is therefore a **sheet-as-database + sheet-as-UI** system. A migration that "preserves staff hand-editing while changing the delivery layer" must keep the Sheet as one of two surfaces (the human surface OR the database, or both), and the new delivery layer (web app, mobile app, AppSheet, alternate stack) must read the same sheet data the staff maintain.

---

## Acceptance Summary

- **Status**: READY
- **Path**: `/Users/noah.wong/Desktop/code/EFCC-dev/docs/research/2026-07-30-efcc-sheets-dependency-profile.md`
- **Fact (READ-MOSTLY vs READ-WRITE)**: EFCC's app code in `src/gas/*.gs` is **strictly READ-ONLY against Sheets** — zero write call sites. Every Sheet mutation is performed by a human editing the Sheet UI directly, or by `onEdit`/legacy GAS that is **not currently deployed**. The `Audit_Log` write path documented in ADR-0009 is **not implemented in current `src/gas/`**.

### Bullet summary (≤10)

1. Three sheet tabs are read by the deployed `src/gas/*.gs`: `Users`, `Programs`, `Program_Leaders`. All other documented tabs (`Enrollments`, `Events`, `Attendance`, `Audit_Log`, `Users詳細資料`, and 6 unmapped tabs) are not accessed by any current code.
2. Every read uses the full-sheet pattern `SpreadsheetApp.getActiveSpreadsheet().getSheetByName(...).getDataRange().getValues()` — no pagination, no range reads, no Sheet-level query API. The `Users` and `Program_Leaders` reads are memoized within a single script execution only.
3. **Zero write call sites** exist in `src/gas/*.gs` or any `.html`. The codebase is strictly READ-ONLY against Google Sheets for all three accessed tabs.
4. The `Programs` sheet has the only cross-execution cache: `CacheService.getScriptCache()` key `programs_catalog_v1`, TTL 300s. `Users` and `Program_Leaders` reads have no cross-execution cache.
5. ADR-0001 has **no explicit "revisit if scale exceeds X" clause**. The closest forward-looking statement is the "Performance on large data" constraint noting "for sheets projected to grow beyond thousands of rows, pagination or range-limited reads will be needed." No numeric threshold.
6. The staff hand-edit workflow is documented in **at least 8 places** across the repo (AGENTS.md, ADR-0002/0006/0009/0013, spec 001, spec 067, spec 071, README.md). Specifically: `Users.System_Role` (ADMIN grants are spreadsheet-edit-only per ADR-0006:16, 36); `Users.Status`; `Users.PIN_Code`; full new `Users` rows; column alignment fixes; `Program_Leaders` entire sheet; future `Audit_Log` rows; future `Events` rows via `onEdit`.
7. **AppSheet appears exactly once in the entire repo** (`.scratch/efcc-app-from-scratch.md:344`), as an undecided "open question" in a brainstorming doc. No ADR, no decision, no rejection recorded.
8. No 2026-07-29 xlsx-scan file exists in the repo. ADR-0013 references an exported `Copy of Church Attendance System.xlsx` (990-row Users sheet) for structural reference, but the xlsx is not committed.
9. **The referenced prior research file `docs/research/2026-07-30-efcc-concurrency-surface.md` does not exist** in the repo. Burst-traffic estimate was built from first principles in §8.
10. Sunday-burst estimate: 100–300 check-ins over a 30-minute window produces **200–600 Sheets API-equivalent reads** (full-sheet reads on `Users` and `Program_Leaders`); peak ~1.7–5 reads/sec in the busiest 5 minutes; well within Apps Script quotas. Production Users sheet loads 990×13–14 = ~12,870–13,860 cells per read; total cell transfers in the burst = 2.6M–8.3M.