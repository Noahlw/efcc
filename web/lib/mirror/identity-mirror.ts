/**
 * EFCC D1 → Sheets identity-metadata review mirror (AUTH-03 #161, ADR-0021).
 *
 * A scheduled, operator-controlled, one-directional mirror of D1 identity
 * METADATA into a Google Sheet for human read-only review. D1 remains the
 * sole system of record and the ONLY authorization source; the Sheet output
 * is never read back as any kind of authorization input.
 *
 * This Worker-side module:
 *   * Reads non-secret identity metadata from D1 (never credential hashes,
 *     never the legacy-pin hash, never any session value).
 *   * Builds a deterministic, content-addressed snapshot.
 *   * Signs it (canonical-JSON + HMAC-SHA256) so the Apps Script side can
 *     verify the Worker→Apps Script boundary — the same signed-boundary
 *     pattern as the existing service-envelope (CF1-01 / #151), but a
 *     distinct, self-contained envelope for the mirror.
 *   * POSTs it to the mirror Apps Script endpoint and fails closed on any
 *     API/lock failure, conflict, or partial run.
 *
 * Schedule: the Cloudflare Cron Trigger fires at 19:00 UTC daily
 * (`0 19 * * *`), which is 03:00 the next day in Asia/Hong_Kong (UTC+8).
 * D1 is authoritative; repeated runs converge without duplicates or
 * destructive whole-sheet rewrites (the Apps Script side appends new rows and
 * updates changed rows only).
 */

/** Envelope version; both the Worker and Apps Script verify this == 1. */
export const MIRROR_SIGNED_VERSION = 1;
/**
 * Cloudflare Cron Trigger schedule (UTC). 19:00 UTC = 03:00 Asia/Hong_Kong
 * (UTC+8) the following day. Verified against Cloudflare's cron-trigger
 * syntax (5-field UTC) via the workers-sdk docs.
 */
export const MIRROR_CRON_UTC = "0 19 * * *";

/** A non-secret identity-metadata row eligible for the review mirror. */
export interface IdentityMirrorRow {
  user_id: string;
  name: string;
  username: string;
  role: string;
  account_status: string;
  credential_kind: string;
  requires_upgrade: number;
  lock_level: number;
  created_at: number;
  updated_at: number;
}

/** The signed envelope posted to the Apps Script mirror endpoint. */
export interface MirrorEnvelope {
  version: number;
  issuedAt: number;
  idempotencyKey: string;
  accounts: IdentityMirrorRow[];
  signature: string;
}

const textEncoder = new TextEncoder();

/**
 * Recursively sort object keys and produce compact JSON. Must match
 * identityMirrorCanonicalJson_ in src/gas/identity-mirror.gs exactly so the
 * HMAC verifies across runtimes. undefined in objects is dropped; arrays keep
 * order; numbers/booleans are literal.
 */
export function canonicalJson(obj: unknown): string {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "string") return JSON.stringify(obj);
  if (typeof obj === "number" && Number.isFinite(obj)) return String(obj);
  if (typeof obj === "boolean") return String(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalJson).join(",") + "]";
  }
  if (typeof obj === "object") {
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    const pairs: string[] = [];
    for (const k of keys) {
      const val = (obj as Record<string, unknown>)[k];
      if (val === undefined) continue;
      pairs.push(JSON.stringify(k) + ":" + canonicalJson(val));
    }
    return "{" + pairs.join(",") + "}";
  }
  return "null";
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, textEncoder.encode(data))
  );
  let hex = "";
  for (const b of sig) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/** Content-addressed idempotency key: digest of the canonical snapshot. */
async function idempotencyKeyFor(accounts: IdentityMirrorRow[]): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      textEncoder.encode(canonicalJson(accounts))
    )
  );
  let hex = "";
  for (const b of digest) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/**
 * Build a deterministic, sorted-by-user_id snapshot from raw D1 rows. Rows
 * must each carry a non-empty user_id; duplicates are NOT silently merged —
 * the caller fails closed instead (conflicting identifiers are surfaced).
 */
export function buildIdentityMirrorRows(rows: unknown[]): IdentityMirrorRow[] {
  const out: IdentityMirrorRow[] = [];
  const seen = new Set<string>();
  for (const raw of rows) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const userId = String(r.user_id ?? "").trim();
    if (!userId) {
      throw new Error("Identity mirror: account row is missing user_id.");
    }
    if (seen.has(userId)) {
      throw new Error(`Identity mirror: duplicate user_id '${userId}'.`);
    }
    seen.add(userId);
    out.push({
      user_id: userId,
      name: String(r.name ?? ""),
      username: String(r.username ?? ""),
      role: String(r.role ?? ""),
      account_status: String(r.account_status ?? ""),
      credential_kind: String(r.credential_kind ?? ""),
      requires_upgrade: Number(r.requires_upgrade ?? 0),
      lock_level: Number(r.lock_level ?? 0),
      created_at: Number(r.created_at ?? 0),
      updated_at: Number(r.updated_at ?? 0),
    });
  }
  out.sort((a, b) => (a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0));
  return out;
}

