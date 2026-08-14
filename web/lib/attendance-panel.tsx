"use client";

import { useRef, useState } from "react";

import { RpcError } from "@/lib/api";
import { attendanceEventLabel } from "@/lib/attendance-display";
import { entryFromValue } from "@/lib/attendance-entry";
import {
  ScannerCamera,
  ScannerEventPicker,
  ScannerStatusOutput,
} from "@/lib/attendance-scanner-ui";
import { COPY, errorCopyFor } from "@/lib/copy";
import { writeGuestCredential } from "@/lib/guest-context";
import { announce } from "@/lib/live-region";
import { guestCheckIn } from "@/lib/programs/program-api";
import { useAttendanceFlow } from "@/lib/use-attendance-flow";

import styles from "./attendance-panel.module.css";

/** Public guest check-in surface. Authenticated Self uses SelfCheckInPanel. */
export const AttendancePanel = () => {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const flow = useAttendanceFlow(inputRef);
  const handleCameraClose = () => {
    flow.stopCamera();
  };

  async function submit() {
    if (!flow.selected) {
      const message = COPY.attendance.chooseEvent;
      flow.showStatus(message);
      announce(message);
      return;
    }
    setSubmitting(true);
    flow.stopCamera();
    try {
      const credential = flow.fromQr
        ? { program_token: flow.input }
        : { entry: flow.input };
      const result = await guestCheckIn({
        event_id: flow.selected.event_id,
        method: flow.fromQr ? "guest_qr_scan" : "guest_manual_code",
        name,
        phone,
        ...credential,
      });
      const message =
        result.outcome === "duplicate"
          ? COPY.attendance.guestDuplicate
          : COPY.attendance.success;
      flow.showStatus(
        message,
        result.outcome === "duplicate" ? "info" : "success"
      );
      announce(message);
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

  return (
    <div className={styles.page}>
      <section className={styles.card} aria-labelledby="attendance-title">
        <h1 id="attendance-title" className={styles.title}>
          {COPY.attendance.guestTitle}
        </h1>
        <p className={styles.lead}>{COPY.attendance.signedOutNote}</p>
        <ScannerCamera
          cameraOpen={flow.cameraOpen}
          videoRef={flow.videoRef}
          onStart={() => void flow.startCamera()}
          onClose={handleCameraClose}
        />
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
          />
        )}
        {flow.selected && (
          <form
            className={styles.group}
            aria-labelledby="guest-fields-title"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <h2 id="guest-fields-title" className={styles.sectionTitle}>
              {COPY.attendance.guestFields}
            </h2>
            <div className={styles.fields}>
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
              disabled={flow.busy || submitting}
              aria-busy={flow.busy || submitting}
            >
              {submitting
                ? COPY.attendance.guestSubmitting
                : COPY.attendance.guestSubmit}
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
        <ScannerStatusOutput message={flow.status} tone={flow.tone} />
        <div className={styles.group}>
          <a
            className={styles.back}
            href="/"
            onClick={() => {
              const entry = entryFromValue(flow.input);
              if (entry.value) {
                writeGuestCredential({
                  kind:
                    flow.fromQr || entry.fromQr
                      ? "program_token"
                      : "manual_code",
                  value: entry.value,
                });
              }
            }}
          >
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
