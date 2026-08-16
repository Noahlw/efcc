"use client";

import { useEffect, useRef, useState } from "react";

import { RpcError } from "@/lib/api";
import { attendanceEventLabel } from "@/lib/attendance-display";
import {
  ScannerCamera,
  ScannerChooser,
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

export const SelfCheckInPanel = ({
  title = COPY.attendance.scanTitle,
}: {
  title?: string;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const flow = useAttendanceFlow(inputRef, {
    reportCameraUnavailable: true,
  });
  const [retryAvailable, setRetryAvailable] = useState(false);
  const scanHeadingRef = useRef<HTMLHeadingElement>(null);
  const chooserHeadingRef = useRef<HTMLHeadingElement>(null);
  const outcomeHeadingRef = useRef<HTMLHeadingElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (flow.view === "chooser") {
      chooserHeadingRef.current?.focus();
    } else if (flow.view === "outcome") {
      outcomeHeadingRef.current?.focus();
    } else if (flow.selected) {
      submitRef.current?.focus();
    } else if (manualOpen && !flow.busy) {
      inputRef.current?.focus();
    } else if (flow.view === "scan" && !flow.busy) {
      scanHeadingRef.current?.focus();
    }
  }, [flow.busy, flow.outcome, flow.selected, flow.view, manualOpen]);

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
    flow.setSelected(event);
    setManualOpen(false);
    if (event) {
      const message = attendanceEventLabel(event);
      flow.showStatus(message);
      announce(message);
    }
  };

  async function submit() {
    if (!flow.selected) {
      const message = COPY.attendance.chooseEvent;
      flow.showStatus(message);
      announce(message);
      return;
    }
    setRetryAvailable(false);
    setSubmitting(true);
    flow.stopCamera();
    flow.showStatus(COPY.attendance.resolving);
    try {
      const credential = flow.fromQr
        ? { program_token: flow.input }
        : { entry: flow.input };
      const result = await selfCheckIn({
        event_id: flow.selected.event_id,
        method: flow.fromQr ? "self_qr_scan" : "self_manual_code",
        ...credential,
      });
      const message =
        result.outcome === "duplicate"
          ? COPY.attendance.duplicate
          : COPY.attendance.success;
      flow.showStatus(
        message,
        result.outcome === "duplicate" ? "info" : "success"
      );
      announce(message);
      setRetryAvailable(false);
    } catch (error) {
      const ambiguousTransport =
        !(error instanceof RpcError) ||
        error.problem.code === "NETWORK_ERROR" ||
        error.problem.code === "UNAVAILABLE";
      const message = ambiguousTransport
        ? COPY.attendance.transportAmbiguous
        : errorCopyFor(error.problem.code, error.problem.detail);
      setRetryAvailable(ambiguousTransport);
      flow.showStatus(message, "error");
      announce(message);
    } finally {
      setSubmitting(false);
    }
  }

  const backToScan = () => {
    setManualOpen(false);
    flow.resetToScan();
  };

  if (flow.view === "chooser") {
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
        {flow.selected && (
          <p className={styles.hint}>
            {COPY.attendance.eventTime}: {attendanceEventLabel(flow.selected)}
            {flow.selected.location?.trim()
              ? ` · ${COPY.attendance.eventLocation}: ${flow.selected.location.trim()}`
              : ""}
          </p>
        )}
        {flow.selected && (
          <button
            ref={submitRef}
            className={styles.button}
            type="button"
            disabled={flow.busy || submitting}
            aria-busy={flow.busy || submitting}
            onClick={() => void submit()}
          >
            {COPY.attendance.memberSubmit}
          </button>
        )}
        {retryAvailable && (
          <button
            ref={retryRef}
            className={styles.buttonSecondary}
            type="button"
            disabled={submitting}
            aria-busy={submitting}
            onClick={() => void submit()}
          >
            {COPY.attendance.retry}
          </button>
        )}
        <ScannerStatusOutput message={flow.status} tone={flow.tone} />
      </section>
    </div>
  );
};