/** Read the non-secret identity-metadata rows from D1. */
export async function readIdentityMirrorAccounts(
  db: D1Database
): Promise<IdentityMirrorRow[]> {
  const { results } = await db
    .prepare(
      `SELECT user_id, name, username, role, account_status,
              credential_kind, requires_upgrade, lock_level,
              created_at, updated_at
         FROM accounts
        ORDER BY user_id`
    )
    .all();
  return buildIdentityMirrorRows(results);
}

/** Sign a mirror envelope over the given snapshot. */
export async function signMirrorEnvelope(
  secret: string,
  accounts: IdentityMirrorRow[],
  now: number = Date.now()
): Promise<MirrorEnvelope> {
  const idempotencyKey = await idempotencyKeyFor(accounts);
  const payload = canonicalJson({
    version: MIRROR_SIGNED_VERSION,
    issuedAt: now,
    idempotencyKey,
    accounts,
  });
  const signature = await hmacHex(secret, payload);
  return {
    version: MIRROR_SIGNED_VERSION,
    issuedAt: now,
    idempotencyKey,
    accounts,
    signature,
  };
}

/**
 * Verify a mirror envelope's signature against the shared secret. Fail closed:
 * returns false for any malformed, wrong-version, or tampered envelope.
 */
export async function verifyMirrorEnvelope(
  secret: string,
  envelope: unknown
): Promise<boolean> {
  if (!envelope || typeof envelope !== "object") return false;
  const e = envelope as MirrorEnvelope;
  if (e.version !== MIRROR_SIGNED_VERSION) return false;
  if (typeof e.signature !== "string" || e.signature.length === 0) return false;
  if (!Array.isArray(e.accounts)) return false;
  const payload = canonicalJson({
    version: e.version,
    issuedAt: e.issuedAt,
    idempotencyKey: e.idempotencyKey,
    accounts: e.accounts,
  });
  const expected = await hmacHex(secret, payload);
  // Constant-time-ish compare.
  let mismatch = expected.length ^ e.signature.length;
  const n = Math.min(expected.length, e.signature.length);
  for (let i = 0; i < n; i++) mismatch |= expected.charCodeAt(i) ^ e.signature.charCodeAt(i);
  return mismatch === 0;
}

/** The upstream's acknowledged mirror result (secret-free). */
export interface MirrorAck {
  status: number;
  code?: string;
  detail?: string;
  added: number;
  updated: number;
  total: number;
}

export interface MirrorRunInput {
  secret: string;
  accounts: IdentityMirrorRow[];
  mirrorUrl: string;
  fetchImpl?: typeof fetch;
  now?: number;
}

export interface MirrorRunOutput {
  ok: boolean;
  ack: MirrorAck;
}

/**
 * Orchestrate one mirror run: sign the snapshot, POST it to the Apps Script
 * mirror endpoint, and fail closed unless the upstream acknowledges a clean
 * apply. `fetchImpl` is injectable for tests (never touches the real Sheet).
 */
export async function runIdentityMirror(
  input: MirrorRunInput
): Promise<MirrorRunOutput> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const envelope = await signMirrorEnvelope(
    input.secret,
    input.accounts,
    input.now
  );

  let upstream: Response;
  try {
    upstream = await fetchImpl(input.mirrorUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new Error(
      "Identity mirror failed closed: upstream unreachable." +
        (error instanceof Error ? ` ${error.message}` : "")
    );
  }

  let ack: MirrorAck;
  try {
    const parsed = (await upstream.json()) as Partial<MirrorAck>;
    ack = {
      status: Number(parsed.status ?? upstream.status),
      code: typeof parsed.code === "string" ? parsed.code : undefined,
      detail: typeof parsed.detail === "string" ? parsed.detail : undefined,
      added: Number(parsed.added ?? 0),
      updated: Number(parsed.updated ?? 0),
      total: Number(parsed.total ?? 0),
    };
  } catch {
    throw new Error("Identity mirror failed closed: upstream returned an unparseable response.");
  }

  if (ack.status >= 400) {
    throw new Error(
      `Identity mirror failed closed: upstream rejected the run (status ${ack.status}${ack.code ? `, ${ack.code}` : ""}).`
    );
  }

  return { ok: true, ack };
}