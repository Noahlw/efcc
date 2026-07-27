// LocalStorage session manager.
// `localStorage` is cache only — server is authoritative (verifySessionToken_).

import type { SessionPayload } from "../types";

const STORAGE_KEY = "efcc_session";
const ROLLING_EXPIRY_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function getSession(): SessionPayload | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionPayload;
    if (typeof parsed.expiryTimestamp !== "number") return null;
    if (parsed.expiryTimestamp <= Date.now()) {
      // Expired — clear and require re-login.
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setSession(payload: SessionPayload): void {
  const hasPositiveExpiry =
    typeof payload.expiryTimestamp === "number" && payload.expiryTimestamp > 0;
  const next: SessionPayload = {
    ...payload,
    expiryTimestamp: hasPositiveExpiry
      ? payload.expiryTimestamp
      : Date.now() + ROLLING_EXPIRY_DAYS * MS_PER_DAY,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export const SESSION_STORAGE_KEY = STORAGE_KEY;
export const SESSION_EXPIRY_DAYS = ROLLING_EXPIRY_DAYS;
