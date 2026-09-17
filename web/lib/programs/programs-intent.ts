export type ProgramsMode = "participant" | "management";
export type ManagementEventAction = "edit" | "reschedule";

export type ProgramsTask =
  | "events"
  | "participants"
  | "schedule"
  | "settings"
  | "notifications";
export type ProgramsOrigin = "home" | "notices" | "messages" | "programs";
export type ProgramsEventFilter = "current" | "past" | "cancelled";
export type ProgramsParticipantTab = "pending" | "active" | "history";
export type ProgramsParticipantFilter =
  | "all"
  | "eligible"
  | "active"
  | "pending";
export type ProgramsSettingsSection =
  | "basics"
  | "publishing"
  | "enrollment"
  | "schedule"
  | "attendance";
export type ProgramsScheduleOrigin = "events" | "settings";
export type ProgramsScheduleEditor = "new-rule" | "edit-rule" | "new-exception";

export interface ProgramsIntent {
  mode: ProgramsMode;
  programId: string | null;
  /** Management directory department context. */
  departmentId?: string;
  hash: string | null;
  /** Management task carried by a direct Program workspace link. */
  task?: ProgramsTask;
  /** Management Event deep link, valid only with task === "events" or "participants". */
  eventId?: string;
  /** Optional initial management Event action, valid only for Event detail. */
  eventAction?: ManagementEventAction;
  /** Creation flash carried to the new management Cockpit. */
  created?: boolean;
  malformed: boolean;
  /** First-party Section that opened a participant detail intent. */
  origin?: ProgramsOrigin;
  /** Directory search retained while a management workspace is open. */
  directoryQuery?: string;
  /** Department Settings focused from the management directory. */
  departmentSettingsId?: string;
  /** Participant catalog search/filter retained across detail navigation. */
  catalogQuery?: string;
  catalogFilter?: ProgramsParticipantFilter;
  /** Events task filter retained across Event detail navigation. */
  eventFilter?: ProgramsEventFilter;
  /** Participants task tab/search retained across task navigation. */
  participantTab?: ProgramsParticipantTab;
  participantQuery?: string;
  /** Focused Settings section carried by a direct URL. */
  settingsSection?: ProgramsSettingsSection;
  /** Whether a focused Schedule was entered from Events or Settings. */
  scheduleOrigin?: ProgramsScheduleOrigin;
  scheduleEditor?: ProgramsScheduleEditor;
  scheduleRuleId?: string;
}

export interface ProgramsHrefIntent {
  mode: ProgramsMode;
  programId?: string | null;
  /** Management directory department context. */
  departmentId?: string | null;
  task?: ProgramsTask | null;
  eventId?: string | null;
  eventAction?: ManagementEventAction | null;
  hash?: string | null;
  /** Creation flash carried to the new management Cockpit. */
  created?: boolean;
  /** First-party Section that opened a participant detail intent. */
  origin?: ProgramsOrigin;
  directoryQuery?: string | null;
  departmentSettingsId?: string | null;
  catalogQuery?: string | null;
  catalogFilter?: ProgramsParticipantFilter | null;
  eventFilter?: ProgramsEventFilter | null;
  participantTab?: ProgramsParticipantTab | null;
  participantQuery?: string | null;
  settingsSection?: ProgramsSettingsSection | null;
  scheduleOrigin?: ProgramsScheduleOrigin | null;
  scheduleEditor?: ProgramsScheduleEditor | null;
  scheduleRuleId?: string | null;
}
const SAFE_PROGRAM_ID = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/u;
const SAFE_HASH = /^#[A-Za-z0-9._~-]{1,128}$/u;
const SAFE_EVENT_ID = /^[A-Za-z0-9-]{1,64}$/u;
// eslint-disable-next-line eslint/no-control-regex -- reject control characters at the URL trust boundary.
const SAFE_QUERY = /^[^\u0000-\u001F\u007F]{1,128}$/u;
const PROGRAM_TASKS: readonly ProgramsTask[] = [
  "events",
  "participants",
  "schedule",
  "settings",
  "notifications",
];
const PROGRAM_ORIGINS: readonly ProgramsOrigin[] = [
  "home",
  "notices",
  "messages",
  "programs",
];
const EVENT_FILTERS: readonly ProgramsEventFilter[] = [
  "current",
  "past",
  "cancelled",
];
const PARTICIPANT_TABS: readonly ProgramsParticipantTab[] = [
  "pending",
  "active",
  "history",
];
const PARTICIPANT_FILTERS: readonly ProgramsParticipantFilter[] = [
  "all",
  "eligible",
  "active",
  "pending",
];
const SETTINGS_SECTIONS: readonly ProgramsSettingsSection[] = [
  "basics",
  "publishing",
  "enrollment",
  "schedule",
  "attendance",
];
const SCHEDULE_ORIGINS: readonly ProgramsScheduleOrigin[] = [
  "events",
  "settings",
];
const SCHEDULE_EDITORS: readonly ProgramsScheduleEditor[] = [
  "new-rule",
  "edit-rule",
  "new-exception",
];

