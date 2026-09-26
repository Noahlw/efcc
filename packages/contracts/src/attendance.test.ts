import assert from "node:assert/strict";

import { describe, test } from "vitest";

import {
  AssistedCheckInBodySchema,
  CheckInDuplicateSchema,
  CheckInSuccessSchema,
  EXCUSE_CATEGORIES,
  GUEST_NAME_MAX_LENGTH,
  GuestCheckInBodySchema,
  GuestCorrectionBodySchema,
  MaterializeResponseSchema,
  OwnAttendanceResponseSchema,
  ReconcileResponseSchema,
  ResolveEventsSchema,
  RosterResponseSchema,
  SelfCheckInBodySchema,
  VoidResponseSchema,
  isValidGuestName,
  normalizeGuestPhone,
  parseExcuseReason,
  parseGuestIdempotencyKey,
  parseResolveQuery,
  parseVoidReason,
} from "./attendance";

describe("attendance request predicates", () => {
  test("guest phone normalization mirrors the handler", () => {
    assert.strictEqual(normalizeGuestPhone("9123 4567"), "hk:85291234567");
    assert.strictEqual(normalizeGuestPhone("+85291234567"), "hk:85291234567");
    assert.strictEqual(normalizeGuestPhone("+14155552671"), "intl:14155552671");
    assert.strictEqual(normalizeGuestPhone("123"), null);
    assert.strictEqual(normalizeGuestPhone("   "), null);
    assert.strictEqual(GUEST_NAME_MAX_LENGTH, 80);
  });
  test("guest name rule", () => {
    assert.strictEqual(isValidGuestName("陳大文"), true);
    assert.strictEqual(isValidGuestName("  "), false);
    assert.strictEqual(isValidGuestName("x".repeat(81)), false);
  });
  test("guest idempotency key rule", () => {
    assert.strictEqual(parseGuestIdempotencyKey(null), null);
    assert.strictEqual(parseGuestIdempotencyKey("  "), null);
    assert.strictEqual(parseGuestIdempotencyKey("k"), "k");
    assert.strictEqual(parseGuestIdempotencyKey("x".repeat(201)), "invalid");
  });
  test("resolve mutual exclusion", () => {
    const params = (q: string) => new URLSearchParams(q);
    assert.deepStrictEqual(parseResolveQuery(params("program_token=t")), {
      ok: true,
      token: "t",
      code: null,
      entry: null,
      eventId: null,
    });
    assert.strictEqual(
      parseResolveQuery(params("program_token=a&event=e")).ok,
      false
    );
    assert.strictEqual(parseResolveQuery(params("")).ok, false);
    assert.strictEqual(parseResolveQuery(params("event=e")).ok, true);
  });
  test("self/assisted/guest body shapes", () => {
    assert.strictEqual(
      SelfCheckInBodySchema.safeParse({ event_id: "e" }).success,
      true
    );
    assert.strictEqual(
      SelfCheckInBodySchema.safeParse({
        event_id: "e",
        method: "leader_qr_scan",
      }).success,
      false
    );
    assert.strictEqual(
      AssistedCheckInBodySchema.safeParse({
        member_user_id: "u",
        method: "leader_manual_search",
      }).success,
      true
    );
    // Shape only: the at-least-one-credential rule stays in the
    // handler with its 422 (mirrored by the worker tests).
    assert.strictEqual(
      GuestCheckInBodySchema.safeParse({
        event_id: "e",
        name: "n",
        phone: "91234567",
      }).success,
      true
    );
    assert.strictEqual(
      GuestCorrectionBodySchema.safeParse({
        name: "n",
        phone: "p",
        reason: "r",
      }).success,
      true
    );
  });
  test("void reason and excuse categories", () => {
    assert.strictEqual(parseVoidReason("  作廢  "), "作廢");
    assert.strictEqual(parseVoidReason("  "), null);
    assert.ok(EXCUSE_CATEGORIES.includes("其他"));
    assert.deepStrictEqual(parseExcuseReason("身體不適"), {
      ok: true,
      reason: "身體不適",
    });
    assert.deepStrictEqual(parseExcuseReason("其他：交通"), {
      ok: true,
      reason: "其他：交通",
    });
    assert.strictEqual(parseExcuseReason("其他").ok, false);
    assert.strictEqual(parseExcuseReason("亂寫").ok, false);
    assert.strictEqual(parseExcuseReason("x".repeat(501)).ok, false);
  });
});

describe("attendance response schemas", () => {
  const event = {
    event_id: "e",
    program_id: "p",
    program_name: "n",
    name: null,
    location: null,
    starts_at: "2026-09-01T10:00:00.000Z",
    ends_at: "2026-09-01T11:00:00.000Z",
    manual_check_in_code: "CODE",
    check_in_window_opens_at: "2026-09-01T09:30:00.000Z",
    check_in_window_closes_at: "2026-09-01T11:30:00.000Z",
    status: "Active",
    availability: "Active",
  };
  test("resolve, check-in, reconcile", () => {
    assert.strictEqual(
      ResolveEventsSchema.safeParse({ events: [event] }).success,
      true
    );
    assert.strictEqual(
      CheckInSuccessSchema.safeParse({
        outcome: "success",
        attendance_id: "a",
        checked_in_at: "2026-09-01T10:00:00.000Z",
      }).success,
      true
    );
    assert.strictEqual(
      CheckInDuplicateSchema.safeParse({ outcome: "duplicate" }).success,
      true
    );
    assert.strictEqual(
      ReconcileResponseSchema.safeParse({ outcome: "found" }).success,
      true
    );
  });
  test("roster and materialize", () => {
    const roster = {
      event,
      attendances: [],
      guests: [],
      expected: [],
      snapshot: null,
      counts: {
        expected: 0,
        present: 0,
        not_yet: 0,
        absent: 0,
        excused: 0,
        guests: 0,
      },
      materialization_required: false,
    };
    assert.strictEqual(RosterResponseSchema.safeParse(roster).success, true);
    assert.strictEqual(
      MaterializeResponseSchema.safeParse({
        ...roster,
        materialization: {
          status: "materialized",
          materialized: true,
          added_expected: 3,
          snapshot: null,
        },
      }).success,
      true
    );
  });
  test("own view and void", () => {
    assert.strictEqual(
      OwnAttendanceResponseSchema.safeParse({
        event: {
          event_id: "e",
          program_id: "p",
          program_name: "n",
          name: null,
          location: null,
          starts_at: "2026-09-01T10:00:00.000Z",
          ends_at: "2026-09-01T11:00:00.000Z",
          check_in_window_opens_at: "2026-09-01T09:30:00.000Z",
          check_in_window_closes_at: "2026-09-01T11:30:00.000Z",
          status: "Active",
          availability: "Active",
        },
        state: "Present",
        attendance: {
          attendance_id: "a",
          status: "Active",
          checked_in_at: "2026-09-01T10:00:00.000Z",
        },
        disposition: null,
      }).success,
      true
    );
    assert.strictEqual(
      VoidResponseSchema.safeParse({ outcome: "voided", attendance_id: "a" })
        .success,
      true
    );
  });
});
