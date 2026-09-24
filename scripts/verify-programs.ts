import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(import.meta.dirname, "..");

interface PromotionStage {
  name: string;
  args: readonly string[];
  report?: string;
  expectedTests?: number;
}

interface PromotionStageResult {
  name: string;
  status: "running" | "passed" | "failed" | "not_run";
  artifacts: string[];
  failure?: string;
}

export const PROGRAMS_BROWSER_EXPECTED_TESTS = 70;
export const PROGRAMS_RESPONSIVE_EXPECTED_TESTS = 21;

export const PROMOTION_STAGES: readonly PromotionStage[] = [
  { name: "worker-contract", args: ["test:programs:contract"] },
  {
    name: "browser-acceptance",
    args: ["test:programs:browser"],
    report: "browser-results.json",
    expectedTests: PROGRAMS_BROWSER_EXPECTED_TESTS,
  },
  {
    name: "home-browser-acceptance",
    args: ["test:programs:home"],
    report: "home-results.json",
    expectedTests: 5,
  },
  {
    name: "responsive-matrix",
    args: ["test:programs:responsive"],
    report: "responsive-results.json",
    expectedTests: PROGRAMS_RESPONSIVE_EXPECTED_TESTS,
  },
  {
    name: "feed-browser-acceptance",
    args: ["test:programs:feed"],
    report: "feed-results.json",
    expectedTests: 7,
  },
  { name: "non-browser-precommit", args: ["verify:precommit"] },
];

// Case numbers 64–68 are the five PUI-05 Home rows in the 2026-09-23 parity CSV.
export const PUI05_HOME_ACCEPTANCE_MAPPINGS = [
  {
    oldId: "PUI-05:64",
    oldTitle: "Home long Explore copy wraps without horizontal overflow",
    replacementTest:
      "PUI-05 case 64: Home cards and announcement detail keep long copy inside the viewport",
    replacementFile: "tests/e2e/programs-home-acceptance.test.ts",
  },
  {
    oldId: "PUI-05:65",
    oldTitle: "Home announcement Back consumes only the overlay history entry",
    replacementTest:
      "PUI-05 case 65: native Back closes only the announcement overlay and restores the previous route",
    replacementFile: "tests/e2e/programs-home-acceptance.test.ts",
  },
  {
    oldId: "PUI-05:66",
    oldTitle:
      "Notices and Messages keep long feed copy inside the W7 viewport seams",
    replacementTest:
      "PUI-05 case 66: Notices and Messages keep seeded long copy inside the viewport",
    replacementFile: "tests/e2e/programs-home-acceptance.test.ts",
  },
  {
    oldId: "PUI-05:67",
    oldTitle:
      "Home next-event card opens event detail with 可簽到 and back-nav",
    replacementTest:
      "PUI-05 case 67: Home next-event opens the selected Event Detail with 可簽到 and returns Home",
    replacementFile: "tests/e2e/programs-home-acceptance.test.ts",
  },
  {
    oldId: "PUI-05:68",
    oldTitle: "Home Explore opens Program Detail and returns Home",
    replacementTest:
      "PUI-05 case 68: Home Explore opens the selected Program Detail and returns Home",
    replacementFile: "tests/e2e/programs-home-acceptance.test.ts",
  },
] as const;

export const PROGRAMS_FEED_ACCEPTANCE_MAPPINGS = [
  {
    oldId: "programs-d1:18",
    oldTitle: "Home 查看全部 opens the Messages list",
    replacementTest: "programs-d1 #18: Home 查看全部 opens the Messages list",
    replacementFile: "tests/e2e/programs-home-acceptance.test.ts",
  },
  {
    oldId: "programs-d1:19",
    oldTitle: "list opens detail and back returns to the same row",
    replacementTest:
      "programs-d1 #19: Messages detail Back returns to the same row",
    replacementFile: "tests/e2e/programs-home-acceptance.test.ts",
  },
  {
    oldId: "programs-d1:20",
    oldTitle:
      "lists notices with unread indicators and timestamps, and marks all read",
    replacementTest:
      "programs-d1 #20: Notices show unread timestamps and persist mark-all-read",
    replacementFile: "tests/e2e/programs-home-acceptance.test.ts",
  },
  {
    oldId: "programs-d1:21",
    oldTitle: "opens an event notice to the Event Detail",
    replacementTest:
      "programs-d1 #21: Event notice opens its selected Event Detail",
    replacementFile: "tests/e2e/programs-home-acceptance.test.ts",
  },
  {
    oldId: "programs-d1:22",
    oldTitle:
      "returns to Notices after back from event detail opened via notice",
    replacementTest:
      "programs-d1 #22: Event notice detail Back returns to Notices",
    replacementFile: "tests/e2e/programs-home-acceptance.test.ts",
  },
  {
    oldId: "programs-d1:23",
    oldTitle: "opens a program notice to the Program detail",
    replacementTest:
      "programs-d1 #23: Program notice opens its selected Program Detail",
    replacementFile: "tests/e2e/programs-home-acceptance.test.ts",
  },
  {
    oldId: "programs-d1:24",
    oldTitle: "opens an account notice to the account page",
    replacementTest: "programs-d1 #24: Account notice opens the profile page",
    replacementFile: "tests/e2e/programs-home-acceptance.test.ts",
  },
] as const;

export const PROGRAMS_PARTICIPANT_PARITY_MAPPINGS = [
  {
    oldId: "programs-d1:14",
    oldTitle:
      "row selection hands off through the canonical Program intent URL",
    replacementTest:
      "programs-d1 #14: catalog selection uses the canonical from=programs URL and Back returns to the row",
    replacementFile: "tests/e2e/programs-participant-acceptance.test.ts",
    evidenceLevel: "worker-d1",
  },
  {
    oldId: "programs-d1:25",
    oldTitle:
      "member submits a request, sees Pending, and withdraws through the confirm dialog",
    replacementTest:
      "programs-d1 #25: schedule advisory and Pending history remain visible through confirmation",
    replacementFile: "tests/e2e/programs-participant-acceptance.test.ts",
    evidenceLevel: "worker-d1",
  },
  {
    oldId: "programs-d1:26",
    oldTitle:
      "member exits an approved enrollment through the confirm dialog and re-enrolls",
    replacementTest:
      "programs-d1 #26: member exits an approved enrollment and re-enrolls",
    replacementFile: "tests/e2e/programs-participant-acceptance.test.ts",
    evidenceLevel: "worker-d1",
  },
] as const;

