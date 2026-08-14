"use client";

import { useEffect, useRef, useState } from "react";

import { RpcError } from "@/lib/api";
import {
  attendanceEventLabel,
  attendanceEventMeta,
  attendanceEventName,
} from "@/lib/attendance-display";
import { COPY, errorCopyFor } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { selfCheckIn } from "@/lib/programs/program-api";
import { useAttendanceFlow } from "@/lib/use-attendance-flow";

import styles from "./attendance-panel.module.css";

export const SelfCheckInPanel = ({
  title = COPY.sections.scanner,
}: {
  title?: string;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const flow = useAttendanceFlow(inputRef);
  const [retryAvailable, setRetryAvailable] = useState(false);
  const pickerHeadingRef = useRef<HTMLHeadingElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
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

  return (
    <div className={styles.page}>
      <section className={styles.card} aria-labelledby="attendance-title">
        <h1 id="attendance-title" className={styles.title}>
          {title}
        </h1>
        <p id="attendance-self-hint" className={styles.lead}>
          {COPY.attendance.selfHint}
        </p>
        <button
          className={styles.button}
          type="button"
          onClick={() => void flow.startCamera()}
        >
          {flow.cameraOpen
            ? COPY.attendance.cameraRetry
            : COPY.attendance.camera}
        </button>
        {flow.cameraOpen && (
          <div className={styles.group}>
            <video
              ref={flow.videoRef}
              className={styles.video}
              muted
              playsInline
              aria-label={COPY.attendance.camera}
            />
            <button
              className={styles.buttonSecondary}
              type="button"
              onClick={handleCameraClose}
            >
              {COPY.attendance.cameraClose}
            </button>
          </div>
        )}
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
          <div className={styles.group} aria-labelledby="choose-event-title">
            <h2
              id="choose-event-title"
              ref={pickerHeadingRef}
              className={styles.sectionTitle}
              tabIndex={-1}
            >
              {COPY.attendance.chooseEvent}
            </h2>
            <ul className={styles.events}>
              {flow.events.map((event) => (
                <li key={event.event_id}>
                  <button
                    className={styles.eventButton}
                    type="button"
                    aria-pressed={flow.selected?.event_id === event.event_id}
                    onClick={() => flow.setSelected(event)}
                  >
                    <strong>{attendanceEventName(event)}</strong>
                    <span className={styles.eventMeta}>
                      {attendanceEventMeta(event)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
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
        <output
          className={styles.status}
          data-tone={flow.status ? flow.tone : undefined}
          aria-live="polite"
          aria-atomic="true"
        >
          {flow.status}
        </output>
      </section>
    </div>
  );
};
