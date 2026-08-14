export interface AttendanceEntry {
  value: string;
  /** True only when a supported Program-token QR payload supplied the value. */
  fromQr: boolean;
}

/**
 * Decode the two QR/manual entry shapes accepted by attendance routes.
 *
 * A bare value remains ambiguous on purpose: the Worker decides whether it is
 * an Event manual code or a Program token. Client decoding only unwraps the
 * stable `program_token`/`manual_code` query parameters and never authorizes
 * attendance.
 */
export function entryFromValue(value: string): AttendanceEntry {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    const programToken = url.searchParams.get("program_token");
    if (programToken?.trim()) {
      return { value: programToken.trim(), fromQr: true };
    }
    const manualCode = url.searchParams.get("manual_code");
    if (manualCode?.trim()) {
      return { value: manualCode.trim(), fromQr: false };
    }
  } catch {
    // Manual input is not required to be a URL.
  }
  return { value: trimmed, fromQr: false };
}
