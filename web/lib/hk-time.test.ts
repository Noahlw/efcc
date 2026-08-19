import { describe, expect, test } from "vitest";

import {
  hkShortDateLabel,
  hkShortTimeLabel,
  hkShortTimeRange,
} from "@/lib/hk-time";

describe("hk short date/time labels", () => {
  test("formats the design idiom 8月20日（四） / 晚上 7:30", () => {
    // 2026-08-20T11:30:00.000Z = 19:30 HKT on Thursday.
    expect(hkShortDateLabel("2026-08-20T11:30:00.000Z")).toBe("8月20日（四）");
    expect(hkShortTimeLabel("2026-08-20T11:30:00.000Z")).toBe("晚上 7:30");
  });

  test("uses 早上 before noon and 下午 from noon until 6pm", () => {
    expect(hkShortTimeLabel("2026-08-20T00:30:00.000Z")).toBe("早上 8:30");
    expect(hkShortTimeLabel("2026-08-20T04:00:00.000Z")).toBe("下午 12:00");
    expect(hkShortTimeLabel("2026-08-20T09:59:00.000Z")).toBe("下午 5:59");
  });

  test("collapses a same-period range to one 晚上/下午/早上 prefix", () => {
    expect(
      hkShortTimeRange("2026-08-20T11:30:00.000Z", "2026-08-20T13:00:00.000Z")
    ).toBe("晚上 7:30–9:00");
  });

  test("keeps both prefixes when the range crosses 下午 into 晚上", () => {
    expect(
      hkShortTimeRange("2026-08-20T09:59:00.000Z", "2026-08-20T11:30:00.000Z")
    ).toBe("下午 5:59–晚上 7:30");
  });
});
