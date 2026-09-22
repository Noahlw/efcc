import { describe, expect, test } from "vitest";

import {
  addWallDays,
  addWallMonths,
  exceptionForEvent,
  hkWallDateTimeLabel,
  hkWallToUtc,
  isValidWallDate,
  previewOccurrencesForRule,
  recurrenceTagForEvent,
  ruleForEvent,
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

    expect(occurrences.map(({ occurs_on }) => occurs_on)).toStrictEqual([
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

    expect(occurrences.map(({ occurs_on }) => occurs_on)).toStrictEqual([
      "2026-01-31",
      "2026-03-31",
    ]);
  });

  test("keeps the original occurrence while previewing a replacement date", () => {
    const occurrences = previewOccurrencesForRule(
      {
        rule_id: "rule-reschedule",
        recurrence: "WEEKLY",
        day_of_week: 1,
        month_day: null,
        start_time: "10:00",
        end_time: "11:00",
      },
      "2026-09-07",
      1,
      [
        {
          exception_id: "exception-1",
          rule_id: "rule-reschedule",
          override_date: "2026-09-07",
          action: "RESCHEDULE",
          new_date: "2026-09-10",
          new_start_time: "14:00",
          new_end_time: "15:00",
        },
      ]
    );

    expect(occurrences[0]).toMatchObject({
      occurs_on: "2026-09-07",
      replacement_date: "2026-09-10",
      starts_at: "2026-09-10T06:00:00.000Z",
      ends_at: "2026-09-10T07:00:00.000Z",
    });
  });

  test("provides calendar-month defaults and inclusive date spans", () => {
    expect(addWallMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addWallDays(addWallMonths("2026-09-15", 3), -1)).toBe("2026-12-14");
    expect(wallDaySpan("2026-09-15", "2026-12-14")).toBe(91);
    expect(isValidWallDate("2026-02-28")).toBeTruthy();
    expect(isValidWallDate("2026-02-29")).toBeFalsy();
  });

  test("retired rules produce no future candidates", () => {
    const occurrences = previewOccurrencesForRule(
      {
        rule_id: "retired-rule",
        recurrence: "WEEKLY",
        day_of_week: 2,
        month_day: null,
        start_time: "10:00",
        end_time: "11:00",
        retired_at: "2026-09-01T00:00:00.000Z",
      },
      "2026-09-01",
      14,
      []
    );

    expect(occurrences).toStrictEqual([]);
  });

  test("persisted Event provenance wins over edited date and time heuristics", () => {
    const rules = [
      {
        rule_id: "weekly-rule",
        recurrence: "WEEKLY" as const,
        day_of_week: 2,
        month_day: null,
        start_time: "10:00",
        end_time: "11:00",
      },
      {
        rule_id: "other-rule",
        recurrence: "WEEKLY" as const,
        day_of_week: 4,
        month_day: null,
        start_time: "14:00",
        end_time: "15:00",
      },
    ];
    const event = {
      source: "SCHEDULE",
      starts_at: hkWallToUtc("2026-09-10", "14:00"),
      schedule_rule_id: "weekly-rule",
      occurrence_date: "2026-09-08",
    };
    const exception = {
      exception_id: "exception-1",
      rule_id: "weekly-rule",
      override_date: "2026-09-08",
      action: "RESCHEDULE" as const,
      new_start_time: "14:00",
      new_end_time: "15:00",
    };

    expect(ruleForEvent(event, rules)?.rule_id).toBe("weekly-rule");
    expect(exceptionForEvent(event, rules, [exception])).toStrictEqual(
      exception
    );
    expect(recurrenceTagForEvent(event, rules)).toBe("每週");
  });
});
