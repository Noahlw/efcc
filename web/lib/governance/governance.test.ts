/**
 * EFCC UI Control Recovery — Governance & Contract Enforcement Tests.
 *
 * Exercises:
 * 1. Canonical registries validation pass.
 * 2. Strict boundary failure detection for all 6 registries.
 * 3. Structured contract failure artifact formatting and required fields.
 * 4. Static source audit against deliberately invalid fixtures.
 * 5. Historical debt waiver resolution and expiration gating.
 * 6. Full codebase compliance audit.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  APPROVAL_PACKAGE_REGISTRY,
  NATIVE_EXCEPTION_REGISTRY,
  PRESERVATION_REFERENCE_REGISTRY,
  SCENARIO_REGISTRY,
  UI_CONTRACT_REGISTRY,
  WAIVER_REGISTRY,
  auditFileContent,
  auditSourceCode,
  createContractFailure,
  formatContractFailure,
  getCanonicalRegistries,
  isPrintMediaQuery,
  resolveRepoRoot,
  StructuredContractFailureError,
  validateRegistries,
  type ApprovalPackage,
  type GovernanceRegistries,
  type NativeException,
  type PreservationReference,
  type RouteScenario,
  type UIContract,
  type Waiver,
} from "./index";

const REPO_ROOT = resolveRepoRoot();

type FingerprintedWaiver = Waiver & {
  readonly sourceFingerprint?: string;
};

const HIGH_BLAST_CSS_RULE = "RULE-NO-UNLAYERED-HIGH-BLAST-RADIUS-CSS";

function createHighBlastWaiver(
  sourceFingerprint?: string
): FingerprintedWaiver {
  return {
    id: "WVR-EXACT-GLOBAL-CSS-RESET-TEST",
    ruleId: HIGH_BLAST_CSS_RULE,
    route: "/",
    scenario: "default",
    viewports: [320, 1024],
    browsers: ["chromium"],
    affectedFiles: ["web/app/globals.css"],
    owner: "T03 test owner",
    createdAt: "2026-09-03",
    expiresAt: "2026-12-31",
    rationale: "Exact historical CSS rule fixture",
    removalCondition: "Remove with T06 CSS cascade containment",
    removalOwner: "T06 / #511",
    ledgerRef: "docs/implementation/ui-control-recovery-preservation-ledger.md",
    status: "active",
    ...(sourceFingerprint ? { sourceFingerprint } : {}),
  };
}

function auditCssFixture(css: string, waivers: readonly Waiver[]) {
  const rootDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "efcc-governance-css-waiver-")
  );
  const filePath = path.join(rootDir, "web/app/globals.css");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, css, "utf8");

  try {
    return auditSourceCode({
      rootDir,
      targetFiles: ["web/app/globals.css"],
      waivers,
      now: "2026-09-03T00:00:00Z",
    });
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
}

describe("Governance Registry Validation", () => {
  it("validates the default canonical registries cleanly with zero errors", () => {
    const result = validateRegistries();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.stats.scenarioCount).toBeGreaterThan(0);
    expect(result.stats.contractCount).toBeGreaterThan(0);
    expect(result.stats.approvalCount).toBeGreaterThan(0);
    expect(result.stats.waiverCount).toBeGreaterThan(0);
    expect(result.stats.preservationCount).toBeGreaterThan(0);
    expect(result.stats.nativeExceptionCount).toBeGreaterThan(0);
  });

  describe("Executable UI Contract Expectations & Live Source Invariants", () => {
    it("anchors Civic Minimal token contract (CTR-TK-01) expectations to live globals.css source", () => {
      const contract = UI_CONTRACT_REGISTRY.find((c) => c.id === "CTR-TK-01");
      expect(contract).toBeDefined();
      expect(contract?.status).toBe("active");

      const surfaceProbe = contract?.probes.find(
        (p) => p.id === "probe-token-surface"
      );
      expect(surfaceProbe).toBeDefined();
      expect(surfaceProbe?.property).toBe("--surface");
      expect(surfaceProbe?.expected).toBe("#f4f5f3");

      const focusProbe = contract?.probes.find(
        (p) => p.id === "probe-token-focus"
      );
      expect(focusProbe).toBeDefined();
      expect(focusProbe?.property).toBe("--focus");
      expect(focusProbe?.expected).toBe("#176a87");

      const accentProbe = contract?.probes.find(
        (p) => p.id === "probe-token-accent"
      );
      expect(accentProbe).toBeDefined();
      expect(accentProbe?.property).toBe("--accent");
      expect(accentProbe?.expected).toBe("#9c302c");

      // Ground directly in actual globals.css source
      const globalsCss = fs.readFileSync(
        path.join(REPO_ROOT, "web/app/globals.css"),
        "utf-8"
      );
      expect(globalsCss).toContain("--surface: #f4f5f3;");
      expect(globalsCss).toContain("--focus: #176a87;");
      expect(globalsCss).toContain("--accent: #9c302c;");
    });

    it("anchors safe-area clearance contract (CTR-TK-08) to live #main-navigation and #shell-content", () => {
      const contract = UI_CONTRACT_REGISTRY.find((c) => c.id === "CTR-TK-08");
      expect(contract).toBeDefined();
      expect(contract?.status).toBe("active");

      const dockProbe = contract?.probes.find(
        (p) => p.id === "probe-safe-area-dock"
      );
      expect(dockProbe).toBeDefined();
      expect(dockProbe?.selector).toBe("#main-navigation");
      expect(dockProbe?.property).toBe("bottom");
      expect(dockProbe?.expected).toBe(
        "calc(0.625rem + env(safe-area-inset-bottom, 0px))"
      );

      const shellContentProbe = contract?.probes.find(
        (p) => p.id === "probe-safe-area-shell-content"
      );
      expect(shellContentProbe).toBeDefined();
      expect(shellContentProbe?.selector).toBe("#shell-content");
      expect(shellContentProbe?.property).toBe("paddingBottom");
      expect(shellContentProbe?.expected).toBe(
        "calc(84px + env(safe-area-inset-bottom, 0px))"
      );

      // Ground directly in actual globals.css source
      const globalsCss = fs.readFileSync(
        path.join(REPO_ROOT, "web/app/globals.css"),
        "utf-8"
      );
      expect(globalsCss).toContain(
        "bottom: calc(0.625rem + env(safe-area-inset-bottom, 0px));"
      );
      expect(globalsCss).toContain(
        "padding-bottom: calc(84px + env(safe-area-inset-bottom, 0px));"
      );
    });

    it("anchors attendance scanner radio contract (CTR-ATT-01) to live attendance-scanner-ui.tsx", () => {
      const contract = UI_CONTRACT_REGISTRY.find((c) => c.id === "CTR-ATT-01");
      expect(contract).toBeDefined();
      expect(contract?.status).toBe("active");

      const radioProbe = contract?.probes.find(
        (p) => p.id === "probe-attendance-radio-group"
      );
      expect(radioProbe).toBeDefined();
      expect(radioProbe?.selector).toContain("name='scanner-event'");
      expect(radioProbe?.selector).toContain("name='choose-event'");
      expect(radioProbe?.expected).toBe("ATT-02");

      // Ground directly in actual attendance-scanner-ui.tsx source
      const attendanceUi = fs.readFileSync(
        path.join(REPO_ROOT, "web/lib/attendance-scanner-ui.tsx"),
        "utf-8"
      );
      expect(attendanceUi).toContain('radioName="scanner-event"');
      expect(attendanceUi).toContain('radioName="choose-event"');
    });
  });

  describe("Identifier Validation", () => {
    it("fails when a scenario has a missing or empty identifier", () => {
      const invalidScenarios: RouteScenario[] = [
        {
          ...SCENARIO_REGISTRY[0],
          id: "",
        },
      ];
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        scenarios: invalidScenarios,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "MISSING_IDENTIFIER")).toBe(
        true
      );
    });

    it("fails when an identifier contains invalid characters", () => {
      const invalidContracts: UIContract[] = [
        {
          ...UI_CONTRACT_REGISTRY[0],
          id: "CTR invalid spaces!",
        },
      ];
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        contracts: invalidContracts,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "INVALID_IDENTIFIER")).toBe(
        true
      );
    });

    it("fails when duplicate identifiers exist within a registry", () => {
      const duplicateWaivers: Waiver[] = [
        WAIVER_REGISTRY[0],
        {
          ...WAIVER_REGISTRY[0],
          route: "/other-route",
        },
      ];
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        waivers: duplicateWaivers,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "DUPLICATE_IDENTIFIER")).toBe(
        true
      );
    });

    it("fails when a preservation reference has a malformed identifier", () => {
      const invalidPreservation: PreservationReference = {
        ...PRESERVATION_REFERENCE_REGISTRY[0],
        id: "REF invalid spaces!",
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        preservations: [invalidPreservation],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "INVALID_IDENTIFIER")).toBe(
        true
      );
    });

    it("fails when a native exception has a malformed identifier", () => {
      const invalidNativeException: NativeException = {
        ...NATIVE_EXCEPTION_REGISTRY[0],
        id: "NEX invalid spaces!",
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        nativeExceptions: [invalidNativeException],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "INVALID_IDENTIFIER")).toBe(
        true
      );
    });
  });

  it("rejects non-calendar and non-ISO validation dates instead of allowing Date rollover", () => {
    const invalidNow = validateRegistries(getCanonicalRegistries(), {
      now: "2026-02-30T00:00:00Z",
    });
    expect(invalidNow.valid).toBe(false);
    expect(invalidNow.errors.some((error) => error.field === "now")).toBe(true);

    const invalidCreatedAt: Waiver = {
      ...WAIVER_REGISTRY[0],
      id: "WVR-INVALID-CALENDAR-CREATED",
      createdAt: "2026-02-30",
    };
    const createdResult = validateRegistries({
      ...getCanonicalRegistries(),
      waivers: [invalidCreatedAt],
    });
    expect(
      createdResult.errors.some((error) => error.field === "createdAt")
    ).toBe(true);

    const invalidExpiry: Waiver = {
      ...WAIVER_REGISTRY[0],
      id: "WVR-INVALID-CALENDAR-EXPIRY",
      expiresAt: "2026-09-31",
    };
    const expiryResult = validateRegistries({
      ...getCanonicalRegistries(),
      waivers: [invalidExpiry],
    });
    expect(
      expiryResult.errors.some((error) => error.field === "expiresAt")
    ).toBe(true);

    const invalidApproval: ApprovalPackage = {
      ...APPROVAL_PACKAGE_REGISTRY[0],
      id: "APV-INVALID-CALENDAR-DATE",
      approvedAt: "2026-02-30T00:00:00Z",
    };
    const approvalResult = validateRegistries({
      ...getCanonicalRegistries(),
      approvals: [invalidApproval],
    });
    expect(
      approvalResult.errors.some((error) => error.field === "approvedAt")
    ).toBe(true);
  });

  it("fails when an invalid now reference date is provided for validation", () => {
    const result = validateRegistries(getCanonicalRegistries(), {
      now: "invalid-date-string-xyz",
    });
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.code === "INVALID_VALIDATION_DATE")
    ).toBe(true);
  });
});

describe("Contract Probes Validation", () => {
  it("fails when a contract has duplicate probe IDs", () => {
    const invalidContract: UIContract = {
      ...UI_CONTRACT_REGISTRY[0],
      id: "CTR-PROBE-DUP-TEST",
      probes: [
        {
          id: "probe-duplicate",
          selector: "button",
          property: "minHeight",
          expected: 44,
        },
        {
          id: "probe-duplicate",
          selector: "input",
          property: "minHeight",
          expected: 44,
        },
      ],
    };
    const result = validateRegistries({
      ...getCanonicalRegistries(),
      contracts: [invalidContract],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "DUPLICATE_PROBE_ID")).toBe(
      true
    );
  });

  it("fails when a contract has a probe with missing or empty ID", () => {
    const invalidContract: UIContract = {
      ...UI_CONTRACT_REGISTRY[0],
      id: "CTR-PROBE-EMPTY-ID-TEST",
      probes: [
        { id: "", selector: "button", property: "minHeight", expected: 44 },
      ],
    };
    const result = validateRegistries({
      ...getCanonicalRegistries(),
      contracts: [invalidContract],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_PROBE_ID")).toBe(true);
  });

  it("fails when a contract has empty probes array", () => {
    const invalidContract: UIContract = {
      ...UI_CONTRACT_REGISTRY[0],
      id: "CTR-PROBE-EMPTY-ARRAY-TEST",
      probes: [],
    };
    const result = validateRegistries({
      ...getCanonicalRegistries(),
      contracts: [invalidContract],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_PROBE_ID")).toBe(true);
  });

  it("fails when a contract probe has missing selector or property", () => {
    const invalidContract: UIContract = {
      ...UI_CONTRACT_REGISTRY[0],
      id: "CTR-PROBE-MISSING-FIELDS",
      probes: [
        { id: "probe-1", selector: "", property: "color", expected: "red" },
      ],
    };
    const result = validateRegistries({
      ...getCanonicalRegistries(),
      contracts: [invalidContract],
    });
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) => e.code === "MISSING_IDENTIFIER" && e.field === "probes.selector"
      )
    ).toBe(true);
  });

  describe("Ownership & Layer Validation", () => {
    it("fails when an invalid ownership layer is specified", () => {
      const invalidScenarios = [
        {
          ...SCENARIO_REGISTRY[0],
          layer: "invalid-layer" as unknown as "route",
        },
      ];
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        scenarios: invalidScenarios,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "INVALID_OWNERSHIP")).toBe(
        true
      );
    });

    it("fails when a primitive contract violates layer hierarchy by scoping to a route file", () => {
      const invalidContracts: UIContract[] = [
        {
          id: "CTR-INVALID-PRIMITIVE",
          name: "Invalid Primitive",
          layer: "primitive",
          scope: "web/app/home/page.tsx",
          probes: [
            { id: "p1", selector: "div", property: "color", expected: "red" },
          ],
          coverageDisposition: "covered",
          baselineSha: "6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2",
          status: "active",
        },
      ];
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        contracts: invalidContracts,
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.code === "INVALID_LAYER_HIERARCHY")
      ).toBe(true);
    });

    it("fails when a preservation reference has an invalid ownership layer", () => {
      const invalidPreservation = {
        ...PRESERVATION_REFERENCE_REGISTRY[0],
        layer: "invalid-layer" as unknown as "global",
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        preservations: [invalidPreservation],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "INVALID_OWNERSHIP")).toBe(
        true
      );
    });

    it("fails when a native exception has an invalid ownership layer", () => {
      const invalidNativeException = {
        ...NATIVE_EXCEPTION_REGISTRY[0],
        layer: "invalid-layer" as unknown as "route",
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        nativeExceptions: [invalidNativeException],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "INVALID_OWNERSHIP")).toBe(
        true
      );
    });
  });

  describe("Orphaned Scenario & Unanchored Contract Validation", () => {
    it("fails when a scenario references a non-existent contract ID", () => {
      const orphanedScenario: RouteScenario = {
        ...SCENARIO_REGISTRY[0],
        id: "SCN-ORPHANED-TEST",
        contractIds: ["CTR-NON-EXISTENT-ID"],
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        scenarios: [...SCENARIO_REGISTRY, orphanedScenario],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) =>
            e.code === "ORPHANED_SCENARIO" && e.entryId === "SCN-ORPHANED-TEST"
        )
      ).toBe(true);
    });

    it("fails when a scenario has empty contractIds", () => {
      const emptyContractScenario: RouteScenario = {
        ...SCENARIO_REGISTRY[0],
        id: "SCN-EMPTY-CONTRACTS",
        contractIds: [],
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        scenarios: [...SCENARIO_REGISTRY, emptyContractScenario],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) =>
            e.code === "ORPHANED_SCENARIO" &&
            e.entryId === "SCN-EMPTY-CONTRACTS"
        )
      ).toBe(true);
    });

    it("fails when an active contract is unanchored (not referenced by any scenario)", () => {
      const unanchoredContract: UIContract = {
        id: "CTR-UNANCHORED-ACTIVE",
        name: "Unanchored Contract",
        layer: "pattern",
        scope: "web/lib/unanchored.tsx",
        probes: [
          { id: "p1", selector: "div", property: "display", expected: "block" },
        ],
        coverageDisposition: "covered",
        baselineSha: "6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2",
        status: "active",
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        contracts: [...UI_CONTRACT_REGISTRY, unanchoredContract],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) =>
            e.code === "UNANCHORED_CONTRACT" &&
            e.entryId === "CTR-UNANCHORED-ACTIVE"
        )
      ).toBe(true);
    });

    it("fails when an active contract is referenced by a scenario but not anchored by any approval package", () => {
      const contractWithoutApproval: UIContract = {
        id: "CTR-NO-APPROVAL-ACTIVE",
        name: "Contract without Approval Package",
        layer: "pattern",
        scope: "web/lib/no-approval.tsx",
        probes: [
          { id: "p1", selector: "div", property: "display", expected: "block" },
        ],
        coverageDisposition: "covered",
        baselineSha: "6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2",
        status: "active",
      };
      const scenarioWithContract: RouteScenario = {
        ...SCENARIO_REGISTRY[0],
        id: "SCN-WITH-NO-APPROVAL",
        contractIds: ["CTR-NO-APPROVAL-ACTIVE"],
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        contracts: [...UI_CONTRACT_REGISTRY, contractWithoutApproval],
        scenarios: [...SCENARIO_REGISTRY, scenarioWithContract],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) =>
            e.code === "UNANCHORED_CONTRACT" &&
            e.entryId === "CTR-NO-APPROVAL-ACTIVE" &&
            e.message.includes("APPROVAL_PACKAGE_REGISTRY")
        )
      ).toBe(true);
    });

    it("does not anchor active contracts from superseded approval packages", () => {
      const staleContract: UIContract = {
        ...UI_CONTRACT_REGISTRY[0],
        id: "CTR-STALE-APPROVAL",
      };
      const staleScenario: RouteScenario = {
        ...SCENARIO_REGISTRY[0],
        id: "SCN-STALE-APPROVAL",
        contractIds: ["CTR-STALE-APPROVAL"],
      };
      const supersededApproval: ApprovalPackage = {
        ...APPROVAL_PACKAGE_REGISTRY[0],
        id: "APV-SUPERSEDED-CONTRACT",
        status: "superseded",
        contractIds: ["CTR-STALE-APPROVAL"],
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        contracts: [...UI_CONTRACT_REGISTRY, staleContract],
        scenarios: [...SCENARIO_REGISTRY, staleScenario],
        approvals: [...APPROVAL_PACKAGE_REGISTRY, supersededApproval],
      });

      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (error) =>
            error.code === "UNANCHORED_CONTRACT" &&
            error.entryId === "CTR-STALE-APPROVAL" &&
            error.message.includes("approved package")
        )
      ).toBe(true);
    });
  });

  describe("Coverage Disposition & Scenario Validation", () => {
    it("fails when a scenario is missing coverage disposition", () => {
      const invalidScenario = {
        ...SCENARIO_REGISTRY[0],
        coverageDisposition: "invalid-disp" as unknown as "covered",
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        scenarios: [invalidScenario],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.code === "MISSING_COVERAGE_DISPOSITION")
      ).toBe(true);
    });

    it("fails when a scenario specifies an invalid browser engine", () => {
      const invalidScenario: RouteScenario = {
        ...SCENARIO_REGISTRY[0],
        browsers: ["safari" as unknown as "chromium"],
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        scenarios: [invalidScenario],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) =>
            e.code === "MISSING_COVERAGE_DISPOSITION" && e.field === "browsers"
        )
      ).toBe(true);
    });

    it("fails when a scenario specifies invalid viewport entries (negative, zero, or malformed)", () => {
      const invalidNumberScenario: RouteScenario = {
        ...SCENARIO_REGISTRY[0],
        viewports: [-320, 0],
      };
      expect(
        validateRegistries({
          ...getCanonicalRegistries(),
          scenarios: [invalidNumberScenario],
        }).valid
      ).toBe(false);

      const invalidObjectScenario: RouteScenario = {
        ...SCENARIO_REGISTRY[0],
        viewports: [{ width: -390 }],
      };
      expect(
        validateRegistries({
          ...getCanonicalRegistries(),
          scenarios: [invalidObjectScenario],
        }).valid
      ).toBe(false);
    });

    it("fails when a scenario specifies an invalid route format", () => {
      const invalidRouteScenario: RouteScenario = {
        ...SCENARIO_REGISTRY[0],
        route: "missing-leading-slash",
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        scenarios: [invalidRouteScenario],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.code === "ORPHANED_SCENARIO" && e.field === "route"
        )
      ).toBe(true);
    });
  });
  describe("Waiver Validation", () => {
    it("fails when a waiver has expired relative to the validation reference date", () => {
      const expiredWaiver: Waiver = {
        id: "WVR-EXPIRED-TEST",
        ruleId: "RULE-NO-CSS-MODULES",
        route: "/test",
        scenario: "expired-test",
        viewports: [390],
        browsers: ["chromium"],
        affectedFiles: ["web/test.tsx"],
        owner: "Test Owner",
        createdAt: "2026-01-01",
        expiresAt: "2026-06-01",
        rationale: "Past temporary test waiver",
        removalCondition: "Remove immediately",
        status: "active",
        ledgerRef:
          "docs/implementation/ui-control-recovery-preservation-ledger.md",
      };
      const result = validateRegistries(
        {
          ...getCanonicalRegistries(),
          waivers: [expiredWaiver],
        },
        { now: "2026-09-03T00:00:00Z" }
      );
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.code === "EXPIRED_WAIVER" && e.entryId === "WVR-EXPIRED-TEST"
        )
      ).toBe(true);
    });

    it("fails when a waiver is missing a concrete removal condition", () => {
      const invalidWaiver: Waiver = {
        ...WAIVER_REGISTRY[0],
        id: "WVR-NO-REMOVAL-CONDITION",
        removalCondition: "",
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        waivers: [invalidWaiver],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.code === "MISSING_WAIVER_REMOVAL_CONDITION")
      ).toBe(true);
    });

    it("fails when a waiver is missing an explicit owner", () => {
      const invalidWaiver: Waiver = {
        ...WAIVER_REGISTRY[0],
        id: "WVR-NO-OWNER",
        owner: "",
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        waivers: [invalidWaiver],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "MISSING_WAIVER_OWNER")).toBe(
        true
      );
    });

    it("fails when a waiver is missing ledgerRef", () => {
      const invalidWaiver: Waiver = {
        ...WAIVER_REGISTRY[0],
        id: "WVR-NO-LEDGER",
        ledgerRef: "",
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        waivers: [invalidWaiver],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.code === "MISSING_WAIVER_FIELD" && e.field === "ledgerRef"
        )
      ).toBe(true);
    });

    it("fails when a waiver is missing viewports or scope metadata", () => {
      const invalidWaiver: Waiver = {
        ...WAIVER_REGISTRY[0],
        id: "WVR-NO-VIEWPORTS",
        viewports: [],
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        waivers: [invalidWaiver],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.code === "MISSING_WAIVER_FIELD" && e.field === "viewports"
        )
      ).toBe(true);
    });

    it("fails when a waiver specifies wildcard or glob affectedFiles", () => {
      const wildcardWaiver: Waiver = {
        ...WAIVER_REGISTRY[0],
        id: "WVR-WILDCARD-REJECT",
        affectedFiles: ["web/app/management/*"],
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        waivers: [wildcardWaiver],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.code === "INVALID_WAIVER_AFFECTED_FILES")
      ).toBe(true);
    });

    it("fails when a waiver specifies an invalid browser engine", () => {
      const invalidWaiver: Waiver = {
        ...WAIVER_REGISTRY[0],
        id: "WVR-INVALID-BROWSER",
        browsers: ["ie11" as unknown as "chromium"],
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        waivers: [invalidWaiver],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.code === "MISSING_WAIVER_FIELD" && e.field === "browsers"
        )
      ).toBe(true);
    });

    it("fails when a waiver specifies invalid viewports", () => {
      const invalidWaiver: Waiver = {
        ...WAIVER_REGISTRY[0],
        id: "WVR-INVALID-VIEWPORT",
        viewports: [0, -100],
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        waivers: [invalidWaiver],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.code === "MISSING_WAIVER_FIELD" && e.field === "viewports"
        )
      ).toBe(true);
    });

    it("fails when a waiver has an invalid createdAt date string", () => {
      const invalidWaiver: Waiver = {
        ...WAIVER_REGISTRY[0],
        id: "WVR-INVALID-CREATED-AT",
        createdAt: "not-a-valid-date",
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        waivers: [invalidWaiver],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.code === "INVALID_VALIDATION_DATE" && e.field === "createdAt"
        )
      ).toBe(true);
    });

    it("fails when a waiver expires before its creation date", () => {
      const invalidWaiver: Waiver = {
        ...WAIVER_REGISTRY[0],
        id: "WVR-EXPIRES-BEFORE-CREATION",
        createdAt: "2026-09-01",
        expiresAt: "2026-08-01",
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        waivers: [invalidWaiver],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.code === "INVALID_WAIVER_EXPIRY" && e.field === "expiresAt"
        )
      ).toBe(true);
    });

    it("fails when a waiver has an unsafe or non-docs ledgerRef", () => {
      const nonDocsWaiver: Waiver = {
        ...WAIVER_REGISTRY[0],
        id: "WVR-NON-DOCS-LEDGER",
        ledgerRef: "external/ledger.md",
      };
      expect(
        validateRegistries({
          ...getCanonicalRegistries(),
          waivers: [nonDocsWaiver],
        }).valid
      ).toBe(false);

      const traversalWaiver: Waiver = {
        ...WAIVER_REGISTRY[0],
        id: "WVR-TRAVERSAL-LEDGER",
        ledgerRef: "docs/../secret.md",
      };
      expect(
        validateRegistries({
          ...getCanonicalRegistries(),
          waivers: [traversalWaiver],
        }).valid
      ).toBe(false);

      const wildcardWaiver: Waiver = {
        ...WAIVER_REGISTRY[0],
        id: "WVR-WILDCARD-LEDGER",
        ledgerRef: "docs/*.md",
      };
      expect(
        validateRegistries({
          ...getCanonicalRegistries(),
          waivers: [wildcardWaiver],
        }).valid
      ).toBe(false);
    });

    it("fails when a waiver specifies an invalid route format", () => {
      const invalidRouteWaiver: Waiver = {
        ...WAIVER_REGISTRY[0],
        id: "WVR-INVALID-ROUTE",
        route: "missing-leading-slash",
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        waivers: [invalidRouteWaiver],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.code === "MISSING_WAIVER_FIELD" && e.field === "route"
        )
      ).toBe(true);
    });

    it("rejects wildcard and parent-traversal waiver routes", () => {
      const wildcardRoute = {
        ...WAIVER_REGISTRY[0],
        id: "WVR-WILDCARD-ROUTE",
        route: "/management/*",
      };
      const traversalRoute = {
        ...WAIVER_REGISTRY[0],
        id: "WVR-TRAVERSAL-ROUTE",
        route: "/management/../prototype",
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        waivers: [wildcardRoute, traversalRoute],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.filter((error) => error.field === "route")
      ).toHaveLength(2);
    });
  });

  describe("Approval Package Validation", () => {
    it("fails when an approval package is missing a baseline SHA", () => {
      const invalidApproval: ApprovalPackage = {
        ...APPROVAL_PACKAGE_REGISTRY[0],
        id: "APV-NO-SHA",
        baselineSha: "",
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        approvals: [invalidApproval],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.code === "APPROVAL_MISSING_BASELINE_SHA")
      ).toBe(true);
    });

    it("fails when an approval package references an invalid commit SHA", () => {
      const invalidApproval: ApprovalPackage = {
        ...APPROVAL_PACKAGE_REGISTRY[0],
        id: "APV-INVALID-SHA",
        baselineSha: "not-a-valid-sha-12345z",
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        approvals: [invalidApproval],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.code === "APPROVAL_INVALID_BASELINE_SHA")
      ).toBe(true);
    });

    it("fails when an approval package has an invalid approvedAt date", () => {
      const invalidApproval: ApprovalPackage = {
        ...APPROVAL_PACKAGE_REGISTRY[0],
        id: "APV-INVALID-DATE",
        approvedAt: "not-a-valid-date",
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        approvals: [invalidApproval],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) =>
            e.code === "INVALID_VALIDATION_DATE" && e.field === "approvedAt"
        )
      ).toBe(true);
    });

    it("rejects stale or unknown approval status metadata", () => {
      const invalidApproval: ApprovalPackage = {
        ...APPROVAL_PACKAGE_REGISTRY[0],
        id: "APV-INVALID-STATUS",
        status: "pending" as unknown as "approved",
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        approvals: [invalidApproval],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (error) =>
            error.code === "INVALID_APPROVAL_STATUS" && error.field === "status"
        )
      ).toBe(true);
    });

    it("fails when an approval package specifies an unsafe evidenceRef", () => {
      const invalidApproval: ApprovalPackage = {
        ...APPROVAL_PACKAGE_REGISTRY[0],
        id: "APV-UNSAFE-EVIDENCE",
        evidenceRef: "docs/../outside.md",
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        approvals: [invalidApproval],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) =>
            e.code === "APPROVAL_MISSING_SCOPE" && e.field === "evidenceRef"
        )
      ).toBe(true);
    });
  });

  describe("Preservation & Native Exception Validation", () => {
    it("fails when a preservation reference has an unsafe or non-docs ledgerRef", () => {
      const nonDocsPreservation: PreservationReference = {
        ...PRESERVATION_REFERENCE_REGISTRY[0],
        id: "REF-NON-DOCS-LEDGER",
        ledgerRef: "external/ledger.md",
      };
      expect(
        validateRegistries({
          ...getCanonicalRegistries(),
          preservations: [nonDocsPreservation],
        }).valid
      ).toBe(false);

      const traversalPreservation: PreservationReference = {
        ...PRESERVATION_REFERENCE_REGISTRY[0],
        id: "REF-TRAVERSAL-LEDGER",
        ledgerRef: "docs/../secret.md",
      };
      expect(
        validateRegistries({
          ...getCanonicalRegistries(),
          preservations: [traversalPreservation],
        }).valid
      ).toBe(false);
    });
    it("fails when a preservation reference has empty invariants", () => {
      const invalidPreservation: PreservationReference = {
        ...PRESERVATION_REFERENCE_REGISTRY[0],
        id: "REF-EMPTY-INVARIANTS",
        invariants: [],
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        preservations: [invalidPreservation],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.code === "EMPTY_PRESERVATION_INVARIANTS")
      ).toBe(true);
    });

    it("fails when a native exception is missing required fields", () => {
      const invalidNativeException: NativeException = {
        id: "NEX-INVALID",
        control: "",
        location: "",
        reason: "",
        layer: "route",
        status: "approved",
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        nativeExceptions: [invalidNativeException],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.code === "MISSING_NATIVE_EXCEPTION_FIELD")
      ).toBe(true);
    });

    it("fails when a temporary native exception is missing removalCondition", () => {
      const temporaryNativeWithoutRemoval: NativeException = {
        ...NATIVE_EXCEPTION_REGISTRY[0],
        id: "NEX-TEMP-NO-REMOVAL",
        status: "temporary",
        removalCondition: "",
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        nativeExceptions: [temporaryNativeWithoutRemoval],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.code === "MISSING_NATIVE_EXCEPTION_REMOVAL_CONDITION"
        )
      ).toBe(true);
    });

    it("fails when a native exception has invalid status", () => {
      const invalidStatusNative: NativeException = {
        ...NATIVE_EXCEPTION_REGISTRY[0],
        id: "NEX-INVALID-STATUS",
        status: "invalid-status" as unknown as "approved",
      };
      const result = validateRegistries({
        ...getCanonicalRegistries(),
        nativeExceptions: [invalidStatusNative],
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.code === "INVALID_NATIVE_EXCEPTION_STATUS")
      ).toBe(true);
    });
  });
});

describe("Structured Contract Failure Reporter", () => {
  it("constructs and formats an actionable contract failure with all required fields", () => {
    const failure = createContractFailure({
      ruleId: "RULE-MINIMUM-TAP-TARGET",
      route: "/scanner",
      scenario: "default",
      viewport: { width: 390, height: 844 },
      browser: "chromium",
      probe: "probe-target-min-height",
      expected: 44,
      actual: 36,
      computedStyles: { minHeight: "36px", height: "36px" },
      geometry: { width: 120, height: 36, top: 400, left: 20 },
      likelyOwnershipLayer: "primitive",
      baselineSha: "6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2",
      message:
        "Interactive button height 36px is below required 44px minimum tap target",
    });

    expect(failure.ruleId).toBe("RULE-MINIMUM-TAP-TARGET");
    expect(failure.route).toBe("/scanner");
    expect(failure.scenario).toBe("default");
    expect(failure.browser).toBe("chromium");
    expect(failure.expected).toBe(44);
    expect(failure.actual).toBe(36);
    expect(failure.likelyOwnershipLayer).toBe("primitive");
    expect(failure.baselineSha).toBe(
      "6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2"
    );

    const formatted = formatContractFailure(failure);
    expect(formatted).toContain(
      "[UI CONTRACT FAILURE] Rule: RULE-MINIMUM-TAP-TARGET"
    );
    expect(formatted).toContain("Route:                  /scanner");
    expect(formatted).toContain("Scenario:               default");
    expect(formatted).toContain("Viewport:               390px x 844px");
    expect(formatted).toContain("Browser:                chromium");
    expect(formatted).toContain(
      "Probe:                  probe-target-min-height"
    );
    expect(formatted).toContain("Expected:               44");
    expect(formatted).toContain("Actual:                 36");
    expect(formatted).toContain(
      "Likely Ownership Layer: PRIMITIVE (web/components/ui/ local primitives)"
    );
    expect(formatted).toContain(
      "Baseline SHA:           6e6fe51770cd49a6f362d5c6cb4a8eafd5ba9ea2"
    );
    expect(formatted).toContain("minHeight: 36px");
    expect(formatted).toContain("height: 36px");

    const err = new StructuredContractFailureError(failure);
    expect(err.failure).toBe(failure);
    expect(err.message).toContain("RULE-MINIMUM-TAP-TARGET");
  });
});

describe("Static Governance Source Audit Engine", () => {
  describe("Deliberate Invalid Fixture Audits", () => {
    it("detects unlayered high-blast-radius global CSS selectors", () => {
      const fixtureCss = `
        :root {
          --surface: #fff;
        }

        /* VIOLATION: unlayered broad element selector */
        div {
          margin: 0;
          color: red;
        }

        @layer base {
          p {
            margin: 0;
          }
        }
      `;

      const violations = auditFileContent("web/app/globals.css", fixtureCss);
      expect(
        violations.some(
          (v) =>
            v.ruleId === "RULE-NO-UNLAYERED-HIGH-BLAST-RADIUS-CSS" &&
            v.snippet?.includes("div {")
        )
      ).toBe(true);
    });

    it("detects reintroduced CSS Modules in application code", () => {
      const fixtureTsx = `
        import React from "react";
        import styles from "./reintroduced.module.css";

        export function ReintroducedWidget() {
          return <div className={styles.card}>Card</div>;
        }
      `;

      const violations = auditFileContent(
        "web/app/home/reintroduced-widget.tsx",
        fixtureTsx
      );
      expect(violations.some((v) => v.ruleId === "RULE-NO-CSS-MODULES")).toBe(
        true
      );
    });

    it("detects ordinary inline visual style declarations", () => {
      const fixtureTsx = `
        import React from "react";

        export function BadVisualStyles() {
          return (
            <div style={{ backgroundColor: "#9c302c", padding: "1rem", borderRadius: 8 }}>
              Bad inline visual styling
            </div>
          );
        }
      `;

      const violations = auditFileContent(
        "web/app/home/bad-styles.tsx",
        fixtureTsx
      );
      expect(violations.some((v) => v.ruleId === "RULE-NO-INLINE-STYLES")).toBe(
        true
      );
    });

    it("detects route-owned global style tags", () => {
      const fixtureTsx = `
        export default function RouteWithGlobalStyle() {
          return (
            <div>
              <style jsx global>{\`
                body { background: #000; }
              \`}</style>
            </div>
          );
        }
      `;

      const violations = auditFileContent(
        "web/app/scanner/page.tsx",
        fixtureTsx
      );
      expect(
        violations.some((v) => v.ruleId === "RULE-NO-ROUTE-GLOBAL-SELECTORS")
      ).toBe(true);
    });

    it("detects undocumented native HTML elements in app-facing UI", () => {
      const fixtureTsx = `
        import React from "react";

        export function UndocumentedForm() {
          return (
            <form>
              <select name="undocumented">
                <option value="1">Option 1</option>
              </select>
              <button type="submit">Submit</button>
            </form>
          );
        }
      `;

      const violations = auditFileContent(
        "web/app/home/undocumented-form.tsx",
        fixtureTsx
      );
      expect(
        violations.some(
          (v) =>
            v.ruleId === "RULE-UNDOCUMENTED-NATIVE-EXCEPTION" &&
            v.message.includes("<select>")
        )
      ).toBe(true);
      expect(
        violations.some(
          (v) =>
            v.ruleId === "RULE-UNDOCUMENTED-NATIVE-EXCEPTION" &&
            v.message.includes("<button>")
        )
      ).toBe(true);
    });

    it("detects invalid route-specific CVA variant declarations", () => {
      const fixtureTsx = `
        import { cva } from "class-variance-authority";

        const routeVariants = cva("rounded p-4", {
          variants: {
            theme: { dark: "bg-black", light: "bg-white" }
          }
        });

        export function RouteWithCVA() {
          return <div className={routeVariants({ theme: "dark" })}>Test</div>;
        }
      `;

      const violations = auditFileContent(
        "web/app/home/route-cva.tsx",
        fixtureTsx
      );
      expect(violations.some((v) => v.ruleId === "RULE-NO-ROUTE-CVA")).toBe(
        true
      );
    });

    it("detects forbidden styling hooks such as routine !important in CSS", () => {
      const fixtureCss = `
        .custom-button {
          padding: 12px !important;
        }
      `;

      const violations = auditFileContent("web/app/custom.css", fixtureCss);
      expect(
        violations.some((v) => v.ruleId === "RULE-NO-FORBIDDEN-STYLING-HOOKS")
      ).toBe(true);
    });

    it("detects mismatched native controls in registered files", () => {
      const fixtureTsx = `
        import React from "react";

        export function MismatchedControlPanel() {
          return (
            <div>
              {/* input[type=radio] is registered for attendance-scanner-ui.tsx */}
              <input type="radio" name="event" value="1" />
              {/* BUT button is NOT registered in attendance-scanner-ui.tsx exception */}
              <button type="button">Unregistered Native Button</button>
            </div>
          );
        }
      `;

      const violations = auditFileContent(
        "web/lib/attendance-scanner-ui.tsx",
        fixtureTsx
      );
      expect(
        violations.some(
          (v) =>
            v.ruleId === "RULE-UNDOCUMENTED-NATIVE-EXCEPTION" &&
            v.message.includes("<button>")
        )
      ).toBe(true);
      expect(
        violations.some(
          (v) =>
            v.ruleId === "RULE-UNDOCUMENTED-NATIVE-EXCEPTION" &&
            v.message.includes("<input>")
        )
      ).toBe(false);
    });

    it("detects non-print !important in a CSS file that also contains print styles", () => {
      const fixtureCss = `
        @media print {
          .print-only {
            display: block !important;
          }
        }

        /* Non-print rule with !important must be flagged */
        .screen-widget {
          margin-bottom: 24px !important;
        }
      `;

      const violations = auditFileContent(
        "web/app/mixed-print.css",
        fixtureCss
      );
      expect(
        violations.some((v) => v.ruleId === "RULE-NO-FORBIDDEN-STYLING-HOOKS")
      ).toBe(true);
      expect(
        violations.filter((v) => v.ruleId === "RULE-NO-FORBIDDEN-STYLING-HOOKS")
      ).toHaveLength(1);
      expect(violations[0].line).toBe(10);
    });

    it("detects aliased route CVA imports", () => {
      const fixtureTsx = `
        import { cva as makeVariants } from "class-variance-authority";

        const buttonVariants = makeVariants("px-4 py-2", {
          variants: {
            intent: { primary: "bg-red-500", secondary: "bg-gray-500" }
          }
        });

        export function RouteWithAliasedCVA() {
          return <div className={buttonVariants({ intent: "primary" })}>Aliased</div>;
        }
      `;
      const violations = auditFileContent(
        "web/app/home/aliased-cva.tsx",
        fixtureTsx
      );
      expect(violations.some((v) => v.ruleId === "RULE-NO-ROUTE-CVA")).toBe(
        true
      );
    });

    it("detects CommonJS and dynamic imports of class-variance-authority in routes", () => {
      const cjsTsx = `
        const { cva } = require("class-variance-authority");
        export function CjsRoute() { return <div className={cva("p-2")()}>Test</div>; }
      `;
      expect(
        auditFileContent("web/app/home/cjs-route.tsx", cjsTsx).some(
          (v) => v.ruleId === "RULE-NO-ROUTE-CVA"
        )
      ).toBe(true);

      const dynTsx = `
        export async function dynamicVariant() {
          const { cva } = await import("class-variance-authority");
          return cva("p-4");
        }
      `;
      expect(
        auditFileContent("web/app/home/dyn-route.tsx", dynTsx).some(
          (v) => v.ruleId === "RULE-NO-ROUTE-CVA"
        )
      ).toBe(true);
    });

    it("detects single-line broad element selectors in globals and non-globals CSS", () => {
      // Single-line div in globals.css
      const singleLineGlobals = `div { color:red !important; }`;
      const globalsViolations = auditFileContent(
        "web/app/globals.css",
        singleLineGlobals
      );
      expect(
        globalsViolations.some(
          (v) => v.ruleId === "RULE-NO-UNLAYERED-HIGH-BLAST-RADIUS-CSS"
        )
      ).toBe(true);
      expect(
        globalsViolations.some(
          (v) => v.ruleId === "RULE-NO-FORBIDDEN-STYLING-HOOKS"
        )
      ).toBe(true);

      // Single-line broad selectors in non-globals CSS
      const customCss = `
        * { box-sizing: border-box; }
        html { font-size: 16px; }
        body { margin: 0; }
        a { color: red; }
      `;
      const customViolations = auditFileContent(
        "web/app/custom.css",
        customCss
      );
      expect(
        customViolations.filter(
          (v) => v.ruleId === "RULE-NO-UNLAYERED-HIGH-BLAST-RADIUS-CSS"
        ).length
      ).toBe(4);
    });

    it("detects case-insensitive !IMPORTANT outside print media", () => {
      const fixtureCss = `
        .widget {
          margin: 10px !IMPORTANT;
          padding: 8px !  important;
        }
      `;
      const violations = auditFileContent("web/app/widget.css", fixtureCss);
      expect(
        violations.filter((v) => v.ruleId === "RULE-NO-FORBIDDEN-STYLING-HOOKS")
          .length
      ).toBe(2);
    });

    it("evaluates print media queries with explicit parser (isPrintMediaQuery)", () => {
      expect(isPrintMediaQuery("print")).toBe(true);
      expect(isPrintMediaQuery("only print")).toBe(true);
      expect(isPrintMediaQuery("print and (min-width: 600px)")).toBe(true);
      expect(isPrintMediaQuery("screen, print")).toBe(false);
      expect(isPrintMediaQuery("print, (max-width: 800px)")).toBe(false);

      expect(isPrintMediaQuery("not print")).toBe(false);
      expect(isPrintMediaQuery("not print and (color)")).toBe(false);
      expect(isPrintMediaQuery("not print, screen")).toBe(false);
      expect(isPrintMediaQuery("screen")).toBe(false);
      expect(isPrintMediaQuery("speech")).toBe(false);
      expect(isPrintMediaQuery("(min-width: 768px)")).toBe(false);
      expect(isPrintMediaQuery("")).toBe(false);
    });

    it("allows single-line @media print with !important and flags single-line @media not print", () => {
      // One-line @media print must be allowed
      const singleLinePrint = `@media print { .x { color:red !important; } }`;
      const printViolations = auditFileContent(
        "web/app/print.css",
        singleLinePrint
      );
      expect(
        printViolations.filter(
          (v) => v.ruleId === "RULE-NO-FORBIDDEN-STYLING-HOOKS"
        )
      ).toHaveLength(0);

      // One-line @media not print must be flagged
      const singleLineNotPrint = `@media not print { .x { color:red !important; } }`;
      const notPrintViolations = auditFileContent(
        "web/app/not-print.css",
        singleLineNotPrint
      );
      expect(
        notPrintViolations.filter(
          (v) => v.ruleId === "RULE-NO-FORBIDDEN-STYLING-HOOKS"
        )
      ).toHaveLength(1);
      expect(notPrintViolations[0].line).toBe(1);

      const mixedMedia = `@media print, screen { .x { color:red !important; } }`;
      const mixedViolations = auditFileContent(
        "web/app/mixed-media.css",
        mixedMedia
      );
      expect(
        mixedViolations.filter(
          (v) => v.ruleId === "RULE-NO-FORBIDDEN-STYLING-HOOKS"
        )
      ).toHaveLength(1);
    });

    it("handles multiline and nested @media blocks for !important containment", () => {
      // Multiline @media not print
      const multilineNotPrint = `
        @media not print {
          .widget {
            color: red !important;
          }
        }
      `;
      const notPrintViolations = auditFileContent(
        "web/app/multiline-not-print.css",
        multilineNotPrint
      );
      expect(
        notPrintViolations.filter(
          (v) => v.ruleId === "RULE-NO-FORBIDDEN-STYLING-HOOKS"
        )
      ).toHaveLength(1);

      // Multiline @media print with multiple rules
      const multilinePrint = `
        @media print {
          .header {
            display: none !important;
          }
          .page-break {
            page-break-after: always !important;
          }
        }
      `;
      const printViolations = auditFileContent(
        "web/app/multiline-print.css",
        multilinePrint
      );
      expect(
        printViolations.filter(
          (v) => v.ruleId === "RULE-NO-FORBIDDEN-STYLING-HOOKS"
        )
      ).toHaveLength(0);

      // Nested @media print { @media not print { ... } } must be flagged
      const nestedNotPrint = `
        @media print {
          @media not print {
            .inner {
              color: red !important;
            }
          }
        }
      `;
      const nestedViolations = auditFileContent(
        "web/app/nested-not-print.css",
        nestedNotPrint
      );
      expect(
        nestedViolations.filter(
          (v) => v.ruleId === "RULE-NO-FORBIDDEN-STYLING-HOOKS"
        )
      ).toHaveLength(1);

      // Nested @media print with @supports block must be allowed
      const nestedSupports = `
        @media print {
          @supports (display: grid) {
            .grid-print {
              display: grid !important;
            }
          }
        }
      `;
      const supportsViolations = auditFileContent(
        "web/app/nested-supports.css",
        nestedSupports
      );
      expect(
        supportsViolations.filter(
          (v) => v.ruleId === "RULE-NO-FORBIDDEN-STYLING-HOOKS"
        )
      ).toHaveLength(0);
    });

    it("distinguishes targetFiles: [] (scan zero) from targetFiles: undefined (full scan) in auditSourceCode", () => {
      // When targetFiles is empty array, it must scan 0 files and pass cleanly without full repository scan
      const emptyTargetResult = auditSourceCode({
        targetFiles: [],
        now: "2026-09-03T00:00:00Z",
      });
      expect(emptyTargetResult.passed).toBe(true);
      expect(emptyTargetResult.scannedFilesCount).toBe(0);
      expect(emptyTargetResult.violations).toHaveLength(0);

      // When targetFiles is undefined, it must scan the repository files (>0)
      const fullScanResult = auditSourceCode({
        now: "2026-09-03T00:00:00Z",
      });
      expect(fullScanResult.scannedFilesCount).toBeGreaterThan(10);
    });

    it("detects ES, CommonJS, and dynamic imports of forbidden styling hooks", () => {
      const esImportTsx = `
        import styled from "styled-components";
        import { css } from "@emotion/react";
      `;
      const esViolations = auditFileContent(
        "web/app/home/es-styled.tsx",
        esImportTsx
      );
      expect(
        esViolations.some((v) => v.ruleId === "RULE-NO-FORBIDDEN-STYLING-HOOKS")
      ).toBe(true);

      const cjsRequireTsx = `
        const styled = require("styled-components");
        const { StyleSheet } = require("aphrodite");
      `;
      const cjsViolations = auditFileContent(
        "web/app/home/cjs-styled.tsx",
        cjsRequireTsx
      );
      expect(
        cjsViolations.some(
          (v) => v.ruleId === "RULE-NO-FORBIDDEN-STYLING-HOOKS"
        )
      ).toBe(true);

      const dynImportTsx = `
        export async function loadStyles() {
          const emotion = await import("@emotion/styled");
          const aphrodite = await import("aphrodite");
        }
      `;
      const dynViolations = auditFileContent(
        "web/app/home/dyn-styled.tsx",
        dynImportTsx
      );
      expect(
        dynViolations.some(
          (v) => v.ruleId === "RULE-NO-FORBIDDEN-STYLING-HOOKS"
        )
      ).toBe(true);

      const subpathTsx = `import styled from "styled-components/macro";`;
      const subpathViolations = auditFileContent(
        "web/app/home/subpath-styled.tsx",
        subpathTsx
      );
      expect(
        subpathViolations.some(
          (v) => v.ruleId === "RULE-NO-FORBIDDEN-STYLING-HOOKS"
        )
      ).toBe(true);
    });
    it("detects arbitrary broad selectors including :where(button), :is(body, .x), and comma lists with broad element", () => {
      // :where(button) in globals.css
      const whereGlobals = `:where(button) { outline: none; }`;
      const whereViolations = auditFileContent(
        "web/app/globals.css",
        whereGlobals
      );
      expect(
        whereViolations.some(
          (v) => v.ruleId === "RULE-NO-UNLAYERED-HIGH-BLAST-RADIUS-CSS"
        )
      ).toBe(true);

      // :is(body, .x) in globals.css
      const isGlobals = `:is(body, .x) { background: #000; }`;
      const isViolations = auditFileContent("web/app/globals.css", isGlobals);
      expect(
        isViolations.some(
          (v) => v.ruleId === "RULE-NO-UNLAYERED-HIGH-BLAST-RADIUS-CSS"
        )
      ).toBe(true);

      // Comma list with broad element hidden after a class
      const commaGlobals = `.custom-card, button { padding: 10px; }`;
      const commaViolations = auditFileContent(
        "web/app/globals.css",
        commaGlobals
      );
      expect(
        commaViolations.some(
          (v) => v.ruleId === "RULE-NO-UNLAYERED-HIGH-BLAST-RADIUS-CSS"
        )
      ).toBe(true);

      // Non-globals CSS: broad selectors including :where, :is, comma lists, and multi-line
      const nonGlobalsCss = `
        :where(button) { border: none; }
        :is(body, .theme-dark) { color: #fff; }
        .panel-container, input { margin: 8px; }
      `;
      const nonGlobalsViolations = auditFileContent(
        "web/app/custom-theme.css",
        nonGlobalsCss
      );
      expect(
        nonGlobalsViolations.filter(
          (v) => v.ruleId === "RULE-NO-UNLAYERED-HIGH-BLAST-RADIUS-CSS"
        ).length
      ).toBe(3);

      // Multi-line broad element selector list
      const multilineCss = `
        .some-class,
        textarea {
          border: 1px solid #ccc;
        }
      `;
      const multilineViolations = auditFileContent(
        "web/app/multiline.css",
        multilineCss
      );
      expect(
        multilineViolations.some(
          (v) => v.ruleId === "RULE-NO-UNLAYERED-HIGH-BLAST-RADIUS-CSS"
        )
      ).toBe(true);
      const selectorString = `div[data-marker="@layer"] { color: red; }`;
      const selectorStringViolations = auditFileContent(
        "web/app/custom.css",
        selectorString
      );
      expect(
        selectorStringViolations.some(
          (v) => v.ruleId === "RULE-NO-UNLAYERED-HIGH-BLAST-RADIUS-CSS"
        )
      ).toBe(true);
    });

    it("ignores braces in CSS strings while still auditing broad selectors and @layer text", () => {
      const fixtureCss = `
        .content-marker {
          content: "{ not a block }";
        }
        div[data-marker="@layer"] {
          color: red;
        }
      `;
      const violations = auditFileContent(
        "web/app/css-string-fixture.css",
        fixtureCss
      );
      const broadViolations = violations.filter(
        (violation) =>
          violation.ruleId === "RULE-NO-UNLAYERED-HIGH-BLAST-RADIUS-CSS"
      );
      expect(broadViolations).toHaveLength(1);
      expect(broadViolations[0].line).toBe(5);
    });

    it("detects broad selectors nested in pseudo wrappers and combined selector lists", () => {
      const fixtureCss = `
        .card :where(.label, :is(button, .action)), .other:has(> input) { color: red; }
      `;
      const violations = auditFileContent(
        "web/app/pseudo-wrapper-fixture.css",
        fixtureCss
      );
      expect(
        violations.some(
          (violation) =>
            violation.ruleId === "RULE-NO-UNLAYERED-HIGH-BLAST-RADIUS-CSS"
        )
      ).toBe(true);
    });

    it("detects multiline native control opening tags in app-facing UI", () => {
      const multilineTsx = `
        import React from "react";

        export function MultilineForm() {
          return (
            <div>
              <button
                type="button"
                onClick={() => {}}
                className="btn-primary"
              >
                Multiline Native Button
              </button>
            </div>
          );
        }
      `;

      const violations = auditFileContent(
        "web/app/home/multiline-form.tsx",
        multilineTsx
      );
      expect(
        violations.some(
          (v) =>
            v.ruleId === "RULE-UNDOCUMENTED-NATIVE-EXCEPTION" &&
            v.message.includes("<button>")
        )
      ).toBe(true);
    });

    it("allows registered multiline native controls matching exception attributes", () => {
      const registeredMultilineTsx = `
        import React from "react";

        export function RegisteredScannerUI() {
          return (
            <div>
              <input
                type="radio"
                name="event_type"
                value="checkin"
              />
            </div>
          );
        }
      `;

      const violations = auditFileContent(
        "web/lib/attendance-scanner-ui.tsx",
        registeredMultilineTsx
      );
      expect(
        violations.some(
          (v) => v.ruleId === "RULE-UNDOCUMENTED-NATIVE-EXCEPTION"
        )
      ).toBe(false);
    });

    it("does not let data-* attributes satisfy exact native control selectors", () => {
      const fixtureTsx = `
        export function DataAttributeMismatch() {
          return <input data-type="radio" data-id="assisted-event-context" />;
        }
      `;
      const violations = auditFileContent(
        "web/lib/attendance-scanner-ui.tsx",
        fixtureTsx
      );
      expect(
        violations.some(
          (violation) =>
            violation.ruleId === "RULE-UNDOCUMENTED-NATIVE-EXCEPTION" &&
            violation.message.includes("<input>")
        )
      ).toBe(true);
    });

    it("detects side-effect static, dynamic, and preprocessor CSS Module imports", () => {
      // Side-effect static import
      const sideEffectTsx = `
        import "./widget.module.css";
        export function SideEffectWidget() { return <div className="widget">Test</div>; }
      `;
      expect(
        auditFileContent("web/app/home/side-effect.tsx", sideEffectTsx).some(
          (v) => v.ruleId === "RULE-NO-CSS-MODULES"
        )
      ).toBe(true);

      // Dynamic import
      const dynamicTsx = `
        export async function loadStyles() {
          const mod = await import("./dynamic.module.css");
          return mod;
        }
      `;
      expect(
        auditFileContent("web/app/home/dynamic-mod.tsx", dynamicTsx).some(
          (v) => v.ruleId === "RULE-NO-CSS-MODULES"
        )
      ).toBe(true);

      // Preprocessor module (SCSS/SASS/LESS)
      const scssTsx = `
        import styles from "./widget.module.scss";
        export function ScssWidget() { return <div className={styles.box}>SCSS</div>; }
      `;
      expect(
        auditFileContent("web/app/home/scss-widget.tsx", scssTsx).some(
          (v) => v.ruleId === "RULE-NO-CSS-MODULES"
        )
      ).toBe(true);
    });

    it("detects named, side-effect, require, and dynamic CSS Module imports using template literals", () => {
      const fixtureTsx = `
        import styles, { card } from \`./widget.module.css\`;
        import \`./side-effect.module.scss\`;
        const loaded = require(\`./required.module.less\`);
        const dynamic = import(\`./dynamic.module.pcss\`);
        export { styles, card, loaded, dynamic };
      `;
      const violations = auditFileContent(
        "web/app/home/template-css-modules.tsx",
        fixtureTsx
      );
      expect(
        violations.filter(
          (violation) => violation.ruleId === "RULE-NO-CSS-MODULES"
        )
      ).toHaveLength(1);
    });

    it("detects varied JSX inline style prop formats (whitespace, strings, identifiers, and multiline)", () => {
      // Whitespace variations
      const whitespaceTsx = `
        export function WhitespaceStyles() {
          return <div style = { { backgroundColor: "#9c302c" } }>Test</div>;
        }
      `;
      expect(
        auditFileContent("web/app/home/whitespace.tsx", whitespaceTsx).some(
          (v) => v.ruleId === "RULE-NO-INLINE-STYLES"
        )
      ).toBe(true);

      // Quoted string values
      const stringTsx = `
        export function StringStyles() {
          return <div style="color: red; padding: 10px;">Test</div>;
        }
      `;
      expect(
        auditFileContent("web/app/home/string-style.tsx", stringTsx).some(
          (v) => v.ruleId === "RULE-NO-INLINE-STYLES"
        )
      ).toBe(true);

      // Identifier / expression values
      const idTsx = `
        const customStyle = { margin: 10 };
        export function IdStyles() {
          return <div style={customStyle}>Test</div>;
        }
      `;
      expect(
        auditFileContent("web/app/home/id-style.tsx", idTsx).some(
          (v) => v.ruleId === "RULE-NO-INLINE-STYLES"
        )
      ).toBe(true);

      // Multiline style declaration
      const multilineStyleTsx = `
        export function MultilineStyles() {
          return (
            <div
              style={{
                color: "blue",
                padding: "8px",
              }}
            >
              Test
            </div>
          );
        }
      `;
      expect(
        auditFileContent(
          "web/app/home/multiline-style.tsx",
          multilineStyleTsx
        ).some((v) => v.ruleId === "RULE-NO-INLINE-STYLES")
      ).toBe(true);
    });
  });
  describe("Historical Debt Waiver & Live Audit Enforcement", () => {
    it("waives documented historical debt when exact active waiver exists", () => {
      const prototypePageTsx = `
        import styles from "./prototype.module.css";
        export default function Prototype() {
          return <div className={styles.container}>Prototype</div>;
        }
      `;

      const violations = auditFileContent(
        "web/app/prototype/page.tsx",
        prototypePageTsx
      );
      // Raw file audit finds the violation
      expect(violations.some((v) => v.ruleId === "RULE-NO-CSS-MODULES")).toBe(
        true
      );

      // Audit with active waiver inventory properly marks it as waived
      const result = auditSourceCode({
        targetFiles: ["web/app/prototype/page.tsx"],
        waivers: WAIVER_REGISTRY,
        now: "2026-09-03T00:00:00Z",
      });

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.waivedViolations.length).toBeGreaterThan(0);
      expect(result.waivedViolations[0].waiverId).toBe(
        "WVR-HISTORICAL-PROTOTYPE-MODULE-CSS"
      );
    });

    it("fails audit if historical debt waiver has expired", () => {
      const result = auditSourceCode({
        targetFiles: ["web/app/prototype/page.tsx"],
        waivers: WAIVER_REGISTRY,
        now: "2027-01-01T00:00:00Z", // Past waiver expiry (2026-12-31)
      });

      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it("passes static governance audit across the current repository cleanly", () => {
      const result = auditSourceCode({
        waivers: WAIVER_REGISTRY,
        nativeExceptions: NATIVE_EXCEPTION_REGISTRY,
        now: "2026-09-03T00:00:00Z",
      });

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.scannedFilesCount).toBeGreaterThan(10);
    });
  });

  describe("Exact CSS Source Fingerprint Waivers", () => {
    const historicalUniversalReset = `
      * {
        box-sizing: border-box;
        padding: 0;
        margin: 0;
      }
    `;

    it("detects the historical universal reset before waiver resolution", () => {
      const violations = auditFileContent(
        "web/app/globals.css",
        historicalUniversalReset
      );

      expect(violations).toHaveLength(1);
      expect(violations[0].ruleId).toBe(HIGH_BLAST_CSS_RULE);
      expect(
        (violations[0] as { sourceFingerprint?: string }).sourceFingerprint
      ).toMatch(/^[a-f0-9]{64}$/u);
    });

    it("detects broad custom elements without a selector-name allowlist", () => {
      const violations = auditFileContent(
        "web/app/globals.css",
        "video { display: block; }"
      );

      expect(violations).toHaveLength(1);
      expect(violations[0].ruleId).toBe(HIGH_BLAST_CSS_RULE);
    });

    it("detects a broad rule after a scoped rule on the same line", () => {
      const violations = auditFileContent(
        "web/app/globals.css",
        ".scope { color: red; } video { display: block; }"
      );

      expect(violations).toHaveLength(1);
      expect(violations[0].snippet).toContain("video");
      expect(violations[0].line).toBe(1);
    });

    it("detects a broad rule after same-line at-rule statements", () => {
      for (const css of [
        "@layer base; video { display: block; }",
        '@import "theme.css"; video { display: block; }',
      ]) {
        const violations = auditFileContent("web/app/globals.css", css);

        expect(violations).toHaveLength(1);
        expect(violations[0].snippet).toContain("video");
      }
    });

    it("waives one exact reset while another broad rule in the same file remains active", () => {
      const violation = auditFileContent(
        "web/app/globals.css",
        historicalUniversalReset
      )[0] as { sourceFingerprint?: string };
      const waiver = createHighBlastWaiver(violation.sourceFingerprint);

      const result = auditCssFixture(
        `${historicalUniversalReset}\nbody { color: red; }`,
        [waiver]
      );

      expect(result.waivedViolations).toHaveLength(1);
      expect(result.waivedViolations[0].waiverId).toBe(waiver.id);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].snippet).toContain("body");
      expect(result.passed).toBe(false);
    });

    it("keeps the same fingerprint across whitespace-only changes", () => {
      const violation = auditFileContent(
        "web/app/globals.css",
        historicalUniversalReset
      )[0] as { sourceFingerprint?: string };
      const waiver = createHighBlastWaiver(violation.sourceFingerprint);

      const whitespaceVariant = `*{\n  box-sizing : border-box ;\n  padding:0;\n  margin : 0;\n}`;
      const result = auditCssFixture(whitespaceVariant, [waiver]);

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.waivedViolations).toHaveLength(1);
    });

    it("invalidates the waiver when the selector or declaration block changes", () => {
      const violation = auditFileContent(
        "web/app/globals.css",
        historicalUniversalReset
      )[0] as { sourceFingerprint?: string };
      const waiver = createHighBlastWaiver(violation.sourceFingerprint);

      const changedRule = historicalUniversalReset.replace(
        "margin: 0",
        "margin: 1px"
      );
      const result = auditCssFixture(changedRule, [waiver]);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.waivedViolations).toHaveLength(0);
    });

    it("preserves quoted CSS values and normalizes structural slash whitespace", () => {
      const quotedWithSpaces = auditFileContent(
        "web/app/globals.css",
        'button[data-x="a : b"] { color: red; }'
      )[0] as { sourceFingerprint?: string };
      const quotedWithoutSpaces = auditFileContent(
        "web/app/globals.css",
        'button[data-x="a:b"] { color: red; }'
      )[0] as { sourceFingerprint?: string };
      const ratioWithSpaces = auditFileContent(
        "web/app/globals.css",
        "button { margin: 1rem / 1.5; }"
      )[0] as { sourceFingerprint?: string };
      const ratioWithoutSpaces = auditFileContent(
        "web/app/globals.css",
        "button { margin: 1rem/1.5; }"
      )[0] as { sourceFingerprint?: string };

      expect(quotedWithSpaces.sourceFingerprint).not.toBe(
        quotedWithoutSpaces.sourceFingerprint
      );
      expect(ratioWithSpaces.sourceFingerprint).toBe(
        ratioWithoutSpaces.sourceFingerprint
      );
    });

    it("rejects a generic file-level waiver for high-blast-radius CSS", () => {
      const genericWaiver = createHighBlastWaiver();
      const result = auditCssFixture(historicalUniversalReset, [genericWaiver]);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.waivedViolations).toHaveLength(0);

      const validation = validateRegistries({
        ...getCanonicalRegistries(),
        waivers: [genericWaiver],
      });
      expect(validation.valid).toBe(false);
      expect(
        validation.errors.some(
          (error) => error.code === "MISSING_WAIVER_SOURCE_FINGERPRINT"
        )
      ).toBe(true);
    });

    it("rejects a high-blast waiver that names more than one file", () => {
      const violation = auditFileContent(
        "web/app/globals.css",
        historicalUniversalReset
      )[0] as { sourceFingerprint?: string };
      const multiFileWaiver = {
        ...createHighBlastWaiver(violation.sourceFingerprint),
        id: "WVR-MULTI-FILE-GLOBAL-CSS-TEST",
        affectedFiles: ["web/app/globals.css", "web/app/other.css"],
      } as FingerprintedWaiver;

      const result = auditCssFixture(historicalUniversalReset, [
        multiFileWaiver,
      ]);

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.waivedViolations).toHaveLength(0);

      const validation = validateRegistries({
        ...getCanonicalRegistries(),
        waivers: [multiFileWaiver],
      });
      expect(validation.valid).toBe(false);
      expect(
        validation.errors.some(
          (error) =>
            error.code === "INVALID_WAIVER_AFFECTED_FILES" &&
            error.entryId === multiFileWaiver.id
        )
      ).toBe(true);
    });

    it("does not let an absolute in-repo path suppress a CSS violation", () => {
      const rootDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "efcc-governance-absolute-waiver-")
      );
      const filePath = path.join(rootDir, "web/app/globals.css");

      try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, historicalUniversalReset, "utf8");
        const violation = auditFileContent(filePath, historicalUniversalReset, {
          rootDir,
        })[0] as { sourceFingerprint?: string };
        const absolutePathWaiver = {
          ...createHighBlastWaiver(violation.sourceFingerprint),
          id: "WVR-ABSOLUTE-PATH-GLOBAL-CSS-TEST",
          affectedFiles: [filePath],
        } as FingerprintedWaiver;

        const result = auditSourceCode({
          rootDir,
          targetFiles: ["web/app/globals.css"],
          waivers: [absolutePathWaiver],
          now: "2026-09-03T00:00:00Z",
        });

        expect(result.passed).toBe(false);
        expect(result.violations).toHaveLength(1);
        expect(result.waivedViolations).toHaveLength(0);
      } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
      }
    });

    it("excludes only web-root generated output and never hides shipped source", () => {
      const rootDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "efcc-governance-generated-output-")
      );
      const generatedSource = `import styles from "./generated.module.css";`;
      const generatedFiles = [
        path.join(rootDir, "web/out/generated.tsx"),
        path.join(rootDir, "web/.wrangler/generated.tsx"),
      ];
      const shippedFiles = [
        path.join(rootDir, "web/app/out/shipped.tsx"),
        path.join(rootDir, "web/src/shipped.tsx"),
      ];

      try {
        for (const filePath of [...generatedFiles, ...shippedFiles]) {
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, generatedSource, "utf8");
        }

        const result = auditSourceCode({
          rootDir,
          waivers: [],
          now: "2026-09-03T00:00:00Z",
        });

        expect(result.scannedFilesCount).toBe(2);
        expect(
          result.violations.map((violation) => violation.file).sort()
        ).toEqual(["web/app/out/shipped.tsx", "web/src/shipped.tsx"]);
      } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
      }
    });
  });

  it("enforces exact waiver path matching without prefix overreach", () => {
    const waiver: Waiver = {
      id: "WVR-EXACT-TEST",
      ruleId: "RULE-NO-CSS-MODULES",
      route: "/prototype",
      scenario: "default",
      viewports: [320, 1024],
      browsers: ["chromium"],
      affectedFiles: ["web/app/prototype/page.tsx"],
      owner: "Test",
      createdAt: "2026-08-31",
      expiresAt: "2026-12-31",
      rationale: "Exact file waiver",
      removalCondition: "Remove",
      ledgerRef:
        "docs/implementation/ui-control-recovery-preservation-ledger.md",
      status: "active",
    };

    const resultExact = auditSourceCode({
      targetFiles: ["web/app/prototype/page.tsx"],
      waivers: [waiver],
      now: "2026-09-03T00:00:00Z",
    });
    expect(
      resultExact.waivedViolations.some((w) => w.waiverId === "WVR-EXACT-TEST")
    ).toBe(true);

    const wildcardWaiver: Waiver = {
      ...waiver,
      id: "WVR-WILDCARD-TEST",
      ruleId: "RULE-NO-ROUTE-CVA",
      affectedFiles: ["web/app/management/*"],
    };
    // Registry validation must reject wildcard affectedFiles
    const valWildcard = validateRegistries({
      ...getCanonicalRegistries(),
      waivers: [wildcardWaiver],
    });
    expect(valWildcard.valid).toBe(false);
    expect(
      valWildcard.errors.some((e) => e.code === "INVALID_WAIVER_AFFECTED_FILES")
    ).toBe(true);

    // Audit engine must reject wildcard matching and NOT waive the violation
    const resultWildcard = auditSourceCode({
      targetFiles: ["web/app/management/account-access-panel.tsx"],
      waivers: [wildcardWaiver],
      now: "2026-09-03T00:00:00Z",
    });
    expect(
      resultWildcard.waivedViolations.some(
        (w) => w.waiverId === "WVR-WILDCARD-TEST"
      )
    ).toBe(false);
  });

  it("fails closed when target path is a directory instead of explicit file", () => {
    const result = auditSourceCode({
      targetFiles: ["web/app"],
      now: "2026-09-03T00:00:00Z",
    });
    expect(result.passed).toBe(false);
    expect(result.scanErrors).toBeDefined();
    expect(result.scanErrors?.length).toBeGreaterThan(0);
    expect(result.scanErrors?.[0].message).toContain("directory");
  });

  it("fails closed for explicit and recursive symlink targets", () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "efcc-governance-audit-")
    );
    const sourceFile = path.join(tempRoot, "source.tsx");
    const explicitLink = path.join(tempRoot, "explicit-link.tsx");
    const recursiveRoot = path.join(tempRoot, "web");
    const recursiveLink = path.join(recursiveRoot, "recursive-link.tsx");
    fs.mkdirSync(recursiveRoot);
    fs.writeFileSync(sourceFile, "export const safe = true;", "utf8");

    try {
      try {
        fs.symlinkSync(sourceFile, explicitLink);
        fs.symlinkSync(sourceFile, recursiveLink);
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? error.code
            : undefined;
        if (code === "EACCES" || code === "EPERM") return;
        throw error;
      }

      const explicitResult = auditSourceCode({
        rootDir: tempRoot,
        targetFiles: [explicitLink],
        now: "2026-09-03T00:00:00Z",
      });
      expect(explicitResult.passed).toBe(false);
      expect(
        explicitResult.scanErrors?.some((error) =>
          /symbolic link/i.test(error.message)
        )
      ).toBe(true);

      const recursiveResult = auditSourceCode({
        rootDir: tempRoot,
        now: "2026-09-03T00:00:00Z",
      });
      expect(recursiveResult.passed).toBe(false);
      expect(
        recursiveResult.scanErrors?.some((error) =>
          /symbolic link/i.test(error.message)
        )
      ).toBe(true);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("fails closed when an invalid now reference date is provided to audit", () => {
    const result = auditSourceCode({
      now: "invalid-date-string-xyz",
    });
    expect(result.passed).toBe(false);
    expect(result.scanErrors).toBeDefined();
    expect(
      result.scanErrors?.some((e) =>
        e.message.includes("Invalid reference date")
      )
    ).toBe(true);
  });

  it("fails closed when target file does not exist", () => {
    const result = auditSourceCode({
      targetFiles: ["web/app/non-existent-page.tsx"],
      now: "2026-09-03T00:00:00Z",
    });
    expect(result.passed).toBe(false);
    expect(result.scanErrors).toBeDefined();
    expect(result.scanErrors?.length).toBeGreaterThan(0);
    expect(result.scanErrors?.[0].file).toContain("non-existent-page.tsx");
  });

  describe("CSS Preprocessor File Extension Coverage (Rule 1 & Rule 7)", () => {
    it("enforces Rule 1 (high-blast-radius selectors) on .scss, .sass, .less, and .pcss files", () => {
      const unlayeredScss = `
        button {
          margin: 0;
          font-weight: bold;
        }
      `;
      const scssViolations = auditFileContent(
        "web/app/custom.scss",
        unlayeredScss
      );
      expect(
        scssViolations.some(
          (v) => v.ruleId === "RULE-NO-UNLAYERED-HIGH-BLAST-RADIUS-CSS"
        )
      ).toBe(true);

      const unlayeredLess = `
        div {
          padding: 8px;
        }
      `;
      const lessViolations = auditFileContent(
        "web/app/custom.less",
        unlayeredLess
      );
      expect(
        lessViolations.some(
          (v) => v.ruleId === "RULE-NO-UNLAYERED-HIGH-BLAST-RADIUS-CSS"
        )
      ).toBe(true);

      const unlayeredPcss = `
        p {
          line-height: 1.5;
        }
      `;
      const pcssViolations = auditFileContent(
        "web/app/custom.pcss",
        unlayeredPcss
      );
      expect(
        pcssViolations.some(
          (v) => v.ruleId === "RULE-NO-UNLAYERED-HIGH-BLAST-RADIUS-CSS"
        )
      ).toBe(true);

      const scopedScss = `
        .custom-card {
          margin: 0;
        }
      `;
      const scopedViolations = auditFileContent(
        "web/app/custom.scss",
        scopedScss
      );
      expect(
        scopedViolations.some(
          (v) => v.ruleId === "RULE-NO-UNLAYERED-HIGH-BLAST-RADIUS-CSS"
        )
      ).toBe(false);
    });

    it("enforces Rule 7 (!important detection outside print) on .scss, .sass, .less, and .pcss files", () => {
      const importantScss = `
        .card {
          color: red !important;
        }
      `;
      const scssViolations = auditFileContent(
        "web/app/custom.scss",
        importantScss
      );
      expect(
        scssViolations.some(
          (v) => v.ruleId === "RULE-NO-FORBIDDEN-STYLING-HOOKS"
        )
      ).toBe(true);

      const importantPcss = `
        .badge {
          display: inline-block !important;
        }
      `;
      const pcssViolations = auditFileContent(
        "web/app/custom.pcss",
        importantPcss
      );
      expect(
        pcssViolations.some(
          (v) => v.ruleId === "RULE-NO-FORBIDDEN-STYLING-HOOKS"
        )
      ).toBe(true);
    });
  });

  describe("Print Media Query Evaluation & Nested/One-Line Block Containment", () => {
    it("correctly identifies print-only media queries and rejects mixed or negated queries", () => {
      // Print only -> true
      expect(isPrintMediaQuery("print")).toBe(true);
      expect(isPrintMediaQuery("only print")).toBe(true);
      expect(isPrintMediaQuery("print and (min-width: 600px)")).toBe(true);
      expect(isPrintMediaQuery("only print and (orientation: landscape)")).toBe(
        true
      );
      expect(isPrintMediaQuery("@media print")).toBe(true);
      expect(isPrintMediaQuery("@media only print")).toBe(true);

      // Mixed, negated, or screen queries -> false (fail-closed)
      expect(isPrintMediaQuery("screen, print")).toBe(false);
      expect(isPrintMediaQuery("print, screen")).toBe(false);
      expect(isPrintMediaQuery("not print")).toBe(false);
      expect(isPrintMediaQuery("not only print")).toBe(false);
      expect(isPrintMediaQuery("not print, print")).toBe(false);
      expect(isPrintMediaQuery("print, not print")).toBe(false);
      expect(isPrintMediaQuery("screen")).toBe(false);
      expect(isPrintMediaQuery("all")).toBe(false);
      expect(isPrintMediaQuery("(min-width: 800px)")).toBe(false);
      expect(isPrintMediaQuery("")).toBe(false);
      expect(isPrintMediaQuery("   ")).toBe(false);
    });

    it("allows !important within single-line and nested @media print blocks while flagging external declarations", () => {
      // Single line print block -> clean
      const singleLinePrint = `@media print { .roster { display: block !important; } }`;
      const printViolations = auditFileContent(
        "web/app/print.css",
        singleLinePrint
      );
      expect(
        printViolations.some(
          (v) => v.ruleId === "RULE-NO-FORBIDDEN-STYLING-HOOKS"
        )
      ).toBe(false);

      // Single line with print block followed by screen declaration -> flags screen declaration
      const mixedLineCss = `@media print { .p { display: block !important; } } .s { display: flex !important; }`;
      const mixedViolations = auditFileContent(
        "web/app/mixed.css",
        mixedLineCss
      );
      expect(
        mixedViolations.some(
          (v) => v.ruleId === "RULE-NO-FORBIDDEN-STYLING-HOOKS"
        )
      ).toBe(true);
      expect(mixedViolations).toHaveLength(1);

      // Nested at-rule inside @media print -> clean
      const nestedPrintCss = `
        @media print {
          @supports (display: grid) {
            .roster {
              display: grid !important;
            }
          }
        }
      `;
      const nestedPrintViolations = auditFileContent(
        "web/app/nested-print.css",
        nestedPrintCss
      );
      expect(
        nestedPrintViolations.some(
          (v) => v.ruleId === "RULE-NO-FORBIDDEN-STYLING-HOOKS"
        )
      ).toBe(false);

      // Nested at-rule inside @media screen -> flags violation
      const nestedScreenCss = `
        @media screen {
          @supports (display: grid) {
            .roster {
              display: grid !important;
            }
          }
        }
      `;
      const nestedScreenViolations = auditFileContent(
        "web/app/nested-screen.css",
        nestedScreenCss
      );
      expect(
        nestedScreenViolations.some(
          (v) => v.ruleId === "RULE-NO-FORBIDDEN-STYLING-HOOKS"
        )
      ).toBe(true);
    });
  });
});
