/**
 * EFCC UI Control Recovery — Governance Registry Validation Engine.
 *
 * Validates all six governance registries against strict invariants:
 * 1. Missing, malformed, or duplicate identifiers.
 * 2. Invalid ownership layers and cross-layer scope violations.
 * 3. Orphaned scenarios and unanchored UI contracts.
 * 4. Missing or invalid coverage dispositions.
 * 5. Expired waivers, missing owners, or absent removal conditions.
 * 6. Owner approvals without valid baseline commit SHAs.
 * 7. Incomplete preservation references and undocumented native exceptions.
 */

import { getCanonicalRegistries } from "./registries";
import {
  BROWSER_ENGINES,
  COVERAGE_DISPOSITIONS,
  OWNERSHIP_LAYERS,
  isBrowserEngine,
  isCoverageDisposition,
  isOwnershipLayer,
  type GovernanceRegistries,
  type GovernanceValidationError,
  type GovernanceValidationResult,
} from "./types";

const SAFE_IDENTIFIER_REGEX = /^[A-Za-z0-9][A-Za-z0-9._~-]{1,63}$/u;
const GIT_SHA_REGEX = /^[0-9a-f]{7,40}$/iu;
const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/u;
const ISO_DATETIME_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/u;
const APPROVAL_STATUSES = ["approved", "superseded", "revoked"] as const;
const CONTRACT_STATUSES = ["active", "draft", "deprecated"] as const;
const WAIVER_STATUSES = ["active", "expired", "revoked"] as const;
const CSS_SOURCE_FINGERPRINT_REGEX = /^[0-9a-f]{64}$/iu;
const AUDIT_RULE_IDS = [
  "RULE-NO-UNLAYERED-HIGH-BLAST-RADIUS-CSS",
  "RULE-NO-CSS-MODULES",
  "RULE-NO-INLINE-STYLES",
  "RULE-NO-ROUTE-GLOBAL-SELECTORS",
  "RULE-UNDOCUMENTED-NATIVE-EXCEPTION",
  "RULE-NO-ROUTE-CVA",
  "RULE-NO-FORBIDDEN-STYLING-HOOKS",
] as const;

function isValidCalendarDate(
  year: number,
  month: number,
  day: number
): boolean {
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

/**
 * Parses the small ISO-8601 subset used by governance metadata without allowing
 * JavaScript's permissive date rollover (for example, 2026-02-30 -> March 2).
 */
export function parseStrictDateValue(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? undefined
      : new Date(value.getTime());
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  if (typeof value !== "string" || value.trim() !== value) return undefined;

  const dateMatch = value.match(ISO_DATE_REGEX);
  if (dateMatch) {
    const year = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const day = Number(dateMatch[3]);
    if (!isValidCalendarDate(year, month, day)) return undefined;
    return new Date(Date.UTC(year, month - 1, day));
  }

  const datetimeMatch = value.match(ISO_DATETIME_REGEX);
  if (!datetimeMatch) return undefined;

  const year = Number(datetimeMatch[1]);
  const month = Number(datetimeMatch[2]);
  const day = Number(datetimeMatch[3]);
  const hour = Number(datetimeMatch[4]);
  const minute = Number(datetimeMatch[5]);
  const second = Number(datetimeMatch[6]);
  const offset = datetimeMatch[8];
  if (
    isValidCalendarDate(year, month, day) === false ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return undefined;
  }
  if (offset !== "Z") {
    const offsetMatch = offset.match(/^[+-](\d{2}):(\d{2})$/u);
    if (
      !offsetMatch ||
      Number(offsetMatch[1]) > 23 ||
      Number(offsetMatch[2]) > 59
    ) {
      return undefined;
    }
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function isExactNonEmptyString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    value.length > 0 &&
    /[\u0000-\u001f\u007f]/u.test(value) === false
  );
}

function isSafeMetadataText(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0)
    return false;
  if (/[\u0000-\u001f\u007f]/u.test(value)) return false;
  if (/[*?{}]/u.test(value)) return false;
  return !/(^|[/\\])\.\.([/\\]|$)/u.test(value);
}

function isValidRouteFormat(
  route: unknown,
  allowWildcard = false
): route is string {
  if (typeof route !== "string" || route.trim() !== route || route.length === 0)
    return false;
  if (/(^|[/\\])\.\.([/\\]|$)/u.test(route)) return false;
  if (allowWildcard && route.includes("*") && !route.endsWith("/*"))
    return false;
  const segment = allowWildcard
    ? "(?:[a-zA-Z0-9_.~-]+|\\*)"
    : "[a-zA-Z0-9_.~-]+";
  return new RegExp(`^/(?:${segment}(?:/(?:${segment}))*)?$`, "u").test(route);
}

function isValidViewportSpec(vp: unknown): boolean {
  if (typeof vp === "number") {
    return Number.isInteger(vp) && Number.isFinite(vp) && vp > 0;
  }
  if (typeof vp === "object" && vp !== null) {
    const obj = vp as { width?: unknown; height?: unknown };
    if (
      typeof obj.width !== "number" ||
      Number.isInteger(obj.width) === false ||
      Number.isFinite(obj.width) === false ||
      obj.width <= 0
    ) {
      return false;
    }
    if (
      obj.height !== undefined &&
      (typeof obj.height !== "number" ||
        Number.isInteger(obj.height) === false ||
        Number.isFinite(obj.height) === false ||
        obj.height <= 0)
    ) {
      return false;
    }
    return true;
  }
  return false;
}

function isSafeDocsRelativeRef(ref: unknown): ref is string {
  if (!isSafeMetadataText(ref) || !ref.startsWith("docs/")) return false;
  const segments = ref.split("/");
  return segments.every(
    (segment) => segment.length > 0 && segment !== "." && segment !== ".."
  );
}

function isSafeExactFilePath(filePath: unknown): filePath is string {
  if (!isSafeMetadataText(filePath)) return false;
  if (filePath.startsWith("/") || /^[a-zA-Z]:/u.test(filePath)) return false;
  const segments = filePath.split("/");
  return segments.every(
    (segment) => segment.length > 0 && segment !== "." && segment !== ".."
  );
}

function isSafeScopedPath(scope: unknown): scope is string {
  if (typeof scope !== "string" || scope.trim() !== scope || scope.length === 0)
    return false;
  if (scope.startsWith("/") || /^[a-zA-Z]:/u.test(scope)) return false;
  if (
    /[\u0000-\u001f\u007f]/u.test(scope) ||
    /[?{}]/u.test(scope) ||
    /(^|[/\\])\.\.([/\\]|$)/u.test(scope)
  ) {
    return false;
  }
  const segments = scope.split("/");
  return segments.every((segment, index) => {
    if (segment.length === 0 || segment === ".") return false;
    return !segment.includes("*") || index === segments.length - 1;
  });
}

