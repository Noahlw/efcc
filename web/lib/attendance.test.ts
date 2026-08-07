import { describe, expect, test } from "vitest";

import { normalizeGuestPhone } from "./attendance";
import { COPY, errorCopyFor } from "./copy";
import { scannerEntryPath } from "./guest-context";

describe("guest phone normalization", () => {
  test("treats Hong Kong local and +852 forms as one duplicate key", () => {
    expect(normalizeGuestPhone("9123 4567")).toBe("hk:85291234567");
    expect(normalizeGuestPhone("+852 9123-4567")).toBe("hk:85291234567");
  });

  test("accepts flexible international numbers without guessing a country", () => {
    expect(normalizeGuestPhone("+44 20 7946 0958")).toBe("intl:442079460958");
  });

  test("rejects ambiguous or malformed numbers", () => {
    expect(normalizeGuestPhone("abc")).toBeNull();
    expect(normalizeGuestPhone("123456")).toBeNull();
  });
});

describe("check-in credential handoff routing", () => {
  test("routes a program token back to the QR param", () => {
    expect(scannerEntryPath({ kind: "program_token", value: "tok-1" })).toBe(
      "/scanner?program_token=tok-1"
    );
  });

  test("routes a manual code back to the manual_code param", () => {
    expect(scannerEntryPath({ kind: "manual_code", value: "A7B9C2" })).toBe(
      "/scanner?manual_code=A7B9C2"
    );
  });

  test("encodes values that are not URL-safe", () => {
    expect(scannerEntryPath({ kind: "manual_code", value: "a b&c=" })).toBe(
      "/scanner?manual_code=a%20b%26c%3D"
    );
  });
});

describe("attendance error copy mapping", () => {
  test("maps Event lifecycle problems to their messages", () => {
    expect(errorCopyFor("EVENT_CANCELLED")).toBe(
      COPY.attendance.eventCancelled
    );
    expect(errorCopyFor("CHECK_IN_CLOSED")).toBe(COPY.attendance.eventClosed);
    expect(errorCopyFor("CHECK_IN_NOT_FOUND")).toBe(COPY.error.notFound);
  });

  test("maps check-in attempt problems to their messages", () => {
    expect(errorCopyFor("INVALID_CHECK_IN_ENTRY")).toBe(
      COPY.attendance.invalidEntry
    );
    expect(errorCopyFor("ENROLLMENT_REQUIRED")).toBe(
      COPY.attendance.enrollmentRequired
    );
    expect(errorCopyFor("RATE_LIMITED")).toBe(COPY.attendance.rateLimited);
    expect(errorCopyFor("DUPLICATE_ATTENDANCE")).toBe(
      COPY.attendance.guestDuplicate
    );
  });
});
