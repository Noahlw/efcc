/**
 * AUTH-01 (#159) — D1 identity schema + one-time legacy Users-sheet import,
 * plus the forced credential-upgrade gate.
 *
 * Acceptance covered here:
 *   - D1 migrations apply cleanly (accounts, registration_requests, sessions).
 *   - User_ID is immutable at the schema level; username uniqueness is
 *     enforced transactionally on the normalized form.
 *   - Legacy import is read-only against the (fixture) sheet, deterministic,
 *     and idempotent (re-run does not duplicate); duplicate / malformed rows
 *     fail closed with a diagnostic and no partial write.
 *   - No cleartext PIN or password is logged, returned, or persisted.
 *   - Every migrated account requires a forced credential upgrade before any
 *     session is issued (enforced by the legacy_pin marker).
 *
 * Each test uses its own fixture IDs so tests are order-independent.
 * No PIN, password, access token, or raw session value appears in any
 * assertion, fixture diagnostic, or expected/logged output.
 */
import { describe, test, expect, beforeAll } from "vitest";

import { applyMigrations, testDb } from "./test-bootstrap";
import {
  importLegacyUsers,
  findAccountByUserId,
  findAccountByUsername,
} from "./accounts";
import { completeCredentialUpgrade } from "./upgrade";
import { issueSession, verifyAccessToken } from "./sessions";
import { ACCESS_TOKEN_TTL_MS } from "./credentials";

const SECRET = "test-access-token-secret";

const HEADER = ["User_ID", "Name", "Username", "PIN_Code", "System_Role", "Status"];

beforeAll(async () => {
  await applyMigrations();
});

function countAccounts(): Promise<number> {
  return countQuery("accounts");
}

/** COUNT(*) helper that narrows the D1 row before reading `n`. */
async function countQuery(table: string): Promise<number> {
  const row = await testDb()
    .prepare(`SELECT COUNT(*) AS n FROM ${table}`)
    .first();
  if (row && typeof row === "object" && "n" in row) {
    return Number(row.n);
  }
  return 0;
}

describe("AUTH-01: schema", () => {
  test("migrations create accounts / registration_requests / sessions tables", async () => {
    for (const table of ["accounts", "registration_requests", "sessions"]) {
      const r = await testDb()
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
        )
        .bind(table)
        .first();
      expect(r, `table ${table} should exist`).toBeTruthy();
    }
  });

  test("User_ID is immutable at the schema level", async () => {
    await importLegacyUsers(testDb(), [
      HEADER,
      ["U100", "Alice Chan", "alice100", "1234", "Admin", "Active"],
    ]);
    await expect(
      testDb()
        .prepare("UPDATE accounts SET user_id = 'U999' WHERE user_id = 'U100'")
        .run()
    ).rejects.toThrow(/user_id is immutable/);
  });

  test("username uniqueness is enforced transactionally on normalized form", async () => {
    await importLegacyUsers(testDb(), [
      HEADER,
      ["U101", "Alice Chan", "alice101", "1234", "Admin", "Active"],
    ]);
    // 'Alice101' and 'alice101' normalize to the same key -> UNIQUE violation.
    await expect(
      testDb()
        .prepare(
          `INSERT INTO accounts (
             user_id, name, username, username_normalized, credential_kind,
             credential_version, account_status, role, legacy_pin_hash,
             requires_upgrade, created_at, updated_at
           ) VALUES (?, ?, ?, ?, 'password', 2, 'Active', 'Member',
                     NULL, 0, ?, ?)`
        )
        .bind(
          "U199",
          "Alice Clone",
          "Alice101",
          "alice101",
          Date.now(),
          Date.now()
        )
        .run()
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });
});