function isProgramsTask(value: string): value is ProgramsTask {
  return PROGRAM_TASKS.includes(value as ProgramsTask);
}

function isProgramsOrigin(value: string): value is ProgramsOrigin {
  return PROGRAM_ORIGINS.includes(value as ProgramsOrigin);
}

function isEventFilter(value: string): value is ProgramsEventFilter {
  return EVENT_FILTERS.includes(value as ProgramsEventFilter);
}

function isParticipantTab(value: string): value is ProgramsParticipantTab {
  return PARTICIPANT_TABS.includes(value as ProgramsParticipantTab);
}

function isParticipantFilter(
  value: string
): value is ProgramsParticipantFilter {
  return PARTICIPANT_FILTERS.includes(value as ProgramsParticipantFilter);
}

function isSettingsSection(value: string): value is ProgramsSettingsSection {
  return SETTINGS_SECTIONS.includes(value as ProgramsSettingsSection);
}

function isScheduleOrigin(value: string): value is ProgramsScheduleOrigin {
  return SCHEDULE_ORIGINS.includes(value as ProgramsScheduleOrigin);
}

function isScheduleEditor(value: string): value is ProgramsScheduleEditor {
  return SCHEDULE_EDITORS.includes(value as ProgramsScheduleEditor);
}

function singleParam(
  params: URLSearchParams,
  key: string
): { value: string | null; duplicate: boolean } {
  const values = params.getAll(key);
  return { value: values[0] ?? null, duplicate: values.length > 1 };
}

function parseSafeQuery(raw: { value: string | null; duplicate: boolean }): {
  value: string | undefined;
  malformed: boolean;
} {
  const value = raw.value === null || raw.value === "" ? undefined : raw.value;
  return {
    value: value && SAFE_QUERY.test(value) ? value : undefined,
    malformed:
      raw.duplicate || (value !== undefined && !SAFE_QUERY.test(value)),
  };
}

function parseEnum<T extends string>(
  raw: { value: string | null; duplicate: boolean },
  isValue: (value: string) => value is T,
  allowed: boolean
): { value: T | undefined; malformed: boolean } {
  const value =
    raw.value !== null && isValue(raw.value) ? raw.value : undefined;
  return {
    value,
    malformed: raw.duplicate || (raw.value !== null && (!value || !allowed)),
  };
}

function parseProgramIntent(
  rawProgram: { value: string | null; duplicate: boolean },
  rawProgramId: { value: string | null; duplicate: boolean }
): {
  id: string | null;
  malformed: boolean;
  supplied: string | null;
  duplicate: boolean;
} {
  const supplied = rawProgram.value ?? rawProgramId.value;
  const id =
    supplied === null || supplied === ""
      ? null
      : SAFE_PROGRAM_ID.test(supplied)
        ? supplied
        : null;
  return {
    id,
    malformed: supplied !== null && id === null,
    supplied,
    duplicate:
      rawProgram.duplicate ||
      rawProgramId.duplicate ||
      (rawProgram.value !== null && rawProgramId.value !== null),
  };
}

function parseDepartmentIntent(
  rawDepartment: { value: string | null; duplicate: boolean },
  mode: ProgramsMode
): {
  id: string | null;
  malformed: boolean;
  supplied: string | null;
  duplicate: boolean;
} {
  const parsed = parseProgramIntent(rawDepartment, {
    value: null,
    duplicate: false,
  });
  return {
    ...parsed,
    malformed:
      parsed.malformed ||
      (mode !== "management" && rawDepartment.value !== null),
  };
}

