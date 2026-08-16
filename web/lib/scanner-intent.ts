export type ScannerMode = "self" | "assisted";

export interface ScannerIntent {
  mode: ScannerMode;
  eventId: string | null;
  malformed: boolean;
}

const SAFE_EVENT_ID = /^[A-Za-z0-9-]{1,64}$/u;

function singleParam(
  params: URLSearchParams,
  key: string
): { value: string | null; duplicate: boolean } {
  const values = params.getAll(key);
  return {
    value: values[0] ?? null,
    duplicate: values.length > 1,
  };
}

/** Parse only Scanner-owned URL state; authorization stays server-owned. */
export function parseScannerIntent(search: string): ScannerIntent {
  const params = new URLSearchParams(search);
  const rawMode = singleParam(params, "mode");
  const rawEvent = singleParam(params, "event");
  const mode: ScannerMode = rawMode.value === "assisted" ? "assisted" : "self";
  const malformed =
    rawMode.duplicate ||
    rawEvent.duplicate ||
    (rawMode.value !== null &&
      rawMode.value !== "self" &&
      rawMode.value !== "assisted") ||
    (rawEvent.value !== null && !SAFE_EVENT_ID.test(rawEvent.value));
  return {
    mode,
    eventId: malformed || rawEvent.value === null ? null : rawEvent.value,
    malformed,
  };
}

/** Build a canonical same-origin Scanner URL with explicit mode intent. */
export function buildScannerHref(
  mode: ScannerMode,
  eventId: string | null = null
): string {
  const params = new URLSearchParams({ mode });
  if (eventId && SAFE_EVENT_ID.test(eventId)) {
    params.set("event", eventId);
  }
  return `/scanner?${params.toString()}`;
}
