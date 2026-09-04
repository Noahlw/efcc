import { describe, expect, test } from "vitest";

import {
  CANARY_DURATION_MS,
  CANARY_RETRIES,
  firstCausalRuntimeSignal,
  isCanaryGreen,
  isRuntimeTransportResponse,
} from "./programs-runtime-canary.mjs";

describe("T05.3 Runtime Reliability Canary", () => {
  test("locks the owner-approved five-minute window with no retries", () => {
    expect(CANARY_DURATION_MS).toBe(5 * 60 * 1000);
    expect(CANARY_RETRIES).toBe(0);
  });

  test("keeps the first causal runtime signal ahead of downstream refusals", () => {
    expect(
      firstCausalRuntimeSignal([
        "kj::async-io-unix.c++:186: disconnected: Broken pipe",
        "Network connection lost.",
        "page.goto: net::ERR_CONNECTION_REFUSED",
      ])
    ).toContain("Broken pipe");
  });

  test("requires the full window and zero failures for Green", () => {
    const startedAt = 1_000;

    expect(
      isCanaryGreen({
        startedAt,
        finishedAt: startedAt + CANARY_DURATION_MS,
        failures: 0,
      })
    ).toBe(true);
    expect(
      isCanaryGreen({
        startedAt,
        finishedAt: startedAt + CANARY_DURATION_MS - 1,
        failures: 0,
      })
    ).toBe(false);
    expect(
      isCanaryGreen({
        startedAt,
        finishedAt: startedAt + CANARY_DURATION_MS,
        failures: 1,
      })
    ).toBe(false);
  });

  test("classifies the known Harness transport failure even with a request id", () => {
    expect(
      isRuntimeTransportResponse(500, "Error: Network connection lost")
    ).toBe(true);
    expect(isRuntimeTransportResponse(500, "application failed")).toBe(false);
    expect(isRuntimeTransportResponse(400, "Network connection lost")).toBe(
      false
    );
  });
});
