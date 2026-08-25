"use client";

import { useEffect, useRef, useState } from "react";

import { RpcError } from "@/lib/api";
import type { AttendanceEvent } from "@/lib/attendance";
import { attendanceEventLabel } from "@/lib/attendance-display";
import {
  CameraFirstScanner,
  ScannerCheckinResult,
  ScannerChooser,
  ScannerConfirmation,
  ScannerOutcome,
  ScannerStatusOutput,
} from "@/lib/attendance-scanner-ui";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { selfCheckIn } from "@/lib/programs/program-api";
import { buildProgramsHref } from "@/lib/programs/programs-intent";
import { useAttendanceFlow } from "@/lib/use-attendance-flow";

import styles from "./attendance-panel.module.css";

interface CheckinResult {
  kind: "success" | "duplicate";
  event: AttendanceEvent;
}

const KNOWN_SUBMIT_ERROR_CODES = [
  "AUTH_REQUIRED",
  "CHECK_IN_CLOSED",
  "CONFLICT",
  "DUPLICATE_ATTENDANCE",
  "ENROLLMENT_REQUIRED",
  "EVENT_CANCELLED",
  "EVENT_UNAVAILABLE",
  "FORBIDDEN",
  "INVALID_CHECK_IN_ENTRY",
  "NOT_FOUND",
  "RATE_LIMITED",
  "VALIDATION",
] as const;
function replaceWithPlainScanner() {
  window.history.replaceState(null, "", "/scanner");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export const SelfCheckInPanel = ({
  title = COPY.attendance.scanTitle,
}: {
  title?: string;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const scanHeadingRef = useRef<HTMLHeadingElement>(null);
  const fallbackHeadingRef = useRef<HTMLHeadingElement>(null);
  const chooserHeadingRef = useRef<HTMLHeadingElement>(null);
  const confirmationHeadingRef = useRef<HTMLHeadingElement>(null);
  const outcomeHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const cameraAnnouncementRef = useRef<"opening" | "live" | null>(null);
  const autoStartRef = useRef(false);
  const [isPhone, setIsPhone] = useState(false);
  const [hasDeepLink, setHasDeepLink] = useState(false);
  const [deepLinkChecked, setDeepLinkChecked] = useState(false);
  const [scanStopped, setScanStopped] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [confirmationError, setConfirmationError] = useState("");
  const [checkinResult, setCheckinResult] = useState<CheckinResult | null>(
    null
  );
  const [showChooser, setShowChooser] = useState(false);
  const [retryAvailable, setRetryAvailable] = useState(false);
  const flow = useAttendanceFlow(inputRef, {
    cameraFirst: true,
    phoneOnly: true,
    reportCameraUnavailable: true,
  });

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      setIsPhone(true);
      return;
    }
    const media = window.matchMedia("(max-width: 799.98px)");
    const sync = () => setIsPhone(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setHasDeepLink(
      Boolean(
        params.get("event") ||
        params.get("program_token") ||
        params.get("manual_code")
      )
    );
    setDeepLinkChecked(true);
  }, []);
  useEffect(() => {
    if (
      !deepLinkChecked ||
      !isPhone ||
      hasDeepLink ||
      scanStopped ||
      flow.cameraUnavailable ||
      flow.cameraAvailable !== true ||
      autoStartRef.current
    ) {
      return;
    }
    autoStartRef.current = true;
    cameraAnnouncementRef.current = "opening";
    announce(COPY.attendance.cameraOpening);
    flow.startCamera();
    // The flow owns the stable camera callback refs; this effect is the one
    // camera-first entry trigger and must not restart on callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    flow.cameraAvailable,
    flow.cameraUnavailable,
    deepLinkChecked,
    hasDeepLink,
    isPhone,
    scanStopped,
  ]);

  useEffect(() => {
    if (flow.cameraReady && cameraAnnouncementRef.current !== "live") {
      cameraAnnouncementRef.current = "live";
      announce(COPY.attendance.cameraLiveHint);
    }
    if (!flow.cameraReady && !scanStopped) {
      cameraAnnouncementRef.current = null;
    }
  }, [flow.cameraReady, scanStopped]);

  useEffect(() => {
    if (!isPhone) {
      autoStartRef.current = false;
      if (flow.cameraOpen) {
        flow.stopCamera();
      }
    }
  }, [flow.cameraOpen, isPhone]);

  useEffect(() => {
    if ((flow.view === "chooser" || showChooser) && flow.events.length > 1) {
      chooserHeadingRef.current?.focus();
    } else if (checkinResult) {
      resultHeadingRef.current?.focus();
    } else if (flow.view === "outcome") {
      outcomeHeadingRef.current?.focus();
    } else if (flow.selected) {
      confirmationHeadingRef.current?.focus({ preventScroll: true });
    } else if ((!isPhone || manualOpen || hasDeepLink) && !flow.busy) {
      inputRef.current?.focus();
    } else if (
      isPhone &&
      (scanStopped ||
        flow.cameraUnavailable ||
        flow.cameraAvailable === false) &&
      !flow.busy
    ) {
      fallbackHeadingRef.current?.focus();
    } else if (flow.view === "scan" && !flow.busy) {
      scanHeadingRef.current?.focus();
    }
    // Scalar flow fields are listed deliberately; the flow object is recreated each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    checkinResult,
    flow.busy,
    flow.cameraAvailable,
    flow.cameraUnavailable,
    flow.events.length,
    flow.outcome,
    flow.selected,
    flow.view,
    hasDeepLink,
    isPhone,
    manualOpen,
    scanStopped,
    showChooser,
  ]);

  useEffect(() => {
    if (retryAvailable) {
      retryRef.current?.focus();
    }
  }, [retryAvailable]);

  const handleManualChange = (value: string) => {
    flow.setInput(value.replaceAll(/\D/gu, "").slice(0, 6));
  };

  const handleResolve = () => {
    setCheckinResult(null);
    setConfirmationError("");
    setRetryAvailable(false);
    setShowChooser(false);
    if (!flow.fromQr && !/^\d{6}$/u.test(flow.input)) {
      const message = COPY.attendance.invalidManualCode;
      flow.showStatus(message, "error");
      announce(message);
      inputRef.current?.focus();
      return;
    }
    void flow.resolve(flow.input);
  };

  const selectEvent = (event: Parameters<typeof flow.setSelected>[0]) => {
    setCheckinResult(null);
    setConfirmationError("");
    setRetryAvailable(false);
    setShowChooser(false);
    const shellContent = document.getElementById("shell-content");
    if (shellContent) {
      shellContent.scrollTop = 0;
    }
    flow.setSelected(event);
    setManualOpen(false);
    if (event) {
      const message = attendanceEventLabel(event);
      flow.showStatus(message);
      announce(message);
    }
  };

  async function submit(isRetry = false) {
    const { selected } = flow;
    if (!selected || submitting) {
      return;
    }
    if (!isRetry) {
      setRetryAvailable(false);
    }
    setConfirmationError("");
    // No offline pre-check here (F-03/F-11): an offline submit flows into
    // the same recoverable-failure path below, which shows the offline copy
    // AND keeps the dedicated 重試簽到 control visible and focused.
    setSubmitting(true);
    flow.stopCamera();
    try {
      const credential = flow.fromQr
        ? { program_token: flow.input }
        : { entry: flow.input };
      const result = await selfCheckIn({
        event_id: selected.event_id,
        method: flow.fromQr ? "self_qr_scan" : "self_manual_code",
        ...credential,
      });
      const kind = result.outcome === "duplicate" ? "duplicate" : "success";
      setCheckinResult({ kind, event: selected });
      announce(
        kind === "duplicate"
          ? `${COPY.attendance.duplicateTitle} ${COPY.attendance.duplicateBody}`
          : `${COPY.attendance.successTitle} ${selected.program_name} · ${attendanceEventLabel(selected)}`
      );
    } catch (error) {
      const code = error instanceof RpcError ? error.problem.code : undefined;
      const offline =
        (typeof navigator !== "undefined" && !navigator.onLine) ||
        code === "NETWORK_ERROR";
      const hasSpecificCopy =
        code !== undefined &&
        KNOWN_SUBMIT_ERROR_CODES.includes(
          code as (typeof KNOWN_SUBMIT_ERROR_CODES)[number]
        );
      const message = offline
        ? COPY.attendance.offlineSubmit
        : hasSpecificCopy && error instanceof RpcError
          ? errorCopyFor(error.problem.code, error.problem.detail)
          : COPY.attendance.submitFailure;
      setRetryAvailable(true);
      setConfirmationError(message);
      announce(message);
    } finally {
      setSubmitting(false);
    }
  }

  const backToScan = () => {
    replaceWithPlainScanner();
    setHasDeepLink(false);
    setManualOpen(false);
    setScanStopped(false);
    cameraAnnouncementRef.current = null;
    autoStartRef.current = false;
    setShowChooser(false);
    setCheckinResult(null);
    setConfirmationError("");
    setRetryAvailable(false);
    flow.resetToScan();
  };

  const openManual = () => {
    flow.stopCamera();
    setManualOpen(true);
    setScanStopped(true);
    cameraAnnouncementRef.current = null;
    announce(COPY.attendance.manualCodeLabel);
  };

  const stopScanning = () => {
    flow.stopCamera();
    setScanStopped(true);
    setManualOpen(false);
    cameraAnnouncementRef.current = null;
    // The stop tap scrolls the shell's inner scroller (#shell-content,
    // overflow:auto) toward the stage bottom; reset it — plus the window
    // fallback for the guest surface — so the card lands at the top
    // (was scroller scrollTop=3 → card y=-3 at 320×568).
    requestAnimationFrame(() => {
      document.getElementById("shell-content")?.scrollTo(0, 0);
      window.scrollTo(0, 0);
    });
    announce(COPY.attendance.fallbackLead);
  };

  const retryCamera = () => {
    setScanStopped(false);
    setManualOpen(false);
    autoStartRef.current = true;
    cameraAnnouncementRef.current = "opening";
    announce(COPY.attendance.cameraOpening);
    flow.retryCamera();
  };

  const handleNotThisEvent = () => {
    if (submitting) {
      return;
    }
    setCheckinResult(null);
    setConfirmationError("");
    setRetryAvailable(false);
    if (flow.events.length > 1) {
      flow.setSelected(null);
      setShowChooser(true);
      announce(COPY.attendance.chooseMeeting);
      return;
    }
    backToScan();
  };

  // The manual form composes with or without its own heading: standalone
  // (deep link / manual entry) owns the page header, while the desktop
  // surface already renders one — composing both produced two h1s and the
  // same hint sentence three times. With a heading, the h1 doubles as the
  // input's accessible name and the per-field label/hint duplicates are
  // omitted so screen readers hear the title once.
  const manualForm = (withHeading: boolean) => (
    <form
      noValidate
      className={styles.form}
      data-scanner-state="manual"
      onSubmit={(event) => {
        event.preventDefault();
        handleResolve();
      }}
    >
      {withHeading && (
        <>
          <h1
            ref={scanHeadingRef}
            id="attendance-code-label"
            className={styles.title}
            tabIndex={-1}
          >
            {COPY.attendance.manualCodeLabel}
          </h1>
          <p id="manual-entry-hint" className={styles.lead}>
            {COPY.attendance.manualCodeHint}
          </p>
        </>
      )}
      <label className={styles.field} htmlFor="attendance-code">
        {!withHeading && (
          <span className={styles.fieldLabel}>
            {COPY.attendance.manualCodeLabel}
          </span>
        )}
        <input
          ref={inputRef}
          id="attendance-code"
          className={styles.input}
          value={flow.input}
          onChange={(event) => handleManualChange(event.target.value)}
          placeholder={COPY.attendance.manualCodePlaceholder}
          autoComplete="off"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          aria-labelledby={withHeading ? "attendance-code-label" : undefined}
          aria-describedby="manual-entry-hint"
        />
        {!withHeading && (
          <span id="manual-entry-hint" className={styles.fieldHint}>
            {COPY.attendance.manualCodeHint}
          </span>
        )}
      </label>
      <button
        className={styles.button}
        type="submit"
        disabled={flow.busy || submitting}
        aria-busy={flow.busy || submitting}
      >
        {flow.busy ? COPY.attendance.resolving : COPY.attendance.continue}
      </button>
      <ScannerStatusOutput message={flow.status} tone={flow.tone} />
      {isPhone && (
        <button
          className={styles.buttonSecondary}
          type="button"
          onClick={backToScan}
        >
          {COPY.attendance.backToScan}
        </button>
      )}
    </form>
  );

  if ((flow.view === "chooser" || showChooser) && flow.events.length > 1) {
    return (
      <div className={styles.page}>
        <ScannerChooser
          events={flow.events}
          headingRef={chooserHeadingRef}
          onBack={backToScan}
          onSelect={selectEvent}
        />
      </div>
    );
  }

  if (checkinResult) {
    return (
      <div className={styles.page}>
        <ScannerCheckinResult
          event={checkinResult.event}
          kind={checkinResult.kind}
          headingRef={resultHeadingRef}
          onScanAgain={backToScan}
        />
      </div>
    );
  }

  if (flow.selected) {
    return (
      <div className={styles.page}>
        <ScannerConfirmation
          event={flow.selected}
          headingRef={confirmationHeadingRef}
          busy={submitting}
          error={confirmationError}
          retryAvailable={retryAvailable}
          retryRef={retryRef}
          onRescan={backToScan}
          onSubmit={() => void submit()}
          onRetry={() => void submit(true)}
          onNotThisEvent={handleNotThisEvent}
        />
      </div>
    );
  }

  if (flow.view === "outcome" && flow.outcome) {
    return (
      <div className={styles.page}>
        <ScannerOutcome
          kind={flow.outcome.kind}
          latest={flow.outcome.latest}
          programHref={buildProgramsHref({
            mode: "participant",
            programId: flow.outcome.latest.program_id,
          })}
          headingRef={outcomeHeadingRef}
          onBack={backToScan}
        />
      </div>
    );
  }

  if (!isPhone) {
    return (
      <div className={styles.page} data-scanner-state="desktop-manual">
        <section className={styles.card} aria-labelledby="attendance-title">
          <h1
            id="attendance-title"
            ref={scanHeadingRef}
            className={styles.title}
            tabIndex={-1}
          >
            {title}
          </h1>
          {manualForm(false)}
        </section>
      </div>
    );
  }

  if (!deepLinkChecked || hasDeepLink || manualOpen) {
    return <div className={styles.page}>{manualForm(true)}</div>;
  }

  if (scanStopped || flow.cameraUnavailable || flow.cameraAvailable === false) {
    return (
      <div className={styles.page} data-scanner-state="fallback">
        <section
          className={styles.card}
          aria-labelledby="fallback-methods-title"
        >
          <h1
            ref={fallbackHeadingRef}
            id="fallback-methods-title"
            className={styles.title}
            tabIndex={-1}
          >
            {COPY.attendance.fallbackTitle}
          </h1>
          <p className={styles.lead}>{COPY.attendance.fallbackLead}</p>
          {flow.cameraPermissionDenied && (
            <div className={styles.cameraUnavailable} role="alert">
              <strong>{COPY.attendance.cameraDeniedTitle}</strong>
              <p>{COPY.attendance.cameraDeniedBody}</p>
              <button
                className={styles.button}
                type="button"
                onClick={retryCamera}
              >
                {COPY.attendance.cameraRetry}
              </button>
            </div>
          )}
          {flow.cameraUnsupported && !flow.cameraPermissionDenied && (
            <div className={styles.cameraUnavailable} role="alert">
              <strong>{COPY.attendance.cameraUnsupportedTitle}</strong>
              <p>{COPY.attendance.cameraUnsupportedHint}</p>
            </div>
          )}
          <section
            className={styles.methodSection}
            aria-labelledby="fallback-methods-title"
          >
            <div className={styles.methodGrid}>
              <button
                className={styles.methodCard}
                type="button"
                onClick={openManual}
              >
                <strong>{COPY.attendance.manualMethodTitle}</strong>
                <span>{COPY.attendance.manualMethodHint}</span>
              </button>
              <a className={styles.methodCard} href="/profile?from=scanner">
                <strong>{COPY.attendance.memberQrTitle}</strong>
                <span>{COPY.attendance.memberQrHint}</span>
              </a>
            </div>
          </section>
          {/* Dedicated denied/unsupported alerts above already own these
              messages; the status output still carries resolve/offline
              failures that land on this fallback view. */}
          {!flow.cameraPermissionDenied && !flow.cameraUnsupported && (
            <ScannerStatusOutput message={flow.status} tone={flow.tone} />
          )}
        </section>
      </div>
    );
  }

  return (
    <CameraFirstScanner
      cameraOpen={flow.cameraOpen}
      opening={flow.cameraAvailable !== true || !flow.cameraReady}
      videoRef={flow.videoRef}
      onStop={stopScanning}
    />
  );
};
