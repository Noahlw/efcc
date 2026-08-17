export type ProgramsMode = "participant" | "management";

export type ProgramsTask =
  | "events"
  | "participants"
  | "settings"
  | "notifications";

export interface ProgramsIntent {
  mode: ProgramsMode;
  programId: string | null;
  hash: string | null;
  /** Management task carried by a direct Program workspace link. */
  task?: ProgramsTask;
  /** Management Event deep link, valid only with task === "events" or "participants". */
  eventId?: string;
  /** Creation flash carried to the new management Cockpit. */
  created?: boolean;
  malformed: boolean;
}

export interface ProgramsHrefIntent {
  mode: ProgramsMode;
  programId?: string | null;
  task?: ProgramsTask | null;
  eventId?: string | null;
  hash?: string | null;
  /** Creation flash carried to the new management Cockpit. */
  created?: boolean;
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

function isProgramsTask(value: string): value is ProgramsTask {
  return PROGRAM_TASKS.includes(value as ProgramsTask);
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
  return {
    value,
    malformed:
      raw !== null &&
      (value === undefined ||
        mode !== "management" ||
        (task !== "events" && task !== "participants") ||
        programId === null),
  };
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
  const rawTask = singleParam(params, "task");
  const rawEventId = singleParam(params, "event");
  const rawCreated = singleParam(params, "created");
  const mode: ProgramsMode =
    rawMode.value === "management" ? "management" : "participant";
  const program = parseProgramIntent(rawProgram, rawProgramId);
  const hash = parseHash(rawHash);
  const task = parseTask(rawTask.value, mode, program.id);
  const event = parseEvent(rawEventId, mode, task.value, program.id);
  const created =
    rawCreated.value === "1" && mode === "management" && program.id !== null;
  const createdMalformed =
    rawCreated.duplicate ||
    (rawCreated.value !== null &&
      (!created || rawCreated.value !== "1"));
  const malformed =
    rawMode.duplicate ||
    (rawMode.value !== null &&
      rawMode.value !== "participant" &&
      rawMode.value !== "management") ||
    program.malformed ||
    program.duplicate ||
    hash.malformed ||
    rawTask.duplicate ||
    task.malformed ||
    rawEventId.duplicate ||
    event.malformed ||
    createdMalformed;
  const creationField = created ? { created: true as const } : {};

  if (task.value !== undefined && !malformed) {
    return {
      mode,
      programId: program.id,
      hash: hash.value,
      task: task.value,
      ...(event.value === undefined ? {} : { eventId: event.value }),
      ...creationField,
      malformed,
    };
  }
  return {
    mode,
    programId: program.id,
    hash: hash.value,
    ...creationField,
    malformed,
  };
}

/** Build a canonical same-origin Programs URL with safe, restorable intent. */
export function buildProgramsHref({
  mode,
  programId,
  task,
  eventId,
  hash,
  created,
}: ProgramsHrefIntent): string {
  const params = new URLSearchParams();
  if (mode === "management") {
    params.set("mode", "management");
  }
  if (
    mode === "management" &&
    created === true &&
    programId &&
    SAFE_PROGRAM_ID.test(programId)
  ) {
    params.set("created", "1");
  }
  if (
    programId &&
    SAFE_PROGRAM_ID.test(programId) &&
    task !== "notifications"
  ) {
    params.set("program", programId);
  }
  if (
    mode === "management" &&
    task &&
    isProgramsTask(task) &&
    (programId || task === "notifications")
  ) {
    params.set("task", task);
    if (
      (task === "events" || task === "participants") &&
      eventId &&
      SAFE_EVENT_ID.test(eventId)
    ) {
      params.set("event", eventId);
    }
  }
  const query = params.toString();
  const suffix = query ? `/programs?${query}` : "/programs";
  return hash && SAFE_HASH.test(hash) ? `${suffix}${hash}` : suffix;
}
