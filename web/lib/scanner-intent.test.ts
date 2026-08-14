import { describe, expect, test } from "vitest";

import { buildScannerHref, parseScannerIntent } from "@/lib/scanner-intent";

describe("scanner intent", () => {
  test("defaults to Self without an explicit mode", () => {
    expect(parseScannerIntent("")).toStrictEqual({
      mode: "self",
      eventId: null,
      malformed: false,
    });
  });

  test("accepts an Assisted event intent only for a safe opaque id", () => {
    expect(parseScannerIntent("?mode=assisted&event=event-123")).toStrictEqual({
      mode: "assisted",
      eventId: "event-123",
      malformed: false,
    });
  });

  test("rejects malformed or cross-mode event intent", () => {
    expect(
      parseScannerIntent("?mode=assisted&event=bad%2Fscope").malformed
    ).toBeTruthy();
    expect(
      parseScannerIntent("?mode=self&event=event-123").malformed
    ).toBeTruthy();
    expect(parseScannerIntent("?mode=unknown").malformed).toBeTruthy();
  });

  test("builds an explicit same-origin mode URL", () => {
    expect(buildScannerHref("assisted", "event-123")).toBe(
      "/scanner?mode=assisted&event=event-123"
    );
    expect(buildScannerHref("self")).toBe("/scanner?mode=self");
  });
});