function parseDepartmentSettingsIntent(
  raw: { value: string | null; duplicate: boolean },
  mode: ProgramsMode,
  programId: string | null
): { value: string | undefined; malformed: boolean } {
  const value =
    raw.value !== null && SAFE_PROGRAM_ID.test(raw.value)
      ? raw.value
      : undefined;
  return {
    value,
    malformed:
      raw.duplicate ||
      (raw.value !== null &&
        (!value || mode !== "management" || programId !== null)),
  };
}

function parseScheduleEditorIntent(
  rawEditor: { value: string | null; duplicate: boolean },
  rawRuleId: { value: string | null; duplicate: boolean },
  mode: ProgramsMode,
  task: ProgramsTask | undefined
): {
  editor: ProgramsScheduleEditor | undefined;
  ruleId: string | undefined;
  malformed: boolean;
} {
  const editor =
    rawEditor.value !== null && isScheduleEditor(rawEditor.value)
      ? rawEditor.value
      : undefined;
  const ruleId =
    rawRuleId.value !== null && SAFE_PROGRAM_ID.test(rawRuleId.value)
      ? rawRuleId.value
      : undefined;
  const needsRuleId = editor === "edit-rule" || editor === "new-exception";
  return {
    editor,
    ruleId,
    malformed:
      rawEditor.duplicate ||
      rawRuleId.duplicate ||
      (rawEditor.value !== null &&
        (!editor || mode !== "management" || task !== "schedule")) ||
      (rawRuleId.value !== null &&
        (!ruleId ||
          !needsRuleId ||
          mode !== "management" ||
          task !== "schedule")) ||
      (needsRuleId && ruleId === undefined) ||
      (editor === "new-rule" && ruleId !== undefined),
  };
}

function parseHash(rawHash: string | null): {
  value: string | null;
  malformed: boolean;
} {
  return {
    value: rawHash && SAFE_HASH.test(rawHash) ? rawHash : null,
    malformed: rawHash !== null && !(rawHash && SAFE_HASH.test(rawHash)),
  };
}

function parseTask(
  rawTask: string | null,
  mode: ProgramsMode,
  programId: string | null
): { value: ProgramsTask | undefined; malformed: boolean } {
  const value =
    rawTask !== null && isProgramsTask(rawTask) ? rawTask : undefined;
  const programlessTask = value === "notifications";
  return {
    value,
    malformed:
      rawTask !== null &&
      (value === undefined ||
        mode !== "management" ||
        (programId === null && !programlessTask) ||
        (programId !== null && programlessTask)),
  };
}

function parseEvent(
  rawEventId: { value: string | null; duplicate: boolean },
  mode: ProgramsMode,
  task: ProgramsTask | undefined,
  programId: string | null
): { value: string | undefined; malformed: boolean } {
  const raw = rawEventId.value;
  const value = raw !== null && SAFE_EVENT_ID.test(raw) ? raw : undefined;
  // PUI-05 (#323): participant Event Detail deep links live on the
  // participant Programs boundary (program + event, no task); management
  // event links stay under task === "events" | "participants".
  const participantEvent =
    mode === "participant" && task === undefined && programId !== null;
  const managementEvent =
    mode === "management" &&
    (task === "events" || task === "participants") &&
    programId !== null;
  return {
    value,
    malformed:
      raw !== null &&
      (value === undefined || (!participantEvent && !managementEvent)),
  };
}

function parseEventAction(
  rawAction: { value: string | null; duplicate: boolean },
  mode: ProgramsMode,
  task: ProgramsTask | undefined,
  eventId: string | undefined
): { value: ManagementEventAction | undefined; malformed: boolean } {
  const value =
    rawAction.value === "edit" || rawAction.value === "reschedule"
      ? rawAction.value
      : undefined;
  const allowed = mode === "management" && task === "events" && eventId;
  return {
    value,
    malformed:
      rawAction.duplicate || (rawAction.value !== null && (!value || !allowed)),
  };
}
interface ParsedOrigin {
  value: ProgramsOrigin | undefined;
  malformed: boolean;
}

