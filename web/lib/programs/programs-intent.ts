export type ProgramsMode = "participant" | "management";

export interface ProgramsIntent {
  mode: ProgramsMode;
  programId: string | null;
  hash: string | null;
  malformed: boolean;
}

export interface ProgramsHrefIntent {
  mode: ProgramsMode;
  programId?: string | null;
  hash?: string | null;
}

const SAFE_PROGRAM_ID = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/u;
const SAFE_HASH = /^#[A-Za-z0-9._~-]{1,128}$/u;

/** Parse only the URL-owned Programs boundary state; server data stays out. */
export function parseProgramsIntent(search: string): ProgramsIntent {
  const hashIndex = search.indexOf("#");
  const query = hashIndex === -1 ? search : search.slice(0, hashIndex);
  const rawHash = hashIndex === -1 ? null : search.slice(hashIndex);
  const params = new URLSearchParams(query);
  const rawModes = params.getAll("mode");
  const rawPrograms = params.getAll("program");
  const rawProgramIds = params.getAll("programId");
  const rawMode = rawModes[0] ?? null;
  const rawProgram = rawPrograms[0] ?? null;
  const rawProgramId = rawProgramIds[0] ?? null;

  const mode: ProgramsMode = rawMode === "management" ? "management" : "participant";
  const malformedMode =
    rawMode !== null &&
    rawMode !== "participant" &&
    rawMode !== "management";
  const hasConflictingProgram =
    rawProgram !== null && rawProgramId !== null && rawProgram !== rawProgramId;
  const hasDuplicateIntent =
    rawModes.length > 1 ||
    rawPrograms.length > 1 ||
    rawProgramIds.length > 1 ||
    (rawProgram !== null && rawProgramId !== null);
  const suppliedProgram = rawProgram ?? rawProgramId;
  const programId =
    suppliedProgram === null || suppliedProgram === ""
      ? null
      : SAFE_PROGRAM_ID.test(suppliedProgram)
        ? suppliedProgram
        : null;
  const hash = rawHash && SAFE_HASH.test(rawHash) ? rawHash : null;

  return {
    mode,
    programId,
    hash,
    malformed:
      malformedMode ||
      hasConflictingProgram ||
      hasDuplicateIntent ||
      (suppliedProgram !== null && programId === null) ||
      (rawHash !== null && hash === null),
  };
}

/** Build a canonical same-origin Programs URL with safe, restorable intent. */
export function buildProgramsHref({
  mode,
  programId,
  hash,
}: ProgramsHrefIntent): string {
  const params = new URLSearchParams();
  if (mode === "management") {
    params.set("mode", "management");
  }
  if (programId && SAFE_PROGRAM_ID.test(programId)) {
    params.set("program", programId);
  }
  const query = params.toString();
  const suffix = query ? `/programs?${query}` : "/programs";
  return hash && SAFE_HASH.test(hash) ? `${suffix}${hash}` : suffix;
}
