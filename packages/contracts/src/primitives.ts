/**
 * Shared primitive predicates for non-Auth wire contracts (spec #646).
 *
 * Pure, dependency-free shims over zod: every helper is total (never
 * throws) and validation-only (never transforms the accepted payload).
 * Accepted extra fields keep flowing exactly as today; only the
 * accept/reject decision is shared.
 */
import * as z from "zod";

/** Non-empty string on the wire (ids, labels, timestamps, codes). */
export const nonEmptyString = z.string().min(1);

/** Nullable wire string (explicit JSON null, never undefined). */
export const nullableString = z.string().nullable();

/** Compatibility alias: present-and-string, or absent. */
export const optionalString = z.string().optional();

/** Positive integer version/revision field. */
export const positiveInt = z.number().int().min(1);

/**
 * Coerce-then-clamp pagination limit with the exact historical policy:
 * non-integer input falls back to `fallback`; integers clamp to
 * [min, max]. Mirrors the audit/content list behavior (never 422).
 */
export function clampLimit(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed =
    typeof value === "string" || typeof value === "number"
      ? Number(value)
      : NaN;
  if (!Number.isSafeInteger(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}

/**
 * First present key wins (snake_case wire name before camelCase alias),
 * matching the CMS alias coalescing order. Returns undefined when no
 * listed key is present; presence (even null) counts.
 */
export function firstPresent(
  body: Record<string, unknown>,
  keys: readonly string[]
): unknown {
  for (const key of keys) {
    if (key in body) {
      return body[key];
    }
  }
  return undefined;
}

/**
 * Trimmed path segment: null when missing, blank, or non-string, so
 * callers answer the existing 404 (never 500) for empty ids.
 */
export function normalizePathSegment(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normalize a Hong Kong wall-clock timestamp to an ISO instant, or null
 * when unparseable. Pure port of the CMS handler predicate: an explicit
 * zone/offset parses directly, otherwise the value is read as
 * Asia/Hong_Kong wall time (UTC+8, no DST).
 */
export function normalizeHkTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const raw = value.trim();
  const parsed = /(?:Z|[+-]\d{2}:?\d{2})$/u.test(raw)
    ? new Date(raw)
    : (() => {
        const match =
          /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/u.exec(raw);
        if (!match) {
          return new Date("invalid");
        }
        const [, year, month, day, hour, minute, second = "00"] = match;
        return new Date(
          Date.UTC(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour) - 8,
            Number(minute),
            Number(second)
          )
        );
      })();
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Optional wire string with the CMS trim policy: absent stays absent,
 * null stays null, strings trim, non-strings stay invalid (undefined)
 * so callers fall back exactly as today.
 */
export function optionalTrimmedString(
  body: Record<string, unknown>,
  key: string
): string | null | undefined {
  if (!(key in body)) {
    return undefined;
  }
  const value = body[key];
  if (value === null) {
    return null;
  }
  return typeof value === "string" ? value.trim() : undefined;
}
