import assert from "node:assert/strict";

import { describe, test } from "vitest";

import {
  AccountDirectoryStatusSchema,
  AccountDirectoryViewSchema,
  ManagementAttentionViewSchema,
  ManagementCockpitViewSchema,
  ManagementDirectoryViewSchema,
  ManagementHubViewSchema,
  ManagementNotificationsViewSchema,
  MarkedCountSchema,
  MembersSearchResultSchema,
  NoticeCreateResponseSchema,
  NotificationReadItemSchema,
  NotificationsReadBodySchema,
  ParticipantCatalogSchema,
  ParticipantNoticesViewSchema,
  ParticipantProgramDetailSchema,
  ProgramAttendanceArtifactSchema,
  ProgramTokenRotationSchema,
  floorClampLimit,
  isValidAccountCursor,
  optionalIdField,
  parseOptionalIdempotencyKey,
  parseSearchTerm,
  trimmedField,
} from "./programs-reads";

describe("programs query predicates", () => {
  test("floorClampLimit mirrors the read-list policy", () => {
    assert.strictEqual(floorClampLimit(null, 20, 1, 50), 20);
    assert.strictEqual(floorClampLimit("abc", 20, 1, 50), 20);
    assert.strictEqual(floorClampLimit("2.9", 20, 1, 50), 2);
    assert.strictEqual(floorClampLimit("0", 20, 1, 50), 1);
    assert.strictEqual(floorClampLimit("999", 20, 1, 50), 50);
    assert.strictEqual(floorClampLimit("999", 20, 1, 20), 20);
    assert.strictEqual(floorClampLimit("", 5, 1, 50), 1);
  });
  test("search term trims with empty default", () => {
    assert.strictEqual(parseSearchTerm("  al  "), "al");
    assert.strictEqual(parseSearchTerm(null), "");
  });
  test("account cursor is an integer offset", () => {
    assert.strictEqual(isValidAccountCursor(0), true);
    assert.strictEqual(isValidAccountCursor(1.5), false);
    assert.strictEqual(isValidAccountCursor(-1), false);
    assert.strictEqual(isValidAccountCursor("0"), false);
  });
  test("account status is a closed vocabulary", () => {
    assert.strictEqual(
      AccountDirectoryStatusSchema.safeParse("Active").success,
      true
    );
    assert.strictEqual(
      AccountDirectoryStatusSchema.safeParse("Bogus").success,
      false
    );
  });
  test("rotate key is optional but bounded", () => {
    assert.deepStrictEqual(parseOptionalIdempotencyKey(null), {
      key: undefined,
    });
    assert.deepStrictEqual(parseOptionalIdempotencyKey("  k  "), { key: "k" });
    assert.strictEqual(parseOptionalIdempotencyKey("x".repeat(201)), null);
  });
  test("notice field trims mirror the handler", () => {
    assert.strictEqual(trimmedField("  x  "), "x");
    assert.strictEqual(trimmedField(42), "");
    assert.strictEqual(optionalIdField(""), undefined);
    assert.strictEqual(optionalIdField(42), undefined);
    assert.strictEqual(optionalIdField(" p "), "p");
  });
});

describe("programs read request bodies", () => {
  test("notification read items are bounded; envelope caps at 100", () => {
    assert.strictEqual(
      NotificationReadItemSchema.safeParse({
        source_key: "k",
        source_revision: "r",
      }).success,
      true
    );
    assert.strictEqual(
      NotificationReadItemSchema.safeParse({
        source_key: "",
        source_revision: "r",
      }).success,
      false
    );
    assert.strictEqual(
      NotificationsReadBodySchema.safeParse({
        items: Array.from({ length: 101 }, () => ({})),
      }).success,
      false
    );
    // Unknown item keys stay ignored at the handler layer (loose object).
    assert.strictEqual(
      NotificationReadItemSchema.safeParse({
        source_key: "k",
        source_revision: "r",
        future: 1,
      }).success,
      true
    );
  });
});

