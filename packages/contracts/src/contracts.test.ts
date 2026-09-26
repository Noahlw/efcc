import assert from "node:assert/strict";

import { describe, test } from "vitest";

import { parseSuccessEnvelope } from "./envelope";
import {
  HomeAnnouncementsSchema,
  HomeAuditListSchema,
  HomeCmsEffectiveSchema,
  HomeContentSchema,
  HomeProjectionSchema,
  coalesceCmsBody,
  isValidExpectedVersion,
} from "./home";
import {
  clampLimit,
  firstPresent,
  normalizeHkTimestamp,
  normalizePathSegment,
  optionalTrimmedString,
} from "./primitives";
import { parseProblemDetails, problemFallback } from "./problem";

describe("envelope", () => {
  test("parses a well-formed envelope", () => {
    assert.deepStrictEqual(
      parseSuccessEnvelope({ requestId: "r1", data: { a: 1 } }),
      { requestId: "r1", data: { a: 1 } }
    );
  });
  test("rejects missing data key and missing requestId", () => {
    assert.strictEqual(parseSuccessEnvelope({ requestId: "r1" }), null);
    assert.strictEqual(parseSuccessEnvelope({ data: 1 }), null);
    assert.strictEqual(parseSuccessEnvelope(null), null);
    assert.strictEqual(parseSuccessEnvelope("x"), null);
  });
});

describe("problem details", () => {
  test("keeps matching status, code, and extensions", () => {
    const body = {
      status: 409,
      code: "CONFLICT",
      requestId: "r9",
      latest: { version: 3 },
      reloadRequired: true,
    };
    const resolved = parseProblemDetails(body, 409, "header-id");
    assert.strictEqual(resolved?.status, 409);
    assert.strictEqual(resolved?.code, "CONFLICT");
    assert.strictEqual(resolved?.requestId, "r9");
    assert.deepStrictEqual(resolved?.latest, { version: 3 });
  });
  test("fills missing status and requestId from transport", () => {
    const resolved = parseProblemDetails({ code: "X" }, 503, "hdr");
    assert.strictEqual(resolved?.status, 503);
    assert.strictEqual(resolved?.requestId, "hdr");
  });
  test("returns null for non-records and wrongly-typed keys", () => {
    assert.strictEqual(parseProblemDetails(null, 500), null);
    assert.strictEqual(parseProblemDetails("boom", 500), null);
    assert.strictEqual(parseProblemDetails({ status: "503" }, 503), null);
    assert.strictEqual(parseProblemDetails({}, 503, "hdr"), null);
    assert.strictEqual(
      parseProblemDetails({ unexpected: true }, 403, "hdr"),
      null
    );
    assert.strictEqual(
      parseProblemDetails({ status: 200, code: "CONFLICT" }, 409, "hdr"),
      null
    );
  });
  test("fallback preserves status and reference", () => {
    assert.deepStrictEqual(problemFallback(503, "r", "UNAVAILABLE", "t", "d"), {
      status: 503,
      code: "UNAVAILABLE",
      title: "t",
      detail: "d",
      requestId: "r",
    });
  });
});

describe("primitives", () => {
  test("clampLimit mirrors the audit policy", () => {
    assert.strictEqual(clampLimit("999", 50, 1, 100), 100);
    assert.strictEqual(clampLimit("abc", 50, 1, 100), 50);
    assert.strictEqual(clampLimit(null, 50, 1, 100), 50);
    assert.strictEqual(clampLimit("0", 50, 1, 100), 1);
    assert.strictEqual(clampLimit(25, 50, 1, 100), 25);
  });
  test("firstPresent prefers snake_case and counts null as present", () => {
    assert.strictEqual(
      firstPresent({ template_type: "A", templateType: "B" }, [
        "template_type",
        "templateType",
      ]),
      "A"
    );
    assert.strictEqual(
      firstPresent({ templateType: null }, ["templateType"]),
      null
    );
    assert.strictEqual(firstPresent({}, ["templateType"]), undefined);
  });
  test("normalizePathSegment trims and rejects blank", () => {
    assert.strictEqual(normalizePathSegment("  EVT-1 "), "EVT-1");
    assert.strictEqual(normalizePathSegment("   "), null);
    assert.strictEqual(normalizePathSegment(42), null);
  });
  test("normalizeHkTimestamp reads HK wall time as UTC+8", () => {
    assert.strictEqual(
      normalizeHkTimestamp("2026-09-20T10:00"),
      "2026-09-20T02:00:00.000Z"
    );
    assert.strictEqual(
      normalizeHkTimestamp("2026-09-20T10:00:00Z"),
      "2026-09-20T10:00:00.000Z"
    );
    assert.strictEqual(normalizeHkTimestamp("not-a-date"), null);
    assert.strictEqual(normalizeHkTimestamp(""), null);
  });
  test("optionalTrimmedString mirrors the CMS field policy", () => {
    assert.strictEqual(optionalTrimmedString({ a: " x " }, "a"), "x");
    assert.strictEqual(optionalTrimmedString({ a: null }, "a"), null);
    assert.strictEqual(optionalTrimmedString({}, "a"), undefined);
    assert.strictEqual(optionalTrimmedString({ a: 3 }, "a"), undefined);
  });
});

