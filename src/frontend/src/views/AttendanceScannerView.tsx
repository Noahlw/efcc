import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { apiService } from "../services/api";
import { ManualSearchInput } from "../components/ManualSearchInput";
import type { Event } from "../types";

interface Props {
  grantedUserId: string;
  sessionToken: string;
  onBack: () => void;
}

type ScanResult =
  | { type: "success"; memberName?: string; checkInTime: string }
  | { type: "duplicate"; checkInTime: string; message: string }
  | { type: "notEnrolled"; memberId: string; memberName: string }
  | { type: "error"; message: string };

const SCANNER_DIV_ID = "qr-scanner-element";

const containerStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #eef2ff 0%, #f8fafc 100%)",
  fontFamily: "system-ui, sans-serif",
  padding: 24,
  boxSizing: "border-box",
};

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  backBtn: {
    padding: "8px 16px",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    background: "#fff",
    cursor: "pointer",
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "#475569",
  },
  title: { margin: 0, fontSize: "1.4rem", fontWeight: 700, color: "#0f172a" },
  selector: {
    width: "100%",
    padding: "10px 12px",
    fontSize: "1rem",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    background: "#fff",
    marginBottom: 16,
    boxSizing: "border-box",
  },
  scannerWrap: {
    width: "100%",
    maxWidth: 400,
    margin: "0 auto 16px",
    borderRadius: 12,
    overflow: "hidden",
    border: "2px solid #e2e8f0",
    background: "#f8fafc",
  },
  scannerPlaceholder: {
    width: "100%",
    aspectRatio: "1 / 1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#94a3b8",
    fontSize: "0.9rem",
    textAlign: "center" as const,
    padding: 24,
    boxSizing: "border-box",
  },
  resultCard: {
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    textAlign: "center" as const,
  },
  successCard: {
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
  },
  duplicateCard: {
    background: "#fefce8",
    border: "1px solid #fde68a",
  },
  errorCard: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
  },
  resultIcon: { fontSize: "2rem", marginBottom: 8 },
  resultTitle: { margin: "0 0 4px", fontSize: "1.1rem", fontWeight: 700 },
  resultMeta: { margin: 0, fontSize: "0.85rem", color: "#475569" },
  quickEnrollBtn: {
    marginTop: 12,
    padding: "8px 20px",
    border: "none",
    borderRadius: 8,
    background: "#8b5cf6",
    color: "#fff",
    fontSize: "0.9rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  resetBtn: {
    marginTop: 8,
    padding: "6px 16px",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    background: "#fff",
    cursor: "pointer",
    fontSize: "0.8rem",
    color: "#475569",
  },
  sectionLabel: {
    display: "block",
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "#475569",
    marginBottom: 6,
  },
  scanHint: {
    marginTop: 16,
    marginBottom: 0,
    fontSize: "0.85rem",
    color: "#64748b",
    textAlign: "center" as const,
  },
};

function getEventLabel(event: Event): string {
  return `${event.eventName} — ${event.eventDate} ${event.timeSlot}`;
}

