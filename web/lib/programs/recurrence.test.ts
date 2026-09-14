import { describe, expect, test } from "vitest";

import {
  addWallDays,
  addWallMonths,
  hkWallDateTimeLabel,
  isValidWallDate,
  previewOccurrencesForRule,
  wallDaySpan,
} from "@/lib/programs/recurrence";

describe("Hong Kong wall-clock formatting", () => {
  test("renders Hong Kong next-day midnight with a 00 hour", () => {
    expect(hkWallDateTimeLabel("2026-12-26T16:25:00.000Z")).toBe(
      "2026/12/27 00:25"
    );
  });
});

describe("bounded schedule recurrence", () => {
  test("includes both effective boundary dates and excludes dates outside them", () => {
    const occurrences = previewOccurrencesForRule(
      {
        rule_id: "rule-1",
        recurrence: "WEEKLY",
        day_of_week: 1,
        month_day: null,
        start_time: "10:00",
        end_time: "11:00",
        effective_start_date: "2026-09-07",
        effective_end_date: "2026-09-21",
      },
      "2026-08-31",
      35,
      []
    );

    expect(occurrences.map(({ occurs_on }) => occurs_on)).toEqual([
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
    ]);
  });

  test("omits an impossible monthly date instead of clamping to month end", () => {
    const occurrences = previewOccurrencesForRule(
      {
        rule_id: "rule-31",
        recurrence: "MONTHLY",
        day_of_week: null,
        month_day: 31,
        start_time: "10:00",
        end_time: "11:00",
        effective_start_date: "2026-01-01",
        effective_end_date: "2026-04-30",
      },
      "2026-01-01",
      120,
      []
    );

    expect(occurrences.map(({ occurs_on }) => occurs_on)).toEqual([
      "2026-01-31",
      "2026-03-31",
    ]);
  });

  test("provides calendar-month defaults and inclusive date spans", () => {
    expect(addWallMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addWallDays(addWallMonths("2026-09-15", 3), -1)).toBe("2026-12-14");
    expect(wallDaySpan("2026-09-15", "2026-12-14")).toBe(91);
    expect(isValidWallDate("2026-02-28")).toBe(true);
    expect(isValidWallDate("2026-02-29")).toBe(false);
  });
});
