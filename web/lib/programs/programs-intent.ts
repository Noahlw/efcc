export type ProgramsMode = "participant" | "management";

export type ProgramsTask =
  | "events"
  | "participants"
  | "settings"
  | "notifications";
export type ProgramsOrigin = "home" | "notices" | "messages" | "programs";

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
  /** Creation flash carried to the new management Cockpit. */
  created?: boolean;
  malformed: boolean;
  /** First-party Section that opened a participant detail intent. */
  origin?: ProgramsOrigin;
}

export interface ProgramsHrefIntent {
  mode: ProgramsMode;
  programId?: string | null;
  /** Management directory department context. */
  departmentId?: string | null;
  task?: ProgramsTask | null;
  eventId?: string | null;
  hash?: string | null;
  /** Creation flash carried to the new management Cockpit. */
  created?: boolean;
  /** First-party Section that opened a participant detail intent. */
  origin?: ProgramsOrigin;
}
const SAFE_PROGRAM_ID = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/u;
const SAFE_HASH = /^#[A-Za-z0-9._~-]{1,128}$/u;
const SAFE_EVENT_ID = /^[A-Za-z0-9-]{1,64}$/u;
const PROGRAM_TASKS: readonly ProgramsTask[] = [
  "events",
  "participants",
  "settings",
  "notifications",
];
const PROGRAM_ORIGINS: readonly ProgramsOrigin[] = [
  "home",
  "notices",
  "messages",
  "programs",
];

function isProgramsTask(value: string): value is ProgramsTask {
  return PROGRAM_TASKS.includes(value as ProgramsTask);
}

function isProgramsOrigin(value: string): value is ProgramsOrigin {
  return PROGRAM_ORIGINS.includes(value as ProgramsOrigin);
}

function singleParam(
  params: URLSearchParams,
  key: string
): { value: string | null; duplicate: boolean } {
  const values = params.getAll(key);
  return { value: values[0] ?? null, duplicate: values.length > 1 };
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
    malformed: rawFrom.duplicate || (raw !== null && value === undefined),
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
function hasMalformedIntent({
  rawMode,
  program,
  department,
  hash,
  rawTask,
  task,
  rawEventId,
  event,
  createdMalformed,
  originMalformed,
}: {
  rawMode: { value: string | null; duplicate: boolean };
  program: { malformed: boolean; duplicate: boolean };
  department: { malformed: boolean; duplicate: boolean };
  hash: { malformed: boolean };
  rawTask: { duplicate: boolean };
  task: { malformed: boolean };
  rawEventId: { duplicate: boolean };
  event: { malformed: boolean };
  createdMalformed: boolean;
  originMalformed: boolean;
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
    createdMalformed ||
    originMalformed
  );
}

/** Parse only the URL-owned Programs boundary state; server data stays out. */
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
  const rawCreated = singleParam(params, "created");
  const rawFrom = singleParam(params, "from");
  const mode: ProgramsMode =
    rawMode.value === "management" ? "management" : "participant";
  const program = parseProgramIntent(rawProgram, rawProgramId);
  const department = parseProgramIntent(rawDepartment, {
    value: null,
    duplicate: false,
  });
  const hash = parseHash(rawHash);
  const origin = parseOrigin(rawFrom, mode, program.id);
  const task = parseTask(rawTask.value, mode, program.id);
  const event = parseEvent(rawEventId, mode, task.value, program.id);
  const created = parseCreated(rawCreated, mode, program.id);
  const malformed = hasMalformedIntent({
    rawMode,
    program,
    department,
    hash,
    rawTask,
    task,
    rawEventId,
    event,
    createdMalformed: created.malformed,
    originMalformed: origin.malformed,
  });
  const creationField = created.value ? { created: true as const } : {};
  const originField =
    origin.value === undefined ? {} : { origin: origin.value };

  const departmentField =
    department.id === null ? {} : { departmentId: department.id };
  if (task.value !== undefined && !malformed) {
    return {
      mode,
      programId: program.id,
      hash: hash.value,
      task: task.value,
      ...departmentField,
      ...(event.value === undefined ? {} : { eventId: event.value }),
      ...creationField,
      ...originField,
      malformed,
    };
  }
  return {
    mode,
    programId: program.id,
    hash: hash.value,
    ...(event.value === undefined ? {} : { eventId: event.value }),
    ...departmentField,
    ...creationField,
    ...originField,
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
}: ProgramsHrefIntent): string {
  const params = new URLSearchParams();
  if (mode === "management") {
    params.set("mode", "management");
  }
  if (departmentId && SAFE_PROGRAM_ID.test(departmentId)) {
    params.set("department", departmentId);
  }
  appendCreated(params, mode, programId, created);
  appendProgram(params, programId, task);
  appendOrigin(params, mode, programId, origin);
  appendTask(params, mode, programId, task);
  appendEvent(params, mode, programId, task, eventId);
  const query = params.toString();
  const suffix = query ? `/programs?${query}` : "/programs";
  return hash && SAFE_HASH.test(hash) ? `${suffix}${hash}` : suffix;
}
