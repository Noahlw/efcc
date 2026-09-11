/** @vitest-environment jsdom */

import { expect, test } from "vitest";

import {
  PROGRAMS_MATERIAL_SCENARIO_NAMES,
  getProgramsStoryScenario,
} from "./programs-fixtures";
import { assertProgramsScreen } from "./programs-presentation-contract";

const readiness = {
  selector: "[data-program-name]",
  text: "Storybook Programs Workshop",
};

test("does not accept the shared AppShell main landmark as a settled Programs screen", async () => {
  document.body.innerHTML =
    '<main><section id="programs-catalog-state" aria-busy="true"></section></main>';

  await expect(
    assertProgramsScreen(document.body, { ...readiness, timeout: 50 })
  ).rejects.toThrow("Programs presentation is still loading");
});

test("accepts the settled marker after the representative fixture resolves", async () => {
  document.body.innerHTML =
    '<main><div data-screen-foundation="page-frame" data-screen-route="programs"><a data-program-name>Storybook Programs Workshop</a></div></main>';

  await expect(
    assertProgramsScreen(document.body, readiness)
  ).resolves.toBeUndefined();
});

test("keeps the named Programs material-state matrix route-backed and non-cataloged", () => {
  expect(PROGRAMS_MATERIAL_SCENARIO_NAMES).toHaveLength(20);
  expect(new Set(PROGRAMS_MATERIAL_SCENARIO_NAMES).size).toBe(
    PROGRAMS_MATERIAL_SCENARIO_NAMES.length
  );
  for (const scenarioName of PROGRAMS_MATERIAL_SCENARIO_NAMES) {
    const scenario = getProgramsStoryScenario(scenarioName);
    expect(scenario.pathname).toBe("/programs");
    expect(scenario.query).toStrictEqual(expect.any(Object));
    expect(scenario.handlers.length).toBeGreaterThan(0);
  }
});

test("rejects a settled direct leaf without the production route frame", async () => {
  document.body.innerHTML =
    "<main><a data-program-name>Storybook Programs Workshop</a></main>";

  await expect(
    assertProgramsScreen(document.body, { ...readiness, timeout: 50 })
  ).rejects.toThrow("Programs route frame is missing");
});
