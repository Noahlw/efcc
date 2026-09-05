import {
  createContractFailure,
  StructuredContractFailureError,
} from "@/lib/governance/failure-reporter";

const T07_1_BASELINE_SHA = "a1a40d12d7a334183951604ae1adec509015474c";

interface BrokenTargetMeasurement {
  readonly actual: number;
  readonly computedStyles: Readonly<Record<string, string>>;
  readonly geometry: {
    readonly width: number;
    readonly height: number;
    readonly top: number;
    readonly left: number;
  };
}

export const BROKEN_MANAGEMENT_HUB_FIXTURE = {
  route: "/management",
  scenario: "PSN-MGMT-HUB-DEFAULT",
  viewport: { width: 390, height: 844 },
  browser: "chromium" as const,
  probe: "t07-1-broken-management-hub-fixture",
  expectedMinimum: 44,
  target: {
    role: "button",
    width: 36,
    height: 36,
    top: 400,
    left: 20,
  },
  computedStyles: {
    minHeight: "36px",
    height: "36px",
  },
} as const;

function defaultMeasurement(): BrokenTargetMeasurement {
  const { height, width } = BROKEN_MANAGEMENT_HUB_FIXTURE.target;
  return {
    actual: Math.min(width, height),
    computedStyles: BROKEN_MANAGEMENT_HUB_FIXTURE.computedStyles,
    geometry: {
      width,
      height,
      top: BROKEN_MANAGEMENT_HUB_FIXTURE.target.top,
      left: BROKEN_MANAGEMENT_HUB_FIXTURE.target.left,
    },
  };
}

export function runBrokenManagementHubProbe(
  measurement: BrokenTargetMeasurement = defaultMeasurement()
): never {
  const { actual } = measurement;
  if (actual >= BROKEN_MANAGEMENT_HUB_FIXTURE.expectedMinimum) {
    throw new Error("The deliberately broken fixture is no longer broken.");
  }

  const failure = createContractFailure({
    ruleId: "RULE-MINIMUM-TAP-TARGET",
    route: BROKEN_MANAGEMENT_HUB_FIXTURE.route,
    scenario: BROKEN_MANAGEMENT_HUB_FIXTURE.scenario,
    viewport: BROKEN_MANAGEMENT_HUB_FIXTURE.viewport,
    browser: BROKEN_MANAGEMENT_HUB_FIXTURE.browser,
    probe: BROKEN_MANAGEMENT_HUB_FIXTURE.probe,
    expected: BROKEN_MANAGEMENT_HUB_FIXTURE.expectedMinimum,
    actual,
    computedStyles: measurement.computedStyles,
    geometry: measurement.geometry,
    likelyOwnershipLayer: "primitive",
    baselineSha: T07_1_BASELINE_SHA,
    message:
      "Deliberately broken fixture: interactive target below required 44px minimum.",
    timestamp: "2026-09-06T00:00:00.000Z",
  });

  throw new StructuredContractFailureError(failure);
}

export function runBrokenManagementHubElementProbe(
  element: HTMLElement
): never {
  const rect = element.getBoundingClientRect();
  const computedStyles = window.getComputedStyle(element);
  const { height, minHeight } = computedStyles;
  return runBrokenManagementHubProbe({
    actual: Math.min(rect.width, rect.height),
    computedStyles: {
      minHeight,
      height,
    },
    geometry: {
      width: rect.width,
      height: rect.height,
      top: rect.top,
      left: rect.left,
    },
  });
}
