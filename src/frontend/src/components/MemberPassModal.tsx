// Full-screen high-contrast display of the member QR pass.
// Renders a real, scannable QR code encoding qrCodeString so the Task 5
// camera scanner (html5-qrcode) can decode it during check-in.
import { useEffect, useState, type CSSProperties } from "react";
import QRCode from "qrcode";

type Props = {
  memberName: string;
  qrCodeString: string;
  onClose: () => void;
};

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(2, 6, 23, 0.85)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1.5rem",
  zIndex: 1000,
};

const cardStyle: CSSProperties = {
  background: "#fff",
  borderRadius: "1.25rem",
  padding: "2rem",
  maxWidth: "26rem",
  width: "100%",
  textAlign: "center",
  boxShadow: "0 24px 64px rgba(2, 6, 23, 0.35)",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: "1.5rem",
  fontWeight: 700,
  color: "#0f172a",
};

const subtitleStyle: CSSProperties = {
  margin: "0.25rem 0 1.5rem",
  fontSize: "0.9rem",
  color: "#64748b",
};

const qrFrameStyle: CSSProperties = {
  margin: "0 auto",
  width: "18rem",
  height: "18rem",
  background: "#fff",
  border: "4px solid #0f172a",
  borderRadius: "0.75rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0.75rem",
  boxSizing: "border-box",
};

const qrImageStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  imageRendering: "pixelated",
};

const closeStyle: CSSProperties = {
  marginTop: "1.5rem",
  width: "100%",
  padding: "0.85rem",
  borderRadius: "0.75rem",
  border: "none",
  background: "#0f172a",
  color: "#fff",
  fontSize: "1rem",
  fontWeight: 600,
  cursor: "pointer",
};

const codeStyle: CSSProperties = {
  marginTop: "1rem",
  fontFamily: "monospace",
  fontSize: "0.75rem",
  color: "#94a3b8",
  wordBreak: "break-all",
};

export function MemberPassModal({ memberName, qrCodeString, onClose }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setQrDataUrl(null);
    setQrError(false);
    QRCode.toDataURL(qrCodeString, {
      width: 480,
      margin: 1,
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [qrCodeString]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`QR Pass for ${memberName}`}
      style={backdropStyle}
      onClick={onClose}
      data-testid="member-pass-modal"
    >
      <div style={cardStyle} onClick={(event) => event.stopPropagation()}>
        <h2 style={titleStyle}>{memberName}</h2>
        <p style={subtitleStyle}>Member Check-In Pass</p>
        <div style={qrFrameStyle} data-testid="member-pass-qr">
          {qrDataUrl && !qrError ? (
            <img
              src={qrDataUrl}
              alt={`QR code for ${memberName}`}
              style={qrImageStyle}
            />
          ) : qrError ? (
            <span aria-hidden="true">QR generation failed.</span>
          ) : (
            <span aria-hidden="true">Generating QR…</span>
          )}
        </div>
        <div style={codeStyle} data-testid="member-pass-code">
          {qrCodeString}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={closeStyle}
          autoFocus
          data-testid="member-pass-close"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default MemberPassModal;
