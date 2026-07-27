// Full-screen high-contrast display of the member QR pass.
// Per Task 2: visual placeholder — real QR generation is intentionally out of scope.
import type { CSSProperties } from "react";

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
  width: "100%",
  maxWidth: "32rem",
  padding: "2rem",
  borderRadius: "1rem",
  background: "#f8fafc",
  color: "#0f172a",
  textAlign: "center",
  fontFamily: "system-ui, sans-serif",
  boxShadow: "0 20px 50px rgba(15, 23, 42, 0.4)",
};

const titleStyle: CSSProperties = {
  margin: "0 0 0.25rem",
  fontSize: "1.5rem",
  fontWeight: 700,
};

const subtitleStyle: CSSProperties = {
  margin: "0 0 1.5rem",
  color: "#475569",
  fontSize: "0.95rem",
};

const qrFrameStyle: CSSProperties = {
  margin: "0 auto",
  width: "18rem",
  height: "18rem",
  background: "#fff",
  border: "4px solid #0f172a",
  borderRadius: "0.75rem",
  display: "grid",
  gridTemplateColumns: "repeat(8, 1fr)",
  gridTemplateRows: "repeat(8, 1fr)",
  padding: "0.75rem",
  gap: "2px",
  boxSizing: "border-box",
};

const cellStyle = (on: boolean): CSSProperties => ({
  background: on ? "#0f172a" : "transparent",
  borderRadius: "2px",
});

// Deterministic pseudo-random pattern from the qrCodeString so each member gets a stable shape.
// Real QR generation is intentionally out of scope (Task 2 Non-goals).
function buildQrPattern(seed: string): boolean[] {
  const pattern = new Array<boolean>(64).fill(false);
  let h = 2166136261 >>> 0; // FNV-1a 32-bit offset
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  for (let i = 0; i < 64; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    pattern[i] = (h & 1) === 1;
  }
  // The three "finder" squares always stay on for visual familiarity.
  const finderIndices = [
    0,
    1,
    2,
    8,
    9,
    10,
    16,
    17,
    18,
    5,
    6,
    7,
    13,
    14,
    15,
    2 * 8 + 5,
    2 * 8 + 6,
    2 * 8 + 7,
    3 * 8 + 5,
    3 * 8 + 6,
    3 * 8 + 7,
    5 * 8 + 0,
    5 * 8 + 1,
    5 * 8 + 2,
    6 * 8 + 0,
    6 * 8 + 1,
    6 * 8 + 2,
    5 * 8 + 5,
    5 * 8 + 6,
    5 * 8 + 7,
    6 * 8 + 5,
    6 * 8 + 6,
    6 * 8 + 7,
  ];
  for (const idx of finderIndices) pattern[idx] = true;
  return pattern;
}

const closeStyle: CSSProperties = {
  marginTop: "1.5rem",
  padding: "0.75rem 1.25rem",
  borderRadius: "0.5rem",
  border: "none",
  background: "#0f172a",
  color: "#fff",
  fontWeight: 600,
  fontSize: "1rem",
  cursor: "pointer",
};

const codeStyle: CSSProperties = {
  marginTop: "1rem",
  fontFamily: "monospace",
  fontSize: "0.85rem",
  color: "#334155",
  wordBreak: "break-all",
};

export function MemberPassModal({ memberName, qrCodeString, onClose }: Props) {
  const pattern = buildQrPattern(qrCodeString);
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
        <div style={qrFrameStyle} aria-hidden="true">
          {pattern.map((on, index) => (
            <div key={index} style={cellStyle(on)} />
          ))}
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
