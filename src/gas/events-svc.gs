// =========== Events — Triggers, CRUD, & Granted-User Query ===========
// Trigger setup: After clasp push, open GAS Editor → Triggers → Add Trigger →
// generateMonthlyRecurringEvents → Time-driven → Month timer → 1st of month.

// ---------------------------------------------------------------------------
// onEdit — Simple Trigger: generates monthly recurring events on manual edit
// ---------------------------------------------------------------------------

function onEdit(e) {
  const sheet = e.source.getActiveSheet();
  if (sheet.getName() !== "Users") {return;}
  const range = e.range;
  const rowStart = range.getRow();
  const rowEnd = range.getLastRow();

  if (rowStart === 1 && rowEnd === 1) {return;}

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idCol = headers.indexOf("User_ID") + 1;
  const nameCol = headers.indexOf("Name") + 1;
  const pinCol = headers.indexOf("PIN_Code") + 1;
  const qrCol = headers.indexOf("QR_Code_String") + 1;

  for (let i = rowStart; i <= rowEnd; i++) {
    const nameValue = sheet.getRange(i, nameCol).getValue();
    const idValue = sheet.getRange(i, idCol).getValue();

    if (nameValue && !idValue) {
      const hex1 = Math.floor(Math.random() * (65535 - 4096 + 1) + 4096)
        .toString(16)
        .toUpperCase();
      const hex2 = Math.floor(Math.random() * (65535 - 4096 + 1) + 4096)
        .toString(16)
        .toUpperCase();
      const newHexId = "GC-" + hex1 + "-" + hex2;
      const newPin = Math.floor(Math.random() * (9999 - 1000 + 1) + 1000);

      sheet.getRange(i, idCol).setValue(newHexId);
      sheet.getRange(i, pinCol).setValue(newPin);
      sheet.getRange(i, qrCol).setValue(newHexId);
    }
  }
}

// ---------------------------------------------------------------------------
// generateMonthlyRecurringEvents — Time-driven: generates events for next month
// ---------------------------------------------------------------------------

function generateMonthlyRecurringEvents() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const eventsSheet = ss.getSheetByName("Events");
  if (!eventsSheet) {return;}

  // 1. DEFINE YOUR RECURRING PROGRAMS HERE
  // dayOfWeek: 0 = Sunday, 1 = Monday, 2 = Tuesday, etc.
  const recurringPrograms = [
    {
      programId: "dd646847", // Replace with your actual Program_ID
      dayOfWeek: 0, // Sunday
      startTime: "3:00 PM",
      // endTime: "4:00 PM",
      namePrefix: "青崇",
    },
    // {
    //   programId: "PRG-WEDNESDAY", // Replace with your actual Program_ID
    //   dayOfWeek: 3,               // Wednesday
    //   startTime: "07:30 PM",
    //   endTime: "09:00 PM",
    //   namePrefix: "Wednesday Bible Study"
    // }
  ];

  // 2. CALCULATE THE TARGET MONTH (Next Month)
  const today = new Date();
  let targetYear = today.getFullYear();
  let targetMonth = today.getMonth() + 1; // +1 gets us to next month

  if (targetMonth > 11) {
    // If it's December, roll over to January of next year
    targetMonth = 0;
    targetYear++;
  }

  // Get the total number of days in the target month
  const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();

  // 3. GENERATE THE EVENTS
  const newRows = [];

  // Loop through every day of the target month
  for (let day = 1; day <= daysInMonth; day++) {
    const checkDate = new Date(targetYear, targetMonth, day);
    const currentDayOfWeek = checkDate.getDay();

    // Check if this day matches any of our recurring programs
    for (let p = 0; p < recurringPrograms.length; p++) {
      const prog = recurringPrograms[p];

      if (currentDayOfWeek === prog.dayOfWeek) {
        const dateString = Utilities.formatDate(
          checkDate,
          Session.getScriptTimeZone(),
          "dd/MM/YYYY"
        );
        // var timeSlot = prog.startTime + " - " + prog.endTime;
        const timeSlot = prog.startTime;
        const eventName = prog.namePrefix + " - " + dateString;
        const eventId = Utilities.getUuid().substring(0, 8).toUpperCase();

        // Push the new event to our array (Make sure this order matches your Events sheet columns)
        newRows.push([
          eventId, // Event_ID
          prog.programId, // Program_ID
          dateString, // Event_Date
          timeSlot, // Time_Slot
          eventName, // Event_Name
        ]);
      }
    }
  }

  // 4. WRITE TO SPREADSHEET (Bulk insert for performance)
  if (newRows.length > 0) {
    const startRow = eventsSheet.getLastRow() + 1;
    eventsSheet
      .getRange(startRow, 1, newRows.length, newRows[0].length)
      .setValues(newRows);
  }
}