describe("home schemas", () => {
  test("projection accepts the full wire shape with aliases", () => {
    const wire = {
      featuredEvent: {
        eventId: "E",
        programId: "P",
        programTitle: "PT",
        title: "T",
        startsAt: "2026-09-20T10:00:00.000Z",
        endsAt: "2026-09-20T11:00:00.000Z",
        startAt: "2026-09-20T10:00:00.000Z",
        endAt: "2026-09-20T11:00:00.000Z",
        location: "",
        status: "Active",
        isEnrolled: true,
      },
      announcement: {
        contentId: "C",
        version: 3,
        title: "T",
        summary: "S",
        bodyMarkdown: null,
        ctaLabel: null,
        ctaUrl: null,
        imageUrl: null,
        imageAlt: null,
        publishedAt: null,
      },
      exploreProgram: null,
    };
    assert.strictEqual(HomeProjectionSchema.safeParse(wire).success, true);
    assert.strictEqual(
      HomeProjectionSchema.safeParse({ ...wire, featuredEvent: {} }).success,
      false
    );
    assert.strictEqual(
      HomeProjectionSchema.safeParse({
        ...wire,
        announcement: { ...wire.announcement, version: "3" },
      }).success,
      false
    );
  });
  test("announcements list and content accept nullables", () => {
    assert.strictEqual(
      HomeAnnouncementsSchema.safeParse({ announcements: [] }).success,
      true
    );
    assert.strictEqual(
      HomeAnnouncementsSchema.safeParse({ announcements: "x" }).success,
      false
    );
    assert.strictEqual(HomeContentSchema.safeParse(null).success, false);
  });
  test("audit items allow nullable version/templateType (mismatch #1)", () => {
    const item = {
      auditId: "a",
      insertedAt: "2026-09-20T00:00:00.000Z",
      actorUserId: "",
      actorName: null,
      action: "HOME_PUBLISH",
      entityId: "home",
      contentId: "home",
      version: null,
      templateType: null,
    };
    assert.strictEqual(
      HomeAuditListSchema.safeParse({ items: [item] }).success,
      true
    );
  });
  test("effective CMS input enforces enums and end-after-start", () => {
    assert.strictEqual(
      HomeCmsEffectiveSchema.safeParse({
        templateType: "B",
        publishMode: "immediate",
        startAt: null,
        endAt: null,
      }).success,
      true
    );
    assert.strictEqual(
      HomeCmsEffectiveSchema.safeParse({
        templateType: "C",
        publishMode: "immediate",
        startAt: null,
        endAt: null,
      }).success,
      false
    );
    assert.strictEqual(
      HomeCmsEffectiveSchema.safeParse({
        templateType: "B",
        publishMode: "scheduled",
        startAt: "2026-09-20T02:00:00.000Z",
        endAt: "2026-09-20T01:00:00.000Z",
      }).success,
      false
    );
  });
  test("CMS body coalescing and expected_version predicate", () => {
    assert.deepStrictEqual(
      coalesceCmsBody({ templateType: "B", expected_version: 2 }),
      {
        contentId: undefined,
        expectedVersion: 2,
        version: undefined,
        templateType: "B",
        publishMode: undefined,
        startAt: undefined,
        endAt: undefined,
      }
    );
    assert.strictEqual(isValidExpectedVersion(undefined), true);
    assert.strictEqual(isValidExpectedVersion(3), true);
    assert.strictEqual(isValidExpectedVersion("3"), false);
    assert.strictEqual(isValidExpectedVersion(0), false);
  });
});