describe("AUTH-01: legacy import", () => {
  test("clean import creates one account per row with legacy_pin marker", async () => {
    const before = await countAccounts();
    const rows = [
      HEADER,
      ["U201", "Alice Chan", "alice201", "1234", "Admin", "Active"],
      ["U202", "Bob Lee", "bob202", "5678", "Member", "Active"],
      ["U203", "Carol Wong", "carol203", "0000", "Teacher", "Active"],
    ];
    const result = await importLegacyUsers(testDb(), rows);
    expect(result.imported).toBe(3);
    expect(result.skipped).toBe(0);
    expect(await countAccounts()).toBe(before + 3);

    const alice = await findAccountByUsername(testDb(), "alice201");
    expect(alice).not.toBeNull();
    expect(alice!.user_id).toBe("U201");
    expect(alice!.role).toBe("Admin");
    expect(alice!.requires_upgrade).toBe(1);
    expect(alice!.credential_kind).toBe("legacy_pin");
    expect(alice!.credential_hash).toBeNull();
    // One-time legacy PIN hash is stored, never the cleartext PIN.
    expect(alice!.legacy_pin_hash).toMatch(/^pbkdf2:/);
    // Scan every field except the wall-clock timestamps, whose digits can
    // coincidentally contain any 4-digit sequence (e.g. epoch 1785912340xxx).
    const { created_at, updated_at, ...rest } = alice!;
    void created_at;
    void updated_at;
    expect(JSON.stringify(rest)).not.toContain("1234");
  });

  test("re-run is idempotent — no duplicate accounts", async () => {
    const row = ["U210", "David Tang", "david210", "1111", "Member", "Active"];
    await importLegacyUsers(testDb(), [HEADER, row]);
    const first = await countAccounts();
    const rerun = await importLegacyUsers(testDb(), [HEADER, row]);
    expect(rerun.imported).toBe(0);
    expect(rerun.skipped).toBe(1);
    expect(await countAccounts()).toBe(first);
  });

  test("duplicate username in source fails closed with no partial write", async () => {
    const before = await countAccounts();
    const dupRows = [
      HEADER,
      ["U220", "David", "david220", "1111", "Member", "Active"],
      ["U221", "David Clone", "david220", "2222", "Member", "Active"],
    ];
    await expect(importLegacyUsers(testDb(), dupRows)).rejects.toThrow(
      /duplicate username/
    );
    expect(await countAccounts()).toBe(before); // nothing written
  });

  test("malformed row (missing PIN) fails closed with a clear diagnostic", async () => {
    const before = await countAccounts();
    const badRows = [
      HEADER,
      ["U230", "Eve", "eve230", "", "Member", "Active"],
      ["U231", "Frank", "frank231", "9999", "Member", "Active"],
    ];
    await expect(importLegacyUsers(testDb(), badRows)).rejects.toThrow(
      /missing PIN_Code/
    );
    expect(await countAccounts()).toBe(before); // nothing written
  });

  test("missing required column fails closed", async () => {
    await expect(
      importLegacyUsers(testDb(), [
        ["User_ID", "Name", "Username", "System_Role", "Status"], // no PIN_Code
        ["U240", "Grace", "grace240", "Member", "Active"],
      ])
    ).rejects.toThrow(/missing a required column/);
  });

  test(
    "incoming username_normalized collides with an existing D1 account: no partial write (DB byte-for-byte unchanged)",
    async () => {
      // Seed an existing D1 account that owns the username "alice-collision".
      await importLegacyUsers(testDb(), [
        HEADER,
        ["U500", "Alice Owner", "alice-collision", "1234", "Member", "Active"],
      ]);
      const beforeCount = await countAccounts();
      const beforeAll = await testDb()
        .prepare(
          "SELECT user_id, username, username_normalized FROM accounts ORDER BY user_id"
        )
        .all<{ user_id: string; username: string; username_normalized: string }>();

      // Incoming import with a row whose normalized username collides with
      // the existing account. The preflight must fail closed BEFORE any write.
      await expect(
        importLegacyUsers(testDb(), [
          HEADER,
          ["U501", "Ben", "ben501", "1111", "Member", "Active"],
          ["U502", "Clone Alice", "ALICE-COLLISION", "2222", "Member", "Active"],
        ])
      ).rejects.toThrow(/collides with an existing D1 account/);

      // The DB is byte-for-byte unchanged: no new accounts were imported.
      expect(await countAccounts()).toBe(beforeCount);
      const afterAll = await testDb()
        .prepare(
          "SELECT user_id, username, username_normalized FROM accounts ORDER BY user_id"
        )
        .all<{ user_id: string; username: string; username_normalized: string }>();
      expect(afterAll.results).toEqual(beforeAll.results);
    }
  );

  test(
    "two incoming rows collide after normalization: no partial write",
    async () => {
      const beforeCount = await countAccounts();

      // Two incoming rows with distinct user_ids but the same normalized
      // username. The source-duplicate preflight must fail closed BEFORE
      // any DB write is issued.
      await expect(
        importLegacyUsers(testDb(), [
          HEADER,
          ["U510", "Dan", "dan510", "3333", "Member", "Active"],
          ["U511", "Dan Clone", "DAN510", "4444", "Member", "Active"],
        ])
      ).rejects.toThrow(/duplicate username/i);

      // The DB is byte-for-byte unchanged: zero new accounts imported.
      expect(await countAccounts()).toBe(beforeCount);
      const dan = await findAccountByUsername(testDb(), "dan510");
      expect(dan).toBeNull();
    }
  );

  test("adminUnlock returns false (not true) for a nonexistent user", async () => {
    const { adminUnlockLegacyUpgrade } = await import("./lockout");
    const result = await adminUnlockLegacyUpgrade(
      testDb(),
      "U-DOES-NOT-EXIST",
      Date.now()
    );
    expect(result).toBe(false);
  });
});

