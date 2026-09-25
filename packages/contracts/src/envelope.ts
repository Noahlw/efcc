/**
 * Shared success-envelope contract (spec #646).
 *
 * Every non-Auth 2xx answers `{ requestId, data }` with an
 * `X-Request-Id` header. Browser and Worker validate the envelope
 * (requestId present, data key present) before touching the payload.
 */
import * as z from "zod";

export const SuccessEnvelopeSchema = z.object({
  requestId: z.string().min(1),
  data: z.unknown(),
});

export type SuccessEnvelope = z.infer<typeof SuccessEnvelopeSchema>;

/**
 * Total envelope parse: null when the value is not an enveloped
 * response (missing requestId or missing data key). Never throws.
 */
export function parseSuccessEnvelope(value: unknown): {
  requestId: string;
  data: unknown;
} | null {
  const parsed = SuccessEnvelopeSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  if (
    typeof parsed.data !== "object" ||
    parsed.data === null ||
    !("data" in parsed.data)
  ) {
    return null;
  }
  return { requestId: parsed.data.requestId, data: parsed.data.data };
}
