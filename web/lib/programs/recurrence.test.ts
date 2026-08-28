import { describe, expect, test } from "vitest";

import { hkWallDateTimeLabel } from "@/lib/programs/recurrence";

describe("Hong Kong wall-clock formatting", () => {
  test("renders Hong Kong next-day midnight with a 00 hour", () => {
    expect(hkWallDateTimeLabel("2026-12-26T16:25:00.000Z")).toBe(
      "2026/12/27 00:25"
    );
  });
});