describe("programs read response schemas", () => {
  test("directory, hub, access, members, and account shapes", () => {
    assert.strictEqual(
      ManagementDirectoryViewSchema.safeParse({ departments: [], programs: [] })
        .success,
      true
    );
    assert.strictEqual(
      ManagementHubViewSchema.safeParse({ groups: [], entryCard: null })
        .success,
      true
    );
    assert.strictEqual(
      ManagementHubViewSchema.safeParse({
        groups: [{ key: "g", label: "l", rows: [] }],
        entryCard: { key: "k", label: "l", description: "d", href: "/x" },
      }).success,
      true
    );
    assert.strictEqual(
      MembersSearchResultSchema.safeParse({ members: [] }).success,
      true
    );
    assert.strictEqual(
      AccountDirectoryViewSchema.safeParse({
        accounts: [],
        nextCursor: null,
        summary: { total: 0, active: 0, elevated: 0, pending: 0 },
      }).success,
      true
    );
  });
  test("attention and notification unions discriminate on kind", () => {
    const base = {
      program_id: "p",
      program_name: "n",
      department_id: "d",
      department_name: "m",
    };
    assert.strictEqual(
      ManagementAttentionViewSchema.safeParse({
        programs: [],
        items: [{ ...base, kind: "enrollment", actionable: true, count: 2 }],
        total_actionable_count: 2,
        has_more: false,
      }).success,
      true
    );
    assert.strictEqual(
      ManagementNotificationsViewSchema.safeParse({
        items: [
          {
            ...base,
            read: false,
            source_key: "k",
            source_revision: "1",
            kind: "event",
            actionable: false,
            event_id: "e",
            starts_at: "2026-09-01T00:00:00.000Z",
            status: "Active",
            availability: "Active",
            name: null,
            updated_at: "2026-09-01T00:00:00.000Z",
          },
        ],
        unread_count: 1,
        has_more: false,
      }).success,
      true
    );
    assert.strictEqual(
      MarkedCountSchema.safeParse({ marked_count: 3 }).success,
      true
    );
  });
  test("notices, catalog, detail, artifact, cockpit shapes", () => {
    const notice = {
      notice_id: "n",
      kind: "account",
      title: "t",
      body: "b",
      program_id: null,
      event_id: null,
      read_at: null,
      created_at: 1_700_000_000_000,
    };
    assert.strictEqual(
      ParticipantNoticesViewSchema.safeParse({
        notices: [notice],
        unread_count: 1,
      }).success,
      true
    );
    assert.strictEqual(
      NoticeCreateResponseSchema.safeParse({ notice }).success,
      true
    );
    assert.strictEqual(
      ParticipantCatalogSchema.safeParse({ catalog: [] }).success,
      true
    );
    assert.strictEqual(
      ParticipantProgramDetailSchema.safeParse({
        detail: {
          program: {
            program_id: "p",
            department_id: "d",
            name: "n",
            description: null,
            category: null,
            behavior_type: "Recurring",
            lifecycle: "Active",
            discoverability: "Listed",
            enrollment_mode: "MemberRequest",
            display_order: 0,
            created_at: "2026-09-01T00:00:00.000Z",
            updated_at: "2026-09-01T00:00:00.000Z",
          },
          department: {
            department_id: "d",
            code: "c",
            name: "n",
            description: null,
            lifecycle: "Active",
            display_order: 0,
          },
          schedule_rules: [],
          events: [],
          enrollment: null,
          enrollment_access: "Eligible",
        },
      }).success,
      true
    );
    assert.strictEqual(
      ProgramAttendanceArtifactSchema.safeParse({
        artifact: {
          program_id: "p",
          program_name: "n",
          check_in_token: "t",
          can_rotate: true,
        },
      }).success,
      true
    );
    assert.strictEqual(
      ProgramTokenRotationSchema.safeParse({
        rotation: { program_id: "p", check_in_token: "t", idempotent: false },
      }).success,
      true
    );
    assert.strictEqual(
      ManagementCockpitViewSchema.safeParse({
        cockpit: {
          program_id: "p",
          updated_at: "2026-09-01T00:00:00.000Z",
          next_event: null,
          open_events: [],
          active_event_count: 0,
          pending_enrollment_count: 0,
        },
      }).success,
      true
    );
  });
});
