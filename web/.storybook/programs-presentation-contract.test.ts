/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";

import type { ParticipantProgramDetail } from "@/lib/programs/program-api";

import {
  PROGRAMS_MATERIAL_SCENARIO_NAMES,
  getProgramsStoryScenario,
} from "./programs-fixtures";
import { assertProgramsScreen } from "./programs-presentation-contract";

const storyServer = setupServer();

beforeAll(() => {
  storyServer.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  storyServer.resetHandlers();
});

afterAll(() => {
  storyServer.close();
});

const readiness = {
  selector: "[data-program-name]",
  text: "門徒訓練基礎課",
};

const EXPECTED_PROGRAMS_MATERIAL_SCENARIO_NAMES = [
  "participant-directory-member",
  "participant-directory-capable",
  "participant-program-detail-active",
  "participant-program-detail-eligible",
  "participant-program-detail-pending",
  "participant-program-detail-rejected",
  "participant-event-detail-closed",
  "participant-event-detail-open",
  "participant-event-detail-ineligible",
  "management-directory-mixed",
  "workspace-overview-populated",
  "workspace-overview-zero",
  "workspace-events-mixed",
  "workspace-participants-pending",
  "workspace-settings-dirty",
  "workspace-settings-conflict",
  "workspace-schedule-focused",
  "workspace-schedule-stale",
  "workspace-schedule-partial-resume",
  "notifications-unread",
  "notifications-empty-recoverable",
] as const;

const REQUIRED_BEHAVIOR_PLAY_EXPORTS = [
  "ParticipantDirectoryCapable",
  "ParticipantProgramDetailEligible",
  "ParticipantProgramDetailActive",
  "ParticipantProgramDetailPending",
  "ParticipantProgramDetailRejected",
  "ParticipantEventDetailClosed",
  "ParticipantEventDetailOpen",
  "ParticipantEventDetailIneligible",
  "ManagementDirectoryMixed",
] as const;

const PARTICIPANT_MUTATION_SCENARIOS = [
  {
    scenario: "participant-program-detail-eligible",
    programId: "t07-3-eligible-program",
    mutationPath: "enrollment-requests",
    responseKey: "request",
    initialStatus: null,
    nextStatus: "Pending",
  },
  {
    scenario: "participant-program-detail-active",
    programId: "t07-3-program",
    mutationPath: "enrollments/t07-3-enrollment/cancel",
    responseKey: "enrollment",
    initialStatus: "Active",
    nextStatus: "Cancelled",
  },
  {
    scenario: "participant-program-detail-pending",
    programId: "t07-3-program",
    mutationPath: "enrollment-requests/t07-3-pending-request/withdraw",
    responseKey: "request",
    initialStatus: "Pending",
    nextStatus: "Withdrawn",
  },
  {
    scenario: "participant-program-detail-rejected",
    programId: "t07-3-program",
    mutationPath: "enrollment-requests",
    responseKey: "request",
    initialStatus: "Rejected",
    nextStatus: "Pending",
  },
] as const;

const participantDetail = async (
  programId: string
): Promise<ParticipantProgramDetail> => {
  const response = await fetch(
    `http://localhost/api/v1/programs/${programId}/participant-detail`
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    data: { detail: ParticipantProgramDetail };
  };
  return body.data.detail;
};

const participantStatuses = (detail: ParticipantProgramDetail) => [
  ...(detail.enrollment?.requests.map((request) => request.status) ?? []),
  ...(detail.enrollment?.enrollments.map((enrollment) => enrollment.status) ??
    []),
];

test("does not accept the shared AppShell main landmark as a settled Programs screen", async () => {
  document.body.innerHTML =
    '<main><section id="programs-catalog-state" aria-busy="true"></section></main>';

  await expect(
    assertProgramsScreen(document.body, { ...readiness, timeout: 50 })
  ).rejects.toThrow("Programs presentation is still loading");
});

test("accepts the settled marker after the representative fixture resolves", async () => {
  document.body.innerHTML =
    '<main><div data-screen-foundation="page-frame" data-screen-route="programs"><a data-program-name>門徒訓練基礎課</a></div></main>';

  await expect(
    assertProgramsScreen(document.body, readiness)
  ).resolves.toBeUndefined();
});

