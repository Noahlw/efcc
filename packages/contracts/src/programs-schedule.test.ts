import assert from "node:assert/strict";

import { describe, test } from "vitest";

import {
  EventCreateResponseSchema,
  EventDetailResponseSchema,
  EventsListSchema,
  GenerateEventsResponseSchema,
  PreviewEventsResponseSchema,
  ScheduleExceptionCreateResponseSchema,
  ScheduleExceptionDeleteResponseSchema,
  ScheduleExceptionsSchema,
  ScheduleRuleCreateResponseSchema,
  ScheduleRuleResponseSchema,
  ScheduleRulesSchema,
  isIsoInstant,
  isValidWallDate,
  isWallTime,
  parseEventText,
  parseExceptionBody,
  parseGeneratePlanId,
  parsePreviewHorizon,
  parseRuleBody,
  parseRulePatch,
} from "./programs-schedule";

describe("schedule wall predicates", () => {
  test("wall time/date/instant ports", () => {
    assert.strictEqual(isWallTime("09:30"), true);
    assert.strictEqual(isWallTime("9:30"), false);
    assert.strictEqual(isWallTime("24:00"), false);
    assert.strictEqual(isValidWallDate("2026-09-19"), true);
    assert.strictEqual(isValidWallDate("2026-02-30"), false);
    assert.strictEqual(isValidWallDate("2026-9-9"), false);
    assert.strictEqual(isIsoInstant("2026-09-19T10:00:00.000Z"), true);
    assert.strictEqual(isIsoInstant("2026-09-19T10:00"), false);
    assert.strictEqual(parseEventText("  x  ", "name"), "x");
    assert.strictEqual(parseEventText("", "name"), null);
    assert.strictEqual(parseEventText(undefined, "name"), undefined);
    assert.throws(() => parseEventText(42, "name"), /must be text/u);
  });
  test("preview horizon and plan id", () => {
    assert.strictEqual(parsePreviewHorizon(undefined), null);
    assert.strictEqual(parsePreviewHorizon(90), 90);
    assert.strictEqual(parsePreviewHorizon(366), "invalid");
    assert.strictEqual(parsePreviewHorizon("90"), "invalid");
    assert.strictEqual(parseGeneratePlanId(" plan-1 "), " plan-1 ");
    assert.strictEqual(parseGeneratePlanId("  "), null);
  });
});

describe("parseRuleBody parity", () => {
  const weekly = {
    recurrence: "WEEKLY",
    day_of_week: 3,
    start_time: "09:00",
    end_time: "10:00",
  };
  test("accepts valid weekly/monthly bodies", () => {
    const parsed = parseRuleBody(weekly);
    assert.strictEqual(parsed.ok, true);
    if (parsed.ok) {
      assert.strictEqual(parsed.value.day_of_week, 3);
      assert.strictEqual(parsed.value.month_day, null);
    }
    assert.strictEqual(
      parseRuleBody({ ...weekly, recurrence: "MONTHLY", month_day: 15 }).ok,
      true
    );
  });
  test("rejects with the exact handler messages", () => {
    assert.deepStrictEqual(parseRuleBody({ ...weekly, recurrence: "YEARLY" }), {
      ok: false,
      detail: "recurrence must be WEEKLY or MONTHLY.",
    });
    assert.deepStrictEqual(parseRuleBody({ ...weekly, day_of_week: 7 }), {
      ok: false,
      detail: "day_of_week (0-6) is required for WEEKLY.",
    });
    assert.deepStrictEqual(
      parseRuleBody({ ...weekly, start_time: "10:00", end_time: "09:00" }),
      { ok: false, detail: "end_time must be after start_time." }
    );
  });
});

describe("parseRulePatch parity", () => {
  const existing = {
    recurrence: "WEEKLY" as const,
    day_of_week: 3,
    month_day: null,
    start_time: "09:00",
    end_time: "10:00",
    effective_start_date: null,
    effective_end_date: null,
  };
  test("accepts partial valid patches", () => {
    const parsed = parseRulePatch({ start_time: "08:00" }, existing);
    assert.strictEqual(parsed.ok, true);
  });
  test("rejects bad values and broken invariants", () => {
    assert.deepStrictEqual(parseRulePatch({ day_of_week: 9 }, existing), {
      ok: false,
      detail: "day_of_week must be an integer 0-6.",
    });
    assert.deepStrictEqual(parseRulePatch({ start_time: "11:00" }, existing), {
      ok: false,
      detail: "end_time must be after start_time.",
    });
  });
});