function parseOrigin(
  rawFrom: { value: string | null; duplicate: boolean },
  mode: ProgramsMode,
  programId: string | null
): ParsedOrigin {
  const raw = rawFrom.value;
  const value =
    raw !== null &&
    isProgramsOrigin(raw) &&
    mode === "participant" &&
    programId !== null
      ? raw
      : undefined;
  return {
    value,
    // An origin is a navigation hint, not an authority-bearing identifier.
    // Ignore invalid, missing, or duplicate hints and fall back to Programs.
    malformed: false,
  };
}

function parseCreated(
  rawCreated: { value: string | null; duplicate: boolean },
  mode: ProgramsMode,
  programId: string | null
): { value: boolean; malformed: boolean } {
  const value =
    rawCreated.value === "1" && mode === "management" && programId !== null;
  return {
    value,
    malformed:
      rawCreated.duplicate ||
      (rawCreated.value !== null && (!value || rawCreated.value !== "1")),
  };
}
// eslint-disable-next-line eslint/complexity -- one validator owns the complete URL contract.
function hasMalformedIntent({
  rawMode,
  program,
  department,
  hash,
  rawTask,
  task,
  rawEventId,
  event,
  eventAction,
  createdMalformed,
  originMalformed,
  directoryQuery,
  catalogQuery,
  catalogFilter,
  eventFilter,
  participantTab,
  participantQuery,
  settingsSection,
  scheduleOrigin,
  departmentSettings,
  scheduleEditor,
}: {
  rawMode: { value: string | null; duplicate: boolean };
  program: { malformed: boolean; duplicate: boolean };
  department: { malformed: boolean; duplicate: boolean };
  hash: { malformed: boolean };
  rawTask: { duplicate: boolean };
  task: { malformed: boolean };
  rawEventId: { duplicate: boolean };
  event: { malformed: boolean };
  eventAction: { malformed: boolean };
  createdMalformed: boolean;
  originMalformed: boolean;
  directoryQuery: { malformed: boolean };
  catalogQuery: { malformed: boolean };
  catalogFilter: { malformed: boolean };
  eventFilter: { malformed: boolean };
  participantTab: { malformed: boolean };
  participantQuery: { malformed: boolean };
  settingsSection: { malformed: boolean };
  scheduleOrigin: { malformed: boolean };
  departmentSettings: { malformed: boolean };
  scheduleEditor: { malformed: boolean };
}): boolean {
  return (
    rawMode.duplicate ||
    (rawMode.value !== null &&
      rawMode.value !== "participant" &&
      rawMode.value !== "management") ||
    program.malformed ||
    program.duplicate ||
    department.malformed ||
    department.duplicate ||
    hash.malformed ||
    rawTask.duplicate ||
    task.malformed ||
    rawEventId.duplicate ||
    event.malformed ||
    eventAction.malformed ||
    createdMalformed ||
    originMalformed ||
    directoryQuery.malformed ||
    catalogQuery.malformed ||
    catalogFilter.malformed ||
    eventFilter.malformed ||
    participantTab.malformed ||
    participantQuery.malformed ||
    settingsSection.malformed ||
    scheduleOrigin.malformed ||
    departmentSettings.malformed ||
    scheduleEditor.malformed
  );
}

