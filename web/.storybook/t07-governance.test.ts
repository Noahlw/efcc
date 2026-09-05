import { describe, expect, test } from "vitest";

import {
  getCanonicalRegistries,
  SCENARIO_REGISTRY,
} from "@/lib/governance/registries";
import type { ApprovalPackage } from "@/lib/governance/types";
import { validateRegistries } from "@/lib/governance/validation";

import { MANAGEMENT_HUB_PRESENTATION_DECLARATIONS } from "./management-hub.story-contract";

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
