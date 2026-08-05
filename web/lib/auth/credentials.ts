/**
 * EFCC D1 identity — credential hashing and PIN normalization (ADR-0020).
 *
 * All credential material is hashed with PBKDF2-SHA256 (per-account random
 * salt, fixed iteration count) and stored as `pbkdf2:salt:hash` in D1. No
 * cleartext PIN, password, access token, or raw session value is ever
 * persisted, logged, or returned across an RPC boundary.
 *
 * The legacy PIN is a 4-digit numeric credential (ADR-0002). The one-time
 * legacy import stores only a salted hash of the normalized legacy PIN; the
 * hash is verified once during the forced credential upgrade and then cleared
 * (ADR-0020 §4 — the user-selected one-time legacy-PIN-hash path).
 *
 * Constants are exported for tests; the TTLs below are the session boundary
 * (ADR-0020 §2):
 *   ACCESS_TOKEN_TTL_MS  — short-lived signed access token (~15 min).
 *   REFRESH_IDLE_TTL_MS  — 90-day idle expiry for the D1 refresh session.
 */

export const PBKDF2_ITERATIONS = 210_000;
export const PBKDF2_KEY_LENGTH_BITS = 256;
export const SALT_BYTES = 16;
export const CREDENTIAL_PREFIX = "pbkdf2";
export const CREDENTIAL_DELIMITER = ":";

export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const REFRESH_IDLE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

const textEncoder = new TextEncoder();

/**
 * Normalize a 4-digit numeric PIN per ADR-0002: strip non-digits, take the
 * rightmost 4 digits, zero-pad left to 4. Returns "" for input with no
 * digits. Mirrors the legacy Apps Script `sessionNormalizePin_`.
 */
export function normalizePin(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.length <= 4) return digits.padStart(4, "0");
  return digits.slice(-4);
}

/**
 * Normalize a username for uniqueness: trim + lowercase. The normalized form
 * is the unique lookup key (ADR-0020 §1).
 */
export function normalizeUsername(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  return String(raw).trim().toLowerCase();
}

/** Constant-time string comparison to avoid early-exit timing channels. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Base64url-encode a byte array (no padding). */
function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Base64url-decode a string to bytes. */
function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Derive a PBKDF2-SHA256 key from a secret and salt. Returns base64url bytes.
 */
async function pbkdf2(secret: string, salt: Uint8Array): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
    },
    keyMaterial,
    PBKDF2_KEY_LENGTH_BITS
  );
  return new Uint8Array(bits);
}

/**
 * Hash a credential with a fresh random salt. Returns a `pbkdf2:salt:hash`
 * string safe to store in D1. salt is base64url, hash is base64url.
 */
export async function hashCredential(secret: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await pbkdf2(secret, salt);
  return [
    CREDENTIAL_PREFIX,
    toBase64Url(salt),
    toBase64Url(key),
  ].join(CREDENTIAL_DELIMITER);
}

/**
 * Verify a secret against a stored `pbkdf2:salt:hash` credential string.
 * Returns false for malformed or tampered stored values (fail closed).
 */
export async function verifyCredential(
  secret: string,
  stored: string | null | undefined
): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split(CREDENTIAL_DELIMITER);
  if (parts.length !== 3 || parts[0] !== CREDENTIAL_PREFIX) return false;
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = fromBase64Url(parts[1]);
    expected = fromBase64Url(parts[2]);
  } catch {
    return false;
  }
  const actual = await pbkdf2(secret, salt);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual[i] ^ expected[i];
  }
  return diff === 0;
}