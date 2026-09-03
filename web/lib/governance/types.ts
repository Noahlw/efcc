/**
 * EFCC UI Control Recovery — Governance & Contract Types.
 *
 * Authoritative typed schemas for route scenarios, UI contracts, approval packages,
 * waivers, preservation references, native exceptions, and structured contract failures.
 *
 * Implements Issue #508 (T03) and enforces UI Governance Authority (#507).
 */

/**
 * The four canonical ownership layers defined by UI Governance Authority.
 * Global CSS -> Primitives -> EFCC Patterns -> Feature Routes.
 */
export type OwnershipLayer = "global" | "primitive" | "pattern" | "route";

export const OWNERSHIP_LAYERS: readonly OwnershipLayer[] = [
  "global",
  "primitive",
  "pattern",
  "route",
] as const;

export function isOwnershipLayer(value: unknown): value is OwnershipLayer {
  return (
    typeof value === "string" &&
    (OWNERSHIP_LAYERS as readonly string[]).includes(value)
  );
}

/**
 * Coverage disposition for scenarios and contracts.
 */
export type CoverageDisposition = "covered" | "partial" | "deferred" | "waived";

export const COVERAGE_DISPOSITIONS: readonly CoverageDisposition[] = [
  "covered",
  "partial",
  "deferred",
  "waived",
] as const;

export function isCoverageDisposition(
  value: unknown
): value is CoverageDisposition {
  return (
    typeof value === "string" &&
    (COVERAGE_DISPOSITIONS as readonly string[]).includes(value)
  );
}

/**
 * Supported browser engines for contract testing and visual verification.
 */
export type BrowserEngine = "chromium" | "firefox" | "webkit";

export const BROWSER_ENGINES: readonly BrowserEngine[] = [
  "chromium",
  "firefox",
  "webkit",
] as const;

export function isBrowserEngine(value: unknown): value is BrowserEngine {
  return (
    typeof value === "string" &&
    (BROWSER_ENGINES as readonly string[]).includes(value)
  );
}

/**
 * Canonical test viewports (in CSS px width) used across the EFCC design system.
 * Standard W7 matrix: 320, 390, 600, 799, 800, 1024, 1440.
 */
export type CanonicalViewportWidth = 320 | 390 | 600 | 799 | 800 | 1024 | 1440;

export const CANONICAL_VIEWPORTS: readonly CanonicalViewportWidth[] = [
  320, 390, 600, 799, 800, 1024, 1440,
] as const;

export interface ViewportDimension {
  readonly width: number;
  readonly height?: number;
}

export type ViewportSpec = CanonicalViewportWidth | number | ViewportDimension;

/**
 * Route scenario in the Scenario Registry.
 */
export interface RouteScenario {
  readonly id: string;
  readonly route: string;
  readonly scenario: string;
  readonly viewports: readonly ViewportSpec[];
  readonly browsers: readonly BrowserEngine[];
  readonly contractIds: readonly string[];
  readonly coverageDisposition: CoverageDisposition;
  readonly layer: OwnershipLayer;
  readonly description: string;
  readonly notes?: string;
}

/**
 * Individual probe or assertion inside a UI contract.
 */
export interface UIContractProbe {
  readonly id: string;
  readonly selector: string;
  readonly property: string;
  readonly expected: unknown;
  readonly tolerance?: number;
  readonly description?: string;
}

/**
 * UI contract in the UI Contract Registry.
 */
export interface UIContract {
  readonly id: string;
  readonly name: string;
  readonly layer: OwnershipLayer;
  readonly scope: string;
  readonly probes: readonly UIContractProbe[];
  readonly coverageDisposition: CoverageDisposition;
  readonly baselineSha: string;
  readonly status: "active" | "draft" | "deprecated";
  readonly description?: string;
}

/**
 * Formal owner approval package recorded in the Approval Package Registry.
 */
export interface ApprovalPackage {
  readonly id: string;
  readonly title: string;
  readonly rationale: string;
  readonly scope: readonly string[];
  readonly baselineSha: string;
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly affectedRoutes: readonly string[];
  readonly viewports: readonly ViewportSpec[];
  readonly browsers: readonly BrowserEngine[];
  readonly contractIds: readonly string[];
  readonly evidenceRef: string;
  readonly status: "approved" | "superseded" | "revoked";
}

/**
 * Exact-scope, ledger-backed waiver in the Waiver Registry.
 */
export interface Waiver {
  readonly id: string;
  readonly ruleId: string;
  readonly route: string;
  readonly scenario: string;
  readonly viewports: readonly ViewportSpec[];
  readonly browsers: readonly BrowserEngine[];
  readonly affectedFiles: readonly string[];
  /**
   * Required for high-blast-radius CSS waivers. It fingerprints the exact
   * selector/declaration block rather than granting a file-level exemption.
   */
  readonly sourceFingerprint?: string;
  readonly owner: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly rationale: string;
  readonly removalCondition: string;
  /** Required for high-blast-radius CSS waivers so ownership of cleanup is explicit. */
  readonly removalOwner?: string;
  readonly ledgerRef: string;
  readonly status: "active" | "expired" | "revoked";
}

/**
 * Preservation reference linking to the Preservation Ledger and historical lineage.
 */
export interface PreservationReference {
  readonly id: string;
  readonly lineageRef: string;
  readonly scope: string;
  readonly invariants: readonly string[];
  readonly layer: OwnershipLayer;
  readonly ledgerRef: string;
  readonly notes?: string;
}

