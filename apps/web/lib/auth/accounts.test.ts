/** Account lookup and schema-boundary coverage for the password-only model. */

import { beforeAll, describe, expect, test } from "vitest";

import { findAccountByUserId, findAccountByUsername } from "./accounts";
import { applyMigrations, seedTestAccount, testDb } from "./test-bootstrap";

beforeAll(async () => {
  await applyMigrations();
});

describe("account repository", () => {
  test("migrations create the account, registration, and session tables", async () => {
    for (const table of ["accounts", "registration_requests", "sessions"]) {
      const row = await testDb()
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
        )
        .bind(table)
        .first();
      expect(row, `table ${table} should exist`).toBeTruthy();
    }
  });

  test("looks up password accounts by immutable ID and normalized username", async () => {
    await seedTestAccount({
      userId: "ACCOUNT_LOOKUP",
      name: "Lookup User",
      username: "Lookup-User",
      password: "lookup-password",
    });

    const byId = await findAccountByUserId(testDb(), "ACCOUNT_LOOKUP");
    const byUsername = await findAccountByUsername(testDb(), " lookup-user ");

    expect(byId?.user_id).toBe("ACCOUNT_LOOKUP");
    expect(byUsername?.user_id).toBe("ACCOUNT_LOOKUP");
    expect(byUsername?.credential_hash).toMatch(/^pbkdf2:/u);
  });

  test("rejects a second account with the same normalized username", async () => {
    await seedTestAccount({
      userId: "ACCOUNT_UNIQUE_A",
      name: "Unique A",
      username: "unique-account",
      password: "unique-password",
    });

    await expect(
      seedTestAccount({
        userId: "ACCOUNT_UNIQUE_B",
        name: "Unique B",
        username: " Unique-Account ",
        password: "another-password",
      })
    ).rejects.toThrow(/UNIQUE constraint failed/u);
  });

  test("keeps User_ID immutable at the schema boundary", async () => {
    await seedTestAccount({
      userId: "ACCOUNT_IMMUTABLE",
      name: "Immutable User",
      username: "immutable-user",
      password: "immutable-password",
    });

    await expect(
      testDb()
        .prepare("UPDATE accounts SET user_id = ? WHERE user_id = ?")
        .bind("ACCOUNT_CHANGED", "ACCOUNT_IMMUTABLE")
        .run()
    ).rejects.toThrow(/user_id is immutable/u);
  });
});
