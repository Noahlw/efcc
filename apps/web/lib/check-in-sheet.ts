/**
 * Event Check-In Sheet content (Spec 081 US 37): the permanent Program QR and
 * the current Event Manual Check-In Code, printable/downloadable together.
 * Building the sheet is pure (payload in, rows out) so the print handler stays
 * a thin DOM wrapper and the QR rendering is unit-testable.
 */

import { COPY } from "./copy";

export interface CheckInSheetRow {
  label: string;
  value: string | null;
}

export interface CheckInSheet {
  programName: string;
  startsAtLabel: string;
  rows: CheckInSheetRow[];
  /** QR data URL for the guest check-in deep link (the only place the full
   * URL appears on the sheet; the printed plaintext rows carry the
   * human-enterable manual code instead so a long URL cannot wrap ugly). */
  qrDataUrl: string;
  manualCode: string;
}

export async function buildCheckInSheet(input: {
  programName: string;
  startsAtLabel: string;
  checkInUrl: string;
  manualCode: string;
  renderQr: (text: string) => string | Promise<string>;
}): Promise<CheckInSheet> {
  const qr = await input.renderQr(input.checkInUrl);
  const { attendance } = COPY;
  return {
    programName: input.programName,
    startsAtLabel: input.startsAtLabel,
    rows: [
      { label: input.programName, value: null },
      { label: input.startsAtLabel, value: null },
      {
        label: attendance.sheetMethod,
        value: attendance.sheetScanInstruction,
      },
      { label: attendance.sheetManualCode, value: input.manualCode },
    ],
    qrDataUrl: qr,
    manualCode: input.manualCode,
  };
}
