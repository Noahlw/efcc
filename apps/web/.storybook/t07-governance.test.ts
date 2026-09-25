import { describe, expect, test } from "vitest";

import {
  getCanonicalRegistries,
  SCENARIO_REGISTRY,
} from "@/lib/governance/registries";
import type { ApprovalPackage } from "@/lib/governance/types";
import { validateRegistries } from "@/lib/governance/validation";

import { MANAGEMENT_HUB_PRESENTATION_DECLARATIONS } from "./presentation-catalog";

describe("T07.1 governance foundation", () => {
  test("accepts additive workshop-fidelity ApprovalPackage metadata", () => {
    const registries = getCanonicalRegistries();
    const draft: ApprovalPackage = {
      ...registries.approvals[0],
      id: "APV-T07-1-MANAGEMENT-HUB-WORKSHOP",
      title: "T07.1 Management Hub workshop-fidelity review",
      rationale:
        "Records future representative workshop-fidelity evidence without changing historical packages.",
      baselineSha: "a1a40d12d7a334183951604ae1adec509015474c",
      evidenceRef: "docs/qa/2026-09-06-t07-1-management-hub-workshop-review.md",
      kind: "workshop-fidelity",
      realAppIntegration: true,
      presentationPsns: [
        "PSN-MGMT-HUB-DEFAULT",
        "PSN-MGMT-HUB-LOADING",
        "PSN-MGMT-HUB-EMPTY",
        "PSN-MGMT-HUB-RECOVERABLE-ERROR",
      ],
      routeScenarioRefs: ["SCN-MANAGEMENT-HUB"],
    };

    const result = validateRegistries(
      {
        ...registries,
        approvals: [...registries.approvals, draft],
      },
      {
        presentationPsns: new Set(
          MANAGEMENT_HUB_PRESENTATION_DECLARATIONS.map(({ psn }) => psn)
        ),
      }
    );

    expect(
      result.errors.filter((error) => error.entryId === draft.id)
    ).toStrictEqual([]);
  });

  test("rejects incomplete or orphaned presentation approval references", () => {
    const registries = getCanonicalRegistries();
    const draft: ApprovalPackage = {
      ...registries.approvals[0],
      id: "APV-T07-1-INVALID-REFERENCES",
      kind: "workshop-fidelity",
      realAppIntegration: true,
      presentationPsns: ["PSN-NOT-REGISTERED"],
      routeScenarioRefs: ["SCN-NOT-REGISTERED"],
    };

    const result = validateRegistries(
      {
        ...registries,
        approvals: [...registries.approvals, draft],
      },
      {
        presentationPsns: new Set(
          MANAGEMENT_HUB_PRESENTATION_DECLARATIONS.map(({ psn }) => psn)
        ),
      }
    );

    expect(
      result.errors
        .filter((error) => error.entryId === draft.id)
        .map((error) => error.field)
    ).toStrictEqual(
      expect.arrayContaining(["presentationPsns", "routeScenarioRefs"])
    );
  });

  test("allows a presentation-only approval without RouteScenario references", () => {
    const registries = getCanonicalRegistries();
    const draft: ApprovalPackage = {
      ...registries.approvals[0],
      id: "APV-T07-PRESENTATION-ONLY",
      kind: "workshop-fidelity",
      realAppIntegration: false,
      presentationPsns: ["PSN-MGMT-HUB-DEFAULT"],
    };

    const result = validateRegistries(
      { ...registries, approvals: [...registries.approvals, draft] },
      { presentationPsns: new Set(["PSN-MGMT-HUB-DEFAULT"]) }
    );

    expect(
      result.errors.filter((error) => error.entryId === draft.id)
    ).toStrictEqual([]);
  });

  test("requires RouteScenario references only for real-app integration approvals", () => {
    const registries = getCanonicalRegistries();
    const draft: ApprovalPackage = {
      ...registries.approvals[0],
      id: "APV-T07-REAL-APP-MISSING-ROUTE",
      kind: "workshop-fidelity",
      realAppIntegration: true,
      presentationPsns: ["PSN-MGMT-HUB-DEFAULT"],
    };

    const result = validateRegistries(
      { ...registries, approvals: [...registries.approvals, draft] },
      { presentationPsns: new Set(["PSN-MGMT-HUB-DEFAULT"]) }
    );

    expect(
      result.errors
        .filter((error) => error.entryId === draft.id)
        .map((error) => error.field)
    ).toContain("routeScenarioRefs");
  });

  test("resolves supersession references regardless of registry order", () => {
    const registries = getCanonicalRegistries();
    const current: ApprovalPackage = {
      ...registries.approvals[0],
      id: "APV-T07-FORWARD-CURRENT",
      supersedes: ["APV-T07-FORWARD-SUPERSEDED"],
    };
    const superseded: ApprovalPackage = {
      ...registries.approvals[0],
      id: "APV-T07-FORWARD-SUPERSEDED",
      status: "superseded",
    };

    const result = validateRegistries({
      ...registries,
      approvals: [...registries.approvals, current, superseded],
    });

    expect(
      result.errors.filter((error) =>
        [current.id, superseded.id].includes(error.entryId ?? "")
      )
    ).toStrictEqual([]);
  });

  test("keeps Management module RouteScenario IDs while correcting real route intent", () => {
    const expected = new Map([
      ["SCN-MEMBER-DIRECTORY", "module=members"],
      ["SCN-ACCOUNT-DIRECTORY", "module=accounts"],
      ["SCN-ROLE-HIERARCHY", "module=roles"],
      ["SCN-PERMISSION-EDITOR", "module=permissions"],
      ["SCN-HOME-CMS-EDITOR", "module=home-content"],
      ["SCN-APPROVAL-QUEUE", "module=approvals"],
    ]);

    for (const [id, scenario] of expected) {
      const entry = SCENARIO_REGISTRY.find((candidate) => candidate.id === id);
      expect(entry).toMatchObject({ route: "/management", scenario });
    }
  });
});
