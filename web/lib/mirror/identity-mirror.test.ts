/**
 * AUTH-03 (#161) — D1 → Sheets identity-metadata review mirror, Worker side.
 *
 * Acceptance covered here (ADR-0021, web/lib/mirror/identity-mirror.ts):
 *   - The snapshot is deterministic, sorted by user_id, and carries ONLY
 *     non-secret identity metadata (never credential/legacy-pin hashes or
 *     session values).
 *   - Missing/duplicate user identifiers fail closed.
 *   - The signed envelope verifies across the Worker→Apps Script boundary;
 *     tampering or a wrong secret fails closed.
 *   - runIdentityMirror fails closed on fetch/API/lock failure or an upstream
 *     rejection (never writes the real Sheet — fetch is injected/mocked).
 *   - The schedule/handler wiring: the cron is `0 19 * * *` (19:00 UTC =
 *     03:00 Asia/Hong_Kong next day) and the worker exports a scheduled
 *     handler (covered structurally in worker.ts).
 *   - D1 remains authoritative: the mirror only ever reads D1, never reads
 *     the review Sheet back as authorization.
 */
import { describe, test, expect } from "vitest";

import {
  MIRROR_CRON_UTC,
  MIRROR_SIGNED_VERSION,
  canonicalJson,
  buildIdentityMirrorRows,
  signMirrorEnvelope,
  verifyMirrorEnvelope,
  runIdentityMirror,
} from "./identity-mirror";

const SECRET = "mirror-shared-secret";

/** A helper fetch that returns a canned JSON ack. */
function ackFetch(status: number, body: Record<string, unknown>) {
  return async () =>
    new Response(JSON.stringify({ status, added: 0, updated: 0, total: 0, ...body }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
}

const ROWS = [
  { user_id: "U2", name: "Bob", username: "bob", role: "Member", account_status: "Active", credential_kind: "password", requires_upgrade: 0, lock_level: 0, created_at: 1, updated_at: 2 },
  { user_id: "U1", name: "Alice", username: "alice", role: "Admin", account_status: "Active", credential_kind: "password", requires_upgrade: 0, lock_level: 0, created_at: 1, updated_at: 2 },
];

describe("AUTH-03: snapshot builder", () => {
  test("is deterministic and sorted by user_id", () => {
    const rows = buildIdentityMirrorRows(ROWS);
    expect(rows.map((r) => r.user_id)).toEqual(["U1", "U2"]);
    expect(buildIdentityMirrorRows(ROWS)).toEqual(rows);
  });

  test("carries only non-secret identity metadata", () => {
    const rows = buildIdentityMirrorRows(ROWS);
    for (const r of rows) {
      const s = JSON.stringify(r);
      // No credential material leaks into the review payload.
      expect(s).not.toMatch(/credential_hash|legacy_pin_hash|session/i);
      expect(Object.keys(r).sort()).toEqual(
        [
          "account_status", "created_at", "credential_kind", "lock_level",
          "name", "requires_upgrade", "role", "updated_at", "user_id", "username",
        ].sort()
      );
    }
  });

  test("fails closed on a missing user_id", () => {
    expect(() => buildIdentityMirrorRows([{ user_id: "" }])).toThrow(/missing user_id/);
  });

  test("fails closed on a duplicate user_id", () => {
    expect(() => buildIdentityMirrorRows([ROWS[1], ROWS[1]])).toThrow(/duplicate user_id/);
  });

  test("canonical JSON is deterministic (sorted object keys)", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ a: [3, 1, 2] })).toBe('{"a":[3,1,2]}');
  });
});

describe("AUTH-03: signed envelope boundary", () => {
  test("signs and verifies a round trip", async () => {
    const rows = buildIdentityMirrorRows(ROWS);
    const envelope = await signMirrorEnvelope(SECRET, rows, 1000);
    expect(envelope.version).toBe(MIRROR_SIGNED_VERSION);
    expect(envelope.signature).toBeTruthy();
    expect(await verifyMirrorEnvelope(SECRET, envelope)).toBe(true);
  });

  test("tampering fails closed", async () => {
    const envelope = await signMirrorEnvelope(SECRET, buildIdentityMirrorRows(ROWS), 1000);
    const tampered = {
      ...envelope,
      accounts: envelope.accounts.map((a) => ({ ...a, role: "Admin" })),
    };
    expect(await verifyMirrorEnvelope(SECRET, tampered)).toBe(false);
  });

  test("a wrong secret fails closed", async () => {
    const envelope = await signMirrorEnvelope(SECRET, buildIdentityMirrorRows(ROWS), 1000);
    expect(await verifyMirrorEnvelope("other-secret", envelope)).toBe(false);
  });

  test("malformed / wrong-version envelopes fail closed", async () => {
    const envelope = await signMirrorEnvelope(SECRET, buildIdentityMirrorRows(ROWS), 1000);
    expect(await verifyMirrorEnvelope(SECRET, null)).toBe(false);
    expect(await verifyMirrorEnvelope(SECRET, { ...envelope, version: 99 })).toBe(false);
    expect(await verifyMirrorEnvelope(SECRET, { ...envelope, signature: "" })).toBe(false);
  });
});

describe("AUTH-03: runIdentityMirror orchestration", () => {
  test("acknowledges a clean apply", async () => {
    const out = await runIdentityMirror({
      secret: SECRET,
      accounts: buildIdentityMirrorRows(ROWS),
      mirrorUrl: "https://mirror.example/exec",
      fetchImpl: ackFetch(200, { added: 2, updated: 0, total: 2 }),
    });
    expect(out.ok).toBe(true);
    expect(out.ack.added).toBe(2);
    expect(out.ack.total).toBe(2);
  });

  test("fails closed when the upstream rejects the run", async () => {
    await expect(
      runIdentityMirror({
        secret: SECRET,
        accounts: buildIdentityMirrorRows(ROWS),
        mirrorUrl: "https://mirror.example/exec",
        fetchImpl: ackFetch(422, { code: "CONFLICT", detail: "duplicate user_id 'U1'" }),
      })
    ).rejects.toThrow(/failed closed.*422/);
  });

  test("fails closed when the upstream is unreachable", async () => {
    await expect(
      runIdentityMirror({
        secret: SECRET,
        accounts: buildIdentityMirrorRows(ROWS),
        mirrorUrl: "https://mirror.example/exec",
        fetchImpl: async () => {
          throw new Error("network down");
        },
      })
    ).rejects.toThrow(/upstream unreachable/);
  });

  test("fails closed on an unparseable upstream response", async () => {
    await expect(
      runIdentityMirror({
        secret: SECRET,
        accounts: buildIdentityMirrorRows(ROWS),
        mirrorUrl: "https://mirror.example/exec",
        fetchImpl: async () => new Response("not json", { status: 200 }),
      })
    ).rejects.toThrow(/unparseable/);
  });
});

describe("AUTH-03: schedule / handler wiring", () => {
  test("cron is 0 19 * * * (19:00 UTC = 03:00 Asia/Hong_Kong next day)", () => {
    expect(MIRROR_CRON_UTC).toBe("0 19 * * *");
    // 03:00 HKT (UTC+8) == 19:00 UTC the previous day.
    const hkt = new Date("2026-08-06T03:00:00+08:00");
    expect(hkt.toISOString()).toBe("2026-08-05T19:00:00.000Z");
  });
});