// ---------------------------------------------------------------------------
// api_createEvent — Granted-user creates a new event
// ---------------------------------------------------------------------------

function api_createEvent(payload) {
  if (!payload) {return { success: false, message: "Missing payload." };}
  const userId = String(
    payload.createdBy == null ? "" : payload.createdBy
  ).trim();
  const sessionToken = String(
    payload.__sessionToken ||
      payload.sessionToken ||
      payload._sessionToken ||
      ""
  ).trim();
  if (!userId || !sessionToken)
    {return { success: false, message: "Missing user session." };}
  const check = checkIsGrantedUser_(userId, sessionToken);
  if (!check.granted) {return { success: false, message: check.message };}
  const role = check.role;

  if (role === "MEMBER") {
    return {
      message: "Permission denied. Only granted users can create events.",
      success: false,
    };
  }

  const eventName = String(
    payload.eventName == null ? "" : payload.eventName
  ).trim();
  const eventDate = String(
    payload.eventDate == null ? "" : payload.eventDate
  ).trim();
  const timeSlot = String(
    payload.timeSlot == null ? "" : payload.timeSlot
  ).trim();
  const programId = String(
    payload.programId == null ? "" : payload.programId
  ).trim();
  let eventType = String(payload.eventType == null ? "" : payload.eventType)
    .trim()
    .toUpperCase();
  if (eventType !== "REGULAR" && eventType !== "SPECIAL") {eventType = "REGULAR";}
  let recurrence = String(payload.recurrence == null ? "" : payload.recurrence)
    .trim()
    .toUpperCase();
  if (
    recurrence !== "NONE" &&
    recurrence !== "WEEKLY" &&
    recurrence !== "MONTHLY"
  )
    {recurrence = "NONE";}

  if (!eventName) {return { success: false, message: "Event name is required." };}
  if (!eventDate) {return { success: false, message: "Event date is required." };}
  if (!timeSlot) {return { success: false, message: "Time slot is required." };}
  if (!programId) {return { success: false, message: "Program ID is required." };}

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const eventsSheet = ss.getSheetByName("Events");
  if (!eventsSheet) {return { success: false, message: "Events sheet missing." };}

  const headers = eventsSheet
    .getRange(1, 1, 1, eventsSheet.getLastColumn())
    .getValues()[0];
  const mappedHeaders = headers.map(function (h) {
    return String(h)
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "");
  });

  function colIdx(names) {
    for (let n = 0; n < names.length; n++) {
      const idx = mappedHeaders.indexOf(
        names[n].toLowerCase().replace(/[\s_]+/g, "")
      );
      if (idx !== -1) {return idx;}
    }
    return -1;
  }

  const eventIdCol = colIdx(["Event_ID", "EventID"]);
  const progIdCol = colIdx(["Program_ID", "ProgramID"]);
  const eventNameCol = colIdx(["Event_Name", "EventName"]);
  const eventDateCol = colIdx(["Event_Date", "EventDate"]);
  const timeSlotCol = colIdx(["Time_Slot", "TimeSlot"]);
  const eventTypeCol = colIdx(["Event_Type", "EventType"]);
  const recurCol = colIdx(["Recurrence_Type", "RecurrenceType", "Recurrence"]);
  const statusCol = colIdx(["Status"]);
  const createdByCol = colIdx(["Created_By", "CreatedBy"]);
  const createdAtCol = colIdx(["Created_At", "CreatedAt"]);

  const newId = "EVT-" + Utilities.getUuid().substring(0, 8).toUpperCase();
  const now = new Date().toISOString();

  const row = new Array(headers.length).fill("");
  if (eventIdCol > -1) {row[eventIdCol] = newId;}
  if (progIdCol > -1) {row[progIdCol] = programId;}
  if (eventNameCol > -1) {row[eventNameCol] = eventName;}
  if (eventDateCol > -1) {row[eventDateCol] = eventDate;}
  if (timeSlotCol > -1) {row[timeSlotCol] = timeSlot;}
  if (eventTypeCol > -1) {row[eventTypeCol] = eventType;}
  if (recurCol > -1) {row[recurCol] = recurrence;}
  if (statusCol > -1) {row[statusCol] = "Active";}
  if (createdByCol > -1) {row[createdByCol] = userId;}
  if (createdAtCol > -1) {row[createdAtCol] = now;}

  eventsSheet.appendRow(row);

  return {
    data: {
      createdAt: now,
      createdBy: userId,
      eventDate: eventDate,
      eventId: newId,
      eventName: eventName,
      eventType: eventType,
      programId: programId,
      recurrence: recurrence,
      status: "ACTIVE",
      timeSlot: timeSlot,
    },
    success: true,
  };
}

