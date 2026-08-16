"use client";

import { useEffect, useRef, useState } from "react";

import type { AttendanceEvent } from "@/lib/attendance";
import { RpcError } from "@/lib/api";
import { attendanceEventLabel } from "@/lib/attendance-display";
import {
  ScannerCamera,
  ScannerCheckinResult,
  ScannerChooser,
  ScannerConfirmation,
  ScannerOutcome,
  ScannerStatusOutput,
  ScannerUnavailableNotice,
} from "@/lib/attendance-scanner-ui";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { buildProgramsHref } from "@/lib/programs/programs-intent";
import { selfCheckIn } from "@/lib/programs/program-api";
import { useAttendanceFlow } from "@/lib/use-attendance-flow";

import styles from "./attendance-panel.module.css";

type CheckinResult = {
  kind: "success" | "duplicate";
  event: AttendanceEvent;
};

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


export const SelfCheckInPanel = ({
  title = COPY.attendance.scanTitle,
}: {
  title?: string;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [confirmationError, setConfirmationError] = useState("");
  const [checkinResult, setCheckinResult] = useState<CheckinResult | null>(
    null
  );
  const [showChooser, setShowChooser] = useState(false);
  const flow = useAttendanceFlow(inputRef, {
    reportCameraUnavailable: true,
  });
  const [retryAvailable, setRetryAvailable] = useState(false);
  const scanHeadingRef = useRef<HTMLHeadingElement>(null);
  const chooserHeadingRef = useRef<HTMLHeadingElement>(null);
  const confirmationHeadingRef = useRef<HTMLHeadingElement>(null);
  const outcomeHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (
      (flow.view === "chooser" || showChooser) &&
      flow.events.length > 1
    ) {
      chooserHeadingRef.current?.focus();
    } else if (checkinResult) {
      resultHeadingRef.current?.focus();
    } else if (flow.view === "outcome") {
      outcomeHeadingRef.current?.focus();
    } else if (flow.selected) {
      confirmationHeadingRef.current?.focus();
    } else if (manualOpen && !flow.busy) {
      inputRef.current?.focus();
    } else if (flow.view === "scan" && !flow.busy) {
      scanHeadingRef.current?.focus();
    }
  }, [
    checkinResult,
    flow.busy,
    flow.events.length,
    flow.outcome,
    flow.selected,
    flow.view,
    manualOpen,
    showChooser,
  ]);

  useEffect(() => {
    if (retryAvailable) {
      retryRef.current?.focus();
    }
  }, [retryAvailable]);

  const handleCameraClose = () => {
    flow.stopCamera();
  };

  const handleManualChange = (value: string) => {
    flow.setInput(value.replace(/\D/gu, "").slice(0, 6));
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
    flow.setSelected(event);
    setManualOpen(false);
    if (event) {
      const message = attendanceEventLabel(event);
      flow.showStatus(message);
      announce(message);
    }
  };

  async function submit() {
    const selected = flow.selected;
    if (!selected || submitting) {
      return;
    }
    setRetryAvailable(false);
    setConfirmationError("");
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const message = COPY.attendance.offlineSubmit;
      setConfirmationError(message);
      announce(message);
      return;
    }
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
      setRetryAvailable(!offline);
      setConfirmationError(message);
      announce(message);
    } finally {
      setSubmitting(false);
    }
  }

  const backToScan = () => {
    setManualOpen(false);
    setShowChooser(false);
    setCheckinResult(null);
    setConfirmationError("");
    setRetryAvailable(false);
    flow.resetToScan();
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

  if (
    (flow.view === "chooser" || showChooser) &&
    flow.events.length > 1
  ) {
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
          onRetry={() => void submit()}
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

  return (
    <div className={styles.page}>
      <section className={styles.card} aria-labelledby="attendance-title">
        <h1
          id="attendance-title"
          ref={scanHeadingRef}
          className={styles.title}
          tabIndex={-1}
        >
          {title}
        </h1>
        <p id="attendance-self-hint" className={styles.lead}>
          {COPY.attendance.scanLead}
        </p>
        <ScannerCamera
          cameraOpen={flow.cameraOpen}
          cameraAvailable={flow.cameraAvailable}
          videoRef={flow.videoRef}
          onStart={() => void flow.startCamera()}
          onClose={handleCameraClose}
        />
        {flow.cameraUnavailable && <ScannerUnavailableNotice />}
        <section
          className={styles.methodSection}
          aria-labelledby="attendance-method-title"
        >
          <h2 id="attendance-method-title" className={styles.sectionTitle}>
            {COPY.attendance.scanMethodTitle}
          </h2>
          <div className={styles.methodGrid}>
            <button
              className={styles.methodCard}
              type="button"
              onClick={() => setManualOpen(true)}
            >
              <strong>{COPY.attendance.manualEntryTitle}</strong>
              <span>{COPY.attendance.manualEntryHint}</span>
            </button>
            <div className={styles.methodCardNote}>
              <strong>{COPY.attendance.manualOnlyTitle}</strong>
              <span>{COPY.attendance.manualOnlyHint}</span>
            </div>
          </div>
        </section>
        {manualOpen && (
          <form
            noValidate
            className={styles.inputRow}
            onSubmit={(event) => {
              event.preventDefault();
              handleResolve();
            }}
          >
            <label className={styles.field} htmlFor="attendance-code">
              <span className={styles.fieldLabel}>
                {COPY.attendance.manualEntryTitle}
              </span>
              <input
                ref={inputRef}
                id="attendance-code"
                className={styles.input}
                value={flow.input}
                onChange={(event) => handleManualChange(event.target.value)}
                placeholder={COPY.attendance.inputPlaceholder}
                autoComplete="off"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                aria-describedby="manual-entry-hint"
              />
              <span id="manual-entry-hint" className={styles.fieldHint}>
                {COPY.attendance.manualEntryHint}
              </span>
            </label>
            <button
              className={styles.button}
              type="submit"
              disabled={flow.busy || submitting}
              aria-busy={flow.busy || submitting}
              onClick={(event) => {
                event.preventDefault();
                handleResolve();
              }}
            >
              {flow.busy ? COPY.attendance.resolving : COPY.attendance.resolve}
            </button>
          </form>
        )}
        <ScannerStatusOutput message={flow.status} tone={flow.tone} />
      </section>
    </div>
  );
};
