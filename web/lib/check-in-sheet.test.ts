import { describe, expect, test } from "vitest";

import { buildCheckInSheet } from "./check-in-sheet";

describe(buildCheckInSheet, () => {
  test("embeds the QR image of the check-in URL and the manual code", async () => {
    const sheet = await buildCheckInSheet({
      programName: "青崇",
      startsAtLabel: "2026-08-07 19:00",
      checkInUrl: "https://efcc.example/guest-check-in?program_token=tok-1",
      manualCode: "A7B9C2",
      renderQr: (text) => `data:image/png;base64,${text}`,
    });
    expect(sheet.qrDataUrl).toContain("program_token=tok-1");
    expect(sheet.rows).toStrictEqual([
      { label: "青崇", value: null },
      { label: "2026-08-07 19:00", value: null },
      {
        label: "Program QR URL",
        value: "https://efcc.example/guest-check-in?program_token=tok-1",
      },
      { label: "Event Manual Code", value: "A7B9C2" },
    ]);
  });

  test("renders a real QR data URL through the qrcode encoder", async () => {
    const { qrDataUrl } = await import("./qr");
    const sheet = await buildCheckInSheet({
      programName: "青崇",
      startsAtLabel: "2026-08-07 19:00",
      checkInUrl: "https://efcc.example/guest-check-in?program_token=tok-2",
      manualCode: "C3D4E5",
      renderQr: qrDataUrl,
    });
    expect(sheet.qrDataUrl.startsWith("data:image/")).toBeTruthy();
  });
});
