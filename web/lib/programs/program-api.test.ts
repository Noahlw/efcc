import { describe, expect, test } from "vitest";

import { RpcError } from "@/lib/api";

import {
  isUnknownMutationOutcome,
  isUnknownMutationWriteOutcome,
} from "./program-api";

describe("program mutation outcome classification", () => {
  test("keeps an INTERNAL_ERROR 500 settled for transport-only callers", () => {
    const error = new RpcError({ status: 500, code: "INTERNAL_ERROR" });

    expect(isUnknownMutationOutcome(error)).toBe(false);
    expect(isUnknownMutationWriteOutcome(error)).toBe(true);
  });

  test("preserves known mutation failures as settled", () => {
    const error = new RpcError({ status: 409, code: "CONFLICT" });

    expect(isUnknownMutationWriteOutcome(error)).toBe(false);
  });

  test("keeps transport failures unknown for both contracts", () => {
    const error = new RpcError({ status: 0, code: "NETWORK_ERROR" });

    expect(isUnknownMutationOutcome(error)).toBe(true);
    expect(isUnknownMutationWriteOutcome(error)).toBe(true);
  });
});
