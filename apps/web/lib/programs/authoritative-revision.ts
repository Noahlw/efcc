export interface Revisioned {
  updated_at: string;
}

/**
 * Accept a response only when its server revision is newer than the visible
 * response. A tied timestamp cannot prove ordering, so retaining the visible
 * response is safer than allowing an older snapshot to replace it.
 */
export function isAuthoritativeRevision(
  next: Revisioned,
  current: Revisioned | null
): boolean {
  return current === null || next.updated_at > current.updated_at;
}

export function applyAuthoritativeRevision<T extends Revisioned>(
  next: T,
  current: T | null
): T | null {
  return isAuthoritativeRevision(next, current) ? next : current;
}