describe("parseExceptionBody parity", () => {
  test("accepts CANCEL and RESCHEDULE shapes", () => {
    assert.strictEqual(
      parseExceptionBody({ override_date: "2026-09-20", action: "CANCEL" }).ok,
      true
    );
    assert.strictEqual(
      parseExceptionBody({
        override_date: "2026-09-20",
        action: "RESCHEDULE",
        new_start_time: "09:00",
        new_end_time: "10:00",
      }).ok,
      true
    );
  });
  test("rejects with exact messages", () => {
    assert.deepStrictEqual(
      parseExceptionBody({ override_date: "20-09-2026", action: "CANCEL" }),
      { ok: false, detail: "override_date must be YYYY-MM-DD." }
    );
    assert.deepStrictEqual(
      parseExceptionBody({
        override_date: "2026-09-20",
        action: "RESCHEDULE",
        new_start_time: "09:00",
      }),
      {
        ok: false,
        detail: "RESCHEDULE requires new_start_time and new_end_time.",
      }
    );
    assert.deepStrictEqual(
      parseExceptionBody({
        override_date: "2026-09-20",
        action: "CANCEL",
        new_date: "2026-09-21",
      }),
      { ok: false, detail: "CANCEL must not include new_date." }
    );
  });
});

describe("schedule/event response schemas", () => {
  const rule = {
    rule_id: "r",
    program_id: "p",
    recurrence: "WEEKLY",
    day_of_week: 3,
    month_day: null,
    start_time: "09:00",
    end_time: "10:00",
    location: null,
    created_by: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_by: null,
    updated_at: "2026-09-01T00:00:00.000Z",
  };
  test("rule list/create/update/retire", () => {
    assert.strictEqual(
      ScheduleRulesSchema.safeParse({ rules: [rule] }).success,
      true
    );
    assert.strictEqual(
      ScheduleRuleCreateResponseSchema.safeParse({ rule, idempotent: false })
        .success,
      true
    );
    assert.strictEqual(
      ScheduleRuleResponseSchema.safeParse({ rule }).success,
      true
    );
  });
  test("exceptions list/create/delete", () => {
    const exception = {
      exception_id: "e",
      rule_id: "r",
      override_date: "2026-09-20",
      action: "CANCEL",
      new_start_time: null,
      new_end_time: null,
      created_by: null,
      created_at: "2026-09-01T00:00:00.000Z",
    };
    assert.strictEqual(
      ScheduleExceptionsSchema.safeParse({ exceptions: [exception] }).success,
      true
    );
    assert.strictEqual(
      ScheduleExceptionCreateResponseSchema.safeParse({ exception }).success,
      true
    );
    assert.strictEqual(
      ScheduleExceptionDeleteResponseSchema.safeParse({ deleted: true })
        .success,
      true
    );
  });
  test("preview and generate", () => {
    assert.strictEqual(
      PreviewEventsResponseSchema.safeParse({
        plan: {
          plan_id: "pl",
          program_id: "p",
          plan_hash: "h",
          horizon_days: 90,
          from_date: "2026-09-01",
          to_date: "2026-11-29",
          rule_count: 1,
          created_at: "2026-09-01T00:00:00.000Z",
        },
        occurrences: [],
      }).success,
      true
    );
    assert.strictEqual(
      GenerateEventsResponseSchema.safeParse({
        generated: {
          run_id: "run",
          plan_id: "pl",
          status: "completed",
          created: 2,
          skipped: 0,
          failed: 0,
          resumed: false,
          created_event_ids: ["e1"],
          skipped_occurrences: [],
          unresolved_occurrences: [],
        },
      }).success,
      true
    );
  });
  test("event list/create/detail", () => {
    const event = {
      event_id: "e",
      program_id: "p",
      starts_at: "2026-09-19T10:00:00.000Z",
      ends_at: "2026-09-19T11:00:00.000Z",
      status: "Active",
      availability: "Active",
      source: "MANUAL",
      name: "聚會",
      cancel_reason: null,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
    };
    assert.strictEqual(
      EventsListSchema.safeParse({ events: [event] }).success,
      true
    );
    assert.strictEqual(
      EventCreateResponseSchema.safeParse({ event }).success,
      true
    );
    assert.strictEqual(
      EventDetailResponseSchema.safeParse({
        event,
        leaders: [],
        participant_summary: { active_enrollments: 0, checked_in: 0 },
      }).success,
      true
    );
  });
});
