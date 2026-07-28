function writeAuditLog(actorId, actionType, targetId, oldValue, newValue, reason, outcome, correlationId) {
  outcome = outcome || 'ATTEMPT';
  correlationId = correlationId || Utilities.getUuid();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Audit_Log');
    if (!sheet) throw new Error('writeAuditLog: Audit_Log sheet is missing');
    var row = [
      Utilities.getUuid(),                 // Log_ID
      new Date(),                          // Timestamp
      actorId,                             // Actor_User_ID
      actionType,                          // Action_Type
      targetId,                            // Target_User_ID
      oldValue,                            // Old_Value
      newValue,                            // New_Value
      reason,                              // Reason
      outcome,                             // Outcome
      correlationId,                       // Correlation_ID
      Session.getTemporaryActiveUserKey(), // Actor_Session_Key
    ];
    sheet.appendRow(row);
    console.log(JSON.stringify({ audit: row }));
  } finally {
    lock.releaseLock();
  }
  return correlationId;
}
