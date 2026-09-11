/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import {
  PROGRAMS_MATERIAL_SCENARIO_NAMES,
  getProgramsStoryScenario,
} from "./programs-fixtures";
import { assertProgramsScreen } from "./programs-presentation-contract";

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
