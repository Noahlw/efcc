import { describe, expect, test } from "vitest";

import { buildProgramsHref, parseProgramsIntent } from "./programs-intent";

describe("participant Programs query intent", () => {
  test("keeps Program and Event Detail on the canonical query-driven URLs", () => {
    expect(
      buildProgramsHref({ mode: "participant", programId: "discipleship" })
    ).toBe("/programs?program=discipleship");
    expect(
      buildProgramsHref({
        mode: "participant",
        programId: "discipleship",
        eventId: "event-1",
      })
    ).toBe("/programs?program=discipleship&event=event-1");
    expect(
      parseProgramsIntent("?program=discipleship&event=event-1")
    ).toMatchObject({
      mode: "participant",
      programId: "discipleship",
      eventId: "event-1",
      malformed: false,
    });
  });

  test("preserves malformed participant intent without inventing a pathname route", () => {
    expect(parseProgramsIntent("?program=bad%2Fscope")).toMatchObject({
      mode: "participant",
      programId: null,
      malformed: true,
    });
    expect(
      buildProgramsHref({ mode: "participant", programId: "bad/scope" })
    ).toBe("/programs");
  });
});
