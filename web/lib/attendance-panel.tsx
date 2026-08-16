"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { RpcError } from "@/lib/api";
import { attendanceEventLabel } from "@/lib/attendance-display";
import { entryFromValue } from "@/lib/attendance-entry";
import {
  ScannerCamera,
  ScannerCameraUnavailable,
  ScannerEventPicker,
  ScannerResultCard,
  ScannerStatusOutput,
} from "@/lib/attendance-scanner-ui";
import { COPY, errorCopyFor } from "@/lib/copy";
import { writeGuestCredential } from "@/lib/guest-context";
import { announce } from "@/lib/live-region";
import { guestCheckIn } from "@/lib/programs/program-api";
import { useAttendanceFlow } from "@/lib/use-attendance-flow";

import styles from "./attendance-panel.module.css";

type GuestResult = "success" | "duplicate";

/** Public guest check-in surface. Authenticated Self uses SelfCheckInPanel. */
export const AttendancePanel = () => {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<GuestResult | null>(null);
  const [submitAfterResolve, setSubmitAfterResolve] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerHeadingRef = useRef<HTMLHeadingElement>(null);
  const flow = useAttendanceFlow(inputRef);
  const cameraUnavailable =
    flow.status === COPY.attendance.cameraUnavailable && flow.tone === "error";

  const handleCameraClose = () => {
    flow.stopCamera();
  };

  async function submit() {
    if (!flow.selected) {
      const message = COPY.attendance.chooseEvent;
      setSubmitAfterResolve(false);
      flow.showStatus(message);
      announce(message);
      return;
    }
    setSubmitting(true);
    flow.stopCamera();
    flow.showStatus(COPY.attendance.guestSubmitting);
    announce(COPY.attendance.guestSubmitting);
    try {
      const credential = flow.fromQr
        ? { program_token: flow.input }
        : { entry: flow.input };
      const response = await guestCheckIn({
        event_id: flow.selected.event_id,
        method: flow.fromQr ? "guest_qr_scan" : "guest_manual_code",
        name,
        phone,
        ...credential,
      });
      const nextResult: GuestResult =
        response.outcome === "duplicate" ? "duplicate" : "success";
      const message =
        nextResult === "duplicate"
          ? COPY.attendance.guestDuplicate
          : COPY.attendance.success;
      flow.showStatus(message, nextResult === "duplicate" ? "info" : "success");
      announce(message);
      setResult(nextResult);
    } catch (error) {
      const message =
        error instanceof RpcError
          ? errorCopyFor(error.problem.code, error.problem.detail)
          : COPY.error.networkError;
      flow.showStatus(message, "error");
      announce(message);
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!submitAfterResolve || flow.busy) {
      return;
    }
    if (flow.selected) {
      setSubmitAfterResolve(false);
      void submit();
      return;
    }
    if (flow.events.length === 0 && flow.status !== COPY.attendance.resolving) {
      setSubmitAfterResolve(false);
    }
  }, [
    flow.busy,
    flow.events.length,
    flow.selected,
    flow.status,
    submitAfterResolve,
  ]);

  useEffect(() => {
    if (flow.events.length > 1 && !flow.selected && !flow.busy) {
      pickerHeadingRef.current?.focus();
    }
  }, [flow.busy, flow.events.length, flow.selected]);

  async function handleGuestSubmit() {
    if (!flow.selected) {
      setSubmitAfterResolve(true);
      await flow.resolve(flow.input);
      return;
    }
    await submit();
  }

  function preserveGuestCredential() {
    const entry = entryFromValue(flow.input);
    if (!entry.value) {
      return;
    }
    writeGuestCredential({
      kind: flow.fromQr || entry.fromQr ? "program_token" : "manual_code",
      value: entry.value,
    });
  }

  if (result) {
    const duplicate = result === "duplicate";
    return (
      <div className={styles.page}>
        <section className={styles.resultPage}>
          <ScannerResultCard
            headingId="guest-result-title"
            tone={duplicate ? "info" : "success"}
            heading={
              duplicate
                ? COPY.attendance.guestResultDuplicateTitle
                : COPY.attendance.guestResultTitle
            }
            message={
              duplicate
                ? COPY.attendance.guestDuplicate
                : COPY.attendance.guestResultCopy
            }
          >
            <Link className={styles.button} href="/">
              {COPY.attendance.guestResultComplete}
            </Link>
          </ScannerResultCard>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.card} aria-labelledby="attendance-title">
        <h1 id="attendance-title" className={styles.title}>
          {COPY.attendance.guestTitle}
        </h1>
        <p className={styles.lead}>{COPY.attendance.guestHint}</p>
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void handleGuestSubmit();
          }}
        >
          <div className={styles.fields}>
            <label className={styles.field} htmlFor="guest-code">
              <span className={styles.fieldLabel}>
                {COPY.attendance.guestCodeLabel}
              </span>
              <input
                ref={inputRef}
                id="guest-code"
                className={styles.input}
                value={flow.input}
                onChange={(event) => {
                  flow.setInput(event.target.value);
                  flow.setSelected(null);
                }}
                placeholder={COPY.attendance.guestCodePlaceholder}
                autoComplete="off"
                inputMode="numeric"
              />
            </label>
            <label className={styles.field} htmlFor="guest-name">
              <span className={styles.fieldLabel}>
                {COPY.attendance.guestName}
              </span>
              <input
                id="guest-name"
                className={styles.input}
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                maxLength={80}
                required
              />
            </label>
            <label className={styles.field} htmlFor="guest-phone">
              <span className={styles.fieldLabel}>
                {COPY.attendance.guestPhone}
              </span>
              <input
                id="guest-phone"
                className={styles.input}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="tel"
                inputMode="tel"
                required
                aria-describedby="guest-phone-hint"
              />
              <span id="guest-phone-hint" className={styles.fieldHint}>
                {COPY.attendance.guestPhoneHint}
              </span>
            </label>
          </div>
          <button
            className={styles.button}
            type="submit"
            disabled={flow.busy || submitting || submitAfterResolve}
            aria-busy={flow.busy || submitting}
          >
            {flow.busy
              ? COPY.attendance.resolving
              : submitting
                ? COPY.attendance.guestSubmitting
                : COPY.attendance.guestSubmit}
          </button>
        </form>
        <details className={styles.cameraFallback}>
          <summary>{COPY.attendance.camera}</summary>
          <div className={styles.cameraFallbackContent}>
            <ScannerCamera
              cameraOpen={flow.cameraOpen}
              videoRef={flow.videoRef}
              onStart={() => {
                flow.showStatus("");
                void flow.startCamera();
              }}
              startLabel={COPY.attendance.selfScanStart}
              onClose={handleCameraClose}
            />
            {cameraUnavailable && <ScannerCameraUnavailable />}
          </div>
        </details>
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
        <ScannerStatusOutput
          message={cameraUnavailable ? "" : flow.status}
          tone={flow.tone}
        />
        <div className={styles.group}>
          <a className={styles.back} href="/" onClick={preserveGuestCredential}>
            {COPY.attendance.loginForMember}
          </a>
          <a className={styles.back} href="/">
            {COPY.nav.backToHome}
          </a>
        </div>
      </section>
    </div>
  );
};