/** Parse only the URL-owned Programs boundary state; server data stays out. */
// eslint-disable-next-line eslint/complexity -- one parser owns the complete URL contract.
export function parseProgramsIntent(search: string): ProgramsIntent {
  const hashIndex = search.indexOf("#");
  const query = hashIndex === -1 ? search : search.slice(0, hashIndex);
  const rawHash = hashIndex === -1 ? null : search.slice(hashIndex);
  const params = new URLSearchParams(query);
  const rawMode = singleParam(params, "mode");
  const rawProgram = singleParam(params, "program");
  const rawProgramId = singleParam(params, "programId");
  const rawDepartment = singleParam(params, "department");
  const rawTask = singleParam(params, "task");
  const rawEventId = singleParam(params, "event");
  const rawEventAction = singleParam(params, "eventAction");
  const rawCreated = singleParam(params, "created");
  const rawFrom = singleParam(params, "from");
  const rawDirectoryQuery = singleParam(params, "directoryQuery");
  const rawDepartmentSettings = singleParam(params, "departmentSettings");
  const rawCatalogQuery = singleParam(params, "catalogQuery");
  const rawCatalogFilter = singleParam(params, "catalogFilter");
  const rawEventFilter = singleParam(params, "eventFilter");
  const rawParticipantTab = singleParam(params, "participantTab");
  const rawParticipantQuery = singleParam(params, "participantQuery");
  const rawSettingsSection = singleParam(params, "settingsSection");
  const rawScheduleOrigin = singleParam(params, "scheduleOrigin");
  const rawScheduleEditor = singleParam(params, "scheduleEditor");
  const rawScheduleRule = singleParam(params, "scheduleRule");
  const mode: ProgramsMode =
    rawMode.value === "management" ? "management" : "participant";
  const program = parseProgramIntent(rawProgram, rawProgramId);
  const department = parseDepartmentIntent(rawDepartment, mode);
  const hash = parseHash(rawHash);
  const origin = parseOrigin(rawFrom, mode, program.id);
  const task = parseTask(rawTask.value, mode, program.id);
  const event = parseEvent(rawEventId, mode, task.value, program.id);
  const eventAction = parseEventAction(
    rawEventAction,
    mode,
    task.value,
    event.value
  );
  const created = parseCreated(rawCreated, mode, program.id);
  const directoryQuery = parseSafeQuery(rawDirectoryQuery);
  const departmentSettings = parseDepartmentSettingsIntent(
    rawDepartmentSettings,
    mode,
    program.id
  );
  const catalogQuery = parseSafeQuery(rawCatalogQuery);
  const catalogFilter = parseEnum(
    rawCatalogFilter,
    isParticipantFilter,
    mode === "participant"
  );
  const eventFilter = parseEnum(
    rawEventFilter,
    isEventFilter,
    mode === "management" && task.value === "events"
  );
  const participantTab = parseEnum(
    rawParticipantTab,
    isParticipantTab,
    mode === "management" && task.value === "participants"
  );
  const participantQuery = parseSafeQuery(rawParticipantQuery);
  const settingsSection = parseEnum(
    rawSettingsSection,
    isSettingsSection,
    mode === "management" && task.value === "settings"
  );
  const scheduleOrigin = parseEnum(
    rawScheduleOrigin,
    isScheduleOrigin,
    mode === "management" && task.value === "schedule"
  );
  const scheduleEditor = parseScheduleEditorIntent(
    rawScheduleEditor,
    rawScheduleRule,
    mode,
    task.value
  );
  const malformed = hasMalformedIntent({
    rawMode,
    program,
    department,
    hash,
    rawTask,
    task,
    rawEventId,
    event,
    eventAction,
    createdMalformed: created.malformed,
    originMalformed: origin.malformed,
    directoryQuery: {
      malformed:
        directoryQuery.malformed ||
        (rawDirectoryQuery.value !== null && mode !== "management"),
    },
    catalogQuery: {
      malformed:
        catalogQuery.malformed ||
        (rawCatalogQuery.value !== null && mode !== "participant"),
    },
    catalogFilter: {
      malformed:
        catalogFilter.malformed ||
        (rawCatalogFilter.value !== null && mode !== "participant"),
    },
    eventFilter,
    participantTab,
    participantQuery: {
      malformed:
        participantQuery.malformed ||
        (rawParticipantQuery.value !== null &&
          !(mode === "management" && task.value === "participants")),
    },
    settingsSection,
    scheduleOrigin,
    departmentSettings,
    scheduleEditor,
  });
  const creationField = created.value ? { created: true as const } : {};
  const originField =
    origin.value === undefined ? {} : { origin: origin.value };
  const routeFields = malformed
    ? {}
    : {
        ...(mode === "management" && directoryQuery.value
          ? { directoryQuery: directoryQuery.value }
          : {}),
        ...(mode === "management" && departmentSettings.value
          ? { departmentSettingsId: departmentSettings.value }
          : {}),
        ...(mode === "participant" && catalogQuery.value
          ? { catalogQuery: catalogQuery.value }
          : {}),
        ...(mode === "participant" && catalogFilter.value
          ? { catalogFilter: catalogFilter.value }
          : {}),
        ...(mode === "management" &&
        task.value === "events" &&
        eventFilter.value
          ? { eventFilter: eventFilter.value }
          : {}),
        ...(mode === "management" &&
        task.value === "participants" &&
        participantTab.value
          ? { participantTab: participantTab.value }
          : {}),
        ...(mode === "management" &&
        task.value === "participants" &&
        participantQuery.value
          ? { participantQuery: participantQuery.value }
          : {}),
        ...(mode === "management" &&
        task.value === "settings" &&
        settingsSection.value
          ? { settingsSection: settingsSection.value }
          : {}),
        ...(mode === "management" &&
        task.value === "schedule" &&
        scheduleOrigin.value
          ? { scheduleOrigin: scheduleOrigin.value }
          : {}),
        ...(mode === "management" &&
        task.value === "schedule" &&
        scheduleEditor.editor
          ? {
              scheduleEditor: scheduleEditor.editor,
              ...(scheduleEditor.ruleId
                ? { scheduleRuleId: scheduleEditor.ruleId }
                : {}),
            }
          : {}),
      };

  const departmentField =
    mode === "management" && department.id !== null
      ? { departmentId: department.id }
      : {};
  if (task.value !== undefined && !malformed) {
    return {
      mode,
      programId: program.id,
      hash: hash.value,
      task: task.value,
      ...departmentField,
      ...(event.value === undefined ? {} : { eventId: event.value }),
      ...(eventAction.value === undefined
        ? {}
        : { eventAction: eventAction.value }),
      ...creationField,
      ...originField,
      ...routeFields,
      malformed,
    };
  }
  return {
    mode,
    programId: program.id,
    hash: hash.value,
    ...(event.value === undefined ? {} : { eventId: event.value }),
    ...(eventAction.value === undefined
      ? {}
      : { eventAction: eventAction.value }),
    ...departmentField,
    ...creationField,
    ...originField,
    ...routeFields,
    malformed,
  };
}
function appendCreated(
  params: URLSearchParams,
  mode: ProgramsMode,
  programId: string | null | undefined,
  created: boolean | undefined
): void {
  if (
    mode === "management" &&
    created === true &&
    programId &&
    SAFE_PROGRAM_ID.test(programId)
  ) {
    params.set("created", "1");
  }
}

