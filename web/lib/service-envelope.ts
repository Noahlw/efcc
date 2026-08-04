/**
 * EFCC signed service envelope (CF1-01 / #151).
 *
 * The Worker constructs a versioned HMAC-SHA-256 service envelope over
 * recursively sorted compact UTF-8 JSON, carrying the browser's action,
 * params, and session identity. Apps Script verifies the envelope before
 * dispatching to api_* functions. This is the trusted service-to-service
 * transport (ADR-0018 §2, §4): browser Authorization, X-Efcc-Session-Id,
 * and Idempotency-Key are never forwarded as raw upstream headers.
 *
 * The signature is computed over the canonical JSON of the envelope with
 * the `signature` field excluded. Both sides must produce identical JSON
 * for the HMAC to match.
 */

export interface ServiceRequest {
  action: string;
  params: Record<string, unknown>;
  sessionId?: string;
  authorization?: string;
  idempotencyKey?: string;
}

export interface ServiceEnvelope {
  version: number;
  keyId: string;
  timestamp: number;
  nonce: string;
  attemptGroup: string;
  attemptId: number;
  request: ServiceRequest;
  metadata: Record<string, unknown>;
  signature: string;
}

/**
 * Recursively sort object keys and produce compact JSON.
 * Follows standard JSON.stringify semantics: undefined in objects is
 * dropped, arrays preserve order, numbers and booleans are literal.
 */
export function canonicalJson(obj: unknown): string {
  if (obj === null) {return "null";}
  if (typeof obj === "string") {return JSON.stringify(obj);}
  if (typeof obj === "number") {
    return Number.isFinite(obj) ? String(obj) : "null";
  }
  if (typeof obj === "boolean") {return String(obj);}
  if (Array.isArray(obj)) {
    return `[${  obj.map(canonicalJson).join(",")  }]`;
  }
  if (typeof obj === "object") {
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    const pairs: string[] = [];
    for (const k of keys) {
      const val = (obj as Record<string, unknown>)[k];
      if (val === undefined) {continue;}
      pairs.push(`${JSON.stringify(k)  }:${  canonicalJson(val)}`);
    }
    return `{${  pairs.join(",")  }}`;
  }
  return "null";
}

/**
 * Canonical JSON of an object with one top-level key excluded.
 * Used to compute the signature payload (signature field excluded).
 */
export function canonicalJsonExcept(
  obj: Record<string, unknown>,
  excludeKey: string
): string {
  const keys = Object.keys(obj)
    .filter((k) => k !== excludeKey)
    .sort();
  const pairs: string[] = [];
  for (const k of keys) {
    const val = obj[k];
    if (val === undefined) {continue;}
    pairs.push(`${JSON.stringify(k)  }:${  canonicalJson(val)}`);
  }
  return `{${  pairs.join(",")  }}`;
}

/**
 * Compute HMAC-SHA256 hex digest using the Web Crypto API.
 * Available in workerd, modern browsers, and Node 20+.
 */
export async function hmacSha256Hex(
  secret: string,
  data: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const hex = [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex;
}

/**
 * Build a signed service envelope for a given request and shared secret.
 */
export async function signServiceEnvelope(
  secret: string,
  request: ServiceRequest,
  options?: { keyId?: string; nonce?: string; attemptGroup?: string }
): Promise<ServiceEnvelope> {
  const envelope: Omit<ServiceEnvelope, "signature"> = {
    version: 1,
    keyId: options?.keyId ?? "k1",
    timestamp: Date.now(),
    nonce: options?.nonce ?? crypto.randomUUID(),
    attemptGroup: options?.attemptGroup ?? crypto.randomUUID(),
    attemptId: 1,
    request,
    metadata: {},
  };
  const payload = canonicalJsonExcept(
    envelope as unknown as Record<string, unknown>,
    "signature"
  );
  const signature = await hmacSha256Hex(secret, payload);
  return { ...envelope, signature };
}

/**
 * Verify a service envelope's signature against a shared secret.
 */
export async function verifyServiceEnvelope(
  secret: string,
  envelope: ServiceEnvelope
): Promise<boolean> {
  const payload = canonicalJsonExcept(
    envelope as unknown as Record<string, unknown>,
    "signature"
  );
  const expected = await hmacSha256Hex(secret, payload);
  if (expected.length !== envelope.signature.length) {return false;}
  let mismatch = 0;
  // eslint-disable-next-line no-plusplus, no-bitwise -- timing-safe HMAC compare requires bitwise ops.
  for (let i = 0; i < expected.length; i++) {
    // eslint-disable-next-line no-bitwise
    mismatch |= expected.codePointAt(i) ^ envelope.signature.codePointAt(i);
  }
  return mismatch === 0;
}