export function AttendanceScannerView({
  grantedUserId,
  sessionToken,
  onBack,
}: Props) {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [scannerReady, setScannerReady] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [enrollingMemberId, setEnrollingMemberId] = useState<string | null>(
    null
  );
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerRunning = useRef(false);

  // Load events on mount
  useEffect(() => {
    let cancelled = false;
    apiService
      .getGrantedUserEvents(grantedUserId, sessionToken)
      .then((res) => {
        if (!cancelled && res.success && res.data) {
          setEvents(res.data);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [grantedUserId, sessionToken]);

  // Stop scanner helper
  const stopScanner = useCallback(async () => {
    if (scannerRef.current && scannerRunning.current) {
      try {
        await scannerRef.current.stop();
      } catch {
        // ignore stop errors
      }
      scannerRunning.current = false;
    }
  }, []);

  // Start scanner when event is selected
  useEffect(() => {
    if (!selectedEventId) {
      setScannerReady(false);
      stopScanner().catch(() => {});
      return;
    }

    let cancelled = false;
    const div = document.getElementById(SCANNER_DIV_ID);
    if (!div) return;

    const scanner = new Html5Qrcode(SCANNER_DIV_ID);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          // On decode — stop scanner, call check-in
          await stopScanner();
          if (cancelled) return;
          handleCheckIn(decodedText, "QR");
        },
        () => {
          // Scan error callback (continuous feedback, ignore)
        }
      )
      .then(() => {
        if (!cancelled) {
          scannerRunning.current = true;
          setScannerReady(true);
        }
      })
      .catch(() => {
        // Camera permission denied or unavailable
        if (!cancelled) setScannerReady(false);
      });

    return () => {
      cancelled = true;
      stopScanner().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId, sessionToken]);

  const handleCheckIn = async (memberId: string, method: "QR" | "MANUAL") => {
    setScanResult(null);
    try {
      const res = await apiService.checkInMember({
        eventId: selectedEventId,
        userId: memberId,
        method,
        staffId: grantedUserId,
        sessionToken,
      });

      if (res.success) {
        setScanResult({
          type: "success",
          memberName: res.data?.memberName ?? memberId,
          checkInTime: res.data?.checkInTime ?? new Date().toISOString(),
        });
      } else if (res.notEnrolled) {
        setScanResult({
          type: "notEnrolled",
          memberId: res.data?.memberId ?? memberId,
          memberName: res.data?.memberName ?? memberId,
        });
      } else if (res.duplicate) {
        setScanResult({
          type: "duplicate",
          checkInTime: res.data?.checkInTime ?? "",
          message: res.message ?? "Already checked in.",
        });
      } else {
        setScanResult({
          type: "error",
          message: res.message ?? "Check-in failed.",
        });
      }
    } catch (err: unknown) {
      setScanResult({
        type: "error",
        message:
          err instanceof Error ? err.message : "An unexpected error occurred.",
      });
    }
  };

  const handleManualCheckIn = (memberId: string, _memberName: string) => {
    void _memberName;
    handleCheckIn(memberId, "MANUAL");
  };

  const handleQuickEnroll = async () => {
    if (!scanResult || scanResult.type !== "notEnrolled") return;
    const memberId = scanResult.memberId;
    const currentEvent = events.find((e) => e.eventId === selectedEventId);
    if (!currentEvent) {
      setScanResult({ type: "error", message: "Selected event not found." });
      return;
    }
    setEnrollingMemberId(memberId);
    try {
      const enrollRes = await apiService.staffEnrollMember(
        grantedUserId,
        memberId,
        currentEvent.programId,
        sessionToken
      );
      if (!enrollRes.success) {
        setScanResult({
          type: "error",
          message: enrollRes.message || "Enrollment failed.",
        });
        return;
      }
      await handleCheckIn(memberId, "MANUAL");
    } catch (err: unknown) {
      setScanResult({
        type: "error",
        message:
          err instanceof Error ? err.message : "Enrollment failed.",
      });
    } finally {
      setEnrollingMemberId(null);
    }
  };

  const handleReset = () => {
    setScanResult(null);
    // Restart scanner if an event is selected
    if (selectedEventId) {
      // The scanner effect will re-run because we need to trigger it
      // Reload the scanner by toggling state via re-running effect
      stopScanner().catch(() => {});
      scannerRunning.current = false;
      setScannerReady(false);
      // Re-trigger: force re-mount of scanner div
      // Use a key or timer approach
      const div = document.getElementById(SCANNER_DIV_ID);
      if (div) {
        const scanner = new Html5Qrcode(SCANNER_DIV_ID);
        scannerRef.current = scanner;
        scanner
          .start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            async (decodedText) => {
              await stopScanner();
              handleCheckIn(decodedText, "QR");
            },
            () => {}
          )
          .then(() => {
            scannerRunning.current = true;
            setScannerReady(true);
          })
          .catch(() => setScannerReady(false));
      }
    }
  };

  return (
    <div style={containerStyle}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onBack}>
          &larr; Back
        </button>
        <h1 style={styles.title}>Attendance Scanner</h1>
      </div>

      <select
        style={styles.selector}
        value={selectedEventId}
        onChange={(e) => {
          setSelectedEventId(e.target.value);
          setScanResult(null);
        }}
      >
        <option value="">Select an event...</option>
        {events.map((ev) => (
          <option key={ev.eventId} value={ev.eventId}>
            {getEventLabel(ev)}
          </option>
        ))}
      </select>

      {/* Scanner zone */}
      {selectedEventId && !scanResult && (
        <div style={styles.scannerWrap}>
          <div id={SCANNER_DIV_ID}>
            {!scannerReady && (
              <div style={styles.scannerPlaceholder}>
                {scannerRunning.current === null
                  ? "Initialising camera..."
                  : "Camera starting or unavailable. Grant camera permission."}
              </div>
            )}
          </div>
          <p style={styles.scanHint}>
            Point camera at member's QR pass to check in
          </p>
        </div>
      )}

      {/* Scan result */}
      {scanResult && (
        <div
          style={{
            ...styles.resultCard,
            ...(scanResult.type === "success"
              ? styles.successCard
              : scanResult.type === "duplicate"
                ? styles.duplicateCard
                : styles.errorCard),
          }}
        >
          {scanResult.type === "success" && (
            <>
              <div style={styles.resultIcon}>&#10003;</div>
              <p style={{ ...styles.resultTitle, color: "#16a34a" }}>
                Checked In
              </p>
              {scanResult.memberName && (
                <p style={styles.resultMeta}>{scanResult.memberName}</p>
              )}
              <p style={styles.resultMeta}>
                {new Date(scanResult.checkInTime).toLocaleTimeString()}
              </p>
            </>
          )}
          {scanResult.type === "duplicate" && (
            <>
              <div style={styles.resultIcon}>&#9432;</div>
              <p style={{ ...styles.resultTitle, color: "#ca8a04" }}>
                Already Checked In
              </p>
              <p style={styles.resultMeta}>{scanResult.message}</p>
              {scanResult.checkInTime && (
                <p style={styles.resultMeta}>
                  Checked in at:{" "}
                  {new Date(scanResult.checkInTime).toLocaleTimeString()}
                </p>
              )}
            </>
          )}
          {scanResult.type === "notEnrolled" && (
            <>
              <div style={styles.resultIcon}>&#9888;</div>
              <p style={{ ...styles.resultTitle, color: "#9333ea" }}>
                Member Not Enrolled
              </p>
              <p style={styles.resultMeta}>{scanResult.memberName}</p>
              <p style={styles.resultMeta}>
                This member is not enrolled in any program for this event.
              </p>
              <button
                type="button"
                style={styles.quickEnrollBtn}
                onClick={handleQuickEnroll}
                disabled={enrollingMemberId === scanResult.memberId}
              >
                {enrollingMemberId === scanResult.memberId
                  ? "Enrolling..."
                  : "Quick Enroll"}
              </button>
            </>
          )}
          {scanResult.type === "error" && (
            <>
              <div style={styles.resultIcon}>&#10007;</div>
              <p style={{ ...styles.resultTitle, color: "#dc2626" }}>
                Check-In Failed
              </p>
              <p style={styles.resultMeta}>{scanResult.message}</p>
            </>
          )}
          <div>
            <button type="button" style={styles.resetBtn} onClick={handleReset}>
              Scan Another
            </button>
          </div>
        </div>
      )}

      {/* Manual search fallback */}
      {selectedEventId && (
        <ManualSearchInput
          grantedUserId={grantedUserId}
          sessionToken={sessionToken}
          onCheckIn={handleManualCheckIn}
          disabled={!!scanResult}
        />
      )}
    </div>
  );
}

export default AttendanceScannerView;
