import QRCode from "qrcode";
// Full-screen high-contrast display of the member QR pass.
// Renders a real, scannable QR code encoding qrCodeString so the Task 5
// camera scanner (html5-qrcode) can decode it during check-in.
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

interface Props {
  memberName: string;
  qrCodeString: string;
  onClose: () => void;
}

const backdropStyle: CSSProperties = {
  alignItems: "center",
  background: "rgba(2, 6, 23, 0.85)",
  display: "flex",
  inset: 0,
  justifyContent: "center",
  padding: "1.5rem",
  position: "fixed",
  zIndex: 1000,
};

const cardStyle: CSSProperties = {
  background: "#fff",
  borderRadius: "1.25rem",
  boxShadow: "0 24px 64px rgba(2, 6, 23, 0.35)",
  maxWidth: "26rem",
  padding: "2rem",
  textAlign: "center",
  width: "100%",
};

const titleStyle: CSSProperties = {
  color: "#0f172a",
  fontSize: "1.5rem",
  fontWeight: 700,
  margin: 0,
};

const subtitleStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "0.875rem",
  marginTop: "0.25rem",
};

const qrFrameStyle: CSSProperties = {
  alignItems: "center",
  background: "#f8fafc",
  borderRadius: "0.75rem",
  display: "flex",
  height: "280px",
  justifyContent: "center",
  margin: "1.5rem 0",
  padding: "1rem",
  width: "100%",
};

const qrImageStyle: CSSProperties = {
  height: "240px",
  objectFit: "contain",
  width: "240px",
};

const closeStyle: CSSProperties = {
  background: "#2563eb",
  border: "none",
  borderRadius: "0.5rem",
  color: "#fff",
  cursor: "pointer",
  fontSize: "1rem",
  fontWeight: 600,
  marginTop: "1.25rem",
  padding: "0.75rem 1.5rem",
  width: "100%",
};

const codeStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "0.75rem",
  marginTop: "1rem",
  wordBreak: "break-all",
};

export function MemberPassModal({ memberName, qrCodeString, onClose }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setQrDataUrl(null);
    setQrError(false);

    const generateQr = async () => {
      try {
        const url = await QRCode.toDataURL(qrCodeString, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 480,
        });
        if (!cancelled) {
          setQrDataUrl(url);
        }
      } catch {
        if (!cancelled) {
          setQrError(true);
        }
      }
    };

    void generateQr();

    return () => {
      cancelled = true;
    };
  }, [qrCodeString]);

  const renderQrContent = () => {
    if (qrDataUrl && !qrError) {
      return (
        <img
          src={qrDataUrl}
          alt={`QR code for ${memberName}`}
          style={qrImageStyle}
        />
      );
    }
    if (qrError) {
      return <span aria-hidden="true">QR generation failed.</span>;
    }
    return <span aria-hidden="true">Generating QR…</span>;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`QR Pass for ${memberName}`}
      style={backdropStyle}
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose();
        }
      }}
      data-testid="member-pass-modal"
    >
      <div style={cardStyle} onClick={(event) => event.stopPropagation()}>
        <h2 style={titleStyle}>{memberName}</h2>
        <p style={subtitleStyle}>Member Check-In Pass</p>
        <div style={qrFrameStyle} data-testid="member-pass-qr">
          {renderQrContent()}
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
