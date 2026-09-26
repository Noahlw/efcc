/**
 * Shared RFC 9457 Problem Details contract (spec #646).
 *
 * Wire shape: `{ type, title, status, code, detail, requestId }` plus
 * `X-Request-Id` and endpoint-specific extensions (e.g. CMS `latest` /
 * `reloadRequired`). Known keys stay optional for partial legacy errors,
 * but a body with no problem meaning or a status contradicting HTTP
 * resolves to null for the caller fallback. A malformed error body
 * must stay an error with its HTTP status and request reference,
 * never become success.
 */
import * as z from "zod";

export const ProblemDetailsSchema = z.object({
  type: z.string().optional(),
  title: z.string().optional(),
  status: z.number().int().optional(),
  code: z.string().optional(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  requestId: z.string().optional(),
});

export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;

export interface ResolvedProblem {
  status: number;
  code?: string;
  title?: string;
  detail?: string;
  type?: string;
  instance?: string;
  requestId?: string;
  [key: string]: unknown;
}

/**
 * Total error-body parse. A well-formed Problem Details value resolves
 * to the ORIGINAL record (extensions preserved) with HTTP status and
 * header requestId filled in only when absent. Anything else resolves
 * to null so callers apply their existing fallback (status +
 * requestId, never success).
 */
export function parseProblemDetails(
  value: unknown,
  httpStatus: number,
  headerRequestId?: string
): ResolvedProblem | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const parsed = ProblemDetailsSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  if (
    (parsed.data.type === undefined &&
      parsed.data.title === undefined &&
      parsed.data.detail === undefined &&
      parsed.data.code === undefined) ||
    (parsed.data.status !== undefined && parsed.data.status !== httpStatus)
  ) {
    return null;
  }
  // HTTP status is authoritative; extensions and body requestId survive.
  const original = value as Record<string, unknown>;
  const resolved: ResolvedProblem = {
    ...original,
    status: httpStatus,
  };
  if (headerRequestId && !resolved.requestId) {
    resolved.requestId = headerRequestId;
  }
  return resolved;
}

/**
 * Existing malformed-error fallback: preserves HTTP status and request
 * reference with the caller's historical code/title/detail.
 */
export function problemFallback(
  status: number,
  requestId: string | undefined,
  code: "UNAVAILABLE" | "MALFORMED_RESPONSE",
  title: string,
  detail: string
): ResolvedProblem {
  return { status, code, title, detail, requestId };
}