function appendProgram(
  params: URLSearchParams,
  programId: string | null | undefined,
  task: ProgramsTask | null | undefined
): void {
  if (
    programId &&
    SAFE_PROGRAM_ID.test(programId) &&
    task !== "notifications"
  ) {
    params.set("program", programId);
  }
}

function appendOrigin(
  params: URLSearchParams,
  mode: ProgramsMode,
  programId: string | null | undefined,
  origin: ProgramsOrigin | undefined
): void {
  if (
    mode === "participant" &&
    programId &&
    SAFE_PROGRAM_ID.test(programId) &&
    origin &&
    isProgramsOrigin(origin)
  ) {
    params.set("from", origin);
  }
}

function appendTask(
  params: URLSearchParams,
  mode: ProgramsMode,
  programId: string | null | undefined,
  task: ProgramsTask | null | undefined
): void {
  if (
    mode === "management" &&
    task &&
    isProgramsTask(task) &&
    (programId || task === "notifications")
  ) {
    params.set("task", task);
  }
}

function appendEvent(
  params: URLSearchParams,
  mode: ProgramsMode,
  programId: string | null | undefined,
  task: ProgramsTask | null | undefined,
  eventId: string | null | undefined
): void {
  const managementEvent =
    mode === "management" &&
    (task === "events" || task === "participants") &&
    programId;
  const participantEvent = mode === "participant" && programId;
  if (
    eventId &&
    SAFE_EVENT_ID.test(eventId) &&
    (managementEvent || participantEvent)
  ) {
    params.set("event", eventId);
  }
}

function appendEventAction(
  params: URLSearchParams,
  mode: ProgramsMode,
  task: ProgramsTask | null | undefined,
  eventId: string | null | undefined,
  eventAction: ManagementEventAction | null | undefined
): void {
  if (mode === "management" && task === "events" && eventId && eventAction) {
    params.set("eventAction", eventAction);
  }
}