export const PROGRAMS_NAVIGATION_PARITY_MAPPINGS = [
  {
    oldId: "programs-d1:1",
    oldTitle:
      "admin enters Participant mode with capability-shaped Management entry",
    replacementTest:
      "programs-d1 #1: Admin enters Participant mode with its Management gateway",
    replacementFile: "tests/e2e/programs-navigation-parity.test.ts",
    evidenceLevel: "worker-d1",
  },
  {
    oldId: "programs-d1:2",
    oldTitle: "staff also enters Participant mode before any management action",
    replacementTest:
      "programs-d1 #2: Staff enters Participant mode before management",
    replacementFile: "tests/e2e/programs-navigation-parity.test.ts",
    evidenceLevel: "worker-d1",
  },
  {
    oldId: "programs-d1:3",
    oldTitle: "member enters Participant mode without a management gateway",
    replacementTest: "programs-d1 #3: Member has no Management gateway",
    replacementFile: "tests/e2e/programs-navigation-parity.test.ts",
    evidenceLevel: "worker-d1",
  },
  {
    oldId: "programs-d1:4",
    oldTitle:
      "mode switching preserves a valid Program intent and exposes tabpanel semantics",
    replacementTest:
      "programs-d1 #4: Mode switching preserves the Program intent and labelled region",
    replacementFile: "tests/e2e/programs-navigation-parity.test.ts",
    // The current navigation-link UI uses a labelled region, not tab semantics.
    evidenceLevel: "presentation-only",
  },
  {
    oldId: "programs-d1:5",
    oldTitle: "malformed direct intent stays recoverable inside Programs",
    replacementTest:
      "programs-d1 #5: Malformed Programs intent stays recoverable",
    replacementFile: "tests/e2e/programs-navigation-parity.test.ts",
    evidenceLevel: "worker-d1",
  },
  {
    oldId: "programs-d1:6",
    oldTitle:
      "restores a direct Programs intent after session expiry and login",
    replacementTest:
      "programs-d1 #6: Session expiry restores the direct Programs intent",
    replacementFile: "tests/e2e/programs-navigation-parity.test.ts",
    evidenceLevel: "worker-d1",
  },
  {
    oldId: "programs-d1:7",
    oldTitle:
      "member sees Listed catalog rows with status tags and never the Unlisted fixture",
    replacementTest:
      "programs-d1 #7: Member sees Listed and ManagerOnly rows but no Unlisted row",
    replacementFile: "tests/e2e/programs-navigation-parity.test.ts",
    evidenceLevel: "worker-d1",
  },
  {
    oldId: "programs-d1:8",
    oldTitle: "forbidden catalog exposes only the authenticated Home escape",
    replacementTest:
      "programs-d1 #8 (presentation-only): Forbidden catalog offers only the Home escape",
    replacementFile: "tests/e2e/programs-navigation-parity.test.ts",
    evidenceLevel: "presentation-only",
  },
  {
    oldId: "programs-d1:10",
    oldTitle:
      "admin sees the Unlisted fixture through scoped management access",
    replacementTest:
      "programs-d1 #10: Admin sees the Unlisted fixture through scoped access",
    replacementFile: "tests/e2e/programs-navigation-parity.test.ts",
    evidenceLevel: "worker-d1",
  },
  {
    oldId: "programs-d1:11",
    oldTitle: "filter pills allow filtering by viewer relationship",
    replacementTest:
      "programs-d1 #11: Relationship filters reflect D1 Eligible, Pending, Active, and All states",
    replacementFile: "tests/e2e/programs-navigation-parity.test.ts",
    evidenceLevel: "worker-d1",
  },
  {
    oldId: "programs-d1:12",
    oldTitle: "search narrows the catalog and clearing restores the same rows",
    replacementTest:
      "programs-d1 #12: Clearing catalog search restores the same rows",
    replacementFile: "tests/e2e/programs-navigation-parity.test.ts",
    evidenceLevel: "worker-d1",
  },
  {
    oldId: "programs-d1:13",
    oldTitle: "empty search result is recoverable by clearing",
    replacementTest:
      "programs-d1 #13: Empty catalog search recovers when cleared",
    replacementFile: "tests/e2e/programs-navigation-parity.test.ts",
    evidenceLevel: "worker-d1",
  },
  {
    oldId: "programs-d1:15",
    oldTitle: "direct detail survives refresh and returns to the directory",
    replacementTest:
      "programs-d1 #15: Program detail refresh, focus, schedule, and seven widths remain stable",
    replacementFile: "tests/e2e/programs-navigation-parity.test.ts",
    evidenceLevel: "worker-d1",
  },
  {
    oldId: "programs-d1:16",
    oldTitle:
      "member receives privacy-preserving unavailable state for Unlisted detail",
    replacementTest:
      "programs-d1 #16: Unlisted detail stays private and returns to the catalog",
    replacementFile: "tests/e2e/programs-navigation-parity.test.ts",
    evidenceLevel: "worker-d1",
  },
  {
    oldId: "programs-d1:17",
    oldTitle:
      "opens from Program detail, shows availability, and 前往掃描 pre-selects the event",
    replacementTest:
      "programs-d1 #17: Active Event detail preselects the scanner and restores state",
    replacementFile: "tests/e2e/programs-navigation-parity.test.ts",
    evidenceLevel: "worker-d1",
  },
  {
    oldId: "programs-d1:27",
    oldTitle:
      "ManagerOnly detail explains that participants cannot self-enroll",
    replacementTest:
      "programs-d1 #27: ManagerOnly detail explains participants cannot self-enroll",
    replacementFile: "tests/e2e/programs-navigation-parity.test.ts",
    evidenceLevel: "worker-d1",
  },
  {
    oldId: "programs-d1:28",
    oldTitle:
      "admin opens the status-first Cockpit and carries meeting/program context",
    replacementTest:
      "programs-d1 #28: Admin returns from the Attendance roster to the same Program",
    replacementFile: "tests/e2e/programs-navigation-parity.test.ts",
    // The current Attendance route carries the Event ID; browser history returns to this Program's Cockpit.
    evidenceLevel: "worker-d1",
  },
  {
    oldId: "programs-d1:31",
    oldTitle: "keeps Directory and Workspace entry points keyboard-operable",
    replacementTest:
      "programs-d1 #31: Directory and Workspace entry points work with Enter",
    replacementFile: "tests/e2e/programs-navigation-parity.test.ts",
    evidenceLevel: "worker-d1",
  },
  {
    oldId: "programs-d1:32",
    oldTitle: "member direct management links stay out of scope",
    replacementTest:
      "programs-d1 #32: Member direct Management links stay out of scope",
    replacementFile: "tests/e2e/programs-navigation-parity.test.ts",
    evidenceLevel: "worker-d1",
  },
  {
    oldId: "programs-d1:33",
    oldTitle:
      "staff uses the same capability-shaped Directory information architecture",
    replacementTest:
      "programs-d1 #33: Staff sees the capability-shaped Management Directory",
    replacementFile: "tests/e2e/programs-navigation-parity.test.ts",
    evidenceLevel: "worker-d1",
  },
  {
    oldId: "programs-d1:34",
    oldTitle: "a revoked or unknown direct management link stays generic",
    replacementTest:
      "programs-d1 #34: Unknown direct Management links stay generic",
    replacementFile: "tests/e2e/programs-navigation-parity.test.ts",
    evidenceLevel: "worker-d1",
  },
  {
    oldId: "programs-d1:36",
    oldTitle:
      "routes scope-owned settings through focused editors and canonical Schedule",
    replacementTest:
      "programs-d1 #36: Settings route through focused editors and canonical Schedule",
    replacementFile: "tests/e2e/programs-navigation-parity.test.ts",
    evidenceLevel: "worker-d1",
  },
  {
    oldId: "programs-d1:37",
    oldTitle:
      "omits Schedule and Attendance settings rows when their modules are disabled",
    replacementTest:
      "programs-d1 #37: Disabled modules hide Schedule and Attendance settings",
    replacementFile: "tests/e2e/programs-navigation-parity.test.ts",
    evidenceLevel: "worker-d1",
  },
] as const;

function managementMapping(
  caseNumber: number,
  oldTitle: string,
  replacementTest: string,
  replacementFile = "tests/e2e/programs-management-acceptance.test.ts"
) {
  return {
    oldId: `programs-d1:${caseNumber}`,
    oldTitle,
    replacementTest,
    replacementFile,
    evidenceLevel: "worker-d1" as const,
  };
}

