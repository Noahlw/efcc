import type { GenerateResult } from "./program-api";

const GENERATION_RECOVERY_PREFIX = "efcc_generation_recovery:";

/**
 * Session-bound reference to a Generate write whose outcome is not yet
 * authoritative. ADR-0047: an attempted Generate is unresolved from dispatch
 * until an authoritative Audit Outcome exists, so a Preview reload must not
 * erase which Reviewed Schedule Plan the mutation was attempted against; the
 * workspace reconciles instead of replaying blindly.
 */
export interface GenerationRecovery {
 version: 1;
 programId: string;
 planId: string;
 runId: string | null;
 needsReconciliation: boolean;
 requiresReview: boolean;
 data: GenerateResult | null;
}

interface SessionStorageLike {
 getItem: (key: string) => string | null;
 setItem: (key: string, value: string) => void;
 removeItem: (key: string) => void;
  readonly length: number;
  key: (index: number) => string | null;
}

function getSessionStorage(): SessionStorageLike | null {
 try {
  const storage = (
   globalThis as typeof globalThis & {
    sessionStorage?: SessionStorageLike;
   }
  ).sessionStorage;
  return storage ?? null;
 } catch {
  return null;
 }
}

function recoveryKey(programId: string): string {
 return `${GENERATION_RECOVERY_PREFIX}${programId}`;
}

function isGenerateResult(value: unknown): value is GenerateResult {
 if (typeof value !== "object" || value === null) {
  return false;
 }
 const candidate = value as Partial<GenerateResult>;
 return (
  typeof candidate.run_id === "string" &&
  typeof candidate.plan_id === "string" &&
  typeof candidate.created === "number" &&
  typeof candidate.skipped === "number" &&
  typeof candidate.failed === "number"
 );
}

function normalizeGenerationRecovery(
 value: unknown,
 programId: string
): GenerationRecovery | null {
 if (typeof value !== "object" || value === null) {
  return null;
 }
 const candidate = value as Partial<GenerationRecovery>;
 if (
  candidate.version !== 1 ||
  candidate.programId !== programId ||
  typeof candidate.planId !== "string" ||
  candidate.planId.length === 0 ||
  typeof candidate.needsReconciliation !== "boolean" ||
  typeof candidate.requiresReview !== "boolean" ||
  (candidate.runId !== null && typeof candidate.runId !== "string") ||
  (candidate.data !== null && !isGenerateResult(candidate.data))
 ) {
  return null;
 }
 if (!candidate.needsReconciliation && !candidate.requiresReview) {
  return null;
 }
 return {
  version: 1,
  programId,
  planId: candidate.planId,
  runId: candidate.runId ?? null,
  needsReconciliation: candidate.needsReconciliation,
  requiresReview: candidate.requiresReview,
  data: candidate.data ?? null,
 };
}

export function readGenerationRecovery(
 programId: string
): GenerationRecovery | null {
 const storage = getSessionStorage();
 if (!storage) {
  return null;
 }
 try {
  const raw = storage.getItem(recoveryKey(programId));
  if (!raw) {
   return null;
  }
  const recovery = normalizeGenerationRecovery(
   JSON.parse(raw) as unknown,
   programId
  );
  if (!recovery) {
   storage.removeItem(recoveryKey(programId));
  }
  return recovery;
 } catch {
  return null;
 }
}

export function writeGenerationRecovery(recovery: GenerationRecovery): void {
 const storage = getSessionStorage();
 if (!storage) {
  return;
 }
 try {
  storage.setItem(recoveryKey(recovery.programId), JSON.stringify(recovery));
 } catch {
  // Recovery persistence is best-effort; the live editor remains usable.
 }
}

export function clearGenerationRecovery(programId: string): void {
 const storage = getSessionStorage();
 if (!storage) {
  return;
 }
 try {
  storage.removeItem(recoveryKey(programId));
 } catch {
  // Best-effort cleanup.
 }
}

/** Logout/expiry boundary cleanup: recovery must not cross sessions. */
export function clearAllGenerationRecoveries(): void {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }
  try {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(GENERATION_RECOVERY_PREFIX)) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      storage.removeItem(key);
    }
  } catch {
    // Best-effort cleanup; logout still clears the authenticated session.
  }
}
