import { describe, expect, test } from "vitest";

import { entryFromValue } from "@/lib/attendance-entry";

describe(entryFromValue, () => {
  test("extracts a permanent Program token from a supported QR URL", () => {
    expect(
      entryFromValue(
        "https://efcc.example/guest-check-in?program_token=PROGRAM-QR"
      )
    ).toStrictEqual({ value: "PROGRAM-QR", fromQr: true });
  });

  test("extracts a manual Event code from a supported URL", () => {
    expect(
      entryFromValue("https://efcc.example/guest-check-in?manual_code=ATT1234")
    ).toStrictEqual({ value: "ATT1234", fromQr: false });
  });

  test("keeps bare and malformed values for server-side disambiguation", () => {
    expect(entryFromValue("  ATT1234  ")).toStrictEqual({
      value: "ATT1234",
      fromQr: false,
    });
    expect(entryFromValue("not a URL")).toStrictEqual({
      value: "not a URL",
      fromQr: false,
    });
  });

  test("does not trust unsupported QR payloads as Program tokens", () => {
    expect(entryFromValue("otpauth://totp/EFCC?secret=NOPE")).toStrictEqual({
      value: "otpauth://totp/EFCC?secret=NOPE",
      fromQr: false,
    });
    expect(entryFromValue("   ")).toStrictEqual({ value: "", fromQr: false });
  });
});