export const PROGRAMS_MANAGEMENT_PARITY_MAPPINGS = [
  managementMapping(
    29,
    "admin opens Course Facts, edits course name and purpose, and verifies server persistence",
    "admin opens a scoped Program, saves management data, and reads it back"
  ),
  managementMapping(
    30,
    "manager Participants queue shows scoped counts and approves a pending request",
    "programs-d1 #30: Participants approval updates scoped Pending and Active counts"
  ),
  managementMapping(
    38,
    "consequential discoverability change requires confirmation before it saves",
    "programs-d1 #38: discoverability changes wait for confirmation before saving"
  ),
  managementMapping(
    39,
    "directory displays only the actor's authorized department projection",
    "programs-d1 #39: directory displays only the actor's authorized department projection"
  ),
  managementMapping(
    40,
    "department detail exposes five independently toggleable modules",
    "programs-d1 #40: department detail exposes five independently toggleable modules"
  ),
  managementMapping(
    41,
    "offline department save stays inline and reports the save error",
    "programs-d1 #41: offline department save stays inline and reports the save error"
  ),
  managementMapping(
    42,
    "creates a program from department detail and lands in its cockpit",
    "programs-d1 #42: creates a program from department detail and lands in its cockpit"
  ),
  managementMapping(
    43,
    "creates a OneOff, operates multiple Events, edits, and blocks archive",
    "programs-d1 #43: creates a OneOff, operates multiple Events, edits, and blocks archive"
  ),
  managementMapping(
    44,
    "member direct Program mutation is denied server-side",
    "program update rejects invalid fields and archives permanently",
    "web/lib/programs/programs.test.ts"
  ),
  managementMapping(
    45,
    "MemberRequest managers can open Participants and use assisted enrollment",
    "programs-d1 #45: MemberRequest managers can open Participants and use assisted enrollment"
  ),
  managementMapping(
    46,
    "canonical ParticipantsTask cancels an active enrollment into history",
    "programs-d1 #46: canonical ParticipantsTask cancels an active enrollment into history"
  ),
  managementMapping(
    47,
    "EventsTask refetches schedule exceptions after reschedule and restore",
    "programs-d1 #47: EventsTask refetches schedule exceptions after reschedule and restore"
  ),
  managementMapping(
    48,
    "admin creates, deep-links, and edits an event with HK wall display",
    "programs-d1 #48: admin creates, deep-links, and edits an event with HK wall display"
  ),
  managementMapping(
    49,
    "safe deactivation is immediate with Undo; cancellation retires controls",
    "programs-d1 #49: safe deactivation is immediate with Undo; cancellation retires controls"
  ),
  managementMapping(
    50,
    "an active Program enrollment alone does not gate this event's deactivation",
    "availability: program-wide enrollments alone do not gate this event's deactivation",
    "web/lib/programs/programs.test.ts"
  ),
  managementMapping(
    51,
    "a currently open check-in window with zero check-ins still requires confirmation to deactivate",
    "programs-d1 #51: a currently open check-in window with zero check-ins still requires confirmation to deactivate"
  ),
  managementMapping(
    52,
    "zero state is explicit and management attention stays scoped",
    "programs-d1 #52: managers can open notifications and no-scope users cannot"
  ),
  managementMapping(
    53,
    "lists bounded real sources, exact task links, workspace counts, and refreshes after decisions",
    "programs-d1 #53: lists bounded real sources, exact task links, workspace counts, and refreshes after decisions"
  ),
  managementMapping(
    54,
    "preview materializes exact rows without writing events",
    "EVT-02.1 preview materializes exact weekly/monthly occurrences with locations and exceptions, without writing events",
    "web/lib/programs/programs.test.ts"
  ),
  managementMapping(
    55,
    "generation reports deterministic created/skipped counts and refreshes the directory",
    "programs-d1 #55: generation refreshes the visible Events directory"
  ),
  managementMapping(
    56,
    "changing the visible range requires Review Again before generation",
    "programs-d1 #56: changing the visible range requires Review Again before generation"
  ),
  managementMapping(
    57,
    "a stale plan is rejected before writes and requires a fresh preview",
    "programs-d1 #57: a stale plan is rejected before writes and requires a fresh preview"
  ),
  managementMapping(
    58,
    "preview/generate controls are unreachable without the manage capability",
    "programs-d1 #58: preview/generate controls are unreachable without the manage capability"
  ),
  managementMapping(
    59,
    "admin sees the three groups, all six rows, and the course-management card",
    "programs-d1 #59: admin sees the three groups, all seven rows, and the course-management card"
  ),
  managementMapping(
    60,
    "staff without home.publish sees granted rows only — 內容與系統 omitted entirely",
    "programs-d1 #60: staff without home.publish sees six granted rows and omits 內容與系統"
  ),
  managementMapping(
    61,
    "attendance hub lists open meetings and opens the selected roster",
    "programs-d1 #61: attendance hub lists open meetings and opens the selected roster"
  ),
  managementMapping(
    62,
    "approvals list opens a routable detail; approve/reject stay atomic and read-only",
    "programs-d1 #62: approvals list opens a routable detail; approve/reject stay atomic and read-only"
  ),
  managementMapping(
    63,
    "approvals list preserves scroll position after detail back-nav",
    "programs-d1 #63: approvals list preserves scroll position after detail back-nav"
  ),
] as const;

export const PROGRAMS_RESPONSIVE_PARITY_MAPPINGS = [
  {
    oldId: "programs-d1:9",
    oldTitle:
      "long catalog copy wraps without moving controls or causing overflow",
    replacementTest:
      "programs-d1 #9: participant catalog/detail keeps action geometry and dock clearance bounded",
    replacementFile: "tests/e2e/programs-responsive-matrix.test.ts",
    evidenceLevel: "presentation-only",
  },
  {
    oldId: "programs-d1:35",
    oldTitle:
      "workspace overview and focused tasks satisfy numeric W7 geometry",
    replacementTest:
      "programs-d1 #35: management settings keeps composition and controls usable",
    replacementFile: "tests/e2e/programs-responsive-matrix.test.ts",
    evidenceLevel: "presentation-only",
  },
] as const;

export const RUNTIME_CANARY_STAGE: PromotionStage = {
  name: "runtime-canary",
  args: ["test:programs:canary"],
};

export const B003_RESIDUAL_RISK = {
  id: "B-003",
  status: "open",
  disposition: "accepted-rescue-development-risk",
  scope: "rescue-development only",
  ownerApprovalReference:
    "https://github.com/Noahlw/efcc/issues/505#issuecomment-5550498028",
  diagnosticCommand: "pnpm test:programs:canary",
  summary:
    "The unchanged five-minute sustained-runtime canary remains unresolved diagnostic evidence; this is not a runtime-fix or production-release approval.",
} as const;

const MANIFEST_STAGES: readonly PromotionStage[] = [
  ...PROMOTION_STAGES,
  RUNTIME_CANARY_STAGE,
];

type JsonRecord = Record<string, unknown>;
const EXPECTED_CANARY_WINDOW_MS = 5 * 60 * 1000;
const EXPECTED_CANARY_RETRIES = 0;

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function numberField(record: JsonRecord | null, key: string): number | null {
  const value = record?.[key];
  return typeof value === "number" ? value : null;
}

interface MigrationLedgerSummary {
  participantRows: number;
  managementRows: number;
  executableMappings: string[];
}

function ledgerRows(source: string, label: string): string[][] {
  const scenarioStart = source.indexOf("## Scenario inventory");
  const scenarioSource =
    scenarioStart === -1
      ? ""
      : source.slice(scenarioStart + "## Scenario inventory".length);
  const nextSection = scenarioSource.search(/\n##\s/u);
  const scenarioSection =
    nextSection === -1 ? scenarioSource : scenarioSource.slice(0, nextSection);
  const rows = scenarioSection
    .split(/\r?\n/u)
    .filter(
      (line) => line.trim().startsWith("|") && !/^\|\s*-{3,}/u.test(line.trim())
    )
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim())
    );

  if (rows.length < 2) {
    throw new Error(`T05.7 ${label} migration ledger has no scenario rows`);
  }

  const dataRows = rows.slice(1);
  for (const [index, row] of dataRows.entries()) {
    if (
      row.length < 4 ||
      row.slice(0, 4).some((cell) => cell.length === 0) ||
      !/(?<stage>Worker Contract|Browser Acceptance|Responsive UI Matrix)/u.test(
        row[2] ?? ""
      )
    ) {
      throw new Error(
        `T05.7 ${label} migration ledger row ${index + 1} is incomplete`
      );
    }
  }

  return dataRows;
}

function assertLedgerMappings(
  source: string,
  label: string,
  mappings: readonly string[]
): number {
  const rows = ledgerRows(source, label);
  for (const mapping of mappings) {
    if (!source.includes(mapping)) {
      throw new Error(
        `T05.7 ${label} migration ledger is missing executable mapping ${mapping}`
      );
    }
  }
  return rows.length;
}

export function assertMigrationLedgersComplete(
  participantSource: string,
  managementSource: string
): MigrationLedgerSummary {
  const participantRows = assertLedgerMappings(
    participantSource,
    "participant",
    [
      "web/lib/programs/programs-contract.test.ts",
      "tests/e2e/programs-participant-acceptance.test.ts",
      "tests/e2e/programs-responsive-matrix.test.ts",
    ]
  );
  const managementRows = assertLedgerMappings(managementSource, "management", [
    "web/lib/programs/programs-contract.test.ts",
    "tests/e2e/programs-management-acceptance.test.ts",
    "tests/e2e/programs-responsive-matrix.test.ts",
  ]);

  return {
    participantRows,
    managementRows,
    executableMappings: [
      "web/lib/programs/programs-contract.test.ts",
      "tests/e2e/programs-participant-acceptance.test.ts",
      "tests/e2e/programs-management-acceptance.test.ts",
      "tests/e2e/programs-responsive-matrix.test.ts",
    ],
  };
}

interface AcceptanceParityMapping {
  oldId: string;
  oldTitle: string;
  replacementTest: string;
  replacementFile: string;
  evidenceLevel?: "worker-d1" | "presentation-only";
}

function assertExactParityMappings(
  value: unknown,
  expectedMappings: readonly AcceptanceParityMapping[],
  label: string
): void {
  if (!Array.isArray(value)) {
    throw new TypeError(`Promotion manifest is missing the ${label} mappings`);
  }
  if (value.length !== expectedMappings.length) {
    throw new Error(
      `${label} mapping count mismatch: got=${value.length}, expected=${expectedMappings.length}`
    );
  }

  const expectedById = new Map(
    expectedMappings.map((mapping) => [mapping.oldId, mapping])
  );
  const seenIds = new Set<string>();
  const seenTests = new Set<string>();
  for (const item of value) {
    const mapping = asRecord(item);
    if (mapping === null) {
      throw new TypeError(`${label} mappings must be objects`);
    }
    const { oldId, oldTitle, replacementTest, replacementFile } = mapping;
    if (
      typeof oldId !== "string" ||
      typeof oldTitle !== "string" ||
      typeof replacementTest !== "string" ||
      typeof replacementFile !== "string"
    ) {
      throw new TypeError(
        `${label} mappings must name an old ID, test, and file`
      );
    }
    const expected = expectedById.get(oldId);
    if (!expected) {
      throw new Error(`${label} mapping contains unrecognized old ID ${oldId}`);
    }
    if (
      Object.keys(mapping).sort().join(",") !==
      Object.keys(expected).sort().join(",")
    ) {
      throw new Error(`${label} mapping ${oldId} has unrecognized fields`);
    }
    if (seenIds.has(oldId)) {
      throw new Error(`${label} mapping duplicates old ID ${oldId}`);
    }
    if (seenTests.has(replacementTest)) {
      throw new Error(
        `${label} mapping duplicates replacement test ${replacementTest}`
      );
    }
    seenIds.add(oldId);
    seenTests.add(replacementTest);
    if (
      replacementTest !== expected.replacementTest ||
      oldTitle !== expected.oldTitle ||
      replacementFile !== expected.replacementFile ||
      mapping.evidenceLevel !== expected.evidenceLevel
    ) {
      throw new Error(
        `${label} mapping ${oldId} does not match its approved replacement`
      );
    }
  }

  const missing = expectedMappings.find(({ oldId }) => !seenIds.has(oldId));
  if (missing) {
    throw new Error(`${label} mapping is missing old ID ${missing.oldId}`);
  }
}

