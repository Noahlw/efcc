/** @vitest-environment jsdom */

import { expect, test } from "vitest";

import { assertProgramsScreen } from "./programs-presentation-contract";

const readiness = {
  selector: "[data-program-name]",
  text: "Storybook Programs Workshop",
};

test("does not accept the shared AppShell main landmark as a settled Programs screen", async () => {
  document.body.innerHTML =
    '<main><section id="programs-catalog-state" aria-busy="true"></section></main>';

  await expect(assertProgramsScreen(document.body, readiness)).rejects.toThrow(
    "Programs presentation is still loading"
  );
});

test("accepts the settled marker after the representative fixture resolves", async () => {
  document.body.innerHTML =
    "<main><a data-program-name>Storybook Programs Workshop</a></main>";

  await expect(
    assertProgramsScreen(document.body, readiness)
  ).resolves.toBeUndefined();
});
