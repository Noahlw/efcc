const MANAGEMENT_DRAFT_PREFIX = "efcc_management_draft:";

interface SessionStorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  readonly length: number;
  key: (index: number) => string | null;
}

interface StoredDraft<T> {
  version: 1;
  entityId: string;
  action: string;
  data: T;
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

function draftKey(entityId: string, action: string): string {
  return `${MANAGEMENT_DRAFT_PREFIX}${encodeURIComponent(entityId)}:${encodeURIComponent(action)}`;
}

export function readManagementDraft<T>(
  entityId: string,
  action: string
): T | null {
  const storage = getSessionStorage();
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(draftKey(entityId, action));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<StoredDraft<T>>;
    return parsed.version === 1 &&
      parsed.entityId === entityId &&
      parsed.action === action &&
      parsed.data !== undefined
      ? parsed.data
      : null;
  } catch {
    return null;
  }
}

export function writeManagementDraft<T>(
  entityId: string,
  action: string,
  data: T
): void {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(
      draftKey(entityId, action),
      JSON.stringify({
        version: 1,
        entityId,
        action,
        data,
      } satisfies StoredDraft<T>)
    );
  } catch {
    // Draft persistence is best-effort; the in-memory editor remains usable.
  }
}

export function clearManagementDraft(entityId: string, action: string): void {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(draftKey(entityId, action));
  } catch {
    // Best-effort cleanup.
  }
}

export function clearManagementDraftsForEntity(entityId: string): void {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }
  const prefix = `${MANAGEMENT_DRAFT_PREFIX}${encodeURIComponent(entityId)}:`;
  try {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(prefix)) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      storage.removeItem(key);
    }
  } catch {
    // Best-effort cleanup.
  }
}

/** Session-bound logout cleanup; drafts must not cross authenticated users. */
export function clearAllManagementDrafts(): void {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }
  try {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(MANAGEMENT_DRAFT_PREFIX)) {
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