export function assertHomeParityMappings(value: unknown): void {
  assertExactParityMappings(
    value,
    PUI05_HOME_ACCEPTANCE_MAPPINGS,
    "PUI-05 Home"
  );
}

export function assertFeedParityMappings(value: unknown): void {
  assertExactParityMappings(
    value,
    PROGRAMS_FEED_ACCEPTANCE_MAPPINGS,
    "Programs feed"
  );
}

export function assertProgramsNavigationParityMappings(value: unknown): void {
  assertExactParityMappings(
    value,
    PROGRAMS_NAVIGATION_PARITY_MAPPINGS,
    "Programs navigation"
  );
}

export function assertProgramsManagementParityMappings(value: unknown): void {
  assertExactParityMappings(
    value,
    PROGRAMS_MANAGEMENT_PARITY_MAPPINGS,
    "Programs management"
  );
}

export function assertProgramsParticipantParityMappings(value: unknown): void {
  assertExactParityMappings(
    value,
    PROGRAMS_PARTICIPANT_PARITY_MAPPINGS,
    "Programs participant"
  );
}

export function assertProgramsResponsiveParityMappings(value: unknown): void {
  assertExactParityMappings(
    value,
    PROGRAMS_RESPONSIVE_PARITY_MAPPINGS,
    "Programs responsive"
  );
}

function playwrightSpecs(
  report: unknown
): { title: string; file: string; projectName: string | null }[] {
  const root = asRecord(report);
  const found: { title: string; file: string; projectName: string | null }[] =
    [];
  const visit = (suiteValue: unknown, inheritedFile = ""): void => {
    const suite = asRecord(suiteValue);
    if (!suite) {
      return;
    }
    const file = typeof suite.file === "string" ? suite.file : inheritedFile;
    if (Array.isArray(suite.specs)) {
      for (const specValue of suite.specs) {
        const spec = asRecord(specValue);
        if (typeof spec?.title === "string") {
          const test = Array.isArray(spec.tests)
            ? asRecord(spec.tests[0])
            : null;
          found.push({
            title: spec.title,
            file: typeof spec.file === "string" ? spec.file : file,
            projectName:
              typeof test?.projectName === "string" ? test.projectName : null,
          });
        }
      }
    }
    if (Array.isArray(suite.suites)) {
      for (const child of suite.suites) {
        visit(child, file);
      }
    }
  };
  if (Array.isArray(root?.suites)) {
    for (const suite of root.suites) {
      visit(suite);
    }
  }
  return found;
}

function hasExactHomeParityMappings(value: unknown): boolean {
  try {
    assertHomeParityMappings(value);
    return true;
  } catch {
    return false;
  }
}

function hasExactFeedParityMappings(value: unknown): boolean {
  try {
    assertFeedParityMappings(value);
    return true;
  } catch {
    return false;
  }
}

function hasExactProgramsNavigationParityMappings(value: unknown): boolean {
  try {
    assertProgramsNavigationParityMappings(value);
    return true;
  } catch {
    return false;
  }
}

function hasExactProgramsManagementParityMappings(value: unknown): boolean {
  try {
    assertProgramsManagementParityMappings(value);
    return true;
  } catch {
    return false;
  }
}

function hasExactProgramsParticipantParityMappings(value: unknown): boolean {
  try {
    assertProgramsParticipantParityMappings(value);
    return true;
  } catch {
    return false;
  }
}

function hasExactProgramsResponsiveParityMappings(value: unknown): boolean {
  try {
    assertProgramsResponsiveParityMappings(value);
    return true;
  } catch {
    return false;
  }
}

function hasB003Disclosure(manifest: JsonRecord | null): boolean {
  const riskDisclosure = asRecord(manifest?.riskDisclosure);
  const diagnostic = asRecord(asRecord(manifest?.diagnostic)?.runtimeCanary);
  return (
    riskDisclosure?.id === B003_RESIDUAL_RISK.id &&
    riskDisclosure.status === B003_RESIDUAL_RISK.status &&
    riskDisclosure.disposition === B003_RESIDUAL_RISK.disposition &&
    riskDisclosure.scope === B003_RESIDUAL_RISK.scope &&
    riskDisclosure.ownerApprovalReference ===
      B003_RESIDUAL_RISK.ownerApprovalReference &&
    riskDisclosure.diagnosticCommand === B003_RESIDUAL_RISK.diagnosticCommand &&
    diagnostic?.command === B003_RESIDUAL_RISK.diagnosticCommand &&
    ["passed", "failed", "not_run"].includes(String(diagnostic?.status)) &&
    typeof diagnostic?.revision === "string" &&
    (diagnostic.status === "not_run"
      ? diagnostic.artifact === null
      : typeof diagnostic.artifact === "string")
  );
}

function hasCompleteMigrationLedger(manifest: JsonRecord | null): boolean {
  const migrationLedger = asRecord(manifest?.migrationLedger);
  const executableMappings = Array.isArray(migrationLedger?.executableMappings)
    ? migrationLedger.executableMappings.filter(
        (mapping): mapping is string => typeof mapping === "string"
      )
    : [];
  return (
    typeof migrationLedger?.participantRows === "number" &&
    Number.isInteger(migrationLedger.participantRows) &&
    migrationLedger.participantRows > 0 &&
    typeof migrationLedger?.managementRows === "number" &&
    Number.isInteger(migrationLedger.managementRows) &&
    migrationLedger.managementRows > 0 &&
    Array.isArray(migrationLedger?.executableMappings) &&
    [
      "web/lib/programs/programs-contract.test.ts",
      "tests/e2e/programs-participant-acceptance.test.ts",
      "tests/e2e/programs-management-acceptance.test.ts",
      "tests/e2e/programs-responsive-matrix.test.ts",
    ].every((mapping) => executableMappings.includes(mapping))
  );
}

function hasPassedStages(manifest: JsonRecord | null): boolean {
  const stageResults = Array.isArray(manifest?.stageResults)
    ? manifest.stageResults
        .map(asRecord)
        .filter((result): result is JsonRecord => result !== null)
    : [];
  return PROMOTION_STAGES.every(({ name }) =>
    stageResults.some(
      (result) => result.name === name && result.status === "passed"
    )
  );
}

export function isFunctionalPromotionManifest(value: unknown): boolean {
  const manifest = asRecord(value);
  return (
    manifest?.status === "functional-passed" &&
    hasExactHomeParityMappings(manifest?.homeParityMappings) &&
    hasExactFeedParityMappings(manifest?.feedParityMappings) &&
    hasExactProgramsNavigationParityMappings(
      manifest?.programsNavigationParityMappings
    ) &&
    hasExactProgramsManagementParityMappings(
      manifest?.programsManagementParityMappings
    ) &&
    hasExactProgramsParticipantParityMappings(
      manifest?.programsParticipantParityMappings
    ) &&
    hasExactProgramsResponsiveParityMappings(
      manifest?.programsResponsiveParityMappings
    ) &&
    hasB003Disclosure(manifest) &&
    hasCompleteMigrationLedger(manifest) &&
    hasPassedStages(manifest)
  );
}

function reportStatuses(
  report: unknown
): { status: string; retry: number | null }[] {
  const root = asRecord(report);
  const found: { status: string; retry: number | null }[] = [];
  const visit = (suites: unknown): void => {
    if (!Array.isArray(suites)) {
      return;
    }
    for (const suiteValue of suites) {
      const suite = asRecord(suiteValue);
      if (!suite) {
        continue;
      }
      if (Array.isArray(suite.specs)) {
        for (const specValue of suite.specs) {
          const spec = asRecord(specValue);
          if (!Array.isArray(spec?.tests)) {
            continue;
          }
          for (const testValue of spec.tests) {
            const test = asRecord(testValue);
            if (!Array.isArray(test?.results)) {
              continue;
            }
            for (const resultValue of test.results) {
              const result = asRecord(resultValue);
              if (!result) {
                continue;
              }
              found.push({
                status: typeof result.status === "string" ? result.status : "",
                retry: numberField(result, "retry"),
              });
            }
          }
        }
      }
      visit(suite.suites);
    }
  };
  visit(root?.suites);
  return found;
}

