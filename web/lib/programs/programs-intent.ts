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
  const rawMode = params.get("mode");
  const rawProgram = params.get("program");
  const rawProgramId = params.get("programId");

  const mode: ProgramsMode = rawMode === "management" ? "management" : "participant";
  const malformedMode =
    rawMode !== null &&
    rawMode !== "participant" &&
    rawMode !== "management";
  const hasConflictingProgram =
    rawProgram !== null && rawProgramId !== null && rawProgram !== rawProgramId;
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
