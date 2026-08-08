/**
 * QR rendering via the `qrcode` npm package (already a dependency for the
 * profile QrCode component). SVG output — works without a canvas, matching
 * the profile component; used by the printable Event Check-In Sheet (Spec
 * 081 US 37) as a `data:image/svg+xml` URL.
 */

import QRCode from "qrcode";

/** QR SVG data URL for a text payload (e.g. a check-in URL). */
export async function qrDataUrl(text: string): Promise<string> {
  const svg = await QRCode.toString(text, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 4,
  });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
