const ISO_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z(?![\s\S])/u;

export function parseIsoInstant(value: unknown): number | null {
  if (typeof value !== "string" || !ISO_INSTANT_PATTERN.test(value)) {
    return null;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return new Date(timestamp).toISOString().slice(0, 16) === value.slice(0, 16)
    ? timestamp
    : null;
}

export function isIsoInstant(value: unknown): value is string {
  return parseIsoInstant(value) !== null;
}
