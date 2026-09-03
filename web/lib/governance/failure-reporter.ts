/**
 * EFCC UI Control Recovery — Structured Contract Failure Reporter.
 *
 * Implements Acceptance Criterion 27:
 * "Contract failure output includes rule ID, route, scenario, viewport, browser,
 * probe, expected and actual values, relevant computed styles or geometry,
 * likely ownership layer, and baseline SHA."
 */

import type {
  OwnershipLayer,
  StructuredContractFailure,
  StructuredContractFailureInput,
  ViewportDimension,
  ViewportSpec,
} from "./types";

/**
 * Creates an immutable structured contract failure artifact.
 */
export function createContractFailure(
  input: StructuredContractFailureInput
): StructuredContractFailure {
  return {
    ruleId: input.ruleId,
    route: input.route,
    scenario: input.scenario,
    viewport: input.viewport,
    browser: input.browser,
    probe: input.probe,
    expected: input.expected,
    actual: input.actual,
    computedStyles: input.computedStyles
      ? { ...input.computedStyles }
      : undefined,
    geometry: input.geometry ? { ...input.geometry } : undefined,
    likelyOwnershipLayer: input.likelyOwnershipLayer,
    baselineSha: input.baselineSha,
    message: input.message,
    timestamp: input.timestamp ?? new Date().toISOString(),
  };
}

function formatViewport(
  viewport: ViewportSpec | string | number | ViewportDimension
): string {
  if (
    typeof viewport === "object" &&
    viewport !== null &&
    "width" in viewport
  ) {
    return (
      `${viewport.width}px` +
      (viewport.height !== undefined ? ` x ${viewport.height}px` : "")
    );
  }
  if (typeof viewport === "number") {
    return `${viewport}px`;
  }
  return String(viewport);
}

/**
 * Formats a structured contract failure into a human-readable, highly actionable diagnostic.
 */
export function formatContractFailure(
  failure: StructuredContractFailure
): string {
  const lines: string[] = [
    "================================================================================",
    `[UI CONTRACT FAILURE] Rule: ${failure.ruleId}`,
    "--------------------------------------------------------------------------------",
    `Route:                  ${failure.route}`,
    `Scenario:               ${failure.scenario}`,
    `Viewport:               ${formatViewport(failure.viewport)}`,
    `Browser:                ${failure.browser}`,
    `Probe:                  ${failure.probe}`,
    `Expected:               ${JSON.stringify(failure.expected)}`,
    `Actual:                 ${JSON.stringify(failure.actual)}`,
    `Likely Ownership Layer: ${failure.likelyOwnershipLayer.toUpperCase()} (${ownershipLayerHint(failure.likelyOwnershipLayer)})`,
    `Baseline SHA:           ${failure.baselineSha}`,
    `Timestamp:              ${failure.timestamp ?? "N/A"}`,
  ];

  if (
    failure.computedStyles &&
    Object.keys(failure.computedStyles).length > 0
  ) {
    lines.push("Computed Styles:");
    for (const [prop, val] of Object.entries(failure.computedStyles)) {
      lines.push(`  ${prop}: ${val}`);
    }
  }

  if (failure.geometry && Object.keys(failure.geometry).length > 0) {
    lines.push("Geometry:");
    for (const [dim, val] of Object.entries(failure.geometry)) {
      lines.push(`  ${dim}: ${val}px`);
    }
  }

  lines.push(
    "--------------------------------------------------------------------------------"
  );
  lines.push(`Diagnostic: ${failure.message}`);
  lines.push(
    "Action: Fix the owning layer or record an owner-approved Contract Change with baseline SHA."
  );
  lines.push(
    "================================================================================"
  );

  return lines.join("\n");
}

function ownershipLayerHint(layer: OwnershipLayer): string {
  switch (layer) {
    case "global":
      return "web/app/globals.css or shell chrome tokens";
    case "primitive":
      return "web/components/ui/ local primitives";
    case "pattern":
      return "web/lib/ or shared management composition modules";
    case "route":
      return "web/app/ domain page or route-specific arrangement";
  }
}

/**
 * Custom error class carrying structured contract failure diagnostics.
 */
export class StructuredContractFailureError extends Error {
  readonly failure: StructuredContractFailure;

  constructor(failure: StructuredContractFailure) {
    super(
      `[${failure.ruleId}] Contract failure on route "${failure.route}" (${failure.scenario}): ${failure.message}\n\n${formatContractFailure(failure)}`
    );
    this.name = "StructuredContractFailureError";
    this.failure = failure;
  }
}