// ---------------------------------------------------------------------------
// api_cancelEvent — Granted-user sets event Status to "Cancelled"
// ---------------------------------------------------------------------------

function api_cancelEvent(payload) {
  if (!payload) {return { success: false, message: "Missing payload." };}
  const eventId = String(payload.eventId == null ? "" : payload.eventId).trim();
  const userId = String(
    payload.cancelledBy == null ? "" : payload.cancelledBy
  ).trim();
  const sessionToken = String(
    payload.__sessionToken ||
      payload.sessionToken ||
      payload._sessionToken ||
      ""
  ).trim();
  if (!eventId) {return { success: false, message: "Event ID is required." };}
  if (!userId || !sessionToken)
    {return { success: false, message: "Missing user session." };}
  const check = checkIsGrantedUser_(userId, sessionToken);
  if (!check.granted) {return { success: false, message: check.message };}

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const eventsSheet = ss.getSheetByName("Events");
  if (!eventsSheet) {return { success: false, message: "Events sheet missing." };}

  const data = eventsSheet.getDataRange().getValues();
  if (!data || data.length < 2)
    {return { success: false, message: "No events found." };}
  const headers = data[0].map(function (h) {
    return String(h)
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "");
  });

  function colIdx(names) {
    for (let n = 0; n < names.length; n++) {
      const idx = headers.indexOf(names[n].toLowerCase().replace(/[\s_]+/g, ""));
      if (idx !== -1) {return idx;}
    }
    return -1;
  }

  const eventIdCol = colIdx(["Event_ID", "EventID"]);
  const statusCol = colIdx(["Status"]);
  if (eventIdCol === -1)
    {return { success: false, message: "Event_ID column not found." };}
  if (statusCol === -1)
    {return { success: false, message: "Status column not found." };}

  const targetId = normalizeId_(eventId);
  for (let i = 1; i < data.length; i++) {
    if (normalizeId_(data[i][eventIdCol]) !== targetId) {continue;}
    const rowNum = i + 1;
    eventsSheet.getRange(rowNum, statusCol + 1).setValue("Cancelled");
    return { message: "Event cancelled successfully.", success: true };
  }
  return { message: "Event not found.", success: false };
}

// ---------------------------------------------------------------------------
// api_getGrantedUserEvents — Returns active events accessible to granted user
// ---------------------------------------------------------------------------

