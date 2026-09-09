import { describe, expect, test } from "vitest";

import {
  assertRoleFreeIdentitySchema,
  parseSchemaRows,
} from "./inspect-local-identity-schema";

const requiredObjects = [
  "role_categories",
  "role_definitions",
  "role_definition_grants",
  "role_assignments",
  "role_policy_revisions",
  "role_policy_mutations",
  "role_audit_events",
  "accounts",
  "registration_requests",
];

function schemaOutput(extraRows: Record<string, unknown>[] = []): string {
  return JSON.stringify([
    {
      results: [
        ...requiredObjects.map((name) => ({
          kind: "object",
          name,
          type: "table",
          table_name: null,
          column_name: null,
        })),
        {
          kind: "column",
          name: null,
          type: "table",
          table_name: "accounts",
          column_name: "account_status",
        },
        {
          kind: "column",
          name: null,
          type: "table",
          table_name: "registration_requests",
          column_name: "request_id",
        },
        ...extraRows,
      ],
    },
  ]);
}

describe("inspect-local-identity-schema", () => {
  test("accepts the normalized role-free schema", () => {
    expect(() =>
      assertRoleFreeIdentitySchema(parseSchemaRows(schemaOutput()))
    ).not.toThrow();
  });

  test("rejects legacy objects and role columns", () => {
    expect(() =>
      assertRoleFreeIdentitySchema(
        parseSchemaRows(
          schemaOutput([
            {
              kind: "object",
              name: "role_capabilities",
              type: "table",
              table_name: null,
              column_name: null,
            },
            {
              kind: "column",
              name: null,
              type: "table",
              table_name: "accounts",
              column_name: "role",
            },
          ])
        )
      )
    ).toThrow(/role_capabilities|accounts/iu);
  });
});
