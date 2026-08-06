# ADR-0009 — Audit Log Write Pattern (LockService + Extended Schema)

- **Status**: Superseded (Proposed, 2026-08-01) by ADR-0023 for the write-pattern shape (lock ownership, two-phase `ATTEMPT`/outcome calls) and schema (`Outcome`/`Correlation_ID`/`Actor_Session_Key` columns) — ADR-0023 itself remains `Proposed` pending deployed `/exec` proof, per the `AGENTS.md` evidence gate. Non-repudiation principle and audit-write-must-not-be-swallowed rule carried forward unchanged — see ADR-0023.
- **Deciders**: Noah Wong, OMP planner (grill-with-docs)
- **Date**: 2026-07-28
- **Related**: ADR-0006 (Audit_Log sheet origin), ADR-0008 (restart from template — this ADR covers a sub-decision of the rebuild), ADR-0023 (supersedes this ADR's write-pattern shape and schema)
- **Research**: primary-sourced via `web_search` + librarian subagent (Context7 was unreachable — see `CONTEXT.md` Known Tooling Issues)

## Context

`程式碼.js` and the current `src/gas/` write ad-hoc `Audit_Log` rows from individual privileged functions (role change, member approval, event cancellation). The rebuild (ADR-0008) needs a single, deliberate write pattern before porting these functions. Grill Session 5 asked: per-function ad-hoc writes (Option A), a decorator/wrapper (Option B), or a single explicit helper (Option C)?

## Decision

**Option C — single explicit helper**, refined by primary-source research into:

```js
function writeAuditLog(actorId, actionType, targetId, oldValue, newValue, reason, outcome, correlationId) {
  outcome = outcome || 'ATTEMPT';
  correlationId = correlationId || Utilities.getUuid();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Audit_Log');
    var row = [
      Utilities.getUuid(),          // Log_ID (row-local, not depended on for global uniqueness)
      new Date(),                   // Timestamp
      actorId,                      // Actor_User_ID
      actionType,                   // Action_Type
      targetId,                     // Target_User_ID
      oldValue,                     // Old_Value
      newValue,                     // New_Value
      reason,                       // Reason
      outcome,                      // Outcome (NEW — ATTEMPT | SUCCESS | ERROR | DENIED)
      correlationId,                // Correlation_ID (NEW — shared by the ATTEMPT row and its outcome row)
      Session.getTemporaryActiveUserKey(), // Actor_Session_Key (NEW — privacy-safe actor proxy)
    ];
    sheet.appendRow(row);
    console.log(JSON.stringify({ audit: row }));  // out-of-band copy in Cloud Logging
  } finally {
    lock.releaseLock();
  }
  return correlationId;
}

// Usage in a privileged function — two-phase ATTEMPT then SUCCESS/ERROR:
function approveMember(actorId, targetId, reason) {
  var correlationId = writeAuditLog(actorId, 'MEMBER_APPROVE', targetId, 'Pending', 'Active', reason, 'ATTEMPT');
  try {
    // ... perform the actual Sheets mutation (e.g. set Status = 'Active') ...
    writeAuditLog(actorId, 'MEMBER_APPROVE', targetId, 'Pending', 'Active', reason, 'SUCCESS', correlationId);
  } catch (e) {
    writeAuditLog(actorId, 'MEMBER_APPROVE', targetId, 'Pending', 'Active', reason, 'ERROR', correlationId);
    throw e;
  }
}
```

- **Called explicitly, twice, per privileged function** — once for `ATTEMPT` before the mutation, once for `SUCCESS` or `ERROR` after — sharing one `Correlation_ID`. No decorator/wrapper. GAS V8 has no clean decorator syntax; a Proxy-based wrapper adds debugging complexity without proportional benefit for ~15-20 privileged functions.
- **Atomicity across the audit log and the data mutation is IMPOSSIBLE in Google Sheets/Apps Script — this ADR does not claim to solve it, only to make failures reconstructable.** Sheets has no cross-write transactions; `appendRow` and a subsequent `setValue`/row-update are two independent, non-atomic operations. A single "log after mutation" write cannot roll back an already-committed mutation. A single "log before mutation, always SUCCESS" write is *equally wrong* — it invents a false success record if the mutation then throws. The two-phase `ATTEMPT` → `SUCCESS`/`ERROR` pattern above is the mitigation: it does not achieve atomicity, but it makes the failure mode legible — an `ATTEMPT` row with no matching outcome row means the process crashed mid-flight (lock timeout, script timeout, quota) between the two writes, and that gap is itself detectable by a periodic audit query (`Correlation_ID`s with exactly one row).
- If the `ATTEMPT` write itself throws (lock timeout, quota, permission), the mutation code is never reached — nothing to undo, because nothing was attempted. This is the one case where "the action never happened" is literally true.
- A silently-swallowed audit-write failure would be a worse security posture than surfacing it as a caller-visible error (non-repudiation) — so neither `writeAuditLog()` call should be wrapped in a try/catch that discards the exception.
- **Extended schema** — three new columns added to `Audit_Log`: `Outcome`, `Correlation_ID`, `Actor_Session_Key`. See rationale below.

## Schema Change

| Column | Status | Rationale |
|---|---|---|
| `Log_ID` | existing | Row PK, `Utilities.getUuid()` |
| `Timestamp` | existing | `new Date()` |
| `Actor_User_ID` | existing | Already opaque per-user ID — no PII change needed |
| `Action_Type` | existing | — |
| `Target_User_ID` | existing | — |
| `Old_Value` | existing | — |
| `New_Value` | existing | — |
| `Reason` | existing | — |
| **`Outcome`** | **NEW** | Distinguishes `SUCCESS` / `DENIED` / `ERROR`. Current schema cannot tell "approved" from "approval attempted and rejected". |
| **`Correlation_ID`** | **NEW** | Threads one logical action across multiple server calls (e.g. approve-then-notify). Separate from `Log_ID` because `Utilities.getUuid()` is documented as not globally-unique-guaranteed. |
| **`Actor_Session_Key`** | **NEW** | `Session.getTemporaryActiveUserKey()` — Apps Script's documented privacy-preserving actor proxy (rotates ~monthly). Apps Script web apps cannot read client IP; this is the closest available substitute. |

## Rationale (primary sources)

1. **LockService pattern** — `LockService.getScriptLock()` / `waitLock(30000)` / `releaseLock()` is the canonical Apps Script pattern for concurrent writes to a shared resource (Google's own form-submit example uses this exact shape). Source: `developers.google.com/apps-script/reference/lock/lock`, `lock-service`.
2. **Audit-write failure must block the action** — OWASP Logging Cheat Sheet lists "assisting non-repudiation controls" as a security use case and requires testing "the effect on the application of logging failures". Source: `cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html`.
3. **Schema gaps (`Outcome`, `Correlation_ID`, actor-session proxy)** — derived from OWASP's required "when/where/who/what" event attributes, cross-checked against Google Workspace Admin's own audit log shape (actor/event/date/target). Sources: OWASP cheat sheet; `support.google.com/a/answer/4579579`.
4. **`Utilities.getUuid()` caveat** — "not guaranteed to be unique across all time and space... do not use in situations where guaranteed uniqueness is required." Used for `Correlation_ID`, not relied on as the sole `Log_ID` uniqueness guarantee. Source: `developers.google.com/apps-script/reference/utilities/utilities`.
5. **Apps Script quota gotchas** — 6 min/execution runtime cap, 30 concurrent executions/user; `appendRow` can throw `"Service invoked too many times"`. The audit helper must NOT swallow this exception. Source: `developers.google.com/apps-script/guides/services/quotas`.
6. **PII discipline** — Apps Script's own logging guide recommends avoiding email addresses in logs; store opaque `Actor_User_ID` (already the case) and avoid PINs/phone numbers in `Old_Value`/`New_Value`. Source: `developers.google.com/apps-script/guides/logging`.
7. **Immutability is best-effort, not cryptographic** — Sheets has no native row-locking. Mitigation: `Audit_Log` in its own tab, script-only write path (no client-side write surface), optional protected-range warning on the header + periodic off-sheet export for tamper evidence. Sources: same Apps Script logging guide; OWASP (separate restrictive-permission log account).

## Consequences

- Positive: single, auditable, explicit call site per privileged function — easy code review.
- Positive: non-repudiation preserved via an honest ATTEMPT/outcome trail — no false success record, no false rollback claim; a crashed mid-flight action is detectable (unmatched `Correlation_ID`) rather than silently invisible.
- Positive: `Outcome`/`Correlation_ID`/`Actor_Session_Key` close real gaps identified against OWASP's event-attribute checklist.
- Negative: every privileged function must remember to call `writeAuditLog(...)` — no automatic enforcement (accepted tradeoff; GAS V8 has no clean decorator mechanism).
- Negative: `LockService.getScriptLock()` serializes ALL privileged writes across ALL users — acceptable for EFCC's expected concurrency (a handful of staff/leaders at a time), but would not scale to high-concurrency workloads.
- Risk: Sheets-level tamper evidence is best-effort; a determined admin with spreadsheet edit access could alter historical rows. Out of scope to fully mitigate (would require moving off Sheets entirely — rejected per ADR-0001).

## Non-goals

- Cryptographic hash-chaining of audit rows (rejected — impractical in Sheets without significant custom tooling; not required by current threat model).
- Decorator/wrapper-based automatic audit injection (rejected in Grill 5.1 — GAS V8 has no clean syntax for it).
- Moving `Audit_Log` off Google Sheets (out of scope — ADR-0001 already decided Sheets as the database layer).