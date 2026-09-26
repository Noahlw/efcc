import {
  clearAllManagementDrafts,
  clearManagementDraft,
  readManagementDraft,
  writeManagementDraft,
} from "./management-draft";
import type { EventType } from "./program-api";

export interface EventCreateDraft {
  version: 1;
  date: string;
  startTime: string;
  endTime: string;
  endAuto: boolean;
  name: string;
  location: string;
  eventType: EventType;
  windowOverride: boolean;
  windowOpens: string;
  windowCloses: string;
}

const EVENT_CREATE_DRAFT_PREFIX = "efcc_program_event_draft:";
const EVENT_CREATE_DRAFT_ACTION = "event-create";

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

function draftKey(programId: string): string {
  return `${EVENT_CREATE_DRAFT_PREFIX}${programId}`;
}

function normalizeEventCreateDraft(value: unknown): EventCreateDraft | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const parsed = value as Partial<EventCreateDraft>;
  if (
    parsed.version !== 1 ||
    typeof parsed.date !== "string" ||
    typeof parsed.startTime !== "string" ||
    typeof parsed.endTime !== "string" ||
    typeof parsed.name !== "string" ||
    typeof parsed.location !== "string" ||
    typeof parsed.eventType !== "string" ||
    typeof parsed.windowOverride !== "boolean" ||
    typeof parsed.windowOpens !== "string" ||
    typeof parsed.windowCloses !== "string"
  ) {
    return null;
  }
  return {
    version: 1,
    date: parsed.date,
    startTime: parsed.startTime,
    endTime: parsed.endTime,
    endAuto: parsed.endAuto !== false,
    name: parsed.name,
    location: parsed.location,
    eventType: parsed.eventType as EventType,
    windowOverride: parsed.windowOverride,
    windowOpens: parsed.windowOpens,
    windowCloses: parsed.windowCloses,
  };
}

export function readEventCreateDraft(
  programId: string
): EventCreateDraft | null {
  const stored = normalizeEventCreateDraft(
    readManagementDraft<unknown>(programId, EVENT_CREATE_DRAFT_ACTION)
  );
  if (stored) {
    return stored;
  }
  const storage = getSessionStorage();
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(draftKey(programId));
    if (!raw) {
      return null;
    }
    return normalizeEventCreateDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeEventCreateDraft(
  programId: string,
  draft: EventCreateDraft
): void {
  writeManagementDraft(programId, EVENT_CREATE_DRAFT_ACTION, draft);
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(draftKey(programId), JSON.stringify(draft));
  } catch {
    // The form remains usable when storage is unavailable; the shell still
    // protects the in-memory draft for the current route.
  }
}

export function clearEventCreateDraft(programId: string): void {
  clearManagementDraft(programId, EVENT_CREATE_DRAFT_ACTION);
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(draftKey(programId));
  } catch {
    // Storage can be blocked in privacy modes; there is nothing else to clear.
  }
}

/** Logout boundary cleanup: drafts must not cross authenticated sessions. */
export function clearAllEventCreateDrafts(): void {
  clearAllManagementDrafts();
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }
  try {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(EVENT_CREATE_DRAFT_PREFIX)) {
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
