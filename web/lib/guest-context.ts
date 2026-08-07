/**
 * Check-In Credential handoff (CONTEXT.md "Check-In Credential").
 * Carried across the authenticated handoff so the Event context a guest
 * started from survives a login detour. Shared by the guest panel (writer)
 * and the login page (reader) so the two realms cannot drift apart.
 */

export const GUEST_CONTEXT_KEY = "efcc_guest_context";

export type CheckInCredentialKind = "program_token" | "manual_code";

export interface CheckInCredential {
  kind: CheckInCredentialKind;
  value: string;
}

export function clearGuestCredential(): void {
  sessionStorage.removeItem(GUEST_CONTEXT_KEY);
}

export function readGuestCredential(): CheckInCredential | null {
  const raw = sessionStorage.getItem(GUEST_CONTEXT_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as {
      kind?: unknown;
      value?: unknown;
    };
    if (
      (parsed.kind === "program_token" || parsed.kind === "manual_code") &&
      typeof parsed.value === "string" &&
      parsed.value.length > 0
    ) {
      return { kind: parsed.kind, value: parsed.value };
    }
  } catch {
    // Malformed payload is treated as absent.
  }
  clearGuestCredential();
  return null;
}

export function writeGuestCredential(credential: CheckInCredential): void {
  sessionStorage.setItem(GUEST_CONTEXT_KEY, JSON.stringify(credential));
}

/** Scanner page deep link that resumes the pending Check-In Credential. */
export function scannerEntryPath(credential: CheckInCredential): string {
  return `/scanner?${credential.kind}=${encodeURIComponent(credential.value)}`;
}
