"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * Scannable QR identity (S5). Renders the member's `qrCodeString` as a real
 * SVG QR code on mount; while the code is being generated (or on failure) it
 * falls back to the raw string so the identity is never blank.
 */
export function QrCode({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toString(value, {
      type: "svg",
      width: 220,
      margin: 1,
      errorCorrectionLevel: "M",
    })
      .then((result) => {
        if (active) {
          setSvg(result);
        }
      })
      .catch(() => {
        if (active) {
          setSvg(null);
        }
      });
    return () => {
      active = false;
    };
  }, [value]);

  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- deliberate labelled img role for injected SVG
    <div role="img" aria-label={label} className={className}>
      {svg ? (
        <span dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <span>{value}</span>
      )}
    </div>
  );
}