test("pins the exhaustive named Programs material-state inventory", () => {
  expect(PROGRAMS_MATERIAL_SCENARIO_NAMES).toStrictEqual(
    EXPECTED_PROGRAMS_MATERIAL_SCENARIO_NAMES
  );
  expect(new Set(PROGRAMS_MATERIAL_SCENARIO_NAMES).size).toBe(
    PROGRAMS_MATERIAL_SCENARIO_NAMES.length
  );
  for (const scenarioName of EXPECTED_PROGRAMS_MATERIAL_SCENARIO_NAMES) {
    const scenario = getProgramsStoryScenario(
      scenarioName as (typeof PROGRAMS_MATERIAL_SCENARIO_NAMES)[number]
    );
    expect(scenario.pathname).toBe("/programs");
    expect(scenario.query).toStrictEqual(expect.any(Object));
    expect(scenario.handlers.length).toBeGreaterThan(0);
  }
});

test("requires route-backed material states to define named behavior Plays", () => {
  const storySource = readFileSync(
    join(process.cwd(), ".storybook/programs-material-states.stories.tsx"),
    "utf8"
  );

  for (const exportName of REQUIRED_BEHAVIOR_PLAY_EXPORTS) {
    const exportStart = `export const ${exportName}: Story = materialStory(`;
    const start = storySource.indexOf(exportStart);
    expect(start, `${exportName} export is missing`).toBeGreaterThanOrEqual(0);

    const nextExport = storySource.indexOf("\nexport const ", start + 1);
    const declaration = storySource.slice(
      start,
      nextExport === -1 ? storySource.length : nextExport
    );

    expect(
      declaration,
      `${exportName} must pass a named behavior Play`
    ).toMatch(/,\s*[A-Za-z_$][\w$]*Play\s*\)\s*;?\s*$/u);
  }
});

test("installs mutable Programs handlers per Story invocation", () => {
  const storySource = readFileSync(
    join(process.cwd(), ".storybook/programs-material-states.stories.tsx"),
    "utf8"
  );

  expect(storySource).toMatch(/loaders:\s*\[/u);
  expect(storySource).toContain("worker.resetHandlers()");
  expect(storySource).toContain(
    "worker.use(...getProgramsStoryScenario(name).handlers)"
  );
  expect(storySource).not.toContain("msw: scenario.handlers");
});

test.each(PARTICIPANT_MUTATION_SCENARIOS)(
  "$scenario owns a resettable server-backed mutation projection",
  async ({
    scenario: scenarioName,
    programId,
    mutationPath,
    responseKey,
    initialStatus,
    nextStatus,
  }) => {
    const scenario = getProgramsStoryScenario(
      scenarioName as (typeof PROGRAMS_MATERIAL_SCENARIO_NAMES)[number]
    );
    storyServer.use(...scenario.handlers);

    const initial = await participantDetail(programId);
    expect(
      initialStatus === null ? initial.enrollment : participantStatuses(initial)
    ).toEqual(
      initialStatus === null ? null : expect.arrayContaining([initialStatus])
    );

    const mutation = await fetch(
      `http://localhost/api/v1/programs/${programId}/${mutationPath}`,
      { method: "POST" }
    );
    expect(mutation.status).toBe(200);
    const mutationBody = (await mutation.json()) as {
      data: Record<string, { status: string }>;
    };
    expect(mutationBody.data[responseKey]?.status).toBe(nextStatus);

    const projected = await participantDetail(programId);
    expect(participantStatuses(projected)).toContain(nextStatus);

    const freshScenario = getProgramsStoryScenario(
      scenarioName as (typeof PROGRAMS_MATERIAL_SCENARIO_NAMES)[number]
    );
    storyServer.resetHandlers(...freshScenario.handlers);
    const reset = await participantDetail(programId);
    expect(
      initialStatus === null ? reset.enrollment : participantStatuses(reset)
    ).toEqual(
      initialStatus === null ? null : expect.arrayContaining([initialStatus])
    );
    expect(participantStatuses(reset)).not.toContain(nextStatus);
  }
);

test("keeps the scenario factory free of complexity suppression", () => {
  const source = readFileSync(
    join(process.cwd(), ".storybook/programs-fixtures.ts"),
    "utf8"
  );

  expect(source).not.toContain("oxlint-disable-next-line complexity");
});

test("keeps Programs route fixtures free of demo labels and future dates", () => {
  const fixtureSource = readFileSync(
    join(process.cwd(), ".storybook/programs-fixtures.ts"),
    "utf8"
  );
  const storySource = readFileSync(
    join(process.cwd(), ".storybook/programs.stories.tsx"),
    "utf8"
  );

  expect(`${fixtureSource}\n${storySource}`).not.toMatch(/Storybook|2099/u);
});

test("rejects a settled direct leaf without the production route frame", async () => {
  document.body.innerHTML =
    "<main><a data-program-name>門徒訓練基礎課</a></main>";

  await expect(
    assertProgramsScreen(document.body, { ...readiness, timeout: 50 })
  ).rejects.toThrow("Programs route frame is missing");
});
