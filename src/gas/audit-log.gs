/**
 * EFCC 顯恩堂 - Audit_Log append helper for the check-in critical section.
 *
 * Schema per ADR-0009 (extended Audit_Log):
 *   Log_ID | Timestamp | Actor_User_ID | Action_Type | Target_User_ID |
 *   Old_Value | New_Value | Reason | Outcome | Correlation_ID | Actor_Session_Key
 *
 * DIVERGENCE FROM ADR-0009 (documented): ADR-0009's `writeAuditLog` acquires
 * its own LockService lock, uses `Session.getTemporaryActiveUserKey()` for
 * `Actor_Session_Key`, and mandates a two-phase ATTEMPT/SUCCESS write per
 * privileged function. This helper diverges on all three, by design:
 *   1. NON-LOCKING - the check-in critical section already holds the single
 *      caller-owned script lock (spec #006 §3 / #51), and Apps Script does
 *      not document script locks as re-entrant; a nested lock acquisition is
 *      forbidden. This is the "internal audit append helper that does not
 *      acquire the script lock again" mandated by spec #006 §3.
 *   2. Actor_Session_Key = EFCC sessionId, not Session.getTemporaryActiveUserKey().
 *      The web app executes as USER_DEPLOYING (appsscript.json) so the Google
 *      session key is the deployer's, not the operator's; the EFCC session is
 *      the authoritative actor identity per issue #73.
 *   3. SINGLE-PHASE SUCCESS write (not ATTEMPT+SUCCESS). Issue #101 specifies
 *      "one audit entry" per first-create. ADR-0009's two-phase pattern serves
 *      privileged mutations (role change/approval) where a separate "attempt"
 *      state must be reconstructable; for high-frequency check-in the
 *      Attendance append is the only data mutation and either commits or
 *      throws (surfaced as INTERNAL_ERROR with no SUCCESS audit). Re-grill if
 *      two-phase check-in audit is later required.
 *
 * Per ADR-0009, an audit-write failure must NOT be silently swallowed -
 * this helper lets appendRow exceptions propagate to the caller, which
 * surfaces them as a caller-visible error (non-repudiation).
 *
 * Apps Script APIs used (per AGENTS.md docs-backed method rule):
 *   - Sheet.appendRow(rowContents):
 *     https://developers.google.com/apps-script/reference/spreadsheet/sheet#appendRow(Object)
 *     ("Appends a row to the bottom of the current data region in the
 *     sheet. rowContents - any[] ... Return type Sheet.")
 *   - Utilities.getUuid():
 *     https://developers.google.com/apps-script/reference/utilities/utilities#getUuid()
 */

var AUDIT_LOG_SHEET_NAME = "Audit_Log";

/**
 * Append one Audit_Log row. NON-LOCKING: the caller must already hold the
 * caller-owned script lock. Columns follow ADR-0009 order.
 *
 * @param {{actorUserId: string, actionType: string, targetUserId: string,
 *          oldValue: string, newValue: string, reason: string,
 *          outcome: string, correlationId: string,
 *          actorSessionKey: string}} entry
 */
function auditAppend_(entry) {
  var sheet = efccSpreadsheet_().getSheetByName(AUDIT_LOG_SHEET_NAME);
  if (!sheet) {
    throw new Error(
      "Audit_Log sheet '" + AUDIT_LOG_SHEET_NAME + "' is missing."
    );
  }
  sheet.appendRow([
    Utilities.getUuid(), // Log_ID
    new Date(), // Timestamp
    entry.actorUserId, // Actor_User_ID
    entry.actionType, // Action_Type
    entry.targetUserId, // Target_User_ID
    entry.oldValue || "", // Old_Value
    entry.newValue || "", // New_Value
    entry.reason || "", // Reason
    entry.outcome || "SUCCESS", // Outcome
    entry.correlationId, // Correlation_ID
    entry.actorSessionKey || "", // Actor_Session_Key
  ]);
}