// eslint-disable-next-line eslint/complexity -- one serializer owns the complete URL contract.
function appendRouteState(
  params: URLSearchParams,
  mode: ProgramsMode,
  task: ProgramsTask | null | undefined,
  intent: ProgramsHrefIntent
): void {
  if (
    mode === "management" &&
    intent.directoryQuery &&
    SAFE_QUERY.test(intent.directoryQuery)
  ) {
    params.set("directoryQuery", intent.directoryQuery);
  }
  if (
    mode === "management" &&
    task === undefined &&
    !intent.programId &&
    intent.departmentSettingsId &&
    SAFE_PROGRAM_ID.test(intent.departmentSettingsId)
  ) {
    params.set("departmentSettings", intent.departmentSettingsId);
  }
  if (
    mode === "participant" &&
    intent.catalogQuery &&
    SAFE_QUERY.test(intent.catalogQuery)
  ) {
    params.set("catalogQuery", intent.catalogQuery);
  }
  if (
    mode === "participant" &&
    intent.catalogFilter &&
    isParticipantFilter(intent.catalogFilter) &&
    intent.catalogFilter !== "all"
  ) {
    params.set("catalogFilter", intent.catalogFilter);
  }
  if (
    mode === "management" &&
    task === "events" &&
    intent.eventFilter &&
    isEventFilter(intent.eventFilter) &&
    intent.eventFilter !== "current"
  ) {
    params.set("eventFilter", intent.eventFilter);
  }
  if (
    mode === "management" &&
    task === "participants" &&
    intent.participantTab &&
    isParticipantTab(intent.participantTab) &&
    intent.participantTab !== "pending"
  ) {
    params.set("participantTab", intent.participantTab);
  }
  if (
    mode === "management" &&
    task === "participants" &&
    intent.participantQuery &&
    SAFE_QUERY.test(intent.participantQuery)
  ) {
    params.set("participantQuery", intent.participantQuery);
  }
  if (
    mode === "management" &&
    task === "settings" &&
    intent.settingsSection &&
    isSettingsSection(intent.settingsSection)
  ) {
    params.set("settingsSection", intent.settingsSection);
  }
  if (
    mode === "management" &&
    task === "schedule" &&
    intent.scheduleOrigin &&
    isScheduleOrigin(intent.scheduleOrigin)
  ) {
    params.set("scheduleOrigin", intent.scheduleOrigin);
  }
  if (
    mode === "management" &&
    task === "schedule" &&
    intent.scheduleEditor &&
    isScheduleEditor(intent.scheduleEditor)
  ) {
    params.set("scheduleEditor", intent.scheduleEditor);
    if (
      intent.scheduleRuleId &&
      SAFE_PROGRAM_ID.test(intent.scheduleRuleId) &&
      intent.scheduleEditor !== "new-rule"
    ) {
      params.set("scheduleRule", intent.scheduleRuleId);
    }
  }
}

/** Build a canonical same-origin Programs URL with safe, restorable intent. */
export function buildProgramsHref({
  mode,
  programId,
  departmentId,
  task,
  eventId,
  hash,
  created,
  origin,
  eventAction,
  directoryQuery,
  departmentSettingsId,
  catalogQuery,
  catalogFilter,
  eventFilter,
  participantTab,
  participantQuery,
  settingsSection,
  scheduleOrigin,
  scheduleEditor,
  scheduleRuleId,
}: ProgramsHrefIntent): string {
  const params = new URLSearchParams();
  if (mode === "management") {
    params.set("mode", "management");
  }
  if (
    mode === "management" &&
    departmentId &&
    SAFE_PROGRAM_ID.test(departmentId)
  ) {
    params.set("department", departmentId);
  }
  appendCreated(params, mode, programId, created);
  appendProgram(params, programId, task);
  appendOrigin(params, mode, programId, origin);
  appendTask(params, mode, programId, task);
  appendEvent(params, mode, programId, task, eventId);
  appendEventAction(params, mode, task, eventId, eventAction);
  appendRouteState(params, mode, task, {
    mode,
    programId,
    departmentId,
    task,
    eventId,
    eventAction,
    hash,
    created,
    origin,
    directoryQuery,
    departmentSettingsId,
    catalogQuery,
    catalogFilter,
    eventFilter,
    participantTab,
    participantQuery,
    settingsSection,
    scheduleOrigin,
    scheduleEditor,
    scheduleRuleId,
  });
  const query = params.toString();
  const suffix = query ? `/programs?${query}` : "/programs";
  return hash && SAFE_HASH.test(hash) ? `${suffix}${hash}` : suffix;
}
