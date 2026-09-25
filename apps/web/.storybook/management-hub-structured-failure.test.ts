// @vitest-environment jsdom

import { describe, expect, test } from "vitest";

import {
  formatContractFailure,
  StructuredContractFailureError,
} from "@/lib/governance/failure-reporter";

import {
  runBrokenManagementHubElementProbe,
  runBrokenManagementHubProbe,
} from "./management-hub-structured-failure";

describe("T07.1 deliberately broken fixture", () => {
  test("emits existing T03 structured failure shape", () => {
    let failureError: StructuredContractFailureError | undefined;

    try {
      runBrokenManagementHubProbe();
    } catch (error) {
      if (error instanceof StructuredContractFailureError) {
        failureError = error;
      } else {
        throw error;
      }
    }

    expect(failureError).toBeInstanceOf(StructuredContractFailureError);
    if (!failureError) {
      throw new Error("Expected the deliberately broken fixture to fail.");
    }

    const formatted = formatContractFailure(failureError.failure);
    const normalized = formatted.replaceAll(/\s+/gu, " ").trim();
    expect(failureError).toMatchObject({
      name: "StructuredContractFailureError",
      failure: {
        ruleId: "RULE-MINIMUM-TAP-TARGET",
        route: "/management",
        scenario: "PSN-MGMT-HUB-DEFAULT",
        viewport: { width: 390, height: 844 },
        browser: "chromium",
        probe: "t07-1-broken-management-hub-fixture",
        expected: 44,
        actual: 36,
        computedStyles: { minHeight: "36px", height: "36px" },
        geometry: { width: 36, height: 36, top: 400, left: 20 },
        likelyOwnershipLayer: "primitive",
        baselineSha: "a1a40d12d7a334183951604ae1adec509015474c",
      },
    });

    const expectedFields = [
      "[UI CONTRACT FAILURE] Rule: RULE-MINIMUM-TAP-TARGET",
      "Route: /management",
      "Scenario: PSN-MGMT-HUB-DEFAULT",
      "Viewport: 390px x 844px",
      "Browser: chromium",
      "Probe: t07-1-broken-management-hub-fixture",
      "Expected: 44",
      "Actual: 36",
      "Baseline SHA: a1a40d12d7a334183951604ae1adec509015474c",
    ];

    for (const expected of expectedFields) {
      expect(normalized).toContain(expected);
    }
  });

  test("measures a broken DOM target before emitting the failure", () => {
    const button = document.createElement("button");
    button.style.height = "36px";
    button.style.minHeight = "36px";
    button.style.width = "36px";
    Object.defineProperty(button, "getBoundingClientRect", {
      value: () => ({ height: 36, left: 20, top: 400, width: 36 }),
    });
    document.body.append(button);

    let failure: unknown;
    try {
      runBrokenManagementHubElementProbe(button);
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(StructuredContractFailureError);
    if (!(failure instanceof StructuredContractFailureError)) {
      throw new Error("Expected a structured failure from the DOM probe.");
    }
    expect(failure.failure.geometry).toStrictEqual({
      height: 36,
      left: 20,
      top: 400,
      width: 36,
    });
    expect(failure.failure.computedStyles).toMatchObject({
      height: "36px",
      minHeight: "36px",
    });
  });
});