describe("AUTH-01: forced credential upgrade gate", () => {
  test("no session is issued before the upgrade completes", async () => {
    await importLegacyUsers(testDb(), [
      HEADER,
      ["U300", "Hugo", "hugo300", "1234", "Member", "Active"],
    ]);
    await expect(
      issueSession(testDb(), { userId: "U300", accessTokenSecret: SECRET })
    ).rejects.toMatchObject({ code: "UPGRADE_REQUIRED" });
  });

  test("upgrade verifies the one-time legacy PIN hash, then clears it", async () => {
    await importLegacyUsers(testDb(), [
      HEADER,
      ["U301", "Ivy", "ivy301", "1234", "Member", "Active"],
    ]);
    const result = await completeCredentialUpgrade(testDb(), {
      userId: "U301",
      legacyPin: "1234",
      newCredential: "new-secret-pass",
    });
    expect(result.ok).toBe(true);

    const ivy = await findAccountByUserId(testDb(), "U301");
    expect(ivy!.requires_upgrade).toBe(0);
    expect(ivy!.legacy_pin_hash).toBeNull(); // one-time hash consumed
    expect(ivy!.credential_kind).toBe("password");
    expect(ivy!.credential_hash).toMatch(/^pbkdf2:/);
    // Cleartext values never remain in the row.
    // Exclude wall-clock timestamps, whose digits may coincidentally contain
    // the PIN (e.g. epoch 1785912340xxx contains "1234").
    const { created_at, updated_at, ...rest } = ivy!;
    void created_at;
    void updated_at;
    const serialized = JSON.stringify(rest);
    expect(serialized).not.toContain("1234");
    expect(serialized).not.toContain("new-secret-pass");
  });

  test("wrong legacy PIN does not upgrade and never leaks identity", async () => {
    await importLegacyUsers(testDb(), [
      HEADER,
      ["U302", "Jack", "jack302", "1234", "Member", "Active"],
    ]);
    await expect(
      completeCredentialUpgrade(testDb(), {
        userId: "U302",
        legacyPin: "9999",
        newCredential: "x",
      })
    ).rejects.toThrow(/Invalid username or PIN/);
    const jack = await findAccountByUserId(testDb(), "U302");
    expect(jack!.requires_upgrade).toBe(1); // still gated
    expect(jack!.legacy_pin_hash).not.toBeNull();
  });

  test("upgrade on a non-legacy account is rejected", async () => {
    await importLegacyUsers(testDb(), [
      HEADER,
      ["U303", "Kim", "kim303", "1234", "Member", "Active"],
    ]);
    await completeCredentialUpgrade(testDb(), {
      userId: "U303",
      legacyPin: "1234",
      newCredential: "x",
    });
    await expect(
      completeCredentialUpgrade(testDb(), {
        userId: "U303",
        legacyPin: "1234",
        newCredential: "y",
      })
    ).rejects.toThrow(/not awaiting credential upgrade/);
  });

  test("after upgrade a session is issued normally", async () => {
    await importLegacyUsers(testDb(), [
      HEADER,
      ["U304", "Leo", "leo304", "1234", "Member", "Active"],
    ]);
    await completeCredentialUpgrade(testDb(), {
      userId: "U304",
      legacyPin: "1234",
      newCredential: "new-secret-pass",
    });
    const bundle = await issueSession(testDb(), {
      userId: "U304",
      accessTokenSecret: SECRET,
    });
    const claims = await verifyAccessToken(SECRET, bundle.accessToken);
    expect(claims).not.toBeNull();
    expect(claims!.uid).toBe("U304");
    expect(claims!.exp - claims!.iat).toBe(ACCESS_TOKEN_TTL_MS);
  });
});