export function assertPlaywrightReportGreen(
  report: unknown,
  expectedTests: number
): void {
  const stats = asRecord(asRecord(report)?.stats);
  const expected = numberField(stats, "expected");
  const skipped = numberField(stats, "skipped");
  const unexpected = numberField(stats, "unexpected");
  const flaky = numberField(stats, "flaky");
  if (
    expected !== expectedTests ||
    skipped !== 0 ||
    unexpected !== 0 ||
    flaky !== 0
  ) {
    throw new Error(
      `Playwright report is not Green: expected=${String(expected)}, skipped=${String(skipped)}, unexpected=${String(unexpected)}, flaky=${String(flaky)}`
    );
  }
  const statuses = reportStatuses(report);
  if (statuses.length !== expectedTests) {
    throw new Error(
      `Playwright report result count mismatch: results=${statuses.length}, expected=${expectedTests}`
    );
  }
  const invalid = statuses.find(
    ({ status, retry }) => status !== "passed" || retry !== 0
  );
  if (invalid) {
    throw new Error(
      `Playwright report contains a non-zero retry or non-passed result: status=${invalid.status}, retry=${invalid.retry}`
    );
  }
}

function assertAcceptanceReportMatchesMappings(
  report: unknown,
  mappings: readonly AcceptanceParityMapping[],
  label: string
): void {
  assertPlaywrightReportGreen(report, mappings.length);
  const specs = playwrightSpecs(report);
  if (specs.length !== mappings.length) {
    throw new Error(
      `${label} report test count mismatch: got=${specs.length}, expected=${mappings.length}`
    );
  }
  const reportConfig = asRecord(asRecord(report)?.config);
  const rootDir = reportConfig?.rootDir;
  if (typeof rootDir !== "string") {
    throw new TypeError(`${label} report is missing Playwright rootDir`);
  }
  const reportRootDir = path.resolve(rootDir);
  const repositoryRelativeRoot = path
    .relative(REPO_ROOT, reportRootDir)
    .split(path.sep)
    .join("/");
  if (repositoryRelativeRoot !== "tests/e2e") {
    throw new Error(`${label} report has unexpected rootDir ${rootDir}`);
  }
  const expectedTests = new Map<string, string>(
    mappings.map((mapping) => [
      mapping.replacementTest,
      mapping.replacementFile,
    ])
  );
  const seen = new Set<string>();
  for (const spec of specs) {
    const expectedFile = expectedTests.get(spec.title);
    if (expectedFile === undefined) {
      throw new Error(
        `${label} report contains unrecognized test ${spec.title}`
      );
    }
    if (seen.has(spec.title)) {
      throw new Error(`${label} report duplicates test ${spec.title}`);
    }
    seen.add(spec.title);
    const reportedFile = path.resolve(
      reportRootDir,
      spec.file.replaceAll("\\", "/")
    );
    const pathFromRoot = path.relative(reportRootDir, reportedFile);
    if (
      pathFromRoot === ".." ||
      pathFromRoot.startsWith(`..${path.sep}`) ||
      path.isAbsolute(pathFromRoot)
    ) {
      throw new Error(
        `${label} report test ${spec.title} escapes Playwright rootDir`
      );
    }
    const normalizedFile = path
      .relative(REPO_ROOT, reportedFile)
      .split(path.sep)
      .join("/");
    if (normalizedFile !== expectedFile) {
      throw new Error(
        `${label} report test ${spec.title} came from ${spec.file}`
      );
    }
  }
  const missing = mappings.find(
    ({ replacementTest }) => !seen.has(replacementTest)
  );
  if (missing) {
    throw new Error(
      `${label} report is missing replacement test ${missing.replacementTest}`
    );
  }
}

export function assertHomeAcceptanceReportMatchesMappings(
  report: unknown
): void {
  assertAcceptanceReportMatchesMappings(
    report,
    PUI05_HOME_ACCEPTANCE_MAPPINGS,
    "PUI-05 Home"
  );
}

export function assertFeedAcceptanceReportMatchesMappings(
  report: unknown
): void {
  assertAcceptanceReportMatchesMappings(
    report,
    PROGRAMS_FEED_ACCEPTANCE_MAPPINGS,
    "Programs feed"
  );
}

function assertMappedTestsInProjects(
  report: unknown,
  mappings: readonly AcceptanceParityMapping[],
  projectsForMapping: (mapping: AcceptanceParityMapping) => readonly string[],
  label: string
): void {
  const reportConfig = asRecord(asRecord(report)?.config);
  const rootDir = reportConfig?.rootDir;
  if (typeof rootDir !== "string") {
    throw new TypeError(`${label} report is missing Playwright rootDir`);
  }
  const reportRootDir = path.resolve(rootDir);
  const repositoryRelativeRoot = path
    .relative(REPO_ROOT, reportRootDir)
    .split(path.sep)
    .join("/");
  if (repositoryRelativeRoot !== "tests/e2e") {
    throw new Error(`${label} report has unexpected rootDir ${rootDir}`);
  }

  const specs = playwrightSpecs(report);
  for (const mapping of mappings) {
    for (const projectName of projectsForMapping(mapping)) {
      const matches = specs.filter(
        (spec) =>
          spec.title === mapping.replacementTest &&
          spec.projectName === projectName
      );
      if (matches.length !== 1) {
        throw new Error(
          `${label} report must contain ${mapping.replacementTest} once in ${projectName}; got=${matches.length}`
        );
      }
      const [spec] = matches;
      if (!spec) {
        throw new Error(
          `${label} report is missing ${mapping.replacementTest}`
        );
      }
      const reportedFile = path.resolve(
        reportRootDir,
        spec.file.replaceAll("\\", "/")
      );
      const pathFromRoot = path.relative(reportRootDir, reportedFile);
      if (
        pathFromRoot === ".." ||
        pathFromRoot.startsWith(`..${path.sep}`) ||
        path.isAbsolute(pathFromRoot)
      ) {
        throw new Error(
          `${label} report test ${mapping.replacementTest} escapes Playwright rootDir`
        );
      }
      const normalizedFile = path
        .relative(REPO_ROOT, reportedFile)
        .split(path.sep)
        .join("/");
      if (normalizedFile !== mapping.replacementFile) {
        throw new Error(
          `${label} report test ${mapping.replacementTest} came from ${spec.file}`
        );
      }
    }
  }
}

export function assertProgramsParticipantBrowserReportMatchesMappings(
  report: unknown
): void {
  assertPlaywrightReportGreen(report, PROGRAMS_BROWSER_EXPECTED_TESTS);
  assertMappedTestsInProjects(
    report,
    PROGRAMS_PARTICIPANT_PARITY_MAPPINGS,
    () => ["phone-360", "phone-390", "phone-402"],
    "Programs participant"
  );
}

export function assertProgramsResponsiveReportMatchesMappings(
  report: unknown
): void {
  assertPlaywrightReportGreen(report, PROGRAMS_RESPONSIVE_EXPECTED_TESTS);
  const responsiveProjects = [
    "phone-320",
    "phone-360",
    "phone-390",
    "phone-402",
    "phone-600",
    "phone-799",
    "desktop-800",
    "desktop-1024",
    "desktop-1440",
  ];
  assertMappedTestsInProjects(
    report,
    PROGRAMS_RESPONSIVE_PARITY_MAPPINGS,
    ({ oldId }) =>
      oldId === "programs-d1:9" ? ["phone-320"] : responsiveProjects,
    "Programs responsive"
  );
}

