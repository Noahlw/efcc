export type Revisioned = { updated_at: string };

/**
 * Accept a response only when its server revision is at least as new as the
 * visible response. Equal revisions are accepted so an idempotent read can
 * refresh the same representation.
 */
export function isAuthoritativeRevision(
  next: Revisioned,
  current: Revisioned | null
): boolean {
  return current === null || next.updated_at >= current.updated_at;
}

export function applyAuthoritativeRevision<T extends Revisioned>(
  next: T,
  current: T | null
): T | null {
  return isAuthoritativeRevision(next, current) ? next : current;
}
