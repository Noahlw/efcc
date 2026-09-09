import { resolveActorCapabilities } from "../identity/role-hierarchy";

export interface ProgramAccess {
  programId: string;
  departmentId: string;
  capabilities: Record<string, boolean>;
}

/** Resolve one Program's Department scope through the identity kernel. */
export async function resolveProgramAccess(
  db: D1Database,
  actorUserId: string,
  programId: string
): Promise<ProgramAccess | null> {
  const program = await db
    .prepare(
      `SELECT program_id, department_id
         FROM programs
        WHERE program_id = ?`
    )
    .bind(programId)
    .first<{ program_id: string; department_id: string }>();
  if (!program) {
    return null;
  }
  const capabilities = await resolveActorCapabilities(db, actorUserId, {
    departmentId: program.department_id,
    programId: program.program_id,
  });
  return {
    programId: program.program_id,
    departmentId: program.department_id,
    capabilities,
  };
}