/**
 * Documented native exception in the Native Exception Registry (TK-11).
 */
export interface NativeException {
  readonly id: string;
  readonly control: string;
  readonly location: string;
  readonly reason: string;
  readonly layer: OwnershipLayer;
  readonly status: "approved" | "temporary";
  readonly removalCondition?: string;
}

/**
 * Structured contract failure artifact containing all diagnostic fields.
 */
export interface StructuredContractFailure {
  readonly ruleId: string;
  readonly route: string;
  readonly scenario: string;
  readonly viewport: string | number | ViewportDimension;
  readonly browser: string;
  readonly probe: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly computedStyles?: Readonly<Record<string, string>>;
  readonly geometry?: Readonly<{
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    top?: number;
    left?: number;
    right?: number;
    bottom?: number;
  }>;
  readonly likelyOwnershipLayer: OwnershipLayer;
  readonly baselineSha: string;
  readonly message: string;
  readonly timestamp: string;
}

export type StructuredContractFailureInput = Omit<
  StructuredContractFailure,
  "timestamp"
> & {
  readonly timestamp?: string;
};

/**
 * Structured validation diagnostic emitted by registry validation.
 */
export interface GovernanceValidationError {
  readonly code:
    | "MISSING_IDENTIFIER"
    | "INVALID_IDENTIFIER"
    | "DUPLICATE_IDENTIFIER"
    | "INVALID_OWNERSHIP"
    | "ORPHANED_SCENARIO"
    | "UNANCHORED_CONTRACT"
    | "MISSING_COVERAGE_DISPOSITION"
    | "EXPIRED_WAIVER"
    | "INVALID_WAIVER_EXPIRY"
    | "INVALID_VALIDATION_DATE"
    | "MISSING_WAIVER_REMOVAL_CONDITION"
    | "MISSING_WAIVER_OWNER"
    | "MISSING_WAIVER_AFFECTED_FILES"
    | "INVALID_WAIVER_AFFECTED_FILES"
    | "MISSING_WAIVER_SOURCE_FINGERPRINT"
    | "INVALID_WAIVER_SOURCE_FINGERPRINT"
    | "MISSING_WAIVER_REMOVAL_OWNER"
    | "MISSING_WAIVER_FIELD"
    | "APPROVAL_MISSING_BASELINE_SHA"
    | "APPROVAL_INVALID_BASELINE_SHA"
    | "APPROVAL_MISSING_APPROVER"
    | "APPROVAL_MISSING_SCOPE"
    | "APPROVAL_ORPHANED_CONTRACT"
    | "INVALID_APPROVAL_STATUS"
    | "INVALID_CONTRACT_STATUS"
    | "INVALID_WAIVER_STATUS"
    | "INVALID_REGISTRY_FIELD"
    | "INVALID_LAYER_HIERARCHY"
    | "UNDOCUMENTED_NATIVE_EXCEPTION"
    | "EMPTY_PRESERVATION_INVARIANTS"
    | "MISSING_NATIVE_EXCEPTION_FIELD"
    | "MISSING_NATIVE_EXCEPTION_REMOVAL_CONDITION"
    | "INVALID_NATIVE_EXCEPTION_STATUS"
    | "MISSING_PROBE_ID"
    | "DUPLICATE_PROBE_ID";
  readonly message: string;
  readonly registry: string;
  readonly entryId?: string;
  readonly field?: string;
  readonly severity: "error" | "warning";
}

export interface GovernanceValidationResult {
  readonly valid: boolean;
  readonly errors: readonly GovernanceValidationError[];
  readonly warnings: readonly GovernanceValidationError[];
  readonly stats: {
    readonly scenarioCount: number;
    readonly contractCount: number;
    readonly approvalCount: number;
    readonly waiverCount: number;
    readonly preservationCount: number;
    readonly nativeExceptionCount: number;
  };
}

export interface GovernanceRegistries {
  readonly scenarios: readonly RouteScenario[];
  readonly contracts: readonly UIContract[];
  readonly approvals: readonly ApprovalPackage[];
  readonly waivers: readonly Waiver[];
  readonly preservations: readonly PreservationReference[];
  readonly nativeExceptions: readonly NativeException[];
}

/**
 * Static audit rule identifiers.
 */
export type AuditRuleId =
  | "RULE-NO-UNLAYERED-HIGH-BLAST-RADIUS-CSS"
  | "RULE-NO-CSS-MODULES"
  | "RULE-NO-INLINE-STYLES"
  | "RULE-NO-ROUTE-GLOBAL-SELECTORS"
  | "RULE-UNDOCUMENTED-NATIVE-EXCEPTION"
  | "RULE-NO-ROUTE-CVA"
  | "RULE-NO-FORBIDDEN-STYLING-HOOKS";

export interface AuditViolation {
  readonly ruleId: AuditRuleId;
  readonly file: string;
  readonly line?: number;
  readonly column?: number;
  readonly snippet?: string;
  /** Exact normalized source identity for high-blast-radius CSS violations. */
  readonly sourceFingerprint?: string;
  readonly message: string;
  readonly likelyOwnershipLayer: OwnershipLayer;
  readonly waived?: boolean;
  readonly waiverId?: string;
}

export interface AuditScanError {
  readonly file: string;
  readonly message: string;
  readonly error?: unknown;
}

export interface AuditResult {
  readonly passed: boolean;
  readonly violations: readonly AuditViolation[];
  readonly waivedViolations: readonly AuditViolation[];
  readonly scannedFilesCount: number;
  readonly scanErrors?: readonly AuditScanError[];
}
