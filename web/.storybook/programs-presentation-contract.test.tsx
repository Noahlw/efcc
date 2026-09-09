/** @vitest-environment jsdom */

import { render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { assertProgramsScreen } from "./programs-presentation-contract";

const mocks = vi.hoisted(() => ({
  listParticipantCatalog: vi.fn(),
  router: {
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  },
}));

vi.mock(import("@/lib/programs/program-api"), () => ({
  listParticipantCatalog: mocks.listParticipantCatalog,
}));

vi.mock(import("next/navigation"), () => ({
  useRouter: () => mocks.router,
}));

import { ParticipantDirectory } from "@/lib/programs/participant-directory";

const readiness = {
  selector: "[data-program-name]",
  text: "Storybook Programs Workshop",
};

afterEach(() => {
  document.body.innerHTML = "";
  vi.resetAllMocks();
});

test("real ParticipantDirectory loading output cannot satisfy settled readiness", async () => {
  const pending = Promise.withResolvers<{ catalog: [] }>();
  mocks.listParticipantCatalog.mockReturnValue(pending.promise);

  const view = render(
    <main>
      <ParticipantDirectory
        canManage={false}
        homeHref="/home"
        managementHref="/programs?mode=management"
        programHref={(programId) => `/programs?program=${programId}`}
        programId={null}
      />
    </main>
  );

  await expect(assertProgramsScreen(view.container, readiness)).rejects.toThrow(
    "Programs presentation is still loading"
  );

  pending.resolve({ catalog: [] });
  await expect(assertProgramsScreen(view.container, readiness)).rejects.toThrow(
    "Expected settled Programs marker"
  );
});
