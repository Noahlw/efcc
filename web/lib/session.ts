import type { Session } from "@/lib/api";

const STORAGE_KEY = "efcc_session";

function isValidSession(raw: unknown): raw is Session {
  if (typeof raw !== "object" || raw === null) return false;
  const s = raw as Record<string, unknown>;
  return (
    typeof s.userId === "string" &&
    typeof s.sessionId === "string" &&
    typeof s.sessionToken === "string" &&
    s.userId !== "" &&
    s.sessionId !== "" &&
    s.sessionToken !== ""
  );
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isValidSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(data: Session): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or unavailable — non-critical, session can be re-issued.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort.
  }
}
