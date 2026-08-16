"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { RpcError } from "@/lib/api";
import { attendanceEventLabel } from "@/lib/attendance-display";
import {
  ScannerCamera,
  ScannerCameraUnavailable,
  ScannerEventPicker,
  ScannerResultCard,
  ScannerStatusOutput,
} from "@/lib/attendance-scanner-ui";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { selfCheckIn } from "@/lib/programs/program-api";
import { useAttendanceFlow } from "@/lib/use-attendance-flow";

import styles from "./attendance-panel.module.css";

type SelfResult = "success" | "duplicate";

export const SelfCheckInPanel = ({
  title = COPY.attendance.selfTitle,
  requestedEventId = null,
}: {
  title?: string;
  requestedEventId?: string | null;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SelfResult | null>(null);
  const flow = useAttendanceFlow(inputRef, requestedEventId);
  const [retryAvailable, setRetryAvailable] = useState(false);
  const pickerHeadingRef = useRef<HTMLHeadingElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const cameraUnavailable =
    flow.status === COPY.attendance.cameraUnavailable && flow.tone === "error";

  const handleCameraClose = () => {
    flow.stopCamera();
  };

  useEffect(() => {
    if (flow.selected) {
      submitRef.current?.focus();
    } else if (flow.events.length > 1) {
      pickerHeadingRef.current?.focus();
    }
  }, [flow.events, flow.selected]);

  useEffect(() => {
    if (retryAvailable) {
      retryRef.current?.focus();
    }
  }, [retryAvailable]);

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
      const response = await selfCheckIn({
        event_id: flow.selected.event_id,
        method: flow.fromQr ? "self_qr_scan" : "self_manual_code",
        ...credential,
      });
      const nextResult: SelfResult =
        response.outcome === "duplicate" ? "duplicate" : "success";
      const message =
        nextResult === "duplicate"
          ? COPY.attendance.duplicate
          : COPY.attendance.success;
      flow.showStatus(message, nextResult === "duplicate" ? "info" : "success");
      announce(message);
      setResult(nextResult);
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

  function scanAgain() {
    flow.stopCamera();
    flow.showStatus("");
    setResult(null);
    setRetryAvailable(false);
    inputRef.current?.focus();
  }

  if (result) {
    const duplicate = result === "duplicate";
    return (
      <div className={styles.page}>
        <section className={styles.resultPage}>
          <ScannerResultCard
            headingId="self-result-title"
            tone={duplicate ? "info" : "success"}
            heading={
              duplicate
                ? COPY.attendance.selfResultDuplicateTitle
                : COPY.attendance.selfResultSuccessTitle
            }
            message={
              duplicate
                ? COPY.attendance.selfResultDuplicateCopy
                : COPY.attendance.selfResultSuccessCopy
            }
          >
            <Link className={styles.button} href="/">
              {COPY.attendance.resultReturnHome}
            </Link>
            <button
              className={styles.buttonSecondary}
              type="button"
              onClick={scanAgain}
            >
              {COPY.attendance.resultScanAgain}
            </button>
          </ScannerResultCard>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.card} aria-labelledby="attendance-title">
        <h1 id="attendance-title" className={styles.title}>
          {title}
        </h1>
        <p id="attendance-self-hint" className={styles.lead}>
          {COPY.attendance.selfHint}
        </p>
        <ScannerCamera
          cameraOpen={flow.cameraOpen}
          videoRef={flow.videoRef}
          onStart={() => {
            flow.showStatus("");
            void flow.startCamera();
          }}
          onClose={handleCameraClose}
          startLabel={COPY.attendance.selfScanStart}
        />
        {cameraUnavailable && <ScannerCameraUnavailable />}
        <div
          className={styles.methodTiles}
          aria-label={COPY.attendance.modeLabel}
        >
          <button
            className={styles.methodTile}
            type="button"
            onClick={() => inputRef.current?.focus()}
          >
            <strong>{COPY.attendance.manualFallbackTitle}</strong>
            <span>{COPY.attendance.manualFallbackDescription}</span>
          </button>
          <div className={styles.methodNote} role="note">
            <strong>{COPY.attendance.cameraPermissionTitle}</strong>
            <span>{COPY.attendance.cameraPermissionNote}</span>
          </div>
        </div>
        <form
          className={styles.inputRow}
          onSubmit={(event) => {
            event.preventDefault();
            void flow.resolve(flow.input);
          }}
        >
          <label className={styles.field} htmlFor="attendance-code">
            <span className={styles.fieldLabel}>
              {COPY.attendance.inputLabel}
            </span>
            <input
              ref={inputRef}
              id="attendance-code"
              className={styles.input}
              value={flow.input}
              onChange={(event) => flow.setInput(event.target.value)}
              placeholder={COPY.attendance.inputPlaceholder}
              autoComplete="off"
              aria-describedby="attendance-self-hint"
            />
          </label>
          <button
            className={styles.button}
            type="submit"
            disabled={flow.busy || submitting}
            aria-busy={flow.busy || submitting}
          >
            {flow.busy ? COPY.attendance.resolving : COPY.attendance.resolve}
          </button>
        </form>
        {flow.events.length > 1 && (
          <ScannerEventPicker
            events={flow.events}
            selectedId={flow.selected?.event_id ?? null}
            onSelect={(event) => flow.setSelected(event)}
            headingRef={pickerHeadingRef}
          />
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
        <ScannerStatusOutput
          message={cameraUnavailable ? "" : flow.status}
          tone={flow.tone}
        />
      </section>
    </div>
  );
};