export function assertProgramsNavigationBrowserReportMatchesMappings(
  report: unknown
): void {
  assertPlaywrightReportGreen(report, PROGRAMS_BROWSER_EXPECTED_TESTS);
  const specs = playwrightSpecs(report);
  if (specs.length !== PROGRAMS_BROWSER_EXPECTED_TESTS) {
    throw new Error(
      `Programs navigation report test count mismatch: got=${specs.length}, expected=${PROGRAMS_BROWSER_EXPECTED_TESTS}`
    );
  }
  const reportConfig = asRecord(asRecord(report)?.config);
  const rootDir = reportConfig?.rootDir;
  if (typeof rootDir !== "string") {
    throw new TypeError(
      "Programs navigation report is missing Playwright rootDir"
    );
  }
  const reportRootDir = path.resolve(rootDir);
  const repositoryRelativeRoot = path
    .relative(REPO_ROOT, reportRootDir)
    .split(path.sep)
    .join("/");
  if (repositoryRelativeRoot !== "tests/e2e") {
    throw new Error(
      `Programs navigation report has unexpected rootDir ${rootDir}`
    );
  }
  const expectedTests = new Map<string, string>(
    PROGRAMS_NAVIGATION_PARITY_MAPPINGS.map((mapping) => [
      mapping.replacementTest,
      mapping.replacementFile,
    ])
  );
  const seen = new Map<string, number>();
  for (const spec of specs) {
    const expectedFile = expectedTests.get(spec.title);
    if (expectedFile === undefined) {
      continue;
    }
    if (spec.projectName !== "phone-390") {
      throw new Error(
        `Programs navigation report test ${spec.title} ran in unexpected Browser project ${String(spec.projectName)}`
      );
    }
    const reportedFile = path.resolve(
      reportRootDir,
      spec.file.replaceAll("\\", "/")
    );
    const pathFromRoot = path.relative(reportRootDir, reportedFile);
    if (
      pathFromRoot === ".." ||
      pathFromRoot.startsWith(`..${path.sep}`) ||
      path.isAbsolute(pathFromRoot)
    ) {
      throw new Error(
        `Programs navigation report test ${spec.title} escapes Playwright rootDir`
      );
    }
    const normalizedFile = path
      .relative(REPO_ROOT, reportedFile)
      .split(path.sep)
      .join("/");
    if (normalizedFile !== expectedFile) {
      throw new Error(
        `Programs navigation report test ${spec.title} came from ${spec.file}`
      );
    }
    seen.set(spec.title, (seen.get(spec.title) ?? 0) + 1);
  }
  for (const { replacementTest } of PROGRAMS_NAVIGATION_PARITY_MAPPINGS) {
    const count = seen.get(replacementTest) ?? 0;
    if (count !== 1) {
      throw new Error(
        `Programs navigation report must contain ${replacementTest} once in phone-390; got=${count}`
      );
    }
  }
}

export function assertProgramsManagementBrowserReportMatchesMappings(
  report: unknown
): void {
  assertPlaywrightReportGreen(report, PROGRAMS_BROWSER_EXPECTED_TESTS);
  const specs = playwrightSpecs(report);
  if (specs.length !== PROGRAMS_BROWSER_EXPECTED_TESTS) {
    throw new Error(
      `Programs management report test count mismatch: got=${specs.length}, expected=${PROGRAMS_BROWSER_EXPECTED_TESTS}`
    );
  }
  const reportConfig = asRecord(asRecord(report)?.config);
  const rootDir = reportConfig?.rootDir;
  if (typeof rootDir !== "string") {
    throw new TypeError(
      "Programs management report is missing Playwright rootDir"
    );
  }
  const reportRootDir = path.resolve(rootDir);
  const repositoryRelativeRoot = path
    .relative(REPO_ROOT, reportRootDir)
    .split(path.sep)
    .join("/");
  if (repositoryRelativeRoot !== "tests/e2e") {
    throw new Error(
      `Programs management report has unexpected rootDir ${rootDir}`
    );
  }
  const browserMappings = PROGRAMS_MANAGEMENT_PARITY_MAPPINGS.filter(
    ({ replacementFile }) =>
      replacementFile === "tests/e2e/programs-management-acceptance.test.ts"
  );
  const expectedTests = new Map<string, string>(
    browserMappings.map((mapping) => [
      mapping.replacementTest,
      mapping.replacementFile,
    ])
  );
  const projects = ["phone-390"];
  const seen = new Set<string>();
  for (const spec of specs) {
    const expectedFile = expectedTests.get(spec.title);
    if (expectedFile === undefined) {
      continue;
    }
    if (!projects.includes(spec.projectName ?? "")) {
      throw new Error(
        `Programs management report test ${spec.title} ran in unexpected Browser project ${String(spec.projectName)}`
      );
    }
    const reportedFile = path.resolve(
      reportRootDir,
      spec.file.replaceAll("\\", "/")
    );
    const pathFromRoot = path.relative(reportRootDir, reportedFile);
    if (
      pathFromRoot === ".." ||
      pathFromRoot.startsWith(`..${path.sep}`) ||
      path.isAbsolute(pathFromRoot)
    ) {
      throw new Error(
        `Programs management report test ${spec.title} escapes Playwright rootDir`
      );
    }
    const normalizedFile = path
      .relative(REPO_ROOT, reportedFile)
      .split(path.sep)
      .join("/");
    if (normalizedFile !== expectedFile) {
      throw new Error(
        `Programs management report test ${spec.title} came from ${spec.file}`
      );
    }
    const key = `${spec.title}\u0000${spec.projectName}`;
    if (seen.has(key)) {
      throw new Error(
        `Programs management report duplicates ${spec.title} in ${spec.projectName}`
      );
    }
    seen.add(key);
  }
  for (const { replacementTest } of browserMappings) {
    for (const project of projects) {
      if (!seen.has(`${replacementTest}\u0000${project}`)) {
        throw new Error(
          `Programs management report must contain ${replacementTest} once in ${project}`
        );
      }
    }
  }
}

export function isCleanWorktreeStatus(status: string): boolean {
  return status.trim() === "";
}

export function assertLocalPromotionTarget(raw: string): URL {
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    throw new Error(
      "T05.7 canonical promotion requires a loopback HTTP target"
    );
  }
  if (
    target.protocol !== "http:" ||
    target.username ||
    target.password ||
    !["localhost", "127.0.0.1"].includes(target.hostname)
  ) {
    throw new Error(
      "T05.7 canonical promotion requires a loopback HTTP target; deployed targets are diagnostic-only"
    );
  }
  return target;
}

function isLocalAcceptanceRunGreen(
  value: unknown,
  expectedRevision: string,
  expectedReportPath: string,
  expectedPromotionRunId: string,
  expectedSuite: string,
  expectedLayer: string
): boolean {
  const manifest = asRecord(value);
  if (
    manifest?.status !== "passed" ||
    manifest.runtime !== "wrangler-dev-local" ||
    manifest.config !== "web/wrangler.jsonc" ||
    manifest.suite !== expectedSuite ||
    manifest.revision !== expectedRevision ||
    manifest.layer !== expectedLayer ||
    manifest.retries !== 0 ||
    manifest.reportPath !== expectedReportPath ||
    manifest.promotionRunId !== expectedPromotionRunId ||
    typeof manifest.target !== "string"
  ) {
    return false;
  }
  try {
    assertLocalPromotionTarget(manifest.target);
  } catch {
    return false;
  }
  return true;
}

export function isBrowserAcceptanceRunGreen(
  value: unknown,
  expectedRevision: string,
  expectedReportPath: string,
  expectedPromotionRunId: string
): boolean {
  return isLocalAcceptanceRunGreen(
    value,
    expectedRevision,
    expectedReportPath,
    expectedPromotionRunId,
    "tests/e2e/programs-participant-acceptance.config.ts",
    "browser-acceptance"
  );
}

export function isResponsiveAcceptanceRunGreen(
  value: unknown,
  expectedRevision: string,
  expectedReportPath: string,
  expectedPromotionRunId: string
): boolean {
  return isLocalAcceptanceRunGreen(
    value,
    expectedRevision,
    expectedReportPath,
    expectedPromotionRunId,
    "tests/e2e/programs-responsive-matrix.config.ts",
    "responsive-matrix"
  );
}

export function isHomeAcceptanceRunGreen(
  value: unknown,
  expectedRevision: string,
  expectedReportPath: string,
  expectedPromotionRunId: string
): boolean {
  return isLocalAcceptanceRunGreen(
    value,
    expectedRevision,
    expectedReportPath,
    expectedPromotionRunId,
    "tests/e2e/programs-home-acceptance.config.ts",
    "home-browser-acceptance"
  );
}

export function isFeedAcceptanceRunGreen(
  value: unknown,
  expectedRevision: string,
  expectedReportPath: string,
  expectedPromotionRunId: string
): boolean {
  return isLocalAcceptanceRunGreen(
    value,
    expectedRevision,
    expectedReportPath,
    expectedPromotionRunId,
    "tests/e2e/programs-feed-acceptance.config.ts",
    "feed-browser-acceptance"
  );
}

function runId(): string {
  return new Date()
    .toISOString()
    .replaceAll(/[^0-9a-z]/giu, "")
    .toLowerCase();
}

async function writeJson(filename: string, value: unknown): Promise<void> {
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

async function currentRevision(): Promise<string> {
  const result = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: REPO_ROOT,
  });
  return result.stdout.trim();
}

async function readReport(filename: string): Promise<unknown> {
  return JSON.parse(await readFile(filename, "utf-8"));
}