function isSafeScopeList(scope: unknown): scope is string {
  if (typeof scope !== "string" || scope.includes("\n")) return false;
  return scope.split(";").every((entry) => isSafeScopedPath(entry));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasDuplicateValues(values: readonly unknown[]): boolean {
  const seen = new Set<string>();
  for (const value of values) {
    const key = typeof value === "string" ? value : JSON.stringify(value);
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

export interface ValidationOptions {
  /**
   * Reference date for waiver expiration checks.
   * Defaults to current timestamp.
   */
  readonly now?: Date | string | number;
}

/**
 * Validates a set of governance registries (or canonical registries by default).
 */
export function validateRegistries(
  registries: GovernanceRegistries = getCanonicalRegistries(),
  options: ValidationOptions = {}
): GovernanceValidationResult {
  const errors: GovernanceValidationError[] = [];
  const warnings: GovernanceValidationError[] = [];
  const scenarios = Array.isArray(registries.scenarios)
    ? registries.scenarios
    : [];
  const contracts = Array.isArray(registries.contracts)
    ? registries.contracts
    : [];
  const approvals = Array.isArray(registries.approvals)
    ? registries.approvals
    : [];
  const waivers = Array.isArray(registries.waivers) ? registries.waivers : [];
  const preservations = Array.isArray(registries.preservations)
    ? registries.preservations
    : [];
  const nativeExceptions = Array.isArray(registries.nativeExceptions)
    ? registries.nativeExceptions
    : [];

  const registryCollections: readonly [string, unknown][] = [
    ["scenarios", registries.scenarios],
    ["contracts", registries.contracts],
    ["approvals", registries.approvals],
    ["waivers", registries.waivers],
    ["preservations", registries.preservations],
    ["nativeExceptions", registries.nativeExceptions],
  ];
  for (const [registry, value] of registryCollections) {
    if (!Array.isArray(value)) {
      errors.push({
        code: "INVALID_REGISTRY_FIELD",
        message: `Registry "${registry}" must be an array`,
        registry,
        field: registry,
        severity: "error",
      });
    }
  }

  let refDate: Date;
  if (options.now !== undefined) {
    const parsedDate = parseStrictDateValue(options.now);
    if (parsedDate === undefined) {
      errors.push({
        code: "INVALID_VALIDATION_DATE",
        message: `Invalid reference date "${String(options.now)}" provided for validation`,
        registry: "validation",
        field: "now",
        severity: "error",
      });
      refDate = new Date(0);
    } else {
      refDate = parsedDate;
    }
  } else {
    refDate = new Date();
  }
  // 1. Validate Scenarios
  const scenarioIds = new Set<string>();
  for (const scenario of scenarios) {
    if (!isRecord(scenario)) {
      errors.push({
        code: "INVALID_REGISTRY_FIELD",
        message: "Scenario registry contains a non-object entry",
        registry: "scenarios",
        field: "entry",
        severity: "error",
      });
      continue;
    }
    if (
      !scenario.id ||
      typeof scenario.id !== "string" ||
      scenario.id.trim() === ""
    ) {
      errors.push({
        code: "MISSING_IDENTIFIER",
        message: "Scenario is missing a required identifier",
        registry: "scenarios",
        field: "id",
        severity: "error",
      });
      continue;
    }

    if (!SAFE_IDENTIFIER_REGEX.test(scenario.id)) {
      errors.push({
        code: "INVALID_IDENTIFIER",
        message: `Scenario identifier "${scenario.id}" is malformed. Must match ${SAFE_IDENTIFIER_REGEX}`,
        registry: "scenarios",
        entryId: scenario.id,
        field: "id",
        severity: "error",
      });
    }

    if (scenarioIds.has(scenario.id)) {
      errors.push({
        code: "DUPLICATE_IDENTIFIER",
        message: `Duplicate scenario identifier "${scenario.id}" found in scenario registry`,
        registry: "scenarios",
        entryId: scenario.id,
        field: "id",
        severity: "error",
      });
    } else {
      scenarioIds.add(scenario.id);
    }

    if (
      !scenario.route ||
      typeof scenario.route !== "string" ||
      scenario.route.trim() === ""
    ) {
      errors.push({
        code: "ORPHANED_SCENARIO",
        message: `Scenario "${scenario.id}" has an empty or missing route path`,
        registry: "scenarios",
        entryId: scenario.id,
        field: "route",
        severity: "error",
      });
    } else if (!isValidRouteFormat(scenario.route)) {
      errors.push({
        code: "ORPHANED_SCENARIO",
        message: `Scenario "${scenario.id}" has invalid route path format "${scenario.route}"`,
        registry: "scenarios",
        entryId: scenario.id,
        field: "route",
        severity: "error",
      });
    }

    if (!isSafeMetadataText(scenario.scenario)) {
      errors.push({
        code: "INVALID_REGISTRY_FIELD",
        message: `Scenario "${scenario.id}" has invalid scenario metadata`,
        registry: "scenarios",
        entryId: scenario.id,
        field: "scenario",
        severity: "error",
      });
    }

    if (!isSafeMetadataText(scenario.description)) {
      errors.push({
        code: "INVALID_REGISTRY_FIELD",
        message: `Scenario "${scenario.id}" must provide safe description metadata`,
        registry: "scenarios",
        entryId: scenario.id,
        field: "description",
        severity: "error",
      });
    }

    if (!isOwnershipLayer(scenario.layer)) {
      errors.push({
        code: "INVALID_OWNERSHIP",
        message: `Scenario "${scenario.id}" has invalid ownership layer "${scenario.layer}". Must be one of: ${OWNERSHIP_LAYERS.join(", ")}`,
        registry: "scenarios",
        entryId: scenario.id,
        field: "layer",
        severity: "error",
      });
    }

    if (!isCoverageDisposition(scenario.coverageDisposition)) {
      errors.push({
        code: "MISSING_COVERAGE_DISPOSITION",
        message: `Scenario "${scenario.id}" has missing or invalid coverage disposition "${scenario.coverageDisposition}". Must be one of: ${COVERAGE_DISPOSITIONS.join(", ")}`,
        registry: "scenarios",
        entryId: scenario.id,
        field: "coverageDisposition",
        severity: "error",
      });
    }

    if (!Array.isArray(scenario.viewports) || scenario.viewports.length === 0) {
      errors.push({
        code: "MISSING_COVERAGE_DISPOSITION",
        message: `Scenario "${scenario.id}" must specify at least one target viewport`,
        registry: "scenarios",
        entryId: scenario.id,
        field: "viewports",
        severity: "error",
      });
    } else {
      for (const vp of scenario.viewports) {
        if (!isValidViewportSpec(vp)) {
          errors.push({
            code: "MISSING_COVERAGE_DISPOSITION",
            message: `Scenario "${scenario.id}" contains invalid viewport specification "${JSON.stringify(vp)}". Viewports must be positive finite numbers or { width: number, height?: number } objects.`,
            registry: "scenarios",
            entryId: scenario.id,
            field: "viewports",
            severity: "error",
          });
        }
      }
    }

    if (
      Array.isArray(scenario.viewports) &&
      hasDuplicateValues(scenario.viewports)
    ) {
      errors.push({
        code: "INVALID_REGISTRY_FIELD",
        message: `Scenario "${scenario.id}" contains duplicate viewport entries`,
        registry: "scenarios",
        entryId: scenario.id,
        field: "viewports",
        severity: "error",
      });
    }

    if (!Array.isArray(scenario.browsers) || scenario.browsers.length === 0) {
      errors.push({
        code: "MISSING_COVERAGE_DISPOSITION",
        message: `Scenario "${scenario.id}" must specify at least one target browser engine`,
        registry: "scenarios",
        entryId: scenario.id,
        field: "browsers",
        severity: "error",
      });
    } else {
      for (const b of scenario.browsers) {
        if (!isBrowserEngine(b)) {
          errors.push({
            code: "MISSING_COVERAGE_DISPOSITION",
            message: `Scenario "${scenario.id}" contains invalid browser engine "${String(b)}". Allowed engines: ${BROWSER_ENGINES.join(", ")}`,
            registry: "scenarios",
            entryId: scenario.id,
            field: "browsers",
            severity: "error",
          });
        }
      }
    }

    if (
      Array.isArray(scenario.browsers) &&
      hasDuplicateValues(scenario.browsers)
    ) {
      errors.push({
        code: "INVALID_REGISTRY_FIELD",
        message: `Scenario "${scenario.id}" contains duplicate browser entries`,
        registry: "scenarios",
        entryId: scenario.id,
        field: "browsers",
        severity: "error",
      });
    }

    if (
      !Array.isArray(scenario.contractIds) ||
      scenario.contractIds.length === 0
    ) {
      errors.push({
        code: "ORPHANED_SCENARIO",
        message: `Scenario "${scenario.id}" must specify at least one contract in contractIds`,
        registry: "scenarios",
        entryId: scenario.id,
        field: "contractIds",
        severity: "error",
      });
    } else {
      if (hasDuplicateValues(scenario.contractIds)) {
        errors.push({
          code: "INVALID_REGISTRY_FIELD",
          message: `Scenario "${scenario.id}" contains duplicate contract IDs`,
          registry: "scenarios",
          entryId: scenario.id,
          field: "contractIds",
          severity: "error",
        });
      }
      for (const contractId of scenario.contractIds) {
        if (
          typeof contractId !== "string" ||
          !SAFE_IDENTIFIER_REGEX.test(contractId)
        ) {
          errors.push({
            code: "INVALID_IDENTIFIER",
            message: `Scenario "${scenario.id}" references malformed contract ID "${String(contractId)}"`,
            registry: "scenarios",
            entryId: typeof scenario.id === "string" ? scenario.id : undefined,
            field: "contractIds",
            severity: "error",
          });
        }
      }
    }
  }

  // 2. Validate UI Contracts
  const contractIds = new Set<string>();
  const activeContractIds = new Set<string>();

  for (const contract of contracts) {
    if (!isRecord(contract)) {
      errors.push({
        code: "INVALID_REGISTRY_FIELD",
        message: "UI contract registry contains a non-object entry",
        registry: "contracts",
        field: "entry",
        severity: "error",
      });
      continue;
    }
    if (
      !contract.id ||
      typeof contract.id !== "string" ||
      contract.id.trim() === ""
    ) {
      errors.push({
        code: "MISSING_IDENTIFIER",
        message: "UI contract is missing a required identifier",
        registry: "contracts",
        field: "id",
        severity: "error",
      });
      continue;
    }

    if (!SAFE_IDENTIFIER_REGEX.test(contract.id)) {
      errors.push({
        code: "INVALID_IDENTIFIER",
        message: `UI contract identifier "${contract.id}" is malformed. Must match ${SAFE_IDENTIFIER_REGEX}`,
        registry: "contracts",
        entryId: contract.id,
        field: "id",
        severity: "error",
      });
    }

    if (contractIds.has(contract.id)) {
      errors.push({
        code: "DUPLICATE_IDENTIFIER",
        message: `Duplicate contract identifier "${contract.id}" found in UI contract registry`,
        registry: "contracts",
        entryId: contract.id,
        field: "id",
        severity: "error",
      });
    } else {
      contractIds.add(contract.id);
      if (contract.status === "active") {
        activeContractIds.add(contract.id);
      }
    }

    if (
      !(CONTRACT_STATUSES as readonly string[]).includes(
        String(contract.status)
      )
    ) {
      errors.push({
        code: "INVALID_CONTRACT_STATUS",
        message: `UI contract "${contract.id}" has invalid status "${String(contract.status)}"`,
        registry: "contracts",
        entryId: contract.id,
        field: "status",
        severity: "error",
      });
    }

    if (!isSafeMetadataText(contract.name)) {
      errors.push({
        code: "INVALID_REGISTRY_FIELD",
        message: `UI contract "${contract.id}" must provide safe name metadata`,
        registry: "contracts",
        entryId: contract.id,
        field: "name",
        severity: "error",
      });
    }

    if (!isSafeScopeList(contract.scope)) {
      errors.push({
        code: "INVALID_REGISTRY_FIELD",
        message: `UI contract "${contract.id}" has an unsafe or malformed scope`,
        registry: "contracts",
        entryId: contract.id,
        field: "scope",
        severity: "error",
      });
    }

    if (!isOwnershipLayer(contract.layer)) {
      errors.push({
        code: "INVALID_OWNERSHIP",
        message: `UI contract "${contract.id}" has invalid ownership layer "${contract.layer}". Must be one of: ${OWNERSHIP_LAYERS.join(", ")}`,
        registry: "contracts",
        entryId: contract.id,
        field: "layer",
        severity: "error",
      });
    } else {
      // Validate layer hierarchy constraints
      if (
        contract.layer === "primitive" &&
        typeof contract.scope === "string" &&
        contract.scope.startsWith("web/app/")
      ) {
        errors.push({
          code: "INVALID_LAYER_HIERARCHY",
          message: `Primitive contract "${contract.id}" cannot have route scope "${contract.scope}". Primitives belong in web/components/ui/`,
          registry: "contracts",
          entryId: contract.id,
          field: "scope",
          severity: "error",
        });
      }
    }

    if (!isCoverageDisposition(contract.coverageDisposition)) {
      errors.push({
        code: "MISSING_COVERAGE_DISPOSITION",
        message: `UI contract "${contract.id}" has missing or invalid coverage disposition "${contract.coverageDisposition}". Must be one of: ${COVERAGE_DISPOSITIONS.join(", ")}`,
        registry: "contracts",
        entryId: contract.id,
        field: "coverageDisposition",
        severity: "error",
      });
    }

    if (
      !contract.baselineSha ||
      typeof contract.baselineSha !== "string" ||
      contract.baselineSha.trim() === ""
    ) {
      errors.push({
        code: "APPROVAL_MISSING_BASELINE_SHA",
        message: `UI contract "${contract.id}" is missing a baseline SHA`,
        registry: "contracts",
        entryId: contract.id,
        field: "baselineSha",
        severity: "error",
      });
    } else if (!GIT_SHA_REGEX.test(contract.baselineSha)) {
      errors.push({
        code: "APPROVAL_INVALID_BASELINE_SHA",
        message: `UI contract "${contract.id}" baseline SHA "${contract.baselineSha}" is not a valid commit SHA`,
        registry: "contracts",
        entryId: contract.id,
        field: "baselineSha",
        severity: "error",
      });
    }

    if (!Array.isArray(contract.probes) || contract.probes.length === 0) {
      errors.push({
        code: "MISSING_PROBE_ID",
        message: `UI contract "${contract.id}" must define at least one probe in probes array`,
        registry: "contracts",
        entryId: contract.id,
        field: "probes",
        severity: "error",
      });
    } else {
      const probeIds = new Set<string>();
      for (const probe of contract.probes) {
        if (!isRecord(probe)) {
          errors.push({
            code: "MISSING_PROBE_ID",
            message: `UI contract "${contract.id}" has a non-object probe entry`,
            registry: "contracts",
            entryId: contract.id,
            field: "probes",
            severity: "error",
          });
          continue;
        }
        if (
          !probe.id ||
          typeof probe.id !== "string" ||
          probe.id.trim() === ""
        ) {
          errors.push({
            code: "MISSING_PROBE_ID",
            message: `UI contract "${contract.id}" has a probe with missing or empty id`,
            registry: "contracts",
            entryId: contract.id,
            field: "probes.id",
            severity: "error",
          });
        } else {
          if (!SAFE_IDENTIFIER_REGEX.test(probe.id)) {
            errors.push({
              code: "INVALID_IDENTIFIER",
              message: `UI contract "${contract.id}" probe id "${probe.id}" is malformed. Must match ${SAFE_IDENTIFIER_REGEX}`,
              registry: "contracts",
              entryId: contract.id,
              field: "probes.id",
              severity: "error",
            });
          }

          if (probeIds.has(probe.id)) {
            errors.push({
              code: "DUPLICATE_PROBE_ID",
              message: `Duplicate probe ID "${probe.id}" found in UI contract "${contract.id}"`,
              registry: "contracts",
              entryId: contract.id,
              field: "probes.id",
              severity: "error",
            });
          } else {
            probeIds.add(probe.id);
          }
        }

        if (!isExactNonEmptyString(probe.selector)) {
          errors.push({
            code: "MISSING_IDENTIFIER",
            message: `UI contract "${contract.id}" probe "${probe.id || "unnamed"}" is missing required selector`,
            registry: "contracts",
            entryId: contract.id,
            field: "probes.selector",
            severity: "error",
          });
        }

        if (!isExactNonEmptyString(probe.property)) {
          errors.push({
            code: "MISSING_IDENTIFIER",
            message: `UI contract "${contract.id}" probe "${probe.id || "unnamed"}" is missing required property`,
            registry: "contracts",
            entryId: contract.id,
            field: "probes.property",
            severity: "error",
          });
        }

        if (!Object.prototype.hasOwnProperty.call(probe, "expected")) {
          errors.push({
            code: "MISSING_IDENTIFIER",
            message: `UI contract "${contract.id}" probe "${probe.id || "unnamed"}" is missing required expected value`,
            registry: "contracts",
            entryId: contract.id,
            field: "probes.expected",
            severity: "error",
          });
        }

        if (
          probe.tolerance !== undefined &&
          (typeof probe.tolerance !== "number" ||
            Number.isFinite(probe.tolerance) === false ||
            probe.tolerance < 0)
        ) {
          errors.push({
            code: "INVALID_REGISTRY_FIELD",
            message: `UI contract "${contract.id}" probe "${probe.id || "unnamed"}" has invalid tolerance`,
            registry: "contracts",
            entryId: contract.id,
            field: "probes.tolerance",
            severity: "error",
          });
        }
      }
    }
  }

  // Cross-reference: Verify scenario contract references and unanchored contracts
  const referencedContractIds = new Set<string>();

  for (const scenario of scenarios) {
    if (!isRecord(scenario)) continue;
    if (Array.isArray(scenario.contractIds)) {
      for (const contractId of scenario.contractIds) {
        if (!contractIds.has(contractId)) {
          errors.push({
            code: "ORPHANED_SCENARIO",
            message: `Scenario "${scenario.id}" references non-existent contract ID "${contractId}"`,
            registry: "scenarios",
            entryId: typeof scenario.id === "string" ? scenario.id : undefined,
            field: "contractIds",
            severity: "error",
          });
        } else {
          referencedContractIds.add(contractId);
        }
      }
    }
  }

  const approvedContractIds = new Set<string>();
  for (const approval of approvals) {
    if (!isRecord(approval)) continue;
    if (approval.status === "approved" && Array.isArray(approval.contractIds)) {
      for (const cid of approval.contractIds) {
        approvedContractIds.add(cid);
      }
    }
  }

  for (const activeContractId of activeContractIds) {
    if (!referencedContractIds.has(activeContractId)) {
      errors.push({
        code: "UNANCHORED_CONTRACT",
        message: `Active UI contract "${activeContractId}" is not referenced by any scenario in SCENARIO_REGISTRY`,
        registry: "contracts",
        entryId: activeContractId,
        severity: "error",
      });
    } else if (!approvedContractIds.has(activeContractId)) {
      errors.push({
        code: "UNANCHORED_CONTRACT",
        message: `Active UI contract "${activeContractId}" is not anchored by any approved package in APPROVAL_PACKAGE_REGISTRY`,
        registry: "contracts",
        entryId: activeContractId,
        severity: "error",
      });
    }
  }

  // 3. Validate Approval Packages
  const approvalIds = new Set<string>();
  for (const approval of approvals) {
    if (!isRecord(approval)) {
      errors.push({
        code: "INVALID_REGISTRY_FIELD",
        message: "Approval package registry contains a non-object entry",
        registry: "approvals",
        field: "entry",
        severity: "error",
      });
      continue;
    }
    if (
      !approval.id ||
      typeof approval.id !== "string" ||
      approval.id.trim() === ""
    ) {
      errors.push({
        code: "MISSING_IDENTIFIER",
        message: "Approval package is missing a required identifier",
        registry: "approvals",
        field: "id",
        severity: "error",
      });
      continue;
    }

    if (!SAFE_IDENTIFIER_REGEX.test(approval.id)) {
      errors.push({
        code: "INVALID_IDENTIFIER",
        message: `Approval package identifier "${approval.id}" is malformed`,
        registry: "approvals",
        entryId: approval.id,
        field: "id",
        severity: "error",
      });
    }

    if (approvalIds.has(approval.id)) {
      errors.push({
        code: "DUPLICATE_IDENTIFIER",
        message: `Duplicate approval identifier "${approval.id}" found in approval package registry`,
        registry: "approvals",
        entryId: approval.id,
        field: "id",
        severity: "error",
      });
    } else {
      approvalIds.add(approval.id);
    }

    if (
      !APPROVAL_STATUSES.includes(
        approval.status as (typeof APPROVAL_STATUSES)[number]
      )
    ) {
      errors.push({
        code: "INVALID_APPROVAL_STATUS",
        message: `Approval package "${approval.id}" has invalid status "${String(approval.status)}"`,
        registry: "approvals",
        entryId: approval.id,
        field: "status",
        severity: "error",
      });
    }

    if (
      !isSafeMetadataText(approval.title) ||
      !isSafeMetadataText(approval.rationale)
    ) {
      errors.push({
        code: "INVALID_REGISTRY_FIELD",
        message: `Approval package "${approval.id}" must provide safe title and rationale metadata`,
        registry: "approvals",
        entryId: approval.id,
        field: "metadata",
        severity: "error",
      });
    }

    if (
      !approval.baselineSha ||
      typeof approval.baselineSha !== "string" ||
      approval.baselineSha.trim() === ""
    ) {
      errors.push({
        code: "APPROVAL_MISSING_BASELINE_SHA",
        message: `Approval package "${approval.id}" must reference a baseline commit SHA`,
        registry: "approvals",
        entryId: approval.id,
        field: "baselineSha",
        severity: "error",
      });
    } else if (!GIT_SHA_REGEX.test(approval.baselineSha)) {
      errors.push({
        code: "APPROVAL_INVALID_BASELINE_SHA",
        message: `Approval package "${approval.id}" baseline SHA "${approval.baselineSha}" is not a valid commit SHA`,
        registry: "approvals",
        entryId: approval.id,
        field: "baselineSha",
        severity: "error",
      });
    }

    if (!isSafeMetadataText(approval.approvedBy)) {
      errors.push({
        code: "APPROVAL_MISSING_APPROVER",
        message: `Approval package "${approval.id}" is missing approvedBy owner signature`,
        registry: "approvals",
        entryId: approval.id,
        field: "approvedBy",
        severity: "error",
      });
    }

    if (parseStrictDateValue(approval.approvedAt) === undefined) {
      errors.push({
        code: "INVALID_VALIDATION_DATE",
        message: `Approval package "${approval.id}" has invalid or missing approvedAt date "${String(approval.approvedAt)}"`,
        registry: "approvals",
        entryId: approval.id,
        field: "approvedAt",
        severity: "error",
      });
    }

    if (!isSafeDocsRelativeRef(approval.evidenceRef)) {
      errors.push({
        code: "APPROVAL_MISSING_SCOPE",
        message: `Approval package "${approval.id}" evidenceRef "${approval.evidenceRef}" must be a safe docs-relative reference starting with "docs/"`,
        registry: "approvals",
        entryId: approval.id,
        field: "evidenceRef",
        severity: "error",
      });
    }

    if (!Array.isArray(approval.viewports) || approval.viewports.length === 0) {
      errors.push({
        code: "APPROVAL_MISSING_SCOPE",
        message: `Approval package "${approval.id}" must define at least one target viewport`,
        registry: "approvals",
        entryId: approval.id,
        field: "viewports",
        severity: "error",
      });
    } else {
      if (hasDuplicateValues(approval.viewports)) {
        errors.push({
          code: "APPROVAL_MISSING_SCOPE",
          message: `Approval package "${approval.id}" contains duplicate viewport entries`,
          registry: "approvals",
          entryId: approval.id,
          field: "viewports",
          severity: "error",
        });
      }
      for (const vp of approval.viewports) {
        if (!isValidViewportSpec(vp)) {
          errors.push({
            code: "APPROVAL_MISSING_SCOPE",
            message: `Approval package "${approval.id}" contains invalid viewport specification "${JSON.stringify(vp)}"`,
            registry: "approvals",
            entryId: approval.id,
            field: "viewports",
            severity: "error",
          });
        }
      }
    }

    if (!Array.isArray(approval.browsers) || approval.browsers.length === 0) {
      errors.push({
        code: "APPROVAL_MISSING_SCOPE",
        message: `Approval package "${approval.id}" must define at least one target browser`,
        registry: "approvals",
        entryId: approval.id,
        field: "browsers",
        severity: "error",
      });
    } else {
      if (hasDuplicateValues(approval.browsers)) {
        errors.push({
          code: "APPROVAL_MISSING_SCOPE",
          message: `Approval package "${approval.id}" contains duplicate browser entries`,
          registry: "approvals",
          entryId: approval.id,
          field: "browsers",
          severity: "error",
        });
      }
      for (const b of approval.browsers) {
        if (!isBrowserEngine(b)) {
          errors.push({
            code: "APPROVAL_MISSING_SCOPE",
            message: `Approval package "${approval.id}" contains invalid browser engine "${String(b)}"`,
            registry: "approvals",
            entryId: approval.id,
            field: "browsers",
            severity: "error",
          });
        }
      }
    }

    if (!Array.isArray(approval.scope) || approval.scope.length === 0) {
      errors.push({
        code: "APPROVAL_MISSING_SCOPE",
        message: `Approval package "${approval.id}" must define an explicit scope`,
        registry: "approvals",
        entryId: approval.id,
        field: "scope",
        severity: "error",
      });
    } else {
      for (const scope of approval.scope) {
        if (!isSafeScopeList(scope)) {
          errors.push({
            code: "APPROVAL_MISSING_SCOPE",
            message: `Approval package "${approval.id}" contains an unsafe scope entry "${String(scope)}"`,
            registry: "approvals",
            entryId: approval.id,
            field: "scope",
            severity: "error",
          });
        }
      }
    }

    if (
      !Array.isArray(approval.affectedRoutes) ||
      approval.affectedRoutes.length === 0
    ) {
      errors.push({
        code: "APPROVAL_MISSING_SCOPE",
        message: `Approval package "${approval.id}" must define at least one affected route`,
        registry: "approvals",
        entryId: approval.id,
        field: "affectedRoutes",
        severity: "error",
      });
    } else {
      for (const route of approval.affectedRoutes) {
        if (!isValidRouteFormat(route, true)) {
          errors.push({
            code: "APPROVAL_MISSING_SCOPE",
            message: `Approval package "${approval.id}" contains invalid affected route "${String(route)}"`,
            registry: "approvals",
            entryId: approval.id,
            field: "affectedRoutes",
            severity: "error",
          });
        }
      }
    }

    if (
      !Array.isArray(approval.contractIds) ||
      approval.contractIds.length === 0
    ) {
      errors.push({
        code: "APPROVAL_MISSING_SCOPE",
        message: `Approval package "${approval.id}" must reference at least one UI contract`,
        registry: "approvals",
        entryId: approval.id,
        field: "contractIds",
        severity: "error",
      });
    } else {
      if (hasDuplicateValues(approval.contractIds)) {
        errors.push({
          code: "APPROVAL_MISSING_SCOPE",
          message: `Approval package "${approval.id}" contains duplicate contract IDs`,
          registry: "approvals",
          entryId: approval.id,
          field: "contractIds",
          severity: "error",
        });
      }
      for (const cid of approval.contractIds) {
        if (typeof cid !== "string" || !SAFE_IDENTIFIER_REGEX.test(cid)) {
          errors.push({
            code: "INVALID_IDENTIFIER",
            message: `Approval package "${approval.id}" references malformed contract ID "${String(cid)}"`,
            registry: "approvals",
            entryId: approval.id,
            field: "contractIds",
            severity: "error",
          });
        } else if (!contractIds.has(cid)) {
          errors.push({
            code: "APPROVAL_ORPHANED_CONTRACT",
            message: `Approval package "${approval.id}" references non-existent contract ID "${cid}"`,
            registry: "approvals",
            entryId: approval.id,
            field: "contractIds",
            severity: "error",
          });
        }
      }
    }
  }

  // 4. Validate Waivers
  const waiverIds = new Set<string>();
  for (const waiver of waivers) {
    if (!isRecord(waiver)) {
      errors.push({
        code: "INVALID_REGISTRY_FIELD",
        message: "Waiver registry contains a non-object entry",
        registry: "waivers",
        field: "entry",
        severity: "error",
      });
      continue;
    }
    if (
      !waiver.id ||
      typeof waiver.id !== "string" ||
      waiver.id.trim() === ""
    ) {
      errors.push({
        code: "MISSING_IDENTIFIER",
        message: "Waiver is missing a required identifier",
        registry: "waivers",
        field: "id",
        severity: "error",
      });
      continue;
    }

    if (!SAFE_IDENTIFIER_REGEX.test(waiver.id)) {
      errors.push({
        code: "INVALID_IDENTIFIER",
        message: `Waiver identifier "${waiver.id}" is malformed`,
        registry: "waivers",
        entryId: waiver.id,
        field: "id",
        severity: "error",
      });
    }

    if (waiverIds.has(waiver.id)) {
      errors.push({
        code: "DUPLICATE_IDENTIFIER",
        message: `Duplicate waiver identifier "${waiver.id}" found in waiver registry`,
        registry: "waivers",
        entryId: waiver.id,
        field: "id",
        severity: "error",
      });
    } else {
      waiverIds.add(waiver.id);
    }
    if (
      !(WAIVER_STATUSES as readonly string[]).includes(String(waiver.status))
    ) {
      errors.push({
        code: "INVALID_WAIVER_STATUS",
        message: `Waiver "${waiver.id}" has invalid status "${String(waiver.status)}"`,
        registry: "waivers",
        entryId: waiver.id,
        field: "status",
        severity: "error",
      });
    }

    if (
      typeof waiver.ruleId !== "string" ||
      AUDIT_RULE_IDS.includes(
        waiver.ruleId as (typeof AUDIT_RULE_IDS)[number]
      ) === false
    ) {
      errors.push({
        code: "MISSING_WAIVER_FIELD",
        message: `Waiver "${waiver.id}" must specify a known audit ruleId`,
        registry: "waivers",
        entryId: waiver.id,
        field: "ruleId",
        severity: "error",
      });
    }

    if (waiver.ruleId === "RULE-NO-UNLAYERED-HIGH-BLAST-RADIUS-CSS") {
      if (
        typeof waiver.sourceFingerprint !== "string" ||
        waiver.sourceFingerprint.trim() === ""
      ) {
        errors.push({
          code: "MISSING_WAIVER_SOURCE_FINGERPRINT",
          message: `Waiver "${waiver.id}" for high-blast-radius CSS must specify an exact source fingerprint`,
          registry: "waivers",
          entryId: waiver.id,
          field: "sourceFingerprint",
          severity: "error",
        });
      } else if (!CSS_SOURCE_FINGERPRINT_REGEX.test(waiver.sourceFingerprint)) {
        errors.push({
          code: "INVALID_WAIVER_SOURCE_FINGERPRINT",
          message: `Waiver "${waiver.id}" has an invalid source fingerprint; expected a 64-character SHA-256 hex digest`,
          registry: "waivers",
          entryId: waiver.id,
          field: "sourceFingerprint",
          severity: "error",
        });
      }
      if (!isSafeMetadataText(waiver.removalOwner)) {
        errors.push({
          code: "MISSING_WAIVER_REMOVAL_OWNER",
          message: `Waiver "${waiver.id}" for high-blast-radius CSS must name its removal owner`,
          registry: "waivers",
          entryId: waiver.id,
          field: "removalOwner",
          severity: "error",
        });
      }
      if (
        Array.isArray(waiver.affectedFiles) &&
        waiver.affectedFiles.length !== 1
      ) {
        errors.push({
          code: "INVALID_WAIVER_AFFECTED_FILES",
          message: `Waiver "${waiver.id}" for high-blast-radius CSS must name exactly one affected file`,
          registry: "waivers",
          entryId: waiver.id,
          field: "affectedFiles",
          severity: "error",
        });
      }
    }

    if (
      !waiver.route ||
      typeof waiver.route !== "string" ||
      waiver.route.trim() === ""
    ) {
      errors.push({
        code: "MISSING_WAIVER_FIELD",
        message: `Waiver "${waiver.id}" must specify a route`,
        registry: "waivers",
        entryId: waiver.id,
        field: "route",
        severity: "error",
      });
    } else if (!isValidRouteFormat(waiver.route)) {
      errors.push({
        code: "MISSING_WAIVER_FIELD",
        message: `Waiver "${waiver.id}" has invalid route format "${waiver.route}". Route must start with "/" or "/*"`,
        registry: "waivers",
        entryId: waiver.id,
        field: "route",
        severity: "error",
      });
    }

    if (!isSafeMetadataText(waiver.scenario)) {
      errors.push({
        code: "MISSING_WAIVER_FIELD",
        message: `Waiver "${waiver.id}" must specify a scenario`,
        registry: "waivers",
        entryId: waiver.id,
        field: "scenario",
        severity: "error",
      });
    }

    if (!Array.isArray(waiver.viewports) || waiver.viewports.length === 0) {
      errors.push({
        code: "MISSING_WAIVER_FIELD",
        message: `Waiver "${waiver.id}" must specify at least one target viewport`,
        registry: "waivers",
        entryId: waiver.id,
        field: "viewports",
        severity: "error",
      });
    } else {
      for (const vp of waiver.viewports) {
        if (!isValidViewportSpec(vp)) {
          errors.push({
            code: "MISSING_WAIVER_FIELD",
            message: `Waiver "${waiver.id}" contains invalid viewport specification "${JSON.stringify(vp)}". Viewports must be positive finite numbers or { width: number, height?: number } objects.`,
            registry: "waivers",
            entryId: waiver.id,
            field: "viewports",
            severity: "error",
          });
        }
      }
    }

    if (
      Array.isArray(waiver.viewports) &&
      hasDuplicateValues(waiver.viewports)
    ) {
      errors.push({
        code: "MISSING_WAIVER_FIELD",
        message: `Waiver "${waiver.id}" contains duplicate viewport entries`,
        registry: "waivers",
        entryId: waiver.id,
        field: "viewports",
        severity: "error",
      });
    }

    if (!Array.isArray(waiver.browsers) || waiver.browsers.length === 0) {
      errors.push({
        code: "MISSING_WAIVER_FIELD",
        message: `Waiver "${waiver.id}" must specify at least one target browser`,
        registry: "waivers",
        entryId: waiver.id,
        field: "browsers",
        severity: "error",
      });
    } else {
      for (const b of waiver.browsers) {
        if (!isBrowserEngine(b)) {
          errors.push({
            code: "MISSING_WAIVER_FIELD",
            message: `Waiver "${waiver.id}" contains invalid browser engine "${String(b)}". Allowed engines: ${BROWSER_ENGINES.join(", ")}`,
            registry: "waivers",
            entryId: waiver.id,
            field: "browsers",
            severity: "error",
          });
        }
      }
    }

    if (Array.isArray(waiver.browsers) && hasDuplicateValues(waiver.browsers)) {
      errors.push({
        code: "MISSING_WAIVER_FIELD",
        message: `Waiver "${waiver.id}" contains duplicate browser entries`,
        registry: "waivers",
        entryId: waiver.id,
        field: "browsers",
        severity: "error",
      });
    }

    const createdDate = parseStrictDateValue(waiver.createdAt);
    if (createdDate === undefined) {
      errors.push({
        code: "INVALID_VALIDATION_DATE",
        message: `Waiver "${waiver.id}" has invalid or missing createdAt date "${String(waiver.createdAt)}"`,
        registry: "waivers",
        entryId: waiver.id,
        field: "createdAt",
        severity: "error",
      });
    }

    if (!isSafeMetadataText(waiver.owner)) {
      errors.push({
        code: "MISSING_WAIVER_OWNER",
        message: `Waiver "${waiver.id}" must have an explicit owner`,
        registry: "waivers",
        entryId: waiver.id,
        field: "owner",
        severity: "error",
      });
    }

    if (!isSafeMetadataText(waiver.rationale)) {
      errors.push({
        code: "MISSING_WAIVER_FIELD",
        message: `Waiver "${waiver.id}" must provide a rationale`,
        registry: "waivers",
        entryId: waiver.id,
        field: "rationale",
        severity: "error",
      });
    }

    if (!isSafeMetadataText(waiver.removalCondition)) {
      errors.push({
        code: "MISSING_WAIVER_REMOVAL_CONDITION",
        message: `Waiver "${waiver.id}" must define a concrete removal condition. Waivers cannot be permanent.`,
        registry: "waivers",
        entryId: waiver.id,
        field: "removalCondition",
        severity: "error",
      });
    }

    if (!isSafeDocsRelativeRef(waiver.ledgerRef)) {
      errors.push({
        code: "MISSING_WAIVER_FIELD",
        message: `Waiver "${waiver.id}" must reference a ledgerRef or evidence document`,
        registry: "waivers",
        entryId: waiver.id,
        field: "ledgerRef",
        severity: "error",
      });
    }

    const expiryDate = parseStrictDateValue(waiver.expiresAt);
    if (expiryDate === undefined) {
      errors.push({
        code: "INVALID_WAIVER_EXPIRY",
        message: `Waiver "${waiver.id}" has invalid or missing expiresAt date "${String(waiver.expiresAt)}"`,
        registry: "waivers",
        entryId: waiver.id,
        field: "expiresAt",
        severity: "error",
      });
    } else {
      if (createdDate !== undefined && expiryDate < createdDate) {
        errors.push({
          code: "INVALID_WAIVER_EXPIRY",
          message: `Waiver "${waiver.id}" expiry date "${waiver.expiresAt}" cannot precede creation date "${waiver.createdAt}"`,
          registry: "waivers",
          entryId: waiver.id,
          field: "expiresAt",
          severity: "error",
        });
      }
      if (waiver.status === "active" && expiryDate < refDate) {
        errors.push({
          code: "EXPIRED_WAIVER",
          message: `Waiver "${waiver.id}" expired on ${waiver.expiresAt} (current validation reference: ${refDate.toISOString()})`,
          registry: "waivers",
          entryId: waiver.id,
          field: "expiresAt",
          severity: "error",
        });
      }
    }

    if (
      !Array.isArray(waiver.affectedFiles) ||
      waiver.affectedFiles.length === 0
    ) {
      errors.push({
        code: "MISSING_WAIVER_AFFECTED_FILES",
        message: `Waiver "${waiver.id}" must specify exact affected file paths. Broad suppression is prohibited.`,
        registry: "waivers",
        entryId: waiver.id,
        field: "affectedFiles",
        severity: "error",
      });
    } else {
      for (const affFile of waiver.affectedFiles) {
        if (typeof affFile !== "string" || affFile.trim() === "") {
          errors.push({
            code: "MISSING_WAIVER_AFFECTED_FILES",
            message: `Waiver "${waiver.id}" contains empty or invalid affected file entry`,
            registry: "waivers",
            entryId: waiver.id,
            field: "affectedFiles",
            severity: "error",
          });
        } else if (!isSafeExactFilePath(affFile)) {
          errors.push({
            code: "INVALID_WAIVER_AFFECTED_FILES",
            message: `Waiver "${waiver.id}" has invalid or wildcard affected file pattern "${affFile}". Wildcard and glob suppressions or parent directory traversal are prohibited; exact file paths required.`,
            registry: "waivers",
            entryId: waiver.id,
            field: "affectedFiles",
            severity: "error",
          });
        }
      }
      if (hasDuplicateValues(waiver.affectedFiles)) {
        errors.push({
          code: "INVALID_WAIVER_AFFECTED_FILES",
          message: `Waiver "${waiver.id}" contains duplicate affected file paths`,
          registry: "waivers",
          entryId: waiver.id,
          field: "affectedFiles",
          severity: "error",
        });
      }
    }
  }

  // 5. Validate Preservation References
  const preservationIds = new Set<string>();
  for (const pres of preservations) {
    if (!isRecord(pres)) {
      errors.push({
        code: "INVALID_REGISTRY_FIELD",
        message: "Preservation registry contains a non-object entry",
        registry: "preservations",
        field: "entry",
        severity: "error",
      });
      continue;
    }
    if (!pres.id || typeof pres.id !== "string" || pres.id.trim() === "") {
      errors.push({
        code: "MISSING_IDENTIFIER",
        message: "Preservation reference is missing a required identifier",
        registry: "preservations",
        field: "id",
        severity: "error",
      });
      continue;
    }
    if (!SAFE_IDENTIFIER_REGEX.test(pres.id)) {
      errors.push({
        code: "INVALID_IDENTIFIER",
        message: `Preservation reference identifier "${pres.id}" is malformed. Must match ${SAFE_IDENTIFIER_REGEX}`,
        registry: "preservations",
        entryId: pres.id,
        field: "id",
        severity: "error",
      });
    }

    if (preservationIds.has(pres.id)) {
      errors.push({
        code: "DUPLICATE_IDENTIFIER",
        message: `Duplicate preservation identifier "${pres.id}" found in preservation registry`,
        registry: "preservations",
        entryId: pres.id,
        field: "id",
        severity: "error",
      });
    } else {
      preservationIds.add(pres.id);
    }

    if (!isOwnershipLayer(pres.layer)) {
      errors.push({
        code: "INVALID_OWNERSHIP",
        message: `Preservation reference "${pres.id}" has invalid ownership layer "${pres.layer}". Must be one of: ${OWNERSHIP_LAYERS.join(", ")}`,
        registry: "preservations",
        entryId: pres.id,
        field: "layer",
        severity: "error",
      });
    }

    if (!isSafeMetadataText(pres.lineageRef)) {
      errors.push({
        code: "MISSING_IDENTIFIER",
        message: `Preservation reference "${pres.id}" is missing lineageRef`,
        registry: "preservations",
        entryId: pres.id,
        field: "lineageRef",
        severity: "error",
      });
    }

    if (!isSafeMetadataText(pres.scope)) {
      errors.push({
        code: "MISSING_IDENTIFIER",
        message: `Preservation reference "${pres.id}" is missing scope`,
        registry: "preservations",
        entryId: pres.id,
        field: "scope",
        severity: "error",
      });
    }

    if (!isSafeDocsRelativeRef(pres.ledgerRef)) {
      errors.push({
        code: "MISSING_IDENTIFIER",
        message: `Preservation reference "${pres.id}" ledgerRef must be a safe docs-relative reference starting with "docs/" without wildcards or parent directory traversal`,
        registry: "preservations",
        entryId: pres.id,
        field: "ledgerRef",
        severity: "error",
      });
    }
    if (!Array.isArray(pres.invariants) || pres.invariants.length === 0) {
      errors.push({
        code: "EMPTY_PRESERVATION_INVARIANTS",
        message: `Preservation reference "${pres.id}" must document at least one invariant`,
        registry: "preservations",
        entryId: pres.id,
        field: "invariants",
        severity: "error",
      });
    } else {
      for (const invariant of pres.invariants) {
        if (!isSafeMetadataText(invariant)) {
          errors.push({
            code: "INVALID_REGISTRY_FIELD",
            message: `Preservation reference "${pres.id}" contains invalid invariant metadata`,
            registry: "preservations",
            entryId: pres.id,
            field: "invariants",
            severity: "error",
          });
        }
      }
    }
  }

  // 6. Validate Native Exceptions
  const nativeExceptionIds = new Set<string>();
  for (const nex of nativeExceptions) {
    if (!isRecord(nex)) {
      errors.push({
        code: "INVALID_REGISTRY_FIELD",
        message: "Native exception registry contains a non-object entry",
        registry: "nativeExceptions",
        field: "entry",
        severity: "error",
      });
      continue;
    }
    if (!nex.id || typeof nex.id !== "string" || nex.id.trim() === "") {
      errors.push({
        code: "MISSING_IDENTIFIER",
        message: "Native exception is missing a required identifier",
        registry: "nativeExceptions",
        field: "id",
        severity: "error",
      });
      continue;
    }
    if (!SAFE_IDENTIFIER_REGEX.test(nex.id)) {
      errors.push({
        code: "INVALID_IDENTIFIER",
        message: `Native exception identifier "${nex.id}" is malformed. Must match ${SAFE_IDENTIFIER_REGEX}`,
        registry: "nativeExceptions",
        entryId: nex.id,
        field: "id",
        severity: "error",
      });
    }

    if (nativeExceptionIds.has(nex.id)) {
      errors.push({
        code: "DUPLICATE_IDENTIFIER",
        message: `Duplicate native exception identifier "${nex.id}" found in native exception registry`,
        registry: "nativeExceptions",
        entryId: nex.id,
        field: "id",
        severity: "error",
      });
    } else {
      nativeExceptionIds.add(nex.id);
    }

    if (!isOwnershipLayer(nex.layer)) {
      errors.push({
        code: "INVALID_OWNERSHIP",
        message: `Native exception "${nex.id}" has invalid ownership layer "${nex.layer}". Must be one of: ${OWNERSHIP_LAYERS.join(", ")}`,
        registry: "nativeExceptions",
        entryId: nex.id,
        field: "layer",
        severity: "error",
      });
    }

    if (
      isSafeMetadataText(nex.control) === false ||
      isSafeExactFilePath(nex.location) === false ||
      isSafeMetadataText(nex.reason) === false
    ) {
      errors.push({
        code: "MISSING_NATIVE_EXCEPTION_FIELD",
        message: `Native exception "${nex.id}" must have safe control, location, and reason fields specified`,
        registry: "nativeExceptions",
        entryId: nex.id,
        severity: "error",
      });
    }

    if (
      nex.status === "temporary" &&
      !isSafeMetadataText(nex.removalCondition)
    ) {
      errors.push({
        code: "MISSING_NATIVE_EXCEPTION_REMOVAL_CONDITION",
        message: `Temporary native exception "${nex.id}" must specify a removal condition`,
        registry: "nativeExceptions",
        entryId: nex.id,
        field: "removalCondition",
        severity: "error",
      });
    }
    if (nex.status !== "approved" && nex.status !== "temporary") {
      errors.push({
        code: "INVALID_NATIVE_EXCEPTION_STATUS",
        message: `Native exception "${nex.id}" has invalid status "${String(nex.status)}". Must be "approved" or "temporary".`,
        registry: "nativeExceptions",
        entryId: nex.id,
        field: "status",
        severity: "error",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      scenarioCount: scenarios.length,
      contractCount: contracts.length,
      approvalCount: approvals.length,
      waiverCount: waivers.length,
      preservationCount: preservations.length,
      nativeExceptionCount: nativeExceptions.length,
    },
  };
}
