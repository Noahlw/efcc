// ponytail: AppState and RESTORING/RECOVERABLE_ERROR states deferred to #144/#146.
// The page.tsx component defines its own View type for the states #143 implements.
// ponytail: minimal localStorage persistence; no session expiry, no encryption.
// Add session expiry checks when #144 (reload restoration) land.

const STORAGE_KEY = "efcc_session";

export function loadSession(): unknown {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(data: unknown): void {
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