export function stageArtifactPath(
  stage: PromotionStage,
  artifactDirectory: string
): string {
  if (stage.name === "runtime-canary") {
    return path.join(artifactDirectory, "runtime-canary");
  }
  if (stage.report !== undefined) {
    return path.join(artifactDirectory, stage.report);
  }
  return path.join(artifactDirectory, `${stage.name}.log`);
}

function timestamp(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasCanaryIdentity(
  manifest: JsonRecord | null,
  expectedRevision: string
): boolean {
  return (
    manifest?.status === "passed" &&
    manifest.revision === expectedRevision &&
    manifest.runtime === "wrangler-dev-local" &&
    manifest.config === "web/wrangler.jsonc" &&
    manifest.windowMs === EXPECTED_CANARY_WINDOW_MS &&
    manifest.retries === EXPECTED_CANARY_RETRIES
  );
}

function hasCanaryWindow(manifest: JsonRecord | null): boolean {
  const setupStartedAt = timestamp(manifest?.setupStartedAt);
  const startedAt = timestamp(manifest?.startedAt);
  const finishedAt = timestamp(manifest?.finishedAt);
  return (
    setupStartedAt !== null &&
    startedAt !== null &&
    finishedAt !== null &&
    setupStartedAt <= startedAt &&
    finishedAt - startedAt >= EXPECTED_CANARY_WINDOW_MS
  );
}

function hasNoCanaryFailures(manifest: JsonRecord | null): boolean {
  return Array.isArray(manifest?.failures) && manifest.failures.length === 0;
}

function hasCompletedCanaryScenario(manifest: JsonRecord | null): boolean {
  const scenariosCompleted = manifest?.scenariosCompleted;
  return (
    typeof scenariosCompleted === "number" &&
    Number.isInteger(scenariosCompleted) &&
    scenariosCompleted > 0
  );
}

export function isCanaryArtifactGreen(
  manifest: JsonRecord | null,
  expectedRevision: string
): boolean {
  return (
    hasCanaryIdentity(manifest, expectedRevision) &&
    hasCanaryWindow(manifest) &&
    hasNoCanaryFailures(manifest) &&
    hasCompletedCanaryScenario(manifest)
  );
}

async function readCanaryRun(filename: string): Promise<JsonRecord | null> {
  try {
    return asRecord(JSON.parse(await readFile(filename, "utf-8")));
  } catch {
    return null;
  }
}

function commandOutput(error: unknown): string {
  const record = asRecord(error);
  return `${typeof record?.stdout === "string" ? record.stdout : ""}${typeof record?.stderr === "string" ? record.stderr : ""}`;
}

async function readCanaryDiagnostic(expectedRevision: string): Promise<{
  command: string;
  status: "passed" | "failed" | "not_run";
  revision: string;
  artifact: string | null;
}> {
  const filename = process.env.PROGRAMS_CANARY_RUN_FILE;
  if (filename === undefined) {
    return {
      command: B003_RESIDUAL_RISK.diagnosticCommand,
      status: "not_run",
      revision: expectedRevision,
      artifact: null,
    };
  }

  const resolvedFilename = path.resolve(REPO_ROOT, filename);
  const canary = await readCanaryRun(resolvedFilename);
  const status = canary?.status;
  const revision = canary?.revision;
  if (
    (status !== "passed" && status !== "failed" && status !== "not_run") ||
    typeof revision !== "string"
  ) {
    throw new Error(
      `T05.7 referenced canary diagnostic is invalid or missing revision: ${filename}`
    );
  }

  return {
    command: B003_RESIDUAL_RISK.diagnosticCommand,
    status,
    revision,
    artifact: path.relative(REPO_ROOT, resolvedFilename),
  };
}

async function runStage(
  stage: PromotionStage,
  artifactDirectory: string
): Promise<string[]> {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    PROGRAMS_PROMOTION_RUN_ID: path.basename(artifactDirectory),
  };
  const stageArtifact = stageArtifactPath(stage, artifactDirectory);
  const stageLog = path.join(artifactDirectory, `${stage.name}.log`);
  if (stage.name === "browser-acceptance") {
    environment.PROGRAMS_BROWSER_RESULTS_FILE = path.join(
      artifactDirectory,
      stage.report ?? "browser-results.json"
    );
    environment.PROGRAMS_BROWSER_ARTIFACT_DIRECTORY = path.join(
      artifactDirectory,
      "browser-acceptance"
    );
  }
  if (stage.name === "responsive-matrix") {
    environment.PROGRAMS_RESPONSIVE_RESULTS_FILE = path.join(
      artifactDirectory,
      stage.report ?? "responsive-results.json"
    );
    environment.PROGRAMS_RESPONSIVE_ARTIFACT_DIRECTORY = path.join(
      artifactDirectory,
      "responsive-matrix"
    );
  }
  if (stage.name === "home-browser-acceptance") {
    environment.PROGRAMS_HOME_RESULTS_FILE = path.join(
      artifactDirectory,
      stage.report ?? "home-results.json"
    );
    environment.PROGRAMS_HOME_ARTIFACT_DIRECTORY = path.join(
      artifactDirectory,
      "home-browser-acceptance"
    );
  }
  if (stage.name === "feed-browser-acceptance") {
    environment.PROGRAMS_FEED_RESULTS_FILE = path.join(
      artifactDirectory,
      stage.report ?? "feed-results.json"
    );
    environment.PROGRAMS_FEED_ARTIFACT_DIRECTORY = path.join(
      artifactDirectory,
      "feed-browser-acceptance"
    );
  }
  if (stage.name === "runtime-canary") {
    environment.PROGRAMS_CANARY_ARTIFACT_DIRECTORY = stageArtifact;
  }
  console.log(`T05.7 ${stage.name} started`);
  try {
    const result = await execFileAsync("pnpm", [...stage.args], {
      cwd: REPO_ROOT,
      env: environment,
      maxBuffer: 16 * 1024 * 1024,
    });
    await writeFile(stageLog, `${result.stdout}${result.stderr}`, "utf-8");
  } catch (error) {
    await writeFile(stageLog, commandOutput(error), "utf-8");
    throw new Error(
      `T05.7 ${stage.name} failed; see ${path.relative(REPO_ROOT, path.join(artifactDirectory, `${stage.name}.log`))}`,
      { cause: error }
    );
  }
  if (stage.report && stage.expectedTests !== undefined) {
    const reportPath = path.join(artifactDirectory, stage.report);
    try {
      const report = await readReport(reportPath);
      assertPlaywrightReportGreen(report, stage.expectedTests);
      if (stage.name === "browser-acceptance") {
        assertProgramsParticipantBrowserReportMatchesMappings(report);
        assertProgramsNavigationBrowserReportMatchesMappings(report);
        assertProgramsManagementBrowserReportMatchesMappings(report);
      }
      if (stage.name === "responsive-matrix") {
        assertProgramsResponsiveReportMatchesMappings(report);
      }
      if (
        stage.name === "browser-acceptance" ||
        stage.name === "responsive-matrix"
      ) {
        const isResponsive = stage.name === "responsive-matrix";
        const runManifestPath = path.join(
          artifactDirectory,
          isResponsive ? "responsive-matrix" : "browser-acceptance",
          "run.json"
        );
        const runManifest = await readReport(runManifestPath);
        const runManifestGreen = isResponsive
          ? isResponsiveAcceptanceRunGreen(
              runManifest,
              await currentRevision(),
              path.relative(REPO_ROOT, reportPath),
              path.basename(artifactDirectory)
            )
          : isBrowserAcceptanceRunGreen(
              runManifest,
              await currentRevision(),
              path.relative(REPO_ROOT, reportPath),
              path.basename(artifactDirectory)
            );
        if (!runManifestGreen) {
          throw new Error(
            `${isResponsive ? "Responsive" : "Browser"} acceptance run manifest is missing or not pinned to ${path.basename(artifactDirectory)}`
          );
        }
      }
      if (
        stage.name === "home-browser-acceptance" ||
        stage.name === "feed-browser-acceptance"
      ) {
        const isFeed = stage.name === "feed-browser-acceptance";
        if (isFeed) {
          assertFeedAcceptanceReportMatchesMappings(report);
        } else {
          assertHomeAcceptanceReportMatchesMappings(report);
        }
        const runManifestPath = path.join(
          artifactDirectory,
          isFeed ? "feed-browser-acceptance" : "home-browser-acceptance",
          "run.json"
        );
        const runManifestGreen = isFeed
          ? isFeedAcceptanceRunGreen(
              await readReport(runManifestPath),
              await currentRevision(),
              path.relative(REPO_ROOT, reportPath),
              path.basename(artifactDirectory)
            )
          : isHomeAcceptanceRunGreen(
              await readReport(runManifestPath),
              await currentRevision(),
              path.relative(REPO_ROOT, reportPath),
              path.basename(artifactDirectory)
            );
        if (!runManifestGreen) {
          throw new Error(
            `${isFeed ? "Feed" : "Home"} acceptance run manifest is missing or not pinned to ${path.basename(artifactDirectory)}`
          );
        }
      }
    } catch (error) {
      throw new Error(
        `T05.7 ${stage.name} report failed Green validation: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }
  if (stage.name === "runtime-canary") {
    const canaryManifestPath = path.join(stageArtifact, "run.json");
    const canary = await readCanaryRun(canaryManifestPath);
    if (
      canary === null ||
      !isCanaryArtifactGreen(canary, await currentRevision())
    ) {
      throw new Error(
        `T05.7 runtime-canary did not leave a passed current-run five-minute artifact at ${path.relative(REPO_ROOT, canaryManifestPath)}`
      );
    }
  }
  console.log(`T05.7 ${stage.name} passed`);
  return [
    ...new Set(
      [
        stageArtifact,
        stageLog,
        ...(stage.name === "home-browser-acceptance"
          ? [
              path.join(
                artifactDirectory,
                "home-browser-acceptance",
                "run.json"
              ),
            ]
          : []),
        ...(stage.name === "feed-browser-acceptance"
          ? [
              path.join(
                artifactDirectory,
                "feed-browser-acceptance",
                "run.json"
              ),
            ]
          : []),
        ...(stage.name === "browser-acceptance"
          ? [path.join(artifactDirectory, "browser-acceptance", "run.json")]
          : []),
        ...(stage.name === "responsive-matrix"
          ? [path.join(artifactDirectory, "responsive-matrix", "run.json")]
          : []),
      ].map((filename) => path.relative(REPO_ROOT, filename))
    ),
  ];
}

interface PromotionManifest {
  stageResults: PromotionStageResult[];
  stages: string[];
}

async function runPromotionStage(
  stage: PromotionStage,
  artifactDirectory: string,
  promotionTarget: URL,
  manifest: Pick<PromotionManifest, "stageResults" | "stages">
): Promise<void> {
  const stageResult: PromotionStageResult = {
    name: stage.name,
    status: "running",
    artifacts: [
      path.relative(REPO_ROOT, stageArtifactPath(stage, artifactDirectory)),
      path.relative(
        REPO_ROOT,
        path.join(artifactDirectory, `${stage.name}.log`)
      ),
    ].filter((value, index, values) => values.indexOf(value) === index),
  };
  manifest.stageResults.push(stageResult);
  await writeJson(path.join(artifactDirectory, "promotion.json"), manifest);
  try {
    process.env.PROGRAMS_TARGET_URL = promotionTarget.origin;
    stageResult.artifacts = await runStage(stage, artifactDirectory);
    stageResult.status = "passed";
    manifest.stages.push(stage.name);
  } catch (error) {
    stageResult.status = "failed";
    stageResult.failure =
      error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    await writeJson(path.join(artifactDirectory, "promotion.json"), manifest);
  }
}

async function runPromotionStages(
  artifactDirectory: string,
  promotionTarget: URL,
  manifest: Pick<PromotionManifest, "stageResults" | "stages">
): Promise<void> {
  async function runAt(index: number): Promise<void> {
    const stage = PROMOTION_STAGES[index];
    if (stage === undefined) {
      return;
    }
    await runPromotionStage(
      stage,
      artifactDirectory,
      promotionTarget,
      manifest
    );
    await runAt(index + 1);
  }

  await runAt(0);
}

async function main(): Promise<void> {
  const artifactDirectory = path.join(
    REPO_ROOT,
    "test-results",
    "programs-promotion",
    runId()
  );
  await mkdir(artifactDirectory, { recursive: true });
  const revision = await currentRevision();
  const manifest: PromotionManifest & {
    schemaVersion: number;
    authority: string;
    runId: string;
    revision: string;
    status: string;
    startedAt: string;
    finishedAt?: string;
    stages: string[];
    stageResults: PromotionStageResult[];
    riskDisclosure: typeof B003_RESIDUAL_RISK;
    diagnostic: {
      runtimeCanary: {
        command: string;
        status: "passed" | "failed" | "not_run";
        revision: string;
        artifact: string | null;
      };
    };
    migrationLedger: MigrationLedgerSummary;
    homeParityMappings: typeof PUI05_HOME_ACCEPTANCE_MAPPINGS;
    feedParityMappings: typeof PROGRAMS_FEED_ACCEPTANCE_MAPPINGS;
    programsNavigationParityMappings: typeof PROGRAMS_NAVIGATION_PARITY_MAPPINGS;
    programsManagementParityMappings: typeof PROGRAMS_MANAGEMENT_PARITY_MAPPINGS;
    programsParticipantParityMappings: typeof PROGRAMS_PARTICIPANT_PARITY_MAPPINGS;
    programsResponsiveParityMappings: typeof PROGRAMS_RESPONSIVE_PARITY_MAPPINGS;
    failure?: string;
    artifacts: string;
  } = {
    schemaVersion: 1,
    authority:
      "T05.7 layered Programs finite promotion gate; sustained runtime canary is independent diagnostic evidence",
    runId: path.basename(artifactDirectory),
    revision,
    status: "running",
    startedAt: new Date().toISOString(),
    stages: [],
    stageResults: [],
    riskDisclosure: B003_RESIDUAL_RISK,
    diagnostic: {
      runtimeCanary: {
        command: B003_RESIDUAL_RISK.diagnosticCommand,
        status: "not_run",
        revision,
        artifact: null,
      },
    },
    migrationLedger: {
      participantRows: 0,
      managementRows: 0,
      executableMappings: [],
    },
    homeParityMappings: PUI05_HOME_ACCEPTANCE_MAPPINGS,
    feedParityMappings: PROGRAMS_FEED_ACCEPTANCE_MAPPINGS,
    programsNavigationParityMappings: PROGRAMS_NAVIGATION_PARITY_MAPPINGS,
    programsManagementParityMappings: PROGRAMS_MANAGEMENT_PARITY_MAPPINGS,
    programsParticipantParityMappings: PROGRAMS_PARTICIPANT_PARITY_MAPPINGS,
    programsResponsiveParityMappings: PROGRAMS_RESPONSIVE_PARITY_MAPPINGS,
    artifacts: path.relative(REPO_ROOT, artifactDirectory),
  };
  await writeJson(path.join(artifactDirectory, "promotion.json"), manifest);

  try {
    const promotionTarget = assertLocalPromotionTarget(
      process.env.PROGRAMS_TARGET_URL ?? "http://127.0.0.1:8787"
    );
    const status = await execFileAsync("git", ["status", "--porcelain"], {
      cwd: REPO_ROOT,
    });
    if (!isCleanWorktreeStatus(status.stdout)) {
      throw new Error(
        "T05.7 requires a clean worktree before promotion qualification"
      );
    }
    manifest.migrationLedger = assertMigrationLedgersComplete(
      await readFile(
        path.join(
          REPO_ROOT,
          "docs/implementation/t05-participant-migration-ledger.md"
        ),
        "utf-8"
      ),
      await readFile(
        path.join(
          REPO_ROOT,
          "docs/implementation/t05-management-migration-ledger.md"
        ),
        "utf-8"
      )
    );
    manifest.diagnostic.runtimeCanary = await readCanaryDiagnostic(revision);
    await writeJson(path.join(artifactDirectory, "promotion.json"), manifest);
    await runPromotionStages(artifactDirectory, promotionTarget, manifest);
    manifest.status = "functional-passed";
    if (!isFunctionalPromotionManifest(manifest)) {
      throw new Error(
        "T05.7 functional promotion is missing required finite-stage or B-003 risk evidence"
      );
    }
  } catch (error) {
    manifest.status = "failed";
    manifest.failure = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
    process.stderr.write(`${manifest.failure}\n`);
  } finally {
    const recordedStages = new Set(
      manifest.stageResults.map(({ name }) => name)
    );
    for (const stage of MANIFEST_STAGES) {
      if (recordedStages.has(stage.name)) {
        continue;
      }
      manifest.stageResults.push({
        name: stage.name,
        status: "not_run",
        artifacts: [
          path.relative(REPO_ROOT, stageArtifactPath(stage, artifactDirectory)),
          path.relative(
            REPO_ROOT,
            path.join(artifactDirectory, `${stage.name}.log`)
          ),
        ].filter((value, index, values) => values.indexOf(value) === index),
      });
    }
    manifest.finishedAt = new Date().toISOString();
    await writeJson(path.join(artifactDirectory, "promotion.json"), manifest);
    console.log(
      JSON.stringify({
        status: manifest.status,
        revision: manifest.revision,
        stages: manifest.stages,
        artifacts: manifest.artifacts,
      })
    );
  }
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === import.meta.filename
) {
  await main();
}