function api_getGrantedUserEvents(grantedUserId, sessionToken) {
  if (!grantedUserId || !sessionToken) {
    return { message: "Missing user session.", success: false };
  }
  const check = checkIsGrantedUser_(grantedUserId, sessionToken);
  if (!check.granted) {return { success: false, message: check.message };}

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const eventsSheet = ss.getSheetByName("Events");
  if (!eventsSheet) {return { success: false, message: "Events sheet missing." };}

  const data = eventsSheet.getDataRange().getValues();
  if (!data || data.length < 2) {return { success: true, data: [] };}
  const headers = data[0].map(function (h) {
    return String(h)
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "");
  });

  function colIdx(names) {
    for (let n = 0; n < names.length; n++) {
      const idx = headers.indexOf(names[n].toLowerCase().replace(/[\s_]+/g, ""));
      if (idx !== -1) {return idx;}
    }
    return -1;
  }

  const eventIdCol = colIdx(["Event_ID", "EventID"]);
  const progIdCol = colIdx(["Program_ID", "ProgramID"]);
  const eventNameCol = colIdx(["Event_Name", "EventName"]);
  const eventDateCol = colIdx(["Event_Date", "EventDate"]);
  const timeSlotCol = colIdx(["Time_Slot", "TimeSlot"]);
  const eventTypeCol = colIdx(["Event_Type", "EventType"]);
  const recurCol = colIdx(["Recurrence_Type", "RecurrenceType", "Recurrence"]);
  const statusCol = colIdx(["Status"]);
  const createdByCol = colIdx(["Created_By", "CreatedBy"]);
  const createdAtCol = colIdx(["Created_At", "CreatedAt"]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const events = [];
  for (let i = 1; i < data.length; i++) {
    const rowStatus =
      statusCol > -1
        ? String(data[i][statusCol] == null ? "" : data[i][statusCol])
            .trim()
            .toLowerCase()
        : "";
    if (rowStatus !== "" && rowStatus !== "active") {continue;}

    const rawDate = data[i][eventDateCol];
    const eventDateStr = String(rawDate == null ? "" : rawDate).trim();
    if (!eventDateStr) {continue;}

    // Parse dd/MM/YYYY format (existing convention)
    const dateParts = eventDateStr.split("/");
    if (dateParts.length === 3) {
      const eventDate = new Date(
        parseInt(dateParts[2], 10),
        parseInt(dateParts[1], 10) - 1,
        parseInt(dateParts[0], 10)
      );
      if (eventDate < today) {continue;}
    }

    const createdBy =
      createdByCol > -1
        ? String(
            data[i][createdByCol] == null ? "" : data[i][createdByCol]
          ).trim()
        : "";
    const createdAt =
      createdAtCol > -1
        ? String(
            data[i][createdAtCol] == null ? "" : data[i][createdAtCol]
          ).trim()
        : "";
    let eventType =
      eventTypeCol > -1
        ? String(data[i][eventTypeCol] == null ? "" : data[i][eventTypeCol])
            .trim()
            .toUpperCase()
        : "REGULAR";
    if (eventType !== "REGULAR" && eventType !== "SPECIAL")
      {eventType = "REGULAR";}
    let recurrence =
      recurCol > -1
        ? String(data[i][recurCol] == null ? "" : data[i][recurCol])
            .trim()
            .toUpperCase()
        : "NONE";
    if (
      recurrence !== "NONE" &&
      recurrence !== "WEEKLY" &&
      recurrence !== "MONTHLY"
    )
      {recurrence = "NONE";}

    events.push({
      createdAt: createdAt || undefined,
      createdBy: createdBy || undefined,
      eventDate: eventDateStr,
      eventId: eventIdCol > -1 ? normalizeId_(data[i][eventIdCol]) : "",
      eventName:
        eventNameCol > -1
          ? String(
              data[i][eventNameCol] == null ? "" : data[i][eventNameCol]
            ).trim()
          : "",
      eventType: eventType,
      programId: progIdCol > -1 ? normalizeId_(data[i][progIdCol]) : "",
      programName: "",
      recurrence: recurrence,
      status: "ACTIVE",
      timeSlot:
        timeSlotCol > -1
          ? String(
              data[i][timeSlotCol] == null ? "" : data[i][timeSlotCol]
            ).trim()
          : "",
    });
  }

  // Sort by eventDate ascending
  events.sort((a, b) => {
    var da = a.eventDate.split("/");
    var db = b.eventDate.split("/");
    if (da.length === 3 && db.length === 3) {
      var dateA = new Date(
        parseInt(da[2], 10),
        parseInt(da[1], 10) - 1,
        parseInt(da[0], 10)
      );
      var dateB = new Date(
        parseInt(db[2], 10),
        parseInt(db[1], 10) - 1,
        parseInt(db[0], 10)
      );
      return dateA - dateB;
    }
    return 0;
  });

  return { data: events, success: true };
}
